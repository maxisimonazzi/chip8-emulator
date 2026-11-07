'use strict';
// El depurador del núcleo: la traza, el mapa de accesos, el registro de dibujos, los puntos
// de corte y runTo (paso por encima, salir de la subrutina y «hasta acá"), con el frame que
// queda abierto cuando runFrame se detiene. Nada de esto cambia lo que hace la máquina.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, wordsToBytes } = require('./harness');

const { Chip8, ACCESS, TRACE_SIZE, SPRITE_LOG_SIZE, QUIRK_PRESETS, STACK_SIZE, encodeState } = loadCore();

const XO = { platform: 'xochip', quirks: QUIRK_PRESETS.xochip.quirks };
const SCHIP = { platform: 'schip', quirks: QUIRK_PRESETS.schip.quirks };

// Las direcciones de la memoria que tienen todos los bits de `bits`.
function marked(cpu, bits) {
  const out = [];
  for (let a = 0; a < cpu.memory.length; a++) if ((cpu.access[a] & bits) === bits) out.push(a);
  return out;
}
const range = (from, count) => Array.from({ length: count }, (_, i) => from + i);
const traceOf = (cpu) => cpu.trace().map((e) => [e.addr, e.opcode]);

describe('constantes del depurador', () => {
  it('ACCESS tiene los cuatro bits y está congelado; TRACE_SIZE y SPRITE_LOG_SIZE son potencias de 2', () => {
    assert.deepEqual({ ...ACCESS }, { EXEC: 1, READ: 2, WRITE: 4, OPERAND: 8 });
    assert.ok(Object.isFrozen(ACCESS));
    assert.equal(TRACE_SIZE, 1024);
    assert.equal(SPRITE_LOG_SIZE, 16);
  });

  it('cpu.access cubre 64 KB en todas las plataformas y empieza vacío', () => {
    for (const platform of ['chip8', 'schip', 'xochip']) {
      const cpu = new Chip8({ platform });
      assert.ok(cpu.access instanceof Uint8Array);
      assert.equal(cpu.access.length, 65536);
      assert.ok(cpu.access.every((v) => v === 0), platform);
      assert.equal(cpu.debugStop, null);
      assert.deepEqual(cpu.trace(), []);
      assert.deepEqual(cpu.spriteLog(), []);
      assert.deepEqual(cpu.breakpoints(), []);
      assert.equal(cpu.runTarget(), null);
    }
  });
});

