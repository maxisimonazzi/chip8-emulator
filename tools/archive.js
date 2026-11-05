#!/usr/bin/env node
'use strict';
/*
 * tools/archive.js — tabla de autoconfiguración a partir del archivo de la comunidad CHIP-8
 * (chip8Archive de John Earnest: https://github.com/JohnEarnest/chip8Archive, licencia CC0).
 *
 * Cada programa del archivo trae las opciones con las que se juega en Octo: velocidad, quirks,
 * colores y rotación de la pantalla. Esta herramienta las pasa a los ajustes de la consola y las
 * embebe en chip8.html, indexadas por la huella SHA-1 de cada ROM: cuando cargás una ROM conocida,
 * la consola se configura sola.
 *
 * Uso:
 *   node tools/archive.js update
 *       Baja programs.json, authors.json y cada ROM del archivo (las ROMs quedan solo en memoria:
 *       no se guardan), calcula la huella SHA-1 de cada una y escribe data/archive.json.
 *       Necesita conexión a internet.
 *   node tools/archive.js embed [--html <ruta>] [--check]
 *       Escribe la tabla en <script id="chip8-archive"> de chip8.html (si el bloque no existe, lo
 *       agrega después de <script id="chip8-roms">). Con --check no escribe nada: sale con 1 si
 *       el bloque embebido no está al día.
 *   node tools/archive.js test [--frames N] [--sheet hoja.png] [--only id1,id2] [--json reporte.json]
 *       Corre cada juego del archivo con su configuración, apretando teclas al azar (de forma
 *       reproducible), y reporta errores, salidas y pantallas vacías. Con --sheet guarda una hoja de
 *       contactos PNG con la pantalla final de cada juego. Necesita conexión (baja las ROMs a memoria).
 *
 * Correspondencia con las opciones de Octo (los valores por defecto de Octo valen cuando el
 * archivo no trae la opción):
 *   tickrate        -> ipf (instrucciones por frame), por defecto 20, limitado a 1..10000
 *   logicQuirks     -> vfReset
 *   loadStoreQuirks -> memory, invertido (en Octo, true = I no se mueve)
 *   shiftQuirks     -> shifting
 *   jumpQuirks      -> jumping
 *   clipQuirks      -> clipping
 *   vBlankQuirks    -> displayWait
 *   backgroundColor, fillColor, fillColor2, blendColor -> colors[0..3] (fondo, plano 1, plano 2, ambos)
 *   screenRotation  -> rotation (0, 90, 180 o 270)
 *   vfOrderQuirks   -> no lo tiene la consola (escribe VF siempre al final); se avisa si aparece.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'archive.json');
const HTML_PATH = path.join(ROOT, 'chip8.html');
const REPO = 'JohnEarnest/chip8Archive';
const BRANCH = 'master';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const BLOCK_ID = 'chip8-archive';
const HEADER = '/* GENERADO por tools/archive.js a partir de data/archive.json — no editar a mano. */';

const IPF_MIN = 1;
const IPF_MAX = 10000;
const PLATFORMS = ['chip8', 'schip', 'xochip'];
// Valores por defecto de Octo (js/emulator.js).
const OCTO_DEFAULTS = Object.freeze({
  tickrate: 20,
  backgroundColor: '#996600',
  fillColor: '#FFCC00',
  fillColor2: '#FF6600',
  blendColor: '#662200',
});
const ROTATIONS = [0, 90, 180, 270];

// ------------------------------------------------------------------ conversión de opciones

function normalizeColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  let s = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback;
}

// Opciones de Octo -> ajustes de la consola.
function fromOctoOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  let ipf = Math.round(Number(o.tickrate));
  if (!Number.isFinite(ipf)) ipf = OCTO_DEFAULTS.tickrate;
  ipf = Math.min(IPF_MAX, Math.max(IPF_MIN, ipf));
  const rotation = ROTATIONS.includes(Number(o.screenRotation)) ? Number(o.screenRotation) : 0;
  const unsupported = [];
  if (o.vfOrderQuirks === true) unsupported.push('vfOrderQuirks');
  return {
    ipf,
    quirks: {
      vfReset: o.logicQuirks === true,
      memory: o.loadStoreQuirks !== true,
      shifting: o.shiftQuirks === true,
      jumping: o.jumpQuirks === true,
      clipping: o.clipQuirks === true,
      displayWait: o.vBlankQuirks === true,
    },
    colors: [
      normalizeColor(o.backgroundColor, OCTO_DEFAULTS.backgroundColor),
      normalizeColor(o.fillColor, OCTO_DEFAULTS.fillColor),
      normalizeColor(o.fillColor2, OCTO_DEFAULTS.fillColor2),
      normalizeColor(o.blendColor, OCTO_DEFAULTS.blendColor),
    ],
    rotation,
    unsupported,
  };
}

