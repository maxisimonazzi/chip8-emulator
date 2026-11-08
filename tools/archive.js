#!/usr/bin/env node
'use strict';
/*
 * tools/archive.js — tabla de autoconfiguración a partir del archivo de la comunidad CHIP-8
 * (chip8Archive de John Earnest: https://github.com/JohnEarnest/chip8Archive, licencia CC0) y de los
 * juegos de las Octojam 6 a 10 publicados en itch.io que no están en el archivo (de sus autores).
 *
 * Cada programa del archivo trae las opciones con las que se juega en Octo: velocidad, quirks,
 * colores y rotación de la pantalla. Esta herramienta las pasa a los ajustes de la consola y las
 * embebe en chip8.html, indexadas por la huella SHA-1 de cada ROM: cuando cargás una ROM conocida,
 * la consola se configura sola. También embebe los bytes de cada ROM (los de roms/archivo/), para
 * que la ventana del archivo de la consola los cargue con un clic, aun abierta desde file://.
 *
 * Uso:
 *   node tools/archive.js update
 *       Baja programs.json, authors.json y cada ROM del archivo (las ROMs quedan solo en memoria:
 *       no se guardan), calcula la huella SHA-1 de cada una y escribe data/archive.json.
 *       Necesita conexión a internet.
 *   node tools/archive.js embed [--html <ruta>] [--check]
 *       Escribe la tabla y las ROMs en <script id="chip8-archive"> de chip8.html (si el bloque no
 *       existe, lo agrega después de <script id="chip8-roms">), con los juegos de las dos colecciones:
 *       los del archivo (data/archive.json y roms/archivo/) y los de las Octojam en itch.io
 *       (data/octojam-itch.json y roms/octojam/), cada uno con su campo collection ('archivo' o
 *       'itch'). Cada ROM tiene que tener la huella SHA-1 y el tamaño de su JSON. Al final del
 *       bloque, CHIP8_ARCHIVE.data guarda cada ROM por su huella, comprimida por separado con
 *       deflate (formato zlib, el 'deflate' de DecompressionStream) y en base64url sin relleno. Lo
 *       que ya está embebido y se descomprime a los bytes correctos se deja como está: así el
 *       resultado no depende de la versión de zlib. Con --check no escribe nada: sale con 1 si la
 *       tabla o los bytes de alguna ROM no están al día.
 *   node tools/archive.js download
 *       Baja las ROMs del archivo a roms/archivo/<id>.ch8 (las que ya están y coinciden con su
 *       huella no se vuelven a bajar) y escribe roms/archivo/LEEME.md, el índice de los juegos.
 *       Necesita conexión a internet.
 *   node tools/archive.js itch
 *       Recorre las Octojam 6 a 10 en itch.io y, de cada juego, saca la ROM y las opciones de la
 *       exportación de Octo de su versión jugable. Descarta los que ya están en el archivo (la misma
 *       huella, o la misma jam y el mismo título) y escribe data/octojam-itch.json, roms/octojam/<id>.ch8
 *       y roms/octojam/LEEME.md (con los que se saltearon y por qué). La plataforma sale de la regla de
 *       detectPlatform. Necesita conexión a internet; después hay que correr embed.
 *   node tools/archive.js test [--itch] [--frames N] [--sheet hoja.png] [--only id1,id2] [--json reporte.json]
 *       Corre cada juego del archivo (con --itch, los de las Octojam en itch.io) con su configuración,
 *       apretando teclas al azar (de forma reproducible), y reporta errores, salidas y pantallas vacías.
 *       Con --sheet guarda una hoja de contactos PNG con la pantalla final de cada juego. Usa las ROMs de
 *       roms/archivo/ (o de roms/octojam/) y, si falta alguna del archivo, la baja a memoria.
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
 * Un quirk está prendido si vale true o un número distinto de 0 (Octo guarda a veces 1 y 0).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'archive.json');
const HTML_PATH = path.join(ROOT, 'chip8.html');
const ROMS_DIR = path.join(ROOT, 'roms', 'archivo');
const README_NAME = 'LEEME.md';
const REPO = 'JohnEarnest/chip8Archive';
const BRANCH = 'master';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const BLOCK_ID = 'chip8-archive';
const HEADER = '/* GENERADO por tools/archive.js a partir de data/archive.json, data/octojam-itch.json, roms/archivo/ y roms/octojam/ — no editar a mano. */';
const DATA_HEADER = '/* Los bytes de cada ROM, por su huella: deflate (formato zlib) en base64url. La consola descomprime solo la que se pide. */';
const DATA_OPEN = 'globalThis.CHIP8_ARCHIVE.data = {';

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

// Un quirk de Octo prendido: true o un número distinto de 0. Octo guarda a veces 1 y 0 (así vienen 7 programas
// del archivo y muchas exportaciones de itch.io) y los toma como prendido y apagado; un texto no cuenta.
const quirkOn = (v) => v === true || (typeof v === 'number' && v !== 0);

