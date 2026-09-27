'use strict';
// DXYN, 00E0 y displayDirty.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, pixel, renderAscii } = require('./harness');

const { FONT, FONT_ADDR } = loadCore();

function litCount(cpu) {
  return cpu.display.reduce((a, b) => a + b, 0);
}

// Prepara un DRW V0, V1, N con el sprite `rows` en 0x300.
function drawCpu(rows, x, y, quirks = {}) {
  const n = rows.length;
  const cpu = makeCpu([0xD010 | n, 0xD010 | n], { quirks });
  cpu.I = 0x300;
  cpu.memory.set(rows, 0x300);
  cpu.V[0] = x;
  cpu.V[1] = y;
  return cpu;
}

describe('DXYN dibujo básico', () => {
  it('bits del sprite con el MSB a la izquierda', () => {
    const cpu = drawCpu([0b10110001], 0, 0);
    cpu.step();
    const row = [];
    for (let x = 0; x < 8; x++) row.push(pixel(cpu, x, 0));
    assert.deepEqual(row, [1, 0, 1, 1, 0, 0, 0, 1]);
    assert.equal(litCount(cpu), 4);
    assert.equal(cpu.V[0xF], 0);
  });

  it('dibuja N filas consecutivas desde I, ni una más', () => {
    const cpu = drawCpu([0x80, 0x40, 0x20], 20, 10);
    cpu.memory[0x303] = 0xFF; // no debe dibujarse
    cpu.step();
    assert.equal(pixel(cpu, 20, 10), 1);
    assert.equal(pixel(cpu, 21, 11), 1);
    assert.equal(pixel(cpu, 22, 12), 1);
    assert.equal(litCount(cpu), 3);
  });

  it('dibuja sprites de 15 filas', () => {
    const rows = new Array(15).fill(0x01);
    const cpu = drawCpu(rows, 0, 0);
    cpu.step();
    for (let y = 0; y < 15; y++) assert.equal(pixel(cpu, 7, y), 1);
    assert.equal(pixel(cpu, 7, 15), 0);
    assert.equal(litCount(cpu), 15);
  });

  it('XOR: dibujar dos veces borra y marca colisión', () => {
    const cpu = drawCpu([0xFF, 0x81], 5, 5);
    cpu.step();
    assert.equal(litCount(cpu), 10);
    assert.equal(cpu.V[0xF], 0);
    cpu.step();
    assert.equal(litCount(cpu), 0);
    assert.equal(cpu.V[0xF], 1);
  });

  it('XOR parcial: solo los píxeles comunes se apagan', () => {
    const cpu = makeCpu([0xD011, 0xA301, 0xD011]);
    cpu.memory[0x300] = 0b11110000;
    cpu.memory[0x301] = 0b00111100;
    cpu.I = 0x300;
    runSteps(cpu, 3);
    const row = [];
    for (let x = 0; x < 8; x++) row.push(pixel(cpu, x, 0));
    assert.deepEqual(row, [1, 1, 0, 0, 1, 1, 0, 0]);
    assert.equal(cpu.V[0xF], 1);
  });

  it('dibujar junto a píxeles encendidos sin superponer no es colisión', () => {
    const cpu = drawCpu([0x0F], 0, 0);
    cpu.display[0] = 1; // (0,0) encendido; el sprite cubre x=4..7
    cpu.V[0xF] = 1;
    cpu.step();
    assert.equal(cpu.V[0xF], 0);
    assert.equal(pixel(cpu, 0, 0), 1);
    assert.equal(litCount(cpu), 5);
  });

  it('píxeles 0 del sprite no apagan lo que ya estaba', () => {
    const cpu = drawCpu([0x00], 3, 3);
    cpu.display[3 * 64 + 3] = 1;
    cpu.step();
    assert.equal(pixel(cpu, 3, 3), 1);
    assert.equal(cpu.V[0xF], 0);
  });

  it('la colisión con un solo píxel alcanza para VF = 1', () => {
    const cpu = drawCpu([0x01], 10, 2);
    cpu.display[2 * 64 + 17] = 1;
    cpu.step();
    assert.equal(cpu.V[0xF], 1);
    assert.equal(pixel(cpu, 17, 2), 0);
  });

  it('N = 0 no dibuja nada y deja VF = 0', () => {
    const cpu = makeCpu([0xD010]);
    cpu.I = 0x300;
    cpu.memory.fill(0xFF, 0x300, 0x320);
    cpu.display[0] = 1;
    cpu.V[0xF] = 1;
    cpu.step();
    assert.equal(litCount(cpu), 1);
    assert.equal(cpu.V[0xF], 0);
    assert.equal(cpu.pc, 0x202);
  });

  it('las direcciones del sprite pasan de 0xFFF a 0x000', () => {
    const cpu = makeCpu([0xD012]);
    cpu.I = 0xFFF;
    cpu.memory[0xFFF] = 0x80;
    cpu.memory[0x000] = 0x01;
    cpu.step();
    assert.equal(pixel(cpu, 0, 0), 1);
    assert.equal(pixel(cpu, 7, 1), 1);
    assert.equal(litCount(cpu), 2);
  });

  it('usa VX y VY como coordenadas (no X e Y)', () => {
    const cpu = makeCpu([0xD341]);
    cpu.I = 0x300;
    cpu.memory[0x300] = 0x80;
    cpu.V[3] = 12;
    cpu.V[4] = 7;
    cpu.step();
    assert.equal(pixel(cpu, 12, 7), 1);
    assert.equal(litCount(cpu), 1);
  });

  it('DFF1: lee VF como coordenada antes de escribir el flag', () => {
    const cpu = makeCpu([0xDFF1]);
    cpu.I = 0x300;
    cpu.memory[0x300] = 0x80;
    cpu.V[0xF] = 10;
    cpu.step();
    assert.equal(pixel(cpu, 10, 10), 1);
    assert.equal(cpu.V[0xF], 0);
  });
});

