'use strict';
// Los archivos de estados (exportar e importar), las pantallitas giradas y findCartridge: las funciones de la
// sección «estados guardados: archivos» de chip8-ui.
// La interfaz es un solo IIFE que necesita el DOM, así que esta prueba no la corre entera: evalúa esa sección
// sola (no toca el DOM al definirse) junto con las ayudas de la interfaz que usa, sacadas tal cual de
// chip8.html (como uiConst en manual.test.js). demos, library, stateStore, archiveLookup y archiveRomBytes, que
// en la consola son de otras secciones, se pasan armados acá.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { extractScript, loadCore, loadDemos, hexToBytes, loadAssembler } = require('./harness');

const Core = loadCore();
const { assemble } = loadAssembler();
const UI = extractScript('chip8-ui').code;
const MARK = '  // ------------------------------------------------------------------ ';

// Una sección de la interfaz: desde su encabezado hasta el de la siguiente.
function uiSection(name) {
  const start = UI.indexOf(MARK + name + '\n');
  assert.ok(start >= 0, 'chip8-ui no tiene la sección «' + name + '»');
  return UI.slice(start, UI.indexOf('\n' + MARK, start + MARK.length));
}
// Una función de primer nivel de la interfaz (dos espacios de sangría), entera.
function uiFunction(name) {
  const start = UI.indexOf('\n  function ' + name + '(');
  assert.ok(start >= 0, 'chip8-ui ya no define la función ' + name);
  const first = UI.slice(start + 1, UI.indexOf('\n', start + 1));
  if (!/\{\s*$/.test(first)) return first;   // de una sola línea
  return UI.slice(start + 1, UI.indexOf('\n  }\n', start) + 4);
}
// Una línea «var NOMBRE = ...;» de primer nivel de la interfaz.
function uiVar(name) {
  const m = new RegExp('\\n  (var ' + name + ' = [^\\n]*)').exec(UI);
  assert.ok(m, 'chip8-ui ya no define ' + name);
  return m[1];
}

const DEPS = ['PLATFORM_INFO', 'MAX_ROM_ANY', 'STATE_SLOTS', 'STATE_TEXT_MAX', 'SHA_RE', 'B64_RE', 'MONTHS'];
const HELPERS = ['hasOwn', 'isInt', 'isTime', 'cleanText', 'errorText', 'toBase64', 'fromBase64', 'normalizeSlot', 'slotName', 'slotPhrase',
  'two', 'savedWhen', 'fileSlug', 'libraryName', 'stateThumb', 'findDemoBySha', 'findLibraryIndex'];
const EXPORTS = ['STATES_FILE_FORMAT', 'STATES_FILE_VERSION', 'STATES_FILE_MAX', 'countText', 'rotatedIndex', 'screenImage', 'statesFileText',
  'statesFileName', 'fileValue', 'fileDate', 'fileRom', 'fileState', 'parseStatesFile', 'planStatesImport', 'importSummary', 'looksLikeJson',
  'cartridgeOrigin', 'cartridgeName', 'findCartridge', 'toBase64'];
const SOURCE = ['"use strict";', ...DEPS.map(uiVar), ...HELPERS.map(uiFunction), uiSection('estados guardados: archivos'),
  'return { ' + EXPORTS.join(', ') + ' };'].join('\n');

// La sección, con lo que en la consola viene de otras partes.
function load(env = {}) {
  const fn = new Function('Core', 'window', 'demos', 'library', 'stateStore', 'archiveLookup', 'archiveRomBytes', SOURCE);
  return fn(Core, { atob, btoa }, env.demos || [], env.library || { items: [] }, env.stateStore || { version: 1, roms: {} },
    env.archiveLookup || (() => null), env.archiveRomBytes);
}
const F = load();

const sha1 = (bytes) => crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
// Un estado en texto: la ROM corrida frames frames (con plataforma y quirks del perfil, si se piden).
function stateText(rom, frames, platform = 'chip8') {
  const preset = { chip8: 'vip', schip: 'schip', xochip: 'xochip' }[platform];
  const cpu = new Core.Chip8({ platform, quirks: Core.QUIRK_PRESETS[preset].quirks });
  cpu.loadRom(Uint8Array.from(rom));
  for (let f = 0; f < frames; f++) cpu.runFrame(30);
  return Core.encodeState(cpu.saveState());
}
const ROM = Array.from(assemble(`
        CLS
        LD I, cuadro
        LD V0, 3
        LD V1, 4
        DRW V0, V1, 8
        ADD V5, 7
fin:    JP fin
cuadro: DB 0xFF, 0x81, 0xBD, 0xA5, 0xA5, 0xBD, 0x81, 0xFF`).bytes);
const SHA = sha1(ROM);
const T1 = stateText(ROM, 1), T2 = stateText(ROM, 3);
const DATE = Date.UTC(2026, 10, 5, 21, 20, 0);   // 5 de noviembre de 2026, 21:20 UTC
const iso = (t) => new Date(t).toISOString();

// Un archivo de estados armado a mano (lo que exportaría la consola) y su texto.
function fileOf(cartridges, extra = {}) {
  return JSON.stringify({ format: 'chip8-consola-estados', version: 1, exported: iso(DATE), cartridges, ...extra });
}
const cart = (states, more = {}) => ({ sha1: SHA, name: 'cuadro', origin: 'biblioteca', ...more, states });
const st = (slot, text = T1, date = iso(DATE)) => ({ slot, date, state: JSON.parse(text) });

describe('El archivo de estados: cómo se arma', () => {
  it('lleva el formato, la versión, la fecha y los cartuchos, con los campos en orden', () => {
    const text = F.statesFileText([
      { sha1: SHA, name: 'cuadro', origin: 'biblioteca', rom: b64(ROM), states: [{ id: 'rapido', date: DATE, text: T1, thumbnail: 'data:image/png;base64,AAAA' }, { id: '2', date: DATE + 1000, text: T2 }] },
      { sha1: 'a'.repeat(40), name: 'Rebote', origin: 'demo', rom: null, states: [{ id: '4', date: DATE, text: T2 }] },
    ], DATE + 5000);
    const j = JSON.parse(text);
    assert.deepEqual(Object.keys(j), ['format', 'version', 'exported', 'cartridges']);
    assert.equal(j.format, 'chip8-consola-estados');
    assert.equal(j.format, F.STATES_FILE_FORMAT);
    assert.equal(j.version, 1);
    assert.equal(j.exported, '2026-11-05T21:20:05.000Z');
    assert.deepEqual(Object.keys(j.cartridges[0]), ['sha1', 'name', 'origin', 'rom', 'states']);
    assert.deepEqual(Object.keys(j.cartridges[1]), ['sha1', 'name', 'origin', 'states'], 'sin ROM no hay campo rom');
    assert.deepEqual(j.cartridges[0].states.map((s) => s.slot), ['rapido', 2], 'la rápida como texto y las demás como número');
    assert.deepEqual(Object.keys(j.cartridges[0].states[0]), ['slot', 'date', 'thumbnail', 'state']);
    assert.deepEqual(Object.keys(j.cartridges[0].states[1]), ['slot', 'date', 'state'], 'sin pantallita no hay campo thumbnail');
    assert.equal(j.cartridges[0].states[1].date, '2026-11-05T21:20:01.000Z');
    // El estado va como objeto: el texto de Core.encodeState, sin escapar.
    assert.equal(JSON.stringify(j.cartridges[0].states[0].state), T1);
    assert.equal(j.cartridges[0].states[0].state.format, 'chip8-state');
    assert.ok(text.includes('\n  "cartridges": ['), 'el texto tiene sangría, para leerlo');
  });

  it('ida y vuelta: lo que se arma se lee igual (huella, nombre, ranuras, fechas, textos y ROM)', () => {
    const text = F.statesFileText([{ sha1: SHA, name: 'cuadro', origin: 'biblioteca', rom: b64(ROM), states: [
      { id: 'rapido', date: DATE, text: T1 }, { id: '1', date: DATE + 1, text: T2 }, { id: '4', date: DATE + 2, text: T1 }] }], DATE);
    const p = F.parseStatesFile(text, 'x.json');
    assert.equal(p.error, undefined);
    assert.equal(p.total, 3);
    assert.deepEqual(p.damaged, []);
    assert.equal(p.cartridges.length, 1);
    const c = p.cartridges[0];
    assert.equal(c.sha1, SHA);
    assert.equal(c.name, 'cuadro');
    assert.deepEqual(Array.from(c.rom), ROM);
    assert.equal(c.romError, null);
    assert.deepEqual(c.states.map((s) => [s.id, s.date, s.text]), [['rapido', DATE, T1], ['1', DATE + 1, T2], ['4', DATE + 2, T1]]);
  });

  it('ida y vuelta con estados de verdad: los demos de CHIP-8, uno de SUPER-CHIP en 128×64 y uno de XO-CHIP con la memoria llena', () => {
    const texts = loadDemos().map((d) => stateText(hexToBytes(d.hex), 120, d.platform || 'chip8'));
    const hi = new Core.Chip8({ platform: 'schip' });
    hi.loadRom([0x00, 0xFF, 0x12, 0x02]);   // HIGH y un salto a sí mismo
    hi.step();
    hi.display.fill(1, 0, 400);
    texts.push(Core.encodeState(hi.saveState()));
    const full = new Core.Chip8({ platform: 'xochip' });
    for (let i = 0; i < full.memory.length; i++) full.memory[i] = (i * 7 + 3) & 0xFF;
    texts.push(Core.encodeState(full.saveState()));
    const carts = texts.map((text, i) => ({ sha1: sha1([i, 1, 2]), name: 'c' + i, origin: 'desconocido', rom: null, states: [{ id: '1', date: DATE + i, text }] }));
    const p = F.parseStatesFile(F.statesFileText(carts, DATE), 'reales.json');
    assert.equal(p.total, texts.length);
    p.cartridges.forEach((c, i) => assert.equal(c.states[0].text, texts[i], 'el estado ' + i + ' vuelve idéntico'));
    assert.ok(texts[texts.length - 1].length > 80000, 'el de XO-CHIP sin ceros ocupa ' + texts[texts.length - 1].length);
  });

  it('los nombres de archivo: todos, los de un cartucho o uno solo, con la fecha y la hora', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    assert.equal(F.statesFileName(null, null, d), 'chip8-estados-20260102-030405.json');
    assert.equal(F.statesFileName('Contador.ch8', null, d), 'chip8-estados-contador-20260102-030405.json');
    assert.equal(F.statesFileName('Sub-Terr8nia', '2', d), 'chip8-estado-sub-terr8nia-ranura-2-20260102-030405.json');
    assert.equal(F.statesFileName('Ñandú en el área', 'rapido', new Date(2026, 10, 30, 23, 59, 58)), 'chip8-estado-nandu-en-el-area-rapido-20261130-235958.json');
    assert.equal(F.statesFileName('¡¡¡', null, d), 'chip8-estados-rom-20260102-030405.json', 'sin letras, «rom»');
  });
});

