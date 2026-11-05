'use strict';
// Tests de las instrucciones de SUPER-CHIP y XO-CHIP del ensamblador
// (tools/chip8asm.js), de la opción xochip (--xo en la línea de comandos) y del
// cruce con el desensamblador del núcleo en esas dos plataformas.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, loadCore, loadAssembler } = require('./harness');

const { assemble, formatListing } = loadAssembler();
const TOOL = path.join(ROOT, 'tools', 'chip8asm.js');

// Ensambla y devuelve los bytes como array común (más fácil de comparar).
function bytesOf(source, options) {
  return Array.from(assemble(source, options).bytes);
}

// Los dos bytes de una palabra, big-endian.
function word(w) {
  return [w >> 8, w & 0xFF];
}

// Verifica que ensamblar `source` falle con "Línea N: " y un texto que incluya `fragment`.
function assertAsmError(source, line, fragment, options) {
  assert.throws(() => assemble(source, options), (err) => {
    assert.ok(err instanceof Error, 'debe lanzar un Error');
    assert.ok(err.message.startsWith('Línea ' + line + ': '),
      'el mensaje debe empezar con "Línea ' + line + ': " y fue: ' + err.message);
    assert.ok(err.message.toLowerCase().includes(fragment.toLowerCase()),
      'el mensaje debe mencionar "' + fragment + '" y fue: ' + err.message);
    return true;
  });
}

// Verifica el mensaje de error completo.
function assertAsmMessage(source, message, options) {
  assert.throws(() => assemble(source, options), (err) => {
    assert.equal(err.message, message);
    return true;
  });
}

describe('instrucciones de SUPER-CHIP', () => {
  const cases = [
    ['SCD 0', 0x00C0], ['SCD 1', 0x00C1], ['SCD 15', 0x00CF], ['scd 0xA', 0x00CA], ['Scd %0110', 0x00C6],
    ['SCD $f', 0x00CF], ['SCD 0b11', 0x00C3],
    ['SCR', 0x00FB], ['scr', 0x00FB], ['SCL', 0x00FC], ['Scl', 0x00FC], ['EXIT', 0x00FD], ['exit', 0x00FD],
    ['LOW', 0x00FE], ['low', 0x00FE], ['HIGH', 0x00FF], ['High', 0x00FF],
    ['LD HF, V0', 0xF030], ['LD HF, V9', 0xF930], ['ld hf, vf', 0xFF30], ['Ld Hf, vA', 0xFA30],
    ['LD R, V0', 0xF075], ['LD R, V7', 0xF775], ['ld r, vf', 0xFF75],
    ['LD V0, R', 0xF085], ['LD V7, R', 0xF785], ['ld vf, r', 0xFF85],
  ];
  for (const [text, op] of cases) {
    it(text, () => {
      assert.deepEqual(bytesOf(text), word(op));
    });
  }

  it('SCD acepta expresiones, constantes y etiquetas (también hacia adelante)', () => {
    assert.deepEqual(bytesOf('FILAS EQU 4\nSCD FILAS'), [0x00, 0xC4]);
    assert.deepEqual(bytesOf('FILAS EQU 4\nSCD FILAS + FILAS - 1'), [0x00, 0xC7]);
    assert.deepEqual(bytesOf('inicio: SCD fin - inicio\nSCR\nfin:'), [0x00, 0xC4, 0x00, 0xFB]);
  });

  it('LD HF, LD R y LD Vx, R con todos los registros', () => {
    for (let x = 0; x < 16; x++) {
      const V = 'V' + x.toString(16).toUpperCase();
      assert.deepEqual(bytesOf('LD HF, ' + V), [0xF0 | x, 0x30], V);
      assert.deepEqual(bytesOf('LD R, ' + V), [0xF0 | x, 0x75], V);
      assert.deepEqual(bytesOf('LD ' + V + ', R'), [0xF0 | x, 0x85], V);
    }
  });

  it('SYS y DW siguen valiendo para las mismas palabras (dos formas de escribir lo mismo)', () => {
    assert.deepEqual(bytesOf('SYS 0x0FF'), bytesOf('HIGH'));
    assert.deepEqual(bytesOf('SYS 0x0FE'), bytesOf('LOW'));
    assert.deepEqual(bytesOf('SYS 0x0FB\nSYS 0x0FC\nSYS 0x0FD'), bytesOf('SCR\nSCL\nEXIT'));
    assert.deepEqual(bytesOf('SYS 0x0C3\nSYS 0x0D3'), bytesOf('SCD 3\nSCU 3'));
    assert.deepEqual(bytesOf('DW 0xF330, 0xF375, 0xF385'), bytesOf('LD HF, V3\nLD R, V3\nLD V3, R'));
  });
});

