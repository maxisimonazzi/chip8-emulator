'use strict';
// Tests del tutorial (docs/TUTORIAL.md) y de sus ejemplos (docs/ejemplos/).
//
// 1. Cada docs/ejemplos/*.asm se ensambla, su .ch8 está al día y, corriendo en
//    el núcleo real (el mismo código de chip8.html), hace lo que el tutorial
//    dice que hace: qué se ve en pantalla, cómo responde a las teclas, cuánto
//    tarda, qué registros cambian.
// 2. docs/ejemplos/mini-emulador.js (parte 8) se comporta igual que el núcleo.
// 3. Lo que muestra TUTORIAL.md coincide con la realidad: los listados son
//    idénticos a los archivos, los fragmentos están en sus archivos, los bytes
//    escritos a mano desensamblan a lo que dice la tabla, las salidas de la
//    línea de comandos son las que se obtienen de verdad, los mensajes de
//    error son los del ensamblador y los enlaces al manual existen.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadCore, hexToBytes, pixel, renderAscii, loadAssembler } = require('./harness');

const core = loadCore();
const { Chip8, QUIRK_PRESETS, FONT, FONT_ADDR, disassemble } = core;
const { assemble } = loadAssembler();
const { MiniChip8 } = require(path.join(ROOT, 'docs', 'ejemplos', 'mini-emulador.js'));

const EJEMPLOS = path.join(ROOT, 'docs', 'ejemplos');
const TUTORIAL_PATH = path.join(ROOT, 'docs', 'TUTORIAL.md');
const PRESETS = Object.keys(QUIRK_PRESETS);

// Teclas del Cazamonedas (W, A, S, D en el teclado de la computadora).
const K_ARRIBA = 5, K_IZQ = 7, K_ABAJO = 8, K_DER = 9;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function exampleNames() {
  return fs.readdirSync(EJEMPLOS).filter((f) => f.endsWith('.asm')).sort();
}

const cache = {};
function example(name) {
  if (!cache[name]) {
    const source = fs.readFileSync(path.join(EJEMPLOS, name), 'utf8');
    const result = assemble(source);
    // Direcciones donde empieza una instrucción (no datos), según el listado.
    const code = new Set();
    for (const entry of result.listing) {
      const text = entry.text.replace(/;.*$/, '').replace(/^\s*[^\s:;,]+\s*:/, '').trim();
      const word = text.split(/\s+/)[0].toUpperCase();
      if (entry.bytes.length === 2 && word !== 'DB' && word !== 'DW') code.add(entry.addr);
    }
    cache[name] = { source, bytes: result.bytes, labels: result.labels, code };
  }
  return cache[name];
}

// Generador pseudoaleatorio reproducible para RND. Si se le pasa una lista,
// primero devuelve esos valores y después sigue con la secuencia.
function seeded(seed, first = []) {
  let s = seed >>> 0;
  const queue = first.slice();
  return () => {
    if (queue.length) return queue.shift();
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 16) & 0xFF;
  };
}

// Crea la máquina con el ejemplo cargado. Por defecto vigila que el programa
// nunca ejecute bytes de datos.
function machine(name, { preset = 'vip', quirks = {}, random = seeded(7), guard = true } = {}) {
  const ex = example(name);
  const cpu = new Chip8({ quirks: { ...QUIRK_PRESETS[preset].quirks, ...quirks }, random });
  cpu.loadRom(ex.bytes);
  if (guard) {
    const step = cpu.step;
    cpu.step = function () {
      if (!this.halted && !this.waitingForKey && !ex.code.has(this.pc)) {
        throw new Error(name + ': ejecutó datos en 0x' + this.pc.toString(16));
      }
      return step.call(this);
    };
  }
  return cpu;
}

function run(cpu, frames, ipf = 15) {
  for (let i = 0; i < frames; i++) {
    cpu.runFrame(ipf);
    if (cpu.halted) throw new Error('se detuvo: ' + cpu.error);
  }
  return cpu;
}

// Deja apretada solo la tecla k (o ninguna, con k = -1).
function holdOnly(cpu, k) {
  for (let i = 0; i < 16; i++) {
    const want = i === k;
    if (!!cpu.keys[i] !== want) cpu.setKey(i, want);
  }
}

// Pantalla esperada: los sprites dibujados con XOR sobre una pantalla vacía.
// Cada sprite: { x, y, rows: [bytes], width }.
function expectedScreen(sprites) {
  const d = new Uint8Array(64 * 32);
  for (const s of sprites) {
    s.rows.forEach((bits, r) => {
      for (let c = 0; c < 8; c++) {
        if ((bits >> (7 - c)) & 1) {
          const x = s.x + c, y = s.y + r;
          if (x < 64 && y < 32) d[y * 64 + x] ^= 1;
        }
      }
    });
  }
  return d;
}

function asciiOf(display) {
  const fake = { display };
  return renderAscii(fake);
}

function assertScreen(cpu, sprites, msg = '') {
  const want = expectedScreen(sprites);
  assert.ok(
    want.every((v, i) => v === cpu.display[i]),
    msg + '\nesperado:\n' + asciiOf(want) + '\nobtenido:\n' + renderAscii(cpu),
  );
}

function glyph(d) {
  return Array.from(FONT.slice(d * 5, d * 5 + 5));
}

const FANTASMA = [0x78, 0xFC, 0xB4, 0xFC, 0xFC, 0xA8];
const MONEDA = [0x60, 0xF0, 0xF0, 0x60];
const TECHO = [0, 8, 16, 24, 32, 40, 48, 56].map((x) => ({ x, y: 6, rows: [0xFF] }));

function scoreSprites(score) {
  const digits = [Math.floor(score / 100), Math.floor(score / 10) % 10, score % 10];
  return digits.map((d, i) => ({ x: 1 + 5 * i, y: 0, rows: glyph(d) }));
}

// Estado estable del Cazamonedas: el programa está en la espera del bucle o
// acaba de dibujar el fantasmita en su lugar nuevo sin chocar (en "mover",
// justo antes de SE VF, 0). En los dos casos la pantalla tiene que mostrar
// exactamente el techo, el fantasmita, la moneda y (desde la etapa E) el puntaje.
function inWaitLoop(cpu, name) {
  const { bucle, mover } = example(name).labels;
  if (cpu.sp !== 0) return false;
  if (cpu.pc >= bucle && cpu.pc <= bucle + 4) return true;
  return cpu.pc === mover + 10 && cpu.V[0xF] === 0;
}

