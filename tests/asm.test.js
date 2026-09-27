'use strict';
// Tests del ensamblador tools/chip8asm.js.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadCore, loadAssembler } = require('./harness');

const { assemble } = loadAssembler();

// Ensambla y devuelve los bytes como array común (más fácil de comparar).
function bytesOf(source, options) {
  return Array.from(assemble(source, options).bytes);
}

// Verifica que ensamblar `source` falle con "Línea N: " y un texto que incluya `fragment`.
function assertAsmError(source, line, fragment) {
  assert.throws(() => assemble(source), (err) => {
    assert.ok(err instanceof Error, 'debe lanzar un Error');
    assert.ok(err.message.startsWith('Línea ' + line + ': '),
      'el mensaje debe empezar con "Línea ' + line + ': " y fue: ' + err.message);
    if (fragment) {
      assert.ok(err.message.toLowerCase().includes(fragment.toLowerCase()),
        'el mensaje debe mencionar "' + fragment + '" y fue: ' + err.message);
    }
    return true;
  });
}

describe('API', () => {
  it('devuelve bytes (Uint8Array), labels y listing', () => {
    const r = assemble('inicio: CLS\n');
    assert.ok(r.bytes instanceof Uint8Array);
    assert.deepEqual(Array.from(r.bytes), [0x00, 0xE0]);
    assert.deepEqual(r.labels, { inicio: 0x200 });
    assert.ok(Array.isArray(r.listing));
  });

  it('una fuente vacía o solo con comentarios da 0 bytes', () => {
    assert.equal(assemble('').bytes.length, 0);
    assert.equal(assemble('; nada\n\n   ; tampoco\n').bytes.length, 0);
  });

  it('origin cambia las direcciones de las etiquetas', () => {
    const r = assemble('uno: JP dos\ndos: JP uno\n', { origin: 0x300 });
    assert.deepEqual(r.labels, { uno: 0x300, dos: 0x302 });
    assert.deepEqual(Array.from(r.bytes), [0x13, 0x02, 0x13, 0x00]);
  });

  it('acepta fines de línea CRLF', () => {
    assert.deepEqual(bytesOf('CLS\r\nRET\r\n'), [0x00, 0xE0, 0x00, 0xEE]);
  });
});

describe('todas las instrucciones', () => {
  const cases = [
    ['CLS', 0x00E0], ['RET', 0x00EE], ['SYS 0x1A2', 0x01A2], ['JP 0x2A0', 0x12A0],
    ['CALL 0x2A0', 0x22A0], ['SE V1, 0x2A', 0x312A], ['SNE V1, 0x2A', 0x412A],
    ['SE V1, V2', 0x5120], ['LD V1, 0x2A', 0x612A], ['ADD V1, 0x2A', 0x712A],
    ['LD V1, V2', 0x8120], ['OR V1, V2', 0x8121], ['AND V1, V2', 0x8122], ['XOR V1, V2', 0x8123],
    ['ADD V1, V2', 0x8124], ['SUB V1, V2', 0x8125], ['SHR V1, V2', 0x8126], ['SUBN V1, V2', 0x8127],
    ['SHL V1, V2', 0x812E], ['SNE V1, V2', 0x9120], ['LD I, 0x2A0', 0xA2A0], ['JP V0, 0x2A0', 0xB2A0],
    ['RND V1, 0x2A', 0xC12A], ['DRW V1, V2, 5', 0xD125], ['SKP V1', 0xE19E], ['SKNP V1', 0xE1A1],
    ['LD V1, DT', 0xF107], ['LD V1, K', 0xF10A], ['LD DT, V1', 0xF115], ['LD ST, V1', 0xF118],
    ['ADD I, V1', 0xF11E], ['LD F, V1', 0xF129], ['LD B, V1', 0xF133], ['LD [I], V1', 0xF155],
    ['LD V1, [I]', 0xF165],
  ];
  for (const [text, op] of cases) {
    it(text, () => {
      assert.deepEqual(bytesOf(text), [op >> 8, op & 0xFF]);
    });
  }

  it('formas cortas SHR Vx y SHL Vx (Y = X)', () => {
    assert.deepEqual(bytesOf('SHR V3'), [0x83, 0x36]);
    assert.deepEqual(bytesOf('SHL VA'), [0x8A, 0xAE]);
  });

  it('registros de V0 a VF', () => {
    assert.deepEqual(bytesOf('DRW VF, V0, 15'), [0xDF, 0x0F]);
    assert.deepEqual(bytesOf('LD VE, VD'), [0x8E, 0xD0]);
  });

  it('[I] admite espacios adentro', () => {
    assert.deepEqual(bytesOf('LD [ I ], V2'), [0xF2, 0x55]);
  });
});

