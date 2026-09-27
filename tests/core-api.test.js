'use strict';
// API pública del núcleo: constantes, fuente, carga de ROMs, reset, step/runFrame y errores.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./harness');

// Se miran los globales ANTES de evaluar el núcleo por primera vez en este proceso.
const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis));
const core = harness.loadCore();
const globalsAdded = Object.getOwnPropertyNames(globalThis).filter((k) => !globalsBefore.has(k));

const { makeCpu, runSteps } = harness;
const { Chip8, FONT, FONT_ADDR, PROGRAM_START, MEMORY_SIZE, MAX_ROM_SIZE, DISPLAY_WIDTH, DISPLAY_HEIGHT, STACK_SIZE } = core;

const EXPECTED_FONT = [
  0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
  0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
  0x90, 0x90, 0xF0, 0x10, 0x10, // 4
  0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
  0xF0, 0x10, 0x20, 0x40, 0x40, // 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
  0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, // A
  0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
  0xF0, 0x80, 0x80, 0x80, 0xF0, // C
  0xE0, 0x90, 0x90, 0x90, 0xE0, // D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
  0xF0, 0x80, 0xF0, 0x80, 0x80, // F
];

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

function assertFontLoaded(cpu) {
  assert.deepEqual(Array.from(cpu.memory.slice(FONT_ADDR, FONT_ADDR + 80)), EXPECTED_FONT);
}

function assertHaltedWith(cpu, opcode, addr) {
  assert.equal(cpu.halted, true, 'debía detenerse');
  assert.equal(typeof cpu.error, 'string');
  assert.ok(cpu.error.length > 0, 'el error no puede estar vacío');
  const upper = cpu.error.toUpperCase();
  assert.ok(upper.includes(hex(opcode, 4)), `el error "${cpu.error}" debía incluir el opcode ${hex(opcode, 4)}`);
  assert.ok(upper.includes(hex(addr, 3)), `el error "${cpu.error}" debía incluir la dirección ${hex(addr, 3)}`);
  assert.equal(cpu.pc, addr, 'pc debe quedar en la instrucción que falló');
}

describe('módulo', () => {
  it('solo define el global Chip8Core', () => {
    assert.deepEqual(globalsAdded, ['Chip8Core']);
  });

  it('exporta todo lo del contrato', () => {
    for (const key of [
      'Chip8', 'QUIRK_PRESETS', 'DEFAULT_QUIRKS', 'FONT', 'FONT_ADDR', 'PROGRAM_START', 'MEMORY_SIZE',
      'MAX_ROM_SIZE', 'DISPLAY_WIDTH', 'DISPLAY_HEIGHT', 'STACK_SIZE', 'disassemble', 'disassembleRange',
    ]) {
      assert.ok(key in core, `falta ${key}`);
    }
    assert.equal(typeof core.Chip8, 'function');
    assert.equal(typeof core.disassemble, 'function');
    assert.equal(typeof core.disassembleRange, 'function');
  });

  it('constantes', () => {
    assert.equal(FONT_ADDR, 0x050);
    assert.equal(PROGRAM_START, 0x200);
    assert.equal(MEMORY_SIZE, 4096);
    assert.equal(MAX_ROM_SIZE, 3584);
    assert.equal(MAX_ROM_SIZE, MEMORY_SIZE - PROGRAM_START);
    assert.equal(DISPLAY_WIDTH, 64);
    assert.equal(DISPLAY_HEIGHT, 32);
    assert.equal(STACK_SIZE, 16);
  });

  it('FONT: Uint8Array de 80 bytes con los glifos estándar', () => {
    assert.ok(FONT instanceof Uint8Array);
    assert.equal(FONT.length, 80);
    assert.deepEqual(Array.from(FONT), EXPECTED_FONT);
  });
});

