'use strict';
// Los juegos de las Octojam en itch.io que no están en el archivo: data/octojam-itch.json, roms/octojam/
// y su parte del bloque <script id="chip8-archive"> de chip8.html (node tools/archive.js itch y embed).
// También la regla de la plataforma (detectPlatform) y lo que lee de las páginas de itch.io.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { extractScript, loadCore } = require('./harness.js');
const archive = require('../tools/archive.js');

const sha1 = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex');
const data = JSON.parse(fs.readFileSync(archive.DATA_PATH, 'utf8'));
const itch = JSON.parse(fs.readFileSync(archive.ITCH_PATH, 'utf8'));
const romOf = (p) => fs.readFileSync(path.join(archive.ITCH_ROMS_DIR, p.id + '.ch8'));
const MAX = { chip8: 3584, schip: 3584, xochip: 65024 };
const jamOf = (event) => Number(/^Octojam (\d+)$/.exec(event)[1]);

describe('data/octojam-itch.json', () => {
  it('dice de dónde sale: las Octojam 6 a 10 en itch.io, con la fecha y cuántas entradas tiene cada una', () => {
    assert.equal(data.programs.length, 104, 'el archivo');
    assert.equal(itch.source, 'https://itch.io');
    assert.equal(itch.license, archive.ITCH_LICENSE);
    assert.match(itch.fetched, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(itch.jams.map((j) => j.event), archive.ITCH_JAMS.map((n) => 'Octojam ' + n));
    for (const j of itch.jams) {
      assert.equal(j.year, 2013 + jamOf(j.event), j.event);
      assert.equal(j.page, 'https://itch.io/jam/octojam-' + jamOf(j.event));
      // Cada entrada pública está en una de las tres listas: nueva, ya en el archivo o salteada.
      const n = (list) => list.filter((x) => x.event === j.event).length;
      assert.equal(n(itch.programs) + n(itch.inArchive) + n(itch.skipped), j.entries, j.event);
      assert.ok(j.announced === null || j.announced >= j.entries, j.event);
    }
    assert.ok(itch.programs.length >= 60, 'juegos nuevos: ' + itch.programs.length);
  });

  it('cada juego tiene id y huella únicos (también contra el archivo), su jam y su año, y una ROM que entra en su plataforma', () => {
    const ids = new Set(data.programs.map((p) => p.id.toLowerCase())), hashes = new Set(data.programs.map((p) => p.sha1));
    for (const p of itch.programs) {
      assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/, p.id);
      assert.ok(!ids.has(p.id.toLowerCase()), 'id repetido: ' + p.id);
      ids.add(p.id.toLowerCase());
      assert.match(p.sha1, /^[0-9a-f]{40}$/, p.id);
      assert.ok(!hashes.has(p.sha1), 'huella repetida (o ya en el archivo): ' + p.id);
      hashes.add(p.sha1);
      assert.ok(Object.hasOwn(MAX, p.platform), p.id + ': ' + p.platform);
      assert.ok(p.size > 0 && p.size <= MAX[p.platform], `${p.id}: ${p.size} bytes en ${p.platform}`);
      assert.ok(p.title && typeof p.title === 'string' && !/[­​]/.test(p.title), p.id);
      assert.ok(Array.isArray(p.authors) && p.authors.length > 0 && p.authors.every((a) => typeof a === 'string' && a), p.id);
      assert.ok(itch.jams.some((j) => j.event === p.event), p.id + ': ' + p.event);
      assert.equal(p.year, 2013 + jamOf(p.event), p.id);
      assert.match(p.page, /^https:\/\/[a-z0-9-]+\.itch\.io\/[a-z0-9-]+$/, p.id);
      assert.match(p.play, /^https:\/\/html-classic\.itch\.zone\/html\/\d+\/(.+\/)?index\.html$/, p.id);
      assert.equal(typeof p.options, 'object', p.id);
      assert.deepEqual(archive.fromOctoOptions(p.options).unsupported, [], p.id + ' usa algo que la consola no tiene');
    }
  });

  it('no repite un juego del archivo: ni la misma huella ni la misma jam con el mismo título', () => {
    for (const p of itch.programs) {
      const twin = data.programs.find((a) => archive.formatEvent(a.event) === p.event && archive.foldTitle(a.title) === archive.foldTitle(p.title));
      assert.equal(twin, undefined, `${p.id} es ${twin && twin.id} del archivo`);
    }
    // Los que ya estaban dicen cuál son, y ese existe.
    for (const x of itch.inArchive) {
      assert.ok(data.programs.some((a) => a.id === x.archiveId), x.title + ': ' + x.archiveId);
      assert.ok(x.note, x.title);
    }
    const page = (x) => x.page.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    for (const [key, id] of Object.entries(archive.ITCH_SAME_AS)) {
      assert.ok(data.programs.some((a) => a.id === id), id);
      assert.ok(itch.inArchive.some((x) => page(x) === key && x.archiveId === id), key);
    }
  });

  it('los que no se sumaron dicen por qué, y ninguno es también uno nuevo', () => {
    const pages = new Set(itch.programs.map((p) => p.page));
    for (const x of itch.skipped) {
      assert.ok(typeof x.reason === 'string' && x.reason.length > 10, x.title);
      assert.ok(!pages.has(x.page) || /misma página/.test(x.reason), x.title);
    }
  });
});