describe('números', () => {
  it('decimal, 0x, $, 0b y % dan el mismo valor', () => {
    for (const n of ['42', '0x2A', '0X2a', '$2A', '$2a', '0b00101010', '0B101010', '%00101010']) {
      assert.deepEqual(bytesOf('LD V1, ' + n), [0x61, 0x2A], n);
    }
  });

  it('bytes negativos en complemento a dos', () => {
    assert.deepEqual(bytesOf('ADD V1, -1'), [0x71, 0xFF]);
    assert.deepEqual(bytesOf('DB -128, -1, 255, 0'), [0x80, 0xFF, 0xFF, 0x00]);
    assert.deepEqual(bytesOf('SE V2, -2'), [0x32, 0xFE]);
  });
});

describe('etiquetas', () => {
  it('referencias hacia adelante y hacia atrás', () => {
    const r = assemble('inicio:\n  JP fin\n  CLS\nfin:\n  JP inicio\n');
    assert.deepEqual(r.labels, { inicio: 0x200, fin: 0x204 });
    assert.deepEqual(Array.from(r.bytes), [0x12, 0x04, 0x00, 0xE0, 0x12, 0x00]);
  });

  it('una etiqueta puede ir seguida de una instrucción en la misma línea', () => {
    const r = assemble('uno: CLS\ndos: JP dos ; bucle\n');
    assert.deepEqual(r.labels, { uno: 0x200, dos: 0x202 });
    assert.deepEqual(Array.from(r.bytes), [0x00, 0xE0, 0x12, 0x02]);
  });

  it('admite letras, dígitos, _ y . en el nombre', () => {
    const r = assemble('_x.1: JP _x.1\nbucle_2.fin: JP bucle_2.fin\n');
    assert.deepEqual(r.labels, { '_x.1': 0x200, 'bucle_2.fin': 0x202 });
  });

  it('distinguen mayúsculas y minúsculas', () => {
    const r = assemble('Fin: CLS\nfin: JP Fin\n');
    assert.deepEqual(r.labels, { Fin: 0x200, fin: 0x202 });
    assert.deepEqual(Array.from(r.bytes), [0x00, 0xE0, 0x12, 0x00]);
    assertAsmError('fin: JP FIN\n', 1, 'FIN');
  });

  it('se pueden usar como dirección de datos', () => {
    const r = assemble('LD I, datos\ndatos: DB 1, 2\n');
    assert.deepEqual(Array.from(r.bytes), [0xA2, 0x02, 1, 2]);
  });
});

describe('mayúsculas y minúsculas', () => {
  it('instrucciones, registros y directivas no distinguen mayúsculas', () => {
    const upper = bytesOf('LD V1, 5\nDRW VA, VB, 15\nLD [I], VC\nLD VD, DT\nLD I, 0x300\nDB 1\nDW 2\nN EQU 3\nADD V1, N');
    const lower = bytesOf('ld v1, 5\ndrw va, vb, 15\nld [i], vc\nld vd, dt\nld i, 0x300\ndb 1\ndw 2\nN equ 3\nadd v1, N');
    const mixed = bytesOf('Ld V1, 5\nDrW Va, vB, 15\nlD [i], vC\nLD Vd, Dt\nLd I, 0x300\nDb 1\nDw 2\nN EqU 3\nAdd V1, N');
    assert.deepEqual(lower, upper);
    assert.deepEqual(mixed, upper);
  });
});

