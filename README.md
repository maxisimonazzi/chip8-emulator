# CHIP-8 · consola vintage en un solo archivo

Un emulador de **CHIP-8** que corre en el navegador, en **un solo archivo HTML**
(`chip8.html`) y **sin dependencias**: no usa CDNs, fuentes externas, imágenes ni red.
Tiene la pinta de una computadora de aficionado de fines de los 70: carcasa de
plástico crema, pantalla CRT con fósforo verde, teclado hexadecimal y un monitor de
depuración al costado.

Viene con cinco cartuchos (programas de demo) escritos para este proyecto, así que
anda apenas lo abrís, sin descargar nada.

## Cómo usarlo

1. Hacé doble clic en **`chip8.html`**. No hay nada que instalar ni compilar: funciona
   abierto directamente desde el disco (`file://`) en cualquier navegador moderno.
2. Arranca solo con el cartucho *Rebote*. Para cambiarlo, tocá otro en la fila
   **Incluidos:**, debajo de la ranura (ahí mismo aparecen sus controles), o elegilo en
   el estante **Cartuchos incluidos**, debajo de la consola, que describe cada uno.
   También podés cargar tu propia ROM con el botón **Cargar ROM** o arrastrando el
   archivo a cualquier parte de la página (máximo 3584 bytes).
3. Tocá la consola una vez (clic o tecla) para habilitar el sonido: los navegadores no
   dejan reproducir audio antes de un gesto del usuario.
4. Apretá **H** (o el botón **?**) para ver la ayuda.

Si preferís servirlo por HTTP: `npm run serve` y abrí <http://localhost:8008/>.

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
teclas a la vez), o llegar a una tecla con **Tab** y apretarla con **Enter** o
**Espacio**.

| Atajo | Acción |
|---|---|
| Espacio | Pausa / continuar |
| N | Paso: ejecuta una sola instrucción |
| Retroceso (Backspace) | Reiniciar |
| H (o el botón **?**) | Ayuda |
| Esc | Cerrar diálogos |

Ningún atajo choca con las teclas del keypad. Los botones que tocás con el mouse no se
quedan con el foco, así que Espacio siempre pausa; si llegás a un control con Tab,
Espacio y Enter lo activan.

### Cartuchos incluidos

| Cartucho | Qué hace | Controles |
|---|---|---|
| **Rebote** | Una pelotita con cara rebota por la pantalla y suena al tocar un borde. | Ninguno. |
| **Teclado** | Visualizador del keypad: cada tecla se ilumina mientras la apretás, la última aparece en grande y suena un pitido. | Las 16 teclas, varias a la vez. |
| **Atrapa** | Jueguito: mové la paleta y atrapá los bloques que caen; cada uno suma un punto y la caída se acelera. Si se te escapan tres, perdés. | Izquierda: A o Q. Derecha: D o E. Al terminar, cualquier tecla. |
| **Autotest** | Se prueba a sí mismo: 19 comprobaciones de instrucciones, cada una con una tilde o una cruz, y un resumen. | Ninguno. No toques teclas mientras corre. |
| **Fuente** | Muestra los 16 dígitos hexadecimales de la fuente que vive en memoria. | Ninguno. |

## Qué trae

**Emulación**

- Las 35 instrucciones de CHIP-8, 4 KB de memoria, registros V0–VF, I, PC, pila de 16
  niveles, timers de retardo (DT) y de sonido (ST) a 60 Hz, pantalla de 64×32 y la
  fuente hexadecimal en `0x050`. Los programas se cargan en `0x200`.
- Los seis *quirks* conocidos, configurables en vivo: reset de VF (`vfReset`),
  load/store que avanza I (`memory`), shift sobre VX (`shifting`), salto con offset
  BXNN (`jumping`), recorte en los bordes (`clipping`) y espera de vblank
  (`displayWait`). Perfiles **COSMAC VIP** (por defecto), **SUPER-CHIP**, **XO-CHIP**
  y **Personalizado**.
- Velocidad configurable en **instrucciones por frame** (IPF): 15 por defecto, de 1 a
  1000. Los timers siempre van a 60 Hz, sea cual sea la velocidad.
