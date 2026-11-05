'use strict';
// Tabla de autoconfiguración: tools/archive.js, data/archive.json y el bloque
// <script id="chip8-archive"> de chip8.html.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { ROOT, readHtml, extractScript, loadCore } = require('./harness.js');
const archive = require('../tools/archive.js');

const QUIRK_KEYS = ['vfReset', 'memory', 'shifting', 'jumping', 'clipping', 'displayWait'];
const OCTO_COLORS = ['#996600', '#FFCC00', '#FF6600', '#662200'];

describe('tools/archive.js: opciones de Octo -> ajustes de la consola', () => {
  it('sin opciones toma los valores por defecto de Octo, que son los quirks del perfil XO-CHIP', () => {
    for (const options of [undefined, null, {}, 'basura']) {
      const s = archive.fromOctoOptions(options);
      assert.equal(s.ipf, 20);
      assert.deepEqual(s.quirks, { ...loadCore().QUIRK_PRESETS.xochip.quirks });
      assert.deepEqual(s.colors, OCTO_COLORS);
      assert.equal(s.rotation, 0);
      assert.deepEqual(s.unsupported, []);
    }
  });

  it('cada quirk de Octo enciende su interruptor (loadStoreQuirks al revés: true = I no se mueve)', () => {
    const base = archive.fromOctoOptions({}).quirks;
    const cases = [
      ['logicQuirks', 'vfReset', true],
      ['loadStoreQuirks', 'memory', false],
      ['shiftQuirks', 'shifting', true],
      ['jumpQuirks', 'jumping', true],
      ['clipQuirks', 'clipping', true],
      ['vBlankQuirks', 'displayWait', true],
    ];
    for (const [octo, ours, value] of cases) {
      const q = archive.fromOctoOptions({ [octo]: true }).quirks;
      assert.deepEqual(q, { ...base, [ours]: value }, octo);
      // Un false explícito es lo mismo que no traer la opción.
      assert.deepEqual(archive.fromOctoOptions({ [octo]: false }).quirks, base, octo + ' = false');
    }
    // Solo true cuenta como verdadero (no "true" ni 1).
    assert.deepEqual(archive.fromOctoOptions({ logicQuirks: 'true', clipQuirks: 1 }).quirks, base);
  });

  it('el perfil COSMAC VIP de Octo da los quirks del perfil COSMAC VIP de la consola', () => {
    const vip = archive.fromOctoOptions({ logicQuirks: true, clipQuirks: true, vBlankQuirks: true }).quirks;
    assert.deepEqual(vip, { ...loadCore().QUIRK_PRESETS.vip.quirks });
  });

  it('tickrate pasa a IPF: números y textos, redondeado y limitado a 1..10000', () => {
    const ipf = (tickrate) => archive.fromOctoOptions({ tickrate }).ipf;
    assert.equal(ipf(7), 7);
    assert.equal(ipf(500), 500);
    assert.equal(ipf('200'), 200);
    assert.equal(ipf(15.6), 16);
    assert.equal(ipf(0), 1);
    assert.equal(ipf(-5), 1);
    assert.equal(ipf(10000), 10000);
    assert.equal(ipf(50000), 10000);
    assert.equal(ipf('mucho'), 20);
    assert.equal(ipf(undefined), 20);
  });

  it('colores: fondo, plano 1, plano 2 y ambos, en #RRGGBB mayúscula; lo inválido usa el de Octo', () => {
    const s = archive.fromOctoOptions({ backgroundColor: '#000', fillColor: '#a0b1c2', fillColor2: 'rojo', blendColor: '#12345' });
    assert.deepEqual(s.colors, ['#000000', '#A0B1C2', '#FF6600', '#662200']);
    assert.equal(archive.normalizeColor(' #abc ', null), '#AABBCC');
    assert.equal(archive.normalizeColor(42, '#FFFFFF'), '#FFFFFF');
  });

  it('rotación: 0, 90, 180 o 270; cualquier otra cosa es 0', () => {
    for (const r of [0, 90, 180, 270]) assert.equal(archive.fromOctoOptions({ screenRotation: r }).rotation, r);
    assert.equal(archive.fromOctoOptions({ screenRotation: '90' }).rotation, 90);
    for (const r of [45, 360, -90, 'izquierda', null]) assert.equal(archive.fromOctoOptions({ screenRotation: r }).rotation, 0);
  });

  it('vfOrderQuirks se informa: la consola siempre escribe VF al final', () => {
    assert.deepEqual(archive.fromOctoOptions({ vfOrderQuirks: true }).unsupported, ['vfOrderQuirks']);
    assert.deepEqual(archive.fromOctoOptions({ vfOrderQuirks: false }).unsupported, []);
  });

  it('formatEvent separa el número de la Octojam y deja el resto igual', () => {
    assert.equal(archive.formatEvent('Octojam3'), 'Octojam 3');
    assert.equal(archive.formatEvent('octojam10'), 'Octojam 10');
    assert.equal(archive.formatEvent('Ludum Dare'), 'Ludum Dare');
    assert.equal(archive.formatEvent(''), '');
    assert.equal(archive.formatEvent(undefined), '');
  });

  it('toEntry arma la entrada embebida con el año de la fecha y los autores juntos', () => {
    const e = archive.toEntry({
      id: 'demo', title: 'Demo', authors: ['Ana', 'Beto'], event: 'Octojam5', release: '2018-10-31',
      platform: 'schip', size: 300, sha1: 'x', options: { tickrate: 30, shiftQuirks: true },
    });
    assert.deepEqual(e, {
      id: 'demo', title: 'Demo', authors: 'Ana, Beto', event: 'Octojam 5', year: 2018, platform: 'schip', size: 300,
      ipf: 30, quirks: { ...archive.fromOctoOptions({ shiftQuirks: true }).quirks },
      colors: OCTO_COLORS, rotation: 0,
    });
    assert.equal(archive.toEntry({ id: 'x', title: 'X', platform: 'otra', options: {} }).platform, 'chip8');
    assert.equal(archive.toEntry({ id: 'x', title: 'X', release: 'pronto', options: {} }).year, null);
  });
});

