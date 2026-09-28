# Desarrollo de la consola CHIP-8

Este documento es para quien va a mantener el proyecto: cómo está armado por dentro, por
qué se tomó cada decisión, cómo se verifica y cómo se extiende. Describe el código tal
como está en el repositorio.

- Para usar la consola, empezá por el [README](../README.md).
- Para aprender CHIP-8 programando, leé el [tutorial](TUTORIAL.md).
- Para la referencia de la máquina (instrucciones, quirks, temporización, historia), está
  el [manual](MANUAL.md).

Los nombres de funciones, variables y archivos que aparecen acá existen en el código; si
cambiás alguno, buscalo también en este documento.

## Índice

1. [Resumen y requisitos](#1-resumen-y-requisitos)
2. [Arquitectura del archivo único](#2-arquitectura-del-archivo-único)
3. [El núcleo (chip8-core)](#3-el-núcleo-chip8-core)
4. [La interfaz (chip8-ui)](#4-la-interfaz-chip8-ui)
5. [Programas de demostración y herramientas](#5-programas-de-demostración-y-herramientas)
6. [Pruebas](#6-pruebas)
7. [Proceso de desarrollo](#7-proceso-de-desarrollo)
8. [Decisiones de diseño](#8-decisiones-de-diseño)
9. [Cómo extender](#9-cómo-extender)

---

## 1. Resumen y requisitos

### 1.1 Qué es y qué hay en el repositorio

Un emulador de CHIP-8 que corre en el navegador desde **un solo archivo HTML**,
`chip8.html` (unos 141 KB y 3050 líneas), **sin dependencias**: no pide nada a la red, no
usa bibliotecas, fuentes ni imágenes externas. Se abre con doble clic (`file://`) o por
HTTP. Todo lo que ve el usuario, los mensajes de error, los comentarios y la documentación
están en castellano rioplatense (voseo); los identificadores del código, en inglés.

```
chip8.html              la consola: estilos, marcado, núcleo, cartuchos e interfaz
roms/*.asm, *.ch8       fuentes y binarios de los cinco cartuchos incluidos
tools/chip8asm.js       ensamblador (módulo de Node, script de navegador y línea de comandos)
tools/embed-roms.js     ensambla roms/*.asm y los incrusta en chip8.html
tools/serve.js          servidor estático mínimo (http://localhost:8008/)
tools/e2e.js            pruebas de punta a punta en Chrome o Edge, por DevTools Protocol
tests/harness.js        saca los bloques <script> de chip8.html y los evalúa en Node
tests/*.test.js         pruebas con node:test
docs/MANUAL.md          manual de referencia de CHIP-8
docs/TUTORIAL.md        tutorial, con sus ejemplos en docs/ejemplos/
docs/DESARROLLO.md      este documento
package.json            scripts test, asm, roms, serve y e2e; sin dependencias
```

Hace falta Node.js 22 o más nuevo para las herramientas y las pruebas (se usa `node:test`
y, en `tools/e2e.js`, el `WebSocket` global de Node 22). El emulador en sí no necesita
nada: solo un navegador moderno.

### 1.2 Requisitos y dónde se cumplen

Estos son los requisitos originales del proyecto. La tabla dice dónde está implementado
cada uno y qué lo verifica. Los números de "E2E" son escenarios de `tools/e2e.js` (la
lista completa está en [6.7](#67-los-escenarios-e2e)).

| Requisito | Dónde está | Cómo se verifica |
|---|---|---|
| Las 35 instrucciones de CHIP-8 | `Chip8.prototype.step` en `chip8-core`: un `switch` por el primer nibble ([3.3](#33-buscar-decodificar-ejecutar)) | `tests/instructions.test.js` (un grupo por instrucción, 175 pruebas); el cartucho Autotest (`tests/roms.test.js`, E2E 9) |
| 4 KB de memoria | `memory = new Uint8Array(4096)`; toda dirección se enmascara con `& 0xFFF` | `tests/core-api.test.js` (constantes, estado inicial); `tests/mutation-gaps.test.js` (bordes `0xFFE`/`0xFFF`) |
| Registros V0–VF, I, PC y pila | `V` (`Uint8Array(16)`), `I`, `pc`, `stack` (`Uint16Array(16)`) y `sp` ([3.2](#32-estado-de-la-máquina)) | `tests/instructions.test.js`; `tests/core-api.test.js` (desbordes de pila) |
| Timers de retardo y sonido a 60 Hz | `tickTimers()` al final de cada `runFrame`; el bucle de la interfaz llama a `runFrame` 60 veces por segundo ([4.2](#42-el-bucle-principal)) | `tests/timers-keys.test.js`; E2E 2 (60 frames por segundo reales) y 17 (pestaña oculta) |
| Pantalla de 64×32 | `display` (`Uint8Array(2048)`) y `_draw` (XOR, colisión, recorte o vuelta) | `tests/display.test.js`; E2E 6 (la pantalla coincide píxel por píxel con el núcleo en Node) y 18 |
| Fuente hexadecimal en memoria | `FONT` en `FONT_ADDR = 0x050`, copiada por `reset()`; `FX29` | `tests/core-api.test.js` (bytes exactos, en `0x050` también después de `reset`); `tests/display.test.js` (los 16 glifos); el cartucho Fuente |
| Programas cargados en `0x200` | `PROGRAM_START`, `loadRom` (hasta 3584 bytes) | `tests/core-api.test.js` (3584 bytes entran, 3585 no; también con `ArrayBuffer`) |
| Seis quirks, con los del COSMAC VIP por defecto | `QUIRK_PRESETS`, `DEFAULT_QUIRKS`, `setQuirks`; interruptores DIP y selector de perfil ([4.9](#49-quirks-y-velocidad)) | `tests/quirks.test.js`; E2E 9 y 10 |
| Velocidad configurable en instrucciones por frame (IPF) | `runFrame(ipf)`; `setIpf` con deslizador logarítmico, campo numérico y botones (1 a 10.000, 15 por defecto) | `tests/core-api.test.js` (`runFrame`); E2E 2 y 11 |
| Cargar ROMs con un botón o arrastrándolas | `loadFile`, `loadRomBytes`, un `input type="file"` escondido y los eventos de arrastre ([4.7](#47-carga-de-roms)) | E2E 6 |
| Teclado de la computadora mapeado y keypad en pantalla | `KEY_BY_CODE` (por `KeyboardEvent.code`), `onKeyDown`/`onKeyUp`, `buildKeypad` ([4.5](#45-teclado-keypad-y-foco)) | `tests/timers-keys.test.js` (`setKey`, `EX9E`/`EXA1`, `FX0A`); E2E 3, 4, 20 y 21 |
| Pantalla retro, nítida y escalada | `resizeScreen` (escala entera con `devicePixelRatio`), `render`, efectos de tubo y los modos Tubo CRT / Píxeles puros ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)) | E2E 15 (nitidez con escala 1,25 y 2), 18 y 24 |
| Pitido con Web Audio | `ensureAudio`, `setBeep`, `updateIndicators` ([4.6](#46-sonido)) | E2E 12 (el grafo de audio y sus ganancias; el sonido audible no, ver [6.8](#68-lo-que-no-se-verifica-automáticamente)) |
| Monitor de depuración con pausa, paso y reinicio | `updateMonitor`, `togglePause`, `stepOnce`, `frameOnce`, `doReset` y `disassemble` ([4.11](#411-el-monitor)) | `tests/disasm.test.js`; E2E 5, 13, 14 y 22 |
| Demos originales | `roms/*.asm` → `tools/embed-roms.js` → `<script id="chip8-roms">`; estante y selector rápido ([5.4](#54-los-cinco-cartuchos)) | `tests/roms.test.js`; E2E 7, 8, 9 y 19 |
| Pruebas de cada instrucción | `tests/*.test.js` con `node:test` ([6](#6-pruebas)) | `node --test` |
| Verificación en un navegador de verdad | `tools/e2e.js` ([5.6](#56-toolse2ejs)) | 24 escenarios con entrada real |
| Manual, tutorial y documentación de desarrollo | `docs/MANUAL.md`, `docs/TUTORIAL.md` y este documento | `tests/manual.test.js` y `tests/tutorial.test.js` (ejemplos, fragmentos, textos citados y enlaces) |

### 1.3 Requisitos no funcionales

| Requisito | Cómo se cumple | Cómo se verifica |
|---|---|---|
| Un solo archivo, sin dependencias ni red | Todo va en línea; el ícono de la pestaña es un SVG en una URL `data:` | `tests/single-file.test.js` (sin `http(s)`, `@import` ni `src`/`href` externos; los cuatro bloques bien formados); E2E 1 (sin errores ni 404) y 23 (el servidor solo recibe `/chip8.html`) |
| Funciona abierto desde el disco | Sin `fetch`, sin módulos ES, sin workers ([2.6](#26-compatibilidad-con-file)) | E2E 1 carga la página por `file://` y por HTTP |
| Un programa roto no rompe el emulador | La máquina se detiene con un mensaje ([3.7](#37-errores)) | `tests/core-api.test.js` (unos 50 opcodes inválidos, pila); E2E 14 y 22 |
| Se puede manejar solo con el teclado y con lector de pantalla | ARIA, modelo de foco, activación sin puntero ([4.14](#414-accesibilidad)) | E2E 5, 20 y 21 |
| Pantallas chicas y táctiles | Diseño adaptable (760 y 480 px), keypad con punteros y varios dedos | E2E 4, 15 y 24 |
| Los ajustes se recuerdan | `localStorage` con validación ([4.13](#413-ajustes-guardados)) | E2E 10 (también con un `localStorage` que tira excepciones) y 18 |
| Respeta "reducir movimiento" | `@media (prefers-reduced-motion: reduce)` | E2E 16 |
| 60 frames por segundo estables | Acumulador de 60 Hz, sin asignar memoria por frame | E2E 2 (entre 59,7 y 60,3 frames por segundo en las corridas registradas) |

---

## 2. Arquitectura del archivo único

### 2.1 Los cuatro bloques

`chip8.html` tiene cuatro bloques con un `id` fijo, más el marcado:

```
chip8.html
├── <head>
│   ├── <link rel="icon" href="data:image/svg+xml,...">    ícono embebido: ningún pedido de red
│   └── <style id="chip8-style">    ~800 líneas   carcasa, CRT, keypad, panel, monitor, ayuda
└── <body>
    ├── <main class="desk" id="app">  ~260 líneas   consola, panel, estante, monitor, avisos, ayuda
    ├── <script id="chip8-core">     ~490 líneas   núcleo puro        → globalThis.Chip8Core
    ├── <script id="chip8-roms">      ~40 líneas   GENERADO           → globalThis.CHIP8_DEMOS
    └── <script id="chip8-ui">      ~1450 líneas   interfaz y bucle   → window.chip8
```

Quién usa a quién:

```
 roms/*.asm ──► tools/embed-roms.js ──(usa tools/chip8asm.js)──► <script id="chip8-roms">
                                                                         │ CHIP8_DEMOS
 <script id="chip8-core"> ── Chip8Core ──► <script id="chip8-ui"> ◄──────┘
          ▲                                          │
          │ tests/harness.js (node:vm)               ├──► el DOM, Canvas 2D, Web Audio, localStorage
     tests/*.test.js                                 └──► window.chip8 (depuración y tools/e2e.js)
```

- **`chip8-core`** es el emulador y nada más: no toca el DOM, la consola del navegador ni
  ningún global salvo `globalThis.Chip8Core`. Por eso corre igual en Node. Ver
  [3](#3-el-núcleo-chip8-core).
- **`chip8-roms`** lo escribe `tools/embed-roms.js`: una lista de objetos con el nombre,
  la descripción, los controles y los bytes en hexadecimal de cada cartucho. No se edita
  a mano. Ver [5.2](#52-el-incrustador-toolsembed-romsjs).
- **`chip8-ui`** es todo lo demás: pantalla, keypad, controles, monitor, sonido, ajustes y
  el bucle principal. Solo lee `Chip8Core` y `CHIP8_DEMOS`. Ver
  [4](#4-la-interfaz-chip8-ui).

El núcleo y la interfaz están escritos en JavaScript de estilo ES5 (`var`, funciones y
prototipos, dentro de una IIFE con `'use strict'`). Las herramientas y las pruebas usan
JavaScript moderno, porque corren en Node 22.

### 2.2 Por qué un solo archivo

Era un requisito, y tiene ventajas concretas: se reparte como un solo archivo, se abre
con doble clic sin servidor, no hay nada que instalar ni compilar y no puede romperse
porque falte un recurso. El costo es que el archivo es largo y que el código del núcleo
no se puede importar como un módulo común. Eso se resuelve con la extracción de bloques
de [2.5](#25-cómo-los-tests-sacan-los-bloques): las pruebas ejecutan el mismo texto que
ejecuta el navegador, sin copias.

### 2.3 Orden de carga

Los tres `<script>` son clásicos (sin `type="module"`, sin `defer`) y están al final del
`<body>`, después de todo el marcado. El navegador los ejecuta en orden y de forma
sincrónica:

1. `chip8-core` define `globalThis.Chip8Core`.
2. `chip8-roms` define `globalThis.CHIP8_DEMOS`.
3. `chip8-ui` ya encuentra el DOM armado y los dos globales. Arma el keypad, el monitor,
   el estante y los controles, aplica los ajustes guardados, carga el primer cartucho
   (Rebote), anuncia "Cartucho «Rebote» en marcha. Tocá H para ver la ayuda." y arranca
   el bucle con `requestAnimationFrame`.

La interfaz se defiende de un orden roto: si no hay `Chip8Core` o no hay `document` (por
ejemplo, si alguien evalúa el bloque en Node), termina sin hacer nada; si `CHIP8_DEMOS`
falta o no es una lista, usa una lista vacía y muestra la pantalla de reposo
"INSERTÁ UN CARTUCHO"; y descarta los cartuchos con hexadecimal inválido, vacío o de más
de 3584 bytes.

### 2.4 La regla del cierre de script

El analizador de HTML termina un bloque `<script>` en la primera aparición de `</script`
(sin importar mayúsculas), aunque esté dentro de un string o de un comentario de
JavaScript. Por eso **ningún bloque puede contener ese texto**. El archivo tiene
exactamente tres, uno por bloque. Para eso:

- `tools/embed-roms.js` escribe los textos de los cartuchos con `JSON.stringify` y
  reemplaza cada `<` por `\u003c`, así una descripción que contenga `</script>` (o `<!--`)
  queda inofensiva y se evalúa al mismo texto.
- Hoy ni el núcleo ni la interfaz lo necesitan. Si alguna vez hace falta ese texto en un
  string, hay que partirlo en dos (`'</' + 'script>'`) o escapar la barra (`'<\/script>'`).
- `tests/harness.js` y `tools/embed-roms.js` encuentran el final de cada bloque buscando
  el primer `</script>` después de la etiqueta de apertura: si la regla se rompe, el
  bloque extraído queda cortado y las pruebas fallan.

La otra regla, igual de importante: **las etiquetas de apertura tienen que quedar
exactamente así**, sin atributos de más: `<style id="chip8-style">`,
`<script id="chip8-core">`, `<script id="chip8-roms">` y `<script id="chip8-ui">`. Las
herramientas buscan esos textos literales.

Para revisar la sintaxis de los tres bloques sin abrir el navegador:

```sh
node -e "const h=require('./tests/harness');const vm=require('vm');for(const id of ['chip8-core','chip8-roms','chip8-ui']){new vm.Script(h.extractScript(id).code,{filename:id});}console.log('sintaxis ok')"
```

### 2.5 Cómo los tests sacan los bloques

`tests/harness.js` es el puente entre `chip8.html` y Node:

- `extractScript(id)` busca `<script id="{id}">`, toma el texto hasta el primer
  `</script>` y calcula en qué línea de `chip8.html` empieza.
- `loadCore()` evalúa `chip8-core` con `vm.Script(...).runInThisContext()`, pasando el
  nombre del archivo y ese desplazamiento de líneas: los errores y los stack traces
  apuntan a la línea real de `chip8.html`. Devuelve `globalThis.Chip8Core` y lo guarda
  para las llamadas siguientes.
- `loadDemos()` hace lo mismo con `chip8-roms` y devuelve `CHIP8_DEMOS`.
- `loadAssembler()` hace `require('tools/chip8asm.js')`.
- Además trae ayudas para escribir pruebas: `makeCpu(programa, opciones)` (acepta una
  lista de opcodes de 16 bits o un `Uint8Array`), `wordsToBytes`, `hexToBytes`,
  `runSteps`, `pixel(cpu, x, y)` y `renderAscii(cpu)`, que dibuja la pantalla con `#` y
  `.` para los mensajes de error.

`node --test` corre cada archivo `*.test.js` en su propio proceso, así que los globales que
define un bloque no se filtran de una suite a otra. `tests/harness.js` no es una prueba:
la carpeta se llama `tests/` (no `test/`) y el nombre no termina en `.test.js`, así que
`node --test` no lo ejecuta solo.

### 2.6 Compatibilidad con file://

Abierto desde el disco, el navegador trata la página con un origen restringido. Por eso
el archivo evita todo lo que ahí no anda: no hay `fetch` ni `XMLHttpRequest`, ni módulos
ES, ni workers, ni recursos externos. El ícono de la pestaña es un SVG en una URL `data:`
(sin él, Chrome pide `/favicon.ico` por HTTP y registra un 404 en la consola). Los
ajustes se guardan en `localStorage`, que también funciona en `file://`; y si el
navegador no lo deja usar, cada acceso está envuelto en `try/catch` y la consola sigue
andando sin guardar nada. El escenario E2E 1 abre la página por HTTP y por `file://` y
exige cero excepciones y cero errores de consola en los dos casos.

---

## 3. El núcleo (chip8-core)

### 3.1 API pública

El bloque define un único global, `globalThis.Chip8Core`, con 13 claves:

| Clave | Valor |
|---|---|
| `Chip8` | El constructor de la máquina. |
| `QUIRK_PRESETS` | `{ vip, schip, xochip }`, cada uno `{ label, quirks }`. Todo congelado con `Object.freeze`. |
| `DEFAULT_QUIRKS` | Copia congelada de los quirks del VIP (un objeto distinto de `QUIRK_PRESETS.vip.quirks`). |
| `FONT` | `Uint8Array` de 80 bytes: 16 glifos de 4×5. |
| `FONT_ADDR` | `0x050`. |
| `PROGRAM_START` | `0x200`. |
| `MEMORY_SIZE` | `4096`. |
| `MAX_ROM_SIZE` | `3584` (de `0x200` a `0xFFF`). |
| `DISPLAY_WIDTH`, `DISPLAY_HEIGHT` | `64` y `32`. |
| `STACK_SIZE` | `16`. |
| `disassemble(opcode, quirks?)` | Texto de una instrucción ([3.8](#38-el-desensamblador)). |
| `disassembleRange(memory, start, count, quirks?)` | Lista de `{ addr, opcode, text }`. |

`new Chip8({ quirks, random })` acepta dos opciones: `quirks`, un objeto parcial que se
mezcla sobre una copia de `DEFAULT_QUIRKS`, y `random`, una función que devuelve un
entero de 0 a 255 (por defecto `Math.floor(Math.random() * 256)`; las pruebas le pasan
generadores reproducibles). Métodos:

| Método | Qué hace |
|---|---|
| `reset()` | Borra la memoria, copia la fuente a `0x050` y la última ROM a `0x200`, pone `pc = 0x200` y limpia registros, pila, timers, pantalla, teclas, la espera de `FX0A` y el error. Conserva los quirks, `random` y la ROM. |
| `loadRom(bytes)` | Acepta un `Uint8Array`, una lista de números o un `ArrayBuffer`. Si mide más de 3584 bytes tira un `RangeError` con el mensaje "La ROM ocupa N bytes y el máximo es 3584 (de 0x200 a 0xFFF)."; si no, la copia (los números se truncan a 8 bits) y llama a `reset()`. |
| `setQuirks(parcial)` | Copia solo las seis claves conocidas, convertidas a booleanos. `null` o `undefined` no hacen nada. |
| `tickTimers()` | Baja DT y ST en uno, sin pasar de cero. |
| `setKey(tecla, apretada)` | Informa una tecla (se usa `tecla & 0xF`). Solo actúa si el estado cambia de verdad; resuelve `FX0A` ([3.4](#34-fx0a-apretar-y-soltar)). |
| `step()` | Ejecuta una instrucción. No toca los timers. Devuelve `true` si ejecutó algo y `false` si la máquina está detenida, esperando una tecla o si la instrucción era inválida. |
| `runFrame(ipf)` | Un frame de 60 Hz: hasta `ipf` instrucciones y un tic de los timers. Devuelve cuántas ejecutó ([3.5](#35-runframe-y-displaywait)). |

### 3.2 Estado de la máquina

Todo el estado es público, en propiedades comunes, para que el monitor y las pruebas lo
puedan leer (y, en las pruebas, escribir):

| Propiedad | Tipo | Qué es |
|---|---|---|
| `memory` | `Uint8Array(4096)` | La RAM. La fuente vive en `0x050`–`0x09F` y el programa desde `0x200`. |
| `V` | `Uint8Array(16)` | V0 a VF. Al ser un `Uint8Array`, todo valor se trunca a 8 bits sin código extra (por eso `7XNN` no necesita máscara). |
| `I` | número | El registro índice, **de 16 bits** ([3.6](#36-i-de-16-bits-y-accesos-de-12)). |
| `pc` | número | El contador de programa, siempre de 12 bits. |
| `stack`, `sp` | `Uint16Array(16)`, número | La pila de retorno y cuántas direcciones tiene (0 a 16). |
| `delayTimer`, `soundTimer` | número | DT y ST (0 a 255). |
| `display` | `Uint8Array(2048)` | 0 o 1 por píxel, por filas: el píxel (x, y) está en `y * 64 + x`. |
| `keys` | `Uint8Array(16)` | 1 si la tecla está apretada. |
| `quirks` | objeto | Las seis banderas de esta máquina (una copia propia, no congelada). |
| `random` | función | La fuente de números al azar de `CXNN`. |
| `waitingForKey` | booleano | `true` mientras `FX0A` espera. |
| `halted`, `error` | booleano, texto | La máquina se detuvo y por qué. |
| `displayDirty` | booleano | La pantalla cambió desde que la interfaz la leyó por última vez (la interfaz lo vuelve a `false`). |
| `rom` | `Uint8Array` | Copia de la última ROM cargada; `reset()` la vuelve a copiar. |

Hay tres campos internos: `_waitReg` (el registro X que recibe la tecla de `FX0A`),
`_waitKey` (la tecla elegida durante la espera, `-1` si todavía ninguna) y `_drew`
(`true` si la última instrucción ejecutada fue un `DXYN`).

### 3.3 Buscar, decodificar, ejecutar

`step()` sigue siempre el mismo camino:

```
si halted o waitingForKey → return false
pc = pc & 0xFFF
opcode = memory[pc] << 8 | memory[(pc + 1) & 0xFFF]      big-endian; en 0xFFF el 2.º byte sale de 0x000
pc = (pc + 2) & 0xFFF                                    antes de ejecutar: saltos y skips parten de acá
_drew = false
x = (opcode >> 8) & 0xF   y = (opcode >> 4) & 0xF   n = opcode & 0xF   nn = opcode & 0xFF   nnn = opcode & 0xFFF
switch (opcode >> 12)
   0x0  00E0 / 00EE / 0NNN (SYS: se ignora)
   0x1 … 0x7, 0x9 … 0xD   una instrucción por nibble (5XYN y 9XYN con N ≠ 0: inválida)
   0x8  switch (n): 0..7 y E           (las demás: inválida)
   0xE  nn = 9E o A1                   (las demás: inválida)
   0xF  switch (nn): 07 0A 15 18 1E 29 33 55 65   (las demás: inválida)
return true
```

Reglas que el código respeta en todas las instrucciones:

- **VF se escribe al final.** Las operaciones de `8XYN` leen `vx = V[x]` y `vy = V[y]`
  antes de escribir nada, calculan la bandera con esos valores y escriben VF después de
  VX. Así, con X = F el registro queda con la bandera, y con Y = F se usa el valor
  original. El quirk `vfReset` pone VF en 0 después de guardar el resultado de
  `OR`/`AND`/`XOR`.
- **Sin asignaciones de memoria** en el camino caliente: variables locales, un `switch` y
  nada más. El dibujo está aparte, en `_draw(vx, vy, n)`.
- **`_draw`** toma la coordenada inicial módulo 64 y 32 (la esquina siempre da la
  vuelta), lee cada fila de `memory[(I + fila) & 0xFFF]`, saltea las filas en 0, y para
  cada píxel que se sale por la derecha o por abajo lo recorta (`clipping` activado) o lo
  hace aparecer del otro lado. VF queda en 1 si algún píxel pasó de 1 a 0. Siempre marca
  `displayDirty`, incluso con N = 0 (que no dibuja nada y deja VF en 0).
- **`FX0A`** no detiene el `pc`: lo deja apuntando a la instrucción siguiente y activa
  `waitingForKey`. Mientras espera, `step()` devuelve `false`.

La lista de qué hace cada instrucción, con sus casos borde, está en la
[sección 10 del manual](MANUAL.md#10-referencia-completa-de-las-35-instrucciones).

### 3.4 FX0A: apretar y soltar

En el COSMAC VIP, `FX0A` esperaba que una tecla se apretara **y se soltara**. El núcleo lo
reproduce con una pequeña máquina de estados dentro de `setKey`:

```
 FX0A se ejecuta ──► waitingForKey = true, _waitReg = X, _waitKey = -1
       │              step() devuelve false, runFrame corta el frame, los timers siguen bajando
       ▼
 setKey(k, true) con k suelta → apretada y _waitKey < 0 ──► _waitKey = k
       │              otras teclas que se aprieten después no cuentan
       ▼
 setKey(k, false) con k === _waitKey ──► V[X] = k, waitingForKey = false, _waitKey = -1
                      el programa sigue en la instrucción siguiente al FX0A
```

Detalles que fijan las pruebas:

- Solo cuentan las **transiciones** posteriores al comienzo de la espera. Una tecla que ya
  estaba apretada cuando empezó `FX0A` no cuenta hasta que se suelte y se vuelva a
  apretar. Un aviso repetido de "apretada" para una tecla que ya lo estaba (la repetición
  automática del teclado) no cambia nada, porque `setKey` ignora las llamadas que no
  cambian el estado.
- Gana la **primera** tecla que se aprieta; soltar otra no resuelve la espera.
- `reset()` cancela la espera.
- La interfaz suma todas sus fuentes de teclas antes de llamar a `setKey`, así que el
  núcleo ve una sola transición por tecla ([4.5](#45-teclado-keypad-y-foco)).

Por qué este comportamiento y no el de "cualquier tecla apretada alcanza": ver
[8.4](#84-fx0a-espera-apretar-y-soltar) y la
[sección 7.4 del manual](MANUAL.md#74-esperar-una-tecla-fx0a).

### 3.5 runFrame y displayWait

```
runFrame(ipf):
   si halted → return 0                               (sin tic de timers)
   executed = 0
   repetir hasta ipf veces:
      si !step() → cortar                             (detenida, esperando tecla o error)
      executed++
      si waitingForKey → cortar                       (el FX0A cuenta como ejecutado)
      si _drew y quirks.displayWait → cortar          (el DXYN cierra el frame)
   tickTimers()                                       (una vez por frame, siempre)
   return executed
```

El quirk `displayWait` imita que el intérprete del VIP esperaba la interrupción de video
antes de dibujar. En lugar de contar ciclos, el núcleo lo implementa como "**como mucho un
`DXYN` por frame, y el `DXYN` es la última instrucción del frame**". La consecuencia se
ve en el E2E 2: Rebote, que dibuja dos veces por paso, ejecuta unas 580 instrucciones por
segundo tanto a IPF 15 como a IPF 1000, porque cada frame termina en su `DXYN`; un bucle
sin dibujo a IPF 1000 ejecuta unas 60 000. Por qué se eligió esta forma: ver
[8.6](#86-displaywait-como-el-dxyn-cierra-el-frame).

Dos consecuencias menores, documentadas y probadas: `runFrame(0)` solo hace el tic de los
timers; y el frame en el que la máquina se detiene todavía hace su tic (después, con la
máquina detenida, los timers quedan quietos).

### 3.6 I de 16 bits y accesos de 12

`I` se guarda con 16 bits (`& 0xFFFF`): `ANNN` lo carga con 12, pero `FX1E` y el avance de
`FX55`/`FX65` (quirk `memory`) pueden llevarlo por encima de `0xFFF`. **Cada acceso a
memoria a través de I**, en cambio, usa `(I + k) & 0xFFF`: el sprite de `DXYN`, los tres
bytes de `FX33` y los registros de `FX55`/`FX65` dan la vuelta al final de la memoria.
Ejemplos que fijan las pruebas: `FX55` con `I = 0xFFE`, X = 2 y el quirk `memory` escribe
en `0xFFE`, `0xFFF` y `0x000` y deja `I = 0x1001`; `FX1E` desde `0xFFF` sumando 1 deja `I = 0x1000`.
`FX1E` no toca VF. `FX29` pone `I = 0x050 + (VX & 0xF) * 5`. El `pc`, en cambio, siempre es
de 12 bits.

### 3.7 Errores

El núcleo nunca tira excepciones mientras ejecuta: un programa roto detiene la máquina.
`_fail(opcode, mensaje)` hace retroceder el `pc` a la instrucción culpable
(`(pc - 2) & 0xFFF`, correcto también en `0xFFE` y `0xFFF`), pone `halted = true` y arma
`error` con este formato:

```
Instrucción inválida o desconocida (opcode 0x5121 en la dirección 0x200).
Desbordamiento de pila (stack overflow): CALL con los 16 niveles de la pila ocupados (opcode 0x2206 en la dirección 0x206).
Subdesbordamiento de pila (stack underflow): RET sin dirección de retorno, la pila está vacía (opcode 0x00EE en la dirección 0x200).
```

(El opcode va con 4 dígitos y la dirección con 3, como en el desensamblador.)

| Opcode | Qué pasa |
|---|---|
| `5XYN` y `9XYN` con N ≠ 0 | Inválida. |
| `8XY8`–`8XYD` y `8XYF` | Inválida. |
| `EXNN` salvo `EX9E` y `EXA1` | Inválida. |
| `FXNN` salvo `07 0A 15 18 1E 29 33 55 65` | Inválida. Incluye `FX30`, `FX75` y `FX85` de SUPER-CHIP. |
| `0NNN` salvo `00E0` y `00EE` | `SYS`: se ignora, como hacen los intérpretes modernos. Incluye `00FF`, `00FE` y `00CN` de SUPER-CHIP. |
| `2NNN` con la pila llena (16) | Desbordamiento de pila. |
| `00EE` con la pila vacía | Subdesbordamiento de pila. |

Después de detenerse, `step()` devuelve `false` sin ejecutar nada (aunque se escriba una
instrucción válida en el `pc`) y `runFrame` devuelve 0, hasta que alguien llame a
`reset()` o a `loadRom()`. La única excepción del núcleo es el `RangeError` de `loadRom`
con una ROM demasiado grande. Un programa que se va del final de su código ejecuta `0000`
(se ignora), da la vuelta a la memoria y termina deteniéndose en la fuente, con
"opcode 0xF090 en la dirección 0x050"; el tutorial lo usa como ejemplo. Lo que hace la
interfaz con el error: [4.10](#410-transporte-estados-y-errores).

### 3.8 El desensamblador

`disassemble(opcode, quirks)` usa los mnemónicos de Cowgod, los mismos que acepta el
ensamblador:

| Familia | Texto |
|---|---|
| `00E0`, `00EE`, `0NNN` | `CLS`, `RET`, `SYS 0x0E1` |
| `1NNN`, `2NNN` | `JP 0x200`, `CALL 0x300` |
| `3XNN`, `4XNN`, `5XY0`, `9XY0` | `SE V1, 0x2A`, `SNE V1, 0x2A`, `SE V1, V2`, `SNE V1, V2` |
| `6XNN`, `7XNN` | `LD V1, 0x2A`, `ADD V1, 0x2A` |
| `8XY0`–`8XYE` | `LD`, `OR`, `AND`, `XOR`, `ADD`, `SUB`, `SHR`, `SUBN`, `SHL` con `V1, V2` |
| `ANNN`, `BNNN`, `CXNN` | `LD I, 0x300`, `JP V0, 0x2A0`, `RND V1, 0x0F` |
| `DXYN` | `DRW V0, V1, 5` (N en decimal) |
| `EX9E`, `EXA1` | `SKP V1`, `SKNP V1` |
| `FX07` … `FX65` | `LD V1, DT`, `LD V1, K`, `LD DT, V1`, `LD ST, V1`, `ADD I, V1`, `LD F, V1`, `LD B, V1`, `LD [I], V1`, `LD V1, [I]` |
| Cualquier palabra inválida | `DW 0x5121` |

Los números llevan `0x` y dígitos en mayúsculas: 2 dígitos para bytes y 3 para
direcciones. El opcode se enmascara a 16 bits. El argumento `quirks` es opcional: con
`quirks.jumping` activado, `BNNN` se muestra como `JP VX, 0xNNN` (con X = el primer dígito
de NNN), que es lo que de verdad hace el salto en ese modo; sin `quirks`, el texto es el
de siempre. El monitor le pasa `cpu.quirks` y vuelve a escribir las filas cuando el quirk
cambia. Con el quirk `shifting` el texto de `SHR`/`SHL` no cambia (sigue mostrando VY
aunque se ignore).

`disassembleRange(memory, start, count, quirks)` devuelve `count` palabras seguidas desde
`start`, con las direcciones dando la vuelta en `0xFFF` (una palabra puede quedar partida
entre `0xFFF` y `0x000`).

La propiedad más fuerte que tiene: **todo lo que produce se vuelve a ensamblar igual**.
`tests/asm.test.js` pasa las 65 536 palabras posibles por `disassemble` y por el
ensamblador y exige obtener la misma palabra; y las 4096 palabras `BNNN` también con
`{ jumping: true }`.

### 3.9 Rendimiento

Medido en esta máquina (Intel Core i5-10400, Node 22.11) con `tests/harness.js`:

| Carga | Tiempo |
|---|---|
| Instrucciones aritméticas, sin dibujo | unos 7 ms por millón de instrucciones |
| Una de cada cuatro es un `DRW` de 8 filas llenas | unos 38 ms por millón |
| `runFrame(1000)` sin dibujo | unos 8 µs por frame |

A la velocidad máxima de la consola (IPF 1000, 60 000 instrucciones por segundo) el núcleo
usa menos de medio milisegundo por segundo de emulación. En el navegador, el agente que
construyó la interfaz midió unos 0,03 ms por frame a IPF 1000 sin `displayWait`, y el E2E 2
mide entre 59,7 y 60,3 frames por segundo con cualquier IPF.

---

## 4. La interfaz (chip8-ui)

### 4.1 Organización del bloque

`chip8-ui` es una IIFE de unas 1450 líneas, dividida en secciones con un comentario
`// ---- nombre`. En orden: constantes, utilidades, ajustes guardados, demos incluidos,
referencias al DOM, pantalla, estado y mensajes, carga de ROMs, control de ejecución,
velocidad, quirks, teclado y keypad, sonido, indicadores, monitor, estante de cartuchos,
ayuda y arrastre, bucle principal, armado de la interfaz, API de depuración y arranque.

Las constantes que conviene conocer:

| Constante | Valor | Para qué |
|---|---|---|
| `FRAME_MS`, `FRAME_SLACK` | 16,67 ms y el 10 % de eso | Duración de un tic de 60 Hz y tolerancia al jitter de `requestAnimationFrame`. |
| `MAX_CATCHUP` | 4 | Tics de 60 Hz como máximo por cuadro de animación. |
| `DECAY`, `FADE_FLOOR` | 150 y 12 | Persistencia: un píxel apagado conserva 150/256 de su brillo por tic; por debajo de 12 se apaga del todo. |
| `IPF_MIN`, `IPF_MAX`, `IPF_DEFAULT`, `IPF_PRESETS` | 1, 10000, 15 y `[7, 15, 30, 100, 500, 1000, 5000, 10000]` | Velocidad. |
| `DISASM_BEFORE`, `DISASM_AFTER` | 7 y 12 | Filas del desensamblado antes y después del PC. |
| `BEEP_HZ`, `BEEP_LEVEL` | 440 y 0,22 | Frecuencia del pitido y ganancia máxima. |
| `TAP_MS` | 120 | Duración mínima de un toque del keypad sin puntero. |
| `STORAGE_KEY` | `'chip8-consola.ajustes'` | Clave de `localStorage`. |
| `KEY_BY_CODE`, `KEYPAD_LAYOUT`, `PC_HINT` | | Mapa del teclado, orden del keypad en pantalla y la letra que se imprime en cada tecla. |
| `QUIRK_INFO`, `PALETTES`, `SCREEN_MODES` | | Textos de los quirks, paletas y modos de pantalla. |

El estado de la interfaz está en dos objetos: `settings` (lo que se guarda, ver
[4.13](#413-ajustes-guardados)) y `state` (`romLoaded`, `romName`, `romSize`, `demoId`,
`paused`, `errorShown`, `instr` y `pausedBeforeHalt`). Hay una sola instancia de la
máquina, `cpu`, creada con los quirks guardados.

### 4.2 El bucle principal

```
loop(now), llamado por requestAnimationFrame en cada refresco del monitor (60, 120, 144 Hz…):
   dt = now - lastTime
   si dt < 0 o dt > 250 ms → dt = 16,67 ms           (la pestaña estuvo oculta: se descarta el atraso)
   si la máquina corre (hay ROM, no está en pausa ni detenida):
      acc += dt
      mientras acc ≥ 16,67 − 1,67 ms y ticks < MAX_CATCHUP (4):
         tick():  state.instr += cpu.runFrame(ipf)
                  syncDisplay(true)                  (pasa la pantalla al buffer de brillo)
                  si cpu.halted → handleHalt()
         acc −= 16,67 ms
      si acc ≥ 16,67 ms → acc = 0                    (no vale la pena ponerse al día)
   si no corre y la estela todavía se está apagando:
      fadeAcc a 60 Hz → syncDisplay(true), hasta que la imagen sea exactamente el framebuffer
   si needsRender → render()
   updateIndicators()                                (LEDs, etiquetas PAUSA / ESPERANDO TECLA, pitido)
   updateMonitor(false)                              (solo si está abierto, visible y en pantalla)
```

- Con un acumulador y pasos fijos, la emulación va a 60 frames por segundo en un monitor
  de 60 Hz, de 144 Hz o de 30 Hz. La simulación que hizo la revisión dio exactamente 60,00
  tics por segundo entre 30 y 240 Hz; el límite de 4 tics por cuadro solo frena la
  emulación por debajo de unos 15 cuadros por segundo.
- **Pestaña oculta.** Con la pestaña oculta el navegador no llama a
  `requestAnimationFrame`, así que la emulación se congela sola. Al volver no hay una
  ráfaga para ponerse al día: `visibilitychange` suelta todas las teclas, apaga el
  pitido y reinicia `lastTime` y `acc`, y además cualquier `dt` de más de 250 ms se
  descarta. El E2E 17 lo mide con una pestaña oculta y con una congelada: 0 frames
  mientras tanto, y después 15 frames en 0,25 s y 60 en 1 s.
- `setPaused` y la carga o el reinicio de una ROM ponen `acc` en 0, para que continuar no
  ejecute frames atrasados.

### 4.3 La pantalla: de cpu.display al lienzo

```
cpu.display  (0/1, 64×32)
   │  updateLevels(decay): encendido → 255; apagado → brillo·150/256 (por debajo de 12 → 0)
   ▼
levels  (Uint8Array(2048), brillo 0..255 por píxel)
   │  lut[brillo]: 256 colores RGBA precalculados entre el fondo y el color de la paleta (curva ^1,35)
   ▼
frame32 → ImageData 64×32 → frameCanvas (lienzo fuera de pantalla)
   │  drawImage estirado ×N con imageSmoothingEnabled = false
   ▼
#screen  (64·N × 32·N píxeles físicos)  +  patrón de scanlines (solo en modo Tubo CRT)
   │  putImageData del mismo cuadro de 64×32
   ▼
#glow  (64×32, estirado por CSS, con blur, mix-blend-mode: screen y opacidad 0,6)
```

- **Buffer de brillo.** `levels` guarda el brillo de cada píxel. Un píxel encendido
  siempre vale 255, así que la imagen nunca muestra menos de lo que hay en el framebuffer.
  Con persistencia, un píxel que se apaga baja a 149, 87, 50, 29, 16 y se apaga en el
  sexto tic (unos 100 ms): eso disimula el parpadeo típico de CHIP-8, que borra y redibuja
  con XOR. Sin persistencia, o en modo Píxeles puros, pasa directo a 0.
- **Cuándo se dibuja.** `syncDisplay` solo recalcula `levels` si el núcleo marcó
  `displayDirty` o si todavía hay píxeles apagándose (`fading`), y `render()` solo corre
  si algo cambió (`needsRender`). Paso (`stepOnce`) usa `syncDisplay(false)`: la imagen
  queda exacta, sin estela. En pausa, la estela que quedó se sigue apagando a 60 Hz hasta
  coincidir con el framebuffer.
- **La tabla de colores.** `buildLut(paleta)` interpola los 256 niveles entre `bg` y `on`
  con una curva de potencia 1,35 y los empaqueta como `Uint32` según el orden de bytes de
  la máquina (`LITTLE_ENDIAN`), así el paso por píxel es una sola asignación.
- **Escala entera.** `resizeScreen()` elige el mayor entero N tal que 64·N y 32·N entren
  en el 94 % del ancho y el 90 % del alto del tubo, contados en píxeles **físicos**
  (`rect.width * devicePixelRatio`). El lienzo mide exactamente 64·N × 32·N píxeles
  físicos y su tamaño CSS es eso dividido por `devicePixelRatio`, así cada píxel CHIP-8
  ocupa N×N píxeles de la pantalla sin interpolar, aun con escalas fraccionarias como
  1,25. Se recalcula con un `ResizeObserver` sobre el tubo y con `resize`. El E2E 15 lo
  mide: con escala 1,25 el lienzo es de 768×384 (12 píxeles físicos por píxel), con 2 es de
  1216×608 (19). El costo: a 360 px de ancho y escala 1 la imagen ocupa unos 192 px de los
  280 del tubo.
- **Scanlines.** `buildScanPattern(N)` arma un patrón de 1×N con una franja oscura de
  `round(N · 0,3)` píxeles abajo y un brillo de 1 píxel arriba, alineado con las filas
  CHIP-8; solo si N ≥ 3. Con la paleta LCD el patrón es una grilla de píxeles en lugar
  de líneas.
- **Resplandor.** `#glow` es un lienzo de 64×32 que recibe el mismo `ImageData` y lo
  estira el CSS con `filter: blur(...)` (el radio depende de la escala) y
  `mix-blend-mode: screen`. Se apaga con la paleta LCD y en modo Píxeles puros.
- **Paletas.** `PALETTES` define cuatro: Verde fósforo (`fosforo`, la de fábrica), Ámbar,
  Blanco y LCD, cada una con `bg` y `on` en RGB.
- **Pantalla de reposo.** Sin cartucho, `levels` se llena con `idleBitmap`, que dice
  "INSERTÁ UN CARTUCHO" con una fuente propia de 3×5 dentro de un marco punteado.

### 4.4 Modos de pantalla: Tubo CRT y Píxeles puros

`applyScreenMode(modo)` cambia entre los dos valores de `SCREEN_MODES`:

| | Tubo CRT (`'crt'`, de fábrica) | Píxeles puros (`'puro'`) |
|---|---|---|
| Colores en pantalla | Los 256 niveles de la tabla | Exactamente dos: el fondo y el color |
| Persistencia (estela) | Si el interruptor Persistencia está prendido | Nunca |
| Scanlines | Si el interruptor Scanlines está prendido | Nunca |
| Resplandor, viñeta y reflejo | Sí | No: `.crt[data-mode="puro"]` los oculta con CSS |
| Interruptores Scanlines y Persistencia | Habilitados | Deshabilitados, pero conservan su preferencia (`aria-pressed`) |

El selector es un `role="radiogroup"` (`#screen-mode`) con dos botones `role="radio"`,
`aria-checked` y `tabindex` itinerante: el que está marcado recibe el foco con Tab y las
flechas cambian de modo. Al pasar a Píxeles puros se llama a `updateLevels(false)` para
borrar la estela que hubiera. El modo se guarda en `settings.screenMode` y se lee y cambia
desde `window.chip8.getScreenMode()` y `setScreenMode(modo)`. El E2E 18 lee el lienzo
píxel por píxel: en modo puro hay exactamente dos colores, cero píxeles distintos de lo
que pide `cpu.display` y ninguna estela, con las cuatro paletas.

### 4.5 Teclado, keypad y foco

**El mapa.** `KEY_BY_CODE` usa `KeyboardEvent.code`, la posición física de la tecla, así
que el bloque 1-4 / Q-R / A-F / Z-V es el mismo en QWERTY, AZERTY o Dvorak:

```
   Tu teclado            Keypad del COSMAC VIP
   1  2  3  4             1  2  3  C
   Q  W  E  R     ──►     4  5  6  D
   A  S  D  F             7  8  9  E
   Z  X  C  V             A  0  B  F
```

**Atajos.** Espacio (pausa o continúa), N (un paso; se repite si se mantiene), Retroceso
(reiniciar), H (abrir o cerrar la ayuda) y Esc (cerrar diálogos y la capa de arrastre).
Ninguno choca con las 16 teclas.

**Todas las fuentes de teclas se suman.** El keypad se puede tocar con el teclado físico,
con el mouse o los dedos, con Enter o Espacio sobre una tecla enfocada, con un clic sin
puntero (lector de pantalla, control por voz) y desde `window.chip8.pressKey`. Cada fuente
lleva su propia cuenta (`heldCodes`, `pointerKeys`, `enterHeld`, `apiHeld` y las sueltas
programadas de `timedReleases`) y todas pasan por `keyDown(k)`/`keyUp(k)`, que mantienen un
contador por tecla (`holdCount`). El núcleo recibe `setKey` solo cuando el contador pasa de
0 a 1 o de 1 a 0: soltar el mouse no suelta una tecla que el teclado sigue apretando.

```
teclado físico (onKeyDown / onKeyUp) ────────┐
keypad con puntero (captura, varios dedos) ──┤
keypad: Enter o Espacio sobre la tecla ──────┼──► holdCount[k] ──► cpu.setKey(k, …) solo en 0 ↔ 1
keypad: clic sin puntero (toque de 120 ms) ──┤
window.chip8.pressKey / releaseKey ──────────┘
```

- `releaseAllKeys()` suelta todo (y cancela las sueltas programadas) cuando la ventana
  pierde el foco, cuando cambia la visibilidad y al abrir la ayuda.
- `reset()` del núcleo limpia las teclas; `resyncKeys()` vuelve a informar las que siguen
  apretadas después de un reinicio o de cargar una ROM.

**`onKeyDown`**, registrado en `window`:

1. Habilita el audio (es un gesto del usuario).
2. Si hay Ctrl, Meta o Alt, no hace nada: los atajos del navegador siguen andando.
3. Si el foco está en un campo de texto (`isTypingTarget`: `textarea`, `contenteditable`
   o un `input` que no sea `range`, `checkbox`, `radio`, `button` ni `file`), no hace
   nada. Así se puede escribir en el campo de IPF.
4. Con la ayuda abierta, solo H (la cierra); Esc lo maneja el `<dialog>`.
5. Las 16 teclas mapeadas van al emulador con `preventDefault`, **aunque haya un control
   enfocado**, incluido un `<select>`: el `preventDefault` evita que la letra cambie la
   opción del selector. La repetición automática se filtra con `heldCodes`.
6. Espacio: si el foco está en un control (`isControl`: botón, `select`, `summary`,
   enlace, checkbox o radio, o un `role` de control), se deja la activación nativa; si no,
   pausa o continúa.
7. N, Retroceso, H y Esc hacen su atajo desde cualquier control que no sea de texto.

**El modelo de foco.** Un clic con el mouse o el dedo en un botón, un chip, un interruptor,
un radio o un enlace le saca el foco (`onPointerClick`, en `document`, cuando
`event.detail > 0`). Así, para quien usa el mouse, Espacio siempre pausa y las letras
siempre son el keypad. Si el foco llegó con Tab, se queda, y Espacio o Enter activan el
control como en cualquier página. Los `<select>` (Paleta y Perfil) sueltan el foco apenas
cambian con el mouse (`returnFocusAfterChange`); si el cambio vino de una tecla sobre el
selector (flechas, Inicio, Fin), el foco se queda para poder seguir navegando. Si la ayuda
se abrió con el mouse, al cerrarla el foco no vuelve al botón "?". Los detalles y el
porqué: [8.12](#812-el-modelo-de-foco).

**El keypad en pantalla** (`buildKeypad`) arma 16 botones en el orden del VIP:

- Con puntero: `pointerdown` (solo el botón principal del mouse) aprieta la tecla y toma
  la captura del puntero; `pointerup`, `pointercancel` y `lostpointercapture` la sueltan.
  Cada `pointerId` se sigue por separado, así funcionan varios dedos a la vez. El CSS pone
  `touch-action: none` y el menú contextual está anulado.
- Con el teclado: Enter o Espacio sobre la tecla enfocada la mantienen apretada mientras
  dura la pulsación, y como mínimo `TAP_MS` (120 ms), para que un toque breve llegue al
  programa y `FX0A` vea el apretar y el soltar. El evento no sigue hasta `window`, así que
  ahí Espacio no pausa.
- Un `click` con `detail === 0` (lector de pantalla, `element.click()`) es un toque de
  120 ms.

### 4.6 Sonido

```
OscillatorNode (square, 440 Hz, arranca una vez y no se detiene)
   → GainNode "gain"   (0 o 1: el pitido encendido o apagado, rampa setTargetAtTime de 4 ms)
   → GainNode "master" (volumen × 0,22, rampa de 10 ms)
   → destination
```

- **Contexto perezoso.** Los navegadores no dejan sonar nada antes de un gesto del
  usuario, así que `ensureAudio()` crea el `AudioContext` en el primer `pointerdown`,
  `pointerup`, `touchend`, `click` (escuchados en fase de captura) o tecla, y lo reanuda si
  está suspendido en los gestos siguientes. En pantallas táctiles `pointerdown` no cuenta
  como activación, por eso se escuchan también `pointerup` y `touchend`.
- **Cuándo suena.** `updateIndicators()` prende el pitido si la máquina corre, `ST > 0`, la
  pestaña está visible y no está en silencio. Las rampas de `setTargetAtTime` evitan los
  chasquidos de cortar una onda de golpe. En pausa, detenida u oculta, no suena.
- El LED SONIDO se prende cuando corresponde pitar **aunque esté en silencio**, como aviso
  visual.
- El aviso del pie del tubo dice "Sonido: tocá la consola para activarlo" (titilando)
  hasta que el contexto corre, "Sonido: silenciado" o "Sonido: este navegador no tiene
  Web Audio".
- `window.chip8.audioState()` devuelve `{ supported, state, enabled, muted, volume,
  beeping, soundTimer }`; el E2E 12 lo usa junto con un gancho en `createGain` para leer
  las ganancias.

### 4.7 Carga de ROMs

- **Botón "Cargar ROM".** Vacía el `input type="file"` escondido (así elegir dos veces el
  mismo archivo funciona) y lo abre. No tiene filtro `accept`: una ROM puede tener
  cualquier extensión.
- **Arrastrar y soltar**, sobre cualquier parte de la página. `dragenter`/`dragleave`
  llevan una cuenta de profundidad y solo reaccionan si lo que se arrastra son archivos
  (`dataTransfer.types` incluye `Files`); se muestra la capa "Soltá el cartucho acá".
- `loadFile(file)` rechaza un archivo vacío o de más de 3584 bytes **antes** de leerlo,
  con un aviso; si no, lo lee con `FileReader.readAsArrayBuffer`.
- `loadRomBytes(bytes, nombre, demoId, silencioso)` acepta `Uint8Array`, `ArrayBuffer` o
  una lista de números; vuelve a controlar el tamaño, llama a `cpu.loadRom`, informa las
  teclas que siguen apretadas, limpia el error, deja la máquina corriendo y actualiza la
  ranura, el estante, el transporte y el monitor. Si la ROM se rechaza, la anterior sigue
  corriendo.
- Los avisos (`toast`) aparecen arriba al centro, como mucho tres a la vez, y se van solos
  a los 4,5 s (8 s si son de error). El contenedor `#toasts` es una región `aria-live`.

### 4.8 Cartuchos incluidos y selector rápido

`CHIP8_DEMOS` se normaliza al arrancar en `demos`, una lista de
`{ id, name, description, controls, hex, bytes }`. `buildShelf()` crea, por cada cartucho,
dos botones que llaman a `loadDemo(id)`:

- una tarjeta `.cart` en el estante "Cartuchos incluidos", debajo de la consola, con el
  nombre, la descripción, los controles y la marca "En la ranura";
- un chip `.chip` en la fila "Incluidos:" (`#cart-chips`), justo debajo de la ranura, para
  cambiar de cartucho sin scrollear. Al lado hay un enlace "Detalles ↓" a `#shelf-title`.

`updateShelfSelection()` pone `aria-pressed="true"` en la tarjeta y el chip del cartucho
cargado. `updateSlot()` muestra en la ranura el nombre, el tamaño ("177 bytes · demo
incluido"), un color por cartucho y, en `#cart-controls`, "Controles: ..." con los
controles del demo; para una ROM externa esa línea se oculta. Al arrancar se carga el
primer cartucho según `@order` (Rebote). Si no hay cartuchos, el estante muestra un
mensaje, el selector queda oculto y la pantalla muestra "INSERTÁ UN CARTUCHO".

### 4.9 Quirks y velocidad

**Quirks.** Seis botones `role="switch"` con `aria-checked`, armados desde `QUIRK_INFO`
(etiqueta corta, nombre, opcodes y descripción). Cada uno tiene `aria-describedby`
apuntando a un texto oculto con su descripción; la línea `#quirk-hint` muestra la misma
explicación al pasar el mouse o el foco. Un clic llama a `applyQuirks`, que actualiza
`cpu.quirks`, los interruptores y el selector de perfil, y guarda. El cambio se aplica en
vivo, en la instrucción siguiente.

El selector **Perfil** tiene COSMAC VIP, SUPER-CHIP, XO-CHIP y Personalizado.
`detectPreset()` compara los seis quirks con cada perfil: si coinciden con uno, el
selector lo muestra; si no, muestra "Personalizado". Elegir "Personalizado" no cambia
nada. Los perfiles:

| Quirk | COSMAC VIP | SUPER-CHIP | XO-CHIP |
|---|---|---|---|
| `vfReset` (VF=0) | sí | no | no |
| `memory` (MEM) | sí | no | sí |
| `shifting` (SHIFT) | no | sí | no |
| `jumping` (BXNN) | no | sí | no |
| `clipping` (CLIP) | sí | sí | no |
| `displayWait` (VBLANK) | sí | no | no |

Qué hace cada quirk y de dónde sale: [sección 11 del manual](MANUAL.md#11-quirks).

**Velocidad.** `setIpf(n, origen)` ajusta la velocidad entre 1 e `IPF_MAX` (10.000) y
sincroniza tres controles: el deslizador (`#ipf-range`, de 0 a 1000 en escala
logarítmica: IPF = IPF_MAX^(posición/1000), redondeado), el campo numérico
(`#ipf-input`) y los botones 7, 15, 30, 100, 500, 1000, 5000 y 10000. La línea
`#ipf-rate` dice "≈ N instrucciones por segundo · timers a 60 Hz". El deslizador lleva
`aria-valuetext` ("15 instrucciones por frame"). Mientras se escribe un valor fuera de
rango, el campo queda con `aria-invalid="true"` y la línea dice "Fuera de rango (1 a
10.000): se usa N"; se corrige al confirmar. El tope se subió de 1000 a 10.000 a pedido
del usuario, para ROMs de la Octojam que piden miles de IPF; el costo lo mide el
escenario 2 del E2E (ver [6.7](#67-los-escenarios-e2e)).

### 4.10 Transporte, estados y errores

Los botones Pausa/Continuar, Paso, Frame y Reiniciar llaman a `togglePause`, `stepOnce`,
`frameOnce` y `doReset`:

- **Paso** pausa la máquina y ejecuta una sola instrucción con `cpu.step()`: los timers
  no bajan. **Frame** pausa y ejecuta un `runFrame` completo con su tic.
- `updateTransport()` deshabilita Pausa, Paso y Frame sin ROM o con la máquina detenida, y
  Reiniciar sin ROM. El botón de pausa dice "Continuar" (con el ícono de play) en pausa.
- `computeMode()` resume el estado en uno de cinco modos, que manejan el LED RUN, la
  insignia del monitor, la etiqueta PAUSA y el atributo `data-mode` de la consola:

| Modo | Insignia | LED RUN |
|---|---|---|
| `idle` | Sin cartucho | apagado |
| `run` | Ejecutando | verde |
| `wait` | Esperando tecla (además, la etiqueta ESPERANDO TECLA en el tubo) | verde titilando |
| `paused` | Pausado | ámbar |
| `error` | Error | rojo |

**Cuando la máquina se detiene** por un error, `handleHalt()`:

1. guarda en `state.pausedBeforeHalt` si el usuario tenía la máquina en pausa (o iba de a
   un paso) y la pausa;
2. muestra el mensaje en el tubo ("ERROR", el texto del núcleo y "Presioná Reiniciar
   (Retroceso) para volver a empezar.") y en la línea de error del monitor;
3. lo anuncia **una sola vez** en la línea de estado (`#status`, `role="status"`):
   "Error: ...". No hay aviso flotante ni `role="alert"`: el mismo texto se leía tres
   veces con un lector de pantalla y el aviso tapaba el monitor.

Paso o Frame no pisan ese mensaje en `#status`. **Reiniciar** después de un error vuelve
al estado de pausa que había justo antes: si ibas de a un paso, queda en pausa en `0x200`
y Paso sigue andando; si corría, arranca de nuevo. Ver
[8.13](#813-reiniciar-después-de-un-error-respeta-la-pausa).

### 4.11 El monitor

El panel MONITOR muestra, de arriba abajo: la insignia de estado; PC, I, SP, DT, ST, IPF e
INSTRUCCIONES (DT, ST, SP, IPF y el contador en decimal, el resto en hexadecimal); V0–VF,
resaltando los que cambiaron; el desensamblado (20 filas: 7 antes del PC, el PC marcado con
▶ y `aria-current`, y 12 después, con la misma paridad que el PC); la pila de 16 niveles con
el tope marcado; 32 bytes de memoria alrededor de I (desde `((I & 0xFF8) - 8) & 0xFFF`, con
el byte de I resaltado); y la línea de error.

Está pensado para no costar nada cuando no se mira:

- `updateMonitor(forzar)` no hace nada si el panel está oculto (botón Ocultar/Mostrar,
  que se guarda) o si la pestaña está oculta. Tampoco si el panel quedó fuera de la vista
  (lo sigue un `IntersectionObserver`), salvo que se lo fuerce: al cargar una ROM,
  reiniciar, detenerse por un error, volver a mostrar el panel o cuando el panel vuelve a
  entrar en la vista. En el resto de los casos se actualiza una vez por cuadro de
  animación, desde el bucle.
- Cada elemento guarda su último valor (`el.__v`, `li.__a`, `li.__o`...) y solo se escribe
  en el DOM lo que cambió; el desensamblado solo se recalcula cuando cambia el opcode de
  una fila o el quirk `jumping`.
- El resaltado de V0–VF solo se recalcula si se ejecutaron instrucciones desde la
  actualización anterior, así sobrevive mientras la máquina está en pausa entre pasos.

### 4.12 La ayuda

Un `<dialog>` modal ("Manual rápido") con el mapa del teclado, los atajos, el modelo de
foco, los cartuchos, la velocidad, la lista de quirks (armada desde `QUIRK_INFO` por
`buildHelpQuirks`, con una línea fija que resume los perfiles), el monitor y consejos. Se
abre con H o con "?" y se cierra con H, Esc, la ×, o un clic en el fondo. Al abrirla se
sueltan todas las teclas.

### 4.13 Ajustes guardados

`settings` se guarda entero en `localStorage['chip8-consola.ajustes']` como JSON cada vez
que cambia algo. Al arrancar, `loadSettings()` valida cada campo por separado y descarta
lo que no tenga el tipo esperado:

| Campo | De fábrica | Validación |
|---|---|---|
| `ipf` | 15 | número, redondeado y limitado a 1–10.000 |
| `quirks` | los del VIP | objeto; cada una de las seis claves, solo si es booleana |
| `palette` | `'fosforo'` | una clave de `PALETTES` |
| `screenMode` | `'crt'` | `'crt'` o `'puro'` |
| `scanlines`, `persistence` | `true` | booleano |
| `muted` | `false` | booleano |
| `volume` | 0,6 | número finito, limitado a 0–1 |
| `monitorOpen` | `true` | booleano |

Cada lectura y escritura está dentro de un `try/catch`: con el almacenamiento bloqueado o
roto, la consola arranca con los valores de fábrica y funciona igual (lo prueba el E2E 10
inyectando un `localStorage` que tira excepciones). Un efecto que conviene tener presente
al depurar: el perfil de quirks se recuerda entre sesiones, así que "por defecto VIP" vale
solo para un navegador que nunca abrió la consola.

### 4.14 Accesibilidad

- Todo se puede manejar con el teclado; el foco visible es un contorno de 3 px
  (`:focus-visible`).
- La pantalla es un `canvas` con `role="img"` y una etiqueta. El keypad es un grupo con una
  etiqueta por tecla ("Tecla A (en tu teclado: Z)"). Los quirks son `role="switch"` con su
  descripción en `aria-describedby`. Los interruptores de pantalla y sonido usan
  `aria-pressed`. El modo de pantalla es un `radiogroup`. El monitor usa `aria-expanded` en
  su botón y `aria-current` en la fila del PC.
- La línea de estado (`role="status"`, `aria-live="polite"`) anuncia lo importante: el
  cartucho cargado, pausa, paso, reinicio, la velocidad elegida con los botones, el perfil,
  el modo de pantalla, el silencio y los errores, una sola vez. El monitor no se anuncia:
  cambia en cada frame.
- El keypad acepta Enter, Espacio y la activación sin puntero de los lectores de
  pantalla ([4.5](#45-teclado-keypad-y-foco)).
- Contraste: las letras de ayuda del keypad y las filas vacías de la pila se oscurecieron o
  aclararon en la revisión (alrededor de 4,9:1 o más).
- `prefers-reduced-motion: reduce` apaga las animaciones y transiciones.
- En pantallas de 760 px o menos el keypad queda justo debajo del tubo; en 480 px o menos
  se oculta la bajada del logo y se achican los márgenes. A 360×640, el tubo y el keypad
  entero entran en la primera vista (E2E 24).

### 4.15 La API de depuración window.chip8

La interfaz expone `window.chip8` para depurar desde la consola del navegador y para
`tools/e2e.js`:

| Miembro | Qué hace |
|---|---|
| `cpu` | La instancia de `Chip8` (se puede leer y escribir todo su estado). |
| `demos` | La lista normalizada de cartuchos. |
| `loadDemo(id)`, `loadRomBytes(bytes, nombre)` | Cargan un cartucho o bytes; devuelven `true` o `false`. |
| `pause()`, `resume()`, `isPaused()` | Pausa. `resume()` no hace nada con la máquina detenida; `isPaused()` es `true` también después de un error. |
| `step()`, `frame()`, `reset()` | Como los botones: `step()` devuelve lo que devolvió `cpu.step()`, `frame()` la cantidad de instrucciones y `reset()` un booleano. |
| `setIpf(n)`, `getIpf()` | Velocidad (se limita a 1–10.000 y devuelve el valor aplicado). |
| `setPreset('vip' \| 'schip' \| 'xochip')` | Perfil de quirks. |
| `setScreenMode('crt' \| 'puro')`, `getScreenMode()` | Modo de pantalla. |
| `pressKey(k)`, `releaseKey(k)` | Teclas, como una fuente más ([4.5](#45-teclado-keypad-y-foco)). |
| `audioState()` | El estado del audio ([4.6](#46-sonido)). |

Un truco: en la vista previa del navegador integrado, `requestAnimationFrame` se frena
cuando el panel está oculto; para automatizar algo ahí, mové el tiempo con `frame()` o
`step()` en lugar de esperar.

---

## 5. Programas de demostración y herramientas

### 5.1 El ensamblador (tools/chip8asm.js)

Un ensamblador de dos pasadas, sin dependencias, que usa los mismos mnemónicos que el
desensamblador. La sintaxis completa está documentada en el comentario del principio del
archivo y en la [parte 4.4 del tutorial](TUTORIAL.md#44-la-sintaxis-completa); en resumen:

| Elemento | Forma |
|---|---|
| Comentario | `;` hasta el fin de la línea |
| Etiqueta | `nombre:` (letras, dígitos, `_` y `.`, sin empezar con dígito), sola o antes de una instrucción |
| Constante | `NOMBRE EQU expresión` |
| Datos | `DB` (bytes de 0 a 255, o de -128 a -1) y `DW` (palabras de 16 bits, big-endian) |
| Números | `42`, `0x2A`, `$2A`, `0b00101010`, `%00101010` |
| Expresiones | números, etiquetas y constantes con `+` y `-` |
| Mayúsculas | indistintas en instrucciones, registros y directivas; las etiquetas sí las distinguen |
| Nombres reservados | `V0`–`VF`, `I`, `DT`, `ST`, `K`, `F`, `B`, las instrucciones y las directivas |

Algunos detalles de diseño: las referencias hacia adelante funcionan (primera pasada:
direcciones; segunda: bytes); una constante `EQU` puede usar etiquetas y constantes
definidas más adelante, se detectan las definiciones circulares y se evalúan todas aunque
no se usen, para informar sus errores; hay formas cortas `SHR Vx` y `SHL Vx`; `JP V0, dir` acepta
cualquier dirección y `JP VX, dir` con X ≠ 0 (la lectura `BXNN` de SUPER-CHIP) solo si X es
el primer dígito de la dirección; los registros y nombres especiales no admiten espacios
adentro (`V 1` es un error) salvo `[ I ]`.

**API** (`require('./tools/chip8asm.js')`, o `globalThis.Chip8Asm` si se carga con un
`<script>` en un navegador):

```js
const { assemble, formatListing } = require('./tools/chip8asm.js');
const { bytes, labels, listing } = assemble(fuente, { origin: 0x200 });
// bytes: Uint8Array; labels: { nombre: dirección }
// listing: una entrada por línea de la fuente: { line, addr, bytes, text }
console.log(formatListing(listing));
```

Cualquier error es un `Error` cuyo mensaje empieza con `Línea N: ` (con `err.line`): por
ejemplo `Línea 5: "bucle" ya estaba definido en la línea 3`.

**Línea de comandos:**

```sh
node tools/chip8asm.js entrada.asm [salida.ch8] [--listing]
node tools/chip8asm.js --help
```

Sin salida, usa el mismo nombre con `.ch8`. Ante un problema (error en la fuente, archivo
que no se puede leer o escribir, opción desconocida, argumentos de más o de menos)
imprime una línea en castellano y el uso, y sale con código 1, sin stack trace y sin
escribir nada; `--help` y `-h` salen con 0. Los errores del sistema de archivos se
explican: «la carpeta "x" no existe», «no hay permiso», «otro programa lo tiene
abierto».

### 5.2 El incrustador (tools/embed-roms.js)

```sh
node tools/embed-roms.js                   # ensambla, escribe los .ch8 y actualiza chip8.html
node tools/embed-roms.js --check           # no escribe nada: sale con 1 si algo está desactualizado
node tools/embed-roms.js --html otro.html  # actualiza otro HTML
```

- Ensambla cada `roms/*.asm` (el `id` es el nombre del archivo: minúsculas, dígitos, `_`
  y `-`), escribe `roms/<id>.ch8` si cambió y reemplaza **solo** el contenido de
  `<script id="chip8-roms">`. El resto del archivo queda idéntico byte por byte, se
  respeta el fin de línea (CRLF o LF) y correrlo dos veces seguidas no cambia nada.
- Cada `.asm` empieza con un bloque de comentarios con cuatro etiquetas obligatorias:

  ```asm
  ; @name Rebote
  ; @description Una pelotita sonriente rebota por la pantalla y suena cada vez que toca un borde.
  ; @controls Ninguno: solo mirá.
  ; @order 1
  ```

  Los cartuchos se ordenan por `@order` (y después por `id`); el primero es el que carga
  la consola al arrancar.
- El bloque generado tiene este formato (los textos van con `JSON.stringify` y `<` como
  `\u003c`, ver [2.4](#24-la-regla-del-cierre-de-script)):

  ```js
  /* GENERADO por tools/embed-roms.js a partir de roms/*.asm — no editar a mano. */
  globalThis.CHIP8_DEMOS = [
    {
      id: "rebote",
      name: "Rebote",
      description: "Una pelotita sonriente rebota por la pantalla y suena cada vez que toca un borde.",
      controls: "Ninguno: solo mirá.",
      hex: "00E022546AFE6B03..."
    },
    ...
  ];
  ```

- `--check` lista en castellano qué está desactualizado (un `.ch8` que no coincide con su
  `.asm`, o el bloque del HTML) y sale con 1; `tests/roms.test.js` lo corre. Falla limpio,
  con un mensaje, si falta una etiqueta, si `@order` no es un número, si falta el bloque o
  si un programa no ensambla (con el número de línea).

### 5.3 Reglas para escribir un demo

Los cinco cartuchos siguen estas reglas, y las pruebas las hacen cumplir:

1. **Que ande con cualquier perfil de quirks.** No leer VF después de `OR`/`AND`/`XOR`;
   usar `SHR`/`SHL` con X = Y; volver a cargar I antes de cada `LD [I], Vx` o
   `LD Vx, [I]`; no usar `JP V0`; no depender de que un sprite se recorte o dé la vuelta
   (quedarse adentro de la pantalla). `tests/roms.test.js` corre cada demo 600 frames con
   los tres perfiles, y Fuente y Autotest tienen que dibujar exactamente lo mismo con los
   tres.
2. **El presupuesto de `displayWait`.** Con el perfil VIP cada `DRW` cierra el frame. Un
   paso con k dibujos dura por lo menos k frames, y las instrucciones entre un dibujo y el
   siguiente tienen que entrar en el IPF. Rebote, por ejemplo, reparte el trabajo de cada
   paso entre sus dos `DRW` para que entre en 15 instrucciones por frame (alcanza con 14 en
   el VIP y 10 en los otros perfiles).
3. **Un ritmo que no dependa del IPF.** Marcar el paso con DT (`LD DT, TICK` y esperar a que
   llegue a 0), no con bucles de espera: así la velocidad es la misma a 15 que a 1000 IPF.
   Las pruebas miden las velocidades que dicen los comentarios de cada `.asm`. Con IPF 7,
   el ajuste más lento de la consola, un paso puede no entrar en su tiempo y el demo va más
   despacio; los encabezados lo dicen con números.
4. **No ejecutar nunca datos.** Terminar en bucles (`fin: JP fin`) y poner los datos
   después del código. Las pruebas envuelven `step()` y fallan si el `pc` pasa por una
   dirección que el listado del ensamblador no marca como instrucción.
5. **La pila acotada** (las pruebas exigen `sp ≤ 2` después de 600 frames), sin detenerse
   nunca y con algo en pantalla.
6. **Si usa `FX0A`**, tener en cuenta que una tecla que ya estaba apretada no cuenta
   ([3.4](#34-fx0a-apretar-y-soltar)).
7. Comentarios en castellano que expliquen qué enseña el programa, cómo está la pantalla,
   qué hace cada registro y a qué velocidad va.

La [parte 5.7 del tutorial](TUTORIAL.md#57-código-que-anda-en-cualquier-intérprete) explica
estas mismas reglas para quien escribe sus propios programas.

### 5.4 Los cinco cartuchos

| `@order` | Cartucho | Bytes | Qué enseña | Notas |
|---|---|---|---|---|
| 1 | **Rebote** (`rebote`) | 177 | `DRW` con XOR para borrar, ritmo con DT, pitido con ST | 30 pasos por segundo desde IPF 15 (unos 19 en el VIP y 22 en los otros perfiles con IPF 7). Dibuja la pelota nueva antes de borrar la vieja: el cuadro intermedio es el XOR de las dos, una silueta de 36 de los 44 píxeles. |
| 2 | **Teclado** (`teclado`) | 571 | `SKP`/`SKNP` para varias teclas a la vez, `FX29`, `FX55`/`FX65` y resaltar con XOR | El repaso de las 16 teclas está desenrollado (6 instrucciones por tecla, 8 estados por `FX65`): una tecla se ilumina en 7 frames como mucho a IPF 15 (13 a IPF 7). |
| 3 | **Atrapa** (`atrapa`) | 374 | `RND`, puntaje con `FX33`/`FX65`/`FX29`, sprites movidos con un solo `DRW` de "diferencia", velocidad fraccionaria con un acumulador de 8 bits y el acarreo en VF, `FX0A` para reiniciar | 20 pasos por segundo. La caída empieza en 96/256 de píxel por paso y sube 4 por punto hasta 160/256: así el bloque tarda al menos 34 pasos en caer y la paleta, como mucho 28 en cruzar, o sea que todo bloque se puede atrapar. Cuenta como atrapado si toca la paleta en cualquier paso con y entre 26 y 28. |
| 4 | **Autotest** (`autotest`) | 1089 | CHIP-8 probándose a sí mismo | 19 comprobaciones en una grilla de 4×5 con tilde o cruz, y un resumen. Al terminar deja **VD = 19** (pruebas hechas) y **VE = fallas**, en `fin: JP fin`: lo leen las pruebas automáticas. La prueba del temporizador se rinde a las ~2000 instrucciones si DT no cambia. Detecta, por ejemplo, una bandera de `SUBN` mal calculada con operandos iguales. No usa `JP V0` a propósito. |
| 5 | **Fuente** (`fuente`) | 88 | La fuente incorporada con `FX29` | Los 16 dígitos en dos filas dentro de un marco. Imagen fija. |

Los encabezados de cada `.asm` documentan la pantalla, los registros y las velocidades
medidas; la [parte 6 del tutorial](TUTORIAL.md#6-leer-un-programa-real) recorre Rebote y
Atrapa.

### 5.5 tools/serve.js

Un servidor estático de unas 50 líneas: `node tools/serve.js [puerto]` (o `npm run serve`), por
defecto en `http://localhost:8008/`, también con la variable `PORT`. Sirve la carpeta del
repositorio, manda `/` a `chip8.html`, rechaza rutas que salgan de la carpeta y responde
con `Cache-Control: no-store`. La consola no lo necesita: existe para la vista previa
y para probar por HTTP.

### 5.6 tools/e2e.js

Pruebas de punta a punta en un navegador de verdad, sin dependencias (unas 2050 líneas).
Cómo está armado:

```
startServer()   servidor estático propio en 127.0.0.1, puerto elegido por el sistema;
                anota cada pedido y su código en server.requests; /__vacio da una página vacía
Browser         busca Chrome (y si no, Edge; o --browser / CHIP8_BROWSER), lo lanza con
                --headless=new, --remote-debugging-port=0, un perfil temporal y --mute-audio,
                y lee el puerto de <perfil>/DevToolsActivePort (30 s de plazo)
CDP             cliente del Chrome DevTools Protocol sobre el WebSocket global de Node 22,
                con plazo en cada comando
Page            una pestaña por escenario: teclado real (Input.dispatchKeyEvent con code,
                key y código virtual), mouse, toques con varios dedos, DOM.setFileInputFiles,
                Input.dispatchDragEvent con archivos, viewport y escala, prefers-reduced-motion,
                capturas; instrument() envuelve cpu.runFrame, step y reset para contar frames
Scenario        check(ok, descripción, detalle) e info(texto); PASA si todas las
                comprobaciones pasan
main()          corre los escenarios, imprime PASA / FALLA, guarda capturas y siempre
                limpia: Browser.close, taskkill, cierra lo que quede con el perfil y lo borra
```

Cada escenario arranca con los ajustes de fábrica: borra el `localStorage` desde una página
vacía del mismo origen (`Storage.clearDataForOrigin` devolvía "Internal error" en este
Chrome). Los escenarios miden con tiempo real (dejan correr `requestAnimationFrame`), no
con `frame()`. Sale con código 0 si todo pasó, 1 si algo falló y 2 si los argumentos son
inválidos o no encuentra el navegador. Exporta `{ Browser, CDP, Page, startServer,
findBrowser }` para reutilizarlo. Cómo correrlo: [9.9](#99-correr-las-pruebas-e2e).

---

## 6. Pruebas

### 6.1 Cómo se corren

```sh
node --test                                   # todas las pruebas unitarias (o: npm test), ~2 s
node --test tests/quirks.test.js              # un archivo
node --test --test-name-pattern="FX0A"        # por nombre
node tools/e2e.js                             # E2E en Chrome o Edge (o: npm run e2e), ~2 min
node tools/e2e.js --only 1,5 --shots ../capturas   # algunos escenarios, capturas afuera del repo
node tools/embed-roms.js --check              # ¿están al día los cartuchos incrustados?
```

Antes de dar por terminado un cambio: `node --test` y, si tocaste la interfaz,
`node tools/e2e.js`.

### 6.2 Qué cubre cada archivo

| Archivo | Qué prueba |
|---|---|
| `tests/instructions.test.js` | Las 35 instrucciones, un grupo por instrucción ("8XY4 ADD VX, VY"): valores normales y bordes, VF en 0 y 1, VF escrito al final con X = F, Y = F con el valor original, que no se toquen otros registros, avance del `pc` y saltos, pila anidada, `BNNN` en los dos modos, `CXNN` con un azar inyectado, `FX29` para los 16 dígitos, `FX33`, `FX55`/`FX65` con los dos modos de `memory` y la vuelta de I en `0xFFF`. |
| `tests/quirks.test.js` | Cada quirk prendido y apagado, los valores y nombres de los perfiles, que `DEFAULT_QUIRKS` sea una copia, que ningún cambio de la máquina llegue a los perfiles, la mezcla de `setQuirks`, y que un cambio entre pasos se aplique. |
| `tests/display.test.js` | `DXYN`: XOR, bit alto a la izquierda, colisión (hasta de un píxel), N = 0, sprites que cruzan `0xFFF`, `DFF1` (VF leído como coordenada antes de escribir la bandera), vuelta de la coordenada inicial, recorte o vuelta en el borde derecho, abajo y en la esquina, `00E0`, `displayDirty` y los 16 glifos. |
| `tests/timers-keys.test.js` | `tickTimers`, un tic por `runFrame` sea cual sea el IPF, `step` sin timers, `FX15`/`FX18`/`FX07`, `setKey`, `EX9E`/`EXA1` para las 16 teclas y con VX > 15, y `FX0A`: bloquea, espera apretar y soltar, ignora una tecla que ya estaba apretada, deja correr los timers, corta el frame y `reset` la cancela. |
| `tests/core-api.test.js` | Que `Chip8Core` sea el único global nuevo, las constantes y los bytes de la fuente, el estado inicial, `loadRom` (límite, copia, `ArrayBuffer`), `reset`, `step` y `runFrame` (valores de retorno, cortes), fetch big-endian y en direcciones impares, unos 50 opcodes inválidos, desbordes de pila y que una máquina detenida siga detenida. |
| `tests/disasm.test.js` | El texto exacto de cada familia, las palabras inválidas como `DW`, mayúsculas y relleno, `disassembleRange` (cantidad 0, inicio impar, vuelta en `0xFFF`) y el argumento opcional `quirks`. |
| `tests/mutation-gaps.test.js` | Los casos que dejó el mutation testing ([6.5](#65-mutation-testing)). |
| `tests/asm.test.js` | El ensamblador: cada instrucción, `JP VX`, números, etiquetas, mayúsculas, `EQU`, `DB`/`DW`, expresiones, comentarios, el listado, cada clase de error con "Línea N: ", la ida y vuelta de las 65 536 palabras y la línea de comandos (incluidos los errores en castellano, sin stack trace). |
| `tests/roms.test.js` | Los cartuchos: cada `.asm` ensambla idéntico a su `.ch8` y tiene sus etiquetas; `embed-roms --check` y el bloque incrustado; el propio `embed-roms.js` sobre un HTML temporal con CRLF; 600 frames por demo y perfil sin ejecutar datos; y el comportamiento de cada uno: el movimiento y las velocidades de Rebote; las 16 teclas de Teclado; en Atrapa, la paleta, que todo bloque se pueda atrapar y el reinicio con apretar y soltar; Autotest con VD = 19 y VE = 0 en cada perfil e IPF, y los núcleos saboteados que tiene que detectar; y la posición de cada glifo en Fuente. |
| `tests/tutorial.test.js` | El tutorial y sus ejemplos ([6.6](#66-pruebas-de-la-documentación)). |
| `tests/manual.test.js` | El manual y los enlaces del README ([6.6](#66-pruebas-de-la-documentación)). |
| `tests/single-file.test.js` | El contrato del archivo único: los cuatro bloques, cada uno una vez, con la etiqueta de apertura exacta y en orden; ningún `</script` ni `</style` adentro; ninguna dirección `http(s)`, `@import`, ni `src`/`href`/`url()` que no sea `data:` o `#ancla`; y que los tres bloques de código compilen. |

### 6.3 Números actuales

Medido el 27 de septiembre de 2026 con Node 22.11 (`node --test` desde la raíz):
**797 pruebas en 136 grupos**, todas pasan y ninguna salteada, en unos 3 s.

| Archivo | Pruebas |
|---|---|
| `tests/instructions.test.js` | 175 |
| `tests/disasm.test.js` | 121 |
| `tests/core-api.test.js` | 103 |
| `tests/asm.test.js` | 96 |
| `tests/tutorial.test.js` | 78 |
| `tests/roms.test.js` | 71 |
| `tests/display.test.js` | 49 |
| `tests/timers-keys.test.js` | 46 |
| `tests/quirks.test.js` | 30 |
| `tests/manual.test.js` | 12 |
| `tests/mutation-gaps.test.js` | 12 |
| `tests/single-file.test.js` | 4 |
| **Total** | **797** |

Todas pasan cuando los cartuchos incrustados están al día. Las dos pruebas del grupo
"chip8.html tiene las demos incrustadas" (`embed-roms --check` y la comparación de
`CHIP8_DEMOS` con las fuentes) fallan a propósito si alguien cambia un `roms/*.asm` y no
corre `node tools/embed-roms.js`.

La E2E: **24 de 24 escenarios** en Chrome 154, en dos corridas de unos 2 minutos (una de
ellas con los cartuchos recién incrustados). Algunas medidas de la primera:
`requestAnimationFrame` a 60,0 por segundo; Rebote a 59,8 frames por segundo
con IPF 15 y con IPF 1000 (579 instrucciones por segundo, por `displayWait`); un bucle sin
dibujo a IPF 1000, 60,3 frames y 60 259 instrucciones por segundo; la pelota recorre 30
píxeles en 1 s.

Cómo fue creciendo la suite:

| Momento | Pruebas | Resultado |
|---|---|---|
| Construcción: las 6 suites del núcleo, escritas a ciegas | 515 | todas pasan (las 2 fallas de la primera corrida eran errores de las pruebas) |
| Integración | 726 | 725 pasan, 1 salteada (el enlace a este documento, que no existía) |
| Después del mutation testing | 738 | 737 pasan, 1 salteada |
| Después de las correcciones de la revisión | 793 | todas pasan con los cartuchos al día |
| Integración final | 797 | todas pasan, ninguna salteada (se sumó `tests/single-file.test.js`) |

### 6.4 Pruebas de caja negra

Las seis suites del núcleo (`instructions`, `quirks`, `display`, `timers-keys`,
`core-api` y `disasm`) las escribió un agente que **no leyó el código del núcleo**: solo
el contrato del proyecto ([7.1](#71-primero-el-contrato)) y `tests/harness.js`. El núcleo lo
escribió otro agente, al mismo tiempo. Así, las pruebas verifican lo que el contrato
promete y no lo que el código hace. Donde el contrato no decía nada (por ejemplo, qué
devuelve `step()` en la instrucción que falla, o el formato hexadecimal exacto de los
mensajes de error), las pruebas no afirman nada, o afirman lo mínimo: que el mensaje
contenga el opcode con 4 dígitos y la dirección con 3, sin importar mayúsculas, con una
dirección elegida para que no sea parte del opcode. En la primera corrida contra el núcleo
real fallaron 2 de 515, y las dos eran errores de las pruebas; ninguna afirmación se
debilitó para que coincidiera con la implementación.

### 6.5 Mutation testing

Para medir si las pruebas atrapan errores de verdad, en la revisión se le metieron
**202 errores a propósito** (mutantes) al bloque `chip8-core`, uno por vez:

- **Método.** Una copia del repositorio por cada uno de 4 procesos en paralelo. Para cada
  mutante se reemplaza un texto exacto del núcleo (verificando antes que aparezca una sola
  vez), se corre `node --test` entero y el mutante cuenta como "muerto" si la suite
  falla. Se registra qué pruebas fallaron y se restaura el archivo. Antes de empezar se
  verifica que el original pase.
- **Qué se mutó.** Condiciones de las banderas (`>=` por `>`, invertidas) y el orden de
  escritura de VF; cada máscara (`& 0xFF`, `& 0xFFF`, `& 0xFFFF`); rangos de
  `FX55`/`FX65` y el avance de I; el orden de los dígitos de `FX33`; cada skip; `CALL`/`RET`
  y los límites de la pila; `SYS`; `00E0`; `DXYN` (vuelta, recorte, colisión, OR en lugar
  de XOR, bits al revés...); cada quirk invertido o ignorado; el azar de `CXNN`; las
  teclas y `FX0A`; `runFrame`; `tickTimers`; cada campo de `reset`; `loadRom`; `setQuirks`;
  `_fail`; y el desensamblador.
- **Antes:** 184 de 202 muertos (91,1 %). Cuatro de esas muertes las causaba solo una
  prueba del tutorial que compara texto (un fragmento citado del núcleo), no
  comportamiento: contando solo pruebas de comportamiento, 180 de 202 (89,1 %).
- **Huecos encontrados.** Diez mutantes sobrevivían y eran errores que alguien podría
  cometer de verdad; ninguna prueba se habría dado cuenta si el núcleo:
  1. multiplicara el azar por defecto por 255 (y `CXFF` nunca diera 255);
  2. tirara un `TypeError` con `setQuirks(null)`;
  3. guardara 0 en lugar de `false` con `setQuirks({ clipping: 0 })`;
  4. saturara en vez de truncar, en `loadRom`, los valores de más de 8 bits;
  5. dejara `pc = -2` (y el mensaje "0x0-2") con una instrucción inválida en `0xFFE`;
  6. leyera como 0, en una instrucción en `0xFFF`, el segundo byte que va en `0x000`;
  7. ejecutara, con la máquina detenida, una instrucción válida escrita después en el
     `pc`;
  8. no usara solo el nibble bajo en `setKey` (`setKey(0x13)` tiene que apretar la tecla
     3; esto solo lo atrapaba la prueba de texto);
  9. contara como apretada nueva la repetición automática de una tecla apretada desde
     antes de `FX0A` (ídem);
  10. no enmascarara a 16 bits en `disassemble` (`0x100E0` tiene que dar `CLS`).

  Por cada uno se agregó una prueba en `tests/mutation-gaps.test.js` (12 en total).
  Ninguna encontró un error en el núcleo: todas pasaron contra el original. Lo que faltaba
  era fijar esos comportamientos.
- **Después:** 192 de 202 muertos (95,0 %). Los 10 que sobreviven, y los 2 que solo mata la
  prueba de texto, son **equivalentes**: no pueden cambiar el comportamiento. Por
  ejemplo, `stack[sp-- - 1]` lee el mismo lugar que `stack[--sp]`; `(vx + vy) & 0xFF < vx`
  es verdadero exactamente cuando `vx + vy > 255`; saltear una fila de sprite en 0 es solo
  una optimización; cortar el bucle de columnas o de filas con `break` o con `continue` da
  lo mismo porque x e y solo crecen; y las dos puestas a -1 de `_waitKey` son redundantes
  entre sí. O sea: **190 de los 190 mutantes que pueden cambiar el comportamiento los mata
  una prueba de comportamiento (100 %)**.
- **Límites.** Solo se mutó el núcleo, no la interfaz. El programa que lo hizo quedó fuera
  del repositorio; con la descripción de arriba se puede rehacer en una tarde.

### 6.6 Pruebas de la documentación

La documentación también se prueba, para que no se aleje del código:

- **`tests/manual.test.js`.** Cada bloque de código `asm` del manual se ensambla tal cual, salvo
  los marcados como fragmento (la primera línea empieza con `; Fragmento`): a esos se les
  agregan las etiquetas que faltan y el comentario inicial tiene que nombrarlas. Los
  ejemplos que terminan en `fin: JP fin` se ejecutan con cada perfil y tienen que llegar a
  ese bucle. Cada ancla interna y cada enlace al tutorial y a otros archivos tiene que
  existir, y el índice tiene que listar cada sección numerada. Del README revisa los
  enlaces, que la estructura del repositorio nombre archivos que existen (e incluya cada
  `tools/*.js`) y que cada `npm run ...` sea un script de `package.json`.
- **`tests/tutorial.test.js`.** Cada ejemplo de `docs/ejemplos/` ensambla, su `.ch8` está
  al día y hace lo que el texto dice (pantalla exacta, teclas, velocidades, registros paso
  a paso, el error de `11-sin-fin`). `mini-emulador.js` coincide frame a frame con el
  núcleo. En el texto: los listados completos (primera línea `; NN-nombre.asm — `) son
  idénticos a sus archivos; los fragmentos (`; (fragmento de RUTA)` o
  `// (fragmento de RUTA)`) están tal cual en su archivo, **incluidos dos del núcleo**
  (`runFrame` y `setKey` de `chip8.html`) y varios de `roms/rebote.asm` y
  `roms/atrapa.asm`; las salidas marcadas con `<!-- salida: CMD -->` se regeneran en una
  copia temporal y se comparan; los mensajes de error son los del ensamblador; los textos
  y constantes de la interfaz que cita (`IPF_PRESETS = [7, 15, 30, 100, 500, 1000, 5000, 10000]`,
  `BEEP_HZ = 440`, `MAX_CATCHUP = 4`, los nombres de los botones, el mapa del teclado...)
  están en `chip8.html`; y los enlaces, incluido el de este documento, llevan a archivos
  y anclas que existen.

Consecuencia práctica: si cambiás un texto de la interfaz, una constante, un fragmento
citado del núcleo o de una ROM, o un mensaje del ensamblador, estas pruebas fallan y dicen
qué actualizar en el tutorial o en el manual. Es a propósito.

### 6.7 Los escenarios E2E

Todos usan entrada real (teclas, clics, toques, archivos y arrastre) y tiempo real:

| # | Qué verifica |
|---|---|
| 1 | La página carga por HTTP y por `file://` sin excepciones, sin errores de consola y sin 404 del ícono. |
| 2 | Velocidad real: unos 60 frames por segundo con IPF 15 y 1000, también con un bucle sin dibujo. |
| 3 | Teclado físico: las 16 teclas, con el cartucho Teclado. |
| 4 | Keypad en pantalla: mouse, arrastrar afuera de la tecla y dos dedos a la vez. |
| 5 | Atajos (Espacio, N, Retroceso, H, Esc) y el modelo de foco: un clic no deja el foco en el botón; con el foco puesto desde el teclado, Espacio activa el control. |
| 6 | Carga de ROMs: selector de archivos, ROM vacía o demasiado grande (el aviso no tapa nada) y arrastrar y soltar. |
| 7 | Cada cartucho del estante carga y corre 3 s. |
| 8 | Atrapa: A y D mueven la paleta. |
| 9 | Autotest con cada perfil: 19 comprobaciones y 0 fallas. |
| 10 | Interruptores de quirks, perfiles, ajustes guardados y un `localStorage` roto. |
| 11 | Controles de velocidad: deslizador, campo numérico y botones. |
| 12 | Sonido: el gesto que lo habilita, el silencio y la pausa. |
| 13 | Monitor: Paso, desensamblado, registros, pila, Frame y ocultar. |
| 14 | Error con la máquina corriendo: tubo, monitor, un solo anuncio y Reiniciar. |
| 15 | Diseño adaptable de 360 a 1440 px y nitidez con escala 1,25 y 2. |
| 16 | `prefers-reduced-motion` apaga parpadeos y animaciones. |
| 17 | Pestaña congelada u oculta: al volver no se pone al día de golpe. |
| 18 | Modo de pantalla: Tubo CRT y Píxeles puros (dos colores exactos, sin efectos, interruptores deshabilitados), se conserva al recargar y cambia con las flechas. |
| 19 | Selector rápido de cartuchos bajo la ranura, a 1440×900 y sin scrollear. |
| 20 | Selectores de perfil y paleta: después de elegir, las teclas van al CHIP-8; N, H y Retroceso funcionan; con Tab y flechas cambian de forma nativa. |
| 21 | Keypad con el teclado: Tab hasta una tecla, Enter breve (unos 120 ms) y Espacio sostenido; `FX0A` los recibe. |
| 22 | Error con la máquina en pausa (Reiniciar deja `0x200` en pausa) o corriendo (vuelve a correr). |
| 23 | Ícono de la pestaña embebido: ningún pedido da 404 por HTTP. |
| 24 | Pantalla angosta (360×640 y 375×667): el tubo y el keypad entero en la primera vista. |

`node tools/e2e.js --help` imprime esta misma lista (sale del comentario del principio del
archivo).

### 6.8 Lo que no se verifica automáticamente

- **El sonido audible.** El navegador corre con `--mute-audio`; se verifican el grafo de
  Web Audio y sus ganancias, no que algo suene por los parlantes.
- **Teléfonos y pantallas táctiles reales.** Los toques y el tamaño de pantalla se emulan
  por CDP.
- **Firefox y Safari.** Solo navegadores de la familia Chromium (Chrome y Edge). El caso
  del `AudioContext` en estado `interrupted` de iOS no está manejado.
- **Lectores de pantalla reales** (NVDA, JAWS, VoiceOver): se verifican los atributos ARIA
  y la activación sin puntero, no lo que se escucha.
- **El diálogo de archivos del sistema y arrastrar desde el explorador**: se simulan con
  `DOM.setFileInputFiles` y `Input.dispatchDragEvent`. La lista desplegable nativa de un
  `<select>` no se puede cliquear en modo headless y se simula con el teclado.
- **La apariencia.** Salvo las comprobaciones píxel por píxel del lienzo (escenarios 6 y
  18), el aspecto se revisó mirando capturas, no con imágenes de referencia.
- **ROMs de pruebas de la comunidad** (por ejemplo, la suite de Timendus): no se
  descargaron ni se corrieron; los quirks se verificaron contra su comportamiento
  documentado.
- **La interfaz no tiene mutation testing**; solo el núcleo.

---

## 7. Proceso de desarrollo

El proyecto lo construyeron agentes de IA especializados, en fases, coordinados por un
agente principal. Esta sección cuenta cómo, porque explica varias decisiones del código y
de las pruebas.

### 7.1 Primero el contrato

Antes de escribir código, se fijó un **contrato compartido**, la única fuente de verdad
para todos los agentes: un solo HTML con los bloques y sus etiquetas exactas; la API de
`Chip8Core` (las 13 claves de [3.1](#31-api-pública)), el estado y la semántica de cada
método (VF al final, I de 16 bits con accesos de 12, `FX0A` con apretar y soltar,
`displayWait`, qué hace `reset`, cómo se detiene la máquina); los identificadores de los
quirks y los perfiles; el formato del desensamblador; el formato de `CHIP8_DEMOS` y de
las etiquetas de `roms/*.asm`; la API `window.chip8`; el mapa del teclado; la estructura
de carpetas; y las reglas de idioma (castellano con voseo, identificadores en inglés).
Con el contrato, cada parte se pudo construir sin esperar a las otras, y las pruebas se
pudieron escribir sin ver la implementación.

### 7.2 Construcción en paralelo

Seis agentes trabajaron al mismo tiempo, cada uno dueño de sus archivos:

| Agente | Qué construyó | Cómo lo verificó |
|---|---|---|
| Núcleo | El esqueleto de `chip8.html` y `chip8-core` | 20 verificaciones propias con `tests/harness.js`; las 65 536 palabras por el desensamblador |
| Pruebas (a ciegas) | Las 6 suites del núcleo ([6.4](#64-pruebas-de-caja-negra)) | 515 pruebas contra el núcleo real |
| Interfaz | `chip8-style`, el marcado y `chip8-ui` | En el navegador: 1024, 1440 y 375 px, atajos, errores, paletas, sonido |
| Cartuchos y ensamblador | `tools/chip8asm.js`, `tools/embed-roms.js`, los 5 cartuchos, `asm.test.js` y `roms.test.js` | Las demos corridas sin navegador, con la pantalla como texto; toda la suite en una copia con los cartuchos incrustados |
| Manual | `docs/MANUAL.md` | Fuentes primarias (el manual del VIP, BYTE de 1978, Scotford, Cowgod, Timendus, Gulrak, chip-8-database); sus 42 bloques `asm` ensamblados; afirmaciones clave corridas en el núcleo |
| Tutorial | `docs/TUTORIAL.md`, 11 ejemplos, `mini-emulador.js` y `tutorial.test.js` | Listados, salidas y comandos pegados desde ejecuciones reales; recorridos comprobados en el navegador |

La interfaz y los cartuchos se hicieron sin verse: la interfaz se probó con Rebote cargado
a mano, porque `CHIP8_DEMOS` todavía estaba vacío.

### 7.3 Integración

Un agente de integración corrió `node tools/embed-roms.js`, verificó que no hubiera
recursos externos, que las etiquetas fueran exactas, que hubiera exactamente tres
`</script`, que los bloques pasaran `node --check`, que el núcleo no nombrara nada del
navegador y que los 63 `id` que busca la interfaz existieran en el marcado. Probó los cinco
cartuchos en el navegador, escribió el `README.md` y corrigió una frase del manual (la
§11.9, sobre cuándo el selector muestra "Personalizado"). Resultado: **726 pruebas, 725
pasan y 1 salteada** (el enlace a este documento). No apareció ningún error del núcleo, de
las pruebas ni de la interfaz.

### 7.4 Revisión adversarial

Después, una revisión con siete carriles en paralelo, cada uno tratando de romper una
parte:

| Carril | Qué hizo | Hallazgos | Confirmados | Refutados |
|---|---|---|---|---|
| E2E | Escribió `tools/e2e.js` (17 escenarios) y lo corrió en Chrome y Edge | 4 | 4 | 0 |
| Mutation testing | 202 mutantes sobre el núcleo ([6.5](#65-mutation-testing)) | 0 (10 huecos, convertidos en 12 pruebas) | — | — |
| Núcleo | Leyó todo el bloque y lo sondeó con programas propios | 4 | 3 | 1 |
| Interfaz | Leyó estilos, marcado e interfaz; sondeó con su propio cliente CDP | 12 | 12 | 0 |
| Cartuchos y ensamblador | Corrió las demos con cada perfil e IPF, bots y núcleos saboteados; casos borde del ensamblador y del incrustador | 12 | 10 | 2 |
| Manual | Contrastó el manual con el código y con fuentes | 11 | 9 | 2 |
| Tutorial | Siguió el tutorial al pie de la letra, en Chrome headless | 14 | 12 | 2 |
| **Total** | | **57** | **50** | **7** |

Cada hallazgo pasó por un **verificador adversarial**, un agente distinto que intentó
refutarlo: reproducirlo, buscar si era un comportamiento documentado a propósito, o si era
una preferencia y no un defecto. De los 57, 4 eran graves (todos confirmados), 33 menores
(30 confirmados) y 20 detalles (16 confirmados). Los refutados no se corrigieron.

### 7.5 Correcciones

Los 50 hallazgos confirmados se repartieron en carriles de corrección, otra vez cada uno
dueño de sus archivos:

- **HTML** (19 hallazgos de interfaz, E2E y núcleo): el modelo de foco, la estela en
  pausa, Reiniciar después de un error, el anuncio único, la accesibilidad del keypad y
  de los controles, el diseño en teléfonos, el ícono, los avisos arriba, el
  desensamblador con quirks y `loadRom(ArrayBuffer)`. 9 pruebas nuevas.
- **Cartuchos y ensamblador** (10 hallazgos): Atrapa justo, Autotest más fino y sin
  esperas de 82 s, comentarios de Rebote correctos, velocidades medidas y documentadas, y
  una línea de comandos del ensamblador que explica los errores.
- **E2E**: actualizó los escenarios al comportamiento nuevo, arregló el escenario 17 (que
  fallaba a veces porque Chrome congela la pestaña solo en parte) y sumó los escenarios
  18 a 24. Tres corridas seguidas: 24 de 24.
- **Documentación**: manual, tutorial, README y este documento.

### 7.6 Hallazgos notables y cómo se resolvieron

| Id | Gravedad | Qué pasaba | Cómo se resolvió |
|---|---|---|---|
| ui-1 | grave | Con un `<select>` enfocado (después de elegir Perfil o Paleta con el mouse), las letras del keypad cambiaban la opción por búsqueda de texto y los atajos no andaban. | Un `select` ya no cuenta como campo de texto: las 16 teclas, N, H y Retroceso van al emulador con `preventDefault`, y el selector suelta el foco después de un cambio con el mouse. E2E 20. |
| tut-1 | grave | El recorrido de la §7.3 del tutorial no se podía seguir: después de un error, Reiniciar ponía la máquina a correr. | `handleHalt` guarda `pausedBeforeHalt` y `doReset` lo restaura ([8.13](#813-reiniciar-después-de-un-error-respeta-la-pausa)). E2E 22. |
| tut-2 | grave | Cambiar de perfil y apretar Retroceso o WASD no hacía nada (misma causa que ui-1). | Resuelto con ui-1. Además (tut-10), el tutorial ahora pide volver al perfil COSMAC VIP después de probar, porque el perfil queda guardado. |
| tut-3 | grave | El tutorial decía que el cuadro intermedio de Rebote muestra la pelota "casi completa"; con XOR la parte compartida se apaga. | Texto del tutorial y comentarios de `rebote.asm` corregidos (una silueta de 36 de 44 píxeles); una prueba mide la alternancia 44/36 en el VIP. |
| ui-2 | menor | En pausa, la estela del fósforo quedaba congelada y la imagen no coincidía con el framebuffer. | La estela sigue apagándose a 60 Hz en pausa ([4.2](#42-el-bucle-principal)). |
| ui-4 | menor | Un error se anunciaba tres veces al lector de pantalla. | Un solo anuncio en `#status`, sin aviso flotante ni `role="alert"`. |
| ui-5 | menor | Espacio sobre un interruptor enfocado pausaba en lugar de activarlo. | El modelo de foco ([8.12](#812-el-modelo-de-foco)). |
| ui-7 | menor | Las teclas del keypad no respondían a la activación de un lector de pantalla. | Un `click` sin puntero es un toque de 120 ms. E2E 21. |
| ui-9 | menor | En un teléfono vertical el keypad quedaba debajo del pliegue. | A 760 px o menos el keypad va debajo del tubo. E2E 24. |
| core-1 | menor | Con el quirk `jumping`, el monitor mostraba `JP V0` aunque el salto sumara VX. | `disassemble(opcode, quirks)` con quirks opcionales ([3.8](#38-el-desensamblador)). |
| core-4 | detalle | `loadRom(ArrayBuffer)` se salteaba el control de tamaño. | Se convierte a `Uint8Array` antes de controlar. |
| rom-2 | menor | En Atrapa, pasados 13 a 18 puntos, algunos bloques eran imposibles de alcanzar. | Velocidad +4 por punto con un tope real de 160/256 (34 pasos de caída contra 28 de cruce). |
| rom-3 | menor | Atrapa solo miraba si atrapaste el bloque en y = 26: se lo veía tocar la paleta y costaba una vida. | Se revisa en cada paso con y entre 26 y 28. |
| rom-4 | menor | Autotest no detectaba una bandera de `SUBN` mal calculada con operandos iguales. | Caso agregado dentro de la misma comprobación (siguen siendo 19). |
| rom-5 | menor | Con un DT congelado, Autotest parecía colgado unos 82 s antes de informar la falla. | La espera se rinde a las ~2000 instrucciones; también detecta un DT que sube. |
| asm-1, asm-2 | menor | La línea de comandos mostraba un stack trace de Node si la carpeta de salida no existía, y salía con 0 con argumentos de más. | Analizador de argumentos nuevo y errores del sistema de archivos explicados en castellano, con código 1. |
| asm-4 | detalle | `V 1` o `D T` se aceptaban como registros. | Ahora es un error que dice cómo se escribe. |
| e2e-1 | menor | Por HTTP, la consola registraba un 404 de `/favicon.ico`. | Ícono SVG embebido en una URL `data:`. E2E 23. |
| e2e-2 | menor | El aviso de error tapaba el error del monitor y la línea de estado. | Sin aviso para los errores de ejecución; los avisos van arriba al centro. |
| man-1, tut-5 | menor | Los enlaces a `DESARROLLO.md` estaban rotos y la prueba que debía detectarlo quedaba salteada. | Este documento; la prueba ahora corre y pasa. |

Los siete refutados, y por qué:

| Id | Qué se planteaba | Por qué se refutó |
|---|---|---|
| core-2 | `FX0A` ignora una tecla que ya estaba apretada; el VIP y Octo la aceptan. | Es una decisión deliberada y documentada en la §7.4 del manual ([8.4](#84-fx0a-espera-apretar-y-soltar)). |
| asm-3 | No hay advertencia si una instrucción queda en una dirección impar después de un `DB`. | Es CHIP-8 válido y nada pide advertirlo: una mejora, no un defecto. |
| rom-6 | Autotest no prueba `BNNN`. | El encabezado de Autotest dice que no usa `JP V0` a propósito; no promete cubrirlo. |
| man-7 | El manual no describe el formato de una ROM ni cómo se carga. | La §3.2 del manual ya lo dice, y el README cubre la carga. |
| man-11 | Un ejemplo de `FX65` se mete en sus datos y se detiene. | Es un fragmento (tiene `; ...`), no un programa completo; ensambla y hace lo que dice. |
| tut-6 | La prueba del tutorial busca textos del código de la interfaz: un cambio inocente la rompe. | Es un control deliberado de que el tutorial cite valores reales, y falla con un mensaje preciso. |
| tut-14 | La §5.4 introduce subrutinas sin avisar que son nuevas. | Se presentan en la §2.3 y en la tabla de instrucciones. |

### 7.7 Pedidos después de la revisión

Después de la revisión, a pedido del usuario, se agregaron dos cosas a la interfaz:

- **El selector de modo de pantalla** en "Pantalla y sonido": Tubo CRT (el de siempre) o
  Píxeles puros ([4.4](#44-modos-de-pantalla-tubo-crt-y-píxeles-puros)). Lo cubre el E2E 18.
- **El selector rápido de cartuchos** debajo de la ranura, con la línea de controles del
  cartucho cargado y el enlace al estante ([4.8](#48-cartuchos-incluidos-y-selector-rápido)).
  Lo cubre el E2E 19.

---

## 8. Decisiones de diseño

Cada decisión, en formato corto: el contexto, qué se decidió y qué implica.

### 8.1 Un solo archivo, y los tests extraen los bloques

- **Contexto:** el requisito era un único HTML sin dependencias, y a la vez el núcleo
  tenía que estar probado a fondo.
- **Decisión:** el código vive en bloques `<script>` con `id` fijo, y las pruebas extraen
  el texto de cada bloque y lo evalúan con `node:vm` ([2.5](#25-cómo-los-tests-sacan-los-bloques)).
- **Consecuencias:** se prueba exactamente el código que se entrega, sin copias ni paso de
  compilación. A cambio, hay que respetar las etiquetas exactas y la regla del cierre de
  script, y el núcleo no puede usar nada del navegador.

### 8.2 Un núcleo puro

- **Contexto:** la emulación tenía que poder correr en Node para las pruebas, y la interfaz
  necesita el DOM, Canvas y Web Audio.
- **Decisión:** `chip8-core` no toca el DOM, la consola ni ningún global salvo
  `Chip8Core`. Todo su estado es público. La interfaz lee ese estado y le informa teclas;
  el núcleo no sabe que existe una interfaz.
- **Consecuencias:** las pruebas del núcleo corren en unos 2 s sin navegador; el monitor
  lee el estado directamente. La persistencia del fósforo, el sonido y los efectos son
  cosa de la interfaz ([8.15](#815-los-efectos-viven-en-la-interfaz)).

### 8.3 Mnemónicos de Cowgod

- **Contexto:** hacía falta un desensamblador para el monitor y un ensamblador para los
  cartuchos y el tutorial.
- **Decisión:** los mnemónicos de la referencia de Cowgod (`LD V1, 0x2A`,
  `DRW V0, V1, 5`, `LD [I], V1`...), idénticos en los dos sentidos, y `DW 0xNNNN` para las
  palabras inválidas.
- **Consecuencias:** es el estilo que más material de la comunidad usa; lo que muestra el
  monitor se puede copiar y volver a ensamblar, y las 65 536 palabras dan la vuelta
  completa (prueba en `tests/asm.test.js`).

### 8.4 FX0A espera apretar y soltar

- **Contexto:** los intérpretes difieren: el VIP esperaba que se soltara la tecla; muchos
  modernos terminan al apretarla.
- **Decisión:** el comportamiento del VIP, y además solo cuentan las transiciones
  posteriores al comienzo de la espera: una tecla ya apretada tiene que soltarse y volver
  a apretarse ([3.4](#34-fx0a-apretar-y-soltar)).
- **Consecuencias:** un programa que espera una tecla después de otra no se saltea la
  segunda por la misma pulsación, y la repetición automática no cuenta. La revisión lo
  planteó como error (core-2) y el verificador lo refutó: está documentado en la
  [§7.4 del manual](MANUAL.md#74-esperar-una-tecla-fx0a). El keypad por teclado sostiene
  la tecla al menos 120 ms para que `FX0A` vea las dos mitades.

### 8.5 I de 16 bits, accesos de 12

- **Contexto:** con `FX1E` o el avance de `FX55`/`FX65`, I puede pasar de `0xFFF`.
- **Decisión:** I se guarda con 16 bits y cada acceso a memoria enmascara con `& 0xFFF`
  ([3.6](#36-i-de-16-bits-y-accesos-de-12)).
- **Consecuencias:** se comporta como los intérpretes modernos de referencia, nunca se lee
  fuera de la memoria y el monitor muestra el valor real de I.

### 8.6 displayWait como "el DXYN cierra el frame"

- **Contexto:** el VIP esperaba la interrupción de video antes de dibujar; emularlo con
  ciclos exactos exigiría medir el costo de cada instrucción.
- **Decisión:** como mucho un `DXYN` por frame, y el `DXYN` termina el frame
  ([3.5](#35-runframe-y-displaywait)).
- **Consecuencias:** simple, determinista y fácil de probar. Los programas que dibujan en
  cada vuelta van a la misma velocidad con cualquier IPF, que es el efecto que importaba.
  No reproduce que en el VIP un sprite grande tarde más que uno chico.

### 8.7 La fuente en 0x050

- **Contexto:** el VIP guardaba la fuente en su ROM, fuera de la RAM de los programas;
  cada intérprete moderno la pone en algún lugar debajo de `0x200`.
- **Decisión:** `0x050`–`0x09F`, la ubicación que se volvió costumbre entre los emuladores
  modernos. Los programas no deberían depender de la dirección: `FX29` la calcula.
- **Consecuencias:** ningún programa bien escrito lo nota. Uno que se sale de su código da
  la vuelta a la memoria, llega a la fuente y se detiene con un mensaje reconocible
  (opcode `0xF090` en la dirección `0x050`).

### 8.8 Pila de 16 niveles con error de desbordamiento

- **Contexto:** el intérprete del VIP tenía lugar para 12 niveles y, por lo que se sabe, no
  controlaba el desborde; SUPER-CHIP y la mayoría de los intérpretes modernos ofrecen 16.
- **Decisión:** 16 niveles; el 17.º `CALL` y un `RET` con la pila vacía detienen la máquina
  con un mensaje.
- **Consecuencias:** entran todos los programas conocidos, y la recursión sin fin se
  informa en lugar de corromper la memoria.

### 8.9 Los errores detienen la máquina, no tiran excepciones

- **Contexto:** una ROM cualquiera puede tener opcodes inválidos o romper la pila, y el
  emulador no se puede caer.
- **Decisión:** `_fail` deja la máquina detenida, con el `pc` en la instrucción culpable y
  un mensaje en castellano con el opcode y la dirección ([3.7](#37-errores)); `0NNN` se
  ignora.
- **Consecuencias:** el monitor muestra dónde está el problema, y el bucle de la interfaz
  no necesita `try/catch`. La única excepción es la ROM demasiado grande en `loadRom`,
  que la interfaz ya controla antes.

### 8.10 Escala entera con devicePixelRatio

- **Contexto:** estirar 64×32 a un tamaño cualquiera deja píxeles de distinto ancho, y con
  escalas de Windows como 125 % se ve borroso.
- **Decisión:** el lienzo mide un múltiplo entero de 64×32 en píxeles **físicos** y se
  dibuja sin suavizado ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)).
- **Consecuencias:** cada píxel CHIP-8 es un cuadrado exacto en cualquier pantalla (medido
  con escala 1,25 y 2). En pantallas chicas con escala 1 la imagen no llena todo el tubo.

### 8.11 Teclas por KeyboardEvent.code

- **Contexto:** el keypad del VIP se mapea tradicionalmente al bloque 1-4/Q-R/A-F/Z-V
  según su posición.
- **Decisión:** mapear por `code` (la posición física), no por `key` (el carácter).
- **Consecuencias:** el mismo bloque en QWERTY, AZERTY o Dvorak, sin configurar nada. Los
  atajos (N, H) también son por posición.

### 8.12 El modelo de foco

- **Contexto:** los atajos de una sola tecla chocan con los controles: un botón enfocado
  se activa con Espacio, un `<select>` enfocado cambia de opción con las letras. La
  revisión encontró que eso rompía el keypad y los atajos (ui-1, ui-5, tut-2).
- **Decisión:** un clic con puntero no deja el foco en el control; un `<select>` lo suelta
  después de un cambio con el mouse; las 16 teclas, N, H y Retroceso llegan al emulador
  desde cualquier control que no sea de texto; Espacio y Enter sobre un control enfocado
  con el teclado lo activan ([4.5](#45-teclado-keypad-y-foco)).
- **Consecuencias:** para quien usa el mouse, Espacio siempre pausa; quien navega con Tab
  tiene el comportamiento normal de la web. La excepción deliberada: si el cambio de un
  selector vino de una tecla sobre él, el foco se queda, para poder seguir con las
  flechas.

### 8.13 Reiniciar después de un error respeta la pausa

- **Contexto:** al principio, Reiniciar después de un error siempre ponía la máquina a
  correr, así que quien depuraba de a un paso perdía el lugar (tut-1, ui-3).
- **Decisión:** `handleHalt` guarda si la máquina estaba en pausa justo antes del error y
  `doReset` vuelve a ese estado.
- **Consecuencias:** se puede reiniciar y avanzar con Paso desde `0x200` para llegar al
  error; si el programa corría, vuelve a correr.

### 8.14 Un solo anuncio por error

- **Contexto:** el error aparecía en el tubo, en el monitor, en un aviso flotante y en la
  línea de estado, con dos regiones `role="alert"`: se leía tres veces y el aviso tapaba
  el monitor.
- **Decisión:** el mensaje se ve en el tubo y en el monitor, y se anuncia una vez por
  `#status`. Los avisos flotantes quedan para los problemas al cargar una ROM, arriba al
  centro.
- **Consecuencias:** una sola lectura con lector de pantalla y nada tapado. El aviso de
  ROM rechazada, arriba, puede tapar un momento el botón "?" en pantallas anchas.

### 8.15 Los efectos viven en la interfaz

- **Contexto:** el parpadeo es inherente a CHIP-8 (borrar y redibujar con XOR); el
  "fósforo" lo disimula, pero no es parte de la máquina.
- **Decisión:** el núcleo solo tiene 0 y 1; la estela, las scanlines, el resplandor y los
  modos de pantalla son de la interfaz, con un buffer de brillo aparte
  ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)).
- **Consecuencias:** el framebuffer siempre es exacto para las pruebas y el monitor; los
  efectos se pueden apagar (Píxeles puros) sin cambiar la emulación.

### 8.16 Sin dependencias, también en las pruebas

- **Contexto:** las pruebas en el navegador suelen usar Puppeteer o Playwright, que se
  instalan con npm y descargan su propio navegador.
- **Decisión:** `node:test` para las pruebas unitarias y, para las E2E, un cliente propio
  del DevTools Protocol sobre el `WebSocket` global de Node 22, usando el Chrome o Edge
  instalado.
- **Consecuencias:** `git clone` y listo: no hay `node_modules`, ni `npm install`, ni
  descargas de cientos de megas, ni versiones que se desactualicen. El costo: solo
  navegadores Chromium y unas 400 líneas de infraestructura propia (el servidor, lanzar el
  navegador, limpiar procesos en Windows, la entrada de teclado y toques) que hay que
  mantener.

### 8.17 Quirks del VIP por defecto y perfiles detectados

- **Contexto:** CHIP-8 es el intérprete del COSMAC VIP, pero muchos programas modernos se
  escribieron para SUPER-CHIP o XO-CHIP.
- **Decisión:** el perfil de fábrica es el del VIP (`vfReset`, `memory`, `clipping` y
  `displayWait` activados) y la velocidad, 15 IPF. Los interruptores se tocan de a uno y el
  selector de perfil muestra el perfil que coincide, o "Personalizado".
- **Consecuencias:** los programas clásicos andan sin tocar nada; para los modernos alcanza
  con elegir un perfil. Como los ajustes se guardan, el perfil elegido sigue en la
  próxima sesión.

---

## 9. Cómo extender

### 9.1 Reglas de la casa

- No edites `<script id="chip8-roms">` a mano: cambiá `roms/*.asm` y corré
  `node tools/embed-roms.js`.
- No cambies las etiquetas de apertura de los bloques ni pongas `</script` adentro de un
  bloque ([2.4](#24-la-regla-del-cierre-de-script)).
- Nada externo: ni CDN, ni fuentes, ni imágenes por URL, ni `fetch`. Si hace falta una
  imagen, que sea una URL `data:` o se dibuje.
- El núcleo no toca el navegador.
- Todo texto para el usuario, mensaje de error, comentario y documento, en castellano con
  voseo; los identificadores, en inglés.
- Antes de terminar: `node --test`, y `node tools/e2e.js` si tocaste la interfaz.
- Si cambiás un texto de la interfaz, una constante citada o un mensaje, las pruebas de la
  documentación te van a decir qué actualizar ([6.6](#66-pruebas-de-la-documentación)).

### 9.2 Agregar o cambiar una instrucción

1. **Núcleo:** el caso en el `switch` de `Chip8.prototype.step` (y, si dibuja, en
   `_draw`). Respetá "VF al final" y enmascará toda dirección con `& 0xFFF`. Si un opcode
   pasa de inválido a válido, sacalo del `default` que llama a `_invalid`.
2. **Desensamblador:** el texto en `disassemble`.
3. **Ensamblador:** el mnemónico en `MNEMONICS` y el patrón en `TABLE` de
   `tools/chip8asm.js`, y la tabla de instrucciones del comentario del principio.
4. **Pruebas:** un grupo en `tests/instructions.test.js`, el texto en
   `tests/disasm.test.js`, y el ensamblador en `tests/asm.test.js`. La ida y vuelta de las
   65 536 palabras va a fallar si el desensamblador y el ensamblador no coinciden; y
   `tests/core-api.test.js` tiene una lista de opcodes que tienen que ser inválidos.
5. **Documentación:** la ficha en la sección 10 del manual y, si corresponde, la tabla de
   la parte 2.9 del tutorial.

### 9.3 Agregar un quirk

1. **Núcleo:** la clave en `QUIRK_KEYS`, su valor en cada perfil de `QUIRK_PRESETS` y el
   comportamiento en `step`. `setQuirks`, `copyQuirks` y `DEFAULT_QUIRKS` la toman solos.
2. **Interfaz:** `chip8-ui` tiene **su propia copia** de `QUIRK_KEYS` (el núcleo no la
   exporta): agregala ahí y su entrada en `QUIRK_INFO` (etiqueta corta, nombre, opcodes y
   descripción). El interruptor, la ayuda, la detección de perfil y la validación de los
   ajustes guardados salen de esas dos listas. La línea fija "Perfiles: COSMAC VIP = 1, 2,
   5 y 6 activados..." de `buildHelpQuirks` se actualiza a mano.
3. **Pruebas:** en `tests/quirks.test.js`, el quirk prendido y apagado y los valores de los
   perfiles; en `tools/e2e.js`, la función `presetQuirks` repite los perfiles.
4. **Documentación:** la sección 11 del manual y la tabla de la parte 1.6 del tutorial. Si
   cambiás las etiquetas cortas (`VF=0`, `MEM`...), `tests/tutorial.test.js` lo va a
   notar.

### 9.4 Hacia SUPER-CHIP

Hoy los perfiles SUPER-CHIP y XO-CHIP solo cambian quirks
([§13.4 del manual](MANUAL.md#134-qué-pasa-si-cargás-una-rom-de-super-chip-o-xo-chip-acá)).
Implementar las instrucciones de SUPER-CHIP 1.1 pide, por lo menos:

- **Pantalla variable.** Alta resolución de 128×64 (`00FF`/`00FE`). Hoy `DISPLAY_WIDTH`,
  `DISPLAY_HEIGHT`, `display`, el buffer de brillo, la `ImageData`, el patrón de scanlines
  y `resizeScreen` suponen 64×32 fijo: habría que hacerlos depender del modo, y el tubo
  mantiene la proporción 2:1.
- **Instrucciones nuevas:** scroll (`00CN`, `00FB`, `00FC`), salir (`00FD`), la fuente
  grande de 8×10 (`FX30`, con sus bytes en memoria), las banderas persistentes
  (`FX75`/`FX85`) y los sprites de 16×16 (`DXY0`, que hoy no dibuja nada y deja VF en 0, y
  lo fija una prueba). Hoy `00FF`, `00FE`, `00CN`, `00FB`, `00FC` y `00FD` se ignoran como
  `SYS`, y `FX30`, `FX75` y `FX85` detienen la máquina como inválidas: esas pruebas y la ida
  y vuelta del desensamblador van a cambiar.
- **Perfiles.** Probablemente una opción aparte de los quirks ("modo SUPER-CHIP") que
  habilite las instrucciones, para que el perfil CHIP-8 siga rechazando opcodes de más.
- **Verificación.** Las ROMs de pruebas de Timendus cubren SUPER-CHIP y XO-CHIP; valdría la
  pena correrlas (pidiendo permiso para descargarlas) y sumar sus resultados a las
  pruebas.

### 9.5 Agregar un demo

1. Escribí `roms/<id>.asm` con las cuatro etiquetas (`@name`, `@description`, `@controls`,
   `@order`) y las reglas de [5.3](#53-reglas-para-escribir-un-demo). El `@order` define la
   posición en el estante; el 1 es el que arranca con la consola.
2. `node tools/embed-roms.js`: escribe `roms/<id>.ch8` y actualiza `chip8.html`.
3. En `tests/roms.test.js`, agregá el `id` a `DEMO_IDS` (en el orden de `@order`: la
   prueba exige `@order` = posición + 1) y un grupo con su comportamiento. Las pruebas
   generales (600 frames por perfil sin ejecutar datos) lo toman solas.
4. Actualizá la tabla de cartuchos del README (que dice "cinco cartuchos"), la parte 1.2
   del tutorial y [5.4](#54-los-cinco-cartuchos). Los escenarios E2E 7 (el estante) y 19
   (los chips) recorren todos los cartuchos solos; el 19 exige además que todos los chips
   entren en la vista a 1440×900 sin scrollear.

### 9.6 Agregar una paleta

Agregá la entrada en `PALETTES` (`{ name, bg: [r, g, b], on: [r, g, b] }`) y su clave en
`PALETTE_IDS`. La tabla de colores, el selector y la validación de los ajustes guardados
salen de ahí. Si la paleta necesita un tratamiento especial como LCD (sin resplandor, con
grilla en lugar de scanlines), mirá `applyPalette`, `applyScreenMode`, `buildScanPattern` y
las reglas CSS `.crt[data-palette="lcd"]`. El escenario E2E 18 prueba el modo Píxeles puros
con una lista fija de paletas (`['ambar', 'blanco', 'lcd', 'fosforo']`): sumala ahí. Los
nombres de las paletas aparecen en el tutorial y en el README.

### 9.7 Cambiar el mapa del teclado

El mapa está repetido en varios lugares a propósito (cada uno lo muestra o lo verifica):

- `KEY_BY_CODE` (el mapa) y `PC_HINT` (la letra impresa en cada tecla del keypad) en
  `chip8-ui`;
- el diagrama `keymap-grid` y el texto oculto "Correspondencia: ..." de la ayuda, en el
  marcado;
- `PC_KEYS` en `tools/e2e.js`;
- los `@controls` de Teclado y Atrapa (que nombran letras);
- el README, la parte 1.4 del tutorial (que `tests/tutorial.test.js` compara con
  `KEY_BY_CODE`) y la §7.2 del manual.

Que ninguna tecla del mapa choque con N, H, Espacio o Retroceso.

### 9.8 Agregar una prueba

- **Del núcleo:** en el archivo que corresponda, con las ayudas de `tests/harness.js`:

  ```js
  const { describe, it } = require('node:test');
  const assert = require('node:assert/strict');
  const { makeCpu, runSteps } = require('./harness');

  describe('8XY4 ADD VX, VY', () => {
    it('VF = 1 cuando hay acarreo', () => {
      const cpu = makeCpu([0x60FF, 0x6102, 0x8014]);   // LD V0, 0xFF / LD V1, 2 / ADD V0, V1
      runSteps(cpu, 3);
      assert.equal(cpu.V[0], 0x01);
      assert.equal(cpu.V[0xF], 1);
    });
  });
  ```

  `makeCpu` acepta `{ quirks, random }` como segundo argumento. Para programas largos,
  ensamblalos con `loadAssembler().assemble(...)`.
- **De un cartucho:** en `tests/roms.test.js`, `demo(id, perfil)` crea la máquina con la
  guardia que detecta ejecución de datos, y `run(cpu, frames, ipf)` corre frames.
- **De la documentación:** respetá las marcas de [6.6](#66-pruebas-de-la-documentación)
  (`; Fragmento`, `; (fragmento de RUTA)`, `<!-- salida: CMD -->`).
- **E2E:** en `tools/e2e.js`, `scenario(n, 'título', async (ctx, s) => { ... })`. Empezá
  con `const page = await freshApp(ctx, s)`, usá `page.keyDown`, `page.press`,
  `page.click`, `page.clickAt`, `page.ev(expresión)`, `page.waitFor(...)` y `page.shot(...)`,
  y registrá cada comprobación con `s.check(ok, 'descripción', detalle)`. Agregá una línea
  a la lista del comentario del principio (la imprime `--help`).

### 9.9 Correr las pruebas E2E

```sh
node tools/e2e.js                       # todos los escenarios, sin ventana
node tools/e2e.js --only 18,19          # algunos
node tools/e2e.js --headed --verbose    # con ventana y la consola de la página
node tools/e2e.js --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
node tools/e2e.js --shots ../capturas   # dónde guardar las capturas
```

- Busca Chrome en las rutas habituales de Windows, macOS y Linux, y si no lo encuentra,
  Edge. `CHIP8_BROWSER` y `CHIP8_E2E_SHOTS` hacen lo mismo que `--browser` y `--shots`.
  Por defecto las capturas van a `chip8-e2e-shots` en el directorio temporal del sistema.
- Cada escenario abre su propia pestaña y el navegador usa un perfil temporal que se borra
  al terminar, también con Ctrl+C. Si alguna vez queda un perfil `chip8-e2e-*` en el
  directorio temporal, se puede borrar.
- Las medidas de tiempo dependen de que la máquina no esté muy cargada. El escenario 17
  mide desde el final del último tramo sin frames y reintenta hasta 4 veces, porque
  Chrome congela la pestaña solo en parte.
- No escribe nada en el repositorio: las ROMs de prueba que usa van al perfil temporal, y
  las capturas, a la carpeta de `--shots` (conviene que esté fuera del repositorio).

### 9.10 Limitaciones conocidas y trabajo futuro

- **CHIP-8 clásico únicamente.** SUPER-CHIP y XO-CHIP son perfiles de quirks, sin sus
  instrucciones ([9.4](#94-hacia-super-chip)). El audio de XO-CHIP no está.
- **El pitido** es una onda cuadrada fija de 440 Hz; no reproduce el tono del VIP mientras
  se mantiene una tecla durante `FX0A`.
- **`displayWait` aproximado:** no cuenta ciclos, así que no reproduce que un sprite grande
  tarde más.
- **iOS:** el estado `interrupted` del `AudioContext` no está manejado; tampoco se probó en
  Safari ni en Firefox.
- **El desensamblador** no refleja el quirk `shifting` (sigue mostrando VY en `SHR`/`SHL`).
- **El aviso de ROM rechazada** aparece arriba al centro y en pantallas anchas tapa unos
  segundos el botón "?" y el título del monitor.
- **A 360 px con escala 1**, la escala entera deja la imagen más chica que el tubo.
- **No hay archivo `LICENSE`**; el README dice MIT.
- **Ideas:** correr las ROMs de prueba de Timendus; mutation testing de la interfaz;
  E2E en Firefox con WebDriver BiDi; un editor con el ensamblador dentro de la página
  (`tools/chip8asm.js` ya funciona como `<script>` y define `globalThis.Chip8Asm`); puntos
  de parada en el monitor; guardar y cargar el estado de la máquina.
