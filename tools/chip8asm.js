#!/usr/bin/env node
'use strict';
/*
 * chip8asm.js — el ensamblador de CHIP-8 en la línea de comandos.
 *
 * El ensamblador vive en chip8.html, en el bloque <script id="chip8-asm">, que
 * también usa la consola (el Taller). Esta herramienta lo saca de ahí, como
 * tests/harness.js saca el núcleo, así la línea de comandos y la página
 * ensamblan con el mismo código. La sintaxis, las instrucciones y la API están
 * explicadas al principio de ese bloque.
 *
 * Uso:
 *   node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]
 *     Si no indicás la salida, se usa el mismo nombre con extensión .ch8.
 *     Con --listing además imprime el listado (dirección, bytes y línea fuente).
 *     Con --xo ensambla para XO-CHIP: el programa puede llegar hasta la
 *     dirección 0xFFFF (sin --xo, hasta 0xFFF).
 *     Con --help (o -h) muestra el uso. Ante cualquier problema (archivo que no
 *     se puede leer o escribir, error en la fuente, opción desconocida, archivos
 *     de más, chip8.html que falta) explica qué pasó en una línea y sale con
 *     código 1.
 *
 * Desde Node, como módulo:
 *   const { assemble, formatListing } = require('./tools/chip8asm.js');
 * Devuelve el globalThis.Chip8Asm del bloque (assemble, check, formatListing y
 * headerTags) sin dejarlo como global. El bloque se busca en el chip8.html que
 * está al lado de la carpeta tools/; si no está, o no tiene el bloque, require
 * lanza un error que lo dice.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'chip8.html');
const OPEN_TAG = '<script id="chip8-asm">';
const USAGE = 'Uso: node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]';

// Explica en castellano los errores más comunes del sistema de archivos.
function fsReason(e, file) {
  if (e.code === 'ENOENT') {
    const dir = path.dirname(path.resolve(file));
    return fs.existsSync(dir) ? 'el archivo no existe' : 'la carpeta "' + path.dirname(file) + '" no existe';
  }
  if (e.code === 'EISDIR') return 'es una carpeta, no un archivo';
  if (e.code === 'EACCES' || e.code === 'EPERM') return 'no hay permiso';
  if (e.code === 'EBUSY') return 'otro programa lo tiene abierto';
  return e.message;
}

// Saca el bloque chip8-asm de un HTML y lo evalúa en este mismo contexto (como tests/harness.js:
// así lo que devuelve, como la Uint8Array de los bytes, es de este proceso). Devuelve
// globalThis.Chip8Asm y deja el global como estaba.
function loadAssembler(file) {
  const name = path.basename(file);
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error('no pude leer "' + file + '", donde está el ensamblador: ' + fsReason(e, file));
  }
  const start = html.indexOf(OPEN_TAG);
  if (start < 0) throw new Error(name + ' no tiene el bloque ' + OPEN_TAG + ', donde está el ensamblador');
  const bodyStart = start + OPEN_TAG.length;
  const end = html.indexOf('</script>', bodyStart);
  if (end < 0) throw new Error('el bloque ' + OPEN_TAG + ' de ' + name + ' no está cerrado');
  const lineOffset = html.slice(0, bodyStart).split('\n').length - 1;
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Chip8Asm');
  const before = globalThis.Chip8Asm;
  let api;
  try {
    delete globalThis.Chip8Asm;
    new vm.Script(html.slice(bodyStart, end), { filename: file, lineOffset }).runInThisContext();
    api = globalThis.Chip8Asm;
  } catch (e) {
    throw new Error('el bloque ' + OPEN_TAG + ' de ' + name + ' no anda: ' + e.message);
  } finally {
    if (had) globalThis.Chip8Asm = before;
    else delete globalThis.Chip8Asm;
  }
  if (!api || typeof api.assemble !== 'function' || typeof api.formatListing !== 'function') {
    throw new Error('el bloque ' + OPEN_TAG + ' de ' + name + ' no definió globalThis.Chip8Asm');
  }
  return api;
}

// ------------------------------------------------------------------
// Línea de comandos
// ------------------------------------------------------------------
function main() {
  // Muestra el problema y el uso, y termina con código 1.
  const fail = (message) => {
    console.error('chip8asm: ' + message + '\n' + USAGE);
    process.exit(1);
  };

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  let wantListing = false;
  let xochip = false;
  const files = [];
  for (const a of args) {
    if (a === '--listing') wantListing = true;
    else if (a === '--xo') xochip = true;
    else if (a.startsWith('-') && a !== '-') fail('opción desconocida: ' + a);
    else files.push(a);
  }
  if (files.length < 1) fail('falta el archivo de entrada');
  if (files.length > 2) fail('sobran argumentos: ' + files.slice(2).join(' '));
  const input = files[0];
  const output = files[1] || input.replace(/\.[^./\\]*$/, '') + '.ch8';
  let source;
  try {
    source = fs.readFileSync(input, 'utf8');
  } catch (e) {
    console.error('No pude leer "' + input + '": ' + fsReason(e, input));
    process.exit(1);
  }
  let api;
  try {
    api = loadAssembler(HTML_PATH);
  } catch (e) {
    console.error('chip8asm: ' + e.message);
    process.exit(1);
  }
  let result;
  try {
    result = api.assemble(source, { xochip });
  } catch (e) {
    console.error(path.basename(input) + ': ' + e.message);
    process.exit(1);
  }
  try {
    fs.writeFileSync(output, result.bytes);
  } catch (e) {
    console.error('No pude escribir "' + output + '": ' + fsReason(e, output));
    process.exit(1);
  }
  if (wantListing) console.log(api.formatListing(result.listing));
  console.log('Ensamblado ' + path.basename(input) + ': ' + result.bytes.length + ' bytes -> ' + output);
}

if (require.main === module) main();
else module.exports = loadAssembler(HTML_PATH);
