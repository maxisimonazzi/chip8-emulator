'use strict';
// Plataformas (CHIP-8, SUPER-CHIP y XO-CHIP): exportaciones, la opción platform del
// constructor, setPlatform, los límites de loadRom, los diagnósticos (hint y errores de
// plataforma), extendedInfo, el desensamblador de cada plataforma y sha1.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadCore, makeCpu, runSteps } = require('./harness');

const core = loadCore();
const {
  Chip8, PLATFORMS, PLATFORM_INFO, PRESET_PLATFORM, QUIRK_PRESETS, FONT, FONT_ADDR, BIG_FONT, BIG_FONT_ADDR,
  PROGRAM_START, disassemble, disassembleRange, extendedInfo, sha1,
} = core;

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');
const LABEL = { chip8: 'CHIP-8', schip: 'SUPER-CHIP', xochip: 'XO-CHIP' };

const EXPECTED_BIG_FONT = [
  [0x3C, 0x7E, 0xE7, 0xC3, 0xC3, 0xC3, 0xC3, 0xE7, 0x7E, 0x3C], // 0
  [0x18, 0x38, 0x58, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C], // 1
  [0x3E, 0x7F, 0xC3, 0x06, 0x0C, 0x18, 0x30, 0x60, 0xFF, 0xFF], // 2
  [0x3C, 0x7E, 0xC3, 0x03, 0x0E, 0x0E, 0x03, 0xC3, 0x7E, 0x3C], // 3
  [0x06, 0x0E, 0x1E, 0x36, 0x66, 0xC6, 0xFF, 0xFF, 0x06, 0x06], // 4
  [0xFF, 0xFF, 0xC0, 0xC0, 0xFC, 0xFE, 0x03, 0xC3, 0x7E, 0x3C], // 5
  [0x3E, 0x7C, 0xE0, 0xC0, 0xFC, 0xFE, 0xC3, 0xC3, 0x7E, 0x3C], // 6 (tercera fila E0, como en Octo y Cadmium)
  [0xFF, 0xFF, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x60, 0x60], // 7
  [0x3C, 0x7E, 0xC3, 0xC3, 0x7E, 0x7E, 0xC3, 0xC3, 0x7E, 0x3C], // 8
  [0x3C, 0x7E, 0xC3, 0xC3, 0x7F, 0x3F, 0x03, 0x03, 0x3E, 0x7C], // 9
  [0x7E, 0xFF, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0xC3, 0xC3, 0xC3], // A
  [0xFC, 0xFC, 0xC3, 0xC3, 0xFC, 0xFC, 0xC3, 0xC3, 0xFC, 0xFC], // B
  [0x3C, 0xFF, 0xC3, 0xC0, 0xC0, 0xC0, 0xC0, 0xC3, 0xFF, 0x3C], // C
  [0xFC, 0xFE, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFE, 0xFC], // D
  [0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF], // E
  [0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0], // F
];

// Las instrucciones de SUPER-CHIP y XO-CHIP: [ejemplo, needs, name, texto en su plataforma].
// Las de pantalla (lenient) se ignoran en una plataforma que no las tiene.
const NAMES = {
  scd: 'desplazar la pantalla hacia abajo',
  scu: 'desplazar la pantalla hacia arriba',
  scr: 'desplazar la pantalla a la derecha',
  scl: 'desplazar la pantalla a la izquierda',
  exit: 'terminar el programa',
  low: 'pasar a baja resolución (64×32)',
  high: 'pasar a alta resolución (128×64)',
  sprite16: 'dibujar un sprite de 16×16',
  bigFont: 'fuente grande',
  saveFlags: 'guardar registros en las banderas',
  loadFlags: 'leer registros de las banderas',
  saveRange: 'guardar un rango de registros',
  loadRange: 'leer un rango de registros',
  long: 'cargar I con una dirección de 16 bits',
  plane: 'elegir el plano de dibujo',
  audio: 'cargar el patrón de audio',
  pitch: 'cambiar el tono del audio',
};

const LENIENT = [
  [0x00C0, 'schip', NAMES.scd], [0x00C1, 'schip', NAMES.scd], [0x00C5, 'schip', NAMES.scd], [0x00CF, 'schip', NAMES.scd],
  [0x00D0, 'xochip', NAMES.scu], [0x00D3, 'xochip', NAMES.scu], [0x00DF, 'xochip', NAMES.scu],
  [0x00FB, 'schip', NAMES.scr], [0x00FC, 'schip', NAMES.scl], [0x00FD, 'schip', NAMES.exit],
  [0x00FE, 'schip', NAMES.low], [0x00FF, 'schip', NAMES.high],
  [0xD120, 'schip', NAMES.sprite16], [0xDFE0, 'schip', NAMES.sprite16],
];

// [opcode, needs, name, mnemónico (F000 seguido de 0x1234)]
const HALTING = [
  [0xF130, 'schip', NAMES.bigFont, 'LD HF, V1'], [0xFF30, 'schip', NAMES.bigFont, 'LD HF, VF'],
  [0xF075, 'schip', NAMES.saveFlags, 'LD R, V0'], [0xF775, 'schip', NAMES.saveFlags, 'LD R, V7'],
  [0xFF75, 'schip', NAMES.saveFlags, 'LD R, VF'],
  [0xF085, 'schip', NAMES.loadFlags, 'LD V0, R'], [0xFF85, 'schip', NAMES.loadFlags, 'LD VF, R'],
  [0x5122, 'xochip', NAMES.saveRange, 'SAVE V1, V2'], [0x5FA2, 'xochip', NAMES.saveRange, 'SAVE VF, VA'],
  [0x5123, 'xochip', NAMES.loadRange, 'LOAD V1, V2'], [0x5003, 'xochip', NAMES.loadRange, 'LOAD V0, V0'],
  [0xF000, 'xochip', NAMES.long, 'LD I, LONG 0x1234'],
  [0xF001, 'xochip', NAMES.plane, 'PLANE 0'], [0xF101, 'xochip', NAMES.plane, 'PLANE 1'],
  [0xF201, 'xochip', NAMES.plane, 'PLANE 2'], [0xF301, 'xochip', NAMES.plane, 'PLANE 3'],
  [0xF002, 'xochip', NAMES.audio, 'AUDIO'],
  [0xF03A, 'xochip', NAMES.pitch, 'PITCH V0'], [0xFC3A, 'xochip', NAMES.pitch, 'PITCH VC'],
];

