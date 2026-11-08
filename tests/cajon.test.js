'use strict';
// El cajón de opciones, el frente de la consola y el monitor: lo que se puede probar sin navegador. El ajuste
// drawerTab y su validación en loadSettings (y monitorOpen), la caja del cajón (drawerBox) al costado de la
// consola (con una columna o en el lugar libre) y desde abajo, de qué lado sale (drawerSide), cuánto se achica la
// consola para entrar en la ventana (consoleFitZoom), las flechas en una fila de pestañas (tabStep), la clave de
// las miniaturas (thumbKey) y el contrato del marcado: las tres pestañas con sus paneles, las secciones de
// «Ajustes» con cada control de antes, la pestaña «Cartuchos», el frente de la consola sin la ranura y los
// botones de la barra de arriba. Cómo se ve y cómo se usa lo prueban los escenarios E2E 78 a 86.
//
// La interfaz es un solo IIFE que necesita el DOM, así que esta prueba no la corre entera: evalúa las
// secciones que no tocan el DOM al definirse («constantes», «utilidades», «validación de lo guardado»,
// «ajustes guardados», «cajón de opciones», «la consola en la ventana» y «miniaturas de cartuchos»), sacadas
// tal cual de chip8.html (como estados-archivos.test.js), con el almacenamiento de mentira: storageRead devuelve
// lo que se le pase.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractScript, loadCore, readHtml } = require('./harness');

const Core = loadCore();
const HTML = readHtml();
const UI = extractScript('chip8-ui').code;
const MARK = '  // ------------------------------------------------------------------ ';

// Una sección de la interfaz: desde su encabezado hasta el de la siguiente.
function uiSection(name) {
  const start = UI.indexOf(MARK + name + '\n');
  assert.ok(start >= 0, 'chip8-ui no tiene la sección «' + name + '»');
  return UI.slice(start, UI.indexOf('\n' + MARK, start + MARK.length));
}

// Las secciones evaluadas con un localStorage de mentira (raw: lo que hay guardado en 'chip8-consola.ajustes').
// Devuelve los ajustes que quedaron y las funciones y constantes que se prueban.
function load(raw) {
  const source = ['"use strict";',
    'function storageRead(key) { return key === STORAGE_KEY ? __raw : null; }',
    'function storageWrite() { return true; }   // saveSettings no se llama al cargar',
    uiSection('constantes'), uiSection('utilidades'), uiSection('validación de lo guardado'), uiSection('ajustes guardados'),
    uiSection('cajón de opciones'), uiSection('la consola en la ventana'), uiSection('miniaturas de cartuchos'),
    'return { settings: settings, loadSettings: loadSettings, drawerBox: drawerBox, drawerSide: drawerSide, tabStep: tabStep,',
    '  consoleFitZoom: consoleFitZoom, thumbKey: thumbKey, THUMB_FRAMES: THUMB_FRAMES, DRAWER_TABS: DRAWER_TABS,',
    '  DRAWER_SECTIONS: DRAWER_SECTIONS, DRAWER_TUCK: DRAWER_TUCK, DRAWER_MIN_H: DRAWER_MIN_H, DRAWER_SIDE_MIN: DRAWER_SIDE_MIN,',
    '  DRAWER_SIDE_MAX: DRAWER_SIDE_MAX, CONSOLE_FIT_MEDIA: CONSOLE_FIT_MEDIA, CONSOLE_Z_MIN: CONSOLE_Z_MIN, STORAGE_KEY: STORAGE_KEY,',
    '  drawer: drawer, consoleZoom: consoleZoom, zoomOk: zoomOk };',
  ].join('\n');
  return new Function('Core', '__raw', 'window', 'document', source)(Core, raw === undefined ? null : raw, {}, {});
}
const F = load();