describe('estado inicial', () => {
  it('el constructor deja la máquina reseteada', () => {
    const cpu = new Chip8();
    assert.ok(cpu.memory instanceof Uint8Array);
    assert.equal(cpu.memory.length, 4096);
    assert.ok(cpu.V instanceof Uint8Array);
    assert.equal(cpu.V.length, 16);
    assert.ok(cpu.stack instanceof Uint16Array);
    assert.equal(cpu.stack.length, 16);
    assert.ok(cpu.display instanceof Uint8Array);
    assert.equal(cpu.display.length, 64 * 32);
    assert.ok(cpu.keys instanceof Uint8Array);
    assert.equal(cpu.keys.length, 16);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.I, 0);
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
    assert.equal(cpu.halted, false);
    assert.equal(cpu.error, null);
    assert.equal(cpu.waitingForKey, false);
    assert.ok(cpu.V.every((v) => v === 0));
    assert.ok(cpu.display.every((v) => v === 0));
    assert.ok(cpu.keys.every((v) => v === 0));
    assertFontLoaded(cpu);
  });

  it('memoria fuera de la fuente en cero (ROM vacía)', () => {
    const cpu = new Chip8();
    for (let a = 0; a < 4096; a++) {
      if (a >= FONT_ADDR && a < FONT_ADDR + 80) continue;
      if (cpu.memory[a] !== 0) assert.fail(`memory[0x${hex(a, 3)}] debía ser 0`);
    }
  });

  it('una cpu sin ROM ejecuta 0000 (SYS, no-op)', () => {
    const cpu = new Chip8();
    assert.equal(cpu.step(), true);
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.halted, false);
  });
});

describe('loadRom', () => {
  it('copia la ROM en 0x200', () => {
    const cpu = new Chip8();
    cpu.loadRom(new Uint8Array([0x12, 0x34, 0x56]));
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x204)), [0x12, 0x34, 0x56, 0x00]);
    assert.equal(cpu.memory[0x1FF], 0);
    assert.equal(cpu.pc, 0x200);
  });

  it('acepta arrays comunes de números', () => {
    const cpu = new Chip8();
    cpu.loadRom([0xA2, 0x2A, 0x60, 0x0C]);
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x204)), [0xA2, 0x2A, 0x60, 0x0C]);
    cpu.step();
    assert.equal(cpu.I, 0x22A);
  });

  it('acepta una ROM vacía', () => {
    const cpu = new Chip8();
    cpu.loadRom([]);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.memory[0x200], 0);
  });

  it('acepta 3584 bytes (hasta 0xFFF)', () => {
    const rom = new Uint8Array(3584);
    for (let i = 0; i < rom.length; i++) rom[i] = (i * 7 + 1) & 0xFF;
    const cpu = new Chip8();
    cpu.loadRom(rom);
    assert.equal(cpu.memory[0x200], rom[0]);
    assert.equal(cpu.memory[0xFFF], rom[3583]);
    assert.deepEqual(cpu.memory.slice(0x200), rom);
    assertFontLoaded(cpu);
  });

  it('3585 bytes lanza RangeError', () => {
    const cpu = new Chip8();
    assert.throws(() => cpu.loadRom(new Uint8Array(3585)), RangeError);
    assert.throws(() => cpu.loadRom(new Array(4000).fill(0)), RangeError);
  });

  it('acepta un ArrayBuffer igual que un Uint8Array', () => {
    const cpu = new Chip8();
    cpu.loadRom(new Uint8Array([0xA2, 0x2A, 0x60, 0x0C]).buffer);
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x205)), [0xA2, 0x2A, 0x60, 0x0C, 0x00]);
    assert.equal(cpu.rom.length, 4);
    cpu.step();
    assert.equal(cpu.I, 0x22A);
  });

  it('un ArrayBuffer de 3584 bytes entra y uno de 3585 lanza RangeError en castellano', () => {
    const cpu = new Chip8();
    cpu.loadRom(new ArrayBuffer(MAX_ROM_SIZE));
    assert.equal(cpu.rom.length, MAX_ROM_SIZE);
    assert.throws(() => cpu.loadRom(new ArrayBuffer(MAX_ROM_SIZE + 1)), (err) => {
      assert.ok(err instanceof RangeError);
      assert.match(err.message, /^La ROM ocupa 3585 bytes y el máximo es 3584/);
      return true;
    });
    assert.throws(() => cpu.loadRom(new ArrayBuffer(5000)), /La ROM ocupa 5000 bytes/);
    // La ROM anterior sigue cargada.
    assert.equal(cpu.rom.length, MAX_ROM_SIZE);
  });

  it('el RangeError por una ROM grande está en castellano', () => {
    const cpu = new Chip8();
    assert.throws(() => cpu.loadRom(new Uint8Array(3585)), /^RangeError: La ROM ocupa 3585 bytes y el máximo es 3584 \(de 0x200 a 0xFFF\)\.$/);
  });

  it('guarda una copia: modificar el origen después no afecta', () => {
    const rom = new Uint8Array([0x60, 0x11]);
    const cpu = new Chip8();
    cpu.loadRom(rom);
    rom[1] = 0x99;
    assert.equal(cpu.memory[0x201], 0x11);
    cpu.reset();
    assert.equal(cpu.memory[0x201], 0x11);
  });

  it('resetea el estado previo', () => {
    const cpu = makeCpu([0x6155, 0xA300, 0x2300]);
    runSteps(cpu, 3);
    cpu.delayTimer = 9;
    cpu.display[5] = 1;
    cpu.loadRom([0x00, 0xE0]);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.I, 0);
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.display[5], 0);
  });

  it('cargar una ROM más chica borra los bytes de la anterior', () => {
    const cpu = new Chip8();
    cpu.loadRom([1, 2, 3, 4, 5, 6]);
    cpu.loadRom([9, 9]);
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x206)), [9, 9, 0, 0, 0, 0]);
  });
});

