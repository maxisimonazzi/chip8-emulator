#!/usr/bin/env node
'use strict';
/*
 * embed-roms.js — ensambla los programas de demostración y los incrusta en chip8.html.
 *
 * Uso:
 *   node tools/embed-roms.js                 ensambla roms/*.asm, escribe roms/<id>.ch8 (y la ROM
 *                                            de cada ejemplo en Octo, docs/ejemplos/octo/<nombre>.ch8)
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
 * globalThis.CHIP8_SOURCES = { demos, examples, octo }, para editarlos en la consola:
 *   demos      el fuente de cada demo, por su id ({ rebote: "; @name Rebote\n..." }).
 *   examples   los ejemplos del tutorial (docs/ejemplos/*.asm, en orden alfabético):
 *              [{ name: "01-a-mano.asm", description, platform?, source }].
 *   octo       los ejemplos en el lenguaje de Octo (docs/ejemplos/octo/*.8o, en orden
 *              alfabético): [{ name: "pong.8o", description, source }]. Cada uno se compila
 *              con el compilador de Octo de chip8.html (el bloque chip8-octo) y su ROM queda
 *              al lado, en docs/ejemplos/octo/<nombre>.ch8, como la de cada demo. Su
 *              descripción sale del primer renglón de comentario ("# pong.8o — Pong para
 *              dos..." da "Pong para dos..."); una etiqueta "# @ipf N" tiene que ser un
 *              número de 1 a 10000 (las instrucciones por cuadro con que corre en el Taller).
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
const vm = require('node:vm');
const { assemble, headerTags } = require('./chip8asm.js');

const ROOT = path.resolve(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'roms');
const EXAMPLES_DIR = path.join(ROOT, 'docs', 'ejemplos');
const OCTO_DIR = path.join(EXAMPLES_DIR, 'octo');
const OPEN_TAG = '<script id="chip8-roms">';
const OCTO_TAG = '<script id="chip8-octo">';
const CLOSE_TAG = '</script>';
const HEADER = '/* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */';
const SOURCES_HEADER = '/* También GENERADO: los fuentes del Taller, los de las demos (roms/*.asm), los ejemplos del tutorial (docs/ejemplos/*.asm) y los de Octo (docs/ejemplos/octo/*.8o). */';
// Las instrucciones por cuadro que puede pedir la etiqueta @ipf (las de la consola).
const IPF_MIN = 1;
const IPF_MAX = 10000;
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

// El compilador de Octo, del bloque chip8-octo de chip8.html (como chip8asm.js saca el ensamblador): el mismo
// que usa el Taller. Se evalúa aparte, así no queda ningún global.
let octo = null;
function loadOcto() {
  if (octo) return octo;
  const file = path.join(ROOT, 'chip8.html');
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf(OCTO_TAG);
  if (start < 0) fail('chip8.html no tiene el bloque ' + OCTO_TAG + ', donde está el compilador de Octo');
  const bodyStart = start + OCTO_TAG.length;
  const end = html.indexOf(CLOSE_TAG, bodyStart);
  if (end < 0) fail('el bloque ' + OCTO_TAG + ' de chip8.html no está cerrado');
  const sandbox = {};
  try {
    vm.runInNewContext(html.slice(bodyStart, end), sandbox, { filename: file, lineOffset: html.slice(0, bodyStart).split('\n').length - 1 });
  } catch (e) {
    fail('el bloque ' + OCTO_TAG + ' de chip8.html no anda: ' + e.message);
  }
  if (!sandbox.Chip8Octo || typeof sandbox.Chip8Octo.compile !== 'function') fail('el bloque ' + OCTO_TAG + ' no definió Chip8Octo');
  octo = sandbox.Chip8Octo;
  return octo;
}