// "Octojam3" -> "Octojam 3"; el resto queda como está.
function formatEvent(event) {
  if (typeof event !== 'string' || !event.trim()) return '';
  return event.trim().replace(/^Octojam\s*(\d+)$/i, 'Octojam $1');
}

// Programa de data/archive.json -> entrada de la tabla embebida.
function toEntry(program) {
  const s = fromOctoOptions(program.options);
  const year = /^\d{4}/.test(program.release || '') ? Number(program.release.slice(0, 4)) : null;
  return {
    id: program.id,
    title: program.title,
    authors: (program.authors || []).join(', '),
    event: formatEvent(program.event),
    year,
    platform: PLATFORMS.includes(program.platform) ? program.platform : 'chip8',
    size: program.size,
    ipf: s.ipf,
    quirks: s.quirks,
    colors: s.colors,
    rotation: s.rotation,
  };
}

// ------------------------------------------------------------------ bloque embebido

// JSON seguro dentro de <script>: nada de "</script" ni de comentarios HTML.
function jsLiteral(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
}

function buildBlock(data, eol = '\n') {
  const programs = data.programs.slice().sort((a, b) => a.sha1.localeCompare(b.sha1));
  const lines = [
    '',
    HEADER,
    'globalThis.CHIP8_ARCHIVE = {',
    // Sin "https://": chip8.html no contiene direcciones de red (lo controla tests/single-file.test.js).
    `  source: ${jsLiteral(String(data.source).replace(/^https?:\/\//, ''))},`,
    `  license: ${jsLiteral(data.license)},`,
    `  commit: ${jsLiteral(data.commit || '')},`,
    '  roms: {',
  ];
  programs.forEach((p, i) => {
    const comma = i < programs.length - 1 ? ',' : '';
    lines.push(`    ${jsLiteral(p.sha1)}: ${jsLiteral(toEntry(p))}${comma}`);
  });
  lines.push('  }', '};', '');
  return lines.join(eol);
}

function findBlock(html, id) {
  const open = `<script id="${id}">`;
  const start = html.indexOf(open);
  if (start < 0) return null;
  const bodyStart = start + open.length;
  const end = html.indexOf('</script>', bodyStart);
  if (end < 0) throw new Error(`<script id="${id}"> no está cerrado`);
  return { start, bodyStart, end, close: end + '</script>'.length };
}

// Devuelve el HTML con el bloque del archivo al día (lo agrega si no existe).
function embedInto(html, data) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const content = buildBlock(data, eol);
  const block = findBlock(html, BLOCK_ID);
  if (block) return html.slice(0, block.bodyStart) + content + html.slice(block.end);
  const roms = findBlock(html, 'chip8-roms');
  if (!roms) throw new Error('chip8.html no tiene <script id="chip8-roms">: no sé dónde agregar el bloque del archivo');
  const insert = `${eol}<script id="${BLOCK_ID}">${content}</script>`;
  return html.slice(0, roms.close) + insert + html.slice(roms.close);
}

// ------------------------------------------------------------------ red

