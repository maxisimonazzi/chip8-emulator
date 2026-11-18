'use strict';
// Tests del compilador de Octo que trae chip8.html (el bloque chip8-octo, globalThis.Chip8Octo):
//   - es el js/compiler.js de Octo tal cual (su huella SHA-1), envuelto: no deja otros globales;
//   - compile: los bytes, la plataforma (la menor con todas las instrucciones), las etiquetas, el
//     renglón de cada byte (igual que DebugInfo.posToLine de Octo) y los :breakpoint;
//   - los errores: uno solo, en castellano, con su renglón, como los del ensamblador; el tope de
//     memoria de cada plataforma;
//   - translate: cada mensaje que puede dar el compilador tiene su traducción;
//   - headerTags con los comentarios de Octo;
//   - el pong de la nota de Hackaday (docs/ejemplos/octo/pong.8o) da la ROM de siempre.
// El Taller con Octo (la interfaz) se prueba en el navegador: tools/e2e.js.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, loadOcto, extractScript, loadCore } = require('./harness');

const Octo = loadOcto();
const { compile, headerTags, translate, Compiler } = Octo;
const PONG = fs.readFileSync(path.join(ROOT, 'docs', 'ejemplos', 'octo', 'pong.8o'), 'utf8');
const hexOf = (bytes) => Buffer.from(bytes).toString('hex');
const errorOf = (src) => {
  const r = compile(src);
  assert.equal(r.result, null, 'tendría que dar un error: ' + JSON.stringify(src));
  assert.equal(r.errors.length, 1);
  return r.errors[0];
};

describe('el bloque chip8-octo: el compilador de Octo tal cual', () => {
  const { code } = extractScript('chip8-octo');

  it('entre sus marcas está js/compiler.js de Octo sin cambios (commit aa7f36e, la huella de ese archivo)', () => {
    const open = '/* ==== js/compiler.js de Octo, commit aa7f36ea9e3cf23212c151008729cf233fd56529, sin cambios ==== */\n';
    const close = '/* ==== fin de js/compiler.js ==== */';
    const start = code.indexOf(open), end = code.indexOf(close);
    assert.ok(start > 0 && end > start, 'faltan las marcas');
    const original = code.slice(start + open.length, end);
    assert.equal(crypto.createHash('sha1').update(original, 'utf8').digest('hex'), '6f441e84e992e7d3fbe5eaa8c0b9c016ad5bd03c');
    assert.equal(Octo.VERSION, 'aa7f36ea9e3cf23212c151008729cf233fd56529');
    // Y la licencia del compilador va con él.
    assert.match(code, /Copyright \(c\) 2015, John Earnest/);
    assert.match(code, /Permission is hereby granted, free of charge/);
  });

  it('evaluado aparte, define Chip8Octo y nada más (parse, tokenize, Compiler... quedan adentro)', () => {
    const box = {};
    vm.runInNewContext(code, box);
    assert.deepEqual(Object.keys(box), ['Chip8Octo']);
    assert.deepEqual(Object.keys(box.Chip8Octo), ['compile', 'headerTags', 'translate', 'Compiler', 'VERSION']);
  });

  it('Compiler es el de Octo: compila igual que compile', () => {
    const c = new Compiler(PONG);
    c.go();
    assert.equal(hexOf(Uint8Array.from(c.rom)), hexOf(compile(PONG).result.bytes));
  });
});

