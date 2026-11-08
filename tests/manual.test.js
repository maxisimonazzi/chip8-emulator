'use strict';
// Tests del manual de referencia (docs/MANUAL.md) y de los enlaces del README.
//
// CONVENCIÓN DE LOS BLOQUES ```asm DEL MANUAL (también está explicada en un
// comentario HTML en la sección "Convenciones" de MANUAL.md):
//
//   - Un bloque ```asm sin marca es un ejemplo que se ensambla TAL CUAL con
//     tools/chip8asm.js.
//   - Un FRAGMENTO es un bloque cuya primera línea es un comentario que empieza
//     con "; Fragmento", por ejemplo:
//         ; Fragmento: es_menor es una etiqueta de tu programa.
//     Es un pedazo de un programa más grande: usa etiquetas (subrutinas,
//     destinos de salto, tablas) que están en otra parte. El test le agrega esas
//     etiquetas al final, como etiquetas de relleno, y exige que así se
//     ensamble (o sea, que el único problema sea que faltan etiquetas). Exige
//     además que el fragmento use de verdad al menos una etiqueta que no
//     define, y que los comentarios con que empieza nombren todas las que faltan.
//   - PLATAFORMA. Entre los comentarios con que empieza un bloque (fragmento o
//     no) puede haber una línea que diga para qué plataforma es:
//         ; Plataforma: SUPER-CHIP
//     o "; Plataforma: XO-CHIP" (o "; Plataforma: CHIP-8", que es lo que se
//     supone si el bloque no dice nada). En un fragmento, la marca va después de
//     la línea "; Fragmento". Un bloque de XO-CHIP se ensambla con la opción
//     { xochip: true } (como --xo), así que puede pasar de 0xFFF. Un bloque que
//     usa instrucciones de SUPER-CHIP o XO-CHIP tiene que declarar una plataforma
//     que las tenga: si no, en la consola se ignorarían o detendrían la máquina.
//   - Un ejemplo que termina en el bucle "fin: JP fin" es un programa completo:
//     se ejecuta en el núcleo real, en la plataforma que declara y con cada
//     perfil de quirks, y tiene que llegar a ese bucle sin que la máquina se
//     detenga (ni por un error ni por EXIT) ni ignore ninguna instrucción.
//
// Además se verifican:
//   - la referencia de SUPER-CHIP y XO-CHIP (sección 13.11): tiene una ficha
//     "#### `OPCODE` — MNEMÓNICO" por cada instrucción que documenta el
//     encabezado del ensamblador (el bloque chip8-asm de chip8.html) y por cada
//     instrucción que reconoce el núcleo (extendedInfo); el opcode de cada
//     ficha tiene que ser el que genera el ensamblador para su mnemónico, y su
//     línea "**Plataforma:**" la que dice el núcleo;
//   - los datos que el manual copia del núcleo y del archivo de la comunidad: la
//     tabla de la fuente grande, los dibujos de los glifos (cada fila tiene que
//     ser su byte), la tabla de tonos de XO-CHIP y los números de
//     data/archive.json;
//   - los enlaces: cada #ancla del manual lleva a uno de sus encabezados, los
//     enlaces al tutorial llevan a encabezados que existen y los enlaces a
//     archivos (en el manual y en el README) apuntan a archivos que existen. El
//     manual tiene que enlazar docs/DESARROLLO.md, y ese archivo tiene que existir.
//   - el README: la estructura del repositorio, los scripts de npm, la tabla de
//     atajos (cada atajo de la ayuda de la consola) y la cantidad de archivos de
//     prueba y de escenarios E2E que dice.
//   - docs/DESARROLLO.md: sus enlaces y anclas (propias, del manual, del tutorial y
//     del README), que la tabla de window.chip8 (4.21) nombre cada miembro de la API,
//     que la de 3.1 nombre cada clave de Chip8Core, que las claves de localStorage que
//     cita existan, que la tabla de 6.2 tenga cada tests/*.test.js y que la de 6.7
//     tenga una fila por escenario de tools/e2e.js, en orden. Además, lo que cuenta de
//     los estados guardados: la tabla de 3.11 nombra cada campo de saveState, el
//     ejemplo de la compresión (marcado con <!-- verificar: compresion -->) y los
//     tamaños son los que da encodeState, y los topes del rebobinado son los de
//     RewindBuffer y de la interfaz; la tabla de constantes de 4.1 tiene los valores
//     de chip8.html; la de 4.19, cada campo de los ajustes guardados (loadSettings);
//     los atajos de 4.6 y de 9.7 son los de la ayuda; y la tabla de 6.3 nombra cada
//     archivo de prueba y suma bien.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadCore, loadAssembler, loadDemos, hexToBytes, extractScript } = require('./harness');

const {
  Chip8, QUIRK_PRESETS, PLATFORMS, PLATFORM_INFO, BIG_FONT, BIG_FONT_ADDR, extendedInfo, patternRate,
} = loadCore();
const { assemble } = loadAssembler();

const DOCS = path.join(ROOT, 'docs');
const MANUAL_PATH = path.join(DOCS, 'MANUAL.md');
const TUTORIAL_PATH = path.join(DOCS, 'TUTORIAL.md');
const README_PATH = path.join(ROOT, 'README.md');
const ARCHIVE_TOOL_PATH = path.join(ROOT, 'tools', 'archive.js');
const ARCHIVE_DATA_PATH = path.join(ROOT, 'data', 'archive.json');

const FRAGMENT_RE = /^;\s*Fragmento\b/i;
const PLATFORM_RE = /^\s*;\s*Plataforma:\s*(.*?)\s*$/i;
const UNKNOWN_LABEL_RE = /etiqueta o constante desconocida: "([^"]+)"/;
// Nombre de cada plataforma en el manual (las etiquetas del núcleo: CHIP-8, SUPER-CHIP,
// XO-CHIP) -> su identificador en el núcleo.
const PLATFORM_BY_LABEL = Object.fromEntries(PLATFORMS.map((p) => [PLATFORM_INFO[p].label, p]));
// Lo que dice la línea "**Plataforma:**" de una ficha, según la plataforma mínima.
const PLATFORM_LINE = { schip: 'SUPER-CHIP y XO-CHIP', xochip: 'XO-CHIP' };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const level = (platform) => PLATFORMS.indexOf(platform);
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

// Bloques de código cercados con ```: { lang, lines, text, line } (line = primera
// línea del contenido, contando desde 1).
function parseBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\w*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const start = i + 1;
    const body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    blocks.push({ lang: open[1], lines: body, text: body.join('\n'), line: start + 1 });
  }
  return blocks;
}

// Comentarios con que empieza un bloque (hasta la primera línea que no es comentario).
function leadingCommentLines(lines) {
  const out = [];
  for (const l of lines) {
    if (!/^\s*;/.test(l)) break;
    out.push(l);
  }
  return out;
}

