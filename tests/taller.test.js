'use strict';
// Tests de los fuentes del Taller: lo que tools/embed-roms.js incrusta en el bloque
// chip8-roms, después de CHIP8_DEMOS, como globalThis.CHIP8_SOURCES = { demos, examples, octo }.
//   - demos: el fuente de cada cartucho (roms/*.asm), por su id y en el orden de @order;
//   - examples: los ejemplos del tutorial (docs/ejemplos/*.asm), con su nombre, su
//     descripción, su plataforma (solo si tienen @platform) y su fuente;
//   - octo: los ejemplos en el lenguaje de Octo (docs/ejemplos/octo/*.8o), con su nombre, su
//     descripción y su fuente;
//   - cada fuente es el archivo tal cual (con LF) y se ensambla (o se compila) a su .ch8;
//   - embed-roms.js con los ejemplos: @platform y @description, errores en castellano
//     (una etiqueta que no vale, un ejemplo que no ensambla), CRLF, --check, y sin la
//     carpeta docs/ejemplos/; con los de Octo: el compilador de chip8.html, su .ch8 al
//     lado, su descripción, @ipf y los errores.
// El Taller (la interfaz) se prueba en el navegador: escenarios 51 a 107 de tools/e2e.js.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { ROOT, loadDemos, loadSources, loadAssembler, loadOcto, extractScript } = require('./harness');

const { assemble, headerTags } = loadAssembler();
const EJEMPLOS = path.join(ROOT, 'docs', 'ejemplos');
const ROMS = path.join(ROOT, 'roms');

const read = (file) => fs.readFileSync(file, 'utf8');
const exampleFiles = () => fs.readdirSync(EJEMPLOS).filter((f) => f.endsWith('.asm')).sort();

describe('CHIP8_SOURCES: los fuentes del Taller en chip8.html', () => {
  const sources = loadSources();

  it('trae el fuente de cada cartucho, en el orden de CHIP8_DEMOS, igual al archivo', () => {
    const demos = loadDemos();
    assert.deepEqual(Object.keys(sources.demos), demos.map((d) => d.id));
    for (const d of demos) {
      const file = path.join(ROMS, d.id + '.asm');
      assert.equal(sources.demos[d.id], read(file), d.id);
      // Y ese fuente da los bytes del cartucho (en su plataforma).
      const bytes = assemble(sources.demos[d.id], { xochip: d.platform === 'xochip' }).bytes;
      assert.equal(Buffer.from(bytes).toString('hex').toUpperCase(), d.hex, d.id);
    }
  });

  it('trae los once ejemplos del tutorial, en orden, con su nombre, su descripción y su fuente', () => {
    const files = exampleFiles();
    assert.equal(files.length, 11);
    assert.deepEqual(sources.examples.map((x) => x.name), files);
    for (const x of sources.examples) {
      const text = read(path.join(EJEMPLOS, x.name));
      assert.equal(x.source, text, x.name);
      // La descripción es lo que sigue al nombre del archivo en el primer renglón.
      const first = text.split('\n')[0];
      assert.equal(first, '; ' + x.name + ' — ' + x.description, x.name);
      // Ningún ejemplo lleva @platform: son de CHIP-8, y la entrada no tiene el campo.
      assert.equal(headerTags(text).platform, undefined, x.name);
      assert.deepEqual(Object.keys(x), ['name', 'description', 'source'], x.name);
      // Se ensambla a su .ch8.
      const ch8 = fs.readFileSync(path.join(EJEMPLOS, x.name.replace(/\.asm$/, '.ch8')));
      assert.ok(ch8.equals(Buffer.from(assemble(x.source).bytes)), x.name);
    }
    assert.equal(sources.examples[2].description, 'Cazamonedas, etapa A: dibujar un sprite propio');
  });

  it('trae los ejemplos en Octo (docs/ejemplos/octo/*.8o), con su descripción, y cada uno compila a su .ch8', () => {
    const { compile } = loadOcto();
    const files = fs.readdirSync(path.join(EJEMPLOS, 'octo')).filter((f) => f.endsWith('.8o')).sort();
    assert.deepEqual(files, ['pong.8o']);
    assert.deepEqual(sources.octo.map((x) => x.name), files);
    for (const x of sources.octo) {
      assert.deepEqual(Object.keys(x), ['name', 'description', 'source'], x.name);
      assert.equal(x.source, read(path.join(EJEMPLOS, 'octo', x.name)), x.name);
      const r = compile(x.source);
      assert.deepEqual(r.errors, [], x.name);
      const ch8 = fs.readFileSync(path.join(EJEMPLOS, 'octo', x.name.replace(/\.8o$/, '.ch8')));
      assert.ok(ch8.equals(Buffer.from(r.result.bytes)), x.name);
    }
    assert.equal(sources.octo[0].description, 'Pong para dos, de la nota de Hackaday «CHIP-8: The Pong Game\'s Afoot»');
  });

  it('los textos van escapados: el bloque no tiene ni un «<» (un fuente con «<», como Atrapa, no puede cerrar el <script>)', () => {
    assert.ok(read(path.join(ROMS, 'atrapa.asm')).includes('<'), 'atrapa.asm ya no tiene un «<»: la prueba no prueba nada');
    const { code } = extractScript('chip8-roms');
    assert.ok(!code.includes('<'));
    assert.ok(code.includes('\\u003c'));
  });

  it('el bloque sigue empezando como antes: el encabezado de CHIP8_DEMOS y, después, CHIP8_SOURCES', () => {
    const { code } = extractScript('chip8-roms');
    const lines = code.split('\n');
    assert.equal(lines[1], '/* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */');
    assert.equal(lines[2], 'globalThis.CHIP8_DEMOS = [');
    const at = lines.indexOf('globalThis.CHIP8_SOURCES = {');
    assert.ok(at > 2 && lines[at - 1].startsWith('/* También GENERADO: los fuentes del Taller'));
    // Evaluado aparte, define los dos globales y nada más.
    const sandbox = {};
    vm.runInNewContext(code, sandbox);
    assert.deepEqual(Object.keys(sandbox), ['CHIP8_DEMOS', 'CHIP8_SOURCES']);
  });
});

