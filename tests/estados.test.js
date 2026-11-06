'use strict';
// Estados guardados y rebobinado: cpu.saveState/loadState, Chip8Core.encodeState/decodeState
// (el estado como texto) y Chip8Core.RewindBuffer.
// La prueba central es la de ida y vuelta: una máquina corre N frames, se guarda su estado y
// sigue M frames más; otra máquina nueva, con la misma ROM, carga el estado y corre los mismos
// M frames. Frame por frame tienen que coincidir en todo lo que se ve desde afuera: pantalla,
// registros, I, pc, pila, timers, sonido, banderas, memoria, espera de tecla y errores.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadCore, loadDemos, loadAssembler, hexToBytes } = require('./harness');

const { Chip8, QUIRK_PRESETS, RewindBuffer, encodeState, decodeState, STATE_VERSION } = loadCore();
const { assemble } = loadAssembler();

const PRESET_OF = { chip8: 'vip', schip: 'schip', xochip: 'xochip' };

// Los campos de un estado, en el orden en que los documenta el núcleo.
const STATE_KEYS = [
  'version', 'platform', 'quirks', 'memory', 'V', 'I', 'pc', 'stack', 'sp', 'delayTimer', 'soundTimer',
  'hires', 'displayWidth', 'displayHeight', 'display', 'planes', 'flags', 'audioPattern', 'audioPatternSet',
  'pitch', 'waitingForKey', 'waitReg', 'waitKey', 'halted', 'exited', 'error', 'errorInfo', 'hinted',
];

// ---------------------------------------------------------------- programas de prueba

// CHIP-8: dibuja V7 en decimal desde una subrutina, lo pone en una fila al azar, espera 3
// frames con el temporizador de retardo y suena 2 frames con el de sonido.
const CONTADOR = `
        LD V8, 4
inicio: CLS
        CALL numero
        RND VA, 0x0F
        LD V9, VA
        LD V0, 3
        LD DT, V0
espera: LD V0, DT
        SE V0, 0
        JP espera
        ADD V7, 7
        LD V0, 2
        LD ST, V0
        JP inicio
numero: LD I, bcd
        LD B, V7
        LD V2, [I]
        LD V3, V8
        LD F, V0
        DRW V3, V9, 5
        ADD V3, 5
        LD F, V1
        DRW V3, V9, 5
        ADD V3, 5
        LD F, V2
        DRW V3, V9, 5
        RET
bcd:    DB 0, 0, 0
`;

// CHIP-8: muestra V6, espera una tecla con FX0A, se la suma y suena.
const TECLAS = `
        LD V6, 0
bucle:  CLS
        LD F, V6
        LD V0, 8
        LD V1, 8
        DRW V0, V1, 5
        LD V5, K
        ADD V6, V5
        LD V0, 0x0F
        AND V6, V0
        LD V0, 4
        LD ST, V0
        JP bucle
`;

// SUPER-CHIP: alta resolución, sprite de 16x16, fuente grande, desplazamientos, banderas,
// cambios de resolución y una pausa de un frame en una subrutina.
const SUPER = `
        HIGH
bucle:  LD I, cuadro
        DRW V0, V1, 0
        LD HF, V2
        LD V3, 100
        LD V4, 20
        DRW V3, V4, 10
        SCD 2
        SCR
        ADD V0, 3
        ADD V1, 1
        ADD V2, 1
        LD V5, 0x0F
        AND V2, V5
        LD R, V2
        SCL
        LD V2, R
        SNE V2, 8
        LOW
        SNE V2, 0
        HIGH
        CALL pausa
        JP bucle
pausa:  LD V6, 2
        LD DT, V6
espera: LD V6, DT
        SE V6, 0
        JP espera
        RET
cuadro: DW 0xFFFF, 0x8001, 0x8001, 0x8FF1, 0x8811, 0x8811, 0x8FF1, 0x8001
        DW 0x8001, 0x8FF1, 0x8811, 0x8811, 0x8FF1, 0x8001, 0x8001, 0xFFFF
`;

// XO-CHIP: dos planos, 00DN, patrón de audio y tono, LD I, LONG con datos en 0x2000,
// SAVE/LOAD en 0xF000 y un salto condicional que saltea un F000 NNNN entero.
const PLANOS = `
DATOS   EQU 0x2000
SPRITE1 EQU DATOS
SPRITE2 EQU DATOS + 8
GRANDE  EQU DATOS + 16
PATRON1 EQU DATOS + 80
PATRON2 EQU DATOS + 96
ALTA    EQU 0xF000
        HIGH
bucle:  PLANE 3
        CLS
        PLANE 1
        LD I, LONG SPRITE1
        DRW V0, V1, 8
        PLANE 2
        LD I, LONG SPRITE2
        DRW V1, V0, 8
        PLANE 3
        LD I, LONG GRANDE
        DRW V0, V0, 0
        SCU 1
        PLANE 1
        SCD 3
        SCR
        PLANE 2
        SCL
        ADD V0, 1
        ADD V1, 2
        PITCH V1
        LD V8, V1
        LD V9, 4
        AND V8, V9
        LD I, LONG PATRON2
        SE V8, 0
        LD I, LONG PATRON1
        AUDIO
        LD I, LONG ALTA
        SAVE V0, V3
        LOAD V4, V7
        LD V2, 3
        LD ST, V2
        LD V2, 2
        LD DT, V2
espera: LD V2, DT
        SE V2, 0
        JP espera
        JP bucle
`;

// Termina con EXIT (SUPER-CHIP) después de contar hasta 40.
const FIN = `
        LD V0, 0
bucle:  ADD V0, 1
        LD I, 0x300
        LD B, V0
        SE V0, 40
        JP bucle
salida: EXIT
`;

// Se detiene con una palabra que no es una instrucción.
const ROTO = `
        LD V0, 0
bucle:  ADD V0, 1
        SE V0, 40
        JP bucle
mala:   DW 0x5121
`;

// FX75 es de SUPER-CHIP: en CHIP-8 detiene la máquina con un error de plataforma.
const BANDERAS = `
        LD V0, 7
        LD V3, 9
mala:   LD R, V3
`;

// En CHIP-8, HIGH y LOW se ignoran; el primero deja un aviso en hint.
const AVISO = `
        LD V0, 0
bucle:  ADD V0, 1
        SE V0, 5
        JP bucle
alta:   HIGH
baja:   LOW
fin:    JP fin
`;

// ---------------------------------------------------------------- utilidades

// Generador determinista; copy() da otro que sigue la misma secuencia desde ese punto.
function lcg(seed) {
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 24;
  };
  next.copy = () => lcg(seed);
  return next;
}

function build(source, platform = 'chip8') {
  return assemble(source, { xochip: platform === 'xochip' });
}

// La ROM de PLANOS: el código y, en 0x2000, los sprites y los patrones de audio (7792 bytes).
function planosRom() {
  const rom = new Uint8Array(0x2000 - 0x200 + 112);
  rom.set(build(PLANOS, 'xochip').bytes);
  const datos = 0x2000 - 0x200;
  rom.set([0x3C, 0x42, 0x81, 0x81, 0x81, 0x81, 0x42, 0x3C], datos);
  rom.set([0xFF, 0x81, 0xBD, 0xA5, 0xA5, 0xBD, 0x81, 0xFF], datos + 8);
  for (let i = 0; i < 64; i++) rom[datos + 16 + i] = (i * 37 + 11) & 0xFF;
  for (let i = 0; i < 16; i++) rom[datos + 80 + i] = i % 2 ? 0xF0 : 0x0F;
  for (let i = 0; i < 16; i++) rom[datos + 96 + i] = i < 8 ? 0xFF : 0x00;
  return rom;
}

// Máquina con la ROM cargada, en la plataforma pedida y con los quirks de su perfil (más
// los que se pasen).
function machine(rom, { platform = 'chip8', quirks = {}, random } = {}) {
  const cpu = new Chip8({ platform, quirks: { ...QUIRK_PRESETS[PRESET_OF[platform]].quirks, ...quirks }, random });
  cpu.loadRom(rom);
  return cpu;
}

const digest = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex');
const hexOf = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');

// Todo lo que se ve de la máquina después de un frame.
function observe(cpu, executed) {
  return {
    executed,
    pc: cpu.pc, I: cpu.I, sp: cpu.sp, V: Array.from(cpu.V), stack: Array.from(cpu.stack),
    delayTimer: cpu.delayTimer, soundTimer: cpu.soundTimer,
    platform: cpu.platform, quirks: { ...cpu.quirks },
    hires: cpu.hires, width: cpu.displayWidth, height: cpu.displayHeight, display: hexOf(cpu.display),
    planes: cpu.planes, flags: hexOf(cpu.flags),
    audioPattern: hexOf(cpu.audioPattern), audioPatternSet: cpu.audioPatternSet, pitch: cpu.pitch,
    waitingForKey: cpu.waitingForKey, halted: cpu.halted, exited: cpu.exited,
    error: cpu.error, errorInfo: cpu.errorInfo && { ...cpu.errorInfo }, hint: cpu.hint && { ...cpu.hint },
    memory: digest(cpu.memory),
  };
}

