'use strict';
// Instrucciones de XO-CHIP: rangos de registros (5XY2/5XY3), I := long (F000 NNNN), los
// saltos condicionales sobre F000 NNNN, los dos planos de dibujo (FN01, con DXYN, 00E0 y
// los desplazamientos), 00DN, el audio (F002, FX3A y patternRate) y la memoria de 64 KB.
// Las pantallas esperadas se calculan acá con una referencia mínima, independiente del núcleo.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, pixel, renderAscii } = require('./harness');

const { patternRate } = loadCore();
const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');

function xo(program, options = {}) {
  return makeCpu(program, { platform: 'xochip', ...options });
}

// Como xo, pero arrancando en alta resolución (el 00FF ya se ejecutó; pc en 0x202).
function xoHires(program, options = {}) {
  const cpu = xo([0x00FF, ...program], options);
  cpu.step();
  return cpu;
}

// `before` movido (dx, dy) sin dar la vuelta; lo que queda libre, en 0.
function shifted(before, w, h, dx, dy) {
  const out = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * w + x] = before[sy * w + sx];
    }
  }
  return out;
}

// Mueve solo los bits de los planos elegidos; los otros planos quedan como estaban.
function planeShift(before, w, h, dx, dy, planes) {
  const moved = shifted(before.map((v) => v & planes), w, h, dx, dy);
  return before.map((v, i) => (v & ~planes & 3) | moved[i]);
}

// Pantalla con valores de 0 a 3 en un patrón reconocible; devuelve una copia.
function fill4(cpu) {
  const w = cpu.displayWidth;
  for (let i = 0; i < cpu.display.length; i++) cpu.display[i] = ((i % w) * 5 + Math.floor(i / w) * 3) % 7 & 3;
  return Array.from(cpu.display);
}

function assertScreen(cpu, expected, msg = '') {
  const actual = Array.from(cpu.display);
  if (actual.every((v, i) => v === expected[i])) return;
  const fake = { display: expected, displayWidth: cpu.displayWidth, displayHeight: cpu.displayHeight };
  assert.fail(msg + '\nesperado:\n' + renderAscii(fake) + '\nobtenido:\n' + renderAscii(cpu));
}

describe('5XY2 SAVE VX, VY y 5XY3 LOAD VX, VY', () => {
  // Registros 0xA0..0xAF; memoria alrededor de I = 0x400 con 0xEE.
  function prepared(program, options) {
    const cpu = xo(program, options);
    for (let i = 0; i < 16; i++) cpu.V[i] = 0xA0 + i;
    cpu.I = 0x400;
    cpu.memory.fill(0xEE, 0x3F0, 0x420);
    return cpu;
  }
  const around = (cpu, n) => Array.from(cpu.memory.slice(0x3FF, 0x400 + n + 1));

  it('SAVE ascendente: V1..V4 en I..I+3; I no cambia', () => {
    const cpu = prepared([0x5142]);
    assert.equal(cpu.step(), true);
    assert.deepEqual(around(cpu, 4), [0xEE, 0xA1, 0xA2, 0xA3, 0xA4, 0xEE]);
    assert.equal(cpu.I, 0x400);
  });

  it('SAVE descendente (X > Y): V4, V3, V2, V1 en orden de memoria', () => {
    const cpu = prepared([0x5412]);
    cpu.step();
    assert.deepEqual(around(cpu, 4), [0xEE, 0xA4, 0xA3, 0xA2, 0xA1, 0xEE]);
    assert.equal(cpu.I, 0x400);
  });

  it('SAVE con X == Y guarda un solo registro', () => {
    const cpu = prepared([0x5332]);
    cpu.step();
    assert.deepEqual(around(cpu, 1), [0xEE, 0xA3, 0xEE]);
  });

  it('SAVE V0, VF guarda los 16 registros; SAVE VF, V0, al revés', () => {
    const up = prepared([0x50F2]);
    up.step();
    assert.deepEqual(Array.from(up.memory.slice(0x400, 0x410)), Array.from({ length: 16 }, (_, i) => 0xA0 + i));
    const down = prepared([0x5F02]);
    down.step();
    assert.deepEqual(Array.from(down.memory.slice(0x400, 0x410)), Array.from({ length: 16 }, (_, i) => 0xAF - i));
  });

  it('LOAD ascendente: V1..V4 desde I..I+3; los demás registros e I no cambian', () => {
    const cpu = prepared([0x5143]);
    cpu.memory.set([1, 2, 3, 4], 0x400);
    cpu.step();
    assert.deepEqual(Array.from(cpu.V), [0xA0, 1, 2, 3, 4, ...Array.from({ length: 11 }, (_, i) => 0xA5 + i)]);
    assert.equal(cpu.I, 0x400);
  });

  it('LOAD descendente (X > Y): V4 = memory[I], V3 = memory[I + 1], ...', () => {
    const cpu = prepared([0x5413]);
    cpu.memory.set([1, 2, 3, 4], 0x400);
    cpu.step();
    assert.deepEqual(Array.from(cpu.V.slice(0, 6)), [0xA0, 4, 3, 2, 1, 0xA5]);
    assert.equal(cpu.I, 0x400);
  });

  it('LOAD con X == Y carga un solo registro; LOAD VE, VF incluye VF', () => {
    const one = prepared([0x5773]);
    one.memory[0x400] = 0x42;
    one.step();
    assert.equal(one.V[7], 0x42);
    assert.equal(one.V[8], 0xA8);
    const flag = prepared([0x5EF3]);
    flag.memory.set([0x11, 0x22], 0x400);
    flag.step();
    assert.equal(flag.V[0xE], 0x11);
    assert.equal(flag.V[0xF], 0x22);
  });

  it('invertir 4 bytes en el lugar: LOAD V0, V3 y SAVE V3, V0 (el ejemplo de la especificación)', () => {
    const cpu = xo([0x5033, 0x5302]);
    cpu.I = 0x500;
    cpu.memory.set([1, 2, 3, 4], 0x500);
    runSteps(cpu, 2);
    assert.deepEqual(Array.from(cpu.memory.slice(0x500, 0x504)), [4, 3, 2, 1]);
  });

  it('con el quirk memory, I tampoco cambia (eso es solo para FX55/FX65)', () => {
    const cpu = prepared([0x5142, 0x5143], { quirks: { memory: true } });
    runSteps(cpu, 2);
    assert.equal(cpu.I, 0x400);
  });

  it('la memoria da la vuelta en 0xFFFF', () => {
    const cpu = prepared([0x5032, 0x5473]);
    cpu.I = 0xFFFE;
    cpu.step();
    assert.deepEqual([cpu.memory[0xFFFE], cpu.memory[0xFFFF], cpu.memory[0x0000], cpu.memory[0x0001]], [0xA0, 0xA1, 0xA2, 0xA3]);
    cpu.step(); // LOAD V4, V7 desde 0xFFFE
    assert.deepEqual(Array.from(cpu.V.slice(4, 8)), [0xA0, 0xA1, 0xA2, 0xA3]);
  });
});

