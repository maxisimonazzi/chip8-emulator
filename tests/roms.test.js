'use strict';
// Tests de los programas de demostración (roms/*.asm) y de tools/embed-roms.js.
//
// Los tests de comportamiento ensamblan roms/*.asm directamente, así que no
// dependen de que chip8.html ya tenga las ROMs incrustadas. Los que revisan el
// bloque <script id="chip8-roms"> (embed --check y loadDemos) solo pasan
// después de correr "node tools/embed-roms.js".
// Cada demo corre en la plataforma que dice su etiqueta @platform (sin ella,
// CHIP-8); los perfiles de quirks se prueban siempre dentro de esa plataforma.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadCore, loadDemos, extractScript, hexToBytes, pixel, renderAscii, loadAssembler } = require('./harness');

const core = loadCore();
const { Chip8, QUIRK_PRESETS, FONT, BIG_FONT } = core;
const { assemble } = loadAssembler();

const ROMS_DIR = path.join(ROOT, 'roms');
const DEMO_IDS = ['rebote', 'teclado', 'atrapa', 'autotest', 'fuente', 'planos']; // en el orden de @order
const CHIP8_IDS = DEMO_IDS.slice(0, 5); // las de CHIP-8, sin etiqueta @platform
const PRESETS = Object.keys(QUIRK_PRESETS);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const cache = {};
function rom(id) {
  if (!cache[id]) {
    const source = fs.readFileSync(path.join(ROMS_DIR, id + '.asm'), 'utf8');
    const platform = tagsOf(source).platform || 'chip8';
    const result = assemble(source, { xochip: platform === 'xochip' });
    // Direcciones donde empieza una instrucción (no datos), según el listado.
    const code = new Set();
    for (const entry of result.listing) {
      const text = entry.text.replace(/;.*$/, '').replace(/^\s*[^\s:;,]+\s*:/, '').trim();
      const word = text.split(/\s+/)[0].toUpperCase();
      if (entry.bytes.length === 2 && word !== 'DB' && word !== 'DW') code.add(entry.addr);
    }
    cache[id] = { source, platform, bytes: result.bytes, labels: result.labels, code };
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

// Crea la máquina con la demo cargada, en la plataforma de su etiqueta
// @platform. Por defecto vigila que el programa nunca ejecute bytes de datos
// (solo direcciones que son instrucciones). quirks cambia algunos del perfil.
function demo(id, preset = 'vip', { random = seeded(1234), guard = true, quirks = {} } = {}) {
  const r = rom(id);
  const cpu = new Chip8({ platform: r.platform, quirks: { ...QUIRK_PRESETS[preset].quirks, ...quirks }, random });
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
  it('están las seis demos', () => {
    const asm = fs.readdirSync(ROMS_DIR).filter((f) => f.endsWith('.asm')).map((f) => f.slice(0, -4)).sort();
    assert.deepEqual(asm, [...DEMO_IDS].sort());
  });

  for (const id of DEMO_IDS) {
    it(id + '.asm ensambla idéntico a ' + id + '.ch8', () => {
      const ch8 = fs.readFileSync(path.join(ROMS_DIR, id + '.ch8'));
      assert.deepEqual(Array.from(rom(id).bytes), Array.from(ch8));
      const max = rom(id).platform === 'xochip' ? 65024 : 3584;
      assert.ok(rom(id).bytes.length > 0 && rom(id).bytes.length <= max);
    });

    it(id + '.asm tiene las etiquetas @name, @description, @controls y @order', () => {
      const tags = tagsOf(rom(id).source);
      for (const t of ['name', 'description', 'controls', 'order']) assert.ok(tags[t], 'falta @' + t);
      assert.equal(Number(tags.order), DEMO_IDS.indexOf(id) + 1);
    });
  }

  it('solo Planos lleva @platform (xochip); las otras cinco son de CHIP-8', () => {
    for (const id of DEMO_IDS) {
      assert.equal(tagsOf(rom(id).source).platform, id === 'planos' ? 'xochip' : undefined, id);
      assert.equal(rom(id).platform, id === 'planos' ? 'xochip' : 'chip8', id);
    }
  });
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
      // platform solo está si la fuente tiene la etiqueta @platform
      assert.equal(Object.hasOwn(d, 'platform'), tags.platform !== undefined, d.id + ': campo platform');
      assert.equal(d.platform, tags.platform);
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

// Corre una copia de embed-roms.js (con el ensamblador y el chip8.html de donde lo
// saca) en una carpeta temporal con sus propios roms/*.asm: la herramienta busca
// roms/ al lado de tools/, así que nada de esto toca el repositorio.
function embedSandbox(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-platform-'));
  try {
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.mkdirSync(path.join(dir, 'roms'));
    for (const f of ['embed-roms.js', 'chip8asm.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
    fs.copyFileSync(path.join(ROOT, 'chip8.html'), path.join(dir, 'chip8.html'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'roms', name), text);
    const html = path.join(dir, 'pagina.html');
    fs.writeFileSync(html, '<script id="chip8-roms">\n</script>\n');
    const run = (...args) => spawnSync(process.execPath, [path.join(dir, 'tools', 'embed-roms.js'), '--html', html, ...args],
      { cwd: dir, encoding: 'utf8' });
    const block = () => {
      const text = fs.readFileSync(html, 'utf8');
      const start = text.indexOf('<script id="chip8-roms">') + '<script id="chip8-roms">'.length;
      return text.slice(start, text.indexOf('</script>', start));
    };
    return fn({ run, block, html });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Las entradas de un bloque chip8-roms, por id: el texto desde "  {" hasta "  }".
function blockEntries(block) {
  const out = {};
  for (const m of block.replace(/\r\n/g, '\n').matchAll(/^ {2}\{\n {4}id: "([^"]+)",[\s\S]*?^ {2}\}/gm)) out[m[1]] = m[0];
  return out;
}

// Evalúa un bloque chip8-roms aparte y devuelve CHIP8_DEMOS (copiado con JSON
// para que sean objetos de este contexto).
function evalBlock(block) {
  const sandbox = {};
  require('node:vm').runInNewContext(block, sandbox);
  return JSON.parse(JSON.stringify(sandbox.CHIP8_DEMOS));
}

function demoSource(tags, body = 'fin: JP fin') {
  return Object.entries(tags).map(([k, v]) => '; @' + k + (v === '' ? '' : ' ' + v)).join('\n') + '\n\n' + body + '\n';
}

describe('tools/embed-roms.js: la etiqueta @platform', () => {
  it('las cinco demos de CHIP-8 generan exactamente las mismas entradas que ya tiene chip8.html', () => {
    const files = {};
    for (const id of DEMO_IDS) files[id + '.asm'] = rom(id).source;
    embedSandbox(files, ({ run, block }) => {
      const res = run();
      assert.equal(res.status, 0, res.stderr);
      const generated = block();
      const current = extractScript('chip8-roms').code;
      const normalize = (s) => s.replace(/\r\n/g, '\n');
      // El encabezado del bloque es el mismo...
      const head = (s) => normalize(s).split('\n').slice(0, 3).join('\n');
      assert.equal(head(generated), head(current));
      // ...y cada entrada de CHIP-8, letra por letra (sin campo platform).
      const gen = blockEntries(generated), cur = blockEntries(current);
      for (const id of CHIP8_IDS) {
        assert.ok(cur[id], 'chip8.html no tiene la entrada ' + id);
        assert.equal(gen[id], cur[id], id);
        assert.doesNotMatch(gen[id], /platform/, id);
      }
      // Planos es la única con platform, justo antes de hex.
      assert.match(gen.planos, /\n {4}controls: "[^"]*",\n {4}platform: "xochip",\n {4}hex: "[0-9A-F]+"\n/);
      assert.deepEqual(Object.keys(gen), DEMO_IDS);
      // Sin la fuente de Planos, el bloque generado es el de antes de que existiera.
      const old = evalBlock(generated).filter((d) => CHIP8_IDS.includes(d.id));
      assert.deepEqual(old.map((d) => Object.keys(d)), CHIP8_IDS.map(() => ['id', 'name', 'description', 'controls', 'hex']));
    });
  });

  it('una etiqueta @platform inválida (o vacía) es un error en castellano y no escribe nada', () => {
    const base = { name: 'Mala', description: 'Una demo.', controls: 'Ninguno.', order: '1' };
    for (const [value, shown] of [['xo-chip', 'xo-chip'], ['XOCHIP', 'XOCHIP'], ['', '']]) {
      embedSandbox({ 'mala.asm': demoSource({ ...base, platform: value }) }, ({ run, html }) => {
        const before = fs.readFileSync(html, 'utf8');
        for (const args of [[], ['--check']]) {
          const res = run(...args);
          assert.equal(res.status, 1, 'valor "' + value + '" ' + args.join(' '));
          assert.equal(res.stderr.trim(),
            'embed-roms: mala.asm: @platform tiene que ser chip8, schip o xochip (dice "' + shown + '")');
        }
        assert.equal(fs.readFileSync(html, 'utf8'), before);
      });
    }
  });

  it('chip8 y schip quedan anotadas; con xochip se ensambla para 64 KB (sin la etiqueta, no entra)', () => {
    const base = { description: 'Una demo.', controls: 'Ninguno.' };
    // 4000 bytes de datos: no entran en 0x200..0xFFF, y LD I, LONG llega más allá.
    const grande = 'LD I, LONG datos\nfin: JP fin\nrelleno: DB ' + new Array(3990).fill('0').join(', ') + '\ndatos: DB 0xAA\n';
    const files = {
      'a.asm': demoSource({ name: 'A', ...base, order: '1' }),
      'b.asm': demoSource({ name: 'B', ...base, order: '2', platform: 'schip' }),
      'c.asm': demoSource({ name: 'C', ...base, order: '3', platform: 'chip8' }),
      'd.asm': demoSource({ name: 'D', ...base, order: '4', platform: 'xochip' }, grande),
    };
    embedSandbox(files, ({ run, block }) => {
      const res = run();
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /4\. d\s+3997 bytes {2}D \(xochip\)/);
      const demos = evalBlock(block());
      assert.deepEqual(demos.map((d) => [d.id, d.platform]), [['a', undefined], ['b', 'schip'], ['c', 'chip8'], ['d', 'xochip']]);
      assert.equal(Object.hasOwn(demos[0], 'platform'), false);
      const d = hexToBytes(demos[3].hex);
      assert.equal(d.length, 3997);
      assert.deepEqual(Array.from(d.slice(0, 4)), [0xF0, 0x00, 0x11, 0x9C]); // LD I, LONG 0x119C
    });
    const { platform, ...sinEtiqueta } = { name: 'D', ...base, order: '1', platform: 'xochip' };
    embedSandbox({ 'd.asm': demoSource(sinEtiqueta, grande) }, ({ run }) => {
      const res = run('--check');
      assert.equal(res.status, 1);
      assert.match(res.stderr, /^embed-roms: d\.asm: Línea \d+: el programa no entra en la memoria/);
    });
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

// ---------------------------------------------------------------------------
// planos (XO-CHIP)
// ---------------------------------------------------------------------------

// Una constante "NOMBRE EQU n" de roms/planos.asm.
function planosEqu(name) {
  const m = new RegExp('^' + name + '\\s+EQU\\s+(\\d+)', 'm').exec(rom('planos').source);
  assert.ok(m, 'falta ' + name + ' EQU en roms/planos.asm');
  return Number(m[1]);
}

// n bytes (o palabras de 16 bits) de la ROM a partir de una etiqueta.
function planosBytes(label, n) {
  const r = rom('planos');
  assert.ok(r.labels[label] !== undefined, 'falta la etiqueta ' + label);
  const at = r.labels[label] - 0x200;
  return Array.from(r.bytes.slice(at, at + n));
}
function planosWords(label, n) {
  const b = planosBytes(label, 2 * n);
  return Array.from({ length: n }, (_, i) => (b[2 * i] << 8) | b[2 * i + 1]);
}

const PLANOS_TITULO = { x: 2, y: 1, letras: 6 };   // "PLANOS": 6 letras de 8x10, cada 10 píxeles
const PLANOS_DISCO = 14;                           // el disco mide 14x14 (plano 1)
const PLANOS_ROMBO = 16;                           // el rombo, 16x16 (plano 2)
const PLANOS_AREA_A = 12;                          // debajo del título: solo el disco en el plano 1

// x de las tres posiciones del contador: la tabla "visto" son pares (dígito, x).
function planosCounterX() {
  const t = planosBytes('visto', 6);
  return [t[1], t[3], t[5]];
}

// Caja de los píxeles del plano `plane` (1 o 2) desde la fila y0: { x, y, w, h } o null.
function planeBox(cpu, plane, y0 = 0) {
  let minX = 999, minY = 999, maxX = -1, maxY = -1;
  for (let y = y0; y < cpu.displayHeight; y++) {
    for (let x = 0; x < cpu.displayWidth; x++) {
      if (pixel(cpu, x, y) & plane) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Lo que muestra cada posición del contador en el plano 1: el dígito (0..9) de la
// fuente grande, null si está vacía o -1 si hay otra cosa.
function counterCells(cpu) {
  const y0 = planosEqu('CONTADOR_Y');
  return planosCounterX().map((x0) => {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let bits = 0;
      for (let c = 0; c < 8; c++) bits = (bits << 1) | (pixel(cpu, x0 + c, y0 + r) & 1);
      rows.push(bits);
    }
    if (rows.every((b) => b === 0)) return null;
    for (let d = 0; d < 10; d++) if (rows.every((b, i) => b === BIG_FONT[d * 10 + i])) return d;
    return -1;
  });
}

// La pantalla que tiene que verse al terminar un paso, armada acá con los datos de
// la ROM: el título, las posiciones del contador, el disco en `a` (plano 1) y el
// rombo en `b` (plano 2). Nada más.
function planosReference(a, b, cells) {
  const s = new Uint8Array(128 * 64);
  const put = (x0, y0, rows, width, plane) => rows.forEach((bits, r) => {
    for (let c = 0; c < width; c++) if (bits & (1 << (width - 1 - c))) s[(y0 + r) * 128 + x0 + c] ^= plane;
  });
  const letras = planosBytes('letras', 10 * PLANOS_TITULO.letras);
  for (let i = 0; i < PLANOS_TITULO.letras; i++) {
    put(PLANOS_TITULO.x + 10 * i, PLANOS_TITULO.y, letras.slice(10 * i, 10 * i + 10), 8, 1);
  }
  const xs = planosCounterX();
  cells.forEach((d, k) => {
    if (d !== null) put(xs[k], planosEqu('CONTADOR_Y'), Array.from(BIG_FONT.slice(10 * d, 10 * d + 10)), 8, 1);
  });
  put(a.x, a.y, planosWords('disco', 16), 16, 1);
  put(b.x, b.y, planosWords('rombo', 16), 16, 2);
  return s;
}

function hashScreen(cpu) {
  let h = 2166136261;
  for (const v of cpu.display) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h.toString(16);
}

// Corre planos `frames` cuadros y anota cómo queda todo al final de cada paso
// (en los cuadros en que DT llega a 0: el paso ya terminó y el siguiente no
// empezó). onFrame(cpu, cuadro) se llama antes de cada cuadro (para las teclas).
function planosSteps(cpu, frames, ipf, onFrame) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    if (onFrame) onFrame(cpu, f);
    run(cpu, 1, ipf);
    if (cpu.delayTimer === 0) {
      out.push({ frame: f, a: planeBox(cpu, 1, PLANOS_AREA_A), b: planeBox(cpu, 2), cells: counterCells(cpu), pitch: cpu.pitch, hash: hashScreen(cpu) });
    }
  }
  return out;
}

// Paredes que tocó cada figura en ese paso (la posición ya movida está en una pared).
function planosWalls(step) {
  const walls = [];
  if (step.a.x === planosEqu('A_XMIN')) walls.push('A_IZQ');
  if (step.a.x === planosEqu('A_XMAX')) walls.push('A_DER');
  if (step.a.y === planosEqu('A_YMIN')) walls.push('A_ARR');
  if (step.a.y === planosEqu('A_YMAX')) walls.push('A_ABA');
  if (step.b.x === planosEqu('B_XMIN')) walls.push('B_IZQ');
  if (step.b.x === planosEqu('B_XMAX')) walls.push('B_DER');
  if (step.b.y === planosEqu('B_YMIN')) walls.push('B_ARR');
  if (step.b.y === planosEqu('B_YMAX')) walls.push('B_ABA');
  return walls;
}

const digitsOf = (n) => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];

describe('planos', () => {
  const TICK = planosEqu('TICK');
  const ARRANQUE = planosEqu('ARRANQUE');

  it('es de XO-CHIP: en CHIP-8 y en SUPER-CHIP se detiene pidiendo esa plataforma', () => {
    for (const platform of ['chip8', 'schip']) {
      const cpu = new Chip8({ platform, quirks: { ...QUIRK_PRESETS.xochip.quirks } });
      cpu.loadRom(rom('planos').bytes);
      for (let f = 0; f < 10 && !cpu.halted; f++) cpu.runFrame(15);
      assert.equal(cpu.halted, true, platform);
      assert.equal(cpu.errorInfo.kind, 'platform', platform);
      assert.equal(cpu.errorInfo.needs, 'xochip', platform);
    }
  });

  it('pasa a 128x64 y arranca con el título, el contador en 000, el disco y el rombo', () => {
    for (const preset of PRESETS) {
      const cpu = run(demo('planos', preset), ARRANQUE);
      assert.equal(cpu.hires, true);
      assert.deepEqual([cpu.displayWidth, cpu.displayHeight], [128, 64]);
      const a = planeBox(cpu, 1, PLANOS_AREA_A), b = planeBox(cpu, 2);
      assert.deepEqual(a, { x: 20, y: 30, w: PLANOS_DISCO, h: PLANOS_DISCO }, preset);
      assert.deepEqual(b, { x: 76, y: 20, w: PLANOS_ROMBO, h: PLANOS_ROMBO }, preset);
      assert.deepEqual(counterCells(cpu), [0, 0, 0]);
      assert.deepEqual(Array.from(cpu.display), Array.from(planosReference(a, b, [0, 0, 0])), preset + ':\n' + renderAscii(cpu));
      assert.equal(cpu.delayTimer, 0, 'el primer paso empieza en el cuadro ARRANQUE');
    }
  });

  it('al final de cada paso los planos están limpios: el scroll del plano 2 no toca el título, el contador ni el disco', () => {
    for (const preset of PRESETS) {
      const cpu = demo('planos', preset);
      let checked = 0;
      for (let f = 0; f < 3000; f++) {
        run(cpu, 1, 15);
        if (cpu.delayTimer !== 0) continue;
        const where = preset + ', cuadro ' + f + ':\n' + renderAscii(cpu);
        const a = planeBox(cpu, 1, PLANOS_AREA_A), b = planeBox(cpu, 2), cells = counterCells(cpu);
        assert.ok(a && a.w === PLANOS_DISCO && a.h === PLANOS_DISCO, 'el disco entero, ' + where);
        assert.ok(b && b.w === PLANOS_ROMBO && b.h === PLANOS_ROMBO, 'el rombo entero, ' + where);
        assert.ok(cells.every((d) => d !== -1), 'un dígito o nada en cada posición del contador, ' + where);
        // La pantalla entera es exactamente la de referencia: nada más, nada roto.
        const want = planosReference(a, b, cells);
        if (!cpu.display.every((v, i) => v === want[i])) assert.fail('pantalla distinta de la esperada, ' + where);
        checked++;
      }
      assert.ok(checked > 500);
    }
  });

  it('aparecen los cuatro valores: plano 1, plano 2 y los dos (también donde se cruzan el disco y el rombo)', () => {
    const cpu = demo('planos', 'xochip');
    const seen = new Set();
    let crossings = 0;
    for (let f = 0; f < 3600; f++) {
      run(cpu, 1);
      for (const v of cpu.display) seen.add(v);
      let cross = false;
      for (let i = PLANOS_AREA_A * 128; i < cpu.display.length && !cross; i++) cross = cpu.display[i] === 3;
      if (cross) crossings++;
    }
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    assert.ok(crossings > 100, 'el disco y el rombo se cruzan en ' + crossings + ' cuadros');
  });

  it('se mueven 12 pasos por segundo: el disco 2 píxeles en diagonal y el rombo 4 de costado y 2 en vertical', () => {
    assert.equal(TICK, 5);
    const steps = planosSteps(demo('planos', 'xochip'), ARRANQUE + 600, 1000);
    const moves = steps.slice(1).map((s, i) => [s.a.x - steps[i].a.x, s.a.y - steps[i].a.y, s.b.x - steps[i].b.x, s.b.y - steps[i].b.y]);
    assert.equal(moves.length, 120, '120 pasos en 10 segundos');
    assert.ok(steps.every((s, i) => i === 0 || s.frame - steps[i - 1].frame === TICK), 'un paso cada ' + TICK + ' cuadros');
    for (const [ax, ay, bx, by] of moves) {
      assert.ok(Math.abs(ax) === 2 && Math.abs(ay) === 2, 'disco: ' + ax + ', ' + ay);
      assert.ok(Math.abs(bx) === 4 && Math.abs(by) === 2, 'rombo: ' + bx + ', ' + by);
    }
    // Rebotan: cambian de dirección y no se salen de sus límites.
    assert.ok(new Set(moves.map((m) => m.join())).size >= 6, 'deberían ir en varias direcciones');
    for (const s of steps) {
      assert.ok(s.a.x >= planosEqu('A_XMIN') && s.a.x <= planosEqu('A_XMAX') && s.a.y >= planosEqu('A_YMIN') && s.a.y <= planosEqu('A_YMAX'));
      assert.ok(s.b.x >= planosEqu('B_XMIN') && s.b.x <= planosEqu('B_XMAX') && s.b.y >= planosEqu('B_YMIN') && s.b.y <= planosEqu('B_YMAX'));
    }
  });

  it('el contador, con la fuente grande, cuenta los rebotes (de 000 a 255 y vuelta a empezar)', () => {
    // Unos 2700 pasos: más de 256 rebotes, así que también da la vuelta.
    const steps = planosSteps(demo('planos', 'vip'), ARRANQUE + 2700 * TICK, 15);
    let count = 0, last = -99, compared = 0, prompt = 0, wrapped = false;
    const shown = new Set();
    const bounced = steps.map((s) => planosWalls(s).length);
    steps.forEach((s, i) => {
      if (bounced[i]) {
        if (count + bounced[i] > 255) wrapped = true;
        count = (count + bounced[i]) & 0xFF;
        last = i;
      }
      // Enseguida: en el paso siguiente al rebote se borran las unidades (o, si ya
      // estaban borradas, aparece la nueva) y a más tardar en el otro ya está la
      // nueva (si no hubo otro rebote en el medio).
      if (i >= 2 && bounced[i - 2] && !bounced[i - 1] && !bounced[i]) {
        assert.ok([null, count % 10].includes(steps[i - 1].cells[2]), 'cuadro ' + steps[i - 1].frame + ': unidades borradas');
        assert.equal(s.cells[2], count % 10, 'cuadro ' + s.frame + ': unidades nuevas');
        prompt++;
      }
      // Cambiar los tres dígitos lleva como mucho 9 pasos (borrar, dibujar y revisar cada uno).
      if (i - last >= 9) {
        assert.deepEqual(s.cells, digitsOf(count), 'cuadro ' + s.frame);
        shown.add(s.cells.join(''));
        compared++;
      }
    });
    assert.ok(wrapped, 'debería pasar de 255 a 0 (contó ' + count + ')');
    assert.ok(prompt > 200, prompt + ' rebotes con el cambio a la vista');
    assert.ok(compared > 300 && shown.size > 80, compared + ' comparaciones, ' + shown.size + ' números distintos');
  });

  it('suena en cada rebote con el patrón de audio, una nota por pared, y el pitido se corta solo', () => {
    const tone = {
      A_IZQ: 'TONO_A_IZQ', A_DER: 'TONO_A_DER', A_ARR: 'TONO_A_ARR', A_ABA: 'TONO_A_ABA',
      B_IZQ: 'TONO_B_IZQ', B_DER: 'TONO_B_DER', B_ARR: 'TONO_B_ARR', B_ABA: 'TONO_B_ABA',
    };
    const pitido = planosEqu('PITIDO');
    for (const preset of PRESETS) {
      const cpu = demo('planos', preset);
      run(cpu, 5);
      assert.equal(cpu.audioPatternSet, true, 'AUDIO carga el patrón al arrancar');
      assert.deepEqual(Array.from(cpu.audioPattern), planosBytes('patron', 16));
      let beepFrames = 0, beeps = 0, prevST = 0, maxST = 0;
      const heard = new Set();
      const steps = planosSteps(cpu, 3600, 15, (c) => {
        if (c.soundTimer > 0) beepFrames++;
        if (c.soundTimer > prevST) beeps++;
        maxST = Math.max(maxST, c.soundTimer);
        prevST = c.soundTimer;
      });
      for (const s of steps) {
        const walls = planosWalls(s);
        if (walls.length === 1) {
          assert.equal(s.pitch, planosEqu(tone[walls[0]]), preset + ', cuadro ' + s.frame + ': ' + walls[0]);
          heard.add(walls[0]);
        }
      }
      assert.equal(heard.size, 8, preset + ': las ocho paredes (' + [...heard].join(' ') + ')');
      assert.equal(new Set(Object.values(tone).map(planosEqu)).size, 7, 'siete notas distintas (do5 es de los dos)');
      assert.ok(maxST <= pitido, 'cada pitido dura ' + pitido + ' cuadros como mucho');
      assert.ok(beeps > 50, preset + ': ' + beeps + ' pitidos');
      assert.ok(beepFrames < 3600 * 0.25, preset + ': suena ' + beepFrames + ' cuadros de 3600');
      assert.equal(cpu.audioPatternSet, true);
      assert.deepEqual(Array.from(cpu.audioPattern), planosBytes('patron', 16), 'el patrón no cambia');
    }
  });

  // Lo que se compara entre corridas: en qué cuadro termina cada paso, dónde
  // quedan el disco y el rombo, qué muestra el contador, la nota y la pantalla entera.
  const trace = (steps) => steps.map((s) => [s.frame, s.a.x, s.a.y, s.b.x, s.b.y, s.cells.join(''), s.pitch, s.hash].join());
  const assertSameStart = (reference, got, where) => {
    assert.ok(got.length > 100, where);
    assert.deepEqual(got, reference.slice(0, got.length), where);
  };

  it('va igual con los tres perfiles, de 15 a 10000 instrucciones por cuadro, con y sin espera de vblank', () => {
    const reference = trace(planosSteps(demo('planos', 'xochip'), 1200, 1000));
    for (const preset of PRESETS) {
      for (const displayWait of [true, false]) {
        for (const ipf of [15, 1000, 10000]) {
          const frames = ipf === 10000 ? 600 : 1200;
          const got = trace(planosSteps(demo('planos', preset, { quirks: { displayWait } }), frames, ipf));
          assertSameStart(reference, got, preset + ', espera de vblank ' + displayWait + ', IPF ' + ipf);
        }
      }
    }
  });

  it('como dice el encabezado: con espera de vblank alcanza con 14 instrucciones por cuadro y sin ella con 12', () => {
    const reference = trace(planosSteps(demo('planos', 'xochip'), 1200, 1000)).join(';');
    const same = (preset, ipf) => trace(planosSteps(demo('planos', preset), 1200, ipf)).join(';') === reference;
    assert.ok(same('vip', 14), 'VIP a 14');
    assert.ok(!same('vip', 13), 'VIP a 13 ya no entra');
    for (const preset of ['schip', 'xochip']) {
      assert.ok(same(preset, 12), preset + ' a 12');
      assert.ok(!same(preset, 11), preset + ' a 11 ya no entra');
    }
    // Y aunque nunca pasa, un paso con cuatro rebotes (los dos en una esquina)
    // también entra en sus TICK cuadros a 15 instrucciones por cuadro.
    const espera = rom('planos').labels.espera;
    for (const preset of PRESETS) {
      const cpu = run(demo('planos', preset), ARRANQUE); // justo antes del primer paso
      cpu.V.set([112, 48, 2, 2, 108, 46, 4, 2], 1);     // disco y rombo a un paso de una esquina
      cpu.V[0xA] = 112;                                 // donde va la diferencia del disco
      cpu.V[0xB] = 48;
      let frames = 0;
      do {
        run(cpu, 1, 15);
        frames++;
      } while ((cpu.pc < espera || cpu.pc > espera + 4) && frames < 20);
      assert.equal(cpu.V[0xC], 4, preset + ': cuatro rebotes en el mismo paso');
      assert.ok(frames <= TICK, preset + ': el paso usó ' + frames + ' cuadros');
    }
  });

  it('la W (tecla 5) frena el rombo; se lee en el primer cuadro del paso, así que da lo mismo el perfil y la velocidad', () => {
    const tecla = planosEqu('TECLA_FRENO');
    assert.equal(tecla, 5);
    // Apretada en el primer cuadro de un paso (100, 600), a mitad de un paso (401, 463)
    // y durante un solo cuadro (600).
    const pressed = (f) => (f >= 100 && f < 220) || (f >= 401 && f < 463) || f === 600;
    const keys = (c, f) => c.setKey(tecla, pressed(f));
    const reference = planosSteps(demo('planos', 'xochip'), 900, 1000, keys);
    for (const preset of PRESETS) {
      for (const ipf of [15, 10000]) {
        const frames = ipf === 10000 ? 700 : 900;
        assertSameStart(trace(reference), trace(planosSteps(demo('planos', preset), frames, ipf, keys)), preset + ', IPF ' + ipf);
      }
    }
    // Mientras está apretada, el rombo (y todo el plano 2) queda quieto y el disco sigue.
    const during = reference.filter((s) => s.frame >= 99 && s.frame < 220);
    assert.equal(during.length, 25);
    assert.equal(new Set(during.map((s) => s.b.x + ',' + s.b.y)).size, 1, 'el rombo no se mueve');
    during.slice(1).forEach((s, i) => assert.notDeepEqual([s.a.x, s.a.y], [during[i].a.x, during[i].a.y], 'el disco sí'));
    const after = reference.filter((s) => s.frame >= 224 && s.frame < 300);
    assert.equal(new Set(after.map((s) => s.b.x + ',' + s.b.y)).size, after.length, 'al soltarla vuelve a moverse');
    // Apretada desde la mitad de un paso: cuenta desde el paso siguiente.
    const at = (frame) => reference.find((s) => s.frame === frame).b;
    assert.notDeepEqual(at(404), at(399), 'el paso que empezó en el cuadro 400 no la vio');
    assert.deepEqual(at(464), at(404), 'del 405 al 460 queda quieto');
    assert.notDeepEqual(at(469), at(464), 'el paso del 465 ya no la ve');
    assert.deepEqual(at(604), at(599), 'un solo cuadro alcanza si es el primero del paso');
  });
});