describe('Leer un archivo de estados: lo que no sirve', () => {
  const err = (text, name = 'e.json') => F.parseStatesFile(text, name).error;

  it('vacío o solo espacios', () => {
    assert.equal(err(''), '«e.json» está vacío: no trae estados.');
    assert.equal(err(' \n\t '), '«e.json» está vacío: no trae estados.');
  });

  it('texto que no es JSON (también uno cortado)', () => {
    for (const t of ['hola', '{ "format": "chip8-consola-estados", ', '\u0000ÿ', '{format:1}']) {
      assert.equal(err(t, 'roto.json'), '«roto.json» está dañado o no es un archivo de estados: no es JSON válido.', t);
    }
  });

  it('JSON que no es un objeto, o sin format', () => {
    for (const t of ['[]', '[1, 2]', '12', '"texto"', 'null', 'true', '{}', '{"version":1,"cartridges":[]}']) {
      assert.equal(err(t), '«e.json» no es un archivo de estados de esta consola.', t);
    }
  });

  it('un estado suelto (el texto de Core.encodeState) se reconoce y se explica', () => {
    assert.equal(err(T1, 'suelto.json'), '«suelto.json» es un estado suelto, sin su cartucho ni su ranura: para llevar estados a otro navegador, exportalos con «Exportar» (en «Estados» o en «Ver todos»).');
  });

  it('otro programa: otro format', () => {
    assert.equal(err('{"format":"otra-cosa","version":1}', 'o.json'), '«o.json» es de otro programa (formato "otra-cosa"): no son estados de esta consola.');
    assert.equal(err('{"format":12}'), '«e.json» es de otro programa (formato 12): no son estados de esta consola.');
    assert.equal(err('{"format":null}'), '«e.json» es de otro programa (formato null): no son estados de esta consola.');
    assert.equal(err('{"format":"' + 'x'.repeat(50) + '"}'), '«e.json» es de otro programa (formato "' + 'x'.repeat(30) + '…"): no son estados de esta consola.');
  });

  it('otra versión: una más nueva se explica; una que no es un entero positivo, dañada', () => {
    assert.equal(err(fileOf([], { version: 2 }), 'n.json'), '«n.json» es de una versión más nueva de la consola (la 2; esta lee la 1): importalo con un chip8.html más nuevo.');
    assert.equal(err(fileOf([], { version: 17 })), '«e.json» es de una versión más nueva de la consola (la 17; esta lee la 1): importalo con un chip8.html más nuevo.');
    for (const [v, shown] of [['1', '"1"'], [0, '0'], [1.5, '1.5'], [null, 'null'], [-1, '-1'], [[1], 'una lista']]) {
      assert.equal(err(fileOf([], { version: v })), '«e.json» está dañado: la versión ' + shown + ' no es válida.', JSON.stringify(v));
    }
    assert.equal(err('{"format":"chip8-consola-estados","cartridges":[]}'), '«e.json» está dañado: la versión nada no es válida.');
  });

  it('sin la lista de cartuchos, o con una lista vacía', () => {
    assert.equal(err(fileOf(undefined)), '«e.json» está dañado: no trae la lista de cartuchos.');
    assert.equal(err(fileOf({})), '«e.json» está dañado: no trae la lista de cartuchos.');
    assert.equal(err(fileOf([])), '«e.json» no trae ningún estado.');
    assert.equal(err(fileOf([cart([])])), '«e.json» no trae ningún estado.');
  });

  it('todo dañado: el motivo del primero (con el cartucho y la ranura) y cuántos son', () => {
    const noPc = (text) => { const o = JSON.parse(text); delete o.pc; return o; };
    assert.equal(err(fileOf([cart([{ slot: 1, date: iso(DATE), state: noPc(T1) }])])),
      '«e.json» está dañado: su estado no se puede leer («cuadro», ranura 1: Estado inválido: falta el campo pc).');
    assert.equal(err(fileOf([cart([{ slot: 'rapido', date: iso(DATE), state: noPc(T1) }, { slot: 9, date: iso(DATE), state: JSON.parse(T1) }])])),
      '«e.json» está dañado: ninguno de sus 2 estados se puede leer («cuadro», ranura rápida: Estado inválido: falta el campo pc).');
  });
});