describe('reset', () => {
  it('restaura la ROM y limpia el estado, conservando quirks y random', () => {
    // LD V0,0xAB | LD I,0x200 | LD [I],V0 (pisa la ROM) | CALL 0x300
    const cpu = makeCpu([0x60AB, 0xA200, 0xF055, 0x2300], { quirks: { shifting: true }, random: () => 0x3C });
    runSteps(cpu, 4);
    assert.equal(cpu.memory[0x200], 0xAB);
    cpu.delayTimer = 50;
    cpu.soundTimer = 60;
    cpu.display.fill(1);
    cpu.setKey(4, true);
    cpu.memory[0x800] = 0x77;
    cpu.memory[FONT_ADDR] = 0x00;
    cpu.halted = true;
    cpu.error = 'algo';
    cpu.reset();
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x208)), [0x60, 0xAB, 0xA2, 0x00, 0xF0, 0x55, 0x23, 0x00]);
    assert.equal(cpu.memory[0x800], 0);
    assertFontLoaded(cpu);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.I, 0);
    assert.equal(cpu.sp, 0);
    assert.ok(cpu.stack.every((v) => v === 0));
    assert.ok(cpu.V.every((v) => v === 0));
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
    assert.ok(cpu.display.every((v) => v === 0));
    assert.ok(cpu.keys.every((v) => v === 0));
    assert.equal(cpu.halted, false);
    assert.equal(cpu.error, null);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.displayDirty, true);
    assert.equal(cpu.quirks.shifting, true);
    // random se conserva
    cpu.loadRom([0xC1, 0xFF]);
    cpu.step();
    assert.equal(cpu.V[1], 0x3C);
  });

  it('la ROM restaurada se ejecuta igual que la primera vez', () => {
    const cpu = makeCpu([0x6007, 0x7001, 0x1202]);
    runSteps(cpu, 20);
    cpu.reset();
    runSteps(cpu, 3);
    assert.equal(cpu.V[0], 8);
  });
});

describe('step', () => {
  it('devuelve true al ejecutar una instrucción y avanza pc', () => {
    const cpu = makeCpu([0x6001, 0x6102]);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.pc, 0x204);
  });

  it('lee el opcode en big-endian', () => {
    const cpu = makeCpu(new Uint8Array([0x61, 0x23]));
    cpu.step();
    assert.equal(cpu.V[1], 0x23);
  });

  it('funciona en direcciones impares', () => {
    // JP 0x203 ; en 0x203: 62 34 (LD V2,0x34)
    const cpu = makeCpu(new Uint8Array([0x12, 0x03, 0x00, 0x62, 0x34]));
    runSteps(cpu, 2);
    assert.equal(cpu.V[2], 0x34);
    assert.equal(cpu.pc, 0x205);
  });

  it('pc pasa de 0xFFE a 0x000', () => {
    const cpu = makeCpu([0x1FFE]);
    cpu.memory[0xFFE] = 0x60;
    cpu.memory[0xFFF] = 0x42;
    runSteps(cpu, 2);
    assert.equal(cpu.V[0], 0x42);
    assert.equal(cpu.pc, 0x000);
  });

  it('un salto condicional en 0xFFC envuelve pc a 0x000', () => {
    const cpu = makeCpu([0x1FFC]);
    cpu.memory[0xFFC] = 0x30; // SE V0, 0x00 -> salta
    cpu.memory[0xFFD] = 0x00;
    runSteps(cpu, 2);
    assert.equal(cpu.pc, 0x000);
  });

  it('devuelve false y no hace nada si está detenida', () => {
    const cpu = makeCpu([0x5121, 0x6001]);
    cpu.step();
    assert.equal(cpu.halted, true);
    assert.equal(cpu.step(), false);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.V[0], 0);
  });

  it('devuelve false mientras espera una tecla', () => {
    const cpu = makeCpu([0xF00A]);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.step(), false);
  });
});