describe('Los ajustes del cajón y del monitor (loadSettings)', () => {
  it('de fábrica: la pestaña Cartuchos y el monitor a la vista', () => {
    assert.equal(F.settings.drawerTab, 'cartuchos');
    assert.equal(F.settings.monitorOpen, true);
    assert.equal(F.drawer.tab, 'cartuchos', 'el cajón arranca en la pestaña de los ajustes');
    assert.equal(F.drawer.open, false, 'y guardado');
    assert.ok(!('keypadFolded' in F.settings), 'el keypad ya no se pliega: no queda el ajuste');
  });

  it('se recuerdan las tres pestañas y el monitor oculto', () => {
    for (const tab of F.DRAWER_TABS) assert.equal(load({ drawerTab: tab }).settings.drawerTab, tab);
    assert.equal(load({ monitorOpen: false }).settings.monitorOpen, false);
    const both = load({ drawerTab: 'estados', monitorOpen: false });
    assert.equal(both.settings.drawerTab, 'estados');
    assert.equal(both.settings.monitorOpen, false);
    assert.equal(both.drawer.tab, 'estados');
  });

  it('lo que no vale vuelve al de fábrica, campo por campo (también las pestañas de la primera vuelta)', () => {
    const bad = [
      ['drawerTab', 'Cartuchos'], ['drawerTab', 'velocidad'], ['drawerTab', 'pantalla'], ['drawerTab', 'compatibilidad'],
      ['drawerTab', 'controles'], ['drawerTab', 'monitor'], ['drawerTab', 'codigo'], ['drawerTab', ''], ['drawerTab', 0],
      ['drawerTab', null], ['drawerTab', ['ajustes']], ['drawerTab', { tab: 'estados' }], ['drawerTab', true],
      ['monitorOpen', 'false'], ['monitorOpen', 0], ['monitorOpen', null], ['monitorOpen', {}],
    ];
    for (const [key, value] of bad) {
      const s = load({ [key]: value }).settings;
      assert.equal(s[key], key === 'drawerTab' ? 'cartuchos' : true, key + ' = ' + JSON.stringify(value));
    }
  });

  it('lo guardado por la primera vuelta (keypadFolded) se ignora y no se lleva puestos a los demás', () => {
    const s = load({ drawerTab: 'controles', keypadFolded: true, ipf: 500, palette: 'ambar', monitorTab: 'traza', rewind: false }).settings;
    assert.equal(s.ipf, 500);
    assert.equal(s.palette, 'ambar');
    assert.equal(s.monitorTab, 'traza');
    assert.equal(s.rewind, false);
    assert.equal(s.drawerTab, 'cartuchos', 'la primera vez (con una pestaña que ya no está), en Cartuchos');
    assert.ok(!('keypadFolded' in s));
    // Lo que guardaba la cuarta ronda (sin drawerTab).
    const old = load({ ipf: 30, quirks: { vfReset: false }, platform: 'schip', scanlines: false }).settings;
    assert.equal(old.ipf, 30);
    assert.equal(old.platform, 'schip');
    assert.equal(old.scanlines, false);
    assert.equal(old.drawerTab, 'cartuchos');
  });

  it('lo guardado que no es un objeto no rompe nada', () => {
    for (const raw of [null, 'ajustes', 42, true, []]) {
      const s = load(raw).settings;
      assert.equal(s.drawerTab, 'cartuchos', JSON.stringify(raw));
      assert.equal(s.monitorOpen, true, JSON.stringify(raw));
    }
  });
});

describe('Las flechas en una fila de pestañas (tabStep)', () => {
  it('derecha e izquierda dan la vuelta; Inicio y Fin van a las puntas', () => {
    const n = F.DRAWER_TABS.length;
    assert.equal(F.tabStep('ArrowRight', 0, n), 1);
    assert.equal(F.tabStep('ArrowRight', n - 1, n), 0);
    assert.equal(F.tabStep('ArrowLeft', 0, n), n - 1);
    assert.equal(F.tabStep('ArrowLeft', 2, n), 1);
    assert.equal(F.tabStep('Home', 2, n), 0);
    assert.equal(F.tabStep('End', 0, n), n - 1);
  });

  it('las demás teclas no son de la fila (también arriba y abajo: las pestañas van en horizontal)', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a', 'Escape', 'PageDown']) assert.equal(F.tabStep(key, 1, 3), -1, key);
  });
});