// Un "jugador" automático: va hacia la moneda (V8, V9) con una tecla por vez.
// El fantasmita no pasa de x = 58 ni de y = 26, pero desde ahí igual toca las
// monedas del borde (x = 60, y = 28).
function botKey(cpu) {
  const gx = cpu.V[4], gy = cpu.V[5];
  const tx = Math.min(cpu.V[8], 58), ty = Math.min(cpu.V[9], 26);
  if (gx < tx) return K_DER;
  if (gx > tx) return K_IZQ;
  if (gy < ty) return K_ABAJO;
  if (gy > ty) return K_ARRIBA;
  return -1;
}

// Juega hasta juntar `coins` monedas (o hasta `maxFrames`). Después de cada
// cuadro en estado estable verifica que la pantalla sea exactamente la que
// corresponde. Devuelve lo que pasó.
function playCoins(name, cpu, coins, { ipf = 15, maxFrames = 20000, withScore = false } = {}) {
  const log = { frames: 0, collected: 0, placements: [[cpu.V[8], cpu.V[9]]], stWrites: [] };
  const { labels } = example(name);
  let lastScore = cpu.V[0xE];
  const step = cpu.step;
  cpu.step = function () {
    // Cuenta las monedas (entradas a "agarrar") y registra cada LD ST, Vx (FX18).
    if (this.pc === labels.agarrar) log.collected++;
    const op = (this.memory[this.pc] << 8) | this.memory[(this.pc + 1) & 0xFFF];
    if ((op & 0xF0FF) === 0xF018) log.stWrites.push(this.V[(op >> 8) & 0xF]);
    const ok = step.call(this);
    return ok;
  };
  let pending = false;
  while (log.frames < maxFrames) {
    const before = log.collected;
    holdOnly(cpu, botKey(cpu));
    cpu.runFrame(ipf);
    log.frames++;
    assert.equal(cpu.halted, false, cpu.error);
    if (log.collected !== before) pending = true;
    if (!inWaitLoop(cpu, name)) continue;
    if (pending) {
      log.placements.push([cpu.V[8], cpu.V[9]]);
      pending = false;
    }
    const sprites = [...TECHO,
      { x: cpu.V[4], y: cpu.V[5], rows: FANTASMA },
      { x: cpu.V[8], y: cpu.V[9], rows: MONEDA }];
    if (withScore) {
      sprites.push(...scoreSprites(cpu.V[0xE]));
      assert.ok(cpu.V[0xE] >= lastScore, 'el puntaje nunca baja');
      lastScore = cpu.V[0xE];
    }
    assertScreen(cpu, sprites, name + ' en el cuadro ' + log.frames);
    if (log.collected >= coins) break;
  }
  holdOnly(cpu, -1);
  return log;
}

// ---------------------------------------------------------------------------
// Los archivos de docs/ejemplos
// ---------------------------------------------------------------------------

describe('docs/ejemplos: archivos', () => {
  const names = exampleNames();

  it('están los once ejemplos numerados', () => {
    assert.deepEqual(names, [
      '01-a-mano.asm', '02-hola.asm', '03-fantasma.asm', '04-mover.asm', '05-ritmo.asm',
      '06-monedas.asm', '07-puntaje.asm', '08-sonido.asm', '09-contador-con-bug.asm',
      '10-contador.asm', '11-sin-fin.asm',
    ]);
  });

  for (const name of names) {
    it(name + ': se ensambla, su .ch8 está al día y la primera línea lo nombra', () => {
      const ex = example(name);
      const ch8 = path.join(EJEMPLOS, name.replace(/\.asm$/, '.ch8'));
      assert.ok(fs.existsSync(ch8), 'falta ' + ch8 + ' (node tools/chip8asm.js docs/ejemplos/' + name + ')');
      assert.deepEqual(new Uint8Array(fs.readFileSync(ch8)), ex.bytes,
        'el .ch8 no coincide con el .asm: volvé a ensamblar con node tools/chip8asm.js docs/ejemplos/' + name);
      assert.ok(ex.source.startsWith('; ' + name + ' — '), 'la primera línea debe ser "; ' + name + ' — ..."');
      assert.ok(!ex.source.includes('\r'), 'finales de línea LF');
      assert.ok(ex.source.endsWith('\n'));
    });
  }

  for (const name of names.filter((n) => n !== '11-sin-fin.asm')) {
    it(name + ': corre 600 cuadros en los tres perfiles sin detenerse ni ejecutar datos', () => {
      for (const preset of PRESETS) {
        const cpu = machine(name, { preset });
        run(cpu, 600);
        assert.equal(cpu.halted, false);
        assert.ok(cpu.display.some((p) => p), 'la pantalla no puede quedar vacía');
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Parte 3 y 4: el programa escrito a mano y HOLA
// ---------------------------------------------------------------------------

describe('01-a-mano: el programa escrito a mano', () => {
  it('son exactamente los 14 bytes de la parte 3', () => {
    assert.deepEqual(example('01-a-mano.asm').bytes, hexToBytes('00E0600AF029611E620DD125120C'));
  });

  it('cada palabra desensambla a lo que dice el comentario', () => {
    const words = ['00E0', '600A', 'F029', '611E', '620D', 'D125', '120C'];
    const texts = ['CLS', 'LD V0, 0x0A', 'LD F, V0', 'LD V1, 0x1E', 'LD V2, 0x0D', 'DRW V1, V2, 5', 'JP 0x20C'];
    assert.deepEqual(words.map((w) => disassemble(parseInt(w, 16))), texts);
  });

  it('dibuja la A de la fuente en (30, 13) y se queda en 0x20C, en los tres perfiles', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('01-a-mano.asm', { preset }), 10);
      assertScreen(cpu, [{ x: 30, y: 13, rows: glyph(0xA) }], preset);
      assert.equal(cpu.pc, 0x20C);
      assert.equal(cpu.I, FONT_ADDR + 10 * 5); // 0x082
      assert.equal(cpu.I, 0x082);
      assert.deepEqual(Array.from(cpu.V.slice(0, 3)), [0x0A, 30, 13]);
    }
  });

  it('paso a paso: después de 6 instrucciones la A ya está y el PC queda en 0x20C', () => {
    const cpu = machine('01-a-mano.asm');
    const pcs = [];
    for (let i = 0; i < 7; i++) { cpu.step(); pcs.push(cpu.pc); }
    assert.deepEqual(pcs, [0x202, 0x204, 0x206, 0x208, 0x20A, 0x20C, 0x20C]);
    assertScreen(cpu, [{ x: 30, y: 13, rows: glyph(0xA) }]);
  });
});

describe('02-hola: sprites propios con DB', () => {
  it('escribe HOLA en (22, 13) con letras de 4x5 separadas por una columna', () => {
    const H = [0x90, 0x90, 0xF0, 0x90, 0x90];
    const O = [0x60, 0x90, 0x90, 0x90, 0x60];
    const L = [0x80, 0x80, 0x80, 0x80, 0xF0];
    const A = [0x60, 0x90, 0xF0, 0x90, 0x90];
    for (const preset of PRESETS) {
      const cpu = run(machine('02-hola.asm', { preset }), 20);
      assertScreen(cpu, [H, O, L, A].map((rows, i) => ({ x: 22 + 5 * i, y: 13, rows })), preset);
    }
  });

  it('las etiquetas quedan donde dice el listado', () => {
    const { labels } = example('02-hola.asm');
    assert.deepEqual(labels, { fin: 0x21C, letra_h: 0x21E, letra_o: 0x223, letra_l: 0x228, letra_a: 0x22D });
  });
});

// ---------------------------------------------------------------------------
// Parte 5: el Cazamonedas, etapa por etapa
// ---------------------------------------------------------------------------

describe('03-fantasma (etapa A)', () => {
  it('dibuja el fantasmita en (29, 13) y nada más', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('03-fantasma.asm', { preset }), 10);
      assertScreen(cpu, [{ x: 29, y: 13, rows: FANTASMA }], preset);
      assert.equal(cpu.pc, example('03-fantasma.asm').labels.fin);
    }
  });
});