describe('runFrame', () => {
  it('ejecuta ipf instrucciones y devuelve cuántas ejecutó', () => {
    const cpu = makeCpu([0x7001, 0x1200], { quirks: { displayWait: false } });
    assert.equal(cpu.runFrame(7), 7);
    assert.equal(cpu.V[0], 4);
    assert.equal(cpu.runFrame(1), 1);
    assert.equal(cpu.pc, 0x200);
  });

  it('con displayWait: como mucho un DXYN por frame', () => {
    const cpu = makeCpu([0xD011, 0xD011, 0xD011, 0x7101, 0x1200], { quirks: { displayWait: true } });
    for (let f = 0; f < 3; f++) {
      assert.equal(cpu.runFrame(1000), 1, `frame ${f}`);
      assert.equal(cpu.pc, 0x202 + 2 * f);
    }
    // 7101, JP 200, DRW -> 3
    assert.equal(cpu.runFrame(1000), 3);
    assert.equal(cpu.pc, 0x202);
  });

  it('con displayWait y el DXYN al final del presupuesto, ejecuta ipf', () => {
    const cpu = makeCpu([0x6001, 0x6002, 0xD011], { quirks: { displayWait: true } });
    assert.equal(cpu.runFrame(3), 3);
  });

  it('se detiene temprano si la máquina se detiene, y igual hace tick', () => {
    const cpu = makeCpu([0x6001, 0x5121, 0x6202]);
    cpu.delayTimer = 10;
    cpu.runFrame(10);
    assert.equal(cpu.halted, true);
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.V[0], 1);
    assert.equal(cpu.V[2], 0);
    assert.equal(cpu.delayTimer, 9);
  });

  it('detenida al entrar: devuelve 0 y no hace tick', () => {
    const cpu = makeCpu([0x5121]);
    cpu.step();
    cpu.delayTimer = 10;
    cpu.soundTimer = 10;
    assert.equal(cpu.runFrame(10), 0);
    assert.equal(cpu.delayTimer, 10);
    assert.equal(cpu.soundTimer, 10);
  });

  it('se detiene temprano al empezar una espera de tecla', () => {
    const cpu = makeCpu([0x6001, 0x6001, 0xF00A, 0x6001], { quirks: { displayWait: false } });
    assert.equal(cpu.runFrame(10), 3);
    assert.equal(cpu.waitingForKey, true);
    assert.equal(cpu.pc, 0x206);
  });
});