describe('Dónde va el cajón (drawerBox y drawerSide)', () => {
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  // Las medidas de una ventana de 1920 × 945: la consola achicada a 0,946 (757 × 896 px, con esquinas de 28 y
  // 34 px que quedan de 26,5 y 32,2) y el monitor, de 420 px, a 28 px de la consola.
  const z = 0.946, radius = { top: 28 * z, bottom: 34 * z };
  const con = rect(358, 28, 757, 896), monitor = rect(1143, 28, 420, 895), bezel = rect(382, 154, 708, 391);

  it('al costado del monitor: del borde de la consola al del monitor, a lo largo de la parte recta de la consola', () => {
    const b = F.drawerBox('costado', con, monitor, bezel, 1920, 945, radius);
    assert.equal(b.x, 1115 - F.DRAWER_TUCK, 'empieza abajo del borde derecho de la consola');
    assert.equal(b.x + b.w, 1563, 'termina en el borde derecho del monitor');
    assert.equal(b.y, 54, 'arriba, donde termina la esquina redondeada de la consola (28 + 26,5)');
    assert.equal(b.y + b.h, 892, 'abajo, donde empieza la otra esquina (924 − 32,2)');
    assert.ok(b.x >= bezel.right, 'nunca tapa la pantalla');
  });

  it('sus esquinas quedan detrás del borde recto de la consola, también con la consola a tamaño natural', () => {
    for (const [c, r] of [[con, radius], [rect(336, 28, 800, 940), { top: 28, bottom: 34 }]]) {
      const b = F.drawerBox('costado', c, monitor, bezel, 1920, 1000, r);
      assert.ok(b.y >= c.top + r.top - 0.5, 'arriba: ' + b.y);
      assert.ok(b.y + b.h <= c.bottom - r.bottom + 0.5, 'abajo: ' + (b.y + b.h));
    }
  });

  it('sin columna (el monitor oculto), en el lugar libre: como mucho DRAWER_SIDE_MAX px y 16 px antes del borde', () => {
    const centered = rect(582, 28, 757, 896);
    const wide = F.drawerBox('costado', centered, null, bezel, 1920, 945, radius);
    assert.equal(wide.x, 1339 - F.DRAWER_TUCK);
    assert.equal(wide.w, F.DRAWER_SIDE_MAX);
    const c1440 = rect(361, 28, 718, 850);
    const narrow = F.drawerBox('costado', c1440, null, rect(384, 147, 672, 371), 1440, 900, { top: 28 * 0.898, bottom: 34 * 0.898 });
    assert.equal(narrow.x + narrow.w, 1440 - 16, 'llega hasta 16 px antes del borde de la ventana');
    assert.equal(narrow.w, 1424 - 1077);
  });

  it('sale al costado con una columna, o sin columna si quedan DRAWER_SIDE_MIN px; si no, desde abajo', () => {
    assert.equal(F.drawerSide(con, monitor, 1920), 'costado');
    assert.equal(F.drawerSide(rect(582, 28, 757, 896), null, 1920), 'costado');
    assert.equal(F.drawerSide(rect(361, 28, 718, 850), null, 1440), 'costado', '1440 − 16 − 1077 = 347 px');
    assert.equal(F.drawerSide(rect(323, 28, 634, 751), null, 1280), 'abajo', '1280 − 16 − 955 = 309 px');
    assert.equal(F.drawerSide(rect(16, 28, 736, 915), null, 768), 'abajo', 'una tableta');
    assert.equal(F.drawerSide(rect(16, 16, 328, 968), null, 360), 'abajo', 'un teléfono');
    const right = 1920 - 16 - F.DRAWER_SIDE_MIN + F.DRAWER_TUCK;
    assert.equal(F.drawerSide(rect(right - 700, 28, 700, 800), null, 1920), 'costado', 'justo DRAWER_SIDE_MIN');
    assert.equal(F.drawerSide(rect(right - 699, 28, 700, 800), null, 1920), 'abajo', 'un píxel menos');
  });

  it('con la página corrida, sigue a la consola sin salirse de la ventana', () => {
    const scrolled = rect(336, -172, 800, 1121);
    const b = F.drawerBox('costado', scrolled, rect(1164, 20, 420, 895), rect(362, -39, 748, 413), 1920, 950, { top: 28, bottom: 34 });
    assert.equal(b.y, 16, 'arriba de la ventana la consola sigue: el cajón empieza a 16 px');
    assert.equal(b.y + b.h, 915, 'abajo, donde empieza la esquina de la consola (949 − 34)');
  });

  it('con el Taller fijo a la derecha, tapa el Taller (a lo largo de la parte recta de la consola)', () => {
    const c = rect(29, 28, 718, 850), ws = rect(784, 16, 640, 868);
    const b = F.drawerBox('costado', c, ws, rect(52, 147, 672, 371), 1440, 900, { top: 28 * 0.898, bottom: 34 * 0.898 });
    assert.deepEqual(b, { x: 747 - F.DRAWER_TUCK, y: 53, w: 1424 - 745, h: 847 - 53 });
  });

  it('si la consola se fue de la ventana, conserva su alto mínimo', () => {
    const gone = rect(336, -2000, 800, 1121);
    const b = F.drawerBox('costado', gone, rect(1164, -1500, 420, 895), rect(362, -1867, 748, 413), 1920, 950, { top: 28, bottom: 34 });
    assert.equal(b.h, F.DRAWER_MIN_H);
    assert.equal(b.y, 16);
    // En una ventana más baja que el mínimo, toda la ventana menos los márgenes.
    const tiny = F.drawerBox('costado', gone, null, rect(362, -1867, 748, 413), 1920, 300, { top: 28, bottom: 34 });
    assert.equal(tiny.h, 300 - 32);
  });

  it('desde abajo: del ancho de la consola, debajo de la pantalla y hasta el borde de la ventana', () => {
    const phone = F.drawerBox('abajo', rect(16, 16, 330, 968), null, rect(30, 106, 302, 209), 360, 640, radius);
    assert.deepEqual(phone, { x: 16, y: 325, w: 330, h: 315 });
    const tablet = F.drawerBox('abajo', rect(16, 28, 736, 915), null, rect(42, 161, 684, 381), 768, 1024, radius);
    assert.deepEqual(tablet, { x: 16, y: 552, w: 736, h: 472 });
  });

  it('desde abajo, sin lugar debajo de la pantalla, conserva su alto mínimo (280 px, o media ventana)', () => {
    const low = F.drawerBox('abajo', rect(200, 28, 800, 1121), null, rect(226, 161, 748, 413), 1200, 800, radius);
    assert.equal(low.h, 280);
    assert.equal(low.y, 520);
    const landscape = F.drawerBox('abajo', rect(16, 16, 768, 900), null, rect(30, 108, 740, 420), 800, 360, radius);
    assert.equal(landscape.h, 180, 'en una ventana de 360 px de alto, la mitad');
  });
});

