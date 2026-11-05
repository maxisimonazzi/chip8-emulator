'use strict';
// Instrucciones de SUPER-CHIP con la semántica de Octo, en las plataformas schip y xochip:
// desplazamientos (00CN, 00FB, 00FC), resolución (00FE, 00FF), DXYN en alta resolución,
// sprites de 16x16 (DXY0), fuente grande (FX30), banderas (FX75/FX85), EXIT (00FD) y
// displayWait con los dibujos nuevos.
// Las pantallas esperadas se calculan acá con una implementación de referencia mínima
// (independiente del núcleo).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, makeCpu, runSteps, pixel, renderAscii } = require('./harness');

const { Chip8, BIG_FONT, BIG_FONT_ADDR } = loadCore();
const PLATFORMS = ['schip', 'xochip'];
const hex = (n, w = 1) => n.toString(16).toUpperCase().padStart(w, '0');

// Máquina con el programa cargado; con hires, el programa va después de un 00FF que ya se
// ejecutó (así arranca en alta resolución, con pc en 0x202).
function machine(platform, program, { hires = false, quirks = {} } = {}) {
  const cpu = makeCpu(hires ? [0x00FF, ...program] : program, { platform, quirks });
  if (hires) cpu.step();
  return cpu;
}

// Llena la pantalla con un patrón reconocible de 0 y 1 y devuelve una copia.
function fillPattern(cpu) {
  const w = cpu.displayWidth, h = cpu.displayHeight;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cpu.display[y * w + x] = (x * 7 + y * 13) % 5 === 0 ? 1 : 0;
  return Array.from(cpu.display);
}

// `before` movido (dx, dy) sin dar la vuelta: lo que queda libre, en 0.
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

// Pantalla esperada al dibujar con XOR un sprite de `width` columnas (rows: una fila por
// número, el bit más alto a la izquierda) en (x0, y0) sobre `base`.
function drawRef(base, w, h, rows, width, x0, y0, clip) {
  const out = base.slice();
  x0 %= w;
  y0 %= h;
  rows.forEach((bits, r) => {
    for (let c = 0; c < width; c++) {
      if (!((bits >> (width - 1 - c)) & 1)) continue;
      const x = x0 + c, y = y0 + r;
      if (clip && (x >= w || y >= h)) continue;
      out[(y % h) * w + (x % w)] ^= 1;
    }
  });
  return out;
}

function assertScreen(cpu, expected, msg = '') {
  const actual = Array.from(cpu.display);
  if (actual.every((v, i) => v === expected[i])) return;
  const w = cpu.displayWidth;
  const fake = { display: expected, displayWidth: w, displayHeight: cpu.displayHeight };
  assert.fail(msg + '\nesperado:\n' + renderAscii(fake) + '\nobtenido:\n' + renderAscii(cpu));
}

// Sprite de 16x16 de prueba: una X (columnas r y 15 - r en la fila r) y, en la fila 0, también
// la columna 7, así se distingue el byte izquierdo del derecho.
const SPRITE16 = [];
for (let r = 0; r < 16; r++) SPRITE16.push((0x8000 >> r) | (0x8000 >> (15 - r)) | (r === 0 ? 0x8000 >> 7 : 0));
const SPRITE16_BYTES = SPRITE16.flatMap((bits) => [bits >> 8, bits & 0xFF]);

