'use strict';
// Casos que salieron de una pasada de mutation testing sobre el núcleo: cada uno
// fija un comportamiento que el resto de la suite no llegaba a atrapar (la mutación
// correspondiente pasaba todos los tests).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu } = require('./harness');

const { Chip8, DEFAULT_QUIRKS, disassemble } = loadCore();

function withMathRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

describe('random por defecto', () => {
  it('CXFF puede dar 255 cuando Math.random está cerca de 1', () => {
    withMathRandom(0.9999999, () => {
      const cpu = makeCpu([0xC0FF]);
      cpu.step();
      assert.equal(cpu.V[0], 0xFF);
    });
  });

  it('CXFF da 0 cuando Math.random devuelve 0', () => {
    withMathRandom(0, () => {
      const cpu = makeCpu([0xC0FF]);
      cpu.V[0] = 0x55;
      cpu.step();
      assert.equal(cpu.V[0], 0x00);
    });
  });
});

describe('setQuirks: entradas raras', () => {
  it('setQuirks(null) y setQuirks(undefined) no hacen nada', () => {
    const cpu = new Chip8();
    assert.doesNotThrow(() => cpu.setQuirks(null));
    assert.doesNotThrow(() => cpu.setQuirks(undefined));
    assert.deepEqual({ ...cpu.quirks }, { ...DEFAULT_QUIRKS });
  });

  it('convierte los valores a booleanos', () => {
    const cpu = new Chip8();
    cpu.setQuirks({ clipping: 0, jumping: 1, shifting: 'si', memory: '' });
    assert.strictEqual(cpu.quirks.clipping, false);
    assert.strictEqual(cpu.quirks.jumping, true);
    assert.strictEqual(cpu.quirks.shifting, true);
    assert.strictEqual(cpu.quirks.memory, false);
  });
});

describe('loadRom: números fuera de rango', () => {
  it('los valores de más de 8 bits se truncan (no se saturan)', () => {
    const cpu = new Chip8();
    cpu.loadRom([0x100, 0x1A2, 0x2FF]);
    assert.deepEqual(Array.from(cpu.memory.slice(0x200, 0x203)), [0x00, 0xA2, 0xFF]);
  });
});

describe('borde de la memoria en 0xFFE / 0xFFF', () => {
  it('una instrucción inválida en 0xFFE deja pc en 0xFFE y lo informa', () => {
    const cpu = makeCpu([]);
    cpu.memory[0xFFE] = 0xFF;
    cpu.memory[0xFFF] = 0xFF;
    cpu.pc = 0xFFE;
    assert.equal(cpu.step(), false);
    assert.equal(cpu.halted, true);
    assert.equal(cpu.pc, 0xFFE, 'pc vuelve a la instrucción culpable, no a -2');
    assert.ok(cpu.error.includes('0xFFFF'), cpu.error);
    assert.ok(cpu.error.includes('0xFFE'), cpu.error);
  });

  it('una instrucción en 0xFFF lee su segundo byte de 0x000', () => {
    const cpu = makeCpu([]);
    cpu.memory[0xFFF] = 0x60; // 602A: LD V0, 0x2A, partida entre 0xFFF y 0x000
    cpu.memory[0x000] = 0x2A;
    cpu.pc = 0xFFF;
    assert.equal(cpu.step(), true);
    assert.equal(cpu.V[0], 0x2A);
    assert.equal(cpu.pc, 0x001);
  });
});

describe('step con la máquina detenida', () => {
  it('no ejecuta aunque después se escriba una instrucción válida en pc', () => {
    const cpu = makeCpu([0x5121]); // inválida: detiene la máquina
    cpu.step();
    assert.equal(cpu.halted, true);
    cpu.memory[0x200] = 0x60; // 6007: LD V0, 7
    cpu.memory[0x201] = 0x07;
    assert.equal(cpu.step(), false);
    assert.equal(cpu.V[0], 0);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.halted, true);
  });
});

describe('setKey: número de tecla y avisos repetidos', () => {
  it('usa solo el nibble bajo del número de tecla', () => {
    const cpu = makeCpu([0xE09E, 0x6101, 0x6102]);
    cpu.V[0] = 3;
    cpu.setKey(0x13, true);
    assert.equal(cpu.keys[3], 1);
    cpu.step();
    assert.equal(cpu.pc, 0x204, 'EX9E ve la tecla 3 presionada');
  });

  it('FX0A con un número de tecla fuera de rango guarda el nibble bajo', () => {
    const cpu = makeCpu([0xF20A]);
    cpu.step();
    cpu.setKey(0x1C, true);
    cpu.setKey(0x1C, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[2], 0xC);
  });

  it('repetir el aviso de presión de una tecla mantenida desde antes no cuenta para FX0A', () => {
    const cpu = makeCpu([0xF30A]);
    cpu.V[3] = 0xEE;
    cpu.setKey(7, true);
    cpu.step();
    cpu.setKey(7, true); // p. ej. autorepetición del teclado: sigue siendo la misma presión
    cpu.setKey(7, false);
    assert.equal(cpu.waitingForKey, true, 'la tecla ya estaba apretada al empezar la espera');
    assert.equal(cpu.V[3], 0xEE);
  });
});

describe('disassemble: entradas de más de 16 bits', () => {
  it('usa solo los 16 bits bajos del opcode', () => {
    assert.equal(disassemble(0x100E0), 'CLS');
    assert.equal(disassemble(0x2A123), 'LD I, 0x123');
    assert.equal(disassemble(0xF00EE), 'RET');
  });
});
