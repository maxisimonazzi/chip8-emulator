'use strict';
// Tests del ensamblador como bloque de chip8.html (<script id="chip8-asm">) y de
// tools/chip8asm.js, que lo saca de ahí:
//   - el bloque es código puro (solo define globalThis.Chip8Asm) y la herramienta,
//     con require, devuelve las mismas funciones sin dejar el global;
//   - la herramienta sin chip8.html, o con un chip8.html sin el bloque, lo explica en
//     una línea (y --help anda igual);
//   - check() junta los errores sin cambiar lo que se acepta y se rechaza: en cada
//     fuente de los cartuchos y del tutorial, y en cientos de fuentes rotas a
//     propósito, su primer error es el que lanza assemble() y, si assemble() no
//     lanza, devuelve lo mismo; no repite errores por un nombre roto ni por la
//     memoria llena, y se corta en 100;
//   - headerTags(), las etiquetas «; @nombre valor» del encabezado.
// Las demás pruebas del ensamblador (asm.test.js, asm-extendido.test.js) usan el mismo
// bloque, a través de tests/harness.js.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { ROOT, extractScript, loadAssembler } = require('./harness');

const asm = loadAssembler();
const { assemble, check, headerTags } = asm;
const TOOL = path.join(ROOT, 'tools', 'chip8asm.js');

// Las fuentes de verdad del proyecto: los seis cartuchos y los once ejemplos del tutorial.
function sources() {
  const out = [];
  for (const dir of ['roms', path.join('docs', 'ejemplos')]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.asm')).sort()) {
      const text = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
      const tag = headerTags(text).platform;
      out.push({ name: dir + '/' + f, text, xochip: !!tag && tag.value === 'xochip' });
    }
  }
  return out;
}

// Lo que da assemble: { ok, result } o { ok: false, line, message }.
function run(text, options) {
  try {
    return { ok: true, result: assemble(text, options) };
  } catch (e) {
    return { ok: false, line: e.line, message: e.message };
  }
}

// Compara check con assemble para una fuente.
function sameAsAssemble(text, options, where) {
  const a = run(text, options);
  const c = check(text, options);
  if (a.ok) {
    assert.deepEqual(c.errors, [], where + ': assemble no lanza pero check encontró errores');
    assert.equal(c.truncated, false, where);
    assert.deepEqual(c.result, a.result, where + ': el resultado de check no es el de assemble');
  } else {
    assert.ok(c.errors.length >= 1, where + ': assemble lanza («' + a.message + '») y check no encontró nada');
    assert.equal(c.errors[0].message, a.message, where + ': el primer error de check no es el de assemble');
    assert.equal(c.errors[0].line, a.line, where);
    assert.equal(c.result, null, where + ': con errores, result es null');
    for (const e of c.errors) assert.match(e.message, new RegExp('^Línea ' + e.line + ': '), where);
  }
  return { a, c };
}

// Azar reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) % n;
  };
}

describe('el bloque chip8-asm', () => {
  it('es código puro: en un contexto vacío define globalThis.Chip8Asm y nada más, y ensambla ahí', () => {
    const { code } = extractScript('chip8-asm');
    const sandbox = {};
    vm.runInNewContext(code, sandbox);
    assert.deepEqual(Object.keys(sandbox), ['Chip8Asm']);
    assert.deepEqual(Object.keys(sandbox.Chip8Asm).sort(), ['assemble', 'check', 'formatListing', 'headerTags']);
    // Sin los comentarios, el código no nombra el DOM, la consola del navegador ni Node.
    const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(bare, /\b(document|window|console|require|module|process)\b/, 'el ensamblador no toca el DOM, la consola ni Node');
    // Y en ese contexto vacío ensambla y revisa igual (Array.from para compararlo con lo de este contexto).
    for (const s of sources()) {
      const opts = { xochip: s.xochip };
      assert.deepEqual(Array.from(sandbox.Chip8Asm.assemble(s.text, opts).bytes), Array.from(assemble(s.text, opts).bytes), s.name);
      const bad = sandbox.Chip8Asm.check(s.text + '\nCLX\n', opts).errors;
      assert.equal(bad.length, 1, s.name);
      assert.match(bad[0].message, /instrucción desconocida: "CLX"$/, s.name);
    }
  });

  it('su encabezado documenta la API, la sintaxis y las instrucciones', () => {
    const { code } = extractScript('chip8-asm');
    const header = code.slice(code.indexOf('/*'), code.indexOf('*/'));
    for (const s of ['assemble(fuente', 'check(fuente', 'formatListing(listing)', 'headerTags(fuente)', 'SINTAXIS', 'INSTRUCCIONES',
      ' * CHIP-8\n', ' * SUPER-CHIP\n', ' * XO-CHIP\n', 'tools/chip8asm.js']) {
      assert.ok(header.includes(s), 'el encabezado no menciona «' + s.trim() + '»');
    }
  });
});