// Corre `frames` frames de `ipf` instrucciones y anota cada uno. events(cpu, frame) se
// llama antes de cada frame (para apretar y soltar teclas).
function record(cpu, frames, ipf, events = () => {}) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    events(cpu, f);
    out.push(observe(cpu, cpu.runFrame(ipf)));
  }
  return out;
}

// Ida y vuelta: `original` corre `before` frames, se guarda y corre `after` frames más;
// una máquina nueva (opciones `fresh`, por defecto CHIP-8 con los quirks de siempre) carga
// la misma ROM y el estado, y corre esos `after` frames con los mismos eventos. afterLoad
// es lo que hace la interfaz después de cargar (por ejemplo, volver a apretar teclas).
function roundTrip(original, { before, after, ipf, fresh = {}, events, afterLoad, prepare }) {
  for (let f = 0; f < before; f++) original.runFrame(ipf);
  if (prepare) prepare(original);
  const saved = original.saveState();
  const random = original.random.copy ? original.random.copy() : undefined;
  const expected = record(original, after, ipf, events);
  const copy = new Chip8({ ...fresh, random });
  copy.loadRom(original.rom);
  copy.loadState(saved);
  assert.deepEqual(copy.saveState(), saved, 'recién cargada, la máquina tiene el estado guardado');
  if (afterLoad) afterLoad(copy);
  const actual = record(copy, after, ipf, events);
  for (let f = 0; f < after; f++) assert.deepEqual(actual[f], expected[f], `frame ${f} después de cargar`);
  return { saved, expected, copy };
}

// Copia profunda de un estado con un cambio.
function mutated(state, change) {
  const copy = structuredClone(state);
  change(copy);
  return copy;
}

// Verifica que fn lance un Error cuyo mensaje empieza con "Estado inválido: " y cumple `pattern`.
function assertInvalid(fn, pattern) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof Error, 'tiene que ser un Error');
    assert.match(err.message, /^Estado inválido: /);
    assert.match(err.message, pattern);
    return true;
  });
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

// ---------------------------------------------------------------- saveState

describe('saveState', () => {
  it('devuelve todos los campos del formato, versión 1', () => {
    const cpu = machine(build(CONTADOR).bytes, { random: lcg(1) });
    for (let f = 0; f < 10; f++) cpu.runFrame(15);
    const state = cpu.saveState();
    assert.deepEqual(Object.keys(state), STATE_KEYS);
    assert.equal(STATE_VERSION, 1);
    assert.equal(state.version, STATE_VERSION);
    assert.equal(state.platform, 'chip8');
    assert.deepEqual(state.quirks, QUIRK_PRESETS.vip.quirks);
    assert.deepEqual(state.memory, cpu.memory);
    assert.deepEqual(state.display, cpu.display);
    assert.deepEqual([state.I, state.pc, state.sp, state.delayTimer, state.soundTimer], [cpu.I, cpu.pc, cpu.sp, cpu.delayTimer, cpu.soundTimer]);
    assert.deepEqual([state.hires, state.displayWidth, state.displayHeight, state.planes], [false, 64, 32, 1]);
    assert.deepEqual([state.waitingForKey, state.waitReg, state.waitKey], [false, 0, -1]);
    assert.deepEqual([state.halted, state.exited, state.error, state.errorInfo, state.hinted], [false, false, null, null, false]);
  });

  it('los arreglos son copias: la foto y la máquina no se tocan entre sí', () => {
    const cpu = machine(build(PLANOS, 'xochip').bytes, { platform: 'xochip' });
    for (let f = 0; f < 5; f++) cpu.runFrame(50);
    const state = cpu.saveState();
    const again = cpu.saveState();
    for (const key of ['memory', 'V', 'stack', 'display', 'flags', 'audioPattern']) {
      assert.notEqual(state[key], cpu[key], key + ' no puede ser el mismo arreglo');
      state[key][0] ^= 1;
      assert.notEqual(state[key][0], cpu[key][0], key + ': cambiar la foto no cambia la máquina');
    }
    assert.notEqual(state.quirks, cpu.quirks);
    cpu.runFrame(50);
    assert.notDeepEqual(cpu.saveState(), again);
    assert.equal(again.memory[0x200], 0x00); // la foto sigue igual (00FF al principio)
    assert.equal(again.memory[0x201], 0xFF);
  });

  it('copia errorInfo (con needs y name) y no guarda la ROM, las teclas ni hint', () => {
    const { bytes } = build(BANDERAS);
    const cpu = machine(bytes);
    cpu.runFrame(10);
    cpu.setKey(4, true);
    const state = cpu.saveState();
    assert.deepEqual(state.errorInfo, cpu.errorInfo);
    assert.notEqual(state.errorInfo, cpu.errorInfo);
    assert.equal(state.errorInfo.needs, 'schip');
    for (const key of ['rom', 'keys', 'hint', 'random', 'displayDirty', 'audioDirty']) assert.ok(!(key in state), key);
  });
});

// ---------------------------------------------------------------- ida y vuelta