// Referencia independiente: ¿la palabra es una instrucción de SUPER-CHIP o XO-CHIP?
// Devuelve la plataforma que hace falta o null.
function needsOf(w) {
  const x = (w >> 8) & 0xF, n = w & 0xF, nn = w & 0xFF;
  switch (w >> 12) {
    case 0x0:
      if ((w & 0xFFF0) === 0x00C0) return 'schip';
      if ((w & 0xFFF0) === 0x00D0) return 'xochip';
      return w >= 0x00FB && w <= 0x00FF ? 'schip' : null;
    case 0x5: return n === 2 || n === 3 ? 'xochip' : null;
    case 0xD: return n === 0 ? 'schip' : null;
    case 0xF:
      if (w === 0xF000 || w === 0xF002 || (nn === 0x01 && x <= 3) || nn === 0x3A) return 'xochip';
      return nn === 0x30 || nn === 0x75 || nn === 0x85 ? 'schip' : null;
    default: return null;
  }
}

// Ejecuta `op` en 0x20A (así la dirección tiene letras), con 0x1234 como palabra siguiente.
function runAt20A(op, platform) {
  const cpu = makeCpu([0x120A, 0, 0, 0, 0, op, 0x1234, 0x6001], { platform });
  cpu.step();
  return cpu;
}

describe('exportaciones de las plataformas', () => {
  it('PLATFORMS: chip8, schip y xochip, congelado', () => {
    assert.deepEqual([...PLATFORMS], ['chip8', 'schip', 'xochip']);
    assert.ok(Object.isFrozen(PLATFORMS));
    assert.throws(() => PLATFORMS.push('otra'), TypeError);
  });

  it('PLATFORM_INFO: etiqueta, memoria y ROM máxima de cada una, congelado en profundidad', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(PLATFORM_INFO)), {
      chip8: { label: 'CHIP-8', memorySize: 4096, maxRomSize: 3584 },
      schip: { label: 'SUPER-CHIP', memorySize: 4096, maxRomSize: 3584 },
      xochip: { label: 'XO-CHIP', memorySize: 65536, maxRomSize: 65024 },
    });
    assert.ok(Object.isFrozen(PLATFORM_INFO));
    for (const p of PLATFORMS) {
      assert.ok(Object.isFrozen(PLATFORM_INFO[p]), p);
      assert.equal(PLATFORM_INFO[p].maxRomSize, PLATFORM_INFO[p].memorySize - PROGRAM_START, p);
    }
    assert.throws(() => { PLATFORM_INFO.chip8.memorySize = 1; }, TypeError);
    assert.throws(() => { PLATFORM_INFO.nueva = {}; }, TypeError);
  });

  it('PRESET_PLATFORM: la plataforma de cada perfil de quirks, congelado', () => {
    assert.deepEqual({ ...PRESET_PLATFORM }, { vip: 'chip8', schip: 'schip', xochip: 'xochip' });
    assert.ok(Object.isFrozen(PRESET_PLATFORM));
    assert.deepEqual(Object.keys(PRESET_PLATFORM).sort(), Object.keys(QUIRK_PRESETS).sort());
    for (const p of Object.values(PRESET_PLATFORM)) assert.ok(PLATFORMS.includes(p), p);
  });

  it('constantes: alta resolución, fuente grande y banderas; las de antes no cambian', () => {
    assert.equal(core.HIRES_WIDTH, 128);
    assert.equal(core.HIRES_HEIGHT, 64);
    assert.equal(core.DISPLAY_WIDTH, 64);
    assert.equal(core.DISPLAY_HEIGHT, 32);
    assert.equal(BIG_FONT_ADDR, 0x0A0);
    assert.equal(BIG_FONT_ADDR, FONT_ADDR + FONT.length, 'justo después de la fuente chica');
    assert.ok(BIG_FONT_ADDR + BIG_FONT.length <= PROGRAM_START);
    assert.equal(core.FLAG_COUNT, 16);
    assert.equal(core.MEMORY_SIZE, 4096);
    assert.equal(core.MAX_ROM_SIZE, 3584);
    assert.equal(core.STACK_SIZE, 16);
  });

  it('BIG_FONT: Uint8Array de 160 bytes, 16 glifos de 8x10', () => {
    assert.ok(BIG_FONT instanceof Uint8Array);
    assert.equal(BIG_FONT.length, 160);
    assert.deepEqual(Array.from(BIG_FONT), EXPECTED_BIG_FONT.flat());
  });

  it('funciones nuevas: extendedInfo, sha1 y patternRate', () => {
    for (const name of ['extendedInfo', 'sha1', 'patternRate']) assert.equal(typeof core[name], 'function', name);
  });
});

