#!/usr/bin/env node
'use strict';
/*
 * embed-roms.js — ensambla los programas de demostración y los incrusta en chip8.html.
 *
 * Uso:
 *   node tools/embed-roms.js                 ensambla roms/*.asm, escribe roms/<id>.ch8
 *                                            y actualiza <script id="chip8-roms"> en chip8.html
 *   node tools/embed-roms.js --html otro.html   actualiza otro archivo HTML en lugar de chip8.html
 *   node tools/embed-roms.js --check         no escribe nada: sale con código 1 si algún .ch8
 *                                            o el bloque incrustado está desactualizado
 *
 * Cada roms/<id>.asm empieza con un bloque de comentarios con estas etiquetas:
 *   ; @name Rebote
 *   ; @description Un sprite rebota por la pantalla y suena al tocar los bordes.
 *   ; @controls Ninguno.
 *   ; @order 1
 * Las demos se ordenan por @order (y después por id).
 *
 * Una etiqueta optativa dice para qué plataforma es la demo:
 *   ; @platform xochip
 * Vale chip8, schip o xochip; sin la etiqueta, la demo es de CHIP-8. Con xochip
 * se ensambla con la opción xochip de chip8asm.js (el programa puede llegar
 * hasta 0xFFFF: 65024 bytes en lugar de 3584). La entrada incrustada lleva el
 * campo platform SOLO si la fuente tiene la etiqueta (las demos sin etiqueta
 * generan exactamente el mismo bloque que antes de que existiera), para que la
 * consola pase a esa plataforma al cargar la demo. Otro valor (o la etiqueta sin
 * valor) es un error.
 *
 * Los fuentes del Taller. Después de CHIP8_DEMOS el bloque lleva
 * globalThis.CHIP8_SOURCES = { demos, examples }, para editarlos en la consola:
 *   demos      el fuente de cada demo, por su id ({ rebote: "; @name Rebote\n..." }).
 *   examples   los ejemplos del tutorial (docs/ejemplos/*.asm, en orden alfabético):
 *              [{ name: "01-a-mano.asm", description, platform?, source }].
 * La descripción de un ejemplo es su @description o, si no tiene, la primera línea
 * de comentario del encabezado sin el nombre del archivo ("; 03-fantasma.asm —
 * Cazamonedas, etapa A: ..." da "Cazamonedas, etapa A: ..."). Un ejemplo puede
 * llevar @platform, igual que una demo (y entonces se ensambla para esa plataforma).
 * Cada ejemplo tiene que ensamblarse; si no, es un error. Sin la carpeta
 * docs/ejemplos/ (por ejemplo, en una copia con otros cartuchos), examples queda
 * vacía. Los fuentes van con fin de línea LF, como en el repositorio.
 *
 * Las etiquetas se leen con headerTags, del ensamblador de chip8.html (el mismo que
 * usa el Taller para @platform).
 *
 * Solo se reemplaza el contenido de <script id="chip8-roms"> ... </script>; el resto
 * del archivo queda idéntico byte por byte (se respeta el tipo de fin de línea).
 * Correrlo dos veces seguidas no cambia nada.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assemble, headerTags } = require('./chip8asm.js');

const ROOT = path.resolve(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'roms');
const EXAMPLES_DIR = path.join(ROOT, 'docs', 'ejemplos');
const OPEN_TAG = '<script id="chip8-roms">';
const CLOSE_TAG = '</script>';
const HEADER = '/* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */';
const SOURCES_HEADER = '/* También GENERADO: los fuentes del Taller, los de las demos (roms/*.asm) y los ejemplos del tutorial (docs/ejemplos/*.asm). */';
const REQUIRED_TAGS = ['name', 'description', 'controls', 'order'];
// Valores de @platform y el tamaño máximo del programa en cada una (desde 0x200).
const PLATFORM_MAX_BYTES = { chip8: 3584, schip: 3584, xochip: 65024 };

function fail(message) {
  console.error('embed-roms: ' + message);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { check: false, html: path.join(ROOT, 'chip8.html') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--html') {
      if (!argv[i + 1]) fail('falta la ruta después de --html');
      opts.html = path.resolve(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      console.log('Uso: node tools/embed-roms.js [--check] [--html archivo.html]');
      process.exit(0);
    } else fail('opción desconocida: ' + a);
  }
  return opts;
}

// Las etiquetas @tag del bloque de comentarios inicial: { nombre: valor } (una etiqueta sin
// valor queda vacía: es un error si es obligatoria).
function readTags(source) {
  const found = headerTags(source);
  const tags = {};
  for (const k of Object.keys(found)) tags[k] = found[k].value;
  return tags;
}

