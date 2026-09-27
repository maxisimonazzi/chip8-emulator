'use strict';
// Tests de caja negra para las 35 instrucciones de CHIP-8, derivados del contrato.
// Cada bloque describe() corresponde a una instrucción.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, pixel } = require('./harness');

const { FONT_ADDR } = loadCore();

// Llena V0..VF con valores distintos y reconocibles.
function fillRegisters(cpu) {
  for (let i = 0; i < 16; i++) cpu.V[i] = 0x10 + i * 3;
  return Array.from(cpu.V);
}

// Verifica que los registros que no figuran en `changed` no cambiaron.
function assertUntouched(cpu, before, changed) {
  for (let i = 0; i < 16; i++) {
    if (changed.includes(i)) continue;
    assert.equal(cpu.V[i], before[i], `V${i.toString(16).toUpperCase()} no debía cambiar`);
  }
}

// Ejecuta una sola instrucción ALU 8XYn con valores iniciales dados.
function alu(opcode, init, options = {}) {
  const cpu = makeCpu([opcode], options);
  for (const [reg, val] of Object.entries(init)) cpu.V[parseInt(reg, 16)] = val;
  cpu.step();
  return cpu;
}

describe('0NNN SYS NNN', () => {
  it('se ignora: solo avanza pc en 2', () => {
    const cpu = makeCpu([0x0123, 0x6005]);
    const before = fillRegisters(cpu);
    cpu.I = 0x345;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.I, 0x345);
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.halted, false);
    assert.equal(cpu.error, null);
    assertUntouched(cpu, before, []);
    cpu.step();
    assert.equal(cpu.V[0], 5);
  });

  it('0000 y 0FFF también son no-op', () => {
    const cpu = makeCpu([0x0000, 0x0FFF, 0x00E1, 0x00EF]);
    runSteps(cpu, 4);
    assert.equal(cpu.pc, 0x208);
    assert.equal(cpu.halted, false);
    assert.equal(cpu.sp, 0);
  });

  it('no toca la pantalla ni la pila', () => {
    const cpu = makeCpu([0x0200]);
    cpu.display[10] = 1;
    cpu.step();
    assert.equal(cpu.display[10], 1);
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.pc, 0x202);
  });
});

describe('00E0 CLS', () => {
  it('borra toda la pantalla y avanza pc', () => {
    const cpu = makeCpu([0x00E0]);
    cpu.display.fill(1);
    cpu.step();
    assert.equal(cpu.display.every((p) => p === 0), true);
    assert.equal(cpu.pc, 0x202);
  });

  it('no modifica registros ni I', () => {
    const cpu = makeCpu([0x00E0]);
    const before = fillRegisters(cpu);
    cpu.I = 0x123;
    cpu.display[0] = 1;
    cpu.display[2047] = 1;
    cpu.step();
    assertUntouched(cpu, before, []);
    assert.equal(cpu.I, 0x123);
    assert.equal(cpu.display[0], 0);
    assert.equal(cpu.display[2047], 0);
  });
});

describe('00EE RET', () => {
  it('vuelve a la instrucción siguiente al CALL', () => {
    // 200: CALL 206 | 202: LD V1,1 | 204: JP 204 | 206: LD V2,5 | 208: RET
    const cpu = makeCpu([0x2206, 0x6101, 0x1204, 0x6205, 0x00EE]);
    cpu.step();
    assert.equal(cpu.pc, 0x206);
    assert.equal(cpu.sp, 1);
    cpu.step();
    assert.equal(cpu.V[2], 5);
    cpu.step(); // RET
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.sp, 0);
    cpu.step();
    assert.equal(cpu.V[1], 1);
    assert.equal(cpu.pc, 0x204);
  });

  it('usa la entrada de arriba de la pila (stack[sp - 1])', () => {
    const cpu = makeCpu([0x00EE]);
    cpu.stack[0] = 0x300;
    cpu.stack[1] = 0x456;
    cpu.sp = 2;
    cpu.step();
    assert.equal(cpu.pc, 0x456);
    assert.equal(cpu.sp, 1);
    assert.equal(cpu.halted, false);
  });

  it('llamadas anidadas regresan en orden inverso', () => {
    // 200: CALL 208 | 202: LD V0,1 | 204: JP 204 | 206: (relleno)
    // 208: CALL 20E | 20A: LD V1,2 | 20C: RET | 20E: LD V2,3 | 210: RET
    const cpu = makeCpu([0x2208, 0x6001, 0x1204, 0x0000, 0x220E, 0x6102, 0x00EE, 0x6203, 0x00EE]);
    cpu.step(); // CALL 208
    cpu.step(); // CALL 20E
    assert.equal(cpu.sp, 2);
    assert.equal(cpu.stack[0], 0x202);
    assert.equal(cpu.stack[1], 0x20A);
    cpu.step(); // LD V2
    cpu.step(); // RET -> 20A
    assert.equal(cpu.pc, 0x20A);
    assert.equal(cpu.sp, 1);
    cpu.step(); // LD V1
    cpu.step(); // RET -> 202
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.sp, 0);
    cpu.step();
    assert.deepEqual([cpu.V[0], cpu.V[1], cpu.V[2]], [1, 2, 3]);
  });
});

describe('1NNN JP NNN', () => {
  it('salta a NNN', () => {
    const cpu = makeCpu([0x120A]);
    cpu.step();
    assert.equal(cpu.pc, 0x20A);
  });

  it('salta a direcciones extremas (0x000 y 0xFFE)', () => {
    let cpu = makeCpu([0x1FFE]);
    cpu.step();
    assert.equal(cpu.pc, 0xFFE);
    cpu = makeCpu([0x1000]);
    cpu.step();
    assert.equal(cpu.pc, 0x000);
  });

  it('un salto a sí mismo deja pc igual y no toca registros ni pila', () => {
    const cpu = makeCpu([0x1200]);
    const before = fillRegisters(cpu);
    runSteps(cpu, 5);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.sp, 0);
    assertUntouched(cpu, before, []);
  });
});