describe('EQU', () => {
  it('define constantes', () => {
    assert.deepEqual(bytesOf('X EQU 10\nY EQU 0x14\nLD V0, X\nLD V1, Y\n'), [0x60, 0x0A, 0x61, 0x14]);
  });

  it('una constante puede usar otras constantes y etiquetas, incluso definidas después', () => {
    const src = 'LARGO EQU fin - datos\nDOBLE EQU LARGO + LARGO\nLD V0, LARGO\nLD V1, DOBLE\ndatos: DB 1, 2, 3\nfin:\n';
    assert.deepEqual(bytesOf(src), [0x60, 3, 0x61, 6, 1, 2, 3]);
  });

  it('no ocupa memoria', () => {
    const r = assemble('A EQU 5\nC EQU 6\ninicio: CLS\n');
    assert.equal(r.labels.inicio, 0x200);
    assert.equal(r.bytes.length, 2);
  });

  it('las constantes distinguen mayúsculas', () => {
    assert.deepEqual(bytesOf('v EQU 1\nV_ EQU 2\nLD V0, v\nLD V1, V_\n'), [0x60, 1, 0x61, 2]);
  });
});

describe('DB y DW', () => {
  it('DB emite bytes en orden', () => {
    assert.deepEqual(bytesOf('DB 1, 0x02, $03, %00000100, 0b101'), [1, 2, 3, 4, 5]);
  });

  it('DW emite palabras big-endian', () => {
    assert.deepEqual(bytesOf('DW 0x1234, 0xABCD, 7'), [0x12, 0x34, 0xAB, 0xCD, 0x00, 0x07]);
  });

  it('DW acepta etiquetas y negativos', () => {
    assert.deepEqual(bytesOf('a: DW a, -1'), [0x02, 0x00, 0xFF, 0xFF]);
  });

  it('mezcla de datos e instrucciones mantiene las direcciones', () => {
    const r = assemble('DB 1, 2, 3\nx: CLS\nDW 5\ny: RET\n');
    assert.deepEqual(r.labels, { x: 0x203, y: 0x207 });
    assert.deepEqual(Array.from(r.bytes), [1, 2, 3, 0x00, 0xE0, 0x00, 0x05, 0x00, 0xEE]);
  });
});

describe('expresiones', () => {
  it('sumas y restas con etiquetas, constantes y números', () => {
    const src = 'BASE EQU 0x300\nLD I, BASE + 0x10 - 2\nLD I, tabla + 3\nLD V0, fin - tabla\ntabla: DB 0, 0, 0, 0\nfin:\n';
    assert.deepEqual(bytesOf(src), [0xA3, 0x0E, 0xA2, 0x09, 0x60, 0x04, 0, 0, 0, 0]);
  });

  it('signos unarios', () => {
    assert.deepEqual(bytesOf('DB -1, +5, 5 - -3, -2 + 4'), [0xFF, 5, 8, 2]);
  });

  it('espacios opcionales alrededor de los operadores', () => {
    assert.deepEqual(bytesOf('DB 10-3, 10 - 3, 10 -3'), [7, 7, 7]);
  });
});

describe('comentarios y espacios', () => {
  it('se ignoran los comentarios y las líneas vacías', () => {
    const src = '; encabezado\n\n   CLS   ; borra\n\t RET;sin espacio\n  ; fin\n';
    assert.deepEqual(bytesOf(src), [0x00, 0xE0, 0x00, 0xEE]);
  });

  it('tabulaciones y espacios extra entre operandos', () => {
    assert.deepEqual(bytesOf('\tDRW\tV1 ,  V2 ,5'), [0xD1, 0x25]);
  });
});