describe('04-mover (etapa B)', () => {
  const dirs = [
    { key: K_ARRIBA, dx: 0, dy: -1 }, { key: K_ABAJO, dx: 0, dy: 1 },
    { key: K_IZQ, dx: -1, dy: 0 }, { key: K_DER, dx: 1, dy: 0 },
  ];

  it('W, A, S y D (teclas 5, 7, 8 y 9) lo mueven en su dirección y se redibuja entero', () => {
    for (const preset of PRESETS) {
      for (const { key, dx, dy } of dirs) {
        const cpu = run(machine('04-mover.asm', { preset }), 5);
        assert.deepEqual([cpu.V[4], cpu.V[5]], [29, 13]);
        cpu.setKey(key, true);
        run(cpu, 8);
        cpu.setKey(key, false);
        run(cpu, 4);
        const moved = [cpu.V[4] - 29, cpu.V[5] - 13];
        assert.ok(moved[0] * dx + moved[1] * dy > 0, preset + ' tecla ' + key + ': ' + moved);
        assert.ok(moved[0] * dy === 0 && moved[1] * dx === 0, 'no se mueve en la otra dirección');
        assertScreen(cpu, [{ x: cpu.V[4], y: cpu.V[5], rows: FANTASMA }]);
        const before = [cpu.V[4], cpu.V[5]];
        run(cpu, 30);
        assert.deepEqual([cpu.V[4], cpu.V[5]], before, 'sin teclas no se mueve');
      }
    }
  });

  it('su velocidad depende del perfil y de las IPF (el problema que resuelve la etapa C)', () => {
    function pixelsIn(preset, ipf, frames) {
      const cpu = run(machine('04-mover.asm', { preset }), 5, ipf);
      cpu.setKey(K_DER, true);
      let total = 0;
      for (let f = 0; f < frames; f++) {
        const x = cpu.V[4];
        cpu.runFrame(ipf);
        total += (cpu.V[4] - x) & 0xFF;
      }
      return total;
    }
    // COSMAC VIP: cada DRW espera el refresco, así que un paso (borrar + dibujar)
    // tarda 2 cuadros: 30 píxeles por segundo, a 15 o a 1000 IPF.
    assert.ok(Math.abs(pixelsIn('vip', 15, 60) - 30) <= 1);
    assert.ok(Math.abs(pixelsIn('vip', 1000, 60) - 30) <= 1);
    // Sin la espera, depende de la velocidad de la CPU: 50 píxeles por segundo a
    // 15 IPF y más de 50 en un solo cuadro a 1000 IPF.
    assert.ok(Math.abs(pixelsIn('xochip', 15, 60) - 50) <= 1);
    assert.ok(Math.abs(pixelsIn('schip', 15, 60) - 50) <= 1);
    assert.ok(pixelsIn('xochip', 1000, 1) > 50);
  });
});

describe('05-ritmo (etapa C)', () => {
  it('avanza exactamente un píxel cada 3 cuadros con cualquier perfil e IPF', () => {
    for (const preset of PRESETS) {
      for (const ipf of [15, 30, 100, 1000]) {
        const cpu = run(machine('05-ritmo.asm', { preset }), 10, ipf);
        cpu.setKey(K_DER, true);
        const moves = [];
        for (let f = 0; f < 60; f++) {
          const x = cpu.V[4];
          cpu.runFrame(ipf);
          if (cpu.V[4] !== x) moves.push(f);
        }
        assert.ok(moves.length >= 19 && moves.length <= 20, preset + '/' + ipf + ': ' + moves.length);
        for (let i = 1; i < moves.length; i++) {
          assert.equal(moves[i] - moves[i - 1], 3, preset + '/' + ipf + ' cuadros ' + moves);
        }
      }
    }
  });
});

describe('05-ritmo con RITMO EQU 2 (la advertencia de la etapa C)', () => {
  it('con el perfil VIP el paso no entra en 2 cuadros a 15 IPF, pero sí a 30 o más', () => {
    const source = example('05-ritmo.asm').source;
    assert.ok(source.includes('RITMO   EQU 3'));
    const bytes = assemble(source.replace('RITMO   EQU 3', 'RITMO   EQU 2')).bytes;
    function pixelsPerSecond(ipf) {
      const cpu = new Chip8();
      cpu.loadRom(bytes);
      run(cpu, 10, ipf);
      cpu.setKey(K_DER, true);
      const x = cpu.V[4];
      run(cpu, 60, ipf);
      return cpu.V[4] - x;
    }
    assert.ok(Math.abs(pixelsPerSecond(15) - 20) <= 1);
    assert.ok(Math.abs(pixelsPerSecond(30) - 30) <= 1);
    assert.ok(Math.abs(pixelsPerSecond(1000) - 30) <= 1);
  });
});

