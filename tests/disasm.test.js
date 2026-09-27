'use strict';
// Desensamblador: texto exacto por familia y disassembleRange.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./harness');

const { disassemble, disassembleRange, Chip8 } = loadCore();

const cases = {
  '0NNN / 00E0 / 00EE': [
    [0x00E0, 'CLS'],
    [0x00EE, 'RET'],
    [0x01A2, 'SYS 0x1A2'],
    [0x0000, 'SYS 0x000'],
    [0x0FFF, 'SYS 0xFFF'],
    [0x00E1, 'SYS 0x0E1'],
    [0x0abc, 'SYS 0xABC'],
    [0x00EF, 'SYS 0x0EF'],
  ],
  '1NNN': [
    [0x12A0, 'JP 0x2A0'],
    [0x1000, 'JP 0x000'],
    [0x100A, 'JP 0x00A'],
    [0x1FFF, 'JP 0xFFF'],
  ],
  '2NNN': [
    [0x22A0, 'CALL 0x2A0'],
    [0x2BCD, 'CALL 0xBCD'],
    [0x2005, 'CALL 0x005'],
  ],
  '3XNN': [
    [0x312A, 'SE V1, 0x2A'],
    [0x3A0A, 'SE VA, 0x0A'],
    [0x3F00, 'SE VF, 0x00'],
    [0x30FF, 'SE V0, 0xFF'],
  ],
  '4XNN': [
    [0x412A, 'SNE V1, 0x2A'],
    [0x4B0C, 'SNE VB, 0x0C'],
    [0x4EFE, 'SNE VE, 0xFE'],
  ],
  '5XY0': [
    [0x5120, 'SE V1, V2'],
    [0x5AB0, 'SE VA, VB'],
    [0x5FF0, 'SE VF, VF'],
  ],
  '6XNN': [
    [0x612A, 'LD V1, 0x2A'],
    [0x6C05, 'LD VC, 0x05'],
    [0x6F00, 'LD VF, 0x00'],
    [0x60AB, 'LD V0, 0xAB'],
  ],
  '7XNN': [
    [0x712A, 'ADD V1, 0x2A'],
    [0x7D01, 'ADD VD, 0x01'],
    [0x70FF, 'ADD V0, 0xFF'],
  ],
  '8XYN': [
    [0x8120, 'LD V1, V2'],
    [0x8121, 'OR V1, V2'],
    [0x8122, 'AND V1, V2'],
    [0x8123, 'XOR V1, V2'],
    [0x8124, 'ADD V1, V2'],
    [0x8125, 'SUB V1, V2'],
    [0x8126, 'SHR V1, V2'],
    [0x8127, 'SUBN V1, V2'],
    [0x812E, 'SHL V1, V2'],
    [0x8AB6, 'SHR VA, VB'],
    [0x8CD0, 'LD VC, VD'],
    [0x8EF1, 'OR VE, VF'],
    [0x8F02, 'AND VF, V0'],
    [0x89A3, 'XOR V9, VA'],
    [0x8FF4, 'ADD VF, VF'],
    [0x8DC5, 'SUB VD, VC'],
    [0x8BA7, 'SUBN VB, VA'],
    [0x8EEE, 'SHL VE, VE'],
  ],
  '9XY0': [
    [0x9120, 'SNE V1, V2'],
    [0x9CD0, 'SNE VC, VD'],
  ],
  'ANNN': [
    [0xA2A0, 'LD I, 0x2A0'],
    [0xA050, 'LD I, 0x050'],
    [0xAFFF, 'LD I, 0xFFF'],
  ],
  'BNNN': [
    [0xB2A0, 'JP V0, 0x2A0'],
    [0xB00F, 'JP V0, 0x00F'],
    [0xBEEF, 'JP V0, 0xEEF'],
  ],
  'CXNN': [
    [0xC12A, 'RND V1, 0x2A'],
    [0xCF0F, 'RND VF, 0x0F'],
    [0xC0FF, 'RND V0, 0xFF'],
  ],
  'DXYN': [
    [0xD125, 'DRW V1, V2, 5'],
    [0xD01F, 'DRW V0, V1, 15'],
    [0xDAB0, 'DRW VA, VB, 0'],
    [0xDEF1, 'DRW VE, VF, 1'],
    [0xD00A, 'DRW V0, V0, 10'],
  ],
  'EX9E / EXA1': [
    [0xE19E, 'SKP V1'],
    [0xEA9E, 'SKP VA'],
    [0xE1A1, 'SKNP V1'],
    [0xEFA1, 'SKNP VF'],
  ],
  'FX..': [
    [0xF107, 'LD V1, DT'],
    [0xF10A, 'LD V1, K'],
    [0xF115, 'LD DT, V1'],
    [0xF118, 'LD ST, V1'],
    [0xF11E, 'ADD I, V1'],
    [0xF129, 'LD F, V1'],
    [0xF133, 'LD B, V1'],
    [0xF155, 'LD [I], V1'],
    [0xF165, 'LD V1, [I]'],
    [0xFA07, 'LD VA, DT'],
    [0xFB0A, 'LD VB, K'],
    [0xFC15, 'LD DT, VC'],
    [0xFD18, 'LD ST, VD'],
    [0xFE1E, 'ADD I, VE'],
    [0xFF29, 'LD F, VF'],
    [0xF033, 'LD B, V0'],
    [0xFF55, 'LD [I], VF'],
    [0xFA65, 'LD VA, [I]'],
  ],
  'inválidos -> DW': [
    [0x5121, 'DW 0x5121'],
    [0x512F, 'DW 0x512F'],
    [0x9AB1, 'DW 0x9AB1'],
    [0x8008, 'DW 0x8008'],
    [0x8129, 'DW 0x8129'],
    [0x812A, 'DW 0x812A'],
    [0x812B, 'DW 0x812B'],
    [0x812C, 'DW 0x812C'],
    [0x812D, 'DW 0x812D'],
    [0x800F, 'DW 0x800F'],
    [0xE000, 'DW 0xE000'],
    [0xE19F, 'DW 0xE19F'],
    [0xEAA2, 'DW 0xEAA2'],
    [0xF000, 'DW 0xF000'],
    [0xF1FF, 'DW 0xF1FF'],
    [0xF108, 'DW 0xF108'],
    [0xF156, 'DW 0xF156'],
    [0xFFFF, 'DW 0xFFFF'],
  ],
};