describe('DXYN coordenadas iniciales', () => {
  it('VX >= 64 y VY >= 32 se envuelven (con clipping on)', () => {
    const cpu = drawCpu([0x80], 64 + 5, 32 + 3, { clipping: true });
    cpu.step();
    assert.equal(pixel(cpu, 5, 3), 1);
    assert.equal(litCount(cpu), 1);
  });

  it('VX = VY = 0xFF -> (63, 31)', () => {
    const cpu = drawCpu([0x80], 0xFF, 0xFF, { clipping: true });
    cpu.step();
    assert.equal(pixel(cpu, 63, 31), 1);
    assert.equal(litCount(cpu), 1);
  });

  it('el envoltorio de inicio también vale con clipping off', () => {
    const cpu = drawCpu([0xC0], 130, 70, { clipping: false });
    cpu.step();
    assert.equal(pixel(cpu, 2, 6), 1);
    assert.equal(pixel(cpu, 3, 6), 1);
    assert.equal(litCount(cpu), 2);
  });

  it('un sprite que arranca envuelto en el borde derecho igual se recorta (clipping on)', () => {
    const cpu = drawCpu([0xFF], 64 + 62, 0, { clipping: true });
    cpu.step();
    assert.equal(pixel(cpu, 62, 0), 1);
    assert.equal(pixel(cpu, 63, 0), 1);
    assert.equal(litCount(cpu), 2);
  });
});

describe('DXYN bordes: clipping vs wrapping', () => {
  it('borde derecho con clipping', () => {
    const cpu = drawCpu([0xFF], 60, 0, { clipping: true });
    cpu.step();
    for (let x = 60; x < 64; x++) assert.equal(pixel(cpu, x, 0), 1);
    assert.equal(litCount(cpu), 4);
    assert.equal(pixel(cpu, 0, 1), 0, 'no pasa a la fila siguiente');
  });

  it('borde derecho con wrapping: vuelve por la izquierda de la misma fila', () => {
    const cpu = drawCpu([0xFF], 60, 0, { clipping: false });
    cpu.step();
    for (let x = 60; x < 64; x++) assert.equal(pixel(cpu, x, 0), 1);
    for (let x = 0; x < 4; x++) assert.equal(pixel(cpu, x, 0), 1);
    assert.equal(pixel(cpu, 0, 1), 0);
    assert.equal(litCount(cpu), 8);
  });

  it('borde inferior con clipping', () => {
    const cpu = drawCpu([0x80, 0x80, 0x80, 0x80], 0, 30, { clipping: true });
    cpu.step();
    assert.equal(pixel(cpu, 0, 30), 1);
    assert.equal(pixel(cpu, 0, 31), 1);
    assert.equal(pixel(cpu, 0, 0), 0);
    assert.equal(pixel(cpu, 0, 1), 0);
    assert.equal(litCount(cpu), 2);
  });

  it('borde inferior con wrapping', () => {
    const cpu = drawCpu([0x80, 0x80, 0x80, 0x80], 0, 30, { clipping: false });
    cpu.step();
    for (const y of [30, 31, 0, 1]) assert.equal(pixel(cpu, 0, y), 1, `y=${y}`);
    assert.equal(litCount(cpu), 4);
  });

  it('esquina inferior derecha con clipping', () => {
    const cpu = drawCpu([0xFF, 0xFF], 62, 31, { clipping: true });
    cpu.step();
    assert.equal(pixel(cpu, 62, 31), 1);
    assert.equal(pixel(cpu, 63, 31), 1);
    assert.equal(litCount(cpu), 2, renderAscii(cpu));
  });

  it('esquina inferior derecha con wrapping', () => {
    const cpu = drawCpu([0xFF, 0xFF], 62, 31, { clipping: false });
    cpu.step();
    for (const y of [31, 0]) {
      for (const x of [62, 63, 0, 1, 2, 3, 4, 5]) assert.equal(pixel(cpu, x, y), 1, `(${x},${y})`);
    }
    assert.equal(litCount(cpu), 16, renderAscii(cpu));
  });

  it('los píxeles recortados no generan colisión', () => {
    const cpu = drawCpu([0xFF], 60, 4, { clipping: true });
    cpu.display[4 * 64 + 0] = 1;
    cpu.display[5 * 64 + 60] = 0;
    cpu.step();
    assert.equal(cpu.V[0xF], 0);
    assert.equal(pixel(cpu, 0, 4), 1, 'el píxel de la izquierda queda intacto');
  });

  it('los píxeles recortados abajo no generan colisión', () => {
    const cpu = drawCpu([0x80, 0x80], 0, 31, { clipping: true });
    cpu.display[0] = 1; // (0,0)
    cpu.step();
    assert.equal(cpu.V[0xF], 0);
    assert.equal(pixel(cpu, 0, 0), 1);
  });

  it('con wrapping los píxeles envueltos sí colisionan', () => {
    const cpu = drawCpu([0xFF], 60, 4, { clipping: false });
    cpu.display[4 * 64 + 0] = 1;
    cpu.step();
    assert.equal(cpu.V[0xF], 1);
    assert.equal(pixel(cpu, 0, 4), 0);
  });
});