- `FX0A` con la semántica del VIP (espera que se apriete **y se suelte** una tecla).
- Los programas rotos no rompen el emulador: una instrucción inválida o un
  desbordamiento de pila detienen la máquina con un mensaje claro (opcode y dirección)
  en la pantalla y en el monitor. **Reiniciar** vuelve a empezar y respeta si venías en
  pausa o de a un paso.
- Un núcleo probado a fondo, incluso con *mutation testing* (ver [Pruebas](#pruebas)).

**Interfaz**

- Dos modos de pantalla: **Tubo CRT** (resplandor, estela del fósforo que disimula el
  parpadeo, scanlines, viñeta y reflejo; la estela y las scanlines se apagan por
  separado) y **Píxeles puros** (cuadrados nítidos de dos colores, sin efectos). Cuatro
  paletas: verde fósforo, ámbar, blanco y LCD.
- Selector rápido de cartuchos debajo de la ranura, con los controles del que está
  puesto, y un estante que describe cada uno.
- Pitido de onda cuadrada (440 Hz) con Web Audio mientras suena el timer, con volumen y
  silencio.
- Monitor de depuración: PC, I, SP, DT, ST, V0–VF (resalta los que cambiaron), pila,
  desensamblado alrededor del PC (`BNNN` se muestra según el quirk `jumping`) y una
  vista de memoria alrededor de I. Botones **Pausa/Continuar**, **Paso**, **Frame** y
  **Reiniciar**.
- Los ajustes (velocidad, quirks, modo de pantalla, paleta, sonido) se recuerdan en el
  navegador.
- Se puede manejar solo con el teclado, los controles están etiquetados para lectores
  de pantalla, y se adapta a pantallas chicas y táctiles: en el teléfono, el keypad
  queda justo debajo de la pantalla.

## Documentación

- **[docs/TUTORIAL.md](docs/TUTORIAL.md)**: tutorial paso a paso. Cómo usar la consola,
  la anatomía de CHIP-8, un programa escrito a mano en hexadecimal, el ensamblador, un
  jueguito completo construido por etapas, depuración y cómo funciona un emulador por
  dentro. Los ejemplos están en [docs/ejemplos/](docs/ejemplos/).
- **[docs/MANUAL.md](docs/MANUAL.md)**: manual de referencia. Historia, arquitectura,
  memoria, registros, timers, pantalla, teclado, fuente, las 35 instrucciones una por
  una, quirks, temporización y variantes.
- **[docs/DESARROLLO.md](docs/DESARROLLO.md)**: documentación del desarrollo. Diseño
  interno, decisiones y cómo se verificó.

## Pruebas

Hace falta [Node.js](https://nodejs.org/) 22 o más nuevo (sin paquetes: solo módulos
de Node). Desde la raíz del repositorio:

```sh
node --test        # o: npm test
```

Son **797 pruebas** en 12 archivos (`tests/*.test.js`) y pasan todas, en unos 3
segundos. Cargan el núcleo del emulador directamente desde `chip8.html` (el bloque
`<script id="chip8-core">`) y cubren:

- cada una de las 35 instrucciones, con sus casos borde y los flags de VF;
- cada quirk activado y desactivado, y los perfiles;
- dibujo, colisiones, recorte y vuelta en los bordes;
- timers, teclado y la espera de `FX0A`;
- la API del núcleo, los errores (instrucciones inválidas, pila) y el desensamblador;
- los casos que dejó una pasada de *mutation testing* sobre el núcleo
  (`tests/mutation-gaps.test.js`): se le metieron errores a propósito y, por cada uno
  que la suite no detectaba, se agregó una prueba que lo atrapa;
- el ensamblador (incluida la ida y vuelta de las 65536 palabras posibles);
- los cinco cartuchos, que se ejecutan y se comparan contra lo esperado;
- el tutorial: que sus ejemplos ensamblen, corran y coincidan con lo que dice el texto;
- el manual y este README: que los ejemplos del manual ensamblen (los fragmentos, con
  las etiquetas que les faltan), que sus programas completos corran y que los enlaces
  lleven a encabezados y archivos que existen;
- que `chip8.html` siga siendo un solo archivo: sin recursos externos y con sus cuatro
  bloques bien formados (`tests/single-file.test.js`).

### En un navegador de verdad (E2E)

```sh
npm run e2e                           # o: node tools/e2e.js
node tools/e2e.js --only 1,5          # solo algunos escenarios
node tools/e2e.js --shots capturas    # guarda las capturas en esa carpeta
```

`tools/e2e.js` abre Chrome (o Edge) sin ventana, carga `chip8.html` por HTTP y por
`file://` y corre 24 escenarios con eventos reales (teclado, mouse, toques, arrastrar y
soltar) y tiempo real: velocidad, keypad, atajos, carga de ROMs, cartuchos, quirks,
sonido, monitor, errores, diseño adaptable y más. Imprime PASA o FALLA por escenario,
guarda capturas y sale con código 1 si algo falló. Tampoco usa dependencias: le habla
al navegador por el DevTools Protocol con el WebSocket que trae Node 22. `--help`
muestra todas las opciones (`--browser`, `--headed`, `--verbose`).

## Ensamblador y cartuchos

Los cartuchos están escritos en assembly en `roms/*.asm`. El ensamblador del proyecto,
`tools/chip8asm.js`, usa los mismos mnemónicos que muestra el desensamblador del
monitor (estilo Cowgod: `LD V1, 0x2A`, `DRW V0, V1, 5`, etc.).

```sh
# Ensamblar un programa (por defecto la salida es el mismo nombre con .ch8)
node tools/chip8asm.js programa.asm [salida.ch8] [--listing]
npm run asm -- programa.asm --listing
node tools/chip8asm.js --help

# Volver a ensamblar roms/*.asm y embeberlos en chip8.html
node tools/embed-roms.js          # o: npm run roms
node tools/embed-roms.js --check  # solo verifica que esté al día (sale con 1 si no)
```

Ante cualquier problema (un error en la fuente, un archivo que no se puede leer o
escribir, una opción desconocida) el ensamblador explica qué pasó en una línea y sale
con código 1. La sintaxis completa (etiquetas, `EQU`, `DB`, `DW`, formatos de números y
expresiones) está documentada al principio de `tools/chip8asm.js` y en la parte 4 del
tutorial. Cada `.asm` de `roms/` empieza con etiquetas `; @name`, `; @description`,
`; @controls` y `; @order`, que `embed-roms.js` usa para armar el estante de cartuchos.
`embed-roms.js` reescribe **solo** el contenido de `<script id="chip8-roms">`; no lo
edites a mano.

## Estructura del repositorio

```
chip8.html                   La consola completa: estilos, interfaz, núcleo y cartuchos.
                               <style id="chip8-style">   estilos
                               <script id="chip8-core">   núcleo del emulador (sin DOM)
                               <script id="chip8-roms">   cartuchos (GENERADO por embed-roms.js)
                               <script id="chip8-ui">     interfaz, audio y bucle principal
roms/                        Fuentes (.asm) y binarios (.ch8) de los cartuchos incluidos.
tools/chip8asm.js            Ensamblador (módulo de Node, script de navegador y línea de comandos).
tools/embed-roms.js          Ensambla roms/*.asm y los embebe en chip8.html.
tools/serve.js               Servidor estático mínimo en http://localhost:8008/.
tools/e2e.js                 Pruebas de punta a punta en Chrome o Edge sin ventana.
tests/                       Pruebas con node:test (harness.js carga los bloques de chip8.html).
tests/mutation-gaps.test.js  Casos que salieron del mutation testing del núcleo.
tests/manual.test.js         Ejemplos y enlaces del manual, y enlaces de este README.
tests/single-file.test.js    Que chip8.html no pida nada a la red y tenga sus cuatro bloques.
docs/MANUAL.md               Manual de referencia de CHIP-8.
docs/TUTORIAL.md             Tutorial.
docs/ejemplos/               Programas del tutorial y un mini emulador didáctico.
docs/DESARROLLO.md           Documentación del desarrollo.
package.json                 Scripts: test, asm, roms, serve, e2e. Sin dependencias.
```

## Limitaciones

- Es CHIP-8 clásico: los perfiles SUPER-CHIP y XO-CHIP solo cambian los quirks, no
  agregan las instrucciones nuevas de esas variantes (alta resolución, scroll, etc.).
  Ver la sección 13 del manual.
- El pitido es una onda cuadrada fija; el audio de XO-CHIP no está implementado.

## Licencia

MIT. Podés usar, copiar, modificar y distribuir este proyecto libremente, siempre que
conserves el aviso de copyright y de licencia.