function leadingComments(lines) {
  return leadingCommentLines(lines).join('\n');
}

// La plataforma que declara un bloque ("; Plataforma: XO-CHIP" entre los comentarios
// con que empieza; CHIP-8 si no dice nada) y los problemas de su marca.
function platformMarker(lines) {
  const intro = leadingCommentLines(lines).length;
  const found = [];
  const problems = [];
  lines.forEach((line, i) => {
    const m = PLATFORM_RE.exec(line);
    if (!m) return;
    const id = PLATFORM_BY_LABEL[m[1].toUpperCase()];
    if (id) found.push(id);
    else problems.push('plataforma desconocida "' + m[1] + '" (tiene que ser ' + Object.keys(PLATFORM_BY_LABEL).join(', ') + ')');
    if (i >= intro) problems.push('la marca "; Plataforma:" tiene que estar entre los comentarios con que empieza el bloque');
  });
  if (found.length > 1) problems.push('el bloque declara más de una plataforma');
  return { platform: found[0] || 'chip8', platformProblems: problems };
}

function asmBlocks(md) {
  return parseBlocks(md)
    .filter((b) => b.lang === 'asm')
    .map((b) => ({ ...b, fragment: FRAGMENT_RE.test((b.lines[0] || '').trim()), ...platformMarker(b.lines) }));
}

// Opciones del ensamblador para la plataforma de un bloque: XO-CHIP puede pasar de 0xFFF.
function asmOptions(platform) {
  return platform === 'xochip' ? { xochip: true } : undefined;
}

// Ensambla un fragmento agregando, de a una, las etiquetas que el ensamblador
// dice que no conoce. Devuelve el resultado y la lista de etiquetas agregadas.
function assembleWithStubs(text, where, options) {
  const missing = [];
  for (;;) {
    const source = text + '\n' + missing.map((l) => l + ':').join('\n') + '\n';
    try {
      return { result: assemble(source, options), missing };
    } catch (err) {
      const m = UNKNOWN_LABEL_RE.exec(err.message);
      assert.ok(m, where + ': no ensambla (y no por una etiqueta que falta): ' + err.message);
      assert.ok(!missing.includes(m[1]), where + ': la etiqueta "' + m[1] + '" sigue sin resolverse');
      missing.push(m[1]);
      assert.ok(missing.length <= 10, where + ': demasiadas etiquetas sin definir');
    }
  }
}

// El resultado de ensamblar un bloque (con las etiquetas de relleno, si es un fragmento).
function assembleBlock(b) {
  const where = 'línea ' + b.line;
  return b.fragment ? assembleWithStubs(b.text, where, asmOptions(b.platform)).result : assemble(b.text, asmOptions(b.platform));
}

// Las instrucciones de un listado del ensamblador (no los datos de DB y DW):
// [{ line, text, opcode }], con line contada desde el principio del bloque.
function instructionsOf(listing) {
  const out = [];
  for (const e of listing) {
    if (e.bytes.length < 2) continue;
    const code = e.text.replace(/;.*/, '').replace(/^\s*[A-Za-z_.][A-Za-z0-9_.]*\s*:/, '').trim();
    const word = code.split(/\s+/)[0].toUpperCase();
    if (word === 'DB' || word === 'DW') continue;
    out.push({ line: e.line, text: e.text.trim(), opcode: (e.bytes[0] << 8) | e.bytes[1] });
  }
  return out;
}

// Palabras de 16 bits de un ensamblado, en hexadecimal: "F000 1234".
function words(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 2) out.push(hex((bytes[i] << 8) | bytes[i + 1], 4));
  return out.join(' ');
}

// Un caso concreto de una instrucción genérica: VX, VY, N y NNNN pasan a V1, V2, 3 y
// 0x1234 en el mnemónico, y X, Y, N y NNNN a 1, 2, 3 y 1234 en el opcode.
// "SCD N" / "00CN" -> { text: 'SCD 3', opcode: '00C3' }.
function instance(syntax, opcode) {
  return {
    text: syntax.toUpperCase().replace(/\bVX\b/g, 'V1').replace(/\bVY\b/g, 'V2')
      .replace(/\bNNNN\b/g, '0x1234').replace(/\bN\b/g, '3'),
    opcode: opcode.toUpperCase().replace('NNNN', '1234').replace(/X/g, '1').replace(/Y/g, '2').replace(/N/g, '3'),
  };
}

