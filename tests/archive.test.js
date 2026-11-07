'use strict';
// Tabla de autoconfiguración: tools/archive.js, data/archive.json y el bloque
// <script id="chip8-archive"> de chip8.html, con las ROMs del archivo embebidas al final.
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

describe('roms/archivo: las ROMs del archivo', () => {
  const crypto = require('node:crypto');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archive.json'), 'utf8'));
  const dir = archive.ROMS_DIR;

  it('hay una ROM por programa, idéntica a la del archivo (misma huella SHA-1 y tamaño)', () => {
    for (const p of data.programs) {
      const file = path.join(dir, p.id + '.ch8');
      assert.ok(fs.existsSync(file), `falta roms/archivo/${p.id}.ch8 (corré "node tools/archive.js download")`);
      const rom = fs.readFileSync(file);
      assert.equal(rom.length, p.size, p.id);
      assert.equal(crypto.createHash('sha1').update(rom).digest('hex'), p.sha1, p.id);
    }
  });

  it('no tiene archivos que no sean del archivo, salvo su LEEME.md', () => {
    const known = new Set(data.programs.map((p) => p.id + '.ch8').concat(archive.README_NAME));
    assert.deepEqual(fs.readdirSync(dir).filter((f) => !known.has(f)), []);
  });

  it('LEEME.md está al día con data/archive.json y no muestra el autor de ejemplo de la plantilla', () => {
    const readme = fs.readFileSync(path.join(dir, archive.README_NAME), 'utf8');
    assert.equal(readme, archive.buildReadme(data));
    assert.ok(!/your name here/i.test(readme));
    for (const p of data.programs) assert.ok(readme.includes(`[\`${p.id}.ch8\`](${encodeURIComponent(p.id)}.ch8)`), p.id);
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
    }, { ['a'.repeat(40)]: archive.packRom([0x12, 0x00]) });
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

// Los bytes de las ROMs, al final del bloque (CHIP8_ARCHIVE.data): los carga la ventana del archivo de
// la consola, que los descomprime con DecompressionStream('deflate').
describe('las ROMs embebidas en chip8.html (CHIP8_ARCHIVE.data)', () => {
  const crypto = require('node:crypto');
  const zlib = require('node:zlib');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const data = JSON.parse(fs.readFileSync(archive.DATA_PATH, 'utf8'));
  const bySha = data.programs.slice().sort((a, b) => a.sha1.localeCompare(b.sha1));
  const sha1 = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex');
  const romOf = (p) => fs.readFileSync(path.join(archive.ROMS_DIR, p.id + '.ch8'));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const embedded = () => {
    const sandbox = {};
    vm.runInNewContext(extractScript('chip8-archive').code, sandbox);
    return sandbox.CHIP8_ARCHIVE;
  };
  // base64url sin relleno -> bytes, como en el navegador: el alfabeto de siempre, el relleno y atob.
  const fromB64url = (text) => {
    let s = text.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  };

  it('cada ROM del archivo está embebida y se descomprime a los bytes de roms/archivo/, con su huella y su tamaño', () => {
    const table = embedded();
    assert.deepEqual(Object.keys(table.data).sort(), data.programs.map((p) => p.sha1).sort(), 'una ROM por programa, sin otras');
    for (const p of data.programs) {
      const bytes = zlib.inflateSync(Buffer.from(table.data[p.sha1], 'base64url'));
      assert.equal(bytes.length, p.size, p.id);
      assert.equal(sha1(bytes), p.sha1, p.id);
      assert.ok(bytes.equals(romOf(p)), p.id);
    }
  });

  it('DecompressionStream("deflate"), lo que usa el navegador, da los mismos bytes', async () => {
    const table = embedded();
    for (const p of data.programs) {
      const stream = new Blob([fromB64url(table.data[p.sha1])]).stream().pipeThrough(new DecompressionStream('deflate'));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      assert.equal(bytes.length, p.size, p.id);
      assert.equal(sha1(bytes), p.sha1, p.id);
    }
  });

  it('la tabla queda legible arriba y los bytes van aparte, al final del bloque, en base64url sin relleno', () => {
    const { code } = extractScript('chip8-archive');
    const lines = code.split('\n');
    const at = lines.indexOf(archive.DATA_OPEN);
    assert.ok(at > 0, 'falta ' + archive.DATA_OPEN);
    assert.deepEqual(lines.slice(at - 2, at), ['};', archive.DATA_HEADER], 'los bytes van después de la tabla, con su comentario');
    assert.ok(lines.slice(0, at).every((l) => l.length < 600), 'la tabla tiene una línea corta por juego');
    const rows = lines.slice(at + 1, -2);
    assert.deepEqual(lines.slice(-2), ['};', '']);
    assert.deepEqual(rows.map((r) => r.slice(3, 43)), bySha.map((p) => p.sha1), 'una línea por ROM, en el orden de las huellas');
    rows.forEach((r, i) => assert.match(r, i < rows.length - 1 ? /^ {2}"[0-9a-f]{40}": "[A-Za-z0-9_-]+",$/ : /^ {2}"[0-9a-f]{40}": "[A-Za-z0-9_-]+"$/));
    const texts = Object.values(embedded().data);
    assert.ok(texts.every((t) => t.length % 4 !== 1), 'largos posibles de base64 sin relleno');
    // Unos 700 KB: se aceptó que chip8.html pase de unos 420 KB a cerca de 1,1 MB.
    const total = texts.reduce((n, t) => n + t.length, 0);
    assert.ok(total < 760 * 1024, `los bytes comprimidos ocupan ${Math.round(total / 1024)} KB`);
  });

  it('readPacked lee lo embebido; sin bloque o con un bloque sin bytes, nada', () => {
    const packed = archive.readPacked(readHtml());
    assert.deepEqual(Object.keys(packed).sort(), data.programs.map((p) => p.sha1).sort());
    assert.deepEqual(packed, { ...embedded().data });
    assert.deepEqual(archive.readPacked('<p>sin bloque</p>'), {});
    assert.deepEqual(archive.readPacked('<script id="chip8-archive">\nglobalThis.CHIP8_ARCHIVE = { roms: {} };\n</script>'), {});
  });

  it('packRom y unpackRom: ida y vuelta en base64url sin relleno; unpackRom rechaza lo que no es deflate', () => {
    let seed = 7;
    const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
    for (const n of [1, 2, 3, 100, 3584, 65024]) {
      const bytes = Buffer.from(Array.from({ length: n }, (_, i) => (i % 7 ? rand() : 0)));
      const text = archive.packRom(bytes);
      assert.match(text, /^[A-Za-z0-9_-]+$/, n + ' bytes');
      assert.notEqual(text.length % 4, 1, n + ' bytes');
      assert.ok(archive.unpackRom(text).equals(bytes), n + ' bytes');
      assert.ok(Buffer.from(fromB64url(text)).equals(zlib.deflateSync(bytes, { level: 9 })), 'el relleno que agrega el navegador');
    }
    assert.throws(() => archive.unpackRom('no es base64!'), /base64url/);
    assert.throws(() => archive.unpackRom('A'), /base64url/);
    assert.throws(() => archive.unpackRom('AAAA'));   // base64url, pero no es deflate
    assert.throws(() => archive.unpackRom(archive.packRom([1, 2, 3]).slice(0, -3)));   // cortado
  });

  it('readRoms verifica la huella y el tamaño de cada ROM de roms/archivo/', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archivo-roms-'));
    try {
      const some = bySha.slice(0, 3);
      const mini = { ...data, programs: some };
      for (const p of some) fs.copyFileSync(path.join(archive.ROMS_DIR, p.id + '.ch8'), path.join(dir, p.id + '.ch8'));
      const roms = archive.readRoms(mini, dir);
      assert.deepEqual(Object.keys(roms).sort(), some.map((p) => p.sha1).sort());
      for (const p of some) assert.ok(roms[p.sha1].equals(romOf(p)), p.id);
      // Una con un byte cambiado (mismo tamaño, otra huella) y otra con un byte de más.
      const changed = romOf(some[0]);
      changed[0] ^= 0xFF;
      fs.writeFileSync(path.join(dir, some[0].id + '.ch8'), changed);
      fs.writeFileSync(path.join(dir, some[2].id + '.ch8'), Buffer.concat([romOf(some[2]), Buffer.from([0])]));
      assert.throws(() => archive.readRoms(mini, dir),
        new RegExp('Las ROMs de roms/archivo/ no son las de data/archive.json: ' + esc(some[0].id) + '\\.ch8 .*' + esc(some[2].id) + '\\.ch8 \\(' + (some[2].size + 1) + ' bytes.*download'));
      // Y si falta una, primero eso.
      fs.rmSync(path.join(dir, some[1].id + '.ch8'));
      assert.throws(() => archive.readRoms(mini, dir), new RegExp('Faltan ROMs en roms/archivo/: ' + esc(some[1].id) + '\\.ch8\\. .*download'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('packRoms conserva lo que ya estaba si se descomprime bien y rehace lo demás; buildBlock pide los bytes de cada programa', () => {
    const [a, b] = bySha;
    const mini = { ...data, programs: [a, b] };
    const roms = { [a.sha1]: romOf(a), [b.sha1]: romOf(b) };
    const stored = zlib.deflateSync(romOf(a), { level: 0 }).toString('base64url');   // sin comprimir, pero válido
    const out = archive.packRoms(mini, roms, { [a.sha1]: stored, [b.sha1]: archive.packRom(romOf(a)) });
    assert.equal(out[a.sha1], stored, 'el que se descomprime bien queda como estaba');
    assert.ok(archive.unpackRom(out[b.sha1]).equals(romOf(b)), 'el que tenía otros bytes se rehace');
    assert.equal(archive.packRoms(mini, roms, { [a.sha1]: 'basura!' })[a.sha1], archive.packRom(romOf(a)));
    assert.throws(() => archive.packRoms(mini, { [a.sha1]: romOf(a) }), new RegExp('Falta la ROM de ' + esc(b.id)));
    assert.throws(() => archive.buildBlock(mini, { [a.sha1]: out[a.sha1] }), new RegExp('Faltan los bytes comprimidos de ' + esc(b.id)));
    assert.throws(() => archive.buildBlock(mini, { [a.sha1]: out[a.sha1], [b.sha1]: 'no/vale' }), /Faltan los bytes comprimidos/);
  });

  it('embedInto con bytes: respeta CRLF, readPacked lee lo que escribió y es idempotente', () => {
    const [a, b] = bySha;
    const mini = { ...data, programs: [b, a] };
    const roms = { [a.sha1]: romOf(a), [b.sha1]: romOf(b) };
    const html = '<body>\r\n<script id="chip8-roms">x</script>\r\n<script id="chip8-ui">y</script>\r\n</body>';
    const once = archive.embedInto(html, mini, roms);
    assert.ok(!/[^\r]\n/.test(once), 'todas las líneas en CRLF');
    const packed = archive.readPacked(once);
    assert.deepEqual(Object.keys(packed), [a.sha1, b.sha1], 'en el orden de las huellas');
    assert.ok(archive.unpackRom(packed[a.sha1]).equals(romOf(a)) && archive.unpackRom(packed[b.sha1]).equals(romOf(b)));
    assert.equal(archive.embedInto(once, mini, roms), once);
    const sandbox = {};
    const start = once.indexOf('<script id="chip8-archive">') + '<script id="chip8-archive">'.length;
    vm.runInNewContext(once.slice(start, once.indexOf('</script>', start)), sandbox);
    assert.deepEqual(Object.keys(sandbox.CHIP8_ARCHIVE.roms), [a.sha1, b.sha1]);
    assert.deepEqual({ ...sandbox.CHIP8_ARCHIVE.data }, packed);
  });

  it('embed --check detecta bytes de otra ROM o que faltan; embed los arregla y deja como estaban los que se descomprimen bien', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archivo-embed-'));
    try {
      const html = readHtml();
      const file = path.join(dir, 'pagina.html');
      const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'archive.js'), 'embed', '--html', file, ...args], { cwd: ROOT, encoding: 'utf8' });
      const packed = archive.readPacked(html);
      const line = (p, text) => `  "${p.sha1}": "${text}",\n`;
      const [a, b, c] = bySha;   // ninguna es la última línea (la que no lleva coma)
      // a: los bytes de otra ROM; b: falta su línea; c: comprimida de otra manera, pero bien.
      const other = zlib.deflateSync(romOf(c), { level: 1 }).toString('base64url');
      assert.notEqual(other, packed[c.sha1]);
      const bad = html.replace(line(a, packed[a.sha1]), line(a, archive.packRom(romOf(b))))
        .replace(line(b, packed[b.sha1]), '')
        .replace(line(c, packed[c.sha1]), line(c, other));
      assert.equal(bad.length, html.length - line(a, packed[a.sha1]).length + line(a, archive.packRom(romOf(b))).length -
        line(b, packed[b.sha1]).length - line(c, packed[c.sha1]).length + line(c, other).length, 'se cambiaron las tres líneas');
      fs.writeFileSync(file, bad);
      const check = run('--check');
      assert.equal(check.status, 1, check.stdout);
      assert.match(check.stderr, new RegExp('no está al día: faltan los bytes de 1 ROM \\(' + esc(b.id) + '\\); los bytes de ' + esc(a.id) + ' no son los de roms/archivo/'));
      assert.equal(fs.readFileSync(file, 'utf8'), bad, '--check no escribe');
      const fix = run();
      assert.equal(fix.status, 0, fix.stderr);
      const fixed = fs.readFileSync(file, 'utf8');
      const now = archive.readPacked(fixed);
      assert.deepEqual(Object.keys(now), bySha.map((p) => p.sha1));
      for (const p of [a, b]) assert.ok(archive.unpackRom(now[p.sha1]).equals(romOf(p)), p.id + ' se rehízo');
      assert.equal(now[c.sha1], other, 'la que se descomprime bien queda como estaba');
      for (const p of bySha.slice(3)) assert.equal(now[p.sha1], packed[p.sha1], p.id + ' no cambió');
      assert.equal(fixed.slice(0, fixed.indexOf(archive.DATA_OPEN)), html.slice(0, html.indexOf(archive.DATA_OPEN)), 'el resto de la página y la tabla, iguales');
      const again = run('--check');
      assert.equal(again.status, 0, again.stderr);
      assert.match(again.stdout, new RegExp('Todo al día: ' + data.programs.length + ' programas del archivo embebidos, con sus ROMs'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
