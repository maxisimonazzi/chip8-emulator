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
 * Solo se reemplaza el contenido de <script id="chip8-roms"> ... </script>; el resto
 * del archivo queda idéntico byte por byte (se respeta el tipo de fin de línea).
 * Correrlo dos veces seguidas no cambia nada.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assemble } = require('./chip8asm.js');

const ROOT = path.resolve(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'roms');
const OPEN_TAG = '<script id="chip8-roms">';
const CLOSE_TAG = '</script>';
const HEADER = '/* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */';
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

// Lee las etiquetas @tag del bloque de comentarios inicial.
function parseTags(source, file) {
  const tags = {};
  for (const line of source.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith(';')) break; // terminó el encabezado
    // "; @etiqueta valor" (una etiqueta sin valor queda vacía: es un error si es obligatoria)
    const m = /^;+\s*@(\w+)(?:\s+(.*?))?\s*$/.exec(trimmed);
    if (m) tags[m[1]] = m[2] || '';
  }
  for (const t of REQUIRED_TAGS) {
    if (!tags[t]) fail(file + ': falta la etiqueta "; @' + t + ' ..." en el encabezado');
  }
  const order = Number(tags.order);
  if (!Number.isFinite(order)) fail(file + ': @order debe ser un número');
  const out = { name: tags.name, description: tags.description, controls: tags.controls, order };
  // @platform es optativa: solo se anota si está (sin ella, la demo es de CHIP-8).
  if (tags.platform !== undefined) {
    if (!Object.hasOwn(PLATFORM_MAX_BYTES, tags.platform)) {
      fail(file + ': @platform tiene que ser chip8, schip o xochip (dice "' + tags.platform + '")');
    }
    out.platform = tags.platform;
  }
  return out;
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
    const source = fs.readFileSync(path.join(ROMS_DIR, file), 'utf8');
    const tags = parseTags(source, file);
    const platform = tags.platform || 'chip8';
    let result;
    try {
      result = assemble(source, { xochip: platform === 'xochip' });
    } catch (e) {
      fail(file + ': ' + e.message);
    }
    const max = PLATFORM_MAX_BYTES[platform];
    if (result.bytes.length === 0) fail(file + ': el programa está vacío');
    if (result.bytes.length > max) fail(file + ': el programa ocupa ' + result.bytes.length + ' bytes (máximo ' + max + ')');
    return { id, file, ...tags, bytes: result.bytes };
  });
  demos.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return demos;
}

function renderBlock(demos, eol) {
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

  if (!fs.existsSync(opts.html)) fail('no existe ' + opts.html);
  const html = fs.readFileSync(opts.html, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const [bodyStart, bodyEnd] = findBlock(html, path.basename(opts.html));
  const block = renderBlock(demos, eol);
  const newHtml = html.slice(0, bodyStart) + block + html.slice(bodyEnd);
  const htmlChanged = newHtml !== html;

  const staleRoms = [];
  for (const d of demos) {
    const ch8 = path.join(ROMS_DIR, d.id + '.ch8');
    const current = fs.existsSync(ch8) ? fs.readFileSync(ch8) : null;
    if (!current || !Buffer.from(d.bytes).equals(current)) staleRoms.push(d);
  }

  const report = demos.map((d) => '  ' + String(d.order).padStart(2) + '. ' + d.id.padEnd(10) + ' ' +
    String(d.bytes.length).padStart(5) + ' bytes  ' + d.name + (d.platform ? ' (' + d.platform + ')' : '')).join('\n');

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
