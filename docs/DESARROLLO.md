# Desarrollo de la consola CHIP-8

Este documento es para quien va a mantener el proyecto: cómo está armado por dentro, por
qué se tomó cada decisión, cómo se verifica y cómo se extiende. Describe el código tal
como está en el repositorio.

- Para usar la consola, empezá por el [README](../README.md).
- Para aprender CHIP-8 programando, leé el [tutorial](TUTORIAL.md).
- Para la referencia de la máquina (instrucciones, quirks, temporización, historia, y
  SUPER-CHIP y XO-CHIP), está el [manual](MANUAL.md).

Los nombres de funciones, variables y archivos que aparecen acá existen en el código; si
cambiás alguno, buscalo también en este documento. Algunos (la API de `window.chip8`,
las claves de `Chip8Core`, las de `localStorage`, los campos de los ajustes guardados,
los atajos, las constantes y el formato de los estados guardados, y la lista de
escenarios E2E) los controla `tests/manual.test.js`
([6.6](#66-pruebas-de-la-documentación)).

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

Un emulador de CHIP-8, SUPER-CHIP y XO-CHIP que corre en el navegador desde **un solo
archivo HTML**, `chip8.html` (unos 1,5 MB y 13.400 líneas; casi la mitad del peso son las
ROMs de los 104 juegos del archivo de la comunidad, comprimidas), **sin dependencias**: no
pide nada a la red, no usa bibliotecas, fuentes ni imágenes externas, y ni siquiera
contiene una dirección `http(s)`. Se abre con doble clic (`file://`) o por HTTP. Todo lo
que ve el usuario, los mensajes de error, los comentarios y la documentación están en
castellano rioplatense (voseo); los identificadores del código, en inglés.

```
chip8.html              la consola: estilos, marcado, núcleo, ensamblador, cartuchos, el archivo (tabla y ROMs) e interfaz
roms/*.asm, *.ch8       fuentes y binarios de los seis cartuchos incluidos
roms/archivo/           las 104 ROMs del archivo de la comunidad (CC0) y su índice, LEEME.md
data/archive.json       los 104 programas del archivo de la comunidad: huella, plataforma y opciones de Octo
tools/chip8asm.js       el ensamblador en la línea de comandos y como módulo de Node: saca el bloque chip8-asm de chip8.html
tools/embed-roms.js     ensambla roms/*.asm y los incrusta en chip8.html, con los fuentes del Taller
tools/archive.js        baja el archivo de la comunidad y sus ROMs, los incrusta en chip8.html y prueba sus juegos
tools/serve.js          servidor estático mínimo (http://localhost:8008/)
tools/e2e.js            pruebas de punta a punta en Chrome o Edge, por DevTools Protocol
tests/harness.js        saca los bloques <script> de chip8.html y los evalúa en Node
tests/*.test.js         pruebas con node:test (22 archivos)
docs/MANUAL.md          manual de referencia de CHIP-8, SUPER-CHIP y XO-CHIP
docs/TUTORIAL.md        tutorial, con sus ejemplos en docs/ejemplos/
docs/DESARROLLO.md      este documento
docs/captura.png        la captura de la consola que muestra el README
package.json            scripts test, asm, roms, archive, serve y e2e; sin dependencias
.gitattributes          texto con fin de línea LF en todo el repositorio; *.ch8 como binario
.gitignore              deja afuera .claude/, la configuración local de cada máquina
```

Hace falta Node.js 22 o más nuevo para las herramientas y las pruebas (se usa `node:test`
y, en `tools/e2e.js`, el `WebSocket` global de Node 22); desde la segunda ronda se trabaja
con Node 24 (en esa ronda se comprobó que las pruebas pasan con 22 y con 24). No hace
falta que esté en el PATH ([9.10](#910-trabajar-sin-node-en-el-path)). El emulador en sí
no necesita nada: solo un navegador moderno.

### 1.2 Requisitos originales y dónde se cumplen

Estos son los requisitos del proyecto original, la consola de CHIP-8. La tabla dice dónde
está implementado cada uno y qué lo verifica. Los números de "E2E" son escenarios de
`tools/e2e.js` (la lista completa está en [6.7](#67-los-escenarios-e2e)).

| Requisito | Dónde está | Cómo se verifica |
|---|---|---|
| Las 35 instrucciones de CHIP-8 | `Chip8.prototype.step` en `chip8-core`: un `switch` por el primer nibble ([3.3](#33-buscar-decodificar-ejecutar)) | `tests/instructions.test.js` (un grupo por instrucción, 175 pruebas); el cartucho Autotest (`tests/roms.test.js`, E2E 9) |
| 4 KB de memoria | `memory = new Uint8Array(4096)` en CHIP-8 y SUPER-CHIP; toda dirección se enmascara con `_mask` (`0xFFF`) | `tests/core-api.test.js` (constantes, estado inicial); `tests/mutation-gaps.test.js` (bordes `0xFFE`/`0xFFF`) |
| Registros V0–VF, I, PC y pila | `V` (`Uint8Array(16)`), `I`, `pc`, `stack` (`Uint16Array(16)`) y `sp` ([3.2](#32-estado-de-la-máquina)) | `tests/instructions.test.js`; `tests/core-api.test.js` (desbordes de pila) |
| Timers de retardo y sonido a 60 Hz | `tickTimers()` al final de cada `runFrame`; el bucle de la interfaz llama a `runFrame` 60 veces por segundo ([4.2](#42-el-bucle-principal)) | `tests/timers-keys.test.js`; E2E 2 (60 frames por segundo reales) y 17 (pestaña oculta) |
| Pantalla de 64×32 | `display` (`Uint8Array`) y `_draw` (XOR, colisión, recorte o vuelta) | `tests/display.test.js`; E2E 6 (la pantalla coincide píxel por píxel con el núcleo en Node) y 18 |
| Fuente hexadecimal en memoria | `FONT` en `FONT_ADDR = 0x050`, copiada por `reset()`; `FX29` | `tests/core-api.test.js` (bytes exactos, en `0x050` también después de `reset`); `tests/display.test.js` (los 16 glifos); el cartucho Fuente |
| Programas cargados en `0x200` | `PROGRAM_START`, `loadRom` (hasta 3584 bytes, o 65.024 en XO-CHIP) | `tests/core-api.test.js` y `tests/platform.test.js` (los límites de cada plataforma) |
| Seis quirks, con los del COSMAC VIP por defecto | `QUIRK_PRESETS`, `DEFAULT_QUIRKS`, `setQuirks`; interruptores DIP y selector de perfil ([4.12](#412-compatibilidad-plataforma-perfil-y-quirks)) | `tests/quirks.test.js`; E2E 9 y 10 |
| Velocidad configurable en instrucciones por frame (IPF) | `runFrame(ipf)`; `setIpf` con deslizador logarítmico, campo numérico y botones (1 a 10.000, 15 por defecto) | `tests/core-api.test.js` (`runFrame`); E2E 2 y 11 |
| Cargar ROMs con un botón o arrastrándolas | `loadFile`, `loadCartridge`, `loadRomBytes`, un `input type="file"` escondido y los eventos de arrastre ([4.8](#48-carga-de-roms)) | E2E 6 |
| Teclado de la computadora mapeado y keypad en pantalla | `KEY_BY_CODE` (por `KeyboardEvent.code`), `onKeyDown`/`onKeyUp`, `buildKeypad` ([4.6](#46-teclado-keypad-y-foco)) | `tests/timers-keys.test.js` (`setKey`, `EX9E`/`EXA1`, `FX0A`); E2E 3, 4, 20 y 21 |
| Pantalla retro, nítida y escalada | `resizeScreen` (escala entera con `devicePixelRatio`), `render`, efectos de tubo y los modos Tubo CRT / Píxeles puros ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)) | E2E 15 (nitidez con escala 1,25 y 2), 18 y 24 |
| Pitido con Web Audio | `ensureAudio`, `setBeep`, `updateIndicators` ([4.7](#47-sonido)) | E2E 12 (el grafo de audio y sus ganancias; el sonido audible no, ver [6.8](#68-lo-que-no-se-verifica-automáticamente)) |
| Monitor de depuración con pausa, paso y reinicio | `updateMonitor`, `togglePause`, `stepOnce`, `frameOnce`, `doReset` y el desensamblado del monitor ([4.16](#416-el-monitor)); desde la cuarta ronda, el depurador completo ([1.5](#15-la-cuarta-ronda-features-6-y-7-el-archivo-y-los-estados-en-archivos)) | `tests/disasm.test.js`; E2E 5, 13, 14 y 22 |
| Demos originales | `roms/*.asm` → `tools/embed-roms.js` → `<script id="chip8-roms">`; estante y selector rápido ([5.4](#54-los-seis-cartuchos)) | `tests/roms.test.js`; E2E 7, 8, 9 y 19 |
| Pruebas de cada instrucción | `tests/*.test.js` con `node:test` ([6](#6-pruebas)) | `node --test` |
| Verificación en un navegador de verdad | `tools/e2e.js` ([5.7](#57-toolse2ejs)) | 77 escenarios con entrada real ([6.7](#67-los-escenarios-e2e)) |
| Manual, tutorial y documentación de desarrollo | `docs/MANUAL.md`, `docs/TUTORIAL.md` y este documento | `tests/manual.test.js` y `tests/tutorial.test.js` (ejemplos, fragmentos, textos citados y enlaces) |

### 1.3 La segunda ronda: features 1 a 5 y 9

Después del proyecto original, un análisis propuso nueve ampliaciones y el usuario
aprobó seis ([7.8](#78-segunda-ronda-el-pedido-y-el-punto-de-restauración)). Dónde quedó
cada una y qué la verifica:

| Feature | Dónde está | Cómo se verifica |
|---|---|---|
| **1. Autoconfiguración por ROM**: los juegos del archivo de la comunidad se configuran solos y cada ROM recuerda sus ajustes | `tools/archive.js` → `data/archive.json` → `<script id="chip8-archive">` ([5.5](#55-toolsarchivejs)); `Core.sha1`; en la interfaz, `archiveLookup`, `resolveConfig`, `loadCartridge`, `rememberCurrent`, `forgetRomSettings` y las banderas RPL por ROM ([4.9](#49-ajustes-por-cartucho)) | `tests/archive.test.js` (17 pruebas: la conversión de las opciones de Octo, `data/archive.json`, el bloque embebido); `tests/platform.test.js` (SHA-1 contra `node:crypto`); `tests/manual.test.js` (los números del archivo que cita el manual); `node tools/archive.js test` (103 de 104 juegos sin errores); E2E 29 (autoconfiguración, con una entrada del archivo registrada para la prueba), 30 (ajustes recordados y «Olvidar ajustes») y 31 (banderas RPL) |
| **2. Diagnóstico de plataforma**: una instrucción de otra plataforma se ignora con un aviso o detiene la máquina con un error que dice qué hace falta | `extendedInfo`, `_ignore` (`cpu.hint`), `_unsupported` (`errorInfo.kind === 'platform'`) en el núcleo ([3.7](#37-errores-avisos-y-fin-del-programa)); `checkHint`, `handleHalt` y el botón «Cambiar a … y reiniciar» en la interfaz ([4.14](#414-diagnósticos)); la carga que pasa sola a XO-CHIP ([4.8](#48-carga-de-roms)) | `tests/platform.test.js` (avisos, errores, `errorInfo`, los 65.536 opcodes de `extendedInfo`); `tests/core-api.test.js` (el mensaje de `loadRom`); `tests/manual.test.js` (el aviso y el error citados tal cual); `tests/roms.test.js` (Planos se detiene pidiendo XO-CHIP en las otras plataformas); E2E 26 (una ROM de 4000 bytes pasa sola a XO-CHIP) y 27 (aviso con «Usar SUPER-CHIP», error de plataforma con su botón en el tubo y en el monitor, FIN DEL PROGRAMA) |
| **3. SUPER-CHIP y XO-CHIP** | Las plataformas del núcleo ([3.9](#39-las-plataformas)): `PLATFORMS`, `setPlatform`, `_op00`, `_op5`, `_opF`, `_drawExt`, `_skipXO`, la fuente grande, las banderas, los planos y el audio; el ensamblador ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)); en la interfaz, el selector Plataforma, la pantalla de 128×64 con dos planos ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)), el audio por patrón ([4.7](#47-sonido)) y el monitor; el cartucho *Planos* | `tests/platform.test.js`, `tests/superchip.test.js` y `tests/xochip.test.js` (421 pruebas, contra referencias propias); `tests/asm-extendido.test.js` (95); `tests/roms.test.js` (Planos y `@platform`); `tests/manual.test.js` (una ficha por instrucción, ejemplos que corren en su plataforma); 65 errores sembrados en el código nuevo del núcleo, todos detectados ([6.5](#65-mutation-testing)); E2E 25 (cada perfil trae su plataforma; XO-CHIP en 128×64 con los cuatro colores, píxel por píxel) y 33 (Planos a 60 fps, con su patrón de sonido) |
| **4. Colores personalizados** | Paletas de cuatro colores, «Personalizada» con cuatro `input type="color"`, «Del cartucho», la mezcla de dos planos y el giro de la imagen ([4.5](#45-paletas-y-colores)) | E2E 28 («Personalizada» en vivo y guardada; «Del cartucho» aparece con el cartucho y se va con él), 25 (los cuatro colores exactos en Píxeles puros) y 29 (los colores y el giro de un juego del archivo) |
| **5. Biblioteca de cartuchos** | El estante «Tus cartuchos» y la fila «Tuyos:»: `libraryAdd`, `libraryLoad`, `libraryRemove`, `enforceLibraryLimits`, `evictLibraryItem` ([4.10](#410-tus-cartuchos-la-biblioteca)) | E2E 32 (los dos estantes, cargar, recargar, quitar, «Deshacer» y el almacenamiento roto) y 40 (el diseño con la biblioteca llena) |
| **9. Comodidades**: avance rápido, pantalla completa, captura PNG, joystick, controles reasignables, curvatura y encendido animado | Avance rápido (`TURBO_FACTOR`), `toggleFullscreen`, `screenshotCanvas`, `pollGamepads`, `KEYMAP_PRESETS` y `liveKeymap`, `buildWarpMap` (curvatura) y `playPowerOn` ([4.17](#417-comodidades)) | E2E 34 (avance rápido), 35 (captura), 36 (pantalla completa), 37 (joystick simulado), 38 (flechas y «Controles»), 39 (curvatura y encendido animado) y 40 (el diseño con «Controles» a la vista) |

Las features 6 (un taller con editor), 7 (un depurador completo) y 8 (estados guardados y
rebobinado) quedaron para más adelante. La 8 se hizo en la tercera ronda
([1.4](#14-la-tercera-ronda-feature-8)), y la 6 y la 7, en la cuarta
([1.5](#15-la-cuarta-ronda-features-6-y-7-el-archivo-y-los-estados-en-archivos)).

### 1.4 La tercera ronda: feature 8

La tercera ronda hizo la feature 8, sumó al repositorio las ROMs del archivo de la
comunidad y reconstruyó la historia de git por tareas
([7.12](#712-tercera-ronda-el-pedido-y-la-historia-de-git)):

| Feature | Dónde está | Cómo se verifica |
|---|---|---|
| **8. Estados guardados y rebobinado**: cinco ranuras por cartucho (la rápida, con I y U, y cuatro más) y volver atrás en el tiempo manteniendo B | Núcleo ([3.11](#311-estados-guardados-y-rebobinado)): `saveState`, `loadState`, `encodeState`, `decodeState`, `STATE_VERSION` y `RewindBuffer`, fuera de `step` y de `runFrame`; interfaz ([4.22](#422-estados-guardados-y-rebobinado)): el grupo «Estados» (`buildStateSlots`, `saveToSlot`, `loadFromSlot`, `deleteSlot`, `restoreSlot` y `stateStore`, en `'chip8-consola.estados'`), el rebobinado (`rewindBuf`, `rewindPush`, `rewindBack`, `rewindTick`, `setRewindEnabled`), `machineStateLoaded`, los atajos I, U y B y el botón ⏪ del bisel | `tests/estados.test.js` (105 pruebas: guardar y cargar en otra máquina sigue igual frame a frame en las tres plataformas, 54 validaciones, el formato de texto y `RewindBuffer`); `tests/manual.test.js` y `tests/tutorial.test.js` (las constantes, los atajos, el ejemplo del formato y los números que citan este documento y el tutorial); E2E 41 a 50 |
| **Las ROMs del archivo en el repositorio** (no era una feature numerada) | `roms/archivo/`, que arma `node tools/archive.js download` ([5.5](#55-toolsarchivejs)) | `tests/archive.test.js` (3 pruebas nuevas: una ROM por programa, con su huella y su tamaño; ningún archivo de más; el índice `LEEME.md` al día); `node tools/archive.js test`, ahora sin conexión |

`step` y `runFrame` no cambiaron en esa ronda (en la cuarta los tocó el depurador:
[3.12](#312-el-depurador)). La foto del rebobinado la toma la interfaz después de cada
frame, con `rewindBuf.push(cpu)`, fuera de `runFrame`.

### 1.5 La cuarta ronda: features 6 y 7, el archivo y los estados en archivos

La cuarta ronda hizo las dos features que quedaban, la 6 y la 7, y cuatro pedidos más
sobre el archivo de la comunidad y los estados guardados; antes, sacó de la historia de
git un archivo de configuración local ([7.14](#714-cuarta-ronda-el-pedido)):

| Feature | Dónde está | Cómo se verifica |
|---|---|---|
| **6. El Taller**: escribir, ensamblar y correr un programa sin salir de la consola, con los errores marcados en su renglón | El ensamblador pasó a `chip8.html`, al bloque `chip8-asm`, con `check` (todos los errores de una pasada) y `headerTags`, y `tools/chip8asm.js` lo saca de ahí ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)); los fuentes de los cartuchos y los ejemplos del tutorial en `CHIP8_SOURCES` ([5.2](#52-el-incrustador-toolsembed-romsjs)); en la interfaz, las secciones «taller: …» ([4.23](#423-el-taller)), `loadCartridge` con `origin: 'taller'` y `platform`, la tecla Y y la clave `'chip8-consola.taller'` | `tests/asm-bloque.test.js` (18 pruebas: el bloque puro, la herramienta con y sin `chip8.html`, `check` contra `assemble` también en 600 fuentes rotas al azar, `headerTags`); `tests/taller.test.js` (9: los fuentes incrustados, iguales a sus archivos y a sus `.ch8`); E2E 51 a 57 |
| **7. El depurador**: puntos de corte, paso por encima, salir, «hasta acá», la traza, el mapa de la memoria, el visor de sprites y un desensamblado que recorre toda la memoria | Núcleo ([3.12](#312-el-depurador)): el mapa de accesos `cpu.access`, la traza, el registro de dibujos, `setBreakpoint`, `runTo`, `_runFrameWatched` y el frame abierto; interfaz ([4.24](#424-el-depurador)): el monitor en cuatro pestañas, las listas con scroll propio, los botones Por encima y Salir (O y K), los puntos de corte de cada cartucho y `disasmLabel` | `tests/depurador.test.js` (41 pruebas; entre ellas, que frenar y seguir dé el mismo estado frame por frame durante 200 frames y que sin puntos de corte `runFrame` dé exactamente lo mismo); E2E 58 a 65 |
| **El archivo de la comunidad dentro de la consola**: los 104 juegos en una ventana, con búsqueda, filtros y miniaturas, cargados con un clic | Las ROMs, comprimidas de a una, al final del bloque `chip8-archive` (`CHIP8_ARCHIVE.data`, [5.5](#55-toolsarchivejs)); en la interfaz, `archiveRomBytes`, la ventana «Archivo de la comunidad» y sus miniaturas ([4.25](#425-la-ventana-del-archivo-de-la-comunidad)), la tecla L y `loadCartridge` con `origin: 'explorador'` | `tests/archive.test.js` (9 pruebas nuevas: cada ROM embebida se descomprime a los bytes de `roms/archivo/`, también con `DecompressionStream`; `embed --check` encuentra las que están mal); E2E 66 a 70 |
| **Los estados en archivos, la lista de todos y el giro en las pantallitas** (tres ideas que [9.11](#911-limitaciones-conocidas-y-trabajo-futuro) tenía anotadas) | En la interfaz ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)): «estados guardados: archivos» (el formato `chip8-consola-estados`, `parseStatesFile`, `findCartridge`, `rotatedIndex`) y «estados guardados: la lista» (las ventanas «Estados guardados» y «Ranuras ocupadas») | `tests/estados-archivos.test.js` (36 pruebas: el archivo, el mensaje de cada archivo que no sirve, lo dañado estado por estado, el giro contra una referencia propia y `findCartridge`); E2E 71 a 76 |

Las cuatro piezas se tocan en dos lugares, que se ajustaron al juntarlas
([7.17](#717-cuarta-ronda-la-integración)): el desensamblado muestra las etiquetas del
programa del Taller que está en la ranura, y la lista de estados carga los juegos del
archivo con sus ROMs embebidas. Los prueba el escenario E2E 77. `step` cambió: cada
instrucción va a la traza y marca el mapa de accesos, del orden de 1 ns más por
instrucción ([3.10](#310-rendimiento)).

### 1.6 Requisitos no funcionales

| Requisito | Cómo se cumple | Cómo se verifica |
|---|---|---|
| Un solo archivo, sin dependencias ni red | Todo va en línea, también el ensamblador y las ROMs del archivo; el ícono de la pestaña es un SVG en una URL `data:`; la tabla del archivo guarda su fuente sin `https://` ([8.23](#823-ninguna-dirección-de-red-en-chip8html)) | `tests/single-file.test.js` (sin `http(s)`, `@import` ni `src`/`href`/`url()` externos; los seis bloques bien formados); E2E 1 (sin errores ni 404) y 23 (el servidor solo recibe `/chip8.html`) |
| Funciona abierto desde el disco | Sin `fetch`, sin módulos ES, sin workers, y la huella SHA-1 en JavaScript puro ([2.6](#26-compatibilidad-con-file)); las ROMs del archivo van adentro del HTML, porque desde `file://` la página no puede leer `roms/archivo/` | E2E 1 carga la página por `file://` y por HTTP; E2E 67 carga un juego del archivo por `file://` |
| Un programa roto no rompe el emulador | La máquina se detiene con un mensaje ([3.7](#37-errores-avisos-y-fin-del-programa)) | `tests/core-api.test.js` (unos 50 opcodes inválidos, pila); `tests/platform.test.js` (errores de plataforma); E2E 14 y 22 |
| Se puede manejar solo con el teclado y con lector de pantalla | ARIA, modelo de foco, activación sin puntero ([4.20](#420-accesibilidad)); las listas del monitor y la ventana del archivo se recorren con las flechas, y las ventanas modales se quedan con el teclado ([8.45](#845-las-ventanas-modales-se-quedan-con-el-teclado)) | E2E 5, 20 y 21; desde la cuarta ronda, 57 (el Taller), 58 (puntos de corte con el teclado), 66 y 67 (la ventana del archivo) y 73 y 74 (las de los estados) |
| Pantallas chicas y táctiles | Diseño adaptable (760 y 480 px), keypad con punteros y varios dedos, el keypad al lado en pantalla completa; el Taller va debajo de los estantes por debajo de 1200 px | E2E 4, 15 y 24; 56, 63, 70 y 76 (el Taller, el monitor, la ventana del archivo y la lista de estados a 360 px) |
| Los ajustes se recuerdan | `localStorage` con validación campo por campo, en cinco claves: también los estados guardados y los programas del Taller ([4.19](#419-ajustes-guardados)) | E2E 10 (también con un `localStorage` que tira excepciones), 18, 43, 48 y 55 (sin almacenamiento, sin lugar y con datos dañados) |
| Respeta "reducir movimiento" | `@media (prefers-reduced-motion: reduce)`; sin encendido animado | E2E 16 |
| 60 frames por segundo estables | Acumulador de 60 Hz. Lo único que se reserva en cada frame es la foto del rebobinado: la pantalla, 80 bytes de registros y las páginas de memoria que cambiaron ([3.11](#311-estados-guardados-y-rebobinado)). Las miniaturas del archivo se calculan en tramos de 4 ms en el tiempo libre entre cuadros ([4.25](#425-la-ventana-del-archivo-de-la-comunidad)) | E2E 2 (entre 59,7 y 60,3 frames por segundo en las corridas registradas) y 50 (con XO-CHIP a 1000 IPF, tomando una foto por frame y rebobinando, exige entre 55 y 66 cuadros por segundo); a 10.000 IPF, 57 (escribiendo en el Taller), 65 (con un punto de corte puesto), 69 (mientras se hacen las miniaturas) y 76 (con la lista de estados abierta) |
| La plataforma CHIP-8 no se vuelve más lenta ni cambia | El camino de CHIP-8 de `step` quedó igual de corto: lo nuevo vive en funciones aparte ([3.3](#33-buscar-decodificar-ejecutar)); el depurador le suma tres escrituras en arreglos tipados y un `\|=` por instrucción, y los puntos de corte se miran solo si hay alguno ([3.12](#312-el-depurador)); la pantalla de un solo plano usa la tabla de colores de siempre | Las pruebas de CHIP-8 de la primera ronda siguen pasando (solo cambió el mensaje de `loadRom`, que ahora sugiere XO-CHIP); `tests/platform.test.js` (CHIP-8 por defecto, exactamente como antes, y el desensamblador de siempre en las 65.536 palabras); `tests/depurador.test.js` (sin puntos de corte, `runFrame` da exactamente lo mismo que con uno que nunca se alcanza); la medición de [3.10](#310-rendimiento) |

---

## 2. Arquitectura del archivo único

### 2.1 Los seis bloques

`chip8.html` tiene seis bloques con un `id` fijo, más el marcado:

```
chip8.html
├── <head>
│   ├── <link rel="icon" href="data:image/svg+xml,...">    ícono embebido: ningún pedido de red
│   └── <style id="chip8-style">     ~1440 líneas   carcasa, CRT, keypad, panel, estados, monitor, Taller, ventanas
└── <body>
    ├── <main class="desk" id="app">   ~620 líneas   consola, panel, estantes, Taller, monitor, avisos, ayuda, ventanas
    ├── <script id="chip8-core">      ~2140 líneas   núcleo puro        → globalThis.Chip8Core
    ├── <script id="chip8-asm">        ~770 líneas   ensamblador puro   → globalThis.Chip8Asm
    ├── <script id="chip8-roms">       ~115 líneas   GENERADO           → globalThis.CHIP8_DEMOS y CHIP8_SOURCES
    ├── <script id="chip8-archive">    ~220 líneas   GENERADO           → globalThis.CHIP8_ARCHIVE (y .data, las ROMs)
    └── <script id="chip8-ui">        ~8055 líneas   interfaz y bucle   → window.chip8
```

En bytes, de los 1,5 MB del archivo, unos 726.000 son las ROMs del archivo de la
comunidad (`CHIP8_ARCHIVE.data`), 397.000 la interfaz, 102.000 los fuentes del Taller
(`CHIP8_SOURCES`), 94.000 el núcleo, 84.000 los estilos, 60.000 el marcado y 35.000 el
ensamblador.

Quién usa a quién:

```
 roms/*.asm, docs/ejemplos/*.asm ──► tools/embed-roms.js ───────────────────► <script id="chip8-roms">
                                                                                        │ CHIP8_DEMOS y CHIP8_SOURCES
 data/archive.json, roms/archivo/ ──► tools/archive.js ──► <script id="chip8-archive"> ─┤ CHIP8_ARCHIVE (la tabla y las ROMs)
 <script id="chip8-asm"> ── Chip8Asm ───────────────────────────────────────────────────┤
                                                                                        ▼
 <script id="chip8-core"> ── Chip8Core ──────────────────────────────────────► <script id="chip8-ui">
          ▲                                                                             │
          │ node:vm                                                                     ├──► DOM, Canvas 2D, SVG, Web Audio, Gamepad,
     tests/harness.js (los bloques de código)                                           │    Fullscreen, localStorage, DecompressionStream
     tools/chip8asm.js (el bloque chip8-asm)                                            └──► window.chip8 (depuración y tools/e2e.js)
```

- **`chip8-core`** es el emulador y nada más: no toca el DOM, la consola del navegador ni
  ningún global salvo `globalThis.Chip8Core`. Por eso corre igual en Node. Incluye los
  estados guardados, el buffer del rebobinado y lo que usa el depurador (el mapa de
  accesos, la traza y los puntos de corte), que también son código puro. Ver
  [3](#3-el-núcleo-chip8-core).
- **`chip8-asm`** es el ensamblador, también código puro: define solo
  `globalThis.Chip8Asm`. Lo usa el Taller, y `tools/chip8asm.js` lo saca de acá para la
  línea de comandos ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)). Se edita a
  mano, como el núcleo.
- **`chip8-roms`** lo escribe `tools/embed-roms.js`: una lista de objetos con el nombre,
  la descripción, los controles, la plataforma (si no es CHIP-8) y los bytes en
  hexadecimal de cada cartucho, y después los fuentes que trae el Taller: el de cada
  cartucho y los ejemplos del tutorial. No se edita a mano. Ver
  [5.2](#52-el-incrustador-toolsembed-romsjs).
- **`chip8-archive`** lo escribe `tools/archive.js`: la fuente, la licencia, el commit del
  archivo de la comunidad y, para cada uno de sus programas, indexado por la huella SHA-1
  de su ROM, el título, los autores, el evento, el año, la plataforma, el tamaño, las IPF,
  los quirks, los cuatro colores y el giro; al final, aparte, la ROM de cada uno,
  comprimida. Tampoco se edita a mano. Ver [5.5](#55-toolsarchivejs).
- **`chip8-ui`** es todo lo demás: pantalla, keypad, controles, monitor y depurador,
  sonido, ajustes por cartucho, biblioteca, la ventana del archivo, comodidades, estados
  guardados y sus archivos, rebobinado, el Taller y el bucle principal. Solo lee
  `Chip8Core`, `Chip8Asm`, `CHIP8_DEMOS`, `CHIP8_SOURCES` y `CHIP8_ARCHIVE`. Ver
  [4](#4-la-interfaz-chip8-ui).

El núcleo y la interfaz están escritos en JavaScript de estilo ES5 (`var`, funciones y
prototipos, dentro de una IIFE con `'use strict'`). El ensamblador es la excepción: vino
tal cual de `tools/chip8asm.js`, en ES2015 (`const`, funciones flecha), que entienden
todos los navegadores donde corre la consola. Las herramientas y las pruebas usan
JavaScript moderno, porque corren en Node 22 o más nuevo.

### 2.2 Por qué un solo archivo

Era un requisito, y tiene ventajas concretas: se reparte como un solo archivo, se abre
con doble clic sin servidor, no hay nada que instalar ni compilar y no puede romperse
porque falte un recurso. El costo es que el archivo es largo y que el código del núcleo
no se puede importar como un módulo común. Eso se resuelve con la extracción de bloques
de [2.5](#25-cómo-los-tests-sacan-los-bloques): las pruebas ejecutan el mismo texto que
ejecuta el navegador, sin copias. La tabla del archivo de la comunidad sigue la misma
regla: va adentro del HTML, generada, y no se baja de ningún lado. Desde la cuarta ronda
van adentro también el ensamblador ([8.32](#832-el-ensamblador-vive-en-chip8html)) y las
ROMs de los juegos del archivo, comprimidas
([8.40](#840-las-roms-del-archivo-adentro-de-chip8html-comprimidas-de-a-una)): por eso
el archivo pasó de unos 400 KB a 1,5 MB.

### 2.3 Orden de carga

Los cinco `<script>` son clásicos (sin `type="module"`, sin `defer`) y están al final del
`<body>`, después de todo el marcado. El navegador los ejecuta en orden y de forma
sincrónica:

1. `chip8-core` define `globalThis.Chip8Core`.
2. `chip8-asm` define `globalThis.Chip8Asm`.
3. `chip8-roms` define `globalThis.CHIP8_DEMOS` y `globalThis.CHIP8_SOURCES`.
4. `chip8-archive` define `globalThis.CHIP8_ARCHIVE`, con sus ROMs en `.data`.
5. `chip8-ui` ya encuentra el DOM armado y los cinco globales. Lee los ajustes guardados,
   la biblioteca, los ajustes recordados por cartucho, los estados guardados y los
   programas del Taller; arma el keypad, el Taller, el monitor y el depurador, los
   estantes, la ventana del archivo, los controles y las ranuras de «Estados»; aplica la
   paleta, el modo de pantalla, la plataforma y el interruptor «Rebobinado»;
   carga el primer cartucho (Rebote, con sus ajustes); anuncia "Cartucho «Rebote» en
   marcha. Tocá H para ver la ayuda."; muestra el encendido animado encima de la imagen
   y arranca el bucle con `requestAnimationFrame`.

La interfaz se defiende de un orden roto: si no hay `Chip8Core` o no hay `document` (por
ejemplo, si alguien evalúa el bloque en Node), termina sin hacer nada; si `CHIP8_DEMOS`
falta o no es una lista, usa una lista vacía y muestra la pantalla de reposo
"INSERTÁ UN CARTUCHO"; descarta los cartuchos con hexadecimal inválido, vacío o que no
entran en su plataforma; y si `CHIP8_ARCHIVE` falta, simplemente no reconoce ningún juego.
Cada entrada del archivo se valida campo por campo la primera vez que se usa. Sin
`Chip8Asm` no hay Taller (ni su botón, ni la Y); sin `CHIP8_SOURCES`, el Taller trae solo
los programas tuyos; y sin `CHIP8_ARCHIVE.data`, el botón del archivo no aparece y L
avisa que la página no trae los juegos.

### 2.4 La regla del cierre de script

El analizador de HTML termina un bloque `<script>` en la primera aparición de `</script`
(sin importar mayúsculas), aunque esté dentro de un string o de un comentario de
JavaScript. Por eso **ningún bloque puede contener ese texto**. El archivo tiene
exactamente cinco, uno por bloque de código. Para eso:

- `tools/embed-roms.js` escribe los textos de los cartuchos y los fuentes del Taller con
  `JSON.stringify` y reemplaza cada `<` por `\u003c`, así una descripción o un fuente que
  contenga `</script>` (o `<!--`) queda inofensivo y se evalúa al mismo texto
  (`tests/taller.test.js` exige que el bloque no tenga ningún `<`).
- `tools/archive.js` hace lo mismo con los títulos y autores del archivo, y además
  reemplaza `>` por `\u003e`: ni un `</script` ni un comentario HTML pueden aparecer,
  aunque un título los tuviera (lo prueba `tests/archive.test.js`). Las ROMs van en
  base64url sin relleno, que no tiene `<`, `>` ni `/`: tampoco pueden formar `//`, que
  `tests/single-file.test.js` tomaría por el principio de una dirección.
- Hoy ni el núcleo, ni el ensamblador, ni la interfaz lo necesitan. Si alguna vez hace
  falta ese texto en un string, hay que partirlo en dos (`'</' + 'script>'`) o escapar la
  barra (`'<\/script>'`).
- `tests/harness.js`, `tools/chip8asm.js`, `tools/embed-roms.js` y `tools/archive.js`
  encuentran el final de cada bloque buscando el primer `</script>` después de la
  etiqueta de apertura: si la regla se rompe, el bloque extraído queda cortado y las
  pruebas fallan.

La otra regla, igual de importante: **las etiquetas de apertura tienen que quedar
exactamente así**, sin atributos de más: `<style id="chip8-style">`,
`<script id="chip8-core">`, `<script id="chip8-asm">`, `<script id="chip8-roms">`,
`<script id="chip8-archive">` y `<script id="chip8-ui">`. Las herramientas buscan esos
textos literales.

Para revisar la sintaxis de los cinco bloques de código sin abrir el navegador:

```sh
node -e "const h=require('./tests/harness');const vm=require('vm');for(const id of ['chip8-core','chip8-asm','chip8-roms','chip8-archive','chip8-ui']){new vm.Script(h.extractScript(id).code,{filename:id});}console.log('sintaxis ok')"
```

### 2.5 Cómo los tests sacan los bloques

`tests/harness.js` es el puente entre `chip8.html` y Node:

- `extractScript(id)` busca `<script id="{id}">`, toma el texto hasta el primer
  `</script>` y calcula en qué línea de `chip8.html` empieza.
- `loadCore()` evalúa `chip8-core` con `vm.Script(...).runInThisContext()`, pasando el
  nombre del archivo y ese desplazamiento de líneas: los errores y los stack traces
  apuntan a la línea real de `chip8.html`. Devuelve `globalThis.Chip8Core` y lo guarda
  para las llamadas siguientes. `tools/archive.js test` también lo usa para correr los
  juegos del archivo.
- `loadDemos()` hace lo mismo con `chip8-roms` y devuelve `CHIP8_DEMOS`, y
  `loadSources()`, los fuentes del Taller (`CHIP8_SOURCES`, del mismo bloque).
- `loadAssembler()` evalúa `chip8-asm` y devuelve `Chip8Asm`: el mismo código que usan la
  consola y `tools/chip8asm.js`. (Hasta la tercera ronda hacía `require` de la
  herramienta, donde vivía el ensamblador.)
- Además trae ayudas para escribir pruebas: `makeCpu(programa, opciones)` (acepta una
  lista de opcodes de 16 bits o un `Uint8Array`), `wordsToBytes`, `hexToBytes`,
  `runSteps`, `pixel(cpu, x, y)` (la máscara de planos del píxel, en la resolución
  actual) y `renderAscii(cpu)`, que dibuja la pantalla en su resolución con `.` (apagado),
  `#` (plano 1), `+` (plano 2) y `@` (los dos), para los mensajes de error.

`node --test` corre cada archivo `*.test.js` en su propio proceso, así que los globales que
define un bloque no se filtran de una suite a otra. `tests/harness.js` no es una prueba:
la carpeta se llama `tests/` (no `test/`) y el nombre no termina en `.test.js`, así que
`node --test` no lo ejecuta solo.

### 2.6 Compatibilidad con file://

Abierto desde el disco, el navegador trata la página con un origen restringido. Por eso
el archivo evita todo lo que ahí no anda: no hay `fetch` ni `XMLHttpRequest`, ni módulos
ES, ni workers, ni recursos externos. El ícono de la pestaña es un SVG en una URL `data:`
(sin él, Chrome pide `/favicon.ico` por HTTP y registra un 404 en la consola). La huella
de las ROMs se calcula con un SHA-1 escrito en JavaScript puro (`Core.sha1`), porque
`crypto.subtle` no está disponible en `file://` ([8.25](#825-sha-1-en-javascript-puro)).
El mapa de la curvatura y las capturas se arman con `canvas.toDataURL`, y la captura se
baja con un `<a download>` y una URL `blob:`, que también andan desde el disco; lo mismo
los archivos que bajan el Taller (`.asm` y `.ch8`) y los estados exportados (`.json`). Por
la misma razón, las ROMs de los juegos del archivo van adentro del HTML: desde `file://`
la página no puede leer `roms/archivo/`. Se descomprimen con `DecompressionStream`, que
anda sin pedir nada a la red ([4.25](#425-la-ventana-del-archivo-de-la-comunidad)).

Los ajustes, los ajustes por cartucho, la biblioteca, los estados guardados y los
programas del Taller se guardan en `localStorage`, que también funciona en `file://`; y
si el navegador no lo deja usar, cada acceso está envuelto en `try/catch` y la consola
sigue andando con lo que tiene en memoria (el estante «Tus cartuchos», el grupo «Estados»
y el Taller lo avisan). El escenario E2E 1 abre la página por HTTP y por `file://` y
exige cero excepciones y cero errores de consola en los dos casos.

---

## 3. El núcleo (chip8-core)

### 3.1 API pública

El bloque define un único global, `globalThis.Chip8Core`, con 31 claves:

| Clave | Valor |
|---|---|
| `Chip8` | El constructor de la máquina. |
| `QUIRK_PRESETS` | `{ vip, schip, xochip }`, cada uno `{ label, quirks }`. Todo congelado con `Object.freeze`. |
| `DEFAULT_QUIRKS` | Copia congelada de los quirks del VIP (un objeto distinto de `QUIRK_PRESETS.vip.quirks`). |
| `PLATFORMS` | `['chip8', 'schip', 'xochip']`, congelado: cada una incluye a las anteriores. |
| `PLATFORM_INFO` | `{ chip8, schip, xochip }`, cada una `{ label, memorySize, maxRomSize }`: `CHIP-8` y `SUPER-CHIP` con 4096 y 3584, `XO-CHIP` con 65.536 y 65.024. Congelado. |
| `PRESET_PLATFORM` | La plataforma de cada perfil: `{ vip: 'chip8', schip: 'schip', xochip: 'xochip' }`. Congelado. |
| `FONT`, `FONT_ADDR` | `Uint8Array` de 80 bytes (16 glifos de 4×5) y `0x050`. |
| `BIG_FONT`, `BIG_FONT_ADDR` | `Uint8Array` de 160 bytes (16 glifos de 8×10) y `0x0A0`. Solo se copia a la memoria en SUPER-CHIP y XO-CHIP. |
| `PROGRAM_START` | `0x200`. |
| `MEMORY_SIZE`, `MAX_ROM_SIZE` | `4096` y `3584`: los de CHIP-8, como antes (los de cada plataforma están en `PLATFORM_INFO`). |
| `DISPLAY_WIDTH`, `DISPLAY_HEIGHT` | `64` y `32`: la baja resolución. |
| `HIRES_WIDTH`, `HIRES_HEIGHT` | `128` y `64`: la alta resolución de SUPER-CHIP y XO-CHIP. |
| `STACK_SIZE` | `16`. |
| `FLAG_COUNT` | `16`: las banderas persistentes de `FX75`/`FX85`. |
| `disassemble(opcode, quirks?, platform?, nextWord?)` | Texto de una instrucción ([3.8](#38-el-desensamblador)). |
| `disassembleRange(memory, start, count, quirks?, platform?)` | Lista de `{ addr, opcode, text, size }` (y `long` en las filas de 4 bytes). |
| `extendedInfo(opcode)` | `{ needs, name }` de una instrucción de SUPER-CHIP o XO-CHIP (la plataforma mínima que la tiene y qué hace), o `null`. |
| `sha1(bytes)` | La huella SHA-1 de una ROM: 40 dígitos hexadecimales en minúscula. Acepta `Uint8Array`, listas de números o `ArrayBuffer`; un texto es un `TypeError`. |
| `patternRate(pitch)` | La velocidad del patrón de audio de XO-CHIP en bits por segundo: 4000 × 2^((pitch − 64) / 48). |
| `STATE_VERSION` | `1`: la versión del formato de los estados guardados ([3.11](#311-estados-guardados-y-rebobinado)). |
| `encodeState(estado)` | Un estado (`saveState()`) como texto JSON compacto: los arreglos en base64 y la memoria y la pantalla con las corridas de ceros comprimidas. Un estado típico ocupa de 1 a 4 KB. |
| `decodeState(texto)` | La vuelta: valida todo y tira un `Error` que empieza con "Estado inválido: " si algo no cierra. |
| `RewindBuffer({ maxEntries, maxBytes })` | El buffer del rebobinado (de fábrica, 600 fotos y 32 MB): `push(cpu)`, `pop()`, `peek()`, `clear()`, `length` y `bytes`. Guarda la memoria en páginas de 256 bytes y reusa las que no cambiaron desde la foto anterior. |
| `ACCESS` | `{ EXEC: 1, READ: 2, WRITE: 4, OPERAND: 8 }`, congelado: los bits del mapa de accesos del depurador (`cpu.access`). |
| `TRACE_SIZE`, `SPRITE_LOG_SIZE` | `1024` y `16`: las instrucciones que recuerda la traza del depurador y los `DXYN` de su registro de dibujos. |

`new Chip8({ platform, quirks, random })` acepta tres opciones: `platform` (`'chip8'` si
falta; una desconocida es un `RangeError`: "Plataforma desconocida: "x" (tiene que ser
chip8, schip o xochip)."), `quirks`, un objeto parcial que se mezcla sobre una copia de
`DEFAULT_QUIRKS`, y `random`, una función que devuelve un entero de 0 a 255 (por defecto
`Math.floor(Math.random() * 256)`; las pruebas le pasan generadores reproducibles).
Métodos:

| Método | Qué hace |
|---|---|
| `reset()` | Borra la memoria, copia la fuente a `0x050`, la fuente grande a `0x0A0` (en SUPER-CHIP y XO-CHIP) y la última ROM a `0x200`, pone `pc = 0x200` y limpia registros, pila, timers, la pantalla (en baja resolución), los planos (vuelve a `PLANE 1`), teclas, el patrón de audio y el tono (64), la espera de `FX0A`, el error, el aviso y el fin del programa. Conserva la plataforma, los quirks, `random`, la ROM y las banderas. |
| `loadRom(bytes)` | Acepta un `Uint8Array`, una lista de números o un `ArrayBuffer`. Si no entra en la plataforma tira un `RangeError`: en CHIP-8 y SUPER-CHIP, "La ROM ocupa N bytes y el máximo es 3584 (de 0x200 a 0xFFF)." y, si entraría en 64 KB, además "Con la plataforma XO-CHIP (64 KB) entra."; en XO-CHIP, "La ROM ocupa N bytes y el máximo es 65024 (de 0x200 a 0xFFFF).". Si entra, la copia (los números se truncan a 8 bits) y llama a `reset()`. |
| `setPlatform(plataforma)` | Cambia de plataforma y reinicia con la misma ROM (las banderas se conservan; la memoria se reemplaza solo si cambia de tamaño). La misma plataforma no hace nada. Si la ROM cargada no entra en la nueva, tira un `RangeError` ("La ROM cargada ocupa N bytes y con la plataforma X el máximo es M: no se cambió la plataforma.") y no cambia nada. |
| `setQuirks(parcial)` | Copia solo las seis claves conocidas, convertidas a booleanos. `null` o `undefined` no hacen nada. |
| `saveState()` | Una foto completa de la máquina: plataforma, quirks, memoria, registros, pila, timers, pantalla, planos, banderas, audio, la espera de `FX0A` y el estado detenido o terminado. Son copias: la máquina sigue sin tocarla. No incluye la ROM, las teclas ni el generador de azar. |
| `loadState(estado)` | Vuelve a una foto. Valida todo antes de cambiar nada ("Estado inválido: …"), cambia la plataforma y la memoria si hace falta, restaura los quirks, suelta las teclas y no reinicia ni toca la ROM: la máquina sigue exactamente desde ese momento. |
| `tickTimers()` | Baja DT y ST en uno, sin pasar de cero. |
| `setKey(tecla, apretada)` | Informa una tecla (se usa `tecla & 0xF`). Solo actúa si el estado cambia de verdad; resuelve `FX0A` ([3.4](#34-fx0a-apretar-y-soltar)). |
| `step()` | Ejecuta una instrucción. No toca los timers. Devuelve `true` si ejecutó algo y `false` si la máquina está detenida, esperando una tecla o si la instrucción era inválida. |
| `runFrame(ipf)` | Un frame de 60 Hz: hasta `ipf` instrucciones y un tic de los timers. Devuelve cuántas ejecutó ([3.5](#35-runframe-y-displaywait)). Con puntos de corte, puede detenerse antes de una instrucción y dejar el frame abierto ([3.12](#312-el-depurador)). |
| `setBreakpoint(dirección, on)`, `hasBreakpoint(dirección)`, `breakpoints()`, `clearBreakpoints()` | Los puntos de corte. `setBreakpoint` pone (sin `on`, o con `on` verdadero) o saca uno y devuelve si quedó puesto; una dirección que no es un entero de la memoria es un `RangeError`. `breakpoints()` las devuelve de menor a mayor. |
| `runTo(dirección, maxSp)`, `cancelRunTo()`, `runTarget()` | El objetivo de «correr hasta»: `runFrame` se detiene antes de esa dirección si la pila tiene `maxSp` niveles o menos (sin `maxSp`, a cualquier nivel). Hay uno solo; `runTarget()` lo devuelve como `{ addr, maxSp }`, o `null`. |
| `skipBreakpointOnce()` | La próxima instrucción, si es la del PC de ahora, no se detiene en su punto de corte: así se sigue desde una pausa. |
| `trace()`, `traceLength()`, `spriteLog()` | La traza (las últimas 1024 instrucciones, `[{ addr, opcode }]`, de la más vieja a la más nueva), cuántas tiene, y los últimos 16 `DXYN`, del más nuevo al más viejo. |

### 3.2 Estado de la máquina

Todo el estado es público, en propiedades comunes, para que el monitor y las pruebas lo
puedan leer (y, en las pruebas, escribir):

| Propiedad | Tipo | Qué es |
|---|---|---|
| `platform` | texto | `'chip8'`, `'schip'` o `'xochip'`. Solo lectura: se cambia con `setPlatform`. |
| `memory` | `Uint8Array(4096)` o `(65536)` | La RAM. La fuente vive en `0x050`–`0x09F`, la grande en `0x0A0`–`0x13F` (SUPER-CHIP y XO-CHIP) y el programa desde `0x200`. |
| `V` | `Uint8Array(16)` | V0 a VF. Al ser un `Uint8Array`, todo valor se trunca a 8 bits sin código extra (por eso `7XNN` no necesita máscara). |
| `I` | número | El registro índice, **de 16 bits** ([3.6](#36-i-de-16-bits-y-direcciones-de-12-o-de-16)). |
| `pc` | número | El contador de programa: 12 bits, o 16 en XO-CHIP. |
| `stack`, `sp` | `Uint16Array(16)`, número | La pila de retorno y cuántas direcciones tiene (0 a 16). |
| `delayTimer`, `soundTimer` | número | DT y ST (0 a 255). |
| `display` | `Uint8Array(displayWidth × displayHeight)` | Por filas: el píxel (x, y) está en `y * displayWidth + x`. Cada valor es una **máscara de planos**: bit 0 = plano 1, bit 1 = plano 2 (0 a 3 en XO-CHIP; 0 o 1 en las otras). **Se reemplaza** cuando cambia la resolución: hay que leer `cpu.display` cada vez, no guardarlo. |
| `displayWidth`, `displayHeight`, `hires` | números, booleano | 64×32 (`hires = false`) o 128×64. |
| `planes` | número | Los planos elegidos con `FN01` (máscara de 0 a 3; 1 al arrancar). Fuera de XO-CHIP el dibujo usa siempre el plano 1. |
| `keys` | `Uint8Array(16)` | 1 si la tecla está apretada. |
| `quirks` | objeto | Las seis banderas de esta máquina (una copia propia, no congelada). |
| `random` | función | La fuente de números al azar de `CXNN`. |
| `flags` | `Uint8Array(16)` | Las banderas RPL de `FX75`/`FX85`. Persistentes: `reset`, `loadRom` y `setPlatform` no las borran. |
| `audioPattern`, `audioPatternSet` | `Uint8Array(16)`, booleano | El patrón de audio de XO-CHIP (128 bits, el más alto primero) y si ya se ejecutó un `F002` desde el último reset. |
| `pitch`, `audioDirty` | número, booleano | El tono (64 al arrancar) y "el sonido cambió" (patrón, tono o reset): la interfaz lo vuelve a `false`. |
| `waitingForKey` | booleano | `true` mientras `FX0A` espera. |
| `halted`, `error`, `errorInfo` | booleano, texto, objeto | La máquina se detuvo, por qué, y el detalle: `{ kind, opcode, addr }`, más `needs` y `name` en un error de plataforma ([3.7](#37-errores-avisos-y-fin-del-programa)). |
| `exited` | booleano | La máquina se detuvo por `EXIT` (`00FD`): no es un error, `error` queda en `null`. |
| `hint` | objeto o `null` | La primera instrucción de pantalla de otra plataforma que se ignoró desde el último reset: `{ opcode, addr, needs, name }`. La interfaz lo lee y lo vuelve a `null`. |
| `displayDirty` | booleano | La pantalla cambió desde que la interfaz la leyó por última vez (la interfaz lo vuelve a `false`). |
| `rom` | `Uint8Array` | Copia de la última ROM cargada; `reset()` la vuelve a copiar. |
| `access` | `Uint8Array(65536)` | El mapa de accesos del depurador: por dirección, los bits de `ACCESS` (se ejecutó, se leyó, se escribió, es el operando de un `F000 NNNN`). Mide 64 KB aunque la memoria sea de 4 KB ([3.12](#312-el-depurador)). |
| `debugStop` | objeto o `null` | Dónde y por qué se detuvo la última `runFrame` antes de terminar el frame: `{ kind: 'breakpoint' \| 'target', addr }`. |

Hay campos internos: `_level` (0, 1 o 2: la posición de la plataforma en `PLATFORMS`),
`_mask` (`0xFFF` con 4 KB, `0xFFFF` con 64 KB), `_waitReg` (el registro X que recibe la
tecla de `FX0A`), `_waitKey` (la tecla elegida durante la espera, `-1` si todavía
ninguna), `_drew` (`true` si la última instrucción ejecutada fue un `DXYN`) y `_hinted`
(ya se dejó un aviso desde el último reset). Los del depurador están en
[3.12](#312-el-depurador).

`saveState()` saca una foto de todo esto, salvo lo que es de la sesión y no de la
máquina (`rom`, `keys`, `random` y `hint`), las marcas `_drew`, `displayDirty` y
`audioDirty`, y todo lo del depurador; `_level` y `_mask` salen de la plataforma
([3.11](#311-estados-guardados-y-rebobinado)).

### 3.3 Buscar, decodificar, ejecutar

`step()` sigue siempre el mismo camino:

```
si halted o waitingForKey → return false
con 4 KB (_mask = 0xFFF) o con 64 KB (_mask = 0xFFFF), con la máscara constante en cada rama:
   opcode = memory[pc] << 8 | memory[(pc + 1) & mask]       big-endian; en el último byte, el 2.º sale de 0x000
   pc = (pc + 2) & mask                                      antes de ejecutar: saltos y skips parten de acá
_drew = false
traza ← (pc << 16) | opcode;  access[pc] |= EXEC             el depurador (3.12): también la instrucción que falla
x = (opcode >> 8) & 0xF   y = (opcode >> 4) & 0xF   n = opcode & 0xF   nn = opcode & 0xFF   nnn = opcode & 0xFFF
switch (opcode >> 12)
   0x0  00E0 (en XO-CHIP borra solo los planos elegidos) / 00EE / 00C0..00FF → _op00 / el resto: SYS, se ignora
   0x3, 0x4, 0x5 (N = 0), 0x9, 0xE   los saltos condicionales: en XO-CHIP, _skipXO saltea F000 NNNN entera
   0x5 con N ≠ 0 → _op5               5XY2 SAVE y 5XY3 LOAD (XO-CHIP); las demás, inválidas
   0x8  switch (n): 0..7 y E          (las demás: inválida)
   0xD  CHIP-8: _draw (DXY0 no dibuja y deja aviso); SUPER-CHIP y XO-CHIP: _drawExt
   0xF  07 0A 15 18 1E 29 33 55 65 → acá; el resto → _opF (F000, FN01, F002, FX30, FX3A, FX75, FX85; las demás: inválida)
return true
```

Las instrucciones de SUPER-CHIP y XO-CHIP se resuelven **fuera** del `switch`, en
`_op00`, `_op5`, `_opF`, `_drawExt` y `_skipXO`, así el camino de CHIP-8 sigue igual de
corto y rápido que antes de que existieran (medido: [3.10](#310-rendimiento)). La lectura
del opcode usa máscaras constantes en cada rama y, adentro del `switch`, la máscara se lee
de `this._mask` donde hace falta: mantenerla en una variable durante todo el `switch` lo
hacía más lento.

Reglas que el código respeta en todas las instrucciones:

- **VF se escribe al final.** Las operaciones de `8XYN` leen `vx = V[x]` y `vy = V[y]`
  antes de escribir nada, calculan la bandera con esos valores y escriben VF después de
  VX. Así, con X = F el registro queda con la bandera, y con Y = F se usa el valor
  original. El quirk `vfReset` pone VF en 0 después de guardar el resultado de
  `OR`/`AND`/`XOR`. En los dibujos de SUPER-CHIP y XO-CHIP, VF es 1 o 0, como en CHIP-8.
- **Sin asignaciones de memoria** en el camino caliente: variables locales, un `switch` y
  nada más. El dibujo está aparte, en `_draw(vx, vy, n)` y `_drawExt(vx, vy, n)`. Solo
  un cambio de resolución reemplaza el arreglo de la pantalla. Lo que anota el depurador
  son escrituras en arreglos tipados que ya existen, sin objetos ni llamadas; las
  instrucciones que leen o escriben datos (`DXYN`, `FX33`, `FX55`, `FX65`, `5XY2`, `5XY3`,
  `F002` y `F000`) marcan esos bytes en `access` en el mismo recorrido que ya hacían.
- **`_draw`** (CHIP-8) toma la coordenada inicial módulo 64 y 32 (la esquina siempre da la
  vuelta), lee cada fila de `memory[(I + fila) & 0xFFF]`, saltea las filas en 0, y para
  cada píxel que se sale por la derecha o por abajo lo recorta (`clipping` activado) o lo
  hace aparecer del otro lado. VF queda en 1 si algún píxel pasó de 1 a 0. Siempre marca
  `displayDirty`, incluso con N = 0 (que no dibuja nada y deja VF en 0).
- **`_drawExt`** (SUPER-CHIP y XO-CHIP) hace lo mismo en la resolución actual y con N = 0
  dibuja 16×16 (2 bytes por fila). Cada plano elegido usa su bloque de datos: el plano 1
  desde I y el plano 2 a continuación (desde I si es el único elegido); VF = 1 si algún
  píxel encendido se apagó en cualquiera de los planos dibujados.
- **`FX0A`** no detiene el `pc`: lo deja apuntando a la instrucción siguiente y activa
  `waitingForKey`. Mientras espera, `step()` devuelve `false`.

La lista de qué hace cada instrucción, con sus casos borde, está en la
[sección 10 del manual](MANUAL.md#10-referencia-completa-de-las-35-instrucciones) y, las
de SUPER-CHIP y XO-CHIP, en la
[sección 13.11](MANUAL.md#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip).

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
- La interfaz suma todas sus fuentes de teclas (teclado, flechas, keypad, joystick, API)
  antes de llamar a `setKey`, así que el núcleo ve una sola transición por tecla
  ([4.6](#46-teclado-keypad-y-foco)).

Por qué este comportamiento y no el de "cualquier tecla apretada alcanza": ver
[8.4](#84-fx0a-espera-apretar-y-soltar) y la
[sección 7.4 del manual](MANUAL.md#74-esperar-una-tecla-fx0a).

### 3.5 runFrame y displayWait

```
runFrame(ipf):
   debugStop = null
   si hay puntos de corte, un objetivo de runTo o un frame abierto
      → return _runFrameWatched(ipf)                  (el mismo bucle, mirando cada dirección: 3.12)
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
`DXYN` por frame, y el `DXYN` es la última instrucción del frame**". Cuentan también los
dibujos de SUPER-CHIP y XO-CHIP (`DXY0` y los de alta resolución), y el `DXY0` ignorado de
CHIP-8. La consecuencia se ve en el E2E 2: Rebote, que dibuja dos veces por paso, ejecuta
unas 580 instrucciones por segundo tanto a IPF 15 como a IPF 1000, porque cada frame
termina en su `DXYN`; un bucle sin dibujo a IPF 1000 ejecuta unas 60 000. Por qué se
eligió esta forma: ver [8.6](#86-displaywait-como-el-dxyn-cierra-el-frame).

Dos consecuencias menores, documentadas y probadas: `runFrame(0)` solo hace el tic de los
timers; y el frame en el que la máquina se detiene todavía hace su tic (después, con la
máquina detenida, los timers quedan quietos). Un frame que corta un punto de corte, en
cambio, no hace su tic hasta que se completa ([3.12](#312-el-depurador)). El bucle de
siempre, sin puntos de corte, es el que cita el tutorial en su parte 8: la prueba del
tutorial lo compara con `chip8.html`.

### 3.6 I de 16 bits y direcciones de 12 (o de 16)

`I` se guarda con 16 bits (`& 0xFFFF`) en todas las plataformas: `ANNN` lo carga con 12,
pero `FX1E` y el avance de `FX55`/`FX65` (quirk `memory`) pueden llevarlo por encima de
`0xFFF`, y en XO-CHIP `F000 NNNN` lo carga con 16. **Cada acceso a memoria a través de
I**, en cambio, usa `(I + k) & _mask`: con 4 KB, `& 0xFFF` (el sprite de `DXYN`, los tres
bytes de `FX33`, los registros de `FX55`/`FX65` dan la vuelta al final de la memoria); con
los 64 KB de XO-CHIP, `& 0xFFFF` (también `5XY2`, `5XY3` y `F002`). Ejemplos que fijan las
pruebas: `FX55` con `I = 0xFFE`, X = 2 y el quirk `memory` escribe en `0xFFE`, `0xFFF` y
`0x000` y deja `I = 0x1001`; `FX1E` desde `0xFFF` sumando 1 deja `I = 0x1000`. `FX1E` no
toca VF. `FX29` pone `I = 0x050 + (VX & 0xF) * 5` y `FX30`, `I = 0x0A0 + (VX & 0xF) * 10`.

El `pc` tiene 12 bits en CHIP-8 y SUPER-CHIP y 16 en XO-CHIP, y también `BNNN`, que en
XO-CHIP puede saltar hasta `0x10FE`. `JP`, `CALL` y `LD I, NNN` siguen teniendo
direcciones de 12 bits: arriba de `0xFFF`, en XO-CHIP, solo se llega con `F000 NNNN`.

### 3.7 Errores, avisos y fin del programa

El núcleo nunca tira excepciones mientras ejecuta: un programa roto detiene la máquina.
`_fail(opcode, mensaje, kind, entry, sufijo)` hace retroceder el `pc` a la instrucción
culpable (`(pc - 2) & _mask`, correcto también en el borde de la memoria), pone
`halted = true`, arma `error` con este formato y deja el detalle en `errorInfo`:

```
Instrucción inválida o desconocida (opcode 0x5121 en la dirección 0x200).
Desbordamiento de pila (stack overflow): CALL con los 16 niveles de la pila ocupados (opcode 0x2206 en la dirección 0x206).
Subdesbordamiento de pila (stack underflow): RET sin dirección de retorno, la pila está vacía (opcode 0x00EE en la dirección 0x200).
Instrucción inválida en CHIP-8: «LD HF, V1» (fuente grande) es de SUPER-CHIP (opcode 0xF130 en la dirección 0x20A). Elegí la plataforma SUPER-CHIP.
```

El opcode va con 4 dígitos y la dirección con 3, o con 4 en XO-CHIP ("en la dirección
0x0050"). `errorInfo` es `{ kind, opcode, addr }`, con `kind` igual a `'invalid'`,
`'stackOverflow'`, `'stackUnderflow'` o `'platform'`; en un error de plataforma trae además
`needs` (la plataforma que hace falta) y `name` (qué hace la instrucción, por ejemplo
"fuente grande"). El texto de la instrucción sale del desensamblador de la plataforma que
la tiene. Qué pasa con cada opcode según la plataforma:

| Opcode | CHIP-8 | SUPER-CHIP | XO-CHIP |
|---|---|---|---|
| `00CN`, `00FB`, `00FC`, `00FD`, `00FE`, `00FF` | Se ignora, con aviso | Se ejecuta | Se ejecuta |
| `00DN` | Se ignora, con aviso | Se ignora, con aviso | Se ejecuta |
| `DXY0` | No dibuja, VF = 0, con aviso | 16×16 | 16×16 |
| `FX30`, `FX75`, `FX85` | Error de plataforma | Se ejecuta | Se ejecuta |
| `5XY2`, `5XY3`, `F000 NNNN`, `FN01` (N de 0 a 3), `F002`, `FX3A` | Error de plataforma | Error de plataforma | Se ejecuta |
| Los demás `0NNN` (salvo `00E0` y `00EE`) | `SYS`: se ignora, sin aviso | Ídem | Ídem |
| `5XYN` (N ≠ 0, 2, 3), `9XYN` (N ≠ 0), `8XY8`–`8XYD`, `8XYF`, `EXNN` salvo `9E`/`A1`, `FN01` con N > 3, `FX02` con X ≠ 0 y los demás `FXNN` | Inválida | Inválida | Inválida |
| `2NNN` con la pila llena (16) | Desbordamiento de pila | Ídem | Ídem |
| `00EE` con la pila vacía | Subdesbordamiento de pila | Ídem | Ídem |

**El aviso** (`_ignore`) es para las instrucciones de pantalla, que en CHIP-8 tienen la
forma de instrucciones que no hacen nada (`0NNN` y `DXYN` con N = 0): el programa sigue,
como en un intérprete de la época, y la primera desde el último reset queda en `hint`
(`{ opcode, addr, needs, name }`). Las demás no se pueden ignorar sin romper el programa, y
detienen la máquina (`_unsupported`). Por qué la división: ver
[8.26](#826-las-instrucciones-de-pantalla-de-otra-plataforma-se-ignoran).

**`00FD` (`EXIT`)** detiene la máquina sin error: `halted = true`, `exited = true`,
`error = null`, y el `pc` queda en el `00FD`.

Después de detenerse, `step()` devuelve `false` sin ejecutar nada (aunque se escriba una
instrucción válida en el `pc`) y `runFrame` devuelve 0, hasta que alguien llame a
`reset()`, `loadRom()`, `setPlatform()` o `loadState()`. Las únicas excepciones del
núcleo son las de argumentos inválidos: un `RangeError` si la ROM no entra (`loadRom`,
`setPlatform`, y `loadState` si no entra en la plataforma del estado), si la plataforma
no existe (el constructor, `setPlatform`, `disassemble`), si `RewindBuffer` recibe
límites inválidos o si `setBreakpoint` o `runTo` reciben una dirección fuera de la
memoria o un nivel de pila que no va de 0 a 16; un `TypeError` si `sha1` recibe un
texto; y un `Error` que empieza con
"Estado inválido: " si `loadState`, `encodeState` o `decodeState` reciben un estado que
no cierra ([3.11](#311-estados-guardados-y-rebobinado)). Un programa que se va del final
de su código ejecuta `0000` (se ignora), da la vuelta a la memoria y termina deteniéndose
en la fuente, con "opcode 0xF090 en la dirección 0x050"; el tutorial lo usa como ejemplo,
y también muestra que con SUPER-CHIP y XO-CHIP el mismo programa termina distinto. Lo que
hace la interfaz con el error: [4.14](#414-diagnósticos) y
[4.15](#415-transporte-estados-y-errores).

### 3.8 El desensamblador

`disassemble(opcode, quirks, platform, nextWord)` usa los mnemónicos de Cowgod, los mismos
que acepta el ensamblador:

| Familia | Texto |
|---|---|
| `00E0`, `00EE`, `0NNN` | `CLS`, `RET`, `SYS 0x0E1` |
| `1NNN`, `2NNN` | `JP 0x200`, `CALL 0x300` |
| `3XNN`, `4XNN`, `5XY0`, `9XY0` | `SE V1, 0x2A`, `SNE V1, 0x2A`, `SE V1, V2`, `SNE V1, V2` |
| `6XNN`, `7XNN` | `LD V1, 0x2A`, `ADD V1, 0x2A` |
| `8XY0`–`8XYE` | `LD`, `OR`, `AND`, `XOR`, `ADD`, `SUB`, `SHR`, `SUBN`, `SHL` con `V1, V2` |
| `ANNN`, `BNNN`, `CXNN` | `LD I, 0x300`, `JP V0, 0x2A0`, `RND V1, 0x0F` |
| `DXYN` | `DRW V0, V1, 5` (N en decimal; `DXY0` es `DRW V0, V1, 0`) |
| `EX9E`, `EXA1` | `SKP V1`, `SKNP V1` |
| `FX07` … `FX65` | `LD V1, DT`, `LD V1, K`, `LD DT, V1`, `LD ST, V1`, `ADD I, V1`, `LD F, V1`, `LD B, V1`, `LD [I], V1`, `LD V1, [I]` |
| SUPER-CHIP | `SCD 3`, `SCR`, `SCL`, `EXIT`, `LOW`, `HIGH`, `LD HF, V1`, `LD R, V1`, `LD V1, R` |
| XO-CHIP | `SCU 3`, `SAVE V1, V2`, `LOAD V1, V2`, `LD I, LONG 0x1234`, `PLANE 3`, `AUDIO`, `PITCH V1` |
| Cualquier palabra inválida | `DW 0x5121` |

Los números llevan `0x` y dígitos en mayúsculas: 2 dígitos para bytes, 3 para direcciones
y 4 para la dirección de `LD I, LONG`. El opcode se enmascara a 16 bits. Los argumentos
opcionales:

- `quirks`: con `quirks.jumping` activado, `BNNN` se muestra como `JP VX, 0xNNN` (con X =
  el primer dígito de NNN), que es lo que de verdad hace el salto en ese modo. Con el
  quirk `shifting` el texto de `SHR`/`SHL` no cambia (sigue mostrando VY aunque se
  ignore).
- `platform` (`'chip8'` si falta): suma los mnemónicos de esa plataforma. Una instrucción
  que no existe en la plataforma pedida se muestra como en CHIP-8: `00FF` es
  `SYS 0x0FF` en CHIP-8 y `HIGH` en SUPER-CHIP; `F130` es `DW 0xF130` en CHIP-8.
- `nextWord`: la palabra que sigue, para `F000 NNNN` en XO-CHIP. Sin ella, `F000` se
  muestra como `DW 0xF000`, así **todo texto de 2 bytes se puede volver a ensamblar**
  (se decidió en la integración, [7.11](#711-integración-y-hallazgos-notables)). `FN01` es
  `PLANE N` solo con N de 0 a 3.

El monitor le pasa `cpu.quirks` y `cpu.platform` (y, en XO-CHIP, la palabra que sigue a un
`F000`), fila por fila, y vuelve a escribir una fila cuando cambian el quirk `jumping`, la
plataforma, sus bytes o lo que el mapa de accesos sabe de ella
([4.24](#424-el-depurador)).

`disassembleRange(memory, start, count, quirks, platform)` devuelve `count` instrucciones
seguidas desde `start`, con las direcciones dando la vuelta en `0xFFF` (o en `0xFFFF` en
XO-CHIP; una palabra puede quedar partida en el borde). En XO-CHIP, `F000 NNNN` es **una
fila de 4 bytes** (`size: 4`, `long: NNNN`) y la siguiente empieza después. El monitor
lo usó hasta la tercera ronda; desde la cuarta recorre la memoria de a palabras fijas de
2 bytes, para poder ir a cualquier dirección ([4.24](#424-el-depurador)).

La propiedad más fuerte que tiene: **todo lo que produce se vuelve a ensamblar igual**.
`tests/asm.test.js` pasa las 65 536 palabras posibles por `disassemble` y por el
ensamblador y exige obtener la misma palabra; y las 4096 palabras `BNNN` también con
`{ jumping: true }`. `tests/asm-extendido.test.js` hace lo mismo en SUPER-CHIP y en
XO-CHIP, incluidas las instrucciones de 4 bytes.

### 3.9 Las plataformas

| | CHIP-8 (`chip8`) | SUPER-CHIP (`schip`) | XO-CHIP (`xochip`) |
|---|---|---|---|
| Instrucciones | las 35 | + 10 | + 7 |
| Memoria (`_mask`) | 4 KB (`0xFFF`) | 4 KB (`0xFFF`) | 64 KB (`0xFFFF`) |
| ROM más grande | 3584 bytes | 3584 bytes | 65.024 bytes |
| Pantalla | 64×32 | 64×32 y 128×64 | 64×32 y 128×64 |
| Planos | 1 | 1 | 2 (cuatro colores) |
| Fuentes | `0x050` | `0x050` y `0x0A0` | `0x050` y `0x0A0` |
| Banderas RPL | — | 16 | 16 |
| Sonido | el beep | el beep | el beep hasta el primer `F002`; después, el patrón con su tono |

En las tres, la pila tiene 16 niveles, I se guarda con 16 bits y los seis quirks valen
igual: la plataforma es independiente de los quirks. Cómo está hecho cada agregado:

- **Plataforma y memoria.** `_level` es la posición en `PLATFORMS` y cada instrucción
  extendida sabe su plataforma mínima (`EXT`, con `needs` y `level`): `extendedEntry`
  decodifica un opcode a su entrada de `EXT` y `extendedInfo` la expone. `setPlatform`
  reemplaza la memoria solo si cambia de tamaño (SUPER-CHIP y CHIP-8 comparten 4 KB).
- **Resolución.** `_setResolution(hires)` cambia el tamaño y borra la pantalla; el arreglo
  `display` se reemplaza solo si cambia de tamaño, y si no, se limpia en el lugar. `HIGH` y
  `LOW` siempre borran, aunque ya se estuviera en ese modo, y los dos planos.
- **Planos.** Cada píxel es una máscara de 2 bits. `_planeMask()` devuelve `planes & 3` en
  XO-CHIP y 1 en las demás. `00E0` (`_clearPlanes`), `_drawExt` y los desplazamientos
  actúan solo sobre los planos elegidos y dejan los otros como estaban.
- **Desplazamientos.** `_scrollRows(filas)` y `_scrollColumns(columnas)` mueven los planos
  elegidos en píxeles de la resolución actual (también en baja: píxeles enteros); lo que
  sale por un borde se pierde y lo que queda libre se apaga. `00C0` y `00D0` no hacen nada.
- **Saltos sobre `F000 NNNN`.** En XO-CHIP, los saltos condicionales llaman a
  `_skipXO(mask)`, que avanza 4 bytes si la instrucción siguiente es `F000`. (Recibe la
  máscara como argumento: con `this._mask` en las dos ramas del salto, `step` compila a
  un código más rápido; medido.)
- **Banderas.** `FX75`/`FX85` copian V0..VX a `flags` y de vuelta; X puede ir hasta F
  también en SUPER-CHIP.
- **Audio.** `F002` copia 16 bytes a `audioPattern`, marca `audioPatternSet` y, si algo
  cambió, `audioDirty`; `FX3A` cambia `pitch`. El núcleo no suena: la interfaz lee esos
  campos en cada cuadro ([4.7](#47-sonido)).
- **Huella.** `sha1(bytes)` es un SHA-1 completo en JavaScript puro, sincrónico, con
  relleno y largo de 64 bits: `tests/platform.test.js` lo compara con `node:crypto` en
  todos los largos de 0 a 300 bytes y en una ROM al azar de 3584 bytes.

La semántica de referencia es la de **Octo** ([8.18](#818-octo-como-referencia-de-super-chip-y-xo-chip)),
con algunas decisiones propias:

| Tema | Octo | Esta consola | Por qué |
|---|---|---|---|
| Profundidad de la pila | 12 niveles | 16 | Lo pide la especificación de XO-CHIP y es lo que ya tenía CHIP-8 ([8.8](#88-pila-de-16-niveles-con-error-de-desbordamiento)). |
| Dónde están las fuentes | Chica en `0x000`, grande en `0x050` | Chica en `0x050`, grande en `0x0A0` | La chica ya estaba en `0x050` ([8.7](#87-las-fuentes-en-0x050-y-0x0a0)); la grande, justo después. |
| Forma de los dígitos grandes | Los de su estilo por defecto, más cuadrados | Los de SUPER-CHIP 1.1, iguales byte a byte a las tablas de SUPER-CHIP 1.1 que traen Octo y Cadmium (las letras A a F, de Octo) | Es la fuente de la plataforma original. |
| `0NNN` | `0000` termina; los demás detienen con un aviso | No hacen nada | Como siempre en esta consola (`SYS`). |
| `FN01` con N > 3 y `FX02` con X ≠ 0 | Se aceptan (`N & 3`; `FX02` es `audio`) | Inválidas | No son instrucciones en la especificación; mejor un error claro. |
| VF después de dibujar | 0 o 1 | 0 o 1 | El SUPER-CHIP "moderno". |
| Desplazamientos en baja resolución | Píxeles enteros | Píxeles enteros | Ídem (en la HP-48 eran medios píxeles). |
| `00FE` y `00FF` | Borran la pantalla | Siempre borran | Ídem. |
| Sonido antes del primer `F002` | Silencio | El beep de 440 Hz | Los programas de CHIP-8 y SUPER-CHIP no se quedan mudos ([8.27](#827-el-beep-hasta-el-primer-f002)). |

El detalle, con las diferencias con SUPER-CHIP 1.1 en la HP-48, está en la
[sección 13.3 del manual](MANUAL.md#133-las-plataformas-de-este-emulador).

### 3.10 Rendimiento

Medido en la segunda ronda en un AMD Ryzen 5 5600GT con Node 24.18, con `tests/harness.js`:

| Carga | CHIP-8 | SUPER-CHIP | XO-CHIP |
|---|---|---|---|
| Instrucciones aritméticas, sin dibujo | 6,8 ms por millón | 6,5 ms por millón | 6,3 ms por millón |
| Una de cada cuatro es un `DRW` de 8 filas llenas | 29,5 ms por millón | 35,9 ms por millón | 32,9 ms por millón |

En la primera ronda (Intel Core i5-10400, Node 22.11) la plataforma única daba unos 7 ms
por millón sin dibujo y 38 ms con dibujo. El agente del núcleo comparó la plataforma
CHIP-8 antes y después de agregar las otras dos, en las mismas condiciones: unos 8,2 ms
por millón en los dos casos. A la velocidad máxima de la consola (IPF 10.000, 600 000
instrucciones por segundo) el núcleo usa unos 4 ms por segundo de emulación. En el
navegador, el E2E 2 mide entre 59,7 y 60,3 frames por segundo con cualquier IPF, y en las
corridas de la segunda ronda, con IPF 10.000, unas 601 900 instrucciones por segundo. Los
estados guardados de la tercera ronda no tocaron `step` ni `runFrame`; lo que cuestan las
fotos del rebobinado está en [3.11](#311-estados-guardados-y-rebobinado).

El depurador de la cuarta ronda sí tocó `step`: cada instrucción escribe la traza y marca
el mapa de accesos ([3.12](#312-el-depurador)). El agente que lo hizo midió `runFrame` a
10.000 IPF antes y después, con Node 24 (mediana de 7 corridas):

| Carga | Antes | Después |
|---|---|---|
| Un bucle de CHIP-8, 600 frames | 81 ms | 83 ms |
| Un bucle de XO-CHIP, 600 frames | 80 ms | 85 ms |
| Dibujo de XO-CHIP, un `DXYN` cada 4 instrucciones, 120 frames | 28 ms | 31 ms |
| El mismo dibujo en SUPER-CHIP | 27 ms | 31 ms |
| El mismo dibujo en CHIP-8, sin espera de vblank | 24 ms | 27 ms |
| Una mezcla con `CALL`, `RET`, `FX55` y `FX65`, 300 frames | 20,7 ms | 25,7 ms |

Es del orden de 1 ns más por instrucción: a 10.000 IPF, menos de 0,1 ms por frame. Con un
punto de corte puesto, `runFrame` pasa a un bucle que además mira una marca por
dirección: el E2E 65 mide 60 frames por segundo a 10.000 IPF, unos 10 ms de CPU por
segundo emulado.

### 3.11 Estados guardados y rebobinado

Son cuatro piezas, al final del bloque y fuera de `step` y de `runFrame`, así que el
camino caliente no cambió:

| Pieza | Qué hace |
|---|---|
| `cpu.saveState()` | Una foto completa de la máquina: un objeto común con arreglos propios. |
| `cpu.loadState(estado)` | Vuelve a una foto sin reiniciar: desde ahí la máquina sigue exactamente como habría seguido la original. |
| `encodeState(estado)`, `decodeState(texto)` | La foto como texto JSON compacto, para guardarla, y la vuelta, que valida todo. |
| `RewindBuffer` | Una pila de fotos, una por frame, que comparte las páginas de memoria que no cambiaron. |

**El estado.** `saveState()` devuelve estos campos, en este orden, y todos los arreglos son
copias nuevas (la máquina puede seguir sin tocar la foto):

| Campos | Qué guardan |
|---|---|
| `version`, `platform`, `quirks` | `STATE_VERSION` (1), la plataforma y una copia de los seis quirks. |
| `memory` | La memoria entera: 4096 bytes, o 65.536 en XO-CHIP. |
| `V`, `I`, `pc`, `stack`, `sp` | Los registros y la pila (`Uint16Array(16)`). |
| `delayTimer`, `soundTimer` | DT y ST. |
| `hires`, `displayWidth`, `displayHeight`, `display`, `planes` | La pantalla: la resolución, las máscaras de planos de cada píxel y los planos elegidos con `FN01`. |
| `flags` | Las 16 banderas RPL. |
| `audioPattern`, `audioPatternSet`, `pitch` | El sonido de XO-CHIP. |
| `waitingForKey`, `waitReg`, `waitKey` | La espera de `FX0A`: si hay una, qué registro recibe la tecla y qué tecla se apretó durante la espera y todavía no se soltó (`-1`: ninguna). |
| `halted`, `exited`, `error`, `errorInfo` | La máquina detenida por un error o terminada con `EXIT`, con su mensaje y su detalle. |
| `hinted` | Ya se avisó una instrucción ignorada desde el último reset: después de cargar el estado, no se vuelve a avisar. |

No guarda la ROM (`rom`), las teclas, `hint` ni la función `random`: son de la sesión, no
de la máquina. Por eso un estado sirve con su ROM (la interfaz los guarda por la huella de
la ROM, [4.22](#422-estados-guardados-y-rebobinado)), y después de cargarlo `CXNN` da otros
números, salvo que `random` sea determinista y se restaure aparte, como hacen las pruebas.

**Cargar.** `loadState(estado)` primero valida el estado entero con `checkState`, la misma
función que usa `encodeState`: ante cualquier problema tira un `Error` que empieza con
"Estado inválido: " y la máquina queda intacta, sin soltar siquiera las teclas (lo
comprueban las 54 validaciones de `tests/estados.test.js`). Si la ROM cargada no entra en
la plataforma del estado, tira un `RangeError` ("La ROM cargada ocupa N bytes y con la
plataforma X del estado el máximo es M: no se cargó el estado.") y tampoco cambia nada.
Después copia todo: cambia la plataforma y, si cambia de tamaño, la memoria; **pone los
quirks del estado** (los de la máquina que lo carga se pisan); reemplaza el arreglo de la
pantalla solo si cambia de tamaño, como `_setResolution`; pasa los enteros por `| 0`, así
un `-0` del JSON no queda como número con coma; borra `hint`, suelta todas las teclas, deja
`_drew` en `false` y `displayDirty` y `audioDirty` en `true`. **No reinicia ni toca
`rom`**: un `reset()` posterior vuelve a empezar la ROM del cartucho.

Las teclas son el único cabo suelto. `loadState` las suelta todas y quien llama tiene que
volver a avisar, con `setKey(k, true)`, las que siguen apretadas (la interfaz lo hace con
`resyncKeys`). Si entre ellas está `waitKey`, soltarla termina la espera de `FX0A` igual
que en la original; si no está, la espera termina cuando esa tecla se apriete y se suelte.
Las tres pruebas de `FX0A` de `tests/estados.test.js` fijan los tres casos.

**El texto.** `encodeState` arma un JSON sin espacios que empieza con
`"format":"chip8-state"` (así `decodeState` reconoce un texto que no es un estado de esta
consola) y sigue con los mismos campos:

- los números, los booleanos, `error`, `quirks` y `errorInfo` van tal cual;
- `V`, `flags` y `audioPattern` van en base64 (16 bytes cada uno), y `stack` también: 32
  bytes, cada entrada en dos, con el byte alto primero;
- `memory` y `display` van **comprimidos** y después en base64.

La compresión solo achica las rachas de ceros, que son casi toda la memoria de un programa
chico y casi toda la pantalla: cada byte distinto de cero se copia tal cual, y una racha
de N ceros seguidos (N ≥ 1) se escribe como un 0 seguido de N en base 128 (LEB128 sin
signo: 7 bits por byte, los más bajos primero, con el bit alto en 1 cuando sigue otro
byte). Por ejemplo, una memoria de CHIP-8 con un 7 en `0x200`, un 9 en `0x204` y el resto
en cero (512 ceros, el 7, 3 ceros, el 9 y 3579 ceros) queda en diez bytes:

<!-- verificar: compresion -->
```
00 80 04  07  00 03  09  00 FB 1B      512 = 80 04, 3 = 03 y 3579 = FB 1B en base 128
```

En el texto es `"memory":"AIAEBwADCQD7Gw=="`, y una pantalla de 64×32 vacía (2048 ceros:
`00 80 10`) es `"display":"AIAQ"` (`tests/manual.test.js` comprueba el ejemplo). El peor
caso son los ceros sueltos entre bytes que no son cero: cada uno ocupa dos bytes y el total
crece un 50 %. Aun así, el estado más grande posible (los 64 KB de XO-CHIP y la pantalla
de 128×64, los dos con ceros sueltos) no llega a 150.000 caracteres, debajo del tope de
200.000 con que la interfaz acepta un estado guardado (`STATE_TEXT_MAX`).

Los tamaños, en caracteres: un CHIP-8 recién creado ocupa 742 y un XO-CHIP, 955; los
cartuchos de CHIP-8 incluidos, después de 10 s con el perfil COSMAC VIP a 15 IPF, de 1344
(Rebote) a 4193 (Autotest), y *Planos*, 3037; un XO-CHIP con los 64 KB sin un solo cero,
88.011 (la memoria sola, en base64, son 87.384). `tests/manual.test.js` los vuelve a
medir.

**La validación.** `decodeState` revisa, en orden: que reciba un texto con JSON válido y
que sea un objeto; `format`, `version` y `platform`; `hires`, del que depende el tamaño de
la pantalla; el base64 de cada arreglo (estricto: solo el alfabeto estándar, un largo
múltiplo de 4 y `=` solo al final) y el largo de cada uno después de descomprimir (una
racha que se pasa, que queda cortada, de largo 0 o con más de 4 bytes en base 128 es un
error); y al final `checkState` sobre el objeto armado: cada campo presente y con su
tipo, su rango y su largo. Por ejemplo, enteros sin coma, la memoria del tamaño de la
plataforma, `hires` falso en CHIP-8, la pantalla del tamaño de su resolución con píxeles
de 0 a 1 (de 0 a 3 en XO-CHIP), `planes` en 1 fuera de XO-CHIP y un `errorInfo` con un
`kind` conocido y una dirección dentro de la memoria. Los mensajes dicen qué campo y qué
valor: "Estado inválido: memory tiene 4096 bytes y tiene que tener 65536 (la memoria de
XO-CHIP).". Los campos que no conoce se ignoran, y las claves de más de `quirks` y de
`errorInfo` se descartan. Una prueba cambia el texto al azar 400 veces: cada vez, o sale un
estado que se puede cargar, o un "Estado inválido".

**El buffer del rebobinado.** `new RewindBuffer({ maxEntries, maxBytes })` (de fábrica,
600 fotos y 32 MB; la interfaz usa 1800 y 48 MB) es una pila de fotos: `push(cpu)` agrega
una; `pop()` saca la más nueva y la devuelve como un estado completo, listo para
`loadState` (o `null` si no hay); `peek()` la devuelve sin sacarla, con arreglos propios;
`clear()` las descarta; `length` dice cuántas hay y `bytes`, cuánta memoria retienen. Si
después de un `push` hay más de `maxEntries` fotos o más de `maxBytes` bytes, se descartan
las más viejas, pero siempre queda la última. Una foto es más barata que un `saveState()`:

- La memoria va en **páginas de 256 bytes** (16 en 4 KB, 256 en 64 KB). `push` la recorre
  una sola vez, de a 4 bytes (con una vista `Int32Array` sobre el mismo buffer), y compara
  cada página con la misma página de la foto anterior: si es igual, **reusa el arreglo** de
  esa foto; si no, la copia. Las páginas guardadas no se modifican nunca, así que
  compartirlas es seguro.
- La pantalla se copia entera (2048 u 8192 bytes); V, las banderas, el patrón de audio y la
  pila van juntos en 80 bytes (`small`); los quirks, en seis bits; el resto son números y
  booleanos.
- `pop` rearma el estado completo (`snapshotState`): una memoria nueva con sus páginas, la
  pila de 16 bits y los quirks como objeto. La pantalla de la foto que sale se entrega sin
  copiarla.

**La cuenta de los bytes.** Cada foto cuenta lo que reservó: 256 por cada página nueva, la
pantalla, los 80 de `small` y 8 por cada referencia de su tabla de páginas. Cada página la
cuenta la foto **más vieja** que la usa: cuando se descarta la más vieja, las páginas que
compartía con la siguiente siguen en uso y pasan a la cuenta de la siguiente. Así `bytes`
es exacta para ese modelo (las pruebas la siguen foto por foto, también al descartar y al
mezclar `push` y `pop`), pero no incluye lo que el motor de JavaScript agrega por cada
objeto y cada arreglo, del orden de cien bytes: el uso real es algo mayor. La lista de
fotos tiene un índice de comienzo y se compacta de vez en cuando, así que descartar la más
vieja es O(1) amortizado.

Con los límites de la interfaz, medido con `tests/harness.js`:

| Programa | Bytes por foto | 30 s de rebobinado |
|---|---|---|
| Un cartucho de CHIP-8 a 15 IPF | 2258 en promedio: 2048 de pantalla, 80, 128 de tabla y alguna página | 3,9 MB |
| *Planos* (XO-CHIP, 128×64) a 1000 IPF | unos 10.400: 8192 de pantalla, 80, 2048 de tabla y alguna página | 17,8 MB |
| XO-CHIP con las 256 páginas distintas en cada frame | 69.712 en 64×32 y 75.856 en 128×64 | No entran: los 48 MB alcanzan para 721 o 663 fotos, 12 u 11 s |

**El tiempo**, en la PC de [3.10](#310-rendimiento), con la prueba de rendimiento de
`tests/estados.test.js`: un `push` tarda entre 3 y 5 µs en CHIP-8, unos 18 µs en XO-CHIP
con *Planos* y entre 125 y 140 µs en el peor caso de XO-CHIP (todas las páginas
cambiadas); un `pop` con su `loadState`, menos de 20 µs en CHIP-8 y unos 50 µs en XO-CHIP.
Un frame dura 16,67 ms. Por qué este diseño y no otro:
[8.28](#828-el-formato-de-los-estados-json-con-los-ceros-comprimidos) y
[8.29](#829-el-rebobinado-una-foto-por-frame-con-páginas-compartidas).

### 3.12 El depurador

Lo que usa el depurador de la consola ([4.24](#424-el-depurador)) vive en el núcleo, en la
sección «Depurador», después de `runFrame`. Son cuatro piezas, y ninguna es parte del
estado de la máquina:

| Pieza | Qué guarda | Cómo se lee |
|---|---|---|
| El mapa de accesos | `cpu.access`, un `Uint8Array(65536)`: por dirección, los bits de `ACCESS`. `EXEC` marca el primer byte de cada instrucción que se ejecutó (también la que falla); `READ`, lo que se leyó como dato (los sprites de `DXYN`, `FX65`, `5XY3` y el patrón de `F002`); `WRITE`, lo que se escribió (`FX55`, `FX33` y `5XY2`); `OPERAND`, los dos bytes de `NNNN` de un `F000 NNNN` ejecutado | Directamente |
| La traza | Las últimas `TRACE_SIZE` (1024) instrucciones, en un `Int32Array` circular, cada una como `(dirección << 16) \| opcode` | `cpu.trace()`, `cpu.traceLength()` |
| El registro de dibujos | Los últimos `SPRITE_LOG_SIZE` (16) `DXYN`, dos enteros cada uno: I, la posición, N, el tamaño, los planos, si chocó y si era en alta resolución | `cpu.spriteLog()` |
| Los puntos de corte y el objetivo | Una marca por dirección en un `Uint8Array(65536)` (`_stops`), con la cuenta de cuántas hay | `breakpoints()`, `hasBreakpoint()`, `runTarget()` |

**Lo que cuesta.** En `step`, la traza y la marca `EXEC` son tres escrituras en arreglos
tipados y un `|=`, sin objetos ni llamadas. Las marcas de los datos van dentro de las
instrucciones que ya recorrían esos bytes, y cada `DXYN` anota su dibujo con una llamada.
Los puntos de corte no se miran en `step` sino en `runFrame`, y solo si hay alguno: sin
puntos de corte, sin objetivo y sin un frame abierto, `runFrame` corre el bucle de
siempre, sin ninguna comprobación más ([3.10](#310-rendimiento)). Si hay, corre
`_runFrameWatched`, que antes de cada instrucción mira la marca de su dirección
([8.37](#837-el-depurador-vive-en-el-núcleo-y-no-cuesta-nada-si-no-se-usa)).

**Detenerse.** Al llegar a una dirección con un punto de corte, o al objetivo con la pila a
su nivel (`sp <= maxSp`), `runFrame` se detiene **antes** de ejecutar esa instrucción,
deja `debugStop` en `{ kind: 'breakpoint' | 'target', addr }` y borra el objetivo
(cualquier parada lo borra). Mientras `FX0A` espera una tecla no se mira nada: la
instrucción siguiente todavía no se puede ejecutar, y la máquina se detiene cuando llega
la tecla, justo antes de ella.

**El frame abierto.** Un frame que se detiene así no baja los timers: queda abierto y
recuerda cuántas instrucciones ejecutó (`_frameDone`). La próxima `runFrame` ejecuta las
que le faltaban (`ipf - _frameDone`) y recién entonces hace el tic. Así, detenerse y
seguir no cambia lo que hace el programa: entre un tic y el siguiente se ejecutan las
mismas instrucciones que sin el punto de corte (`tests/depurador.test.js` compara 200
frames, estado por estado, con y sin puntos de corte). Las instrucciones sueltas de
`step` siguen sin contar para el frame. Si mientras tanto bajan las IPF y ya no falta
nada, el frame se cierra con el tic solo ([8.38](#838-un-frame-cortado-queda-abierto)).

**Seguir.** La instrucción en la que se detuvo se ejecuta al seguir, aunque tenga un punto
de corte: el núcleo la deja pasar una vez (`_skipStop`), y la interfaz llama a
`skipBreakpointOnce()` cada vez que sigue desde una pausa, así un Paso hasta una línea con
punto de corte y después Continuar no queda trabado ahí. Si un frame termina justo antes
de una línea con punto de corte, se detiene al principio del siguiente.

**Un solo objetivo, con nivel de pila.** `runTo(dirección, maxSp)` sirve para los tres
botones de la interfaz: el paso por encima de un `CALL` en A es `runTo(A + 2, sp)`; salir
de la subrutina, `runTo(stack[sp - 1], sp - 1)`; «hasta acá», `runTo(dirección)`, a
cualquier nivel. Como mira el nivel de la pila, una subrutina recursiva que pasa otra vez
por A + 2, más adentro, no detiene la máquina.

**Qué lo borra.** `reset()` (y `loadRom` y `setPlatform`, que lo llaman) vacía el mapa, la
traza, los dibujos, el objetivo y el frame abierto: el mapa es de esa corrida. `loadState`
vacía la traza y los dibujos, que eran de otro momento, y conserva el mapa si la memoria
es del mismo tamaño (es el mismo programa). Los puntos de corte solo los cambian
`setBreakpoint` y `clearBreakpoints`; los que quedan fuera de una memoria que se achica
(de 64 KB a 4 KB) se pierden. `saveState` no guarda nada de esto: `encodeState` da el
mismo texto con y sin puntos de corte.

---

## 4. La interfaz (chip8-ui)

### 4.1 Organización del bloque

`chip8-ui` es una IIFE de unas 8050 líneas, dividida en secciones con un comentario
`// ---- nombre`. En orden: constantes, utilidades, ajustes guardados, demos incluidos,
almacenamiento, validación de lo guardado, archivo de Octo, ajustes recordados por
cartucho, biblioteca, estados guardados (el almacenamiento), referencias al DOM,
pantalla, curvatura del tubo, encendido animado, estado y mensajes, plataforma y
perfiles, carga de ROMs, control de ejecución, velocidad, quirks, teclado y keypad,
avance rápido, rebobinado, controles (flechas y joystick), joystick (Gamepad API),
pantalla completa, captura, sonido, indicadores, monitor, monitor: listas con scroll
propio, depurador (cuatro secciones: el desensamblado y los puntos de corte, la traza,
el mapa y la memoria, los sprites), estante de cartuchos, archivo de la comunidad (tres:
las ROMs, la ventana, las miniaturas), estante «Tus cartuchos», estados guardados (las
ranuras, los archivos y la lista), ayuda y arrastre, bucle principal, armado de la
interfaz, taller (siete: los programas, el texto del programa, el editor, la interfaz,
ensamblar y correr, guardar, abrir y bajar, abrir y cerrar), API de depuración y
arranque. El comentario del principio del bloque lista los puntos de extensión
(`applyProfile`, `applyPlatform`, `loadRomBytes`, `loadCartridge`, `setCartridgeColors`,
`setRotation`) y resume los estados guardados, el rebobinado y sus archivos. Los que
sumó la cuarta ronda están en los comentarios de sus secciones: `workshopSymbols` y
`disasmLabel` (las etiquetas del Taller en el desensamblado), `archiveRomBytes` (los
bytes de un juego del archivo) y `findCartridge` (los de cualquier cartucho que la
consola conozca, para la lista de estados).

Las constantes que conviene conocer:

| Constante | Valor | Para qué |
|---|---|---|
| `FRAME_MS`, `FRAME_SLACK` | 16,67 ms y el 10 % de eso | Duración de un tic de 60 Hz y tolerancia al jitter de `requestAnimationFrame`. |
| `MAX_CATCHUP` | 4 | Tics de 60 Hz como máximo por cuadro de animación. |
| `DECAY`, `FADE_FLOOR` | 150 y 12 | Persistencia: un píxel apagado conserva 150/256 de su brillo por tic; por debajo de 12 se apaga del todo. |
| `IPF_MIN`, `IPF_MAX`, `IPF_DEFAULT`, `IPF_PRESETS` | 1, 10000, 15 y `[7, 15, 30, 100, 500, 1000, 5000, 10000]` | Velocidad. |
| `DISASM_BEFORE`, `DISASM_AFTER` | 7 y 12 | Cuando el desensamblado vuelve a acomodar el PC, lo deja con 7 filas antes; la lista arranca con 20 (`DISASM_ROWS`) y después toma las que entran en la ventana. |
| `MONITOR_TABS`, `MON_ROW` | `['codigo', 'traza', 'memoria', 'sprites']` y 18 | Las pestañas del monitor (la primera, de fábrica) y el alto en px de una fila de sus listas. |
| `TRACE_LOOP_MAX` | 32 | El bucle más largo, en instrucciones, que la traza muestra agrupado. |
| `MAP_REDRAW_MS`, `STRIP_REDRAW_MS`, `SPR_REDRAW_MS` | 100, 500 y 250 ms | Mientras la máquina corre, cada cuánto se repintan, como mucho, el mapa de la memoria, la tira de páginas de XO-CHIP y el visor de sprites. |
| `BEEP_HZ`, `BEEP_LEVEL` | 440 y 0,22 | Frecuencia del pitido y ganancia máxima. |
| `TAP_MS` | 120 | Duración mínima de un toque del keypad sin puntero. |
| `STORAGE_KEY`, `ROMS_KEY`, `LIBRARY_KEY`, `STATES_KEY`, `WORKSHOP_KEY` | `'chip8-consola.ajustes'`, `'chip8-consola.cartuchos'`, `'chip8-consola.biblioteca'`, `'chip8-consola.estados'` y `'chip8-consola.taller'` | Las cinco claves de `localStorage` ([4.19](#419-ajustes-guardados)). |
| `ROMS_MAX`, `ROM_SAVE_MS`, `FLAGS_CHECK_MS` | 500, 400 ms y 1000 ms | ROMs con ajustes recordados como mucho; pausa antes de guardarlos; cada cuánto se miran las banderas RPL. |
| `LIBRARY_MAX_ITEMS`, `LIBRARY_MAX_CHARS`, `LIBRARY_PICKS` | 60, 2 500 000 y 5 | Límites de la biblioteca y cuántos van en «Tuyos:». |
| `TURBO_FACTOR` | 4 | Ticks emulados por tick real con el avance rápido. |
| `SHOT_WIDTH` | 640 | Ancho de la captura: 10× con 64×32, 5× con 128×64. |
| `PAD_DEADZONE` | 0,5 | Desde dónde la palanca del joystick cuenta como una dirección. |
| `POWER_ON_MS`, `CURVE_AMOUNT` | 700 ms y 0,07 | Duración del encendido animado; cuánto se meten las esquinas con la curvatura. |
| `STATE_SLOTS`, `STATE_TEXT_MAX` | `['rapido', '1', '2', '3', '4']` y 200.000 | Las cinco ranuras de estados de cada cartucho; el largo máximo de un estado en texto que se acepta al leer lo guardado. |
| `STATE_TAG_MS`, `STATE_TIMES_MS` | 1500 ms y 30 s | Cuánto se ve «GUARDADO» o «CARGADO» en la pantalla; cada cuánto se ponen al día los "hace 5 min" de las ranuras. |
| `REWIND_FRAMES`, `REWIND_MAX_BYTES` | 1800 y 48 MB | Lo que guarda el rebobinado como mucho: una foto por frame, 30 s, y lo que pueden retener entre todas. |
| `REWIND_STEP`, `REWIND_HOLD_MS` | 2 y 350 ms | Frames que vuelve cada tic real (por `TURBO_FACTOR` con T); en pausa, cuánto esperar después del primer frame antes de seguir rebobinando. |
| `STATES_FILE_FORMAT`, `STATES_FILE_VERSION`, `STATES_FILE_MAX` | `'chip8-consola-estados'`, 1 y 16 MB | El formato de los archivos de estados ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)) y lo más grande que se importa. |
| `THUMB_FILE_WIDTH` | 128 | El ancho, antes de girarla, de la pantallita que va en los archivos de estados. |
| `EXPLORER_THUMB_FRAMES`, `EXPLORER_SLICE_MS` | 240 y 4 ms | Los frames que corre cada miniatura de la ventana del archivo (4 s) y lo más que trabaja por vez, entre cuadro y cuadro. |
| `WS_SOURCE_MAX`, `WS_PROGRAMS_MAX`, `WS_NAME_MAX` | 400.000, 100 y 60 | Los límites del Taller: caracteres de un programa, programas tuyos y largo de un nombre. |
| `WS_DRAFT_MS`, `WS_CHECK_MS` | 700 ms y 400 ms | Cuánto espera el Taller, después de la última tecla, para anotar lo que cambió y para volver a revisar los errores. |
| `WS_TAB`, `WS_LINE_PX`, `WS_PAD_PX` | 8, 20 y 8 | La columna a la que lleva Tab (múltiplo de 8), y el alto de renglón y el margen de arriba del editor, en px, que tienen que coincidir con el CSS. |
| `KEY_BY_CODE`, `KEYPAD_LAYOUT`, `PC_HINT` | | Mapa del teclado, orden del keypad en pantalla y la letra que se imprime en cada tecla. |
| `KEYMAP_PRESETS`, `ARROW_SLOT` | | Los mapas de «Controles» y qué flecha va a qué dirección. |
| `QUIRK_INFO`, `PALETTES`, `SCREEN_MODES`, `PLATFORM_DESC` | | Textos de los quirks, paletas, modos de pantalla y la descripción de cada plataforma. |

El estado de la interfaz está en `settings` (lo que se guarda, ver
[4.19](#419-ajustes-guardados): **tus últimas elecciones explícitas**) y `state`
(`romLoaded`, `romName`, `romSize`, `demoId`, `romSha`, `romSource`, `romArchive`,
`paused`, `errorShown`, `instr`, `pausedBeforeHalt` y `hintShown`). Lo que corre **ahora**
puede ser distinto de `settings`, porque cada cartucho trae sus ajustes: está en
`cpu.platform`, `cpu.quirks`, `liveIpf`, `activePalette`, `rotation` y `liveKeymap`. Hay
una sola instancia de la máquina, `cpu`, creada con la plataforma y los quirks guardados.
Los estados guardados viven en `stateStore` y el rebobinado en `rewindBuf` (el
`Core.RewindBuffer`) y `rewind` (qué lo mantiene apretado y en qué anda):
[4.22](#422-estados-guardados-y-rebobinado). Las piezas de la cuarta ronda tienen su
propio estado: `ws` y `wsStore`, el Taller ([4.23](#423-el-taller)); `mon`, `dis`, `dbg`,
`map`, `memv` y `spr`, el monitor y el depurador ([4.24](#424-el-depurador)); `explorer`,
la ventana del archivo ([4.25](#425-la-ventana-del-archivo-de-la-comunidad)).

### 4.2 El bucle principal

```
loop(now), llamado por requestAnimationFrame en cada refresco del monitor (60, 120, 144 Hz…):
   dt = now - lastTime
   si dt < 0 o dt > 250 ms → dt = 16,67 ms           (la pestaña estuvo oculta: se descarta el atraso)
   si hay joysticks → pollGamepads()                 (antes de correr: lo apretado vale para los ticks de este cuadro)
   si está rebobinando y pasó la espera de REWIND_HOLD_MS:
      la máquina no corre (acc = 0); rewind.acc += dt
      mientras rewind.acc ≥ 16,67 − 1,67 ms y ticks < MAX_CATCHUP (4):
         rewindTick():  rewindBack(REWIND_STEP, ×TURBO_FACTOR con T) y syncDisplay(true)
         rewind.acc −= 16,67 ms
   si no, si la máquina corre (hay ROM, no está en pausa ni detenida):
      acc += dt
      burst = avance rápido apretado ? TURBO_FACTOR (4) : 1
      mientras acc ≥ 16,67 − 1,67 ms y ticks < MAX_CATCHUP (4):
         burst veces, mientras corra:
            tick():  state.instr += cpu.runFrame(liveIpf)
                     si ST > 0 → soundSeen               (un beep corto suena aunque pasen varios ticks)
                     si cpu.debugStop → handleDebugStop() (un punto de corte: en pausa, con el frame abierto)
                     si no → rewindPush()                (la foto de este frame, para el rebobinado)
                     syncDisplay(true)                   (pasa la pantalla a los buffers de brillo)
                     si cpu.halted → handleHalt()
         acc −= 16,67 ms
      si acc ≥ 16,67 ms → acc = 0                    (no vale la pena ponerse al día)
   si no corre y la estela todavía se está apagando:
      fadeAcc a 60 Hz → syncDisplay(true), hasta que la imagen sea exactamente el framebuffer
   si corre y pasó FLAGS_CHECK_MS → syncFlags()      (las banderas RPL de la ROM, si cambiaron)
   si cambió la resolución → updateLevels(false)
   si needsRender → render()
   updateIndicators()                                (LEDs, PAUSA / ESPERANDO TECLA / ×4, el beep)
   si cpu.hint → checkHint()                         (el aviso de una instrucción de otra plataforma)
   syncAudioSource()                                 (el beep o el patrón de XO-CHIP; nada mientras se rebobina)
   updateMonitor(false)                              (solo si está abierto, visible y en pantalla; solo su pestaña)
   updateRewindInfo(false)                           («Podés volver hasta N s.», solo si cambió el número)
```

- Con un acumulador y pasos fijos, la emulación va a 60 frames por segundo en un monitor
  de 60 Hz, de 144 Hz o de 30 Hz. La simulación que hizo la revisión de la primera ronda
  dio exactamente 60,00 tics por segundo entre 30 y 240 Hz; el límite de 4 tics por
  cuadro solo frena la emulación por debajo de unos 15 cuadros por segundo.
- **Avance rápido.** Cada tic real corre 4 tics emulados completos, con sus timers: el
  programa ve la misma secuencia de frames, más rápido. El tope sigue siendo de 4 tics
  reales por cuadro y el atraso se descarta igual, así que al soltar no queda nada por
  recuperar ([4.17](#417-comodidades)).
- **Rebobinado.** Mientras se rebobina, la máquina no corre: cada tic real de 60 Hz vuelve
  `REWIND_STEP` (2) frames, o 8 con T, con el mismo tope de 4 tics por cuadro. Cada tic de
  emulación deja su foto, también con el avance rápido (cuatro por tic real) y mientras
  `FX0A` espera una tecla ([4.22](#422-estados-guardados-y-rebobinado)).
- **Pestaña oculta.** Con la pestaña oculta el navegador no llama a
  `requestAnimationFrame`, así que la emulación se congela sola. Al volver no hay una
  ráfaga para ponerse al día: `visibilitychange` suelta todas las teclas (también las del
  joystick, el avance rápido y el rebobinado), apaga el pitido, guarda las banderas y los
  ajustes pendientes y reinicia `lastTime` y `acc`, y además cualquier `dt` de más de
  250 ms se descarta. El E2E 17 lo mide con una pestaña oculta y con una congelada: 0 frames
  mientras tanto, y después 15 frames en 0,25 s y 60 en 1 s.
- `setPaused`, la carga o el reinicio de una ROM y el final de un rebobinado ponen `acc`
  en 0, para que continuar no ejecute frames atrasados.

### 4.3 La pantalla: de cpu.display al lienzo

```
cpu.display  (máscara de planos 0..3 por píxel; 64×32 o 128×64)
   │  updateLevels(decay): cada plano por su cuenta: encendido → 255; apagado → brillo·150/256 (< 12 → 0)
   ▼
levels1, levels2  (Uint8Array(128·64) cada uno: el brillo de cada píxel en el plano 1 y en el 2)
   │  si no hay nada del plano 2: lut[brillo1]                    256 colores: fondo → plano 1 (curva ^1,35)
   │  si hay algo del plano 2:    lut2[brillo1 << 8 | brillo2]    65 536 colores: mezcla bilineal de los cuatro
   ▼
frame32 → ImageData (fbW × fbH, una por tamaño) → frameCanvas (lienzo fuera de pantalla)
   │  drawImage estirado ×N con imageSmoothingEnabled = false, con el giro (setRotationTransform)
   ▼
#screen  (vw·N × vh·N píxeles físicos)  +  scanlines (solo en Tubo CRT)  +  filtro de la curvatura (si está prendida)
   │  el mismo cuadro, con el mismo giro
   ▼
#glow  (vw × vh, estirado por CSS, con blur, mix-blend-mode: screen y opacidad 0,6)
```

- **Buffers de brillo, uno por plano.** `levels1` y `levels2` guardan el brillo de cada
  píxel en cada plano, y cada plano se apaga por su cuenta. Un píxel encendido siempre
  vale 255, así que la imagen nunca muestra menos de lo que hay en el framebuffer. Con
  persistencia, un píxel que se apaga baja a 149, 87, 50, 29, 16 y se apaga en el sexto
  tic (unos 100 ms): eso disimula el parpadeo típico de CHIP-8, que borra y redibuja con
  XOR. Sin persistencia, o en modo Píxeles puros, pasa directo a 0.
- **Dos tablas de colores.** `buildLut(paleta)` interpola los 256 niveles entre el fondo y
  el plano 1 con una curva de potencia 1,35 y los empaqueta como `Uint32` según el orden
  de bytes de la máquina (`LITTLE_ENDIAN`), así el paso por píxel es una sola asignación.
  `buildLut2(paleta)` arma, recién cuando hace falta, la tabla de dos planos: la mezcla
  bilineal fondo·(1−a)(1−b) + plano1·a(1−b) + plano2·(1−a)b + ambos·ab, con la misma
  corrección. Se calcula primero a lo largo del plano 1, así con b = 0 da exactamente lo
  mismo que la tabla de un plano. Mientras el plano 2 no tiene nada (`plane2Lit`), se usa
  la tabla de un plano: **los programas de CHIP-8 se ven exactamente como antes**.
- **El tamaño de la imagen.** `setFrameSize(w, h)` rearma la imagen, la capa del
  resplandor, la escala y las scanlines cuando cambia la resolución (o al pasar de la
  pantalla de reposo, siempre de 64×32, a la del núcleo); hay una `ImageData` por tamaño,
  así dibujar un frame no reserva memoria. El bucle mira la resolución en cada cuadro,
  porque `cpu.display` se reemplaza al cambiarla.
- **Cuándo se dibuja.** `syncDisplay` solo recalcula los brillos si el núcleo marcó
  `displayDirty`, si todavía hay píxeles apagándose (`fading`) o si cambió la
  resolución, y `render()` solo corre si algo cambió (`needsRender`). Paso (`stepOnce`)
  usa `syncDisplay(false)`: la imagen queda exacta, sin estela. En pausa, la estela que
  quedó se sigue apagando a 60 Hz hasta coincidir con el framebuffer.
- **Escala entera.** `resizeScreen()` elige el mayor entero N tal que la imagen (ya girada,
  si hay giro) entre en el 94 % del ancho y el 90 % del alto del tubo, contados en
  píxeles **físicos** (`rect.width * devicePixelRatio`). El lienzo mide exactamente
  N veces la imagen en píxeles físicos y su tamaño CSS es eso dividido por
  `devicePixelRatio`, así cada píxel CHIP-8 ocupa N×N píxeles de la pantalla sin
  interpolar, aun con escalas fraccionarias como 1,25. Se recalcula con un
  `ResizeObserver` sobre el tubo, con `resize` y al entrar o salir de la pantalla
  completa. El E2E 15 lo mide: con escala 1,25 el lienzo es de 768×384 (12 píxeles
  físicos por píxel), con 2 es de 1216×608 (19).
- **Giro.** `setRotation(grados)` (0, 90, 180 o 270, en sentido horario) gira el lienzo y
  el resplandor con una transformación del contexto; con 90 o 270 la imagen queda
  vertical (y en pantalla completa el tubo se para, con `is-tall`). Lo usan los juegos
  del archivo pensados para una pantalla girada; no tiene un control propio en la
  consola.
- **Scanlines.** `buildScanPattern(N)` arma un patrón de 1×N con una franja oscura de
  `round(N · 0,3)` píxeles abajo y un brillo de 1 píxel arriba, alineado con las filas;
  solo si N ≥ 3. Con la paleta LCD es una grilla de píxeles; sobre un fondo claro, más
  suave.
- **Resplandor.** `#glow` recibe el mismo cuadro y lo estira el CSS con
  `filter: blur(...)` (el radio depende de la escala) y `mix-blend-mode: screen`. Se
  apaga con la paleta LCD, con un fondo más claro que el píxel y en Píxeles puros.
- **Pantalla de reposo.** Sin cartucho, la imagen es `idleBitmap`: "INSERTÁ UN CARTUCHO"
  con una fuente propia de 3×5 dentro de un marco punteado, siempre de 64×32.
- **`screenColors()`** (en `window.chip8`) devuelve los colores distintos que hay en el
  lienzo: lo usan las pruebas E2E para comprobar paletas y planos.

### 4.4 Modos de pantalla y efectos del tubo

`applyScreenMode(modo)` cambia entre los dos valores de `SCREEN_MODES`:

| | Tubo CRT (`'crt'`, de fábrica) | Píxeles puros (`'puro'`) |
|---|---|---|
| Colores en pantalla | Los niveles de las tablas | Exactamente los de la paleta: dos con un plano, hasta cuatro con dos |
| Persistencia (estela) | Si el interruptor Persistencia está prendido | Nunca |
| Scanlines | Si el interruptor Scanlines está prendido | Nunca |
| Curvatura | Si el interruptor Curvatura está prendido (y el navegador puede) | Nunca |
| Encendido animado | Si el interruptor está prendido | Nunca |
| Resplandor, viñeta y reflejo | Sí | No: `.crt[data-mode="puro"]` los oculta con CSS |
| Interruptores de efectos | Habilitados | Deshabilitados, pero conservan su preferencia (`aria-pressed`) |

El selector es un `role="radiogroup"` (`#screen-mode`) con dos botones `role="radio"`,
`aria-checked` y `tabindex` itinerante: el que está marcado recibe el foco con Tab y las
flechas cambian de modo. Al pasar a Píxeles puros se llama a `updateLevels(false)` para
borrar la estela que hubiera y se corta el encendido. El modo se guarda en
`settings.screenMode` y se lee y cambia desde `window.chip8.getScreenMode()` y
`setScreenMode(modo)`.

**Curvatura.** Un filtro SVG en el bisel (`#crt-warp`: `feImage` + `feDisplacementMap` +
un `feGaussianBlur` de menos de un píxel que suaviza los escalones) curva el lienzo y el
resplandor con el mismo mapa. El mapa es un PNG en `data:` que arma `buildWarpMap` para
la forma de la imagen (2:1, o 1:2 girada): en cada punto, cuánto correr la muestra (rojo:
x; verde: y; 128 = nada), así las esquinas se meten (`CURVE_AMOUNT`, el 7 % del lado más
largo) y los bordes se arquean. Se rearma solo si cambia la forma. `curveSupported`
comprueba que el navegador tenga los filtros y los acepte sobre la página; si no, el
interruptor queda deshabilitado con una explicación. Viene **apagada**
([8.22](#822-la-curvatura-viene-apagada)) y las capturas salen siempre planas.

**Encendido animado.** Al abrir la página, `playPowerOn()` muestra una capa encima del
tubo (`#crt-power`, unos 0,7 s): una línea brillante que se abre. Es solo una capa: el
programa ya está corriendo debajo. No aparece en Píxeles puros ni con
`prefers-reduced-motion: reduce`; prender el interruptor la muestra una vez; un
temporizador la saca si no llega `animationend`.

### 4.5 Paletas y colores

Cada paleta tiene **cuatro colores**: `bg` (el fondo), `on` (el plano 1, el píxel de
siempre), `p2` (el plano 2) y `both` (los dos planos). `PALETTES` define cuatro: Verde
fósforo (`fosforo`, la de fábrica), Ámbar, Blanco y LCD. Sus cuatro colores forman una
escalera de brillo (fondo < ambos < plano 2 < plano 1, como la paleta de Octo, donde
«ambos» es el color del contorno), con un contraste de al menos 1,8:1 entre vecinos; la
LCD usa los verdes de la Game Boy y, para «ambos», un oliva.

Además hay dos paletas especiales:

- **«Personalizada»** (`'custom'`): los cuatro colores de `settings.customColors`, que se
  eligen con cuatro `input type="color"` (Fondo, Píxel / plano 1, Plano 2 y Ambos planos)
  que aparecen solo con esa paleta. Los cambios se ven en vivo (`input`) y se guardan al
  confirmar (`change`).
- **«Del cartucho»** (`'cartucho'`): los colores del cartucho cargado, si los trae (los
  juegos del archivo). `setCartridgeColors(colores | null)` agrega o quita la opción del
  selector; si estaba elegida y el cartucho se va, vuelve la paleta de la persona.

`applyPalette(id)` aplica una paleta (arma las tablas, decide `lightScreen` comparando la
luminancia del fondo y del píxel, y con eso el resplandor y las scanlines) sin tocar
`settings.palette`; `choosePalette(id)` es la elección de la persona: queda en `settings`
(salvo «Del cartucho», que nunca se guarda ahí) y, con «Ajustes por cartucho», en los
ajustes de la ROM. Así, `activePalette` (la que se ve) puede ser la del cartucho mientras
`settings.palette` sigue siendo la tuya.

### 4.6 Teclado, keypad y foco

**El mapa.** `KEY_BY_CODE` usa `KeyboardEvent.code`, la posición física de la tecla, así
que el bloque 1-4 / Q-R / A-F / Z-V es el mismo en QWERTY, AZERTY o Dvorak:

```
   Tu teclado            Keypad del COSMAC VIP
   1  2  3  4             1  2  3  C
   Q  W  E  R     ──►     4  5  6  D
   A  S  D  F             7  8  9  E
   Z  X  C  V             A  0  B  F
```

**Atajos.** Espacio (pausa o continúa), N (un paso; se repite si se mantiene), O (paso por
encima de un `CALL`), K (salir de la subrutina), Retroceso (reiniciar), H (abrir o cerrar
la ayuda), L (abrir o cerrar la ventana del archivo de la comunidad), T (avance rápido,
mientras se mantiene), P (pantalla completa, si el navegador la tiene), G (captura), Y
(abrir o cerrar el Taller), I (guardar el estado en la ranura rápida), U (cargar la
ranura rápida), B (rebobinar, mientras se mantiene) y Esc (cerrar diálogos y la capa de
arrastre). Las **flechas** aprietan las teclas del keypad del mapa de «Controles»
(`liveKeymap`). Ninguno choca con las 16 teclas.

**Todas las fuentes de teclas se suman.** El keypad se puede tocar con el teclado físico,
con las flechas, con el mouse o los dedos, con Enter o Espacio sobre una tecla enfocada,
con un clic sin puntero (lector de pantalla, control por voz), con un joystick y desde
`window.chip8.pressKey`. Cada fuente lleva su propia cuenta (`heldCodes`, `arrowKeys`,
`pointerKeys`, `enterHeld`, `apiHeld`, las sueltas programadas de `timedReleases` y la
máscara `gamepad.held`) y todas pasan por `keyDown(k)`/`keyUp(k)`, que mantienen un
contador por tecla (`holdCount`). El núcleo recibe `setKey` solo cuando el contador pasa
de 0 a 1 o de 1 a 0: soltar el mouse no suelta una tecla que el teclado sigue apretando.

```
teclado físico (onKeyDown / onKeyUp) ────────┐
flechas (arrowKeys, con liveKeymap) ─────────┤
keypad con puntero (captura, varios dedos) ──┤
keypad: Enter o Espacio sobre la tecla ──────┼──► holdCount[k] ──► cpu.setKey(k, …) solo en 0 ↔ 1
keypad: clic sin puntero (toque de 120 ms) ──┤
joystick (setGamepadKeys, con liveKeymap) ───┤
window.chip8.pressKey / releaseKey ──────────┘
```

- Una flecha recuerda qué tecla apretó (`arrowKeys`): si el mapa cambia mientras está
  apretada, al soltarla se suelta la misma.
- `releaseAllKeys()` suelta todo (y cancela las sueltas programadas, el joystick, el
  avance rápido y el rebobinado) cuando la ventana pierde el foco, cuando cambia la
  visibilidad y al abrir la ayuda, el Taller, la ventana del archivo o la lista de
  estados.
- `reset()` y `loadState()` del núcleo limpian las teclas; `resyncKeys()` vuelve a
  informar las que siguen apretadas después de un reinicio, un cambio de plataforma, la
  carga de una ROM o la de un estado (también en cada paso del rebobinado).

**`onKeyDown`**, registrado en `window`:

1. Habilita el audio (es un gesto del usuario).
2. Si hay Ctrl, Meta o Alt, no hace nada: los atajos del navegador siguen andando.
3. Si el foco está en un campo de texto (`isTypingTarget`: `textarea`, `contenteditable`
   o un `input` que no sea `range`, `checkbox`, `radio`, `button`, `file` ni `color`), no
   hace nada. Así se puede escribir en el campo de IPF, en el editor y el nombre del
   Taller, en la búsqueda del archivo y en los «Ir a» del monitor.
4. Con la lista de estados o la pregunta de las ranuras ocupadas abierta, no hace nada:
   el teclado es de la ventana ([8.45](#845-las-ventanas-modales-se-quedan-con-el-teclado)).
5. Con la ayuda abierta, solo H (la cierra); Esc lo maneja el `<dialog>`. Con la ventana
   del archivo abierta, solo L (la cierra): las flechas, Enter y Esc son de la ventana.
6. Las 16 teclas mapeadas van al emulador con `preventDefault`, **aunque haya un control
   enfocado**, incluido un `<select>`: el `preventDefault` evita que la letra cambie la
   opción del selector. La repetición automática se filtra con `heldCodes`.
7. Las flechas van al keypad, salvo que el foco esté en un control que las usa
   (`usesArrows`: un `<select>`, un deslizador o un `role` como `radio`, `slider`,
   `listbox` o `tab`: las listas y las pestañas del monitor).
8. Espacio: si el foco está en un control (`isControl`: botón, `select`, `summary`,
   enlace, checkbox, radio, `input type="color"` o un `role` de control), se deja la
   activación nativa; si no, pausa o continúa.
9. N, O, K, Retroceso, H, L, T, P, G, Y, I, U, B y Esc hacen su atajo desde cualquier
   control que no sea de texto. Los que actúan una vez (Espacio, O, K, Retroceso, H, L,
   P, G, Y, I y U) no se repiten si la tecla queda apretada; N sí, un paso por
   repetición; T y B duran mientras se mantienen y se sueltan en `onKeyUp`.

El Taller maneja además sus propias teclas, adentro de su sección: Tab y Mayús+Tab en el
editor, Ctrl+Enter en todo el Taller y Esc ([4.23](#423-el-taller)).

**El modelo de foco.** Un clic con el mouse o el dedo en un botón, un chip, un interruptor,
un radio o un enlace le saca el foco (`onPointerClick`, en `document`, cuando
`event.detail > 0`). Así, para quien usa el mouse, Espacio siempre pausa y las letras
siempre son el keypad. Si el foco llegó con Tab, se queda, y Espacio o Enter activan el
control como en cualquier página. Los `<select>` (Paleta, Perfil, Plataforma, Controles y
los seis del mapa personalizado) sueltan el foco apenas cambian con el mouse
(`returnFocusAfterChange`); si el cambio vino de una tecla sobre el selector (flechas,
Inicio, Fin), el foco se queda para poder seguir navegando. Los `input type="color"` hacen
lo mismo según cómo se abrió su selector (`returnFocusAfterPick`). Si la ayuda se abrió
con el mouse, al cerrarla el foco no vuelve al botón "?". Los detalles y el porqué:
[8.12](#812-el-modelo-de-foco).

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

### 4.7 Sonido

```
OscillatorNode (square, 440 Hz, arranca una vez y no se detiene) ───┐   el beep, hasta el primer F002
AudioBufferSourceNode en bucle (un período del patrón de XO-CHIP) ──┴─► GainNode "gain"   (0 o 1: rampa de 4 ms)
                                                                     → GainNode "master" (volumen × 0,22, rampa de 10 ms)
                                                                     → destination
```

- **Contexto perezoso.** Los navegadores no dejan sonar nada antes de un gesto del
  usuario, así que `ensureAudio()` crea el `AudioContext` en el primer `pointerdown`,
  `pointerup`, `touchend`, `click` (escuchados en fase de captura) o tecla, y lo reanuda si
  está suspendido en los gestos siguientes. En pantallas táctiles `pointerdown` no cuenta
  como activación, por eso se escuchan también `pointerup` y `touchend`.
- **Cuándo suena.** `updateIndicators()` prende la envolvente (`gain`) si la máquina
  corre, ST > 0 en algún tic de ese cuadro (`soundSeen`, para que un pitido corto suene
  aunque el avance rápido corra varios tics por cuadro), la pestaña está visible, no está
  en silencio y no se está rebobinando. Las rampas de `setTargetAtTime` evitan los
  chasquidos. En pausa, detenida, oculta o rebobinando, no suena. El LED SONIDO se prende
  cuando corresponde pitar **aunque esté en silencio**, como aviso visual.
- **El patrón de XO-CHIP.** `syncAudioSource()`, una vez por cuadro: si la ROM ejecutó un
  `F002` desde el último reset (`cpu.audioPatternSet`), suena el patrón; si no, el beep.
  `playPattern()` arma un buffer con un período del patrón (128 bits) a
  `Core.patternRate(cpu.pitch)` bits por segundo, con el ritmo de muestreo del contexto:
  cada bit se repite en las muestras que le tocan (1 = +1, 0 = −1) y se le resta el
  promedio, así un patrón parejo (todo 0, que es como se callan los programas de XO-CHIP,
  o todo 1) es silencio. El bucle se rearma solo cuando el núcleo avisa que algo cambió
  (`cpu.audioDirty`); al reiniciar vuelve el beep. Entra a la misma envolvente que el
  beep, así el silencio, el volumen, la pausa y la pestaña oculta funcionan igual.
  Mientras se rebobina, `syncAudioSource()` no cambia nada: como `loadState` deja
  `audioDirty` en `true`, el patrón de la foto a la que se llegó se arma una vez, al
  soltar.
- El aviso del pie del tubo dice "Sonido: tocá la consola para activarlo" (titilando)
  hasta que el contexto corre, "Sonido: silenciado" o "Sonido: este navegador no tiene
  Web Audio".
- `window.chip8.audioState()` devuelve `{ supported, state, enabled, muted, volume,
  beeping, soundTimer, pattern, patternRate }`; las pruebas E2E lo usan junto con un
  gancho en `createGain` para leer las ganancias.

### 4.8 Carga de ROMs

Toda carga pasa por **`loadCartridge(bytes, nombre, opciones)`**, que calcula la huella,
busca el demo (por `demoId` o por la huella: el mismo demo cargado desde un archivo es el
mismo cartucho) y la entrada del archivo, resuelve los ajustes del cartucho
([4.9](#49-ajustes-por-cartucho)) y llama a `loadRomBytes`. Las opciones dicen de dónde
viene (`origin`: `'archivo'` desde el selector o el arrastre, `'biblioteca'`, `'demo'`,
`'api'`, `'taller'` o `'explorador'`, la ventana del archivo de la comunidad): una ROM que
llegó de un archivo entra a la biblioteca, una de la biblioteca pasa adelante, y un juego
del archivo cargado desde un archivo o por la API toma el título del archivo. Lo que
viene del Taller o de la ventana del archivo no entra a la biblioteca. Con `platform` (la
manda el Taller: la de la etiqueta `@platform` del programa) el cartucho corre en esa
plataforma, por encima de la que se haya recordado para esos bytes; los demás ajustes por
cartucho valen igual. Antes de cambiar de ROM se guardan las banderas de la que se va.

- **Botón "Cargar ROM".** Vacía el `input type="file"` escondido (así elegir dos veces el
  mismo archivo funciona) y lo abre. No tiene filtro `accept`: una ROM puede tener
  cualquier extensión.
- **Arrastrar y soltar**, sobre cualquier parte de la página. `dragenter`/`dragleave`
  llevan una cuenta de profundidad y solo reaccionan si lo que se arrastra son archivos
  (`dataTransfer.types` incluye `Files`); se muestra la capa "Soltá el cartucho acá".
  Lo soltado pasa por `dropFile`, que mira el contenido: un archivo de estados exportado
  se importa, y cualquier otra cosa es una ROM ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)).
- `loadFile(file)` rechaza un archivo vacío o de más de 65.024 bytes (`MAX_ROM_ANY`)
  **antes** de leerlo, con un aviso; si no, lo lee con `FileReader.readAsArrayBuffer`.
- **`loadRomBytes(bytes, nombre, demoId, silencioso, { platform, minPlatform, prepare })`**
  vuelve a controlar el tamaño y elige la plataforma: la que pide el cartucho
  (`platform`, también una menor que la actual), la mínima del demo (`minPlatform`) o la
  actual. **Si la ROM no entra en esa plataforma pero sí en XO-CHIP**, pasa al perfil
  XO-CHIP completo (plataforma y quirks) y avisa: "La ROM «x» ocupa N bytes y solo entra
  en XO-CHIP (64 KB), así que pasé al perfil XO-CHIP.". Después llama a `cpu.loadRom`,
  informa las teclas que siguen apretadas, limpia el error y el aviso de la ROM anterior,
  llama a `prepare()` (donde `loadCartridge` aplica los ajustes, **antes del primer
  frame**), deja la máquina corriendo y actualiza la ranura, los estantes, el transporte,
  la plataforma y el monitor. Si la ROM se rechaza, la anterior sigue corriendo.
- Los avisos (`toast`) aparecen arriba al centro (en pantalla completa, adentro del
  bisel), como mucho tres a la vez, y se van solos a los 4,5 s (8 s si son de error, 15 s
  si traen un botón). El contenedor `#toasts` es una región `aria-live`.

### 4.9 Ajustes por cartucho

Con el interruptor «Ajustes por cartucho» prendido (`settings.perRom`, de fábrica),
`resolveConfig(sha, demo)` arma los ajustes con que arranca una ROM, **campo por campo**,
pisando cada fuente a la anterior:

| Prioridad | Fuente | Qué aporta |
|:---:|---|---|
| 4 (base) | `settings`: tus últimas elecciones explícitas | Plataforma, quirks, IPF, paleta y controles |
| 3 | El demo incluido | Su plataforma (`@platform`, o CHIP-8) |
| 2 | La entrada del archivo (`archiveLookup(sha)`) | Plataforma, quirks, IPF, colores (la paleta «Del cartucho») y giro |
| 1 (gana) | Lo recordado (`romStore.roms[sha]`) | Plataforma, quirks, IPF, paleta, giro y controles |

`state.romSource` queda en `'recordado'`, `'archivo'`, `'demo'` o `'ninguno'`, y la
segunda línea de la ranura lo dice ("531 bytes · demo incluido", "… · ajustes del
archivo", "… · ajustes recordados"); con un juego del archivo, el `title` dice quién lo
hizo y para qué evento. Al cargar con ajustes del archivo o recordados aparece un aviso que
resume lo aplicado (`configSummary`: "XO-CHIP, 1.000 IPF y sus colores"); el de los
recordados trae el botón «Olvidar ajustes».

**Lo automático no cuenta como tuyo.** Las funciones que cambian ajustes
(`applyProfile`, `applyPlatform`, `applyQuirks`, `setIpf`) reciben `auto`: la
autoconfiguración las llama con `auto` y solo aplican; sin `auto` (un selector, un
interruptor, el botón de un aviso o la API) es un cambio de la persona, y `userChanged()`
lo guarda en `settings` y, con el interruptor prendido, lo recuerda para la ROM de la
ranura (`rememberCurrent`: plataforma, quirks, IPF, paleta, giro y controles, con la hora
en `updated`). Así una ROM nunca "contagia" sus ajustes a la siguiente. Por qué esta
prioridad: [8.20](#820-la-prioridad-de-los-ajustes-por-cartucho).

**El formato** (`localStorage['chip8-consola.cartuchos']`):

```
{ version: 1,
  roms: { [sha1]: { name, size, platform, quirks, ipf, palette, rotation, keymap, flags?, updated } } }
```

`palette` puede ser también `'custom'` o `'cartucho'`; `keymap` es `{ preset, keys }`.
Al leer, cada campo se valida por separado y lo roto se ignora. Los cambios se guardan
juntos tras una pausa de `ROM_SAVE_MS` (400 ms) y, si hay más de `ROMS_MAX` (500) ROMs,
se van las que hace más tiempo que no cambiaron.

**Las banderas RPL** de cada ROM se guardan en el mismo lugar: `syncFlags()` compara
`cpu.flags` con la última copia y, si cambiaron, las guarda, pero solo si alguna no es
cero o si esa ROM ya tenía banderas guardadas. Se miran una vez por segundo mientras la
ROM corre y en cada momento en que podrían perderse: al pausar, en Paso y Frame, al
reiniciar, cuando la máquina se detiene (un juego que guarda y termina con `EXIT`), antes
de cargar otra ROM, al apagar el interruptor, al ocultarse la pestaña y en `pagehide`
(`persistNow`). Al cargar la ROM vuelven a `cpu.flags`. Una entrada con solo banderas no
cuenta como ajustes recordados.

**«Olvidar ajustes»** (`forgetRomSettings`) borra lo recordado y conserva las banderas
(son la partida guardada, no un ajuste). Si la ROM de la ranura es un juego del archivo,
vuelven en vivo los ajustes del archivo (`applyLive`); si no, quedan los de ahora y la
próxima vez arranca con los de siempre. Apagar el interruptor (`setPerRom(false)`) vale
desde la próxima carga: todas las ROMs usan los ajustes que estén puestos, como antes de
que existiera esta función.

### 4.10 Tus cartuchos: la biblioteca

Cada ROM cargada desde un archivo entra a la biblioteca (`libraryAdd`; si ya estaba, pasa
adelante). El formato (`localStorage['chip8-consola.biblioteca']`):

```
{ version: 1, items: [{ sha1, name, size, added, played, data }] }     data: los bytes en base64
```

Los cartuchos van ordenados por `played`, el jugado más recientemente primero. El estante
**Tus cartuchos** los muestra a todos, con su nombre (el título del archivo si es un juego
conocido; si no, el nombre del archivo sin la extensión), su plataforma, una etiqueta
«recordado» o «del archivo», el tamaño y cuándo se jugó ("jugado hoy", "jugado ayer",
"jugado hace 3 días", "jugado el 28 de octubre"). Los cinco primeros (`LIBRARY_PICKS`) van
también como chips en la fila **Tuyos:**, debajo de la ranura y de los controles del
demo. Un clic carga el cartucho con sus ajustes (`libraryLoad`; si sus datos están dañados,
lo saca del estante y avisa). La × lo quita (`libraryRemove`), con un aviso que trae
**Deshacer** (`libraryRestore`). Con el teclado, el foco vuelve al mismo botón del mismo
cartucho después de redibujar, o a la × del cartucho que quedó en su lugar.

**Los límites** ([8.21](#821-los-límites-de-la-biblioteca)): como mucho `LIBRARY_MAX_ITEMS`
(60) cartuchos y `LIBRARY_MAX_CHARS` (2 500 000) caracteres de base64 entre todos, unos
2,5 MB. `enforceLibraryLimits` saca lo que no entra empezando por el jugado hace más
tiempo, y nunca el que está en la ranura. Además, cualquier escritura en `localStorage`
que choca con el límite del navegador (`QuotaExceededError`) le hace lugar sacando de la
biblioteca el cartucho jugado hace más tiempo y probando otra vez (`storageWrite` +
`evictLibraryItem`): los ajustes valen más que una ROM que se puede volver a cargar. Si
algo se va por falta de lugar, un aviso lo dice. Si el navegador no deja guardar nada
(`storageOk` falso), el estante lo avisa y la biblioteca dura lo que dura la página.

### 4.11 Cartuchos incluidos y selector rápido

`CHIP8_DEMOS` se normaliza al arrancar en `demos`, una lista de
`{ id, name, description, controls, platform, hex, bytes, sha1 }` (`platform` es
`'chip8'` si el demo no la declara). `buildShelf()` crea, por cada cartucho, dos botones
que llaman a `loadDemo(id)`:

- una tarjeta `.cart` en el estante "Cartuchos incluidos", debajo de la consola, con el
  nombre, la descripción, los controles y la marca "En la ranura";
- un chip `.chip` en la fila "Incluidos:" (`#cart-chips`), justo debajo de la ranura, para
  cambiar de cartucho sin scrollear. Al lado hay un enlace "Detalles ↓" a `#shelf-title`.

`updateShelfSelection()` pone `aria-pressed="true"` en la tarjeta y el chip del cartucho
cargado. `updateSlot()` muestra en la ranura el nombre, la segunda línea
([4.9](#49-ajustes-por-cartucho)), un color por cartucho y, en `#cart-controls`,
"Controles: ..." con los controles del demo; para una ROM externa esa línea se oculta. Al
arrancar se carga el primer cartucho según `@order` (Rebote). Si no hay cartuchos, el
estante muestra un mensaje, el selector queda oculto y la pantalla muestra "INSERTÁ UN
CARTUCHO".

### 4.12 Compatibilidad: plataforma, perfil y quirks

El grupo **Compatibilidad** tiene dos selectores, seis interruptores DIP y el interruptor
«Ajustes por cartucho»:

- **Perfil** (`#preset`): COSMAC VIP, SUPER-CHIP, XO-CHIP y Personalizado.
  `applyProfile(id, { auto, quiet, restart })` pone la plataforma del perfil
  (`PRESET_PLATFORM`) y sus seis quirks; si la plataforma cambia, la ROM vuelve a
  empezar (con `restart`, vuelve a empezar igual). Si la ROM no entra en la plataforma
  del perfil, avisa y no cambia nada. Elegir "Personalizado" no cambia nada. Por qué el
  perfil elige también la plataforma: [8.19](#819-perfil-y-plataforma-dos-selectores).
- **Plataforma** (`#platform`): `applyPlatform(p, { auto, quiet })` cambia solo la
  plataforma, con `cpu.setPlatform` (la ROM vuelve a empezar; los quirks no se tocan).
  Cada opción y el selector llevan en el `title` la descripción de la plataforma
  (`PLATFORM_DESC`), que también aparece en la línea de ayuda del grupo.
- **Los interruptores** (`role="switch"`, armados desde `QUIRK_INFO`: etiqueta corta,
  nombre, opcodes y descripción, con `aria-describedby`): `applyQuirks` cambia solo los
  quirks, en vivo, y **nunca la plataforma**.

`detectPreset()` compara los seis quirks con cada perfil (solo los quirks: con quirks del
VIP y plataforma XO-CHIP, el selector muestra COSMAC VIP); si no coinciden con ninguno,
muestra "Personalizado". `updatePlatformUI()` actualiza el selector, la placa de la consola
("MODELO XO-CHIP · 64 KB RAM · 128×64"), las leyendas de video y el ancho de las
direcciones del monitor. Los perfiles:

| Quirk | COSMAC VIP | SUPER-CHIP | XO-CHIP |
|---|---|---|---|
| Plataforma | CHIP-8 | SUPER-CHIP | XO-CHIP |
| `vfReset` (VF=0) | sí | no | no |
| `memory` (MEM) | sí | no | sí |
| `shifting` (SHIFT) | no | sí | no |
| `jumping` (BXNN) | no | sí | no |
| `clipping` (CLIP) | sí | sí | no |
| `displayWait` (VBLANK) | sí | no | no |

Los quirks del perfil XO-CHIP son exactamente los de Octo por defecto: 96 de los 104
programas del archivo los usan tal cual. Qué hace cada quirk y de dónde sale:
[sección 11 del manual](MANUAL.md#11-quirks).

### 4.13 Velocidad

`setIpf(n, origen, auto)` ajusta la velocidad entre 1 e `IPF_MAX` (10.000) y sincroniza
tres controles: el deslizador (`#ipf-range`, de 0 a 1000 en escala logarítmica: IPF =
IPF_MAX^(posición/1000), redondeado), el campo numérico (`#ipf-input`) y los botones 7,
15, 30, 100, 500, 1000, 5000 y 10000. La línea `#ipf-rate` dice "≈ N instrucciones por
segundo · timers a 60 Hz". El deslizador lleva `aria-valuetext` ("15 instrucciones por
frame"). Mientras se escribe un valor fuera de rango, el campo queda con
`aria-invalid="true"` y la línea dice "Fuera de rango (1 a 10.000): se usa N"; se corrige
al confirmar. Lo que corre es `liveIpf`, que puede ser el de la ROM; `settings.ipf` es la
última elección de la persona. El tope se subió de 1000 a 10.000 en la primera ronda, a
pedido del usuario, para ROMs de la Octojam que piden miles de IPF: en el archivo de la
comunidad, dos juegos piden exactamente 10.000.

### 4.14 Diagnósticos

- **Una instrucción ignorada.** Cuando el núcleo deja un aviso (`cpu.hint`), `checkHint()`
  lo muestra **una sola vez por ROM cargada** como un aviso con botón: "La ROM usó «HIGH»
  (pasar a alta resolución (128×64)), que es de SUPER-CHIP, y la plataforma CHIP-8 la
  ignora." y **Usar SUPER-CHIP**, que llama a `applyProfile` con el perfil de esa
  plataforma y `restart`. Si se carga otra ROM, el aviso se va (`dismissHint`).
- **Un error de plataforma.** `handleHalt()` ve `errorInfo.kind === 'platform'` y pone, en
  el mensaje del tubo y al pie del monitor, el botón **Cambiar a SUPER-CHIP y reiniciar**
  (o a XO-CHIP), que hace lo mismo.
- **El fin del programa.** Con `cpu.exited`, el tubo muestra "FIN DEL PROGRAMA" y "La ROM
  terminó con EXIT (00FD).", la insignia dice "Terminado", el LED RUN queda en ámbar y se
  anuncia una vez. No es un error.
- **Una ROM que solo entra en XO-CHIP** pasa sola al perfil XO-CHIP al cargarla, con un
  aviso ([4.8](#48-carga-de-roms)).

Los textos los cita el manual ([§11.10](MANUAL.md#1110-diagnósticos-de-plataforma)) y
`tests/manual.test.js` comprueba que sigan siendo los de `chip8.html` y los del núcleo.

### 4.15 Transporte, estados y errores

Los botones Pausa/Continuar, Paso, Por encima, Salir, Frame y Reiniciar (seis, en dos
filas de tres) llaman a `togglePause`, `stepOnce`, `stepOver`, `stepOut`, `frameOnce` y
`doReset`:

- **Paso** pausa la máquina y ejecuta una sola instrucción con `cpu.step()`: los timers
  no bajan. **Frame** pausa y ejecuta un `runFrame` completo con su tic (o lo que le
  faltaba a un frame que cortó un punto de corte). **Por encima** y **Salir** son del
  depurador ([4.24](#424-el-depurador)).
- `updateTransport()` deshabilita Pausa, Paso, Por encima, Salir y Frame sin ROM o con la
  máquina detenida, y Reiniciar sin ROM. El botón de pausa dice "Continuar" (con el ícono
  de play) en pausa; con puntos de corte puestos, su `title` dice que sigue hasta el
  próximo.
- `computeMode()` resume el estado en uno de siete modos, que manejan el LED RUN, la
  insignia del monitor, la etiqueta PAUSA y el atributo `data-mode` de la consola:

| Modo | Insignia | LED RUN |
|---|---|---|
| `idle` | Sin cartucho | apagado |
| `run` | Ejecutando | verde |
| `wait` | Esperando tecla (además, la etiqueta ESPERANDO TECLA en el tubo) | verde titilando |
| `paused` | Pausado | ámbar |
| `break` | Punto de corte: en pausa, con el PC en una línea con punto de corte | ámbar |
| `exit` | Terminado (y "FIN DEL PROGRAMA" en el tubo) | ámbar |
| `error` | Error | rojo |

**Cuando la máquina se detiene**, `handleHalt()`:

1. guarda las banderas, y en `state.pausedBeforeHalt` si el usuario tenía la máquina en
   pausa (o iba de a un paso), y la pausa;
2. muestra el mensaje en el tubo ("ERROR", el texto del núcleo y "Presioná Reiniciar
   (Retroceso) para volver a empezar.", más el botón de plataforma si corresponde) y en la
   línea de error del monitor; o el fin del programa;
3. lo anuncia **una sola vez** en la línea de estado (`#status`, `role="status"`):
   "Error: ...". No hay aviso flotante ni `role="alert"`: el mismo texto se leía tres
   veces con un lector de pantalla y el aviso tapaba el monitor.

Paso o Frame no pisan ese mensaje en `#status`. **Reiniciar** después de un error vuelve
al estado de pausa que había justo antes: si ibas de a un paso, queda en pausa en `0x200`
y Paso sigue andando; si corría, arranca de nuevo. Un cambio de plataforma reinicia de la
misma forma (`machineRestarted`). Ver
[8.13](#813-reiniciar-después-de-un-error-respeta-la-pausa). Cargar un estado o
rebobinar desde un error también limpia el mensaje, pero con su propia regla para la
pausa ([4.22](#422-estados-guardados-y-rebobinado)).

### 4.16 El monitor

El panel MONITOR tiene arriba la insignia de estado y, debajo, cuatro pestañas
(`MONITOR_TABS`, un `role="tablist"`: las flechas, Inicio y Fin cambian de pestaña, y la
elegida se guarda en `settings.monitorTab`). La primera, **Código**, es el monitor de
siempre más el depurador: PC, I, SP, DT, ST, IPF, INSTRUCCIONES (DT, ST, SP, IPF y el
contador en decimal, el resto en hexadecimal) y MÁQUINA (la plataforma, la resolución y,
con XO-CHIP, los planos elegidos: "XO-CHIP · 128×64 · planos 1+2"); V0–VF, resaltando los
que cambiaron; el desensamblado, que recorre toda la memoria y sigue al PC (marcado con ▶
y `aria-current`); la pila de 16 niveles con el tope marcado; y los puntos de corte. Las
otras tres son **Traza**, **Memoria** (el mapa, el volcado de la memoria en I y sus
regiones) y **Sprites**: las explica [4.24](#424-el-depurador). Debajo de las pestañas va
la línea de error, con el botón de plataforma si hace falta y, después de un error, **Ver
las últimas instrucciones**, que lleva a la traza.

- **Direcciones de 3 o 4 dígitos.** Con la memoria de 64 KB de XO-CHIP, `addrDigits` pasa
  a 4 y `invalidateAddresses()` obliga a reescribir todo lo que muestra direcciones; el
  panel se ensancha (`is-wide`).
- **Listas con scroll propio.** El desensamblado (2048 filas en 4 KB, 32.768 en XO-CHIP),
  la traza, el volcado, las regiones y los dibujos son listas virtuales (`makeList`): solo
  están en el DOM las filas a la vista, y se recorren con la rueda, arrastrando, con la
  barra o con el teclado (son `role="listbox"` con `aria-activedescendant`). El scroll que
  pone el programa no cuenta como un movimiento de la persona.
- **Siempre se llega a su final.** En la pantalla ancha (más de 1200 px, dos columnas) el
  monitor va pegado arriba (`position: sticky`). `fitMonitor()` (con un `ResizeObserver`
  sobre el monitor y en cada `resize`) le da a la lista principal de la pestaña a la vista
  las filas que entran en la ventana, entre su mínimo y su máximo (el desensamblado, de 8 a
  26), así el monitor no crece más que la ventana. Si igual es más alto (con un error y su
  botón, o una ventana muy baja), pone `--mon-top` = mín(20, alto de la ventana − alto del
  monitor − 20), y el CSS usa `top: var(--mon-top, 20px)`: el monitor se pega más arriba,
  con su final a la vista después de scrollear un poco
  ([7.11](#711-integración-y-hallazgos-notables)). Con el Taller abierto al costado, el
  monitor va debajo de los estantes y deja de estar pegado, salvo desde 1900 px de ancho,
  donde entran los tres ([4.23](#423-el-taller)).

Está pensado para no costar nada cuando no se mira:

- `updateMonitor(forzar)` no hace nada si el panel está oculto (botón Ocultar/Mostrar,
  que se guarda) o si la pestaña del navegador está oculta. Tampoco si el panel quedó fuera
  de la vista (lo sigue un `IntersectionObserver`), salvo que se lo fuerce: al cargar una
  ROM, reiniciar, detenerse, volver a mostrar el panel o cuando el panel vuelve a entrar en
  la vista. En el resto de los casos se actualiza una vez por cuadro de animación, desde
  el bucle, y **solo la pestaña a la vista**.
- Cada elemento guarda su último valor (`el.__v`, `li.__key`, `li.__o`...) y solo se
  escribe en el DOM lo que cambió. Una fila del desensamblado se reescribe si cambian su
  palabra, lo que el mapa de accesos sabe de ella, su etiqueta o la plataforma y el quirk
  `jumping`; si no, solo se mueven las marcas del PC y del punto de corte.
- El resaltado de V0–VF solo se recalcula si se ejecutaron instrucciones desde la
  actualización anterior, así sobrevive mientras la máquina está en pausa entre pasos.
- Mientras la máquina corre, el mapa de la memoria se repinta como mucho 10 veces por
  segundo (`MAP_REDRAW_MS`) y el visor de sprites, 4 (`SPR_REDRAW_MS`); la traza no se
  muestra (dice que hay que pausar para verla).

### 4.17 Comodidades

- **Avance rápido.** Lo sostienen cuatro fuentes (`turbo.key`, `pointer`, `button`, `api`):
  la tecla T, el botón del bisel con el puntero (con captura), el mismo botón enfocado con
  Espacio o Enter, y `window.chip8.setTurbo`. El botón se arma con `bindHoldButton`, el
  mismo que usa el botón ⏪ del rebobinado. Mientras alguna está activa, cada tic real
  corre `TURBO_FACTOR` (4) tics emulados ([4.2](#42-el-bucle-principal)) y en el tubo
  aparece «×4» (solo si la máquina corre o rebobina: con B, el rebobinado va cuatro veces
  más rápido). En pausa o detenida no hace nada; se corta con `releaseAllKeys` (la
  ventana pierde el foco, la pestaña se oculta, se abre la ayuda).
- **Pantalla completa.** `toggleFullscreen()` usa la Fullscreen API (o la de WebKit) sobre
  el bisel, y devuelve una promesa con el estado al que se llegó (plazo de 3 s). Con un
  puntero grueso (`pointer: coarse`, un teléfono o una tableta), el keypad se muda adentro
  del bisel (`has-pad`): al lado de la pantalla, o abajo con el aparato vertical. Los
  avisos también se mudan, para verse. La escala sigue siendo entera. Sin la API (el
  Safari del iPhone) el botón no aparece y P no hace nada.
- **Captura.** `screenshotCanvas()` dibuja la pantalla **del núcleo**, no la del lienzo:
  los colores exactos de la paleta, sin estela, scanlines, resplandor ni curvatura, con
  escala entera (`SHOT_WIDTH`: 640 píxeles de ancho) y con el giro aplicado.
  `saveScreenshot()` la baja con un `<a download>` y una URL `blob:` armada en el mismo
  gesto, con el nombre `chip8-<cartucho>-<fecha>-<hora>.png` (`fileSlug` saca tildes y
  símbolos). `window.chip8.screenshot()` devuelve el PNG en `data:`.
- **Joystick.** Con un joystick conectado (`gamepadconnected`), `pollGamepads()` lo lee en
  cada cuadro de animación con el mapeo estándar: la cruz (botones 12 a 15) y la palanca
  izquierda (ejes 0 y 1, desde `PAD_DEADZONE`) son las direcciones; A (0) y B (1), los
  dos botones; Start (9) pausa y continúa (en el flanco). Lo que aprietan se suma como una
  fuente más (`setGamepadKeys`, con `liveKeymap`), de todos los joysticks. Con la ventana
  sin foco, la pestaña oculta o la ayuda abierta no se lee nada. Avisos al conectar y
  desconectar, y la línea `#pad-hint` dice cuál está conectado.
- **Controles.** Un mapa es `{ preset: 'octo' | 'vip' | 'custom', keys: [6 teclas] }`
  (arriba, abajo, izquierda, derecha, A y B). `KEYMAP_PRESETS` tiene los dos de fábrica:
  "WASD de Octo" (`[5, 8, 7, 9, 6, 4]`) y "Teclado numérico del VIP" (`[2, 8, 4, 6, 5, 0]`).
  Con "Personalizado" aparecen seis selectores; las teclas personalizadas se recuerdan
  aparte (`settings.customKeys`) para volver a ellas. Como la paleta, el mapa que vale
  (`liveKeymap`) puede ser el de la ROM, y `settings.keymap` es tu última elección.
- **Curvatura y encendido animado**: ver [4.4](#44-modos-de-pantalla-y-efectos-del-tubo).

### 4.18 La ayuda

Un `<dialog>` modal ("Manual rápido") con el mapa del teclado, los atajos, el avance
rápido, la pantalla completa y las capturas, los estados guardados y el rebobinado (con
«Ver todos», Exportar e Importar), el joystick y los controles, los cartuchos, el archivo
de la comunidad, tus cartuchos, el Taller, la velocidad, la lista de quirks (armada desde
`QUIRK_INFO` por `buildHelpQuirks`, con una línea fija que resume los perfiles), las
plataformas, los colores, la curvatura y el encendido, los ajustes por cartucho (con el
crédito del archivo de la comunidad), el diagnóstico, el monitor y el depurador, y
consejos. Se abre con H o con "?" y se cierra con H, Esc, la ×, o un clic en el fondo. Al
abrirla se sueltan todas las teclas. La tabla de atajos de la ayuda es la referencia que
usan las pruebas de la documentación: el README, la parte 1.10 del tutorial y
[4.6](#46-teclado-keypad-y-foco) tienen que nombrar cada uno de sus atajos.

### 4.19 Ajustes guardados

La consola usa cinco claves de `localStorage`, todas leídas y escritas dentro de
`try/catch`:

| Clave | Qué guarda |
|---|---|
| `'chip8-consola.ajustes'` | `settings`: tus últimas elecciones (la tabla de abajo). |
| `'chip8-consola.cartuchos'` | Los ajustes recordados y las banderas de cada ROM ([4.9](#49-ajustes-por-cartucho)). |
| `'chip8-consola.biblioteca'` | Tus cartuchos ([4.10](#410-tus-cartuchos-la-biblioteca)). |
| `'chip8-consola.estados'` | Los estados guardados de cada ROM: `{ version: 1, roms: { [sha1]: { name, slots: { rapido, "1"…"4": { date, text } } } } }`, con `text` = `Chip8Core.encodeState(cpu.saveState())` ([4.22](#422-estados-guardados-y-rebobinado)). |
| `'chip8-consola.taller'` | Los programas del Taller: `{ version: 1, next, open, programs: [{ id, name, source, saved }], edited: { id: { source, saved } }, drafts: { id: fuente } }`: tus programas, los ejemplos y cartuchos que cambiaste y guardaste, y lo que todavía no se guardó ([4.23](#423-el-taller)). |

`settings` se guarda entero cada vez que cambia algo. Al arrancar, `loadSettings()` valida
cada campo por separado y descarta lo que no tenga el tipo esperado:

| Campo | De fábrica | Validación |
|---|---|---|
| `ipf` | 15 | número, redondeado y limitado a 1–10.000 |
| `quirks` | los del VIP | objeto; cada una de las seis claves, solo si es booleana |
| `platform` | `'chip8'` | una de `PLATFORMS` |
| `palette` | `'fosforo'` | una clave de `PALETTES` o `'custom'` («Del cartucho» nunca se guarda acá) |
| `customColors` | los de Verde fósforo | cuatro colores `#RRGGBB` |
| `screenMode` | `'crt'` | `'crt'` o `'puro'` |
| `scanlines`, `persistence` | `true` | booleano |
| `curvature` | `false` | booleano |
| `powerOn` | `true` | booleano |
| `muted` | `false` | booleano |
| `volume` | 0,6 | número finito, limitado a 0–1 |
| `monitorOpen` | `true` | booleano |
| `monitorTab` | `'codigo'` | una de `MONITOR_TABS`: la pestaña del monitor a la vista |
| `perRom` | `true` | booleano |
| `keymap` | WASD de Octo | `'octo'`, `'vip'` o `{ preset: 'custom', keys }` con seis teclas de 0 a 15 |
| `customKeys` | `null` | seis teclas de 0 a 15 |
| `rewind` | `true` | booleano: el interruptor «Rebobinado» |

Con el almacenamiento bloqueado o roto, la consola arranca con los valores de fábrica y
funciona igual (lo prueba el E2E 10 inyectando un `localStorage` que tira excepciones). Un
efecto que conviene tener presente al depurar: el perfil y la plataforma se recuerdan entre
sesiones, y con «Ajustes por cartucho» cada ROM recuerda los suyos, así que "por defecto
VIP" vale solo para un navegador que nunca abrió la consola.

### 4.20 Accesibilidad

- Todo se puede manejar con el teclado; el foco visible es un contorno de 3 px
  (`:focus-visible`).
- La pantalla es un `canvas` con `role="img"` y una etiqueta que dice la plataforma y la
  resolución. El keypad es un grupo con una etiqueta por tecla ("Tecla A (en tu teclado:
  Z)"). Los quirks son `role="switch"` con su descripción en `aria-describedby`. Los
  interruptores de pantalla, sonido, avance rápido, rebobinado (el botón ⏪ y el
  interruptor «Rebobinado», descrito por la línea "Podés volver hasta N s."), pantalla
  completa y «Ajustes por cartucho» usan `aria-pressed`. El modo de pantalla es un
  `radiogroup`. Las muestras de color tienen su etiqueta. Cada ranura de «Estados» es un
  `role="group"` con el nombre de la ranura, su pantallita es `aria-hidden` y sus botones
  dicen qué hacen ("Guardar el estado de la máquina en la ranura rápida (I)"). El monitor
  usa `aria-expanded` en su botón y `aria-current` en la fila del PC.
- La línea de estado (`role="status"`, `aria-live="polite"`) anuncia lo importante: el
  cartucho cargado (y con qué ajustes), pausa, paso, reinicio, la velocidad elegida con
  los botones, el perfil y la plataforma, el modo de pantalla, el silencio, la curvatura,
  los controles, la pantalla completa, la captura, los estados guardados y cargados,
  cuánto se rebobinó (al soltar) y los errores, una sola vez. El monitor no se anuncia:
  cambia en cada frame, también mientras se rebobina.
- El keypad acepta Enter, Espacio y la activación sin puntero de los lectores de
  pantalla ([4.6](#46-teclado-keypad-y-foco)).
- Lo de la cuarta ronda sigue las mismas reglas. Las pestañas del monitor son un
  `tablist`, y sus listas, `listbox` con `aria-activedescendant` (el mapa de la memoria es
  `aria-hidden`: su versión para el teclado es la lista REGIONES con «Ir a»). La línea de
  estado anuncia los puntos de corte y dónde se detuvo la máquina, sin aviso flotante. El
  Taller es una región con nombre; su editor tiene `aria-label`, `aria-describedby` (las
  teclas) y `aria-invalid` con errores, la lista de errores tiene nombre y el margen de los
  números es `aria-hidden`. En la ventana del archivo, cada juego es un botón con su título
  como nombre (`aria-labelledby`) y lo demás como descripción (`aria-describedby`), con un
  solo botón en el orden del Tab (las flechas recorren la grilla), y sus avisos van a una
  región `aria-live="assertive"`. En la lista de estados, lo que no se puede cargar queda
  `aria-disabled` pero enfocable, y al tocarlo explica por qué.
- Contraste: las letras de ayuda del keypad y las filas vacías de la pila se oscurecieron o
  aclararon en la revisión de la primera ronda (alrededor de 4,9:1 o más); los cuatro
  colores de cada paleta tienen al menos 1,8:1 entre vecinos.
- `prefers-reduced-motion: reduce` apaga las animaciones y transiciones, y el encendido
  animado.
- En pantallas de 760 px o menos el keypad queda justo debajo del tubo; en 480 px o menos
  se oculta la bajada del logo y se achican los márgenes. A 360×640, el tubo y el keypad
  entero entran en la primera vista (E2E 24).

### 4.21 La API de depuración window.chip8

La interfaz expone `window.chip8` para depurar desde la consola del navegador y para
`tools/e2e.js`:

| Miembro | Qué hace |
|---|---|
| `cpu` | La instancia de `Chip8` (se puede leer y escribir todo su estado). |
| `demos` | La lista normalizada de cartuchos. |
| `loadDemo(id)`, `loadRomBytes(bytes, nombre)` | Cargan un cartucho o bytes (con sus ajustes por cartucho); devuelven `true` o `false`. |
| `pause()`, `resume()`, `isPaused()` | Pausa. `resume()` no hace nada con la máquina detenida; `isPaused()` es `true` también después de un error. |
| `step()`, `frame()`, `reset()` | Como los botones: `step()` devuelve lo que devolvió `cpu.step()`, `frame()` la cantidad de instrucciones y `reset()` un booleano. |
| `stepOver()`, `stepOut()`, `runTo(dirección)` | Paso por encima (O), salir de la subrutina (K) y «Hasta acá», como los botones; devuelven `true` si arrancaron. |
| `setBreakpoint(dirección, on)`, `getBreakpoints()`, `clearBreakpoints()` | Los puntos de corte del cartucho de la ranura (`setBreakpoint` devuelve si quedó puesto, o `null` con una dirección fuera de la memoria). |
| `setMonitorTab(id)`, `getMonitorTab()` | La pestaña del monitor: `'codigo'`, `'traza'`, `'memoria'` o `'sprites'`. |
| `debugState()` | `{ stop, atBreakpoint, run, tab, disasm, memory, sprite }`: por qué se detuvo, hacia dónde corre y qué muestra cada vista. |
| `setIpf(n)`, `getIpf()` | Velocidad (se limita a 1–10.000 y devuelve el valor aplicado). |
| `setPreset('vip' \| 'schip' \| 'xochip')` | Perfil completo: plataforma y quirks. |
| `setPlatform(p)`, `getPlatform()` | Solo la plataforma. |
| `setScreenMode('crt' \| 'puro')`, `getScreenMode()` | Modo de pantalla. |
| `setPalette(id)`, `getPalette()` | Paleta (también `'custom'` y, si existe, `'cartucho'`). |
| `setCustomColors([fondo, plano1, plano2, ambos])` | Los cuatro colores de «Personalizada» (`'#RRGGBB'`). |
| `setCartridgeColors(colores \| null)` | La opción «Del cartucho». |
| `setRotation(grados)`, `getRotation()` | El giro (0, 90, 180 o 270); se recuerda para la ROM de la ranura. |
| `screenColors()` | Los colores distintos que hay en el lienzo (`'#RRGGBB'`, ordenados). |
| `pressKey(k)`, `releaseKey(k)` | Teclas, como una fuente más ([4.6](#46-teclado-keypad-y-foco)). |
| `audioState()` | El estado del audio ([4.7](#47-sonido)). |
| `workshopInfo()` | El Taller: `{ open, docked, id, kind, name, platform, dirty, edited, unsaved, errors: [{ line, message }], programs: [{ id, name }] }` ([4.23](#423-el-taller)). |
| `workshopSymbols()` | `{ labels, listing }` del programa del Taller que está en la ranura (una copia), o `null` si en la ranura hay otra cosa. |
| `romInfo()` | `{ name, size, sha1, source, archiveId }` de la ROM de la ranura, o `null`. |
| `forgetRomSettings()` | «Olvidar ajustes» de la ROM de la ranura. |
| `setPerRom(on)`, `getPerRom()` | El interruptor «Ajustes por cartucho». |
| `libraryList()`, `libraryLoad(sha)`, `libraryRemove(sha)` | La biblioteca: `[{ sha1, name, size, added, played, platform, tag }]`, cargar y quitar. |
| `archiveLookup(sha)`, `registerArchiveEntry(sha, entrada \| null)` | Busca un juego en la tabla del archivo; agrega o quita entradas mientras la página está abierta (lo usan las pruebas). |
| `archiveRomBytes(sha)` | Los bytes de un juego del archivo (embebidos en `CHIP8_ARCHIVE.data`): promesa con un `Uint8Array` nuevo, o con `null` si esa huella no es de un juego con su ROM; se rechaza si el navegador no puede descomprimir o si la ROM está dañada ([4.25](#425-la-ventana-del-archivo-de-la-comunidad)). |
| `archiveLoad(sha)` | Carga un juego del archivo como un clic en su tarjeta: promesa con `true` o `false`. |
| `archiveOpen()`, `archiveClose()`, `archiveView()` | La ventana «Archivo de la comunidad»; `archiveView()` dice si está abierta, la búsqueda, los filtros, el orden, los juegos que muestra (`shown`, sus huellas en orden), la tarjeta activa, las que están a la vista y cuántas miniaturas hay hechas. |
| `getFlags()` | Las 16 banderas RPL de la máquina. |
| `setTurbo(on)`, `isTurbo()` | El avance rápido, como una fuente más. |
| `toggleFullscreen()`, `isFullscreen()` | Pantalla completa (promesa con el estado al que se llegó). |
| `screenshot()` | La captura, como PNG en `data:`. |
| `setKeymap(mapa)`, `getKeymap()` | «Controles»: `'octo'`, `'vip'`, `'custom'` o `{ up, down, left, right, a, b }`; devuelve `{ preset, up, down, left, right, a, b }`. |
| `gamepadState()` | `{ supported, active, connected, start, keys, up, down, left, right, a, b }`. |
| `setCurvature(on)`, `getCurvature()` | La curvatura (no se prende si el navegador no puede). |
| `setPowerOn(on)`, `getPowerOn()` | El encendido animado. |
| `saveSlot(ranura)`, `loadSlot(ranura)`, `deleteSlot(ranura)` | Guardan, cargan o borran un estado de la ROM de la ranura (`'rapido'` o de 1 a 4); devuelven `true` o `false`. |
| `listSlots()` | Las cinco ranuras de la ROM de la ranura (`{ slot, name, empty, date, when, size, platform, damaged }`), o `null` sin cartucho. |
| `allStates()` | Todos los estados de todos los cartuchos, en el orden de la lista de «Ver todos»: `[{ sha1, name, origin, loaded, states: [{ slot, name, date, when, size, platform, damaged }] }]` (`origin`: `'demo'`, `'archivo'`, `'biblioteca'` o `'desconocido'`). |
| `statesFile(sha1, ranura)` | El texto del archivo que bajaría «Exportar», sin bajarlo: sin argumentos, todos los estados; con `sha1`, los de ese cartucho; con los dos, uno solo. `null` si no hay nada para exportar ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)). |
| `importStates(texto, nombre)` | Importa el texto de un archivo de estados como «Importar» (si hay ranuras ocupadas, pregunta); promesa con `{ imported, same, kept, damaged, roms, storage, text }`, o con `{ error }` o `{ cancelled }`. |
| `setRewind(on)`, `getRewind()` | El interruptor «Rebobinado». |
| `setRewinding(on)`, `isRewinding()` | Rebobinar como si se mantuviera B. |
| `rewindInfo()` | `{ seconds, entries, bytes }` del buffer de rebobinado. |

Las funciones que cambian ajustes cuentan como un cambio de la persona: quedan en
`settings` y, con «Ajustes por cartucho», en los de la ROM de la ranura. Un truco: en la
vista previa del navegador integrado, `requestAnimationFrame` se frena cuando el panel
está oculto; para automatizar algo ahí, mové el tiempo con `frame()` o `step()` en lugar
de esperar. Los miembros de los estados y del rebobinado, en cambio, no cambian ajustes:
cargar un estado o rebobinar nunca cuenta como una elección de la persona
([4.22](#422-estados-guardados-y-rebobinado)).

### 4.22 Estados guardados y rebobinado

El grupo **Estados**, el último del panel, tiene las cinco ranuras del cartucho de la
ranura (`STATE_SLOTS`: la rápida y de la 1 a la 4), el interruptor «Rebobinado» con la
línea "Podés volver hasta N s." y una línea de ayuda (`#states-hint`); al lado del título,
desde la cuarta ronda, los botones **Ver todos**, **Exportar** e **Importar**
([4.26](#426-estados-en-archivos-y-la-lista-de-todos)). El rebobinado se
maneja con B, con el botón ⏪ del bisel y con `window.chip8.setRewinding`. Nada de esto
cuenta como un cambio de ajustes de la persona: cargar un estado o rebobinar no pasa por
`userChanged` ni toca `settings`; solo el interruptor se guarda, en `settings.rewind`.

**El almacenamiento.** `localStorage['chip8-consola.estados']`:

```
{ version: 1, roms: { [sha1]: { name, slots: { rapido | '1'..'4': { date, text } } } } }
```

`text` es `Core.encodeState(cpu.saveState())` ([3.11](#311-estados-guardados-y-rebobinado))
y `name`, el nombre de la ROM cuando se guardó (lo usa el aviso de Borrar). Al arrancar,
`loadStateStore()` valida la estructura: `version` 1, claves que sean huellas SHA-1 (se
pasan a minúscula) y, en cada ranura, una fecha válida y un texto de 2 a `STATE_TEXT_MAX`
caracteres que empiece con `{`; lo que no cumple se ignora. Cada texto se decodifica
entero, con `Core.decodeState`, recién cuando hace falta: para su pantallita o al
cargarlo. Si no se puede, la ranura dice «DAÑADO», su `title` explica por qué y Cargar
avisa el error; el estado no se borra solo.

`writeStateStore()` escribe todos los estados de una vez (sin ninguno, borra la clave) y
devuelve `'ok'`, `'memoria'` (el navegador no deja guardar: `storageOk` es falso),
`'lleno'` (`QuotaExceededError`) o `'error'`. **A diferencia de los ajustes, no le saca
lugar a la biblioteca** ([4.10](#410-tus-cartuchos-la-biblioteca)): elegir entre un estado
y un cartucho guardado es cosa de la persona. `commitStates()` avisa: sin lugar, "No hay
más lugar en este navegador: el estado queda solo hasta que cierres la página. Para hacer
lugar, borrá estados viejos o cartuchos de «Tus cartuchos»."; sin almacenamiento, una sola
vez por sesión. Lo que no entró queda en memoria (`statesUnsaved`, que la línea de ayuda
menciona) y se vuelve a intentar con el próximo cambio.

**Las ranuras.** `buildStateSlots()` arma cinco grupos, cada uno con su pantallita, su
nombre, cuándo se guardó y los botones Guardar, Cargar y Borrar (los dos últimos, solo con
un estado; si el foco del teclado estaba en uno que se deshabilita, pasa a Guardar). La
pantallita es un `<canvas>` con la pantalla del estado (64×32 o 128×64) que `drawThumb`
pinta (con `paintThumb`) con los colores y el giro con que se ve la pantalla, y que el
CSS agranda sin suavizar, con escala entera en píxeles físicos, como la pantalla
(`sizeThumb` y `fitThumb`, con un `ResizeObserver`); `paintThumbs()` la repinta cuando
cambian la paleta o el giro ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)).
Cuándo se guardó lo dice `savedWhen` ("recién", "hace 5 min", "hoy 09:40", "ayer 18:20",
"28 de octubre", con el año si no es este), que se pone al día cada `STATE_TIMES_MS`. `renderStates()` muestra
las ranuras del cartucho que se carga; sin cartucho, el grupo muestra solo la explicación.

- **Guardar** (`saveToSlot`, también con I): `Core.encodeState(cpu.saveState())` con la
  máquina como esté (no hace falta pausar: es una copia), la fecha y el nombre de la ROM.
  Anuncia "Estado guardado en la ranura rápida." y muestra «GUARDADO» en el tubo durante
  `STATE_TAG_MS`.
- **Cargar** (`loadFromSlot`, también con U): `cpu.loadState(Core.decodeState(text))`
  dentro de un `try/catch` (si falla, un aviso y nada cambia); después,
  `machineStateLoaded(true, false)`, `rewindRestart()` y el monitor al día. Anuncia de
  cuándo era el estado ("Estado de la ranura rápida cargado (guardado recién).") y, si
  estaba detenido, qué hacer; muestra «CARGADO».
- **Borrar** (`deleteSlot`): el aviso trae «Deshacer» (`restoreSlot`), que devuelve el
  estado solo si la ranura sigue vacía.

**Después de cargar.** `machineStateLoaded(exact, stay)` pone la interfaz al día **sin
reiniciar nada**. Actualiza el selector de plataforma, la placa y el monitor
(`updatePlatformUI`) y los interruptores de quirks (`refreshQuirkUI`), sin guardarlos en
`settings` ni en los ajustes del cartucho; vuelve a avisar las teclas que siguen apretadas
(`resyncKeys`: así `FX0A` termina igual que en la original); si había un error en
pantalla, lo limpia; y si el estado cargado está detenido, `handleHalt()` muestra su error
o «FIN DEL PROGRAMA». La pausa no cambia, salvo cuando se sale de un error o del fin del
programa: una ranura vuelve a la pausa que había antes de detenerse (como Reiniciar) y el
rebobinado (`stay`) deja la máquina en pausa. Con `exact`, la pantalla muestra ese frame
tal cual, sin estela. Como los quirks van en cada foto, rebobinar más allá de un cambio de
los interruptores DIP también los vuelve atrás, en la máquina y en los interruptores, sin
tocar lo que quedó guardado como elección de la persona.

**El rebobinado.** `tick()` llama a `rewindPush()` después de cada frame emulado; con el
interruptor apagado no guarda nada. `rewindRestart()` vacía el buffer y deja solo la foto
del presente: al cargar una ROM o un estado, al reiniciar y al cambiar de plataforma
(`machineRestarted`), y al prender el interruptor. No se puede rebobinar más allá de esos
momentos, aunque `RewindBuffer` acepte fotos de distintas plataformas.
`updateRewindInfo()` reescribe "Podés volver hasta N s." solo cuando cambia la cantidad
de segundos.

Lo mantienen apretado cuatro fuentes (`rewind.key`, `pointer`, `button` y `api`: B, el
botón ⏪ con el puntero, el mismo botón enfocado con Espacio o Enter, y `setRewinding`),
como el avance rápido, y `syncRewind()` empieza o termina según lo que esté apretado:

- `rewindStart()`: si la máquina corre, vuelve `REWIND_STEP` frames enseguida; si está en
  pausa o detenida, vuelve **un** frame y espera `REWIND_HOLD_MS` antes de seguir, así un
  toque es exactamente un frame. Calla el sonido y muestra «⏪».
- En cada tic real, el bucle llama a `rewindTick()`, que llama a
  `rewindBack(REWIND_STEP × (T ? TURBO_FACTOR : 1))`. `rewindBack(n)` saca n fotos, carga
  solo la última y llama a `machineStateLoaded(false, true)`.
- `rewind.top` dice que la foto más nueva es el presente (no se ejecutó nada desde que se
  tomó): al rebobinar se descarta primero, así cada paso es de frames enteros. Paso
  ejecuta una instrucción y lo apaga: después de unos Pasos, B vuelve al principio de ese
  frame.
- La foto que se cargó **vuelve al buffer** como la más nueva. Así, si la máquina avanza
  desde ahí (corriendo o con Frame), volver otra vez pasa por ella y no se saltea ningún
  frame ([7.13](#713-tercera-ronda-estados-guardados-y-rebobinado)).
- `rewindStop()`, al soltar: `acc = 0` (la máquina sigue desde ahí, sin ponerse al día) y
  un anuncio con lo que se volvió, en frames o en segundos desde 60 frames: "Rebobinado:
  volviste 1 frame atrás (en pausa, PC = 0x038)." o, si no había más, "No hay más para
  rebobinar: este es el momento más viejo que quedó guardado.".

**Con la pausa, los errores y el avance rápido.** Rebobinar no cambia la pausa: una
máquina en pausa sigue en pausa, y una que corría sigue corriendo al soltar. Desde un
error o desde el fin del programa, en cambio, queda **en pausa** en el frame de antes,
para mirarlo; Frame o Paso vuelven a llegar al error (E2E 46). Con T, el rebobinado va
cuatro veces más rápido (8 frames por tic) y «×4» se ve también mientras se rebobina.
Corriendo con T, cada tic real deja cuatro fotos: los 30 s de `REWIND_FRAMES` son de tiempo
emulado, 7,5 s de tiempo real a ×4.

**Lo que no se guarda ni se rebobina.** La ROM: cada estado es de la ROM de su huella, y
las ranuras de una ROM no se ven con otra. Las teclas apretadas. El generador de azar
(`Math.random`): después de cargar un estado o de rebobinar, `RND` da otros números y el
programa puede tomar otro camino. Los ajustes de la interfaz: IPF, paleta, giro,
controles y modo de pantalla quedan como estén. El contador INSTRUCCIONES del monitor,
que sigue sumando. Y el propio buffer del rebobinado, que se pierde al recargar la página.
Las banderas RPL, en cambio, son parte de la máquina y vuelven con ella: con «Ajustes por
cartucho», la próxima mirada de `syncFlags` guarda las del estado como las de la ROM
([8.28](#828-el-formato-de-los-estados-json-con-los-ceros-comprimidos)). Lo del depurador
tampoco viaja con los estados: cargar uno o rebobinar deja los puntos de corte como
están, vacía la traza y conserva el mapa de la memoria ([3.12](#312-el-depurador)). Lo
prueban los escenarios E2E 41 a 50 y 64 ([6.7](#67-los-escenarios-e2e)).

### 4.23 El Taller

El Taller escribe, ensambla y corre programas en el assembler del proyecto. Es el
conjunto de secciones «taller: …» de `chip8-ui`, al final, antes de la API de depuración.
Se abre y se cierra con el botón del lápiz (`#btn-workshop`, al lado del «?»), con Y o con
`openWorkshop`/`closeWorkshop`; sin `Chip8Asm` no aparece.

**Dónde va.** Desde 1200 px de ancho, fijo a la derecha, de arriba abajo, y la consola se
corre a la izquierda: la clase `has-workshop` del `<html>` le da al `.desk` un
`padding-right` del ancho del Taller, así la pantalla nunca queda tapada. Ese ancho es
`clamp(380px, 100vw − 840px, 640px)`: a 1440 px mide 600 y a 1280, 440; entre 1200 y
1439 px el editor usa letra de 12 px. Mientras está abierto, el monitor baja debajo de los
estantes, salvo desde 1900 px, donde entran los tres. Por debajo de 1200 px va al final de
la columna, debajo de «Tus cartuchos», y la página se corre hasta él al abrirlo. Con el
mouse o con Y, el foco va al editor; con un toque, al título, así no salta el teclado del
teléfono. En pantalla completa, Y primero sale de ella
([8.36](#836-el-taller-va-al-costado-de-la-consola-no-encima)).

**Los programas.** `wsBuiltins` arma los incluidos a partir de `CHIP8_SOURCES`
([5.2](#52-el-incrustador-toolsembed-romsjs)): los once ejemplos del tutorial
(`ejemplo:<archivo>`) y el fuente de cada cartucho (`demo:<id>`); los tuyos son `mio:N`.
El selector **Programa** los agrupa (Tus programas, Ejemplos del tutorial, Cartuchos
incluidos) y marca «· editado» y «· sin guardar». Un incluido se cambia y se guarda
(queda «editado») y **Restaurar el original** lo devuelve; los tuyos, además, se
renombran y se borran, con «Deshacer». **Nuevo** empieza uno con `WS_TEMPLATE`, que ya
corre (dibuja la A de la fuente en el medio); **Abrir .asm** trae un archivo de texto de
hasta `WS_SOURCE_MAX` caracteres; **Descargar .asm** y **Descargar .ch8** bajan el texto
y la ROM.

**El editor.** Un `textarea` sin ajuste de línea, con un margen de números de renglón que
se corre con el texto (renglones de `WS_LINE_PX`, movido con `translateY`). Tab agrega
espacios hasta la próxima columna múltiplo de `WS_TAB` y, con varios renglones elegidos,
los corre a todos; Mayús+Tab los saca; las dos se deshacen con Ctrl+Z, porque se escriben
con `execCommand('insertText')`. Ctrl+Enter, en cualquier parte del Taller, ensambla y
corre. Esc en el editor primero avisa que el próximo Tab sale del editor
(`ws.escArmed`), y la segunda vez cierra el Taller. Como el editor es un campo de texto,
lo que se escribe no le llega a la consola ([4.6](#46-teclado-keypad-y-foco)): para jugar
el programa con el teclado hay que tocar la pantalla.

**La plataforma.** La de un programa es su etiqueta `; @platform` (`chip8`, `schip` o
`xochip`), que lee `Chip8Asm.headerTags`; sin la etiqueta, CHIP-8. El selector
**Plataforma** escribe la etiqueta: le cambia el valor si ya está, o la agrega después de
los comentarios del encabezado. Con el mouse se aplica enseguida; con el teclado, recién
cuando se deja de mover (0,6 s) o al salir del selector, así recorrer las opciones no
reescribe el texto a cada flecha
([8.34](#834-la-plataforma-de-un-programa-es-su-etiqueta-platform)). Una etiqueta que no
vale es un error en su renglón.

**Ensamblar y correr.** `wsRun` llama a `wsAssemble`, que revisa el programa con
`Chip8Asm.check` (con `xochip: true` si la plataforma es XO-CHIP). Con errores, los marca
en el margen (el número en rojo, con el mensaje en el `title`), los lista debajo del
editor (un clic lleva a su renglón), pone `aria-invalid` y lleva el cursor al primero;
mientras se corrige, el programa se vuelve a revisar solo, `WS_CHECK_MS` después de la
última tecla, y la consola no cambia. Sin errores, carga los bytes con
`loadCartridge(bytes, nombre, { origin: 'taller', platform })`
([4.8](#48-carga-de-roms)): el programa corre con los ajustes por cartucho de siempre,
pero en la plataforma de su etiqueta, y no entra a «Tus cartuchos». `ws.build` recuerda la
huella, las etiquetas y el listado del último que se cargó, y `workshopSymbols()` los
devuelve mientras esa huella sea la de la ranura: el desensamblado los usa para mostrar
las etiquetas (`disasmLabel`, [4.24](#424-el-depurador)).

**Lo que se guarda.** Todo va a `localStorage['chip8-consola.taller']`:

```
{ version: 1, next, open,
  programs: [{ id: 'mio:N', name, source, saved }],
  edited: { 'ejemplo:<archivo>' | 'demo:<id>': { source, saved } },
  drafts: { <id>: fuente } }
```

`edited` son los incluidos que cambiaste y guardaste (Restaurar los borra); `drafts`, lo
que cambiaste y todavía no guardaste, que se anota solo `WS_DRAFT_MS` después de la última
tecla, al cerrar el Taller, al cambiar de programa y al ocultarse o irse la página: una
recarga no pierde nada ([8.35](#835-el-taller-guarda-a-mano-y-anota-solo-lo-que-no-se-guardó)).
`loadWorkshopStore` valida campo por campo: `version` tiene que ser 1, y cada programa
tuyo, un `id` `mio:<número>` sin repetir y un texto de hasta `WS_SOURCE_MAX` caracteres;
lo que no pasa se descarta y el Taller avisa cuántas cosas estaban dañadas. Un incluido
editado que ya no viene en `CHIP8_SOURCES` pasa a tus programas, para no perderlo. Sin
almacenamiento o sin lugar, todo sigue en memoria y lo dice la línea del Taller; a
diferencia de los ajustes, el Taller no le saca lugar a nadie para guardar lo suyo. Los
límites: `WS_PROGRAMS_MAX` programas tuyos y nombres de hasta `WS_NAME_MAX` caracteres.

**Fuera de sus secciones** el Taller tocó poco: la opción `platform` de `loadCartridge`,
el `case 'KeyY'` de `onKeyDown`, `buildWorkshop()` en el arranque y dos miembros de
`window.chip8`, `workshopInfo` y `workshopSymbols` ([4.21](#421-la-api-de-depuración-windowchip8)).

### 4.24 El depurador

Es la parte del monitor ([4.16](#416-el-monitor)) que usa lo que guarda el núcleo
([3.12](#312-el-depurador)): cuatro secciones de `chip8-ui` («depurador: desensamblado y
puntos de corte», «depurador: traza», «depurador: mapa y memoria» y «depurador:
sprites»), después de «monitor: listas con scroll propio», y unas funciones más en
«control de ejecución».

**El desensamblado.** Recorre la memoria entera de a palabras de 2 bytes, con la paridad
del PC (un salto a una dirección impar corre las filas): 2048 filas en 4 KB y 32.768 en
XO-CHIP, en una lista virtual. Sigue al PC (`dis.follow`): se queda quieta mientras el PC
se ve y, cuando se va, lo deja en la fila 8 (`DISASM_BEFORE + 1`). Cuando la persona la
mueve (la rueda, las flechas fuera de la vista, «Ir a», un toque en el mapa o en la
traza), deja de seguirlo y se enciende **Al PC**; Al PC, Inicio, un Paso, una pausa o una
parada del depurador lo vuelven a enganchar. Cada fila tiene un margen (el punto de corte
y la flecha del PC), la dirección, la palabra y el texto, y el mapa de accesos decide cómo
se muestra (`wordKind`): lo que se ejecutó, normal; lo que todavía no se ejecutó, más
tenue; una palabra que se leyó o se escribió y nunca se ejecutó, como datos
(`DB 0x78, 0xFC`); y el operando de un `F000 NNNN` ejecutado, como «(operando)». Si en la
ranura está el programa del Taller, `disasmLabel` le antepone a cada fila la etiqueta que
el programa definió en esa dirección (`fin: JP 0x20C`), con un mapa de dirección a
etiqueta que se vuelve a armar solo cuando cambia el programa. «Ir a» acepta `200`,
`0x200`, `$200` o `#200`.

**Los puntos de corte.** Se ponen y se sacan con el botón **Punto de corte** (sobre la
línea elegida o, si no hay, la del PC), con Enter en la lista o con un clic en el margen
(`toggleBreakpoint`), y se listan en PUNTOS DE CORTE, cada uno con su ×, y con «Sacar
todos» desde dos. Son del cartucho: `debugCartridgeLoaded()`, que se llama desde
`loadRomBytes`, guarda los del cartucho que se va por la huella de sus bytes
(`Core.sha1(cpu.rom)`, así anda también con lo que carga el Taller) y pone los del que
llega. Viven en memoria, no en `localStorage`, y duran hasta que se cierra la página
([8.39](#839-los-puntos-de-corte-son-de-la-rom-y-duran-lo-que-la-página)). Reiniciar,
cargar un estado, rebobinar y cambiar de plataforma no los tocan.

**Detenerse y seguir.** Cuando `runFrame` vuelve con `cpu.debugStop`, `tick` llama a
`handleDebugStop()` en lugar de tomar la foto del rebobinado (el frame quedó abierto: su
foto llega cuando se complete): la máquina queda en pausa, el desensamblado vuelve al PC
y la línea de estado lo dice, sin aviso flotante, como los errores: «Punto de corte en
0x204 («LD V1, V0»): en pausa, antes de ejecutarla.». La insignia pasa al modo `break`
([4.15](#415-transporte-estados-y-errores)). Al seguir, `setPaused(false)` llama a
`debugResume()`, que pide `cpu.skipBreakpointOnce()`: seguir siempre ejecuta la
instrucción del PC.

**Por encima, Salir y Hasta acá.** `stepOver` (O): si la instrucción del PC es un `CALL`,
`runTo(pc + 2, sp)`, y la máquina corre, frame por frame como siempre, hasta que la
subrutina vuelve con la pila a ese nivel; si no es un `CALL` (o la máquina espera una
tecla), es un Paso. `stepOut` (K): `runTo(stack[sp - 1], sp - 1)`; con la pila vacía, lo
avisa. `runToAddress` (el botón **Hasta acá**): `runTo(dirección)`, a cualquier nivel.
Los tres empiezan pausando, como N, y O y K no se repiten si la tecla queda apretada. Si
la subrutina no vuelve nunca, la máquina sigue corriendo: Espacio la pausa y cancela el
objetivo (`debugCancelRun`), igual que N y que un error. Al llegar, la línea de estado
dice «Paso por encima: la subrutina volvió. PC = …».

**La traza.** Con la máquina en pausa o detenida, `cpu.trace()` en una lista: dirección,
palabra y texto, de la más vieja a la más nueva, con el scroll al final. Los bucles se
agrupan: un bloque de hasta `TRACE_LOOP_MAX` instrucciones que se repite seguido se
muestra una vez, con «×N». Después de un error, la última fila es la instrucción culpable,
en rojo; si no, al final va la próxima, la del PC. Un clic o Enter en una fila la muestran
en el desensamblado. Corriendo, la lista no se muestra: 60 cambios por segundo no se
pueden leer ni le sirven a un lector de pantalla.

**El mapa y la memoria.** MAPA DE MEMORIA es un lienzo de 64 × 64 celdas, un byte cada
una (4 KB), con un color por clase (`byteCat`), en este orden de prioridad: código (lo que
se ejecutó, con el segundo byte de cada instrucción y el operando de `F000 NNNN`),
escrito, fuente (`0x050`–`0x09F`, y `0x0A0`–`0x13F` en SUPER-CHIP y XO-CHIP), leído, ROM
sin tocar y sin tocar; el PC y la I van marcados. En XO-CHIP va de a páginas de 4 KB, con
un selector y una tira que resume las 16. Tocar una celda lleva el código al
desensamblado y lo demás al volcado (`goAddress`). MEMORIA EN I es el volcado de toda la
memoria, 8 bytes por fila, que sigue a I hasta que «Ir a» o el mapa lo llevan a otra
dirección (**A la I** vuelve). REGIONES lista los tramos seguidos de una misma clase
(«0x200–0x215 código 22 bytes»): es la manera de recorrer el mapa con el teclado, porque
el lienzo es `aria-hidden`.

**Los sprites.** SPRITE dibuja los bytes en I como los dibujaría el próximo `DXYN`, con la
paleta: 8 × N (con el alto del último `DXYN` o con el que se elija) o 16 × 16, y en
XO-CHIP con los planos de `FN01` o con los que se elijan; al lado, cada fila en
hexadecimal y en bits. ÚLTIMOS DIBUJOS son los de `cpu.spriteLog()`, del más nuevo al más
viejo, con su miniatura, su posición, su tamaño y si chocaron; elegir uno lo lleva al
visor.

**Fuera de sus secciones** el depurador tocó el marcado del monitor y del transporte (dos
botones), `setPaused`, `tick`, `stepOnce` y `frameOnce`, `updateTransport`, `computeMode`,
los `case 'KeyO'` y `'KeyK'` de `onKeyDown`, `monitorTab` en los ajustes guardados y
nueve miembros de `window.chip8` ([4.21](#421-la-api-de-depuración-windowchip8)).

### 4.25 La ventana del archivo de la comunidad

Son las tres secciones «archivo de la comunidad: …» de `chip8-ui`, antes del estante «Tus
cartuchos».

**Las ROMs.** `ARCHIVE_DATA` es `CHIP8_ARCHIVE.data` ([5.5](#55-toolsarchivejs)): la ROM
de cada juego, por su huella, comprimida con deflate en formato zlib y escrita en
base64url sin relleno. `archiveRomBytes(sha)` la descomprime recién cuando se la pide, con
`DecompressionStream('deflate')`, una sola vez por sesión (`archiveBytesCache`), y
verifica que los bytes tengan esa huella. Devuelve una promesa con un `Uint8Array` nuevo,
o con `null` si la huella no es de un juego con su ROM; se rechaza, con un mensaje para la
persona, si el navegador no tiene `DecompressionStream` (está desde Chrome 80, Firefox 113
y Safari 16.4) o si la ROM está dañada, y en ese caso la próxima vez se vuelve a probar
([8.40](#840-las-roms-del-archivo-adentro-de-chip8html-comprimidas-de-a-una)).

**La ventana.** Un `<dialog>` modal como la ayuda (`#explorer`), que se abre con el botón
**Archivo** del título del estante de cartuchos (`#btn-explorer`, con la cantidad de
juegos), con L o con `openExplorer`. Muestra los juegos que tienen su ROM embebida
(`explorerItems`), cada uno como un cartucho del estante (un `button` con las clases
`.cart`): una ventanita con su pantalla de título, el título, los autores (o «Autor
desconocido»), la plataforma, el evento y el año, el tamaño, y las marcas «en tus
cartuchos», «ajustes recordados» y «En la ranura». Arriba, **Buscar** (por título o por
autor, sin importar mayúsculas ni tildes; con varias palabras tienen que estar todas:
`explorerFold`), **Plataforma**, **Evento o año** (los eventos y los años, cada uno con
cuántos juegos tiene) y **Orden** (`EXPLORER_SORTS`). La búsqueda, los filtros y el orden
duran lo que la página. El título del estante quedó en un `span` (`#shelf-title-text`),
que es el que nombra la sección: si no, su nombre incluiría el botón.

**Cargar.** Un clic, Enter o Espacio en una tarjeta llaman a `explorerLoad(sha)`: pide
los bytes y los carga con `loadCartridge(bytes, título, { origin: 'explorador' })`, así la
autoconfiguración del archivo (o lo que se recordó para ese juego) hace el resto y el
juego no se suma a «Tus cartuchos». La ventana se cierra y, si la pantalla no se veía
entera, la página sube hasta la consola (`explorerRevealScreen`).

**El teclado.** Una sola tarjeta está en el orden del Tab (tabindex itinerante): las
flechas recorren la grilla, igual que Inicio, Fin, RePág y AvPág, y ↑ desde la primera
fila vuelve a la búsqueda; desde la búsqueda, ↓ o Enter van a la tarjeta activa. Esc borra
la búsqueda si tiene algo y, si no, cierra; también cierran la ×, un clic en el fondo y L.
Mientras está abierta, `onKeyDown` no hace nada salvo L, y el joystick no se lee
(`gamepadActive`). Con un puntero grueso (`pointer: coarse`) el foco no va a la búsqueda,
para que el teclado en pantalla no tape la lista.

**Las miniaturas.** Cada una corre el juego aparte, en otra `Core.Chip8` con su
plataforma, sus quirks y sus IPF, `EXPLORER_THUMB_FRAMES` frames sin teclas y con un azar
sembrado con la huella (salen siempre iguales), y se queda con la pantalla que tuvo más
píxeles prendidos: casi siempre, la de título. Se hacen solo las de las tarjetas a la
vista (un `IntersectionObserver` con 200 px de margen), de a una, en tramos de hasta
`EXPLORER_SLICE_MS` en el tiempo libre entre cuadros (`requestIdleCallback`; sin él, un
tramo cada 50 ms), y ninguna con la ventana cerrada. Las 104 cuestan unos 300 ms de CPU en
total, y la consola sigue a 60 frames por segundo mientras se hacen (E2E 69). Se pintan
con los cuatro colores del juego y su giro, con escala entera en píxeles físicos; si ni a
1:1 entran en su ventanita (una pantalla de 128×64 girada queda de 64×128), se achican a
la mitad tomando el valor más alto de cada cuadrado de 2×2, así las líneas de un píxel no
desaparecen. Algunos juegos casi no dibujan nada sin una tecla, y su miniatura queda casi
negra.

**Los mensajes** van adentro de la ventana, en una región `aria-live="assertive"` debajo
de los filtros: un aviso flotante quedaría detrás del diálogo modal, y el escenario 14 no
deja que haya ningún `role="alert"` en la página. Dicen si al navegador le falta
`DecompressionStream`, si una ROM está dañada o si una carga falló. Un `chip8.html` sin
las ROMs no muestra el botón, y L lo dice en la línea de estado; la autoconfiguración
sigue andando con la tabla.

### 4.26 Estados en archivos y la lista de todos

Son las secciones «estados guardados: archivos» y «estados guardados: la lista» de
`chip8-ui`, después de las ranuras. La primera no toca el DOM al definirse:
`tests/estados-archivos.test.js` la evalúa sola, con las ayudas que usa.

**Exportar.** **Exportar**, al lado del título de «Estados», baja un `.json` con los
estados del cartucho de la ranura (sin estados, está deshabilitado y su `title` dice por
qué); en la lista de todos, **Exportar** de una tarjeta baja uno solo y **Exportar todo**,
los de todos los cartuchos. El archivo es JSON con sangría (`statesFileText`), para que se
pueda leer:

```
{ "format": "chip8-consola-estados", "version": 1, "exported": "2026-11-06T20:30:05.289Z",
  "cartridges": [
    { "sha1": "a5595b1b8c7f6a8891ed112800c4693ae1d3a4fc", "name": "contador",
      "origin": "biblioteca", "rom": "AOD7KWAcYQ1iAHIA0BV7ATsAEgB6ARIA",
      "states": [
        { "slot": "rapido", "date": "2026-11-06T20:30:03.537Z",
          "thumbnail": "data:image/png;base64,…",
          "state": { "format": "chip8-state", "version": 1, "platform": "chip8", … } } ] } ] }
```

- `origin` dice de dónde era el cartucho en la consola que exportó: `'demo'`, `'archivo'`
  (un juego del archivo de la comunidad), `'biblioteca'` o `'desconocido'`. Es
  informativo: al importar se vuelve a calcular.
- `rom`, en base64, va solo si el otro navegador puede no tener ese cartucho: no va para
  los demos ni para los juegos del archivo. Sale de «Tus cartuchos» (comprobando la
  huella) o, si el cartucho está en la ranura y no en la biblioteca, de `cpu.rom`.
- `state` es el JSON de `Core.encodeState`, como objeto (al importar se acepta también
  como texto); `slot` es `"rapido"` o un número de 1 a 4, y las fechas van en ISO 8601 (al
  importar se aceptan también en milisegundos).
- `thumbnail` es la pantallita en PNG, con los colores y el giro de la consola que
  exportó, de `THUMB_FILE_WIDTH` píxeles de ancho antes de girarla. Al importar no se usa:
  cada consola dibuja la suya.
- Los nombres de los archivos, con `fileSlug` (el de las capturas):
  `chip8-estados-AAAAMMDD-HHMMSS.json` (todos), `chip8-estados-<cartucho>-….json` (los de
  un cartucho) y `chip8-estado-<cartucho>-ranura-2-….json` o `…-rapido-….json` (uno solo).

**Importar.** Con **Importar** (en «Estados» o en la lista) o soltando el archivo sobre la
página. `dropFile` decide por el contenido y no por el nombre: si el archivo, después de
una marca BOM o de espacios, empieza con «{» (`looksLikeJson`, que mira los primeros 256
bytes) y es JSON, es un archivo de estados; si empieza con «{» pero no es JSON, es una ROM
(0x7B es `ADD VB, NN`), salvo que se llame `.json` o sea más grande que una ROM, y
entonces es un archivo de estados dañado ([8.43](#843-al-soltar-un-archivo-decide-el-contenido)).
`parseStatesFile` valida el archivo entero, con un mensaje para cada caso (vacío, no es
JSON, es de otro programa, de una versión más nueva, un estado suelto de `encodeState`,
sin la lista de cartuchos, sin ningún estado, todo dañado, más de `STATES_FILE_MAX`), y
después cada estado por separado: lo dañado (una ranura que no existe, una fecha
inválida, un estado que `Core.decodeState` rechaza) no frena el resto y va al resumen.
Cada estado se decodifica y se vuelve a codificar, así lo que entra es exactamente lo que
guardaría esta consola, y uno idéntico al que ya está guardado se saltea. Si alguna ranura
ya tiene otro estado, antes de escribir nada se abre **Ranuras ocupadas** (`askReplace`):
una casilla por ranura, sin marcar, con las dos pantallitas, y **Reemplazar todos**;
**Importar** escribe lo que iba a ranuras vacías más lo marcado, y **Cancelar**, la × o
Esc no escriben nada ([8.42](#842-importar-pregunta-antes-de-reemplazar)). Las ROMs que
trae el archivo entran a «Tus cartuchos» solo si esta consola no tiene ese cartucho
(`findCartridge`) y si su huella es la del cartucho. El resumen dice cuántos estados
entraron, cuántos ya estaban, cuáles estaban dañados y qué ROMs se agregaron.

**La lista de todos.** **Ver todos** abre «Estados guardados» (`#states-list`): un grupo
por cartucho, el de la ranura primero y después los demás según su estado más nuevo, con
su nombre, de dónde es y una tarjeta por estado, igual a una ranura de «Estados», con
**Cargar**, **Exportar** y **Borrar**. Cargar pone el cartucho en la ranura si hace falta
y después el estado: `findCartridge(sha1)` busca los bytes en los demos, en «Tus
cartuchos» (comprobando la huella) y en las ROMs del archivo (`archiveRomBytes`), y
`cartridgeLoadOptions` lo carga como desde su estante (un juego del archivo, con
`origin: 'explorador'`, como desde su ventana). Si esta consola no tiene la ROM, el grupo
lo explica, y Cargar queda bloqueado (`aria-disabled`) pero enfocable: al tocarlo, repite
por qué. Borrar trae «Deshacer» en la línea de mensajes de la ventana. Mientras está
abierta, los avisos van a esa línea (`statesNotify`, `statesSay`) y no a los avisos
flotantes, que quedarían debajo del modal.

**Las pantallitas con el giro.** `rotatedIndex` gira la pantalla de un estado como el
tubo y la captura (90°, 180° o 270°, en sentido horario), y `screenImage` la pinta con los
colores y el giro con que se ve ese cartucho (`cartridgeLook`): el de la ranura, como se ve
ahora; otro, como arrancaría (`resolveConfig`). Así se ven las ranuras, las tarjetas de la
lista, la pregunta y los archivos exportados. Las pantallitas nunca se guardaron (se
dibujan del `display` del estado cada vez), así que los estados guardados antes también
aparecen girados. Si una pantalla girada no entra ni a escala 1, se achica suavizada en
lugar de perder filas ([8.44](#844-las-pantallitas-con-el-giro-y-los-colores-del-cartucho)).

`localStorage['chip8-consola.estados']` no cambió, y `window.chip8` suma `allStates`,
`statesFile` e `importStates` ([4.21](#421-la-api-de-depuración-windowchip8)).

---

## 5. Programas de demostración y herramientas

### 5.1 El ensamblador (chip8-asm y tools/chip8asm.js)

Un ensamblador de dos pasadas, sin dependencias, que usa los mismos mnemónicos que el
desensamblador, también los de SUPER-CHIP y XO-CHIP. Desde la cuarta ronda **vive en
`chip8.html`**, en el bloque `<script id="chip8-asm">`, entre el núcleo y los cartuchos:
código puro, como el núcleo, que define un solo global, `globalThis.Chip8Asm`. Lo usa el
Taller ([4.23](#423-el-taller)), y `tools/chip8asm.js` es la línea de comandos que lo saca
de ahí ([8.32](#832-el-ensamblador-vive-en-chip8html)). Se movió tal cual, con su estilo
ES2015 y el mismo encabezado, que documenta la API, la sintaxis y las instrucciones (la
prueba del manual lee esas listas), más dos funciones nuevas, `check` y `headerTags`. La
sintaxis completa está en ese comentario y en la
[parte 4.4 del tutorial](TUTORIAL.md#44-la-sintaxis-completa); en resumen:

| Elemento | Forma |
|---|---|
| Comentario | `;` hasta el fin de la línea |
| Etiqueta | `nombre:` (letras, dígitos, `_` y `.`, sin empezar con dígito), sola o antes de una instrucción |
| Constante | `NOMBRE EQU expresión` |
| Datos | `DB` (bytes de 0 a 255, o de -128 a -1) y `DW` (palabras de 16 bits, big-endian) |
| Números | `42`, `0x2A`, `$2A`, `0b00101010`, `%00101010` |
| Expresiones | números, etiquetas y constantes con `+` y `-` |
| Mayúsculas | indistintas en instrucciones, registros y directivas; las etiquetas sí las distinguen |
| Nombres reservados | `V0`–`VF`, `I`, `DT`, `ST`, `K`, `F`, `B`, `HF`, `R`, `LONG`, las instrucciones (también las de SUPER-CHIP y XO-CHIP: `SCD`, `SCR`, `SCL`, `EXIT`, `LOW`, `HIGH`, `SCU`, `SAVE`, `LOAD`, `PLANE`, `AUDIO`, `PITCH`) y las directivas. Un nombre que solo empieza igual (`low_x`, `saved`, `R2`) sí vale. |

Las instrucciones nuevas: `SCD n`, `SCR`, `SCL`, `EXIT`, `LOW`, `HIGH`, `LD HF, Vx`,
`LD R, Vx` y `LD Vx, R` (SUPER-CHIP); `SCU n`, `SAVE Vx, Vy`, `LOAD Vx, Vy`,
`LD I, LONG nnnn`, `PLANE n`, `AUDIO` y `PITCH Vx` (XO-CHIP). `LD I, LONG nnnn` es la
única de 4 bytes (`F000` y la dirección): la tabla de codificación (`TABLE`) admite un
tamaño por patrón y una función que devuelve dos palabras. **El ensamblador no sabe para
qué máquina es el programa**: acepta todas las instrucciones en cualquier fuente, y es el
emulador, según la plataforma, el que las ejecuta o no (`SYS 0x0FF` sigue valiendo lo
mismo que `HIGH`). La opción **`xochip`** (`--xo`) solo cambia hasta dónde puede llegar el
programa: sin ella, hasta `0xFFF`; con ella, hasta `0xFFFF`. Las direcciones de 12 bits
(`SYS`, `JP`, `CALL`, `LD I`, `JP V0`) siguen yendo de 0 a `0xFFF` en los dos casos, y
`LD I, 0x1234` explica que para 16 bits está `LD I, LONG`. Con bytes más allá de `0xFFF`,
el listado usa direcciones de 4 dígitos.

Algunos detalles de diseño: las referencias hacia adelante funcionan (primera pasada:
direcciones; segunda: bytes); una constante `EQU` puede usar etiquetas y constantes
definidas más adelante, se detectan las definiciones circulares y se evalúan todas aunque
no se usen, para informar sus errores; hay formas cortas `SHR Vx` y `SHL Vx`; `JP V0, dir`
acepta cualquier dirección y `JP VX, dir` con X ≠ 0 (la lectura `BXNN` de SUPER-CHIP) solo
si X es el primer dígito de la dirección; los registros y nombres especiales no admiten
espacios adentro (`V 1` es un error) salvo `[ I ]`; `LONG` va separado del valor por un
espacio.

**API** (`globalThis.Chip8Asm` en la página, o `require('./tools/chip8asm.js')` en Node,
que devuelve el mismo objeto):

```js
const { assemble, check, formatListing, headerTags } = require('./tools/chip8asm.js');
const { bytes, labels, listing } = assemble(fuente, { origin: 0x200, xochip: false });
// bytes: Uint8Array; labels: { nombre: dirección }
// listing: una entrada por línea de la fuente: { line, addr, bytes, text }
console.log(formatListing(listing));
```

Cualquier error es un `Error` cuyo mensaje empieza con `Línea N: ` (con `err.line`): por
ejemplo `Línea 5: "bucle" ya estaba definido en la línea 3`.

**`check(fuente, opciones)`** ensambla como `assemble` pero no lanza: devuelve
`{ errors: [{ line, message }], truncated, result }`, con todos los errores de la fuente,
cada uno con el mensaje que lanzaría `assemble`, en el orden en que los encuentra (hasta
100: `truncated` dice si había más), y en `result` lo mismo que `assemble` si no hubo
ninguno. Acepta y rechaza exactamente lo mismo que `assemble`, porque los dos son el mismo
código (`build(fuente, opciones, report)`): sin `report`, el primer error se lanza; con
`report`, cada error se anota, ese renglón no genera bytes y el resto se sigue
ensamblando. Hasta el primer error los dos caminos hacen lo mismo, así que el primer
error de `check` es siempre el de `assemble`. Para no llenar la lista de errores en
cascada, un nombre que no se pudo definir (un `EQU` roto, una definición circular) no
vuelve a dar error en cada renglón que lo usa, y "no entra en la memoria" se dice una sola
vez ([8.33](#833-todos-los-errores-de-una-pasada-con-el-mismo-código-que-assemble)). Lo
que no es un error de la fuente (una fuente que no es texto, un `origin` fuera de rango)
lanza, como en `assemble`. Por ejemplo:

```js
check('CLS\nXYZ V0\nLD V1, 300\nJP nada\nfin: JP fin\n').errors
// [ { line: 2, message: 'Línea 2: instrucción desconocida: "XYZ"' },
//   { line: 3, message: 'Línea 3: valor fuera de rango para un byte (-128..255): "300" = 300' },
//   { line: 4, message: 'Línea 4: etiqueta o constante desconocida: "nada"' } ]
```

**`headerTags(fuente)`** devuelve las etiquetas `; @nombre valor` de los comentarios con
que empieza la fuente, como `{ nombre: { value, line } }` (un objeto sin prototipo; una
etiqueta repetida vale la última). Es el único lector de etiquetas del proyecto: lo usan
`tools/embed-roms.js` (`@name`, `@description`, `@controls`, `@order` y `@platform` de los
cartuchos) y el Taller (`@platform`). El ensamblador no las mira: son comentarios.

**Línea de comandos:**

```sh
node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]
node tools/chip8asm.js --help
```

Sin salida, usa el mismo nombre con `.ch8`. Ante un problema (error en la fuente, archivo
que no se puede leer o escribir, opción desconocida, argumentos de más o de menos)
imprime una línea en castellano y el uso, y sale con código 1, sin stack trace y sin
escribir nada; `--help` y `-h` salen con 0. Los errores del sistema de archivos se
explican: «la carpeta "x" no existe», «no hay permiso», «otro programa lo tiene
abierto».

**Cómo saca el ensamblador de `chip8.html`.** `tools/chip8asm.js` busca el `chip8.html`
que está al lado de su carpeta, toma el texto del bloque `chip8-asm` hasta el primer
`</script>` y lo evalúa con `vm.Script(...).runInThisContext()`, como `tests/harness.js`:
así lo que devuelve (la `Uint8Array` de los bytes, los objetos) es de este mismo proceso de
Node y las pruebas que comparan con `deepStrictEqual` siguen andando. Después deja
`globalThis.Chip8Asm` como estaba. El bloque recién se carga cuando hay algo que
ensamblar, así `--help` y los errores de argumentos andan aunque falte `chip8.html`. Si
falta el archivo, o no tiene el bloque, o el bloque no anda, lo dice en una línea
(«chip8asm: no pude leer ".../chip8.html", donde está el ensamblador: el archivo no
existe») y sale con 1; con `require`, lanza un error con el mismo mensaje. Una copia de
`tools/chip8asm.js` sin `chip8.html` al lado no ensambla: las pruebas que la corren en una
carpeta temporal copian también `chip8.html`.

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
- Cada `.asm` empieza con un bloque de comentarios con cuatro etiquetas obligatorias y una
  optativa:

  ```asm
  ; @name Rebote
  ; @description Una pelotita sonriente rebota por la pantalla y suena cada vez que toca un borde.
  ; @controls Ninguno: solo mirá.
  ; @order 1
  ; @platform xochip        (optativa: chip8, schip o xochip; sin ella, CHIP-8)
  ```

  Los cartuchos se ordenan por `@order` (y después por `id`); el primero es el que carga
  la consola al arrancar. Con `@platform xochip` el programa se ensambla con la opción
  `xochip` (puede llegar a 65.024 bytes) y la entrada incrustada lleva el campo
  `platform`, para que la consola pase a esa plataforma al cargar el demo. Las demos sin
  la etiqueta generan exactamente el mismo bloque que antes de que existiera (lo prueba
  `tests/roms.test.js`). Un valor desconocido, o la etiqueta vacía, es un error.
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

- Después de `CHIP8_DEMOS`, que no cambió, el bloque lleva **los fuentes del Taller**
  ([4.23](#423-el-taller)):

  ```js
  /* También GENERADO: los fuentes del Taller, los de las demos (roms/*.asm) y los ejemplos del tutorial (docs/ejemplos/*.asm). */
  globalThis.CHIP8_SOURCES = {
    demos: { "rebote": "; @name Rebote\n; @description Una pelotita sonriente ...", ... },
    examples: [
      { name: "01-a-mano.asm",
        description: "el programa de la parte 3, ahora en ensamblador",
        source: "; 01-a-mano.asm — el programa de la parte 3, ahora en ensamblador\n;\n..." },
      ...
    ]
  };
  ```

  `demos` tiene el fuente de cada cartucho por su `id`, en el orden de `@order`;
  `examples`, los `docs/ejemplos/*.asm` en orden alfabético. La descripción de un ejemplo
  es su `@description` o, si no tiene, la primera línea de comentario del encabezado sin
  el «nombre.asm — » del principio; `platform` va solo si el ejemplo tiene `@platform`
  (hoy ninguno). Cada ejemplo tiene que ensamblarse para su plataforma y no estar vacío;
  si no, falla con «embed-roms: docs/ejemplos/x.asm: Línea N: …». Los textos van con fin de
  línea LF. Sin la carpeta `docs/ejemplos/` (una copia de la herramienta con otros
  cartuchos), `examples` queda vacía. Los fuentes ocupan unos 100 KB del HTML.
- Las etiquetas se leen con `headerTags`, del ensamblador ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)),
  y los programas se ensamblan con el mismo: `tools/embed-roms.js` hace `require` de
  `tools/chip8asm.js`, que saca el bloque `chip8-asm` del `chip8.html` del repositorio
  (también con `--html otro.html`).
- `--check` lista en castellano qué está desactualizado (un `.ch8` que no coincide con su
  `.asm`, o el bloque del HTML, también si cambió un ejemplo del tutorial) y sale con 1;
  `tests/roms.test.js` y `tests/taller.test.js` lo corren. Falla limpio, con un mensaje,
  si falta una etiqueta, si `@order` no es un número, si `@platform` no es válida, si
  falta el bloque, si un programa o un ejemplo no ensambla (con el número de línea), si no
  entra en su plataforma o si el nombre de un ejemplo no vale. Si cambiás un
  `docs/ejemplos/*.asm`, corré `node tools/embed-roms.js`, así el Taller trae la versión
  nueva.

### 5.3 Reglas para escribir un demo

Los seis cartuchos siguen estas reglas, y las pruebas las hacen cumplir:

1. **Que ande con cualquier perfil de quirks.** No leer VF después de `OR`/`AND`/`XOR`;
   usar `SHR`/`SHL` con X = Y; volver a cargar I antes de cada `LD [I], Vx` o
   `LD Vx, [I]` (o usar `SAVE`/`LOAD`, que nunca mueven I, en XO-CHIP); no usar `JP V0`;
   no depender de que un sprite se recorte o dé la vuelta (quedarse adentro de la
   pantalla). `tests/roms.test.js` corre cada demo 600 frames con los tres perfiles (en la
   plataforma del demo), y Fuente y Autotest tienen que dibujar exactamente lo mismo con
   los tres.
2. **El presupuesto de `displayWait`.** Con el perfil VIP cada `DRW` cierra el frame. Un
   paso con k dibujos dura por lo menos k frames, y las instrucciones entre un dibujo y el
   siguiente tienen que entrar en el IPF. Rebote, por ejemplo, reparte el trabajo de cada
   paso entre sus dos `DRW` para que entre en 15 instrucciones por frame (alcanza con 14 en
   el VIP y 10 en los otros perfiles); Planos hace como mucho dos `DRW` por paso y nunca el
   sonido y el contador en el mismo paso.
3. **Un ritmo que no dependa del IPF.** Marcar el paso con DT (`LD DT, TICK` y esperar a que
   llegue a 0), no con bucles de espera: así la velocidad es la misma a 15 que a 1000 IPF.
   Las pruebas miden las velocidades que dicen los comentarios de cada `.asm`. Con IPF 7,
   el botón más lento de la consola, un paso puede no entrar en su tiempo y el demo va más
   despacio; los encabezados lo dicen con números.
4. **No ejecutar nunca datos.** Terminar en bucles (`fin: JP fin`) y poner los datos
   después del código. Las pruebas envuelven `step()` y fallan si el `pc` pasa por una
   dirección que el listado del ensamblador no marca como instrucción.
5. **La pila acotada** (las pruebas exigen `sp ≤ 2` después de 600 frames), sin detenerse
   nunca y con algo en pantalla.
6. **Si usa `FX0A`**, tener en cuenta que una tecla que ya estaba apretada no cuenta
   ([3.4](#34-fx0a-apretar-y-soltar)).
7. **Si es de SUPER-CHIP o XO-CHIP**, declararlo con `@platform`, así la consola pasa a
   esa plataforma al cargarlo. `tests/roms.test.js` comprueba además que Planos, en una
   plataforma menor, se detenga pidiendo la suya en lugar de seguir con datos
   equivocados.
8. Comentarios en castellano que expliquen qué enseña el programa, cómo está la pantalla,
   qué hace cada registro y a qué velocidad va.

La [parte 5.7 del tutorial](TUTORIAL.md#57-código-que-anda-en-cualquier-intérprete) explica
estas mismas reglas para quien escribe sus propios programas.

### 5.4 Los seis cartuchos

| `@order` | Cartucho | Bytes | Qué enseña | Notas |
|---|---|---|---|---|
| 1 | **Rebote** (`rebote`) | 177 | `DRW` con XOR para borrar, ritmo con DT, pitido con ST | 30 pasos por segundo desde IPF 15 (unos 19 en el VIP y 22 en los otros perfiles con IPF 7). Dibuja la pelota nueva antes de borrar la vieja: el cuadro intermedio es el XOR de las dos, una silueta de 36 de los 44 píxeles. |
| 2 | **Teclado** (`teclado`) | 571 | `SKP`/`SKNP` para varias teclas a la vez, `FX29`, `FX55`/`FX65` y resaltar con XOR | El repaso de las 16 teclas está desenrollado (6 instrucciones por tecla, 8 estados por `FX65`): una tecla se ilumina en 7 frames como mucho a IPF 15 (13 a IPF 7). |
| 3 | **Atrapa** (`atrapa`) | 374 | `RND`, puntaje con `FX33`/`FX65`/`FX29`, sprites movidos con un solo `DRW` de "diferencia", velocidad fraccionaria con un acumulador de 8 bits y el acarreo en VF, `FX0A` para reiniciar | 20 pasos por segundo. La caída empieza en 96/256 de píxel por paso y sube 4 por punto hasta 160/256: así el bloque tarda al menos 34 pasos en caer y la paleta, como mucho 28 en cruzar, o sea que todo bloque se puede atrapar. Cuenta como atrapado si toca la paleta en cualquier paso con y entre 26 y 28. |
| 4 | **Autotest** (`autotest`) | 1089 | CHIP-8 probándose a sí mismo | 19 comprobaciones en una grilla de 4×5 con tilde o cruz, y un resumen. Al terminar deja **VD = 19** (pruebas hechas) y **VE = fallas**, en `fin: JP fin`: lo leen las pruebas automáticas. La prueba del temporizador se rinde a las ~2000 instrucciones si DT no cambia. No usa `JP V0` a propósito. |
| 5 | **Fuente** (`fuente`) | 88 | La fuente incorporada con `FX29` | Los 16 dígitos en dos filas dentro de un marco. Imagen fija. |
| 6 | **Planos** (`planos`, `@platform xochip`) | 531 | Lo nuevo de XO-CHIP: `HIGH`, dos planos y cuatro colores con `PLANE`, sprites de 16×16, la fuente grande, los cuatro desplazamientos (que corren solo los planos elegidos), `SAVE`/`LOAD` y el sonido con `AUDIO` y `PITCH` | Un disco (plano 1) se mueve con un `DRW` de diferencia de 16×16; un rombo (solo en el plano 2) se mueve **sin dibujar**, corriendo su plano; donde se pisan aparece el cuarto color. 12 pasos por segundo, una nota por pared y un contador de rebotes con la fuente grande. Va igual con los tres perfiles de 15 a 10.000 IPF (alcanza con 14 IPF con el vblank y 12 sin él). La W (tecla 5) frena al rombo. |

Los encabezados de cada `.asm` documentan la pantalla, los registros y las velocidades
medidas; la [parte 6 del tutorial](TUTORIAL.md#6-leer-un-programa-real) recorre Rebote y
Atrapa, y la [parte 9](TUTORIAL.md#9-más-allá-de-chip-8-super-chip-y-xo-chip), Planos.

### 5.5 tools/archive.js

La tabla de autoconfiguración sale del archivo de la comunidad de John Earnest
(*chip8Archive*, licencia CC0 1.0): los programas de las Octojam y otros eventos, cada uno
con las opciones con que se juega en Octo. Cuatro comandos:

```sh
node tools/archive.js update                 # baja el archivo y escribe data/archive.json (necesita internet)
node tools/archive.js embed [--check] [--html otro.html]   # escribe <script id="chip8-archive">
node tools/archive.js download               # baja las ROMs a roms/archivo/ y escribe su LEEME.md
node tools/archive.js test [--frames N] [--sheet hoja.png] [--only id1,id2] [--json reporte.json]
```

- **`update`** baja `programs.json` y cada ROM del repositorio del archivo (a memoria: no
  las guarda), calcula la huella SHA-1 de cada una, averigua el commit y escribe
  `data/archive.json`: la fuente, la licencia, el commit, la fecha y, por programa, `id`,
  título, autores, evento, fecha, plataforma, tamaño, `sha1` y las opciones de Octo tal
  cual. Avisa si dos programas tienen la misma ROM, si uno no dice su plataforma (se toma
  CHIP-8) o si usa algo que la consola no tiene (`vfOrderQuirks`).
- **`embed`** convierte cada programa con `toEntry`/`fromOctoOptions` y escribe el bloque,
  ordenado por huella; si el bloque no existe, lo agrega después de `chip8-roms`. Respeta
  CRLF y es idempotente; con `--check` solo verifica (`tests/archive.test.js` lo corre).
  La fuente se guarda **sin `https://`** ([8.23](#823-ninguna-dirección-de-red-en-chip8html)).
  Desde la cuarta ronda, `embed` mete también **las ROMs**, que lee de `roms/archivo/`
  (`readRoms` comprueba el tamaño y la huella de cada una): al final del bloque, aparte,
  `CHIP8_ARCHIVE.data` guarda cada ROM por su huella, una línea por ROM, en el orden de las
  huellas, comprimida por separado con deflate en formato zlib (el `'deflate'` de
  `DecompressionStream`) y escrita en base64url sin relleno:

  ```js
  /* Los bytes de cada ROM, por su huella: deflate (formato zlib) en base64url. La consola descomprime solo la que se pide. */
  globalThis.CHIP8_ARCHIVE.data = {
    "018442698067c95d67e27a94e6642c11f049f108": "eNoT6mqoYcxlUFLMYLRkUHLuWGTBcPdgLaOtgxB7NWMuA8O7…",
    …
  };
  ```

  Ocupan unos 726.000 bytes, y la tabla de arriba quedó igual de legible, una línea por
  juego. Para leer una en Node: `zlib.inflateSync(Buffer.from(texto, 'base64url'))`. Lo que
  ya está embebido y se descomprime a los bytes correctos se deja como está (`packRoms`):
  zlib no garantiza la misma salida en todas sus versiones, y así volver a embeber no cambia
  nada y `embed --check` sigue siendo una comparación exacta del texto. `--check` dice
  además qué ROMs faltan o tienen otros bytes (`staleRoms`), y `embed` arregla solo esas
  ([8.40](#840-las-roms-del-archivo-adentro-de-chip8html-comprimidas-de-a-una)). Las
  funciones nuevas: `packRom`, `unpackRom`, `readRoms`, `packRoms`, `readPacked` y
  `staleRoms`; `buildBlock(data, packed, eol)` ahora pide los textos comprimidos.
- **`download`** baja a `roms/archivo/<id>.ch8` cada ROM que falte o que no coincida con
  su huella (las que ya están bien no se vuelven a bajar), comprueba la huella SHA-1 de
  cada una contra `data/archive.json` (si una cambió, falla con un error que pide correr
  `update`), avisa si en la carpeta hay archivos que no son del archivo y escribe el
  índice, `roms/archivo/LEEME.md` (`buildReadme`). Necesita conexión solo para las que
  faltan. Como `update`, al terminar recuerda que hay que correr `embed`.
- **`test`** corre cada juego con su configuración en el núcleo de `chip8.html` (900
  frames, apretando teclas al azar de forma reproducible) e informa errores, salidas,
  instrucciones ignoradas, pantallas vacías, si usó alta resolución, dos planos o audio.
  Con `--sheet` guarda una hoja de contactos PNG (8 por fila, con borde rojo los que se
  detuvieron con error), armada con un codificador PNG mínimo propio sobre `zlib`. Usa las
  ROMs de `roms/archivo/` (`localOrFetch`) y baja a memoria solo las que falten o no
  coincidan con su huella: con la carpeta completa anda sin conexión, y los 104 juegos
  corren en menos de un segundo. Sale con código 1 si algún juego se detuvo con un error.

**`roms/archivo/`** tiene las 104 ROMs del archivo tal como estaban en su commit
`761e3ff` (925 KB entre todas). El archivo es de dominio público (CC0), así que se pueden
repartir con el repositorio, y con ellas cualquiera puede probar la autoconfiguración sin
salir a buscarlas. Son también la fuente de las ROMs que `embed` mete en `chip8.html`.
`LEEME.md` las presenta y tiene una tabla ordenada por título: el juego, un enlace al
archivo, la plataforma, la velocidad (IPF), los autores (sin el texto
de ejemplo de la plantilla del archivo, "your name here", que traen 11 programas) y el
evento. No se edita a mano: `tests/archive.test.js` exige una ROM por programa, con su
huella y su tamaño, ningún archivo de más y el índice idéntico al que arma `buildReadme`.

La correspondencia con las opciones de Octo:

| Octo | Consola |
|---|---|
| `tickrate` (20 si falta) | `ipf`, limitado a 1–10.000 |
| `logicQuirks`, `shiftQuirks`, `jumpQuirks`, `clipQuirks`, `vBlankQuirks` | `vfReset`, `shifting`, `jumping`, `clipping`, `displayWait` |
| `loadStoreQuirks` | `memory`, **invertido** (en Octo, `true` = I no se mueve) |
| `backgroundColor`, `fillColor`, `fillColor2`, `blendColor` (los de Octo si faltan) | `colors[0..3]`: fondo, plano 1, plano 2, ambos |
| `screenRotation` | `rotation` (0, 90, 180 o 270) |
| `vfOrderQuirks` | No existe en la consola (escribe VF siempre al final); se avisa. Ninguno de los 104 lo usa. |

Los números de hoy (commit `761e3ff` del archivo): 104 programas, 50 de CHIP-8, 26 de
SUPER-CHIP y 28 de XO-CHIP; 96 usan exactamente los quirks de Octo por defecto (los del
perfil XO-CHIP); las velocidades van de 7 a 10.000 IPF. `node tools/archive.js test`
informa que 103 de los 104 corren sin errores: *Super Square* desborda la pila en su
pantalla de fin de partida, algo que con los 12 niveles de Octo pasaría todavía antes
([7.11](#711-integración-y-hallazgos-notables)). El manual cita estos números y
`tests/manual.test.js` comprueba que sigan siendo los de `data/archive.json`.

### 5.6 tools/serve.js

Un servidor estático de unas 50 líneas: `node tools/serve.js [puerto]` (o `npm run serve`), por
defecto en `http://localhost:8008/`, también con la variable `PORT`. Sirve la carpeta del
repositorio, manda `/` a `chip8.html`, rechaza rutas que salgan de la carpeta y responde
con `Cache-Control: no-store`. La consola no lo necesita: existe para la vista previa
y para probar por HTTP.

### 5.7 tools/e2e.js

Pruebas de punta a punta en un navegador de verdad, sin dependencias (unas 7000 líneas).
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
                key y código virtual), mouse, toques con varios dedos, archivos por
                DOM.setFileInputFiles o por el diálogo de «Cargar ROM» interceptado
                (Page.setInterceptFileChooserDialog), Input.dispatchDragEvent con archivos,
                viewport, escala y toque emulados, prefers-reduced-motion, y capturas que
                esperan a que termine el encendido animado; instrument() envuelve
                cpu.runFrame, step y reset para contar frames
Scenario        check(ok, descripción, detalle) e info(texto); PASA si todas las
                comprobaciones pasan
main()          corre los escenarios, imprime PASA / FALLA, guarda capturas y siempre
                limpia: Browser.close, taskkill, cierra lo que quede con el perfil y lo borra
```

Para los escenarios de la segunda ronda hay más herramientas: las ROMs de prueba se arman
con el ensamblador del repositorio (por ejemplo, una de XO-CHIP con los cuatro colores);
las entradas del archivo de la comunidad se registran para la prueba con
`window.chip8.registerArchiveEntry`, así no dependen de los juegos reales; las descargas
de la captura se reciben con `Browser.setDownloadBehavior` en la carpeta temporal y se
decodifican con un lector de PNG propio (sobre `zlib`) para compararlas píxel por píxel con
`cpu.display` y la paleta; los joysticks son "de mentira": `navigator.getGamepads`
devuelve los que conecta el escenario; y `localStorage` se inspecciona para comprobar lo
que quedó guardado.

Los de la tercera ronda suman algunas más: comparan, píxel por píxel, cada pantallita de
«Estados» con la pantalla del estado guardado pintada con la paleta, y el lienzo y el
monitor con `cpu.display` después de cargar un estado; envuelven `runFrame` para grabar
una huella de la máquina en cada frame de la primera pasada, y así comprueban que cada
momento al que se vuelve rebobinando es exactamente uno de esos y que, al soltar, los
frames que siguen son los mismos que la primera vez; reescriben la fecha de un estado en
`localStorage` para ver "hace 5 min" y "ayer 18:20" después de recargar; llenan el
`localStorage` de verdad hasta el `QuotaExceededError` y meten un estado dañado; y, en el
escenario 50, miden los huecos entre cuadros de `requestAnimationFrame` (el promedio y el
percentil 95) mientras se corre y se rebobina con XO-CHIP a 1000 IPF.

Los de la cuarta ronda (del 51 al 77) suman otras: las teclas `PageUp` y `PageDown`, para
las listas del monitor y la ventana del archivo; el selector de archivos interceptado
también para «Abrir .asm» e «Importar»; las descargas del Taller y de los estados,
recibidas en la carpeta temporal y comparadas byte por byte (los `.ch8` con los que da
`tools/chip8asm.js`, los archivos de estados campo por campo y sus pantallitas, PNG
decodificados, píxel por píxel); los colores leídos del lienzo del mapa de la memoria y
del visor de sprites; las miniaturas del archivo, comparadas con la misma cuenta hecha en
Node con el núcleo del bloque; un `localStorage` que se llena hasta el
`QuotaExceededError` para el Taller; y la medida de los cuadros por segundo a 10.000 IPF
mientras se escribe en el Taller, con un punto de corte puesto, mientras se hacen las
miniaturas y con la lista de estados abierta.

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
node --test                                   # todas las pruebas unitarias (o: npm test), ~5 s
node --test tests/xochip.test.js              # un archivo
node --test --test-name-pattern="FX0A"        # por nombre
node tools/e2e.js                             # E2E en Chrome o Edge (o: npm run e2e), unos minutos
node tools/e2e.js --only 1,5 --shots ../capturas   # algunos escenarios, capturas afuera del repo
node tools/embed-roms.js --check              # ¿están al día los cartuchos y los fuentes del Taller?
node tools/archive.js embed --check           # ¿están al día la tabla del archivo y sus ROMs?
node tools/archive.js test                    # los 104 juegos del archivo, con las ROMs de roms/archivo/
node tools/archive.js download                # baja a roms/archivo/ las ROMs que falten (necesita internet)
```

Antes de dar por terminado un cambio: `node --test` y, si tocaste la interfaz,
`node tools/e2e.js`. Sin `node` en el PATH, ver [9.10](#910-trabajar-sin-node-en-el-path).

### 6.2 Qué cubre cada archivo

| Archivo | Qué prueba |
|---|---|
| `tests/instructions.test.js` | Las 35 instrucciones de CHIP-8, un grupo por instrucción ("8XY4 ADD VX, VY"): valores normales y bordes, VF en 0 y 1, VF escrito al final con X = F, Y = F con el valor original, que no se toquen otros registros, avance del `pc` y saltos, pila anidada, `BNNN` en los dos modos, `CXNN` con un azar inyectado, `FX29` para los 16 dígitos, `FX33`, `FX55`/`FX65` con los dos modos de `memory` y la vuelta de I en `0xFFF`. |
| `tests/quirks.test.js` | Cada quirk prendido y apagado, los valores y nombres de los perfiles, que `DEFAULT_QUIRKS` sea una copia, que ningún cambio de la máquina llegue a los perfiles, la mezcla de `setQuirks`, y que un cambio entre pasos se aplique. |
| `tests/display.test.js` | `DXYN` en CHIP-8: XOR, bit alto a la izquierda, colisión (hasta de un píxel), N = 0, sprites que cruzan `0xFFF`, `DFF1` (VF leído como coordenada antes de escribir la bandera), vuelta de la coordenada inicial, recorte o vuelta en el borde derecho, abajo y en la esquina, `00E0`, `displayDirty` y los 16 glifos. |
| `tests/timers-keys.test.js` | `tickTimers`, un tic por `runFrame` sea cual sea el IPF, `step` sin timers, `FX15`/`FX18`/`FX07`, `setKey`, `EX9E`/`EXA1` para las 16 teclas y con VX > 15, y `FX0A`: bloquea, espera apretar y soltar, ignora una tecla que ya estaba apretada, deja correr los timers, corta el frame y `reset` la cancela. |
| `tests/core-api.test.js` | Las constantes y los bytes de la fuente, el estado inicial, `loadRom` (límite, mensaje que sugiere XO-CHIP, copia, `ArrayBuffer`), `reset`, `step` y `runFrame` (valores de retorno, cortes), fetch big-endian y en direcciones impares, unos 50 opcodes inválidos, desbordes de pila y que una máquina detenida siga detenida. |
| `tests/disasm.test.js` | El texto exacto de cada familia en CHIP-8, las palabras inválidas como `DW`, mayúsculas y relleno, `disassembleRange` (cantidad 0, inicio impar, vuelta en `0xFFF`) y el argumento opcional `quirks`. |
| `tests/mutation-gaps.test.js` | Los casos que dejó el mutation testing de la primera ronda ([6.5](#65-mutation-testing)). |
| `tests/platform.test.js` | Las plataformas: las exportaciones nuevas (congeladas), el constructor con `platform` (CHIP-8 por defecto y exactamente como antes; las fuentes en memoria según la plataforma), `setPlatform` (memoria, reinicio, banderas, errores, una ROM que no entra), los límites y mensajes de `loadRom`, los avisos (`hint`) de cada instrucción de pantalla, los errores de plataforma y `errorInfo` (con direcciones de 3 o 4 dígitos), `FN01` con N > 3 y `FX02` con X ≠ 0 inválidos, `extendedInfo` contra una tabla de referencia en las 65.536 palabras, el desensamblador por plataforma (incluido `F000` con y sin la palabra siguiente) y `disassembleRange` con filas de 4 bytes y la vuelta en `0xFFFF`, y `sha1` contra `node:crypto`. |
| `tests/superchip.test.js` | Las instrucciones de SUPER-CHIP con la semántica de Octo, en las plataformas `schip` y `xochip`, contra una implementación de referencia mínima escrita en la prueba: `00CN`, `00FB`, `00FC`, `00FE`/`00FF`, `DXYN` en alta resolución, `DXY0` en las dos resoluciones, la fuente grande (`FX30`), las banderas (`FX75`/`FX85`), `EXIT` y `displayWait` con los dibujos nuevos. |
| `tests/xochip.test.js` | Las de XO-CHIP, también contra una referencia propia: `5XY2`/`5XY3` (en los dos sentidos), `F000 NNNN` y los saltos condicionales que lo saltean entero, `FN01` y el dibujo en dos planos, `00E0` y los desplazamientos sobre los planos elegidos, `00DN`, el audio (`F002`, `FX3A`, `patternRate`) y la memoria de 64 KB (PC, I, accesos, `JP V0`, `CALL` y la vuelta en `0xFFFF`), y un programa completo de XO-CHIP. |
| `tests/asm.test.js` | El ensamblador: cada instrucción de CHIP-8, `JP VX`, números, etiquetas, mayúsculas, `EQU`, `DB`/`DW`, expresiones, comentarios, el listado, cada clase de error con "Línea N: ", la ida y vuelta de las 65 536 palabras y la línea de comandos (incluidos los errores en castellano, sin stack trace). Desde la cuarta ronda prueba el bloque `chip8-asm`, que `tests/harness.js` evalúa como el núcleo. |
| `tests/asm-extendido.test.js` | Las instrucciones de SUPER-CHIP y XO-CHIP del ensamblador, `LD I, LONG` (4 bytes), los errores nuevos, los nombres reservados nuevos, la opción `xochip`/`--xo` (hasta `0xFFFF`), el listado con direcciones de 4 dígitos y la ida y vuelta con el desensamblador de SUPER-CHIP y de XO-CHIP en todas las palabras. |
| `tests/asm-bloque.test.js` | El ensamblador como bloque `chip8-asm` ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)): código puro (en un contexto vacío define solo `Chip8Asm` y ensambla, y no nombra nada del navegador ni de Node); `tools/chip8asm.js` con `require` (las mismas funciones y los mismos resultados en los 17 fuentes del proyecto, sin dejar el global) y sin `chip8.html`, sin el bloque o con el bloque roto (el error en una línea; `--help` anda igual); `check()` contra `assemble()` en cada fuente del proyecto y en 600 fuentes rotas al azar (el primer error es el mismo; sin errores, el mismo resultado), sin errores en cascada, la memoria llena una vez y el tope de 100; y `headerTags()`. |
| `tests/roms.test.js` | Los cartuchos: cada `.asm` ensambla idéntico a su `.ch8` y tiene sus etiquetas; `embed-roms --check` y el bloque incrustado; el propio `embed-roms.js` sobre un HTML temporal con CRLF, y la etiqueta `@platform`; 600 frames por demo y perfil sin ejecutar datos; y el comportamiento de cada uno: el movimiento y las velocidades de Rebote; las 16 teclas de Teclado; en Atrapa, la paleta, que todo bloque se pueda atrapar y el reinicio con apretar y soltar; Autotest con VD = 19 y VE = 0 en cada perfil e IPF, y los núcleos saboteados que tiene que detectar; la posición de cada glifo en Fuente; y en Planos, la pantalla, los planos limpios, los cuatro valores, las velocidades, el contador, el sonido, la tecla y que vaya igual con cualquier perfil e IPF. |
| `tests/archive.test.js` | `tools/archive.js` (las opciones de Octo pasadas a los ajustes, colores, giro, eventos, `toEntry`), `data/archive.json` (fuente, licencia, commit; huellas únicas, plataformas válidas, tamaños que entran), las ROMs de `roms/archivo/` (una por programa, con su huella y su tamaño, y el índice `LEEME.md` al día) y el bloque incrustado (al día, una entrada válida por programa, sin `</script` ni comentarios HTML, entre `chip8-roms` y `chip8-ui`, `embedInto` idempotente y con CRLF). Desde la cuarta ronda, las ROMs embebidas (`CHIP8_ARCHIVE.data`): cada una se descomprime, con `zlib` y con el `DecompressionStream` de Node, a los bytes de `roms/archivo/`; una línea por ROM en base64url sin relleno; `packRom`, `readRoms`, `packRoms` y `readPacked`; y `embed --check` sobre un HTML con ROMs equivocadas, que después `embed` arregla. |
| `tests/estados.test.js` | Los estados guardados y el rebobinado: guardar a mitad de un programa y cargar en otra máquina sigue igual frame a frame (timers, `CALL`/`RET`, `FX0A`, SUPER-CHIP, XO-CHIP con dos planos, audio y memoria de 64 KB, máquinas detenidas y terminadas); `loadState` cambia de plataforma sin recargar la ROM; 54 validaciones que dejan la máquina intacta; el formato de texto (ida y vuelta, también con estados al azar; la compresión en los bordes de la base 128; tamaños; cada error; 400 textos cambiados al azar); y `RewindBuffer` (orden, páginas compartidas y la cuenta exacta de los bytes, límites, `clear`, cambios de plataforma entre fotos, `push` y `pop` intercalados y el rendimiento). |
| `tests/estados-archivos.test.js` | Los archivos de estados, el giro de las pantallitas y `findCartridge` ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)): evalúa sola la sección «estados guardados: archivos» de `chip8-ui`, con las ayudas que usa sacadas de `chip8.html`; el archivo que se arma (campos y su orden, ida y vuelta, estados reales de las tres plataformas, los nombres de archivo), el mensaje de cada archivo que no sirve (vacío, no JSON, otro programa, otra versión, un estado suelto, todo dañado), cada estado dañado con su motivo, ranuras y fechas, la ROM (buena, ajena, rota, del tamaño máximo), qué pasa con cada ranura al importar y el resumen, el giro contra una referencia escrita aparte, distinguir un archivo de estados de una ROM, y `findCartridge` con demos, «Tus cartuchos» y `archiveRomBytes`. |
| `tests/depurador.test.js` | El depurador del núcleo: la traza (orden, tope, la instrucción que falla), el mapa de accesos (cada instrucción que lee o escribe, el operando de `F000 NNNN`, la vuelta en `0xFFF`), el registro de dibujos, los puntos de corte (se detiene antes y al seguir ejecuta, el frame abierto, frenar y seguir da lo mismo frame por frame, no son parte del estado), `runTo` (paso por encima con recursión, salir, «hasta acá», una subrutina que no vuelve) y qué borran `reset` y `loadState`. |
| `tests/taller.test.js` | Los fuentes del Taller (`CHIP8_SOURCES`, [5.2](#52-el-incrustador-toolsembed-romsjs)): el de cada cartucho y los once ejemplos del tutorial, iguales a sus archivos y ensamblando a sus `.ch8`, la descripción de cada ejemplo, el bloque sin ningún `<`; y `embed-roms.js` con los ejemplos en una carpeta temporal (`@platform`, `@description`, los errores en castellano, un nombre de archivo que no vale, CRLF, `--check` y sin la carpeta `docs/ejemplos/`). |
| `tests/tutorial.test.js` | El tutorial y sus ejemplos ([6.6](#66-pruebas-de-la-documentación)). |
| `tests/manual.test.js` | El manual, el README y este documento ([6.6](#66-pruebas-de-la-documentación)). |
| `tests/single-file.test.js` | El contrato del archivo único: los seis bloques, cada uno una vez, con la etiqueta de apertura exacta y en orden; ningún `</script` ni `</style` adentro; ninguna dirección `http(s)`, `@import`, ni `src`/`href`/`url()` que no sea `data:` o `#ancla`; y que los cinco bloques de código compilen. |

### 6.3 Números actuales

Medido el 6 de noviembre de 2026 con Node 24.18 (`node --test` desde la raíz), al
terminar la cuarta ronda: **1602 pruebas en 229 grupos**, todas pasan y ninguna salteada,
en unos 6 s.

| Archivo | Pruebas |
|---|---|
| `tests/instructions.test.js` | 175 |
| `tests/superchip.test.js` | 151 |
| `tests/platform.test.js` | 141 |
| `tests/xochip.test.js` | 129 |
| `tests/disasm.test.js` | 121 |
| `tests/estados.test.js` | 105 |
| `tests/core-api.test.js` | 103 |
| `tests/asm.test.js` | 96 |
| `tests/asm-extendido.test.js` | 95 |
| `tests/roms.test.js` | 90 |
| `tests/tutorial.test.js` | 84 |
| `tests/display.test.js` | 49 |
| `tests/timers-keys.test.js` | 46 |
| `tests/depurador.test.js` | 41 |
| `tests/manual.test.js` | 38 |
| `tests/estados-archivos.test.js` | 36 |
| `tests/quirks.test.js` | 30 |
| `tests/archive.test.js` | 29 |
| `tests/asm-bloque.test.js` | 18 |
| `tests/mutation-gaps.test.js` | 12 |
| `tests/taller.test.js` | 9 |
| `tests/single-file.test.js` | 4 |
| **Total** | **1602** |

Todas pasan cuando los cartuchos, los fuentes del Taller, la tabla del archivo y sus ROMs
incrustados están al día y `roms/archivo/` está completa. Las pruebas del grupo
"chip8.html tiene las demos incrustadas" (`embed-roms --check` y la comparación de
`CHIP8_DEMOS` con las fuentes), las de `CHIP8_SOURCES` en `tests/taller.test.js`, la de
`archive.js embed --check`, las de las ROMs embebidas y las de `roms/archivo/` fallan a
propósito si alguien cambia un `roms/*.asm`, un `docs/ejemplos/*.asm` o
`data/archive.json` y no vuelve a incrustar o a bajar las ROMs.

Fuera de `node --test`: `node tools/archive.js test` informa que 103 de los 104 juegos del
archivo corren sin errores ([5.5](#55-toolsarchivejs)).

La E2E: **77 escenarios** ([6.7](#67-los-escenarios-e2e)). En la cuarta ronda, cada agente
pasó la E2E completa en su copia, con los 50 de antes y los suyos, y con el código ya
junto pasaron los 76 de entonces en una corrida completa; el 77 se agregó después y pasó
solo. El detalle, y la corrida de los 77 juntos, están en
[7.18](#718-cuarta-ronda-la-verificación). Al terminar la tercera ronda, los 50 de
entonces habían pasado en tres corridas seguidas: los 24 de la primera ronda, los 16 de la
segunda y 10 nuevos para los estados guardados y el rebobinado. En la segunda ronda,
los 40 de entonces pasaron en 4 corridas completas seguidas, de unos 188 s cada una;
algunas medidas de esas corridas: *Planos* a 60 frames por segundo; el avance rápido da
×4,00 instrucciones y tics de los timers; la captura es un PNG de 640×320; con IPF 10.000,
unas 601 900 instrucciones por segundo. Y de la primera
ronda, en Chrome 154: `requestAnimationFrame` a 60,0 por segundo; Rebote a 59,8 frames por
segundo con IPF 15 y con IPF 1000 (579 instrucciones por segundo, por `displayWait`); un
bucle sin dibujo a IPF 1000, 60,3 frames y 60 259 instrucciones por segundo; la pelota
recorre 30 píxeles en 1 s.

### 6.4 Pruebas de caja negra

En la primera ronda, las seis suites del núcleo (`instructions`, `quirks`, `display`,
`timers-keys`, `core-api` y `disasm`) las escribió un agente que **no leyó el código del
núcleo**: solo el contrato del proyecto ([7.1](#71-primero-el-contrato)) y
`tests/harness.js`. El núcleo lo escribió otro agente, al mismo tiempo. Así, las pruebas
verifican lo que el contrato promete y no lo que el código hace. Donde el contrato no decía
nada (por ejemplo, qué devuelve `step()` en la instrucción que falla, o el formato
hexadecimal exacto de los mensajes de error), las pruebas no afirman nada, o afirman lo
mínimo. En la primera corrida contra el núcleo real fallaron 2 de 515, y las dos eran
errores de las pruebas; ninguna afirmación se debilitó para que coincidiera con la
implementación.

En la segunda ronda se siguió la misma idea por otro camino: `tests/superchip.test.js` y
`tests/xochip.test.js` calculan cada pantalla esperada con **implementaciones de
referencia mínimas escritas dentro de la prueba**, independientes del núcleo, y
`tests/platform.test.js` compara `extendedInfo` con una tabla de referencia en las 65.536
palabras y `sha1` con `node:crypto`. Las pruebas de CHIP-8 de la primera ronda no se
tocaron, salvo para el mensaje de `loadRom`, que ahora sugiere XO-CHIP.

En la tercera ronda, la referencia de `tests/estados.test.js` es la máquina misma: una
corre N frames, guarda su estado y sigue M frames más; otra, nueva y con la misma ROM,
carga el estado y corre los mismos M frames, y las dos tienen que coincidir frame por
frame en todo lo que se ve desde afuera (pantalla, registros, pila, timers, sonido,
banderas, memoria, la espera de tecla y los errores). Así la prueba no necesita saber
cómo se guarda un estado para saber si quedó bien guardado. La cuenta de los bytes de
`RewindBuffer` se compara con una cuenta propia de las páginas que cambiaron entre dos
memorias.

En la cuarta ronda se usaron referencias del mismo tipo. `tests/depurador.test.js` compara
una máquina que se detiene en puntos de corte y sigue con otra igual que no se detiene:
200 frames, estado por estado. `tests/asm-bloque.test.js` compara `check` con `assemble`
en cada fuente del proyecto y en 600 fuentes rotas al azar, sin saber qué error debería
dar cada una: solo exige que el primero sea el mismo. Y `tests/estados-archivos.test.js`
compara el giro de las pantallitas con una implementación escrita aparte, dentro de la
prueba.

### 6.5 Mutation testing

**Primera ronda.** Para medir si las pruebas atrapan errores de verdad, en la revisión se
le metieron **202 errores a propósito** (mutantes) al bloque `chip8-core`, uno por vez:

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
- **Antes:** 184 de 202 muertos (91,1 %); contando solo pruebas de comportamiento (no la
  prueba del tutorial que compara un fragmento citado del núcleo), 180 de 202 (89,1 %).
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
  prueba de texto, son **equivalentes**: no pueden cambiar el comportamiento (por
  ejemplo, `stack[sp-- - 1]` lee el mismo lugar que `stack[--sp]`). O sea: **190 de los
  190 mutantes que pueden cambiar el comportamiento los mata una prueba de comportamiento
  (100 %)**.

**Segunda ronda.** Con las plataformas terminadas, se le metieron **65 errores a
propósito al código nuevo del núcleo**, y las pruebas los detectaron **a todos**.

**Límites.** Solo se mutó el núcleo, no la interfaz ni las herramientas. Los programas que
lo hicieron quedaron fuera del repositorio; con la descripción de arriba se pueden rehacer
en una tarde.

### 6.6 Pruebas de la documentación

La documentación también se prueba, para que no se aleje del código:

- **`tests/manual.test.js`**, sobre el manual:
  - Cada bloque de código `asm` se ensambla tal cual, salvo los marcados como fragmento
    (la primera línea empieza con `; Fragmento`): a esos se les agregan las etiquetas que
    faltan y el comentario inicial tiene que nombrarlas.
  - **La marca de plataforma.** Entre los comentarios iniciales, `; Plataforma:
    SUPER-CHIP` o `; Plataforma: XO-CHIP` (CHIP-8 si no dice nada). Un bloque de XO-CHIP se
    ensambla con `{ xochip: true }`, y un bloque que usa instrucciones de SUPER-CHIP o
    XO-CHIP tiene que declarar una plataforma que las tenga.
  - Los ejemplos que terminan en `fin: JP fin` se ejecutan en su plataforma con cada perfil
    y tienen que llegar a ese bucle sin detenerse ni ignorar ninguna instrucción.
  - La referencia de la sección 13.11 tiene una ficha por cada instrucción que documenta
    el encabezado del ensamblador (el del bloque `chip8-asm`; hasta la tercera ronda, el
    de `tools/chip8asm.js`) y por cada una que reconoce el núcleo, con el opcode que
    genera el ensamblador y la plataforma que dice `extendedInfo`.
  - Los datos copiados del núcleo y del archivo son los de verdad: la tabla de la fuente
    grande, los dibujos de cada glifo (cada fila es su byte), la tabla de tonos de XO-CHIP
    (`patternRate`) y los números de `data/archive.json` (programas por plataforma, cuántos
    usan los quirks de Octo, las velocidades, el histograma de IPF).
  - Los textos de la consola que cita (secciones 11 y 13) están en `chip8.html`, y el
    error y el aviso de plataforma son, palabra por palabra, los que arma el núcleo.
  - Cada ancla interna y cada enlace al tutorial y a otros archivos existe, y el índice
    lista cada sección numerada.
- **`tests/manual.test.js`**, sobre el README: los enlaces (y las anclas al manual y al
  tutorial), que la estructura del repositorio nombre archivos que existen (e incluya cada
  `tools/*.js`), que cada `npm run ...` sea un script de `package.json`, que la tabla de
  atajos tenga cada atajo de la ayuda de la consola y que la cantidad de archivos de
  prueba y de escenarios E2E que dice sea la de verdad.
- **`tests/manual.test.js`**, sobre este documento: los enlaces y anclas (propias, del
  manual, del tutorial y del README), que la tabla de [4.21](#421-la-api-de-depuración-windowchip8)
  nombre cada miembro de `window.chip8` y la de [3.1](#31-api-pública) cada clave de
  `Chip8Core`, que las claves de `localStorage` que cita existan, y que la tabla de
  [6.7](#67-los-escenarios-e2e) tenga una fila por escenario de `tools/e2e.js`, con su
  número. Y además, desde la tercera ronda:
  - la tabla de [3.11](#311-estados-guardados-y-rebobinado) nombra cada campo de
    `saveState`; el ejemplo de la compresión (el bloque marcado con
    `<!-- verificar: compresion -->`, con sus rachas en base 128 y su texto en base64) y
    los tamaños que cita (los estados recién creados, los cartuchos después de 10 s, la
    memoria sin ceros y el peor caso) son los que da `encodeState`; y los topes del
    rebobinado son los de `RewindBuffer` y los de la interfaz;
  - la tabla de constantes de [4.1](#41-organización-del-bloque) tiene los valores de
    `chip8.html` (las de los estados, el rebobinado, el avance rápido, la captura, los
    ajustes por cartucho y la biblioteca), y la de [4.19](#419-ajustes-guardados), cada
    campo de los ajustes guardados de `loadSettings`;
  - los atajos de [4.6](#46-teclado-keypad-y-foco) y la lista de
    [9.7](#97-cambiar-el-mapa-del-teclado) tienen cada atajo de la tabla de la ayuda;
  - la tabla de [6.3](#63-números-actuales) nombra cada archivo de prueba y su total suma
    bien (los números de cada archivo no se comprueban: hay que volver a contarlos).
- **`tests/tutorial.test.js`.** Cada ejemplo de `docs/ejemplos/` ensambla, su `.ch8` está
  al día y hace lo que el texto dice (pantalla exacta, teclas, velocidades, registros paso
  a paso, el error de `11-sin-fin` en cada plataforma). Cada perfil corre en **la
  plataforma que elige la consola** con ese perfil, así lo que cuenta el tutorial vale en
  la consola de verdad. `mini-emulador.js` coincide frame a frame con el núcleo. En el
  texto: los listados completos (primera línea `; NN-nombre.asm — `) son idénticos a sus
  archivos; los fragmentos (`; (fragmento de RUTA)` o `// (fragmento de RUTA)`) están tal
  cual en su archivo, **incluidos dos del núcleo** (`runFrame` y `setKey` de `chip8.html`)
  y varios de `roms/rebote.asm`, `roms/atrapa.asm` y `roms/planos.asm`; las salidas
  marcadas con `<!-- salida: CMD -->` se regeneran en una copia temporal (con
  `tools/chip8asm.js` y, desde la cuarta ronda, una copia de `chip8.html`, de donde la
  herramienta saca el ensamblador) y se comparan;
  los mensajes de error son los del ensamblador; el machete de SUPER-CHIP y XO-CHIP
  (`<!-- verificar: tabla-extendida -->`) tiene una fila por instrucción nueva, con el
  opcode que da el ensamblador y la plataforma del núcleo; los números que cita (las notas
  de Planos, los programas del archivo y las ROMs de `roms/archivo/`) son los de verdad;
  los textos y constantes de la interfaz que cita están en `chip8.html`; y los enlaces
  llevan a archivos y anclas que existen (tiene que enlazar el manual, este documento, el
  README, los ejemplos y el índice de `roms/archivo/`). Desde la tercera ronda, además: la
  tabla de atajos de la parte 1.10 tiene cada atajo de la ayuda; los números de la parte
  1.13 (los segundos del rebobinado, su velocidad con y sin T, las ranuras y el mínimo de
  segundos con la memoria de XO-CHIP cambiando entera, que calcula con `RewindBuffer`)
  salen de las constantes de la interfaz; y el recorrido con B de la parte 7.4 sobre
  `11-sin-fin` se repite en el núcleo, con un `RewindBuffer` usado como lo usa la
  interfaz: el PC después del primer toque, los Pasos hasta el error y los segundos hasta
  el principio.

Consecuencia práctica: si cambiás un texto de la interfaz, una constante, un atajo, un
campo de los ajustes o del estado, un fragmento citado del núcleo o de una ROM, un mensaje
del ensamblador, un miembro de `window.chip8` o un escenario E2E, estas pruebas fallan y
dicen qué actualizar en el tutorial, en el manual, en el README o acá. Es a propósito.

### 6.7 Los escenarios E2E

Todos usan entrada real (teclas, clics, toques, archivos y arrastre) y tiempo real. Los 24
primeros son de la primera ronda; del 25 al 40, de la segunda; del 41 al 50, de la
tercera; del 51 al 77, de la cuarta: del 51 al 57, el Taller; del 58 al 65, el depurador;
del 66 al 70, la ventana del archivo; del 71 al 76, los estados en archivos, y el 77, los
dos puntos donde se tocan las piezas ([7.17](#717-cuarta-ronda-la-integración)):

| # | Qué verifica |
|---|---|
| 1 | La página carga por HTTP y por `file://` sin excepciones, sin errores de consola y sin 404 del ícono. |
| 2 | Velocidad real: unos 60 frames por segundo con IPF 15 y 1000, también con un bucle sin dibujo. |
| 3 | Teclado físico: las 16 teclas, con el cartucho Teclado. |
| 4 | Keypad en pantalla: mouse, arrastrar afuera de la tecla y dos dedos a la vez. |
| 5 | Atajos (Espacio, N, Retroceso, H, Esc) y el modelo de foco: un clic no deja el foco en el botón; con el foco puesto desde el teclado, Espacio activa el control. |
| 6 | Carga de ROMs: selector de archivos, ROM vacía o demasiado grande (65.025 bytes; el aviso no tapa nada) y arrastrar y soltar. |
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
| 18 | Modo de pantalla: Tubo CRT y Píxeles puros (colores exactos, sin efectos, interruptores deshabilitados), se conserva al recargar y cambia con las flechas. |
| 19 | Selector rápido de cartuchos bajo la ranura, a 1440×900 y sin scrollear. |
| 20 | Selectores de perfil y paleta: después de elegir, las teclas van al CHIP-8; N, H y Retroceso funcionan; con Tab y flechas cambian de forma nativa. |
| 21 | Keypad con el teclado: Tab hasta una tecla, Enter breve (unos 120 ms) y Espacio sostenido; `FX0A` los recibe. |
| 22 | Error con la máquina en pausa (Reiniciar deja `0x200` en pausa) o corriendo (vuelve a correr). |
| 23 | Ícono de la pestaña embebido: ningún pedido da 404 por HTTP. |
| 24 | Pantalla angosta (360×640 y 375×667): el tubo y el keypad entero en la primera vista. |
| 25 | Plataformas: cada perfil elegido con el mouse trae su plataforma (selector, placa y fila MÁQUINA del monitor), la plataforma sola no toca los quirks, y una ROM de XO-CHIP en 128×64 se ve en Píxeles puros con exactamente los cuatro colores de la paleta, cada píxel en su lugar. |
| 26 | Una ROM de 4000 bytes pasa sola a XO-CHIP; elegir una plataforma de 4 KB (o el perfil COSMAC VIP) con esa ROM se rechaza con un aviso y el selector vuelve. |
| 27 | Diagnóstico: la instrucción ignorada (un aviso por ROM y «Usar SUPER-CHIP»), el error de plataforma con «Cambiar a XO-CHIP y reiniciar» en el tubo y en el monitor (a 1280×900, el botón del monitor se puede llevar a la vista), y `00FD`: «FIN DEL PROGRAMA», el LED ámbar y Reiniciar. |
| 28 | Colores: «Personalizada» cambia en vivo y se conserva al recargar; «Del cartucho» aparece con un juego del archivo y, al cargar otra ROM, se va y vuelve tu paleta. |
| 29 | Autoconfiguración, con una entrada del archivo registrada para la prueba: plataforma, quirks, IPF, colores y giro de 270° aplicados antes del primer frame, con su aviso y la línea de la ranura; con el interruptor apagado, nada; un cambio tuyo se recuerda y «Olvidar ajustes» vuelve a los del archivo. |
| 30 | Ajustes recordados: una ROM cargada con «Cargar ROM», cambios con el mouse, recarga, la misma ROM otra vez (aviso, ranura y valores) y «Olvidar ajustes» de la ranura. |
| 31 | Banderas RPL: lo que guarda `FX75` sobrevive a una recarga y `FX85` lo lee. |
| 32 | Biblioteca: «Tus cartuchos» y «Tuyos:», cargar desde los dos, recarga, quitar y «Deshacer»; con el almacenamiento roto, todo anda en memoria. |
| 33 | Planos desde el estante: 60 frames por segundo sin errores, píxeles con los valores 1 a 3, su patrón de sonido, y W frena el rombo. |
| 34 | Avance rápido: la T sostenida y el botón del bisel dan 4 veces más instrucciones y tics de los timers; al soltar, vuelve a 60 por segundo sin ponerse al día. |
| 35 | Captura: G y el botón de la cámara bajan el PNG (el nombre con la fecha, los mismos bytes que `screenshot()`, los colores exactos de la paleta); en 128×64, los cuatro colores. |
| 36 | Pantalla completa: el botón del bisel, P y Esc entran y salen, con escala entera. |
| 37 | Joystick simulado (Gamepad API): la cruz, la palanca, A y B aprietan las teclas de «Controles», Start pausa y continúa, y desconectarlo suelta todo. |
| 38 | Flechas y «Controles»: el mapa de Octo, el del VIP y uno personalizado (con el mouse); los controles con foco se quedan con sus flechas; el mapa de cada cartucho se recuerda al recargar. |
| 39 | Curvatura (apagarla deja el tubo idéntico, píxel por píxel) y encendido animado (al cargar; no con `prefers-reduced-motion` ni con el interruptor apagado). |
| 40 | Diseño con la biblioteca llena y «Controles» personalizados a la vista, a 1440, 768 y 360 px. |
| 41 | I guarda y U restaura la máquina exacta (pc, registros, pila, timers, pantalla, memoria, quirks); en pausa queda en pausa con ese frame en el lienzo y en el monitor. |
| 42 | Ranuras 1 a 3 con el mouse: miniaturas idénticas píxel por píxel, fechas, «Cargar» en pausa, «Borrar» y «Deshacer», y la paleta Ámbar las repinta. |
| 43 | Los estados sobreviven a una recarga ("hace 5 min", "ayer 18:20"), U anda después de recargar y otra ROM ve sus ranuras vacías. |
| 44 | Un estado de XO-CHIP cargado en CHIP-8 cambia la plataforma sin tocar tus ajustes; un estado detenido trae su error y un estado después de EXIT, «FIN DEL PROGRAMA». |
| 45 | Mantener B (y el botón ⏪, con mouse y con toques) vuelve por los mismos frames de la primera pasada, sin sonido y sin correr la máquina; al soltar, sigue igual; T+B va cuatro veces más rápido. |
| 46 | En pausa, un toque de B vuelve un frame exacto; mantenerla sigue volviendo; después de un error vuelve un frame y queda en pausa. |
| 47 | Con «Rebobinado» apagado, B y ⏪ no hacen nada y no se guardan fotos; el ajuste sobrevive a una recarga. |
| 48 | Almacenamiento roto (todo en memoria), lleno (el aviso correcto y el estado en memoria), un estado dañado y la ranura vacía. |
| 49 | Diseño con el grupo «Estados» a la vista, a 1440, 768 y 360 px. |
| 50 | XO-CHIP a 1000 IPF con Planos y con una ROM que reescribe la memoria en cada frame: 60 fps tomando fotos y al rebobinar. |
| 51 | Taller a 1440×900: va fijo a la derecha sin tapar la pantalla, trae los 11 ejemplos y los 6 fuentes; Ctrl+Enter ensambla y corre un ejemplo (los mismos bytes que `tools/chip8asm.js`, sin ir a «Tus cartuchos») y `workshopSymbols()` trae sus etiquetas y su listado; Y y Esc. |
| 52 | Errores: los tres de un programa roto marcados en el margen y listados, el cursor en el primero, un clic en uno lleva a su renglón, la revisión sola al corregir, y el margen alineado con la rueda y con un error en el renglón 600. |
| 53 | «Sin guardar» que sobrevive a una recarga, Guardar («editado»), «Restaurar el original» y Borrar con «Deshacer», Nuevo, Tab, Mayús+Tab y Ctrl+Z, el nombre (Esc deshace lo escrito) y el formato de `localStorage['chip8-consola.taller']`. |
| 54 | «Abrir .asm» con `@platform xochip` corre en XO-CHIP; Plataforma escribe la etiqueta (CHIP-8 da el error de memoria en su renglón; una etiqueta que no vale, el suyo); «Descargar .asm» y «Descargar .ch8» exactos; SUPER-CHIP en un programa sin etiqueta. |
| 55 | Taller sin almacenamiento (en memoria, sin avisos flotantes), sin lugar (el aviso y Guardar para reintentar) y con datos dañados (todo o una parte). |
| 56 | Diseño con el Taller abierto: a 1440 y 1280 px al costado sin tapar la pantalla; a 768 y 360 px debajo de los estantes (a 360, abierto con un toque y el foco en el título); botones enteros y el margen alineado. |
| 57 | Teclado y lector de pantalla: Tab y Enter abren, las teclas escritas no llegan al keypad, Esc y Tab salen del editor, Plataforma con las flechas (no reescribe la etiqueta a cada paso), Guardar con Enter no pierde el foco, Esc cierra, Y desde la pantalla completa; roles y nombres; 60 fps a 10.000 IPF mientras se escribe. |
| 58 | Puntos de corte con el mouse y el teclado: se detiene antes de la instrucción, avisa, al seguir la ejecuta; Frame completa el frame abierto; la × y «Sacar todos». |
| 59 | Paso por encima (O, el botón y un dedo) con recursión, «Hasta acá», salir (K) y una subrutina que no vuelve (Espacio la pausa). |
| 60 | La traza después de un error (la culpable al final, los bucles agrupados), corriendo y en pausa; un clic o Enter llevan al desensamblado. |
| 61 | El mapa de memoria: los colores de cada clase, el PC y la I, un clic o un dedo llevan al desensamblado o a la memoria, «Ir a», REGIONES y las páginas de XO-CHIP. |
| 62 | El visor de sprites: 8×N y 16×16, el alto elegido, los planos de XO-CHIP con la paleta y los últimos dibujos. |
| 63 | El desensamblado que se recorre (rueda, «Ir a», Av Pág, datos como DB) y el monitor en 1440, 768 y 360 px con cada pestaña. |
| 64 | Los puntos de corte por cartucho y fuera del estado; el mapa y la traza al reiniciar, al cargar un estado y al rebobinar; la pestaña se recuerda. |
| 65 | 60 fps a 10.000 IPF con un punto de corte puesto y con Planos en cada pestaña del monitor. |
| 66 | Archivo de la comunidad: el botón del estante y L abren la ventana con los 104 juegos y sus datos; buscar, filtrar por plataforma y por evento o año, ordenar y «Mostrar todos»; las teclas no llegan a la consola; Esc, L, × y el fondo la cierran. |
| 67 | Un clic o Enter cargan el juego con los ajustes del archivo, la ventana se cierra, la pantalla queda a la vista y el juego corre; flechas, Inicio, Fin y AvPág; «En la ranura», «en tus cartuchos» y «ajustes recordados»; también por `file://`. |
| 68 | Las 104 ROMs embebidas se descomprimen en el navegador a su huella SHA-1; una dañada, un navegador sin `DecompressionStream` o una página sin las ROMs avisan claro y la consola sigue andando. |
| 69 | Miniaturas solo de las tarjetas a la vista, idénticas a correr la ROM aparte (colores y giro); mientras se hacen, la consola sigue a 60 fps con 10.000 IPF. |
| 70 | Diseño de la ventana a 1440, 768 y 360 px: sin scroll horizontal, filtros enteros, tarjetas que no se pisan, miniaturas de escala entera y foco visible. |
| 71 | Exportar: «Exportar» de «Estados», el de un estado de la lista y «Exportar todo» bajan el JSON (formato, fechas, el estado exacto, la pantallita en PNG píxel por píxel y la ROM solo si es de «Tus cartuchos»). |
| 72 | Importar en un navegador limpio con «Importar» y arrastrando el archivo: los estados exactos y la ROM a «Tus cartuchos»; al arrastrar, el contenido distingue un archivo de estados de una ROM que empieza con «{». |
| 73 | Validación (otro programa, otra versión, un estado suelto, todo dañado, una ROM ajena) y ranuras ocupadas: la pregunta con el mouse y con el teclado («Reemplazar todos»), Esc cancela todo y lo dañado no entra. |
| 74 | La lista de todos los estados: grupos y de dónde es cada cartucho, pantallitas con sus colores, Cargar (también con un dedo), lo que no se puede cargar, Borrar y «Deshacer» (mouse y teclado), Esc y el fondo la cierran, y las teclas no van a la máquina. |
| 75 | El giro en las pantallitas: 90° (también un estado guardado antes), 180° y 270° en «Estados», en la lista, en la pregunta y en el archivo exportado; Sub-Terr8nia, del archivo, a 270°. |
| 76 | Diseño de «Estados», de la lista y de la pregunta a 1440, 768 y 360 px, y 60 fps a 10.000 IPF con la lista abierta. |
| 77 | Integración: el desensamblado muestra las etiquetas del programa del Taller (y no las de otro cartucho), y «Ver todos» carga el estado de un juego del archivo con sus ROMs embebidas aunque haya otro cartucho en la ranura. |

`node tools/e2e.js --help` imprime esta misma lista (sale del comentario del principio del
archivo).

### 6.8 Lo que no se verifica automáticamente

- **El sonido audible.** El navegador corre con `--mute-audio`; se verifican el grafo de
  Web Audio, sus ganancias y la fuente (beep o patrón), no que algo suene por los
  parlantes ni que las notas de XO-CHIP sean afinadas.
- **Teléfonos, tabletas y pantallas táctiles reales.** Los toques, el puntero grueso y el
  tamaño de pantalla se emulan por CDP. Tampoco se probó con un teléfono de verdad lo de
  la cuarta ronda: el Taller con el teclado en pantalla, el monitor y las ventanas del
  archivo y de los estados se vieron a 360 px emulados.
- **Joysticks reales.** La Gamepad API se simula; no se probó ningún control físico.
- **La pantalla completa de verdad** en un teléfono, y el Safari del iPhone sin la API.
- **Firefox y Safari.** Solo navegadores de la familia Chromium (Chrome y Edge). El caso
  del `AudioContext` en estado `interrupted` de iOS no está manejado. Las ROMs del archivo
  se descomprimieron con el `DecompressionStream` de Chrome (E2E 68) y con el de Node
  (`tests/archive.test.js`), no con los de Firefox y Safari.
- **Lectores de pantalla reales** (NVDA, JAWS, VoiceOver): se verifican los atributos ARIA
  y la activación sin puntero, no lo que se escucha.
- **El diálogo de archivos del sistema y arrastrar desde el explorador**: se simulan con
  `DOM.setFileInputFiles` y `Input.dispatchDragEvent`. La lista desplegable nativa de un
  `<select>` y el selector de color no se pueden cliquear en modo headless y se simulan.
- **La apariencia.** Salvo las comprobaciones de los colores y de los píxeles del lienzo,
  el aspecto (la curvatura, el encendido, el resplandor) se revisó mirando capturas, no
  con imágenes de referencia.
- **Los juegos del archivo, jugados.** `node tools/archive.js test` los corre en Node con
  teclas al azar y mira que no se detengan ni queden en blanco; no los juega. Desde que las
  ROMs están en `roms/archivo/` corre sin conexión, pero sigue afuera de `node --test`:
  informa 103 de 104 (*Super Square* se detiene) y sale con código 1.
- **Los estados en otros navegadores.** El tope de `localStorage` se probó en Chrome
  (E2E 48, con un `QuotaExceededError` de verdad); el de Firefox o Safari, no. Lo que
  ocupa el rebobinado en el navegador es algo más que `rewindInfo().bytes`, que no cuenta
  lo que el motor de JavaScript agrega por objeto ([3.11](#311-estados-guardados-y-rebobinado)),
  y no se midió.
- **ROMs de pruebas de la comunidad** (por ejemplo, la suite de Timendus): no se
  descargaron ni se corrieron; los quirks y las instrucciones nuevas se verificaron contra
  su comportamiento documentado y contra el código de Octo.
- **La interfaz no tiene mutation testing**; solo el núcleo.

---

## 7. Proceso de desarrollo

El proyecto lo construyeron agentes de IA especializados, en fases, coordinados por un
agente principal, en cuatro rondas. Esta sección cuenta cómo, porque explica varias
decisiones del código y de las pruebas. La historia de git sigue esas mismas etapas, un
commit por tarea ([7.12](#712-tercera-ronda-el-pedido-y-la-historia-de-git) y
[7.15](#715-cuarta-ronda-la-historia-sin-claude)).

### 7.1 Primero el contrato

Antes de escribir código, se fijó un **contrato compartido**, la única fuente de verdad
para todos los agentes: un solo HTML con los bloques y sus etiquetas exactas; la API de
`Chip8Core` (las 13 claves que tenía entonces), el estado y la semántica de cada método
(VF al final, I de 16 bits con accesos de 12, `FX0A` con apretar y soltar, `displayWait`,
qué hace `reset`, cómo se detiene la máquina); los identificadores de los quirks y los
perfiles; el formato del desensamblador; el formato de `CHIP8_DEMOS` y de las etiquetas de
`roms/*.asm`; la API `window.chip8`; el mapa del teclado; la estructura de carpetas; y las
reglas de idioma (castellano con voseo, identificadores en inglés). Con el contrato, cada
parte se pudo construir sin esperar a las otras, y las pruebas se pudieron escribir sin
ver la implementación.

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
cartuchos en el navegador, escribió el `README.md` y corrigió una frase del manual.
Resultado: **726 pruebas, 725 pasan y 1 salteada** (el enlace a este documento, que todavía
no existía). No apareció ningún error del núcleo, de las pruebas ni de la interfaz.

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

### 7.6 Hallazgos notables de la primera ronda

| Id | Gravedad | Qué pasaba | Cómo se resolvió |
|---|---|---|---|
| ui-1 | grave | Con un `<select>` enfocado (después de elegir Perfil o Paleta con el mouse), las letras del keypad cambiaban la opción por búsqueda de texto y los atajos no andaban. | Un `select` ya no cuenta como campo de texto: las 16 teclas, N, H y Retroceso van al emulador con `preventDefault`, y el selector suelta el foco después de un cambio con el mouse. E2E 20. |
| tut-1 | grave | El recorrido de la §7.3 del tutorial no se podía seguir: después de un error, Reiniciar ponía la máquina a correr. | `handleHalt` guarda `pausedBeforeHalt` y `doReset` lo restaura ([8.13](#813-reiniciar-después-de-un-error-respeta-la-pausa)). E2E 22. |
| tut-2 | grave | Cambiar de perfil y apretar Retroceso o WASD no hacía nada (misma causa que ui-1). | Resuelto con ui-1. Además, el tutorial ahora pide volver al perfil COSMAC VIP después de probar, porque el perfil queda guardado. |
| tut-3 | grave | El tutorial decía que el cuadro intermedio de Rebote muestra la pelota "casi completa"; con XOR la parte compartida se apaga. | Texto del tutorial y comentarios de `rebote.asm` corregidos (una silueta de 36 de 44 píxeles); una prueba mide la alternancia 44/36 en el VIP. |
| ui-2 | menor | En pausa, la estela del fósforo quedaba congelada y la imagen no coincidía con el framebuffer. | La estela sigue apagándose a 60 Hz en pausa ([4.2](#42-el-bucle-principal)). |
| ui-4 | menor | Un error se anunciaba tres veces al lector de pantalla. | Un solo anuncio en `#status`, sin aviso flotante ni `role="alert"`. |
| ui-5 | menor | Espacio sobre un interruptor enfocado pausaba en lugar de activarlo. | El modelo de foco ([8.12](#812-el-modelo-de-foco)). |
| ui-7 | menor | Las teclas del keypad no respondían a la activación de un lector de pantalla. | Un `click` sin puntero es un toque de 120 ms. E2E 21. |
| ui-9 | menor | En un teléfono vertical el keypad quedaba debajo del pliegue. | A 760 px o menos el keypad va debajo del tubo. E2E 24. |
| core-1 | menor | Con el quirk `jumping`, el monitor mostraba `JP V0` aunque el salto sumara VX. | `disassemble(opcode, quirks)` con quirks opcionales ([3.8](#38-el-desensamblador)). |
| rom-2 | menor | En Atrapa, pasados 13 a 18 puntos, algunos bloques eran imposibles de alcanzar. | Velocidad +4 por punto con un tope real de 160/256 (34 pasos de caída contra 28 de cruce). |
| rom-5 | menor | Con un DT congelado, Autotest parecía colgado unos 82 s antes de informar la falla. | La espera se rinde a las ~2000 instrucciones; también detecta un DT que sube. |
| asm-1, asm-2 | menor | La línea de comandos mostraba un stack trace de Node si la carpeta de salida no existía, y salía con 0 con argumentos de más. | Analizador de argumentos nuevo y errores del sistema de archivos explicados en castellano, con código 1. |
| e2e-1 | menor | Por HTTP, la consola registraba un 404 de `/favicon.ico`. | Ícono SVG embebido en una URL `data:`. E2E 23. |
| e2e-2 | menor | El aviso de error tapaba el error del monitor y la línea de estado. | Sin aviso para los errores de ejecución; los avisos van arriba al centro. |

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

Después de la revisión, a pedido del usuario, se agregaron dos cosas a la interfaz: **el
selector de modo de pantalla** (Tubo CRT o Píxeles puros,
[4.4](#44-modos-de-pantalla-y-efectos-del-tubo); E2E 18) y **el selector rápido de
cartuchos** debajo de la ranura ([4.11](#411-cartuchos-incluidos-y-selector-rápido);
E2E 19). La integración final cerró la ronda con 797 pruebas y 24 escenarios, todos en
verde (commit `19d1dcd`). Más tarde, el mismo día y también a pedido del usuario, el tope
de la velocidad subió de 1000 a 10.000 IPF, con la guía para las ROMs lentas (`0dcd7ec`).

### 7.8 Segunda ronda: el pedido y el punto de restauración

Con la consola de CHIP-8 terminada, un análisis propuso nueve ampliaciones:
**1** autoconfiguración por ROM (la tabla del archivo de la comunidad y recordar los
ajustes de cada ROM), **2** diagnóstico de plataforma, **3** SUPER-CHIP y XO-CHIP, **4**
colores personalizados, **5** una biblioteca de cartuchos, **6** un taller con editor,
**7** un depurador completo, **8** estados guardados y rebobinado, y **9** comodidades
(avance rápido, pantalla completa, captura PNG, joystick, teclas reasignables, curvatura
del tubo y encendido animado). El usuario aprobó **1, 2, 3, 4, 5 y 9**; las otras tres
quedaron como trabajo futuro ([9.11](#911-limitaciones-conocidas-y-trabajo-futuro)).

Antes de tocar nada se hizo un **punto de restauración**: un commit a nombre del usuario
con todo lo de la primera ronda, un `.gitattributes` nuevo (texto con fin de línea LF y
`*.ch8` como binario, para que una restauración deje los archivos exactamente como
estaban) y un `.gitignore` para la configuración local de cada máquina. Era el primer
commit del repositorio (`d40912f`, "Emulador CHIP-8 estable: consola, demos,
documentación y pruebas"). Al reconstruir la historia en la tercera ronda, su lugar lo
tomó `63ad959` ("Punto de restauración: .gitattributes y .gitignore"), con el mismo
contenido menos un archivo de configuración local de la vista previa, que no era parte
del proyecto ([7.12](#712-tercera-ronda-el-pedido-y-la-historia-de-git)).

Esta PC no tenía Node en el PATH. En lugar de instalarlo, se usó el Node 24 que trae el
editor Cursor, por su ruta completa ([8.24](#824-un-node-portátil-para-trabajar)); las
pruebas pasan igual con Node 22 y con 24.

### 7.9 Fases y agentes

Como en la primera ronda, el trabajo se repartió en agentes especializados con **dueños
explícitos de cada archivo**, y en fases, para que lo que se hacía en paralelo no se
pisara:

| Fase | Quién | Qué | Resultado |
|---|---|---|---|
| 1 | Dos agentes en paralelo | El núcleo de SUPER-CHIP y XO-CHIP (`chip8-core`, `tests/platform`, `superchip` y `xochip`) y el ensamblador (`tools/chip8asm.js`, `tests/asm-extendido.test.js`) | Las plataformas, con la semántica de Octo; 65 errores sembrados, todos detectados |
| 2 | El agente principal | La tabla del archivo: `tools/archive.js`, `data/archive.json` (commit `761e3ff`), `tests/archive.test.js`, el quinto bloque y `tests/single-file.test.js` con cinco bloques | 1330 pruebas, todas pasan; `archive.js test`: 103 de 104 |
| 3 | Dos agentes en paralelo | La interfaz, parte 1 (plataformas, pantalla de 128×64 con planos, colores, audio de XO-CHIP, diagnósticos, monitor) y el cartucho *Planos* (con `@platform` en `embed-roms.js`) | 1349 pruebas; 24 de 24 escenarios E2E |
| 4 | Un agente | La interfaz, parte 2: ajustes por cartucho con su prioridad, banderas RPL por ROM, la biblioteca | 1349; 24 de 24 |
| 5 | Dos agentes en paralelo | Las comodidades (feature 9) y el manual (la sección 13 reescrita, 11.10 y 11.11) | 1358 pruebas |
| 6 | Dos agentes en paralelo | Los escenarios E2E nuevos (del 25 al 40), que además encontraron y corrigieron un problema del monitor ([7.11](#711-integración-y-hallazgos-notables)), y el resto de la documentación (README, tutorial, este documento y dos agregados al manual), con pruebas nuevas que la vigilan | 40 de 40 escenarios en 4 corridas seguidas; 1371 pruebas |

Al final, el agente principal integra todo: `node --test`, la E2E completa,
`node tools/archive.js test` y una revisión visual de la consola.

### 7.10 Pausas e interrupciones

El usuario pausó el trabajo una vez, por los tokens, y pidió retomarlo tal cual; el estado
exacto y el plan por fases quedaron anotados para eso, y se retomó desde ahí. Más
adelante, un límite de uso cortó a dos agentes en medio de su trabajo: se los volvió a
lanzar desde donde habían quedado, con lo ya hecho a la vista, en lugar de empezar de
nuevo. Dividir el trabajo en fases con dueños de archivos claros hizo que las dos cosas
fueran baratas: cada fase dejaba la suite en verde, y un corte afectaba solo a los archivos
de un agente.

### 7.11 Integración y hallazgos notables

Decisiones y correcciones de la segunda ronda que vale la pena conocer:

| Tema | Qué pasaba o qué había que decidir | Cómo quedó |
|---|---|---|
| El "6" de la fuente grande | La tercera fila del 6 grande no coincidía con las tablas de SUPER-CHIP 1.1 de Octo y de Cadmium. | Se corrigió en la integración: fila 3 = `E0`. Los diez dígitos coinciden byte a byte con esas dos tablas, y el manual lo dice. |
| La fuente del archivo con `https://` | `tests/single-file.test.js` prohíbe cualquier dirección de red dentro de `chip8.html`, y el bloque del archivo guardaba su fuente como URL. | El bloque guarda `github.com/JohnEarnest/chip8Archive`, sin el esquema ([8.23](#823-ninguna-dirección-de-red-en-chip8html)). |
| `F000` sin su segunda palabra | `disassemble` recibe una palabra; para `F000 NNNN` hace falta la siguiente, y la ida y vuelta exige que todo texto de 2 bytes se pueda volver a ensamblar. | Sin la palabra siguiente es `DW 0xF000` ([3.8](#38-el-desensamblador)); `disassembleRange` y el monitor, que sí la tienen, muestran `LD I, LONG 0xNNNN` en una fila de 4 bytes. |
| La línea de `--help` del tutorial | El tutorial muestra la salida real de `node tools/chip8asm.js --help`, que ganó `[--xo]`. | Actualizada; la prueba de salidas del tutorial la compara. |
| Una ROM de 3585 bytes | Antes era un error; ahora es una ROM de XO-CHIP. | La consola pasa sola al perfil XO-CHIP y avisa; el escenario E2E 6 prueba el rechazo con 65.025 bytes. |
| La pila de 16 niveles | Octo usa 12. | 16, como pide la especificación de XO-CHIP. *Super Square*, del archivo, desborda la pila en su pantalla final: con 12 niveles pasaría antes. Es el único de los 104 que se detiene. |
| `FN01` con N > 3 y `FX02` con X ≠ 0 | Octo los acepta. | Opcodes inválidos ([3.9](#39-las-plataformas)). |
| La palabra «url» y el paréntesis | La prueba del archivo único busca `url(` en todo el HTML, y la interfaz llama a `toDataURL` y `createObjectURL`. | Esas llamadas llevan un espacio antes del paréntesis (`toDataURL ('image/png')`); un comentario lo explica. |
| El encendido animado en las capturas E2E | La capa del encendido tapaba la pantalla en las capturas de los escenarios. | `Page.shot` espera a que termine antes de capturar. |
| El monitor más alto que la ventana | Lo encontraron los escenarios E2E nuevos: en la pantalla ancha (más de 1200 px), el monitor pegado arriba mide entre 889 y 1024 px con un error, más que una ventana de 1280×900 o 1366×768, y el botón «Cambiar a … y reiniciar» de su pie recién aparecía después de scrollear más allá de los estantes. | `top: var(--mon-top, 20px)` y `fitMonitor()`, que pega el monitor más arriba cuando no entra ([4.16](#416-el-monitor)). El E2E 27 comprueba que, a 1280×900, el botón se puede llevar a la vista. |
| Lo automático contra lo elegido | Si lo que aplica la autoconfiguración quedara como ajuste general, la ROM siguiente arrancaría con los ajustes de otro juego. | Las funciones que cambian ajustes distinguen `auto` ([4.9](#49-ajustes-por-cartucho)). |
| El tutorial y los perfiles | Al elegir un perfil, la consola ahora cambia también la plataforma; lo que el tutorial cuenta de cada perfil se probaba solo en la plataforma CHIP-8. | `tests/tutorial.test.js` corre cada perfil en su plataforma. Lo único que cambió fue el final de `11-sin-fin` con SUPER-CHIP (ahora se detiene en la fuente grande) y con XO-CHIP (recorre 64 KB): el tutorial lo cuenta. |

### 7.12 Tercera ronda: el pedido y la historia de git

La tercera ronda hizo tres cosas: la feature 8, estados guardados y rebobinado, que había
quedado pendiente ([1.4](#14-la-tercera-ronda-feature-8)); las ROMs del archivo de la
comunidad dentro del repositorio, con el comando `download` ([5.5](#55-toolsarchivejs));
y una historia de git que se pueda leer, **un commit por tarea**. Al terminarla, el
repositorio se publicó en `github.com/maxisimonazzi/chip8-emulator`.

**La historia, reconstruida.** Hasta entonces el repositorio tenía un solo commit, el punto
de restauración (`d40912f`, [7.8](#78-segunda-ronda-el-pedido-y-el-punto-de-restauración)),
con toda la primera ronda adentro, y la segunda ronda estaba sin commitear. Ahora tiene 28
commits para todo lo anterior a la tercera ronda, más los de la tercera:

| Etapa | Commits | Cuántos |
|---|---|---|
| Primera ronda, el 27 de septiembre de 2026 (todavía no existía el repositorio) | De `ed60649` ("Andamiaje: scripts de npm, harness de pruebas y servidor local") a `0dcd7ec` ("Velocidad hasta 10.000 instrucciones por frame y guía para ROMs lentas") | 20 |
| El punto de restauración, el 4 de noviembre | `63ad959` ("Punto de restauración: .gitattributes y .gitignore") | 1 |
| Segunda ronda, el 5 y el 6 de noviembre | De `12243d9` ("Núcleo: plataformas SUPER-CHIP y XO-CHIP con la semántica de Octo") a `67a4e9c` ("Documentación de SUPER-CHIP, XO-CHIP y las features nuevas") | 7 |
| Tercera ronda, el 6 de noviembre | `1a906fc` ("ROMs del archivo de la comunidad en roms/archivo y comando download"), `1607c38` ("Núcleo: estados guardados y buffer de rebobinado"), `eb8e176` ("Interfaz: estados guardados y rebobinado"), `49ad3ec` ("Documentación: estados guardados, rebobinado y ROMs del archivo") y `190fbf5` ("README nuevo, con una captura de la consola") | 5 |

La primera ronda era la parte delicada, porque cuando se hizo no había repositorio. Se
reconstruyó **a partir de las transcripciones de las sesiones**: en una copia aparte se volvieron a
aplicar, en orden, cada `Write` y cada `Edit` que registran, y se volvieron a correr los 78
comandos de consola que cambiaron archivos (`sed`, scripts descartables, `embed-roms`, el
ensamblador, copias). Dos controles independientes dicen que salió bien: el resultado
coincide **byte por byte** con el viejo punto de restauración (los 59 archivos de
`d40912f`), y las 122 lecturas de archivos que registran las transcripciones (lo que vio
cada agente al abrir un archivo) coinciden línea por línea con el archivo reconstruido en
ese momento.

Cada commit intermedio conserva **los resultados de las pruebas que tuvo de verdad**: no
se "emprolijaron". `650db04` (la integración de la primera ronda) pasa 725 de 726, con una
salteada hasta que existiera este documento; `199b896` deja cuatro en rojo hasta que se
pongan al día el bloque de cartuchos y el tutorial; `1d966d0` todavía tiene en rojo las dos
del bloque de cartuchos, que arregla `19d1dcd`. Los de la segunda ronda y los de esta
pasan todas ([7.19](#719-cómo-creció-la-suite)).

Para correr las pruebas de un commit anterior a `63ad959` en Windows, sacalo con fin de
línea LF: esos commits no tienen `.gitattributes`, y con `core.autocrlf` prendido los
archivos salen con CRLF y fallan las pruebas que comparan texto (18 en `19d1dcd`, que con
LF pasa entera). Por ejemplo, desde la raíz y con una carpeta de destino que ya exista:

```sh
git -c core.autocrlf=false archive 19d1dcd | tar -x -C ../chip8-19d1dcd
```

### 7.13 Tercera ronda: estados guardados y rebobinado

Como en las otras rondas, el trabajo se repartió entre agentes con dueños explícitos de
cada archivo:

| Tarea | Qué | Resultado |
|---|---|---|
| Las ROMs del archivo (`1a906fc`) | `node tools/archive.js download`, `roms/archivo/` con su `LEEME.md`, `archive.js test` con las copias locales y 3 pruebas nuevas | 1374 pruebas, todas pasan |
| El núcleo de los estados (`1607c38`) | `saveState`, `loadState`, `encodeState`, `decodeState` y `RewindBuffer` ([3.11](#311-estados-guardados-y-rebobinado)), `tests/estados.test.js` y la API en este documento | 1479 pruebas, todas pasan; `step` y `runFrame` sin cambios |
| La interfaz de los estados (`eb8e176`) | El grupo «Estados», los atajos I, U y B, el botón ⏪, el rebobinado y los escenarios E2E 41 a 50 ([4.22](#422-estados-guardados-y-rebobinado)) | 1479 pruebas; 50 de 50 escenarios en tres corridas seguidas |
| La documentación (`49ad3ec`) | El tutorial, el manual y este documento al día, con pruebas nuevas que los vigilan ([6.6](#66-pruebas-de-la-documentación)) | 1489 pruebas, todas pasan |
| El README nuevo (`190fbf5`) | Un README más corto, con una captura de la consola (`docs/captura.png`) | 1489 pruebas, todas pasan |

Mientras se construía la interfaz aparecieron dos errores, y los dos se corrigieron antes
del commit:

| Qué pasaba | Cómo quedó |
|---|---|
| Rebobinar un frame, avanzar uno con Frame y volver a rebobinar se salteaba un frame: la foto que se acababa de cargar ya había salido del buffer, así que el segundo B saltaba a la anterior. | La foto cargada vuelve al buffer como la más nueva (`rewindBack`), así volver otra vez pasa por ella. E2E 46: en pausa, un toque de B vuelve exactamente un frame y Frame avanza uno. |
| Rebobinar desde un error volvía a la pausa que había antes del error, como Reiniciar: si la máquina corría, al soltar B seguía corriendo y chocaba enseguida con el mismo error. | Rebobinar desde un error o desde el fin del programa deja la máquina en pausa en el frame de antes (`machineStateLoaded` con `stay`), para mirar qué pasó. E2E 46. |

### 7.14 Cuarta ronda: el pedido

El 6 de noviembre de 2026, con el repositorio ya publicado, el usuario pidió dos cosas.
Primero, sacar del repositorio la carpeta `.claude/`: un archivo de configuración local de
la vista previa del editor, `.claude/launch.json`, se había colado en el primer commit,
porque el `.gitignore` solo dejaba afuera `.claude/settings.local.json`
([7.15](#715-cuarta-ronda-la-historia-sin-claude)). Después, seis features:

1. el **Taller**, un editor con el ensamblador dentro de la consola (la feature 6 del
   análisis de la segunda ronda, [7.8](#78-segunda-ronda-el-pedido-y-el-punto-de-restauración));
2. el **depurador completo** (la feature 7);
3. **explorar el archivo de la comunidad** dentro de la consola;
4. **exportar e importar estados** como archivos;
5. una **lista de todos los estados guardados**;
6. **las miniaturas de los estados con el giro** del cartucho.

La 3, la 4, la 5 y la 6 eran ideas que [9.11](#911-limitaciones-conocidas-y-trabajo-futuro)
tenía anotadas desde la tercera ronda. Quedaron pendientes, a pedido del usuario, probar
la consola en un teléfono de verdad, con un joystick físico y en Firefox y Safari, y las
rarezas *legacy* de SUPER-CHIP en la HP-48 (el scroll de medio píxel, las colisiones que
cuentan filas).

**Lo que salió de la conversación.** Mientras se limpiaba la historia, el usuario cuestionó
que `tests/` y `tools/` estuvieran en el repositorio: para que la consola funcione no hacen
falta. Se le explicó por qué sí (las pruebas son las que muestran que el código y la
documentación dicen la verdad, y las herramientas arman los bloques generados y las corren)
y lo dejó para más adelante. De esa conversación salió igual una regla: lo que la consola
usa tiene que vivir en `chip8.html`, y las herramientas, solo leerlo. El ensamblador vivía
en `tools/` y el Taller lo necesitaba, así que pasó a `chip8.html`
([8.32](#832-el-ensamblador-vive-en-chip8html)).

### 7.15 Cuarta ronda: la historia sin `.claude/`

Se reescribieron los 33 commits del repositorio con un script de un solo uso, que quedó
fuera del repositorio. Para cada commit, en orden:

- armó el árbol nuevo en un índice aparte, sin `.claude/` (la copia de trabajo no se tocó);
- cambió el `.gitignore` por uno que deja afuera `.claude/` entero;
- en este documento, sacó las menciones a `.claude/launch.json` (en la estructura del
  repositorio, en `tools/serve.js`, en el punto de restauración, en la historia
  reconstruida y en la parte de Node sin el PATH) y cambió los hashes que cita por los
  nuevos;
- corrigió lo que decían de `.claude/` los mensajes de dos commits, el del andamiaje y el
  del punto de restauración;
- y escribió el commit nuevo con el mismo autor, la misma fecha y el mismo asunto.

El script no movió ninguna rama: dejó un mapa de los hashes viejos a los nuevos para
revisarlo antes, y la historia vieja quedó guardada en un *bundle*, también fuera del
repositorio. En la punta nueva pasaban las 1489 pruebas, como antes. Cambiaron todos los
hashes, otra vez: el punto de restauración, por ejemplo, pasó de `73da0e3` a `63ad959`, y
la punta, a `190fbf5`; los que cita este documento son los nuevos.

Como el repositorio ya estaba publicado, había que reemplazar la historia de GitHub con un
push forzado (`git push --force-with-lease`). A ese paso lo bloqueó el control de permisos
de la sesión, por ser una acción destructiva, y lo hizo el usuario a mano. Por qué
reescribir la historia y no borrar el archivo en un commit nuevo:
[8.31](#831-sacar-claude-de-toda-la-historia).

### 7.16 Cuarta ronda: cuatro agentes en paralelo

Las seis features se repartieron en **cuatro agentes que trabajaron al mismo tiempo**,
cada uno en su propia copia del repositorio, un *worktree* de git:

| Agente | Qué hizo | Pruebas nuevas |
|---|---|---|
| El Taller | La feature 1, y el ensamblador pasó a `chip8.html` ([4.23](#423-el-taller), [5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)) | `tests/asm-bloque.test.js` (18) y `tests/taller.test.js` (9) |
| El depurador | La feature 2, en el núcleo y en el monitor ([3.12](#312-el-depurador), [4.24](#424-el-depurador)) | `tests/depurador.test.js` (41) |
| El archivo | La feature 3: las ROMs adentro de `chip8.html` y su ventana ([4.25](#425-la-ventana-del-archivo-de-la-comunidad), [5.5](#55-toolsarchivejs)) | 9 más en `tests/archive.test.js` |
| Los estados | Las features 4, 5 y 6 ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)) | `tests/estados-archivos.test.js` (36) |

Para que los cambios se pudieran juntar sin pisarse, **cada agente tuvo asignados de
antemano sus lugares de inserción en `chip8.html`**: sus secciones de `chip8-ui` en
puntos distintos (el depurador, entre el monitor y el estante de cartuchos; el archivo,
antes de «Tus cartuchos»; los estados, después de sus ranuras; el Taller, antes de la API
de depuración), su bloque de CSS en un lugar propio, su marcado en su parte de la página,
y unas pocas líneas sueltas en lugares conocidos (`onKeyDown`, el arranque,
`window.chip8`). Los demás archivos también tenían dueño: el núcleo lo tocó solo el
depurador; el ensamblador y `tools/embed-roms.js`, solo el Taller; `tools/archive.js`,
solo el archivo. Este documento no lo tocó ninguno, salvo el depurador, que agregó las
claves del núcleo: cada agente dejó notas con lo que había que documentar, sus decisiones,
lo que dejaba afuera y las filas que piden las pruebas, y la documentación se escribió al
final, con todo junto.

**Los worktrees salieron del commit viejo.** Por cómo los crea la herramienta, los cuatro
salieron de `464536b`, la punta de antes de la limpieza ([7.15](#715-cuarta-ronda-la-historia-sin-claude)),
y no de `190fbf5`. Entre los dos commits solo cambiaban `.claude/launch.json`, el
`.gitignore` y unas líneas de este documento, nada de lo que tocaban los agentes, así que
los cambios de cada uno se pasaron a main como un diff, con `git apply --3way`
([7.17](#717-cuarta-ronda-la-integración)).

**El límite de uso.** Los cuatro agentes se cortaron una vez a mitad de camino por el
límite de uso y se retomaron desde donde estaban, con su copia y sus notas a la vista,
como en la segunda ronda ([7.10](#710-pausas-e-interrupciones)). Que cada uno trabajara en
su worktree, con sus archivos y sus lugares de inserción, hizo que retomar fuera barato:
nada de lo que hacía uno dependía de lo que hacían los otros.

### 7.17 Cuarta ronda: la integración

Los cuatro diffs se aplicaron sobre main con `git apply --3way`. En `chip8.html` hubo un
solo conflicto por parche: el párrafo de la ayuda que nombra las teclas que siguen yendo a
la consola, al que cada agente le había agregado las suyas (O y K, L, Y). Los demás
conflictos fueron en el README (la cantidad de pruebas y de escenarios, que cada uno había
contado en su copia) y al final de `tools/e2e.js`, donde cada uno había agregado sus
escenarios; se juntaron uno detrás del otro.

Al juntar se hicieron tres ajustes:

| Qué | Por qué | Cómo quedó |
|---|---|---|
| La lista de estados carga los juegos del archivo con sus ROMs embebidas | El agente de los estados no tenía las ROMs del archivo: `findCartridge` preguntaba si existía `archiveRomBytes`, y los estados de un juego del archivo quedaban bloqueados, con una nota que pedía cargar el juego antes | `findCartridge` llama a `archiveRomBytes` y comprueba la huella, y `cartridgeLoadOptions` carga esos juegos con `origin: 'explorador'`, como desde su ventana ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)) |
| El desensamblado muestra las etiquetas del Taller | El depurador había dejado un gancho, `disasmLabel(dirección)`, que devolvía `null`, y el Taller, `workshopSymbols()`, lista para usar | `disasmLabel` usa `workshopSymbols()`, con un mapa de dirección a etiqueta que se arma de nuevo solo cuando cambia el programa ([4.24](#424-el-depurador)) |
| Los escenarios E2E siguen al 50 | Cada agente había numerado los suyos desde una centena propia, para no chocar: del 101 al 107 (el Taller), del 201 al 208 (el depurador), del 301 al 305 (el archivo) y del 401 al 406 (los estados) | Se renumeraron: del 51 al 57, del 58 al 65, del 66 al 70 y del 71 al 76. Las notas de los agentes usan los números viejos |

Después se agregó un escenario más, el 77, para los dos primeros ajustes, que ninguna copia
podía probar sola: el desensamblado muestra las etiquetas del programa del Taller (y no las
de otro cartucho), y «Ver todos» carga el estado de un juego del archivo con sus ROMs
embebidas aunque haya otro cartucho en la ranura.

**Los commits.** La ronda quedó en seis commits, armados al final en una copia aparte del
repositorio y en el orden del pedido, no en el de la integración: `2b00302` (el Taller),
`8a25972` (el depurador), `b384c3e` (el archivo de la comunidad), `fcbc67e` (los estados),
`cb34a86` (la integración) y el de esta documentación. Cada uno pasa todas sus pruebas: en
los cinco primeros, el README y este documento llevan solo las filas y las cifras que piden
las pruebas de ese momento (1516, 1557, 1566 y 1602 pruebas), y el último trae el texto
completo. Al armarlos, los separadores de los escenarios 51 a 77 en `tools/e2e.js`
(`// 51 ---…`) quedaron del largo de los demás; el resto del código es el que se verificó
con las 1602 pruebas y los 77 escenarios ([7.18](#718-cuarta-ronda-la-verificación)).

### 7.18 Cuarta ronda: la verificación

Cada agente verificó su parte en su copia, con la suite entera y la E2E completa (que en
cada copia tenía los 50 escenarios de antes más los suyos):

| Agente | `node --test` en su copia | E2E completa en su copia |
|---|---|---|
| El Taller | 1516 pruebas en 214 grupos; fallaban solo las 6 de este documento que piden filas nuevas, y con esas filas, probadas en una copia aparte, pasaban todas | 57 de 57, también los dos de 60 fps (el 2 y el 50); sus 7 escenarios, otra vez con el código final: 7 de 7, a 60,2 cuadros por segundo con 10.000 IPF mientras se escribe |
| El depurador | 1530 pruebas en 214 grupos, todas pasan | 58 de 58 |
| El archivo | 1498 pruebas en 208 grupos; fallaban las 3 de este documento, y con sus cambios pasaban todas | 55 de 55. Una corrida anterior había fallado en el 14, que exige que no haya ningún `role="alert"` en la página: el aviso de la ventana lo tenía, escondido, y pasó a ser una región `aria-live="assertive"` |
| Los estados | 1525 pruebas en 214 grupos; fallaban las 4 de este documento, y con sus filas pasaban todas | 56 de 56 en la primera corrida completa, con los otros agentes corriendo las suyas en la misma máquina; su escenario de diseño (hoy, el 76) midió 60,2 cuadros por segundo a 10.000 IPF con la lista abierta |

Además, cada agente revisó a mano las capturas de sus escenarios, a 1440, 768 y 360 px, y
corrigió lo que encontró ahí. El depurador, por ejemplo: la lista de la traza que quedaba
vacía (el scroll se ponía antes de que creciera el contenido), la pila más alta que el
desensamblado, que no dejaba achicar el monitor, y la línea de información del mapa, que
movía lo de abajo al salir el puntero y hacía que un clic terminara en otro elemento.

Con todo junto: **1602 pruebas en 22 archivos** (229 grupos). Antes de escribir la
documentación fallaban 7, todas de la documentación (en `tests/manual.test.js`: los
números del README y las tablas de este documento); con la documentación al día pasan
las 1602. La E2E integrada: los 76 escenarios que había entonces pasaron juntos en una
corrida completa sobre el código integrado (76 de 76, sin errores de consola, con 59,9
cuadros por segundo a 10.000 IPF con la lista de estados abierta), y el 77, agregado
después, pasó solo.

La corrida de los 77 escenarios juntos, sobre el código y la documentación finales: 77 de
77, sin errores de consola, con 60 cuadros por segundo a 10.000 IPF (escenarios 2 y 57) y a
1000 IPF en XO-CHIP mientras se guardan las fotos del rebobinado (escenario 50).

### 7.19 Cómo creció la suite

| Momento | Commit | Pruebas | Resultado |
|---|---|---|---|
| Construcción: las 6 suites del núcleo, escritas a ciegas | `be73167` | 515 | todas pasan (las 2 fallas de la primera corrida eran errores de las pruebas) |
| Integración de la primera ronda | `650db04` | 726 | 725 pasan, 1 salteada (el enlace a este documento, que no existía) |
| Después del mutation testing | `f1d2a6b` | 738 | 737 pasan, 1 salteada |
| Después de las correcciones de la revisión | `1d966d0` | 793 | 791 pasan; las 2 del bloque de cartuchos esperan a que se vuelvan a incrustar |
| Integración final de la primera ronda | `19d1dcd` (y el árbol de `63ad959`) | 797 | todas pasan, ninguna salteada |
| Núcleo, ensamblador y tabla del archivo | `fdbd469` | 1330 | todas pasan |
| Interfaz (partes 1 y 2) y *Planos* | de `580e3d7` a `9e49c4b` | 1349 | todas pasan |
| Comodidades, manual e integración | — | 1358 | todas pasan (ningún commit guarda este momento: los cambios del manual quedaron en `67a4e9c`) |
| Documentación de la segunda ronda (el tutorial en cada plataforma, las pruebas de este documento y del README) | `67a4e9c` | 1371 | todas pasan |
| Las ROMs del archivo en el repositorio | `1a906fc` | 1374 | todas pasan |
| Núcleo de los estados guardados | `1607c38` | 1479 | todas pasan |
| Interfaz de los estados guardados y el rebobinado | `eb8e176` | 1479 | todas pasan |
| Documentación de la tercera ronda (los atajos, las constantes, el formato y los números de los estados en este documento y en el tutorial) | `49ad3ec` | 1489 | todas pasan |
| El README nuevo, la punta de la historia sin `.claude/` ([7.15](#715-cuarta-ronda-la-historia-sin-claude)) | `190fbf5` | 1489 | todas pasan |
| Cuarta ronda, cada agente en su copia: el Taller, el depurador, el archivo y los estados | — | 1516, 1530, 1498 y 1525 | todas pasan con las filas de este documento que piden sus pruebas |
| Cuarta ronda, todo junto, antes de la documentación | — | 1602 | 1595 pasan; las 7 que fallan son de la documentación |
| Cuarta ronda en commits: el Taller | `2b00302` | 1516 | todas pasan |
| El depurador | `8a25972` | 1557 | todas pasan |
| El archivo de la comunidad | `b384c3e` | 1566 | todas pasan |
| Los estados: archivos, la lista y el giro | `fcbc67e` | 1602 | todas pasan |
| La integración | `cb34a86` | 1602 | todas pasan |
| Documentación de la cuarta ronda | — | 1602 | todas pasan |

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
  el núcleo no sabe que existe una interfaz. Ni siquiera suena: deja el patrón y el tono
  de XO-CHIP en propiedades y la interfaz los toca.
- **Consecuencias:** las pruebas del núcleo corren en unos segundos sin navegador; el
  monitor lee el estado directamente; `tools/archive.js test` corre los 104 juegos del
  archivo en Node. La persistencia del fósforo, el sonido y los efectos son cosa de la
  interfaz ([8.15](#815-los-efectos-viven-en-la-interfaz)).

### 8.3 Mnemónicos de Cowgod

- **Contexto:** hacía falta un desensamblador para el monitor y un ensamblador para los
  cartuchos y el tutorial.
- **Decisión:** los mnemónicos de la referencia de Cowgod (`LD V1, 0x2A`,
  `DRW V0, V1, 5`, `LD [I], V1`...), idénticos en los dos sentidos, y `DW 0xNNNN` para las
  palabras inválidas. Para SUPER-CHIP, los de Cowgod también (`SCD`, `HIGH`, `LD HF`,
  `LD R`); para XO-CHIP, que es posterior, nombres en el mismo estilo (`SCU`, `SAVE`,
  `LOAD`, `LD I, LONG`, `PLANE`, `AUDIO`, `PITCH`).
- **Consecuencias:** es el estilo que más material de la comunidad usa; lo que muestra el
  monitor se puede copiar y volver a ensamblar, en cualquier plataforma (prueba en
  `tests/asm.test.js` y `tests/asm-extendido.test.js`).

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

### 8.5 I de 16 bits, accesos con la máscara de la memoria

- **Contexto:** con `FX1E` o el avance de `FX55`/`FX65`, I puede pasar de `0xFFF`.
- **Decisión:** I se guarda con 16 bits y cada acceso a memoria enmascara con la máscara
  de la plataforma: `& 0xFFF` con 4 KB, `& 0xFFFF` con 64 KB
  ([3.6](#36-i-de-16-bits-y-direcciones-de-12-o-de-16)).
- **Consecuencias:** se comporta como los intérpretes modernos de referencia, nunca se lee
  fuera de la memoria y el monitor muestra el valor real de I. XO-CHIP no necesitó un I
  distinto.

### 8.6 displayWait como "el DXYN cierra el frame"

- **Contexto:** el VIP esperaba la interrupción de video antes de dibujar; emularlo con
  ciclos exactos exigiría medir el costo de cada instrucción.
- **Decisión:** como mucho un `DXYN` por frame, y el `DXYN` termina el frame
  ([3.5](#35-runframe-y-displaywait)). Valen igual los dibujos de SUPER-CHIP y XO-CHIP.
- **Consecuencias:** simple, determinista y fácil de probar. Los programas que dibujan en
  cada vuelta van a la misma velocidad con cualquier IPF, que es el efecto que importaba.
  No reproduce que en el VIP un sprite grande tarde más que uno chico, ni que SUPER-CHIP en
  alta resolución no esperara.

### 8.7 Las fuentes en 0x050 y 0x0A0

- **Contexto:** el VIP guardaba la fuente en su ROM, fuera de la RAM de los programas;
  cada intérprete moderno la pone en algún lugar debajo de `0x200`. Octo pone la chica en
  `0x000` y la grande en `0x050`.
- **Decisión:** la chica en `0x050`–`0x09F`, la ubicación que se volvió costumbre entre los
  emuladores modernos, y la grande de SUPER-CHIP justo después, en `0x0A0`–`0x13F`. En
  CHIP-8 esa zona queda en cero. Los programas no deberían depender de la dirección:
  `FX29` y `FX30` la calculan.
- **Consecuencias:** ningún programa bien escrito lo nota, y CHIP-8 quedó exactamente como
  antes. Uno que se sale de su código da la vuelta a la memoria, llega a la fuente y se
  detiene con un mensaje reconocible (opcode `0xF090` en la dirección `0x050`); en
  SUPER-CHIP puede terminar en la fuente grande.

### 8.8 Pila de 16 niveles con error de desbordamiento

- **Contexto:** el intérprete del VIP tenía lugar para 12 niveles y, por lo que se sabe, no
  controlaba el desborde; SUPER-CHIP y la mayoría de los intérpretes modernos ofrecen 16;
  Octo, 12; la especificación de XO-CHIP pide 16 y que llenarla o vaciarla de más sea un
  error.
- **Decisión:** 16 niveles en las tres plataformas; el 17.º `CALL` y un `RET` con la pila
  vacía detienen la máquina con un mensaje.
- **Consecuencias:** entran todos los programas conocidos, y la recursión sin fin se
  informa en lugar de corromper la memoria. El único juego del archivo que desborda la
  pila, *Super Square*, lo haría antes en Octo.

### 8.9 Los errores detienen la máquina, no tiran excepciones

- **Contexto:** una ROM cualquiera puede tener opcodes inválidos, instrucciones de otra
  plataforma o romper la pila, y el emulador no se puede caer.
- **Decisión:** `_fail` deja la máquina detenida, con el `pc` en la instrucción culpable,
  un mensaje en castellano con el opcode y la dirección y un `errorInfo` que la interfaz
  puede usar sin leer el texto ([3.7](#37-errores-avisos-y-fin-del-programa)); `0NNN` se
  ignora.
- **Consecuencias:** el monitor muestra dónde está el problema, la interfaz ofrece el
  botón de la plataforma que falta, y el bucle no necesita `try/catch`. Las únicas
  excepciones son las de los argumentos inválidos (`loadRom`, `setPlatform`, `sha1`, y
  los estados: `loadState`, `encodeState`, `decodeState`), que la interfaz controla antes
  o atrapa: un estado que no se puede cargar es un aviso, y la máquina sigue como estaba.

### 8.10 Escala entera con devicePixelRatio

- **Contexto:** estirar 64×32 (o 128×64) a un tamaño cualquiera deja píxeles de distinto
  ancho, y con escalas de Windows como 125 % se ve borroso.
- **Decisión:** el lienzo mide un múltiplo entero de la imagen en píxeles **físicos** y se
  dibuja sin suavizado ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)), también girada y
  en pantalla completa.
- **Consecuencias:** cada píxel es un cuadrado exacto en cualquier pantalla (medido con
  escala 1,25 y 2). En pantallas chicas con escala 1 la imagen no llena todo el tubo.

### 8.11 Teclas por KeyboardEvent.code

- **Contexto:** el keypad del VIP se mapea tradicionalmente al bloque 1-4/Q-R/A-F/Z-V
  según su posición.
- **Decisión:** mapear por `code` (la posición física), no por `key` (el carácter).
- **Consecuencias:** el mismo bloque en QWERTY, AZERTY o Dvorak, sin configurar nada. Los
  atajos (N, O, K, H, L, T, P, G, Y, I, U, B) también son por posición.

### 8.12 El modelo de foco

- **Contexto:** los atajos de una sola tecla chocan con los controles: un botón enfocado
  se activa con Espacio, un `<select>` enfocado cambia de opción con las letras. La
  revisión encontró que eso rompía el keypad y los atajos (ui-1, ui-5, tut-2).
- **Decisión:** un clic con puntero no deja el foco en el control; un `<select>` o un
  selector de color lo suelta después de un cambio con el mouse; las 16 teclas y los
  atajos llegan al emulador desde cualquier control que no sea de texto; Espacio y Enter
  sobre un control enfocado con el teclado lo activan; las flechas eligen en los controles
  que las usan y van al keypad en los demás ([4.6](#46-teclado-keypad-y-foco)).
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
  `#status`. Los avisos flotantes quedan para los problemas al cargar una ROM, los
  diagnósticos y la configuración aplicada, arriba al centro.
- **Consecuencias:** una sola lectura con lector de pantalla y nada tapado. Un aviso de
  arriba puede tapar un momento el botón "?" en pantallas anchas.

### 8.15 Los efectos viven en la interfaz

- **Contexto:** el parpadeo es inherente a CHIP-8 (borrar y redibujar con XOR); el
  "fósforo" lo disimula, pero no es parte de la máquina. Lo mismo los colores de XO-CHIP:
  la especificación deja la paleta a cargo del intérprete.
- **Decisión:** el núcleo solo tiene máscaras de planos; la estela, las scanlines, el
  resplandor, los colores, la curvatura y los modos de pantalla son de la interfaz, con un
  buffer de brillo por plano ([4.3](#43-la-pantalla-de-cpudisplay-al-lienzo)).
- **Consecuencias:** el framebuffer siempre es exacto para las pruebas, el monitor y las
  capturas; los efectos se pueden apagar (Píxeles puros) sin cambiar la emulación.

### 8.16 Sin dependencias, también en las pruebas

- **Contexto:** las pruebas en el navegador suelen usar Puppeteer o Playwright, que se
  instalan con npm y descargan su propio navegador.
- **Decisión:** `node:test` para las pruebas unitarias y, para las E2E, un cliente propio
  del DevTools Protocol sobre el `WebSocket` global de Node 22, usando el Chrome o Edge
  instalado. Lo mismo en `tools/archive.js`: `fetch`, `node:crypto` y un codificador PNG
  propio sobre `zlib`.
- **Consecuencias:** `git clone` y listo: no hay `node_modules`, ni `npm install`, ni
  descargas de cientos de megas, ni versiones que se desactualicen; alcanza con cualquier
  `node` ([8.24](#824-un-node-portátil-para-trabajar)). El costo: solo navegadores
  Chromium y unas 400 líneas de infraestructura propia que hay que mantener.

### 8.17 Quirks del VIP por defecto y perfiles detectados

- **Contexto:** CHIP-8 es el intérprete del COSMAC VIP, pero muchos programas modernos se
  escribieron para SUPER-CHIP o XO-CHIP.
- **Decisión:** el perfil de fábrica es el del VIP (`vfReset`, `memory`, `clipping` y
  `displayWait` activados), con la plataforma CHIP-8 y 15 IPF. Los interruptores se tocan
  de a uno y el selector de perfil muestra el perfil cuyos quirks coinciden, o
  "Personalizado".
- **Consecuencias:** los programas clásicos andan sin tocar nada; para los modernos alcanza
  con elegir un perfil, y los del archivo se configuran solos. Como los ajustes se
  guardan, el perfil elegido sigue en la próxima sesión.

### 8.18 Octo como referencia de SUPER-CHIP y XO-CHIP

- **Contexto:** SUPER-CHIP 1.1 en la HP-48 hacía cosas que los programas de hoy no
  esperan (desplazamientos de medio píxel en baja resolución, VF con la cantidad de filas
  que chocaron, cambiar de resolución sin borrar); casi todos los juegos modernos se
  escribieron y probaron en Octo, y la suite de Timendus toma a Octo como la referencia de
  XO-CHIP y llama "SUPER-CHIP moderno" a lo que hace Octo.
- **Decisión:** las instrucciones de SUPER-CHIP y XO-CHIP hacen lo que hace Octo, con las
  decisiones propias de [3.9](#39-las-plataformas) (pila, fuentes, opcodes que Octo
  acepta y la especificación no, el beep).
- **Consecuencias:** los juegos del archivo andan con los ajustes con que se juegan en
  Octo (103 de 104 sin errores). No están los comportamientos *legacy* de la HP-48: un
  programa que dependa de ellos se ve distinto ([9.11](#911-limitaciones-conocidas-y-trabajo-futuro)).

### 8.19 Perfil y Plataforma: dos selectores

- **Contexto:** hasta la segunda ronda, "perfil" quería decir "seis quirks". Con las
  plataformas aparecieron dos preguntas distintas: qué máquina es (el juego de
  instrucciones, la memoria, la pantalla) y cómo se comporta en los detalles. Un perfil
  "SUPER-CHIP" que no habilitara SUPER-CHIP habría sido una trampa.
- **Decisión:** dos selectores. **Plataforma** cambia solo la máquina (y reinicia la ROM);
  **Perfil** cambia la plataforma del perfil y sus seis quirks; los interruptores cambian
  solo quirks. El selector de perfil sigue detectando el perfil por los quirks.
- **Consecuencias:** un clic en un perfil deja la consola como el intérprete de verdad;
  quien necesita una combinación rara (plataforma XO-CHIP con quirks del VIP, como hace
  *Planos* al cargarse) la tiene. El costo: elegir un perfil puede reiniciar la ROM, y el
  tutorial lo avisa donde propone cambiar de perfil.

### 8.20 La prioridad de los ajustes por cartucho

- **Contexto:** al cargar una ROM hay varias fuentes posibles de ajustes: lo que la
  persona ya le cambió, la tabla del archivo, la plataforma del demo y los ajustes de
  siempre. Y una fuente automática no puede "contagiar" a la ROM siguiente.
- **Decisión:** recordado > archivo > plataforma del demo > tus últimas elecciones,
  **campo por campo** ([4.9](#49-ajustes-por-cartucho)). Solo los cambios explícitos se
  guardan, en `settings` y en la ROM; lo automático se aplica con `auto` y no se guarda.
  «Olvidar ajustes» borra lo recordado (no las banderas).
- **Consecuencias:** lo que la persona eligió para un juego siempre gana, los juegos
  conocidos andan bien la primera vez, y una ROM desconocida arranca como la persona tiene
  la consola. Con el interruptor apagado, la consola vuelve exactamente al comportamiento
  de la primera ronda.

### 8.21 Los límites de la biblioteca

- **Contexto:** `localStorage` tiene un límite por origen (unos 5 MB en Chromium, y en
  `file://` puede ser compartido por todos los archivos locales); las ROMs de XO-CHIP
  pueden tener 64 KB, y en base64 un tercio más.
- **Decisión:** como mucho 60 cartuchos y unos 2,5 MB de base64 entre todos; lo que no
  entra se va empezando por el jugado hace más tiempo, nunca el de la ranura; y si el
  navegador dice que no hay lugar, la biblioteca le cede espacio a los ajustes
  ([4.10](#410-tus-cartuchos-la-biblioteca)). Un aviso dice qué se fue, y quitar a mano
  tiene **Deshacer**.
- **Consecuencias:** la biblioteca nunca deja a la consola sin poder guardar sus ajustes,
  y lo que se pierde es lo más fácil de recuperar: una ROM que se vuelve a cargar desde su
  archivo.

### 8.22 La curvatura viene apagada

- **Contexto:** la curvatura del tubo es linda, pero deforma la imagen (los píxeles de los
  bordes dejan de ser cuadrados), cuesta un filtro SVG por cuadro y no todos los
  navegadores la soportan sobre la página.
- **Decisión:** apagada de fábrica, solo en Tubo CRT, deshabilitada con una explicación si
  el navegador no puede, y nunca en las capturas. El encendido animado, en cambio, viene
  prendido: no cambia la imagen y no demora al programa.
- **Consecuencias:** la consola se ve nítida y exacta la primera vez; quien quiere el
  efecto lo prende y queda guardado.

### 8.23 Ninguna dirección de red en chip8.html

- **Contexto:** la regla del archivo único es "no pide nada a la red", y la prueba más
  simple y robusta de eso es que el archivo no contenga ninguna dirección `http(s)` ni
  `url(...)` externa. La tabla del archivo de la comunidad necesitaba decir de dónde salió.
- **Decisión:** `tests/single-file.test.js` prohíbe toda dirección de red, sin excepciones;
  el bloque del archivo guarda su fuente como `github.com/JohnEarnest/chip8Archive`, sin
  el esquema; las llamadas a `toDataURL` y `createObjectURL` llevan un espacio antes del
  paréntesis, así la búsqueda de `url(` no las confunde; la curvatura usa un filtro en el
  mismo documento (`url(#crt-warp)`, un ancla).
- **Consecuencias:** cualquier dirección que se cuele hace fallar las pruebas, sin una
  lista de excepciones que mantener. El crédito completo, con el enlace, está en la ayuda
  (como texto), en el README y en el manual. La regla pesó también en la cuarta ronda:
  las ROMs del archivo van en base64url, que no tiene `/`, porque con el base64 común dos
  barras seguidas habrían parecido el principio de una dirección
  ([8.40](#840-las-roms-del-archivo-adentro-de-chip8html-comprimidas-de-a-una)).

### 8.24 Un Node portátil para trabajar

- **Contexto:** la PC de la segunda ronda no tenía Node en el PATH, y las reglas de trabajo
  eran no instalar nada.
- **Decisión:** usar el Node que ya traía un editor instalado (Cursor), por su ruta
  completa, para las pruebas y las herramientas; comprobar que la suite pasa con Node 22 y
  con 24.
- **Consecuencias:** nada que instalar ni configurar, y la documentación explica cómo
  hacerlo ([9.10](#910-trabajar-sin-node-en-el-path)). Sin npm, se usan los comandos
  `node ...` que hay detrás de cada script. La ruta del Node de otro programa puede
  cambiar cuando ese programa se actualiza: conviene preferir uno de ruta estable.

### 8.25 SHA-1 en JavaScript puro

- **Contexto:** la autoconfiguración y los ajustes por cartucho necesitan reconocer cada
  ROM por su huella, y las huellas del archivo son SHA-1. `crypto.subtle` es asincrónico y
  no está disponible en `file://` (no es un contexto seguro).
- **Decisión:** un SHA-1 sincrónico en el núcleo (`Core.sha1`), probado contra
  `node:crypto` en todos los largos de 0 a 300 bytes.
- **Consecuencias:** la huella se calcula igual en Node, en HTTP y desde el disco, antes
  del primer frame, sin promesas. Para ROMs de hasta 64 KB el costo es despreciable.

### 8.26 Las instrucciones de pantalla de otra plataforma se ignoran

- **Contexto:** un programa de SUPER-CHIP cargado con la plataforma CHIP-8 puede usar
  instrucciones que allá no existen. Detener la máquina siempre sería lo más estricto, pero
  `00FE`, `00FF`, `00CN`, `00FB`, `00FC`, `00FD` y `DXY0` tienen en CHIP-8 la forma de
  instrucciones que no hacen nada (`0NNN` y un `DXYN` sin filas), y así se comportaba un
  intérprete de la época.
- **Decisión:** esas se ignoran y dejan un aviso (uno por ROM, con un botón para cambiar
  de plataforma); las demás, que no se pueden ignorar sin romper el programa, lo detienen
  con un error que nombra la plataforma que hace falta.
- **Consecuencias:** un juego de Octo que solo usa, por ejemplo, `00E0` y `00FF` igual se
  puede ver en CHIP-8 (en baja resolución), y la consola dice qué le falta; ninguno sigue
  corriendo con datos equivocados.

### 8.27 El beep hasta el primer F002

- **Contexto:** en XO-CHIP, el patrón de audio empieza "como lo deje el intérprete"; Octo lo
  empieza en ceros, así que un programa que nunca ejecuta `F002` no suena.
- **Decisión:** hasta el primer `F002` desde el último reset suena el beep de siempre;
  desde ahí, el patrón.
- **Consecuencias:** los programas de CHIP-8 y SUPER-CHIP no se quedan mudos con la
  plataforma XO-CHIP (que es la que la consola elige para casi todos los juegos de Octo).
  Un programa de XO-CHIP que carga su patrón suena igual que en Octo.

### 8.28 El formato de los estados: JSON con los ceros comprimidos

- **Contexto:** un estado se guarda en `localStorage`, que guarda texto, y el navegador da
  unos 5 MB por origen, compartidos con los ajustes y la biblioteca. La memoria de XO-CHIP
  son 64 KB: en base64, 87.384 caracteres por estado, aunque casi todos sean ceros. Además,
  un estado guardado puede volver roto, y cargarlo no puede romper la máquina.
- **Decisión:** JSON común, con los arreglos chicos en base64 y la memoria y la pantalla con
  las rachas de ceros comprimidas (un 0 y el largo en base 128) antes del base64
  ([3.11](#311-estados-guardados-y-rebobinado)), sin bibliotecas
  ([8.16](#816-sin-dependencias-también-en-las-pruebas)); `"format"` y `version` al
  principio; y todo se valida antes de tocar la máquina. Sobre el contenido, tres reglas:
  - **La ROM no va adentro.** El estado es la máquina, no el cartucho: la interfaz lo
    guarda por la huella de la ROM y `loadState` no toca `rom`. Así un estado ocupa de 1 a
    4 KB, y no 64 KB más, y Reiniciar después de cargarlo vuelve a empezar el cartucho de
    siempre.
  - **Los quirks vuelven con el estado.** Son parte de cómo se comporta la máquina: un
    estado guardado con los quirks de SUPER-CHIP y cargado con los del VIP seguiría
    distinto que el original. La interfaz los muestra sin anotarlos como una elección de
    la persona.
  - **Las banderas RPL también vuelven.** Son 16 bytes de la máquina que el juego lee
    como parte de su partida: cargar un estado sin ellas mezclaría dos momentos.
- **Consecuencias:** un estado típico ocupa de 1 a 4 KB, se puede leer con cualquier
  editor, y uno roto da un mensaje que dice qué campo está mal. A cambio, un compresor
  general como deflate dejaría el texto más chico; un estado no sirve sin su ROM; y cargar
  un estado viejo, o rebobinar, **borra un récord** que el juego guardó después (con
  «Ajustes por cartucho», la próxima mirada de `syncFlags` lo deja así guardado). Cambiar
  el formato obliga a pensar en lo que ya está guardado: `decodeState` exige la versión 1 y
  cada campo, así que un campo o un quirk nuevo deja «DAÑADO» todo lo guardado antes
  ([9.2](#92-agregar-o-cambiar-una-instrucción)).

### 8.29 El rebobinado: una foto por frame con páginas compartidas

- **Contexto:** volver atrás frame por frame necesita el estado de cada frame. Una foto
  entera de XO-CHIP ocupa unos 70 KB, así que 30 s serían más de 120 MB. Y la foto se toma
  60 veces por segundo (240 con el avance rápido): tiene que costar poco.
- **Decisión:** una foto por frame emulado, después de `runFrame`, con la memoria en
  páginas de 256 bytes que se comparten con la foto anterior si no cambiaron
  ([3.11](#311-estados-guardados-y-rebobinado)). Dos topes, el que llegue primero: 1800
  fotos (30 s) y 48 MB entre todas; siempre queda la última. Se vuelve al doble de la
  velocidad real (2 frames por tic, 8 con T), así 30 s de juego se recorren en 15. En
  pausa, un toque es un frame exacto, para depurar.
- **Consecuencias:** un juego de CHIP-8 guarda sus 30 s en unos 4 MB, y *Planos* en unos
  18; solo un programa que reescribe casi toda su memoria de 64 KB en cada frame se queda
  en unos 11 o 12 segundos. Una foto cuesta de 3 a 18 µs (unos 130 en el peor caso), lejos
  de los 16,67 ms de un frame, y el E2E 50 exige unos 60 fps (entre 55 y 66) tomando fotos
  y rebobinando con XO-CHIP a 1000 IPF. Como cada paso del rebobinado carga una foto entera, la máquina
  siempre queda en un frame exacto, y al soltar sigue igual que la primera vez (salvo
  `RND`, porque el azar no se guarda). No se puede volver a la mitad de un frame: después
  de unos Pasos, B vuelve al principio de ese frame. El pasado se pierde al reiniciar,
  cargar otra ROM o un estado, cambiar de plataforma o recargar la página.

### 8.30 La historia de git, reconstruida desde las transcripciones

- **Contexto:** la primera ronda se hizo antes de que existiera el repositorio y la
  segunda quedó sin commitear: toda la historia era un commit con la primera ronda
  entera. Quien lea el repositorio publicado no podría seguir cómo se construyó ni qué
  pruebas pasaban en cada momento.
- **Decisión:** reconstruir la historia, un commit por tarea. La primera ronda, volviendo
  a aplicar en una copia aparte cada `Write` y cada `Edit` de las transcripciones y los 78
  comandos de consola que cambiaron archivos; la segunda y la tercera, repartiendo su
  trabajo por tarea. Cada commit queda como estuvo de verdad, con sus pruebas en rojo si
  las tenía. Y dos controles antes de aceptar el resultado: el árbol igual byte por byte
  al punto de restauración (59 archivos) y las 122 lecturas de archivos de las
  transcripciones iguales a los archivos reconstruidos en ese momento
  ([7.12](#712-tercera-ronda-el-pedido-y-la-historia-de-git)).
- **Consecuencias:** `git log` cuenta el proceso de la sección 7 commit por commit, y
  cualquier commit muestra el código como estaba, con las pruebas que pasaban entonces
  (algunas en rojo, a propósito). Los hashes cambiaron: `d40912f` ya no está en la
  historia (su lugar lo tomó `63ad959`), y los que cita este documento son los de la
  historia nueva. Los commits anteriores a `63ad959` no tienen `.gitattributes`: en
  Windows hay que sacarlos con LF para que pasen sus pruebas.

### 8.31 Sacar `.claude/` de toda la historia

- **Contexto:** el repositorio ya estaba publicado, y su primer commit traía
  `.claude/launch.json`, la configuración de la vista previa del editor de una máquina,
  que no es parte del proyecto: el `.gitignore` de entonces solo dejaba afuera
  `.claude/settings.local.json`. El usuario quería el repositorio sin archivos de
  herramientas, también en la historia.
- **Decisión:** reescribir los 33 commits sin ese archivo, con el `.gitignore` nuevo (que
  deja afuera `.claude/` entero) desde el primero, y corregir lo que decían de `.claude/`
  este documento y dos mensajes de commit; conservar autores, fechas y asuntos; revisar el
  mapa de hashes y guardar la historia vieja antes de mover la rama; y reemplazar la de
  GitHub con `--force-with-lease`, que no pisa el remoto si alguien empujó algo mientras
  tanto ([7.15](#715-cuarta-ronda-la-historia-sin-claude)).
- **Consecuencias:** cualquier commit muestra el proyecto sin configuración de
  herramientas, y una configuración local de `.claude/` ya no puede entrar por error. A
  cambio, los hashes cambiaron por segunda vez (este documento cita los nuevos), y quien
  haya clonado el repositorio antes tiene que volver a clonarlo. Borrar el archivo en un
  commit nuevo habría sido más simple, pero lo habría dejado en la historia.

### 8.32 El ensamblador vive en chip8.html

- **Contexto:** el Taller necesita ensamblar en la página, y el ensamblador vivía en
  `tools/chip8asm.js`. Desde `file://` la página no puede leer otro archivo, y el usuario
  prefería que la consola no dependiera de herramientas en JavaScript: que lo que usa esté
  en `chip8.html` y las herramientas solo lo lean ([7.14](#714-cuarta-ronda-el-pedido)).
- **Decisión:** el ensamblador pasó, tal cual, a un bloque nuevo, `<script id="chip8-asm">`,
  entre el núcleo y los cartuchos: código escrito a mano, no generado, y puro como el
  núcleo, con su mismo encabezado. `tools/chip8asm.js` quedó como la línea de comandos, con
  el mismo uso y los mismos mensajes: saca el bloque de `chip8.html` y lo evalúa con `vm`,
  como `tests/harness.js` saca el núcleo. Se movió sin cambiar su estilo (ES2015, cuando el
  núcleo y la interfaz son ES5).
- **Consecuencias:** la consola, la terminal y las pruebas ensamblan con el mismo código, y
  no hay una copia que mantener al día. El archivo único tiene un bloque más, seis, con su
  etiqueta exacta ([2.4](#24-la-regla-del-cierre-de-script)). `tools/chip8asm.js` ya no
  anda solo: necesita el `chip8.html` que está al lado de su carpeta, y lo dice si falta;
  las pruebas que lo corren en una carpeta temporal copian también `chip8.html`.
  `tools/embed-roms.js` usa el ensamblador del HTML para armar otro bloque del mismo HTML,
  y eso está bien porque el del ensamblador no es generado.

### 8.33 Todos los errores de una pasada, con el mismo código que assemble

- **Contexto:** en el Taller conviene ver todos los errores juntos, cada uno en su
  renglón. El ensamblador lanzaba el primero y se detenía, y las pruebas fijan exactamente
  qué acepta y qué mensaje da.
- **Decisión:** `check` y `assemble` comparten el código,
  `build(fuente, opciones, report)`: sin `report`, el primer error se lanza como siempre;
  con `report`, cada error de un renglón se anota y ese renglón no genera bytes. Un nombre
  que no se pudo definir no vuelve a dar error donde se usa, y "no entra en la memoria"
  se dice una vez. Como mucho, 100 errores
  ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)).
- **Consecuencias:** `check` acepta y rechaza exactamente lo mismo que `assemble`, y su
  primer error es siempre el que lanzaría `assemble`: lo comprueba
  `tests/asm-bloque.test.js` con 600 fuentes rotas al azar. No aparecen errores en cascada
  por un nombre roto. Los errores que siguen a uno pueden depender de cómo siguió el
  ensamblador después del primero; por eso el Taller lleva el cursor al primero.

### 8.34 La plataforma de un programa es su etiqueta @platform

- **Contexto:** un programa del Taller puede ser de CHIP-8, de SUPER-CHIP o de XO-CHIP, y
  eso decide con qué opción se ensambla y en qué plataforma corre. Los cartuchos incluidos
  ya lo decían con `; @platform` en su encabezado.
- **Decisión:** la plataforma está en el fuente, en esa misma etiqueta, y no en un dato
  aparte del programa: el selector **Plataforma** del Taller escribe la etiqueta y, si se
  la escribe a mano, el selector la sigue. `headerTags`, del ensamblador, es el único
  lector de etiquetas: lo usan el Taller y `tools/embed-roms.js`. `loadCartridge` recibe la
  plataforma del programa (`platform`), que vale por encima de la recordada para esos
  bytes.
- **Consecuencias:** el texto dice todo, y un `.asm` bajado o abierto la conserva; en la
  terminal se ve qué plataforma pide, aunque `tools/chip8asm.js` siga necesitando `--xo`.
  Una etiqueta mal escrita es un error en su renglón, no una plataforma equivocada en
  silencio. Recorrer las plataformas con el teclado no reescribe el texto a cada flecha:
  el cambio se aplica al dejar de moverse.

### 8.35 El Taller guarda a mano y anota solo lo que no se guardó

- **Contexto:** el pedido traía **Guardar** y **Restaurar el original** (para los
  ejemplos y los cartuchos editados), así que hay un texto guardado y otro sin guardar. La
  consola no usa `beforeunload`, que le saca a la página el caché de atrás y adelante del
  navegador, así que no puede preguntar antes de cerrarse.
- **Decisión:** dos niveles en `localStorage['chip8-consola.taller']`: lo guardado
  (`programs` y `edited`) y lo que cambió y todavía no se guardó (`drafts`), que se anota
  solo, a los `WS_DRAFT_MS` de dejar de escribir, al cambiar de programa, al cerrar el
  Taller y al ocultarse o irse la página. La marca SIN GUARDAR dice cuál se ve. Sin lugar,
  el Taller avisa y no saca nada de otro lado para hacerse lugar: eso lo elige la persona.
- **Consecuencias:** una recarga no pierde nada, y Guardar sigue teniendo sentido: es lo
  que respeta **Restaurar el original** y lo que dice «editado». Lo guardado es de este
  navegador, como los estados; para llevar un programa a otro, está **Descargar .asm**.

### 8.36 El Taller va al costado de la consola, no encima

- **Contexto:** el Taller sirve para escribir y mirar el resultado al mismo tiempo: a
  1440 px tenía que verse entero sin tapar la pantalla de la consola, y en un teléfono no
  entran las dos cosas con un ancho útil.
- **Decisión:** desde 1200 px, un panel fijo a la derecha, de arriba abajo, con la consola
  corrida a la izquierda y el monitor debajo de los estantes (desde 1900 px entran los
  tres); por debajo, al final de la columna. Su aspecto es el de un periférico más: el
  plástico oscuro del monitor y un editor como una pantalla de terminal.
- **Consecuencias:** a 1440 y a 1280 px se ven a la vez la pantalla, el keypad y el
  editor; mientras está abierto, el monitor queda más abajo, salvo en las pantallas muy
  anchas. En un teléfono, escribir y mirar la pantalla piden scroll: por eso, al correr un
  programa con el Taller abajo, su línea de estado avisa que la pantalla está arriba.

### 8.37 El depurador vive en el núcleo y no cuesta nada si no se usa

- **Contexto:** un depurador necesita saber qué hizo el programa (qué se ejecutó, qué se
  leyó, cuáles fueron las últimas instrucciones) y detenerse antes de una dirección. Lo
  primero se anota en cada instrucción; lo segundo, mirado en cada instrucción, frenaría a
  la consola a 10.000 IPF, y la plataforma CHIP-8 no podía volverse más lenta
  ([1.6](#16-requisitos-no-funcionales)).
- **Decisión:** todo en el núcleo, con arreglos tipados reservados una sola vez: en
  `step`, la traza y la marca de código son tres escrituras y un `|=`, sin objetos ni
  llamadas, y las marcas de los datos van dentro de las instrucciones que ya recorren esos
  bytes. Los puntos de corte no se miran en `step` sino en `runFrame`, y solo si hay
  alguno, un objetivo o un frame abierto; si no, corre el bucle de siempre
  ([3.12](#312-el-depurador)). El mapa, la traza y los dibujos no son parte del estado de
  la máquina.
- **Consecuencias:** del orden de 1 ns más por instrucción, menos de 0,1 ms por frame a
  10.000 IPF ([3.10](#310-rendimiento)); con un punto de corte puesto, unos 10 ms de CPU
  por segundo emulado. El formato de los estados no cambió. El monitor muestra datos como
  datos sin adivinar: una palabra es `DB` solo si se leyó o se escribió y nunca se
  ejecutó, así que antes de que el programa la toque se ve como una instrucción, más
  tenue.

### 8.38 Un frame cortado queda abierto

- **Contexto:** un punto de corte detiene la máquina en el medio de un frame. Si ese frame
  bajara igual los timers, cada parada agregaría un tic, y un bucle que espera a DT se
  comportaría distinto según dónde se frene. Además, al seguir, la instrucción del punto
  de corte no puede volver a detener la máquina.
- **Decisión:** el frame queda abierto: no hace su tic y recuerda cuántas instrucciones
  ejecutó; la próxima `runFrame` ejecuta las que le faltan y recién entonces baja los
  timers. Al seguir, la instrucción en la que se detuvo se ejecuta aunque tenga un punto
  de corte, como en GDB (`skipBreakpointOnce`). Paso sigue sin tocar los timers ni contar
  para el frame.
- **Consecuencias:** detenerse y seguir no cambia lo que hace el programa: entre tic y tic
  se ejecutan las mismas instrucciones (`tests/depurador.test.js` lo compara durante 200
  frames, estado por estado). Frame, después de una parada, completa el frame abierto en
  lugar de ejecutar uno nuevo. Mientras el frame está abierto no hay foto del rebobinado:
  llega cuando el frame se completa.

### 8.39 Los puntos de corte son de la ROM y duran lo que la página

- **Contexto:** un punto de corte tiene sentido para un programa en particular, y uno
  olvidado de otra sesión frenaría un juego sin aviso.
- **Decisión:** los puntos de corte son del cartucho: al cargar otro se guardan, en
  memoria, por la huella de los bytes que se van, y vuelven cuando esos bytes se vuelven a
  cargar. No van a `localStorage`, y reiniciar, cargar un estado, rebobinar o cambiar de
  plataforma no los tocan.
- **Consecuencias:** se puede ir y venir entre cartuchos sin perder los puntos de corte de
  cada uno, y una recarga empieza siempre sin ninguno. Un programa del Taller que se
  cambia es otra ROM (otra huella): arranca sin puntos de corte, y volver al texto de
  antes los recupera. Guardarlos entre sesiones queda como trabajo futuro
  ([9.11](#911-limitaciones-conocidas-y-trabajo-futuro)).

### 8.40 Las ROMs del archivo, adentro de chip8.html, comprimidas de a una

- **Contexto:** la ventana del archivo carga los juegos con un clic, y desde `file://` la
  página no puede leer `roms/archivo/`: las ROMs tenían que ir adentro. Son 925 KB, y en
  base64 serían más de 1,2 MB.
- **Decisión:** cada ROM, comprimida por separado con deflate en formato zlib (el
  `'deflate'` de `DecompressionStream`, que está desde Chrome 80, Firefox 113 y Safari
  16.4; `'deflate-raw'` llegó después) a cambio de 6 bytes por ROM, y escrita en base64url
  sin relleno, que no tiene `/`, `=`, `<` ni `>` ([2.4](#24-la-regla-del-cierre-de-script)).
  Van al final del bloque `chip8-archive`, aparte de la tabla, una línea por ROM. La
  consola descomprime solo la que se pide y verifica su huella; `embed` conserva el texto
  de las que ya se descomprimen bien. Los juegos que se cargan desde la ventana no van a
  «Tus cartuchos».
- **Consecuencias:** `chip8.html` pesa 1,5 MB, y casi la mitad son las ROMs (unos 726.000
  bytes; sin ellas, el archivo tendría unos 820 KB). La tabla sigue igual de legible, una
  ROM dañada no se carga, y volver a embeber no cambia nada aunque otra versión de zlib
  comprima distinto. Un navegador sin `DecompressionStream` no puede cargar los juegos
  desde la ventana: lo dice, y la autoconfiguración sigue andando. Los juegos del archivo
  no ocupan lugar en el almacenamiento del navegador.

### 8.41 El archivo de estados: JSON legible, con la ROM solo si hace falta

- **Contexto:** exportar estados sirve para llevarlos a otro navegador o pasárselos a
  alguien. Un estado sirve solo con su ROM, y el otro navegador puede no tenerla. Y lo
  que entra tiene que poder validarse.
- **Decisión:** un archivo JSON con sangría (`format: "chip8-consola-estados"`,
  `version: 1`), con los cartuchos por su huella y, en cada uno, sus estados como objetos
  (no como texto escapado), con su ranura, su fecha en ISO 8601 y una pantallita en PNG.
  La ROM va solo si el otro navegador puede no tenerla: no va para los demos ni para los
  juegos del archivo. Al importar, cada estado se decodifica y se vuelve a codificar, y la
  pantallita del archivo se ignora: cada consola dibuja la suya
  ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)).
- **Consecuencias:** el archivo se lee a ojo, y un campo roto se informa con su cartucho y
  su ranura, sin frenar el resto. Lo que entra al almacenamiento es exactamente lo que
  guardaría esta consola, y "ya estaba igual" se compara por el texto. Los ajustes por
  cartucho (la paleta, el giro, los quirks recordados) no viajan: el otro navegador
  muestra el estado con los suyos.

### 8.42 Importar pregunta antes de reemplazar

- **Contexto:** un archivo importado puede traer un estado para una ranura que ya tiene
  otro, y pisar una partida sin preguntar no tiene vuelta atrás.
- **Decisión:** antes de escribir nada, si hay ranuras ocupadas, una ventana pregunta
  cuáles reemplazar, con las casillas **sin marcar** y las dos pantallitas a la vista.
  Cancelar no escribe nada, tampoco lo que iba a ranuras vacías: la decisión es una sola.
  Un clic en el fondo no la cierra. Al escribir, cada ranura se vuelve a mirar.
- **Consecuencias:** importar nunca pisa algo sin que la persona lo elija, así que no hace
  falta un "Deshacer" de la importación. A cambio, un archivo con muchas ranuras ocupadas
  pide marcarlas (o **Reemplazar todos**).

### 8.43 Al soltar un archivo, decide el contenido

- **Contexto:** desde la cuarta ronda se sueltan sobre la página dos clases de archivos:
  ROMs y archivos de estados. El nombre no alcanza (una ROM puede tener cualquier
  extensión), y una ROM puede empezar con el byte de «{» (0x7B, `ADD VB, NN`).
- **Decisión:** `dropFile` mira primero 256 bytes: si, después de una marca BOM o de
  espacios, empiezan con «{» y el archivo es JSON, es un archivo de estados. Si empieza con
  «{» pero no es JSON, es una ROM, salvo que se llame `.json` o sea más grande que una ROM:
  entonces es un archivo de estados dañado, y se avisa. Todo lo demás es una ROM, como
  siempre.
- **Consecuencias:** cualquiera de los dos se suelta en el mismo lugar y anda, y una ROM no
  se lee entera dos veces. Un `.asm` soltado sigue cargándose como ROM: para abrirlo en el
  Taller está **Abrir .asm** ([9.11](#911-limitaciones-conocidas-y-trabajo-futuro)).

### 8.44 Las pantallitas, con el giro y los colores del cartucho

- **Contexto:** las pantallitas de los estados se dibujaban sin girar y con la paleta
  activa: con un juego del archivo que usa la pantalla girada, no se parecían al tubo. Y
  en la lista de todos los estados conviven cartuchos con colores y giros distintos.
- **Decisión:** cada pantallita se dibuja, cada vez, del `display` del estado, con los
  colores y el giro con que se ve ese cartucho: el de la ranura, como se ve ahora; otro,
  como arrancaría según sus ajustes (`resolveConfig`). El giro usa el mismo mapeo que el
  tubo y la captura. Si una pantalla girada no entra ni a escala 1, se achica suavizada en
  lugar de perder filas.
- **Consecuencias:** no hubo nada que migrar (las pantallitas nunca se guardaron), y los
  estados guardados antes también aparecen girados. La pantallita muestra cómo se va a ver
  el estado al cargarlo. `screenshotCanvas` tiene todavía su propio mapeo del giro, escrito
  aparte.

### 8.45 Las ventanas modales se quedan con el teclado

- **Contexto:** la cuarta ronda sumó tres ventanas modales: el archivo de la comunidad, la
  lista de estados y la pregunta de las ranuras ocupadas. Con los atajos de una sola
  tecla, Retroceso reiniciaba la máquina debajo de una ventana y H abría la ayuda encima. Y
  los avisos flotantes quedan debajo de un `<dialog>` modal.
- **Decisión:** mientras una de esas ventanas está abierta, las teclas son de ella:
  `onKeyDown` no hace nada (en la del archivo, salvo L, que la cierra), y con la del
  archivo abierta el joystick no se lee. Cada ventana tiene su propia línea de mensajes,
  donde va lo que pasa mientras está abierta; en la del archivo es una región
  `aria-live="assertive"`, porque el escenario 14 no deja que haya ningún `role="alert"`.
- **Consecuencias:** adentro de una ventana, Espacio, Enter y las flechas hacen lo de
  cualquier página, y la emulación sigue corriendo debajo, como con la ayuda. Los avisos
  flotantes siguen quedando debajo de cualquier modal (también de la ayuda): se resolvió
  para estas ventanas, con su línea propia; una solución general sería ponerlos en la capa
  superior ([9.11](#911-limitaciones-conocidas-y-trabajo-futuro)).

---

## 9. Cómo extender

### 9.1 Reglas de la casa

- No edites `<script id="chip8-roms">` ni `<script id="chip8-archive">` a mano: cambiá
  `roms/*.asm` o `docs/ejemplos/*.asm` y corré `node tools/embed-roms.js`, o
  `data/archive.json` (o `roms/archivo/`) y corré `node tools/archive.js embed`. El
  bloque `<script id="chip8-asm">`, en cambio, se edita a mano, como el núcleo: es el
  ensamblador ([5.1](#51-el-ensamblador-chip8-asm-y-toolschip8asmjs)).
- Lo que usa la consola vive en `chip8.html`; las herramientas lo leen
  ([8.32](#832-el-ensamblador-vive-en-chip8html)).
- No cambies las etiquetas de apertura de los bloques ni pongas `</script` adentro de un
  bloque ([2.4](#24-la-regla-del-cierre-de-script)).
- Nada externo y ninguna dirección de red: ni CDN, ni fuentes, ni imágenes por URL, ni
  `fetch`. Si hace falta una imagen, que sea una URL `data:` o se dibuje
  ([8.23](#823-ninguna-dirección-de-red-en-chip8html)).
- El núcleo no toca el navegador.
- Un cambio de ajustes que hace la consola sola va con `auto`; uno de la persona, sin
  ([4.9](#49-ajustes-por-cartucho)). Cargar un estado o rebobinar no es ninguna de las
  dos cosas: no toca `settings` ni los ajustes del cartucho
  ([4.22](#422-estados-guardados-y-rebobinado)).
- Lo que se agregue al estado de la máquina va también a los estados guardados (el paso 6
  de [9.2](#92-agregar-o-cambiar-una-instrucción)).
- Todo texto para el usuario, mensaje de error, comentario y documento, en castellano con
  voseo; los identificadores, en inglés.
- Antes de terminar: `node --test`, y `node tools/e2e.js` si tocaste la interfaz.
- Si cambiás un texto de la interfaz, una constante citada, un mensaje, un miembro de
  `window.chip8` o un escenario E2E, las pruebas de la documentación te van a decir qué
  actualizar ([6.6](#66-pruebas-de-la-documentación)).

### 9.2 Agregar o cambiar una instrucción

1. **Núcleo:** en CHIP-8, el caso en el `switch` de `Chip8.prototype.step` (y, si dibuja,
   en `_draw`). Para SUPER-CHIP o XO-CHIP: su entrada en `EXT` (plataforma mínima y
   nombre), su decodificación en `extendedEntry` y su comportamiento en `_op00`, `_op5`,
   `_opF` o `_drawExt`, sin alargar el camino de CHIP-8. Respetá "VF al final" y enmascará
   toda dirección con `_mask`. Si un opcode pasa de inválido a válido, sacalo del camino
   que llama a `_invalid`. Si lee o escribe la memoria como datos, marcá esos bytes en el
   mapa de accesos (`access`, con `READ` o `WRITE`) en el mismo recorrido, como `FX55` o
   `DXYN` ([3.12](#312-el-depurador)), y sumalo a las pruebas del mapa de
   `tests/depurador.test.js`.
2. **Desensamblador:** el texto en `disassemble` o en `extendedText`.
3. **Ensamblador:** el mnemónico en `MNEMONICS` y el patrón en `TABLE` del bloque
   `chip8-asm` de `chip8.html` (con su tamaño si no son 2 bytes), y la tabla de
   instrucciones del comentario del principio del bloque (bajo `CHIP-8`, `SUPER-CHIP` o
   `XO-CHIP`: la prueba del manual lee esas listas).
4. **Pruebas:** un grupo en `tests/instructions.test.js` o en `tests/superchip.test.js` /
   `tests/xochip.test.js`, el texto en `tests/disasm.test.js` o `tests/platform.test.js`, y
   el ensamblador en `tests/asm.test.js` o `tests/asm-extendido.test.js`. La ida y vuelta
   de las 65 536 palabras va a fallar si el desensamblador y el ensamblador no coinciden;
   `tests/core-api.test.js` tiene una lista de opcodes que tienen que ser inválidos, y
   `tests/platform.test.js` una tabla de referencia de `extendedInfo`.
5. **Documentación:** la ficha en la sección 10 o 13.11 del manual (la prueba del manual
   exige una ficha por instrucción, con su plataforma), el machete de la parte 2.9 o 9.1
   del tutorial, y la tabla de [3.7](#37-errores-avisos-y-fin-del-programa) de este
   documento.
6. **Si la instrucción agrega estado a la máquina** (un registro, un modo, un arreglo),
   sumalo a los estados guardados ([3.11](#311-estados-guardados-y-rebobinado)): a
   `saveState`, a `checkState` (con su rango y su mensaje), a `loadState`, al texto de
   `encodeState` y `decodeState`, a la foto de `RewindBuffer.push` y a `snapshotState`, y
   a `STATE_KEYS` de `tests/estados.test.js`, con una prueba de ida y vuelta que lo use.
   Pensá en lo que ya está guardado en los navegadores: `decodeState` exige cada campo y
   la versión 1, así que un campo nuevo deja «DAÑADO» todo estado guardado antes, salvo
   que `decodeState` le ponga un valor por defecto o que `STATE_VERSION` suba y aprenda a
   leer la versión vieja.

### 9.3 Agregar un quirk

1. **Núcleo:** la clave en `QUIRK_KEYS`, su valor en cada perfil de `QUIRK_PRESETS` y el
   comportamiento en `step`. `setQuirks`, `copyQuirks` y `DEFAULT_QUIRKS` la toman solos.
2. **Interfaz:** `chip8-ui` tiene **su propia copia** de `QUIRK_KEYS` (el núcleo no la
   exporta): agregala ahí y su entrada en `QUIRK_INFO` (etiqueta corta, nombre, opcodes y
   descripción). El interruptor, la ayuda, la detección de perfil, la validación de los
   ajustes guardados y de los recordados salen de esas dos listas. La línea fija
   "Perfiles: COSMAC VIP = 1, 2, 5 y 6 activados..." de `buildHelpQuirks` se actualiza a
   mano.
3. **Archivo:** si Octo tiene la opción, su correspondencia en `fromOctoOptions` de
   `tools/archive.js`, y `node tools/archive.js embed`.
4. **Pruebas:** en `tests/quirks.test.js`, el quirk prendido y apagado y los valores de los
   perfiles; en `tests/archive.test.js`, la conversión; en `tools/e2e.js`, la función
   `presetQuirks` repite los perfiles.
5. **Documentación:** la sección 11 del manual y la tabla de la parte 1.6 del tutorial. Si
   cambiás las etiquetas cortas (`VF=0`, `MEM`...), `tests/tutorial.test.js` lo va a
   notar.
6. **Estados guardados:** un quirk nuevo es un campo más de `quirks` en cada estado, y
   `checkState` lo exige: los estados guardados antes quedan «DAÑADO» (mirá el paso 6 de
   [9.2](#92-agregar-o-cambiar-una-instrucción)). `RewindBuffer` guarda los quirks como
   bits de `QUIRK_KEYS` y no necesita cambios.

### 9.4 Actualizar el archivo de la comunidad

1. `node tools/archive.js update` (necesita internet): baja el archivo y reescribe
   `data/archive.json`. Leé los avisos (ROMs repetidas, plataformas que faltan, opciones
   que la consola no tiene).
2. `node tools/archive.js download` (necesita internet): baja a `roms/archivo/` las ROMs
   nuevas o cambiadas y reescribe `LEEME.md`. Si un programa salió del archivo, borrá su
   `.ch8` a mano: el comando avisa qué archivos sobran.
3. `node tools/archive.js embed`: reescribe `<script id="chip8-archive">`, con la tabla y
   las ROMs, que lee de `roms/archivo/` (por eso va después de `download`: si falta una
   ROM o no tiene su huella, falla).
4. `node tools/archive.js test --sheet ../hoja.png`: corré los juegos y mirá la hoja de
   contactos; un borde rojo es un juego que se detuvo.
5. `node --test`: `tests/archive.test.js` controla los datos, `roms/archivo/`, el bloque
   y las ROMs embebidas, y `tests/manual.test.js` los números que cita el manual
   (programas por plataforma, cuántos usan los quirks de Octo, las velocidades y su histograma): si
   cambiaron, actualizá las secciones 11.11 y 12.2 del manual, el README, las partes 1.7 y
   10.1 del tutorial (`tests/tutorial.test.js` compara cuántos programas dice con
   `data/archive.json` y con `roms/archivo/`) y [5.5](#55-toolsarchivejs).

### 9.5 Agregar un demo

1. Escribí `roms/<id>.asm` con las cuatro etiquetas (`@name`, `@description`, `@controls`,
   `@order`), `@platform` si no es de CHIP-8, y las reglas de
   [5.3](#53-reglas-para-escribir-un-demo). El `@order` define la posición en el estante;
   el 1 es el que arranca con la consola.
2. `node tools/embed-roms.js`: escribe `roms/<id>.ch8` y actualiza `chip8.html`, también
   `CHIP8_SOURCES`: el Taller trae solo el fuente nuevo, y `tests/taller.test.js` lo
   compara con el archivo.
3. En `tests/roms.test.js`, agregá el `id` a `DEMO_IDS` (en el orden de `@order`: la
   prueba exige `@order` = posición + 1) y un grupo con su comportamiento. Las pruebas
   generales (600 frames por perfil sin ejecutar datos) lo toman solas.
4. Actualizá el README (que dice "seis cartuchos" y los presenta), la parte 1.2 del
   tutorial (`tests/tutorial.test.js` la compara con las etiquetas `@`) y
   [5.4](#54-los-seis-cartuchos). Los escenarios E2E que recorren el estante y los chips
   lo toman solos; el de los chips exige además que todos entren en la vista a 1440×900
   sin scrollear.

### 9.6 Agregar una paleta

Agregá la entrada en `PALETTES` (`{ name, bg, on, p2, both }`, cada color `[r, g, b]`) y
su clave en `PALETTE_IDS`. Mantené la escalera de brillo (fondo < ambos < plano 2 < plano
1) con al menos 1,8:1 de contraste entre vecinos. Las tablas de colores, el selector y la
validación de los ajustes guardados salen de ahí. Si la paleta necesita un tratamiento
especial como LCD (sin resplandor, con grilla en lugar de scanlines), mirá `applyPalette`,
`updateGlow`, `buildScanPattern` y las reglas CSS `.crt[data-palette="lcd"]`. Las pruebas
E2E de Píxeles puros recorren una lista fija de paletas: sumala ahí. Los nombres de las
paletas aparecen en la parte 1.8 del tutorial, que `tests/tutorial.test.js` compara con
`chip8.html`.

### 9.7 Cambiar el mapa del teclado

El mapa está repetido en varios lugares a propósito (cada uno lo muestra o lo verifica):

- `KEY_BY_CODE` (el mapa) y `PC_HINT` (la letra impresa en cada tecla del keypad) en
  `chip8-ui`;
- el diagrama `keymap-grid` y el texto oculto "Correspondencia: ..." de la ayuda, en el
  marcado;
- `PC_KEYS` en `tools/e2e.js`;
- los `@controls` de Teclado, Atrapa y Planos (que nombran letras);
- el README, la parte 1.4 del tutorial (que `tests/tutorial.test.js` compara con
  `KEY_BY_CODE`) y la §7.2 del manual.

Que ninguna tecla del mapa choque con los atajos (Espacio, N, O, K, Retroceso, H, L, T, P,
G, Y, I, U y B). Los mapas de las flechas y el joystick están en `KEYMAP_PRESETS` y en las
opciones del selector `#keymap` (el texto de cada opción repite las teclas; el tutorial
los cita). Un atajo nuevo va en `onKeyDown` (y en `onKeyUp` si se mantiene), en la tabla
de atajos de la ayuda, en la del README, en la de la parte 1.10 del tutorial, en
[4.6](#46-teclado-keypad-y-foco) y en esta lista: las pruebas de la documentación comparan
las cuatro últimas con la de la ayuda. No las comparan, pero también lo nombran el
párrafo de la ayuda que dice qué teclas siguen yendo a la consola con un control
enfocado, el mismo párrafo de la parte 1.10 del tutorial y la tabla de la §7.2 del manual.

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

  `makeCpu` acepta `{ quirks, random, platform }` como segundo argumento. Para programas
  largos, ensamblalos con `loadAssembler().assemble(...)` (con `{ xochip: true }` si pasan
  de `0xFFF`).
- **De un cartucho:** en `tests/roms.test.js`, `demo(id, perfil)` crea la máquina con la
  guardia que detecta ejecución de datos, y `run(cpu, frames, ipf)` corre frames.
- **De la documentación:** respetá las marcas de [6.6](#66-pruebas-de-la-documentación)
  (`; Fragmento`, `; Plataforma: XO-CHIP`, `; (fragmento de RUTA)`,
  `<!-- salida: CMD -->`, `<!-- verificar: ... -->`).
- **E2E:** en `tools/e2e.js`, `scenario(n, 'título', async (ctx, s) => { ... })`. Empezá
  con `const page = await freshApp(ctx, s)`, usá `page.keyDown`, `page.press`,
  `page.click`, `page.clickAt`, `page.ev(expresión)`, `page.waitFor(...)` y `page.shot(...)`,
  y registrá cada comprobación con `s.check(ok, 'descripción', detalle)`. Agregá una línea
  a la lista del comentario del principio (la imprime `--help`) y una fila a la tabla de
  [6.7](#67-los-escenarios-e2e) (la prueba de este documento la exige, con los números en
  el mismo orden). Si varios trabajan en paralelo, conviene que cada uno numere los suyos
  desde una centena propia y renumerarlos al juntar, como en la cuarta ronda
  ([7.17](#717-cuarta-ronda-la-integración)).

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
  Chrome congela la pestaña solo en parte. En la cuarta ronda, los cuatro agentes
  corrieron sus E2E al mismo tiempo en la misma máquina, y los escenarios que miden 60
  cuadros por segundo pasaron igual.
- No escribe nada en el repositorio: las ROMs de prueba que usa van al perfil temporal, y
  las capturas, a la carpeta de `--shots` (conviene que esté fuera del repositorio).

### 9.10 Trabajar sin Node en el PATH

Cualquier `node` 22 o más nuevo sirve, sin instalarlo ni agregarlo al PATH: por ejemplo,
el que traen algunos editores. En Windows, Cursor trae uno en
`%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe`, de ruta estable
(el de otros programas puede cambiar de carpeta cuando se actualizan). En PowerShell,
desde la raíz del repositorio:

```powershell
$node = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
& $node --test
& $node tools/e2e.js
& $node tools/embed-roms.js --check
```

Sin npm, los scripts de `package.json` no andan: usá los comandos que hay detrás de cada
uno (`node --test`, `node tools/chip8asm.js`, `node tools/embed-roms.js`,
`node tools/archive.js`, `node tools/serve.js`, `node tools/e2e.js`). Las pruebas que
corren comandos (las del ensamblador y del tutorial) usan `process.execPath`, así que
funcionan con cualquier `node`.

### 9.11 Limitaciones conocidas y trabajo futuro

**Lo que ya no es trabajo futuro.** De las tres features que quedaron afuera de la
segunda ronda, la 8 (estados guardados y rebobinado) se hizo en la tercera
([1.4](#14-la-tercera-ronda-feature-8)), y la 6 (el Taller) y la 7 (el depurador), en la
cuarta ([1.5](#15-la-cuarta-ronda-features-6-y-7-el-archivo-y-los-estados-en-archivos)).
En la cuarta se hicieron también las cuatro ideas que esta sección había anotado con los
estados guardados: exportar e importar estados, una lista de todos, el giro en las
pantallitas y explorar el archivo desde la consola.

**Pendiente, a pedido del usuario.** Quedaron para más adelante, cuando se pidió la cuarta
ronda:

- **Probar con dispositivos y navegadores de verdad**: un teléfono, un joystick físico,
  Firefox y Safari. Todo se probó en Chrome, con entrada simulada
  ([6.8](#68-lo-que-no-se-verifica-automáticamente)).
- **Las rarezas de SUPER-CHIP en la HP-48**, como el scroll de medio píxel y las
  colisiones que cuentan filas (abajo, en las limitaciones).

**Lo que dejó afuera cada pieza de la cuarta ronda.**

- **El Taller:**
  - Arrastrar un `.asm` a la página lo sigue cargando como ROM (el arrastre es de la
    consola; para el Taller está **Abrir .asm**). Se podría distinguir por la extensión
    en `dropFile`, o con un `drop` propio sobre el Taller.
  - Resaltado de sintaxis (un `textarea` no tiene colores) y autocompletar.
  - Saltar de un error a otro con el teclado (F8 o algo así): hoy se llega por la lista o
    con el cursor.
  - Renombrar y borrar los ejemplos y los cartuchos: no son tuyos, se editan, se guardan y
    se restauran.
  - Exportar o importar todos los programas de una vez: hoy, de a uno, con **Descargar
    .asm** y **Abrir .asm**.
  - Un tope de espacio propio: guarda lo que el navegador deje y, si no entra, avisa y lo
    deja en memoria, sin sacar cartuchos ni estados para hacerse lugar.
  - El ensamblador quedó en ES2015, como estaba en la herramienta, mientras que el núcleo y
    la interfaz son ES5.
- **El depurador:**
  - Puntos de corte con condiciones (por el valor de un registro), de datos (al leer o
    escribir una dirección) o con contador, y guardarlos entre sesiones.
  - Cambiar la memoria o los registros desde el monitor.
  - Un teclado propio para el lienzo del mapa: hoy se recorre por REGIONES e «Ir a».
  - Las etiquetas del Taller en la traza y en la lista de puntos de corte: hoy están solo
    en el desensamblado (habría que usar `disasmLabel` también en `paintTraceRow` y en
    `renderBreakpoints`).
  - Rebobinar la traza con B (se vacía) y un "paso atrás" de a una instrucción (B vuelve de
    a un frame).
  - Que la pestaña Código entre en 640 px de alto a 360 px de ancho: mide unos 890, y como
    en las pantallas angostas el monitor no va pegado, se recorre con el scroll de la
    página. A 360 px, además, «PUNTO DE CORTE» ocupa dos renglones en la insignia.
- **La ventana del archivo:**
  - Recordar la búsqueda, los filtros y el orden entre sesiones.
  - Buscar escribiendo directamente sobre una tarjeta, o por evento o por identificador.
  - Miniaturas con teclas apretadas, para los juegos que casi no dibujan nada hasta que se
    toca una tecla (Bulb, Ghost Escape, Wonky Pong, Octopaint; la de Sub-Terr8nia es negra,
    con «SUB8» chiquito).
- **Los estados en archivos y la lista de todos:**
  - Deshacer una importación (se pregunta antes de reemplazar, así que hace menos falta;
    Borrar sí tiene «Deshacer»).
  - Exportar los ajustes por cartucho (la paleta, el giro, los quirks recordados) junto con
    los estados.
  - Elegir la ranura de destino al importar: un estado de la ranura 2 va a la ranura 2.
  - Usar al importar la pantallita que trae el archivo: se ignora.
  - Importar varios archivos a la vez: arrastrando varios, se toma el primero, como con
    las ROMs.
  - Filtrar u ordenar la lista de otra forma que por el estado más nuevo.
  - Que la lista se ponga al día sola si otra pestaña del mismo navegador guarda estados:
    no escucha el evento `storage`; al reabrirla se ve.
  - Los avisos flotantes siguen quedando debajo de cualquier modal, también de la ayuda.
    Se resolvió para las ventanas nuevas, con su línea propia
    ([8.45](#845-las-ventanas-modales-se-quedan-con-el-teclado)); una solución general
    sería ponerlos en la capa superior (la Popover API).
  - `screenshotCanvas` tiene su propio mapeo del giro: podría usar `rotatedIndex`.

**Limitaciones conocidas.**

- **SUPER-CHIP moderno, no el de la calculadora.** No están los comportamientos *legacy*
  de SUPER-CHIP 1.1 en la HP-48: desplazamientos de medio píxel en baja resolución, VF con
  la cantidad de filas que chocaron (y las recortadas) en alta resolución, `DXY0` de 8×16
  en baja resolución, cambiar de resolución sin borrar, solo 8 banderas, el vblank solo en
  baja resolución ([8.18](#818-octo-como-referencia-de-super-chip-y-xo-chip)). Un quirk o
  una plataforma "SUPER-CHIP 1.1" los podría sumar.
- **Sin código máquina del 1802.** `0NNN` se ignora; los programas del VIP que llaman a
  rutinas propias en código máquina no corren.
- **Sin fuentes de Octo.** Ni la consola ni el Taller entienden el lenguaje de Octo
  (`.8o`): la consola carga binarios, y el ensamblador usa los mnemónicos de Cowgod.
- **El audio de XO-CHIP** vuelve al principio del patrón cuando cambian el patrón o el
  tono, no cuando ST llega a 0 como pide la especificación (y hace Octo); suena el beep
  hasta el primer `F002`. `vfOrderQuirks` de Octo no existe (ningún juego del archivo lo
  usa).
- **El pitido** es una onda cuadrada fija de 440 Hz; no reproduce el tono del VIP mientras
  se mantiene una tecla durante `FX0A`.
- **`displayWait` aproximado:** no cuenta ciclos, así que no reproduce que un sprite grande
  tarde más.
- **Los estados no guardan el azar.** Después de cargar un estado o de rebobinar, `RND` da
  otros números: un juego que lo usa puede seguir distinto que la primera vez.
- **Los estados son de una ROM y de un navegador.** Se guardan por la huella de la ROM
  (si cambiás un byte de tu programa, sus estados quedan con la versión anterior) y en este
  navegador: para llevarlos a otro hay que exportarlos e importarlos
  ([4.26](#426-estados-en-archivos-y-la-lista-de-todos)), y se pierden si se borran los
  datos del sitio sin haberlos exportado. El pasado del rebobinado se pierde al recargar la
  página, y los puntos de corte, al cerrarla.
- **Navegadores y dispositivos:** solo se probó en Chromium, con entrada simulada; el
  estado `interrupted` del `AudioContext` de iOS no está manejado; no se probó con
  joysticks, pantallas táctiles ni lectores de pantalla reales ([6.8](#68-lo-que-no-se-verifica-automáticamente)).
  La ventana del archivo necesita `DecompressionStream` para cargar los juegos.
- **`chip8.html` pesa 1,5 MB**, y casi la mitad son las ROMs del archivo
  ([8.40](#840-las-roms-del-archivo-adentro-de-chip8html-comprimidas-de-a-una)).
- **El desensamblador** no refleja el quirk `shifting` (sigue mostrando VY en `SHR`/`SHL`).
- **Los avisos** aparecen arriba al centro y en pantallas anchas pueden tapar unos segundos
  el botón "?" y el título del monitor.
- **A 360 px con escala 1**, la escala entera deja la imagen más chica que el tubo.
- **No hay archivo `LICENSE`**; el README dice MIT (y que los datos del archivo son CC0).

**Otras ideas.** Correr las ROMs de prueba de Timendus (también las de SUPER-CHIP y
XO-CHIP) y sumar sus resultados a las pruebas; mutation testing de la interfaz y de las
herramientas; E2E en Firefox con WebDriver BiDi; exportar e importar la biblioteca y los
ajustes, como ya se hace con los estados; mostrar en «Tus cartuchos» los datos del
archivo (autores, evento) de los juegos conocidos, como los muestra su ventana; una opción
para la paleta de cada juego del archivo en las capturas.
