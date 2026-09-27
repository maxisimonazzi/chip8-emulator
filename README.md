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
2. Arranca solo con el cartucho *Rebote*. Elegí otro en el estante **Cartuchos
   incluidos**, o cargá tu propia ROM con el botón **Cargar ROM** o arrastrando el
   archivo a cualquier parte de la página (máximo 3584 bytes).
3. Tocá la consola una vez (clic o tecla) para habilitar el sonido: los navegadores no
   dejan reproducir audio antes de un gesto del usuario.
4. Apretá **H** para ver la ayuda.

Si preferís servirlo por HTTP (por ejemplo, para las pruebas en el navegador):
`npm run serve` y abrí <http://localhost:8008/>.

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
teclas a la vez).

| Atajo | Acción |
|---|---|
| Espacio | Pausa / continuar |
| N | Paso: ejecuta una sola instrucción |
| Retroceso (Backspace) | Reiniciar |
| H | Ayuda |
| Esc | Cerrar diálogos |

Ningún atajo choca con las teclas del keypad.

### Cartuchos incluidos

| Cartucho | Qué hace | Controles |
|---|---|---|
| **Rebote** | Una pelotita con cara rebota por la pantalla y suena al tocar un borde. | Ninguno. |
| **Teclado** | Visualizador del keypad: cada tecla se ilumina mientras la apretás, la última aparece en grande y suena un pitido. | Las 16 teclas, varias a la vez. |
| **Atrapa** | Jueguito: mové la paleta y atrapá los bloques que caen; tres errores y perdés. | Izquierda: A o Q. Derecha: D o E. Al terminar, cualquier tecla. |
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
  desbordamiento de pila detienen la máquina con un mensaje claro (opcode y dirección).

**Interfaz**

- Pantalla escalada con píxeles nítidos, paletas (verde fósforo, ámbar, blanco, LCD),
  scanlines y persistencia de fósforo opcionales (esta última disimula el parpadeo).
- Pitido de onda cuadrada con Web Audio mientras suena el timer, con volumen y
  silencio.
- Monitor de depuración: PC, I, SP, DT, ST, V0–VF (resalta los que cambiaron), pila,
  desensamblado alrededor del PC y una vista de memoria alrededor de I. Botones
  **Pausa/Continuar**, **Paso**, **Frame** y **Reiniciar**.
- Los ajustes (velocidad, quirks, paleta, sonido) se recuerdan en el navegador.
- Se adapta a pantallas chicas y a pantallas táctiles.

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
node --test
# o, lo mismo:
npm test
```

Las pruebas cargan el núcleo del emulador directamente desde `chip8.html` (el bloque
`<script id="chip8-core">`) y cubren:

- cada una de las 35 instrucciones, con sus casos borde y los flags de VF;
- cada quirk activado y desactivado, y los perfiles;
- dibujo, colisiones, recorte y vuelta en los bordes;
- timers, teclado y la espera de `FX0A`;
- la API del núcleo, los errores (instrucciones inválidas, pila) y el desensamblador;
- el ensamblador (incluida la ida y vuelta de las 65536 palabras posibles);
- los cinco cartuchos, que se ejecutan y se comparan contra lo esperado;
- el tutorial: que sus ejemplos ensamblen, corran y coincidan con lo que dice el texto.

## Ensamblador y cartuchos

Los cartuchos están escritos en assembly en `roms/*.asm`. El ensamblador del proyecto,
`tools/chip8asm.js`, usa los mismos mnemónicos que muestra el desensamblador del
monitor (estilo Cowgod: `LD V1, 0x2A`, `DRW V0, V1, 5`, etc.).

```sh
# Ensamblar un programa (por defecto la salida es el mismo nombre con .ch8)
node tools/chip8asm.js programa.asm [salida.ch8] [--listing]
npm run asm -- programa.asm --listing

# Volver a ensamblar roms/*.asm y embeberlos en chip8.html
node tools/embed-roms.js          # o: npm run roms
node tools/embed-roms.js --check  # solo verifica que esté al día (sale con 1 si no)
```

La sintaxis completa (etiquetas, `EQU`, `DB`, `DW`, formatos de números y
expresiones) está documentada al principio de `tools/chip8asm.js` y en la parte 4 del
tutorial. Cada `.asm` de `roms/` empieza con etiquetas `; @name`, `; @description`,
`; @controls` y `; @order`, que `embed-roms.js` usa para armar el estante de cartuchos.
`embed-roms.js` reescribe **solo** el contenido de `<script id="chip8-roms">`; no lo
edites a mano.

## Estructura del repositorio

```
chip8.html            La consola completa: estilos, interfaz, núcleo y cartuchos.
                        <style id="chip8-style">   estilos
                        <script id="chip8-core">   núcleo del emulador (sin DOM)
                        <script id="chip8-roms">   cartuchos (GENERADO por embed-roms.js)
                        <script id="chip8-ui">     interfaz, audio y bucle principal
roms/                 Fuentes (.asm) y binarios (.ch8) de los cartuchos incluidos.
tools/chip8asm.js     Ensamblador (módulo de Node, script de navegador y línea de comandos).
tools/embed-roms.js   Ensambla roms/*.asm y los embebe en chip8.html.
tools/serve.js        Servidor estático mínimo en http://localhost:8008/.
tests/                Pruebas con node:test (harness.js carga los bloques de chip8.html).
docs/MANUAL.md        Manual de referencia de CHIP-8.
docs/TUTORIAL.md      Tutorial.
docs/ejemplos/        Programas del tutorial y un mini emulador didáctico.
docs/DESARROLLO.md    Documentación del desarrollo.
package.json          Scripts: test, asm, roms, serve. Sin dependencias.
```

## Limitaciones

- Es CHIP-8 clásico: los perfiles SUPER-CHIP y XO-CHIP solo cambian los quirks, no
  agregan las instrucciones nuevas de esas variantes (alta resolución, scroll, etc.).
  Ver la sección 13 del manual.
- El pitido es una onda cuadrada fija; el audio de XO-CHIP no está implementado.

## Licencia

MIT. Podés usar, copiar, modificar y distribuir este proyecto libremente, siempre que
conserves el aviso de copyright y de licencia.