describe('ida y vuelta: guardar, seguir y cargar en otra máquina', () => {
  it('CHIP-8 con timers, CALL/RET, BCD, la fuente y RND, desde varios puntos', () => {
    const rom = build(CONTADOR).bytes;
    for (const before of [0, 1, 7, 23, 50]) {
      const { expected } = roundTrip(machine(rom, { random: lcg(before + 1) }), { before, after: 90, ipf: 15 });
      assert.ok(expected.some((r) => r.delayTimer > 0), 'usa el temporizador de retardo');
      assert.ok(expected.some((r) => r.soundTimer > 0), 'usa el temporizador de sonido');
      assert.ok(expected.some((r) => r.sp > 0), 'corta frames adentro de la subrutina');
      assert.ok(new Set(expected.map((r) => r.display)).size > 5, 'la pantalla cambia');
    }
  });

  it('los quirks del estado reemplazan a los de la máquina que lo carga', () => {
    const rom = build(CONTADOR).bytes;
    const original = machine(rom, { random: lcg(4), quirks: { displayWait: false, vfReset: false } });
    const { copy } = roundTrip(original, { before: 9, after: 40, ipf: 15 });
    assert.equal(copy.quirks.displayWait, false);
    assert.equal(copy.quirks.vfReset, false);
  });

  describe('FX0A', () => {
    const rom = build(TECLAS).bytes;
    const ipf = 10;

    // Corre hasta que la máquina queda esperando una tecla.
    function waiting() {
      const cpu = machine(rom);
      for (let f = 0; f < 10 && !cpu.waitingForKey; f++) cpu.runFrame(ipf);
      assert.equal(cpu.waitingForKey, true);
      return cpu;
    }

    it('guardado mientras espera: después de cargar, apretar y soltar una tecla sigue igual', () => {
      const events = (cpu, f) => {
        if (f === 2) cpu.setKey(0xA, true);
        if (f === 4) cpu.setKey(0xA, false);
        if (f === 9) cpu.setKey(3, true);
        if (f === 10) cpu.setKey(3, false);
      };
      const { saved, expected } = roundTrip(waiting(), { before: 0, after: 16, ipf, events });
      assert.deepEqual([saved.waitingForKey, saved.waitReg, saved.waitKey], [true, 5, -1]);
      assert.equal(expected[3].waitingForKey, true, 'con la tecla apretada sigue esperando');
      assert.equal(expected[4].V[5], 0xA, 'al soltarla la recibe V5');
      assert.equal(expected[15].V[6], 0xD, 'V6 = 0xA + 3');
      assert.equal(expected[15].waitingForKey, true, 'y vuelve a esperar');
      assert.ok(expected.some((r) => r.soundTimer > 0));
    });

    it('guardado con la tecla ya apretada: la interfaz la vuelve a apretar y al soltarla sigue igual', () => {
      const original = waiting();
      original.setKey(7, true); // la espera ya tomó la tecla 7, que sigue apretada
      const events = (cpu, f) => {
        if (f === 1) cpu.setKey(2, true); // otra tecla no cambia nada
        if (f === 2) cpu.setKey(2, false);
        if (f === 3) cpu.setKey(7, false);
      };
      const { saved, expected } = roundTrip(original, {
        before: 0, after: 10, ipf, events,
        afterLoad: (cpu) => cpu.setKey(7, true), // lo que hace la interfaz con las teclas que siguen apretadas
      });
      assert.equal(saved.waitKey, 7);
      assert.equal(expected[2].waitingForKey, true);
      assert.equal(expected[3].V[5], 7);
    });

    it('con waitKey y la tecla ya suelta, la espera termina cuando esa tecla se aprieta y se suelta', () => {
      const original = waiting();
      original.setKey(7, true);
      const cpu = machine(rom);
      cpu.loadState(original.saveState());
      cpu.setKey(7, false); // para el núcleo ya estaba suelta: no pasa nada
      cpu.setKey(2, true);
      cpu.setKey(2, false);
      assert.equal(cpu.waitingForKey, true);
      cpu.setKey(7, true);
      assert.equal(cpu.waitingForKey, true);
      cpu.setKey(7, false);
      assert.equal(cpu.waitingForKey, false);
      assert.equal(cpu.V[5], 7);
    });
  });

  it('SUPER-CHIP: alta resolución, 16x16, fuente grande, desplazamientos, banderas y cambio de resolución', () => {
    const rom = build(SUPER).bytes;
    for (const before of [3, 20]) {
      const original = machine(rom, { platform: 'schip' });
      // La máquina nueva es CHIP-8 con los quirks del VIP: el estado la pasa a SUPER-CHIP.
      const { saved, expected, copy } = roundTrip(original, { before, after: 120, ipf: 30 });
      assert.equal(saved.platform, 'schip');
      assert.equal(copy.platform, 'schip');
      assert.deepEqual(copy.quirks, QUIRK_PRESETS.schip.quirks);
      assert.ok(expected.some((r) => r.hires) && expected.some((r) => !r.hires), 'pasa por las dos resoluciones');
      assert.ok(expected.some((r) => r.flags !== '00'.repeat(16)), 'usa las banderas');
      assert.ok(expected.some((r) => r.sp > 0) && expected.some((r) => r.delayTimer > 0));
    }
  });

  it('XO-CHIP: dos planos, 00DN, patrón de audio y tono, LD I, LONG y la memoria de 64 KB', () => {
    const rom = planosRom();
    for (const before of [1, 17]) {
      const original = machine(rom, { platform: 'xochip' });
      // La ROM no entra en 4 KB: la máquina nueva ya es XO-CHIP, pero con los quirks del VIP.
      const { saved, expected, copy } = roundTrip(original, { before, after: 120, ipf: 50, fresh: { platform: 'xochip' } });
      assert.equal(saved.memory.length, 65536);
      assert.deepEqual(copy.quirks, QUIRK_PRESETS.xochip.quirks);
      assert.ok(expected.every((r) => r.hires));
      assert.ok(expected.some((r) => r.display.includes('03')), 'dibuja en los dos planos a la vez');
      assert.ok(expected.some((r) => r.display.includes('02')), 'y en el plano 2 solo');
      assert.ok(new Set(expected.map((r) => r.audioPattern)).size === 2, 'alterna los dos patrones de audio');
      assert.ok(new Set(expected.map((r) => r.pitch)).size > 10, 'cambia el tono');
      assert.ok(expected.every((r) => r.audioPatternSet));
      assert.ok(expected.some((r) => r.soundTimer > 0));
      assert.ok(new Set(expected.map((r) => r.memory)).size > 10, 'escribe en 0xF000');
    }
    // Lo que escribió SAVE en 0xF000 viaja con el estado.
    const cpu = machine(rom, { platform: 'xochip' });
    for (let f = 0; f < 30; f++) cpu.runFrame(50);
    const state = cpu.saveState();
    assert.notEqual(state.memory[0xF001], 0, 'SAVE V0, V3 escribió V1 en 0xF001');
    const copy = new Chip8({ platform: 'xochip' });
    copy.loadState(state);
    assert.deepEqual(copy.memory.slice(0xF000, 0xF004), cpu.memory.slice(0xF000, 0xF004));
  });

  it('una máquina detenida por una instrucción inválida sigue detenida, con el mismo error', () => {
    const { bytes, labels } = build(ROTO);
    const { saved, expected } = roundTrip(machine(bytes), { before: 30, after: 5, ipf: 10 });
    assert.equal(saved.halted, true);
    assert.equal(saved.exited, false);
    assert.equal(saved.pc, labels.mala);
    assert.equal(saved.error, 'Instrucción inválida o desconocida (opcode 0x5121 en la dirección 0x208).');
    assert.deepEqual(saved.errorInfo, { kind: 'invalid', opcode: 0x5121, addr: labels.mala });
    assert.ok(expected.every((r) => r.executed === 0 && r.halted && r.error === saved.error));
  });

  it('un error de plataforma conserva errorInfo con needs y name', () => {
    const { bytes, labels } = build(BANDERAS);
    const { saved, copy } = roundTrip(machine(bytes), { before: 2, after: 3, ipf: 10 });
    assert.deepEqual(saved.errorInfo, { kind: 'platform', opcode: 0xF375, addr: labels.mala, needs: 'schip', name: 'guardar registros en las banderas' });
    assert.deepEqual(copy.errorInfo, saved.errorInfo);
    assert.notEqual(copy.errorInfo, saved.errorInfo);
    assert.match(copy.error, /Elegí la plataforma SUPER-CHIP\.$/);
  });

  it('una máquina que terminó con EXIT sigue terminada', () => {
    const { bytes, labels } = build(FIN);
    const { saved, expected } = roundTrip(machine(bytes, { platform: 'schip' }), { before: 30, after: 4, ipf: 10 });
    assert.deepEqual([saved.halted, saved.exited, saved.error, saved.errorInfo, saved.pc], [true, true, null, null, labels.salida]);
    assert.ok(expected.every((r) => r.executed === 0 && r.exited));
  });

  it('hint se borra al cargar y hinted se respeta (no vuelve a avisar)', () => {
    const { bytes, labels } = build(AVISO);
    const until = (cpu, addr) => {
      while (cpu.pc !== addr) cpu.step();
      return cpu;
    };
    // Guardado antes del HIGH: después de cargar, el HIGH avisa igual que en la original.
    const early = until(machine(bytes), labels.alta);
    const earlyState = early.saveState();
    assert.equal(earlyState.hinted, false);
    const copy1 = machine(bytes);
    copy1.loadState(earlyState);
    early.step();
    copy1.step();
    assert.ok(early.hint && early.hint.needs === 'schip');
    assert.deepEqual(copy1.hint, early.hint);
    // Guardado después del HIGH (la interfaz ya leyó el aviso): el LOW no avisa en ninguna.
    const late = until(machine(bytes), labels.baja);
    late.hint = null; // como checkHint en la interfaz
    const lateState = late.saveState();
    assert.equal(lateState.hinted, true);
    const copy2 = machine(bytes);
    copy2.hint = { opcode: 0x00FF, addr: 0x200, needs: 'schip', name: 'algo' };
    copy2.loadState(lateState);
    assert.equal(copy2.hint, null, 'loadState borra hint');
    late.step();
    copy2.step();
    assert.equal(late.hint, null);
    assert.equal(copy2.hint, null);
  });
});

// ---------------------------------------------------------------- loadState