// Los ejemplos en Octo (docs/ejemplos/octo/*.8o), para el Taller: cada uno se compila. Sin la carpeta, ninguno.
function buildOctoExamples() {
  if (!fs.existsSync(OCTO_DIR)) return [];
  const files = fs.readdirSync(OCTO_DIR).filter((f) => f.toLowerCase().endsWith('.8o')).sort();
  return files.map((file) => {
    const where = 'docs/ejemplos/octo/' + file;
    if (!/^[a-z0-9_-]+\.8o$/.test(file)) fail(where + ': el nombre del archivo solo puede tener minúsculas, dígitos, "_" y "-"');
    const source = toLf(fs.readFileSync(path.join(OCTO_DIR, file), 'utf8'));
    const { compile, headerTags: octoTags } = loadOcto();
    const tags = octoTags(source);
    if (tags.ipf) {
      const ipf = Number(tags.ipf.value);
      if (!/^\d+$/.test(tags.ipf.value) || ipf < IPF_MIN || ipf > IPF_MAX) {
        fail(where + ': @ipf tiene que ser un número de ' + IPF_MIN + ' a ' + IPF_MAX + ' (dice "' + tags.ipf.value + '")');
      }
    }
    const r = compile(source);
    if (r.errors.length) fail(where + ': ' + r.errors[0].message);
    let description = '';
    for (const line of source.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (!trimmed.startsWith('#')) break;
      const text = trimmed.replace(/^#+\s*/, '');
      if (text === '' || text.startsWith('@')) continue;
      description = text.replace(/^\S+\.8o\s+[—–-]+\s+/, '');
      break;
    }
    return { name: file, description, source, bytes: Uint8Array.from(r.result.bytes), platform: r.result.platform };
  });
}

function renderBlock(demos, examples, octoExamples, eol) {
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
  lines.push('  ],');
  lines.push('  octo: [');
  octoExamples.forEach((x, i) => {
    lines.push('    {');
    lines.push('      name: ' + jsString(x.name) + ',');
    lines.push('      description: ' + jsString(x.description) + ',');
    lines.push('      source: ' + jsString(x.source));
    lines.push('    }' + (i < octoExamples.length - 1 ? ',' : ''));
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
  const octoExamples = buildOctoExamples();

  if (!fs.existsSync(opts.html)) fail('no existe ' + opts.html);
  const html = fs.readFileSync(opts.html, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const [bodyStart, bodyEnd] = findBlock(html, path.basename(opts.html));
  const block = renderBlock(demos, examples, octoExamples, eol);
  const newHtml = html.slice(0, bodyStart) + block + html.slice(bodyEnd);
  const htmlChanged = newHtml !== html;

  // Las ROMs que hay que escribir: la de cada demo (roms/<id>.ch8) y la de cada ejemplo en Octo, al lado de su .8o.
  const staleRoms = [];
  const stale = (file, bytes, what) => {
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!current || !Buffer.from(bytes).equals(current)) staleRoms.push({ file, bytes, what });
  };
  for (const d of demos) stale(path.join(ROMS_DIR, d.id + '.ch8'), d.bytes, 'roms/' + d.id + '.ch8 no coincide con roms/' + d.file);
  for (const x of octoExamples) {
    const base = x.name.replace(/\.8o$/, '');
    stale(path.join(OCTO_DIR, base + '.ch8'), x.bytes, 'docs/ejemplos/octo/' + base + '.ch8 no coincide con docs/ejemplos/octo/' + x.name);
  }

  const report = demos.map((d) => '  ' + String(d.order).padStart(2) + '. ' + d.id.padEnd(10) + ' ' +
    String(d.bytes.length).padStart(5) + ' bytes  ' + d.name + (d.platform ? ' (' + d.platform + ')' : '')).join('\n') +
    '\nEjemplos del tutorial para el Taller (' + examples.length + (examples.length ? '):\n' : ', no está docs/ejemplos/)') +
    examples.map((x) => '  ' + x.name.padEnd(26) + String(x.size).padStart(6) + ' bytes' + (x.platform ? ' (' + x.platform + ')' : '')).join('\n') +
    '\nEjemplos en Octo para el Taller (' + octoExamples.length + (octoExamples.length ? '):\n' : ', no está docs/ejemplos/octo/)') +
    octoExamples.map((x) => '  ' + x.name.padEnd(26) + String(x.bytes.length).padStart(6) + ' bytes (' + x.platform + ')').join('\n');

  if (opts.check) {
    const problems = staleRoms.map((r) => r.what);
    if (htmlChanged) problems.push('el bloque <script id="chip8-roms"> de ' + path.basename(opts.html) + ' está desactualizado');
    if (problems.length) {
      console.error('Hay ROMs desactualizadas:\n  - ' + problems.join('\n  - ') +
        '\nCorré "node tools/embed-roms.js" para regenerarlas.');
      process.exit(1);
    }
    console.log('Todo al día: ' + demos.length + ' demos.\n' + report);
    return;
  }

  for (const r of staleRoms) fs.writeFileSync(r.file, r.bytes);
  if (htmlChanged) fs.writeFileSync(opts.html, newHtml, 'utf8');

  console.log('Demos (' + demos.length + '):\n' + report);
  console.log(staleRoms.length ? 'Escribí ' + staleRoms.map((r) => path.relative(ROOT, r.file).replace(/\\/g, '/')).join(', ') + '.' : 'Los .ch8 ya estaban al día.');
  console.log(htmlChanged ? 'Actualicé ' + path.relative(process.cwd(), opts.html) + '.' :
    path.relative(process.cwd(), opts.html) + ' ya estaba al día.');
}

main();
