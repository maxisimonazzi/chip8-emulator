'use strict';
// Timers (delay/sonido) y teclado (EX9E, EXA1, FX0A, setKey).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { makeCpu, runSteps } = require('./harness');

describe('tickTimers', () => {
  it('decrementa ambos timers si son mayores que 0', () => {
    const cpu = makeCpu([]);
    cpu.delayTimer = 10;
    cpu.soundTimer = 3;
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 9);
    assert.equal(cpu.soundTimer, 2);
  });

  it('no baja de 0', () => {
    const cpu = makeCpu([]);
    cpu.delayTimer = 1;
    cpu.soundTimer = 0;
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
  });

  it('los timers son independientes', () => {
    const cpu = makeCpu([]);
    cpu.delayTimer = 0;
    cpu.soundTimer = 2;
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 1);
  });

  it('255 ticks llevan 255 a 0', () => {
    const cpu = makeCpu([]);
    cpu.delayTimer = 255;
    cpu.soundTimer = 255;
    for (let i = 0; i < 255; i++) cpu.tickTimers();
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
  });

  it('no ejecuta instrucciones', () => {
    const cpu = makeCpu([0x6001]);
    cpu.tickTimers();
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.V[0], 0);
  });
});

describe('timers y step/runFrame', () => {
  it('step() no toca los timers', () => {
    const cpu = makeCpu([0x7001, 0x1200]);
    cpu.delayTimer = 5;
    cpu.soundTimer = 7;
    runSteps(cpu, 100);
    assert.equal(cpu.delayTimer, 5);
    assert.equal(cpu.soundTimer, 7);
  });

  it('runFrame decrementa los timers exactamente una vez, sea cual sea ipf', () => {
    for (const ipf of [1, 15, 200]) {
      const cpu = makeCpu([0x7001, 0x1200], { quirks: { displayWait: false } });
      cpu.delayTimer = 10;
      cpu.soundTimer = 10;
      assert.equal(cpu.runFrame(ipf), ipf);
      assert.equal(cpu.delayTimer, 9, `ipf=${ipf}`);
      assert.equal(cpu.soundTimer, 9, `ipf=${ipf}`);
    }
  });

  it('runFrame decrementa una vez también si corta temprano por DXYN (displayWait)', () => {
    const cpu = makeCpu([0xD011, 0x1200], { quirks: { displayWait: true } });
    cpu.delayTimer = 4;
    assert.equal(cpu.runFrame(50), 1);
    assert.equal(cpu.delayTimer, 3);
  });

  it('60 frames bajan 60 el delay timer', () => {
    const cpu = makeCpu([0x1200]);
    cpu.delayTimer = 100;
    for (let i = 0; i < 60; i++) cpu.runFrame(10);
    assert.equal(cpu.delayTimer, 40);
  });

  it('el timer se decrementa después de ejecutar las instrucciones del frame', () => {
    // LD V0,5 | LD DT,V0 | LD V1,DT  -> V1 lee 5 dentro del mismo frame; al final DT = 4
    const cpu = makeCpu([0x6005, 0xF015, 0xF107, 0x1206], { quirks: { displayWait: false } });
    cpu.runFrame(3);
    assert.equal(cpu.V[1], 5);
    assert.equal(cpu.delayTimer, 4);
  });
});