describe('00E0 y displayDirty', () => {
  it('00E0 borra la pantalla', () => {
    const cpu = makeCpu([0xA050, 0xD015, 0x00E0]);
    runSteps(cpu, 2);
    assert.ok(litCount(cpu) > 0);
    cpu.step();
    assert.equal(litCount(cpu), 0);
  });

  it('loadRom deja displayDirty en true', () => {
    const cpu = makeCpu([0x00E0]);
    assert.equal(cpu.displayDirty, true);
  });

  it('reset pone displayDirty en true', () => {
    const cpu = makeCpu([0x00E0]);
    cpu.displayDirty = false;
    cpu.reset();
    assert.equal(cpu.displayDirty, true);
  });

  it('00E0 pone displayDirty en true', () => {
    const cpu = makeCpu([0x00E0]);
    cpu.displayDirty = false;
    cpu.step();
    assert.equal(cpu.displayDirty, true);
  });

  it('DXYN pone displayDirty en true', () => {
    const cpu = makeCpu([0xA050, 0xD015]);
    cpu.displayDirty = false;
    cpu.step();
    assert.equal(cpu.displayDirty, false, 'ANNN no toca la pantalla');
    cpu.step();
    assert.equal(cpu.displayDirty, true);
  });

  it('instrucciones que no dibujan no ensucian la pantalla', () => {
    const cpu = makeCpu([0x6001, 0x7002, 0x8124, 0xA300, 0xF01E]);
    cpu.displayDirty = false;
    runSteps(cpu, 5);
    assert.equal(cpu.displayDirty, false);
  });

  it('reset borra la pantalla', () => {
    const cpu = makeCpu([0xA050, 0xD015]);
    runSteps(cpu, 2);
    cpu.reset();
    assert.equal(litCount(cpu), 0);
  });
});

describe('glifos de la fuente vía FX29 + DXYN', () => {
  for (let d = 0; d < 16; d++) {
    it(`dibuja el glifo ${d.toString(16).toUpperCase()}`, () => {
      // LD V0,d | LD F,V0 | LD V1,3 | LD V2,2 | DRW V1,V2,5
      const cpu = makeCpu([0x6000 | d, 0xF029, 0x6103, 0x6202, 0xD125]);
      runSteps(cpu, 5);
      for (let row = 0; row < 5; row++) {
        const byte = FONT[d * 5 + row];
        for (let bit = 0; bit < 8; bit++) {
          const expected = (byte >> (7 - bit)) & 1;
          assert.equal(pixel(cpu, 3 + bit, 2 + row), expected, `glifo ${d} fila ${row} bit ${bit}\n${renderAscii(cpu)}`);
        }
      }
      assert.equal(cpu.I, FONT_ADDR + d * 5);
      assert.equal(cpu.V[0xF], 0);
    });
  }

  it('el glifo 8 tiene la forma esperada', () => {
    const cpu = makeCpu([0x6008, 0xF029, 0x6100, 0x6200, 0xD125]);
    runSteps(cpu, 5);
    const rows = renderAscii(cpu).split('\n').slice(0, 5).map((r) => r.slice(0, 4));
    assert.deepEqual(rows, ['####', '#..#', '####', '#..#', '####']);
  });
});