describe('data/archive.json', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archive.json'), 'utf8'));

  it('dice de dónde sale: el archivo de John Earnest, licencia CC0, con el commit', () => {
    assert.equal(data.source, 'https://github.com/JohnEarnest/chip8Archive');
    assert.equal(data.license, 'CC0 1.0');
    assert.match(data.commit, /^[0-9a-f]{40}$/);
    assert.match(data.fetched, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(data.programs.length > 0);
  });

  it('cada programa tiene id y huella únicos, plataforma válida y un tamaño que entra en su plataforma', () => {
    const ids = new Set(), hashes = new Set();
    for (const p of data.programs) {
      assert.ok(p.id && !ids.has(p.id), `id repetido o vacío: ${p.id}`);
      ids.add(p.id);
      assert.match(p.sha1, /^[0-9a-f]{40}$/, p.id);
      assert.ok(!hashes.has(p.sha1), `huella repetida: ${p.id}`);
      hashes.add(p.sha1);
      assert.ok(['chip8', 'schip', 'xochip'].includes(p.platform), `${p.id}: plataforma ${p.platform}`);
      const max = p.platform === 'xochip' ? 65024 : 3584;
      assert.ok(p.size > 0 && p.size <= max, `${p.id}: ${p.size} bytes en ${p.platform}`);
      assert.equal(typeof p.title, 'string');
      assert.ok(p.title.length > 0, p.id);
      assert.equal(typeof p.options, 'object');
    }
  });

  it('ningún programa usa algo que la consola no tenga (vfOrderQuirks)', () => {
    const bad = data.programs.filter((p) => archive.fromOctoOptions(p.options).unsupported.length);
    assert.deepEqual(bad.map((p) => p.id), []);
  });
});

