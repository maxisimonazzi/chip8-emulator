'use strict';
// Quirks: cada uno encendido vs apagado, presets y reglas de copia/merge.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, pixel } = require('./harness');

const { Chip8, QUIRK_PRESETS, DEFAULT_QUIRKS } = loadCore();

const VIP = { vfReset: true, memory: true, shifting: false, jumping: false, clipping: true, displayWait: true };
const SCHIP = { vfReset: false, memory: false, shifting: true, jumping: true, clipping: true, displayWait: false };
const XOCHIP = { vfReset: false, memory: true, shifting: false, jumping: false, clipping: false, displayWait: false };
const QUIRK_NAMES = ['vfReset', 'memory', 'shifting', 'jumping', 'clipping', 'displayWait'];

function snapshotPresets() {
  return JSON.parse(JSON.stringify({ presets: QUIRK_PRESETS, defaults: DEFAULT_QUIRKS }));
}

describe('presets', () => {
  it('existen vip, schip y xochip con sus etiquetas', () => {
    assert.equal(QUIRK_PRESETS.vip.label, 'COSMAC VIP');
    assert.equal(QUIRK_PRESETS.schip.label, 'SUPER-CHIP');
    assert.equal(QUIRK_PRESETS.xochip.label, 'XO-CHIP');
  });

  it('valores exactos de cada preset', () => {
    assert.deepEqual({ ...QUIRK_PRESETS.vip.quirks }, VIP);
    assert.deepEqual({ ...QUIRK_PRESETS.schip.quirks }, SCHIP);
    assert.deepEqual({ ...QUIRK_PRESETS.xochip.quirks }, XOCHIP);
  });

  it('DEFAULT_QUIRKS es una copia del preset VIP', () => {
    assert.deepEqual({ ...DEFAULT_QUIRKS }, VIP);
    assert.notEqual(DEFAULT_QUIRKS, QUIRK_PRESETS.vip.quirks);
  });

  it('un Chip8 nuevo usa los quirks del VIP', () => {
    const cpu = new Chip8();
    for (const name of QUIRK_NAMES) assert.equal(cpu.quirks[name], VIP[name], name);
  });
});

describe('aislamiento de los quirks', () => {
  it('mutar cpu.quirks no muta los presets ni DEFAULT_QUIRKS', () => {
    const snap = snapshotPresets();
    const cpu = new Chip8();
    for (const name of QUIRK_NAMES) cpu.quirks[name] = !cpu.quirks[name];
    assert.deepEqual(snapshotPresets(), snap);
  });

  it('setQuirks no muta los presets', () => {
    const snap = snapshotPresets();
    const cpu = new Chip8();
    cpu.setQuirks({ vfReset: false, clipping: false, jumping: true });
    assert.deepEqual(snapshotPresets(), snap);
  });

  it('construir con un preset y mutarlo no muta el preset', () => {
    const snap = snapshotPresets();
    const cpu = new Chip8({ quirks: QUIRK_PRESETS.schip.quirks });
    for (const name of QUIRK_NAMES) assert.equal(cpu.quirks[name], SCHIP[name], name);
    cpu.quirks.shifting = false;
    cpu.setQuirks({ memory: true });
    assert.deepEqual(snapshotPresets(), snap);
  });

  it('dos cpus no comparten el objeto de quirks', () => {
    const a = new Chip8();
    const b = new Chip8();
    a.quirks.vfReset = false;
    assert.equal(b.quirks.vfReset, true);
  });

  it('el objeto options.quirks pasado al constructor no se modifica', () => {
    const opts = { shifting: true };
    const cpu = new Chip8({ quirks: opts });
    cpu.setQuirks({ shifting: false, memory: false });
    assert.deepEqual(opts, { shifting: true });
  });
});