describe('FX15 / FX18 / FX07', () => {
  it('FX15 y luego FX07 devuelven el mismo valor', () => {
    const cpu = makeCpu([0xF115, 0xF207]);
    cpu.V[1] = 0x3C;
    runSteps(cpu, 2);
    assert.equal(cpu.delayTimer, 0x3C);
    assert.equal(cpu.V[2], 0x3C);
  });

  it('FX07 ve el valor decrementado tras un tick', () => {
    const cpu = makeCpu([0xF115, 0xF207]);
    cpu.V[1] = 0x3C;
    cpu.step();
    cpu.tickTimers();
    cpu.step();
    assert.equal(cpu.V[2], 0x3B);
  });

  it('FX18 carga el sound timer y FX07 no lo lee', () => {
    const cpu = makeCpu([0xF118, 0xF207]);
    cpu.V[1] = 0x20;
    cpu.V[2] = 0x99;
    runSteps(cpu, 2);
    assert.equal(cpu.soundTimer, 0x20);
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.V[2], 0);
  });

  it('esperar con el delay timer: bucle hasta DT == 0', () => {
    // LD V0,3 | LD DT,V0 | loop: LD V1,DT | SE V1,0 | JP loop | LD V2,1 | JP self
    const cpu = makeCpu([0x6003, 0xF015, 0xF107, 0x3100, 0x1204, 0x6201, 0x120C], {
      quirks: { displayWait: false },
    });
    cpu.runFrame(3);
    assert.equal(cpu.V[2], 0);
    for (let i = 0; i < 5; i++) cpu.runFrame(10);
    assert.equal(cpu.V[2], 1);
    assert.equal(cpu.delayTimer, 0);
  });
});

describe('setKey', () => {
  it('actualiza keys[key]', () => {
    const cpu = makeCpu([]);
    cpu.setKey(0x7, true);
    assert.equal(cpu.keys[7], 1);
    cpu.setKey(0xF, true);
    assert.equal(cpu.keys[15], 1);
    cpu.setKey(0x7, false);
    assert.equal(cpu.keys[7], 0);
    assert.equal(cpu.keys[15], 1);
  });

  it('presionar teclas fuera de una espera no cambia registros ni pc', () => {
    const cpu = makeCpu([0x6001]);
    cpu.setKey(3, true);
    cpu.setKey(3, false);
    assert.equal(cpu.pc, 0x200);
    assert.ok(Array.from(cpu.V).every((v) => v === 0));
    assert.equal(cpu.waitingForKey, false);
  });
});

describe('EX9E / EXA1', () => {
  for (let k = 0; k < 16; k++) {
    it(`tecla ${k.toString(16).toUpperCase()}: SKP y SKNP según esté presionada`, () => {
      const skp = makeCpu([0xE59E]);
      skp.V[5] = k;
      skp.setKey(k, true);
      skp.step();
      assert.equal(skp.pc, 0x204);

      const skpUp = makeCpu([0xE59E]);
      skpUp.V[5] = k;
      skpUp.setKey((k + 1) & 0xF, true);
      skpUp.step();
      assert.equal(skpUp.pc, 0x202);

      const sknp = makeCpu([0xE5A1]);
      sknp.V[5] = k;
      sknp.setKey(k, true);
      sknp.step();
      assert.equal(sknp.pc, 0x202);

      const sknpUp = makeCpu([0xE5A1]);
      sknpUp.V[5] = k;
      sknpUp.step();
      assert.equal(sknpUp.pc, 0x204);
    });
  }

  it('con VX > 15 se usa VX & 0xF', () => {
    const cpu = makeCpu([0xE19E, 0x0000, 0xE1A1]);
    cpu.V[1] = 0x15; // tecla 5
    cpu.setKey(5, true);
    cpu.step();
    assert.equal(cpu.pc, 0x204);
    cpu.step();
    assert.equal(cpu.pc, 0x206, 'SKNP no salta porque la tecla 5 está presionada');
  });

  it('VX = 0xFF -> tecla F', () => {
    const cpu = makeCpu([0xE2A1]);
    cpu.V[2] = 0xFF;
    cpu.setKey(0xF, true);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });

  it('reflejan una tecla soltada', () => {
    const cpu = makeCpu([0xE09E, 0xE09E]);
    cpu.setKey(0, true);
    cpu.setKey(0, false);
    cpu.step();
    assert.equal(cpu.pc, 0x202);
  });
});

