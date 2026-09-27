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
//   - Un ejemplo que termina en el bucle "fin: JP fin" es un programa completo:
//     se ejecuta en el núcleo real (con cada perfil de quirks) y tiene que
//     llegar a ese bucle sin que la máquina se detenga.
//
// Además se verifican los enlaces: cada #ancla del manual lleva a uno de sus
// encabezados, los enlaces al tutorial llevan a encabezados que existen y los
// enlaces a archivos (en el manual y en el README) apuntan a archivos que
// existen. docs/DESARROLLO.md lo escribe otra parte del proyecto: mientras no
// exista, el test de ese enlace queda salteado (y no falla).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadCore, loadAssembler } = require('./harness');

const { Chip8, QUIRK_PRESETS } = loadCore();
const { assemble } = loadAssembler();

const DOCS = path.join(ROOT, 'docs');
const MANUAL_PATH = path.join(DOCS, 'MANUAL.md');
const TUTORIAL_PATH = path.join(DOCS, 'TUTORIAL.md');
const README_PATH = path.join(ROOT, 'README.md');
const PENDING = ['DESARROLLO.md']; // archivos de docs/ que escribe otra parte del proyecto

const FRAGMENT_RE = /^;\s*Fragmento\b/i;
const UNKNOWN_LABEL_RE = /etiqueta o constante desconocida: "([^"]+)"/;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

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

function asmBlocks(md) {
  return parseBlocks(md)
    .filter((b) => b.lang === 'asm')
    .map((b) => ({ ...b, fragment: FRAGMENT_RE.test((b.lines[0] || '').trim()) }));
}

// Ensambla un fragmento agregando, de a una, las etiquetas que el ensamblador
// dice que no conoce. Devuelve el resultado y la lista de etiquetas agregadas.
function assembleWithStubs(text, where) {
  const missing = [];
  for (;;) {
    const source = text + '\n' + missing.map((l) => l + ':').join('\n') + '\n';
    try {
      return { result: assemble(source), missing };
    } catch (err) {
      const m = UNKNOWN_LABEL_RE.exec(err.message);
      assert.ok(m, where + ': no ensambla (y no por una etiqueta que falta): ' + err.message);
      assert.ok(!missing.includes(m[1]), where + ': la etiqueta "' + m[1] + '" sigue sin resolverse');
      missing.push(m[1]);
      assert.ok(missing.length <= 10, where + ': demasiadas etiquetas sin definir');
    }
  }
}

// Comentarios con que empieza el bloque (hasta la primera línea que no es comentario).
function leadingComments(lines) {
  const out = [];
  for (const l of lines) {
    if (!/^\s*;/.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
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

  it('tiene bloques asm, y algunos son fragmentos', () => {
    assert.ok(blocks.length >= 40, 'bloques asm: ' + blocks.length);
    assert.ok(blocks.some((b) => b.fragment));
  });

  it('cada ejemplo que no es un fragmento se ensambla tal cual', () => {
    for (const b of blocks.filter((x) => !x.fragment)) {
      try {
        assemble(b.text);
      } catch (err) {
        assert.fail('línea ' + b.line + ': el ejemplo no ensambla: ' + err.message +
          '\n(si es un pedazo de un programa más grande, empezalo con "; Fragmento: ...")');
      }
    }
  });

  it('cada fragmento se ensambla cuando se definen las etiquetas que usa, y las nombra al empezar', () => {
    for (const b of blocks.filter((x) => x.fragment)) {
      const where = 'línea ' + b.line;
      const { missing } = assembleWithStubs(b.text, where);
      assert.ok(missing.length > 0,
        where + ': está marcado como fragmento pero ensambla solo (sacale la marca "; Fragmento")');
      const intro = leadingComments(b.lines);
      for (const label of missing) {
        assert.ok(new RegExp('\\b' + label + '\\b').test(intro),
          where + ': el comentario inicial del fragmento no nombra la etiqueta "' + label + '"');
      }
    }
  });

  it('los programas completos (los que terminan en "fin: JP fin") corren hasta ese bucle con cada perfil', () => {
    const complete = blocks.filter((b) => !b.fragment && b.lines.some((l) => /^\s*fin:\s*JP\s+fin\b/i.test(l)));
    assert.ok(complete.length >= 4, 'programas completos: ' + complete.length);
    for (const b of complete) {
      const { bytes, labels } = assemble(b.text);
      for (const [id, preset] of Object.entries(QUIRK_PRESETS)) {
        const cpu = new Chip8({ quirks: preset.quirks, random: () => 0 });
        cpu.loadRom(bytes);
        for (let f = 0; f < 120 && cpu.pc !== labels.fin && !cpu.halted; f++) cpu.runFrame(15);
        assert.ok(!cpu.halted, 'línea ' + b.line + ' (' + id + '): la máquina se detuvo: ' + cpu.error);
        assert.equal(cpu.pc, labels.fin, 'línea ' + b.line + ' (' + id + '): no llegó a "fin"');
      }
    }
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
      } else if (PENDING.includes(file)) {
        continue; // lo verifica el test de abajo
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

  for (const file of PENDING) {
    const exists = fs.existsSync(path.join(DOCS, file));
    it('el enlace a ' + file + ' lleva a un archivo que existe',
      { skip: exists ? false : file + ' todavía no está escrito' }, () => {
        assert.ok(linksOf(md).some((l) => l.split('#')[0] === file));
        assert.ok(exists);
      });
  }
});

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

describe('README.md', () => {
  const md = read(README_PATH);
  const manual = anchorsOf(read(MANUAL_PATH));
  const tutorial = anchorsOf(read(TUTORIAL_PATH));
  const pendingPaths = PENDING.map((f) => 'docs/' + f);

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
      if (pendingPaths.includes(file)) continue;
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
      if (pendingPaths.includes(p)) continue;
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
});