describe('F000 NNNN: I := long NNNN', () => {
  it('carga I con la palabra siguiente y avanza pc 4 bytes', () => {
    const cpu = xo([0xF000, 0x1234, 0x6001]);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.I, 0x1234);
    assert.equal(cpu.pc, 0x204);
    cpu.step();
    assert.equal(cpu.V[0], 1);
  });

  it('el operando no se ejecuta como instrucción', () => {
    const cpu = xo([0xF000, 0x00E0]);
    cpu.display[0] = 1;
    cpu.step();
    assert.equal(cpu.display[0], 1);
    assert.equal(cpu.I, 0x00E0);
  });

  it('I puede tomar cualquier valor de 16 bits', () => {
    for (const value of [0x0000, 0x0FFF, 0x1000, 0xABCD, 0xFFFF]) {
      const cpu = xo([0xF000, value]);
      cpu.step();
      assert.equal(cpu.I, value, hex(value));
    }
  });

  it('no toca los registros', () => {
    const cpu = xo([0xF000, 0x1234]);
    cpu.V.fill(9);
    cpu.step();
    assert.ok(cpu.V.every((v) => v === 9));
  });

  it('al final de la memoria: F000 en 0xFFFC lee 0xFFFE-0xFFFF y pc pasa a 0x0000', () => {
    const cpu = xo([]);
    cpu.memory.set([0xF0, 0x00, 0xBE, 0xEF], 0xFFFC);
    cpu.pc = 0xFFFC;
    cpu.step();
    assert.equal(cpu.I, 0xBEEF);
    assert.equal(cpu.pc, 0x0000);
  });

  it('F000 en 0xFFFE: el operando está en 0x0000-0x0001 y pc queda en 0x0002', () => {
    const cpu = xo([]);
    cpu.memory.set([0xF0, 0x00], 0xFFFE);
    cpu.memory.set([0x12, 0x34], 0x0000);
    cpu.pc = 0xFFFE;
    cpu.step();
    assert.equal(cpu.I, 0x1234);
    assert.equal(cpu.pc, 0x0002);
  });
});