describe('instrucciones de XO-CHIP', () => {
  const cases = [
    ['SCU 0', 0x00D0], ['SCU 1', 0x00D1], ['SCU 15', 0x00DF], ['scu 0x7', 0x00D7], ['ScU %1000', 0x00D8],
    ['SAVE V0, V0', 0x5002], ['SAVE V1, V2', 0x5122], ['save va, v3', 0x5A32], ['SAVE V0, VF', 0x50F2],
    ['LOAD V0, V0', 0x5003], ['LOAD V1, V2', 0x5123], ['load VF, v0', 0x5F03],
    ['PLANE 0', 0xF001], ['PLANE 1', 0xF101], ['PLANE 2', 0xF201], ['PLANE 3', 0xF301],
    ['plane 0b10', 0xF201], ['Plane $3', 0xF301],
    ['AUDIO', 0xF002], ['audio', 0xF002],
    ['PITCH V0', 0xF03A], ['PITCH V5', 0xF53A], ['pitch vf', 0xFF3A],
  ];
  for (const [text, op] of cases) {
    it(text, () => {
      assert.deepEqual(bytesOf(text), word(op));
    });
  }

  it('SAVE y LOAD con todos los pares de registros, en cualquier orden', () => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        const ops = 'V' + x.toString(16) + ', V' + y.toString(16);
        assert.deepEqual(bytesOf('SAVE ' + ops), [0x50 | x, (y << 4) | 2], 'SAVE ' + ops);
        assert.deepEqual(bytesOf('LOAD ' + ops), [0x50 | x, (y << 4) | 3], 'LOAD ' + ops);
      }
    }
  });

  it('PLANE y SCU aceptan expresiones, constantes y etiquetas', () => {
    assert.deepEqual(bytesOf('AMBOS EQU 3\nPLANE AMBOS'), [0xF3, 0x01]);
    assert.deepEqual(bytesOf('PRIMERO EQU 1\nPLANE PRIMERO + 1'), [0xF2, 0x01]);
    assert.deepEqual(bytesOf('PASO EQU 6\nSCU PASO - 2'), [0x00, 0xD4]);
    assert.deepEqual(bytesOf('arriba: SCU abajo - arriba\nabajo:'), [0x00, 0xD2]);
  });

  describe('LD I, LONG nnnn (4 bytes)', () => {
    it('emite F000 y después la dirección de 16 bits, big-endian', () => {
      assert.deepEqual(bytesOf('LD I, LONG 0x1234'), [0xF0, 0x00, 0x12, 0x34]);
      assert.deepEqual(bytesOf('LD I, LONG 0'), [0xF0, 0x00, 0x00, 0x00]);
      assert.deepEqual(bytesOf('LD I, LONG 0x0FFF'), [0xF0, 0x00, 0x0F, 0xFF]);
      assert.deepEqual(bytesOf('LD I, LONG 0xFFFF'), [0xF0, 0x00, 0xFF, 0xFF]);
      assert.deepEqual(bytesOf('LD I, LONG 65535'), [0xF0, 0x00, 0xFF, 0xFF]);
      assert.deepEqual(bytesOf('LD I, LONG $ABCD'), [0xF0, 0x00, 0xAB, 0xCD]);
      assert.deepEqual(bytesOf('LD I, LONG %1000000000000001'), [0xF0, 0x00, 0x80, 0x01]);
    });

    it('no distingue mayúsculas y admite tabulaciones, espacios de más y comentarios', () => {
      for (const t of ['ld i, long 0x1234', 'Ld I, Long 0x1234', 'LD I,LONG 0x1234', 'LD  I ,  LONG\t0x1234 ',
        'LD I, LONG   0x1234 ; comentario']) {
        assert.deepEqual(bytesOf(t), [0xF0, 0x00, 0x12, 0x34], t);
      }
    });

    it('acepta expresiones, constantes y etiquetas', () => {
      assert.deepEqual(bytesOf('BASE EQU 0x1000\nLD I, LONG BASE + 0x10 - 1'), [0xF0, 0x00, 0x10, 0x0F]);
      assert.deepEqual(bytesOf('datos: DB 9\nLD I, LONG datos + 1'), [9, 0xF0, 0x00, 0x02, 0x01]);
      assert.deepEqual(bytesOf('LD I, LONG - -5'), [0xF0, 0x00, 0x00, 0x05]);
    });

    it('referencias hacia adelante: ocupa 4 bytes desde la primera pasada', () => {
      const r = assemble('LD I, LONG datos\nCLS\ndatos: DB 7\nfin: JP fin');
      assert.deepEqual(r.labels, { datos: 0x206, fin: 0x207 });
      assert.deepEqual(Array.from(r.bytes), [0xF0, 0x00, 0x02, 0x06, 0x00, 0xE0, 0x07, 0x12, 0x07]);
      // Una constante que depende de una etiqueta definida después, y una resta de etiquetas.
      const src = 'DESTINO EQU tabla + 2\nLD I, LONG DESTINO\nLD I, LONG fin - tabla\ntabla: DB 1, 2, 3\nfin:';
      assert.deepEqual(bytesOf(src), [0xF0, 0x00, 0x02, 0x0A, 0xF0, 0x00, 0x00, 0x03, 1, 2, 3]);
    });

    it('acepta de 0 a 0xFFFF con o sin la opción xochip (es solo un operando)', () => {
      assert.deepEqual(bytesOf('LD I, LONG 0xFFFF'), [0xF0, 0x00, 0xFF, 0xFF]);
      assert.deepEqual(bytesOf('LD I, LONG 0xFFFF', { xochip: true }), [0xF0, 0x00, 0xFF, 0xFF]);
    });
  });
});