for (const [family, list] of Object.entries(cases)) {
  describe(`disassemble ${family}`, () => {
    for (const [op, text] of list) {
      it(`${op.toString(16).toUpperCase().padStart(4, '0')} -> "${text}"`, () => {
        assert.equal(disassemble(op), text);
      });
    }
  });
}

describe('disassemble: propiedades generales', () => {
  it('siempre devuelve un string no vacío para todo opcode de 16 bits', () => {
    for (let op = 0; op <= 0xFFFF; op += 7) {
      const text = disassemble(op);
      assert.equal(typeof text, 'string');
      assert.ok(text.length > 0);
    }
  });

  it('usa solo mayúsculas salvo la x del prefijo 0x', () => {
    for (const op of [0xabcd, 0x6fab, 0xa0ef, 0xc0de, 0xd1ea]) {
      const text = disassemble(op);
      assert.equal(text.replace(/0x/g, ''), text.replace(/0x/g, '').toUpperCase(), text);
    }
  });

  it('todas las palabras DW usan 4 dígitos hex', () => {
    for (const op of [0x5001, 0x9001, 0x800C, 0xE0FF, 0xF002]) {
      assert.match(disassemble(op), /^DW 0x[0-9A-F]{4}$/);
    }
  });
});

describe('disassembleRange', () => {
  it('devuelve count palabras consecutivas con dirección, opcode y texto', () => {
    const mem = new Uint8Array(4096);
    mem.set([0x00, 0xE0, 0x61, 0x2A, 0xD0, 0x1F, 0x51, 0x21], 0x200);
    const out = disassembleRange(mem, 0x200, 4);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 4);
    assert.deepEqual(out.map(({ addr, opcode, text }) => ({ addr, opcode, text })), [
      { addr: 0x200, opcode: 0x00E0, text: 'CLS' },
      { addr: 0x202, opcode: 0x612A, text: 'LD V1, 0x2A' },
      { addr: 0x204, opcode: 0xD01F, text: 'DRW V0, V1, 15' },
      { addr: 0x206, opcode: 0x5121, text: 'DW 0x5121' },
    ]);
  });

  it('count = 0 devuelve un array vacío', () => {
    assert.deepEqual(Array.from(disassembleRange(new Uint8Array(4096), 0x200, 0)), []);
  });

  it('arranca en direcciones impares', () => {
    const mem = new Uint8Array(4096);
    mem.set([0x12, 0x34, 0x56], 0x300);
    const out = disassembleRange(mem, 0x301, 1);
    assert.equal(out[0].addr, 0x301);
    assert.equal(out[0].opcode, 0x3456);
    assert.equal(out[0].text, 'SE V4, 0x56');
  });

  it('las direcciones envuelven en 0xFFF', () => {
    const mem = new Uint8Array(4096);
    mem[0xFFE] = 0x6A;
    mem[0xFFF] = 0x0B;
    mem[0x000] = 0x00;
    mem[0x001] = 0xEE;
    const out = disassembleRange(mem, 0xFFE, 2);
    assert.deepEqual(out.map((e) => [e.addr, e.opcode, e.text]), [
      [0xFFE, 0x6A0B, 'LD VA, 0x0B'],
      [0x000, 0x00EE, 'RET'],
    ]);
  });

  it('una palabra que cruza 0xFFF -> 0x000 se lee envuelta', () => {
    const mem = new Uint8Array(4096);
    mem[0xFFF] = 0x1A;
    mem[0x000] = 0xBC;
    mem[0x001] = 0x00;
    mem[0x002] = 0xE0;
    const out = disassembleRange(mem, 0xFFF, 2);
    assert.deepEqual(out.map((e) => [e.addr, e.opcode, e.text]), [
      [0xFFF, 0x1ABC, 'JP 0xABC'],
      [0x001, 0x00E0, 'CLS'],
    ]);
  });

  it('funciona sobre la memoria de una cpu con la fuente cargada', () => {
    const cpu = new Chip8();
    cpu.loadRom([0xA0, 0x50, 0xD0, 0x15]);
    const out = disassembleRange(cpu.memory, 0x200, 2);
    assert.deepEqual(out.map((e) => e.text), ['LD I, 0x050', 'DRW V0, V1, 5']);
    const font = disassembleRange(cpu.memory, 0x050, 1);
    assert.equal(font[0].opcode, 0xF090);
  });
});