describe('Leer un archivo de estados: lo dañado, estado por estado', () => {
  it('cada estado que no sirve dice por qué, y los buenos se importan igual', () => {
    const bad = JSON.parse(T1);
    bad.memory = 'AQI=';   // dos bytes (1 y 2): la memoria descomprimida no llega a 4096
    const p = F.parseStatesFile(fileOf([cart([
      st(1),
      { slot: 7, date: iso(DATE), state: JSON.parse(T1) },
      { slot: 'rapidito', date: iso(DATE), state: JSON.parse(T1) },
      { slot: 2, date: 'ayer', state: JSON.parse(T1) },
      { slot: 2, date: '2026-13-45T99:00:00Z', state: JSON.parse(T1) },
      { slot: 3, date: iso(DATE) },
      { slot: 3, date: iso(DATE), state: [1, 2] },
      { slot: 4, date: iso(DATE), state: bad },
      'texto',
      null,
      st('rapido', T2),
    ])]), 'm.json');
    assert.equal(p.total, 2);
    assert.deepEqual(p.cartridges[0].states.map((s) => s.id), ['1', 'rapido']);
    assert.deepEqual(p.damaged, [
      '«cuadro»: la ranura 7 no existe (tiene que ser "rapido" o de 1 a 4)',
      '«cuadro»: la ranura "rapidito" no existe (tiene que ser "rapido" o de 1 a 4)',
      '«cuadro», ranura 2: la fecha "ayer" no es válida',
      '«cuadro», ranura 2: la fecha "2026-13-45T99:00:00Z" no es válida',
      '«cuadro», ranura 3: no trae el estado',
      '«cuadro», ranura 3: no trae el estado',
      '«cuadro», ranura 4: Estado inválido: memory descomprimida tiene 2 bytes y tiene que tener 4096',
      '«cuadro»: un estado no es un objeto',
      '«cuadro»: un estado no es un objeto',
    ]);
  });

  it('un estado demasiado grande para guardarlo no entra', () => {
    // La pantalla de 128×64 con píxeles sueltos y la memoria sin rachas: más que STATE_TEXT_MAX no se puede,
    // así que se prueba con un tope más chico.
    const small = load();
    const big = stateText(ROM, 1);
    const f = new Function('Core', 'window', 'demos', 'library', 'stateStore', 'archiveLookup', 'archiveRomBytes',
      SOURCE.replace(uiVar('STATE_TEXT_MAX'), 'var STATE_TEXT_MAX = 100;'))(Core, { atob, btoa }, [], { items: [] }, { roms: {} }, () => null);
    assert.equal(small.fileState(st(1, big)).text, big);
    assert.deepEqual(f.fileState(st(1, big)), { id: '1', error: 'el estado ocupa ' + big.length + ' caracteres y el máximo es 100' });
  });

  it('una huella SHA-1 que no sirve deja afuera los estados de ese cartucho; un cartucho que no es un objeto, también', () => {
    const p = F.parseStatesFile(fileOf([
      cart([st(1), st(2)], { sha1: 'zz' }),
      cart([st(1)], { sha1: undefined, name: '' }),
      'basura',
      { name: 'sin estados', sha1: SHA },
      cart([st(3)]),
    ]), 'h.json');
    assert.equal(p.total, 1);
    assert.deepEqual(p.damaged, [
      '«cuadro»: su huella SHA-1 ("zz") no es válida',
      '«cuadro»: su huella SHA-1 ("zz") no es válida',
      'el cartucho 2: su huella SHA-1 (nada) no es válida',
      'el cartucho 3: no es un objeto',
      '«sin estados»: no trae la lista de estados',
    ]);
  });

  it('la huella se acepta en mayúsculas (queda en minúsculas) y un nombre vacío queda «ROM sin nombre»', () => {
    const p = F.parseStatesFile(fileOf([cart([st(1)], { sha1: SHA.toUpperCase(), name: '  ' })]), 'x');
    assert.equal(p.cartridges[0].sha1, SHA);
    assert.equal(p.cartridges[0].name, 'ROM sin nombre');
    const q = F.parseStatesFile(fileOf([cart([st(1)], { name: '  mi\tjuego  \n favorito ' })]), 'x');
    assert.equal(q.cartridges[0].name, 'mi juego favorito');
  });

  it('las ranuras: "rapido", "rápido", de 1 a 4 como número o como texto', () => {
    const p = F.parseStatesFile(fileOf([cart([st('rápido'), st(1), st('2'), st(3), st('4')])]), 'x');
    assert.deepEqual(p.cartridges[0].states.map((s) => s.id), ['rapido', '1', '2', '3', '4']);
    for (const bad of [0, 5, '5', 1.5, '01', ' 1', true, null, undefined, 'Rapido']) {
      const r = F.fileState({ slot: bad, date: iso(DATE), state: JSON.parse(T1) });
      assert.ok(r.error && /^la ranura .* no existe/.test(r.error), JSON.stringify(bad) + ': ' + JSON.stringify(r));
    }
  });

  it('las fechas: ISO 8601 o milisegundos; nada antes de 1970 ni después del año 9999', () => {
    assert.equal(F.fileDate('2026-11-05T21:20:00.000Z'), DATE);
    assert.equal(F.fileDate('2026-11-05T18:20:00-03:00'), DATE);
    assert.equal(F.fileDate(DATE), DATE);
    for (const bad of ['2026-11-05', 'ayer', '', 0, -5, NaN, Infinity, null, undefined, {}, '9999-12-31T23:59:59.999Z'.replace('9999', '+10000'), 253402300800000]) {
      assert.equal(F.fileDate(bad), 0, JSON.stringify(bad));
    }
    assert.equal(F.fileDate('9999-12-31T23:59:59.000Z'), 253402300799000);
  });

  it('el estado también puede venir como texto, y entra codificado como lo haría esta consola', () => {
    const shuffled = JSON.parse(T2);
    const reordered = {};
    Object.keys(shuffled).reverse().forEach((k) => { reordered[k] = shuffled[k]; });
    reordered.extra = 'campo de más';
    const p = F.parseStatesFile(fileOf([cart([{ slot: 1, date: iso(DATE), state: T1 }, { slot: 2, date: iso(DATE), state: reordered }])]), 'x');
    assert.equal(p.cartridges[0].states[0].text, T1);
    assert.equal(p.cartridges[0].states[1].text, T2, 'con los campos en el orden de encodeState y sin el de más');
  });

  it('un cartucho repetido se junta; dos estados para la misma ranura: queda el más nuevo', () => {
    const p = F.parseStatesFile(fileOf([
      cart([st(1, T1, iso(DATE)), st(1, T2, iso(DATE + 5000))]),
      cart([st(2, T1), st(1, T1, iso(DATE + 1000))], { name: 'otro nombre' }),
    ]), 'x');
    assert.equal(p.cartridges.length, 1);
    assert.equal(p.cartridges[0].name, 'cuadro', 'el nombre del primero');
    assert.equal(p.total, 2);
    assert.deepEqual(p.cartridges[0].states.map((s) => [s.id, s.text === T2 ? 'T2' : 'T1', s.date]), [['1', 'T2', DATE + 5000], ['2', 'T1', DATE]]);
  });

  it('la ROM: buena, de otro cartucho (huella distinta), rota o fuera de tamaño', () => {
    assert.deepEqual(Array.from(F.fileRom(b64(ROM), SHA).bytes), ROM);
    assert.deepEqual(F.fileRom(b64([1, 2, 3]), SHA), { error: 'la ROM que trae está dañada (su huella no es la del cartucho)' });
    for (const bad of ['', 'no es base64!', 'AAA', 'A A=', 12, {}, [1, 2], b64(new Uint8Array(65025))]) {
      assert.deepEqual(F.fileRom(bad, SHA), { error: 'la ROM que trae no es válida' }, JSON.stringify(bad).slice(0, 40));
    }
    const full = new Uint8Array(65024).fill(0x12);
    assert.equal(F.fileRom(b64(full), sha1(full)).bytes.length, 65024, 'la más grande que entra en XO-CHIP');
    const p = F.parseStatesFile(fileOf([cart([st(1)], { rom: b64([9, 9]) })]), 'x');
    assert.equal(p.total, 1, 'con la ROM dañada, los estados entran igual');
    assert.equal(p.cartridges[0].rom, null);
    assert.equal(p.cartridges[0].romError, 'la ROM que trae está dañada (su huella no es la del cartucho)');
    const q = F.parseStatesFile(fileOf([cart([st(1)], { rom: null }), cart([st(2)], { rom: b64(ROM) })]), 'x');
    assert.deepEqual(Array.from(q.cartridges[0].rom), ROM, 'la ROM de la segunda aparición del cartucho');
  });

  it('fileValue muestra cualquier valor corto', () => {
    assert.equal(F.fileValue('a'), '"a"');
    assert.equal(F.fileValue('x'.repeat(31)), '"' + 'x'.repeat(30) + '…"');
    assert.equal(F.fileValue(3), '3');
    assert.equal(F.fileValue(false), 'false');
    assert.equal(F.fileValue(null), 'null');
    assert.equal(F.fileValue(undefined), 'nada');
    assert.equal(F.fileValue([]), 'una lista');
    assert.equal(F.fileValue({ a: 1 }), 'un objeto');
  });
});