// @platform es optativa: sin ella, el programa es de CHIP-8. Devuelve su valor (o undefined).
function checkPlatform(tags, file) {
  if (tags.platform !== undefined && !Object.hasOwn(PLATFORM_MAX_BYTES, tags.platform)) {
    fail(file + ': @platform tiene que ser chip8, schip o xochip (dice "' + tags.platform + '")');
  }
  return tags.platform;
}

// Lee las etiquetas de una demo y controla las obligatorias.
function parseTags(source, file) {
  const tags = readTags(source);
  for (const t of REQUIRED_TAGS) {
    if (!tags[t]) fail(file + ': falta la etiqueta "; @' + t + ' ..." en el encabezado');
  }
  const order = Number(tags.order);
  if (!Number.isFinite(order)) fail(file + ': @order debe ser un número');
  const out = { name: tags.name, description: tags.description, controls: tags.controls, order };
  // @platform solo se anota si está (sin ella, la demo es de CHIP-8).
  const platform = checkPlatform(tags, file);
  if (platform !== undefined) out.platform = platform;
  return out;
}

// El texto de un fuente con fin de línea LF (así lo guarda el repositorio y así lo da un <textarea>).
function toLf(text) {
  return text.replace(/\r\n|\r/g, '\n');
}

// Ensambla un programa para su plataforma y controla que no esté vacío y que entre.
function assembleFor(source, platform, file) {
  let result;
  try {
    result = assemble(source, { xochip: platform === 'xochip' });
  } catch (e) {
    fail(file + ': ' + e.message);
  }
  const max = PLATFORM_MAX_BYTES[platform];
  if (result.bytes.length === 0) fail(file + ': el programa está vacío');
  if (result.bytes.length > max) fail(file + ': el programa ocupa ' + result.bytes.length + ' bytes (máximo ' + max + ')');
  return result.bytes;
}

function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).toUpperCase().padStart(2, '0');
  return s;
}

// JSON seguro dentro de un <script>: nunca aparece "</script".
function jsString(s) {
  return JSON.stringify(s).replace(/</g, '\\u003c');
}

function buildDemos() {
  if (!fs.existsSync(ROMS_DIR)) fail('no existe la carpeta roms/');
  const files = fs.readdirSync(ROMS_DIR).filter((f) => f.toLowerCase().endsWith('.asm')).sort();
  if (files.length === 0) fail('no hay archivos .asm en roms/');
  const demos = files.map((file) => {
    const id = file.replace(/\.asm$/i, '');
    if (!/^[a-z0-9_-]+$/.test(id)) fail(file + ': el nombre del archivo solo puede tener minúsculas, dígitos, "_" y "-"');
    const source = toLf(fs.readFileSync(path.join(ROMS_DIR, file), 'utf8'));
    const tags = parseTags(source, file);
    const bytes = assembleFor(source, tags.platform || 'chip8', file);
    return { id, file, ...tags, bytes, source };
  });
  demos.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return demos;
}

// La descripción de un ejemplo: su @description o la primera línea de comentario del encabezado
// que no es una etiqueta, sin el nombre del archivo del principio.
function exampleDescription(source, tags) {
  if (tags.description) return tags.description;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith(';')) break;
    const text = trimmed.replace(/^;+\s*/, '');
    if (text === '' || text.startsWith('@')) continue;
    return text.replace(/^\S+\.asm\s+[—–-]+\s+/, '');
  }
  return '';
}

// Los ejemplos del tutorial (docs/ejemplos/*.asm), para el Taller. Sin la carpeta, ninguno.
function buildExamples() {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];
  const files = fs.readdirSync(EXAMPLES_DIR).filter((f) => f.toLowerCase().endsWith('.asm')).sort();
  return files.map((file) => {
    const where = 'docs/ejemplos/' + file;
    if (!/^[a-z0-9_-]+\.asm$/.test(file)) fail(where + ': el nombre del archivo solo puede tener minúsculas, dígitos, "_" y "-"');
    const source = toLf(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'));
    const tags = readTags(source);
    const platform = checkPlatform(tags, where);
    const bytes = assembleFor(source, platform || 'chip8', where);
    const out = { name: file, description: exampleDescription(source, tags), source, size: bytes.length };
    if (platform !== undefined) out.platform = platform;
    return out;
  });
}

