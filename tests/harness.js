'use strict';
// Utilidades compartidas por los tests.
// Extraen los bloques <script id="..."> de chip8.html y los evalúan en este mismo
// proceso (node --test corre cada archivo *.test.js en su propio proceso, así que
// no hay contaminación entre suites). Así se prueba exactamente el código que se
// entrega, sin copias.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'chip8.html');

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

// Devuelve el código de <script id="{id}"> y la línea donde empieza (para que los
// stack traces apunten a la línea real de chip8.html).
function extractScript(id, html = readHtml()) {
  const open = `<script id="${id}">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`chip8.html no contiene <script id="${id}">`);
  const bodyStart = start + open.length;
  const end = html.indexOf('</script>', bodyStart);
  if (end < 0) throw new Error(`<script id="${id}"> no está cerrado`);
  const lineOffset = html.slice(0, bodyStart).split('\n').length - 1;
  return { code: html.slice(bodyStart, end), lineOffset };
}

function runScript(id) {
  const { code, lineOffset } = extractScript(id);
  new vm.Script(code, { filename: HTML_PATH, lineOffset }).runInThisContext();
}

let core = null;
function loadCore() {
  if (!core) {
    delete globalThis.Chip8Core;
    runScript('chip8-core');
    core = globalThis.Chip8Core;
    if (!core) throw new Error('El bloque chip8-core no definió globalThis.Chip8Core');
  }
  return core;
}

let demos = null;
function loadDemos() {
  if (!demos) {
    delete globalThis.CHIP8_DEMOS;
    runScript('chip8-roms');
    demos = globalThis.CHIP8_DEMOS;
    if (!Array.isArray(demos)) throw new Error('El bloque chip8-roms no definió globalThis.CHIP8_DEMOS');
  }
  return demos;
}

function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2) throw new Error('Cadena hex de longitud impar');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

// [0x00E0, 0x6005] -> Uint8Array [0x00, 0xE0, 0x60, 0x05]
function wordsToBytes(words) {
  const out = new Uint8Array(words.length * 2);
  words.forEach((w, i) => {
    out[2 * i] = (w >> 8) & 0xff;
    out[2 * i + 1] = w & 0xff;
  });
  return out;
}

// Crea un Chip8 con el programa cargado en 0x200.
// program: array de opcodes de 16 bits, o Uint8Array con bytes crudos.
// options: se pasan tal cual al constructor ({ quirks, random }).
function makeCpu(program = [], options = {}) {
  const { Chip8 } = loadCore();
  const cpu = new Chip8(options);
  const bytes = program instanceof Uint8Array ? program : wordsToBytes(program);
  cpu.loadRom(bytes);
  return cpu;
}

function runSteps(cpu, n) {
  for (let i = 0; i < n; i++) cpu.step();
  return cpu;
}

function pixel(cpu, x, y) {
  return cpu.display[y * 64 + x];
}

// Dibuja la pantalla como texto (útil para depurar y para mensajes de error).
function renderAscii(cpu, on = '#', off = '.') {
  const rows = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 64; x++) row += cpu.display[y * 64 + x] ? on : off;
    rows.push(row);
  }
  return rows.join('\n');
}

function loadAssembler() {
  return require(path.join(ROOT, 'tools', 'chip8asm.js'));
}

module.exports = {
  ROOT,
  HTML_PATH,
  readHtml,
  extractScript,
  loadCore,
  loadDemos,
  hexToBytes,
  wordsToBytes,
  makeCpu,
  runSteps,
  pixel,
  renderAscii,
  loadAssembler,
};