describe('Importar: qué pasa con cada ranura y qué se avisa', () => {
  it('cada estado va a una ranura vacía, ya está igual o pisaría otro', () => {
    const store = { version: 1, roms: { [SHA]: { name: 'cuadro', slots: { '1': { date: 1, text: T1 }, '2': { date: 2, text: T1 } } } } };
    const p = F.parseStatesFile(fileOf([cart([st(1, T1), st(2, T2), st(3, T2)])]), 'x');
    const items = F.planStatesImport(p, store);
    assert.deepEqual(items.map((i) => [i.id, i.kind]), [['1', 'igual'], ['2', 'ocupada'], ['3', 'nueva']]);
    assert.equal(items[1].have, store.roms[SHA].slots['2']);
    assert.deepEqual(items[2].entry, { date: DATE, text: T2 });
    assert.equal(items[0].sha1, SHA);
    assert.equal(items[0].name, 'cuadro');
    const other = F.planStatesImport(p, { version: 1, roms: {} });
    assert.ok(other.every((i) => i.kind === 'nueva' && i.have === null));
  });

  const base = { imported: 0, carts: [], same: 0, kept: 0, damaged: [], roms: [], romErrors: [], storage: 'ok' };
  const sum = (r) => F.importSummary({ ...base, ...r });

  it('el resumen: lo importado, lo que ya estaba y lo que quedó como estaba', () => {
    assert.deepEqual(sum({ imported: 1, carts: ['cuadro'] }), { text: 'Importé 1 estado de «cuadro».', kind: 'info' });
    assert.equal(sum({ imported: 3, carts: ['cuadro'] }).text, 'Importé 3 estados de «cuadro».');
    assert.equal(sum({ imported: 7, carts: ['a', 'b', 'c'] }).text, 'Importé 7 estados de 3 cartuchos.');
    assert.equal(sum({ imported: 2, carts: ['a'], same: 1, kept: 1 }).text, 'Importé 2 estados de «a». Otro ya estaba guardado. En una ranura ocupada dejé el tuyo.');
    assert.equal(sum({ imported: 2, carts: ['a'], same: 3, kept: 2 }).text, 'Importé 2 estados de «a». Otros 3 ya estaban guardados. En 2 ranuras ocupadas dejé los tuyos.');
    assert.equal(sum({}).text, 'No importé ningún estado.');
    assert.equal(sum({ same: 1 }).text, 'No importé ningún estado: ya estaba guardado.');
    assert.equal(sum({ same: 3 }).text, 'No importé ningún estado: los 3 ya estaban guardados.');
    assert.equal(sum({ kept: 1 }).text, 'No importé ningún estado: en la ranura ocupada dejé el tuyo.');
    assert.equal(sum({ kept: 2, same: 1 }).text, 'No importé ningún estado: ya estaba guardado y en las 2 ranuras ocupadas dejé los tuyos.');
  });

  it('el resumen: las ROMs, lo dañado y el almacenamiento (con eso, el aviso es de error)', () => {
    assert.deepEqual(sum({ imported: 1, carts: ['c'], roms: ['c'] }), { text: 'Importé 1 estado de «c». «c» entró a «Tus cartuchos».', kind: 'info' });
    assert.equal(sum({ imported: 2, carts: ['a', 'b'], roms: ['a', 'b'] }).text, 'Importé 2 estados de 2 cartuchos. Entraron 2 cartuchos a «Tus cartuchos».');
    assert.deepEqual(sum({ imported: 1, carts: ['c'], romErrors: [{ name: 'c', error: 'la ROM que trae no es válida' }] }),
      { text: 'Importé 1 estado de «c». No agregué la ROM de «c» a «Tus cartuchos»: la ROM que trae no es válida.', kind: 'error' });
    assert.deepEqual(sum({ imported: 1, carts: ['c'], damaged: ['«c», ranura 2: la fecha "x" no es válida'] }),
      { text: 'Importé 1 estado de «c». Un estado no se pudo leer («c», ranura 2: la fecha "x" no es válida).', kind: 'error' });
    assert.equal(sum({ imported: 1, carts: ['c'], damaged: ['uno', 'dos'] }).text, 'Importé 1 estado de «c». 2 estados no se pudieron leer (uno).');
    assert.deepEqual(sum({ imported: 1, carts: ['c'], storage: 'memoria' }),
      { text: 'Importé 1 estado de «c». Este navegador no deja guardar datos: los estados duran hasta que cierres la página.', kind: 'info' });
    assert.equal(sum({ imported: 1, carts: ['c'], storage: 'lleno' }).kind, 'error');
    assert.ok(sum({ imported: 1, carts: ['c'], storage: 'lleno' }).text.endsWith('No hay más lugar en este navegador: lo importado queda solo hasta que cierres la página. Para hacer lugar, borrá estados viejos o cartuchos de «Tus cartuchos».'));
    assert.deepEqual(sum({ imported: 1, carts: ['c'], storage: 'error' }),
      { text: 'Importé 1 estado de «c». No se pudo guardar en este navegador: lo importado queda solo hasta que cierres la página.', kind: 'error' });
  });
});