describe('compile', () => {
  it('un programa chico: los bytes, sin el salto a main cuando main está en 0x200', () => {
    const r = compile(': main\n  clear\n  v0 := 0xA\n  i := hex v0\n  sprite v1 v2 5\n  loop again\n');
    assert.deepEqual(r.errors, []);
    assert.equal(r.truncated, false);
    assert.equal(hexOf(r.result.bytes), '00e0600af029d1251208');
    assert.ok(r.result.bytes instanceof Uint8Array);
    assert.deepEqual(r.result.labels, { main: 0x200 });
    assert.deepEqual(r.result.breakpoints, []);
    assert.equal(r.result.platform, 'chip8');
  });

  it('con main más abajo, el primer par de bytes es el salto a main', () => {
    const r = compile(': dato 0xFF\n: main\n  loop again\n');
    assert.equal(hexOf(r.result.bytes), '1203ff1203');
    assert.deepEqual(r.result.labels, { dato: 0x202, main: 0x203 });
  });

  it('la plataforma es la menor que tiene todas las instrucciones del programa', () => {
    const plat = (body) => compile(': main\n' + body + '\n  loop again\n').result.platform;
    assert.equal(plat('  v0 := 1'), 'chip8');
    for (const s of ['  hires', '  lores', '  scroll-down 2', '  scroll-left', '  scroll-right', '  exit', '  i := bighex v0', '  saveflags v3']) {
      assert.equal(plat(s), 'schip', s);
    }
    for (const s of ['  plane 2', '  audio', '  scroll-up 1', '  i := long main', '  save v1 - v2', '  pitch := v0', '  saveflags v9']) {
      assert.equal(plat(s), 'xochip', s);
    }
    // Dos huecos del compilador de Octo: saveflags (o loadflags) con v0 a v7 después de una instrucción de XO-CHIP le
    // borra la marca, y pitch no la pone. Acá sigue siendo de XO-CHIP.
    assert.equal(plat('  plane 3\n  saveflags v3'), 'xochip');
    assert.equal(plat('  audio\n  loadflags v0'), 'xochip');
    const c = new Compiler(': main\n  plane 3\n  saveflags v3\n  pitch := v0\n  loop again\n');
    c.go();
    assert.equal(c.xo, false, 'el compilador de Octo ya no tiene el hueco: se puede simplificar compile');
  });

  it('lines: el renglón de cada byte, el mismo que da DebugInfo.posToLine de Octo (más uno)', () => {
    for (const src of [PONG, ': main\n\n  v0 := 1   # uno\n  :macro dos { v1 := 2 }\n  dos\n  dos\n  loop again']) {
      const r = compile(src);
      const c = new Compiler(src);
      c.go();
      assert.equal(r.result.lines.length, r.result.bytes.length);
      let mapped = 0;
      for (const a of Object.keys(c.dbginfo._locs)) {
        assert.equal(r.result.lines[a - 0x200], c.dbginfo.posToLine(c.dbginfo._locs[a]) + 1, 'dirección ' + a);
        mapped++;
      }
      assert.ok(mapped > 0);
      assert.equal(r.result.lines.filter((x) => x === 0).length, r.result.bytes.length - mapped);
    }
    // Una macro: sus bytes son del renglón donde está escrita (como en Octo).
    const m = compile(': main\n  :macro dos { v1 := 2 }\n  dos\n  dos\n  loop again').result;
    assert.deepEqual(m.lines, [2, 2, 2, 2, 5, 5]);
  });

  it('los :breakpoint, con su nombre y su dirección', () => {
    const r = compile(': main\n  v0 := 1\n  :breakpoint uno\n  v1 := 2\n  loop\n    :breakpoint vuelta\n  again\n');
    assert.deepEqual(r.result.breakpoints, [{ addr: 0x202, name: 'uno' }, { addr: 0x204, name: 'vuelta' }]);
  });

  it('un programa grande y XO-CHIP compila rápido (los renglones se buscan sin recorrer la fuente por cada byte)', () => {
    const rows = [];
    for (let i = 0; i < 6000; i++) rows.push('  0x' + (i & 0xFF).toString(16) + ' 0x01 0x02 0x03 0x04 0x05 0x06 0x07 0x08 0x09');
    const src = ': main\n  i := long datos\n  loop again\n: datos\n' + rows.join('\n') + '\n';
    const t0 = Date.now();
    const r = compile(src);
    assert.deepEqual(r.errors, []);
    assert.equal(r.result.platform, 'xochip');
    assert.equal(r.result.bytes.length, 6 + 60000);
    assert.equal(r.result.lines[r.result.lines.length - 1], 6004);
    assert.ok(Date.now() - t0 < 3000, 'tardó ' + (Date.now() - t0) + ' ms');
  });

  it('una fuente que no es texto lanza un TypeError', () => {
    assert.throws(() => compile(null), TypeError);
    assert.throws(() => compile(42), /la fuente tiene que ser un texto/);
  });
});