describe('06-monedas (etapa D)', () => {
  it('arranca con el techo, el fantasmita en (29, 17) y una moneda en su lugar', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('06-monedas.asm', { preset }), 30);
      assert.ok(inWaitLoop(cpu, '06-monedas.asm'));
      assert.deepEqual([cpu.V[4], cpu.V[5]], [29, 17]);
      assertScreen(cpu, [...TECHO, { x: 29, y: 17, rows: FANTASMA }, { x: cpu.V[8], y: cpu.V[9], rows: MONEDA }]);
    }
  });

  it('los bordes lo frenan en x = 0..58 e y = 8..26', () => {
    const cases = [[K_IZQ, 4, 0], [K_DER, 4, 58], [K_ARRIBA, 5, 8], [K_ABAJO, 5, 26]];
    for (const preset of PRESETS) {
      for (const [key, reg, limit] of cases) {
        const cpu = run(machine('06-monedas.asm', { preset }), 30);
        cpu.setKey(key, true);
        const seen = new Set();
        for (let f = 0; f < 200; f++) {
          cpu.runFrame(15);
          seen.add(cpu.V[reg]);
        }
        assert.equal(cpu.V[reg], limit, preset + ' tecla ' + key);
        const values = [...seen];
        assert.ok(values.every((v) => v <= 58), 'nunca se pasa: ' + values);
        assert.ok(values.every((v) => reg === 4 || v >= 8), 'nunca entra al techo: ' + values);
        assertScreen(cpu, [...TECHO, { x: cpu.V[4], y: cpu.V[5], rows: FANTASMA }, { x: cpu.V[8], y: cpu.V[9], rows: MONEDA }]);
      }
    }
  });

  it('pisar la moneda (VF = 1) la hace aparecer en otro lado, sin dejar restos', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('06-monedas.asm', { preset, random: seeded(99) }), 30);
      const log = playCoins('06-monedas.asm', cpu, 25);
      assert.ok(log.collected >= 25, preset + ': ' + log.collected);
      for (const [x, y] of log.placements) {
        assert.ok(x <= 60 && y >= 8 && y <= 28, 'moneda fuera de lugar: ' + x + ',' + y);
      }
    }
  });

  it('si la moneda nueva cae encima del fantasmita, la borra y prueba otro lugar', () => {
    // Primer intento: (30, 9 + 8 = 17), encima del fantasmita, que está en (29, 17).
    // Segundo intento: (5, 2 + 8 = 10).
    const cpu = run(machine('06-monedas.asm', { random: seeded(1, [30, 9, 5, 2]) }), 30);
    assert.deepEqual([cpu.V[8], cpu.V[9]], [5, 10]);
    assertScreen(cpu, [...TECHO, { x: 29, y: 17, rows: FANTASMA }, { x: 5, y: 10, rows: MONEDA }]);
  });
});

describe('07-puntaje (etapa E)', () => {
  it('arranca mostrando 000 arriba a la izquierda', () => {
    const cpu = run(machine('07-puntaje.asm'), 40);
    assertScreen(cpu, [...TECHO, ...scoreSprites(0),
      { x: 29, y: 17, rows: FANTASMA }, { x: cpu.V[8], y: cpu.V[9], rows: MONEDA }]);
  });

  it('cada moneda suma un punto y el marcador muestra el puntaje en decimal', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('07-puntaje.asm', { preset, random: seeded(5) }), 40);
      const log = playCoins('07-puntaje.asm', cpu, 12, { withScore: true });
      assert.ok(log.collected >= 12);
      assert.equal(cpu.V[0xE], log.collected);
    }
  });

  it('el puntaje de tres cifras también se ve bien (por ejemplo, 254 -> 255)', () => {
    const cpu = run(machine('07-puntaje.asm', { random: seeded(3) }), 40);
    // Poner el marcador en 254 "a mano": borrar el 000 y dibujar el 254 igual que el programa.
    const { labels } = example('07-puntaje.asm');
    for (const score of [0, 254]) {
      cpu.V[0xE] = score;
      const sp = cpu.sp, pc = cpu.pc;
      cpu.stack[cpu.sp++] = pc;
      cpu.pc = labels.dibuja_puntaje;
      while (cpu.sp > sp) cpu.step();
    }
    const log = playCoins('07-puntaje.asm', cpu, 1, { withScore: true });
    assert.equal(log.collected, 1);
    assert.equal(cpu.V[0xE], 255);
  });
});

describe('08-sonido (etapa F)', () => {
  it('suena un pitido corto (ST = 4) por moneda y uno largo (ST = 20) cada 10', () => {
    for (const preset of PRESETS) {
      const cpu = run(machine('08-sonido.asm', { preset, random: seeded(11) }), 40);
      const log = playCoins('08-sonido.asm', cpu, 21, { withScore: true });
      assert.ok(log.collected >= 21);
      assert.equal(cpu.V[0xE], log.collected);
      const expected = Array.from({ length: log.collected }, (_, i) => ((i + 1) % 10 === 0 ? 20 : 4));
      assert.deepEqual(log.stWrites, expected, preset);
    }
  });

  it('el temporizador de sonido queda en marcha justo después de agarrar una moneda', () => {
    const cpu = run(machine('08-sonido.asm', { random: seeded(11) }), 40);
    let f = 0;
    while (f < 2000 && cpu.V[0xE] === 0) {
      holdOnly(cpu, botKey(cpu));
      cpu.runFrame(15);
      f++;
    }
    assert.equal(cpu.V[0xE], 1);
    assert.equal(cpu.soundTimer, 0, 'antes de la moneda no sonaba nada');
    holdOnly(cpu, -1);
    const st = [];
    for (let i = 0; i < 12; i++) { cpu.runFrame(15); st.push(cpu.soundTimer); }
    // Después de redibujar el puntaje (3 DRW = 3 cuadros) se carga ST = 4 y baja de a 1.
    assert.ok(st.includes(3) && st.includes(1), 'ST: ' + st);
    assert.equal(st[st.length - 1], 0);
  });
});

// ---------------------------------------------------------------------------
// Parte 7: depurar
// ---------------------------------------------------------------------------