describe('Las pantallitas giradas', () => {
  // La referencia: el píxel del núcleo que se ve en (x, y) de la imagen girada (sentido horario), escrita aparte.
  function reference(x, y, w, h, deg) {
    if (deg === 90) return [y, h - 1 - x];
    if (deg === 180) return [w - 1 - x, h - 1 - y];
    if (deg === 270) return [w - 1 - y, x];
    return [x, y];
  }

  it('rotatedIndex gira como la pantalla y la captura, en 64×32 y en 128×64', () => {
    for (const [w, h] of [[64, 32], [128, 64], [5, 3]]) {
      for (const deg of [0, 90, 180, 270]) {
        const side = deg === 90 || deg === 270, ow = side ? h : w, oh = side ? w : h;
        const seen = new Set();
        for (let y = 0; y < oh; y++) {
          for (let x = 0; x < ow; x++) {
            const [sx, sy] = reference(x, y, w, h, deg);
            const i = F.rotatedIndex(x, y, w, h, deg);
            assert.equal(i, sy * w + sx, `${w}×${h} a ${deg}°: (${x}, ${y})`);
            seen.add(i);
          }
        }
        assert.equal(seen.size, w * h, 'cada píxel aparece una vez');
      }
    }
  });

  it('a 90° la esquina de arriba a la izquierda de la pantalla queda arriba a la derecha', () => {
    // display 3×2: [a b c / d e f] -> girado 90° en sentido horario: [d a / e b / f c].
    const order = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) order.push('abcdef'[F.rotatedIndex(x, y, 3, 2, 90)]);
    assert.equal(order.join(''), 'daebfc');
    const o270 = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) o270.push('abcdef'[F.rotatedIndex(x, y, 3, 2, 270)]);
    assert.equal(o270.join(''), 'cfbead');
  });

  it('screenImage: el tamaño girado, la escala y el color de cada valor (0 a 3)', () => {
    const w = 64, h = 32, display = new Uint8Array(w * h);
    display[0] = 1;            // arriba a la izquierda: plano 1
    display[w - 1] = 2;        // arriba a la derecha: plano 2
    display[w * h - 1] = 3;    // abajo a la derecha: los dos
    const colors = [10, 11, 12, 13];
    const flat = F.screenImage(display, w, h, 0, colors, 2);
    assert.deepEqual([flat.width, flat.height], [128, 64]);
    assert.deepEqual([flat.pixels[0], flat.pixels[1], flat.pixels[128], flat.pixels[129], flat.pixels[2]], [11, 11, 11, 11, 10]);
    assert.equal(flat.pixels[127], 12);
    assert.equal(flat.pixels[128 * 64 - 1], 13);
    const r90 = F.screenImage(display, w, h, 90, colors, 1);
    assert.deepEqual([r90.width, r90.height], [32, 64]);
    assert.equal(r90.pixels[31], 11, 'el de arriba a la izquierda queda arriba a la derecha');
    assert.equal(r90.pixels[32 * 63 + 31], 12, 'el de arriba a la derecha queda abajo a la derecha');
    assert.equal(r90.pixels[32 * 63], 13, 'el de abajo a la derecha queda abajo a la izquierda');
    const r270 = F.screenImage(display, w, h, 270, colors);
    assert.deepEqual([r270.width, r270.height], [32, 64]);
    assert.equal(r270.pixels[32 * 63], 11, 'a 270°, el de arriba a la izquierda queda abajo a la izquierda');
    const r180 = F.screenImage(display, w, h, 180, colors);
    assert.equal(r180.pixels[w * h - 1], 11);
    assert.equal(r180.pixels[0], 13);
    const counts = [0, 0, 0, 0];
    for (const p of F.screenImage(display, w, h, 90, colors, 3).pixels) counts[p - 10]++;
    assert.deepEqual(counts, [(w * h - 3) * 9, 9, 9, 9], 'a escala 3, cada píxel es un cuadrado de 3×3');
  });
});