describe('La consola entera en la ventana (consoleFitZoom)', () => {
  it('se achica lo justo para que entre: el alto disponible (menos un píxel) sobre su alto natural, en milésimas', () => {
    assert.equal(F.consoleFitZoom(947, 897), 0.946, '1920 × 945: 945 − 28 − 20 = 897 px');
    assert.equal(F.consoleFitZoom(947, 852), 0.898, '1440 × 900');
    assert.equal(F.consoleFitZoom(947, 752), 0.793, '1280 × 800');
    for (const [natural, avail] of [[947, 897], [947, 852], [915, 700], [1000, 999.5]]) {
      const z = F.consoleFitZoom(natural, avail);
      assert.ok(z * natural <= avail - 1 + 1e-9, 'entra: ' + natural + ' a ' + z + ' en ' + avail);
    }
  });

  it('no crece más que su tamaño natural ni se achica más que CONSOLE_Z_MIN (las teclas quedan de 44 px)', () => {
    assert.equal(F.consoleFitZoom(915, 976), 1, 'una tableta de 1024 px de alto: entra entera');
    assert.equal(F.consoleFitZoom(947, 2000), 1);
    assert.equal(F.consoleFitZoom(947, 300), F.CONSOLE_Z_MIN);
    assert.ok(62 * F.CONSOLE_Z_MIN >= 44, 'una tecla de 62 px achicada');
    assert.equal(F.consoleFitZoom(0, 900), 1, 'sin medir todavía');
  });

  it('solo con la cubierta en dos columnas, y sin zoom (o sin ventana) queda a tamaño natural', () => {
    assert.equal(F.CONSOLE_FIT_MEDIA, '(min-width: 761px)');
    assert.ok(HTML.includes('@media (max-width: 760px)'), 'por debajo, la cubierta va en una columna');
    assert.equal(F.zoomOk, false, 'en Node no hay CSS.supports');
    assert.equal(F.consoleZoom, 1);
    assert.match(HTML, /\.console \{\s*position: relative;\s*zoom: var\(--con-z, 1\);/);
    assert.match(HTML, /grid-template-columns: minmax\(0, calc\(800px \* var\(--con-z, 1\)\)\) minmax\(340px, 420px\);/);
  });
});

describe('Las miniaturas de los cartuchos (thumbKey)', () => {
  const q = (...on) => Object.fromEntries(['vfReset', 'memory', 'shifting', 'jumping', 'clipping', 'displayWait'].map((k, i) => [k, on.includes(i)]));
  it('una por cartucho y configuración: plataforma, quirks e IPF', () => {
    const sha = 'a'.repeat(40);
    const a = F.thumbKey(sha, { platform: 'chip8', quirks: q(0, 1, 4, 5), ipf: 15 });
    assert.equal(a, sha + ':chip8:110011:15');
    assert.notEqual(F.thumbKey(sha, { platform: 'schip', quirks: q(0, 1, 4, 5), ipf: 15 }), a);
    assert.notEqual(F.thumbKey(sha, { platform: 'chip8', quirks: q(0, 1, 4), ipf: 15 }), a);
    assert.notEqual(F.thumbKey(sha, { platform: 'chip8', quirks: q(0, 1, 4, 5), ipf: 30 }), a);
    assert.notEqual(F.thumbKey('b'.repeat(40), { platform: 'chip8', quirks: q(0, 1, 4, 5), ipf: 15 }), a);
  });
  it('corre 240 frames (4 s), como las de la ventana del archivo', () => {
    assert.equal(F.THUMB_FRAMES, 240);
  });
});

describe('El marcado del cajón de opciones', () => {
  const drawer = (() => {
    const start = HTML.indexOf('<section class="drawer" id="drawer"');
    assert.ok(start >= 0, 'chip8.html no tiene el cajón de opciones');
    return HTML.slice(start, HTML.indexOf('\n      </section>', start));
  })();
  const tag = (id) => {
    const m = new RegExp('<[a-z0-9]+[^>]*\\bid="' + id + '"[^>]*>').exec(HTML);
    assert.ok(m, 'chip8.html no tiene #' + id);
    return m[0];
  };
  // El panel (o la sección de «Ajustes») en el que está un id.
  const where = (id, kind) => {
    const at = drawer.indexOf('id="' + id + '"');
    assert.ok(at >= 0, '#' + id + ' no está en el cajón');
    const before = drawer.slice(0, at), open = '<section class="drawer-' + kind;
    return new RegExp('id="drawer-' + (kind === 'panel' ? 'panel' : 'sec') + '-(\\w+)"').exec(before.slice(before.lastIndexOf(open)))[1];
  };

  it('es una región con nombre (el título «Opciones»), guardada de fábrica, y su botón la controla', () => {
    assert.match(drawer, /^<section class="drawer" id="drawer" aria-labelledby="drawer-title" hidden>/);
    assert.match(tag('drawer-title'), /<h2 class="drawer-title" id="drawer-title" tabindex="-1">/);
    assert.ok(drawer.includes('>Opciones</h2>'));
    const btn = tag('btn-drawer');
    for (const attr of ['aria-expanded="false"', 'aria-controls="drawer"', 'aria-keyshortcuts="M"', 'aria-label="Opciones (M)"', 'type="button"']) {
      assert.ok(btn.includes(attr), '#btn-drawer sin ' + attr);
    }
    assert.match(tag('drawer-close'), /aria-label="Cerrar el cajón de opciones \(M o Esc\)"/);
  });

  it('las tres pestañas, en el orden de DRAWER_TABS, cada una con su panel (tablist, tab y tabpanel)', () => {
    assert.deepEqual(F.DRAWER_TABS, ['cartuchos', 'ajustes', 'estados']);
    assert.match(drawer, /<div class="drawer-tabs" id="drawer-tabs" role="tablist" aria-label="[^"]+">/);
    const tabs = [...drawer.matchAll(/<button class="drawer-tab" id="drawer-tab-(\w+)" type="button" role="tab" aria-selected="(true|false)" aria-controls="drawer-panel-(\w+)" data-tab="(\w+)"/g)];
    assert.deepEqual(tabs.map((m) => m[1]), F.DRAWER_TABS);
    for (const m of tabs) assert.ok(m[1] === m[3] && m[1] === m[4], 'la pestaña ' + m[1] + ' controla su panel');
    assert.deepEqual(tabs.map((m) => m[2]), ['true', 'false', 'false'], 'en el marcado, la primera elegida');
    const names = [...drawer.matchAll(/data-tab="\w+"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    assert.deepEqual(names, ['Cartuchos', 'Ajustes', 'Estados']);
    const panels = [...drawer.matchAll(/<section class="drawer-panel[^"]*" id="drawer-panel-(\w+)" role="tabpanel" aria-labelledby="drawer-tab-(\w+)"( hidden)?>/g)];
    assert.deepEqual(panels.map((m) => m[1]), F.DRAWER_TABS);
    for (const m of panels) assert.equal(m[1], m[2]);
    assert.deepEqual(panels.map((m) => !!m[3]), [false, true, true], 'en el marcado, solo el primero a la vista');
  });

  it('«Ajustes» tiene las cuatro secciones de antes, en orden y con su título, y al final «Cuidado»', () => {
    assert.deepEqual(F.DRAWER_SECTIONS, ['velocidad', 'pantalla', 'compatibilidad', 'controles']);
    const secs = [...drawer.matchAll(/<section class="drawer-sec[^"]*" id="drawer-sec-(\w+)" aria-labelledby="drawer-sec-(\w+)-t">\s*<h3 class="drawer-group-title" id="drawer-sec-(\w+)-t">([^<]+)<\/h3>/g)];
    assert.deepEqual(secs.map((m) => m[1]), F.DRAWER_SECTIONS.concat('cuidado'));
    for (const m of secs) assert.ok(m[1] === m[2] && m[1] === m[3], 'la sección ' + m[1] + ' se nombra con su título');
    assert.deepEqual(secs.map((m) => m[4]), ['Velocidad', 'Pantalla y sonido', 'Compatibilidad', 'Controles', 'Cuidado']);
    for (const s of F.DRAWER_SECTIONS) assert.equal(where('drawer-sec-' + s, 'panel'), 'ajustes', s);
  });

  it('cada control de antes está en su sección (o su pestaña), con el mismo id y una sola vez', () => {
    const inSection = {
      velocidad: ['ipf-range', 'ipf-input', 'ipf-chips', 'ipf-rate'],
      pantalla: ['screen-mode', 'palette', 'custom-colors', 'color-bg', 'color-p1', 'color-p2', 'color-both', 'tg-scan', 'tg-persist', 'tg-curve', 'tg-power', 'tg-mute', 'volume'],
      compatibilidad: ['preset', 'platform', 'dip-bank', 'dip-labels', 'tg-perrom', 'quirk-hint'],
      controles: ['keymap', 'keymap-keys', 'keymap-hint', 'pad-hint'],
    };
    for (const [sec, ids] of Object.entries(inSection)) {
      for (const id of ids) {
        assert.equal(where(id, 'sec'), sec, '#' + id);
        assert.equal(where(id, 'panel'), 'ajustes', '#' + id);
        assert.equal(HTML.split('id="' + id + '"').length, 2, '#' + id + ' aparece una sola vez');
      }
    }
    for (const id of ['states-open', 'states-export', 'states-import', 'save-slots', 'tg-rewind', 'rewind-info', 'states-hint']) {
      assert.equal(where(id, 'panel'), 'estados', '#' + id);
    }
    assert.ok(/\.drawer-sec \+ \.drawer-sec \{[^}]*border-top/.test(HTML), 'una ranura separa cada sección de la anterior');
  });

  it('«Cartuchos»: la ranura, «Cargar ROM», el archivo de la comunidad, los incluidos y tus cartuchos', () => {
    const ids = ['slot', 'cart-name', 'cart-size', 'cart-forget', 'cart-controls', 'btn-load', 'file-input', 'btn-explorer', 'btn-explorer-n',
      'shelf-title', 'shelf-list', 'shelf-empty', 'lib-title', 'lib-list', 'lib-empty', 'lib-note'];
    for (const id of ids) {
      assert.equal(where(id, 'panel'), 'cartuchos', '#' + id);
      assert.equal(HTML.split('id="' + id + '"').length, 2, '#' + id + ' aparece una sola vez');
    }
    const order = ['slot', 'btn-load', 'btn-explorer', 'shelf-list', 'lib-list'].map((id) => drawer.indexOf('id="' + id + '"'));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'el orden: la ranura, los botones, los incluidos y los tuyos');
    assert.match(drawer, /<h3 class="drawer-group-title" id="shelf-title">Incluidos<\/h3>\s*<div class="ccards" id="shelf-list" role="group" aria-labelledby="shelf-title">/);
    assert.match(drawer, /<h3 class="drawer-group-title" id="lib-title">Tus cartuchos<\/h3>\s*<div class="ccards" id="lib-list" role="group" aria-labelledby="lib-title">/);
    assert.match(tag('btn-explorer'), /aria-keyshortcuts="L"/);
    // El cartel de las tarjetas: afuera del cajón (no lo corta su scroll), solo para la vista.
    assert.match(tag('cart-tip'), /<div class="cart-tip" id="cart-tip" aria-hidden="true" hidden>/);
    assert.ok(!drawer.includes('id="cart-tip"'));
  });

  it('«Cuidado»: cinco acciones, cada una con su botón, que preguntan en un diálogo propio (sin confirm del navegador)', () => {
    const zone = drawer.slice(drawer.indexOf('id="drawer-sec-cuidado"'));
    assert.match(zone, /^id="drawer-sec-cuidado"[^>]*>\s*<h3[^>]*>Cuidado<\/h3>/);
    for (const id of ['danger-rom', 'danger-rom-go', 'danger-all-go', 'danger-lib', 'danger-lib-go', 'danger-libs-go', 'danger-ws-go']) {
      assert.ok(zone.includes('id="' + id + '"'), 'falta #' + id);
    }
    assert.match(zone, /los estados guardados/, 'dice que la configuración completa se lleva los estados');
    assert.match(HTML, /<dialog class="help states-dialog states-ask danger-ask" id="danger-ask" aria-labelledby="danger-ask-title" aria-describedby="danger-ask-text">/);
    for (const id of ['danger-ask-title', 'danger-ask-text', 'danger-ask-list', 'danger-ask-cancel', 'danger-ask-ok', 'danger-ask-close']) {
      assert.ok(HTML.includes('id="' + id + '"'), 'falta #' + id + ' en el diálogo');
    }
    assert.ok(!/\b(window\.)?confirm\(/.test(UI) && !/\balert\(/.test(UI), 'ningún diálogo del navegador');
    assert.match(UI, /\$\('danger-ask-cancel'\)\.focus\(\);/, 'el foco empieza en «Cancelar»');
  });

  it('la ranura rápida de «Estados» va sola arriba, separada de las otras cuatro', () => {
    assert.match(UI, /var quickBox = make\('div', 'save-quick'\), sep = make\('div', 'save-sep'\), grid = make\('div', 'save-grid'\);/);
    assert.match(UI, /\(quick \? quickBox : grid\)\.appendChild\(root\);/);
    assert.match(HTML, /\.save-sep \{[^}]*height: 6px;/);
  });

  it('la tecla M, en onKeyDown, en la ayuda y en el título del botón', () => {
    assert.ok(UI.includes("case 'KeyM':"));
    const table = /<table class="shortcuts">([^]*?)<\/table>/.exec(HTML)[1];
    assert.match(table, /<tr><th><kbd>M<\/kbd><\/th><td>Abrir o cerrar el cajón de opciones \(cartuchos, ajustes y estados\)<\/td><\/tr>/);
    assert.match(tag('btn-drawer'), /title="Opciones: cartuchos, ajustes y estados[^"]*\(M\)"/);
  });
});

describe('El frente de la consola y la barra de arriba', () => {
  const front = (() => {
    const start = HTML.indexOf('<section class="console" id="console"');
    return HTML.slice(start, HTML.indexOf('\n      </section>', start));
  })();
  const tag = (id) => new RegExp('<[a-z0-9]+[^>]*\\bid="' + id + '"[^>]*>').exec(HTML)[0];

  it('solo la pantalla, la ejecución, el keypad y el parlante (la ranura se mudó al cajón)', () => {
    for (const id of ['screen', 'bezel', 'btn-pause', 'btn-step', 'btn-over', 'btn-out', 'btn-frame', 'btn-reset', 'keypad', 'status', 'bezel-cart', 'video-label']) {
      assert.ok(front.includes('id="' + id + '"'), '#' + id + ' está en el frente');
    }
    for (const id of ['slot', 'cart-name', 'btn-load', 'cart-picker', 'cart-chips', 'lib-picker', 'lib-chips', 'keypad-fold', 'keypad-show']) {
      assert.ok(!front.includes('id="' + id + '"'), '#' + id + ' ya no está en el frente');
    }
    assert.ok(front.includes('<div class="grille" aria-hidden="true"></div>'), 'el parlante');
    assert.ok(!HTML.includes('class="shelf"'), 'ya no hay estantes debajo de la consola');
  });

  it('la línea de estado no se ve, pero sigue al lado del parlante para los lectores de pantalla', () => {
    assert.match(front, /<div class="grille-row">\s*<div class="grille" aria-hidden="true"><\/div>[\s\S]*?<p class="status visually-hidden" id="status" role="status" aria-live="polite">Encendiendo…<\/p>\s*<\/div>/);
    const vh = /\.visually-hidden \{([^}]*)\}/.exec(HTML)[1];
    for (const rule of ['position: absolute !important', 'width: 1px', 'height: 1px', 'overflow: hidden', 'clip: rect(0 0 0 0)']) {
      assert.ok(vh.includes(rule), '.visually-hidden sin «' + rule + '»');
    }
    assert.ok(!/\n {2}\.status \{/.test(HTML), 'ya no hay estilos que la muestren');
    assert.match(UI, /function announce\(msg\) \{ statusEl\.textContent = msg; \}/, 'los anuncios siguen yendo ahí');
  });

  it('los botones de «Ejecución» son más grandes, y su nombre y su tecla también', () => {
    const rule = (sel) => { const m = new RegExp('\\n {2}' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}').exec(HTML); assert.ok(m, 'falta ' + sel); return m[1]; };
    assert.match(rule('.tbtn-cap'), /height: 58px;/);
    assert.match(rule('.tbtn-label'), /font: 800 14px\/1 var\(--font-ui\);/);
    assert.match(rule('.tbtn kbd'), /font-size: 12\.5px;/);
    assert.match(rule('.grille'), /flex: 1 1 auto;/, 'el parlante, a lo ancho del lugar que dejó la línea de estado');
  });

  it('el pie lleva el nombre del autor y su página, como texto (sin enlace a otro sitio)', () => {
    assert.match(front, /<footer class="console-foot">\s*<span class="foot-print">Maximiliano Simonazzi - www\.maxisimonazzi\.com\.ar<\/span>/);
    assert.ok(!HTML.includes('Weisbecker, 1977'), 'ya no está el texto de antes');
    assert.ok(!/href="[^"#]*maxisimonazzi/.test(HTML) && !HTML.includes('//www.maxisimonazzi'), 'la página va como texto, no como enlace');
  });

  it('el keypad ya no se pliega: ni botones, ni estilos, ni ajuste, ni API', () => {
    for (const s of ['keypad-fold', 'keypad-strip', 'is-keypad-folded', 'keypadFolded', 'setKeypadFolded', 'keypadInfo', 'Mostrar keypad', '>Plegar<']) {
      assert.ok(!HTML.includes(s), 'chip8.html todavía tiene «' + s + '»');
    }
  });

  it('el nombre del cartucho va impreso en el bisel, al lado del modo de video', () => {
    assert.match(front, /<span class="bezel-labels"><span class="bezel-label" id="video-label">Video 64 × 32<\/span><span class="bezel-cart" id="bezel-cart">Ranura vacía<\/span><\/span>/);
    assert.match(UI, /bezelCart\.textContent = cartName\.textContent;/);
  });

  it('la barra de arriba: opciones, monitor, Taller y ayuda, en ese orden', () => {
    const top = HTML.slice(HTML.indexOf('<div class="top-right">'), HTML.indexOf('</header>', HTML.indexOf('<div class="top-right">')));
    const order = ['btn-drawer', 'btn-monitor', 'btn-workshop', 'btn-help'].map((id) => top.indexOf('id="' + id + '"'));
    assert.ok(order.every((i) => i > 0), 'faltan botones en la barra: ' + order);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it('el botón del monitor lo controla entero (aria-expanded y aria-controls), y «Ocultar» hace lo mismo', () => {
    const btn = tag('btn-monitor');
    for (const attr of ['class="round-btn round-btn--dark"', 'type="button"', 'aria-expanded="true"', 'aria-controls="monitor"', 'aria-label="Monitor"']) {
      assert.ok(btn.includes(attr), '#btn-monitor sin ' + attr);
    }
    assert.match(tag('monitor'), /<aside class="monitor" id="monitor" aria-label="Monitor de depuración">/);
    const hide = tag('mon-toggle');
    assert.ok(hide.includes('aria-label="Ocultar el monitor"'));
    assert.ok(!hide.includes('aria-expanded'), '«Ocultar» no despliega nada: oculta el monitor entero');
    assert.match(UI, /monToggle\.addEventListener\('click', function \(e\) \{ setMonitorOpen\(false,/);
    assert.match(UI, /setMonitorOpen\(!mon\.open, e\.detail > 0 \? 'mouse' : 'teclado'\);/);
    assert.match(HTML, /html\.no-monitor \.layout \{ grid-template-columns: minmax\(0, calc\(800px \* var\(--con-z, 1\)\)\); \}/, 'oculto, la consola queda sola en el medio');
  });
});