describe('loadState', () => {
  it('cambia la plataforma y el tamaño de la memoria, y no recarga la ROM', () => {
    const rom = build(CONTADOR).bytes;
    const cpu = machine(rom, { random: lcg(2) });
    for (let f = 0; f < 5; f++) cpu.runFrame(15);
    const xo = machine(planosRom(), { platform: 'xochip' });
    for (let f = 0; f < 30; f++) xo.runFrame(50);
    const xoState = xo.saveState();

    cpu.loadState(xoState);
    assert.equal(cpu.platform, 'xochip');
    assert.equal(cpu.memory.length, 65536);
    assert.deepEqual(cpu.memory, xoState.memory, 'la memoria es la del estado');
    assert.deepEqual(cpu.rom, rom, 'cpu.rom sigue siendo la del cartucho');
    assert.deepEqual(cpu.quirks, QUIRK_PRESETS.xochip.quirks);
    // Sigue como XO-CHIP: mismos frames que la original.
    assert.deepEqual(record(cpu, 10, 50), record(xo, 10, 50));

    // Y de vuelta a CHIP-8 con un estado de CHIP-8.
    const chip8 = machine(rom, { random: lcg(3) });
    chip8.runFrame(15);
    cpu.loadState(chip8.saveState());
    assert.equal(cpu.platform, 'chip8');
    assert.equal(cpu.memory.length, 4096);
    assert.deepEqual(cpu.saveState(), chip8.saveState());
  });

  it('un reset() después de loadState vuelve a empezar la ROM del cartucho', () => {
    const rom = build(CONTADOR).bytes;
    const cpu = machine(rom, { random: lcg(2) });
    const xo = machine(planosRom(), { platform: 'xochip' });
    for (let f = 0; f < 30; f++) xo.runFrame(50);
    cpu.loadState(xo.saveState());
    cpu.reset();
    assert.equal(cpu.platform, 'xochip', 'el reset conserva la plataforma del estado');
    assert.equal(cpu.pc, 0x200);
    assert.deepEqual(cpu.memory.slice(0x200, 0x200 + rom.length), rom);
    assert.ok(cpu.memory.slice(0x200 + rom.length).every((b) => b === 0), 'lo demás del estado se borró');
    assert.equal(cpu.hires, false);
    // Y arranca como el cartucho en una máquina nueva de XO-CHIP con esos quirks.
    const fresh = new Chip8({ platform: 'xochip', quirks: QUIRK_PRESETS.xochip.quirks, random: lcg(8) });
    fresh.loadRom(rom);
    cpu.random = lcg(8);
    assert.deepEqual(record(cpu, 20, 15), record(fresh, 20, 15));
  });

  it('suelta todas las teclas, borra hint y deja displayDirty y audioDirty en true', () => {
    const cpu = machine(build(CONTADOR).bytes, { random: lcg(3) });
    cpu.runFrame(15);
    const state = cpu.saveState();
    cpu.setKey(1, true);
    cpu.setKey(0xF, true);
    cpu.hint = { opcode: 0x00FF, addr: 0x200, needs: 'schip', name: 'algo' };
    cpu.displayDirty = false;
    cpu.audioDirty = false;
    cpu.loadState(state);
    assert.ok(cpu.keys.every((k) => k === 0));
    assert.equal(cpu.hint, null);
    assert.equal(cpu.displayDirty, true);
    assert.equal(cpu.audioDirty, true);
  });

  it('no comparte arreglos con el estado: cambiar el estado después no cambia la máquina', () => {
    const cpu = machine(build(CONTADOR).bytes, { random: lcg(3) });
    cpu.runFrame(15);
    const state = cpu.saveState();
    const other = new Chip8();
    other.loadState(state);
    const copy = other.saveState();
    for (const key of ['memory', 'V', 'stack', 'display', 'flags', 'audioPattern']) {
      assert.notEqual(other[key], state[key], key);
      state[key][1] ^= 1;
    }
    state.quirks.clipping = !state.quirks.clipping;
    assert.deepEqual(other.saveState(), copy);
  });

  it('reemplaza el arreglo de la pantalla solo si cambia el tamaño', () => {
    const cpu = new Chip8({ platform: 'schip' });
    const display = cpu.display;
    cpu.loadState(new Chip8({ platform: 'schip' }).saveState());
    assert.equal(cpu.display, display, 'mismo tamaño: el mismo arreglo');
    const hires = new Chip8({ platform: 'schip' });
    hires.loadRom([0x00, 0xFF]);
    hires.step();
    cpu.loadState(hires.saveState());
    assert.notEqual(cpu.display, display);
    assert.deepEqual([cpu.display.length, cpu.displayWidth, cpu.displayHeight, cpu.hires], [8192, 128, 64, true]);
  });

  it('si la ROM cargada no entra en la plataforma del estado, lanza RangeError y no cambia nada', () => {
    const big = machine(planosRom(), { platform: 'xochip' });
    big.runFrame(50);
    const chip8State = machine(build(CONTADOR).bytes).saveState();
    const before = big.saveState();
    assert.throws(() => big.loadState(chip8State), (err) => {
      assert.ok(err instanceof RangeError);
      assert.equal(err.message, 'La ROM cargada ocupa 7792 bytes y con la plataforma CHIP-8 del estado el máximo es 3584: no se cargó el estado.');
      return true;
    });
    assert.deepEqual(big.saveState(), before);
  });

  it('los enteros se normalizan: un -0 se carga como 0', () => {
    const state = new Chip8().saveState();
    state.pc = -0;
    state.I = -0;
    const cpu = new Chip8();
    cpu.loadState(state);
    assert.ok(Object.is(cpu.pc, 0) && Object.is(cpu.I, 0));
  });

  describe('valida el estado antes de tocar nada', () => {
    function base(platform) {
      if (platform === 'chip8') {
        const cpu = machine(build(CONTADOR).bytes, { random: lcg(9) });
        for (let f = 0; f < 12; f++) cpu.runFrame(15);
        return cpu.saveState();
      }
      if (platform === 'schip') return new Chip8({ platform: 'schip' }).saveState();
      const cpu = machine(build(PLANOS, 'xochip').bytes, { platform: 'xochip' });
      for (let f = 0; f < 12; f++) cpu.runFrame(50);
      return cpu.saveState();
    }
    const bases = { chip8: base('chip8'), schip: base('schip'), xochip: base('xochip') };

    // [nombre, plataforma de la base, cambio, mensaje esperado]
    const cases = [
      ['version desconocida', 'chip8', (s) => { s.version = 2; }, /^Estado inválido: versión desconocida: 2 \(este emulador lee la versión 1\)\.$/],
      ['version como texto', 'chip8', (s) => { s.version = '1'; }, /versión desconocida: "1"/],
      ['falta version', 'chip8', (s) => { delete s.version; }, /^Estado inválido: falta el campo version\.$/],
      ['plataforma desconocida', 'chip8', (s) => { s.platform = 'superchip'; }, /^Estado inválido: plataforma desconocida: "superchip" \(tiene que ser chip8, schip o xochip\)\.$/],
      ['falta platform', 'chip8', (s) => { delete s.platform; }, /falta el campo platform\./],
      ['falta quirks', 'chip8', (s) => { delete s.quirks; }, /falta el campo quirks\./],
      ['quirks no es un objeto', 'chip8', (s) => { s.quirks = 3; }, /quirks tiene que ser un objeto \(es 3\)/],
      ['falta un quirk', 'chip8', (s) => { delete s.quirks.clipping; }, /falta el campo quirks\.clipping\./],
      ['un quirk que no es booleano', 'chip8', (s) => { s.quirks.memory = 1; }, /quirks\.memory tiene que ser true o false \(es 1\)/],
      ['memoria de 4 KB en XO-CHIP', 'xochip', (s) => { s.memory = new Uint8Array(4096); }, /^Estado inválido: memory tiene 4096 bytes y tiene que tener 65536 \(la memoria de XO-CHIP\)\.$/],
      ['memoria de 64 KB en CHIP-8', 'chip8', (s) => { s.memory = new Uint8Array(65536); }, /memory tiene 65536 bytes y tiene que tener 4096 \(la memoria de CHIP-8\)/],
      ['memoria en una lista', 'chip8', (s) => { s.memory = Array.from(s.memory); }, /memory tiene que ser un Uint8Array \(es una lista\)/],
      ['memoria en otro arreglo tipado', 'chip8', (s) => { s.memory = new Uint16Array(4096); }, /memory tiene que ser un Uint8Array \(es un Uint16Array\)/],
      ['V de 15 bytes', 'chip8', (s) => { s.V = new Uint8Array(15); }, /V tiene 15 bytes y tiene que tener 16\./],
      ['I fuera de 16 bits', 'chip8', (s) => { s.I = 0x10000; }, /I tiene que ser un entero de 0x0000 a 0xFFFF \(es 65536\)/],
      ['I con coma', 'chip8', (s) => { s.I = 1.5; }, /I tiene que ser un entero de 0x0000 a 0xFFFF \(es 1\.5\)/],
      ['I como texto', 'chip8', (s) => { s.I = '5'; }, /I tiene que ser un entero .*\(es "5"\)/],
      ['I NaN', 'chip8', (s) => { s.I = NaN; }, /\(es NaN\)/],
      ['pc fuera de los 4 KB', 'chip8', (s) => { s.pc = 0x1000; }, /pc tiene que ser un entero de 0x000 a 0xFFF \(es 4096\)/],
      ['pc fuera de los 64 KB', 'xochip', (s) => { s.pc = 0x10000; }, /pc tiene que ser un entero de 0x0000 a 0xFFFF/],
      ['stack de bytes', 'chip8', (s) => { s.stack = new Uint8Array(16); }, /stack tiene que ser un Uint16Array \(es un Uint8Array\)/],
      ['stack de 17', 'chip8', (s) => { s.stack = new Uint16Array(17); }, /stack tiene 17 entradas y tiene que tener 16\./],
      ['sp 17', 'chip8', (s) => { s.sp = 17; }, /sp tiene que ser un entero de 0 a 16 \(es 17\)/],
      ['delayTimer 256', 'chip8', (s) => { s.delayTimer = 256; }, /delayTimer tiene que ser un entero de 0 a 255 \(es 256\)/],
      ['soundTimer negativo', 'chip8', (s) => { s.soundTimer = -1; }, /soundTimer tiene que ser un entero de 0 a 255 \(es -1\)/],
      ['alta resolución en CHIP-8', 'chip8', (s) => { s.hires = true; s.displayWidth = 128; s.displayHeight = 64; s.display = new Uint8Array(8192); }, /hires tiene que ser false en CHIP-8/],
      ['hires no booleano', 'schip', (s) => { s.hires = 'no'; }, /hires tiene que ser true o false \(es "no"\)/],
      ['ancho que no va con hires', 'schip', (s) => { s.displayWidth = 128; }, /displayWidth × displayHeight es 128 × 32 y con hires = false tiene que ser 64 × 32\./],
      ['falta displayHeight', 'schip', (s) => { delete s.displayHeight; }, /falta el campo displayHeight\./],
      ['pantalla chica para alta resolución', 'schip', (s) => { s.hires = true; s.displayWidth = 128; s.displayHeight = 64; }, /display tiene 2048 píxeles y tiene que tener 8192 \(128 × 64\)\./],
      ['pantalla en una lista', 'schip', (s) => { s.display = Array.from(s.display); }, /display tiene que ser un Uint8Array \(es una lista\)/],
      ['píxel con el plano 2 en CHIP-8', 'chip8', (s) => { s.display[69] = 2; }, /el píxel \(5, 1\) de display vale 2 y en CHIP-8 tiene que ser de 0 a 1\./],
      ['píxel 4 en XO-CHIP', 'xochip', (s) => { s.display[s.display.length - 1] = 4; }, /el píxel \(127, 63\) de display vale 4 y en XO-CHIP tiene que ser de 0 a 3\./],
      ['planes 4 en XO-CHIP', 'xochip', (s) => { s.planes = 4; }, /planes tiene que ser un entero de 0 a 3 \(es 4\)/],
      ['planes 2 en SUPER-CHIP', 'schip', (s) => { s.planes = 2; }, /planes tiene que ser 1 en SUPER-CHIP, donde no hay planos \(es 2\)/],
      ['flags de 8', 'chip8', (s) => { s.flags = new Uint8Array(8); }, /flags tiene 8 bytes y tiene que tener 16\./],
      ['audioPattern en una lista', 'chip8', (s) => { s.audioPattern = []; }, /audioPattern tiene que ser un Uint8Array \(es una lista\)/],
      ['falta audioPatternSet', 'chip8', (s) => { delete s.audioPatternSet; }, /falta el campo audioPatternSet\./],
      ['pitch 256', 'xochip', (s) => { s.pitch = 256; }, /pitch tiene que ser un entero de 0 a 255/],
      ['waitingForKey 0', 'chip8', (s) => { s.waitingForKey = 0; }, /waitingForKey tiene que ser true o false \(es 0\)/],
      ['waitReg 16', 'chip8', (s) => { s.waitReg = 16; }, /waitReg tiene que ser un entero de 0 a 15 \(es 16\)/],
      ['waitKey -2', 'chip8', (s) => { s.waitKey = -2; }, /waitKey tiene que ser un entero de -1 a 15 \(es -2\)/],
      ['waitKey 16', 'chip8', (s) => { s.waitKey = 16; }, /waitKey tiene que ser un entero de -1 a 15 \(es 16\)/],
      ['falta halted', 'chip8', (s) => { delete s.halted; }, /falta el campo halted\./],
      ['exited como texto', 'chip8', (s) => { s.exited = 'sí'; }, /exited tiene que ser true o false \(es "sí"\)/],
      ['error que no es texto', 'chip8', (s) => { s.error = 5; }, /error tiene que ser un texto o null \(es 5\)/],
      ['falta errorInfo', 'chip8', (s) => { delete s.errorInfo; }, /falta el campo errorInfo\./],
      ['errorInfo que no es objeto', 'chip8', (s) => { s.errorInfo = 'x'; }, /errorInfo tiene que ser un objeto o null \(es "x"\)/],
      ['errorInfo.kind desconocido', 'chip8', (s) => { s.errorInfo = { kind: 'otro', opcode: 0, addr: 0 }; }, /errorInfo\.kind desconocido: "otro" \(tiene que ser invalid, platform, stackOverflow, stackUnderflow\)\./],
      ['falta errorInfo.opcode', 'chip8', (s) => { s.errorInfo = { kind: 'invalid', addr: 0 }; }, /falta el campo errorInfo\.opcode\./],
      ['errorInfo.addr fuera de los 4 KB', 'chip8', (s) => { s.errorInfo = { kind: 'invalid', opcode: 0x5121, addr: 0x1000 }; }, /errorInfo\.addr tiene que ser un entero de 0x000 a 0xFFF/],
      ['errorInfo.needs desconocido', 'chip8', (s) => { s.errorInfo = { kind: 'platform', opcode: 0xF075, addr: 0x200, needs: 'nes', name: 'x' }; }, /errorInfo\.needs tiene que ser chip8, schip o xochip \(es "nes"\)/],
      ['errorInfo.name que no es texto', 'chip8', (s) => { s.errorInfo = { kind: 'platform', opcode: 0xF075, addr: 0x200, needs: 'schip', name: 3 }; }, /errorInfo\.name tiene que ser un texto \(es 3\)/],
      ['falta hinted', 'chip8', (s) => { delete s.hinted; }, /falta el campo hinted\./],
    ];

    for (const [name, platform, change, pattern] of cases) {
      it(name, () => {
        const state = mutated(bases[platform], change);
        const cpu = machine(build(CONTADOR).bytes, { random: lcg(1) });
        cpu.runFrame(15);
        cpu.setKey(3, true);
        const before = cpu.saveState();
        const rom = cpu.rom;
        assertInvalid(() => cpu.loadState(state), pattern);
        assert.deepEqual(cpu.saveState(), before, 'la máquina no cambió');
        assert.equal(cpu.rom, rom);
        assert.equal(cpu.keys[3], 1, 'ni siquiera soltó las teclas');
        assertInvalid(() => encodeState(state), pattern);
      });
    }

    it('algo que no es un objeto', () => {
      const cpu = new Chip8();
      assertInvalid(() => cpu.loadState(null), /^Estado inválido: tiene que ser un objeto \(es null\)\.$/);
      assertInvalid(() => cpu.loadState(), /tiene que ser un objeto \(es undefined\)/);
      assertInvalid(() => cpu.loadState('estado'), /tiene que ser un objeto \(es "estado"\)/);
      assertInvalid(() => cpu.loadState([1, 2]), /tiene que ser un objeto \(es una lista\)/);
    });

    it('acepta las bases sin cambios (en las tres plataformas)', () => {
      for (const platform of ['chip8', 'schip', 'xochip']) {
        const cpu = new Chip8();
        cpu.loadState(bases[platform]);
        assert.deepEqual(cpu.saveState(), bases[platform]);
      }
    });
  });
});