describe('errores de las instrucciones nuevas (siempre con "Línea N: ")', () => {
  it('SCD y SCU: el valor es un nibble (0..15)', () => {
    assertAsmMessage('SCD 16', 'Línea 1: valor fuera de rango para un nibble (0..15): "16" = 16');
    assertAsmError('SCU 16', 1, 'nibble (0..15)');
    assertAsmError('SCD -1', 1, 'nibble (0..15)');
    assertAsmError('\nSCU 0x10', 2, 'nibble (0..15)');
    assertAsmError('N EQU 20\nSCD N', 2, '"N" = 20');
  });

  it('PLANE: el valor va de 0 a 3', () => {
    assertAsmMessage('PLANE 4', 'Línea 1: valor fuera de rango para PLANE (0..3): "4" = 4');
    assertAsmError('PLANE -1', 1, '(0..3)');
    assertAsmError('CLS\n\nPLANE 15', 3, '(0..3)');
    assertAsmError('PLANE V1', 1, 'inválidos');
  });

  it('SAVE y LOAD: dos registros', () => {
    assertAsmMessage('SAVE V1', 'Línea 1: SAVE espera 2 operandos y recibió 1 (formas válidas: SAVE Vx, Vx)');
    assertAsmError('LOAD V1', 1, 'espera 2 operandos');
    assertAsmError('SAVE V1, V2, V3', 1, 'espera 2 operandos');
    assertAsmMessage('SAVE V1, VG', 'Línea 1: operandos inválidos para SAVE: "V1, VG" (formas válidas: SAVE Vx, Vx)');
    assertAsmError('LOAD VG, V1', 1, 'inválidos');
    assertAsmError('LOAD V1, 5', 1, 'inválidos');
    assertAsmError('SAVE [I], V2', 1, 'inválidos');
  });

  it('LD I, LONG: la dirección va de 0 a 0xFFFF', () => {
    assertAsmMessage('LD I, LONG 0x10000', 'Línea 1: dirección fuera de rango para LD I, LONG (0..0xFFFF): "0x10000" = 65536');
    assertAsmError('LD I, LONG -1', 1, '(0..0xFFFF)');
    // fin queda en 0x204, después de los 4 bytes: 0x204 + 0xFFFF = 66051.
    assertAsmError('\n\nLD I, LONG fin + 0xFFFF\nfin:', 3, '"fin + 0xFFFF" = 66051');
  });

  it('LD I, LONG sin dirección', () => {
    assertAsmMessage('LD I, LONG', 'Línea 1: falta la dirección después de LONG (por ejemplo: LD I, LONG 0x1234)');
    assertAsmError('CLS\nld i, long   ; nada', 2, 'falta la dirección después de LONG');
  });

  it('LONG solo va con LD I', () => {
    assertAsmError('JP LONG 0x1234', 1, 'operandos inválidos para JP');
    assertAsmError('CALL LONG 0x300', 1, 'operandos inválidos para CALL');
    assertAsmError('LD V1, LONG 5', 1, 'operandos inválidos para LD');
    assertAsmError('LD LONG 5, V1', 1, 'operandos inválidos para LD');
    assertAsmError('DB LONG 5', 1, 'reservado');
    assertAsmError('LD I, LONG 0x1234 + LONG', 1, 'reservado');
  });

  it('LD HF, LD R y PITCH reciben un registro', () => {
    assertAsmMessage('PITCH 5', 'Línea 1: operandos inválidos para PITCH: "5" (formas válidas: PITCH Vx)');
    assertAsmError('PITCH', 1, 'espera 1 operando');
    assertAsmError('PITCH V1, V2', 1, 'espera 1 operando');
    assertAsmError('LD HF, 5', 1, 'operandos inválidos para LD: "HF, 5"');
    assertAsmError('LD HF, VG', 1, 'inválidos');
    assertAsmError('LD HF, [I]', 1, 'inválidos');
    assertAsmError('LD V1, HF', 1, 'inválidos');
    assertAsmError('LD R, 5', 1, 'inválidos');
    assertAsmError('LD R, R', 1, 'inválidos');
    assertAsmError('LD I, R', 1, 'inválidos');
  });

  it('las formas válidas de LD incluyen las nuevas', () => {
    assertAsmError('LD HF, 5', 1, '| LD HF, Vx | LD R, Vx | LD Vx, R | LD I, LONG valor)');
  });

  it('las instrucciones sin operandos no aceptan ninguno, y las de un valor lo exigen', () => {
    for (const m of ['SCR', 'SCL', 'EXIT', 'LOW', 'HIGH', 'AUDIO']) {
      assertAsmMessage(m + ' V1', 'Línea 1: ' + m + ' espera 0 operandos y recibió 1 (formas válidas: ' + m + ')');
    }
    assertAsmMessage('SCD', 'Línea 1: SCD espera 1 operando y recibió 0 (formas válidas: SCD valor)');
    assertAsmError('SCU', 1, 'espera 1 operando');
    assertAsmError('PLANE', 1, 'espera 1 operando');
  });

  it('HF no admite espacios adentro', () => {
    assertAsmMessage('LD H F, V1', 'Línea 1: el operando "H F" tiene espacios adentro: se escribe "HF"');
  });

  it('LD I con una dirección de 16 bits sugiere LD I, LONG', () => {
    assertAsmMessage('LD I, 0x1234', 'Línea 1: dirección fuera de rango (0..0xFFF): "0x1234" = 4660; ' +
      'para cargar en I una dirección de 16 bits usá LD I, LONG (XO-CHIP)');
    // Fuera de 16 bits, negativa o con otra instrucción, el mensaje de siempre.
    assertAsmMessage('LD I, 0x10000', 'Línea 1: dirección fuera de rango (0..0xFFF): "0x10000" = 65536');
    assertAsmMessage('LD I, -1', 'Línea 1: dirección fuera de rango (0..0xFFF): "-1" = -1');
    assertAsmMessage('JP 0x1000', 'Línea 1: dirección fuera de rango (0..0xFFF): "0x1000" = 4096');
  });
});