describe('Distinguir un archivo de estados de una ROM', () => {
  const bytes = (s) => Uint8Array.from(Buffer.from(s, 'utf8'));
  it('un archivo de estados empieza con «{» (después de la marca BOM o de espacios)', () => {
    assert.equal(F.looksLikeJson(bytes('{"format"')), true);
    assert.equal(F.looksLikeJson(bytes('\n\t  {')), true);
    assert.equal(F.looksLikeJson(Uint8Array.from([0xEF, 0xBB, 0xBF, 0x7B])), true);
    assert.equal(F.looksLikeJson(Uint8Array.from([0xEF, 0xBB, 0xBF, 0x20, 0x0D, 0x0A, 0x7B])), true);
  });
  it('una ROM no (aunque una ROM que empieza con 0x7B pasa este primer filtro: después decide el JSON)', () => {
    assert.equal(F.looksLikeJson(Uint8Array.from(ROM)), false);
    assert.equal(F.looksLikeJson(new Uint8Array(0)), false);
    assert.equal(F.looksLikeJson(bytes('   ')), false);
    assert.equal(F.looksLikeJson(bytes('[1]')), false);
    assert.equal(F.looksLikeJson(Uint8Array.from([0xEF, 0xBB, 0x7B])), false, 'una marca BOM incompleta no se saltea');
    assert.equal(F.looksLikeJson(Uint8Array.from([0x7B, 0x01, 0x12, 0x00])), true);
    assert.equal(F.parseStatesFile(Buffer.from([0x7B, 0x01, 0x12, 0x00]).toString('latin1'), 'r').error, '«r» está dañado o no es un archivo de estados: no es JSON válido.');
  });
});