describe('merge de quirks', () => {
  it('options.quirks parcial se mezcla sobre los valores del VIP', () => {
    const cpu = new Chip8({ quirks: { shifting: true, clipping: false } });
    for (const name of QUIRK_NAMES) {
      const expected = name === 'shifting' ? true : name === 'clipping' ? false : VIP[name];
      assert.equal(cpu.quirks[name], expected, name);
    }
  });

  it('setQuirks mezcla y conserva el resto', () => {
    const cpu = new Chip8();
    cpu.setQuirks({ jumping: true });
    for (const name of QUIRK_NAMES) assert.equal(cpu.quirks[name], name === 'jumping' ? true : VIP[name], name);
    cpu.setQuirks({ memory: false });
    assert.equal(cpu.quirks.jumping, true);
    assert.equal(cpu.quirks.memory, false);
    assert.equal(cpu.quirks.vfReset, true);
  });

  it('setQuirks con un preset completo lo aplica entero', () => {
    const cpu = new Chip8();
    cpu.setQuirks(QUIRK_PRESETS.xochip.quirks);
    for (const name of QUIRK_NAMES) assert.equal(cpu.quirks[name], XOCHIP[name], name);
  });

  it('reset y loadRom conservan los quirks', () => {
    const cpu = new Chip8({ quirks: { shifting: true } });
    cpu.setQuirks({ clipping: false });
    cpu.reset();
    cpu.loadRom([0x00, 0xE0]);
    assert.equal(cpu.quirks.shifting, true);
    assert.equal(cpu.quirks.clipping, false);
    assert.equal(cpu.quirks.vfReset, true);
  });
});

describe('quirk vfReset', () => {
  for (const [op, name] of [[1, 'OR'], [2, 'AND'], [3, 'XOR']]) {
    it(`8XY${op} ${name}: on -> VF = 0, off -> VF intacto`, () => {
      for (const on of [true, false]) {
        const cpu = makeCpu([0x8120 | op], { quirks: { vfReset: on } });
        cpu.V[1] = 0x3C;
        cpu.V[2] = 0x0F;
        cpu.V[0xF] = 0x55;
        cpu.step();
        assert.equal(cpu.V[0xF], on ? 0 : 0x55, `vfReset=${on}`);
      }
    });
  }

  it('no afecta a 8XY0', () => {
    const cpu = makeCpu([0x8120], { quirks: { vfReset: true } });
    cpu.V[0xF] = 0x55;
    cpu.step();
    assert.equal(cpu.V[0xF], 0x55);
  });
});

describe('quirk memory', () => {
  for (const [opcode, label] of [[0xF255, 'FX55'], [0xF265, 'FX65']]) {
    it(`${label}: on -> I += X + 1, off -> I intacto`, () => {
      for (const on of [true, false]) {
        const cpu = makeCpu([opcode], { quirks: { memory: on } });
        cpu.I = 0x300;
        cpu.step();
        assert.equal(cpu.I, on ? 0x303 : 0x300, `memory=${on}`);
      }
    });
  }

  it('un bucle de dos FX55 escribe en lugares distintos solo con memory on', () => {
    // LD I,0x400 | LD V0,0xAA | LD [I],V0 | LD V0,0xBB | LD [I],V0
    const prog = [0xA400, 0x60AA, 0xF055, 0x60BB, 0xF055];
    const on = makeCpu(prog, { quirks: { memory: true } });
    runSteps(on, 5);
    assert.deepEqual([on.memory[0x400], on.memory[0x401]], [0xAA, 0xBB]);
    const off = makeCpu(prog, { quirks: { memory: false } });
    runSteps(off, 5);
    assert.deepEqual([off.memory[0x400], off.memory[0x401]], [0xBB, 0x00]);
  });
});

describe('quirk shifting', () => {
  it('8XY6: off usa VY, on usa VX', () => {
    const off = makeCpu([0x8126], { quirks: { shifting: false } });
    off.V[1] = 0x10;
    off.V[2] = 0x03;
    off.step();
    assert.equal(off.V[1], 0x01);
    assert.equal(off.V[0xF], 1);

    const on = makeCpu([0x8126], { quirks: { shifting: true } });
    on.V[1] = 0x10;
    on.V[2] = 0x03;
    on.step();
    assert.equal(on.V[1], 0x08);
    assert.equal(on.V[0xF], 0);
  });

  it('8XYE: off usa VY, on usa VX', () => {
    const off = makeCpu([0x812E], { quirks: { shifting: false } });
    off.V[1] = 0x01;
    off.V[2] = 0x80;
    off.step();
    assert.equal(off.V[1], 0x00);
    assert.equal(off.V[0xF], 1);

    const on = makeCpu([0x812E], { quirks: { shifting: true } });
    on.V[1] = 0x01;
    on.V[2] = 0x80;
    on.step();
    assert.equal(on.V[1], 0x02);
    assert.equal(on.V[0xF], 0);
  });
});