describe('saltos condicionales: saltean F000 NNNN entera', () => {
  // [instrucción, opcode, preparar para que salte, preparar para que no salte]
  const SKIPS = [
    ['3XNN SE VX, NN', 0x3142, (c) => { c.V[1] = 0x42; }, (c) => { c.V[1] = 0x41; }],
    ['4XNN SNE VX, NN', 0x4142, (c) => { c.V[1] = 0x41; }, (c) => { c.V[1] = 0x42; }],
    ['5XY0 SE VX, VY', 0x5120, (c) => { c.V[1] = 7; c.V[2] = 7; }, (c) => { c.V[1] = 7; c.V[2] = 8; }],
    ['9XY0 SNE VX, VY', 0x9120, (c) => { c.V[1] = 7; c.V[2] = 8; }, (c) => { c.V[1] = 7; c.V[2] = 7; }],
    ['EX9E SKP VX', 0xE19E, (c) => { c.V[1] = 5; c.setKey(5, true); }, (c) => { c.V[1] = 5; }],
    ['EXA1 SKNP VX', 0xE1A1, (c) => { c.V[1] = 5; }, (c) => { c.V[1] = 5; c.setKey(5, true); }],
  ];

  for (const [name, op, skip, noSkip] of SKIPS) {
    describe(name, () => {
      it('salta 4 bytes si lo que sigue es F000 NNNN', () => {
        const cpu = xo([op, 0xF000, 0x1234, 0x6001]);
        skip(cpu);
        cpu.step();
        assert.equal(cpu.pc, 0x206);
        assert.equal(cpu.I, 0);
        cpu.step();
        assert.equal(cpu.V[0], 1);
      });

      it('salta 2 bytes sobre una instrucción común, también si empieza con F0 (F01E)', () => {
        const cpu = xo([op, 0x6005, 0x6001]);
        skip(cpu);
        cpu.step();
        assert.equal(cpu.pc, 0x204);
        cpu.step();
        assert.equal(cpu.V[0], 1);
        const f0 = xo([op, 0xF01E, 0x6001]);
        skip(f0);
        f0.step();
        assert.equal(f0.pc, 0x204);
      });

      it('si no salta, F000 NNNN se ejecuta entera', () => {
        const cpu = xo([op, 0xF000, 0x1234, 0x6001]);
        noSkip(cpu);
        cpu.step();
        assert.equal(cpu.pc, 0x202);
        cpu.step();
        assert.equal(cpu.I, 0x1234);
        assert.equal(cpu.pc, 0x206);
      });

      it('en CHIP-8 y SUPER-CHIP salta 2 bytes también sobre F000', () => {
        for (const platform of ['chip8', 'schip']) {
          const cpu = makeCpu([op, 0xF000, 0x1234], { platform });
          skip(cpu);
          cpu.step();
          assert.equal(cpu.pc, 0x204, platform);
        }
      });
    });
  }

  it('al final de la memoria: un F000 NNNN en 0xFFFE se saltea hasta 0x0002', () => {
    const cpu = xo([]);
    cpu.memory.set([0x30, 0x00, 0xF0, 0x00], 0xFFFC); // SE V0, 0 | F000 (operando en 0x0000)
    cpu.pc = 0xFFFC;
    cpu.step();
    assert.equal(cpu.pc, 0x0002);
  });

  it('un F000 partido entre 0xFFFF y 0x0000 también se reconoce', () => {
    const cpu = xo([]);
    cpu.memory.set([0x30, 0x00], 0xFFFD); // SE V0, 0 en 0xFFFD (dirección impar)
    cpu.memory[0xFFFF] = 0xF0;
    cpu.memory[0x0000] = 0x00;
    cpu.pc = 0xFFFD;
    cpu.step();
    assert.equal(cpu.pc, 0x0003);
  });

  it('la detección de XO-CHIP de la especificación: if vf != vf then 0xF0 0x00 jump NO_SUPPORT', () => {
    // 200: SE VF, VF (siempre salta) | 202: F0 00 | 204: JP 0x20A (sin XO-CHIP) | 206: JP 0x20C (con XO-CHIP)
    // 20A: LD V0, 1 | 20C: LD V0, 2
    for (const [platform, expected] of [['xochip', 2], ['schip', 1], ['chip8', 1]]) {
      const cpu = makeCpu([0x5FF0, 0xF000, 0x120A, 0x120C, 0x0000, 0x6001, 0x6002], { platform });
      runSteps(cpu, 3);
      assert.equal(cpu.V[0], expected, platform);
      assert.equal(cpu.halted, false, platform);
    }
  });
});