for (const platform of PLATFORMS) {
  describe(`SUPER-CHIP en ${platform}`, () => {
    describe('00CN SCD N: desplaza hacia abajo N filas de la resolución actual', () => {
      for (const hires of [false, true]) {
        for (const n of [1, 4, 15]) {
          it(`${hires ? 'alta' : 'baja'} resolución, N = ${n}`, () => {
            const cpu = machine(platform, [0x00C0 | n], { hires });
            const before = fillPattern(cpu);
            cpu.displayDirty = false;
            cpu.step();
            assertScreen(cpu, shifted(before, cpu.displayWidth, cpu.displayHeight, 0, n));
            assert.equal(cpu.displayDirty, true);
          });
        }
      }

      it('lo de abajo se pierde y arriba queda vacío (sin dar la vuelta)', () => {
        for (const hires of [false, true]) {
          const cpu = machine(platform, [0x00C3], { hires });
          const w = cpu.displayWidth, h = cpu.displayHeight;
          cpu.display[(h - 1) * w + 5] = 1; // última fila: desaparece
          cpu.display[0 * w + 9] = 1;       // fila 0: baja a la fila 3
          cpu.step();
          assert.deepEqual([pixel(cpu, 5, h - 1), pixel(cpu, 5, 2), pixel(cpu, 9, 0), pixel(cpu, 9, 3)], [0, 0, 0, 1]);
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), 1);
        }
      });

      it('N = 0 no hace nada', () => {
        const cpu = machine(platform, [0x00C0]);
        const before = fillPattern(cpu);
        cpu.step();
        assertScreen(cpu, before);
        assert.equal(cpu.pc, 0x202);
      });
    });

    describe('00FB SCR y 00FC SCL: desplazan 4 píxeles', () => {
      for (const hires of [false, true]) {
        it(`SCR en ${hires ? 'alta' : 'baja'} resolución: a la derecha; a la izquierda quedan 4 columnas vacías`, () => {
          const cpu = machine(platform, [0x00FB], { hires });
          const before = fillPattern(cpu);
          cpu.step();
          assertScreen(cpu, shifted(before, cpu.displayWidth, cpu.displayHeight, 4, 0));
          assert.equal(cpu.displayDirty, true);
        });

        it(`SCL en ${hires ? 'alta' : 'baja'} resolución: a la izquierda; a la derecha quedan 4 columnas vacías`, () => {
          const cpu = machine(platform, [0x00FC], { hires });
          const before = fillPattern(cpu);
          cpu.step();
          assertScreen(cpu, shifted(before, cpu.displayWidth, cpu.displayHeight, -4, 0));
        });
      }

      it('lo que sale por un costado se pierde: no pasa a la fila vecina', () => {
        for (const hires of [false, true]) {
          const cpu = machine(platform, [0x00FB, 0x00FC], { hires });
          const w = cpu.displayWidth;
          cpu.display[2 * w + (w - 1)] = 1; // borde derecho de la fila 2
          cpu.display[5 * w + 0] = 1;       // borde izquierdo de la fila 5
          cpu.step(); // SCR
          assert.equal(pixel(cpu, 3, 3), 0);
          assert.equal(pixel(cpu, 4, 5), 1);
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), 1);
          cpu.step(); // SCL
          assert.equal(pixel(cpu, 0, 5), 1);
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), 1);
        }
      });
    });

    describe('00FF HIGH y 00FE LOW', () => {
      it('HIGH pasa a 128x64 con un arreglo nuevo y la pantalla borrada', () => {
        const cpu = machine(platform, [0x00FF]);
        cpu.display.fill(1);
        const old = cpu.display;
        cpu.displayDirty = false;
        assert.equal(cpu.step(), true);
        assert.notEqual(cpu.display, old);
        assert.equal(cpu.hires, true);
        assert.equal(cpu.displayWidth, 128);
        assert.equal(cpu.displayHeight, 64);
        assert.ok(cpu.display instanceof Uint8Array);
        assert.equal(cpu.display.length, 128 * 64);
        assert.ok(cpu.display.every((v) => v === 0));
        assert.equal(cpu.displayDirty, true);
      });

      it('HIGH ya en alta resolución borra la pantalla sin cambiar el arreglo', () => {
        const cpu = machine(platform, [0x00FF], { hires: true });
        cpu.display.fill(1);
        const same = cpu.display;
        cpu.displayDirty = false;
        cpu.step();
        assert.equal(cpu.display, same);
        assert.ok(cpu.display.every((v) => v === 0));
        assert.equal(cpu.displayDirty, true);
        assert.equal(cpu.displayWidth, 128);
      });

      it('LOW vuelve a 64x32 con un arreglo nuevo y la pantalla borrada', () => {
        const cpu = machine(platform, [0x00FE], { hires: true });
        cpu.display.fill(1);
        const old = cpu.display;
        cpu.step();
        assert.notEqual(cpu.display, old);
        assert.equal(cpu.hires, false);
        assert.equal(cpu.displayWidth, 64);
        assert.equal(cpu.displayHeight, 32);
        assert.equal(cpu.display.length, 64 * 32);
        assert.ok(cpu.display.every((v) => v === 0));
      });

      it('LOW en baja resolución borra la pantalla sin cambiar el arreglo', () => {
        const cpu = machine(platform, [0x00FE]);
        cpu.display.fill(1);
        const same = cpu.display;
        cpu.displayDirty = false;
        cpu.step();
        assert.equal(cpu.display, same);
        assert.ok(cpu.display.every((v) => v === 0));
        assert.equal(cpu.displayDirty, true);
      });

      it('reset y loadRom vuelven a baja resolución', () => {
        const cpu = machine(platform, [0x00FF]);
        cpu.step();
        cpu.reset();
        assert.equal(cpu.hires, false);
        assert.equal(cpu.display.length, 64 * 32);
        assert.equal(cpu.displayWidth, 64);
        cpu.step();
        assert.equal(cpu.hires, true);
        cpu.loadRom([0x00, 0xE0]);
        assert.equal(cpu.hires, false);
        assert.equal(cpu.displayHeight, 32);
        assert.equal(cpu.display.length, 64 * 32);
      });

      it('no toca la memoria ni los registros', () => {
        const cpu = machine(platform, [0x00FF, 0x00FE]);
        for (let i = 0; i < 16; i++) cpu.V[i] = i * 3;
        cpu.I = 0x345;
        const mem = Array.from(cpu.memory);
        runSteps(cpu, 2);
        assert.deepEqual(Array.from(cpu.V), Array.from({ length: 16 }, (_, i) => i * 3));
        assert.equal(cpu.I, 0x345);
        assert.deepEqual(Array.from(cpu.memory), mem);
      });
    });

    describe('DXYN en alta resolución', () => {
      it('las coordenadas se toman módulo 128 y 64', () => {
        for (const [vx, vy, x, y] of [[200, 100, 72, 36], [127, 63, 127, 63], [128, 64, 0, 0], [255, 255, 127, 63], [5, 70, 5, 6]]) {
          const cpu = machine(platform, [0xD011], { hires: true });
          cpu.I = 0x300;
          cpu.memory[0x300] = 0x80;
          cpu.V[0] = vx;
          cpu.V[1] = vy;
          cpu.step();
          assert.equal(pixel(cpu, x, y), 1, `V0=${vx} V1=${vy}`);
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), 1);
        }
      });

      it('8xN: el bit alto a la izquierda, XOR y VF de colisión', () => {
        const rows = [0b10110001, 0b01000010, 0xFF];
        const cpu = machine(platform, [0xD013, 0xD013], { hires: true });
        cpu.I = 0x300;
        cpu.memory.set(rows, 0x300);
        cpu.V[0] = 100;
        cpu.V[1] = 50;
        cpu.step();
        assertScreen(cpu, drawRef(new Array(8192).fill(0), 128, 64, rows, 8, 100, 50, true));
        assert.equal(cpu.V[0xF], 0);
        cpu.step();
        assert.ok(cpu.display.every((v) => v === 0));
        assert.equal(cpu.V[0xF], 1);
      });

      for (const clip of [true, false]) {
        it(`borde derecho (128) y de abajo (64) con clipping ${clip ? 'on: se recorta' : 'off: vuelve por el otro lado'}`, () => {
          const rows = [0xFF, 0x81, 0xFF, 0x81];
          const cpu = machine(platform, [0xD014], { hires: true, quirks: { clipping: clip } });
          cpu.I = 0x300;
          cpu.memory.set(rows, 0x300);
          cpu.V[0] = 124;
          cpu.V[1] = 62;
          cpu.step();
          assertScreen(cpu, drawRef(new Array(8192).fill(0), 128, 64, rows, 8, 124, 62, clip));
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), clip ? 5 : 20);
        });
      }

      it('en baja resolución sigue siendo 64x32', () => {
        const cpu = machine(platform, [0xD011]);
        cpu.I = 0x300;
        cpu.memory[0x300] = 0x80;
        cpu.V[0] = 100;
        cpu.V[1] = 50;
        cpu.step();
        assert.equal(pixel(cpu, 36, 18), 1);
      });

      it('la colisión con un píxel de alta resolución alcanza para VF = 1', () => {
        const cpu = machine(platform, [0xD011], { hires: true });
        cpu.I = 0x300;
        cpu.memory[0x300] = 0x01;
        cpu.V[0] = 120;
        cpu.V[1] = 60;
        cpu.display[60 * 128 + 127] = 1;
        cpu.step();
        assert.equal(cpu.V[0xF], 1);
        assert.equal(pixel(cpu, 127, 60), 0);
      });
    });

    describe('DXY0: sprite de 16x16 (2 bytes por fila) en las dos resoluciones', () => {
      function setup(hires, x, y, quirks = {}) {
        const cpu = machine(platform, [0xD120, 0xD120], { hires, quirks });
        cpu.I = 0x300;
        cpu.memory.set(SPRITE16_BYTES, 0x300);
        cpu.memory.fill(0xFF, 0x320, 0x340); // lo que sigue no se dibuja
        cpu.V[1] = x;
        cpu.V[2] = y;
        return cpu;
      }

      for (const hires of [false, true]) {
        const res = hires ? 'alta' : 'baja';
        it(`${res} resolución: dibuja los 32 bytes desde I, el bit alto del primer byte a la izquierda`, () => {
          const cpu = setup(hires, 10, 5);
          cpu.step();
          const w = cpu.displayWidth, h = cpu.displayHeight;
          assertScreen(cpu, drawRef(new Array(w * h).fill(0), w, h, SPRITE16, 16, 10, 5, true));
          assert.equal(pixel(cpu, 10 + 7, 5), 1, 'la columna 7 de la fila 0 (último bit del primer byte)');
          assert.equal(pixel(cpu, 10 + 8, 5), 0);
          assert.equal(cpu.display.reduce((a, b) => a + b, 0), 33);
          assert.equal(cpu.V[0xF], 0);
          assert.equal(cpu.I, 0x300);
        });

        for (const clip of [true, false]) {
          it(`${res} resolución, clipping ${clip ? 'on: se recorta' : 'off: vuelve por la izquierda y por arriba'}`, () => {
            const cpu = setup(hires, 0, 0, { clipping: clip });
            const w = cpu.displayWidth, h = cpu.displayHeight;
            cpu.V[1] = w - 8;
            cpu.V[2] = h - 8;
            cpu.step();
            assertScreen(cpu, drawRef(new Array(w * h).fill(0), w, h, SPRITE16, 16, w - 8, h - 8, clip));
            if (clip) {
              assert.equal(pixel(cpu, 0, 0), 0);
            } else {
              assert.equal(pixel(cpu, 7, 7), 1, 'la esquina del sprite vuelve en (7, 7)');
            }
          });
        }

        it(`${res} resolución: las coordenadas iniciales se toman módulo el ancho y el alto`, () => {
          const cpu = setup(hires, 0, 0);
          const w = cpu.displayWidth, h = cpu.displayHeight;
          cpu.V[1] = w + 3;
          cpu.V[2] = h + 2;
          cpu.step();
          assertScreen(cpu, drawRef(new Array(w * h).fill(0), w, h, SPRITE16, 16, 3, 2, true));
        });

        it(`${res} resolución: colisión; dibujar dos veces borra todo y deja VF = 1`, () => {
          const cpu = setup(hires, 20, 9);
          cpu.V[0xF] = 1;
          cpu.step();
          assert.equal(cpu.V[0xF], 0);
          cpu.step();
          assert.equal(cpu.V[0xF], 1);
          assert.ok(cpu.display.every((v) => v === 0));
        });
      }

      it('un solo píxel compartido ya es colisión', () => {
        const cpu = setup(true, 40, 30);
        cpu.display[(30 + 15) * 128 + 40 + 15] = 1; // la esquina de abajo a la derecha de la X
        cpu.step();
        assert.equal(cpu.V[0xF], 1);
        assert.equal(pixel(cpu, 55, 45), 0);
      });

      it('DFF0: VF se lee como coordenada antes de escribir la bandera', () => {
        const cpu = machine(platform, [0xDFF0]);
        cpu.I = 0x300;
        cpu.memory.set(SPRITE16_BYTES, 0x300);
        cpu.V[0xF] = 3;
        cpu.step();
        assert.equal(pixel(cpu, 3, 3), 1);
        assert.equal(cpu.V[0xF], 0);
      });

      it('displayDirty y no deja aviso', () => {
        const cpu = setup(false, 0, 0);
        cpu.displayDirty = false;
        cpu.step();
        assert.equal(cpu.displayDirty, true);
        assert.equal(cpu.hint, null);
      });
    });

    describe('FX30 LD HF, VX: fuente grande', () => {
      for (let d = 0; d < 16; d++) {
        it(`dígito ${hex(d)}: I = 0x0A0 + ${d} * 10 y FX65 lee el glifo`, () => {
          // LD V0, d | LD HF, V0 | LD V9, [I]
          const cpu = machine(platform, [0x6000 | d, 0xF030, 0xF965], { quirks: { memory: false } });
          runSteps(cpu, 2);
          assert.equal(cpu.I, BIG_FONT_ADDR + d * 10);
          cpu.step();
          assert.deepEqual(Array.from(cpu.V.slice(0, 10)), Array.from(BIG_FONT.slice(d * 10, d * 10 + 10)));
        });
      }

      it('usa solo el nibble bajo de VX y no toca VX ni VF', () => {
        const cpu = machine(platform, [0xF330]);
        cpu.V[3] = 0x3A;
        cpu.V[0xF] = 7;
        cpu.step();
        assert.equal(cpu.I, BIG_FONT_ADDR + 0xA * 10);
        assert.equal(cpu.V[3], 0x3A);
        assert.equal(cpu.V[0xF], 7);
      });

      it('DXYA dibuja el glifo grande', () => {
        // LD V0, 8 | LD HF, V0 | LD V1, 4 | LD V2, 2 | DRW V1, V2, 10
        const cpu = machine(platform, [0x6008, 0xF030, 0x6104, 0x6202, 0xD12A], { hires: true });
        runSteps(cpu, 5);
        const rows = Array.from(BIG_FONT.slice(80, 90));
        assertScreen(cpu, drawRef(new Array(8192).fill(0), 128, 64, rows, 8, 4, 2, true), 'glifo 8');
      });
    });

    describe('FX75 y FX85: banderas persistentes', () => {
      for (const x of [0, 7, 15]) {
        it(`FX75 con X = ${x} guarda V0..V${hex(x)} y no toca las demás banderas`, () => {
          const cpu = machine(platform, [0xF075 | (x << 8)]);
          for (let i = 0; i < 16; i++) cpu.V[i] = 0x30 + i;
          cpu.flags.fill(0xEE);
          cpu.I = 0x123;
          cpu.step();
          for (let i = 0; i < 16; i++) assert.equal(cpu.flags[i], i <= x ? 0x30 + i : 0xEE, `bandera ${i}`);
          assert.equal(cpu.I, 0x123, 'I no cambia');
          assert.equal(cpu.halted, false);
        });

        it(`FX85 con X = ${x} carga V0..V${hex(x)} y no toca los demás registros`, () => {
          const cpu = machine(platform, [0xF085 | (x << 8)]);
          for (let i = 0; i < 16; i++) cpu.flags[i] = 0x80 + i;
          cpu.V.fill(0x11);
          cpu.I = 0x123;
          cpu.step();
          for (let i = 0; i < 16; i++) assert.equal(cpu.V[i], i <= x ? 0x80 + i : 0x11, `V${hex(i)}`);
          assert.equal(cpu.I, 0x123, 'I no cambia');
        });
      }

      it('no tocan la memoria', () => {
        const cpu = machine(platform, [0xFF75, 0xFF85]);
        cpu.V.fill(0x5A);
        const mem = Array.from(cpu.memory);
        runSteps(cpu, 2);
        assert.deepEqual(Array.from(cpu.memory), mem);
      });

      it('sobreviven a reset, a loadRom y a setPlatform', () => {
        // LD V0, 0xAB | LD VF, 0xCD | LD R, VF
        const cpu = machine(platform, [0x60AB, 0x6FCD, 0xFF75]);
        runSteps(cpu, 3);
        cpu.reset();
        assert.equal(cpu.flags[0], 0xAB);
        assert.equal(cpu.flags[15], 0xCD);
        cpu.loadRom([0xFF, 0x85]); // LD VF, R
        assert.equal(cpu.flags[0], 0xAB);
        cpu.step();
        assert.equal(cpu.V[0], 0xAB);
        assert.equal(cpu.V[0xF], 0xCD);
        cpu.setPlatform(platform === 'schip' ? 'xochip' : 'schip');
        cpu.step();
        assert.equal(cpu.V[0], 0xAB);
        assert.equal(cpu.V[0xF], 0xCD);
      });

      it('la interfaz puede restaurarlas antes de correr (siempre el mismo arreglo)', () => {
        const cpu = machine(platform, [0xF285]);
        const flags = cpu.flags;
        cpu.flags.set([9, 8, 7]);
        cpu.reset();
        assert.equal(cpu.flags, flags);
        cpu.step();
        assert.deepEqual(Array.from(cpu.V.slice(0, 3)), [9, 8, 7]);
      });

      it('cada máquina tiene sus banderas', () => {
        const a = machine(platform, [0x6042, 0xF075]);
        const b = machine(platform, [0xF085]);
        runSteps(a, 2);
        b.step();
        assert.equal(a.flags[0], 0x42);
        assert.equal(b.V[0], 0);
      });
    });

    describe('00FD EXIT', () => {
      it('detiene la máquina sin error: halted, exited y pc en el 00FD', () => {
        const cpu = machine(platform, [0x6001, 0x00FD, 0x6002]);
        assert.equal(cpu.step(), true);
        assert.equal(cpu.step(), true, 'step devuelve true para el 00FD');
        assert.equal(cpu.halted, true);
        assert.equal(cpu.exited, true);
        assert.equal(cpu.error, null);
        assert.equal(cpu.errorInfo, null);
        assert.equal(cpu.hint, null);
        assert.equal(cpu.pc, 0x202);
        assert.equal(cpu.step(), false);
        assert.equal(cpu.pc, 0x202);
        assert.equal(cpu.V[0], 1);
      });

      it('runFrame se detiene en el 00FD, lo cuenta y hace el tic; después devuelve 0', () => {
        const cpu = machine(platform, [0x6001, 0x00FD, 0x6002], { quirks: { displayWait: false } });
        cpu.delayTimer = 5;
        assert.equal(cpu.runFrame(100), 2);
        assert.equal(cpu.delayTimer, 4);
        assert.equal(cpu.runFrame(100), 0);
        assert.equal(cpu.delayTimer, 4, 'detenida: sin tic');
        assert.equal(cpu.V[0], 1);
      });

      it('reset vuelve a arrancar (exited y halted en false)', () => {
        const cpu = machine(platform, [0x00FD]);
        cpu.step();
        cpu.reset();
        assert.equal(cpu.exited, false);
        assert.equal(cpu.halted, false);
        assert.equal(cpu.step(), true);
        assert.equal(cpu.exited, true);
      });
    });

    describe('displayWait con los dibujos nuevos', () => {
      it('un DXYN en alta resolución corta el frame', () => {
        // HIGH | DRW V0, V1, 1 | ADD V0, 1 | JP 0x202
        const cpu = machine(platform, [0x00FF, 0xD011, 0x7001, 0x1202], { quirks: { displayWait: true } });
        assert.equal(cpu.runFrame(1000), 2);
        assert.equal(cpu.pc, 0x204);
        assert.equal(cpu.runFrame(1000), 3);
        assert.equal(cpu.pc, 0x204);
        assert.equal(cpu.V[0], 1);
      });

      it('DXY0 (16x16) también cuenta como dibujo, en las dos resoluciones', () => {
        for (const hires of [false, true]) {
          const cpu = machine(platform, [0xD120, 0x7001, 0x1200 | (hires ? 0x202 : 0x200)], { hires, quirks: { displayWait: true } });
          assert.equal(cpu.runFrame(1000), 1);
          assert.equal(cpu.runFrame(1000), 3);
        }
      });

      it('sin displayWait no corta', () => {
        const cpu = machine(platform, [0x00FF, 0xD011, 0x7001, 0x1202], { quirks: { displayWait: false } });
        assert.equal(cpu.runFrame(100), 100);
      });
    });

    it('ninguna instrucción de SUPER-CHIP deja aviso ni error', () => {
      const cpu = machine(platform, [0x00FF, 0x00C2, 0x00FB, 0x00FC, 0xD120, 0x6005, 0xF030, 0xF575, 0xF585, 0x00FE, 0x00FD]);
      runSteps(cpu, 11);
      assert.equal(cpu.hint, null);
      assert.equal(cpu.error, null);
      assert.equal(cpu.exited, true);
    });
  });
}