// Una copia de embed-roms.js (con chip8asm.js y el chip8.html de donde saca el ensamblador y el
// compilador de Octo) en una carpeta temporal, con sus propios cartuchos y ejemplos (examples: null
// = sin la carpeta; octo: los ejemplos en Octo, en docs/ejemplos/octo/).
function sandbox({ roms, examples, octo }, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-embed-'));
  try {
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.mkdirSync(path.join(dir, 'roms'));
    for (const f of ['embed-roms.js', 'chip8asm.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
    fs.copyFileSync(path.join(ROOT, 'chip8.html'), path.join(dir, 'chip8.html'));
    for (const [name, text] of Object.entries(roms)) fs.writeFileSync(path.join(dir, 'roms', name), text);
    if (examples) {
      fs.mkdirSync(path.join(dir, 'docs', 'ejemplos'), { recursive: true });
      for (const [name, text] of Object.entries(examples)) fs.writeFileSync(path.join(dir, 'docs', 'ejemplos', name), text);
    }
    if (octo) {
      fs.mkdirSync(path.join(dir, 'docs', 'ejemplos', 'octo'), { recursive: true });
      for (const [name, text] of Object.entries(octo)) fs.writeFileSync(path.join(dir, 'docs', 'ejemplos', 'octo', name), text);
    }
    const html = path.join(dir, 'pagina.html');
    fs.writeFileSync(html, '<script id="chip8-roms">\n</script>\n');
    const run = (...args) => spawnSync(process.execPath, [path.join(dir, 'tools', 'embed-roms.js'), '--html', html, ...args], { cwd: dir, encoding: 'utf8' });
    const block = () => {
      const text = read(html);
      const start = text.indexOf('<script id="chip8-roms">') + '<script id="chip8-roms">'.length;
      return text.slice(start, text.indexOf('</script>', start));
    };
    const evaluate = () => {
      const box = {};
      vm.runInNewContext(block(), box);
      return JSON.parse(JSON.stringify(box.CHIP8_SOURCES));
    };
    return fn({ run, block, evaluate, html, dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const DEMO = '; @name Una\n; @description Una demo.\n; @controls Ninguno.\n; @order 1\n\nfin: JP fin\n';

describe('tools/embed-roms.js y los ejemplos del tutorial', () => {
  it('un ejemplo con @platform xochip se ensambla para 64 KB y su entrada lo dice; @description reemplaza la del primer renglón', () => {
    const xo = '; grande.asm — un ejemplo de XO-CHIP\n; @platform xochip\n\n        LD I, LONG datos\nfin:    JP fin\nrelleno: DB ' +
      new Array(3990).fill('0').join(', ') + '\ndatos:  DB 0xAA\n';
    const desc = '; otro.asm — esto no\n; @description Esta sí.\nCLS\nfin: JP fin\n';
    sandbox({ roms: { 'una.asm': DEMO }, examples: { 'grande.asm': xo, 'otro.asm': desc } }, ({ run, evaluate }) => {
      const res = run();
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /Ejemplos del tutorial para el Taller \(2\):\n {2}grande\.asm\s+3997 bytes \(xochip\)\n {2}otro\.asm\s+4 bytes/);
      const src = evaluate();
      assert.deepEqual(src.examples.map((x) => [x.name, x.description, x.platform]), [
        ['grande.asm', 'un ejemplo de XO-CHIP', 'xochip'],
        ['otro.asm', 'Esta sí.', undefined],
      ]);
      assert.equal(src.examples[0].source, xo);
      assert.deepEqual(Object.keys(src.demos), ['una']);
      assert.equal(src.demos.una, DEMO);
    });
  });

  it('un ejemplo sin el nombre del archivo en el primer renglón usa ese renglón; sin comentarios, no tiene descripción', () => {
    sandbox({ roms: { 'una.asm': DEMO }, examples: { 'a.asm': '\n;\n; @platform chip8\n; Un título suelto\nCLS\n', 'b.asm': 'CLS\n' } }, ({ run, evaluate }) => {
      assert.equal(run().status, 0);
      assert.deepEqual(evaluate().examples.map((x) => [x.name, x.description, x.platform]), [['a.asm', 'Un título suelto', 'chip8'], ['b.asm', '', undefined]]);
    });
  });

  it('una etiqueta @platform que no vale, o un ejemplo que no ensambla, es un error en castellano y no escribe nada', () => {
    for (const [text, msg] of [
      ['; @platform xo\nCLS\n', 'embed-roms: docs/ejemplos/malo.asm: @platform tiene que ser chip8, schip o xochip (dice "xo")'],
      ['CLS\nXYZ\n', 'embed-roms: docs/ejemplos/malo.asm: Línea 2: instrucción desconocida: "XYZ"'],
      ['; nada más que un comentario\n', 'embed-roms: docs/ejemplos/malo.asm: el programa está vacío'],
    ]) {
      sandbox({ roms: { 'una.asm': DEMO }, examples: { 'malo.asm': text } }, ({ run, html }) => {
        const before = read(html);
        for (const args of [[], ['--check']]) {
          const res = run(...args);
          assert.equal(res.status, 1, msg);
          assert.equal(res.stderr.trim(), msg);
        }
        assert.equal(read(html), before);
      });
    }
    sandbox({ roms: { 'una.asm': DEMO }, examples: { 'Mal Nombre.asm': 'CLS\n' } }, ({ run }) => {
      const res = run();
      assert.equal(res.status, 1);
      assert.match(res.stderr, /docs\/ejemplos\/Mal Nombre\.asm: el nombre del archivo solo puede tener minúsculas, dígitos/);
    });
  });

  it('los fuentes con CRLF quedan con LF, y --check se da cuenta de un ejemplo cambiado', () => {
    sandbox({ roms: { 'una.asm': DEMO.replace(/\n/g, '\r\n') }, examples: { 'a.asm': '; a.asm — uno\r\nCLS\r\n' } }, ({ run, evaluate, dir }) => {
      assert.equal(run().status, 0);
      const src = evaluate();
      assert.equal(src.demos.una, DEMO);
      assert.equal(src.examples[0].source, '; a.asm — uno\nCLS\n');
      assert.equal(run('--check').status, 0);
      fs.writeFileSync(path.join(dir, 'docs', 'ejemplos', 'a.asm'), '; a.asm — uno\nCLS\nCLS\n');
      const stale = run('--check');
      assert.equal(stale.status, 1);
      assert.match(stale.stderr, /el bloque <script id="chip8-roms"> de pagina\.html está desactualizado/);
    });
  });

  it('sin la carpeta docs/ejemplos/ no hay ejemplos (y lo dice), y los cartuchos se incrustan igual', () => {
    sandbox({ roms: { 'una.asm': DEMO }, examples: null }, ({ run, evaluate }) => {
      const res = run();
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /Ejemplos del tutorial para el Taller \(0, no está docs\/ejemplos\/\)/);
      assert.match(res.stdout, /Ejemplos en Octo para el Taller \(0, no está docs\/ejemplos\/octo\/\)/);
      assert.deepEqual(evaluate(), { demos: { una: DEMO }, examples: [], octo: [] });
    });
  });
});

describe('tools/embed-roms.js y los ejemplos en Octo', () => {
  const HOLA = '# hola.8o — Un sprite en el medio\n# @ipf 200\n\n: main\n  i := hex v0\n  sprite v0 v0 5\n  loop again\n';
  const XO = '# Otro sin el nombre del archivo\n: main\n  plane 3\n  loop again\n';

  it('cada .8o se compila con el compilador de chip8.html: su ROM queda al lado (.ch8) y el bloque lleva su nombre, su descripción y su fuente', () => {
    sandbox({ roms: { 'una.asm': DEMO }, examples: {}, octo: { 'hola.8o': HOLA, 'xo.8o': XO } }, ({ run, evaluate, dir }) => {
      const res = run();
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /Ejemplos en Octo para el Taller \(2\):\n {2}hola\.8o\s+6 bytes \(chip8\)\n {2}xo\.8o\s+4 bytes \(xochip\)/);
      assert.match(res.stdout, /Escribí roms\/una\.ch8, docs\/ejemplos\/octo\/hola\.ch8, docs\/ejemplos\/octo\/xo\.ch8\./);
      assert.deepEqual(evaluate().octo, [
        { name: 'hola.8o', description: 'Un sprite en el medio', source: HOLA },
        { name: 'xo.8o', description: 'Otro sin el nombre del archivo', source: XO },
      ]);
      // La ROM: el salto a main no hace falta (main está en 0x200), F029, D005 y el bucle (un salto a sí mismo).
      assert.equal(fs.readFileSync(path.join(dir, 'docs', 'ejemplos', 'octo', 'hola.ch8')).toString('hex'), 'f029d0051204');
      assert.equal(run('--check').status, 0);
      fs.writeFileSync(path.join(dir, 'docs', 'ejemplos', 'octo', 'hola.ch8'), Buffer.from([0]));
      const stale = run('--check');
      assert.equal(stale.status, 1);
      assert.match(stale.stderr, /docs\/ejemplos\/octo\/hola\.ch8 no coincide con docs\/ejemplos\/octo\/hola\.8o/);
    });
  });

  it('un ejemplo que no compila o con un @ipf que no vale es un error en castellano, con su renglón, y no escribe nada', () => {
    for (const [text, msg] of [
      [': main\n  v0 := 300\n', 'embed-roms: docs/ejemplos/octo/malo.8o: Línea 2: 300 no entra en un byte: tiene que estar entre -128 y 255.'],
      ['# @ipf rápido\n: main\n  loop again\n', 'embed-roms: docs/ejemplos/octo/malo.8o: @ipf tiene que ser un número de 1 a 10000 (dice "rápido")'],
      ['# @ipf 20000\n: main\n  loop again\n', 'embed-roms: docs/ejemplos/octo/malo.8o: @ipf tiene que ser un número de 1 a 10000 (dice "20000")'],
    ]) {
      sandbox({ roms: { 'una.asm': DEMO }, examples: {}, octo: { 'malo.8o': text } }, ({ run, html, dir }) => {
        const before = read(html);
        for (const args of [[], ['--check']]) {
          const res = run(...args);
          assert.equal(res.status, 1, msg);
          assert.equal(res.stderr.trim(), msg);
        }
        assert.equal(read(html), before);
        assert.ok(!fs.existsSync(path.join(dir, 'docs', 'ejemplos', 'octo', 'malo.ch8')));
      });
    }
  });
});