describe('roms/octojam: las ROMs de las Octojam en itch.io', () => {
  it('hay una ROM por juego, con la huella SHA-1 y el tamaño de data/octojam-itch.json', () => {
    for (const p of itch.programs) {
      const file = path.join(archive.ITCH_ROMS_DIR, p.id + '.ch8');
      assert.ok(fs.existsSync(file), `falta roms/octojam/${p.id}.ch8 (corré "node tools/archive.js itch")`);
      const rom = fs.readFileSync(file);
      assert.equal(rom.length, p.size, p.id);
      assert.equal(sha1(rom), p.sha1, p.id);
    }
    const roms = archive.readItchRoms(itch);
    assert.deepEqual(Object.keys(roms).sort(), itch.programs.map((p) => p.sha1).sort());
  });

  it('no tiene archivos que no sean de la colección, salvo su LEEME.md', () => {
    const known = new Set(itch.programs.map((p) => p.id + '.ch8').concat(archive.README_NAME));
    assert.deepEqual(fs.readdirSync(archive.ITCH_ROMS_DIR).filter((f) => !known.has(f)), []);
  });

  it('LEEME.md está al día: cada juego con su ROM y su página, los que ya estaban y los que se saltearon con el motivo', () => {
    const readme = fs.readFileSync(path.join(archive.ITCH_ROMS_DIR, archive.README_NAME), 'utf8');
    assert.equal(readme, archive.buildItchReadme(itch));
    for (const p of itch.programs) assert.ok(readme.includes(`[\`${p.id}.ch8\`](${p.id}.ch8)`) && readme.includes(`](${p.page})`), p.id);
    for (const x of itch.inArchive) assert.ok(readme.includes(`(../archivo/${encodeURIComponent(x.archiveId)}.ch8)`), x.title);
    for (const x of itch.skipped) assert.ok(readme.includes(x.reason), x.title);
    assert.ok(readme.includes('Cada juego es de sus autores'), 'dice que no son de dominio público');
  });
});