describe('constructor: opción platform', () => {
  it('por defecto es chip8, como antes', () => {
    for (const options of [undefined, {}, { platform: undefined }, { platform: null }, { quirks: { clipping: false } }]) {
      const cpu = new Chip8(options);
      assert.equal(cpu.platform, 'chip8');
      assert.equal(cpu.memory.length, 4096);
    }
  });

  for (const platform of ['chip8', 'schip', 'xochip']) {
    it(`estado inicial en ${platform}`, () => {
      const cpu = new Chip8({ platform });
      assert.equal(cpu.platform, platform);
      assert.ok(cpu.memory instanceof Uint8Array);
      assert.equal(cpu.memory.length, PLATFORM_INFO[platform].memorySize);
      assert.equal(cpu.hires, false);
      assert.equal(cpu.displayWidth, 64);
      assert.equal(cpu.displayHeight, 32);
      assert.ok(cpu.display instanceof Uint8Array);
      assert.equal(cpu.display.length, 64 * 32);
      assert.ok(cpu.display.every((v) => v === 0));
      assert.equal(cpu.planes, 1);
      assert.ok(cpu.flags instanceof Uint8Array);
      assert.equal(cpu.flags.length, 16);
      assert.ok(cpu.flags.every((v) => v === 0));
      assert.ok(cpu.audioPattern instanceof Uint8Array);
      assert.equal(cpu.audioPattern.length, 16);
      assert.ok(cpu.audioPattern.every((v) => v === 0));
      assert.equal(cpu.audioPatternSet, false);
      assert.equal(cpu.pitch, 64);
      assert.equal(cpu.audioDirty, true);
      assert.equal(cpu.exited, false);
      assert.equal(cpu.hint, null);
      assert.equal(cpu.errorInfo, null);
      assert.equal(cpu.error, null);
      assert.equal(cpu.halted, false);
      assert.equal(cpu.pc, 0x200);
      assert.equal(cpu.displayDirty, true);
    });
  }

  it('una plataforma desconocida lanza RangeError en castellano', () => {
    for (const platform of ['chip-8', 'CHIP8', 'superchip', 'XO-CHIP', '', 0, 1, {}, true]) {
      assert.throws(() => new Chip8({ platform }), (err) => {
        assert.ok(err instanceof RangeError, String(platform));
        assert.match(err.message, /^Plataforma desconocida: .* \(tiene que ser chip8, schip o xochip\)\.$/);
        return true;
      });
    }
    assert.throws(() => new Chip8({ platform: 'xo' }), /Plataforma desconocida: "xo"/);
  });

  it('chip8: la memoria tiene solo la fuente chica (exactamente como antes)', () => {
    const cpu = new Chip8({ platform: 'chip8' });
    for (let a = 0; a < 4096; a++) {
      const want = a >= FONT_ADDR && a < FONT_ADDR + 80 ? FONT[a - FONT_ADDR] : 0;
      if (cpu.memory[a] !== want) assert.fail(`memory[0x${hex(a, 3)}] = ${cpu.memory[a]}, se esperaba ${want}`);
    }
  });

  for (const platform of ['schip', 'xochip']) {
    it(`${platform}: fuente chica en 0x050 y grande en 0x0A0; el resto en cero`, () => {
      const cpu = new Chip8({ platform });
      const size = cpu.memory.length;
      for (let a = 0; a < size; a++) {
        let want = 0;
        if (a >= FONT_ADDR && a < FONT_ADDR + 80) want = FONT[a - FONT_ADDR];
        else if (a >= BIG_FONT_ADDR && a < BIG_FONT_ADDR + 160) want = BIG_FONT[a - BIG_FONT_ADDR];
        if (cpu.memory[a] !== want) assert.fail(`memory[0x${hex(a, 4)}] = ${cpu.memory[a]}, se esperaba ${want}`);
      }
    });
  }

  it('quirks y random funcionan igual con cualquier plataforma', () => {
    for (const platform of PLATFORMS) {
      const cpu = makeCpu([0xC1FF, 0xB200], { platform, quirks: { jumping: true }, random: () => 0x5A });
      assert.equal(cpu.quirks.jumping, true);
      cpu.step();
      assert.equal(cpu.V[1], 0x5A, platform);
      cpu.V[2] = 3;
      cpu.step();
      assert.equal(cpu.pc, 0x203, platform);
    }
  });
});

describe('setPlatform', () => {
  it('cambia el tamaño de la memoria y reinicia con la misma ROM', () => {
    const cpu = makeCpu([0x6005, 0xA123, 0x1204]);
    runSteps(cpu, 3);
    cpu.setPlatform('xochip');
    assert.equal(cpu.platform, 'xochip');
    assert.equal(cpu.memory.length, 65536);
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x206)), [0x60, 0x05, 0xA1, 0x23, 0x12, 0x04]);
    assert.deepEqual(Array.from(cpu.memory.slice(BIG_FONT_ADDR, BIG_FONT_ADDR + 160)), Array.from(BIG_FONT));
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.V[0], 0);
    assert.equal(cpu.I, 0);
    cpu.setPlatform('schip');
    assert.equal(cpu.memory.length, 4096);
    assert.deepEqual(Array.from(cpu.memory.slice(BIG_FONT_ADDR, BIG_FONT_ADDR + 160)), Array.from(BIG_FONT));
    cpu.setPlatform('chip8');
    assert.equal(cpu.memory.length, 4096);
    assert.ok(cpu.memory.slice(BIG_FONT_ADDR, BIG_FONT_ADDR + 160).every((v) => v === 0), 'chip8 no tiene fuente grande');
    assert.deepEqual(Array.from(cpu.memory.slice(FONT_ADDR, FONT_ADDR + 80)), Array.from(FONT));
    runSteps(cpu, 2);
    assert.equal(cpu.V[0], 5);
    assert.equal(cpu.I, 0x123);
  });

  it('solo reemplaza la memoria si cambia de tamaño', () => {
    const cpu = new Chip8({ platform: 'schip' });
    const mem = cpu.memory;
    cpu.setPlatform('chip8');
    assert.equal(cpu.memory, mem);
    cpu.setPlatform('xochip');
    assert.notEqual(cpu.memory, mem);
  });

  it('la misma plataforma no hace nada (ni siquiera reinicia)', () => {
    const cpu = makeCpu([0x6005, 0x00FF], { platform: 'schip' });
    runSteps(cpu, 2);
    const mem = cpu.memory, display = cpu.display;
    cpu.setPlatform('schip');
    assert.equal(cpu.memory, mem);
    assert.equal(cpu.display, display);
    assert.equal(cpu.pc, 0x204);
    assert.equal(cpu.V[0], 5);
    assert.equal(cpu.hires, true);
  });

  it('reinicia como reset: baja resolución, plano 1, audio y avisos; conserva banderas, quirks y random', () => {
    const cpu = makeCpu([0x00FF, 0xF201, 0xF002, 0x6150, 0xF13A, 0x60AA, 0xF075, 0x00FB], {
      platform: 'xochip', quirks: { shifting: true }, random: () => 7,
    });
    runSteps(cpu, 7);
    cpu.memory[0x201] = 0x11; // ensucia la ROM en memoria: setPlatform la vuelve a copiar
    assert.equal(cpu.hires, true);
    assert.equal(cpu.planes, 2);
    assert.equal(cpu.pitch, 0x50);
    assert.equal(cpu.flags[0], 0xAA);
    cpu.setPlatform('schip');
    assert.equal(cpu.hires, false);
    assert.equal(cpu.displayWidth, 64);
    assert.equal(cpu.display.length, 2048);
    assert.equal(cpu.planes, 1);
    assert.equal(cpu.pitch, 64);
    assert.equal(cpu.audioPatternSet, false);
    assert.equal(cpu.audioDirty, true);
    assert.equal(cpu.memory[0x201], 0xFF, 'la ROM vuelve a estar entera');
    assert.equal(cpu.flags[0], 0xAA, 'las banderas se conservan');
    assert.equal(cpu.quirks.shifting, true);
    cpu.loadRom([0xC0, 0xFF]);
    cpu.step();
    assert.equal(cpu.V[0], 7);
  });

  it('una plataforma desconocida lanza RangeError y no cambia nada', () => {
    const cpu = makeCpu([0x6005], { platform: 'schip' });
    cpu.step();
    for (const p of ['xo-chip', 'SCHIP', undefined, null, 2]) {
      assert.throws(() => cpu.setPlatform(p), (err) => err instanceof RangeError && /^Plataforma desconocida/.test(err.message));
    }
    assert.equal(cpu.platform, 'schip');
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.V[0], 5);
  });

  it('si la ROM no entra en la plataforma nueva: RangeError que nombra los dos tamaños, y no cambia nada', () => {
    const rom = new Uint8Array(5000).fill(0x00);
    rom.set([0x60, 0x05]);
    const cpu = makeCpu(rom, { platform: 'xochip' });
    cpu.step();
    const mem = cpu.memory;
    for (const target of ['chip8', 'schip']) {
      assert.throws(() => cpu.setPlatform(target), (err) => {
        assert.ok(err instanceof RangeError);
        assert.match(err.message, /5000/);
        assert.match(err.message, /3584/);
        assert.ok(err.message.includes(LABEL[target]), err.message);
        return true;
      });
    }
    assert.equal(cpu.platform, 'xochip');
    assert.equal(cpu.memory, mem);
    assert.equal(cpu.memory.length, 65536);
    assert.equal(cpu.pc, 0x202, 'no se reinició');
    assert.equal(cpu.V[0], 5);
  });

  it('una ROM de exactamente 3584 bytes pasa de xochip a chip8', () => {
    const rom = new Uint8Array(3584);
    rom[3583] = 0x77;
    const cpu = makeCpu(rom, { platform: 'xochip' });
    cpu.setPlatform('chip8');
    assert.equal(cpu.memory[0xFFF], 0x77);
  });
});

