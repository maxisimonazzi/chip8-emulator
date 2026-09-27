'use strict';
// Tests de los programas de demostración (roms/*.asm) y de tools/embed-roms.js.
//
// Los tests de comportamiento ensamblan roms/*.asm directamente, así que no
// dependen de que chip8.html ya tenga las ROMs incrustadas. Los que revisan el
// bloque <script id="chip8-roms"> (embed --check y loadDemos) solo pasan
// después de correr "node tools/embed-roms.js".
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadCore, loadDemos, hexToBytes, pixel, renderAscii, loadAssembler } = require('./harness');

const core = loadCore();
const { Chip8, QUIRK_PRESETS, FONT } = core;
const { assemble } = loadAssembler();

const ROMS_DIR = path.join(ROOT, 'roms');
const DEMO_IDS = ['rebote', 'teclado', 'atrapa', 'autotest', 'fuente']; // en el orden de @order
const PRESETS = Object.keys(QUIRK_PRESETS);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const cache = {};
function rom(id) {
  if (!cache[id]) {
    const source = fs.readFileSync(path.join(ROMS_DIR, id + '.asm'), 'utf8');
    const result = assemble(source);
    // Direcciones donde empieza una instrucción (no datos), según el listado.
    const code = new Set();
    for (const entry of result.listing) {
      const text = entry.text.replace(/;.*$/, '').replace(/^\s*[^\s:;,]+\s*:/, '').trim();
      const word = text.split(/\s+/)[0].toUpperCase();
      if (entry.bytes.length === 2 && word !== 'DB' && word !== 'DW') code.add(entry.addr);
    }
    cache[id] = { source, bytes: result.bytes, labels: result.labels, code };
  }
  return cache[id];
}

function tagsOf(source) {
  const tags = {};
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim().startsWith(';')) break;
    const m = /^;+\s*@(\w+)\s+(.*?)\s*$/.exec(line.trim());
    if (m) tags[m[1]] = m[2];
  }
  return tags;
}

// Generador pseudoaleatorio reproducible para CXNN.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 16) & 0xFF;
  };
}

// Crea la máquina con la demo cargada. Por defecto vigila que el programa
// nunca ejecute bytes de datos (solo direcciones que son instrucciones).
function demo(id, preset = 'vip', { random = seeded(1234), guard = true } = {}) {
  const r = rom(id);
  const cpu = new Chip8({ quirks: { ...QUIRK_PRESETS[preset].quirks }, random });
  cpu.loadRom(r.bytes);
  if (guard) {
    const step = cpu.step;
    cpu.step = function () {
      if (!this.halted && !this.waitingForKey && !r.code.has(this.pc)) {
        throw new Error(id + ': ejecutó datos en 0x' + this.pc.toString(16));
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

function litCount(cpu, x0 = 0, y0 = 0, w = 64, h = 32) {
  let n = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) n += pixel(cpu, x, y);
  return n;
}

// Compara una región de la pantalla con un sprite (filas de bits, MSB a la izquierda).
function matchesSprite(cpu, x, y, rows, width) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < width; c++) {
      const want = (rows[r] >> (7 - c)) & 1;
      if (pixel(cpu, x + c, y + r) !== want) return false;
    }
  }
  return true;
}

function glyph(d) {
  return Array.from(FONT.slice(d * 5, d * 5 + 5));
}

function snapshot(cpu) {
  return Array.from(cpu.display).join('');
}

// ---------------------------------------------------------------------------
// Fuentes, binarios e incrustación
// ---------------------------------------------------------------------------

describe('roms/*.asm y roms/*.ch8', () => {
  it('están las cinco demos', () => {
    const asm = fs.readdirSync(ROMS_DIR).filter((f) => f.endsWith('.asm')).map((f) => f.slice(0, -4)).sort();
    assert.deepEqual(asm, [...DEMO_IDS].sort());
  });

  for (const id of DEMO_IDS) {
    it(id + '.asm ensambla idéntico a ' + id + '.ch8', () => {
      const ch8 = fs.readFileSync(path.join(ROMS_DIR, id + '.ch8'));
      assert.deepEqual(Array.from(rom(id).bytes), Array.from(ch8));
      assert.ok(rom(id).bytes.length > 0 && rom(id).bytes.length <= 3584);
    });

    it(id + '.asm tiene las etiquetas @name, @description, @controls y @order', () => {
      const tags = tagsOf(rom(id).source);
      for (const t of ['name', 'description', 'controls', 'order']) assert.ok(tags[t], 'falta @' + t);
      assert.equal(Number(tags.order), DEMO_IDS.indexOf(id) + 1);
    });
  }
});