// ---------------------------------------------------------------- texto

// Estados variados para las pruebas de texto: [nombre, estado].
function sampleStates() {
  const out = [];
  const contador = machine(build(CONTADOR).bytes, { random: lcg(5) });
  for (let f = 0; f < 25; f++) contador.runFrame(15);
  out.push(['CHIP-8 corriendo', contador.saveState()]);

  const superchip = machine(build(SUPER).bytes, { platform: 'schip' });
  for (let f = 0; f < 15; f++) superchip.runFrame(30);
  out.push(['SUPER-CHIP en alta resolución', superchip.saveState()]);

  const planos = machine(planosRom(), { platform: 'xochip' });
  for (let f = 0; f < 40; f++) planos.runFrame(50);
  out.push(['XO-CHIP con planos y audio', planos.saveState()]);

  const teclas = machine(build(TECLAS).bytes);
  for (let f = 0; f < 3; f++) teclas.runFrame(10);
  teclas.setKey(9, true);
  out.push(['FX0A con la tecla tomada', teclas.saveState()]);

  const banderas = machine(build(BANDERAS).bytes);
  banderas.runFrame(10);
  out.push(['error de plataforma', banderas.saveState()]);

  const fin = machine(build(FIN).bytes, { platform: 'schip' });
  for (let f = 0; f < 30; f++) fin.runFrame(10);
  out.push(['terminada con EXIT', fin.saveState()]);

  const aviso = machine(build(AVISO).bytes);
  for (let f = 0; f < 5; f++) aviso.runFrame(10);
  out.push(['con hinted', aviso.saveState()]);
  return out;
}

// Un estado válido al azar: memoria con rachas de ceros de todos los largos, pantalla con
// todos los valores permitidos y escalares en todo su rango.
function randomState(platform, rnd) {
  const level = ['chip8', 'schip', 'xochip'].indexOf(platform);
  const hires = level > 0 && rnd() % 2 === 1;
  const size = platform === 'xochip' ? 65536 : 4096;
  const memory = new Uint8Array(size);
  for (let i = 0; i < size;) {
    const zeros = [0, 1, 2, 127, 128, 129, 300, 16383, 16384, 16385][rnd() % 10];
    i += zeros;
    for (let k = rnd() % 5; k > 0 && i < size; k--) memory[i++] = 1 + (rnd() % 255);
  }
  const display = new Uint8Array(hires ? 8192 : 2048);
  for (let i = 0; i < display.length; i++) display[i] = rnd() % 3 === 0 ? rnd() % (level === 2 ? 4 : 2) : 0;
  const bytes = (n) => Uint8Array.from({ length: n }, () => rnd());
  const errorInfo = rnd() % 2 ? null : { kind: 'platform', opcode: 0xF075, addr: (rnd() << 4) % size, needs: 'xochip', name: 'cargar el patrón de audio' };
  return {
    version: 1, platform,
    quirks: { vfReset: !!(rnd() & 1), memory: !!(rnd() & 1), shifting: !!(rnd() & 1), jumping: !!(rnd() & 1), clipping: !!(rnd() & 1), displayWait: !!(rnd() & 1) },
    memory, V: bytes(16), I: (rnd() << 8) | rnd(), pc: ((rnd() << 8) | rnd()) & (size - 1),
    stack: Uint16Array.from({ length: 16 }, () => (rnd() << 8) | rnd()), sp: rnd() % 17,
    delayTimer: rnd(), soundTimer: rnd(),
    hires, displayWidth: hires ? 128 : 64, displayHeight: hires ? 64 : 32, display,
    planes: level === 2 ? rnd() % 4 : 1, flags: bytes(16), audioPattern: bytes(16), audioPatternSet: !!(rnd() & 1), pitch: rnd(),
    waitingForKey: !!(rnd() & 1), waitReg: rnd() % 16, waitKey: (rnd() % 17) - 1,
    halted: !!(rnd() & 1), exited: false, error: errorInfo ? 'Un error con «comillas», "dobles" y\nsalto de línea' : null, errorInfo,
    hinted: !!(rnd() & 1),
  };
}