describe('bloque <script id="chip8-archive"> de chip8.html', () => {
  it('está al día con data/archive.json (node tools/archive.js embed --check)', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'archive.js'), 'embed', '--check'], { cwd: ROOT, stdio: 'pipe' });
  });

  it('define CHIP8_ARCHIVE con una entrada válida por programa, indexada por la huella SHA-1', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archive.json'), 'utf8'));
    const { code } = extractScript('chip8-archive');
    const sandbox = {};
    vm.runInNewContext(code, sandbox);
    const table = sandbox.CHIP8_ARCHIVE;
    assert.equal(table.source, 'github.com/JohnEarnest/chip8Archive');
    assert.ok(!code.includes('//'), 'el bloque no tiene direcciones con esquema (ni comentarios //)');
    assert.equal(table.license, 'CC0 1.0');
    assert.deepEqual(Object.keys(table.roms).sort(), data.programs.map((p) => p.sha1).sort());
    for (const [hash, e] of Object.entries(table.roms)) {
      const p = data.programs.find((x) => x.sha1 === hash);
      assert.equal(e.id, p.id);
      assert.equal(e.title, p.title);
      assert.ok(['chip8', 'schip', 'xochip'].includes(e.platform), e.id);
      assert.ok(Number.isInteger(e.ipf) && e.ipf >= 1 && e.ipf <= 10000, e.id);
      assert.deepEqual(Object.keys(e.quirks), QUIRK_KEYS, e.id);
      for (const k of QUIRK_KEYS) assert.equal(typeof e.quirks[k], 'boolean', `${e.id}.${k}`);
      assert.equal(e.colors.length, 4, e.id);
      for (const c of e.colors) assert.match(c, /^#[0-9A-F]{6}$/, e.id);
      assert.ok([0, 90, 180, 270].includes(e.rotation), e.id);
    }
  });

  it('no contiene "</script" ni comentarios HTML, aunque un título los tuviera', () => {
    const { code } = extractScript('chip8-archive');
    assert.ok(!/<\/script|<!--/i.test(code));
    const nasty = archive.buildBlock({
      source: 's', license: 'l', commit: 'c',
      programs: [{ id: 'x', title: '</script><!-- "hola" -->', sha1: 'a'.repeat(40), size: 2, platform: 'chip8', options: {} }],
    });
    assert.ok(!/<\/script|<!--/i.test(nasty));
    const sandbox = {};
    vm.runInNewContext(nasty, sandbox);
    assert.equal(sandbox.CHIP8_ARCHIVE.roms['a'.repeat(40)].title, '</script><!-- "hola" -->');
  });

  it('embedInto agrega el bloque después de chip8-roms si falta, conserva CRLF y es idempotente', () => {
    const data = { source: 's', license: 'l', commit: '', programs: [] };
    const html = '<body>\r\n<script id="chip8-roms">x</script>\r\n<script id="chip8-ui">y</script>\r\n</body>';
    const once = archive.embedInto(html, data);
    assert.ok(once.indexOf('<script id="chip8-archive">') > once.indexOf('<script id="chip8-roms">'));
    assert.ok(once.indexOf('<script id="chip8-archive">') < once.indexOf('<script id="chip8-ui">'));
    assert.ok(!/[^\r]\n/.test(once), 'todas las líneas en CRLF');
    assert.equal(archive.embedInto(once, data), once);
    assert.throws(() => archive.embedInto('<body></body>', data), /chip8-roms/);
  });

  it('está entre chip8-roms y chip8-ui en chip8.html', () => {
    const html = readHtml();
    const a = html.indexOf('<script id="chip8-roms">');
    const b = html.indexOf('<script id="chip8-archive">');
    const c = html.indexOf('<script id="chip8-ui">');
    assert.ok(a >= 0 && b > a && c > b);
  });
});