describe('2NNN CALL NNN', () => {
  it('apila la dirección de retorno y salta', () => {
    const cpu = makeCpu([0x2345]);
    cpu.step();
    assert.equal(cpu.pc, 0x345);
    assert.equal(cpu.sp, 1);
    assert.equal(cpu.stack[0], 0x202);
  });

  it('apila encima de lo que ya hay', () => {
    const cpu = makeCpu([0x1300]);
    cpu.memory[0x300] = 0x2A;
    cpu.memory[0x301] = 0xBC;
    cpu.stack[0] = 0x222;
    cpu.stack[1] = 0x244;
    cpu.sp = 2;
    cpu.step(); // JP 300
    cpu.step(); // CALL ABC
    assert.equal(cpu.sp, 3);
    assert.equal(cpu.stack[0], 0x222);
    assert.equal(cpu.stack[1], 0x244);
    assert.equal(cpu.stack[2], 0x302);
    assert.equal(cpu.pc, 0xABC);
  });

  it('no modifica registros ni I', () => {
    const cpu = makeCpu([0x2400]);
    const before = fillRegisters(cpu);
    cpu.I = 0x777;
    cpu.step();
    assertUntouched(cpu, before, []);
    assert.equal(cpu.I, 0x777);
  });
});

describe('3XNN SE VX, NN', () => {
  it('salta la siguiente instrucción si VX == NN', () => {
    const cpu = makeCpu([0x332A]);
    cpu.V[3] = 0x2A;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si VX != NN', () => {
    const cpu = makeCpu([0x332A]);
    cpu.V[3] = 0x2B;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('bordes 0x00 y 0xFF', () => {
    let cpu = makeCpu([0x3000]);
    cpu.step();
    assert.equal(cpu.pc, 0x204);
    cpu = makeCpu([0x3EFF]);
    cpu.V[0xE] = 0xFF;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
    cpu = makeCpu([0x3EFF]);
    cpu.V[0xE] = 0xFE;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('se salta efectivamente la instrucción siguiente', () => {
    const cpu = makeCpu([0x3000, 0x6101, 0x6202]);
    runSteps(cpu, 2);
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.V[2], 2);
  });

  it('no modifica registros', () => {
    const cpu = makeCpu([0x3510]);
    const before = fillRegisters(cpu);
    cpu.step();
    assertUntouched(cpu, before, []);
  });
});

describe('4XNN SNE VX, NN', () => {
  it('salta si VX != NN', () => {
    const cpu = makeCpu([0x442A]);
    cpu.V[4] = 0x2B;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si VX == NN', () => {
    const cpu = makeCpu([0x442A]);
    cpu.V[4] = 0x2A;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('bordes 0x00 y 0xFF', () => {
    let cpu = makeCpu([0x4F00]);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
    cpu = makeCpu([0x4FFF]);
    cpu.step();
    assert.equal(cpu.pc, 0x204);
    cpu = makeCpu([0x4FFF]);
    cpu.V[0xF] = 0xFF;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });
});

describe('5XY0 SE VX, VY', () => {
  it('salta si VX == VY', () => {
    const cpu = makeCpu([0x5AB0]);
    cpu.V[0xA] = 0x77;
    cpu.V[0xB] = 0x77;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si VX != VY', () => {
    const cpu = makeCpu([0x5AB0]);
    cpu.V[0xA] = 0x77;
    cpu.V[0xB] = 0x78;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('X == Y siempre salta', () => {
    const cpu = makeCpu([0x5330]);
    cpu.V[3] = 0x99;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no modifica registros', () => {
    const cpu = makeCpu([0x5120]);
    const before = fillRegisters(cpu);
    cpu.step();
    assertUntouched(cpu, before, []);
    assert.equal(cpu.pc, 0x202);
  });
});

describe('6XNN LD VX, NN', () => {
  it('carga NN en VX', () => {
    const cpu = makeCpu([0x6A2A]);
    const before = fillRegisters(cpu);
    cpu.step();
    assert.equal(cpu.V[0xA], 0x2A);
    assertUntouched(cpu, before, [0xA]);
    assert.equal(cpu.pc, 0x202);
  });

  it('carga 0x00 y 0xFF', () => {
    const cpu = makeCpu([0x6000, 0x6FFF]);
    cpu.V[0] = 0x55;
    runSteps(cpu, 2);
    assert.equal(cpu.V[0], 0x00);
    assert.equal(cpu.V[0xF], 0xFF);
  });
});

describe('7XNN ADD VX, NN', () => {
  it('suma sin tocar VF', () => {
    const cpu = makeCpu([0x7105]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 0x10;
    cpu.step();
    assert.equal(cpu.V[1], 0x15);
    assertUntouched(cpu, before, [1]);
  });

  it('desborda con wraparound y VF no cambia', () => {
    const cpu = makeCpu([0x7101]);
    cpu.V[1] = 0xFF;
    cpu.V[0xF] = 0x55;
    cpu.step();
    assert.equal(cpu.V[1], 0x00);
    assert.equal(cpu.V[0xF], 0x55);
  });

  it('0xFF + 0xFF = 0xFE y VF no cambia (VF = 0)', () => {
    const cpu = makeCpu([0x72FF]);
    cpu.V[2] = 0xFF;
    cpu.step();
    assert.equal(cpu.V[2], 0xFE);
    assert.equal(cpu.V[0xF], 0);
  });

  it('sumar 0 no cambia nada', () => {
    const cpu = makeCpu([0x7300]);
    cpu.V[3] = 0x42;
    cpu.step();
    assert.equal(cpu.V[3], 0x42);
  });

  it('7FNN suma a VF', () => {
    const cpu = makeCpu([0x7F02]);
    cpu.V[0xF] = 0xFF;
    cpu.step();
    assert.equal(cpu.V[0xF], 0x01);
  });
});

describe('8XY0 LD VX, VY', () => {
  it('copia VY en VX y VY no cambia', () => {
    const cpu = makeCpu([0x8120]);
    const before = fillRegisters(cpu);
    cpu.V[2] = 0xAB;
    cpu.step();
    assert.equal(cpu.V[1], 0xAB);
    assert.equal(cpu.V[2], 0xAB);
    assertUntouched(cpu, before, [1, 2]);
  });

  it('no toca VF', () => {
    const cpu = alu(0x80E0, { 0: 1, e: 0, f: 0x33 });
    assert.equal(cpu.V[0], 0);
    assert.equal(cpu.V[0xF], 0x33);
  });

  it('8XF0 copia VF', () => {
    const cpu = alu(0x85F0, { f: 0x9C });
    assert.equal(cpu.V[5], 0x9C);
  });
});

for (const [op, name, fn] of [
  [1, 'OR', (a, b) => a | b],
  [2, 'AND', (a, b) => a & b],
  [3, 'XOR', (a, b) => a ^ b],
]) {
  describe(`8XY${op} ${name} VX, VY`, () => {
    const opcode = 0x8120 | op;
    const cases = [
      [0b11001100, 0b10101010],
      [0x00, 0x00],
      [0xFF, 0x00],
      [0xFF, 0xFF],
      [0x0F, 0xF0],
    ];
    for (const [a, b] of cases) {
      it(`V1=0x${a.toString(16)} V2=0x${b.toString(16)} -> 0x${fn(a, b).toString(16)}`, () => {
        const cpu = makeCpu([opcode]);
        const before = fillRegisters(cpu);
        cpu.V[1] = a;
        cpu.V[2] = b;
        cpu.step();
        assert.equal(cpu.V[1], fn(a, b));
        assert.equal(cpu.V[2], b);
        assertUntouched(cpu, before, [1, 2, 0xF]);
        assert.equal(cpu.pc, 0x202);
      });
    }

    it('con vfReset (VIP, por defecto) VF queda en 0', () => {
      const cpu = alu(opcode, { 1: 0x0F, 2: 0xF0, f: 0x77 });
      assert.equal(cpu.V[0xF], 0);
    });

    it('sin vfReset VF no cambia', () => {
      const cpu = alu(opcode, { 1: 0x0F, 2: 0xF0, f: 0x77 }, { quirks: { vfReset: false } });
      assert.equal(cpu.V[0xF], 0x77);
    });

    it('X == F con vfReset: VF termina en 0 (el flag se escribe último)', () => {
      const cpu = alu(0x8F10 | op, { 1: 0x0F, f: 0xF3 });
      assert.equal(cpu.V[0xF], 0);
    });

    it('X == F sin vfReset: VF = resultado', () => {
      const cpu = alu(0x8F10 | op, { 1: 0x0F, f: 0xF3 }, { quirks: { vfReset: false } });
      assert.equal(cpu.V[0xF], fn(0xF3, 0x0F));
    });
  });
}

describe('8XY4 ADD VX, VY', () => {
  it('suma sin acarreo: VF = 0', () => {
    const cpu = makeCpu([0x8124]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 0x10;
    cpu.V[2] = 0x20;
    cpu.V[0xF] = 0x99;
    cpu.step();
    assert.equal(cpu.V[1], 0x30);
    assert.equal(cpu.V[2], 0x20);
    assert.equal(cpu.V[0xF], 0);
    assertUntouched(cpu, before, [1, 2, 0xF]);
  });

  it('exactamente 255 no es acarreo', () => {
    const cpu = alu(0x8124, { 1: 0xF0, 2: 0x0F, f: 1 });
    assert.equal(cpu.V[1], 0xFF);
    assert.equal(cpu.V[0xF], 0);
  });

  it('256 desborda: resultado 0 y VF = 1', () => {
    const cpu = alu(0x8124, { 1: 0xFF, 2: 0x01 });
    assert.equal(cpu.V[1], 0x00);
    assert.equal(cpu.V[0xF], 1);
  });

  it('0xFF + 0xFF = 0xFE con VF = 1', () => {
    const cpu = alu(0x8124, { 1: 0xFF, 2: 0xFF });
    assert.equal(cpu.V[1], 0xFE);
    assert.equal(cpu.V[0xF], 1);
  });

  it('0 + 0 = 0 con VF = 0', () => {
    const cpu = alu(0x8124, { f: 1 });
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.V[0xF], 0);
  });

  it('X == Y duplica el valor', () => {
    const cpu = alu(0x8334, { 3: 0x80 });
    assert.equal(cpu.V[3], 0x00);
    assert.equal(cpu.V[0xF], 1);
  });

  it('X == F con acarreo: VF termina en 1', () => {
    const cpu = alu(0x8F14, { f: 0xFF, 1: 0x01 });
    assert.equal(cpu.V[0xF], 1);
  });

  it('X == F sin acarreo: VF termina en 0', () => {
    const cpu = alu(0x8F14, { f: 0x10, 1: 0x20 });
    assert.equal(cpu.V[0xF], 0);
  });

  it('Y == F: usa el valor original de VF y luego escribe el flag', () => {
    const cpu = alu(0x81F4, { 1: 0xFE, f: 0x03 });
    assert.equal(cpu.V[1], 0x01);
    assert.equal(cpu.V[0xF], 1);
  });
});

describe('8XY5 SUB VX, VY', () => {
  it('5 - 3 = 2 con VF = 1 (sin préstamo)', () => {
    const cpu = makeCpu([0x8125]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 5;
    cpu.V[2] = 3;
    cpu.step();
    assert.equal(cpu.V[1], 2);
    assert.equal(cpu.V[2], 3);
    assert.equal(cpu.V[0xF], 1);
    assertUntouched(cpu, before, [1, 2, 0xF]);
  });

  it('3 - 5 = 0xFE con VF = 0 (préstamo)', () => {
    const cpu = alu(0x8125, { 1: 3, 2: 5, f: 1 });
    assert.equal(cpu.V[1], 0xFE);
    assert.equal(cpu.V[0xF], 0);
  });

  it('iguales: 0 con VF = 1', () => {
    const cpu = alu(0x8125, { 1: 0x42, 2: 0x42 });
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.V[0xF], 1);
  });

  it('0 - 0xFF = 1 con VF = 0', () => {
    const cpu = alu(0x8125, { 1: 0, 2: 0xFF, f: 1 });
    assert.equal(cpu.V[1], 1);
    assert.equal(cpu.V[0xF], 0);
  });

  it('0xFF - 0 = 0xFF con VF = 1', () => {
    const cpu = alu(0x8125, { 1: 0xFF, 2: 0 });
    assert.equal(cpu.V[1], 0xFF);
    assert.equal(cpu.V[0xF], 1);
  });

  it('X == F sin préstamo: VF termina en 1', () => {
    const cpu = alu(0x8F15, { f: 5, 1: 3 });
    assert.equal(cpu.V[0xF], 1);
  });

  it('X == F con préstamo: VF termina en 0', () => {
    const cpu = alu(0x8F15, { f: 3, 1: 5 });
    assert.equal(cpu.V[0xF], 0);
  });

  it('Y == F: compara los valores originales', () => {
    const cpu = alu(0x81F5, { 1: 10, f: 3 });
    assert.equal(cpu.V[1], 7);
    assert.equal(cpu.V[0xF], 1);
    const cpu2 = alu(0x81F5, { 1: 3, f: 10 });
    assert.equal(cpu2.V[1], 0xF9);
    assert.equal(cpu2.V[0xF], 0);
  });
});

describe('8XY6 SHR VX, VY', () => {
  it('shifting off (VIP): VX = VY >> 1, VF = bit menos significativo de VY', () => {
    const cpu = makeCpu([0x8126]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 0xFF;
    cpu.V[2] = 0x05;
    cpu.step();
    assert.equal(cpu.V[1], 0x02);
    assert.equal(cpu.V[2], 0x05);
    assert.equal(cpu.V[0xF], 1);
    assertUntouched(cpu, before, [1, 2, 0xF]);
  });

  it('shifting off: bit 0 en cero -> VF = 0', () => {
    const cpu = alu(0x8126, { 1: 0xFF, 2: 0x04, f: 1 });
    assert.equal(cpu.V[1], 0x02);
    assert.equal(cpu.V[0xF], 0);
  });

  it('shifting off: 0xFF -> 0x7F y 0x01 -> 0x00', () => {
    let cpu = alu(0x8126, { 2: 0xFF });
    assert.equal(cpu.V[1], 0x7F);
    assert.equal(cpu.V[0xF], 1);
    cpu = alu(0x8126, { 2: 0x01 });
    assert.equal(cpu.V[1], 0x00);
    assert.equal(cpu.V[0xF], 1);
  });

  it('shifting on: VX = VX >> 1, VF = bit 0 del VX original, VY se ignora', () => {
    const cpu = alu(0x8126, { 1: 0x05, 2: 0xF0 }, { quirks: { shifting: true } });
    assert.equal(cpu.V[1], 0x02);
    assert.equal(cpu.V[2], 0xF0);
    assert.equal(cpu.V[0xF], 1);
    const cpu2 = alu(0x8126, { 1: 0x80, 2: 0xFF, f: 1 }, { quirks: { shifting: true } });
    assert.equal(cpu2.V[1], 0x40);
    assert.equal(cpu2.V[0xF], 0);
  });

  it('X == F (shifting off): VF termina con el flag', () => {
    assert.equal(alu(0x8F26, { 2: 0x05 }).V[0xF], 1);
    assert.equal(alu(0x8F26, { 2: 0x04, f: 0xFF }).V[0xF], 0);
  });

  it('X == F (shifting on): VF termina con el bit desplazado', () => {
    const q = { quirks: { shifting: true } };
    assert.equal(alu(0x8F26, { f: 0x03 }, q).V[0xF], 1);
    assert.equal(alu(0x8F26, { f: 0xFE }, q).V[0xF], 0);
  });
});

describe('8XY7 SUBN VX, VY', () => {
  it('VX = VY - VX sin préstamo: VF = 1', () => {
    const cpu = makeCpu([0x8127]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 3;
    cpu.V[2] = 5;
    cpu.step();
    assert.equal(cpu.V[1], 2);
    assert.equal(cpu.V[2], 5);
    assert.equal(cpu.V[0xF], 1);
    assertUntouched(cpu, before, [1, 2, 0xF]);
  });

  it('con préstamo: 3 - 5 = 0xFE y VF = 0', () => {
    const cpu = alu(0x8127, { 1: 5, 2: 3, f: 1 });
    assert.equal(cpu.V[1], 0xFE);
    assert.equal(cpu.V[0xF], 0);
  });

  it('iguales: 0 con VF = 1', () => {
    const cpu = alu(0x8127, { 1: 0x80, 2: 0x80 });
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.V[0xF], 1);
  });

  it('0 - 0xFF (VY=0, VX=0xFF) = 1 con VF = 0', () => {
    const cpu = alu(0x8127, { 1: 0xFF, 2: 0, f: 1 });
    assert.equal(cpu.V[1], 1);
    assert.equal(cpu.V[0xF], 0);
  });

  it('X == F sin préstamo: VF termina en 1', () => {
    const cpu = alu(0x8F17, { f: 3, 1: 5 });
    assert.equal(cpu.V[0xF], 1);
  });

  it('X == F con préstamo: VF termina en 0', () => {
    const cpu = alu(0x8F17, { f: 5, 1: 3 });
    assert.equal(cpu.V[0xF], 0);
  });

  it('Y == F: compara valores originales', () => {
    const cpu = alu(0x81F7, { 1: 3, f: 10 });
    assert.equal(cpu.V[1], 7);
    assert.equal(cpu.V[0xF], 1);
  });
});

describe('8XYE SHL VX, VY', () => {
  it('shifting off (VIP): VX = VY << 1, VF = bit 7 de VY', () => {
    const cpu = makeCpu([0x812E]);
    const before = fillRegisters(cpu);
    cpu.V[1] = 0x00;
    cpu.V[2] = 0x81;
    cpu.step();
    assert.equal(cpu.V[1], 0x02);
    assert.equal(cpu.V[2], 0x81);
    assert.equal(cpu.V[0xF], 1);
    assertUntouched(cpu, before, [1, 2, 0xF]);
  });

  it('shifting off: bit 7 en cero -> VF = 0', () => {
    const cpu = alu(0x812E, { 1: 0xFF, 2: 0x40, f: 1 });
    assert.equal(cpu.V[1], 0x80);
    assert.equal(cpu.V[0xF], 0);
  });

  it('shifting off: 0xFF -> 0xFE', () => {
    const cpu = alu(0x812E, { 2: 0xFF });
    assert.equal(cpu.V[1], 0xFE);
    assert.equal(cpu.V[0xF], 1);
  });

  it('shifting on: VX = VX << 1, VF = bit 7 del VX original', () => {
    const q = { quirks: { shifting: true } };
    const cpu = alu(0x812E, { 1: 0x81, 2: 0x01 }, q);
    assert.equal(cpu.V[1], 0x02);
    assert.equal(cpu.V[2], 0x01);
    assert.equal(cpu.V[0xF], 1);
    const cpu2 = alu(0x812E, { 1: 0x7F, 2: 0xFF, f: 1 }, q);
    assert.equal(cpu2.V[1], 0xFE);
    assert.equal(cpu2.V[0xF], 0);
  });

  it('X == F (shifting off): VF termina con el flag', () => {
    assert.equal(alu(0x8F2E, { 2: 0x81 }).V[0xF], 1);
    assert.equal(alu(0x8F2E, { 2: 0x01, f: 0xFF }).V[0xF], 0);
  });

  it('X == F (shifting on): VF termina con el bit desplazado', () => {
    const q = { quirks: { shifting: true } };
    assert.equal(alu(0x8F2E, { f: 0x80 }, q).V[0xF], 1);
    assert.equal(alu(0x8F2E, { f: 0x7F }, q).V[0xF], 0);
  });
});

describe('9XY0 SNE VX, VY', () => {
  it('salta si VX != VY', () => {
    const cpu = makeCpu([0x9CD0]);
    cpu.V[0xC] = 1;
    cpu.V[0xD] = 2;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si VX == VY', () => {
    const cpu = makeCpu([0x9CD0]);
    cpu.V[0xC] = 0xFF;
    cpu.V[0xD] = 0xFF;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('X == Y nunca salta', () => {
    const cpu = makeCpu([0x9440]);
    cpu.V[4] = 0x12;
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('no modifica registros', () => {
    const cpu = makeCpu([0x9120]);
    const before = fillRegisters(cpu);
    cpu.step();
    assertUntouched(cpu, before, []);
    assert.equal(cpu.pc, 0x204);
  });
});

describe('ANNN LD I, NNN', () => {
  it('carga NNN en I', () => {
    const cpu = makeCpu([0xA2A0]);
    const before = fillRegisters(cpu);
    cpu.step();
    assert.equal(cpu.I, 0x2A0);
    assert.equal(cpu.pc, 0x202);
    assertUntouched(cpu, before, []);
  });

  it('bordes 0x000 y 0xFFF', () => {
    const cpu = makeCpu([0xA000, 0xAFFF]);
    cpu.I = 0x123;
    cpu.step();
    assert.equal(cpu.I, 0x000);
    cpu.step();
    assert.equal(cpu.I, 0xFFF);
  });

  it('reemplaza un I mayor a 0xFFF', () => {
    const cpu = makeCpu([0xA123]);
    cpu.I = 0xFFFF;
    cpu.step();
    assert.equal(cpu.I, 0x123);
  });
});

describe('BNNN JP V0, NNN', () => {
  it('jumping off (VIP): pc = NNN + V0', () => {
    const cpu = makeCpu([0xB300]);
    cpu.V[0] = 0x04;
    cpu.V[3] = 0x50; // no debe usarse
    cpu.step();
    assert.equal(cpu.pc, 0x304);
  });

  it('jumping off con V0 = 0', () => {
    const cpu = makeCpu([0xB456]);
    cpu.step();
    assert.equal(cpu.pc, 0x456);
  });

  it('jumping off: wraparound a 12 bits', () => {
    const cpu = makeCpu([0xBFFF]);
    cpu.V[0] = 0xFF;
    cpu.step();
    assert.equal(cpu.pc, 0x0FE);
  });

  it('jumping on (BXNN): pc = NNN + VX con X = nibble alto de NNN', () => {
    const cpu = makeCpu([0xB220], { quirks: { jumping: true } });
    cpu.V[0] = 0x55;
    cpu.V[2] = 0x10;
    cpu.step();
    assert.equal(cpu.pc, 0x230);
  });

  it('jumping on con X = 0 usa V0', () => {
    const cpu = makeCpu([0xB0F0], { quirks: { jumping: true } });
    cpu.V[0] = 0x0A;
    cpu.step();
    assert.equal(cpu.pc, 0x0FA);
  });

  it('jumping on: wraparound a 12 bits', () => {
    const cpu = makeCpu([0xBFF0], { quirks: { jumping: true } });
    cpu.V[0xF] = 0x20;
    cpu.step();
    assert.equal(cpu.pc, 0x010);
  });

  it('no modifica registros', () => {
    const cpu = makeCpu([0xB400]);
    const before = fillRegisters(cpu);
    cpu.step();
    assertUntouched(cpu, before, []);
  });
});

describe('CXNN RND VX, NN', () => {
  it('VX = random() & NN', () => {
    const cpu = makeCpu([0xC10F], { random: () => 0xAB });
    const before = fillRegisters(cpu);
    cpu.step();
    assert.equal(cpu.V[1], 0x0B);
    assertUntouched(cpu, before, [1]);
    assert.equal(cpu.pc, 0x202);
  });

  it('máscara 0xFF devuelve el valor aleatorio completo', () => {
    const cpu = makeCpu([0xC2FF], { random: () => 0xAB });
    cpu.step();
    assert.equal(cpu.V[2], 0xAB);
  });

  it('máscara 0x00 siempre da 0', () => {
    const cpu = makeCpu([0xC300], { random: () => 0xFF });
    cpu.V[3] = 0x77;
    cpu.step();
    assert.equal(cpu.V[3], 0);
  });

  it('usa un valor aleatorio nuevo en cada ejecución', () => {
    const seq = [0x12, 0x34, 0x56];
    let n = 0;
    const cpu = makeCpu([0xC0FF, 0xC1FF, 0xC2F0], { random: () => seq[n++] });
    runSteps(cpu, 3);
    assert.equal(cpu.V[0], 0x12);
    assert.equal(cpu.V[1], 0x34);
    assert.equal(cpu.V[2], 0x50);
    assert.equal(n, 3);
  });

  it('CFNN escribe en VF', () => {
    const cpu = makeCpu([0xCF3C], { random: () => 0xFF });
    cpu.step();
    assert.equal(cpu.V[0xF], 0x3C);
  });
});

describe('DXYN DRW VX, VY, N', () => {
  it('dibuja las filas del sprite desde memory[I]', () => {
    const cpu = makeCpu([0xD012]);
    cpu.I = 0x300;
    cpu.memory[0x300] = 0b10000001;
    cpu.memory[0x301] = 0b01000000;
    cpu.V[0] = 10;
    cpu.V[1] = 5;
    cpu.step();
    assert.equal(pixel(cpu, 10, 5), 1);
    assert.equal(pixel(cpu, 17, 5), 1);
    assert.equal(pixel(cpu, 11, 5), 0);
    assert.equal(pixel(cpu, 11, 6), 1);
    assert.equal(pixel(cpu, 10, 6), 0);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 3);
    assert.equal(cpu.V[0xF], 0);
    assert.equal(cpu.pc, 0x202);
  });

  it('dibujar dos veces borra y marca colisión', () => {
    const cpu = makeCpu([0xA050, 0xD005, 0xD005]); // glifo "0" de la fuente
    runSteps(cpu, 2);
    assert.equal(cpu.V[0xF], 0);
    assert.ok(cpu.display.some((p) => p === 1));
    cpu.step();
    assert.equal(cpu.V[0xF], 1);
    assert.ok(cpu.display.every((p) => p === 0));
  });

  it('no modifica I ni otros registros', () => {
    const cpu = makeCpu([0xD125]);
    const before = fillRegisters(cpu);
    cpu.I = FONT_ADDR;
    cpu.step();
    assert.equal(cpu.I, FONT_ADDR);
    assertUntouched(cpu, before, [0xF]);
  });
});

describe('EX9E SKP VX', () => {
  it('salta si la tecla VX está presionada', () => {
    const cpu = makeCpu([0xE39E]);
    cpu.V[3] = 0xA;
    cpu.setKey(0xA, true);
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si no está presionada', () => {
    const cpu = makeCpu([0xE39E]);
    cpu.V[3] = 0xA;
    cpu.setKey(0xB, true);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('no modifica registros', () => {
    const cpu = makeCpu([0xE09E]);
    const before = fillRegisters(cpu);
    cpu.step();
    assertUntouched(cpu, before, []);
  });
});

describe('EXA1 SKNP VX', () => {
  it('salta si la tecla VX no está presionada', () => {
    const cpu = makeCpu([0xE4A1]);
    cpu.V[4] = 0x0;
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('no salta si está presionada', () => {
    const cpu = makeCpu([0xE4A1]);
    cpu.V[4] = 0xF;
    cpu.setKey(0xF, true);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });
});

describe('FX07 LD VX, DT', () => {
  it('copia el delay timer en VX', () => {
    const cpu = makeCpu([0xF307]);
    const before = fillRegisters(cpu);
    cpu.delayTimer = 0x42;
    cpu.step();
    assert.equal(cpu.V[3], 0x42);
    assert.equal(cpu.delayTimer, 0x42);
    assertUntouched(cpu, before, [3]);
  });

  it('bordes 0 y 255', () => {
    const cpu = makeCpu([0xF007, 0xF107]);
    cpu.V[0] = 9;
    cpu.step();
    assert.equal(cpu.V[0], 0);
    cpu.delayTimer = 255;
    cpu.step();
    assert.equal(cpu.V[1], 255);
  });
});

describe('FX0A LD VX, K', () => {
  it('bloquea hasta que se presiona y suelta una tecla, y guarda la tecla en VX', () => {
    const cpu = makeCpu([0xF50A, 0x6101]);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.pc, 0x202);
    assert.equal(cpu.waitingForKey, true);
    assert.equal(cpu.step(), false);
    assert.equal(cpu.pc, 0x202);
    cpu.setKey(0xC, true);
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(0xC, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[5], 0xC);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.V[1], 1);
  });

  it('tecla 0 escribe 0 en VX', () => {
    const cpu = makeCpu([0xF20A]);
    cpu.V[2] = 0xFF;
    cpu.step();
    cpu.setKey(0, true);
    cpu.setKey(0, false);
    assert.equal(cpu.V[2], 0);
    assert.equal(cpu.waitingForKey, false);
  });
});

describe('FX15 LD DT, VX', () => {
  it('carga VX en el delay timer', () => {
    const cpu = makeCpu([0xF615]);
    const before = fillRegisters(cpu);
    cpu.V[6] = 0x3C;
    cpu.step();
    assert.equal(cpu.delayTimer, 0x3C);
    assert.equal(cpu.soundTimer, 0);
    assertUntouched(cpu, before, [6]);
  });

  it('carga 0 y 255', () => {
    const cpu = makeCpu([0xF015, 0xF115]);
    cpu.delayTimer = 50;
    cpu.step();
    assert.equal(cpu.delayTimer, 0);
    cpu.V[1] = 255;
    cpu.step();
    assert.equal(cpu.delayTimer, 255);
  });
});

describe('FX18 LD ST, VX', () => {
  it('carga VX en el sound timer', () => {
    const cpu = makeCpu([0xF718]);
    cpu.V[7] = 0x20;
    cpu.step();
    assert.equal(cpu.soundTimer, 0x20);
    assert.equal(cpu.delayTimer, 0);
  });

  it('carga 0 y 255', () => {
    const cpu = makeCpu([0xF018, 0xF118]);
    cpu.soundTimer = 9;
    cpu.step();
    assert.equal(cpu.soundTimer, 0);
    cpu.V[1] = 0xFF;
    cpu.step();
    assert.equal(cpu.soundTimer, 0xFF);
  });
});

describe('FX1E ADD I, VX', () => {
  it('suma VX a I', () => {
    const cpu = makeCpu([0xF11E]);
    const before = fillRegisters(cpu);
    cpu.I = 0x100;
    cpu.V[1] = 0x05;
    cpu.step();
    assert.equal(cpu.I, 0x105);
    assertUntouched(cpu, before, [1]);
  });

  it('VF no se modifica al pasar de 0xFFF', () => {
    const cpu = makeCpu([0xF11E]);
    cpu.I = 0xFFF;
    cpu.V[1] = 0x01;
    cpu.V[0xF] = 0x77;
    cpu.step();
    assert.equal(cpu.I, 0x1000);
    assert.equal(cpu.V[0xF], 0x77);
  });

  it('I se mantiene en 16 bits', () => {
    const cpu = makeCpu([0xF11E]);
    cpu.I = 0xFFFF;
    cpu.V[1] = 0x02;
    cpu.step();
    assert.equal(cpu.I, 0x0001);
  });

  it('X == F: suma VF y VF no cambia', () => {
    const cpu = makeCpu([0xFF1E]);
    cpu.I = 0x200;
    cpu.V[0xF] = 0x10;
    cpu.step();
    assert.equal(cpu.I, 0x210);
    assert.equal(cpu.V[0xF], 0x10);
  });

  it('sumar 0 no cambia I', () => {
    const cpu = makeCpu([0xF01E]);
    cpu.I = 0x345;
    cpu.step();
    assert.equal(cpu.I, 0x345);
  });
});

describe('FX29 LD F, VX', () => {
  for (let d = 0; d < 16; d++) {
    it(`dígito ${d.toString(16).toUpperCase()} -> I = 0x${(FONT_ADDR + d * 5).toString(16)}`, () => {
      const cpu = makeCpu([0xF829]);
      cpu.V[8] = d;
      cpu.step();
      assert.equal(cpu.I, FONT_ADDR + d * 5);
      assert.equal(cpu.V[8], d);
    });
  }

  it('usa solo el nibble bajo de VX', () => {
    const cpu = makeCpu([0xF129, 0xF229]);
    cpu.V[1] = 0x1A;
    cpu.V[2] = 0xFF;
    cpu.step();
    assert.equal(cpu.I, 0x050 + 10 * 5);
    cpu.step();
    assert.equal(cpu.I, 0x050 + 15 * 5);
  });
});

describe('FX33 LD B, VX', () => {
  for (const [value, digits] of [
    [0, [0, 0, 0]],
    [7, [0, 0, 7]],
    [42, [0, 4, 2]],
    [100, [1, 0, 0]],
    [255, [2, 5, 5]],
  ]) {
    it(`${value} -> ${digits.join(', ')}`, () => {
      const cpu = makeCpu([0xF433]);
      const before = fillRegisters(cpu);
      cpu.V[4] = value;
      cpu.I = 0x300;
      cpu.memory.fill(0xEE, 0x300, 0x304);
      cpu.step();
      assert.deepEqual(Array.from(cpu.memory.slice(0x300, 0x303)), digits);
      assert.equal(cpu.memory[0x303], 0xEE, 'no escribe más allá de I+2');
      assert.equal(cpu.I, 0x300);
      assertUntouched(cpu, before, [4]);
    });
  }

  it('las direcciones pasan de 0xFFF a 0x000', () => {
    const cpu = makeCpu([0xF033]);
    cpu.V[0] = 123;
    cpu.I = 0xFFF;
    cpu.step();
    assert.equal(cpu.memory[0xFFF], 1);
    assert.equal(cpu.memory[0x000], 2);
    assert.equal(cpu.memory[0x001], 3);
    assert.equal(cpu.I, 0xFFF);
  });
});

describe('FX55 LD [I], VX', () => {
  it('guarda V0..VX (inclusive) desde I', () => {
    const cpu = makeCpu([0xF355]);
    const before = fillRegisters(cpu);
    cpu.I = 0x400;
    cpu.memory.fill(0xEE, 0x400, 0x410);
    cpu.step();
    assert.deepEqual(Array.from(cpu.memory.slice(0x400, 0x404)), before.slice(0, 4));
    assert.equal(cpu.memory[0x404], 0xEE, 'no guarda V4');
    assertUntouched(cpu, before, []);
  });

  it('memory on (VIP): I = I + X + 1', () => {
    const cpu = makeCpu([0xF355]);
    cpu.I = 0x400;
    cpu.step();
    assert.equal(cpu.I, 0x404);
  });

  it('memory off: I no cambia', () => {
    const cpu = makeCpu([0xF355], { quirks: { memory: false } });
    cpu.I = 0x400;
    cpu.step();
    assert.equal(cpu.I, 0x400);
  });

  it('F055 guarda solo V0', () => {
    const cpu = makeCpu([0xF055]);
    cpu.V[0] = 0x11;
    cpu.V[1] = 0x22;
    cpu.I = 0x500;
    cpu.step();
    assert.equal(cpu.memory[0x500], 0x11);
    assert.equal(cpu.memory[0x501], 0x00);
    assert.equal(cpu.I, 0x501);
  });

  it('FF55 guarda los 16 registros', () => {
    const cpu = makeCpu([0xFF55]);
    const before = fillRegisters(cpu);
    cpu.I = 0x600;
    cpu.step();
    assert.deepEqual(Array.from(cpu.memory.slice(0x600, 0x610)), before);
    assert.equal(cpu.I, 0x610);
  });

  it('las direcciones pasan de 0xFFF a 0x000', () => {
    const cpu = makeCpu([0xF255]);
    cpu.V[0] = 0xA1;
    cpu.V[1] = 0xB2;
    cpu.V[2] = 0xC3;
    cpu.I = 0xFFE;
    cpu.step();
    assert.equal(cpu.memory[0xFFE], 0xA1);
    assert.equal(cpu.memory[0xFFF], 0xB2);
    assert.equal(cpu.memory[0x000], 0xC3);
    assert.equal(cpu.I, 0x1001);
  });
});

describe('FX65 LD VX, [I]', () => {
  it('carga V0..VX (inclusive) desde I', () => {
    const cpu = makeCpu([0xF365]);
    const before = fillRegisters(cpu);
    cpu.I = 0x400;
    cpu.memory.set([0xA0, 0xA1, 0xA2, 0xA3, 0xA4], 0x400);
    cpu.step();
    assert.deepEqual(Array.from(cpu.V.slice(0, 4)), [0xA0, 0xA1, 0xA2, 0xA3]);
    assertUntouched(cpu, before, [0, 1, 2, 3]);
  });

  it('memory on (VIP): I = I + X + 1', () => {
    const cpu = makeCpu([0xF365]);
    cpu.I = 0x400;
    cpu.step();
    assert.equal(cpu.I, 0x404);
  });

  it('memory off: I no cambia', () => {
    const cpu = makeCpu([0xF365], { quirks: { memory: false } });
    cpu.I = 0x400;
    cpu.step();
    assert.equal(cpu.I, 0x400);
  });

  it('FF65 carga los 16 registros (VF incluido)', () => {
    const cpu = makeCpu([0xFF65]);
    cpu.I = 0x700;
    for (let i = 0; i < 16; i++) cpu.memory[0x700 + i] = 0xF0 - i;
    cpu.step();
    for (let i = 0; i < 16; i++) assert.equal(cpu.V[i], 0xF0 - i);
    assert.equal(cpu.I, 0x710);
  });

  it('F065 carga solo V0', () => {
    const cpu = makeCpu([0xF065]);
    cpu.V[1] = 0x33;
    cpu.I = 0x400;
    cpu.memory[0x400] = 0x99;
    cpu.memory[0x401] = 0x88;
    cpu.step();
    assert.equal(cpu.V[0], 0x99);
    assert.equal(cpu.V[1], 0x33);
    assert.equal(cpu.I, 0x401);
  });

  it('las direcciones pasan de 0xFFF a 0x000', () => {
    const cpu = makeCpu([0xF165]);
    cpu.I = 0xFFF;
    cpu.memory[0xFFF] = 0x5A;
    cpu.memory[0x000] = 0x6B;
    cpu.step();
    assert.equal(cpu.V[0], 0x5A);
    assert.equal(cpu.V[1], 0x6B);
  });

  it('round trip FX55 -> FX65', () => {
    // LD I,0x500 | LD [I],V7 | (borra V0..V7 a mano) | LD I,0x500 | LD V7,[I]
    const cpu = makeCpu([0xA500, 0xF755, 0xA500, 0xF765]);
    const before = fillRegisters(cpu);
    runSteps(cpu, 2);
    cpu.V.fill(0, 0, 8);
    runSteps(cpu, 2);
    assert.deepEqual(Array.from(cpu.V), before);
  });
});