describe('loadRom: límites y mensajes por plataforma', () => {
  for (const platform of ['chip8', 'schip']) {
    it(`${platform}: 3584 bytes entran; con más, el mensaje sugiere XO-CHIP si entra en 64 KB`, () => {
      const cpu = new Chip8({ platform });
      cpu.loadRom(new Uint8Array(3584));
      assert.throws(() => cpu.loadRom(new Uint8Array(3585)), (err) => {
        assert.ok(err instanceof RangeError);
        assert.equal(err.message, 'La ROM ocupa 3585 bytes y el máximo es 3584 (de 0x200 a 0xFFF). Con la plataforma XO-CHIP (64 KB) entra.');
        return true;
      });
      assert.throws(() => cpu.loadRom(new Uint8Array(65024)), {
        name: 'RangeError',
        message: 'La ROM ocupa 65024 bytes y el máximo es 3584 (de 0x200 a 0xFFF). Con la plataforma XO-CHIP (64 KB) entra.',
      });
      assert.throws(() => cpu.loadRom(new ArrayBuffer(65025)), {
        name: 'RangeError',
        message: 'La ROM ocupa 65025 bytes y el máximo es 3584 (de 0x200 a 0xFFF).',
      });
      assert.equal(cpu.rom.length, 3584, 'la ROM anterior sigue cargada');
    });
  }

  it('xochip: 65024 bytes entran (hasta 0xFFFF) y 65025 no', () => {
    const cpu = new Chip8({ platform: 'xochip' });
    const rom = new Uint8Array(65024);
    rom[0] = 0x12;
    rom[65023] = 0x34;
    cpu.loadRom(rom);
    assert.equal(cpu.memory[0x200], 0x12);
    assert.equal(cpu.memory[0xFFFF], 0x34);
    for (const big of [new Uint8Array(65025), new Array(65025).fill(0), new ArrayBuffer(65025)]) {
      assert.throws(() => cpu.loadRom(big), {
        name: 'RangeError',
        message: 'La ROM ocupa 65025 bytes y el máximo es 65024 (de 0x200 a 0xFFFF).',
      });
    }
    assert.equal(cpu.rom.length, 65024);
  });
});