describe('findCartridge, de dónde es y cómo se llama un cartucho', () => {
  const demos = loadDemos().map((d) => {
    const bytes = hexToBytes(d.hex);
    return { id: d.id, name: d.name, bytes, sha1: Core.sha1(bytes) };
  });
  const OTHER = Array.from(assemble('fin: JP fin').bytes), OTHER_SHA = sha1(OTHER);
  const libItem = (bytes, extra = {}) => ({ sha1: sha1(bytes), name: 'mío', size: bytes.length, added: 1, played: 1, data: b64(bytes), ...extra });
  const entry = { title: 'Juego del archivo', id: 'juego' };

  it('un demo: sus bytes, su nombre y su id', async () => {
    const f = load({ demos });
    const d = demos[0];
    const c = await f.findCartridge(d.sha1);
    assert.equal(c.source, 'demo');
    assert.equal(c.name, d.name);
    assert.equal(c.demoId, d.id);
    assert.equal(c.bytes, d.bytes);
    assert.equal(f.cartridgeOrigin(d.sha1), 'demo');
    assert.equal(f.cartridgeName(d.sha1), d.name);
  });

  it('uno de «Tus cartuchos»: los bytes decodificados (con la huella comprobada) y el cartucho de la biblioteca', async () => {
    const item = libItem(ROM);
    const f = load({ demos, library: { items: [libItem(OTHER), item] } });
    const c = await f.findCartridge(SHA);
    assert.equal(c.source, 'biblioteca');
    assert.equal(c.item, item);
    assert.deepEqual(Array.from(c.bytes), ROM);
    assert.equal(f.cartridgeOrigin(SHA), 'biblioteca');
    assert.equal(f.cartridgeName(SHA), 'mío');
  });

  it('uno de «Tus cartuchos» dañado (otros bytes, otro tamaño o base64 roto) no se encuentra', async () => {
    for (const bad of [libItem(ROM, { data: b64(OTHER), size: OTHER.length }), libItem(ROM, { size: ROM.length + 1 }), libItem(ROM, { data: '%%%%' })]) {
      const f = load({ library: { items: [bad] } });
      assert.equal(await f.findCartridge(SHA), null, JSON.stringify(bad).slice(0, 80));
    }
  });

  it('un juego del archivo de Octo: sin archiveRomBytes no se puede cargar; con él, sí (si los bytes son los suyos)', async () => {
    const lookup = (s) => (s === SHA ? entry : null);
    const without = load({ archiveLookup: lookup });
    assert.equal(await without.findCartridge(SHA), null);
    assert.equal(without.cartridgeOrigin(SHA), 'archivo');
    assert.equal(without.cartridgeName(SHA), 'Juego del archivo');
    const asked = [];
    const withBytes = load({ archiveLookup: lookup, archiveRomBytes: (s) => { asked.push(s); return Promise.resolve(Uint8Array.from(ROM)); } });
    const c = await withBytes.findCartridge(SHA);
    assert.deepEqual([c.source, c.name, Array.from(c.bytes)], ['archivo', 'Juego del archivo', ROM]);
    assert.deepEqual(asked, [SHA]);
    assert.equal(await withBytes.findCartridge(OTHER_SHA), null, 'no le pregunta por lo que no es del archivo');
    assert.deepEqual(asked, [SHA]);
    const sync = load({ archiveLookup: lookup, archiveRomBytes: () => Uint8Array.from(ROM) });
    assert.equal((await sync.findCartridge(SHA)).source, 'archivo', 'también si devuelve los bytes sin promesa');
    for (const wrong of [() => Promise.resolve(Uint8Array.from(OTHER)), () => Promise.resolve(null), () => Promise.resolve(new Uint8Array(0)), () => Promise.reject(new Error('no'))]) {
      assert.equal(await load({ archiveLookup: lookup, archiveRomBytes: wrong }).findCartridge(SHA), null);
    }
  });

  it('los demos y «Tus cartuchos» van antes que el archivo de Octo', async () => {
    const d = demos[1];
    const f = load({ demos, library: { items: [libItem(ROM)] }, archiveLookup: () => entry, archiveRomBytes: () => Promise.resolve(Uint8Array.from(OTHER)) });
    assert.equal((await f.findCartridge(d.sha1)).source, 'demo');
    assert.equal((await f.findCartridge(SHA)).source, 'biblioteca');
    assert.equal(f.cartridgeOrigin(SHA), 'archivo', 'de dónde es: del archivo, aunque esté también en «Tus cartuchos»');
    assert.equal(f.cartridgeName(d.sha1), d.name);
  });

  it('uno desconocido: null, «desconocido» y el nombre con que se guardó, sin la extensión', async () => {
    const f = load({ stateStore: { version: 1, roms: { [OTHER_SHA]: { name: 'misterio.ch8', slots: {} } } } });
    assert.equal(await f.findCartridge(OTHER_SHA), null);
    assert.equal(f.cartridgeOrigin(OTHER_SHA), 'desconocido');
    assert.equal(f.cartridgeName(OTHER_SHA), 'misterio');
    assert.equal(f.cartridgeName('b'.repeat(40)), 'ROM sin nombre');
  });
});