describe('traza', () => {
  it('anota la dirección y el opcode de cada instrucción, de la más vieja a la más nueva', () => {
    const cpu = makeCpu([0x6005, 0x7103, 0x1200]);
    runSteps(cpu, 5);
    assert.deepEqual(traceOf(cpu), [[0x200, 0x6005], [0x202, 0x7103], [0x204, 0x1200], [0x200, 0x6005], [0x202, 0x7103]]);
  });

  it('se queda con las últimas TRACE_SIZE', () => {
    const cpu = makeCpu([0x7001, 0x7101, 0x1200]);
    runSteps(cpu, TRACE_SIZE * 3 + 2);
    const t = cpu.trace();
    assert.equal(t.length, TRACE_SIZE);
    // 3074 pasos: el último es el 3074.º (índice 3073), en la dirección 0x200 + 2 * (3073 % 3).
    assert.deepEqual(t[t.length - 1], { addr: 0x200 + 2 * ((TRACE_SIZE * 3 + 1) % 3), opcode: [0x7001, 0x7101, 0x1200][(TRACE_SIZE * 3 + 1) % 3] });
    for (let i = 1; i < t.length; i++) {
      const prev = t[i - 1].addr;
      assert.equal(t[i].addr, prev === 0x204 ? 0x200 : prev + 2, 'consecutivas en ' + i);
    }
  });

  it('incluye la instrucción que detuvo la máquina, y una máquina detenida o esperando una tecla no anota nada', () => {
    const cpu = makeCpu([0x6001, 0x5121]);
    runSteps(cpu, 4);
    assert.equal(cpu.halted, true);
    assert.deepEqual(traceOf(cpu), [[0x200, 0x6001], [0x202, 0x5121]]);
    const wait = makeCpu([0xF30A, 0x6001]);
    runSteps(wait, 3);
    assert.deepEqual(traceOf(wait), [[0x200, 0xF30A]]);
  });

  it('F000 NNNN queda como F000 en su dirección; las direcciones de XO-CHIP pasan de 0xFFF', () => {
    const cpu = makeCpu([0xF000, 0x1234, 0x1200], XO);
    runSteps(cpu, 2);
    assert.deepEqual(traceOf(cpu), [[0x200, 0xF000], [0x204, 0x1200]]);
    const far = makeCpu([0x1F00], XO);
    far.memory.set(wordsToBytes([0x6007, 0x1F00]), 0xF00);
    far.pc = 0xFF00;
    far.memory.set(wordsToBytes([0x60AB]), 0xFF00);
    far.step();
    assert.deepEqual(traceOf(far), [[0xFF00, 0x60AB]]);
  });

  it('reset, loadRom y setPlatform la vacían; loadState también (era de otro momento)', () => {
    const cpu = makeCpu([0x7001, 0x1200]);
    runSteps(cpu, 3);
    const saved = cpu.saveState();
    runSteps(cpu, 2);
    cpu.loadState(saved);
    assert.deepEqual(cpu.trace(), []);
    runSteps(cpu, 1);
    assert.equal(cpu.trace().length, 1);
    cpu.reset();
    assert.deepEqual(cpu.trace(), []);
    runSteps(cpu, 1);
    cpu.loadRom([0x12, 0x00]);
    assert.deepEqual(cpu.trace(), []);
    runSteps(cpu, 1);
    cpu.setPlatform('schip');
    assert.deepEqual(cpu.trace(), []);
  });
});