describe('nombres reservados nuevos', () => {
  const NEW = ['HF', 'R', 'LONG', 'SCD', 'SCU', 'SCR', 'SCL', 'EXIT', 'LOW', 'HIGH', 'SAVE', 'LOAD', 'PLANE',
    'AUDIO', 'PITCH'];
  // En mayúsculas, en minúsculas y mezclado ("Hf", "Low").
  const spellings = (n) => Array.from(new Set([n, n.toLowerCase(), n[0] + n.slice(1).toLowerCase()]));

  it('no sirven como etiqueta, en ninguna combinación de mayúsculas', () => {
    for (const n of NEW) {
      for (const s of spellings(n)) {
        assertAsmMessage(s + ': CLS', 'Línea 1: "' + s + '" es un nombre reservado y no puede usarse como etiqueta ni constante');
      }
    }
  });

  it('ni como constante', () => {
    for (const n of NEW) {
      for (const s of spellings(n)) assertAsmError('CLS\n' + s + ' EQU 1', 2, 'reservado');
    }
  });

  it('ni dentro de una expresión', () => {
    for (const n of NEW) {
      for (const s of spellings(n)) assertAsmError('DB ' + s + ' + 1', 1, 'reservado');
    }
  });

  it('los nombres que solo empiezan igual siguen valiendo', () => {
    const r = assemble('low_x: CLS\nsaved: CLS\nR2 EQU 5\nhigh.score: CLS\nLONGITUD EQU 3\nexit_: JP exit_\n' +
      'LD V0, R2 + LONGITUD\nLD I, LONG low_x');
    assert.deepEqual(r.labels, { low_x: 0x200, saved: 0x202, 'high.score': 0x204, exit_: 0x206 });
    assert.deepEqual(Array.from(r.bytes).slice(-6), [0x60, 8, 0xF0, 0x00, 0x02, 0x00]);
  });
});

