# CHIP-8 · consola vintage en un solo archivo

Un emulador de **CHIP-8**, **SUPER-CHIP** y **XO-CHIP** que corre en el navegador, en **un
solo archivo HTML** (`chip8.html`) y **sin dependencias**: no usa CDNs, fuentes externas,
imágenes ni red. Tiene la pinta de una computadora de aficionado de fines de los 70:
carcasa de plástico crema, pantalla CRT con fósforo verde, teclado hexadecimal y un
monitor de depuración al costado.

Viene con seis cartuchos (programas de demo) escritos para este proyecto, así que anda
apenas lo abrís, sin descargar nada; y reconoce los 104 juegos del archivo de la
comunidad de John Earnest, que se configuran solos al cargarlos.

## Cómo usarlo

1. Hacé doble clic en **`chip8.html`**. No hay nada que instalar ni compilar: funciona
   abierto directamente desde el disco (`file://`) en cualquier navegador moderno.
2. Arranca solo con el cartucho *Rebote*. Para cambiarlo, tocá otro en la fila
   **Incluidos:**, debajo de la ranura (ahí mismo aparecen sus controles), o elegilo en
   el estante **Cartuchos incluidos**, debajo de la consola, que describe cada uno.
3. Para jugar algo tuyo, tocá **Cargar ROM** o arrastrá el archivo a cualquier parte de
   la página. Una ROM puede ocupar hasta 3584 bytes, o hasta 65.024 si es de XO-CHIP (con
   una más grande que 3584, la consola pasa sola al perfil XO-CHIP). Si es un juego
   conocido, la consola lo configura sola; y queda en el estante **Tus cartuchos** para la
   próxima vez.
4. Tocá la consola una vez (clic o tecla) para habilitar el sonido: los navegadores no
   dejan reproducir audio antes de un gesto del usuario.
5. Apretá **H** (o el botón **?**) para ver la ayuda.

Si preferís servirlo por HTTP: `npm run serve` (o `node tools/serve.js`) y abrí
<http://localhost:8008/>. Para usar la consola no hace falta Node; solo para las pruebas
y las herramientas.

### Teclado

Las teclas se leen por **posición física** (`KeyboardEvent.code`), así que el mapeo es
el mismo en QWERTY, AZERTY o cualquier otra distribución. El bloque 4×4 de la
izquierda del teclado reproduce el keypad del COSMAC VIP:

```
   Tu teclado                  Teclado CHIP-8
 +---+---+---+---+           +---+---+---+---+
 | 1 | 2 | 3 | 4 |           | 1 | 2 | 3 | C |
 +---+---+---+---+           +---+---+---+---+
 | Q | W | E | R |    -->    | 4 | 5 | 6 | D |
 +---+---+---+---+           +---+---+---+---+
 | A | S | D | F |           | 7 | 8 | 9 | E |
 +---+---+---+---+           +---+---+---+---+
 | Z | X | C | V |           | A | 0 | B | F |
 +---+---+---+---+           +---+---+---+---+
```