describe('listado', () => {
  it('una entrada por línea con número, dirección, bytes y texto', () => {
    const src = '; hola\ninicio: LD V0, 1\n\nDB 7, 8, 9\nfin: JP fin';
    const { listing } = assemble(src);
    assert.equal(listing.length, 5);
    assert.deepEqual(listing[0], { line: 1, addr: 0x200, bytes: [], text: '; hola' });
    assert.deepEqual(listing[1], { line: 2, addr: 0x200, bytes: [0x60, 0x01], text: 'inicio: LD V0, 1' });
    assert.deepEqual(listing[2], { line: 3, addr: 0x202, bytes: [], text: '' });
    assert.deepEqual(listing[3], { line: 4, addr: 0x202, bytes: [7, 8, 9], text: 'DB 7, 8, 9' });
    assert.deepEqual(listing[4], { line: 5, addr: 0x205, bytes: [0x12, 0x05], text: 'fin: JP fin' });
  });
});

describe('errores (siempre con "Línea N: ")', () => {
  it('instrucción desconocida', () => {
    assertAsmError('CLS\nMOV V1, 2\n', 2, 'desconocida');
  });

  it('cantidad de operandos incorrecta', () => {
    assertAsmError('CLS V1', 1, 'operando');
    assertAsmError('DRW V1, V2', 1, 'operando');
    assertAsmError('JP', 1, 'operando');
    assertAsmError('SKP V1, V2', 1, 'operando');
  });

  it('operandos del tipo incorrecto', () => {
    assertAsmError('LD DT, 5', 1, 'inválidos');
    assertAsmError('OR V1, 5', 1, 'inválidos');
    assertAsmError('SKP 3', 1, 'inválidos');
    assertAsmError('ADD I, 5', 1, 'inválidos');
  });

  it('JP con un registro que no es V0', () => {
    assertAsmError('JP V1, 0x300', 1, 'V0');
  });

  it('byte fuera de rango', () => {
    assertAsmError('LD V0, 256', 1, 'rango');
    assertAsmError('ADD V0, -129', 1, 'rango');
    assertAsmError('\nDB 1, 300', 2, 'rango');
  });

  it('dirección fuera de rango', () => {
    assertAsmError('JP 0x1000', 1, 'rango');
    assertAsmError('LD I, -1', 1, 'rango');
    assertAsmError('CALL 4096', 1, 'rango');
  });

  it('nibble fuera de rango', () => {
    assertAsmError('DRW V0, V1, 16', 1, 'nibble');
  });

  it('palabra fuera de rango', () => {
    assertAsmError('DW 0x10000', 1, 'rango');
    assertAsmError('DW -32769', 1, 'rango');
  });

  it('etiqueta o constante desconocida', () => {
    assertAsmError('CLS\nJP nada\n', 2, 'nada');
    assertAsmError('LD V1, V10', 1, 'V0 a VF');
  });

  it('etiqueta duplicada', () => {
    assertAsmError('uno: CLS\ndos: CLS\nuno: RET\n', 3, 'línea 1');
    assertAsmError('X EQU 1\nX: CLS\n', 2, 'ya estaba definido');
  });

  it('nombre inválido o reservado', () => {
    assertAsmError('1abc: CLS', 1, 'inválido');
    assertAsmError('DT: CLS', 1, 'reservado');
    assertAsmError('va: CLS', 1, 'reservado');
    assertAsmError('i EQU 3', 1, 'reservado');
    assertAsmError('ld: CLS', 1, 'reservado');
    assertAsmError('b: CLS', 1, 'reservado');
    assertAsmError('F EQU 1', 1, 'reservado');
  });

  it('números mal escritos', () => {
    assertAsmError('LD V0, 12ab', 1, 'número');
    assertAsmError('LD V0, 0x', 1, 'número');
    assertAsmError('LD V0, %102', 1, 'número');
    assertAsmError('LD V0, $G', 1, 'número');
  });

  it('expresiones mal formadas', () => {
    assertAsmError('LD V0, 1 +', 1, 'incompleta');
    assertAsmError('LD V0, 1 2', 1, 'expresión');
    assertAsmError('LD V0, 2 * 3', 1, 'expresión');
    assertAsmError('LD V0, * 3', 1, 'inesperado');
    assertAsmError('LD V0, V1 + 1', 1, 'reservado');
  });

  it('operandos vacíos', () => {
    assertAsmError('DB 1,,2', 1, 'falta');
    assertAsmError('DB', 1, 'al menos');
    assertAsmError('X EQU', 1, 'valor');
  });

  it('constante circular', () => {
    assertAsmError('A EQU C\nC EQU A\nLD V0, A\n', 2, 'circular');
    assertAsmError('A EQU A + 1', 1, 'circular');
  });

  it('programa que no entra en memoria', () => {
    const big = Array.from({ length: 3584 / 8 + 1 }, () => 'DB 0,0,0,0,0,0,0,0').join('\n');
    assertAsmError(big, 3584 / 8 + 1, 'memoria');
    assert.equal(assemble(big.split('\n').slice(0, -1).join('\n')).bytes.length, 3584);
  });

  it('el número de línea es el de la línea con el error', () => {
    assertAsmError('; 1\n; 2\n\nCLS\nLD V0, 999\n', 5, 'rango');
  });
});