describe('mapa de accesos', () => {
  it('EXEC marca dónde empieza cada instrucción ejecutada, y nada más', () => {
    const cpu = makeCpu([0x6001, 0x3001, 0x6002, 0x1206]);
    runSteps(cpu, 4);   // 200, 202 (saltea 204), 206, 206
    assert.deepEqual(marked(cpu, ACCESS.EXEC), [0x200, 0x202, 0x206]);
    assert.deepEqual(marked(cpu, ACCESS.READ | ACCESS.WRITE), []);
  });

  it('DXYN lee las filas del sprite (las que se recortan abajo no se leen)', () => {
    const cpu = makeCpu([0xA300, 0x6000, 0x611E, 0xD015]);   // y = 30: con el recorte del VIP, solo 2 filas
    runSteps(cpu, 4);
    assert.deepEqual(marked(cpu, ACCESS.READ), [0x300, 0x301]);
    const wrap = makeCpu([0xA300, 0x611E, 0xD015], { quirks: { clipping: false } });
    runSteps(wrap, 3);
    assert.deepEqual(marked(wrap, ACCESS.READ), range(0x300, 5));
  });

  it('el sprite de 16×16 lee 32 bytes y, en XO-CHIP con los dos planos, lee el bloque de cada plano', () => {
    const cpu = makeCpu([0xA300, 0xD010], SCHIP);
    runSteps(cpu, 2);
    assert.deepEqual(marked(cpu, ACCESS.READ), range(0x300, 32));
    const xo = makeCpu([0xF301, 0xA300, 0xD013], XO);   // PLANE 3, sprite de 3 filas: 3 bytes por plano
    runSteps(xo, 3);
    assert.deepEqual(marked(xo, ACCESS.READ), range(0x300, 6));
  });

  it('FX55 y FX33 escriben, FX65 lee; las direcciones dan la vuelta en 0xFFF', () => {
    const cpu = makeCpu([0xAFFF, 0xF255, 0xA400, 0xF133, 0xA500, 0xF365], SCHIP);   // sin el quirk de memoria
    runSteps(cpu, 6);
    assert.deepEqual(marked(cpu, ACCESS.WRITE), [0x000, 0x001, 0x400, 0x401, 0x402, 0xFFF]);
    assert.deepEqual(marked(cpu, ACCESS.READ), range(0x500, 4));
  });

  it('5XY2 escribe y 5XY3 lee un rango; F002 lee el patrón de audio; F000 NNNN marca su operando', () => {
    const cpu = makeCpu([0xA300, 0x5132, 0xA400, 0x5023, 0xA500, 0xF002, 0xF000, 0x0600], XO);
    runSteps(cpu, 7);
    assert.deepEqual(marked(cpu, ACCESS.WRITE), range(0x300, 3));   // V1..V3
    assert.deepEqual(marked(cpu, ACCESS.READ), [...range(0x400, 3), ...range(0x500, 16)]);   // V0..V2 y el patrón
    assert.deepEqual(marked(cpu, ACCESS.OPERAND), [0x20E, 0x20F]);
    assert.equal(cpu.I, 0x0600);
    assert.ok(cpu.access[0x20C] & ACCESS.EXEC);
  });

  it('una dirección puede tener varias marcas (código que se reescribe a sí mismo)', () => {
    // 200: LD V0, 0x12  202: LD V1, 0x00  204: LD I, 0x208  206: LD [I], V1  208: (pasa a ser 1200: JP 200)
    const cpu = makeCpu([0x6012, 0x6100, 0xA208, 0xF155, 0x0000], SCHIP);
    runSteps(cpu, 5);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.access[0x208], ACCESS.EXEC | ACCESS.WRITE);
    assert.equal(cpu.access[0x209], ACCESS.WRITE);
  });

  it('reset lo borra; loadState lo conserva, salvo que cambie el tamaño de la memoria', () => {
    const cpu = makeCpu([0x7001, 0x1200]);
    runSteps(cpu, 2);
    const chip8State = cpu.saveState();
    runSteps(cpu, 1);
    cpu.loadState(chip8State);
    assert.deepEqual(marked(cpu, ACCESS.EXEC), [0x200, 0x202]);
    const xo = new Chip8({ platform: 'xochip' }).saveState();
    cpu.loadState(xo);
    assert.deepEqual(marked(cpu, ACCESS.EXEC), [], 'otra memoria: el mapa vuelve a empezar');
    runSteps(cpu, 1);
    cpu.reset();
    assert.ok(cpu.access.every((v) => v === 0));
  });
});

describe('registro de dibujos', () => {
  it('anota cada DXYN: dirección, posición (con el módulo), tamaño, planos y choque, del más nuevo al más viejo', () => {
    const cpu = makeCpu([0xA050, 0x6046, 0x6123, 0xD015, 0xD015]);   // x = 70 -> 6, y = 35 -> 3
    runSteps(cpu, 5);
    const log = cpu.spriteLog();
    assert.equal(log.length, 2);
    assert.deepEqual(log[1], { addr: 0x050, x: 6, y: 3, n: 5, width: 8, height: 5, planes: 1, collision: false, hires: false });
    assert.deepEqual(log[0], { addr: 0x050, x: 6, y: 3, n: 5, width: 8, height: 5, planes: 1, collision: true, hires: false });
  });

  it('16×16 en alta resolución y los planos de XO-CHIP', () => {
    const cpu = makeCpu([0x00FF, 0xA300, 0x6178, 0xD110], SCHIP);   // HIGH, x = y = 120 -> (120, 56)
    runSteps(cpu, 4);
    assert.deepEqual(cpu.spriteLog()[0], { addr: 0x300, x: 120, y: 56, n: 0, width: 16, height: 16, planes: 1, collision: false, hires: true });
    const xo = makeCpu([0xF201, 0xA300, 0xD003], XO);
    runSteps(xo, 3);
    assert.deepEqual(xo.spriteLog()[0], { addr: 0x300, x: 0, y: 0, n: 3, width: 8, height: 3, planes: 2, collision: false, hires: false });
  });

  it('recuerda los últimos SPRITE_LOG_SIZE y reset y loadState lo vacían', () => {
    const cpu = makeCpu([0x7001, 0xD015, 0x1200]);
    for (let i = 0; i < SPRITE_LOG_SIZE + 5; i++) runSteps(cpu, 3);
    const log = cpu.spriteLog();
    assert.equal(log.length, SPRITE_LOG_SIZE);
    assert.deepEqual(log.map((d) => d.x), range(0, SPRITE_LOG_SIZE).map((i) => SPRITE_LOG_SIZE + 5 - i));
    cpu.loadState(cpu.saveState());
    assert.deepEqual(cpu.spriteLog(), []);
    runSteps(cpu, 3);
    cpu.reset();
    assert.deepEqual(cpu.spriteLog(), []);
  });
});