// Opciones de Octo -> ajustes de la consola.
function fromOctoOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  let ipf = Math.round(Number(o.tickrate));
  if (!Number.isFinite(ipf)) ipf = OCTO_DEFAULTS.tickrate;
  ipf = Math.min(IPF_MAX, Math.max(IPF_MIN, ipf));
  const rotation = ROTATIONS.includes(Number(o.screenRotation)) ? Number(o.screenRotation) : 0;
  const unsupported = [];
  if (quirkOn(o.vfOrderQuirks)) unsupported.push('vfOrderQuirks');
  return {
    ipf,
    quirks: {
      vfReset: quirkOn(o.logicQuirks),
      memory: !quirkOn(o.loadStoreQuirks),
      shifting: quirkOn(o.shiftQuirks),
      jumping: quirkOn(o.jumpQuirks),
      clipping: quirkOn(o.clipQuirks),
      displayWait: quirkOn(o.vBlankQuirks),
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

// Programa de data/archive.json o de data/octojam-itch.json -> entrada de la tabla embebida. collection dice de
// qué colección es: 'archivo' (el de John Earnest) o 'itch' (las Octojam en itch.io; withCollections lo pone),
// y los de itch.io llevan además su página, sin "https://". El año es el del programa o el de su fecha.
function toEntry(program) {
  const s = fromOctoOptions(program.options);
  const year = Number.isInteger(program.year) ? program.year
    : (/^\d{4}/.test(program.release || '') ? Number(program.release.slice(0, 4)) : null);
  const entry = {
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
    collection: program.collection === 'itch' ? 'itch' : 'archivo',
  };
  if (entry.collection === 'itch' && program.page) entry.page = String(program.page).replace(/^https?:\/\//, '');
  return entry;
}

// Los programas de las dos colecciones juntos, cada uno con su collection: { ...data, programs }. itch puede
// faltar (null): entonces son solo los del archivo.
function withCollections(data, itch) {
  const mark = (list, collection) => (list || []).map((p) => ({ ...p, collection }));
  return { ...data, programs: mark(data.programs, 'archivo').concat(itch ? mark(itch.programs, 'itch') : []) };
}

// ------------------------------------------------------------------ bloque embebido

// JSON seguro dentro de <script>: nada de "</script" ni de comentarios HTML.
function jsLiteral(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
}

const bySha = (a, b) => a.sha1.localeCompare(b.sha1);

// El bloque entero: primero la tabla (legible, una línea por juego) y al final, aparte, los bytes de
// cada ROM. packed: { [sha1]: texto de packRom } con una entrada por programa.
function buildBlock(data, packed = {}, eol = '\n') {
  const programs = data.programs.slice().sort(bySha);
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
  lines.push('  }', '};', DATA_HEADER, DATA_OPEN);
  programs.forEach((p, i) => {
    const text = packed[p.sha1];
    if (typeof text !== 'string' || !B64URL_RE.test(text)) throw new Error(`Faltan los bytes comprimidos de ${p.id} (${p.sha1})`);
    lines.push(`  ${jsLiteral(p.sha1)}: "${text}"${i < programs.length - 1 ? ',' : ''}`);
  });
  lines.push('};', '');
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

// Devuelve el HTML con el bloque del archivo al día (lo agrega si no existe), con los programas del archivo
// (data) y, si está, los de las Octojam en itch.io (itch). roms: { [sha1]: bytes } con la ROM de cada programa
// (readRoms y readItchRoms). Lo que ya estaba embebido y sigue siendo correcto se conserva.
function embedInto(html, data, roms = {}, itch = null) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const all = withCollections(data, itch);
  const content = buildBlock(all, packRoms(all, roms, readPacked(html)), eol);
  const block = findBlock(html, BLOCK_ID);
  if (block) return html.slice(0, block.bodyStart) + content + html.slice(block.end);
  const demos = findBlock(html, 'chip8-roms');
  if (!demos) throw new Error('chip8.html no tiene <script id="chip8-roms">: no sé dónde agregar el bloque del archivo');
  const insert = `${eol}<script id="${BLOCK_ID}">${content}</script>`;
  return html.slice(0, demos.close) + insert + html.slice(demos.close);
}

// ------------------------------------------------------------------ bytes de las ROMs
// Cada ROM va comprimida por separado (así la consola descomprime solo la que se pide) con deflate en
// formato zlib, el que entiende DecompressionStream('deflate') del navegador, y en base64url sin
// relleno: el texto no tiene "/", "+", "=", "<" ni ">", así que nunca forma un comentario //, una
// dirección, un atributo ni un cierre de etiqueta.
const B64URL_RE = /^[A-Za-z0-9_-]*$/;

function packRom(bytes) {
  return zlib.deflateSync(Buffer.from(bytes), { level: 9 }).toString('base64url');
}

// Los bytes de un texto de packRom (tira un error si no es base64url o no es deflate válido).
function unpackRom(text) {
  if (typeof text !== 'string' || !B64URL_RE.test(text) || text.length % 4 === 1) throw new Error('no es base64url');
  return zlib.inflateSync(Buffer.from(text, 'base64url'));
}

// La ROM de cada programa, de roms/archivo/<id>.ch8, verificada contra su tamaño y su huella de
// data/archive.json: { [sha1]: Buffer }. Si falta alguna o no coincide, tira un error que dice cuáles.
function readRoms(data, dir = ROMS_DIR) {
  return readRomsOf(data, dir, { folder: 'roms/archivo/', json: 'data/archive.json', command: 'download' });
}
// Lo mismo con las de las Octojam en itch.io: roms/octojam/<id>.ch8 contra data/octojam-itch.json.
function readItchRoms(itch, dir = ITCH_ROMS_DIR) {
  return readRomsOf(itch, dir, { folder: 'roms/octojam/', json: 'data/octojam-itch.json', command: 'itch' });
}
function readRomsOf(data, dir, where) {
  const roms = {}, missing = [], wrong = [];
  for (const p of data.programs) {
    const file = path.join(dir, p.id + '.ch8');
    if (!fs.existsSync(file)) { missing.push(p.id + '.ch8'); continue; }
    const rom = fs.readFileSync(file);
    if (rom.length !== p.size || sha1(rom) !== p.sha1) {
      wrong.push(`${p.id}.ch8 (${rom.length} bytes y huella ${sha1(rom).slice(0, 7)}; ${where.json} dice ${p.size} bytes y ${p.sha1.slice(0, 7)})`);
      continue;
    }
    roms[p.sha1] = rom;
  }
  const list = (a) => a.slice(0, 5).join(', ') + (a.length > 5 ? ` y ${a.length - 5} más` : '');
  if (missing.length) {
    throw new Error(`Faltan ROMs en ${where.folder}: ${list(missing)}. Corré "node tools/archive.js ${where.command}".`);
  }
  if (wrong.length) {
    throw new Error(`Las ROMs de ${where.folder} no son las de ${where.json}: ${list(wrong)}. Corré "node tools/archive.js ${where.command}".`);
  }
  return roms;
}

// Los textos comprimidos de cada programa: el que ya estaba (previous) si todavía se descomprime a la
// ROM correcta; si no, uno nuevo. Así volver a embeber no cambia nada aunque otra versión de zlib
// comprima distinto, y --check sigue siendo una comparación exacta.
function packRoms(data, roms, previous = {}) {
  const out = {};
  for (const p of data.programs.slice().sort(bySha)) {
    const rom = roms[p.sha1];
    if (!rom) throw new Error(`Falta la ROM de ${p.id} (${p.sha1}): corré "node tools/archive.js download".`);
    const old = previous[p.sha1];
    let same = false;
    if (typeof old === 'string') {
      try { same = unpackRom(old).equals(Buffer.from(rom)); } catch { same = false; }
    }
    out[p.sha1] = same ? old : packRom(rom);
  }
  return out;
}

// Los textos comprimidos que ya tiene el bloque del archivo de un HTML: { [sha1]: texto } ({} si no hay).
function readPacked(html) {
  const block = findBlock(html, BLOCK_ID);
  if (!block) return {};
  const body = html.slice(block.bodyStart, block.end);
  const at = body.indexOf(DATA_OPEN);
  if (at < 0) return {};
  const out = {};
  const re = /^ {2}"([0-9a-f]{40})": "([A-Za-z0-9_-]*)",?\r?$/gm;
  re.lastIndex = at;
  for (let m; (m = re.exec(body));) out[m[1]] = m[2];
  return out;
}

// Qué ROMs del bloque de un HTML no están al día con roms: { missing: [ids], wrong: [ids] }.
// (data puede traer las dos colecciones, de withCollections: wrongItch son las de roms/octojam/.)
function staleRoms(html, data, roms) {
  const packed = readPacked(html), missing = [], wrong = [], wrongItch = [];
  for (const p of data.programs) {
    if (!Object.hasOwn(packed, p.sha1)) { missing.push(p.id); continue; }
    let ok = false;
    try { ok = unpackRom(packed[p.sha1]).equals(Buffer.from(roms[p.sha1])); } catch { ok = false; }
    if (!ok) (p.collection === 'itch' ? wrongItch : wrong).push(p.id);
  }
  return { missing, wrong, wrongItch };
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

// La ROM de roms/archivo/ si está y coincide con su huella; si no, la baja a memoria.
async function localOrFetch(p) {
  const file = path.join(ROMS_DIR, p.id + '.ch8');
  if (fs.existsSync(file)) {
    const rom = fs.readFileSync(file);
    if (sha1(rom) === p.sha1) return rom;
  }
  return fetchRom(p.id);
}

// ------------------------------------------------------------------ roms/archivo/

const PLATFORM_LABEL = { chip8: 'CHIP-8', schip: 'SUPER-CHIP', xochip: 'XO-CHIP' };
const mdCell = (s) => String(s).replace(/\|/g, '\\|');
// 11 programas del archivo traen de autor el texto de ejemplo de la plantilla.
const realAuthors = (list) => (list || []).filter((a) => !/^your name here$/i.test(a.trim()));

// El índice de roms/archivo/: de dónde salen las ROMs y la tabla de juegos.
function buildReadme(data) {
  const rows = data.programs.slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
    .map((p) => {
      const e = toEntry(p);
      const authors = realAuthors(p.authors).join(', ') || '—';
      return `| ${mdCell(e.title)} | [\`${p.id}.ch8\`](${encodeURIComponent(p.id)}.ch8) | ${PLATFORM_LABEL[e.platform]} | ${e.ipf} | ${mdCell(authors)} | ${mdCell(e.event || '—')} |`;
    });
  const counts = Object.keys(PLATFORM_LABEL)
    .map((k) => `${data.programs.filter((p) => toEntry(p).platform === k).length} de ${PLATFORM_LABEL[k]}`)
    .join(', ');
  return [
    '# ROMs del archivo de la comunidad',
    '',
    `Son las ${data.programs.length} ROMs del [archivo de John Earnest](${data.source}) (${counts}),`,
    `tal como estaban en su commit \`${String(data.commit).slice(0, 7)}\`. El archivo entero es de dominio`,
    'público ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)): se pueden copiar, modificar y repartir.',
    '',
    'Cargalas en la consola con «Cargar ROM» o arrastrándolas. La consola las reconoce por su huella',
    'SHA-1 y se configura sola con la plataforma, la velocidad (IPF), los quirks y los colores que usa',
    'el archivo; la columna IPF de abajo es la velocidad que les da.',
    '',
    'Esta carpeta la arma `node tools/archive.js download`: no la edites a mano.',
    '',
    '| Juego | Archivo | Plataforma | IPF | Autores | Evento |',
    '|---|---|---|---:|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// El índice de roms/octojam/: de dónde salen, cuántas hay por jam, la tabla de juegos y los que no se sumaron.
function buildItchReadme(data) {
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.page.localeCompare(b.page);
  const who = (list) => mdCell((list || []).join(', ') || '—');
  const counts = Object.keys(PLATFORM_LABEL)
    .map((k) => `${data.programs.filter((p) => p.platform === k).length} de ${PLATFORM_LABEL[k]}`)
    .join(', ');
  const ofJam = (list, ev) => list.filter((x) => x.event === ev).length;
  const jamRows = data.jams.map((j) => `| [${j.event}](${j.page}) | ${j.year} | ${j.entries}${j.announced !== null && j.announced !== j.entries ? ` (la página dice ${j.announced})` : ''} | ${ofJam(data.inArchive, j.event)} | ${ofJam(data.programs, j.event)} | ${ofJam(data.skipped, j.event)} |`);
  const rows = data.programs.slice().sort(byTitle).map((p) => {
    const e = toEntry(p);
    return `| [${mdCell(e.title)}](${p.page}) | [\`${p.id}.ch8\`](${encodeURIComponent(p.id)}.ch8) | ${PLATFORM_LABEL[e.platform]} | ${e.ipf} | ${who(p.authors)} | ${e.event} |`;
  });
  const hidden = data.jams.filter((j) => j.announced !== null && j.announced > j.entries);
  const first = data.jams[0], last = data.jams[data.jams.length - 1];
  return [
    '# ROMs de las Octojam en itch.io',
    '',
    `Son los ${data.programs.length} juegos de las Octojam ${first.event.replace(/\D/g, '')} a ${last.event.replace(/\D/g, '')} (de ${first.year} a ${last.year}) publicados en itch.io`,
    `que no están en el [archivo de John Earnest](../archivo/${README_NAME}) (${counts}),`,
    `bajados el ${data.fetched}. Cada ROM sale de la versión jugable de la página del juego, que es una`,
    'exportación de Octo: trae los bytes ya armados y las opciones con que se juega (velocidad, quirks,',
    'colores y giro).',
    '',
    'Cada juego es de sus autores: itch.io no les pone una licencia común (a diferencia del archivo, que es',
    'de dominio público), así que antes de repartir uno mirá lo que dice su página.',
    '',
    'Cargalas en la consola con «Cargar ROM» o arrastrándolas. La consola las reconoce por su huella SHA-1 y',
    'se configura sola con la plataforma, la velocidad (IPF), los quirks y los colores de su exportación. La',
    'exportación no dice la plataforma (Octo acepta todas las instrucciones): sale del tamaño de la ROM, del',
    'perfil de Octo (maxSize 3583 es SUPER-CHIP) y de las instrucciones que ejecuta en un minuto de juego.',
    '',
    'Esta carpeta la arma `node tools/archive.js itch`: no la edites a mano.',
    '',
    '| Jam | Año | Entradas | Ya en el archivo | Nuevas | Salteadas |',
    '|---|---:|---:|---:|---:|---:|',
    ...jamRows,
    '',
    ...(hidden.length ? [
      hidden.map((j) => `La página de la ${j.event} dice ${j.announced} entradas, pero su lista pública tiene ${j.entries}`).join('; ') +
        ': las demás no son públicas (las borraron o las ocultaron sus autores).',
      '',
    ] : []),
    '| Juego | Archivo | Plataforma | IPF | Autores | Evento |',
    '|---|---|---|---:|---|---|',
    ...rows,
    '',
    '## Los que ya estaban en el archivo',
    '',
    'La consola ya los traía: tienen la misma ROM que uno del archivo o son el mismo juego (de la misma jam y con el',
    'mismo título) en otra versión. Estos no se suman, para no tener dos veces el mismo juego.',
    '',
    '| Juego | Evento | En el archivo | Por qué |',
    '|---|---|---|---|',
    ...data.inArchive.slice().sort(byTitle).map((x) => `| [${mdCell(x.title)}](${x.page}) | ${x.event} | [\`${x.archiveId}.ch8\`](../archivo/${encodeURIComponent(x.archiveId)}.ch8) | ${mdCell(x.note)} |`),
    '',
    '## Los que no se sumaron',
    '',
    '| Juego | Autores | Evento | Motivo |',
    '|---|---|---|---|',
    ...data.skipped.slice().sort(byTitle).map((x) => `| [${mdCell(x.title)}](${x.page}) | ${who(x.authors)} | ${x.event} | ${mdCell(x.reason)} |`),
    '',
  ].join('\n');
}

async function cmdDownload() {
  const data = readData();
  fs.mkdirSync(ROMS_DIR, { recursive: true });
  let fresh = 0, kept = 0, bytes = 0;
  await mapLimit(data.programs, 8, async (p) => {
    const file = path.join(ROMS_DIR, p.id + '.ch8');
    if (fs.existsSync(file) && sha1(fs.readFileSync(file)) === p.sha1) {
      kept++;
      bytes += p.size;
      return;
    }
    const rom = await fetchRom(p.id);
    if (sha1(rom) !== p.sha1) {
      throw new Error(`La ROM de ${p.id} ya no coincide con data/archive.json: el archivo cambió, corré "node tools/archive.js update".`);
    }
    fs.writeFileSync(file, rom);
    fresh++;
    bytes += rom.length;
  });
  const known = new Set(data.programs.map((p) => p.id + '.ch8').concat(README_NAME));
  const extra = fs.readdirSync(ROMS_DIR).filter((f) => !known.has(f));
  fs.writeFileSync(path.join(ROMS_DIR, README_NAME), buildReadme(data));
  console.log(`roms/archivo: ${fresh} bajadas, ${kept} ya estaban (${data.programs.length} ROMs, ${(bytes / 1024).toFixed(0)} KB) y ${README_NAME} al día.`);
  if (fresh) console.log('Ahora corré: node tools/archive.js embed (las ROMs van también embebidas en chip8.html).');
  if (extra.length) console.warn(`  Atención: hay archivos que no son del archivo: ${extra.join(', ')}`);
}

// ------------------------------------------------------------------ plataforma de una ROM de Octo
// Octo no dice la plataforma de un programa: acepta todas las instrucciones y solo limita el tamaño de la ROM
// (maxSize). La plataforma de una ROM de Octo sale de la más grande de estas tres:
//   1. el tamaño: una ROM de más de 3584 bytes solo entra en XO-CHIP;
//   2. maxSize 3583, el perfil SUPER-CHIP de Octo. El de XO-CHIP (65024) no alcanza: en el archivo lo tienen
//      también 5 juegos de CHIP-8 y de SUPER-CHIP. Los de VIP y de Octo (3216 y 3584) no dicen nada;
//   3. la instrucción de más nivel (según Chip8Core.extendedInfo) que ejecuta en 3600 frames (un minuto) con
//      teclas al azar, corriendo como XO-CHIP, que las tiene todas, con sus quirks (executedOpcodes).
// Con los 104 juegos del archivo, esta regla da en todos la plataforma que les puso John Earnest (lo controla
// tests/octojam.test.js). Las instrucciones que se alcanzan siguiendo el flujo desde 0x200 (reachableOpcodes)
// son una segunda opinión: si piden más, el comando itch lo avisa para revisarlo a mano. No deciden porque
// confunden datos con código (en el archivo, un D010 entre los datos de octojam1title).
const MAX_SIZE_LEVEL = { 3583: 1 };
const PLATFORM_FRAMES = 3600;
const SKIP_RE = [/^3/, /^4/, /^5...0$/, /^9...0$/, /^e.9e$/, /^e.a1$/];

// ¿Es una instrucción de alguna plataforma? (Para dejar de seguir el flujo cuando se mete en los datos.)
function isInstruction(op) {
  const h = op.toString(16).padStart(4, '0');
  switch (op >> 12) {
    case 0x0: return op === 0x00E0 || op === 0x00EE || /^00[cd].$/.test(h) || (op >= 0x00FB && op <= 0x00FF);
    case 0x5: return /[023]$/.test(h);
    case 0x8: return /[0-7e]$/.test(h);
    case 0x9: return (op & 0xF) === 0;
    case 0xE: return /9e$|a1$/.test(h);
    case 0xF: return op === 0xF000 || op === 0xF002 || (op <= 0xF301 && (op & 0xFF) === 0x01) ||
      ['07', '0a', '15', '18', '1e', '29', '30', '33', '3a', '55', '65', '75', '85'].includes(h.slice(2));
    default: return true;
  }
}

// Las instrucciones que se alcanzan desde 0x200 siguiendo el flujo del programa: saltos, llamadas, los dos
// caminos de cada salteo (en XO-CHIP un salteo pasa por encima de F000 NNNN entero) y las tablas de jump0 (las
// instrucciones jump seguidas que hay desde su base). Se detiene en return, exit, en lo que no es una
// instrucción y al salir de la ROM. Devuelve los opcodes, sin repetir direcciones.
function reachableOpcodes(rom) {
  const word = (a) => (a >= 0x200 && a - 0x200 + 1 < rom.length ? (rom[a - 0x200] << 8) | rom[a - 0x200 + 1] : -1);
  const seen = new Set(), todo = [0x200], ops = [];
  while (todo.length) {
    let pc = todo.pop();
    for (;;) {
      const op = word(pc);
      if (seen.has(pc) || op < 0 || !isInstruction(op)) break;
      seen.add(pc);
      ops.push(op);
      const h = op.toString(16).padStart(4, '0');
      if (op === 0x00EE || op === 0x00FD) break;
      if (op >> 12 === 0x1) { todo.push(op & 0xFFF); break; }
      if (op >> 12 === 0xB) {
        for (let t = op & 0xFFF; word(t) >> 12 === 0x1; t += 2) todo.push(t);
        break;
      }
      if (op >> 12 === 0x2) todo.push(op & 0xFFF);
      if (op === 0xF000) { pc += 4; continue; }
      if (SKIP_RE.some((re) => re.test(h))) todo.push(pc + (word(pc + 2) === 0xF000 ? 6 : 4));
      pc += 2;
    }
  }
  return ops;
}

// Las instrucciones que ejecuta la ROM en `frames` frames, como XO-CHIP (que tiene todas) con los ajustes de
// sus opciones de Octo, apretando teclas al azar de forma reproducible (como el comando test).
function executedOpcodes(Core, rom, settings, seedText, frames = PLATFORM_FRAMES) {
  const cpu = new Core.Chip8({ platform: 'xochip', quirks: settings.quirks, random: () => 0 });
  const rand = makeRandom(seedText);
  cpu.random = () => rand() & 0xff;
  cpu.loadRom(rom);
  let held = -1, holdLeft = 0;
  for (let f = 0; f < frames && !cpu.halted; f++) {
    if (held >= 0 && --holdLeft <= 0) { cpu.setKey(held, false); held = -1; }
    if (held < 0 && f % 15 === 7) { held = rand() & 0xf; holdLeft = 4; cpu.setKey(held, true); }
    cpu.runFrame(settings.ipf);
  }
  const ops = [];
  for (let a = 0; a < cpu.access.length; a++) {
    if (cpu.access[a] & Core.ACCESS.EXEC) ops.push((cpu.memory[a] << 8) | cpu.memory[(a + 1) & 0xFFFF]);
  }
  return { ops, error: cpu.error };
}

// La instrucción de más nivel de una lista de opcodes: { level, op, name } (level 0 si son todas de CHIP-8).
function topInstruction(Core, ops) {
  return ops.reduce((best, op) => {
    const info = Core.extendedInfo(op);
    const level = info ? PLATFORMS.indexOf(info.needs) : 0;
    return level > best.level ? { level, op, name: info.name } : best;
  }, { level: 0, op: null, name: '' });
}
const opText = (op) => op.toString(16).toUpperCase().padStart(4, '0');

// { platform, why, check }: la plataforma de una ROM de Octo según la regla de arriba, de dónde salió y, si las
// instrucciones alcanzables piden más, qué hay que revisar a mano (si no, '').
function detectPlatform(Core, rom, options, seedText = '') {
  const size = rom.length > 3584 ? 2 : 0;
  const max = MAX_SIZE_LEVEL[Number(options && options.maxSize)] || 0;
  const run = topInstruction(Core, executedOpcodes(Core, rom, fromOctoOptions(options), seedText).ops);
  const level = Math.max(size, max, run.level);
  const why = [];
  if (size === level && level) why.push(`${rom.length} bytes`);
  if (max === level && level) why.push(`maxSize ${options.maxSize}`);
  if (run.level === level && level) why.push(`ejecuta ${opText(run.op)} (${run.name})`);
  const reach = topInstruction(Core, reachableOpcodes(rom));
  const check = reach.level > level ? `se alcanza ${opText(reach.op)} (${reach.name}), de ${PLATFORM_LABEL[PLATFORMS[reach.level]]}, sin ejecutarlo` : '';
  return { platform: PLATFORMS[level], why: why.join(', ') || 'solo ejecuta instrucciones de CHIP-8', check };
}

// ------------------------------------------------------------------ Octojam en itch.io
// Desde la Octojam 6 (2019) las entradas se publican en itch.io. La página de cada juego trae, casi siempre, la
// versión jugable: una exportación de Octo, un HTML con data={"program":…,"rom":[…],"options":{…}}. De ahí salen
// la ROM ya armada y las opciones, leídas como JSON: nada de lo que se baja se ejecuta.
const ITCH_PATH = path.join(ROOT, 'data', 'octojam-itch.json');
const ITCH_ROMS_DIR = path.join(ROOT, 'roms', 'octojam');
const ITCH_JAMS = Object.freeze([6, 7, 8, 9, 10]);
const ITCH_UA = 'Mozilla/5.0 (chip8-emulator)';
const ITCH_LICENSE = 'de cada autor';
// Juegos que no se pueden comparar por huella (su exportación no trae la ROM) pero que ya están en el archivo.
const ITCH_SAME_AS = Object.freeze({ 'internet-janitor.itch.io/octojam-6-greeting': 'octojam6title' });

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
// La fecha de hoy en la hora de esta computadora (toISOString da la de Greenwich, que a la noche ya es mañana).
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const noScheme = (url) => String(url).replace(/^https?:\/\//, '');

// Una página de itch.io como texto. Si itch.io pide esperar (429) o falla del lado de ellos (5xx), espera y
// vuelve a probar; un 404 o un 410 devuelve null (la página ya no está).
async function fetchItch(url, tries = 7) {
  for (let attempt = 1; ; attempt++) {
    let res = null, why = '';
    try {
      res = await fetch(url, { headers: { 'User-Agent': ITCH_UA } });
    } catch (err) {
      why = err.message;
    }
    if (res && res.ok) return res.text();
    if (res && (res.status === 404 || res.status === 410)) return null;
    if (res) why = `HTTP ${res.status}`;
    if (attempt >= tries || (res && res.status < 500 && res.status !== 429)) throw new Error(`No pude bajar ${url}: ${why}`);
    const after = res ? Number(res.headers.get('retry-after')) : NaN;
    await sleepMs(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 1500 * 2 ** (attempt - 1));
  }
}

function htmlDecode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|quot|amp|lt|gt|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" }[k];
  });
}
// Un título o un nombre de itch.io, sin entidades, sin guiones blandos ni caracteres invisibles y con los espacios de a uno.
const cleanName = (s) => htmlDecode(s).replace(/[­​-‏⁠﻿]/g, '').replace(/\s+/g, ' ').trim();

// El objeto JSON que empieza en text[start] (una llave): su texto, recorriendo las cadenas sin evaluar nada.
function jsonObjectAt(text, start) {
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// La exportación de Octo de una página: el objeto { program, rom, options } de su data={…}, o null si no tiene.
function parseOctoExport(html) {
  const re = /\bdata\s*=\s*\{/g;
  for (let m; (m = re.exec(html));) {
    const text = jsonObjectAt(html, m.index + m[0].length - 1);
    if (!text) continue;
    let obj;
    try { obj = JSON.parse(text); } catch { continue; }
    if (obj && typeof obj === 'object' && obj.options && typeof obj.options === 'object' && ('rom' in obj || 'program' in obj)) return obj;
  }
  return null;
}

// Los bytes de la ROM de una exportación (un arreglo de bytes, o el objeto en que JSON convierte un
// Uint8Array), o null si no trae una ROM válida.
function exportRom(obj) {
  let r = obj && obj.rom;
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const keys = Object.keys(r);
    if (!keys.every((k, i) => k === String(i))) return null;
    r = keys.map((k) => r[k]);
  }
  if (!Array.isArray(r) || !r.length || r.length > 65024) return null;
  if (!r.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return null;
  return Buffer.from(r);
}

// La dirección de la versión jugable que trae la página de un juego (el iframe de html-classic.itch.zone), o null.
function playableUrl(page) {
  const attr = /\bdata-iframe="([^"]*)"/.exec(page);
  const inner = attr ? /\bsrc="([^"]+)"/.exec(htmlDecode(attr[1])) : null;
  const direct = /<iframe\b[^>]*\bsrc="(https:\/\/[^"]*itch\.zone\/[^"]*)"/.exec(page);
  const url = inner ? inner[1] : (direct ? htmlDecode(direct[1]) : null);
  return url && /^https:\/\/[a-z0-9.-]*itch\.zone\//.test(url) ? url.replace(/\?.*$/, '') : null;
}

// Los autores de la tabla «More information» de la página (fila Author o Authors), o [] si no está.
function pageAuthors(page) {
  const row = /<td>Authors?<\/td><td>([\s\S]*?)<\/td>/.exec(page);
  return row ? [...row[1].matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map((m) => cleanName(m[1])).filter(Boolean) : [];
}
// Las descargas que ofrece la página (los nombres), para explicar por qué se salteó un juego.
const pageUploads = (page) => [...page.matchAll(/class="upload_name"><strong title="([^"]*)"/g)].map((m) => cleanName(m[1]));

// El id de un juego: el final de su dirección en itch.io («chicken-scratch»).
const itchSlug = (url) => noScheme(url).split('/').filter(Boolean).pop().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const itchUser = (url) => noScheme(url).split('.')[0].toLowerCase().replace(/[^a-z0-9-]+/g, '-');

// Las entradas de una Octojam: { event, year, page, announced, entries: [{ title, url, user, submitted }] }.
async function fetchJam(n) {
  const page = `https://itch.io/jam/octojam-${n}`;
  const html = await fetchItch(page + '/entries');
  if (html === null) throw new Error(`No está la página de la Octojam ${n} (${page}/entries)`);
  const m = /"entries_url":"([^"]+)"/.exec(html);
  if (!m) throw new Error(`La página de la Octojam ${n} no dice dónde está su lista de entradas (entries_url)`);
  const list = JSON.parse(await fetchItch(new URL(m[1].replace(/\\\//g, '/'), 'https://itch.io').href));
  const stat = /stat_value">(\d+)<\/div><div class="stat_label">Entries</.exec(html);
  return {
    event: `Octojam ${n}`,
    year: 2013 + n,
    page,
    announced: stat ? Number(stat[1]) : null,
    entries: (list.jam_games || []).map((e) => ({
      title: cleanName(e.game.title),
      url: e.game.url,
      user: e.game.user ? cleanName(e.game.user.name) : '',
      submitted: String(e.created_at || '').slice(0, 10),
    })),
  };
}

// Un juego de itch.io: { program } si su versión jugable es una exportación de Octo con la ROM, o { reason } si no.
async function fetchItchGame(entry) {
  const page = await fetchItch(entry.url);
  if (page === null) return { reason: 'la página ya no está en itch.io' };
  const authors = pageAuthors(page);
  const uploads = pageUploads(page);
  const play = playableUrl(page);
  const downloads = uploads.length ? ` (solo descargas: ${uploads.join(', ')})` : '';
  if (!play) return { authors, reason: `no tiene versión jugable en la página${downloads}` };
  const html = await fetchItch(play);
  if (html === null) return { authors, reason: 'su versión jugable ya no está' };
  const exp = parseOctoExport(html);
  if (!exp) {
    const engine = cleanName((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '');
    return { authors, reason: `su versión jugable no es una exportación de Octo${engine ? ` (es ${engine})` : ''}` };
  }
  const rom = exportRom(exp);
  if (!rom) return { authors, reason: 'su exportación de Octo trae solo el fuente, sin la ROM armada' };
  return { authors, play, rom, options: exp.options };
}

// Un título para comparar: minúsculas, sin tildes y solo letras y números («Bulb.» y «Bulb» son iguales).
const foldTitle = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
// Cuánto cambia una ROM de la del archivo («2 bytes distintos», o los dos tamaños).
function romDifference(rom, program) {
  const file = path.join(ROMS_DIR, program.id + '.ch8');
  if (rom.length !== program.size) return `${rom.length} bytes en vez de ${program.size}`;
  if (!fs.existsSync(file)) return 'del mismo tamaño';
  const other = fs.readFileSync(file);
  let n = 0;
  for (let i = 0; i < rom.length; i++) if (rom[i] !== other[i]) n++;
  return `${n} byte${n === 1 ? '' : 's'} distinto${n === 1 ? '' : 's'}`;
}

async function cmdItch() {
  const { loadCore } = require(path.join(ROOT, 'tests', 'harness.js'));
  const Core = loadCore();
  const archive = readData();
  const archiveBySha = new Map(archive.programs.map((p) => [p.sha1, p]));
  const archiveIds = new Set(archive.programs.map((p) => p.id.toLowerCase()));
  const jams = [];
  for (const n of ITCH_JAMS) {
    const jam = await fetchJam(n);
    jams.push(jam);
    console.log(`${jam.event}: ${jam.entries.length} entradas${jam.announced !== null && jam.announced !== jam.entries.length ? ` (la página dice ${jam.announced}; las demás no son públicas)` : ''}.`);
  }
  // Una página que se presentó a dos jams cuenta para la primera.
  const firstJam = new Map();
  const queue = [];
  const skipped = [];
  for (const jam of jams) {
    for (const e of jam.entries) {
      const key = noScheme(e.url).replace(/\/+$/, '').toLowerCase();
      const base = { title: e.title, authors: e.user ? [e.user] : [], event: jam.event, year: Number(e.submitted.slice(0, 4)) || jam.year, page: e.url };
      if (firstJam.has(key)) {
        skipped.push({ ...base, reason: `es la misma página que su entrada de la ${firstJam.get(key)}` });
        continue;
      }
      firstJam.set(key, jam.event);
      queue.push({ e, base, key });
    }
  }
  console.log(`Bajando las páginas de ${queue.length} juegos…`);
  const got = await mapLimit(queue, 2, async (q) => ({ ...q, r: await fetchItchGame(q.e) }));
  const programs = [];
  const inArchive = [];
  const bySha = new Map();
  for (const { base, key, r } of got) {
    const authors = r.authors && r.authors.length ? r.authors : base.authors;
    const who = { ...base, authors };
    if (r.reason) {
      const same = ITCH_SAME_AS[key];
      if (same && archive.programs.some((p) => p.id === same)) inArchive.push({ ...who, archiveId: same, note: `${r.reason}, pero es la misma pantalla` });
      else skipped.push({ ...who, reason: r.reason });
      continue;
    }
    const sha = sha1(r.rom);
    if (archiveBySha.has(sha)) {
      inArchive.push({ ...who, archiveId: archiveBySha.get(sha).id, note: 'la misma ROM (la misma huella SHA-1)' });
      continue;
    }
    // El mismo juego (la misma jam y el mismo título) con otra versión de la ROM: no se suma, para no tenerlo dos veces.
    const twin = archive.programs.find((p) => formatEvent(p.event) === base.event && foldTitle(p.title) === foldTitle(base.title));
    if (twin) {
      inArchive.push({ ...who, archiveId: twin.id, note: `otra versión de la ROM (${romDifference(r.rom, twin)})` });
      continue;
    }
    if (bySha.has(sha)) {
      skipped.push({ ...who, reason: `es la misma ROM que «${bySha.get(sha).title}»` });
      continue;
    }
    const plat = detectPlatform(Core, r.rom, r.options, key);
    const program = {
      id: itchSlug(base.page),
      title: base.title,
      authors,
      event: base.event,
      year: base.year,
      platform: plat.platform,
      size: r.rom.length,
      sha1: sha,
      options: r.options,
      page: base.page,
      play: r.play,
    };
    bySha.set(sha, program);
    programs.push({ program, rom: r.rom, user: itchUser(base.page), why: plat.why, check: plat.check });
  }
  // Ids únicos: el final de la dirección; si se repite (entre estos o con el archivo), con el usuario de itch.io al final.
  const count = new Map();
  for (const { program } of programs) count.set(program.id, (count.get(program.id) || 0) + 1);
  for (const x of programs) {
    if (count.get(x.program.id) > 1 || archiveIds.has(x.program.id)) x.program.id = `${x.program.id}-${x.user}`;
  }
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.page.localeCompare(b.page);
  const data = {
    source: 'https://itch.io',   // cada jam, con su página, en jams
    license: ITCH_LICENSE,
    fetched: localDate(),
    jams: jams.map((j) => ({ event: j.event, year: j.year, page: j.page, entries: j.entries.length, announced: j.announced })),
    programs: programs.map((x) => x.program).sort((a, b) => a.id.localeCompare(b.id)),
    inArchive: inArchive.sort(byTitle),
    skipped: skipped.sort(byTitle),
  };
  fs.mkdirSync(ITCH_ROMS_DIR, { recursive: true });
  for (const { program, rom } of programs) fs.writeFileSync(path.join(ITCH_ROMS_DIR, program.id + '.ch8'), rom);
  fs.writeFileSync(ITCH_PATH, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(path.join(ITCH_ROMS_DIR, README_NAME), buildItchReadme(data));
  const known = new Set(data.programs.map((p) => p.id + '.ch8').concat(README_NAME));
  const extra = fs.readdirSync(ITCH_ROMS_DIR).filter((f) => !known.has(f));
  const plat = Object.keys(PLATFORM_LABEL).map((k) => `${data.programs.filter((p) => p.platform === k).length} de ${PLATFORM_LABEL[k]}`).join(', ');
  console.log(`Listo: ${data.programs.length} juegos nuevos (${plat}) en ${path.relative(ROOT, ITCH_PATH)} y roms/octojam/; ${inArchive.length} ya estaban en el archivo y ${skipped.length} se saltearon.`);
  for (const { program, why, check } of programs) {
    console.log(`  ${program.id.padEnd(30)} ${program.platform.padEnd(6)} ${String(program.size).padStart(5)} bytes  ${program.event}  (${why})`);
    if (check) console.warn(`    Revisar la plataforma: ${check}.`);
  }
  for (const x of inArchive) console.log(`  ya en el archivo: ${x.title} (${x.event}) = ${x.archiveId}${x.note ? ` (${x.note})` : ''}`);
  for (const x of skipped) console.log(`  salteado: ${x.title} (${x.event}): ${x.reason}`);
  if (extra.length) console.warn(`  Atención: hay archivos que no son de esta colección en roms/octojam/: ${extra.join(', ')}`);
  console.log('Ahora corré: node tools/archive.js embed');
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
  console.log('Ahora corré: node tools/archive.js download y después node tools/archive.js embed');
}

function readData() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`Falta ${path.relative(ROOT, DATA_PATH)}: corré primero "node tools/archive.js update".`);
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// data/octojam-itch.json, o null si todavía no se corrió "node tools/archive.js itch".
function readItch() {
  return fs.existsSync(ITCH_PATH) ? JSON.parse(fs.readFileSync(ITCH_PATH, 'utf8')) : null;
}

function cmdEmbed(args) {
  const htmlPath = path.resolve(args.html || HTML_PATH);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const data = readData();
  const itch = readItch();
  const roms = { ...readRoms(data), ...(itch ? readItchRoms(itch) : {}) };
  const next = embedInto(html, data, roms, itch);
  const kb = (s) => (s.length / 1024).toFixed(0) + ' KB';
  const dataKb = () => kb(Object.values(readPacked(next)).join(''));
  const what = `${data.programs.length} programas del archivo${itch ? ` y ${itch.programs.length} juegos de las Octojam en itch.io` : ''}`;
  const list = (a) => a.slice(0, 5).join(', ') + (a.length > 5 ? '…' : '');
  if (args.check) {
    if (next !== html) {
      const { missing, wrong, wrongItch } = staleRoms(html, withCollections(data, itch), roms);
      const why = [];
      if (missing.length) why.push(`faltan los bytes de ${missing.length} ROM${missing.length === 1 ? '' : 's'} (${list(missing)})`);
      if (wrong.length) why.push(`los bytes de ${list(wrong)} no son los de roms/archivo/`);
      if (wrongItch.length) why.push(`los bytes de ${list(wrongItch)} no son los de roms/octojam/`);
      if (!why.length) why.push('la tabla cambió');
      console.error(`El bloque <script id="${BLOCK_ID}"> de ${path.relative(ROOT, htmlPath)} no está al día: ${why.join('; ')}. Corré "node tools/archive.js embed".`);
      process.exitCode = 1;
    } else {
      console.log(`Todo al día: ${what} embebidos, con sus ROMs (${dataKb()} comprimidas).`);
    }
    return;
  }
  if (next === html) {
    console.log('El bloque del archivo ya estaba al día.');
    return;
  }
  fs.writeFileSync(htmlPath, next);
  console.log(`Embebidos ${what}, con sus ROMs (${dataKb()} comprimidas), en ${path.relative(ROOT, htmlPath)}.`);
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
  const data = args.itch ? readItch() : readData();
  if (!data) throw new Error(`Falta ${path.relative(ROOT, ITCH_PATH)}: corré primero "node tools/archive.js itch".`);
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const programs = data.programs.filter((p) => !only || only.has(p.id));
  const frames = Number(args.frames) || 900;
  console.log(`Probando ${programs.length} ${args.itch ? 'juegos de las Octojam en itch.io' : 'programas'}, ${frames} frames cada uno…`);
  // Las de itch.io salen solo de roms/octojam/ (readItchRoms verifica cada una); las del archivo, de roms/archivo/ o de la red.
  let roms;
  if (args.itch) {
    const byHash = readItchRoms({ programs });
    roms = programs.map((p) => byHash[p.sha1]);
  } else {
    roms = await mapLimit(programs, 8, (p) => localOrFetch(p));
  }
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
    else if (a === '--itch') args.itch = true;
    else if (a === '--html' || a === '--frames' || a === '--sheet' || a === '--only' || a === '--json') {
      if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${a}`);
      args[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else args._.push(a);
  }
  return args;
}

const USAGE = 'Uso: node tools/archive.js update | embed [--html <ruta>] [--check] | download | itch | test [--itch] [--frames N] [--sheet hoja.png] [--only id1,id2] [--json reporte.json]';

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
    else if (cmd === 'download') await cmdDownload();
    else if (cmd === 'itch') await cmdItch();
    else if (cmd === 'test') await cmdTest(args);
    else if (cmd === '--help' || cmd === undefined) console.log(USAGE);
    else throw new Error(`Comando desconocido: ${cmd}`);
  } catch (err) {
    console.error(`archive: ${err.message}`);
    if (!/^(Comando|Falta|El núcleo|El bloque|Las ROMs)/.test(err.message)) console.error(USAGE);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  fromOctoOptions, normalizeColor, formatEvent, toEntry, buildBlock, embedInto, findBlock, encodePng, buildReadme,
  packRom, unpackRom, readRoms, packRoms, readPacked, staleRoms, withCollections, readItch, readItchRoms, buildItchReadme,
  isInstruction, reachableOpcodes, executedOpcodes, detectPlatform, foldTitle,
  jsonObjectAt, parseOctoExport, exportRom, playableUrl, pageAuthors, cleanName, itchSlug,
  OCTO_DEFAULTS, BLOCK_ID, HEADER, DATA_HEADER, DATA_OPEN, DATA_PATH, ROMS_DIR, README_NAME,
  ITCH_PATH, ITCH_ROMS_DIR, ITCH_JAMS, ITCH_SAME_AS, ITCH_LICENSE,
};