describe('los errores: uno, en castellano, con su renglón', () => {
  it('como los del ensamblador: «Línea N: » y el mensaje en minúscula', () => {
    const cases = [
      [': main\n  v0 := 300\n', 2, 'Línea 2: 300 no entra en un byte: tiene que estar entre -128 y 255.'],
      [': main\n  loop\n  v0 += 1\n', 2, 'Línea 2: este «loop» no tiene su «again».'],
      ['v0 := 1\n', 1, 'Línea 1: falta la etiqueta «main» («: main»), donde empieza el programa.'],
      [': main\n  i := foo\n', 2, 'Línea 2: «foo» se usa pero nunca se define.'],
      [': main\n  if v0 = 3 then v1 := 2\n', 2, 'Línea 2: acá va una comparación (==, !=, <, >, <=, >=, key o -key), pero dice «=».'],
      [': main\n  :const x 1\n  :const x 2\n', 3, 'Línea 3: «x» ya está definido.'],
      [': main\n  sprite v0 v1 16\n', 2, 'Línea 2: 16 no entra en 4 bits: tiene que estar entre 0 y 15.'],
      [': main\n  :macro m a b { v0 := a }\n  m 1', 3, 'Línea 3: faltan argumentos para la macro «m».'],
      ['# hola\n: main\n  jump main\n  "abc', 4, 'Línea 4: falta la comilla (") que cierra el texto.'],
      [': main\n  v0 := 1\n  else\n', 3, 'Línea 3: este «else» no tiene su «begin».'],
      [': main\n  if v0 == 1 begin\n    v1 := 1\n', 2, 'Línea 2: este «begin» no tiene su «end».'],
      [': main\n  v0 =+ 1\n', 2, 'Línea 2: «=+» no es una operación conocida.'],
      [': main\n  : main\n', 2, 'Línea 2: «main» ya está definido.'],
      [': main\n  :assert "chico" { 1 > 2 }\n', 2, 'Línea 2: no se cumple el :assert: chico'],
      [': main\n  plane 5\n', 2, 'Línea 2: el plano tiene que ser de 0 a 3 (dice 5).'],
      [': main\n  : loop\n', 2, 'Línea 2: «loop» es una palabra de Octo: no puede ser el nombre de una etiqueta.'],
    ];
    for (const [src, line, message] of cases) {
      assert.deepEqual(errorOf(src), { line, message }, JSON.stringify(src));
    }
  });

  it('un error del código del compilador (no un mensaje suyo) también se dice en castellano', () => {
    const e = errorOf(': main\n  :macro m');
    assert.equal(e.line, 2);
    assert.match(e.message, /^Línea 2: el compilador de Octo no pudo seguir desde acá \(.+\)\.$/);
  });

  it('un programa que no entra en la memoria de su plataforma es un error en el renglón del primer byte que sobra', () => {
    const fill = (n) => Array.from({ length: n }, () => '0x00').join(' ');
    const chip8 = errorOf(': main\n  loop again\n' + fill(3582) + '\n0x01 0x02\n');
    assert.equal(chip8.line, 4);
    assert.equal(chip8.message, 'Línea 4: el programa no entra en la memoria: se pasa de la dirección 0xFFF (ocupa 3586 bytes y entran 3584; con instrucciones de XO-CHIP, la memoria llega hasta 0xFFFF).');
    // Justo 3584 bytes entran.
    assert.deepEqual(compile(': main\n  loop again\n' + fill(3582) + '\n').errors, []);
    const xo = errorOf(': main\n  i := long main\n  loop again\n:org 0xFFFE\n0x01 0x02 0x03\n');
    assert.match(xo.message, /^Línea 5: el programa no entra en la memoria de XO-CHIP: se pasa de la dirección 0xFFFF \(ocupa 65025 bytes y entran 65024\)\.$/);
  });
});