describe('errores', () => {
  const invalid = [];
  for (let n = 1; n <= 0xF; n++) invalid.push(0x5120 | n, 0x9120 | n);
  for (const n of [8, 9, 0xA, 0xB, 0xC, 0xD, 0xF]) invalid.push(0x8120 | n);
  invalid.push(0xE000, 0xE19F, 0xE1A0, 0xE1A2, 0xE19D, 0xEFFF);
  invalid.push(0xF000, 0xF0FF, 0xF101, 0xF108, 0xF10B, 0xF116, 0xF119, 0xF11F, 0xF128, 0xF130, 0xF154, 0xF156,
    0xF164, 0xF166, 0xF175, 0xF185, 0xFF00);

  for (const op of [...new Set(invalid)]) {
    it(`opcode inválido ${hex(op, 4)} detiene la máquina`, () => {
      // Se ejecuta en 0x20A para que la dirección tenga letras.
      const cpu = makeCpu([0x120A, 0, 0, 0, 0, op, 0x6001]);
      const before = Array.from(cpu.V);
      cpu.step();
      cpu.step();
      assertHaltedWith(cpu, op, 0x20A);
      assert.deepEqual(Array.from(cpu.V), before);
    });
  }

  it('desborde de pila: 17 CALL anidados', () => {
    const cpu = makeCpu([0x2200]); // CALL 0x200 (recursión infinita)
    for (let i = 0; i < 16; i++) {
      cpu.step();
      assert.equal(cpu.halted, false, `llamada ${i + 1}`);
      assert.equal(cpu.sp, i + 1);
    }
    assert.ok(Array.from(cpu.stack).every((a) => a === 0x202));
    cpu.step();
    assertHaltedWith(cpu, 0x2200, 0x200);
    assert.equal(cpu.sp, 16);
  });

  it('desborde de pila con la dirección del error', () => {
    // CALL 0x20C en 0x20C
    const cpu = makeCpu([0x120C, 0, 0, 0, 0, 0, 0x220C]);
    for (let i = 0; i < 18; i++) cpu.step(); // JP + 16 CALL correctos + el CALL 17 que desborda
    assertHaltedWith(cpu, 0x220C, 0x20C);
  });

  it('RET con la pila vacía', () => {
    const cpu = makeCpu([0x00EE]);
    cpu.step();
    assertHaltedWith(cpu, 0x00EE, 0x200);
    assert.equal(cpu.sp, 0);
  });

  it('RET con la pila vacía después de vaciarla', () => {
    // CALL 0x206 | (202) RET | (204) - | (206) RET
    const cpu = makeCpu([0x2206, 0x00EE, 0x0000, 0x00EE]);
    runSteps(cpu, 2);
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.halted, false);
    cpu.step();
    assertHaltedWith(cpu, 0x00EE, 0x202);
  });

  it('una máquina detenida sigue detenida hasta el reset', () => {
    const cpu = makeCpu([0x8128, 0x6001]);
    cpu.step();
    const err = cpu.error;
    for (let i = 0; i < 5; i++) assert.equal(cpu.step(), false);
    assert.equal(cpu.runFrame(10), 0);
    assert.equal(cpu.halted, true);
    assert.equal(cpu.error, err);
    assert.equal(cpu.pc, 0x200);
    cpu.reset();
    assert.equal(cpu.halted, false);
    assert.equal(cpu.error, null);
    // la ROM restaurada vuelve a empezar por la instrucción inválida; se la saltea a mano
    cpu.pc = 0x202;
    assert.equal(cpu.step(), true);
    assert.equal(cpu.V[0], 1);
  });

  it('step no lanza excepciones con memoria basura', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xFF;
    const rom = new Uint8Array(3584);
    for (let i = 0; i < rom.length; i++) rom[i] = rnd();
    const cpu = makeCpu(rom, { random: rnd });
    assert.doesNotThrow(() => {
      for (let i = 0; i < 5000 && !cpu.halted; i++) {
        cpu.step();
        if (cpu.waitingForKey) {
          cpu.setKey(1, true);
          cpu.setKey(1, false);
        }
      }
    });
  });
});

describe('random', () => {
  it('por defecto devuelve enteros entre 0 y 255', () => {
    const cpu = makeCpu([0xC0FF, 0x1200]);
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      cpu.pc = 0x200;
      cpu.step();
      const v = cpu.V[0];
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
      seen.add(v);
    }
    assert.ok(seen.size > 50, 'los valores deberían variar');
  });

  it('options.random se usa en CXNN', () => {
    let calls = 0;
    const cpu = makeCpu([0xC5FF], { random: () => { calls++; return 0x81; } });
    cpu.step();
    assert.equal(cpu.V[5], 0x81);
    assert.equal(calls, 1);
  });
});

describe('estado accesible desde afuera', () => {
  it('escribir pc, I y V directamente afecta la ejecución', () => {
    const cpu = makeCpu([0x0000, 0xF155]);
    cpu.pc = 0x202;
    cpu.I = 0x400;
    cpu.V[0] = 0x12;
    cpu.V[1] = 0x34;
    cpu.step();
    assert.deepEqual([cpu.memory[0x400], cpu.memory[0x401]], [0x12, 0x34]);
  });

  it('I se mantiene dentro de 16 bits', () => {
    const cpu = makeCpu([0xFF1E]);
    cpu.I = 0xFFF0;
    cpu.V[0xF] = 0x20;
    cpu.step();
    assert.equal(cpu.I, 0x0010);
  });
});