describe('chip8.html tiene las demos incrustadas (requiere correr tools/embed-roms.js)', () => {
  it('"node tools/embed-roms.js --check" pasa', () => {
    const res = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'embed-roms.js'), '--check'], {
      cwd: ROOT, encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr || res.stdout);
  });

  it('CHIP8_DEMOS coincide con las fuentes, en el orden de @order', () => {
    const demos = loadDemos();
    assert.deepEqual(demos.map((d) => d.id), DEMO_IDS);
    for (const d of demos) {
      const tags = tagsOf(rom(d.id).source);
      assert.equal(d.name, tags.name);
      assert.equal(d.description, tags.description);
      assert.equal(d.controls, tags.controls);
      assert.match(d.hex, /^[0-9A-F]+$/);
      assert.deepEqual(Array.from(hexToBytes(d.hex)), Array.from(rom(d.id).bytes));
    }
  });
});

describe('tools/embed-roms.js', () => {
  it('reemplaza solo el bloque chip8-roms, respeta CRLF y es idempotente', () => {
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-'));
    try {
      const file = path.join(dir, 'pagina.html');
      const before = '<!doctype html>\r\n<p>á</p>\r\n<script id="chip8-roms">\r\nviejo\r\n</script>\r\n<script id="chip8-ui">x</script>\r\n';
      fs.writeFileSync(file, before);
      const tool = path.join(ROOT, 'tools', 'embed-roms.js');
      const check1 = spawnSync(process.execPath, [tool, '--html', file, '--check'], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(check1.status, 1, 'con el bloque viejo --check debe fallar');
      assert.equal(fs.readFileSync(file, 'utf8'), before, '--check no debe escribir');

      const res = spawnSync(process.execPath, [tool, '--html', file], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
      const after = fs.readFileSync(file, 'utf8');
      const open = '<script id="chip8-roms">';
      const start = after.indexOf(open) + open.length;
      const end = after.indexOf('</script>', start);
      assert.equal(after.slice(0, start), before.slice(0, before.indexOf(open) + open.length));
      assert.equal(after.slice(end), before.slice(before.indexOf('</script>')));
      const block = after.slice(start, end);
      assert.ok(block.startsWith('\r\n/* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */\r\nglobalThis.CHIP8_DEMOS = ['));
      assert.ok(!/[^\r]\n/.test(block), 'todas las líneas deben terminar en CRLF');

      globalThis.CHIP8_DEMOS = undefined;
      new (require('node:vm').Script)(block).runInThisContext();
      assert.deepEqual(globalThis.CHIP8_DEMOS.map((d) => d.id), DEMO_IDS);

      const check2 = spawnSync(process.execPath, [tool, '--html', file, '--check'], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(check2.status, 0, check2.stderr);
      spawnSync(process.execPath, [tool, '--html', file], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(fs.readFileSync(file, 'utf8'), after, 'correrlo de nuevo no cambia nada');
    } finally {
      delete globalThis.CHIP8_DEMOS;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Todas las demos, con todos los presets
// ---------------------------------------------------------------------------

describe('cada demo corre 600 cuadros sin errores con cada preset', () => {
  for (const id of DEMO_IDS) {
    for (const preset of PRESETS) {
      it(id + ' / ' + preset, () => {
        const cpu = demo(id, preset);
        run(cpu, 600);
        assert.equal(cpu.halted, false);
        assert.equal(cpu.error, null);
        assert.ok(litCount(cpu) > 0, 'la pantalla no debería estar vacía');
        assert.ok(cpu.sp <= 2, 'la pila no debería crecer');
      });
    }
  }

  it('las demos estáticas dibujan exactamente lo mismo con los tres presets', () => {
    for (const id of ['fuente', 'autotest']) {
      const shots = PRESETS.map((p) => snapshot(run(demo(id, p), 300)));
      assert.equal(shots[1], shots[0], id + ': SUPER-CHIP distinto de VIP');
      assert.equal(shots[2], shots[0], id + ': XO-CHIP distinto de VIP');
    }
  });
});

// ---------------------------------------------------------------------------
// rebote
// ---------------------------------------------------------------------------

// Caja que encierra los píxeles prendidos del área de juego (filas 9..31).
function playBox(cpu) {
  let minX = 99, minY = 99, maxX = -1, maxY = -1;
  for (let y = 9; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      if (pixel(cpu, x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY].join(',');
}

describe('rebote', () => {
  it('la pelota se mueve y nunca sale del área de juego', () => {
    const cpu = demo('rebote');
    run(cpu, 60);
    const boxes = new Set();
    for (let f = 0; f < 600; f++) {
      run(cpu, 1);
      boxes.add(playBox(cpu));
      assert.equal(litCount(cpu, 0, 8, 64, 1), 0, 'la fila 8 separa el título del área de juego');
    }
    assert.ok(boxes.size > 50, 'la pelota debería pasar por muchas posiciones (' + boxes.size + ')');
  });

  it('dibuja el título y la línea', () => {
    const cpu = run(demo('rebote'), 60);
    assert.equal(litCount(cpu, 0, 7, 64, 1), 64, 'línea completa en la fila 7');
    assert.ok(litCount(cpu, 0, 0, 64, 6) > 40, 'título en las filas 1..5');
  });

  it('suena al rebotar', () => {
    for (const preset of PRESETS) {
      const cpu = demo('rebote', preset);
      let beeps = 0;
      for (let f = 0; f < 600; f++) {
        run(cpu, 1);
        if (cpu.soundTimer > 0) beeps++;
      }
      assert.ok(beeps > 0, preset + ': debería sonar al menos una vez');
      assert.ok(beeps < 300, preset + ': el pitido debe ser corto');
    }
  });

  // Cuenta los pasos en 10 s: cada vez que la pelota aparece completa (44
  // píxeles en una caja de 8x8) en una posición distinta de la anterior.
  function reboteSteps(preset, ipf) {
    const ballAt = (cpu) => {
      const box = playBox(cpu).split(',').map(Number);
      if (litCount(cpu, 0, 9, 64, 23) !== 44 || box[2] - box[0] !== 7 || box[3] - box[1] !== 7) return null;
      return box[0] + ',' + box[1];
    };
    const cpu = demo('rebote', preset);
    run(cpu, 100, ipf);
    let prev = null;
    let n = 0;
    for (let f = 0; f < 600; f++) {
      run(cpu, 1, ipf);
      const pos = ballAt(cpu);
      if (pos !== null && prev !== null && pos !== prev) n++;
      if (pos !== null) prev = pos;
    }
    return n;
  }

  it('se mueve a 30 pasos por segundo con 15 o más instrucciones por cuadro', () => {
    for (const preset of PRESETS) {
      for (const ipf of [15, 30, 100, 1000]) {
        const n = reboteSteps(preset, ipf);
        assert.ok(Math.abs(n - 300) <= 2, preset + ', IPF ' + ipf + ': 30 pasos por segundo, fueron ' + n + ' en 10 s');
      }
    }
  });

  it('a 7 instrucciones por cuadro va más despacio, como dice el comentario de rebote.asm', () => {
    // "unos 19 pasos por segundo en el VIP y 22 en los otros dos"
    const want = { vip: 19, schip: 22, xochip: 22 };
    for (const preset of PRESETS) {
      const perSecond = reboteSteps(preset, 7) / 10;
      assert.ok(Math.abs(perSecond - want[preset]) <= 1, preset + ': ' + perSecond + ' pasos por segundo');
    }
  });

  it('el cuadro intermedio muestra el XOR de las dos pelotas (36 píxeles), no la pelota entera', () => {
    // Con "espera de vblank" (VIP) se ven alternados: la pelota (44) y la silueta (36).
    const cpu = run(demo('rebote', 'vip'), 60);
    const counts = {};
    for (let f = 0; f < 600; f++) {
      run(cpu, 1);
      const n = litCount(cpu, 0, 9, 64, 23);
      counts[n] = (counts[n] || 0) + 1;
    }
    assert.deepEqual(counts, { 36: 300, 44: 300 });
    // Sin ese quirk y con 30 o más instrucciones por cuadro, la silueta no se ve nunca.
    for (const preset of ['schip', 'xochip']) {
      const c = run(demo('rebote', preset), 60, 30);
      for (let f = 0; f < 600; f++) {
        run(c, 1, 30);
        assert.equal(litCount(c, 0, 9, 64, 23), 44, preset + ', cuadro ' + f);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// teclado
// ---------------------------------------------------------------------------

const LAYOUT = ['123C', '456D', '789E', 'A0BF'];
function cellOf(key) {
  for (let r = 0; r < 4; r++) {
    const c = LAYOUT[r].indexOf(key.toString(16).toUpperCase());
    if (c >= 0) return { x: 1 + 8 * c, y: 8 * r };
  }
  throw new Error('tecla inválida');
}
// La celda está resaltada si sus esquinas (que el dígito nunca toca) están prendidas.
function cellLit(cpu, key) {
  const { x, y } = cellOf(key);
  const corners = [pixel(cpu, x, y), pixel(cpu, x + 5, y), pixel(cpu, x, y + 6), pixel(cpu, x + 5, y + 6)];
  if (corners.every((p) => p === 1)) return true;
  if (corners.every((p) => p === 0)) return false;
  throw new Error('celda de la tecla ' + key + ' a medio dibujar:\n' + renderAscii(cpu));
}
function bigDigitIs(cpu, d) {
  const rows = [];
  for (const b of glyph(d)) {
    let v = 0;
    for (let i = 0; i < 4; i++) if (b & (0x80 >> i)) v |= 0xC0 >> (2 * i);
    rows.push(v, v);
  }
  return matchesSprite(cpu, 44, 11, rows, 8);
}

describe('teclado', () => {
  it('muestra los 16 dígitos en el orden del COSMAC VIP', () => {
    const cpu = run(demo('teclado'), 120);
    for (let k = 0; k < 16; k++) {
      const { x, y } = cellOf(k);
      assert.ok(matchesSprite(cpu, x + 1, y + 1, glyph(k), 4), 'dígito ' + k.toString(16));
      assert.equal(cellLit(cpu, k), false);
    }
    assert.equal(litCount(cpu, 44, 11, 8, 10), 0, 'todavía no hay dígito grande');
  });

  for (const preset of PRESETS) {
    it('cada tecla ilumina su celda mientras está apretada (' + preset + ')', () => {
      const cpu = run(demo('teclado', preset), 120);
      for (let k = 0; k < 16; k++) {
        cpu.setKey(k, true);
        let beeped = false;
        for (let f = 0; f < 12; f++) {
          run(cpu, 1);
          if (cpu.soundTimer > 0) beeped = true;
        }
        assert.ok(beeped, 'la tecla ' + k + ' debería sonar');
        for (let j = 0; j < 16; j++) assert.equal(cellLit(cpu, j), j === k, 'con la tecla ' + k + ', celda ' + j);
        assert.ok(bigDigitIs(cpu, k), 'dígito grande ' + k + ':\n' + renderAscii(cpu));
        cpu.setKey(k, false);
        run(cpu, 12);
        assert.equal(cellLit(cpu, k), false, 'la celda ' + k + ' se apaga al soltar');
        assert.ok(bigDigitIs(cpu, k), 'el dígito grande queda');
      }
    });
  }

  it('maneja varias teclas a la vez', () => {
    const cpu = run(demo('teclado'), 120);
    cpu.setKey(0x5, true);
    cpu.setKey(0xA, true);
    run(cpu, 12);
    assert.ok(cellLit(cpu, 0x5) && cellLit(cpu, 0xA));
    cpu.setKey(0xF, true);
    run(cpu, 12);
    assert.ok(cellLit(cpu, 0x5) && cellLit(cpu, 0xA) && cellLit(cpu, 0xF));
    assert.ok(bigDigitIs(cpu, 0xF), 'la última apretada aparece en grande');
    cpu.setKey(0x5, false);
    run(cpu, 12);
    assert.ok(!cellLit(cpu, 0x5) && cellLit(cpu, 0xA) && cellLit(cpu, 0xF));
    cpu.setKey(0xA, false);
    cpu.setKey(0xF, false);
    run(cpu, 12);
    for (let k = 0; k < 16; k++) assert.equal(cellLit(cpu, k), false);
  });

  it('responde en pocos cuadros incluso a 15 instrucciones por cuadro', () => {
    const cpu = run(demo('teclado'), 120);
    cpu.setKey(0xC, true);
    let frames = 0;
    while (!cellLit(cpu, 0xC) && frames < 60) {
      run(cpu, 1);
      frames++;
    }
    assert.ok(frames <= 8, 'tardó ' + frames + ' cuadros');
  });
});

// ---------------------------------------------------------------------------
// atrapa
// ---------------------------------------------------------------------------

// x de la paleta: primer tramo de 6 píxeles prendidos en las filas 30 y 31.
function paddleX(cpu) {
  for (let x = 0; x <= 58; x++) {
    let ok = true;
    for (let i = 0; i < 6 && ok; i++) ok = pixel(cpu, x + i, 30) === 1 && pixel(cpu, x + i, 31) === 1;
    if (ok) return x;
  }
  return -1;
}
function hearts(cpu) {
  let n = 0;
  for (const x of [46, 52, 58]) if (pixel(cpu, x + 1, 0) && pixel(cpu, x + 2, 2)) n++;
  return n;
}

describe('atrapa', () => {
  it('empieza con marcador 000, tres vidas y la paleta en el centro', () => {
    const cpu = run(demo('atrapa'), 30);
    for (const x of [1, 6, 11]) assert.ok(matchesSprite(cpu, x, 0, glyph(0), 4), 'dígito en x = ' + x);
    assert.equal(hearts(cpu), 3);
    assert.equal(paddleX(cpu), 28);
    assert.equal(litCount(cpu, 0, 6, 64, 1), 64, 'línea del marcador');
  });

  for (const preset of PRESETS) {
    it('la paleta se mueve con 7/4 (izquierda) y 9/6 (derecha) (' + preset + ')', () => {
      const cpu = run(demo('atrapa', preset), 20);
      let x = paddleX(cpu);
      for (const [key, dir] of [[7, -1], [9, 1], [4, -1], [6, 1]]) {
        cpu.setKey(key, true);
        run(cpu, 24);
        cpu.setKey(key, false);
        run(cpu, 3);
        const nx = paddleX(cpu);
        assert.ok((nx - x) * dir >= 10, 'tecla ' + key + ': ' + x + ' -> ' + nx);
        x = nx;
      }
    });
  }

  it('la paleta no se sale de la pantalla', () => {
    const cpu = run(demo('atrapa'), 20);
    cpu.setKey(7, true);
    run(cpu, 120);
    assert.equal(paddleX(cpu), 0);
    cpu.setKey(7, false);
    cpu.setKey(9, true);
    run(cpu, 150);
    assert.equal(paddleX(cpu), 58);
  });

  it('sin tocar nada se pierden las 3 vidas, aparece FIN y una tecla reinicia', () => {
    for (const preset of PRESETS) {
      const cpu = demo('atrapa', preset, { random: seeded(99) });
      let frames = 0;
      while (!cpu.waitingForKey && frames < 20000) {
        run(cpu, 1);
        frames++;
      }
      assert.ok(cpu.waitingForKey, preset + ': debería terminar el juego');
      assert.equal(hearts(cpu), 0);
      assert.equal(litCount(cpu, 20, 11, 8, 1), 8, 'la F grande de "FIN"');

      cpu.setKey(5, true);
      run(cpu, 5);
      assert.ok(cpu.waitingForKey, 'apretar sola no alcanza: FX0A espera que se suelte');
      cpu.setKey(5, false);
      run(cpu, 30);
      assert.equal(cpu.waitingForKey, false);
      assert.equal(hearts(cpu), 3, preset + ': vuelve a empezar con tres vidas');
      assert.equal(litCount(cpu, 20, 11, 8, 1) < 8, true, 'ya no está "FIN"');
    }
  });

  it('atrapar un bloque suma un punto y suena', () => {
    // Un jugador automático: sigue al bloque.
    const cpu = demo('atrapa', 'vip', { random: seeded(7) });
    const blockX = () => {
      for (let y = 7; y < 30; y++) for (let x = 0; x < 64; x++) if (pixel(cpu, x, y)) return x;
      return -1;
    };
    let beeps = 0;
    for (let f = 0; f < 900; f++) {
      const bx = blockX();
      const px = paddleX(cpu);
      cpu.setKey(7, bx >= 0 && px >= 0 && bx + 1 < px + 1);
      cpu.setKey(9, bx >= 0 && px >= 0 && bx + 1 > px + 3);
      run(cpu, 1);
      if (cpu.soundTimer > 0) beeps++;
    }
    const score = [1, 6, 11].map((x) => {
      for (let d = 0; d < 10; d++) if (matchesSprite(cpu, x, 0, glyph(d), 4)) return d;
      return -1;
    });
    const value = score[0] * 100 + score[1] * 10 + score[2];
    assert.ok(value >= 3, 'debería haber atrapado varios bloques, puntaje ' + score.join(''));
    assert.ok(beeps > 0);
    assert.equal(hearts(cpu), 3, 'el jugador automático no pierde vidas');
  });

  // Jugador perfecto: lee los registros (V3 = x de la paleta, V5 = x del
  // bloque) y va hacia el bloque por el camino más corto.
  function perfectPlayer(cpu) {
    const px = cpu.V[3], bx = cpu.V[5];
    cpu.setKey(7, px > bx + 3);
    cpu.setKey(9, px + 5 < bx);
  }

  it('a la velocidad máxima cualquier bloque se puede atrapar, aparezca donde aparezca', () => {
    const source = rom('atrapa').source;
    const equ = (name) => Number(new RegExp('^' + name + '\\s+EQU\\s+(\\d+)', 'm').exec(source)[1]);
    const fall = equ('BLOQUE_PISO') - equ('BLOQUE_Y0');
    const stepsToFloor = Math.ceil(fall * 256 / equ('VEL_MAXIMA'));
    assert.ok(stepsToFloor > 28, 'el bloque tarda ' + stepsToFloor + ' pasos y la paleta necesita 28');
    // El peor caso siempre: los bloques aparecen alternados en x = 0 y x = 60,
    // así que la paleta tiene que cruzar la pantalla entera cada vez.
    for (const preset of PRESETS) {
      let n = 0;
      const cpu = demo('atrapa', preset, { random: () => (n++ % 2 ? 0 : 60) });
      let catchesAtMax = 0, score = 0;
      for (let f = 0; f < 60 * 120 && catchesAtMax < 10; f++) {
        perfectPlayer(cpu);
        run(cpu, 1);
        if (cpu.V[8] !== score) {
          score = cpu.V[8];
          if (cpu.V[9] === equ('VEL_MAXIMA')) catchesAtMax++;
        }
        assert.equal(cpu.V[7], 3, preset + ': se perdió una vida con puntaje ' + score + ' y velocidad ' + cpu.V[9]);
      }
      assert.equal(catchesAtMax, 10, preset + ': debería llegar a la velocidad máxima (puntaje ' + score + ')');
    }
  });

  it('un bloque que la paleta toca de costado, ya encima de ella, cuenta como atrapado', () => {
    // La paleta espera al costado del bloque, sin tocarlo, hasta que el bloque
    // baja a la fila 27 (su última fila tapa la fila 30 de la paleta) y recién
    // ahí se mete debajo.
    for (const preset of PRESETS) {
      for (const ipf of [15, 1000]) {
        const cpu = demo('atrapa', preset, { random: seeded(4) });
        let result = null;
        for (let f = 0; f < 3000 && !result; f++) {
          const px = cpu.V[3], bx = cpu.V[5], by = cpu.V[6];
          const side = bx + 4 + ((bx + 4) & 1) <= 58 ? bx + 4 + ((bx + 4) & 1) : bx - 6 - (bx & 1);
          const goal = by >= 27 ? bx : side;
          cpu.setKey(7, px > goal + 1);
          cpu.setKey(9, px < goal - 1);
          const score = cpu.V[8], lives = cpu.V[7];
          run(cpu, 1, ipf);
          if (cpu.V[8] > score) result = 'atrapado con y = ' + by;
          else if (cpu.V[7] < lives) result = 'perdió una vida con y = ' + by;
        }
        assert.equal(result, 'atrapado con y = 27', preset + ', IPF ' + ipf);
        run(cpu, 3, ipf);
        assert.equal(paddleX(cpu), cpu.V[3], 'la paleta queda entera');
        assert.equal(litCount(cpu, 0, 30, 64, 2), 12, 'en las filas 30 y 31 solo queda la paleta');
      }
    }
  });

  it('corre a la misma velocidad a 15 y a 1000 instrucciones por cuadro', () => {
    const trace = (ipf) => {
      const cpu = demo('atrapa', 'vip', { random: seeded(5) });
      const out = [];
      run(cpu, 10, ipf);
      cpu.setKey(9, true);
      for (let f = 0; f < 400; f++) {
        run(cpu, 1, ipf);
        if (f % 40 === 0) out.push(paddleX(cpu) + '/' + litCount(cpu, 0, 7, 64, 23));
      }
      return out;
    };
    const a = trace(15);
    const b = trace(1000);
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    assert.ok(same >= a.length - 2, a.join(' ') + '\n' + b.join(' '));
  });
});

// ---------------------------------------------------------------------------
// autotest
// ---------------------------------------------------------------------------

const BIEN = [0x08, 0x08, 0x10, 0xA0, 0x40];

function finished(cpu, id = 'autotest') {
  const fin = rom(id).labels.fin;
  return cpu.pc === fin && cpu.memory[fin] === (0x10 | (fin >> 8)) && cpu.memory[fin + 1] === (fin & 0xFF);
}

// Cantidad de pruebas que promete autotest.asm: la dice el encabezado ("VD =
// cantidad de pruebas ejecutadas (N)") y tiene que coincidir con @description,
// con los CALL de la lista y con la tabla de etiquetas.
const AUTOTEST_CHECKS = 19;

// Corre autotest hasta "fin: JP fin" (o hasta maxFrames) y devuelve los cuadros.
function runAutotest(cpu, ipf, maxFrames = 600) {
  let frames = 0;
  while (!finished(cpu) && frames < maxFrames) {
    run(cpu, 1, ipf);
    frames++;
  }
  return frames;
}

// Cambia cómo ejecuta la CPU los opcodes que cumplen (op & mask) === value.
function patchOpcode(cpu, mask, value, exec) {
  const step = cpu.step;
  cpu.step = function () {
    const op = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    if ((op & mask) !== value) return step.call(this);
    exec.call(this, (op >> 8) & 0xF, (op >> 4) & 0xF);
    this.pc += 2;
    return true;
  };
}

describe('autotest', () => {
  it('el encabezado, @description, la lista de pruebas y las etiquetas dicen ' + AUTOTEST_CHECKS + ' pruebas', () => {
    const { source } = rom('autotest');
    assert.match(source, new RegExp('VD = cantidad de pruebas ejecutadas \\(' + AUTOTEST_CHECKS + '\\)'));
    assert.match(tagsOf(source).description, new RegExp('ejecuta ' + AUTOTEST_CHECKS + ' comprobaciones'));
    assert.equal((source.match(/^\s+CALL prueba_\w+/gm) || []).length, AUTOTEST_CHECKS);
    const labels = source.slice(source.indexOf('\netiquetas:'), source.indexOf('\nbien:'));
    assert.equal((labels.match(/^\s+DB 0x[0-9A-F], 0x[0-9A-F]\s/gm) || []).length, AUTOTEST_CHECKS);
  });

  for (const preset of PRESETS) {
    for (const ipf of [7, 15, 1000]) {
      it('termina con VE = 0 fallas y VD = ' + AUTOTEST_CHECKS + ' pruebas (' + preset + ', IPF ' + ipf + ')', () => {
        const cpu = demo('autotest', preset);
        runAutotest(cpu, ipf);
        assert.ok(finished(cpu), 'debería quedar en "fin: JP fin"');
        assert.equal(cpu.V[0xD], AUTOTEST_CHECKS, 'VD (pruebas hechas)');
        assert.equal(cpu.V[0xE], 0, 'VE (fallas):\n' + renderAscii(cpu));
        run(cpu, 10, ipf);
        assert.ok(finished(cpu), 'se queda en el bucle final');
      });
    }
  }

  it('también pasa con 1 instrucción por cuadro', () => {
    const cpu = demo('autotest');
    runAutotest(cpu, 1, 3000);
    assert.ok(finished(cpu));
    assert.equal(cpu.V[0xD], AUTOTEST_CHECKS);
    assert.equal(cpu.V[0xE], 0, renderAscii(cpu));
  });

  it('detecta la bandera de SUBN mal calculada cuando Vy == Vx', () => {
    // VF = 1 si Vy > Vx (en lugar de >=): solo se nota con operandos iguales.
    for (const preset of PRESETS) {
      for (const ipf of [7, 15, 1000]) {
        const cpu = demo('autotest', preset, { guard: false });
        patchOpcode(cpu, 0xF00F, 0x8007, function (x, y) {
          const vx = this.V[x], vy = this.V[y];
          this.V[x] = (vy - vx) & 0xFF;
          this.V[0xF] = vy > vx ? 1 : 0;
        });
        runAutotest(cpu, ipf);
        assert.ok(finished(cpu), preset + ', IPF ' + ipf);
        assert.equal(cpu.V[0xD], AUTOTEST_CHECKS);
        assert.equal(cpu.V[0xE], 1, preset + ', IPF ' + ipf + ': debería fallar la prueba 87');
      }
    }
  });

  it('si DT no baja, lo informa en un par de segundos (no se queda colgado)', () => {
    for (const preset of PRESETS) {
      for (const ipf of [7, 15, 1000]) {
        const normal = runAutotest(demo('autotest', preset), ipf);
        const cpu = demo('autotest', preset);
        cpu.tickTimers = function () { if (this.soundTimer > 0) this.soundTimer--; }; // DT congelado
        const frames = runAutotest(cpu, ipf, 3000);
        assert.ok(finished(cpu), preset + ', IPF ' + ipf);
        assert.equal(cpu.V[0xE], 1, 'debería fallar solo la prueba 15');
        const extra = (frames - normal) / 60;
        const limit = ipf >= 15 ? 2.5 : 5.5; // "unos 2 segundos a 15 ... y unos 5 a 7"
        assert.ok(extra <= limit, preset + ', IPF ' + ipf + ': tardó ' + extra.toFixed(1) + ' s de más');
      }
    }
  });

  it('detecta un DT que baja de golpe a 0 o que sube en vez de bajar', () => {
    const broken = {
      'a 0': function () { this.delayTimer = 0; if (this.soundTimer > 0) this.soundTimer--; },
      'sube': function () { if (this.delayTimer > 0) this.delayTimer = (this.delayTimer + 1) & 0xFF; if (this.soundTimer > 0) this.soundTimer--; },
    };
    for (const [name, tick] of Object.entries(broken)) {
      for (const ipf of [1, 15, 1000]) {
        const cpu = demo('autotest');
        cpu.tickTimers = tick;
        runAutotest(cpu, ipf, 3000);
        assert.ok(finished(cpu), name + ', IPF ' + ipf);
        assert.equal(cpu.V[0xE], 1, name + ', IPF ' + ipf);
      }
    }
  });

  it('muestra una tilde en cada celda y el resumen invertido', () => {
    const cpu = demo('autotest');
    run(cpu, 400);
    const n = cpu.V[0xD];
    for (let i = 0; i < n; i++) {
      const x = 16 * (i % 4) + 10;
      const y = 6 * Math.floor(i / 4) + 1;
      assert.ok(matchesSprite(cpu, x, y, BIEN, 5), 'celda ' + i);
    }
    assert.equal(pixel(cpu, 48, 24), 1, 'el resumen está invertido');
    const inverted = BIEN.map((b) => ~b & 0xF8);
    assert.ok(matchesSprite(cpu, 59, 25, inverted, 5), 'tilde (invertida) en el resumen');
  });

  it('detecta un intérprete con errores', () => {
    const cpu = demo('autotest', 'vip', { guard: false });
    const step = cpu.step;
    cpu.step = function () {
      const op = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
      const ok = step.call(this);
      if ((op & 0xF00F) === 0x8005) this.V[0xF] ^= 1; // bandera de SUB invertida
      if ((op & 0xF0FF) === 0xF029) this.I += 1;       // FX29 apunta mal
      return ok;
    };
    run(cpu, 400);
    assert.ok(finished(cpu));
    assert.equal(cpu.V[0xE], 2, 'deberían fallar 2 pruebas');
  });
});

// ---------------------------------------------------------------------------
// fuente
// ---------------------------------------------------------------------------

describe('fuente', () => {
  for (const preset of PRESETS) {
    it('muestra los 16 dígitos en su lugar (' + preset + ')', () => {
      const cpu = run(demo('fuente', preset), 120);
      for (let d = 0; d < 16; d++) {
        const x = 6 + 7 * (d % 8);
        const y = d < 8 ? 9 : 18;
        assert.ok(matchesSprite(cpu, x, y, glyph(d), 4), 'dígito ' + d.toString(16) + ':\n' + renderAscii(cpu));
      }
      // marco: x = 2..62, y = 5..26
      assert.equal(litCount(cpu, 2, 5, 61, 1), 61);
      assert.equal(litCount(cpu, 2, 26, 61, 1), 61);
      assert.equal(litCount(cpu, 2, 5, 1, 22), 22);
      assert.equal(litCount(cpu, 62, 5, 1, 22), 22);
      assert.equal(litCount(cpu), 61 * 2 + 20 * 2 + FONT.reduce((a, b) => a + popcount(b), 0));
      assert.ok(finished(cpu, 'fuente'), 'termina en "fin: JP fin"');
    });
  }
});

function popcount(b) {
  let n = 0;
  for (; b; b >>= 1) n += b & 1;
  return n;
}