describe('09-contador-con-bug y 10-contador', () => {
  const BUG = '09-contador-con-bug.asm';

  it('el contador con el error se queda trabado en el 1', () => {
    const cpu = machine(BUG);
    const shown = new Set();
    const { labels } = example(BUG);
    const step = cpu.step;
    cpu.step = function () {
      if (this.pc === labels.proximo) shown.add(this.V[0]);
      return step.call(this);
    };
    run(cpu, 900);
    assert.deepEqual([...shown].sort(), [0, 1]);
    const one = expectedScreen([{ x: 30, y: 13, rows: glyph(1) }]);
    assert.ok(cpu.display.every((v, i) => v === one[i]) || cpu.display.every((v) => v === 0));
  });

  it('paso a paso muestra lo que cuenta el tutorial', () => {
    const cpu = machine(BUG);
    const { labels } = example(BUG);
    assert.deepEqual(labels, { proximo: 0x208, fin: 0x21A, esperar: 0x21C, esperar_bucle: 0x21E });
    // CLS, LD V0, 0, LD V1, 30, LD V2, 13, LD F, V0, DRW, LD V3, 30
    for (let i = 0; i < 7; i++) cpu.step();
    assert.equal(cpu.pc, 0x20E);
    assert.equal(disassemble((cpu.memory[0x20E] << 8) | cpu.memory[0x20F]), 'CALL 0x21C');
    assert.deepEqual(Array.from(cpu.V.slice(0, 4)), [0x00, 0x1E, 0x0D, 0x1E]);
    assert.equal(cpu.I, 0x050);
    cpu.step(); // CALL esperar
    assert.equal(cpu.pc, 0x21C);
    assert.equal(cpu.sp, 1);
    assert.equal(cpu.stack[0], 0x210);
    cpu.step(); // LD DT, V3
    assert.equal(cpu.delayTimer, 30);
    cpu.step(); // LD V0, DT  <- acá se pisa el contador
    assert.equal(cpu.V[0], 0x1E);
    // Con Paso los timers no bajan: se puede dar vueltas en el bucle para siempre.
    for (let i = 0; i < 30; i++) cpu.step();
    assert.equal(cpu.delayTimer, 30);
    assert.ok(cpu.pc >= 0x21E && cpu.pc <= 0x222);
    // Frame sí los hace bajar.
    cpu.runFrame(15);
    assert.equal(cpu.delayTimer, 29);
    // Al volver del CALL, V0 (el contador) vale 0: lo pisó la subrutina.
    while (cpu.sp > 0) cpu.runFrame(1);
    assert.equal(cpu.pc, 0x210);
    assert.equal(cpu.V[0], 0);
  });

  it('en la segunda vuelta V0 llega a la subrutina valiendo 1 y vuelve valiendo 0', () => {
    const cpu = machine(BUG);
    const seen = [];
    const step = cpu.step;
    cpu.step = function () {
      const pc = this.pc;
      const ok = step.call(this);
      if (pc === 0x20E) seen.push(['call', this.V[0]]);
      if (pc === 0x224) seen.push(['ret', this.V[0]]);
      return ok;
    };
    run(cpu, 100);
    assert.deepEqual(seen.slice(0, 4), [['call', 0], ['ret', 0], ['call', 1], ['ret', 0]]);
  });

  it('el contador arreglado muestra 0, 1, ..., 9 cada medio segundo y se queda en el 9', () => {
    for (const preset of PRESETS) {
      const cpu = machine('10-contador.asm', { preset });
      const order = [];
      const step = cpu.step;
      cpu.step = function () {
        if (this.pc === 0x208) order.push(this.V[0]);
        return step.call(this);
      };
      let frames = 0;
      while (cpu.pc !== 0x21A && frames < 1000) { cpu.runFrame(15); frames++; }
      assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.ok(frames >= 300 && frames <= 320, preset + ': ' + frames + ' cuadros');
      run(cpu, 60);
      assert.equal(cpu.pc, 0x21A);
      assertScreen(cpu, [{ x: 30, y: 13, rows: glyph(9) }]);
    }
  });

  it('las dos versiones solo difieren en la subrutina esperar', () => {
    const a = example(BUG).bytes, b = example('10-contador.asm').bytes;
    assert.equal(a.length, b.length);
    const diffs = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(0x200 + i);
    assert.deepEqual(diffs, [0x21E, 0x220]);
    assert.equal(disassemble((a[0x1E] << 8) | a[0x1F]), 'LD V0, DT');
    assert.equal(disassemble((b[0x1E] << 8) | b[0x1F]), 'LD V3, DT');
  });
});

describe('11-sin-fin: el programa al que le falta el final', () => {
  it('con COSMAC VIP y XO-CHIP se detiene en la fuente con "instrucción inválida"', () => {
    for (const preset of ['vip', 'xochip']) {
      const cpu = machine('11-sin-fin.asm', { preset, guard: false });
      let frames = 0;
      while (!cpu.halted && frames < 1000) { cpu.runFrame(15); frames++; }
      assert.equal(cpu.error, 'Instrucción inválida o desconocida (opcode 0xF090 en la dirección 0x050).');
      assert.equal(cpu.pc, 0x050);
      assert.ok(frames > 90 && frames < 100, frames + ' cuadros');
      assertScreen(cpu, [{ x: 29, y: 13, rows: FANTASMA }]);
    }
  });

  it('los bytes del sprite se leen como ADD V8, 0xFC y JP V0, 0x4FC', () => {
    const { bytes, labels } = example('11-sin-fin.asm');
    assert.equal(labels.fantasma, 0x20A);
    const word = (a) => (bytes[a - 0x200] << 8) | bytes[a - 0x200 + 1];
    assert.equal(disassemble(word(0x20A)), 'ADD V8, 0xFC');
    assert.equal(disassemble(word(0x20C)), 'JP V0, 0x4FC');
  });

  it('con SUPER-CHIP el salto va a 0x4FC + V4 y termina con la pila desbordada', () => {
    const cpu = machine('11-sin-fin.asm', { preset: 'schip', guard: false });
    for (let i = 0; i < 7; i++) cpu.step();
    assert.equal(cpu.pc, 0x4FC + 29);
    let steps = 0;
    while (!cpu.halted && steps < 200000) { cpu.step(); steps++; }
    assert.ok(cpu.halted);
    assert.match(cpu.error, /^Desbordamiento de pila/);
  });
});

// ---------------------------------------------------------------------------
// Parte 8: el mini emulador
// ---------------------------------------------------------------------------