describe('FX0A espera de tecla', () => {
  it('bloquea: step devuelve false, pc queda después del FX0A y waitingForKey es true', () => {
    const cpu = makeCpu([0xF30A, 0x6101]);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.waitingForKey, true);
    assert.equal(cpu.pc, 0x202);
    for (let i = 0; i < 5; i++) {
      assert.equal(cpu.step(), false);
      assert.equal(cpu.pc, 0x202);
    }
    assert.equal(cpu.V[1], 0);
  });

  it('se completa recién al soltar la tecla presionada', () => {
    const cpu = makeCpu([0xF30A, 0x6101]);
    cpu.V[3] = 0xEE;
    cpu.step();
    cpu.setKey(9, true);
    assert.equal(cpu.waitingForKey, true);
    assert.equal(cpu.V[3], 0xEE, 'VX no cambia mientras la tecla sigue presionada');
    assert.equal(cpu.step(), false);
    cpu.setKey(9, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[3], 9);
    assert.equal(cpu.step(), true);
    assert.equal(cpu.V[1], 1);
    assert.equal(cpu.pc, 0x204);
  });

  it('ignora una tecla que ya estaba presionada hasta que se suelte y se vuelva a presionar', () => {
    const cpu = makeCpu([0xF30A]);
    cpu.setKey(7, true);
    cpu.step();
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(7, false);
    assert.equal(cpu.waitingForKey, true, 'soltar una tecla presionada antes de la espera no cuenta');
    cpu.setKey(7, true);
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(7, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[3], 7);
  });

  it('una tecla mantenida de antes no bloquea a otra tecla nueva', () => {
    const cpu = makeCpu([0xF30A]);
    cpu.setKey(2, true);
    cpu.step();
    cpu.setKey(0xB, true);
    cpu.setKey(0xB, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[3], 0xB);
  });

  it('recuerda la primera tecla presionada; soltar otra no completa la espera', () => {
    const cpu = makeCpu([0xF30A]);
    cpu.step();
    cpu.setKey(5, true);
    cpu.setKey(0xA, true);
    cpu.setKey(0xA, false);
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(5, false);
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.V[3], 5);
  });

  it('una segunda espera exige una nueva pulsación', () => {
    const cpu = makeCpu([0xF10A, 0xF20A]);
    cpu.step();
    cpu.setKey(4, true);
    cpu.setKey(4, false);
    assert.equal(cpu.V[1], 4);
    cpu.step();
    assert.equal(cpu.waitingForKey, true);
    cpu.setKey(6, true);
    cpu.setKey(6, false);
    assert.equal(cpu.V[2], 6);
    assert.equal(cpu.pc, 0x204);
  });

  it('FX0A con X = F guarda la tecla en VF', () => {
    const cpu = makeCpu([0xFF0A]);
    cpu.step();
    cpu.setKey(0xD, true);
    cpu.setKey(0xD, false);
    assert.equal(cpu.V[0xF], 0xD);
  });

  it('los timers siguen bajando mientras espera', () => {
    const cpu = makeCpu([0xF00A]);
    cpu.delayTimer = 10;
    cpu.soundTimer = 5;
    cpu.runFrame(10);
    assert.equal(cpu.waitingForKey, true);
    assert.equal(cpu.delayTimer, 9);
    assert.equal(cpu.soundTimer, 4);
    assert.equal(cpu.runFrame(10), 0);
    assert.equal(cpu.delayTimer, 8);
    assert.equal(cpu.soundTimer, 3);
  });

  it('runFrame se detiene temprano cuando empieza una espera', () => {
    const cpu = makeCpu([0x6001, 0xF00A, 0x6102, 0x1206], { quirks: { displayWait: false } });
    assert.equal(cpu.runFrame(10), 2);
    assert.equal(cpu.pc, 0x204);
    assert.equal(cpu.V[1], 0);
    assert.equal(cpu.waitingForKey, true);
  });

  it('después de resolverse, el siguiente frame continúa', () => {
    const cpu = makeCpu([0xF00A, 0x6102, 0x1204], { quirks: { displayWait: false } });
    assert.equal(cpu.runFrame(10), 1);
    cpu.setKey(1, true);
    cpu.setKey(1, false);
    assert.equal(cpu.runFrame(10), 10);
    assert.equal(cpu.V[1], 2);
    assert.equal(cpu.V[0], 1);
  });

  it('reset cancela la espera', () => {
    const cpu = makeCpu([0xF00A]);
    cpu.step();
    cpu.setKey(3, true);
    cpu.reset();
    assert.equal(cpu.waitingForKey, false);
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.keys[3], 0);
  });
});