describe('ida y vuelta con el desensamblador', () => {
  it('assemble(disassemble(w)) reproduce las 65536 palabras', () => {
    const { disassemble } = loadCore();
    const failures = [];
    for (let w = 0; w <= 0xFFFF; w++) {
      const text = disassemble(w);
      let bytes;
      try {
        bytes = assemble(text).bytes;
      } catch (e) {
        failures.push(w.toString(16).padStart(4, '0') + ' "' + text + '": ' + e.message);
        continue;
      }
      if (bytes.length !== 2 || bytes[0] !== (w >> 8) || bytes[1] !== (w & 0xFF)) {
        failures.push(w.toString(16).padStart(4, '0') + ' "' + text + '" -> ' + Array.from(bytes));
      }
      if (failures.length > 10) break;
    }
    assert.deepEqual(failures, []);
  });

  it('un listado completo del desensamblador vuelve a ensamblarse igual', () => {
    const { disassembleRange } = loadCore();
    const program = assemble('inicio: LD V0, 5\nLD I, datos\nDRW V0, V0, 2\nfin: JP fin\ndatos: DB 0x51, 0x21\n');
    const mem = new Uint8Array(4096);
    mem.set(program.bytes, 0x200);
    const text = disassembleRange(mem, 0x200, program.bytes.length / 2).map((e) => e.text).join('\n');
    assert.deepEqual(Array.from(assemble(text).bytes), Array.from(program.bytes));
  });
});

describe('línea de comandos', () => {
  it('ensambla un archivo, escribe el .ch8 e imprime el listado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8asm-'));
    try {
      const src = path.join(dir, 'prueba.asm');
      fs.writeFileSync(src, 'inicio: CLS\nfin: JP fin\n');
      const res = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'chip8asm.js'), src, '--listing'], { encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
      assert.deepEqual(Array.from(fs.readFileSync(path.join(dir, 'prueba.ch8'))), [0x00, 0xE0, 0x12, 0x02]);
      assert.match(res.stdout, /0x202\s+12 02\s+fin: JP fin/);

      const out = path.join(dir, 'otro.ch8');
      const res2 = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'chip8asm.js'), src, out], { encoding: 'utf8' });
      assert.equal(res2.status, 0, res2.stderr);
      assert.ok(fs.existsSync(out));

      fs.writeFileSync(src, 'CLS\nXYZ\n');
      const bad = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'chip8asm.js'), src], { encoding: 'utf8' });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /Línea 2: /);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