describe('puntos de corte', () => {
  it('se ponen, se sacan y se listan; una dirección fuera de la memoria es un RangeError', () => {
    const cpu = new Chip8();
    assert.equal(cpu.setBreakpoint(0x204), true);
    assert.equal(cpu.setBreakpoint(0x200, true), true);
    assert.equal(cpu.setBreakpoint(0x204, true), true);   // ya estaba: no se duplica
    assert.deepEqual(cpu.breakpoints(), [0x200, 0x204]);
    assert.equal(cpu.hasBreakpoint(0x204), true);
    assert.equal(cpu.hasBreakpoint(0x206), false);
    assert.equal(cpu.setBreakpoint(0x204, false), false);
    assert.deepEqual(cpu.breakpoints(), [0x200]);
    for (const bad of [-1, 0x1000, 512.5, '0x200', null, undefined, NaN]) {
      assert.throws(() => cpu.setBreakpoint(bad), (e) => e instanceof RangeError && /Dirección inválida/.test(e.message), String(bad));
      assert.equal(cpu.hasBreakpoint(bad), false);
    }
    assert.throws(() => cpu.setBreakpoint(0x1000), /de 0x000 a 0xFFF/);
    const xo = new Chip8({ platform: 'xochip' });
    xo.setBreakpoint(0xFFFF);
    assert.deepEqual(xo.breakpoints(), [0xFFFF]);
    assert.throws(() => xo.setBreakpoint(0x10000), /de 0x0000 a 0xFFFF/);
    cpu.clearBreakpoints();
    assert.deepEqual(cpu.breakpoints(), []);
  });

  it('runFrame se detiene antes de ejecutar la instrucción, sin bajar los timers', () => {
    // 200: LD V0, 1   202: LD V1, 2   204: LD V2, 3   206: JP 206
    const cpu = makeCpu([0x6001, 0x6102, 0x6203, 0x1206]);
    cpu.delayTimer = 10;
    cpu.setBreakpoint(0x204);
    assert.equal(cpu.runFrame(15), 2);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x204 });
    assert.equal(cpu.pc, 0x204);
    assert.equal(cpu.V[2], 0, 'la instrucción del punto de corte no se ejecutó');
    assert.equal(cpu.delayTimer, 10, 'el frame quedó abierto: los timers no bajaron');
  });

  it('al seguir, la instrucción del punto de corte se ejecuta y el frame se completa con sus IPF', () => {
    const cpu = makeCpu([0x6001, 0x6102, 0x6203, 0x1206]);
    cpu.delayTimer = 10;
    cpu.setBreakpoint(0x204);
    cpu.runFrame(15);
    assert.equal(cpu.runFrame(15), 13, 'lo que le faltaba al frame: 15 - 2');
    assert.equal(cpu.debugStop, null);
    assert.equal(cpu.V[2], 3);
    assert.equal(cpu.delayTimer, 9, 'un solo tic, al completar el frame');
    assert.equal(cpu.runFrame(15), 15, 'el frame siguiente es entero');
    assert.equal(cpu.delayTimer, 8);
  });

  it('un punto de corte en un bucle detiene la máquina en cada vuelta', () => {
    // 200: ADD V0, 1   202: JP 200
    const cpu = makeCpu([0x7001, 0x1200]);
    cpu.setBreakpoint(0x200);
    assert.equal(cpu.runFrame(100), 0, 'detenida en la primera instrucción, sin ejecutar nada');
    for (let lap = 1; lap <= 5; lap++) {
      assert.equal(cpu.runFrame(100), 2);
      assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x200 });
      assert.equal(cpu.V[0], lap);
    }
  });

  it('JP a sí mismo con un punto de corte avanza de a una instrucción por llamada', () => {
    const cpu = makeCpu([0x1200]);
    cpu.setBreakpoint(0x200);
    assert.equal(cpu.runFrame(50), 0);
    assert.equal(cpu.runFrame(50), 1);
    assert.equal(cpu.runFrame(50), 1);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x200 });
  });

  it('step no mira los puntos de corte; después de un paso a la dirección de uno, skipBreakpointOnce deja seguir', () => {
    const cpu = makeCpu([0x6001, 0x6102, 0x6203, 0x1206]);
    cpu.setBreakpoint(0x202);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.runFrame(10), 0, 'sin skipBreakpointOnce, se detiene ahí mismo');
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x202 });
    cpu.step();   // step ejecuta igual la instrucción del punto de corte
    assert.equal(cpu.V[1], 2);
    cpu.reset();
    cpu.step();
    cpu.skipBreakpointOnce();
    assert.equal(cpu.runFrame(10), 10);
    assert.equal(cpu.debugStop, null);
    assert.equal(cpu.V[1], 2);
  });

  it('skipBreakpointOnce vale para la instrucción del PC de ese momento, aunque la primera llamada no ejecute nada', () => {
    const cpu = makeCpu([0x6001, 0x6102, 0x1204]);
    cpu.setBreakpoint(0x200);
    cpu.skipBreakpointOnce();
    cpu.setKey(0, false);
    assert.equal(cpu.runFrame(0), 0);   // un frame de 0 instrucciones: el paso sigue pendiente
    assert.equal(cpu.runFrame(5), 5);
    assert.equal(cpu.debugStop, null);
    assert.equal(cpu.V[0], 1);
  });

  it('frenar y seguir no cambia nada: con puntos de corte, la máquina hace exactamente lo mismo, frame por frame', () => {
    // Un programa que depende de los timers: cuenta en V1 las vueltas hasta que DT llega a 0.
    // 200: LD V0, 20  202: LD DT, V0  204: LD V2, DT  206: ADD V1, 1  208: SE V2, 0  20A: JP 204
    // 20C: CALL 212   20E: ADD V3, 1  210: JP 200     212: LD I, 0x300  214: LD [I], V3  216: RET
    const program = [0x6014, 0xF015, 0xF207, 0x7101, 0x3200, 0x1204, 0x2212, 0x7301, 0x1200, 0xA300, 0xF355, 0x00EE];
    const plain = makeCpu(program);
    const watched = makeCpu(program);
    watched.setBreakpoint(0x206);
    watched.setBreakpoint(0x214);
    let stops = 0;
    for (let frame = 0; frame < 200; frame++) {
      plain.runFrame(7);
      for (;;) {
        watched.runFrame(7);
        if (!watched.debugStop) break;
        stops++;
      }
      assert.equal(encodeState(watched.saveState()), encodeState(plain.saveState()), 'frame ' + frame);
    }
    assert.ok(stops > 300, 'se detuvo ' + stops + ' veces');
    assert.deepEqual(watched.trace(), plain.trace());
  });

  it('un frame abierto se completa aunque después se saquen los puntos de corte; con menos IPF, solo baja los timers', () => {
    const cpu = makeCpu([0x7001, 0x1200]);
    cpu.delayTimer = 5;
    cpu.setBreakpoint(0x200);
    cpu.runFrame(10);
    cpu.runFrame(10);   // 2 instrucciones y se detiene otra vez en 0x200
    cpu.clearBreakpoints();
    assert.equal(cpu.runFrame(10), 8);
    assert.equal(cpu.delayTimer, 4);
    cpu.setBreakpoint(0x202);
    assert.equal(cpu.runFrame(10), 1);   // 0x200 y se detiene en 0x202
    assert.equal(cpu.runFrame(1), 0, 'ya ejecutó 1 de este frame: con 1 IPF no queda nada');
    assert.equal(cpu.debugStop, null);
    assert.equal(cpu.delayTimer, 3);
  });

  it('esperando una tecla en un punto de corte, la espera sigue al soltarla', () => {
    // 200: LD V5, K   202: LD V6, 1   204: JP 204
    const cpu = makeCpu([0xF50A, 0x6601, 0x1204]);
    cpu.setBreakpoint(0x200);
    cpu.runFrame(10);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x200 });
    assert.equal(cpu.runFrame(10), 1);
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(7, true);
    cpu.setKey(7, false);
    cpu.runFrame(10);
    assert.equal(cpu.V[5], 7);
    assert.equal(cpu.V[6], 1);
  });

  it('un punto de corte después de FX0A se detiene recién cuando llega la tecla, antes de ejecutar la instrucción', () => {
    // 200: LD V5, K   202: LD V6, 1   204: JP 204
    const cpu = makeCpu([0xF50A, 0x6601, 0x1204]);
    cpu.setBreakpoint(0x202);
    for (let f = 0; f < 3; f++) {
      cpu.runFrame(10);
      assert.equal(cpu.debugStop, null, 'esperando la tecla no se detiene (frame ' + f + ')');
    }
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(4, true);
    cpu.setKey(4, false);
    assert.equal(cpu.runFrame(10), 0);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x202 });
    assert.deepEqual([cpu.V[5], cpu.V[6]], [4, 0]);
  });

  it('una máquina detenida por un error no ejecuta ni se detiene en nada', () => {
    const cpu = makeCpu([0x5121]);
    cpu.setBreakpoint(0x202);
    cpu.runFrame(10);
    assert.equal(cpu.halted, true);
    assert.equal(cpu.debugStop, null);
    assert.equal(cpu.runFrame(10), 0);
  });

  it('no son parte del estado: sobreviven a reset, loadRom, loadState y setPlatform, y saveState no los guarda', () => {
    const cpu = makeCpu([0x7001, 0x1200]);
    const text = encodeState(cpu.saveState());
    cpu.setBreakpoint(0x200);
    cpu.setBreakpoint(0x300);
    assert.equal(encodeState(cpu.saveState()), text);
    cpu.reset();
    cpu.loadRom([0x12, 0x00]);
    cpu.loadState(cpu.saveState());
    cpu.setPlatform('schip');
    assert.deepEqual(cpu.breakpoints(), [0x200, 0x300]);
  });

  it('los que quedan fuera de una memoria que se achica se pierden', () => {
    const cpu = new Chip8({ platform: 'xochip' });
    cpu.setBreakpoint(0x0FFE);
    cpu.setBreakpoint(0x1000);
    cpu.setBreakpoint(0xFFFF);
    const xoState = cpu.saveState();
    cpu.setPlatform('schip');
    assert.deepEqual(cpu.breakpoints(), [0x0FFE]);
    cpu.loadState(xoState);
    cpu.setBreakpoint(0x2000);
    cpu.loadState(new Chip8().saveState());
    assert.deepEqual(cpu.breakpoints(), [0x0FFE]);
    // Sin ningún punto de corte, runFrame vuelve al bucle de siempre (y no queda nada que mirar).
    cpu.clearBreakpoints();
    assert.equal(cpu._stopCount, 0);
  });
});