describe('encodeState y decodeState', () => {
  it('ida y vuelta exacta de todos los campos', () => {
    for (const [name, state] of sampleStates()) {
      const text = encodeState(state);
      const back = decodeState(text);
      assert.deepEqual(back, state, name);
      assert.deepEqual(Object.keys(back), STATE_KEYS, name);
      assert.equal(encodeState(back), text, name + ': el texto es estable');
      const cpu = new Chip8({ platform: 'xochip' });
      cpu.loadState(back);
      assert.deepEqual(cpu.saveState(), state, name + ': se carga');
    }
  });

  it('ida y vuelta exacta con estados al azar en las tres plataformas', () => {
    const rnd = lcg(2024);
    for (let n = 0; n < 30; n++) {
      const state = randomState(['chip8', 'schip', 'xochip'][n % 3], rnd);
      assert.deepEqual(decodeState(encodeState(state)), state, `estado ${n}`);
    }
  });

  it('memorias extremas: todo en cero, nada en cero y rachas en los bordes de la base 128', () => {
    const base = new Chip8({ platform: 'xochip' }).saveState();
    const fills = [
      () => {},
      (m) => m.fill(0xFF),
      (m) => { for (let i = 0; i < m.length; i += 2) m[i] = 1; },
      (m) => { m[0] = 1; m[m.length - 1] = 2; },
      (m) => { let i = 1; for (const run of [1, 127, 128, 129, 16383, 16384, 16385]) { i += run; m[i++] = 7; } },
    ];
    for (const fill of fills) {
      const state = structuredClone(base);
      state.memory.fill(0);
      fill(state.memory);
      assert.deepEqual(decodeState(encodeState(state)).memory, state.memory);
    }
    const empty = structuredClone(base);
    empty.memory.fill(0);
    empty.display.fill(0);
    const json = JSON.parse(encodeState(empty));
    assert.equal(json.memory, b64([0x00, 0x80, 0x80, 0x04]), '65536 ceros = 0 y 65536 en base 128');
    assert.equal(json.display, b64([0x00, 0x80, 0x10]), '2048 ceros');
  });

  it('el formato: JSON compacto con format, version, base64 y la compresión documentada', () => {
    const state = new Chip8().saveState();
    state.memory.fill(0);
    state.memory[0x200] = 7;
    state.memory[0x204] = 9;
    state.stack[0] = 0x0ABC;
    state.stack[15] = 0xF00D;
    state.V[0xF] = 0x80;
    state.display[0] = 1;
    state.display[2047] = 1;
    const text = encodeState(state);
    assert.ok(!text.includes('\n'));
    assert.equal(JSON.stringify(JSON.parse(text)), text, 'sin espacios de más');
    const json = JSON.parse(text);
    assert.deepEqual(Object.keys(json).slice(0, 3), ['format', 'version', 'platform']);
    assert.equal(json.format, 'chip8-state');
    assert.equal(json.version, 1);
    assert.deepEqual(json.quirks, QUIRK_PRESETS.vip.quirks);
    assert.equal(json.V, b64([...new Array(15).fill(0), 0x80]));
    assert.equal(json.stack, b64([0x0A, 0xBC, ...new Array(28).fill(0), 0xF0, 0x0D]));
    // 512 ceros, 7, 3 ceros, 9 y 3579 ceros: 512 = [0x80, 0x04] y 3579 = [0xFB, 0x1B] en base 128.
    assert.equal(json.memory, b64([0x00, 0x80, 0x04, 0x07, 0x00, 0x03, 0x09, 0x00, 0xFB, 0x1B]));
    assert.equal(json.display, b64([0x01, 0x00, 0xFE, 0x0F, 0x01])); // 1, 2046 ceros, 1
    assert.equal(json.error, null);
    assert.equal(json.errorInfo, null);
  });

  it('tamaños: un estado típico de CHIP-8 ocupa menos de 6 KB de texto', (t) => {
    const sizes = [];
    for (const demo of loadDemos().filter((d) => !d.platform)) {
      const cpu = machine(hexToBytes(demo.hex), { random: lcg(6) });
      for (let f = 0; f < 120; f++) cpu.runFrame(15);
      const text = encodeState(cpu.saveState());
      sizes.push(`${demo.id} ${text.length}`);
      assert.ok(text.length < 6 * 1024, `${demo.id}: ${text.length} caracteres`);
    }
    const contador = encodeState(sampleStates()[0][1]);
    sizes.push(`contador ${contador.length}`);
    assert.ok(contador.length < 6 * 1024);
    t.diagnostic('CHIP-8, caracteres por estado: ' + sizes.join(', '));
  });

  it('tamaños: un estado de XO-CHIP con la memoria casi vacía ocupa menos de 20 KB (lejos de 87 KB)', (t) => {
    const sizes = [];
    const demo = loadDemos().find((d) => d.platform === 'xochip');
    const cpu = machine(hexToBytes(demo.hex), { platform: 'xochip' });
    for (let f = 0; f < 120; f++) cpu.runFrame(200);
    const planos = machine(planosRom(), { platform: 'xochip' });
    for (let f = 0; f < 120; f++) planos.runFrame(50);
    for (const [name, state] of [[demo.id, cpu.saveState()], ['planos (datos en 0x2000 y 0xF000)', planos.saveState()]]) {
      const text = encodeState(state);
      sizes.push(`${name} ${text.length}`);
      assert.ok(text.length < 20 * 1024, `${name}: ${text.length} caracteres`);
    }
    t.diagnostic('XO-CHIP, caracteres por estado: ' + sizes.join(', ') + ' (la memoria sola en base64 serían 87.384)');
  });

  describe('decodeState valida todo', () => {
    const chip8Text = encodeState(sampleStates()[0][1]);
    const schipText = encodeState(new Chip8({ platform: 'schip' }).saveState());
    // El texto con un cambio en el JSON.
    const edit = (text, change) => {
      const json = JSON.parse(text);
      change(json);
      return JSON.stringify(json);
    };

    it('lo que no es un texto, o no es JSON, o no es un objeto', () => {
      assertInvalid(() => decodeState(42), /^Estado inválido: se esperaba un texto \(es 42\)\.$/);
      assertInvalid(() => decodeState(null), /se esperaba un texto \(es null\)/);
      assertInvalid(() => decodeState({ format: 'chip8-state' }), /se esperaba un texto \(es un objeto\)/);
      for (const bad of ['', '{', 'hola', '{"format":"chip8-state",}', chip8Text.slice(0, -1)]) {
        assertInvalid(() => decodeState(bad), /^Estado inválido: el texto no es JSON válido\.$/);
      }
      assertInvalid(() => decodeState('[1,2]'), /^Estado inválido: el JSON tiene que ser un objeto \(es una lista\)\.$/);
      assertInvalid(() => decodeState('null'), /el JSON tiene que ser un objeto \(es null\)/);
      assertInvalid(() => decodeState('"texto"'), /el JSON tiene que ser un objeto \(es "texto"\)/);
    });

    it('format, version y platform', () => {
      assertInvalid(() => decodeState('{}'), /^Estado inválido: falta el campo format: no es un estado guardado de esta consola\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.format = 'otra-cosa'; })), /format tiene que ser "chip8-state" \(es "otra-cosa"\)/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.version = 2; })), /^Estado inválido: versión desconocida: 2 /);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.platform = 'chip9'; })), /^Estado inválido: plataforma desconocida: "chip9"/);
    });

    it('cada campo que falta', () => {
      const keys = Object.keys(JSON.parse(chip8Text)).filter((k) => k !== 'format');
      assert.equal(keys.length, STATE_KEYS.length);
      for (const key of keys) {
        assertInvalid(() => decodeState(edit(chip8Text, (j) => { delete j[key]; })), new RegExp('^Estado inválido: falta el campo ' + key + '\\.$'));
      }
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { delete j.quirks.jumping; })), /falta el campo quirks\.jumping\./);
    });

    it('base64 inválido', () => {
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.V = 'AAAA*AAAAAAAAAAAAAAAAAA='; })), /^Estado inválido: V no es base64 válido: tiene «\*» en la posición 4\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = 'abc'; })), /^Estado inválido: memory no es base64 válido: tiene 3 caracteres y el largo tiene que ser múltiplo de 4\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.display = 'A==='; })), /display no es base64 válido: tiene «=» en la posición 1\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.stack = 'AA=A' + j.stack.slice(4); })), /stack no es base64 válido: tiene «=» en la posición 2\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.flags = 'AAAAAAAAAAAAAAAAAAAAñ==='; })), /flags no es base64 válido: tiene «ñ» en la posición 20\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.audioPattern = 16; })), /audioPattern tiene que ser un texto en base64 \(es 16\)/);
    });

    it('largos que no corresponden', () => {
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.V = b64(new Array(15).fill(1)); })), /^Estado inválido: V tiene 15 bytes y tiene que tener 16\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.stack = b64(new Array(30).fill(0)); })), /stack tiene 30 bytes y tiene que tener 32\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.flags = ''; })), /flags tiene 0 bytes y tiene que tener 16\./);
      // 4095 ceros: [0, 0xFF, 0x1F]; 4097: [0, 0x81, 0x20]; 4096 ceros y un 5 de más.
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([0, 0xFF, 0x1F]); })), /^Estado inválido: memory descomprimida tiene 4095 bytes y tiene que tener 4096\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([0, 0x81, 0x20]); })), /^Estado inválido: memory descomprimida pasa de los 4096 bytes que tiene que tener\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([0, 0x80, 0x20, 5]); })), /memory descomprimida pasa de los 4096 bytes/);
      // Con hires = true la pantalla tiene que tener 8192 píxeles.
      assertInvalid(() => decodeState(edit(schipText, (j) => { j.hires = true; j.displayWidth = 128; j.displayHeight = 64; })), /display descomprimida tiene 2048 bytes y tiene que tener 8192\./);
      assertInvalid(() => decodeState(edit(schipText, (j) => { j.memory = b64([0, 0x80, 0x80, 0x04]); })), /memory descomprimida pasa de los 4096 bytes/);
    });

    it('compresión cortada o mal escrita', () => {
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([7, 0]); })), /^Estado inválido: memory: la compresión termina en medio de una racha de ceros\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([0, 0x80]); })), /memory: la compresión termina en medio de una racha de ceros\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.display = b64([0, 0]); })), /^Estado inválido: display: una racha de ceros tiene largo 0\.$/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.memory = b64([0, 0x80, 0x80, 0x80, 0x80, 0x01]); })), /memory: una racha de ceros tiene un largo de más de 4 bytes\./);
    });

    it('valores fuera de rango después de decodificar', () => {
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.pc = 5000; })), /pc tiene que ser un entero de 0x000 a 0xFFF \(es 5000\)/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.sp = -1; })), /sp tiene que ser un entero de 0 a 16 \(es -1\)/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.display = b64([2, 0, 0xFF, 0x0F]); })), /el píxel \(0, 0\) de display vale 2 y en CHIP-8 tiene que ser de 0 a 1\./);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.hires = true; j.displayWidth = 128; j.displayHeight = 64; j.display = b64([0, 0x80, 0x40]); })), /hires tiene que ser false en CHIP-8/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.quirks = 5; })), /quirks tiene que ser un objeto \(es 5\)/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.errorInfo = { kind: 'raro', opcode: 1, addr: 2 }; })), /errorInfo\.kind desconocido: "raro"/);
      assertInvalid(() => decodeState(edit(chip8Text, (j) => { j.halted = 'true'; })), /halted tiene que ser true o false \(es "true"\)/);
    });

    it('ignora los campos que no conoce y descarta los de más en quirks y errorInfo', () => {
      const state = sampleStates()[4][1]; // error de plataforma
      const text = edit(encodeState(state), (j) => {
        j.comentario = 'guardado a mano';
        j.quirks.otro = true;
        j.errorInfo.extra = 1;
      });
      assert.deepEqual(decodeState(text), state);
    });

    it('con el texto cambiado al azar, o devuelve un estado que se carga o lanza «Estado inválido»', () => {
      const rnd = lcg(31337);
      const alphabet = 'AZaz09+/={}[]":,.-0123456789truefalsn ';
      let decoded = 0;
      for (let n = 0; n < 400; n++) {
        const chars = chip8Text.split('');
        for (let k = 1 + (rnd() % 3); k > 0; k--) chars[(rnd() << 8 | rnd()) % chars.length] = alphabet[rnd() % alphabet.length];
        const text = chars.join('');
        let state = null;
        try {
          state = decodeState(text);
        } catch (err) {
          assert.ok(err instanceof Error);
          assert.match(err.message, /^Estado inválido: /, text);
        }
        if (state) {
          decoded++;
          new Chip8().loadState(state);
        }
      }
      assert.ok(decoded > 0 && decoded < 400);
    });
  });
});

