#!/usr/bin/env node
// mini-emulador.js — un emulador de CHIP-8 mínimo, para leer (parte 8 del tutorial).
//
// Implementa las 35 instrucciones con el comportamiento del COSMAC VIP, pero
// sin las opciones de quirks, sin la espera de vblank, sin control de errores
// y con un FX0A simplificado. No usa el navegador: corre en Node e imprime la
// pantalla como texto. El emulador de verdad está en chip8.html.
//
// Uso: node docs/ejemplos/mini-emulador.js programa.ch8 [cuadros]
'use strict';

// La fuente: 16 glifos de 5 bytes (0, 1, ..., F). Va en la dirección 0x050.
const FONT = [
  0xF0, 0x90, 0x90, 0x90, 0xF0, 0x20, 0x60, 0x20, 0x20, 0x70, // 0 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, 0xF0, 0x10, 0xF0, 0x10, 0xF0, // 2 3
  0x90, 0x90, 0xF0, 0x10, 0x10, 0xF0, 0x80, 0xF0, 0x10, 0xF0, // 4 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, 0xF0, 0x10, 0x20, 0x40, 0x40, // 6 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, 0xF0, 0x90, 0xF0, 0x10, 0xF0, // 8 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, 0xE0, 0x90, 0xE0, 0x90, 0xE0, // A B
  0xF0, 0x80, 0x80, 0x80, 0xF0, 0xE0, 0x90, 0x90, 0x90, 0xE0, // C D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, 0xF0, 0x80, 0xF0, 0x80, 0x80, // E F
];

class MiniChip8 {
  constructor(rom, { random } = {}) {
    this.memory = new Uint8Array(4096);    // 4 KB de RAM
    this.memory.set(FONT, 0x050);
    this.memory.set(rom, 0x200);           // los programas empiezan en 0x200
    this.V = new Uint8Array(16);           // V0..VF: 8 bits cada uno
    this.I = 0;
    this.pc = 0x200;
    this.stack = [];                       // direcciones de retorno
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.display = new Uint8Array(64 * 32); // 1 = píxel prendido
    this.keys = new Uint8Array(16);        // 1 = tecla apretada
    this.random = random || (() => Math.floor(Math.random() * 256));
  }

  // Una instrucción: buscar (fetch), decodificar (decode) y ejecutar (execute).
  step() {
    const m = this.memory, V = this.V;
    // 1. Fetch: dos bytes; el primero es la parte alta (big-endian).
    const op = (m[this.pc] << 8) | m[(this.pc + 1) & 0xFFF];
    this.pc = (this.pc + 2) & 0xFFF;
    // 2. Decode: los campos que usan las instrucciones.
    const x = (op >> 8) & 0xF;   // segundo nibble: un registro
    const y = (op >> 4) & 0xF;   // tercer nibble: otro registro
    const n = op & 0xF;          // último nibble
    const nn = op & 0xFF;        // último byte
    const nnn = op & 0xFFF;      // últimos 12 bits: una dirección
    // 3. Execute: el primer nibble dice de qué familia es.
    switch (op >> 12) {
      case 0x0:
        if (op === 0x00E0) this.display.fill(0);            // CLS
        else if (op === 0x00EE) this.pc = this.stack.pop(); // RET
        break;                                              // 0NNN: se ignora
      case 0x1: this.pc = nnn; break;                       // JP NNN
      case 0x2: this.stack.push(this.pc); this.pc = nnn; break; // CALL NNN
      case 0x3: if (V[x] === nn) this.skip(); break;        // SE VX, NN
      case 0x4: if (V[x] !== nn) this.skip(); break;        // SNE VX, NN
      case 0x5: if (V[x] === V[y]) this.skip(); break;      // SE VX, VY
      case 0x6: V[x] = nn; break;                           // LD VX, NN
      case 0x7: V[x] += nn; break;                          // ADD VX, NN (VF no cambia)
      case 0x8: this.alu(x, y, n); break;                   // 8XYN: aritmética
      case 0x9: if (V[x] !== V[y]) this.skip(); break;      // SNE VX, VY
      case 0xA: this.I = nnn; break;                        // LD I, NNN
      case 0xB: this.pc = (nnn + V[0]) & 0xFFF; break;      // JP V0, NNN
      case 0xC: V[x] = this.random() & nn; break;           // RND VX, NN
      case 0xD: this.draw(V[x], V[y], n); break;            // DRW VX, VY, N
      case 0xE:
        if (nn === 0x9E && this.keys[V[x] & 0xF]) this.skip();  // SKP VX
        if (nn === 0xA1 && !this.keys[V[x] & 0xF]) this.skip(); // SKNP VX
        break;
      case 0xF: this.misc(x, nn); break;                    // FXNN: varias
    }
  }

  skip() {
    this.pc = (this.pc + 2) & 0xFFF;
  }