También podés usar el keypad en pantalla con el mouse o tocándolo (admite varias
teclas a la vez), llegar a una tecla con **Tab** y apretarla con **Enter** o
**Espacio**, o jugar con las **flechas** y un **joystick** (ver
[Comodidades](#comodidades)).

### Atajos

| Atajo | Acción |
|---|---|
| Espacio | Pausa / continuar |
| N | Paso: ejecuta una sola instrucción |
| Retroceso (Backspace) | Reiniciar |
| H (o el botón **?**) | Ayuda |
| T (mantenida) | Avance rápido: la máquina corre 4 veces más rápido, timers incluidos |
| P | Pantalla completa (para salir, P o Esc) |
| G | Guardar una captura de la pantalla en PNG |
| ↑ ↓ ← → | Las teclas del keypad que elijas en **Controles** (de fábrica, 5, 8, 7 y 9) |
| Esc | Cerrar diálogos |

Ningún atajo choca con las teclas del keypad. Los botones que tocás con el mouse no se
quedan con el foco, así que Espacio siempre pausa; si llegás a un control con Tab,
Espacio y Enter lo activan, y las teclas del keypad, N, H, T, P, G y Retroceso siguen
yendo a la consola. Las flechas eligen, en cambio, cuando el foco está en un selector,
un deslizador o el modo de pantalla.

### Cartuchos incluidos

| Cartucho | Qué hace | Controles |
|---|---|---|
| **Rebote** | Una pelotita con cara rebota por la pantalla y suena al tocar un borde. | Ninguno. |
| **Teclado** | Visualizador del keypad: cada tecla se ilumina mientras la apretás, la última aparece en grande y suena un pitido. | Las 16 teclas, varias a la vez. |
| **Atrapa** | Jueguito: mové la paleta y atrapá los bloques que caen; cada uno suma un punto y la caída se acelera. Si se te escapan tres, perdés. | Izquierda: A o Q. Derecha: D o E. Al terminar, cualquier tecla. |
| **Autotest** | Se prueba a sí mismo: 19 comprobaciones de instrucciones, cada una con una tilde o una cruz, y un resumen. | Ninguno. No toques teclas mientras corre. |
| **Fuente** | Muestra los 16 dígitos hexadecimales de la fuente que vive en memoria. | Ninguno. |
| **Planos** | Muestra de XO-CHIP en 128×64: un disco y un rombo rebotan en dos planos y donde se cruzan aparece un cuarto color; el rombo se mueve corriendo su plano con scroll, un contador con la fuente grande cuenta los rebotes y cada pared suena con su nota. Al elegirlo, la consola pasa sola a la plataforma XO-CHIP. | W: mientras la tenés apretada, el rombo se queda quieto. |

## Qué trae

### Emulación

- Tres plataformas, cada una con todo lo de la anterior:
  - **CHIP-8**: las 35 instrucciones, 4 KB de memoria, registros V0–VF, I, PC, pila de 16
    niveles, timers de retardo (DT) y de sonido (ST) a 60 Hz, pantalla de 64×32 y la
    fuente hexadecimal en `0x050`. Los programas se cargan en `0x200`.
  - **SUPER-CHIP**: alta resolución de 128×64, sprites de 16×16, desplazamientos de la
    imagen (scroll), la fuente grande de 8×10 en `0x0A0`, 16 banderas persistentes (RPL)
    y `EXIT`.
  - **XO-CHIP**: 64 KB de memoria (con `LD I, LONG`), dos planos de dibujo y cuatro
    colores, scroll hacia arriba, `SAVE`/`LOAD` de rangos de registros y sonido con un
    patrón de 128 bits y tono regulable.
- Las instrucciones de SUPER-CHIP y XO-CHIP siguen la semántica de **Octo**, que es la
  que esperan los programas de hoy, con algunas decisiones propias (pila de 16 niveles,
  las fuentes en `0x050` y `0x0A0`); están detalladas en la
  [sección 13.3 del manual](docs/MANUAL.md#133-las-plataformas-de-este-emulador).
- Los seis *quirks* conocidos, configurables en vivo: reset de VF (`vfReset`),
  load/store que avanza I (`memory`), shift sobre VX (`shifting`), salto con offset
  BXNN (`jumping`), recorte en los bordes (`clipping`) y espera de vblank
  (`displayWait`).
- Velocidad configurable en **instrucciones por frame** (IPF): 15 por defecto, de 1 a
  10.000. Los timers siempre van a 60 Hz, sea cual sea la velocidad (ver
  [MANUAL.md §12.2](docs/MANUAL.md#122-instrucciones-por-frame-ipf)).
- `FX0A` con la semántica del VIP (espera que se apriete **y se suelte** una tecla).
- Los programas rotos no rompen el emulador: una instrucción inválida o un
  desbordamiento de pila detienen la máquina con un mensaje claro (opcode y dirección)
  en la pantalla y en el monitor. **Reiniciar** vuelve a empezar y respeta si venías en
  pausa o de a un paso. Un programa que termina con `EXIT` muestra «FIN DEL PROGRAMA».
- Un núcleo probado a fondo, incluso con *mutation testing* (ver [Pruebas](#pruebas)).

### Plataformas y perfiles

En el grupo **Compatibilidad** del panel, el selector **Plataforma** elige la máquina
(CHIP-8, SUPER-CHIP o XO-CHIP; al cambiarla, la ROM vuelve a empezar) y el selector
**Perfil** elige todo junto: la plataforma y los seis quirks de cada intérprete
(**COSMAC VIP** con CHIP-8, el de fábrica; **SUPER-CHIP**; **XO-CHIP**; o
**Personalizado** si tocás los interruptores a mano). Si una ROM usa una instrucción que
la plataforma elegida no tiene, la consola avisa: las de pantalla se ignoran, como en un
intérprete de la época, con un aviso y un botón para cambiar de plataforma; las demás
detienen la máquina con un error que dice qué plataforma hace falta y un botón
**Cambiar a … y reiniciar** (ver
[§11.10 del manual](docs/MANUAL.md#1110-diagnósticos-de-plataforma)).

### Ajustes por cartucho y el archivo de la comunidad

Cada ROM se reconoce por su huella SHA-1. Con el interruptor **Ajustes por cartucho**
(prendido de fábrica):

- **Los juegos conocidos se configuran solos.** La consola trae la tabla de los 104
  programas del archivo de la comunidad de John Earnest (50 de CHIP-8, 26 de SUPER-CHIP y
  28 de XO-CHIP, casi todos de las Octojam) con la plataforma, los quirks, la velocidad,
  los colores y el giro de pantalla con que se juegan en Octo. Al cargar uno, se aplican
  antes del primer frame y la ranura dice «ajustes del archivo».
- **Lo que cambiás se recuerda.** Si mientras corre una ROM cambiás la plataforma, el
  perfil, un interruptor, las IPF, la paleta o los controles, la consola lo recuerda para
  esa ROM («ajustes recordados»); **Olvidar ajustes** lo borra. También se guardan, por
  ROM, las banderas RPL donde algunos juegos guardan su récord.

La prioridad es: lo recordado, después el archivo, después la plataforma del demo
incluido y, si no hay nada, tus últimas elecciones (ver
[§11.11 del manual](docs/MANUAL.md#1111-ajustes-por-cartucho)).

Los datos del archivo vienen de *chip8Archive*, de John Earnest y los autores de cada
juego, publicado con licencia CC0 1.0 (dominio público) en
github.com/JohnEarnest/chip8Archive:
<https://github.com/JohnEarnest/chip8Archive>. La consola no trae las ROMs: solo su
huella y sus ajustes.

### Tus cartuchos

Cada ROM que cargás desde un archivo queda en el estante **Tus cartuchos**, debajo de los
incluidos, con la que jugaste por última vez primero, y las cinco más recientes aparecen
también en la fila **Tuyos:**, bajo la ranura: se vuelven a cargar con un clic, con sus
ajustes. La × de cada una la saca (con **Deshacer**). Entran hasta 60 ROMs y unos 2,5 MB
entre todas; si no hay lugar, se va la que hace más tiempo que no jugás. Se guardan en el
navegador (`localStorage`); si el navegador no deja guardar, duran hasta que cerrás la
página.

### Colores

Cada paleta tiene cuatro colores: el fondo, el plano 1 (el píxel de siempre), el plano 2
y los dos planos juntos; CHIP-8 y SUPER-CHIP usan los dos primeros, y XO-CHIP los
cuatro. Paletas: **Verde fósforo**, **Ámbar**, **Blanco**, **LCD**, **Personalizada**
(elegís los cuatro colores; se ven en vivo y quedan guardados) y **Del cartucho**, que
aparece cuando el cartucho cargado trae sus colores (los juegos del archivo). La pantalla
pasa sola a 128×64 en alta resolución, siempre con escala entera, y se gira si el juego
lo pide.

### Comodidades

- **Avance rápido**: mientras mantenés la **T** (o el botón del bisel), la máquina corre
  4 frames por cada frame real, timers incluidos, así el juego va igual, solo que más
  rápido (en pantalla aparece «×4»). Al soltar no queda atraso (ver
  [§12.5 del manual](docs/MANUAL.md#125-avance-rápido)).
- **Pantalla completa** (**P** o el botón del bisel), con píxeles enteros; en pantallas
  táctiles, el keypad va al lado.
- **Captura** (**G** o el botón de la cámara): un PNG con los colores exactos de la
  paleta, sin efectos y con escala entera (640 × 320).
- **Joystick** (Gamepad API): la cruz y la palanca izquierda, los botones A y B, y
  Start para pausar.
- **Controles**: qué teclas del keypad aprietan las flechas y el joystick: **WASD de
  Octo** (5, 8, 7, 9; A 6, B 4; el de fábrica), **Teclado numérico del VIP** (2, 8, 4, 6;
  A 5, B 0) o **Personalizado**. Se recuerda también por cartucho.
- **Curvatura** del tubo (apagada de fábrica) y **Encendido animado** (prendido de
  fábrica; no demora al programa y respeta «reducir movimiento»).

### Interfaz

- Dos modos de pantalla: **Tubo CRT** (resplandor, estela del fósforo que disimula el
  parpadeo, scanlines, viñeta y reflejo; la estela, las scanlines, la curvatura y el
  encendido se apagan por separado) y **Píxeles puros** (cuadrados nítidos con los
  colores exactos de la paleta, sin efectos).
- Selector rápido de cartuchos debajo de la ranura, con los controles del que está
  puesto, y estantes que describen cada uno.
- Pitido de onda cuadrada (440 Hz) con Web Audio mientras suena el timer, o el patrón de
  XO-CHIP con su tono, con volumen y silencio.
- Monitor de depuración: PC, I, SP, DT, ST, la plataforma y la resolución (MÁQUINA),
  V0–VF (resalta los que cambiaron), pila, desensamblado alrededor del PC con los
  mnemónicos de la plataforma (`BNNN` se muestra según el quirk `jumping`) y una vista
  de memoria alrededor de I; con XO-CHIP, direcciones de 4 dígitos. Botones
  **Pausa/Continuar**, **Paso**, **Frame** y **Reiniciar**.
- Los ajustes (velocidad, plataforma, quirks, pantalla, colores, controles, sonido) se
  recuerdan en el navegador.
- Se puede manejar solo con el teclado, los controles están etiquetados para lectores
  de pantalla, y se adapta a pantallas chicas y táctiles: en el teléfono, el keypad
  queda justo debajo de la pantalla.

## Documentación

- **[docs/TUTORIAL.md](docs/TUTORIAL.md)**: tutorial paso a paso. Cómo usar la consola,
  la anatomía de CHIP-8, un programa escrito a mano en hexadecimal, el ensamblador, un
  jueguito completo construido por etapas, depuración, cómo funciona un emulador por
  dentro y, al final, SUPER-CHIP y XO-CHIP leyendo el cartucho *Planos*
  ([parte 9](docs/TUTORIAL.md#9-más-allá-de-chip-8-super-chip-y-xo-chip)). Los ejemplos
  están en [docs/ejemplos/](docs/ejemplos/).
- **[docs/MANUAL.md](docs/MANUAL.md)**: manual de referencia. Historia, arquitectura,
  memoria, registros, timers, pantalla, teclado, fuente, las 35 instrucciones una por
  una, quirks, temporización y las variantes, con la referencia completa de SUPER-CHIP y
  XO-CHIP ([sección 13](docs/MANUAL.md#13-variantes-y-extensiones)).
- **[docs/DESARROLLO.md](docs/DESARROLLO.md)**: documentación del desarrollo. Diseño
  interno, decisiones, cómo se verificó y cómo se construyó.

## Pruebas

Hace falta [Node.js](https://nodejs.org/) 22 o más nuevo (sin paquetes: solo módulos
de Node). Desde la raíz del repositorio:

```sh
node --test        # o: npm test
```

Son **1479 pruebas** en 18 archivos (`tests/*.test.js`) y pasan todas, en unos 5
segundos. Cargan el núcleo del emulador directamente desde `chip8.html` (el bloque
`<script id="chip8-core">`) y cubren:

- cada una de las 35 instrucciones de CHIP-8, con sus casos borde y los flags de VF;
- las plataformas (`tests/platform.test.js`), las instrucciones de SUPER-CHIP
  (`tests/superchip.test.js`) y las de XO-CHIP (`tests/xochip.test.js`), contra
  implementaciones de referencia escritas aparte del núcleo;
- cada quirk activado y desactivado, y los perfiles;
- dibujo, colisiones, recorte y vuelta en los bordes;
- timers, teclado y la espera de `FX0A`;
- la API del núcleo, los errores (instrucciones inválidas, de otra plataforma, pila), el
  desensamblador de cada plataforma y la huella SHA-1;
- los casos que dejó una pasada de *mutation testing* sobre el núcleo
  (`tests/mutation-gaps.test.js`): se le metieron errores a propósito y, por cada uno
  que la suite no detectaba, se agregó una prueba que lo atrapa;
- el ensamblador, con las instrucciones nuevas y `--xo` (`tests/asm-extendido.test.js`),
  incluida la ida y vuelta con el desensamblador de las 65536 palabras en cada
  plataforma;
- los seis cartuchos, que se ejecutan y se comparan contra lo esperado;
- la tabla del archivo de la comunidad (`tests/archive.test.js`): la conversión de las
  opciones de Octo, `data/archive.json` y el bloque embebido;
- el tutorial: que sus ejemplos ensamblen, corran y coincidan con lo que dice el texto;
- el manual, este README y `docs/DESARROLLO.md`: que los ejemplos del manual ensamblen
  en su plataforma, que sus programas completos corran, que los datos que copia del
  núcleo y del archivo sean los de verdad y que los enlaces lleven a encabezados y
  archivos que existen;
- que `chip8.html` siga siendo un solo archivo: sin recursos externos ni direcciones de
  red, y con sus cinco bloques bien formados (`tests/single-file.test.js`).

### En un navegador de verdad (E2E)

```sh
npm run e2e                           # o: node tools/e2e.js
node tools/e2e.js --only 1,5          # solo algunos escenarios
node tools/e2e.js --shots capturas    # guarda las capturas en esa carpeta
```

`tools/e2e.js` abre Chrome (o Edge) sin ventana, carga `chip8.html` por HTTP y por
`file://` y corre 40 escenarios con eventos reales (teclado, mouse, toques, arrastrar y
soltar) y tiempo real: velocidad, keypad, atajos, carga de ROMs, cartuchos, quirks,
sonido, monitor, errores, diseño adaptable, plataformas, diagnósticos, colores, ajustes
por cartucho, banderas, biblioteca, avance rápido, captura, pantalla completa, joystick,
controles, curvatura y más. Imprime PASA o FALLA por escenario, guarda capturas y sale
con código 1 si algo falló. Pasan los 40, y una corrida completa tarda unos 3 minutos. Tampoco usa dependencias: le habla
al navegador por el DevTools Protocol con el WebSocket que trae Node 22. `--help`
muestra todas las opciones (`--browser`, `--headed`, `--verbose`) y la lista de
escenarios.

### Sin Node en el PATH

Las pruebas y las herramientas necesitan Node 22 o más nuevo, pero no hace falta
instalarlo si ya tenés uno: sirve cualquier `node.exe`, por ejemplo el que traen
algunos editores (en Windows, Cursor lo trae en
`%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe`). Usá esa ruta
en lugar de `node`; en PowerShell, desde la raíz del repositorio:

```powershell
& "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe" --test
& "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe" tools/e2e.js
```

Sin npm, los atajos `npm run ...` no andan: usá los comandos `node ...` que aparecen al
lado de cada uno. La consola en sí no necesita Node.

## Herramientas

| Comando | Qué hace |
|---|---|
| `npm test` | `node --test`: todas las pruebas. |
| `npm run asm -- programa.asm` | `node tools/chip8asm.js`: el ensamblador. |
| `npm run roms` | `node tools/embed-roms.js`: vuelve a ensamblar `roms/*.asm` y los embebe en `chip8.html`. |
| `npm run archive -- embed` | `node tools/archive.js`: la tabla del archivo de la comunidad. |
| `npm run serve` | `node tools/serve.js`: servidor estático en <http://localhost:8008/>. |
| `npm run e2e` | `node tools/e2e.js`: las pruebas en un navegador de verdad. |

### Ensamblador y cartuchos

Los cartuchos están escritos en assembly en `roms/*.asm`. El ensamblador del proyecto,
`tools/chip8asm.js`, usa los mismos mnemónicos que muestra el desensamblador del
monitor (estilo Cowgod: `LD V1, 0x2A`, `DRW V0, V1, 5`, etc.), también los de SUPER-CHIP
y XO-CHIP (`HIGH`, `SCR`, `LD HF, V1`, `PLANE 3`, `LD I, LONG 0x1234`, `AUDIO`...).

```sh
# Ensamblar un programa (por defecto la salida es el mismo nombre con .ch8)
node tools/chip8asm.js programa.asm [salida.ch8] [--listing] [--xo]
npm run asm -- programa.asm --listing
node tools/chip8asm.js --help

# Volver a ensamblar roms/*.asm y embeberlos en chip8.html
node tools/embed-roms.js          # o: npm run roms
node tools/embed-roms.js --check  # solo verifica que esté al día (sale con 1 si no)
```

`--xo` es para programas de XO-CHIP que pasan de `0xFFF` (hasta `0xFFFF`); sin esa
opción, el programa tiene que entrar en 4 KB. El ensamblador acepta todas las
instrucciones en cualquier programa: es la consola, según la plataforma, la que las
ejecuta o no. Ante cualquier problema (un error en la fuente, un archivo que no se puede
leer o escribir, una opción desconocida) explica qué pasó en una línea y sale con código
1. La sintaxis completa (etiquetas, `EQU`, `DB`, `DW`, formatos de números, expresiones
y nombres reservados) está documentada al principio de `tools/chip8asm.js` y en la parte
4 del tutorial.

Cada `.asm` de `roms/` empieza con etiquetas `; @name`, `; @description`, `; @controls`
y `; @order`, y opcionalmente `; @platform` (`chip8`, `schip` o `xochip`), que
`embed-roms.js` usa para armar el estante y para que la consola pase a esa plataforma
al cargar el demo. `embed-roms.js` reescribe **solo** el contenido de
`<script id="chip8-roms">`; no lo edites a mano.

### El archivo de la comunidad

```sh
node tools/archive.js update      # baja el registro y las ROMs del archivo y escribe data/archive.json
node tools/archive.js embed       # escribe la tabla en <script id="chip8-archive"> (--check: solo verifica)
node tools/archive.js test        # corre cada juego con sus ajustes (--sheet hoja.png: hoja de contactos)
```

`update` y `test` necesitan conexión a internet: bajan las ROMs a memoria para calcular
su huella o para correrlas, y no las guardan. `embed` trabaja sin red, con
`data/archive.json`. Hoy, `test` informa que 103 de los 104 juegos corren sin errores:
*Super Square* desborda la pila en su pantalla final, algo que con los 12 niveles de pila
de Octo pasaría todavía antes.

## Estructura del repositorio

```
chip8.html                   La consola completa: estilos, interfaz, núcleo, cartuchos y la tabla del archivo.
                               <style id="chip8-style">     estilos
                               <script id="chip8-core">     núcleo del emulador (sin DOM)
                               <script id="chip8-roms">     cartuchos (GENERADO por embed-roms.js)
                               <script id="chip8-archive">  tabla del archivo (GENERADO por archive.js)
                               <script id="chip8-ui">       interfaz, audio y bucle principal
roms/                        Fuentes (.asm) y binarios (.ch8) de los seis cartuchos incluidos.
data/archive.json            Los programas del archivo: huella SHA-1, plataforma y opciones de Octo.
tools/chip8asm.js            Ensamblador (módulo de Node, script de navegador y línea de comandos).
tools/embed-roms.js          Ensambla roms/*.asm y los embebe en chip8.html.
tools/archive.js             Tabla de autoconfiguración a partir del archivo de John Earnest (CC0).
tools/serve.js               Servidor estático mínimo en http://localhost:8008/.
tools/e2e.js                 Pruebas de punta a punta en Chrome o Edge sin ventana.
tests/harness.js             Saca los bloques de chip8.html y los evalúa en Node; ayudas para las pruebas.
tests/instructions.test.js   Las 35 instrucciones de CHIP-8.
tests/quirks.test.js         Los seis quirks y los perfiles.
tests/display.test.js        Dibujo, colisiones, recorte y la fuente.
tests/timers-keys.test.js    Timers, teclado y FX0A.
tests/core-api.test.js       La API del núcleo, la carga de ROMs y los errores.
tests/disasm.test.js         El desensamblador.
tests/mutation-gaps.test.js  Casos que salieron del mutation testing del núcleo.
tests/platform.test.js       Plataformas, diagnósticos, desensamblador por plataforma y SHA-1.
tests/superchip.test.js      Las instrucciones de SUPER-CHIP.
tests/xochip.test.js         Las instrucciones de XO-CHIP.
tests/asm.test.js            El ensamblador y su línea de comandos.
tests/asm-extendido.test.js  Las instrucciones nuevas del ensamblador y --xo.
tests/roms.test.js           Los cartuchos incluidos y embed-roms.js.
tests/archive.test.js        tools/archive.js, data/archive.json y el bloque embebido.
tests/tutorial.test.js       El tutorial y sus ejemplos.
tests/manual.test.js         El manual, este README y docs/DESARROLLO.md.
tests/single-file.test.js    Que chip8.html no pida nada a la red y tenga sus cinco bloques.
docs/MANUAL.md               Manual de referencia de CHIP-8, SUPER-CHIP y XO-CHIP.
docs/TUTORIAL.md             Tutorial.
docs/ejemplos/               Programas del tutorial y un mini emulador didáctico.
docs/DESARROLLO.md           Documentación del desarrollo.
package.json                 Scripts: test, asm, roms, archive, serve, e2e. Sin dependencias.
```

## Limitaciones

- **SUPER-CHIP "moderno", no el de la calculadora.** Las instrucciones de SUPER-CHIP
  hacen lo que hace Octo, que es lo que esperan los programas de hoy. No están los
  comportamientos *legacy* de SUPER-CHIP 1.1 en la HP-48: desplazamientos de medio
  píxel en baja resolución, VF con la cantidad de filas que chocaron en alta resolución,
  `DXY0` de 8×16 en baja resolución, cambiar de resolución sin borrar la pantalla o solo
  8 banderas. Ver la [sección 13.3 del manual](docs/MANUAL.md#133-las-plataformas-de-este-emulador).
- **Sin código máquina del 1802.** `0NNN` (las rutinas en código máquina del COSMAC
  VIP) se ignora, así que no corren los programas que dependen de ellas.
- **Sin fuentes de Octo.** La consola carga binarios (`.ch8`); no entiende el lenguaje de
  Octo (`.8o`). El ensamblador del proyecto usa los mnemónicos de Cowgod.
- **El audio de XO-CHIP** vuelve al principio del patrón cuando cambian el patrón o el
  tono, no cuando ST llega a 0, y suena el beep hasta el primer `AUDIO` (en Octo, nada);
  ver la [sección 13.10 del manual](docs/MANUAL.md#1310-el-audio-de-xo-chip-patrón-y-tono).
- **Probado en Chromium.** Las pruebas de punta a punta corren en Chrome y Edge sin
  ventana, con entrada simulada: no se probaron Firefox ni Safari, teléfonos y pantallas
  táctiles reales, joysticks reales ni lectores de pantalla reales, y el sonido no se
  escucha (se verifica el grafo de Web Audio).
- Del archivo de la comunidad, *Super Square* se detiene en su pantalla final por un
  desbordamiento de pila (ver [El archivo de la comunidad](#el-archivo-de-la-comunidad)).

## Licencia

MIT. Podés usar, copiar, modificar y distribuir este proyecto libremente, siempre que
conserves el aviso de copyright y de licencia. Los datos de `data/archive.json` (y la
tabla que se genera a partir de ellos) vienen del archivo de la comunidad de John
Earnest, con licencia CC0 1.0.