async function fetchBuffer(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'chip8-consola-archive-tool' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= tries) throw new Error(`No pude bajar ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function fetchJson(url) {
  return JSON.parse((await fetchBuffer(url)).toString('utf8'));
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function sha1(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex');
}

async function fetchRom(id) {
  return fetchBuffer(`${RAW}roms/${encodeURIComponent(id)}.ch8`);
}

// ------------------------------------------------------------------ comandos

async function cmdUpdate() {
  console.log(`Bajando el registro de ${REPO}…`);
  const programs = await fetchJson(RAW + 'programs.json');
  let commit = '';
  try {
    const info = await fetchJson(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`);
    commit = info.sha || '';
  } catch (err) {
    console.warn(`  (no pude averiguar el commit: ${err.message})`);
  }
  const ids = Object.keys(programs).sort((a, b) => a.localeCompare(b));
  console.log(`  ${ids.length} programas; bajando las ROMs a memoria para calcular sus huellas…`);
  const list = await mapLimit(ids, 8, async (id) => {
    const p = programs[id];
    const rom = await fetchRom(id);
    return {
      id,
      title: String(p.title || id),
      authors: Array.isArray(p.authors) ? p.authors.map(String) : [],
      event: p.event ? String(p.event) : '',
      release: p.release ? String(p.release) : '',
      platform: p.platform ? String(p.platform) : '',
      size: rom.length,
      sha1: sha1(rom),
      options: p.options && typeof p.options === 'object' ? p.options : {},
    };
  });
  const seen = new Map();
  for (const p of list) {
    if (seen.has(p.sha1)) console.warn(`  Atención: ${p.id} y ${seen.get(p.sha1)} tienen la misma ROM.`);
    seen.set(p.sha1, p.id);
    const extra = fromOctoOptions(p.options).unsupported;
    if (extra.length) console.warn(`  Atención: ${p.id} usa ${extra.join(', ')}, que la consola no tiene.`);
    if (!PLATFORMS.includes(p.platform)) console.warn(`  Atención: ${p.id} no dice su plataforma; se toma chip8.`);
  }
  const data = {
    source: `https://github.com/${REPO}`,
    license: 'CC0 1.0',
    commit,
    fetched: new Date().toISOString().slice(0, 10),
    programs: list,
  };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  const byPlatform = {};
  for (const p of list) byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
  console.log(`Listo: ${path.relative(ROOT, DATA_PATH)} con ${list.length} programas (${Object.entries(byPlatform).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  console.log('Ahora corré: node tools/archive.js embed');
}

function readData() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`Falta ${path.relative(ROOT, DATA_PATH)}: corré primero "node tools/archive.js update".`);
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function cmdEmbed(args) {
  const htmlPath = path.resolve(args.html || HTML_PATH);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const next = embedInto(html, readData());
  if (args.check) {
    if (next !== html) {
      console.error(`El bloque <script id="${BLOCK_ID}"> de ${path.relative(ROOT, htmlPath)} no está al día: corré "node tools/archive.js embed".`);
      process.exitCode = 1;
    } else {
      console.log(`Todo al día: ${readData().programs.length} programas del archivo embebidos.`);
    }
    return;
  }
  if (next === html) {
    console.log('El bloque del archivo ya estaba al día.');
    return;
  }
  fs.writeFileSync(htmlPath, next);
  console.log(`Embebidos ${readData().programs.length} programas del archivo en ${path.relative(ROOT, htmlPath)}.`);
}

// ------------------------------------------------------------------ prueba de los juegos

// Generador pseudoaleatorio reproducible (cada juego con su semilla).
function makeRandom(seedText) {
  let s = 2166136261;
  for (const ch of seedText) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
}

function runGame(Core, entry, rom, frames) {
  const cpu = new Core.Chip8({ platform: entry.platform, quirks: entry.quirks, random: () => 0 });
  const rand = makeRandom(entry.id);
  cpu.random = () => rand() & 0xff;
  cpu.loadRom(rom);
  let held = -1, holdLeft = 0, maxWidth = cpu.displayWidth, planes2 = false, executed = 0;
  for (let f = 0; f < frames && !cpu.halted; f++) {
    // Cada 15 frames aprieta una tecla al azar durante 4 frames (y la suelta).
    if (held >= 0 && --holdLeft <= 0) { cpu.setKey(held, false); held = -1; }
    if (held < 0 && f % 15 === 7) { held = rand() & 0xf; holdLeft = 4; cpu.setKey(held, true); }
    executed += cpu.runFrame(entry.ipf);
    if (cpu.displayWidth > maxWidth) maxWidth = cpu.displayWidth;
    if (!planes2) for (let i = 0; i < cpu.display.length; i++) if (cpu.display[i] > 1) { planes2 = true; break; }
  }
  let lit = 0;
  for (let i = 0; i < cpu.display.length; i++) if (cpu.display[i]) lit++;
  return {
    id: entry.id,
    title: entry.title,
    platform: entry.platform,
    ipf: entry.ipf,
    executed,
    halted: cpu.halted,
    exited: !!cpu.exited,
    error: cpu.error,
    hint: cpu.hint ? `${cpu.hint.needs}: ${cpu.hint.name}` : null,
    lit,
    hires: maxWidth > 64,
    twoPlanes: planes2,
    audio: !!cpu.audioPatternSet,
    screen: { width: cpu.displayWidth, height: cpu.displayHeight, pixels: Array.from(cpu.display) },
  };
}

// PNG mínimo (RGB, sin filtro) con zlib de Node.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Hoja de contactos: cada pantalla en 128×64 (la baja resolución, al doble), 8 por fila.
function contactSheet(results, entries) {
  const COLS = 8, TW = 128, TH = 64, GAP = 4;
  const rows = Math.ceil(results.length / COLS);
  const W = COLS * TW + (COLS + 1) * GAP, H = rows * TH + (rows + 1) * GAP;
  const rgb = Buffer.alloc(W * H * 3, 40);
  results.forEach((r, i) => {
    const colors = entries[i].colors.map(hexToRgb);
    const ox = GAP + (i % COLS) * (TW + GAP), oy = GAP + Math.floor(i / COLS) * (TH + GAP);
    const { width, height, pixels } = r.screen;
    const k = TW / width;
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const v = pixels[Math.floor(y / k) * width + Math.floor(x / k)] & 3;
        const c = colors[v];
        const o = ((oy + y) * W + ox + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
    }
    if (r.error || (r.halted && !r.exited)) {
      // Borde rojo: el juego se detuvo con un error.
      for (let x = -2; x < TW + 2; x++) for (const y of [-2, -1, TH, TH + 1]) {
        const o = ((oy + y) * W + ox + x) * 3;
        if (o >= 0 && o < rgb.length) { rgb[o] = 255; rgb[o + 1] = 40; rgb[o + 2] = 40; }
      }
    }
  });
  return encodePng(W, H, rgb);
}

async function cmdTest(args) {
  const { loadCore } = require(path.join(ROOT, 'tests', 'harness.js'));
  const Core = loadCore();
  if (!Core.PLATFORMS) throw new Error('El núcleo de chip8.html todavía no tiene plataformas (SUPER-CHIP / XO-CHIP).');
  const data = readData();
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const programs = data.programs.filter((p) => !only || only.has(p.id));
  const frames = Number(args.frames) || 900;
  console.log(`Probando ${programs.length} programas, ${frames} frames cada uno…`);
  const roms = await mapLimit(programs, 8, (p) => fetchRom(p.id));
  const entries = programs.map(toEntry);
  const results = [];
  programs.forEach((p, i) => {
    const rom = roms[i];
    if (sha1(rom) !== p.sha1) console.warn(`  Atención: la ROM de ${p.id} cambió desde el último "update".`);
    results.push(runGame(Core, entries[i], rom, frames));
  });
  let bad = 0;
  results.forEach((r, i) => {
    const problems = [];
    if (r.error) problems.push(`ERROR: ${r.error}`);
    if (r.hint) problems.push(`instrucción ignorada (${r.hint})`);
    if (!r.lit && !r.error) problems.push('pantalla vacía');
    const flags = [r.hires ? '128×64' : '64×32', r.twoPlanes ? '2 planos' : '', r.audio ? 'audio' : '', r.exited ? 'terminó' : ''].filter(Boolean).join(', ');
    const mark = r.error ? 'FALLA' : problems.length ? 'REVISAR' : 'ok';
    if (r.error) bad++;
    console.log(`${String(i + 1).padStart(3)}. [${mark.padEnd(7)}] ${r.id.padEnd(22)} ${r.platform.padEnd(6)} ${String(r.ipf).padStart(5)} IPF  ${flags}${problems.length ? '  — ' + problems.join('; ') : ''}`);
  });
  console.log(`Resumen: ${results.length - bad} de ${results.length} corrieron sin errores.`);
  if (args.sheet) {
    fs.writeFileSync(path.resolve(args.sheet), contactSheet(results, entries));
    console.log(`Hoja de contactos: ${path.resolve(args.sheet)}`);
  }
  if (args.json) {
    fs.writeFileSync(path.resolve(args.json), JSON.stringify(results.map(({ screen, ...r }) => r), null, 2));
    console.log(`Reporte: ${path.resolve(args.json)}`);
  }
  if (bad) process.exitCode = 1;
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--html' || a === '--frames' || a === '--sheet' || a === '--only' || a === '--json') {
      if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${a}`);
      args[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else args._.push(a);
  }
  return args;
}

const USAGE = 'Uso: node tools/archive.js update | embed [--html <ruta>] [--check] | test [--frames N] [--sheet hoja.png] [--only id1,id2] [--json reporte.json]';

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`archive: ${err.message}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const cmd = args._[0];
  try {
    if (cmd === 'update') await cmdUpdate();
    else if (cmd === 'embed') cmdEmbed(args);
    else if (cmd === 'test') await cmdTest(args);
    else if (cmd === '--help' || cmd === undefined) console.log(USAGE);
    else throw new Error(`Comando desconocido: ${cmd}`);
  } catch (err) {
    console.error(`archive: ${err.message}`);
    if (!/^(Comando|Falta|El núcleo|El bloque)/.test(err.message)) console.error(USAGE);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { fromOctoOptions, normalizeColor, formatEvent, toEntry, buildBlock, embedInto, findBlock, encodePng, OCTO_DEFAULTS, BLOCK_ID, HEADER, DATA_PATH };