  // 8XYN. El Uint8Array se queda con los 8 bits de abajo de cada resultado.
  // VF se escribe al final: así, si X es F, VF termina con la bandera.
  alu(x, y, n) {
    const V = this.V, vx = V[x], vy = V[y];
    switch (n) {
      case 0x0: V[x] = vy; break;
      case 0x1: V[x] = vx | vy; V[0xF] = 0; break;   // en el VIP, OR, AND y XOR
      case 0x2: V[x] = vx & vy; V[0xF] = 0; break;   // dejan VF en 0
      case 0x3: V[x] = vx ^ vy; V[0xF] = 0; break;
      case 0x4: V[x] = vx + vy; V[0xF] = vx + vy > 255 ? 1 : 0; break; // acarreo
      case 0x5: V[x] = vx - vy; V[0xF] = vx >= vy ? 1 : 0; break;      // 1 = sin préstamo
      case 0x6: V[x] = vy >> 1; V[0xF] = vy & 1; break;
      case 0x7: V[x] = vy - vx; V[0xF] = vy >= vx ? 1 : 0; break;
      case 0xE: V[x] = vy << 1; V[0xF] = vy >> 7; break;
    }
  }

  // DXYN: N filas de 8 píxeles desde memory[I], dibujadas con XOR.
  draw(vx, vy, n) {
    const x0 = vx % 64, y0 = vy % 32;      // el punto de partida da la vuelta...
    let collision = 0;
    for (let row = 0; row < n; row++) {
      const y = y0 + row;
      if (y >= 32) break;                  // ...pero lo que sale por abajo se recorta
      const bits = this.memory[(this.I + row) & 0xFFF];
      for (let col = 0; col < 8; col++) {
        const x = x0 + col;
        if (x >= 64) break;                // y lo que sale por la derecha, también
        if (bits & (0x80 >> col)) {        // el bit más alto es el píxel de la izquierda
          const i = y * 64 + x;
          if (this.display[i]) collision = 1; // estaba prendido: se apaga y hay choque
          this.display[i] ^= 1;
        }
      }
    }
    this.V[0xF] = collision;
  }

  // FXNN: timers, teclado, I y memoria.
  misc(x, nn) {
    const V = this.V, m = this.memory;
    switch (nn) {
      case 0x07: V[x] = this.delayTimer; break;               // LD VX, DT
      case 0x0A: {                                            // LD VX, K (simplificado:
        const key = this.keys.indexOf(1);                     // repite la instrucción hasta
        if (key < 0) this.pc = (this.pc - 2) & 0xFFF;         // que haya una tecla apretada)
        else V[x] = key;
        break;
      }
      case 0x15: this.delayTimer = V[x]; break;               // LD DT, VX
      case 0x18: this.soundTimer = V[x]; break;               // LD ST, VX
      case 0x1E: this.I = (this.I + V[x]) & 0xFFFF; break;    // ADD I, VX
      case 0x29: this.I = 0x050 + (V[x] & 0xF) * 5; break;    // LD F, VX
      case 0x33:                                              // LD B, VX
        m[this.I & 0xFFF] = Math.floor(V[x] / 100);
        m[(this.I + 1) & 0xFFF] = Math.floor(V[x] / 10) % 10;
        m[(this.I + 2) & 0xFFF] = V[x] % 10;
        break;
      case 0x55:                                              // LD [I], VX
        for (let i = 0; i <= x; i++) m[(this.I + i) & 0xFFF] = V[i];
        this.I = (this.I + x + 1) & 0xFFFF;                   // el VIP deja I después
        break;
      case 0x65:                                              // LD VX, [I]
        for (let i = 0; i <= x; i++) V[i] = m[(this.I + i) & 0xFFF];
        this.I = (this.I + x + 1) & 0xFFFF;
        break;
    }
  }

  // Un cuadro de 60 Hz: unas cuantas instrucciones y un tic de cada timer.
  runFrame(ipf = 15) {
    for (let i = 0; i < ipf; i++) this.step();
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;  // mientras sea > 0, suena el beep
  }

  // La pantalla como texto: "#" prendido, "." apagado.
  screenText() {
    const rows = [];
    for (let y = 0; y < 32; y++) {
      let row = '';
      for (let x = 0; x < 64; x++) row += this.display[y * 64 + x] ? '#' : '.';
      rows.push(row);
    }
    return rows.join('\n');
  }
}

module.exports = { MiniChip8 };

if (require.main === module) {
  const fs = require('fs');
  const [file, frames = '120'] = process.argv.slice(2);
  if (!file) {
    console.error('Uso: node docs/ejemplos/mini-emulador.js programa.ch8 [cuadros]');
    process.exit(1);
  }
  const cpu = new MiniChip8(fs.readFileSync(file));
  for (let f = 0; f < Number(frames); f++) cpu.runFrame(15);
  console.log(cpu.screenText());
}