describe('hint: instrucciones de pantalla de otra plataforma', () => {
  for (const [op, needs, name] of LENIENT) {
    it(`${hex(op, 4)} en CHIP-8 no hace nada, avisa que es de ${LABEL[needs]} y la máquina sigue`, () => {
      const cpu = makeCpu([0x120A, 0, 0, 0, 0, op, 0x6001]);
      cpu.display[0] = 1;
      cpu.display[5 * 64 + 7] = 1;
      cpu.V[1] = 3;
      cpu.V[2] = 4;
      cpu.V[0xF] = 1;
      cpu.I = 0x300;
      cpu.memory.fill(0xFF, 0x300, 0x340);
      const before = Array.from(cpu.display);
      cpu.step();
      assert.equal(cpu.step(), true);
      assert.equal(cpu.halted, false);
      assert.equal(cpu.error, null);
      assert.equal(cpu.errorInfo, null);
      assert.equal(cpu.exited, false);
      assert.equal(cpu.pc, 0x20C);
      assert.deepEqual(Array.from(cpu.display), before, 'la pantalla no cambia');
      assert.equal(cpu.displayWidth, 64);
      if ((op >> 12) === 0xD) assert.equal(cpu.V[0xF], 0, 'DXY0 deja VF = 0, como siempre');
      else assert.equal(cpu.V[0xF], 1);
      assert.deepEqual(cpu.hint, { opcode: op, addr: 0x20A, needs, name });
      cpu.step();
      assert.equal(cpu.V[0], 1);
    });
  }

  it('solo la primera queda en hint; si la interfaz lo borra, no vuelve hasta el reset', () => {
    const cpu = makeCpu([0x00FF, 0x00FE, 0xD120, 0x00C1]);
    runSteps(cpu, 2);
    assert.equal(cpu.hint.opcode, 0x00FF);
    assert.equal(cpu.hint.addr, 0x200);
    cpu.hint = null;
    runSteps(cpu, 2);
    assert.equal(cpu.hint, null);
    cpu.reset();
    assert.equal(cpu.hint, null);
    cpu.pc = 0x204;
    cpu.step();
    assert.deepEqual(cpu.hint, { opcode: 0xD120, addr: 0x204, needs: 'schip', name: NAMES.sprite16 });
  });

  it('loadRom también borra el aviso', () => {
    const cpu = makeCpu([0x00FB]);
    cpu.step();
    assert.notEqual(cpu.hint, null);
    cpu.loadRom([0x00, 0xE0]);
    assert.equal(cpu.hint, null);
  });

  it('los demás 0NNN siguen siendo SYS, sin aviso, en todas las plataformas', () => {
    for (const platform of PLATFORMS) {
      const cpu = makeCpu([0x0000, 0x0123, 0x00E1, 0x00EF, 0x00FA, 0x00B0, 0x00BF, 0x0FFF, 0x01C0], { platform });
      runSteps(cpu, 9);
      assert.equal(cpu.pc, 0x212, platform);
      assert.equal(cpu.halted, false, platform);
      assert.equal(cpu.hint, null, platform);
    }
  });

  it('DXYN con N != 0 no deja aviso en CHIP-8', () => {
    const cpu = makeCpu([0xD121, 0xD12F]);
    runSteps(cpu, 2);
    assert.equal(cpu.hint, null);
  });

  it('en SUPER-CHIP, 00DN no hace nada y avisa que es de XO-CHIP', () => {
    const cpu = makeCpu([0x120A, 0, 0, 0, 0, 0x00D3, 0x6001], { platform: 'schip' });
    for (let i = 0; i < cpu.display.length; i += 3) cpu.display[i] = 1;
    const before = Array.from(cpu.display);
    runSteps(cpu, 2);
    assert.deepEqual(Array.from(cpu.display), before);
    assert.equal(cpu.halted, false);
    assert.deepEqual(cpu.hint, { opcode: 0x00D3, addr: 0x20A, needs: 'xochip', name: NAMES.scu });
    cpu.step();
    assert.equal(cpu.V[0], 1);
  });

  it('las instrucciones de la propia plataforma no dejan aviso', () => {
    const schip = makeCpu([0x00FF, 0x00C1, 0x00FB, 0x00FC, 0xD120, 0x00FE, 0xF030, 0xF075, 0xF085], { platform: 'schip' });
    runSteps(schip, 9);
    assert.equal(schip.hint, null);
    assert.equal(schip.halted, false);
    const xo = makeCpu([0x00FF, 0x00C1, 0x00D1, 0x00FB, 0x00FC, 0xD120, 0xF201, 0x5122, 0xF002], { platform: 'xochip' });
    runSteps(xo, 9);
    assert.equal(xo.hint, null);
    assert.equal(xo.halted, false);
  });
});

describe('errores de plataforma', () => {
  for (const [op, needs, name, text] of HALTING) {
    for (const platform of needs === 'schip' ? ['chip8'] : ['chip8', 'schip']) {
      it(`${hex(op, 4)} en ${LABEL[platform]} detiene la máquina: «${text}» es de ${LABEL[needs]}`, () => {
        const cpu = makeCpu([0x120A, 0, 0, 0, 0, op, 0x1234, 0x6001], { platform });
        for (let i = 0; i < 16; i++) cpu.V[i] = 0x10 + i;
        const before = Array.from(cpu.V);
        cpu.I = 0x345;
        cpu.step();
        assert.equal(cpu.step(), false);
        assert.equal(cpu.halted, true);
        assert.equal(cpu.exited, false);
        assert.equal(cpu.pc, 0x20A);
        assert.equal(cpu.I, 0x345);
        assert.deepEqual(Array.from(cpu.V), before);
        assert.deepEqual(cpu.errorInfo, { kind: 'platform', opcode: op, addr: 0x20A, needs, name });
        assert.equal(cpu.error,
          `Instrucción inválida en ${LABEL[platform]}: «${text}» (${name}) es de ${LABEL[needs]} ` +
          `(opcode 0x${hex(op, 4)} en la dirección 0x20A). Elegí la plataforma ${LABEL[needs]}.`);
        assert.equal(cpu.step(), false);
      });
    }
  }

  it('el ejemplo de la especificación, al pie de la letra', () => {
    const cpu = makeCpu([0x12A4]);
    cpu.memory[0x2A4] = 0xF2;
    cpu.memory[0x2A5] = 0x01;
    runSteps(cpu, 2);
    assert.equal(cpu.error, 'Instrucción inválida en CHIP-8: «PLANE 2» (elegir el plano de dibujo) es de XO-CHIP ' +
      '(opcode 0xF201 en la dirección 0x2A4). Elegí la plataforma XO-CHIP.');
  });

  it('el mensaje se lee como los de siempre: empieza igual y trae opcode y dirección', () => {
    for (const [op, needs] of HALTING) {
      const cpu = runAt20A(op, 'chip8');
      cpu.step();
      assert.ok(cpu.error.startsWith('Instrucción inválida'), cpu.error);
      assert.ok(cpu.error.toUpperCase().includes(hex(op, 4)), cpu.error);
      assert.ok(cpu.error.includes(`(opcode 0x${hex(op, 4)} en la dirección 0x20A)`), cpu.error);
      assert.ok(cpu.error.includes(LABEL.chip8) && cpu.error.includes(LABEL[needs]), 'nombra las dos plataformas');
    }
  });

  it('en SUPER-CHIP y XO-CHIP, las instrucciones de SUPER-CHIP se ejecutan', () => {
    for (const platform of ['schip', 'xochip']) {
      const cpu = makeCpu([0x6003, 0xF030, 0xF075, 0xF085], { platform });
      runSteps(cpu, 4);
      assert.equal(cpu.halted, false, platform);
      assert.equal(cpu.I, BIG_FONT_ADDR + 30, platform);
    }
  });

  it('reset borra el error y errorInfo', () => {
    const cpu = makeCpu([0xF075]);
    cpu.step();
    assert.notEqual(cpu.errorInfo, null);
    cpu.reset();
    assert.equal(cpu.error, null);
    assert.equal(cpu.errorInfo, null);
    assert.equal(cpu.halted, false);
  });

  it('FN01 con N > 3 y FX02 con X != 0 no existen en ninguna plataforma: instrucción inválida', () => {
    for (const platform of PLATFORMS) {
      for (const op of [0xF401, 0xF501, 0xFF01, 0xF102, 0xFF02, 0xF100, 0xFF00]) {
        const cpu = runAt20A(op, platform);
        cpu.step();
        assert.deepEqual(cpu.errorInfo, { kind: 'invalid', opcode: op, addr: 0x20A }, `${platform} ${hex(op, 4)}`);
        assert.equal(cpu.error, `Instrucción inválida o desconocida (opcode 0x${hex(op, 4)} en la dirección ` +
          (platform === 'xochip' ? '0x020A' : '0x20A') + ').');
      }
    }
  });

  it('5XYN con N distinto de 0, 2 y 3 sigue siendo inválido en todas las plataformas', () => {
    for (const platform of PLATFORMS) {
      for (const n of [1, 4, 5, 0xF]) {
        const cpu = runAt20A(0x5120 | n, platform);
        cpu.step();
        assert.equal(cpu.errorInfo.kind, 'invalid', `${platform} 512${hex(n, 1)}`);
      }
    }
  });
});