describe('tools/chip8asm.js saca el ensamblador de chip8.html', () => {
  it('con require devuelve las mismas funciones, que dan lo mismo que el bloque en cada fuente del proyecto', () => {
    const tool = require(TOOL);
    assert.deepEqual(Object.keys(tool).sort(), ['assemble', 'check', 'formatListing', 'headerTags']);
    for (const s of sources()) {
      const opts = { xochip: s.xochip };
      const a = tool.assemble(s.text, opts), b = assemble(s.text, opts);
      assert.ok(a.bytes instanceof Uint8Array, s.name + ': los bytes son una Uint8Array de este proceso');
      assert.deepEqual(a, b, s.name);
      assert.equal(tool.formatListing(a.listing), asm.formatListing(b.listing), s.name);
      assert.deepEqual({ ...tool.headerTags(s.text) }, { ...headerTags(s.text) }, s.name);
    }
  });

  it('require no deja globalThis.Chip8Asm (ni pisa uno que ya estaba)', () => {
    const code = "const t = require(process.argv[1]); console.log(typeof globalThis.Chip8Asm, typeof t.assemble);" +
      "globalThis.Chip8Asm = 'mío'; delete require.cache[require.resolve(process.argv[1])]; require(process.argv[1]); console.log(globalThis.Chip8Asm);";
    const res = spawnSync(process.execPath, ['-e', code, TOOL], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, 'undefined function\nmío\n');
  });

  describe('sin chip8.html, o sin el bloque, lo explica en una línea', () => {
    function sandbox(html, fn) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8asm-sin-html-'));
      try {
        fs.mkdirSync(path.join(dir, 'tools'));
        fs.copyFileSync(TOOL, path.join(dir, 'tools', 'chip8asm.js'));
        if (html !== null) fs.writeFileSync(path.join(dir, 'chip8.html'), html);
        fs.writeFileSync(path.join(dir, 'p.asm'), 'CLS\n');
        const cli = (...args) => spawnSync(process.execPath, [path.join(dir, 'tools', 'chip8asm.js'), ...args], { cwd: dir, encoding: 'utf8' });
        return fn({ dir, cli });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    const clean = (res) => assert.doesNotMatch(res.stderr, /^\s+at |node:|ENOENT/m, res.stderr);

    it('chip8.html no está: sale con 1, sin escribir nada, y --help anda igual', () => {
      sandbox(null, ({ dir, cli }) => {
        const res = cli('p.asm');
        assert.equal(res.status, 1);
        clean(res);
        assert.match(res.stderr.trim(), /^chip8asm: no pude leer ".*chip8\.html", donde está el ensamblador: el archivo no existe$/);
        assert.ok(!fs.existsSync(path.join(dir, 'p.ch8')));
        const help = cli('--help');
        assert.equal(help.status, 0);
        assert.equal(help.stdout.trim(), 'Uso: node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]');
        // Con require, el mismo problema es una excepción con el mismo texto.
        const req = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', path.join(dir, 'tools', 'chip8asm.js')], { encoding: 'utf8' });
        assert.notEqual(req.status, 0);
        assert.match(req.stderr, /no pude leer ".*chip8\.html", donde está el ensamblador/);
      });
    });

    it('chip8.html sin el bloque, o con el bloque roto', () => {
      sandbox('<!doctype html><script id="chip8-core"></script>', ({ cli }) => {
        const res = cli('p.asm');
        assert.equal(res.status, 1);
        assert.equal(res.stderr.trim(), 'chip8asm: chip8.html no tiene el bloque <script id="chip8-asm">, donde está el ensamblador');
      });
      sandbox('<script id="chip8-asm">globalThis.Chip8Asm = {</script>', ({ cli }) => {
        const res = cli('p.asm');
        assert.equal(res.status, 1);
        clean(res);
        assert.match(res.stderr.trim(), /^chip8asm: el bloque <script id="chip8-asm"> de chip8\.html no anda: /);
      });
      sandbox('<script id="chip8-asm">globalThis.Otro = 1;</script>', ({ cli }) => {
        const res = cli('p.asm');
        assert.equal(res.stderr.trim(), 'chip8asm: el bloque <script id="chip8-asm"> de chip8.html no definió globalThis.Chip8Asm');
      });
    });

    it('con un chip8.html al lado, la copia de la herramienta ensambla con ese bloque', () => {
      sandbox(fs.readFileSync(path.join(ROOT, 'chip8.html'), 'utf8'), ({ dir, cli }) => {
        const res = cli('p.asm');
        assert.equal(res.status, 0, res.stderr);
        assert.deepEqual([...fs.readFileSync(path.join(dir, 'p.ch8'))], [0x00, 0xE0]);
      });
    });
  });
});

describe('check(): los errores de una pasada, sin cambiar lo que se acepta', () => {
  it('en cada fuente del proyecto no encuentra errores y devuelve exactamente lo de assemble', () => {
    for (const s of sources()) sameAsAssemble(s.text, { xochip: s.xochip }, s.name);
  });

  it('junta los errores de varios renglones, cada uno con el mensaje de assemble, en el orden de las pasadas', () => {
    const src = 'CLS\nXYZ V0\nLD V1, 300\nJP nada\nLD V0, [I\nfin: JP fin\n';
    const c = check(src);
    assert.deepEqual(c.errors.map((e) => e.line), [2, 5, 3, 4]);   // primera pasada (2 y 5) y después la segunda
    assert.equal(c.errors[0].message, 'Línea 2: instrucción desconocida: "XYZ"');
    assert.match(c.errors[1].message, /^Línea 5: /);
    assert.equal(c.errors[2].message, 'Línea 3: valor fuera de rango para un byte (-128..255): "300" = 300');
    assert.equal(c.errors[3].message, 'Línea 4: etiqueta o constante desconocida: "nada"');
    // Cada uno, solo, es el error que da assemble.
    for (const e of c.errors) {
      const lines = src.split('\n').map((l, i) => (i + 1 === e.line || !c.errors.some((x) => x.line === i + 1) ? l : ''));
      assert.equal(run(lines.join('\n')).message, e.message);
    }
    assert.equal(c.truncated, false);
    assert.equal(c.result, null);
  });

  it('un nombre que no se pudo definir no vuelve a dar error donde se usa', () => {
    // Una constante sin valor, otra con un nombre que no existe y dos que se definen en círculo:
    // un error por cada una, aunque se usen en muchos renglones.
    const src = ['X EQU', 'Y EQU nada + 1', 'A EQU B1', 'B1 EQU A',
      'LD V0, X', 'LD V1, Y', 'LD V2, A', 'LD V3, B1', 'ADD V0, X', 'DB X, Y', 'fin: JP fin'].join('\n');
    const c = check(src);
    assert.deepEqual(c.errors.map((e) => e.message), [
      'Línea 1: EQU necesita un valor',
      'Línea 2: etiqueta o constante desconocida: "nada"',
      'Línea 4: definición circular: la constante "A" depende de sí misma',
    ]);
    sameAsAssemble(src, undefined, 'nombres rotos');
  });

  it('"no entra en la memoria" va una sola vez, y lo que sigue se revisa igual', () => {
    // 448 renglones de 8 bytes llenan 0x200..0xFFF. Del 449 en adelante no entran: se dice una vez, y los
    // renglones que siguen se siguen leyendo (el 461 tiene una instrucción desconocida). Lo que no entra no
    // tiene bytes, así que sus valores no se revisan (el 999 del 462 no da otro error).
    const big = Array.from({ length: 460 }, () => 'DB 0,0,0,0,0,0,0,0').join('\n') + '\nXYZ\nLD V0, 999\n';
    const c = check(big);
    const mem = c.errors.filter((e) => /no entra en la memoria/.test(e.message));
    assert.equal(mem.length, 1);
    assert.equal(mem[0].line, 449);
    assert.deepEqual(c.errors.map((e) => e.line), [449, 461]);
    assert.equal(c.errors[1].message, 'Línea 461: instrucción desconocida: "XYZ"');
    sameAsAssemble(big, undefined, 'memoria llena');
    // Con xochip el mismo programa entra.
    assert.deepEqual(check(big.replace('XYZ\nLD V0, 999\n', ''), { xochip: true }).errors, []);
  });

  it('se corta en 100 errores y lo dice (truncated)', () => {
    const src = Array.from({ length: 150 }, (_, i) => 'MAL' + i).join('\n');
    const c = check(src);
    assert.equal(c.errors.length, 100);
    assert.equal(c.truncated, true);
    assert.equal(c.errors[99].line, 100);
    const ok = check(Array.from({ length: 100 }, (_, i) => 'MAL' + i).join('\n'));
    assert.equal(ok.errors.length, 100);
    assert.equal(ok.truncated, false);
  });

  it('lo que no es un error de la fuente lanza, como en assemble', () => {
    assert.throws(() => check(42), TypeError);
    assert.throws(() => check('CLS', { origin: 0x1000 }), RangeError);
    assert.deepEqual(check('CLS', { origin: 0x1000, xochip: true }).result.bytes, new Uint8Array([0x00, 0xE0]));
  });

  it('en 600 fuentes rotas a propósito (las del proyecto, con renglones cambiados, agregados, borrados o repetidos), el primer error es el de assemble', () => {
    const BROKEN = ['XYZ V0, 1', 'LD V0,', 'LD V0, 300', 'JP nada', 'DB 256', 'LD V0, [I', 'mal etiqueta: CLS', '1abc: CLS',
      'SE V0, V1, V2', 'DRW V0, V1, 16', 'X EQU', 'Q EQU Q', 'CLS extra', 'LD I, LONG', 'PLANE 4', 'JP V1, 0x300', 'DW 70000',
      'LD V0, 0x12 +', 'ADD V0, -200', 'LD V 1, 2', 'fin:', 'LD I, 0x1234', 'SCD 16', 'LD V0, VG', 'CALL 0x1000', 'DB', 'K: CLS'];
    const all = sources();
    const r = rng(20261106);
    let failed = 0, passed = 0;
    for (let n = 0; n < 600; n++) {
      const s = all[n % all.length];
      const lines = s.text.split('\n');
      const changes = 1 + r(3);
      for (let k = 0; k < changes; k++) {
        const at = r(lines.length);
        const kind = r(4);
        if (kind === 0) lines[at] = BROKEN[r(BROKEN.length)];
        else if (kind === 1) lines.splice(at, 0, BROKEN[r(BROKEN.length)]);
        else if (kind === 2) {
          // Se borra un renglón que define una etiqueta (sus usos quedan sin definir).
          const defs = lines.map((l, i) => (/^[A-Za-z_.][\w.]*\s*:/.test(l) ? i : -1)).filter((i) => i >= 0);
          if (defs.length) lines.splice(defs[r(defs.length)], 1);
        } else {
          lines.splice(at, 0, lines[r(lines.length)]);   // un renglón repetido (una etiqueta, dos veces)
        }
      }
      const { a, c } = sameAsAssemble(lines.join('\n'), { xochip: s.xochip }, s.name + ' (cambio ' + n + ')');
      if (a.ok) passed++;
      else {
        failed++;
        assert.ok(c.errors.length <= 100);
      }
    }
    assert.ok(failed > 450, 'casi todas tienen que fallar: ' + failed);
    assert.ok(passed > 0, 'alguna sigue ensamblando (un renglón repetido que no es una etiqueta)');
  });
});

describe('headerTags(): las etiquetas del encabezado', () => {
  const plain = (tags) => Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, v.value]));

  it('lee las de los cartuchos, con su renglón', () => {
    const planos = headerTags(fs.readFileSync(path.join(ROOT, 'roms', 'planos.asm'), 'utf8'));
    assert.deepEqual(planos.platform, { value: 'xochip', line: 5 });
    assert.equal(planos.name.value, 'Planos');
    const rebote = plain(headerTags(fs.readFileSync(path.join(ROOT, 'roms', 'rebote.asm'), 'utf8')));
    assert.deepEqual(Object.keys(rebote), ['name', 'description', 'controls', 'order']);
    assert.equal(rebote.order, '1');
  });

  it('el encabezado termina en el primer renglón que no es un comentario (los vacíos no lo cortan)', () => {
    const src = '\n; @name A\n\n;; @platform schip\n   ;   @order   2  \nCLS\n; @platform xochip\n';
    const t = headerTags(src);
    assert.deepEqual(plain(t), { name: 'A', platform: 'schip', order: '2' });
    assert.equal(t.platform.line, 4);
    assert.equal(t.order.line, 5);
    assert.deepEqual(plain(headerTags('CLS\n; @name B\n')), {});
    assert.deepEqual(plain(headerTags('')), {});
  });

  it('sin valor queda vacía, repetida vale la última, y anda con CRLF', () => {
    assert.deepEqual(plain(headerTags('; @platform\n; @name X\n; @name Y\n')), { platform: '', name: 'Y' });
    assert.deepEqual(headerTags('; @a 1\r\n; @b 2\r\nCLS').b, { value: '2', line: 2 });
  });

  it('un nombre raro no ensucia el objeto (no tiene prototipo)', () => {
    const t = headerTags('; @__proto__ x\n; @constructor y\n');
    assert.equal(Object.getPrototypeOf(t), null);
    assert.deepEqual(t.__proto__, { value: 'x', line: 1 });
    assert.deepEqual(t.constructor, { value: 'y', line: 2 });
    assert.equal({}.x, undefined);
  });
});
