'use strict';
// El contrato del archivo único: chip8.html no pide nada a la red y tiene sus cuatro
// bloques con las etiquetas exactas que usan harness.js y embed-roms.js.
// Las direcciones data: están permitidas (el ícono de la pestaña es un SVG en data:).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readHtml, extractScript } = require('./harness');

const html = readHtml();
const BLOCKS = [
  ['style', 'chip8-style'],
  ['script', 'chip8-core'],
  ['script', 'chip8-roms'],
  ['script', 'chip8-ui'],
];

describe('chip8.html es un solo archivo sin dependencias', () => {
  it('tiene los cuatro bloques, cada uno una sola vez, con la etiqueta de apertura exacta y en orden', () => {
    let last = -1;
    for (const [tag, id] of BLOCKS) {
      const open = '<' + tag + ' id="' + id + '">';
      const at = html.indexOf(open);
      assert.ok(at >= 0, 'falta ' + open);
      assert.equal(html.indexOf(open, at + 1), -1, open + ' aparece más de una vez');
      assert.ok(at > last, open + ' está fuera de orden');
      last = at;
    }
    assert.equal((html.match(/<script\b/gi) || []).length, 3, 'hay <script> de más');
    assert.equal((html.match(/<style\b/gi) || []).length, 1, 'hay <style> de más');
  });

  it('ningún bloque contiene "</script" ni "</style" antes de su cierre', () => {
    for (const [tag, id] of BLOCKS) {
      const open = '<' + tag + ' id="' + id + '">';
      const start = html.indexOf(open) + open.length;
      const end = html.indexOf('</' + tag + '>', start);
      assert.ok(end > start, open + ' no está cerrado');
      const body = html.slice(start, end);
      assert.ok(!/<\/(script|style)/i.test(body), open + ' contiene un cierre de etiqueta adentro');
    }
  });

  it('no pide recursos externos: sin http(s), sin @import, src y href solo data: o #ancla', () => {
    const urls = html.match(/\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi) || [];
    assert.deepEqual(urls, [], 'direcciones externas');
    assert.ok(!/@import\b/i.test(html), 'hay un @import');
    for (const m of html.matchAll(/\b(src|href|action|poster)\s*=\s*["']([^"']*)["']/gi)) {
      assert.match(m[2], /^(data:|#)/, m[1] + '="' + m[2].slice(0, 60) + '"');
    }
    for (const m of html.matchAll(/url\(\s*["']?([^"')]*)/gi)) {
      assert.match(m[1], /^(data:|#)/, 'url(' + m[1].slice(0, 60) + ')');
    }
  });

  it('el núcleo, los cartuchos y la interfaz son JavaScript válido', () => {
    for (const id of ['chip8-core', 'chip8-roms', 'chip8-ui']) {
      const { code } = extractScript(id, html);
      assert.doesNotThrow(() => new vm.Script(code, { filename: id }), id + ' no compila');
    }
  });
});