describe('su parte del bloque <script id="chip8-archive">', () => {
  const sandbox = {};
  vm.runInNewContext(extractScript('chip8-archive').code, sandbox);
  const table = sandbox.CHIP8_ARCHIVE;

  it('cada juego tiene su entrada, de la colección itch, con su página sin "https://"; los del archivo son de la colección archivo', () => {
    for (const p of itch.programs) {
      const e = table.roms[p.sha1];
      assert.ok(e, p.id);
      assert.deepEqual({ ...e, quirks: { ...e.quirks }, colors: [...e.colors] }, archive.toEntry({ ...p, collection: 'itch' }), p.id);
      assert.equal(e.collection, 'itch');
      assert.equal(e.page, p.page.replace(/^https:\/\//, ''), p.id);
    }
    for (const p of data.programs) {
      assert.equal(table.roms[p.sha1].collection, 'archivo', p.id);
      assert.ok(!('page' in table.roms[p.sha1]), p.id);
    }
    assert.equal(Object.keys(table.roms).length, data.programs.length + itch.programs.length);
  });

  it('cada ROM embebida se descomprime a la de roms/octojam/', () => {
    for (const p of itch.programs) {
      const bytes = zlib.inflateSync(Buffer.from(table.data[p.sha1], 'base64url'));
      assert.equal(sha1(bytes), p.sha1, p.id);
      assert.ok(bytes.equals(romOf(p)), p.id);
    }
  });
});

describe('la plataforma de una ROM de Octo (detectPlatform)', () => {
  const Core = loadCore();

  it('da la plataforma que les puso John Earnest a los 104 juegos del archivo', () => {
    const wrong = [];
    for (const p of data.programs) {
      const rom = fs.readFileSync(path.join(archive.ROMS_DIR, p.id + '.ch8'));
      const r = archive.detectPlatform(Core, rom, p.options, p.id);
      if (r.platform !== p.platform) wrong.push(`${p.id}: ${r.platform} (${r.why}) en vez de ${p.platform}`);
    }
    assert.deepEqual(wrong, []);
  });

  it('da la plataforma de data/octojam-itch.json a cada juego de itch.io', () => {
    const wrong = [];
    for (const p of itch.programs) {
      const seed = p.page.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
      const r = archive.detectPlatform(Core, romOf(p), p.options, seed);
      if (r.platform !== p.platform) wrong.push(`${p.id}: ${r.platform} (${r.why}) en vez de ${p.platform}`);
    }
    assert.deepEqual(wrong, []);
  });

  it('la regla: el tamaño, maxSize 3583 y la instrucción de más nivel que ejecuta (maxSize 65024 no alcanza)', () => {
    const rom = (...words) => Buffer.from(words.flatMap((w) => [w >> 8, w & 0xFF]));
    assert.equal(archive.detectPlatform(Core, rom(0x6005, 0x1202), {}).platform, 'chip8');
    assert.equal(archive.detectPlatform(Core, rom(0x6005, 0x1202), { maxSize: 65024 }).platform, 'chip8');
    assert.equal(archive.detectPlatform(Core, rom(0x6005, 0x1202), { maxSize: 3583 }).platform, 'schip');
    assert.equal(archive.detectPlatform(Core, rom(0x00FF, 0x1202), {}).platform, 'schip');
    const xo = archive.detectPlatform(Core, rom(0xF101, 0x1202), {});
    assert.equal(xo.platform, 'xochip');
    assert.match(xo.why, /ejecuta F101/);
    assert.equal(archive.detectPlatform(Core, Buffer.concat([rom(0x1200), Buffer.alloc(3600)]), {}).platform, 'xochip', 'más de 3584 bytes');
    // Un 00FF que no se ejecuta (V0 es 0, así que 4000 no saltea el jump) no cuenta, pero se avisa: se alcanza
    // siguiendo la otra rama del salteo.
    const dead = archive.detectPlatform(Core, rom(0x4000, 0x1206, 0x00FF, 0x1206), {});
    assert.equal(dead.platform, 'chip8');
    assert.match(dead.check, /se alcanza 00FF/);
    const after = archive.detectPlatform(Core, rom(0x1200, 0x00FF), {});
    assert.equal(after.platform, 'chip8');
    assert.equal(after.check, '', 'después de un jump no se alcanza');
  });

  it('reachableOpcodes sigue saltos, llamadas, salteos (y F000 NNNN entero) y tablas de jump0, sin meterse en los datos', () => {
    const rom = (...words) => Buffer.from(words.flatMap((w) => [w >> 8, w & 0xFF]));
    const ops = (...words) => archive.reachableOpcodes(rom(...words)).map((o) => o.toString(16).padStart(4, '0')).sort();
    // call 0x206; jump 0x204; 0x204: jump 0x204; 0x206: return; los datos de después (FFFF) no se leen.
    assert.deepEqual(ops(0x2206, 0x1204, 0x1204, 0x00EE, 0xFFFF), ['00ee', '1204', '1204', '2206']);
    // Un salteo sobre F000 NNNN sigue en las dos ramas: la de después del F000 entero (NNNN no es una instrucción).
    const skip = ops(0x3000, 0xF000, 0x0300, 0x00FE, 0x00EE);
    assert.ok(skip.includes('00fe') && skip.includes('f000') && !skip.includes('0300'), skip.join(' '));
    // jump0 a una tabla de jumps: sigue cada uno.
    assert.ok(ops(0xB204, 0x0000, 0x1208, 0x120A, 0x00FF, 0x00EE).includes('00ff'));
    assert.ok(!archive.isInstruction(0x5001) && archive.isInstruction(0x5002) && archive.isInstruction(0xF301) && !archive.isInstruction(0xF401));
  });
});

describe('lo que lee de itch.io', () => {
  it('parseOctoExport saca el objeto data={…} como JSON (aunque el fuente tenga llaves y comillas) y nada más', () => {
    const page = '<script>var x = 1; data={"program":": main\\n  # } { \\" ]\\n","rom":[18,0],"options":{"tickrate":7,"shiftQuirks":1}};</script>';
    const exp = archive.parseOctoExport(page);
    assert.deepEqual(exp.rom, [18, 0]);
    assert.equal(exp.options.tickrate, 7);
    assert.equal(exp.program, ': main\n  # } { " ]\n');
    assert.equal(archive.parseOctoExport('<p>data={"otra":1}</p>'), null, 'sin options no es una exportación');
    assert.equal(archive.parseOctoExport('<script>data={roto</script>'), null);
    assert.equal(archive.jsonObjectAt('a {"b":"}"} c', 2), '{"b":"}"}');
  });

  it('exportRom acepta un arreglo de bytes o un Uint8Array pasado por JSON, y nada más', () => {
    assert.deepEqual([...archive.exportRom({ rom: [1, 2, 255] })], [1, 2, 255]);
    assert.deepEqual([...archive.exportRom({ rom: JSON.parse(JSON.stringify(new Uint8Array([7, 8]))) })], [7, 8]);
    for (const rom of [undefined, [], [256], [1.5], ['1'], { 1: 2 }, new Array(65025).fill(0)]) assert.equal(archive.exportRom({ rom }), null);
  });

  it('playableUrl encuentra el iframe de html-classic.itch.zone (en data-iframe o suelto) sin el ?v=', () => {
    const attr = 'data-iframe="&lt;iframe src=&quot;https://html-classic.itch.zone/html/2902956/index.html?v=17&quot;&gt;&lt;/iframe&gt;"';
    assert.equal(archive.playableUrl('<div ' + attr + '></div>'), 'https://html-classic.itch.zone/html/2902956/index.html');
    assert.equal(archive.playableUrl('<iframe src="https://html-classic.itch.zone/html/1/only/index.html"></iframe>'), 'https://html-classic.itch.zone/html/1/only/index.html');
    assert.equal(archive.playableUrl('<iframe src="https://example.com/x.html"></iframe>'), null);
    assert.equal(archive.playableUrl('<p>solo descargas</p>'), null);
  });

  it('los autores salen de la tabla de la página; los nombres, sin entidades ni guiones blandos', () => {
    const page = '<tr><td>Authors</td><td><a href="https://a.itch.io">Ana &amp; Co</a>, <a href="https://b.itch.io">Beto</a></td></tr>';
    assert.deepEqual(archive.pageAuthors(page), ['Ana & Co', 'Beto']);
    assert.deepEqual(archive.pageAuthors('<td>Author</td><td><a href="x">Sola</a></td>'), ['Sola']);
    assert.deepEqual(archive.pageAuthors('<p>nada</p>'), []);
    assert.equal(archive.cleanName('Chipo­larium  &#39;21'), "Chipolarium '21");
    assert.equal(archive.itchSlug('https://tvil.itch.io/flip-8'), 'flip-8');
    assert.equal(archive.foldTitle('Bulb.'), archive.foldTitle('bulb'));
  });
});