describe('FN01 PLANE N y el dibujo en dos planos', () => {
  it('por defecto dibuja en el plano 1 (valores 1)', () => {
    const cpu = xo([0xD011]);
    cpu.I = 0x300;
    cpu.memory[0x300] = 0xC0;
    cpu.step();
    assert.deepEqual([pixel(cpu, 0, 0), pixel(cpu, 1, 0), pixel(cpu, 2, 0)], [1, 1, 0]);
  });

  it('PLANE N elige los planos (0 a 3) y no toca la pantalla', () => {
    const cpu = xo([0xF001, 0xF101, 0xF201, 0xF301]);
    cpu.display[3] = 3;
    for (const want of [0, 1, 2, 3]) {
      cpu.step();
      assert.equal(cpu.planes, want);
      assert.equal(cpu.display[3], 3);
    }
  });

  it('PLANE 2: dibuja solo en el plano 2, con los datos desde I; el plano 1 no cuenta para VF', () => {
    const cpu = xo([0xF201, 0xD012]);
    cpu.I = 0x300;
    cpu.memory.set([0xC0, 0x80], 0x300);
    cpu.display[0] = 1; // plano 1 encendido en (0, 0)
    runSteps(cpu, 2);
    assert.deepEqual([pixel(cpu, 0, 0), pixel(cpu, 1, 0), pixel(cpu, 0, 1), pixel(cpu, 1, 1)], [3, 2, 2, 0]);
    assert.equal(cpu.V[0xF], 0);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 3 + 2 + 2);
  });

  it('PLANE 3: el plano 1 usa los primeros N bytes y el plano 2 los N siguientes', () => {
    const cpu = xo([0xF301, 0xD012]);
    cpu.I = 0x300;
    cpu.memory.set([0xF0, 0x0F, 0xFF, 0x00, 0x99], 0x300); // plano 1: F0 0F | plano 2: FF 00 | sobra 99
    runSteps(cpu, 2);
    const row = (y) => Array.from({ length: 8 }, (_, x) => pixel(cpu, x, y));
    assert.deepEqual(row(0), [3, 3, 3, 3, 2, 2, 2, 2]);
    assert.deepEqual(row(1), [0, 0, 0, 0, 1, 1, 1, 1]);
    assert.deepEqual(row(2), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(cpu.I, 0x300, 'I no cambia');
  });

  it('PLANE 3 con 16x16: 32 bytes por plano', () => {
    const cpu = xo([0xF301, 0xD010]);
    cpu.I = 0x300;
    cpu.memory.fill(0, 0x300, 0x340);
    cpu.memory[0x300] = 0x80; // plano 1, fila 0, columna 0
    cpu.memory[0x31F] = 0x01; // plano 1, fila 15, columna 15
    cpu.memory[0x320] = 0x80; // plano 2, fila 0, columna 0
    cpu.memory[0x321] = 0x01; // plano 2, fila 0, columna 15
    runSteps(cpu, 2);
    assert.equal(pixel(cpu, 0, 0), 3);
    assert.equal(pixel(cpu, 15, 15), 1);
    assert.equal(pixel(cpu, 15, 0), 2);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 3 + 1 + 2);
  });

  it('PLANE 2 con 16x16 usa los 32 bytes desde I', () => {
    const cpu = xo([0xF201, 0xD010]);
    cpu.I = 0x300;
    cpu.memory.fill(0, 0x300, 0x340);
    cpu.memory[0x301] = 0x01;
    runSteps(cpu, 2);
    assert.equal(pixel(cpu, 15, 0), 2);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 2);
  });

  it('PLANE 0: no dibuja nada y deja VF = 0', () => {
    const cpu = xo([0xF001, 0xD015, 0xD010]);
    cpu.I = 0x300;
    cpu.memory.fill(0xFF, 0x300, 0x340);
    cpu.display[0] = 3;
    cpu.V[0xF] = 1;
    runSteps(cpu, 2);
    assert.equal(cpu.V[0xF], 0);
    cpu.V[0xF] = 1;
    cpu.step();
    assert.equal(cpu.V[0xF], 0);
    assert.equal(cpu.display[0], 3);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 3);
  });

  it('colisión en el plano 2: VF = 1 y el píxel del plano 2 se apaga', () => {
    const cpu = xo([0xF201, 0xD011]);
    cpu.I = 0x300;
    cpu.memory[0x300] = 0x80;
    cpu.display[0] = 2;
    runSteps(cpu, 2);
    assert.equal(cpu.V[0xF], 1);
    assert.equal(cpu.display[0], 0);
  });

  it('con los dos planos elegidos, una colisión en cualquiera de los dos da VF = 1', () => {
    for (const [lit, data, after] of [[1, [0x80, 0x00], 0], [2, [0x00, 0x80], 0], [1, [0x00, 0x80], 3]]) {
      const cpu = xo([0xF301, 0xD011]);
      cpu.I = 0x300;
      cpu.memory.set(data, 0x300);
      cpu.display[0] = lit;
      runSteps(cpu, 2);
      assert.equal(cpu.V[0xF], after === 3 ? 0 : 1, `plano ${lit} encendido, datos ${data}`);
      assert.equal(cpu.display[0], after);
    }
  });

  it('XOR por plano: valores de 0 a 3, y renderAscii los muestra como . # + @', () => {
    // PLANE 1 | DRW 0,0: 0xA0 | PLANE 2 | DRW 0,0: 0x60
    const cpu = xo([0xF101, 0xD011, 0xF201, 0xA301, 0xD011]);
    cpu.I = 0x300;
    cpu.memory.set([0xA0, 0x60], 0x300);
    runSteps(cpu, 5);
    assert.deepEqual([0, 1, 2, 3].map((x) => pixel(cpu, x, 0)), [1, 2, 3, 0]);
    assert.equal(renderAscii(cpu).split('\n')[0].slice(0, 4), '#+@.');
    assert.equal(renderAscii(cpu, 'X', '_').split('\n')[0].slice(0, 4), 'X+@_');
  });

  it('en alta resolución también, con las coordenadas módulo 128 y 64', () => {
    const cpu = xoHires([0xF301, 0xD012]);
    cpu.I = 0x300;
    cpu.memory.set([0x80, 0x00, 0x80, 0x80], 0x300);
    cpu.V[0] = 130;
    cpu.V[1] = 70;
    runSteps(cpu, 2);
    assert.equal(pixel(cpu, 2, 6), 3);
    assert.equal(pixel(cpu, 2, 7), 2);
  });

  it('reset y loadRom vuelven a PLANE 1', () => {
    const cpu = xo([0xF201]);
    cpu.step();
    cpu.reset();
    assert.equal(cpu.planes, 1);
    cpu.step();
    cpu.loadRom([0x00, 0xE0]);
    assert.equal(cpu.planes, 1);
  });

  it('FN01 con N de 4 a 15 no existe: instrucción inválida (y planes no cambia)', () => {
    for (let n = 4; n <= 15; n++) {
      const op = 0xF001 | (n << 8);
      const cpu = xo([op]);
      assert.equal(cpu.step(), false, hex(op));
      assert.equal(cpu.errorInfo.kind, 'invalid');
      assert.equal(cpu.planes, 1);
    }
  });
});