describe('XO-CHIP: memoria hasta 0xFFFF (opción xochip, --xo en la línea de comandos)', () => {
  const LINE = 'DB 0,0,0,0,0,0,0,0';

  it('sin la opción el programa no puede pasar de 0xFFF, y el mensaje sugiere --xo', () => {
    assert.deepEqual(bytesOf('DB 1', { origin: 0xFFF }), [1]);
    assertAsmMessage('DB 1, 2', 'Línea 1: el programa no entra en la memoria (se pasa de la dirección 0xFFF; ' +
      'si es para XO-CHIP, que llega hasta 0xFFFF, ensamblá con --xo o con la opción xochip)', { origin: 0xFFF });
    assertAsmError('DB 1, 2', 1, '0xFFF', { origin: 0xFFF, xochip: false });
    // LD I, LONG cuenta sus 4 bytes: en 0xFFE ya no entra.
    assertAsmError('CLS\nLD I, LONG 0', 2, '--xo', { origin: 0xFFC });
  });

  it('con la opción el programa puede llegar hasta 0xFFFF, y no más', () => {
    const full = Array.from({ length: (0x10000 - 0x200) / 8 }, () => LINE).join('\n');
    assert.equal(assemble(full, { xochip: true }).bytes.length, 0x10000 - 0x200);
    assertAsmMessage(full + '\nDB 0', 'Línea 8129: el programa no entra en la memoria de XO-CHIP ' +
      '(se pasa de la dirección 0xFFFF)', { xochip: true });
    // Sin la opción, el mismo programa se pasa en la línea 449 (448 * 8 = 0x1000 - 0x200).
    assertAsmError(full, 449, 'no entra en la memoria (se pasa de la dirección 0xFFF;');
    assert.deepEqual(bytesOf('CLS\nLD I, LONG 0', { origin: 0xFFFA, xochip: true }), [0x00, 0xE0, 0xF0, 0x00, 0x00, 0x00]);
    assertAsmError('CLS\nLD I, LONG 0', 2, 'XO-CHIP', { origin: 0xFFFC, xochip: true });
  });

  it('las etiquetas pueden quedar más allá de 0xFFF', () => {
    const r = assemble('DB 1, 2\nmas_alla: DB 3\nfin:', { origin: 0xFFE, xochip: true });
    assert.deepEqual(r.labels, { mas_alla: 0x1000, fin: 0x1001 });
    assert.deepEqual(Array.from(r.bytes), [1, 2, 3]);
  });

  it('origin puede llegar a 0xFFFF con la opción (sin ella, hasta 0xFFF)', () => {
    assert.deepEqual(bytesOf('DB 7', { origin: 0xFFFF, xochip: true }), [7]);
    assert.throws(() => assemble('DB 7', { origin: 0x1000 }),
      { name: 'RangeError', message: 'origin debe ser una dirección entre 0x000 y 0xFFF' });
    assert.throws(() => assemble('DB 7', { origin: 0x10000, xochip: true }),
      { name: 'RangeError', message: 'origin debe ser una dirección entre 0x000 y 0xFFFF' });
  });

  it('las direcciones de 12 bits siguen yendo de 0 a 0xFFF con la opción', () => {
    for (const t of ['JP 0x1000', 'CALL 0x1000', 'SYS 0x1000', 'JP V0, 0x1000', 'LD I, 0x1000']) {
      assertAsmError(t, 1, 'dirección fuera de rango (0..0xFFF)', { xochip: true });
    }
    assert.deepEqual(bytesOf('JP 0xFFF\nCALL 0xFFF\nLD I, 0xFFF', { xochip: true }), [0x1F, 0xFF, 0x2F, 0xFF, 0xAF, 0xFF]);
  });

  it('lo que queda más allá de 0xFFF se alcanza con LD I, LONG', () => {
    const options = { origin: 0xFFC, xochip: true };
    assert.deepEqual(bytesOf('LD I, LONG datos\ndatos: DB 0xAA', options), [0xF0, 0x00, 0x10, 0x00, 0xAA]);
    assertAsmMessage('LD I, datos\nDB 0, 0\ndatos: DB 0xAA', 'Línea 1: dirección fuera de rango (0..0xFFF): ' +
      '"datos" = 4096; para cargar en I una dirección de 16 bits usá LD I, LONG (XO-CHIP)', options);
    assertAsmError('JP datos\nDB 0, 0\ndatos: CLS', 1, '"datos" = 4096', options);
  });

  it('no cambia nada en los programas que entran en 0xFFF (los cartuchos dan los mismos bytes)', () => {
    const roms = fs.readdirSync(path.join(ROOT, 'roms')).filter((f) => f.endsWith('.asm'));
    assert.ok(roms.length >= 5);
    for (const f of roms) {
      const src = fs.readFileSync(path.join(ROOT, 'roms', f), 'utf8');
      assert.deepEqual(bytesOf(src, { xochip: true }), bytesOf(src), f);
    }
  });
});