describe('runTo: paso por encima, salir de la subrutina y «hasta acá»', () => {
  // 200: LD V0, 2   202: CALL 20A   204: LD V5, 1   206: JP 206   208: (nada)
  // 20A: ADD V1, 1  20C: CALL 212   20E: ADD V2, 1  210: RET      212: ADD V3, 1   214: RET
  const NESTED = [0x6002, 0x220A, 0x6501, 0x1206, 0x0000, 0x7101, 0x2212, 0x7201, 0x00EE, 0x7301, 0x00EE];

  it('runTo(dirección) se detiene antes de esa instrucción, a cualquier nivel de la pila, y se borra', () => {
    const cpu = makeCpu(NESTED);
    cpu.runTo(0x212);
    assert.deepEqual(cpu.runTarget(), { addr: 0x212, maxSp: STACK_SIZE });
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'target', addr: 0x212 });
    assert.equal(cpu.pc, 0x212);
    assert.equal(cpu.sp, 2);
    assert.equal(cpu.V[3], 0);
    assert.equal(cpu.runTarget(), null);
    cpu.runFrame(100);
    assert.equal(cpu.debugStop, null, 'el objetivo ya no está');
    assert.equal(cpu.pc, 0x206);
  });

  it('paso por encima de un CALL: corre la subrutina entera y se detiene en la siguiente con la pila al mismo nivel', () => {
    const cpu = makeCpu(NESTED);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
    cpu.runTo(0x204, cpu.sp);
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'target', addr: 0x204 });
    assert.equal(cpu.sp, 0);
    assert.deepEqual([cpu.V[1], cpu.V[2], cpu.V[3], cpu.V[5]], [1, 1, 1, 0]);
  });

  it('con recursión, pasar por la dirección de vuelta más adentro de la pila no la detiene', () => {
    // 200: LD V0, 2   202: CALL 208   204: ADD V1, 1   206: RET
    // 208: SE V0, 0   20A: JP 20E     20C: RET         20E: ADD V0, -1   210: JP 202
    // Cada vuelta vuelve a llamar desde 0x202: las llamadas más adentro también vuelven a 0x204.
    const cpu = makeCpu([0x6002, 0x2208, 0x7101, 0x00EE, 0x3000, 0x120E, 0x00EE, 0x70FF, 0x1202]);
    cpu.step();
    cpu.runTo(0x204, cpu.sp);
    cpu.runFrame(1000);
    assert.deepEqual(cpu.debugStop, { kind: 'target', addr: 0x204 });
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.V[1], 2, 'las dos llamadas de adentro ya volvieron por 0x204');
    // Sin el nivel de pila, se detendría en la primera vuelta, tres llamadas adentro.
    cpu.reset();
    cpu.step();
    cpu.runTo(0x204);
    cpu.runFrame(1000);
    assert.equal(cpu.sp, 2);
    assert.equal(cpu.V[1], 0);
  });

  it('salir de la subrutina: runTo(la dirección de vuelta, sp - 1)', () => {
    const cpu = makeCpu(NESTED);
    runSteps(cpu, 4);   // dentro de la subrutina de 0x212 (sp = 2)
    assert.equal(cpu.pc, 0x212);
    cpu.runTo(cpu.stack[cpu.sp - 1], cpu.sp - 1);
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'target', addr: 0x20E });
    assert.equal(cpu.sp, 1);
    assert.equal(cpu.V[3], 1);
    assert.equal(cpu.V[2], 0);
  });

  it('un punto de corte adentro de la subrutina detiene antes y borra el objetivo', () => {
    const cpu = makeCpu(NESTED);
    cpu.setBreakpoint(0x212);
    cpu.step();
    cpu.runTo(0x204, 0);
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x212 });
    assert.equal(cpu.runTarget(), null);
  });

  it('una subrutina que no vuelve sigue corriendo frame tras frame; cancelRunTo lo termina', () => {
    // 200: CALL 204   202: JP 202   204: ADD V0, 1   206: JP 204
    const cpu = makeCpu([0x2204, 0x1202, 0x7001, 0x1204]);
    cpu.runTo(0x202, 0);
    cpu.delayTimer = 3;
    for (let f = 0; f < 3; f++) {
      assert.equal(cpu.runFrame(10), 10);
      assert.equal(cpu.debugStop, null);
    }
    assert.equal(cpu.delayTimer, 0, 'los frames enteros bajan los timers como siempre');
    cpu.cancelRunTo();
    assert.equal(cpu.runTarget(), null);
    assert.equal(cpu._stopCount, 0);
  });

  it('otro runTo reemplaza al anterior; reset, loadRom y loadState lo borran', () => {
    const cpu = makeCpu(NESTED);
    cpu.runTo(0x212);
    cpu.runTo(0x20E, 1);
    assert.deepEqual(cpu.runTarget(), { addr: 0x20E, maxSp: 1 });
    assert.equal(cpu._stopCount, 1);
    cpu.reset();
    assert.equal(cpu.runTarget(), null);
    cpu.runTo(0x212);
    cpu.loadState(cpu.saveState());
    assert.equal(cpu.runTarget(), null);
    cpu.runTo(0x212);
    cpu.loadRom(wordsToBytes(NESTED));
    assert.equal(cpu.runTarget(), null);
    assert.equal(cpu._stopCount, 0);
  });

  it('valida la dirección y el nivel de pila', () => {
    const cpu = new Chip8();
    assert.throws(() => cpu.runTo(0x1000), RangeError);
    assert.throws(() => cpu.runTo(0x200, 17), /Nivel de pila inválido/);
    assert.throws(() => cpu.runTo(0x200, -1), RangeError);
    assert.throws(() => cpu.runTo(0x200, 1.5), RangeError);
    assert.doesNotThrow(() => cpu.runTo(0x200, 0));
    assert.doesNotThrow(() => cpu.runTo(0x200, null));
    assert.deepEqual(cpu.runTarget(), { addr: 0x200, maxSp: STACK_SIZE });
  });

  it('un punto de corte y el objetivo en la misma dirección: llegar al objetivo gana; más adentro, el punto de corte', () => {
    const cpu = makeCpu(NESTED);
    cpu.setBreakpoint(0x204);
    cpu.step();
    cpu.runTo(0x204, 0);
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'target', addr: 0x204 });
    cpu.reset();
    cpu.setBreakpoint(0x212);
    cpu.runTo(0x212, 0);   // a 0x212 se llega con sp = 2: no es el objetivo, pero sí un punto de corte
    cpu.runFrame(100);
    assert.deepEqual(cpu.debugStop, { kind: 'breakpoint', addr: 0x212 });
    assert.equal(cpu.runTarget(), null);
  });
});

describe('sin puntos de corte ni objetivo, runFrame es el de siempre', () => {
  it('deja debugStop en null y da los mismos resultados con y sin un punto de corte que nunca se alcanza', () => {
    const program = [0xA050, 0x7001, 0xD015, 0x7101, 0x3140, 0x1202, 0x6100, 0x1202];
    for (const opts of [{}, SCHIP, XO]) {
      const a = makeCpu(program, { ...opts, random: () => 7 });
      const b = makeCpu(program, { ...opts, random: () => 7 });
      b.setBreakpoint(0xFF0);
      for (let f = 0; f < 120; f++) {
        assert.equal(a.runFrame(37), b.runFrame(37));
        assert.equal(a.debugStop, null);
      }
      assert.equal(encodeState(a.saveState()), encodeState(b.saveState()));
    }
  });
});