// Las fichas del manual: { heading, opcode, syntax, body }, con el texto de la ficha
// hasta la línea "---" o el próximo encabezado.
function cardsOf(md) {
  const lines = md.split('\n');
  const cards = [];
  lines.forEach((line, i) => {
    const m = /^#### `([^`]+)` — (.+)$/.exec(line);
    if (!m) return;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^(---|#{1,4} )/.test(lines[j]); j++) body.push(lines[j]);
    cards.push({ heading: '`' + m[1] + '` — ' + m[2], opcode: m[1], syntax: m[2], body: body.join('\n') });
  });
  return cards;
}

// Las instrucciones de SUPER-CHIP y XO-CHIP que documenta el encabezado del
// ensamblador (el bloque chip8-asm de chip8.html):
// [{ section: 'SUPER-CHIP', syntax: 'SCD n', opcode: '00Cn' }].
function assemblerExtendedForms() {
  const src = extractScript('chip8-asm').code;
  const header = src.slice(src.indexOf('/*'), src.indexOf('*/'));
  const forms = [];
  let section = null;
  for (const line of header.split(/\r?\n/)) {
    const title = /^\s*\*\s(CHIP-8|SUPER-CHIP|XO-CHIP)\s*$/.exec(line);
    if (title) {
      section = title[1];
      continue;
    }
    if (/^\s*\*\s*$/.test(line)) {
      section = null;
      continue;
    }
    if (section !== 'SUPER-CHIP' && section !== 'XO-CHIP') continue;
    const m = /^\s*\*\s{3}(\S.*?)\s{2,}([0-9A-Fa-fxyn]{4}(?: nnnn)?)(?:\s|$)/.exec(line);
    if (m) forms.push({ section, syntax: m[1], opcode: m[2] });
  }
  return forms;
}

// "56.200" -> 56200; "1756,25 Hz" -> 1756.25.
function spanishNumber(text) {
  return Number(text.replace(/\s*Hz$/, '').replace(/\./g, '').replace(',', '.'));
}

// Como escribe los números el manual: 10.000, pero 3584 (sin separador hasta 4 cifras).
function spanishInt(n) {
  return n >= 10000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(n);
}

// Las filas de la tabla Markdown cuyo encabezado empieza con `header` (sin la fila
// del encabezado ni la de los guiones): una lista de celdas por fila.
function tableAfter(md, header) {
  const start = md.indexOf('\n' + header);
  assert.ok(start >= 0, 'no encontré la tabla que empieza con «' + header + '»');
  const rows = [];
  for (const line of md.slice(start + 1).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

// Slug de encabezado al estilo de GitHub: minúsculas, sin puntuación, espacios -> guiones.
function slug(heading) {
  return heading.trim().toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function anchorsOf(md) {
  const anchors = new Set();
  const seen = {};
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen[base] || 0;
    seen[base] = n + 1;
    anchors.add(n ? base + '-' + n : base);
  }
  return anchors;
}

// Destinos de los enlaces [texto](destino), sin mirar dentro de bloques de código
// ni de `código en línea`.
function linksOf(md) {
  const out = [];
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const text = line.replace(/`[^`]*`/g, '');
    const re = /\]\(([^)\s]+)\)/g;
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

const isExternal = (link) => /^[a-z]+:/i.test(link);

// ---------------------------------------------------------------------------
// docs/MANUAL.md
// ---------------------------------------------------------------------------

describe('docs/MANUAL.md', () => {
  const md = read(MANUAL_PATH);
  const blocks = asmBlocks(md);

  it('usa finales de línea LF', () => {
    assert.ok(!md.includes('\r'));
  });

  it('explica la convención de los fragmentos (en el texto y en un comentario HTML)', () => {
    assert.match(md, /`; Fragmento`/, 'el texto de "Convenciones" nombra la marca de los fragmentos');
    assert.match(md, /<!--[^]*?tests\/manual\.test\.js[^]*?-->/, 'un comentario HTML documenta la convención');
  });

  it('explica la marca de plataforma (en el texto y en el comentario HTML)', () => {
    assert.match(md, /`; Plataforma: SUPER-CHIP`/, 'el texto de "Convenciones" nombra la marca de plataforma');
    assert.match(md, /`; Plataforma: XO-CHIP`/, 'el texto de "Convenciones" nombra la marca de plataforma');
    assert.match(md, /<!--[^]*?tests\/manual\.test\.js[^]*?"; Plataforma: XO-CHIP"[^]*?-->/,
      'el comentario HTML de la convención documenta la marca de plataforma');
  });

  it('tiene bloques asm, y algunos son fragmentos o declaran SUPER-CHIP o XO-CHIP', () => {
    assert.ok(blocks.length >= 40, 'bloques asm: ' + blocks.length);
    assert.ok(blocks.some((b) => b.fragment));
    assert.ok(blocks.some((b) => b.platform === 'schip'), 'ningún ejemplo declara SUPER-CHIP');
    assert.ok(blocks.some((b) => b.platform === 'xochip'), 'ningún ejemplo declara XO-CHIP');
  });

  it('las marcas de plataforma están bien escritas y en su lugar', () => {
    for (const b of blocks) assert.deepEqual(b.platformProblems, [], 'línea ' + b.line);
  });

  it('cada ejemplo que no es un fragmento se ensambla tal cual (con --xo si es de XO-CHIP)', () => {
    for (const b of blocks.filter((x) => !x.fragment)) {
      try {
        assemble(b.text, asmOptions(b.platform));
      } catch (err) {
        assert.fail('línea ' + b.line + ': el ejemplo no ensambla: ' + err.message +
          '\n(si es un pedazo de un programa más grande, empezalo con "; Fragmento: ...")');
      }
    }
  });

  it('cada fragmento se ensambla cuando se definen las etiquetas que usa, y las nombra al empezar', () => {
    for (const b of blocks.filter((x) => x.fragment)) {
      const where = 'línea ' + b.line;
      const { missing } = assembleWithStubs(b.text, where, asmOptions(b.platform));
      assert.ok(missing.length > 0,
        where + ': está marcado como fragmento pero ensambla solo (sacale la marca "; Fragmento")');
      const intro = leadingComments(b.lines);
      for (const label of missing) {
        assert.ok(new RegExp('\\b' + label + '\\b').test(intro),
          where + ': el comentario inicial del fragmento no nombra la etiqueta "' + label + '"');
      }
    }
  });

  it('un ejemplo que usa instrucciones de SUPER-CHIP o XO-CHIP declara una plataforma que las tiene', () => {
    let extended = 0;
    for (const b of blocks) {
      for (const ins of instructionsOf(assembleBlock(b).listing)) {
        const info = extendedInfo(ins.opcode);
        if (!info) continue;
        extended++;
        if (level(info.needs) <= level(b.platform)) continue;
        const label = PLATFORM_INFO[info.needs].label;
        assert.fail('línea ' + (b.line + ins.line - 1) + ': «' + ins.text + '» (' + info.name + ') es de ' + label +
          ', pero el ejemplo es de ' + PLATFORM_INFO[b.platform].label + ': marcalo con "; Plataforma: ' + label + '"');
      }
    }
    assert.ok(extended >= 17, 'instrucciones de SUPER-CHIP y XO-CHIP en los ejemplos: ' + extended);
  });

  it('los programas completos (los que terminan en "fin: JP fin") corren hasta ese bucle en su plataforma, con cada perfil', () => {
    const complete = blocks.filter((b) => !b.fragment && b.lines.some((l) => /^\s*fin:\s*JP\s+fin\b/i.test(l)));
    assert.ok(complete.length >= 4, 'programas completos: ' + complete.length);
    assert.ok(complete.some((b) => b.platform === 'schip'), 'ningún programa completo de SUPER-CHIP');
    assert.ok(complete.some((b) => b.platform === 'xochip'), 'ningún programa completo de XO-CHIP');
    for (const b of complete) {
      const { bytes, labels } = assemble(b.text, asmOptions(b.platform));
      for (const [id, preset] of Object.entries(QUIRK_PRESETS)) {
        const where = 'línea ' + b.line + ' (' + PLATFORM_INFO[b.platform].label + ', perfil ' + id + ')';
        const cpu = new Chip8({ platform: b.platform, quirks: preset.quirks, random: () => 0 });
        cpu.loadRom(bytes);
        for (let f = 0; f < 120 && cpu.pc !== labels.fin && !cpu.halted; f++) cpu.runFrame(15);
        assert.ok(!cpu.halted, where + ': la máquina se detuvo: ' + (cpu.exited ? 'el programa terminó con EXIT' : cpu.error));
        assert.equal(cpu.pc, labels.fin, where + ': no llegó a "fin"');
        assert.equal(cpu.hint, null, where + ': la máquina ignoró una instrucción de otra plataforma');
      }
    }
  });

  it('la referencia de SUPER-CHIP y XO-CHIP tiene una ficha por cada instrucción del ensamblador y del núcleo', () => {
    const cards = cardsOf(md);
    // 1. Cada instrucción de SUPER-CHIP y XO-CHIP que documenta el ensamblador tiene su ficha,
    //    con el mismo opcode y el mismo mnemónico.
    const forms = assemblerExtendedForms();
    assert.ok(forms.some((f) => f.section === 'SUPER-CHIP') && forms.some((f) => f.section === 'XO-CHIP'),
      'no encontré las instrucciones de SUPER-CHIP y XO-CHIP en el encabezado del bloque chip8-asm');
    for (const f of forms) {
      const want = '`' + f.opcode.toUpperCase() + '` — ' + f.syntax.toUpperCase();
      assert.ok(cards.some((c) => c.heading === want),
        'falta la ficha «#### ' + want + '» (' + f.section + ' en el bloque chip8-asm)');
    }
    // 2. Cada ficha de una instrucción de SUPER-CHIP o XO-CHIP: el ensamblador genera su
    //    opcode a partir de su mnemónico, y la línea Plataforma es la que dice el núcleo.
    const families = new Set();
    for (const c of cards) {
      const { text, opcode } = instance(c.syntax, c.opcode);
      const info = extendedInfo(parseInt(opcode.slice(0, 4), 16));
      if (!info) continue; // una instrucción de CHIP-8 (sección 10)
      families.add(info.name);
      let bytes;
      try {
        bytes = assemble(text, { xochip: true }).bytes;
      } catch (err) {
        assert.fail('ficha «' + c.heading + '»: el ensamblador no acepta «' + text + '»: ' + err.message);
      }
      assert.equal(words(bytes), opcode, 'ficha «' + c.heading + '»: «' + text + '» se ensambla como ' + words(bytes));
      assert.ok(c.body.includes('**Plataforma:** ' + PLATFORM_LINE[info.needs] + '\n') ||
        c.body.endsWith('**Plataforma:** ' + PLATFORM_LINE[info.needs]),
      'ficha «' + c.heading + '»: tiene que decir «**Plataforma:** ' + PLATFORM_LINE[info.needs] + '»');
    }
    assert.ok(forms.every((f) => families.has(extendedInfo(parseInt(instance(f.syntax, f.opcode).opcode.slice(0, 4), 16)).name)),
      'hay una forma del ensamblador sin ficha');
    // 3. Cada instrucción que el núcleo reconoce como de SUPER-CHIP o XO-CHIP tiene ficha
    //    (incluida DXY0, que en el ensamblador es DRW con N = 0).
    const core = new Map();
    for (let w = 0; w <= 0xFFFF; w++) {
      const info = extendedInfo(w);
      if (info && !core.has(info.name)) core.set(info.name, w);
    }
    assert.ok(core.size >= 17, 'instrucciones de SUPER-CHIP y XO-CHIP en el núcleo: ' + core.size);
    for (const [name, w] of core) {
      assert.ok(families.has(name), 'falta la ficha de ' + hex(w, 4) + ' (' + name + ')');
    }
  });

  it('la tabla de la fuente grande es la del núcleo (bytes y direcciones)', () => {
    const rows = [...md.matchAll(/^\| ([0-9A-F]) \| `((?:[0-9A-F]{2} ){9}[0-9A-F]{2})` \| `0x([0-9A-F]{3})` \|$/gm)];
    assert.equal(rows.length, 16, 'filas de la tabla de la fuente grande: ' + rows.length);
    for (const [, digit, bytes, addr] of rows) {
      const d = parseInt(digit, 16);
      const want = Array.from(BIG_FONT.slice(d * 10, d * 10 + 10), (b) => hex(b, 2)).join(' ');
      assert.equal(bytes, want, 'glifo grande ' + digit);
      assert.equal(parseInt(addr, 16), BIG_FONT_ADDR + d * 10, 'dirección del glifo grande ' + digit);
    }
  });

  it('cada fila dibujada de un glifo es su byte ("F0  ####", "3C  ..####..")', () => {
    let checked = 0;
    for (const b of parseBlocks(md).filter((x) => x.lang === '')) {
      for (const line of b.lines) {
        for (const m of line.matchAll(/(?:^|\s)([0-9A-F]{2}) {2}([.#]{8}|[.#]{4})(?=\s|$)/g)) {
          const bits = parseInt(m[1], 16).toString(2).padStart(8, '0').replace(/0/g, '.').replace(/1/g, '#');
          assert.equal(m[2], bits.slice(0, m[2].length), 'línea «' + line.trim() + '»: ' + m[1] + ' se dibuja ' + bits);
          checked++;
        }
      }
    }
    // La fuente chica (8.2), la del VIP (8.4) y la grande (13.7).
    assert.ok(checked >= 16 * 5 + 16 * 10, 'filas de glifos revisadas: ' + checked);
  });

  it('la tabla de tonos de XO-CHIP sale de patternRate', () => {
    const rows = tableAfter(md, '| `pitch` | Bits por segundo |');
    assert.ok(rows.length >= 5, 'filas de la tabla de tonos: ' + rows.length);
    assert.ok(rows.some((r) => parseInt(r[0], 10) === 64) && rows.some((r) => parseInt(r[0], 10) === 247));
    for (const r of rows) {
      const pitch = parseInt(r[0], 10);
      const rate = patternRate(pitch);
      assert.equal(spanishNumber(r[1]), Math.round(rate), 'pitch ' + pitch + ': bits por segundo');
      [128, 32, 16].forEach((cycle, k) => {
        const got = spanishNumber(r[2 + k]);
        assert.ok(Math.abs(got - rate / cycle) <= 0.005 + 1e-9,
          'pitch ' + pitch + ', ciclo de ' + cycle + ' bits: ' + r[2 + k] + ' (es ' + (rate / cycle).toFixed(4) + ')');
      });
    }
  });

  it('los números del archivo de la comunidad son los de data/archive.json', () => {
    const { toEntry, fromOctoOptions } = require(ARCHIVE_TOOL_PATH);
    const programs = JSON.parse(read(ARCHIVE_DATA_PATH)).programs;
    const entries = programs.map(toEntry);
    const octo = fromOctoOptions({}).quirks;
    // El manual dice que los quirks por defecto de Octo son los del perfil XO-CHIP.
    assert.deepEqual(octo, { ...QUIRK_PRESETS.xochip.quirks }, 'los quirks por defecto de Octo no son los del perfil XO-CHIP');
    const count = (f) => entries.filter(f).length;
    const total = entries.length;
    const withOcto = count((e) => Object.keys(octo).every((k) => e.quirks[k] === octo[k]));
    const ipfs = entries.map((e) => e.ipf);
    // Cada vez que el manual da uno de estos números, tiene que ser el de data/archive.json.
    const claims = [
      [/\b(\d+) programas\b/g, [total]],
      [/\b(\d+) de CHIP-8, (\d+) de SUPER-CHIP y (\d+) de XO-CHIP\b/g,
        [count((e) => e.platform === 'chip8'), count((e) => e.platform === 'schip'), count((e) => e.platform === 'xochip')]],
      [new RegExp('\\b(\\d+) de los ' + total + '\\b', 'g'), [withOcto]],
      [/\bde ([\d.]+) a ([\d.]+) IPF\b/g, [Math.min(...ipfs), Math.max(...ipfs)]],
    ];
    const prose = md.replace(/\s+/g, ' '); // una frase puede estar partida en dos líneas
    for (const [re, want] of claims) {
      const found = [...prose.matchAll(re)];
      assert.ok(found.length > 0, 'el manual no tiene ninguna frase como ' + re + ' (con ' + want.map(spanishInt).join(', ') + ')');
      for (const m of found) {
        assert.deepEqual(m.slice(1).map(spanishNumber), want,
          '«' + m[0] + '»: según data/archive.json son ' + want.map(spanishInt).join(', '));
      }
    }
    // La tabla de velocidades de 12.2.
    const histogram = {};
    for (const v of ipfs) histogram[v] = (histogram[v] || 0) + 1;
    const table = {};
    for (const [ipf, n] of tableAfter(md, '| IPF | Programas del archivo |')) table[spanishNumber(ipf)] = Number(n);
    assert.deepEqual(table, histogram, 'la tabla de IPF del archivo (12.2) no es la de data/archive.json');
  });

  it('los mensajes y textos de la consola que cita (secciones 11 y 13) son los de chip8.html y del núcleo', () => {
    const html = read(path.join(ROOT, 'chip8.html'));
    // Textos de la interfaz que el manual nombra, tal como aparecen en el código.
    for (const s of [
      '>Compatibilidad<', '>Perfil</label>', '>Plataforma</label>', '>Personalizado<', 'Ajustes por cartucho',
      "'Personalizada'", "'Del cartucho'", '>Tus cartuchos<', '>Cartuchos</button>', "' · ajustes del archivo'",
      "' · ajustes recordados'", '>Olvidar ajustes<', "label: 'Usar ' + needed", "'Cambiar a ' + platformLabel(platform) + ' y reiniciar'",
      "'FIN DEL PROGRAMA', 'La ROM terminó con EXIT (00FD).'", "badge: 'Terminado'", "'planos 1+2'", '>MÁQUINA<',
      'solo entra en XO-CHIP (64 KB), así que pasé al perfil XO-CHIP.',
      "'La ROM usó «' + Core.disassemble(h.opcode, cpu.quirks, h.needs) + '» (' + h.name + '), que es de ' + needed",
      "', y la plataforma ' + platformLabel(cpu.platform) + ' la ignora.'",
    ]) {
      assert.ok(html.includes(s), 'chip8.html ya no contiene: ' + s + ' (el manual lo cita)');
    }
    // El error de plataforma, palabra por palabra, como lo arma el núcleo.
    const cpu = new Chip8({ platform: 'chip8' });
    cpu.loadRom([0x12, 0x0A, 0, 0, 0, 0, 0, 0, 0, 0, 0xF1, 0x30]); // JP 0x20A | ... | 20A: LD HF, V1
    cpu.step();
    cpu.step();
    assert.ok(md.includes(cpu.error), 'el manual no cita el error tal cual: ' + cpu.error);
    // El aviso de una instrucción ignorada: el texto de la instrucción y su nombre.
    const hint = new Chip8({ platform: 'chip8' });
    hint.loadRom([0x00, 0xFF]); // HIGH
    hint.step();
    const { disassemble } = loadCore();
    const quoted = '«' + disassemble(hint.hint.opcode, hint.quirks, hint.hint.needs) + '» (' + hint.hint.name + '), que es de ' +
      PLATFORM_INFO[hint.hint.needs].label + ', y la plataforma CHIP-8 la ignora.';
    assert.ok(md.includes(quoted), 'el manual no cita el aviso tal cual: ' + quoted);
  });

  it('los enlaces internos, al tutorial y al README llevan a encabezados y archivos que existen', () => {
    const own = anchorsOf(md);
    const tutorial = anchorsOf(read(TUTORIAL_PATH));
    let checked = 0;
    for (const link of linksOf(md)) {
      if (isExternal(link)) continue;
      const [file, anchor] = link.split('#');
      if (file === '') {
        assert.ok(own.has(anchor), 'ancla inexistente en el manual: #' + anchor);
      } else if (file === 'TUTORIAL.md') {
        if (anchor) assert.ok(tutorial.has(anchor), 'ancla inexistente en TUTORIAL.md: #' + anchor);
      } else {
        assert.ok(fs.existsSync(path.join(DOCS, file)), 'enlace roto: ' + link);
        assert.ok(!anchor, 'enlace con ancla a un archivo que este test no revisa: ' + link);
      }
      checked++;
    }
    assert.ok(checked >= 40, 'enlaces revisados: ' + checked);
  });

  it('el índice enlaza cada sección numerada, en orden', () => {
    const sections = [...md.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => '#' + slug(m[1] + '. ' + m[2]));
    const index = md.slice(md.indexOf('## Índice'), md.indexOf('\n---', md.indexOf('## Índice')));
    const listed = [...index.matchAll(/\]\((#[^)]+)\)/g)].map((m) => m[1]);
    assert.deepEqual(listed, sections);
  });

  it('el enlace a DESARROLLO.md lleva a un archivo que existe', () => {
    assert.ok(linksOf(md).some((l) => l.split('#')[0] === 'DESARROLLO.md'), 'el manual no enlaza DESARROLLO.md');
    assert.ok(fs.existsSync(path.join(DOCS, 'DESARROLLO.md')), 'falta docs/DESARROLLO.md');
  });
});

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

describe('README.md', () => {
  const md = read(README_PATH);
  const manual = anchorsOf(read(MANUAL_PATH));
  const tutorial = anchorsOf(read(TUTORIAL_PATH));

  it('los enlaces llevan a archivos (y anclas) que existen', () => {
    const own = anchorsOf(md);
    let checked = 0;
    for (const link of linksOf(md)) {
      if (isExternal(link)) continue;
      const [file, anchor] = link.split('#');
      if (file === '') {
        assert.ok(own.has(anchor), 'ancla inexistente en el README: #' + anchor);
        checked++;
        continue;
      }
      assert.ok(fs.existsSync(path.join(ROOT, file)), 'enlace roto: ' + link);
      if (anchor && file === 'docs/MANUAL.md') assert.ok(manual.has(anchor), 'ancla inexistente en el manual: #' + anchor);
      if (anchor && file === 'docs/TUTORIAL.md') assert.ok(tutorial.has(anchor), 'ancla inexistente en el tutorial: #' + anchor);
      checked++;
    }
    assert.ok(checked >= 3, 'enlaces revisados: ' + checked);
  });

  it('la estructura del repositorio nombra archivos que existen e incluye todas las herramientas', () => {
    const start = md.indexOf('## Estructura del repositorio');
    assert.ok(start >= 0);
    const block = parseBlocks(md.slice(start))[0];
    const listed = block.lines
      .map((l) => /^(\S+)\s{2,}/.exec(l))
      .filter(Boolean)
      .map((m) => m[1]);
    assert.ok(listed.length >= 10, 'rutas en la estructura: ' + listed.length);
    for (const p of listed) {
      assert.ok(fs.existsSync(path.join(ROOT, p)), 'la estructura nombra algo que no existe: ' + p);
    }
    for (const tool of fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.js'))) {
      assert.ok(listed.includes('tools/' + tool), 'falta tools/' + tool + ' en la estructura');
    }
  });

  it('cada "npm run ..." que menciona es un script de package.json', () => {
    const { scripts } = JSON.parse(read(path.join(ROOT, 'package.json')));
    const used = [...md.matchAll(/npm run ([\w-]+)/g)].map((m) => m[1]);
    assert.ok(used.length >= 3);
    for (const s of used) assert.ok(Object.hasOwn(scripts, s), 'package.json no tiene el script "' + s + '"');
  });

  it('la tabla de atajos tiene cada atajo de la ayuda de la consola', () => {
    const html = read(path.join(ROOT, 'chip8.html'));
    const table = /<table class="shortcuts">([^]*?)<\/table>/.exec(html);
    assert.ok(table, 'no encontré la tabla de atajos de la ayuda en chip8.html');
    const keys = [...table[1].matchAll(/<tr><th><kbd>([^<]+)<\/kbd>/g)].map((m) => m[1]);
    assert.ok(keys.length >= 8, 'atajos de la ayuda: ' + keys.length);
    const start = md.indexOf('### Atajos');
    assert.ok(start >= 0, 'el README no tiene la sección "### Atajos"');
    const firstCells = [];
    for (const line of md.slice(start).split('\n').slice(1)) {
      if (line.startsWith('|')) firstCells.push(line.split('|')[1].trim());
      else if (firstCells.length) break;
    }
    for (const k of keys) {
      assert.ok(firstCells.some((c) => c === k || c.startsWith(k + ' ')), 'falta el atajo «' + k + '» en la tabla de atajos del README');
    }
  });

  it('la cantidad de archivos de prueba y de escenarios E2E que dice es la de verdad', () => {
    const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js'));
    const prose = md.replace(/\s+/g, ' ');
    const files = /pruebas\*\* en (\d+) archivos/.exec(prose);
    assert.ok(files, 'el README no dice en cuántos archivos están las pruebas');
    assert.equal(Number(files[1]), testFiles.length, 'archivos de prueba');
    const scenarios = (read(path.join(ROOT, 'tools', 'e2e.js')).match(/^scenario\(\d+,/gm) || []).length;
    const e2e = /corre (\d+) escenarios/.exec(prose);
    assert.ok(e2e, 'el README no dice cuántos escenarios E2E hay');
    assert.equal(Number(e2e[1]), scenarios, 'escenarios de tools/e2e.js');
  });
});

// ---------------------------------------------------------------------------
// docs/DESARROLLO.md
// ---------------------------------------------------------------------------

describe('docs/DESARROLLO.md', () => {
  const md = read(path.join(DOCS, 'DESARROLLO.md'));
  const html = read(path.join(ROOT, 'chip8.html'));

  // El texto de una sección "### N.M ..." hasta la próxima de nivel 2 o 3.
  function section(number) {
    const lines = md.split('\n');
    const start = lines.findIndex((l) => l.startsWith('### ' + number + ' '));
    assert.ok(start >= 0, 'falta la sección ' + number);
    let end = start + 1;
    while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++;
    return lines.slice(start, end).join('\n');
  }

  it('usa finales de línea LF y no quedaron marcas pendientes', () => {
    assert.ok(!md.includes('\r'));
    assert.ok(!md.includes('⟦'), 'quedó una marca ⟦...⟧ sin completar');
  });

  it('los enlaces llevan a archivos y a anclas que existen (propias, del manual, del tutorial y del README)', () => {
    const anchors = {
      '': anchorsOf(md),
      'MANUAL.md': anchorsOf(read(MANUAL_PATH)),
      'TUTORIAL.md': anchorsOf(read(TUTORIAL_PATH)),
      '../README.md': anchorsOf(read(README_PATH)),
    };
    let checked = 0;
    for (const link of linksOf(md)) {
      if (isExternal(link)) continue;
      const [file, anchor] = link.split('#');
      if (file) assert.ok(fs.existsSync(path.join(DOCS, file)), 'enlace roto: ' + link);
      if (anchor !== undefined) {
        assert.ok(Object.hasOwn(anchors, file), 'enlace con ancla a un archivo que este test no revisa: ' + link);
        assert.ok(anchors[file].has(anchor), 'ancla inexistente' + (file ? ' en ' + file : '') + ': #' + anchor);
      }
      checked++;
    }
    assert.ok(checked >= 60, 'enlaces revisados: ' + checked);
  });

  it('el índice enlaza cada sección numerada, en orden', () => {
    const sections = [...md.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => '#' + slug(m[1] + '. ' + m[2]));
    const index = md.slice(md.indexOf('## Índice'), md.indexOf('\n---', md.indexOf('## Índice')));
    const listed = [...index.matchAll(/\]\((#[^)]+)\)/g)].map((m) => m[1]);
    assert.deepEqual(listed, sections);
  });

  it('la tabla de 4.21 nombra cada miembro de window.chip8', () => {
    const api = /window\.chip8 = \{([^]*?)\n {2}\};/.exec(html);
    assert.ok(api, 'no encontré window.chip8 en chip8.html');
    const members = [...api[1].matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
    assert.ok(members.length >= 40, 'miembros de window.chip8: ' + members.length);
    const text = section('4.21');
    for (const m of members) {
      assert.match(text, new RegExp('`' + m + '[`(]'), 'la tabla de window.chip8 (4.21) no nombra «' + m + '»');
    }
  });

  it('la tabla de 3.1 nombra cada clave de Chip8Core, y dice cuántas son', () => {
    const keys = Object.keys(loadCore());
    const text = section('3.1');
    for (const k of keys) {
      assert.match(text, new RegExp('`' + k + '[`(]'), 'la tabla de Chip8Core (3.1) no nombra «' + k + '»');
    }
    assert.ok(text.includes('con ' + keys.length + ' claves'), 'la sección 3.1 no dice que Chip8Core tiene ' + keys.length + ' claves');
  });

  it('las claves de localStorage que cita son las de chip8.html, y están todas', () => {
    const cited = new Set([...md.matchAll(/'(chip8-consola\.[a-z]+)'/g)].map((m) => m[1]));
    const used = new Set([...html.matchAll(/_KEY = '(chip8-consola\.[a-z]+)'/g)].map((m) => m[1]));
    assert.ok(used.size >= 3, 'claves de localStorage en chip8.html: ' + used.size);
    for (const k of cited) assert.ok(used.has(k), 'chip8.html no usa la clave ' + k);
    for (const k of used) assert.ok(cited.has(k), 'el documento no nombra la clave ' + k);
  });

  it('la tabla de 6.2 tiene una fila por cada tests/*.test.js', () => {
    const text = section('6.2');
    for (const f of fs.readdirSync(path.join(ROOT, 'tests')).filter((n) => n.endsWith('.test.js'))) {
      assert.ok(text.includes('| `tests/' + f + '` |'), 'falta tests/' + f + ' en la tabla de 6.2');
    }
  });

  it('la tabla de 6.7 tiene una fila por escenario de tools/e2e.js, en orden', () => {
    const numbers = [...read(path.join(ROOT, 'tools', 'e2e.js')).matchAll(/^scenario\((\d+),/gm)].map((m) => Number(m[1]));
    assert.ok(numbers.length >= 24, 'escenarios en tools/e2e.js: ' + numbers.length);
    const rows = [...section('6.7').matchAll(/^\| (\d+) \| /gm)].map((m) => Number(m[1]));
    assert.deepEqual(rows, numbers, 'las filas de la tabla de 6.7 no son los escenarios de tools/e2e.js');
  });

  // Una constante de la interfaz (var NOMBRE = valor;), evaluada.
  function uiConst(name) {
    const m = new RegExp('\\bvar ' + name + ' = ([^;]+);').exec(html);
    assert.ok(m, 'chip8.html ya no define ' + name);
    return Function('"use strict"; return (' + m[1] + ');')();
  }
  // Los atajos de la tabla de la ayuda de la consola: Espacio, N, ..., ↑ (las flechas), Esc.
  function helpShortcuts() {
    const table = /<table class="shortcuts">([^]*?)<\/table>/.exec(html);
    assert.ok(table, 'no encontré la tabla de atajos de la ayuda en chip8.html');
    const keys = [...table[1].matchAll(/<tr><th><kbd>([^<]+)<\/kbd>/g)].map((m) => m[1]);
    assert.ok(keys.length >= 10, 'atajos de la ayuda: ' + keys.length);
    return keys;
  }
  const asWord = (text, word) => new RegExp('(^|[\\s(*])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s),.*]|$)').test(text);

  it('la tabla de 3.11 nombra cada campo de saveState, y los tamaños del texto son los de encodeState', () => {
    const { encodeState } = loadCore();
    const text = section('3.11');
    const prose = text.replace(/\s+/g, ' ');
    const fresh = new Chip8().saveState();
    for (const k of Object.keys(fresh)) assert.match(text, new RegExp('`' + k + '`'), 'la tabla de 3.11 no nombra el campo «' + k + '»');
    const size = (platform) => encodeState(new Chip8({ platform }).saveState()).length;
    assert.ok(prose.includes('un CHIP-8 recién creado ocupa ' + size('chip8') + ' y un XO-CHIP, ' + size('xochip')),
      'recién creados: ' + size('chip8') + ' y ' + size('xochip'));
    // Los cartuchos, como los deja la consola de fábrica: perfil COSMAC VIP, 15 IPF, 10 s.
    const sizes = {};
    for (const d of loadDemos()) {
      const cpu = new Chip8({ platform: d.platform || 'chip8', random: () => 0 });
      cpu.loadRom(hexToBytes(d.hex));
      for (let f = 0; f < 600; f++) cpu.runFrame(15);
      sizes[d.id] = { name: d.name, platform: d.platform || 'chip8', size: encodeState(cpu.saveState()).length };
    }
    const chip8 = Object.values(sizes).filter((s) => s.platform === 'chip8').sort((a, b) => a.size - b.size);
    const small = chip8[0], big = chip8[chip8.length - 1];
    assert.ok(prose.includes('de ' + small.size + ' (' + small.name + ') a ' + big.size + ' (' + big.name + '), y *Planos*, ' + sizes.planos.size),
      'cartuchos: ' + JSON.stringify(sizes));
    const full = new Chip8({ platform: 'xochip' });
    full.memory.fill(0x55);
    const fullText = encodeState(full.saveState());
    assert.ok(prose.includes('sin un solo cero, ' + spanishInt(fullText.length) + ' (la memoria sola, en base64, son ' +
      spanishInt(JSON.parse(fullText).memory.length) + ')'));
    // Las rachas de ceros sueltos: el peor caso posible no llega a 150.000 caracteres ni al tope de la interfaz.
    const worst = new Chip8({ platform: 'xochip' });
    worst.loadRom([0x00, 0xFF, 0x12, 0x02]); // HIGH: la pantalla de 128×64
    worst.step();
    for (let i = 0; i < worst.memory.length; i += 2) worst.memory[i] = 0xAA;
    for (let i = 0; i < worst.display.length; i += 2) worst.display[i] = 3;
    const worstSize = encodeState(worst.saveState()).length;
    assert.ok(worstSize < 150000 && worstSize < uiConst('STATE_TEXT_MAX'), 'el peor caso ocupa ' + worstSize);
    assert.ok(prose.includes('no llega a 150.000 caracteres, debajo del tope de ' + spanishInt(uiConst('STATE_TEXT_MAX'))));
  });

  it('el ejemplo de la compresión de 3.11 es el que da encodeState', () => {
    const { encodeState } = loadCore();
    const lines = md.split('\n');
    const at = lines.indexOf('<!-- verificar: compresion -->');
    assert.ok(at >= 0 && lines[at + 1] === '```', 'falta el bloque marcado con <!-- verificar: compresion -->');
    const [shown, note] = lines[at + 2].split(/\s{3,}/);
    const state = new Chip8().saveState();
    state.memory.fill(0);
    state.memory[0x200] = 7;
    state.memory[0x204] = 9;
    const json = JSON.parse(encodeState(state));
    const packed = [...Buffer.from(json.memory, 'base64')].map((b) => hex(b, 2));
    assert.deepEqual(shown.split(/\s+/), packed, 'la memoria comprimida del ejemplo');
    // Las rachas y su largo en base 128 (LEB128 sin signo).
    const leb = (n) => {
      const out = [];
      for (; n >= 0x80; n >>>= 7) out.push(hex((n & 0x7F) | 0x80, 2));
      out.push(hex(n, 2));
      return out.join(' ');
    };
    const runs = [0x200, 3, state.memory.length - 0x205];
    assert.equal(note, runs.map((n, i) => (i === runs.length - 1 ? 'y ' : '') + n + ' = ' + leb(n)).join(', ').replace(', y', ' y') + ' en base 128');
    const prose = section('3.11').replace(/\s+/g, ' ');
    assert.ok(prose.includes('(' + runs[0] + ' ceros, el 7, ' + runs[1] + ' ceros, el 9 y ' + runs[2] + ' ceros)'));
    assert.ok(prose.includes('`"memory":"' + json.memory + '"`'), 'el texto de la memoria: ' + json.memory);
    const empty = JSON.parse(encodeState(new Chip8().saveState())).display;
    assert.ok(prose.includes('`"display":"' + empty + '"`'), 'el texto de una pantalla vacía: ' + empty);
    assert.ok(prose.includes('(2048 ceros: `' + [...Buffer.from(empty, 'base64')].map((b) => hex(b, 2)).join(' ') + '`)'));
  });

  it('los topes del rebobinado que cita son los de RewindBuffer y los de la interfaz', () => {
    const { RewindBuffer } = loadCore();
    const prose = md.replace(/\s+/g, ' ');
    const rb = new RewindBuffer();
    const MB = 1024 * 1024;
    const frames = uiConst('REWIND_FRAMES'), maxBytes = uiConst('REWIND_MAX_BYTES');
    assert.ok(prose.includes('de fábrica, ' + rb.maxEntries + ' fotos y ' + rb.maxBytes / MB + ' MB'), 'los valores por defecto de RewindBuffer');
    assert.ok(prose.includes('la interfaz usa ' + frames + ' y ' + maxBytes / MB + ' MB'));
    assert.ok(prose.includes(frames + ' fotos (' + frames / 60 + ' s) y ' + maxBytes / MB + ' MB entre todas'));
  });

  it('la tabla de constantes de 4.1 tiene los valores de chip8.html', () => {
    const rows = new Map(tableAfter(section('4.1'), '| Constante | Valor | Para qué |').map((r) => [r[0], r[1]]));
    const list = (a) => '`[' + a.map((s) => "'" + s + "'").join(', ') + ']`';
    const want = [
      ['`STATE_SLOTS`, `STATE_TEXT_MAX`', list(uiConst('STATE_SLOTS')) + ' y ' + spanishInt(uiConst('STATE_TEXT_MAX'))],
      ['`STATE_TAG_MS`, `STATE_TIMES_MS`', uiConst('STATE_TAG_MS') + ' ms y ' + uiConst('STATE_TIMES_MS') / 1000 + ' s'],
      ['`REWIND_FRAMES`, `REWIND_MAX_BYTES`', uiConst('REWIND_FRAMES') + ' y ' + uiConst('REWIND_MAX_BYTES') / (1024 * 1024) + ' MB'],
      ['`REWIND_STEP`, `REWIND_HOLD_MS`', uiConst('REWIND_STEP') + ' y ' + uiConst('REWIND_HOLD_MS') + ' ms'],
      ['`TURBO_FACTOR`', String(uiConst('TURBO_FACTOR'))],
      ['`SHOT_WIDTH`', String(uiConst('SHOT_WIDTH'))],
      ['`ROMS_MAX`, `ROM_SAVE_MS`, `FLAGS_CHECK_MS`', uiConst('ROMS_MAX') + ', ' + uiConst('ROM_SAVE_MS') + ' ms y ' + uiConst('FLAGS_CHECK_MS') + ' ms'],
      ['`LIBRARY_MAX_ITEMS`, `LIBRARY_MAX_CHARS`',
        uiConst('LIBRARY_MAX_ITEMS') + ' y ' + String(uiConst('LIBRARY_MAX_CHARS')).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')],
    ];
    for (const [names, value] of want) {
      assert.ok(rows.has(names), 'la tabla de 4.1 no tiene la fila ' + names);
      assert.equal(rows.get(names), value, names);
    }
  });

  it('la tabla de 4.19 tiene cada campo de los ajustes guardados (defaultSettings)', () => {
    const m = /function defaultSettings\(\) \{\s*return \{([^]*?)\};/.exec(html);
    assert.ok(m, 'no encontré los ajustes de fábrica de defaultSettings en chip8.html');
    const fields = [...m[1].replace(/\/\/.*$/gm, '').matchAll(/(\w+):/g)].map((x) => x[1]);
    assert.ok(fields.includes('rewind') && fields.length >= 15, 'campos: ' + fields.join(', '));
    const rows = tableAfter(section('4.19'), '| Campo | De fábrica | Validación |').map((r) => r[0]);
    for (const f of fields) {
      assert.ok(rows.some((cell) => cell.split(', ').includes('`' + f + '`')), 'la tabla de 4.19 no tiene el campo «' + f + '»');
    }
  });

  it('los atajos de 4.6 y de 9.7 son los de la ayuda de la consola', () => {
    const keys = helpShortcuts();
    const atajos = /\*\*Atajos\.\*\*([^]*?)\n\n/.exec(section('4.6'));
    assert.ok(atajos, 'falta el párrafo **Atajos.** en 4.6');
    const text = atajos[1].replace(/\s+/g, ' ');
    for (const k of keys) {
      const word = k === '↑' ? 'flechas' : k;
      assert.ok(asWord(text, word), 'el párrafo de los atajos de 4.6 no nombra «' + word + '»');
    }
    // 9.7: las teclas del mapa no pueden chocar con ningún atajo de letra, Espacio o Retroceso.
    const clash = /choque con los atajos \(([^)]*)\)/.exec(section('9.7').replace(/\s+/g, ' '));
    assert.ok(clash, 'falta la lista de atajos de 9.7');
    for (const k of keys.filter((k) => k !== '↑' && k !== 'Esc')) {
      assert.ok(asWord(clash[1], k), 'la lista de atajos de 9.7 no nombra «' + k + '»');
    }
  });

  it('la tabla de 6.3 tiene cada archivo de prueba y su total suma bien', () => {
    const text = section('6.3');
    const rows = tableAfter(text, '| Archivo | Pruebas |');
    const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((n) => n.endsWith('.test.js')).map((n) => '`tests/' + n + '`');
    const counts = new Map(rows.filter((r) => r[0].startsWith('`')).map((r) => [r[0], Number(r[1])]));
    assert.deepEqual([...counts.keys()].sort(), files.sort(), 'los archivos de la tabla de 6.3');
    const total = rows.find((r) => r[0] === '**Total**');
    assert.ok(total, 'falta la fila del total');
    const sum = [...counts.values()].reduce((a, b) => a + b, 0);
    assert.equal(Number(total[1].replace(/\*/g, '')), sum, 'el total de la tabla de 6.3');
    const said = /\*\*(\d+) pruebas en (\d+) grupos\*\*/.exec(text);
    assert.ok(said, 'la sección 6.3 no dice cuántas pruebas hay');
    assert.equal(Number(said[1]), sum, 'el total que dice el texto de 6.3');
  });
});