describe('errorInfo de los demás errores', () => {
  it('instrucción inválida, desborde y subdesborde de pila en CHIP-8 (mensajes de siempre)', () => {
    const invalid = runAt20A(0x5121, 'chip8');
    invalid.step();
    assert.deepEqual(invalid.errorInfo, { kind: 'invalid', opcode: 0x5121, addr: 0x20A });
    assert.equal(invalid.error, 'Instrucción inválida o desconocida (opcode 0x5121 en la dirección 0x20A).');

    const overflow = makeCpu([0x2200]);
    runSteps(overflow, 17);
    assert.deepEqual(overflow.errorInfo, { kind: 'stackOverflow', opcode: 0x2200, addr: 0x200 });
    assert.equal(overflow.error, 'Desbordamiento de pila (stack overflow): CALL con los 16 niveles de la pila ocupados (opcode 0x2200 en la dirección 0x200).');

    const underflow = makeCpu([0x00EE]);
    underflow.step();
    assert.deepEqual(underflow.errorInfo, { kind: 'stackUnderflow', opcode: 0x00EE, addr: 0x200 });
    assert.equal(underflow.error, 'Subdesbordamiento de pila (stack underflow): RET sin dirección de retorno, la pila está vacía (opcode 0x00EE en la dirección 0x200).');
  });

  it('en SUPER-CHIP las direcciones siguen con 3 dígitos; en XO-CHIP, con 4', () => {
    const schip = runAt20A(0x8128, 'schip');
    schip.step();
    assert.equal(schip.error, 'Instrucción inválida o desconocida (opcode 0x8128 en la dirección 0x20A).');
    const xo = runAt20A(0x8128, 'xochip');
    xo.step();
    assert.equal(xo.error, 'Instrucción inválida o desconocida (opcode 0x8128 en la dirección 0x020A).');
    assert.deepEqual(xo.errorInfo, { kind: 'invalid', opcode: 0x8128, addr: 0x20A });

    const overflow = makeCpu([0x2200], { platform: 'xochip' });
    runSteps(overflow, 17);
    assert.equal(overflow.error, 'Desbordamiento de pila (stack overflow): CALL con los 16 niveles de la pila ocupados (opcode 0x2200 en la dirección 0x0200).');
    const underflow = makeCpu([0x00EE], { platform: 'xochip' });
    underflow.step();
    assert.equal(underflow.error, 'Subdesbordamiento de pila (stack underflow): RET sin dirección de retorno, la pila está vacía (opcode 0x00EE en la dirección 0x0200).');
  });

  it('cada error deja errorInfo; uno nuevo lo reemplaza después del reset', () => {
    const cpu = makeCpu([0x5121]);
    cpu.step();
    const first = cpu.errorInfo;
    cpu.reset();
    cpu.memory[0x200] = 0x00;
    cpu.memory[0x201] = 0xEE;
    cpu.step();
    assert.notEqual(cpu.errorInfo, first);
    assert.equal(cpu.errorInfo.kind, 'stackUnderflow');
  });
});

describe('extendedInfo', () => {
  it('needs y name de cada instrucción de SUPER-CHIP y XO-CHIP', () => {
    for (const [op, needs, name] of [...LENIENT, ...HALTING]) {
      assert.deepEqual(extendedInfo(op), { needs, name }, hex(op, 4));
    }
  });

  it('F000 no depende de la palabra que sigue', () => {
    assert.deepEqual(extendedInfo(0xF000), { needs: 'xochip', name: NAMES.long });
  });

  it('null para las instrucciones de CHIP-8 y para las palabras que no existen en ninguna plataforma', () => {
    for (const op of [0x00E0, 0x00EE, 0x0000, 0x0123, 0x00E1, 0x00FA, 0x00B5, 0x1234, 0x2345, 0x3456, 0x4567, 0x5120,
      0x6789, 0x789A, 0x8124, 0x9120, 0xA123, 0xB123, 0xC1FF, 0xD125, 0xD12F, 0xE19E, 0xE1A1, 0xF107, 0xF10A, 0xF115,
      0xF118, 0xF11E, 0xF129, 0xF133, 0xF155, 0xF165]) {
      assert.equal(extendedInfo(op), null, hex(op, 4));
    }
    for (const op of [0x5121, 0x5124, 0x512F, 0x8128, 0x9121, 0xE000, 0xF401, 0xFF01, 0xF102, 0xFF02, 0xF100,
      0xF0FF, 0xFFFF]) {
      assert.equal(extendedInfo(op), null, hex(op, 4));
    }
  });

  it('coincide con la tabla de referencia en las 65536 palabras', () => {
    const wrong = [];
    for (let w = 0; w <= 0xFFFF; w++) {
      const info = extendedInfo(w);
      const needs = needsOf(w);
      if ((info === null ? null : info.needs) !== needs) wrong.push(hex(w, 4));
      if (wrong.length > 10) break;
    }
    assert.deepEqual(wrong, []);
  });

  it('usa solo los 16 bits bajos (como disassemble)', () => {
    assert.deepEqual(extendedInfo(0x100FF), { needs: 'schip', name: NAMES.high });
  });
});