describe('00E0 y los desplazamientos actúan solo sobre los planos elegidos', () => {
  const SCROLLS = [['00C2 SCD 2', 0x00C2, 0, 2], ['00D2 SCU 2', 0x00D2, 0, -2], ['00FB SCR', 0x00FB, 4, 0], ['00FC SCL', 0x00FC, -4, 0]];

  for (const hires of [false, true]) {
    const res = hires ? 'alta' : 'baja';
    for (const planes of [1, 2, 3, 0]) {
      it(`${res} resolución, PLANE ${planes}: 00E0 borra solo esos planos`, () => {
        const cpu = (hires ? xoHires : xo)([0xF001 | (planes << 8), 0x00E0]);
        const before = fill4(cpu);
        runSteps(cpu, 2);
        assertScreen(cpu, before.map((v) => v & ~planes & 3));
        assert.equal(cpu.displayDirty, true);
      });

      for (const [name, op, dx, dy] of SCROLLS) {
        it(`${res} resolución, PLANE ${planes}: ${name}`, () => {
          const cpu = (hires ? xoHires : xo)([0xF001 | (planes << 8), op]);
          const before = fill4(cpu);
          runSteps(cpu, 2);
          assertScreen(cpu, planeShift(before, cpu.displayWidth, cpu.displayHeight, dx, dy, planes));
        });
      }
    }
  }

  it('00FE y 00FF borran los dos planos aunque haya uno solo elegido', () => {
    for (const op of [0x00FF, 0x00FE, 0x00FF]) {
      const cpu = xo([0xF101, op]);
      fill4(cpu);
      runSteps(cpu, 2);
      assert.ok(cpu.display.every((v) => v === 0), hex(op));
    }
    const cpu = xoHires([0xF201, 0x00FF]);
    fill4(cpu);
    runSteps(cpu, 2);
    assert.ok(cpu.display.every((v) => v === 0));
  });
});

describe('00DN SCU N: desplaza hacia arriba', () => {
  for (const hires of [false, true]) {
    for (const n of [1, 6, 15]) {
      it(`${hires ? 'alta' : 'baja'} resolución, N = ${n}, los dos planos: abajo quedan N filas vacías`, () => {
        const cpu = (hires ? xoHires : xo)([0xF301, 0x00D0 | n]);
        const before = fill4(cpu);
        cpu.step(); // PLANE 3
        cpu.displayDirty = false;
        cpu.step();
        assertScreen(cpu, shifted(before, cpu.displayWidth, cpu.displayHeight, 0, -n));
        assert.equal(cpu.displayDirty, true);
      });
    }
  }

  it('con el plano elegido por defecto (PLANE 1) mueve solo el plano 1', () => {
    const cpu = xo([0x00D1]);
    cpu.display[5 * 64 + 3] = 3;
    cpu.step();
    assert.equal(pixel(cpu, 3, 4), 1);
    assert.equal(pixel(cpu, 3, 5), 2);
  });

  it('N = 0 no hace nada', () => {
    const cpu = xo([0xF301, 0x00D0]);
    const before = fill4(cpu);
    runSteps(cpu, 2);
    assertScreen(cpu, before);
  });

  it('lo de arriba se pierde: no vuelve por abajo', () => {
    const cpu = xo([0xF301, 0x00D1]);
    cpu.display[3] = 1; // fila 0
    cpu.display[5 * 64 + 3] = 2;
    runSteps(cpu, 2);
    assert.equal(pixel(cpu, 3, 31), 0);
    assert.equal(pixel(cpu, 3, 4), 2);
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 2);
  });
});