describe('listado de las instrucciones nuevas', () => {
  it('LD I, LONG ocupa una sola entrada con sus 4 bytes', () => {
    const { listing } = assemble('inicio: CLS\nLD I, LONG fin\nfin: JP fin');
    assert.equal(listing.length, 3);
    assert.deepEqual(listing[1], { line: 2, addr: 0x202, bytes: [0xF0, 0x00, 0x02, 0x06], text: 'LD I, LONG fin' });
    assert.deepEqual(listing[2], { line: 3, addr: 0x206, bytes: [0x12, 0x06], text: 'fin: JP fin' });
  });

  it('formatListing muestra los 4 bytes en una fila', () => {
    const text = formatListing(assemble('inicio: CLS\nLD I, LONG 0x1234\nfin: JP fin').listing);
    assert.equal(text, [
      '   1  0x200  00 E0       inicio: CLS',
      '   2  0x202  F0 00 12 34 LD I, LONG 0x1234',
      '   3  0x206  12 06       fin: JP fin',
    ].join('\n'));
  });

  it('más allá de 0xFFF las direcciones llevan 4 dígitos y las columnas siguen alineadas', () => {
    const r = assemble('CLS\nLD I, LONG fin\n; nada\nfin: DB 1', { origin: 0xFFC, xochip: true });
    assert.equal(formatListing(r.listing), [
      '   1  0x0FFC  00 E0       CLS',
      '   2  0x0FFE  F0 00 10 02 LD I, LONG fin',
      '   3                      ; nada',
      '   4  0x1002  01          fin: DB 1',
    ].join('\n'));
  });
});