describe('desensamblador por plataforma', () => {
  const SCHIP_TEXTS = [
    [0x00C0, 'SCD 0'], [0x00C5, 'SCD 5'], [0x00CA, 'SCD 10'], [0x00CF, 'SCD 15'],
    [0x00FB, 'SCR'], [0x00FC, 'SCL'], [0x00FD, 'EXIT'], [0x00FE, 'LOW'], [0x00FF, 'HIGH'],
    [0xF130, 'LD HF, V1'], [0xFA30, 'LD HF, VA'], [0xF175, 'LD R, V1'], [0xFF75, 'LD R, VF'],
    [0xF185, 'LD V1, R'], [0xF085, 'LD V0, R'], [0xD120, 'DRW V1, V2, 0'],
  ];
  const XOCHIP_TEXTS = [
    [0x00D0, 'SCU 0'], [0x00D5, 'SCU 5'], [0x00DF, 'SCU 15'],
    [0x5122, 'SAVE V1, V2'], [0x5AB2, 'SAVE VA, VB'], [0x5F02, 'SAVE VF, V0'],
    [0x5123, 'LOAD V1, V2'], [0x5213, 'LOAD V2, V1'], [0x5EE3, 'LOAD VE, VE'],
    [0xF001, 'PLANE 0'], [0xF101, 'PLANE 1'], [0xF201, 'PLANE 2'], [0xF301, 'PLANE 3'],
    [0xF002, 'AUDIO'], [0xF13A, 'PITCH V1'], [0xFF3A, 'PITCH VF'],
  ];

  for (const [op, text] of SCHIP_TEXTS) {
    it(`${hex(op, 4)} -> "${text}" en schip y en xochip`, () => {
      assert.equal(disassemble(op, undefined, 'schip'), text);
      assert.equal(disassemble(op, undefined, 'xochip'), text);
    });
  }

  for (const [op, text] of XOCHIP_TEXTS) {
    it(`${hex(op, 4)} -> "${text}" en xochip; en schip, como en CHIP-8`, () => {
      assert.equal(disassemble(op, undefined, 'xochip'), text);
      assert.equal(disassemble(op, undefined, 'schip'), disassemble(op));
    });
  }

  it('las de XO-CHIP en SUPER-CHIP se muestran como en CHIP-8 (SYS o DW)', () => {
    assert.equal(disassemble(0x00D5, undefined, 'schip'), 'SYS 0x0D5');
    assert.equal(disassemble(0x5122, undefined, 'schip'), 'DW 0x5122');
    assert.equal(disassemble(0xF201, undefined, 'schip'), 'DW 0xF201');
    assert.equal(disassemble(0xF002, undefined, 'schip'), 'DW 0xF002');
    assert.equal(disassemble(0xF13A, undefined, 'schip'), 'DW 0xF13A');
    assert.equal(disassemble(0xF000, undefined, 'schip', 0x1234), 'DW 0xF000');
  });

  it('F000 en xochip: "LD I, LONG 0xNNNN" con la palabra siguiente (4 dígitos en mayúscula); sin ella, DW', () => {
    assert.equal(disassemble(0xF000, undefined, 'xochip', 0x1234), 'LD I, LONG 0x1234');
    assert.equal(disassemble(0xF000, undefined, 'xochip', 0xabcd), 'LD I, LONG 0xABCD');
    assert.equal(disassemble(0xF000, undefined, 'xochip', 0), 'LD I, LONG 0x0000');
    assert.equal(disassemble(0xF000, undefined, 'xochip', 0x00E0), 'LD I, LONG 0x00E0');
    assert.equal(disassemble(0xF000, undefined, 'xochip', 0xFFFF), 'LD I, LONG 0xFFFF');
    assert.equal(disassemble(0xF000, undefined, 'xochip'), 'DW 0xF000');
    assert.equal(disassemble(0xF000, { jumping: true }, 'xochip', 0x0BCD), 'LD I, LONG 0x0BCD');
  });

  it('FN01 con N > 3 y FX02 con X != 0 son DW en todas las plataformas', () => {
    for (const platform of PLATFORMS) {
      for (const op of [0xF401, 0xF701, 0xFF01, 0xF102, 0xFF02]) assert.equal(disassemble(op, undefined, platform), 'DW 0x' + hex(op, 4));
    }
  });

  it('chip8 (por defecto o explícito): los textos de siempre para las 65536 palabras', () => {
    for (let w = 0; w <= 0xFFFF; w++) {
      const base = disassemble(w);
      if (disassemble(w, undefined, 'chip8') !== base || disassemble(w, undefined, null) !== base ||
        disassemble(w, undefined, 'chip8', 0x1234) !== base) {
        assert.fail(hex(w, 4));
      }
    }
    assert.equal(disassemble(0x00FF), 'SYS 0x0FF');
    assert.equal(disassemble(0x00C5), 'SYS 0x0C5');
    assert.equal(disassemble(0x00D5), 'SYS 0x0D5');
    assert.equal(disassemble(0x00FD), 'SYS 0x0FD');
    assert.equal(disassemble(0xF000), 'DW 0xF000');
    assert.equal(disassemble(0xF000, undefined, 'chip8', 0x1234), 'DW 0xF000');
    assert.equal(disassemble(0xF130), 'DW 0xF130');
    assert.equal(disassemble(0xF175), 'DW 0xF175');
    assert.equal(disassemble(0xF185), 'DW 0xF185');
    assert.equal(disassemble(0x5122), 'DW 0x5122');
    assert.equal(disassemble(0xF201), 'DW 0xF201');
    assert.equal(disassemble(0xD120), 'DRW V1, V2, 0');
  });

  it('una palabra que no es de la plataforma pedida se muestra como en CHIP-8 (las 65536)', () => {
    for (let w = 0; w <= 0xFFFF; w++) {
      const needs = needsOf(w);
      const base = disassemble(w);
      if (needs === null) {
        if (disassemble(w, undefined, 'schip') !== base || disassemble(w, undefined, 'xochip') !== base) assert.fail(hex(w, 4));
      } else if (needs === 'xochip' && disassemble(w, undefined, 'schip') !== base) {
        assert.fail(hex(w, 4));
      }
    }
  });

  it('quirks.jumping sigue cambiando BNNN en todas las plataformas', () => {
    for (const platform of PLATFORMS) {
      assert.equal(disassemble(0xB123, { jumping: true }, platform), 'JP V1, 0x123');
      assert.equal(disassemble(0xB123, undefined, platform), 'JP V0, 0x123');
    }
  });

  it('usa solo los 16 bits bajos en todas las plataformas', () => {
    assert.equal(disassemble(0x100FF, undefined, 'schip'), 'HIGH');
    assert.equal(disassemble(0x2F201, undefined, 'xochip'), 'PLANE 2');
  });

  it('una plataforma desconocida lanza RangeError', () => {
    assert.throws(() => disassemble(0x00FF, undefined, 'superchip'), RangeError);
    assert.throws(() => disassembleRange(new Uint8Array(4096), 0x200, 1, undefined, 'xo'), RangeError);
  });
});