function renderBlock(demos, examples, eol) {
  const lines = ['', HEADER, 'globalThis.CHIP8_DEMOS = ['];
  demos.forEach((d, i) => {
    lines.push('  {');
    lines.push('    id: ' + jsString(d.id) + ',');
    lines.push('    name: ' + jsString(d.name) + ',');
    lines.push('    description: ' + jsString(d.description) + ',');
    lines.push('    controls: ' + jsString(d.controls) + ',');
    if (d.platform !== undefined) lines.push('    platform: ' + jsString(d.platform) + ',');
    lines.push('    hex: ' + jsString(toHex(d.bytes)));
    lines.push('  }' + (i < demos.length - 1 ? ',' : ''));
  });
  lines.push('];');
  lines.push(SOURCES_HEADER);
  lines.push('globalThis.CHIP8_SOURCES = {');
  lines.push('  demos: {');
  demos.forEach((d, i) => lines.push('    ' + jsString(d.id) + ': ' + jsString(d.source) + (i < demos.length - 1 ? ',' : '')));
  lines.push('  },');
  lines.push('  examples: [');
  examples.forEach((x, i) => {
    lines.push('    {');
    lines.push('      name: ' + jsString(x.name) + ',');
    lines.push('      description: ' + jsString(x.description) + ',');
    if (x.platform !== undefined) lines.push('      platform: ' + jsString(x.platform) + ',');
    lines.push('      source: ' + jsString(x.source));
    lines.push('    }' + (i < examples.length - 1 ? ',' : ''));
  });
  lines.push('  ]');
  lines.push('};');
  return lines.join(eol) + eol;
}

// Devuelve [inicio, fin] del contenido del bloque dentro del HTML.
function findBlock(html, file) {
  const start = html.indexOf(OPEN_TAG);
  if (start < 0) fail(file + ' no contiene ' + OPEN_TAG);
  if (html.indexOf(OPEN_TAG, start + 1) >= 0) fail(file + ' contiene ' + OPEN_TAG + ' más de una vez');
  const bodyStart = start + OPEN_TAG.length;
  const end = html.indexOf(CLOSE_TAG, bodyStart);
  if (end < 0) fail(OPEN_TAG + ' no está cerrado en ' + file);
  return [bodyStart, end];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const demos = buildDemos();
  const examples = buildExamples();

  if (!fs.existsSync(opts.html)) fail('no existe ' + opts.html);
  const html = fs.readFileSync(opts.html, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const [bodyStart, bodyEnd] = findBlock(html, path.basename(opts.html));
  const block = renderBlock(demos, examples, eol);
  const newHtml = html.slice(0, bodyStart) + block + html.slice(bodyEnd);
  const htmlChanged = newHtml !== html;

  const staleRoms = [];
  for (const d of demos) {
    const ch8 = path.join(ROMS_DIR, d.id + '.ch8');
    const current = fs.existsSync(ch8) ? fs.readFileSync(ch8) : null;
    if (!current || !Buffer.from(d.bytes).equals(current)) staleRoms.push(d);
  }

  const report = demos.map((d) => '  ' + String(d.order).padStart(2) + '. ' + d.id.padEnd(10) + ' ' +
    String(d.bytes.length).padStart(5) + ' bytes  ' + d.name + (d.platform ? ' (' + d.platform + ')' : '')).join('\n') +
    '\nEjemplos del tutorial para el Taller (' + examples.length + (examples.length ? '):\n' : ', no está docs/ejemplos/)') +
    examples.map((x) => '  ' + x.name.padEnd(26) + String(x.size).padStart(6) + ' bytes' + (x.platform ? ' (' + x.platform + ')' : '')).join('\n');

  if (opts.check) {
    const problems = [];
    for (const d of staleRoms) problems.push('roms/' + d.id + '.ch8 no coincide con roms/' + d.file);
    if (htmlChanged) problems.push('el bloque <script id="chip8-roms"> de ' + path.basename(opts.html) + ' está desactualizado');
    if (problems.length) {
      console.error('Hay ROMs desactualizadas:\n  - ' + problems.join('\n  - ') +
        '\nCorré "node tools/embed-roms.js" para regenerarlas.');
      process.exit(1);
    }
    console.log('Todo al día: ' + demos.length + ' demos.\n' + report);
    return;
  }

  for (const d of staleRoms) fs.writeFileSync(path.join(ROMS_DIR, d.id + '.ch8'), d.bytes);
  if (htmlChanged) fs.writeFileSync(opts.html, newHtml, 'utf8');

  console.log('Demos (' + demos.length + '):\n' + report);
  console.log(staleRoms.length ? 'Escribí ' + staleRoms.map((d) => d.id + '.ch8').join(', ') + '.' : 'Los .ch8 ya estaban al día.');
  console.log(htmlChanged ? 'Actualicé ' + path.relative(process.cwd(), opts.html) + '.' :
    path.relative(process.cwd(), opts.html) + ' ya estaba al día.');
}

main();