describe('línea de comandos: --xo', () => {
  const USAGE = 'Uso: node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]';
  let dir;
  const cli = (...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: dir, encoding: 'utf8' });

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8asm-xo-'));
    // 449 líneas de 8 bytes desde 0x200: 3592 bytes, 8 más de los que entran hasta 0xFFF.
    fs.writeFileSync(path.join(dir, 'grande.asm'), Array.from({ length: 449 }, () => 'DB 0,0,0,0,0,0,0,0').join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'largo.asm'), 'LD I, LONG datos\nfin: JP fin\ndatos: DB 0xAA\n');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sin --xo, un programa que pasa de 0xFFF es un error que sugiere --xo, y no escribe nada', () => {
    const res = cli('grande.asm');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /^grande\.asm: Línea 449: el programa no entra en la memoria \(se pasa de la dirección 0xFFF; .*--xo/);
    assert.ok(!fs.existsSync(path.join(dir, 'grande.ch8')), 'no escribe nada');
  });

  it('con --xo el mismo programa se ensambla', () => {
    const res = cli('grande.asm', '--xo');
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(path.join(dir, 'grande.ch8')).length, 3592);
    assert.match(res.stdout, /Ensamblado grande\.asm: 3592 bytes -> grande\.ch8/);
  });

  it('--xo se combina con la salida y con --listing, en cualquier orden', () => {
    const res = cli('--xo', 'largo.asm', '--listing', 'otro.ch8');
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(Array.from(fs.readFileSync(path.join(dir, 'otro.ch8'))), [0xF0, 0x00, 0x02, 0x06, 0x12, 0x04, 0xAA]);
    assert.match(res.stdout, /0x200\s+F0 00 02 06\s+LD I, LONG datos/);
  });

  it('--listing muestra la instrucción de 4 bytes también sin --xo', () => {
    const res = cli('largo.asm', '--listing');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^ {3}1 {2}0x200 {2}F0 00 02 06 LD I, LONG datos$/m);
    assert.match(res.stdout, /^ {3}2 {2}0x204 {2}12 04 {7}fin: JP fin$/m);
    assert.deepEqual(Array.from(fs.readFileSync(path.join(dir, 'largo.ch8'))), [0xF0, 0x00, 0x02, 0x06, 0x12, 0x04, 0xAA]);
  });

  it('--xo va en minúsculas, igual que --listing', () => {
    const res = cli('largo.asm', '--XO');
    assert.equal(res.status, 1);
    assert.match(res.stderr, /opción desconocida: --XO/);
    assert.ok(res.stderr.includes(USAGE));
  });

  it('el uso menciona --xo', () => {
    const res = cli('--help');
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), USAGE);
  });
});

describe('ida y vuelta con el desensamblador de SUPER-CHIP y XO-CHIP', () => {
  const core = loadCore();
  const MISSING = 'el núcleo todavía no exporta PLATFORMS: falta el desensamblador de SUPER-CHIP y XO-CHIP ' +
    '(disassemble(opcode, quirks, platform, nextWord))';

  for (const platform of ['schip', 'xochip']) {
    it('assemble(disassemble(w, undefined, \'' + platform + '\')) reproduce las 65536 palabras', () => {
      assert.ok(core.PLATFORMS, MISSING);
      const failures = [];
      for (let w = 0; w <= 0xFFFF; w++) {
        const text = core.disassemble(w, undefined, platform);
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
  }

  it('LD I, LONG: assemble(disassemble(0xF000, undefined, \'xochip\', n)) da F0 00 y los dos bytes de n', () => {
    assert.ok(core.PLATFORMS, MISSING);
    for (const n of [0, 1, 0x1234, 0xFFFF]) {
      const text = core.disassemble(0xF000, undefined, 'xochip', n);
      assert.deepEqual(bytesOf(text), [0xF0, 0x00, n >> 8, n & 0xFF], text);
    }
  });

  it('el desensamblador usa estos mnemónicos (si no, la ida y vuelta no probaría las instrucciones nuevas)', () => {
    assert.ok(core.PLATFORMS, MISSING);
    const d = (w, platform) => core.disassemble(w, undefined, platform);
    const superChip = { 0x00FB: 'SCR', 0x00FC: 'SCL', 0x00FD: 'EXIT', 0x00FE: 'LOW', 0x00FF: 'HIGH',
      0xF330: 'LD HF, V3', 0xF375: 'LD R, V3', 0xF385: 'LD V3, R' };
    for (const platform of ['schip', 'xochip']) {
      for (const [w, text] of Object.entries(superChip)) assert.equal(d(Number(w), platform), text, platform);
      assert.match(d(0x00C5, platform), /^SCD /, platform);
    }
    const xoChip = { 0x5122: 'SAVE V1, V2', 0x5123: 'LOAD V1, V2', 0xF002: 'AUDIO', 0xF33A: 'PITCH V3' };
    for (const [w, text] of Object.entries(xoChip)) assert.equal(d(Number(w), 'xochip'), text);
    assert.match(d(0x00D5, 'xochip'), /^SCU /);
    assert.match(d(0xF201, 'xochip'), /^PLANE /);
    assert.equal(core.disassemble(0xF000, undefined, 'xochip', 0x1234), 'LD I, LONG 0x1234');
  });
});