describe('disassembleRange con plataforma', () => {
  it('en XO-CHIP, F000 NNNN es una fila de 4 bytes con long y la siguiente empieza después', () => {
    const mem = new Uint8Array(65536);
    mem.set([0xF0, 0x00, 0x12, 0x34, 0x60, 0x05, 0xF0, 0x00, 0xFF, 0xFF, 0x00, 0xFF], 0x200);
    assert.deepEqual(disassembleRange(mem, 0x200, 4, undefined, 'xochip'), [
      { addr: 0x200, opcode: 0xF000, text: 'LD I, LONG 0x1234', size: 4, long: 0x1234 },
      { addr: 0x204, opcode: 0x6005, text: 'LD V0, 0x05', size: 2 },
      { addr: 0x206, opcode: 0xF000, text: 'LD I, LONG 0xFFFF', size: 4, long: 0xFFFF },
      { addr: 0x20A, opcode: 0x00FF, text: 'HIGH', size: 2 },
    ]);
  });

  it('en CHIP-8 y SUPER-CHIP, F000 es un DW de 2 bytes', () => {
    const mem = new Uint8Array(4096);
    mem.set([0xF0, 0x00, 0x12, 0x34, 0x00, 0xFF], 0x200);
    assert.deepEqual(disassembleRange(mem, 0x200, 3, undefined, 'schip'), [
      { addr: 0x200, opcode: 0xF000, text: 'DW 0xF000', size: 2 },
      { addr: 0x202, opcode: 0x1234, text: 'JP 0x234', size: 2 },
      { addr: 0x204, opcode: 0x00FF, text: 'HIGH', size: 2 },
    ]);
    assert.deepEqual(disassembleRange(mem, 0x200, 3), [
      { addr: 0x200, opcode: 0xF000, text: 'DW 0xF000', size: 2 },
      { addr: 0x202, opcode: 0x1234, text: 'JP 0x234', size: 2 },
      { addr: 0x204, opcode: 0x00FF, text: 'SYS 0x0FF', size: 2 },
    ]);
  });

  it('en XO-CHIP las direcciones dan la vuelta en 0xFFFF, también en medio de un F000 NNNN', () => {
    const mem = new Uint8Array(65536);
    mem[0xFFFC] = 0x6A;
    mem[0xFFFD] = 0x0B;
    mem[0xFFFE] = 0xF0;
    mem[0xFFFF] = 0x00;
    mem.set([0xAB, 0xCD, 0x00, 0xEE], 0x0000);
    assert.deepEqual(disassembleRange(mem, 0xFFFC, 3, undefined, 'xochip'), [
      { addr: 0xFFFC, opcode: 0x6A0B, text: 'LD VA, 0x0B', size: 2 },
      { addr: 0xFFFE, opcode: 0xF000, text: 'LD I, LONG 0xABCD', size: 4, long: 0xABCD },
      { addr: 0x0002, opcode: 0x00EE, text: 'RET', size: 2 },
    ]);
    assert.equal(disassembleRange(mem, 0x1FFFC, 1, undefined, 'xochip')[0].addr, 0xFFFC);
  });

  it('en CHIP-8 y SUPER-CHIP las direcciones siguen dando la vuelta en 0xFFF', () => {
    const mem = new Uint8Array(4096);
    mem[0xFFE] = 0x00;
    mem[0xFFF] = 0xFE;
    for (const platform of ['chip8', 'schip']) {
      const out = disassembleRange(mem, 0xFFE, 2, undefined, platform);
      assert.deepEqual(out.map((e) => e.addr), [0xFFE, 0x000], platform);
    }
    assert.equal(disassembleRange(mem, 0xFFE, 1, undefined, 'schip')[0].text, 'LOW');
  });

  it('pasa los quirks a cada palabra', () => {
    const mem = new Uint8Array(65536);
    mem.set([0xB1, 0x23], 0x200);
    assert.equal(disassembleRange(mem, 0x200, 1, { jumping: true }, 'xochip')[0].text, 'JP V1, 0x123');
  });
});

describe('sha1', () => {
  const ascii = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));

  it('vectores conocidos', () => {
    assert.equal(sha1(new Uint8Array(0)), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assert.equal(sha1([]), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assert.equal(sha1(ascii('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.equal(sha1(new Uint8Array(1000000).fill(0x61)), '34aa973cd4c4daa4f61eeb2bdbad27316534016f');
    assert.equal(sha1(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  });

  it('una ROM de 3584 bytes al azar da lo mismo que crypto de Node', () => {
    const rom = crypto.randomBytes(3584);
    assert.equal(sha1(rom), crypto.createHash('sha1').update(rom).digest('hex'));
    assert.equal(sha1(new Uint8Array(rom)), crypto.createHash('sha1').update(rom).digest('hex'));
  });

  it('todos los largos de 0 a 300 bytes (bordes del relleno: 55, 56, 63, 64, 119, 120...)', () => {
    let seed = 99;
    const data = new Uint8Array(300);
    for (let i = 0; i < data.length; i++) data[i] = (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
    for (let n = 0; n <= 300; n++) {
      const part = data.subarray(0, n);
      assert.equal(sha1(part), crypto.createHash('sha1').update(part).digest('hex'), `largo ${n}`);
    }
  });

  it('acepta listas de números (truncados a 8 bits, como loadRom) y ArrayBuffer', () => {
    const list = [0x12, 0x1A2, -1, 0x2FF, 3.7];
    const cpu = new Chip8();
    cpu.loadRom(list);
    assert.equal(sha1(list), sha1(cpu.rom), 'la huella de la lista es la de los bytes que quedan cargados');
    assert.equal(sha1(new Uint8Array([0x12, 0xA2, 0xFF, 0xFF, 0x03]).buffer), sha1(cpu.rom));
  });

  it('devuelve 40 caracteres hexadecimales en minúscula', () => {
    for (const bytes of [[], [0], [0xFF, 0xFE], Array.from(FONT)]) assert.match(sha1(bytes), /^[0-9a-f]{40}$/);
  });

  it('un texto no son bytes: TypeError', () => {
    assert.throws(() => sha1('abc'), TypeError);
  });
});