describe('translate: cada mensaje del compilador tiene su traducción', () => {
  // Un ejemplo de cada mensaje que puede lanzar compiler.js, como lo arma él.
  const SAMPLES = [
    'Unknown format character %q- should be %Nc,%Ni,%Nb, or %Nx.',
    'format byte count cannot be 0.',
    'Missing a closing " in a string literal.',
    "Unrecognized escape character 'q' in a string literal.",
    'Data overlap. Address 0x2A4 has already been defined.',
    'Unexpected EOF.',
    "Expected register, got 'foo'.",
    "Expected :=, got 'foo'.",
    "A constant reference to 'foo' may not be forward-declared.",
    "Expected a constant name, but found the keyword 'loop'. Missing a token?",
    "Undefined constant name 'foo'.",
    "The name 'loop' is reserved and cannot be used for a macro argument.",
    'Expected a name for a label, got 12.',
    'Expected a string, got 12.',
    'Expected a 16-bit value value, but found the register v0.',
    "Expected an 8-bit value, but found the keyword 'loop'. Missing a token?",
    "Expected a 4-bit value, but found the undefined name 'foo'.",
    'Argument 70000 does not fit in 16 bits.',
    "Argument 'foo' does not fit in 12 bits.",
    "The reference to 'foo' may not be forward-declared.",
    'Expected a 12-bit value, but found the register v1.',
    'Argument 300 does not fit in a byte- must be in range [-128,255].',
    'Argument 20 does not fit in 4 bits- must be in range [0,15].',
    "Expected conditional operator, got 'foo'.",
    'Expected conditional operator, got 3.',
    "'-=' is not an operator that can target the i register.",
    "Unrecognized operator 'foo'.",
    "The name 'foo' has already been defined.",
    "The name 'foo' is already used by an alias.",
    'Value 0x1000 for label \'foo\' does not fit in 12 bits.',
    "Cannot use forward declaration 'foo' when calculating constant 'bar'.",
    "Found undefined name 'foo' when calculating constant 'bar'.",
    "Expected ')' for calculated constant 'bar'.",
    "Expected '{' for calculated constant 'bar'.",
    "Expected '}' for calculated constant 'bar'.",
    "Expected '{' for definition of macro 'bar'.",
    "Expected '}' for definition of string mode 'bar'.",
    "The name 'foo' is already used by a constant.",
    'Register index must be in the range [0,F].',
    "Not enough arguments for expansion of macro 'foo'.",
    "String mode 'foo' is already defined for the character 'a'.",
    "String mode 'foo' cannot be applied to a number (12).",
    "String mode 'foo' is not defined for the character 'a'.",
    "Cannot redefine the name 'foo' with :calc.",
    'Assertion failed: chico',
    'Assertion failed.',
    "Expected 'then' or 'begin'.",
    "This 'else' does not have a matching 'begin'.",
    "This 'end' does not have a matching 'begin'.",
    "This 'while' is not within a loop.",
    "This 'again' does not have a matching 'loop'.",
    'The plane bitmask must be [0,3], was 7.',
    "Literal value '300' does not fit in a byte- must be in range [-128,255].",
    "This program is missing a 'main' label.",
    'Undefined forward reference: foo',
    "This 'loop' does not have a matching 'again'.",
    "This 'begin' does not have a matching 'end'.",
  ];
  const ENGLISH = /\b(Expected|got|does not|must be|Missing|Unknown|Unrecognized|Undefined|reserved|already|defined|matching|Cannot|Found|Assertion|failed|Argument|Register|Value|Literal|program|This)\b/;

  it('compiler.js tiene 57 throw (si Octo cambia, hay que revisar las traducciones)', () => {
    const { code } = extractScript('chip8-octo');
    const original = code.slice(code.indexOf('/* ==== js/compiler.js de Octo'), code.indexOf('/* ==== fin de js/compiler.js'));
    assert.equal((original.match(/\bthrow\b/g) || []).length, 57);
  });

  it('ningún ejemplo queda en inglés, y cada traducción es distinta', () => {
    const seen = new Set();
    for (const s of SAMPLES) {
      const t = translate(s);
      assert.notEqual(t, s, s);
      assert.doesNotMatch(t, ENGLISH, s + ' -> ' + t);
      seen.add(t);
    }
    assert.equal(seen.size, SAMPLES.length);
    // Algunas, completas.
    assert.equal(translate("Expected a name for a calculated constant, got 3."), 'Acá va el nombre de una constante calculada, pero dice 3.');
    assert.equal(translate("Argument 'foo' does not fit in a byte- must be in range [-128,255]."), '«foo» no entra en un byte: tiene que estar entre -128 y 255.');
    assert.equal(translate("Expected '{' for definition of string mode 'x'."), 'Falta la «{» que abre el modo de texto «x».');
  });

  it('un mensaje que no conoce queda tal cual', () => {
    assert.equal(translate('Something new.'), 'Something new.');
  });
});