describe('SUPER-CHIP: detalles de la plataforma schip', () => {
  it('la pantalla usa solo el plano 1 (valores 0 y 1), aunque se cambie planes a mano', () => {
    const cpu = makeCpu([0xD015, 0x00FB, 0x00E0], { platform: 'schip' });
    cpu.planes = 3;
    cpu.I = 0x300;
    cpu.memory.fill(0xFF, 0x300, 0x310);
    cpu.step();
    assert.ok(cpu.display.every((v) => v === 0 || v === 1));
    assert.equal(cpu.display.reduce((a, b) => a + b, 0), 40);
    cpu.step();
    assert.ok(cpu.display.every((v) => v === 0 || v === 1));
    cpu.step();
    assert.ok(cpu.display.every((v) => v === 0));
  });

  it('la memoria sigue siendo de 4 KB: el sprite de 16x16 y las direcciones dan la vuelta en 0xFFF', () => {
    const cpu = makeCpu([0xD010], { platform: 'schip' });
    cpu.I = 0xFFE;
    cpu.memory[0xFFE] = 0x80;
    cpu.memory[0x000] = 0x80; // fila 1, byte izquierdo (dio la vuelta)
    cpu.step();
    assert.equal(pixel(cpu, 0, 0), 1);
    assert.equal(pixel(cpu, 0, 1), 1);
  });

  it('pc da la vuelta en 0xFFF', () => {
    const cpu = makeCpu([0x1FFE], { platform: 'schip' });
    cpu.memory[0xFFE] = 0x60;
    cpu.memory[0xFFF] = 0x42;
    runSteps(cpu, 2);
    assert.equal(cpu.V[0], 0x42);
    assert.equal(cpu.pc, 0x000);
  });

  it('un salto sobre F000 avanza solo 2 bytes (F000 no es una instrucción de SUPER-CHIP)', () => {
    const cpu = makeCpu([0x3000, 0xF000, 0x6001], { platform: 'schip' });
    cpu.step();
    assert.equal(cpu.pc, 0x204);
  });

  it('una máquina nueva en schip arranca como CHIP-8: 64x32 y plano 1', () => {
    const cpu = new Chip8({ platform: 'schip' });
    assert.equal(cpu.displayWidth, 64);
    assert.equal(cpu.planes, 1);
  });
});
