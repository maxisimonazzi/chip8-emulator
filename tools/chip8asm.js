#!/usr/bin/env node
/*
 * chip8asm.js — ensamblador de CHIP-8 sin dependencias.
 *
 * Funciona de tres maneras:
 *   - Desde Node como módulo:   const { assemble } = require('./tools/chip8asm.js');
 *   - Desde un <script> en el navegador: define globalThis.Chip8Asm = { assemble }.
 *   - Como programa de línea de comandos:
 *       node tools/chip8asm.js entrada.asm [salida.ch8] [--listing]
 *     Si no indicás la salida, se usa el mismo nombre con extensión .ch8.
 *     Con --listing además imprime el listado (dirección, bytes y línea fuente).
 *
 * API
 *   assemble(fuente, { origin = 0x200 } = {})
 *     -> { bytes: Uint8Array, labels: { nombre: dirección }, listing: [...] }
 *   listing tiene una entrada por línea de la fuente:
 *     { line: número de línea (desde 1), addr: dirección donde empieza,
 *       bytes: [bytes que generó], text: la línea original }
 *   Ante cualquier error lanza un Error cuyo mensaje empieza con "Línea N: ".
 *
 * ------------------------------------------------------------------------
 * SINTAXIS
 * ------------------------------------------------------------------------
 *   ; comentario            Todo lo que sigue a ";" hasta el fin de línea.
 *
 *   etiqueta:               Marca la dirección actual. Letras, dígitos, "_" y
 *   etiqueta: CLS           "."; no puede empezar con un dígito. Puede ir sola
 *                           o seguida de una instrucción en la misma línea.
 *
 *   NOMBRE EQU expresión    Define una constante (no ocupa memoria).
 *
 *   DB expr, expr, ...      Emite bytes (0..255, o -128..-1 en complemento a 2).
 *   DW expr, expr, ...      Emite palabras de 16 bits, big-endian (byte alto
 *                           primero), igual que las instrucciones.
 *
 *   Números:     42   0x2A   $2A   0b00101010   %00101010
 *   Expresiones: números, etiquetas y constantes sumados y restados con + y -
 *                (por ejemplo: tabla + 3, FIN - INICIO, -1).
 *   Un byte negativo (-128..-1) se acepta en cualquier lugar donde va un byte:
 *   "ADD V1, -1" es lo mismo que "ADD V1, 0xFF".
 *
 *   Mayúsculas y minúsculas: las instrucciones, los registros y las directivas
 *   (EQU, DB, DW) se pueden escribir como quieras ("ld v1, 5" = "LD V1, 5").
 *   Las etiquetas y las constantes, en cambio, distinguen mayúsculas ("Fin" y
 *   "fin" son dos etiquetas distintas).
 *
 *   Nombres reservados (no sirven como etiqueta ni constante, en ninguna
 *   combinación de mayúsculas): V0..VF, I, DT, ST, K, F, B, las instrucciones
 *   y las directivas.
 *
 *   El ensamblador hace dos pasadas, así que podés usar una etiqueta antes de
 *   definirla (referencias hacia adelante).
 *
 * INSTRUCCIONES (las mismas que muestra el desensamblador del emulador)
 *   Vx, Vy = registros V0..VF    nn = byte    nnn = dirección (0..0xFFF)
 *   n = nibble (0..15)
 *
 *   CLS                00E0   borra la pantalla
 *   RET                00EE   vuelve de una subrutina
 *   SYS nnn            0nnn   rutina de máquina (el emulador la ignora)
 *   JP nnn             1nnn   salta a nnn
 *   CALL nnn           2nnn   llama a la subrutina en nnn
 *   SE Vx, nn          3xnn   saltea la siguiente si Vx == nn
 *   SNE Vx, nn         4xnn   saltea la siguiente si Vx != nn
 *   SE Vx, Vy          5xy0   saltea la siguiente si Vx == Vy
 *   LD Vx, nn          6xnn   Vx = nn
 *   ADD Vx, nn         7xnn   Vx = Vx + nn (sin tocar VF)
 *   LD Vx, Vy          8xy0   Vx = Vy
 *   OR Vx, Vy          8xy1   Vx = Vx | Vy
 *   AND Vx, Vy         8xy2   Vx = Vx & Vy
 *   XOR Vx, Vy         8xy3   Vx = Vx ^ Vy
 *   ADD Vx, Vy         8xy4   Vx = Vx + Vy, VF = acarreo
 *   SUB Vx, Vy         8xy5   Vx = Vx - Vy, VF = 1 si no hubo préstamo
 *   SHR Vx, Vy         8xy6   desplaza a la derecha, VF = bit que sale
 *   SUBN Vx, Vy        8xy7   Vx = Vy - Vx, VF = 1 si no hubo préstamo
 *   SHL Vx, Vy         8xyE   desplaza a la izquierda, VF = bit que sale
 *   SHR Vx / SHL Vx           formas cortas de SHR Vx, Vx y SHL Vx, Vx
 *   SNE Vx, Vy         9xy0   saltea la siguiente si Vx != Vy
 *   LD I, nnn          Annn   I = nnn
 *   JP V0, nnn         Bnnn   salta a nnn + V0
 *   RND Vx, nn         Cxnn   Vx = número al azar & nn
 *   DRW Vx, Vy, n      Dxyn   dibuja un sprite de n filas en (Vx, Vy)
 *   SKP Vx             Ex9E   saltea la siguiente si la tecla Vx está apretada
 *   SKNP Vx            ExA1   saltea la siguiente si la tecla Vx NO está apretada
 *   LD Vx, DT          Fx07   Vx = temporizador de retardo
 *   LD Vx, K           Fx0A   espera una tecla y la guarda en Vx
 *   LD DT, Vx          Fx15   temporizador de retardo = Vx
 *   LD ST, Vx          Fx18   temporizador de sonido = Vx
 *   ADD I, Vx          Fx1E   I = I + Vx
 *   LD F, Vx           Fx29   I = dirección del dígito Vx de la fuente
 *   LD B, Vx           Fx33   guarda Vx en decimal (centenas, decenas, unidades)
 *   LD [I], Vx         Fx55   guarda V0..Vx en memoria a partir de I
 *   LD Vx, [I]         Fx65   carga V0..Vx desde memoria a partir de I
 *
 *   Todo lo que produce el desensamblador se puede volver a ensamblar, incluso
 *   "DW 0x5121" (así muestra las palabras que no son instrucciones válidas).
 *
 * EJEMPLO
 *       LD V0, 10          ; x
 *       LD V1, 5           ; y
 *       LD I, cara
 *       DRW V0, V1, 3
 *   fin: JP fin            ; un programa termina en un salto a sí mismo
 *   cara: DB %01000010, %00000000, %00111100
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------

  function hex(n, digits) {
    return '0x' + n.toString(16).toUpperCase().padStart(digits, '0');
  }

  function AsmError(lineNo, message) {
    const err = new Error('Línea ' + lineNo + ': ' + message);
    err.line = lineNo;
    return err;
  }

  const DIRECTIVES = ['EQU', 'DB', 'DW'];
  const MNEMONICS = ['CLS', 'RET', 'SYS', 'JP', 'CALL', 'SE', 'SNE', 'LD', 'ADD', 'OR', 'AND',
    'XOR', 'SUB', 'SUBN', 'SHR', 'SHL', 'RND', 'DRW', 'SKP', 'SKNP'];
  const SPECIALS = ['I', 'DT', 'ST', 'K', 'F', 'B'];

  const NAME_RE = /^[A-Za-z_.][A-Za-z0-9_.]*$/;

  function isReservedName(name) {
    const up = name.toUpperCase();
    return /^V[0-9A-F]$/.test(up) || SPECIALS.includes(up) || MNEMONICS.includes(up) ||
      DIRECTIVES.includes(up) || up === '[I]';
  }

  // Quita el comentario (todo desde ";").
  function stripComment(line) {
    const i = line.indexOf(';');
    return i >= 0 ? line.slice(0, i) : line;
  }

  // Separa operandos por comas. Una coma sin nada a un lado es un error.
  function splitOperands(text, lineNo) {
    const trimmed = text.trim();
    if (trimmed === '') return [];
    const parts = trimmed.split(',').map((s) => s.trim());
    if (parts.some((p) => p === '')) throw AsmError(lineNo, 'falta un operando entre comas');
    return parts;
  }

  // ------------------------------------------------------------------
  // Números y expresiones
  // ------------------------------------------------------------------

  function parseNumber(tok, lineNo) {
    let m;
    if ((m = /^0x([0-9a-f]+)$/i.exec(tok))) return parseInt(m[1], 16);
    if ((m = /^\$([0-9a-f]+)$/i.exec(tok))) return parseInt(m[1], 16);
    if ((m = /^0b([01]+)$/i.exec(tok))) return parseInt(m[1], 2);
    if ((m = /^%([01]+)$/.exec(tok))) return parseInt(m[1], 2);
    if (/^[0-9]+$/.test(tok)) return parseInt(tok, 10);
    throw AsmError(lineNo, 'número inválido: "' + tok + '"');
  }

  // Convierte el texto de una expresión en una lista de términos con signo:
  // [{ sign: 1 | -1, kind: 'num' | 'name', value | name }]
  function parseExpression(text, lineNo) {
    const src = text.trim();
    if (src === '') throw AsmError(lineNo, 'falta una expresión');
    const terms = [];
    let i = 0;
    let expectTerm = true;
    let sign = 1;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '+' || c === '-') {
        if (expectTerm) {
          if (c === '-') sign = -sign;
        } else {
          sign = c === '-' ? -1 : 1;
          expectTerm = true;
        }
        i++;
        continue;
      }
      if (!expectTerm) {
        throw AsmError(lineNo, 'expresión inválida: "' + src + '" (falta + o - entre dos términos)');
      }
      let m;
      const rest = src.slice(i);
      if ((m = /^[0-9$%][0-9A-Za-z_]*/.exec(rest))) {
        terms.push({ sign, kind: 'num', value: parseNumber(m[0], lineNo) });
      } else if ((m = /^[A-Za-z_.][A-Za-z0-9_.]*/.exec(rest))) {
        if (isReservedName(m[0])) {
          throw AsmError(lineNo, 'no se puede usar "' + m[0] + '" dentro de una expresión (es un nombre reservado)');
        }
        terms.push({ sign, kind: 'name', name: m[0] });
      } else {
        throw AsmError(lineNo, 'carácter inesperado "' + c + '" en la expresión "' + src + '"');
      }
      i += m[0].length;
      sign = 1;
      expectTerm = false;
    }
    if (expectTerm) throw AsmError(lineNo, 'la expresión "' + src + '" está incompleta');
    return terms;
  }

  // ------------------------------------------------------------------
  // Operandos
  // ------------------------------------------------------------------

  // Clasifica un operando: registro, nombre especial o expresión.
  function classify(text, lineNo) {
    const up = text.toUpperCase().replace(/\s+/g, '');
    const m = /^V([0-9A-F])$/.exec(up);
    if (m) return { kind: 'reg', reg: parseInt(m[1], 16), text };
    if (up === '[I]') return { kind: '[I]', text };
    if (SPECIALS.includes(up)) return { kind: up, text };
    return { kind: 'expr', terms: parseExpression(text, lineNo), text };
  }

  // Tabla de codificación: para cada mnemónico, las combinaciones de operandos
  // aceptadas. 'R' = registro, 'N' = expresión; el resto son literales.
  // Cada entrada: [patrón, función(ops, val) -> opcode]
  // val(op, tipo) evalúa una expresión y controla el rango ('byte', 'addr', 'nibble').
  const R = 'reg';
  const N = 'expr';
  const TABLE = {
    CLS: [[[], () => 0x00E0]],
    RET: [[[], () => 0x00EE]],
    SYS: [[[N], (o, v) => v(o[0], 'addr')]],
    JP: [
      [[N], (o, v) => 0x1000 | v(o[0], 'addr')],
      [[R, N], (o, v, line) => {
        if (o[0].reg !== 0) throw AsmError(line, 'JP con registro solo admite V0 (JP V0, dirección)');
        return 0xB000 | v(o[1], 'addr');
      }],
    ],
    CALL: [[[N], (o, v) => 0x2000 | v(o[0], 'addr')]],
    SE: [
      [[R, N], (o, v) => 0x3000 | (o[0].reg << 8) | v(o[1], 'byte')],
      [[R, R], (o) => 0x5000 | (o[0].reg << 8) | (o[1].reg << 4)],
    ],
    SNE: [
      [[R, N], (o, v) => 0x4000 | (o[0].reg << 8) | v(o[1], 'byte')],
      [[R, R], (o) => 0x9000 | (o[0].reg << 8) | (o[1].reg << 4)],
    ],
    LD: [
      [[R, N], (o, v) => 0x6000 | (o[0].reg << 8) | v(o[1], 'byte')],
      [[R, R], (o) => 0x8000 | (o[0].reg << 8) | (o[1].reg << 4)],
      [['I', N], (o, v) => 0xA000 | v(o[1], 'addr')],
      [[R, 'DT'], (o) => 0xF007 | (o[0].reg << 8)],
      [[R, 'K'], (o) => 0xF00A | (o[0].reg << 8)],
      [['DT', R], (o) => 0xF015 | (o[1].reg << 8)],
      [['ST', R], (o) => 0xF018 | (o[1].reg << 8)],
      [['F', R], (o) => 0xF029 | (o[1].reg << 8)],
      [['B', R], (o) => 0xF033 | (o[1].reg << 8)],
      [['[I]', R], (o) => 0xF055 | (o[1].reg << 8)],
      [[R, '[I]'], (o) => 0xF065 | (o[0].reg << 8)],
    ],
    ADD: [
      [[R, N], (o, v) => 0x7000 | (o[0].reg << 8) | v(o[1], 'byte')],
      [[R, R], (o) => 0x8004 | (o[0].reg << 8) | (o[1].reg << 4)],
      [['I', R], (o) => 0xF01E | (o[1].reg << 8)],
    ],
    OR: [[[R, R], (o) => 0x8001 | (o[0].reg << 8) | (o[1].reg << 4)]],
    AND: [[[R, R], (o) => 0x8002 | (o[0].reg << 8) | (o[1].reg << 4)]],
    XOR: [[[R, R], (o) => 0x8003 | (o[0].reg << 8) | (o[1].reg << 4)]],
    SUB: [[[R, R], (o) => 0x8005 | (o[0].reg << 8) | (o[1].reg << 4)]],
    SUBN: [[[R, R], (o) => 0x8007 | (o[0].reg << 8) | (o[1].reg << 4)]],
    SHR: [
      [[R], (o) => 0x8006 | (o[0].reg << 8) | (o[0].reg << 4)],
      [[R, R], (o) => 0x8006 | (o[0].reg << 8) | (o[1].reg << 4)],
    ],
    SHL: [
      [[R], (o) => 0x800E | (o[0].reg << 8) | (o[0].reg << 4)],
      [[R, R], (o) => 0x800E | (o[0].reg << 8) | (o[1].reg << 4)],
    ],
    RND: [[[R, N], (o, v) => 0xC000 | (o[0].reg << 8) | v(o[1], 'byte')]],
    DRW: [[[R, R, N], (o, v) => 0xD000 | (o[0].reg << 8) | (o[1].reg << 4) | v(o[2], 'nibble')]],
    SKP: [[[R], (o) => 0xE09E | (o[0].reg << 8)]],
    SKNP: [[[R], (o) => 0xE0A1 | (o[0].reg << 8)]],
  };

  function describePattern(mnemonic, pattern) {
    const names = pattern.map((p) => (p === R ? 'Vx' : p === N ? 'valor' : p));
    return (mnemonic + ' ' + names.join(', ')).trim();
  }

  // Busca el patrón que coincide con los operandos, o lanza un error explicativo.
  function matchPattern(mnemonic, ops, lineNo) {
    const options = TABLE[mnemonic];
    for (const entry of options) {
      const pattern = entry[0];
      if (pattern.length !== ops.length) continue;
      if (pattern.every((p, i) => ops[i].kind === p)) return entry[1];
    }
    const counts = Array.from(new Set(options.map((e) => e[0].length))).sort();
    const forms = options.map((e) => describePattern(mnemonic, e[0])).join(' | ');
    if (!counts.includes(ops.length)) {
      const expected = counts.join(' o ');
      throw AsmError(lineNo, mnemonic + ' espera ' + expected + ' operando' +
        (counts.length === 1 && counts[0] === 1 ? '' : 's') + ' y recibió ' + ops.length +
        ' (formas válidas: ' + forms + ')');
    }
    const given = ops.map((o) => o.text).join(', ');
    throw AsmError(lineNo, 'operandos inválidos para ' + mnemonic + ': "' + given +
      '" (formas válidas: ' + forms + ')');
  }

  // ------------------------------------------------------------------
  // Ensamblador
  // ------------------------------------------------------------------

  function assemble(source, options) {
    const origin = options && options.origin !== undefined ? options.origin : 0x200;
    if (typeof source !== 'string') throw new TypeError('assemble() espera el código fuente como texto');
    if (!Number.isInteger(origin) || origin < 0 || origin > 0xFFF) {
      throw new RangeError('origin debe ser una dirección entre 0x000 y 0xFFF');
    }

    const lines = source.split(/\r\n|\r|\n/);
    const labels = Object.create(null);     // nombre -> dirección
    const constants = Object.create(null);  // nombre -> { terms, line }
    const defined = Object.create(null);    // nombre -> línea donde se definió
    const items = [];                       // una entrada por línea

    function define(name, lineNo) {
      if (!NAME_RE.test(name)) throw AsmError(lineNo, 'nombre inválido: "' + name + '"');
      if (isReservedName(name)) {
        throw AsmError(lineNo, '"' + name + '" es un nombre reservado y no puede usarse como etiqueta ni constante');
      }
      if (defined[name] !== undefined) {
        throw AsmError(lineNo, '"' + name + '" ya estaba definido en la línea ' + defined[name]);
      }
      defined[name] = lineNo;
    }

    // ---------- Primera pasada: direcciones, etiquetas y constantes ----------
    let addr = origin;
    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      let text = stripComment(raw).trim();
      const item = { line: lineNo, addr, text: raw.replace(/\s+$/, ''), kind: 'none' };
      items.push(item);
      if (text === '') return;

      // NOMBRE EQU expresión
      let m = /^([^\s:,]+)\s+EQU(?:\s+(.*))?$/i.exec(text);
      if (m) {
        define(m[1], lineNo);
        if (m[2] === undefined || m[2].trim() === '') throw AsmError(lineNo, 'EQU necesita un valor');
        constants[m[1]] = { terms: parseExpression(m[2], lineNo), line: lineNo };
        return;
      }

      // etiqueta:
      m = /^([^\s:,;]+)\s*:(.*)$/.exec(text);
      if (m) {
        define(m[1], lineNo);
        labels[m[1]] = addr;
        text = m[2].trim();
        if (text === '') return;
      }

      m = /^(\S+)(?:\s+(.*))?$/.exec(text);
      const word = m[1];
      const up = word.toUpperCase();
      const operandText = m[2] || '';

      if (up === 'EQU') throw AsmError(lineNo, 'EQU necesita un nombre: NOMBRE EQU valor');
      if (up === 'DB' || up === 'DW') {
        const ops = splitOperands(operandText, lineNo);
        if (ops.length === 0) throw AsmError(lineNo, up + ' necesita al menos un valor');
        item.kind = up;
        item.exprs = ops.map((o) => parseExpression(o, lineNo));
        item.size = ops.length * (up === 'DB' ? 1 : 2);
      } else if (TABLE[up]) {
        const ops = splitOperands(operandText, lineNo).map((o) => classify(o, lineNo));
        item.kind = 'ins';
        item.encode = matchPattern(up, ops, lineNo);
        item.ops = ops;
        item.size = 2;
      } else if (/^[^\s:]+:/.test(word)) {
        throw AsmError(lineNo, 'etiqueta inválida: "' + word + '"');
      } else {
        throw AsmError(lineNo, 'instrucción desconocida: "' + word + '"');
      }
      if (addr + item.size > 0x1000) {
        throw AsmError(lineNo, 'el programa no entra en la memoria (se pasa de la dirección 0xFFF)');
      }
      addr += item.size;
    });

    // ---------- Evaluación de expresiones ----------
    const resolving = Object.create(null);
    const constValues = Object.create(null);

    function evalTerms(terms, lineNo) {
      let total = 0;
      for (const t of terms) {
        let value;
        if (t.kind === 'num') {
          value = t.value;
        } else if (labels[t.name] !== undefined) {
          value = labels[t.name];
        } else if (constants[t.name] !== undefined) {
          value = constValue(t.name, lineNo);
        } else {
          const hint = /^v[0-9a-f]+$/i.test(t.name) ? ' (los registros van de V0 a VF)' : '';
          throw AsmError(lineNo, 'etiqueta o constante desconocida: "' + t.name + '"' + hint);
        }
        total += t.sign * value;
      }
      return total;
    }

    function constValue(name, lineNo) {
      if (constValues[name] !== undefined) return constValues[name];
      if (resolving[name]) throw AsmError(lineNo, 'definición circular: la constante "' + name + '" depende de sí misma');
      resolving[name] = true;
      const c = constants[name];
      const value = evalTerms(c.terms, c.line);
      resolving[name] = false;
      constValues[name] = value;
      return value;
    }

    function checked(value, type, lineNo, text) {
      const shown = '"' + text + '" = ' + value;
      if (type === 'byte') {
        if (value < -128 || value > 255) throw AsmError(lineNo, 'valor fuera de rango para un byte (-128..255): ' + shown);
        return value & 0xFF;
      }
      if (type === 'addr') {
        if (value < 0 || value > 0xFFF) throw AsmError(lineNo, 'dirección fuera de rango (0..0xFFF): ' + shown);
        return value;
      }
      if (type === 'nibble') {
        if (value < 0 || value > 15) throw AsmError(lineNo, 'valor fuera de rango para un nibble (0..15): ' + shown);
        return value;
      }
      if (type === 'word') {
        if (value < -32768 || value > 0xFFFF) throw AsmError(lineNo, 'valor fuera de rango para una palabra (-32768..65535): ' + shown);
        return value & 0xFFFF;
      }
      throw new Error('tipo desconocido ' + type);
    }

    // Todas las constantes se evalúan aunque no se usen, para reportar errores.
    for (const name of Object.keys(constants)) constValue(name, constants[name].line);

    // ---------- Segunda pasada: generar bytes ----------
    const bytes = new Uint8Array(addr - origin);
    const listing = [];
    for (const item of items) {
      const out = [];
      if (item.kind === 'ins') {
        const val = (op, type) => checked(evalTerms(op.terms, item.line), type, item.line, op.text.trim());
        const opcode = item.encode(item.ops, val, item.line);
        out.push((opcode >> 8) & 0xFF, opcode & 0xFF);
      } else if (item.kind === 'DB') {
        for (const terms of item.exprs) {
          out.push(checked(evalTerms(terms, item.line), 'byte', item.line, termsText(terms)));
        }
      } else if (item.kind === 'DW') {
        for (const terms of item.exprs) {
          const w = checked(evalTerms(terms, item.line), 'word', item.line, termsText(terms));
          out.push((w >> 8) & 0xFF, w & 0xFF);
        }
      }
      bytes.set(out, item.addr - origin);
      listing.push({ line: item.line, addr: item.addr, bytes: out, text: item.text });
    }

    const labelsOut = {};
    for (const name of Object.keys(labels)) labelsOut[name] = labels[name];
    return { bytes, labels: labelsOut, listing };
  }

  function termsText(terms) {
    return terms.map((t, i) => {
      const s = t.kind === 'num' ? String(t.value) : t.name;
      if (i === 0) return (t.sign < 0 ? '-' : '') + s;
      return (t.sign < 0 ? ' - ' : ' + ') + s;
    }).join('');
  }

  // Da formato al listado para mostrarlo en la terminal.
  function formatListing(listing) {
    const rows = [];
    for (const entry of listing) {
      const chunks = [];
      for (let i = 0; i < entry.bytes.length; i += 4) chunks.push(entry.bytes.slice(i, i + 4));
      if (chunks.length === 0) chunks.push([]);
      chunks.forEach((chunk, i) => {
        const a = entry.bytes.length ? hex(entry.addr + i * 4, 3) : '     ';
        const b = chunk.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(12);
        const lineNo = String(entry.line).padStart(4);
        rows.push(lineNo + '  ' + a + '  ' + b + (i === 0 ? entry.text : ''));
      });
    }
    return rows.join('\n');
  }

  const api = { assemble, formatListing };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.Chip8Asm = api;
  }

  // ------------------------------------------------------------------
  // Línea de comandos
  // ------------------------------------------------------------------
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);
    const wantListing = args.includes('--listing');
    const files = args.filter((a) => !a.startsWith('--'));
    if (files.length < 1 || files.length > 2 || args.includes('--help') || args.includes('-h')) {
      console.error('Uso: node tools/chip8asm.js entrada.asm [salida.ch8] [--listing]');
      process.exit(files.length < 1 ? 1 : 0);
    }
    const input = files[0];
    const output = files[1] || input.replace(/\.[^./\\]*$/, '') + '.ch8';
    let source;
    try {
      source = fs.readFileSync(input, 'utf8');
    } catch (e) {
      console.error('No pude leer "' + input + '": ' + e.message);
      process.exit(1);
    }
    let result;
    try {
      result = assemble(source);
    } catch (e) {
      console.error(path.basename(input) + ': ' + e.message);
      process.exit(1);
    }
    fs.writeFileSync(output, result.bytes);
    if (wantListing) console.log(formatListing(result.listing));
    console.log('Ensamblado ' + path.basename(input) + ': ' + result.bytes.length + ' bytes -> ' + output);
  }
})();