describe('headerTags y el pong', () => {
  it('headerTags lee las etiquetas «# @nombre valor» del encabezado de comentarios de Octo', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(headerTags('# Prueba\n# @ipf 500\n\n#  @platform xochip\n#@vacia\n: main\n# @tarde 1'))),
      { ipf: { value: '500', line: 2 }, platform: { value: 'xochip', line: 4 }, vacia: { value: '', line: 5 } });
    assert.deepEqual(Object.keys(headerTags(': main\n# @ipf 1')), []);
    assert.deepEqual(JSON.parse(JSON.stringify(headerTags('# @ipf 1\r\n# @ipf 2\r\n'))), { ipf: { value: '2', line: 2 } });
  });

  it('el pong de la nota de Hackaday: 332 bytes de CHIP-8, @ipf 500 y corre en el núcleo con los quirks de Octo', () => {
    const r = compile(PONG);
    assert.deepEqual(r.errors, []);
    assert.equal(r.result.platform, 'chip8');
    assert.equal(r.result.bytes.length, 332);
    assert.equal(hexOf(r.result.bytes.slice(0, 12)), '600d610d6c006d00640100e0');
    assert.equal(headerTags(PONG).ipf.value, '500');
    // Debajo del encabezado en castellano, el chip8pong.8o original: su primer comentario y su final.
    assert.ok(PONG.includes('\n# @ipf 500\n\n# CHIP-8 Pong for Octo\n'));
    assert.ok(PONG.endsWith(': ball\n  0x80\n'));
    // Con los quirks de Octo (los del perfil XO-CHIP) la pelota se mueve; a 100 IPF va igual que a 10.000 (el ritmo
    // lo marca el temporizador).
    const { Chip8, QUIRK_PRESETS } = loadCore();
    const run = (ipf) => {
      const cpu = new Chip8({ quirks: { ...QUIRK_PRESETS.xochip.quirks }, random: () => 7 });
      cpu.loadRom(r.result.bytes);
      const out = [];
      for (let f = 0; f < 600; f++) { cpu.runFrame(ipf); out.push(cpu.V[2] + ',' + cpu.V[3]); }
      return out;
    };
    const fast = run(10000);
    assert.ok(new Set(fast).size > 20, 'la pelota no se movió');
    assert.deepEqual(run(100), fast);
    assert.notDeepEqual(run(20), fast);
  });
});