describe('docs/ejemplos/mini-emulador.js', () => {
  const names = exampleNames().filter((n) => n !== '11-sin-fin.asm');

  it('hace lo mismo que el núcleo (perfil VIP sin espera de vblank) con cada ejemplo', () => {
    for (const name of names) {
      const bytes = example(name).bytes;
      const real = new Chip8({ quirks: { ...QUIRK_PRESETS.vip.quirks, displayWait: false }, random: seeded(21) });
      real.loadRom(bytes);
      const mini = new MiniChip8(bytes, { random: seeded(21) });
      for (let f = 0; f < 400; f++) {
        const k = f < 50 ? -1 : botKey(real);
        holdOnly(real, k);
        mini.keys.fill(0);
        if (k >= 0) mini.keys[k] = 1;
        real.runFrame(15);
        mini.runFrame(15);
        const where = name + ', cuadro ' + f;
        assert.deepEqual(mini.display, real.display, where);
        assert.deepEqual(mini.V, real.V, where);
        assert.equal(mini.pc, real.pc, where);
        assert.equal(mini.I, real.I, where);
        assert.equal(mini.delayTimer, real.delayTimer, where);
        assert.equal(mini.soundTimer, real.soundTimer, where);
        assert.deepEqual(mini.stack, Array.from(real.stack.slice(0, real.sp)), where);
      }
    }
  });

  it('desde la línea de comandos imprime la pantalla como texto', () => {
    const res = spawnSync(process.execPath,
      [path.join(EJEMPLOS, 'mini-emulador.js'), path.join(EJEMPLOS, '01-a-mano.ch8'), '10'], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const cpu = run(machine('01-a-mano.asm'), 10);
    assert.equal(res.stdout.trimEnd(), renderAscii(cpu));
  });
});

// ---------------------------------------------------------------------------
// docs/TUTORIAL.md: lo que muestra el texto coincide con la realidad
// ---------------------------------------------------------------------------
//
// Convenciones que usa el tutorial (y que estos tests hacen cumplir):
//   - Un bloque ```asm cuya primera línea es "; NN-nombre.asm — ..." es un
//     listado completo: tiene que ser idéntico a docs/ejemplos/NN-nombre.asm.
//   - Un bloque ```asm o ```js cuya primera línea es "; (fragmento de RUTA)" o
//     "// (fragmento de RUTA)" es un fragmento: sus líneas tienen que aparecer
//     seguidas en RUTA (relativa a la raíz). Una línea "; ..." o "// ..." marca
//     un salto.
//   - <!-- verificar: error --> antes de un ```asm: no se ensambla, y el bloque
//     siguiente es el mensaje exacto de la línea de comandos.
//   - <!-- verificar: detiene --> antes de un ```asm: se ensambla, se corre y el
//     bloque siguiente es el mensaje exacto con el que se detiene la máquina.
//   - Cualquier otro ```asm tiene que ensamblarse sin errores.
//   - <!-- salida: CMD --> antes de un ```text: es exactamente lo que imprime CMD.
//     <!-- salida (fragmento): CMD -->: sus líneas aparecen seguidas en la salida.
//   - <!-- verificar: tabla-a-mano --> y <!-- verificar: tabla-errores -->:
//     las filas de esas tablas se comprueban una por una.

function readTutorial() {
  return fs.readFileSync(TUTORIAL_PATH, 'utf8');
}

function parseBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let marker = null;
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\w*)\s*$/.exec(lines[i]);
    if (!open) {
      const t = lines[i].trim();
      if (t !== '') {
        const m = /^<!--\s*(.*?)\s*-->$/.exec(t);
        marker = m ? m[1] : null;
      }
      continue;
    }
    const start = i + 1;
    const body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    blocks.push({ lang: open[1], lines: body, text: body.join('\n'), line: start, marker });
    marker = null;
  }
  return blocks;
}

// Las líneas de `partLines` tienen que aparecer seguidas y en orden en
// `wholeText` (sin mirar la sangría). "; ..." o "// ..." marca un salto.
function assertFragment(partLines, wholeText, where) {
  const whole = wholeText.split(/\r?\n/).map((l) => l.trim());
  const chunks = [[]];
  for (const l of partLines) {
    if (/^(;|\/\/) \.\.\.$/.test(l.trim())) chunks.push([]);
    else chunks[chunks.length - 1].push(l.trim());
  }
  let from = 0;
  for (const chunk of chunks.filter((c) => c.length)) {
    let found = -1;
    for (let i = from; i + chunk.length <= whole.length && found < 0; i++) {
      if (chunk.every((l, j) => whole[i + j] === l)) found = i;
    }
    assert.ok(found >= 0, where + ': este fragmento no está en el archivo:\n' + chunk.join('\n'));
    from = found + chunk.length;
  }
}