describe('quirk jumping', () => {
  it('BNNN: off usa V0, on usa VX (X = nibble alto)', () => {
    for (const on of [false, true]) {
      const cpu = makeCpu([0xB312], { quirks: { jumping: on } });
      cpu.V[0] = 0x01;
      cpu.V[3] = 0x20;
      cpu.step();
      assert.equal(cpu.pc, on ? 0x332 : 0x313, `jumping=${on}`);
    }
  });
});

describe('quirk clipping', () => {
  it('borde derecho: on recorta, off envuelve', () => {
    for (const on of [true, false]) {
      const cpu = makeCpu([0xD011], { quirks: { clipping: on } });
      cpu.I = 0x300;
      cpu.memory[0x300] = 0xFF;
      cpu.V[0] = 60;
      cpu.V[1] = 4;
      cpu.step();
      for (let x = 60; x < 64; x++) assert.equal(pixel(cpu, x, 4), 1);
      for (let x = 0; x < 4; x++) assert.equal(pixel(cpu, x, 4), on ? 0 : 1, `x=${x} clipping=${on}`);
      assert.equal(cpu.display.reduce((a, b) => a + b, 0), on ? 4 : 8);
    }
  });
});

describe('quirk displayWait', () => {
  // LD I,0x050 | DRW V0,V1,5 | ADD V1,1 | DRW V0,V1,5 | ADD V2,1 | JP 0x208
  const prog = [0xA050, 0xD015, 0x7101, 0xD015, 0x7201, 0x1208];

  it('on: runFrame se detiene justo después del primer DXYN', () => {
    const cpu = makeCpu(prog, { quirks: { displayWait: true } });
    assert.equal(cpu.runFrame(100), 2);
    assert.equal(cpu.pc, 0x204);
    assert.equal(cpu.runFrame(100), 2);
    assert.equal(cpu.pc, 0x208);
    assert.equal(cpu.V[1], 1);
  });

  it('off: runFrame ejecuta ipf instrucciones completas', () => {
    const cpu = makeCpu(prog, { quirks: { displayWait: false } });
    assert.equal(cpu.runFrame(10), 10);
    assert.equal(cpu.V[1], 1);
    // 6 instrucciones iniciales + 4 del bucle (ADD V2 / JP) -> V2 = 3
    assert.equal(cpu.V[2], 3);
  });

  it('displayWait no afecta a step()', () => {
    const cpu = makeCpu(prog, { quirks: { displayWait: true } });
    runSteps(cpu, 4);
    assert.equal(cpu.pc, 0x208);
  });
});

describe('cambios de quirks en tiempo de ejecución', () => {
  it('se leen en cada instrucción', () => {
    // dos SHR V1, V2 seguidos; se cambia shifting entre uno y otro
    const cpu = makeCpu([0x8126, 0x8126]);
    cpu.V[1] = 0x40;
    cpu.V[2] = 0x08;
    cpu.step();
    assert.equal(cpu.V[1], 0x04); // off: VY >> 1
    cpu.setQuirks({ shifting: true });
    cpu.step();
    assert.equal(cpu.V[1], 0x02); // on: VX >> 1
  });

  it('asignar cpu.quirks.X directamente también tiene efecto', () => {
    const cpu = makeCpu([0x8121, 0x8121]);
    cpu.V[0xF] = 7;
    cpu.quirks.vfReset = false;
    cpu.step();
    assert.equal(cpu.V[0xF], 7);
    cpu.quirks.vfReset = true;
    cpu.step();
    assert.equal(cpu.V[0xF], 0);
  });

  it('cambiar jumping entre dos BNNN', () => {
    const cpu = makeCpu([0xB204]);
    cpu.memory[0x206] = 0xB2;
    cpu.memory[0x207] = 0x00;
    cpu.V[0] = 2;
    cpu.V[2] = 0x10;
    cpu.step(); // off -> 0x206
    assert.equal(cpu.pc, 0x206);
    cpu.setQuirks({ jumping: true });
    cpu.step(); // on -> 0x200 + V2
    assert.equal(cpu.pc, 0x210);
  });
});