// ---------------------------------------------------------------- RewindBuffer

// Cuántas páginas de 256 bytes son distintas entre dos memorias del mismo tamaño.
function changedPages(a, b) {
  let pages = 0;
  for (let base = 0; base < a.length; base += 256) {
    for (let i = base; i < base + 256; i++) {
      if (a[i] !== b[i]) {
        pages++;
        break;
      }
    }
  }
  return pages;
}

describe('RewindBuffer', () => {
  it('arranca vacío, con los límites por defecto: pop y peek devuelven null', () => {
    const rb = new RewindBuffer();
    assert.equal(rb.maxEntries, 600);
    assert.equal(rb.maxBytes, 32 * 1024 * 1024);
    assert.equal(rb.length, 0);
    assert.equal(rb.bytes, 0);
    assert.equal(rb.pop(), null);
    assert.equal(rb.peek(), null);
    const custom = new RewindBuffer({ maxEntries: 10, maxBytes: 5000 });
    assert.deepEqual([custom.maxEntries, custom.maxBytes], [10, 5000]);
  });

  it('opciones inválidas lanzan RangeError', () => {
    for (const maxEntries of [0, -1, 1.5, NaN, '5']) {
      assert.throws(() => new RewindBuffer({ maxEntries }), (err) => err instanceof RangeError && /^maxEntries tiene que ser un entero mayor que 0/.test(err.message));
    }
    for (const maxBytes of [0, -5, NaN, '1000']) {
      assert.throws(() => new RewindBuffer({ maxBytes }), (err) => err instanceof RangeError && /^maxBytes tiene que ser un número mayor que 0/.test(err.message));
    }
  });

  it('pop devuelve las fotos de la más nueva a la más vieja', () => {
    const cpu = new Chip8();
    const rb = new RewindBuffer();
    for (let i = 0; i < 5; i++) {
      cpu.V[0] = i;
      rb.push(cpu);
    }
    assert.equal(rb.length, 5);
    assert.deepEqual([1, 2, 3, 4, 5].map(() => rb.pop().V[0]), [4, 3, 2, 1, 0]);
    assert.equal(rb.length, 0);
    assert.equal(rb.pop(), null);
    assert.equal(rb.bytes, 0);
  });

  it('cargar los pop sucesivos recorre hacia atrás exactamente los estados guardados', () => {
    for (const [cpu, ipf] of [
      [machine(build(CONTADOR).bytes, { random: lcg(10) }), 15],
      [machine(build(SUPER).bytes, { platform: 'schip' }), 30],
      [machine(planosRom(), { platform: 'xochip' }), 50],
    ]) {
      const rb = new RewindBuffer();
      const states = [];
      for (let f = 0; f < 100; f++) {
        cpu.runFrame(ipf);
        rb.push(cpu);
        states.push(cpu.saveState());
      }
      for (let f = 99; f >= 0; f--) {
        const state = rb.pop();
        assert.deepEqual(state, states[f], `${cpu.platform}, frame ${f}`);
        cpu.loadState(state);
        assert.deepEqual(cpu.saveState(), states[f]);
        if (f % 10 === 5 && cpu.platform !== 'chip8') { // y desde ahí vuelve a andar igual (sin RND)
          cpu.runFrame(ipf);
          assert.deepEqual(cpu.saveState(), states[f + 1], `${cpu.platform}: un frame después de ${f}`);
          cpu.loadState(state);
        }
      }
      assert.equal(rb.pop(), null);
      assert.equal(rb.bytes, 0);
    }
  });

  it('peek devuelve la más reciente sin sacarla, con arreglos propios', () => {
    const cpu = machine(build(PLANOS, 'xochip').bytes, { platform: 'xochip' });
    const rb = new RewindBuffer();
    cpu.runFrame(50);
    rb.push(cpu);
    const expected = cpu.saveState();
    const peeked = rb.peek();
    assert.deepEqual(peeked, expected);
    assert.equal(rb.length, 1);
    peeked.memory.fill(0x55);
    peeked.display.fill(3);
    peeked.V.fill(9);
    assert.deepEqual(rb.peek(), expected, 'cambiar lo que devolvió peek no cambia la foto');
    assert.deepEqual(rb.pop(), expected);
  });

  it('páginas compartidas: bytes crece solo por las páginas que cambiaron', () => {
    for (const platform of ['chip8', 'xochip']) {
      const cpu = new Chip8({ platform });
      const pages = cpu.memory.length / 256;
      const rb = new RewindBuffer();
      rb.push(cpu);
      const first = rb.bytes;
      rb.push(cpu);
      const fixed = rb.bytes - first; // una foto sin cambios en la memoria
      assert.equal(fixed, cpu.display.length + 80 + pages * 8, 'pantalla, campos chicos y tabla de páginas');
      assert.equal(first, fixed + pages * 256, 'la primera foto guarda todas las páginas');
      const pushAfter = (change, newPages) => {
        const before = rb.bytes;
        change();
        rb.push(cpu);
        assert.equal(rb.bytes - before, fixed + newPages * 256, `${platform}: ${newPages} páginas nuevas`);
      };
      pushAfter(() => { cpu.memory[0x300] ^= 1; }, 1);
      pushAfter(() => { cpu.memory[0x300] ^= 1; cpu.memory[0x3FF] ^= 0x80; }, 1); // la misma página
      pushAfter(() => { cpu.memory[0x000] = 9; cpu.memory[0x4A0] = 9; cpu.memory[cpu.memory.length - 1] = 9; }, 3);
      pushAfter(() => {}, 0);
      pushAfter(() => { cpu.display.fill(1); cpu.V.fill(7); cpu.delayTimer = 9; }, 0); // fuera de la memoria
      pushAfter(() => { cpu.memory.fill(0xEE); }, pages);
      assert.equal(rb.length, 8);
    }
  });

  it('al descartar la foto más vieja, sus páginas que siguen en uso pasan a contarse en la siguiente', () => {
    const cpu = new Chip8();
    const rb = new RewindBuffer({ maxEntries: 2 });
    rb.push(cpu); // A: 16 páginas nuevas
    rb.push(cpu); // B: comparte todo con A
    const two = rb.bytes;
    rb.push(cpu); // C: se descarta A, pero sus 16 páginas siguen en uso (en B y C)
    assert.equal(rb.length, 2);
    assert.equal(rb.bytes, two);
    cpu.memory[0x500] = 1;
    rb.push(cpu); // D: una página nueva; se descarta B y C se queda con las 16
    assert.equal(rb.bytes, two + 256);
    rb.pop();
    rb.pop();
    assert.equal(rb.bytes, 0);
  });

  it('maxEntries descarta las más viejas y bytes sigue la cuenta exacta', () => {
    const cpu = new Chip8({ platform: 'xochip' });
    const max = 7;
    const rb = new RewindBuffer({ maxEntries: max });
    const fixed = cpu.display.length + 80 + 256 * 8;
    const kept = []; // [memoria, páginas que cambiaron respecto de la anterior]
    const rnd = lcg(12);
    for (let i = 0; i < 300; i++) {
      cpu.V[0] = i & 0xFF;
      cpu.V[1] = i >> 8;
      for (let c = rnd() % 4; c > 0; c--) cpu.memory[(rnd() << 8) | rnd()] = rnd();
      rb.push(cpu);
      const memory = cpu.memory.slice();
      kept.push([memory, kept.length ? changedPages(kept[kept.length - 1][0], memory) : 256]);
      if (kept.length > max) kept.shift();
      // La más vieja que queda cuenta todas sus páginas; cada una de las otras, las que cambiaron.
      const expected = kept.length * fixed + 256 * 256 + kept.slice(1).reduce((sum, [, changed]) => sum + changed * 256, 0);
      assert.equal(rb.length, Math.min(i + 1, max));
      assert.equal(rb.bytes, expected, `push ${i}`);
    }
    for (let i = 299; i > 299 - max; i--) {
      const state = rb.pop();
      assert.equal(state.V[0] | (state.V[1] << 8), i);
      assert.deepEqual(state.memory, kept.pop()[0]);
    }
    assert.equal(rb.pop(), null);
    assert.equal(rb.bytes, 0);
  });

  it('maxBytes descarta las más viejas, y siempre queda la última', () => {
    const cpu = new Chip8();
    const probe = new RewindBuffer();
    probe.push(cpu);
    const full = probe.bytes;
    probe.push(cpu);
    const fixed = probe.bytes - full;
    const rb = new RewindBuffer({ maxBytes: full + 3 * fixed });
    for (let i = 0; i < 10; i++) {
      cpu.V[0] = i;
      rb.push(cpu);
      assert.ok(rb.bytes <= rb.maxBytes);
    }
    assert.equal(rb.length, 4);
    assert.equal(rb.bytes, full + 3 * fixed);
    assert.deepEqual([1, 2, 3, 4].map(() => rb.pop().V[0]), [9, 8, 7, 6]);
    assert.equal(rb.pop(), null);

    const tiny = new RewindBuffer({ maxBytes: 1 });
    tiny.push(cpu);
    assert.equal(tiny.length, 1, 'una foto más grande que maxBytes igual queda');
    tiny.push(cpu);
    assert.equal(tiny.length, 1);
    assert.equal(tiny.bytes, full, 'la que queda se quedó con todas las páginas');
  });

  it('clear() lo vacía y la foto siguiente vuelve a guardar todas las páginas', () => {
    const cpu = new Chip8();
    const rb = new RewindBuffer();
    rb.push(cpu);
    const first = rb.bytes;
    rb.push(cpu);
    rb.clear();
    assert.equal(rb.length, 0);
    assert.equal(rb.bytes, 0);
    assert.equal(rb.pop(), null);
    rb.push(cpu);
    assert.equal(rb.bytes, first);
  });

  it('cambiar de plataforma o de resolución entre fotos no rompe nada', () => {
    const cpu = new Chip8({ platform: 'schip' });
    cpu.loadRom([0x00, 0xFF, 0x12, 0x02]); // HIGH y un salto a sí mismo
    const rb = new RewindBuffer();
    const states = [];
    const snap = () => {
      rb.push(cpu);
      states.push(cpu.saveState());
    };
    snap();
    cpu.step(); // alta resolución
    snap();
    cpu.setPlatform('xochip'); // 64 KB: no comparte páginas con la anterior
    const before = rb.bytes;
    snap();
    assert.equal(rb.bytes - before, 65536 + 2048 + 80 + 256 * 8);
    cpu.setPlatform('chip8');
    snap();
    for (let i = states.length - 1; i >= 0; i--) {
      const state = rb.pop();
      assert.deepEqual(state, states[i]);
      cpu.loadState(state);
    }
    assert.equal(cpu.platform, 'schip');
  });

  it('push y pop intercalados (rebobinar y volver a jugar) devuelven siempre el estado correcto', () => {
    const cpu = machine(planosRom(), { platform: 'xochip' });
    const max = 40;
    const rb = new RewindBuffer({ maxEntries: max });
    const expected = []; // lo que tendría que haber en el buffer, de la más vieja a la más nueva
    const rnd = lcg(77);
    for (let i = 0; i < 800; i++) {
      if (rnd() % 10 < 6 || expected.length === 0) {
        cpu.runFrame(50);
        if (rnd() % 4 === 0) cpu.memory[0x3000 + (((rnd() << 8) | rnd()) % 0xC000)] ^= 0x5A;
        rb.push(cpu);
        expected.push(cpu.saveState());
        if (expected.length > max) expected.shift();
      } else {
        const state = rb.pop();
        assert.deepEqual(state, expected.pop(), `paso ${i}`);
        cpu.loadState(state);
      }
      assert.equal(rb.length, expected.length);
    }
    while (rb.length) assert.deepEqual(rb.pop(), expected.pop());
    assert.equal(rb.bytes, 0);
  });

  it('rendimiento: 10.000 push de una máquina CHIP-8 y de una XO-CHIP', (t) => {
    const report = [];
    const time = (fn) => {
      const t0 = process.hrtime.bigint();
      fn();
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    for (const [name, cpu, ipf] of [
      ['CHIP-8', machine(build(CONTADOR).bytes, { random: lcg(1) }), 15],
      ['XO-CHIP', machine(planosRom(), { platform: 'xochip' }), 50],
    ]) {
      const rb = new RewindBuffer();
      let ms = 0;
      for (let i = 0; i < 10000; i++) {
        cpu.runFrame(ipf);
        ms += time(() => rb.push(cpu));
      }
      let back = 0;
      for (let i = 0; i < 600; i++) back += time(() => cpu.loadState(rb.pop()));
      report.push(`${name}: 10.000 push en ${ms.toFixed(1)} ms (${(ms / 10).toFixed(2)} µs cada uno), ` +
        `600 pop + loadState en ${back.toFixed(1)} ms`);
      assert.ok(ms < 10000, `${name}: ${ms} ms`);
    }
    // El peor caso: XO-CHIP con las 256 páginas distintas en cada foto.
    const cpu = new Chip8({ platform: 'xochip' });
    const rb = new RewindBuffer();
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      for (let a = 0; a < 65536; a += 256) cpu.memory[a] = i;
      worst += time(() => rb.push(cpu));
    }
    report.push(`XO-CHIP con toda la memoria cambiada: 2.000 push en ${worst.toFixed(1)} ms (${(worst / 2).toFixed(1)} µs cada uno), ` +
      `quedan ${rb.length} fotos en ${(rb.bytes / 1048576).toFixed(1)} MB`);
    assert.ok(rb.bytes <= rb.maxBytes);
    assert.ok(worst < 20000);
    t.diagnostic(report.join('; '));
  });
});