function splitLines(text) {
  const out = text.split(/\r?\n/).map((l) => l.trimEnd());
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

// Slug de encabezado al estilo de GitHub: minúsculas, sin puntuación, espacios -> guiones.
function slug(heading) {
  return heading.trim().toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function anchorsOf(md) {
  const anchors = new Set();
  const seen = {};
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen[base] || 0;
    seen[base] = n + 1;
    anchors.add(n ? base + '-' + n : base);
  }
  return anchors;
}

function linksOf(md) {
  const out = [];
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const re = /\]\(([^)\s]+)\)/g;
    const text = line.replace(/`[^`]*`/g, ''); // lo que está en `código` no es un enlace
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

// Copia las herramientas y los ejemplos a una carpeta temporal para correr los
// comandos del tutorial sin escribir nada en el repositorio.
let sandbox = null;
function commandSandbox() {
  if (!sandbox) {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8-tutorial-'));
    fs.mkdirSync(path.join(sandbox, 'tools'));
    fs.copyFileSync(path.join(ROOT, 'tools', 'chip8asm.js'), path.join(sandbox, 'tools', 'chip8asm.js'));
    fs.mkdirSync(path.join(sandbox, 'docs', 'ejemplos'), { recursive: true });
    for (const f of fs.readdirSync(EJEMPLOS)) {
      fs.copyFileSync(path.join(EJEMPLOS, f), path.join(sandbox, 'docs', 'ejemplos', f));
    }
  }
  return sandbox;
}

function runCommand(cmd) {
  const args = cmd.trim().split(/\s+/);
  assert.equal(args[0], 'node', 'solo se verifican comandos de node: ' + cmd);
  const res = spawnSync(process.execPath, args.slice(1), { cwd: commandSandbox(), encoding: 'utf8' });
  return { status: res.status, output: (res.stdout || '') + (res.stderr || '') };
}

describe('docs/TUTORIAL.md', () => {
  let md, blocks;
  before(() => {
    md = readTutorial();
    blocks = parseBlocks(md);
  });
  after(() => {
    if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('usa finales de línea LF y no quedaron marcadores de plantilla', () => {
    assert.ok(!md.includes('\r'));
    assert.ok(!md.includes('{{'));
  });

  it('cada listado completo es idéntico a su archivo, y se muestran todos los ejemplos', () => {
    const shown = new Set();
    for (const b of blocks.filter((x) => x.lang === 'asm')) {
      const m = /^; (\d\d-[a-z0-9-]+\.asm) — /.exec(b.lines[0] || '');
      if (!m) continue;
      const file = path.join(EJEMPLOS, m[1]);
      assert.ok(fs.existsSync(file), 'línea ' + b.line + ': no existe ' + m[1]);
      assert.equal(b.text + '\n', fs.readFileSync(file, 'utf8'), 'línea ' + b.line + ': el listado no coincide con ' + m[1]);
      shown.add(m[1]);
    }
    assert.deepEqual([...shown].sort(), exampleNames(), 'cada ejemplo se muestra completo al menos una vez');
  });

  it('cada fragmento está, tal cual, en su archivo', () => {
    let count = 0;
    for (const b of blocks.filter((x) => x.lang === 'asm' || x.lang === 'js')) {
      const m = /^(?:;|\/\/) \(fragmento de ([^)]+)\)$/.exec(b.lines[0] || '');
      if (!m) {
        assert.notEqual(b.lang, 'js', 'línea ' + b.line + ': los bloques js tienen que ser fragmentos');
        continue;
      }
      const file = path.join(ROOT, m[1]);
      assert.ok(fs.existsSync(file), 'línea ' + b.line + ': no existe ' + m[1]);
      assertFragment(b.lines.slice(1), fs.readFileSync(file, 'utf8'), 'línea ' + b.line + ' (' + m[1] + ')');
      count++;
    }
    assert.ok(count >= 15, 'se esperaban más fragmentos: ' + count);
  });

  it('los demás bloques asm se ensamblan, y los de error dan el mensaje que muestra el texto', () => {
    let errors = 0, halts = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.lang !== 'asm') continue;
      if (/^; (\d\d-[a-z0-9-]+\.asm) — /.test(b.lines[0]) || /^; \(fragmento de /.test(b.lines[0])) continue;
      const where = 'bloque de la línea ' + b.line;
      if (b.marker === 'verificar: error') {
        const name = /^; (\S+\.asm) — /.exec(b.lines[0]);
        assert.ok(name, where + ': la primera línea tiene que nombrar el archivo');
        const expected = blocks[i + 1];
        assert.equal(expected.lang, 'text');
        assert.throws(() => assemble(b.text), (e) => {
          assert.equal(name[1] + ': ' + e.message, expected.text.trim(), where);
          return true;
        });
        errors++;
        continue;
      }
      const { bytes } = assemble(b.text); // no tiene que lanzar
      if (b.marker === 'verificar: detiene') {
        const expected = blocks[i + 1];
        assert.equal(expected.lang, 'text');
        const cpu = new Chip8();
        cpu.loadRom(bytes);
        for (let s = 0; s < 10000 && !cpu.halted; s++) cpu.step();
        assert.ok(cpu.halted, where + ': la máquina no se detuvo');
        assert.equal(cpu.error, expected.text.trim(), where);
        halts++;
      }
    }
    assert.equal(errors, 1);
    assert.equal(halts, 2);
  });

  it('las salidas de la línea de comandos son las de verdad', () => {
    let count = 0;
    for (const b of blocks) {
      const m = /^salida( \(fragmento\))?: (.+)$/.exec(b.marker || '');
      if (!m) continue;
      assert.equal(b.lang, 'text', 'línea ' + b.line);
      const { status, output } = runCommand(m[2]);
      assert.equal(status, 0, m[2] + '\n' + output);
      const shown = splitLines(b.text), real = splitLines(output);
      if (m[1]) assertFragment(shown, real.join('\n'), 'línea ' + b.line + ' (' + m[2] + ')');
      else assert.deepEqual(shown, real, 'línea ' + b.line + ': la salida de "' + m[2] + '" no coincide');
      count++;
    }
    assert.ok(count >= 5, 'se esperaban más salidas verificadas: ' + count);
  });

  it('los comandos de node de los bloques sh andan', () => {
    let count = 0;
    for (const b of blocks.filter((x) => x.lang === 'sh')) {
      for (const line of b.lines) {
        if (!/^node (tools|docs)\//.test(line)) continue;
        const { status, output } = runCommand(line);
        assert.equal(status, 0, line + '\n' + output);
        count++;
      }
    }
    assert.ok(count >= 2);
  });

  it('la tabla de la parte 3: cada fila son los bytes del programa y desensambla a lo que dice', () => {
    const lines = md.split('\n');
    const start = lines.indexOf('<!-- verificar: tabla-a-mano -->');
    assert.ok(start >= 0);
    const bytes = example('01-a-mano.asm').bytes;
    const rows = [];
    for (let i = start + 1; i < lines.length && lines[i].startsWith('|'); i++) {
      const m = /^\| `0x([0-9A-F]{3})` \| `([0-9A-F]{2}) ([0-9A-F]{2})` \| `([^`]+)` \|/.exec(lines[i]);
      if (m) rows.push(m);
    }
    assert.equal(rows.length, 7);
    rows.forEach((m, k) => {
      const addr = parseInt(m[1], 16), hi = parseInt(m[2], 16), lo = parseInt(m[3], 16);
      assert.equal(addr, 0x200 + 2 * k);
      assert.equal(bytes[addr - 0x200], hi, m[0]);
      assert.equal(bytes[addr - 0x200 + 1], lo, m[0]);
      assert.equal(disassemble((hi << 8) | lo), m[4], m[0]);
    });
    assert.ok(md.includes('Todo junto: `00E0 600A F029 611E 620D D125 120C`.'));
  });

  it('las tres formas de crear a-mano.ch8 escriben exactamente esos 14 bytes', () => {
    const want = example('01-a-mano.asm').bytes;
    // PowerShell: [byte[]](0x00,0xE0,...)
    const ps = /\[byte\[\]\]\(([^)]*)\)/.exec(md);
    assert.ok(ps);
    assert.deepEqual(new Uint8Array(ps[1].split(',').map((s) => parseInt(s.trim(), 16))), want);
    // xxd
    const xxd = /^echo ([0-9A-F]+) \| xxd -r -p > a-mano\.ch8$/m.exec(md);
    assert.ok(xxd);
    assert.deepEqual(hexToBytes(xxd[1]), want);
    // Node: se ejecuta tal cual, en una carpeta temporal.
    const node = /^node -e "(.+)"$/m.exec(md);
    assert.ok(node);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8-a-mano-'));
    try {
      const res = spawnSync(process.execPath, ['-e', node[1]], { cwd: dir, encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
      assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(dir, 'a-mano.ch8'))), want);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('las variantes de la sección 3.6 hacen lo que dice el texto', () => {
    const cerca = '00E0 600A F029 613E 620D D125 120C';
    const doble = '00E0 600A F029 611E 620D D125 D125 120E';
    assert.ok(md.includes('`' + cerca + '`'));
    assert.ok(md.includes('`' + doble + '`'));
    const A = glyph(0xA);
    // x = 62: con recorte (VIP) solo se ven las dos primeras columnas de la A...
    const vip = new Chip8();
    vip.loadRom(hexToBytes(cerca));
    run(vip, 10);
    assertScreen(vip, [{ x: 62, y: 13, rows: A }]);
    // ...y sin recorte (XO-CHIP) las otras dos aparecen en las columnas 0 y 1.
    const xo = new Chip8({ quirks: QUIRK_PRESETS.xochip.quirks });
    xo.loadRom(hexToBytes(cerca));
    run(xo, 10);
    assertScreen(xo, [{ x: 62, y: 13, rows: A }, { x: 0, y: 13, rows: A.map((b) => (b << 2) & 0xFF) }]);
    // Dibujar dos veces: no queda nada, VF = 1 y el programa se queda en 0x20E.
    const twice = new Chip8();
    twice.loadRom(hexToBytes(doble));
    run(twice, 10);
    assert.ok(twice.display.every((p) => p === 0));
    assert.equal(twice.V[0xF], 1);
    assert.equal(twice.pc, 0x20E);
  });

  it('la tabla de errores muestra los mensajes exactos del ensamblador', () => {
    const lines = md.split('\n');
    const start = lines.indexOf('<!-- verificar: tabla-errores -->');
    assert.ok(start >= 0);
    let count = 0;
    for (let i = start + 1; i < lines.length && lines[i].startsWith('|'); i++) {
      const m = /^\| `([^`]+)` \| `(Línea [^`]+)` \|/.exec(lines[i]);
      if (!m) continue;
      assert.throws(() => assemble(m[1]), (e) => {
        assert.equal(e.message, m[2], lines[i]);
        return true;
      });
      count++;
    }
    assert.ok(count >= 10);
  });

  it('cita bien el error y la cuenta de instrucciones de 11-sin-fin', () => {
    const cpu = machine('11-sin-fin.asm', { guard: false });
    let executed = 0;
    while (!cpu.halted) executed += cpu.runFrame(15);
    assert.equal(executed, 1457);
    assert.ok(md.includes('**' + executed + ' instrucciones**'));
    assert.ok(md.includes(cpu.error));
    assert.ok(md.includes('1410 instrucciones'));
    // Y con SUPER-CHIP se detiene "medio minuto después", a 15 IPF.
    const s = machine('11-sin-fin.asm', { preset: 'schip', guard: false });
    let frames = 0;
    while (!s.halted && frames < 5000) { s.runFrame(15); frames++; }
    assert.ok(frames > 1500 && frames < 2100, frames + ' cuadros');
  });

  it('los textos y valores de la consola que cita están en chip8.html', () => {
    const html = fs.readFileSync(path.join(ROOT, 'chip8.html'), 'utf8');
    const quoted = [
      'Cargar ROM', 'Soltá el cartucho acá', 'Sonido: tocá la consola para activarlo',
      'Presioná Reiniciar (Retroceso) para volver a empezar.', 'ESPERANDO TECLA', 'PAUSA',
      'Personalizado', 'Cartuchos incluidos', 'MEMORIA EN I', 'DESENSAMBLADO', 'INSTRUCCIONES',
      'Verde fósforo', 'Ámbar', 'Blanco', 'LCD', 'Scanlines', 'Persistencia', 'Silencio', 'Volumen',
      "'VF=0'", "'MEM'", "'SHIFT'", "'BXNN'", "'CLIP'", "'VBLANK'",
      'Sin cartucho', 'Ejecutando', 'Esperando tecla', 'Pausado', "'Error'",
      'IPF_PRESETS = [7, 15, 30, 100, 500, 1000]', 'IPF_DEFAULT = 15', 'BEEP_HZ = 440',
      "osc.type = 'square'", 'MAX_CATCHUP = 4', 'DISASM_BEFORE = 7, DISASM_AFTER = 12',
    ];
    for (const s of quoted) assert.ok(html.includes(s), 'chip8.html ya no contiene: ' + s);
    // El mapa del teclado del diagrama de la sección 1.4.
    const map = {
      Digit1: 0x1, Digit2: 0x2, Digit3: 0x3, Digit4: 0xC, KeyQ: 0x4, KeyW: 0x5, KeyE: 0x6, KeyR: 0xD,
      KeyA: 0x7, KeyS: 0x8, KeyD: 0x9, KeyF: 0xE, KeyZ: 0xA, KeyX: 0x0, KeyC: 0xB, KeyV: 0xF,
    };
    for (const [code, key] of Object.entries(map)) {
      assert.match(html, new RegExp(code + ': 0x' + key.toString(16).toUpperCase() + '\\b'));
    }
    assert.ok(md.includes('│ Z │ X │ C │ V │     │ A │ 0 │ B │ F │'));
  });

  it('los enlaces internos y los enlaces al manual llevan a encabezados que existen', () => {
    const own = anchorsOf(md);
    const manualPath = path.join(ROOT, 'docs', 'MANUAL.md');
    const manual = fs.existsSync(manualPath) ? anchorsOf(fs.readFileSync(manualPath, 'utf8')) : null;
    let checked = 0;
    for (const link of linksOf(md)) {
      if (/^[a-z]+:/i.test(link)) continue; // externos
      const [file, anchor] = link.split('#');
      if (file === '' && anchor) {
        assert.ok(own.has(anchor), 'ancla inexistente en el tutorial: #' + anchor);
        checked++;
      } else if (file === 'MANUAL.md' && anchor) {
        assert.ok(manual, 'falta docs/MANUAL.md');
        assert.ok(manual.has(anchor), 'ancla inexistente en MANUAL.md: #' + anchor);
        checked++;
      }
    }
    assert.ok(checked >= 30, 'enlaces revisados: ' + checked);
  });

  // DESARROLLO.md y README.md los escriben otras partes del proyecto: si todavía
  // no existen, el test correspondiente queda salteado (y no falla).
  const PENDING = ['DESARROLLO.md', '../README.md'];
  it('los enlaces a archivos del repositorio existen', () => {
    for (const link of linksOf(readTutorial())) {
      if (/^[a-z]+:/i.test(link)) continue;
      const file = link.split('#')[0];
      if (!file || PENDING.includes(file)) continue;
      assert.ok(fs.existsSync(path.join(ROOT, 'docs', file)), 'enlace roto: ' + link);
    }
  });

  for (const file of PENDING) {
    const exists = fs.existsSync(path.join(ROOT, 'docs', file));
    it('el enlace a ' + file + ' lleva a un archivo que existe',
      { skip: exists ? false : file + ' todavía no está escrito' }, () => {
        assert.ok(linksOf(readTutorial()).some((l) => l.split('#')[0] === file));
        assert.ok(exists);
      });
  }
});