describe('disassemble con quirks (argumento opcional)', () => {
  it('sin quirks, BNNN sigue siendo "JP V0, 0xNNN"', () => {
    assert.equal(disassemble(0xB2A0), 'JP V0, 0x2A0');
    assert.equal(disassemble(0xB123, undefined), 'JP V0, 0x123');
    assert.equal(disassemble(0xB123, {}), 'JP V0, 0x123');
    assert.equal(disassemble(0xB123, { jumping: false }), 'JP V0, 0x123');
  });

  it('con jumping, BNNN se muestra como "JP VX, 0xNNN" (X = primer dígito de NNN)', () => {
    const q = { jumping: true };
    assert.equal(disassemble(0xB123, q), 'JP V1, 0x123');
    assert.equal(disassemble(0xB2A0, q), 'JP V2, 0x2A0');
    assert.equal(disassemble(0xB00F, q), 'JP V0, 0x00F');
    assert.equal(disassemble(0xBEEF, q), 'JP VE, 0xEEF');
    assert.equal(disassemble(0xBFFF, q), 'JP VF, 0xFFF');
  });

  it('el registro que muestra es el que usa step() con el quirk activado', () => {
    for (const x of [0x1, 0x7, 0xA]) {
      const cpu = new Chip8({ quirks: { jumping: true } });
      const op = 0xB000 | (x << 8) | 0x23;
      cpu.loadRom([op >> 8, op & 0xFF]);
      cpu.V[x] = 0x10;
      cpu.step();
      assert.equal(cpu.pc, ((x << 8) | 0x23) + 0x10);
      assert.equal(disassemble(op, cpu.quirks), 'JP V' + x.toString(16).toUpperCase() + ', 0x' + ((x << 8) | 0x23).toString(16).toUpperCase().padStart(3, '0'));
    }
  });

  it('los demás quirks no cambian ningún texto', () => {
    const others = { vfReset: true, memory: true, shifting: true, clipping: true, displayWait: true, jumping: false };
    for (let op = 0; op <= 0xFFFF; op += 7) assert.equal(disassemble(op, others), disassemble(op));
  });

  it('jumping solo cambia la familia BNNN', () => {
    for (let op = 0; op <= 0xFFFF; op += 3) {
      if ((op >> 12) === 0xB) continue;
      assert.equal(disassemble(op, { jumping: true }), disassemble(op));
    }
  });

  it('disassembleRange pasa los quirks a cada palabra', () => {
    const mem = new Uint8Array(4096);
    mem.set([0xB1, 0x23, 0x61, 0x2A], 0x200);
    assert.deepEqual(disassembleRange(mem, 0x200, 2).map((e) => e.text), ['JP V0, 0x123', 'LD V1, 0x2A']);
    assert.deepEqual(disassembleRange(mem, 0x200, 2, { jumping: true }).map((e) => e.text), ['JP V1, 0x123', 'LD V1, 0x2A']);
  });
});