describe('audio: F002 AUDIO, FX3A PITCH y patternRate', () => {
  const CLICK = [0x02, 0xCD, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF];

  it('F002 copia 16 bytes desde I al patrón y marca audioPatternSet y audioDirty; I no cambia', () => {
    const cpu = xo([0xF002]);
    cpu.I = 0x400;
    cpu.memory.set(CLICK, 0x400);
    cpu.memory[0x410] = 0x77; // el byte 17 no se copia
    cpu.audioDirty = false;
    cpu.step();
    assert.deepEqual(Array.from(cpu.audioPattern), CLICK);
    assert.equal(cpu.audioPatternSet, true);
    assert.equal(cpu.audioDirty, true);
    assert.equal(cpu.I, 0x400);
  });

  it('el patrón es una copia: cambiar la memoria después no lo cambia', () => {
    const cpu = xo([0xF002]);
    cpu.I = 0x400;
    cpu.memory.set(CLICK, 0x400);
    const pattern = cpu.audioPattern;
    cpu.step();
    cpu.memory.fill(0x55, 0x400, 0x410);
    assert.deepEqual(Array.from(cpu.audioPattern), CLICK);
    assert.equal(cpu.audioPattern, pattern, 'el arreglo es siempre el mismo');
  });

  it('F002 con I al final de la memoria da la vuelta a 0x0000', () => {
    const cpu = xo([0xF002]);
    cpu.I = 0xFFF8;
    cpu.memory.set([1, 2, 3, 4, 5, 6, 7, 8], 0xFFF8);
    cpu.memory.set([9, 10, 11, 12, 13, 14, 15, 16], 0x0000);
    cpu.step();
    assert.deepEqual(Array.from(cpu.audioPattern), Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('FX3A copia VX en pitch y marca audioDirty; VX no cambia', () => {
    const cpu = xo([0xF53A, 0xF03A]);
    cpu.V[5] = 112;
    cpu.audioDirty = false;
    cpu.step();
    assert.equal(cpu.pitch, 112);
    assert.equal(cpu.audioDirty, true);
    assert.equal(cpu.V[5], 112);
    cpu.audioDirty = false;
    cpu.step();
    assert.equal(cpu.pitch, 0);
    assert.equal(cpu.audioDirty, true);
    assert.equal(cpu.audioPatternSet, false, 'FX3A no carga el patrón');
  });

  it('audioDirty solo cuando el sonido cambia: el mismo patrón o el mismo tono no lo marcan', () => {
    // LD I, 0x300 | AUDIO | AUDIO | LD V0, 64 | PITCH V0 | LD V0, 65 | PITCH V0
    const cpu = xo([0xA300, 0xF002, 0xF002, 0x6040, 0xF03A, 0x6041, 0xF03A]);
    cpu.memory.set(CLICK, 0x300);
    cpu.audioDirty = false;
    runSteps(cpu, 2);
    assert.equal(cpu.audioDirty, true, 'patrón nuevo');
    cpu.audioDirty = false;
    cpu.step();
    assert.equal(cpu.audioDirty, false, 'el mismo patrón otra vez');
    runSteps(cpu, 2);
    assert.equal(cpu.audioDirty, false, 'el mismo tono (64)');
    runSteps(cpu, 2);
    assert.equal(cpu.audioDirty, true, 'tono nuevo');
    assert.equal(cpu.pitch, 65);
  });

  it('el primer F002 después del reset marca audioDirty aunque el patrón sea todo cero', () => {
    const cpu = xo([0xF002]);
    cpu.I = 0x300; // memoria en cero
    cpu.audioDirty = false;
    cpu.step();
    assert.equal(cpu.audioPatternSet, true);
    assert.equal(cpu.audioDirty, true);
  });

  it('el ejemplo de la especificación: i := click, audio, v0 := 2, buzzer := v0', () => {
    const cpu = xo([0xA300, 0xF002, 0x6002, 0xF018]);
    cpu.memory.set(CLICK, 0x300);
    runSteps(cpu, 4);
    assert.deepEqual(Array.from(cpu.audioPattern), CLICK);
    assert.equal(cpu.soundTimer, 2);
  });

  it('patternRate: 64 -> 4000 Hz, 112 -> 8000 Hz, 16 -> 2000 Hz', () => {
    assert.equal(patternRate(64), 4000);
    assert.equal(patternRate(112), 8000);
    assert.equal(patternRate(16), 2000);
  });

  it('patternRate sigue 4000 * 2^((pitch - 64) / 48) en todo el rango (247 -> 56200.06 Hz)', () => {
    for (let p = 0; p <= 255; p++) {
      const want = 4000 * 2 ** ((p - 64) / 48);
      assert.ok(Math.abs(patternRate(p) - want) <= want * 1e-12, `pitch ${p}`);
    }
    assert.ok(Math.abs(patternRate(247) - 56200.06) < 0.01, String(patternRate(247)));
  });

  it('reset: pitch 64, patrón en cero, audioPatternSet en false y audioDirty en true', () => {
    const cpu = xo([0xF002, 0x6050, 0xF03A]);
    cpu.I = 0x300;
    cpu.memory.set(CLICK, 0x300);
    runSteps(cpu, 3);
    cpu.audioDirty = false;
    cpu.reset();
    assert.equal(cpu.pitch, 64);
    assert.ok(cpu.audioPattern.every((v) => v === 0));
    assert.equal(cpu.audioPatternSet, false);
    assert.equal(cpu.audioDirty, true);
  });
});

describe('memoria de 64 KB', () => {
  it('FX1E: I da la vuelta de 0xFFFF a 0x0000 (como siempre)', () => {
    const cpu = xo([0xF01E]);
    cpu.I = 0xFFFE;
    cpu.V[0] = 3;
    cpu.step();
    assert.equal(cpu.I, 0x0001);
  });

  it('FX55 y FX65 llegan hasta 0xFFFF y dan la vuelta a 0x0000', () => {
    const cpu = xo([0xF355, 0xF365], { quirks: { memory: false } });
    cpu.I = 0xFFFE;
    cpu.V.set([1, 2, 3, 4]);
    cpu.step();
    assert.deepEqual([cpu.memory[0xFFFE], cpu.memory[0xFFFF], cpu.memory[0x0000], cpu.memory[0x0001]], [1, 2, 3, 4]);
    assert.equal(cpu.memory[0x0FFE], 0, 'no escribe en la mitad de 4 KB');
    cpu.V.fill(0);
    cpu.step();
    assert.deepEqual(Array.from(cpu.V.slice(0, 4)), [1, 2, 3, 4]);
  });

  it('FX55 con el quirk memory deja I = I + X + 1 dentro de 16 bits', () => {
    const cpu = xo([0xF155], { quirks: { memory: true } });
    cpu.I = 0xFFFF;
    cpu.step();
    assert.equal(cpu.I, 0x0001);
  });

  it('FX33 escribe en 0xFFFF y da la vuelta', () => {
    const cpu = xo([0xF033]);
    cpu.I = 0xFFFE;
    cpu.V[0] = 254;
    cpu.step();
    assert.deepEqual([cpu.memory[0xFFFE], cpu.memory[0xFFFF], cpu.memory[0x0000]], [2, 5, 4]);
  });

  it('FX33, FX55 y FX65 usan las direcciones de 16 bits enteras (más allá de 0xFFF)', () => {
    const cpu = xo([0xF033, 0xF255, 0xF265], { quirks: { memory: false } });
    cpu.I = 0x1234;
    cpu.V.set([0x7B, 0x22, 0x33]);
    cpu.step();
    assert.deepEqual(Array.from(cpu.memory.slice(0x1234, 0x1237)), [1, 2, 3]);
    assert.deepEqual(Array.from(cpu.memory.slice(0x234, 0x237)), [0, 0, 0], 'nada en la mitad de 4 KB');
    cpu.step();
    assert.deepEqual(Array.from(cpu.memory.slice(0x1234, 0x1237)), [0x7B, 0x22, 0x33]);
    cpu.V.fill(0);
    cpu.step();
    assert.deepEqual(Array.from(cpu.V.slice(0, 3)), [0x7B, 0x22, 0x33]);
  });

  it('DXYN lee el sprite más allá de 0xFFF y da la vuelta en 0xFFFF', () => {
    const cpu = xo([0xD012, 0xD011]);
    cpu.I = 0xFFFF;
    cpu.memory[0xFFFF] = 0x80;
    cpu.memory[0x0000] = 0x40;
    cpu.step();
    assert.equal(pixel(cpu, 0, 0), 1);
    assert.equal(pixel(cpu, 1, 1), 1);
    cpu.I = 0x1234;
    cpu.memory[0x1234] = 0x01;
    cpu.V[1] = 10;
    cpu.step();
    assert.equal(pixel(cpu, 7, 10), 1);
  });

  it('pc pasa de 0xFFFE a 0x0000 y puede ejecutar código más allá de 0xFFF', () => {
    const cpu = xo([]);
    cpu.memory.set([0x60, 0x42], 0x1000);
    cpu.memory.set([0x61, 0x43], 0xFFFE);
    cpu.pc = 0x1000;
    cpu.step();
    assert.equal(cpu.V[0], 0x42);
    assert.equal(cpu.pc, 0x1002);
    cpu.pc = 0xFFFE;
    cpu.step();
    assert.equal(cpu.V[1], 0x43);
    assert.equal(cpu.pc, 0x0000);
  });

  it('una instrucción en 0xFFFF lee su segundo byte de 0x0000', () => {
    const cpu = xo([]);
    cpu.memory[0xFFFF] = 0x60;
    cpu.memory[0x0000] = 0x2A;
    cpu.pc = 0xFFFF;
    cpu.step();
    assert.equal(cpu.V[0], 0x2A);
    assert.equal(cpu.pc, 0x0001);
  });

  it('BNNN puede saltar más allá de 0xFFF', () => {
    const cpu = xo([0xBFFF]);
    cpu.V[0] = 0x10;
    cpu.step();
    assert.equal(cpu.pc, 0x100F);
    const chip8 = makeCpu([0xBFFF]);
    chip8.V[0] = 0x10;
    chip8.step();
    assert.equal(chip8.pc, 0x00F, 'en CHIP-8 sigue dando la vuelta en 0xFFF');
  });

  it('un CALL desde más allá de 0xFFF vuelve a la dirección completa', () => {
    const cpu = xo([]);
    cpu.memory.set([0x23, 0x00], 0x2000); // CALL 0x300
    cpu.memory.set([0x00, 0xEE], 0x300);  // RET
    cpu.pc = 0x2000;
    cpu.step();
    assert.equal(cpu.stack[0], 0x2002);
    assert.equal(cpu.pc, 0x300);
    cpu.step();
    assert.equal(cpu.pc, 0x2002);
  });

  it('loadRom: 65024 bytes llenan hasta 0xFFFF; 65025 lanzan RangeError', () => {
    const cpu = xo([]);
    const rom = new Uint8Array(65024).map((_, i) => (i * 13 + 7) & 0xFF);
    cpu.loadRom(rom);
    assert.deepEqual(cpu.memory.slice(0x200), rom);
    assert.equal(cpu.memory[0xFFFF], rom[65023]);
    assert.throws(() => cpu.loadRom(new Uint8Array(65025)), {
      name: 'RangeError',
      message: 'La ROM ocupa 65025 bytes y el máximo es 65024 (de 0x200 a 0xFFFF).',
    });
  });

  it('los errores muestran la dirección con 4 dígitos', () => {
    const cpu = xo([]);
    cpu.memory.set([0x81, 0x28], 0x1234);
    cpu.pc = 0x1234;
    cpu.step();
    assert.equal(cpu.error, 'Instrucción inválida o desconocida (opcode 0x8128 en la dirección 0x1234).');
    assert.deepEqual(cpu.errorInfo, { kind: 'invalid', opcode: 0x8128, addr: 0x1234 });
    // Un programa que se sale de su código termina en la fuente, como en CHIP-8.
    const font = xo([0x1050]);
    runSteps(font, 2);
    assert.equal(font.error, 'Instrucción inválida o desconocida (opcode 0xF090 en la dirección 0x0050).');
  });
});

describe('un programa de XO-CHIP completo', () => {
  it('dibuja un sprite de 4 colores con los datos más allá de 0xFFF y lo desplaza solo en el plano 2', () => {
    // 200: PLANE 3 | 202: LD I, LONG 0x8000 | 206: DRW V0, V1, 1 | 208: PLANE 2 | 20A: SCR | 20C: EXIT
    const cpu = xo([0xF301, 0xF000, 0x8000, 0xD011, 0xF201, 0x00FB, 0x00FD]);
    cpu.memory.set([0xF0, 0x3C], 0x8000); // plano 1: ####.... | plano 2: ..####..
    let steps = 0;
    while (!cpu.halted && steps < 20) { cpu.step(); steps++; }
    assert.equal(cpu.exited, true);
    assert.equal(cpu.error, null);
    // Antes del SCR: 1 1 3 3 2 2 0 0; el plano 2 se mueve 4 a la derecha.
    assert.deepEqual(Array.from({ length: 12 }, (_, x) => pixel(cpu, x, 0)), [1, 1, 1, 1, 0, 0, 2, 2, 2, 2, 0, 0]);
    assert.equal(cpu.hint, null);
  });
});
