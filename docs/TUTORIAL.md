# Tutorial de CHIP-8: de cero a tu primer juego

Este tutorial te lleva de la mano desde "nunca vi CHIP-8" hasta escribir, depurar y
entender un juego completo, y termina mostrándote cómo funciona un emulador por
dentro. Todo se hace con la consola de este proyecto (`chip8.html`), que corre en el
navegador sin instalar nada.

Cada programa que aparece acá es real: está en [`docs/ejemplos/`](ejemplos/), se
ensambla con el ensamblador del proyecto y los tests (`tests/tutorial.test.js`) lo
corren en el mismo núcleo que usa la consola para comprobar que hace lo que el texto
dice. Si copiás un listado del tutorial, anda.

Este tutorial es para aprender haciendo. Cuando quieras el detalle fino de algo (la
historia, cada instrucción con todos sus casos, los quirks), andá al
[manual de referencia](MANUAL.md). Si te interesa cómo está construido el emulador,
leé [DESARROLLO.md](DESARROLLO.md). La portada del proyecto es el [README](../README.md).

## Índice

0. [Qué vas a aprender y qué necesitás](#0-qué-vas-a-aprender-y-qué-necesitás)
1. [Usar el emulador](#1-usar-el-emulador)
2. [Anatomía de CHIP-8 en 10 minutos](#2-anatomía-de-chip-8-en-10-minutos)
3. [Tu primer programa, escrito a mano en hexadecimal](#3-tu-primer-programa-escrito-a-mano-en-hexadecimal)
4. [El ensamblador](#4-el-ensamblador)
5. [Proyecto guiado: el Cazamonedas](#5-proyecto-guiado-el-cazamonedas)
6. [Leer un programa real](#6-leer-un-programa-real)
7. [Depurar](#7-depurar)
8. [Cómo funciona un emulador por dentro](#8-cómo-funciona-un-emulador-por-dentro)
9. [Más allá de CHIP-8: SUPER-CHIP y XO-CHIP](#9-más-allá-de-chip-8-super-chip-y-xo-chip)
10. [Ejercicios y próximos pasos](#10-ejercicios-y-próximos-pasos)

---

## 0. Qué vas a aprender y qué necesitás

### Qué vas a aprender

- A usar la consola: cargar programas, tocar el teclado, cambiar la velocidad, la
  plataforma y los quirks, guardar la partida y volver atrás en el tiempo, y leer el
  monitor de depuración.
- Cómo es la máquina CHIP-8 por dentro: memoria, registros, pila, timers, pantalla y
  teclado.
- A escribir un programa **a mano, byte por byte**, en hexadecimal, y a entender cada
  uno de esos bytes.
- A usar el **ensamblador** del proyecto para escribir con nombres en vez de números.
- A construir un juego en seis etapas, cada una un programa completo que podés correr:
  sprites, teclado, tiempo, choques, puntaje y sonido.
- A leer programas ajenos y a **encontrar errores** con el monitor, instrucción por
  instrucción, volviendo atrás en el tiempo cuando te pasaste.
- Cómo funciona un emulador: el ciclo de buscar, decodificar y ejecutar, los timers a
  60 Hz, el dibujo con XOR. Hay un emulador mínimo, de menos de 200 líneas, para leer
  y correr.
- Qué agregan los descendientes de CHIP-8, **SUPER-CHIP** y **XO-CHIP** (alta
  resolución, dos planos de color, desplazamientos de la imagen, una fuente grande y
  sonido con patrón), leyendo un cartucho que los usa.

### Qué necesitás

- **Un navegador** moderno (Chrome, Edge, Firefox o Safari). Con eso alcanza para las
  partes 1, 2, 6, 7 y 9, y para cargar los `.ch8` ya ensamblados de las demás. Los
  programas de las partes 4, 5 y 9 también los podés escribir, ensamblar y correr en el
  **Taller** de la consola, sin nada más ([sección 4.8](#48-el-taller-ensamblar-sin-salir-de-la-consola)).
- **Una terminal** (PowerShell en Windows, o la que uses en Linux o macOS) para crear
  el archivo de la parte 3.
- **[Node.js](https://nodejs.org/)** para el ensamblador de la terminal (partes 4 y 5, y
  los ejercicios de la 9) y para el emulador mínimo (parte 8). No hay que instalar
  paquetes: todo el proyecto usa solo lo que trae Node. Los tests se corren con Node 22 o
  más nuevo. Si en tu computadora
  `node` no anda pero tenés un editor que trae el suyo, mirá
  [cómo usarlo](DESARROLLO.md#910-trabajar-sin-node-en-el-path).
- Este repositorio. Todos los comandos de la terminal se escriben **parado en la
  carpeta raíz del proyecto** (la que tiene `chip8.html`). Las rutas usan `/`, que
  funciona igual en PowerShell que en Linux y macOS.

### Convenciones

- Los números con `0x` están en hexadecimal: `0x200` es 512. Las direcciones van con 3
  dígitos (`0x200`), los bytes con 2 (`0x1E`) y las instrucciones con 4 (`D125`).
- Un **frame** (o **cuadro**) es 1/60 de segundo: el ritmo al que se refresca la
  pantalla y bajan los timers.
- **IPF** son las *instrucciones por frame*: cuántas instrucciones ejecuta el emulador
  en cada uno de esos 1/60 de segundo.
- Las instrucciones se escriben con los nombres de la referencia de Cowgod (`LD`,
  `DRW`, `SKNP`...), que son los que usan el ensamblador y el monitor.

### Los ejemplos

| Archivo | Parte | Qué hace |
|---|---|---|
| `01-a-mano.asm` | 3 y 4 | Dibuja la letra A de la fuente, en el centro. |
| `02-hola.asm` | 4 | Escribe HOLA con sprites propios. |
| `03-fantasma.asm` | 5, etapa A | Dibuja el protagonista del juego. |
| `04-mover.asm` | 5, etapa B | Lo mueve con el teclado. |
| `05-ritmo.asm` | 5, etapa C | Lo mueve a velocidad fija con el temporizador. |
| `06-monedas.asm` | 5, etapa D | Bordes, una moneda y choques. |
| `07-puntaje.asm` | 5, etapa E | Puntaje en pantalla. |
| `08-sonido.asm` | 5, etapa F | El juego completo, con sonido. |
| `09-contador-con-bug.asm` | 7 | Un programa con un error, para depurarlo. |
| `10-contador.asm` | 7 | El mismo, arreglado. |
| `11-sin-fin.asm` | 7 | Un programa que se sale de su camino y termina en error. |
| `mini-emulador.js` | 8 | Un emulador de CHIP-8 mínimo, en JavaScript. |

Al lado de cada `.asm` está su `.ch8` ya ensamblado, listo para cargar en la consola.

---

## 1. Usar el emulador

### 1.1 Abrir la consola

Hacé doble clic en `chip8.html`. Se abre en el navegador y anda así, directo desde el
disco: no necesita internet ni servidor. Si igual preferís abrirla desde un servidor
local, corré `node tools/serve.js` (o `npm run serve`) y entrá a
<http://localhost:8008/>.

Vas a ver una consolita beige con estas partes:

- Arriba, la **pantalla** (un monitor de tubo, de fósforo verde) y dos luces: **RUN** y
  **SONIDO**. En la barra hay cuatro botones redondos: el de los tres deslizadores abre
  el **cajón de opciones** (más abajo); el de la pantallita con una onda muestra u
  oculta el **monitor** de depuración; el del lápiz abre el **Taller**, donde se
  escriben programas ([sección 4.8](#48-el-taller-ensamblar-sin-salir-de-la-consola)), y
  el **?**, la ayuda. Al pie del tubo está impreso el nombre del cartucho que está
  puesto, al lado del modo de video, y hay cuatro botoncitos: el rebobinado (⏪), el
  avance rápido, la captura y la pantalla completa (sección 1.10).
- Debajo de la pantalla, los botones de **ejecución** (Pausa, Paso, Por encima, Salir,
  Frame y Reiniciar), cada uno con su tecla escrita debajo, y, más abajo, el parlante.
  Lo que va pasando se ve en las luces, en la pantalla y en el monitor; además, la
  consola se lo cuenta a los lectores de pantalla con frases como *En pausa.*,
  *Reiniciado (en pausa).* o *Paso: PC = 0x20C.* Al pie, el nombre del autor y su
  página, y la placa con el modelo de la máquina.
- A la derecha, el **keypad** hexadecimal de 16 teclas. En una pantalla angosta (un
  teléfono, o una ventana de menos de unos 760 píxeles de ancho) todo va en una sola
  columna: el keypad queda pegado debajo de la pantalla, para que los dos entren juntos,
  y los botones de ejecución bajan después. En una ventana ancha pero baja, la consola
  se achica entera, toda junta, hasta entrar sin scrollear: de la marca a la placa del
  pie.
- El **cajón de opciones**, que se abre con el botón de los tres deslizadores o con la
  tecla **M**: tres pestañas, **Cartuchos** (la ranura, **Cargar ROM**, el archivo de la
  comunidad y todos los cartuchos: sección 1.2), **Ajustes** (la velocidad, la pantalla
  y el sonido, la compatibilidad y los controles, una sección debajo de la otra, y al
  final **Cuidado**, que borra lo guardado y pregunta antes) y **Estados** (las partidas
  guardadas y el rebobinado). En una pantalla ancha sale del costado de la consola,
  tapando el monitor (o el Taller); en un teléfono sube desde abajo, tapando el keypad.
  Nunca tapa la pantalla, así ves cómo cambia la emulación mientras tocás algo. No traba
  nada: con el cajón abierto la consola sigue andando, con el teclado y con el mouse. Se
  guarda con la misma **M**, con **Esc** o con su **×**, y la próxima vez abre en la
  última pestaña (la primera vez, en **Cartuchos**). Lo que no entra se recorre adentro
  del cajón.
- El **monitor** de depuración: a la derecha si tu pantalla es ancha, o debajo de la
  consola si es angosta. Si no lo usás, ocultalo con su botón de la barra (o con
  **Ocultar**, en su cabecera): la consola queda sola en el medio, y la elección se
  recuerda.

Apenas abre, la consola carga el primer cartucho incluido, *Rebote*, y lo pone a
correr. Mientras tanto, el tubo se enciende con una línea brillante que se abre: es solo
un efecto, el programa ya está corriendo debajo (se apaga con **Encendido animado**,
sección 1.8).

### 1.2 Los cartuchos incluidos

Los cartuchos están en la pestaña **Cartuchos** del cajón de opciones (la tecla **M**):
primero los **Incluidos** y después **Tus cartuchos** (sección 1.3), cada uno en una
tarjeta chica con una miniatura de su pantalla y su nombre. Para cambiar de programa,
tocá su tarjeta: se carga y arranca solo, y su tarjeta queda marcada con un anillo
verde. Al pasar el mouse por una tarjeta (o al llegar con **Tab**) aparece un cartel con
todo lo demás: de qué se trata, los controles, la plataforma y el tamaño; **Esc** lo
cierra. Con el teclado, **Tab** entra a cada grupo y las flechas, **Inicio** y **Fin**
pasan de una tarjeta a otra. Arriba de la pestaña está la ranura, con el cartucho puesto
y, si es un incluido, la línea **Controles:** con las teclas que usa.

<!-- verificar: tabla-cartuchos -->
| Cartucho | Qué muestra | Controles (lo que dice la línea *Controles:*) |
|---|---|---|
| **Rebote** | Una pelotita con cara que rebota por la pantalla y suena al tocar un borde. | Ninguno: solo mirá. |
| **Teclado** | El keypad en pantalla: cada tecla se ilumina mientras la tenés apretada y la última aparece en grande. | Todas las teclas: 1 2 3 4 / Q W E R / A S D F / Z X C V (teclado del COSMAC VIP: 1 2 3 C / 4 5 6 D / 7 8 9 E / A 0 B F). Podés apretar varias a la vez. |
| **Atrapa** | Un jueguito: mové la paleta y atrapá los bloques que caen. Cada uno suma un punto y la caída se acelera, hasta un tope; si se te escapan tres, perdés. | Izquierda: A (tecla 7) o Q (tecla 4). Derecha: D (tecla 9) o E (tecla 6). Al terminar, cualquier tecla vuelve a empezar. |
| **Autotest** | Un programa que se prueba a sí mismo: 19 comprobaciones de instrucciones, cada una con una tilde o una cruz, y al final una celda con la cantidad de fallas. | Ninguno. No toques ninguna tecla mientras corre (una de las pruebas verifica que no haya teclas apretadas). |
| **Fuente** | Los 16 dígitos hexadecimales que el intérprete guarda en memoria. | Ninguno: es una imagen fija. |
| **Planos** | Lo nuevo de XO-CHIP en 128×64: un disco y un rombo rebotan en dos planos distintos y donde se cruzan aparece un cuarto color; el rombo se mueve corriendo su plano con scroll, un contador con la fuente grande cuenta los rebotes y cada pared suena con su nota. | W (tecla 5): mientras la tenés apretada, el rombo se queda quieto. |

Los seis están escritos en ensamblador y sus fuentes están en `roms/`. Los cinco
primeros son de CHIP-8; *Planos* es de XO-CHIP, así que al elegirlo la consola pasa sola
a esa plataforma (sección 1.6) y la pantalla, a 128 × 64 píxeles. En la
[parte 6](#6-leer-un-programa-real) vamos a leer dos de los de CHIP-8, y en la
[parte 9](#9-más-allá-de-chip-8-super-chip-y-xo-chip), *Planos*.

### 1.3 Cargar tus propias ROMs

Un programa de CHIP-8 es un archivo binario (por costumbre, con extensión `.ch8`) con
los bytes tal cual van en la memoria. Hay dos formas de cargarlo:

- Tocá **Cargar ROM**, en la pestaña **Cartuchos** del cajón de opciones, y elegí el
  archivo.
- **Arrastralo** sobre cualquier parte de la página y soltalo cuando aparezca el cartel
  *Soltá el cartucho acá*.

El programa se copia a la memoria a partir de la dirección `0x200`, la máquina se
reinicia y arranca a correr. Con CHIP-8 y SUPER-CHIP puede ocupar hasta **3584 bytes**
(de `0x200` a `0xFFF`); con XO-CHIP, que tiene 64 KB de memoria, hasta 65.024. Una ROM
de más de 3584 bytes solo puede ser de XO-CHIP, así que la consola pasa sola al perfil
XO-CHIP y te avisa por qué; si es más grande que 65.024 bytes, o si está vacía, te avisa
y no la carga. Con una ROM tuya no aparece la línea *Controles:*: esa información
solo la traen los cartuchos incluidos.

**Tus cartuchos.** Cada ROM que cargás desde un archivo queda guardada en **Tus
cartuchos**, en la pestaña **Cartuchos**, debajo de los incluidos, con la que jugaste
por última vez primero y con la miniatura de su pantalla. La próxima vez la cargás con
un clic, sin buscar el archivo, y arranca con sus ajustes (sección 1.7). La **×** de la
esquina de cada cartucho lo saca, y el aviso que aparece trae **Deshacer** por si te
equivocaste. Entran hasta 60 ROMs y unos 2,5 MB entre todas: si no hay más lugar, se va
la que hace más tiempo que no jugás. Quedan guardadas en tu navegador.

### 1.4 El teclado

La computadora original de CHIP-8, el COSMAC VIP, tenía un teclado hexadecimal de 16
teclas, del `0` al `F`. En tu computadora se usa el bloque izquierdo del teclado, con esta
correspondencia:

```text
  Tu teclado            Keypad CHIP-8
┌───┬───┬───┬───┐     ┌───┬───┬───┬───┐
│ 1 │ 2 │ 3 │ 4 │     │ 1 │ 2 │ 3 │ C │
├───┼───┼───┼───┤     ├───┼───┼───┼───┤
│ Q │ W │ E │ R │     │ 4 │ 5 │ 6 │ D │
├───┼───┼───┼───┤ ──> ├───┼───┼───┼───┤
│ A │ S │ D │ F │     │ 7 │ 8 │ 9 │ E │
├───┼───┼───┼───┤     ├───┼───┼───┼───┤
│ Z │ X │ C │ V │     │ A │ 0 │ B │ F │
└───┴───┴───┴───┘     └───┴───┴───┴───┘
```

Se usa la **posición física** de cada tecla, no la letra que tiene impresa: si tu
teclado es AZERTY o Dvorak, igual vale el bloque de la izquierda. Fijate que las
teclas **W, A, S, D** son el `5`, el `7`, el `8` y el `9` del keypad: muchos juegos de
CHIP-8 usan esas cuatro para moverse, y el nuestro también.

También podés tocar el **keypad de la pantalla** con el mouse o con los dedos (admite
varias teclas a la vez). Cada tecla muestra, chiquita, cuál es su equivalente en tu
teclado. Y si navegás con Tab, podés mantener apretada la tecla enfocada con Enter o con
Espacio.

Las teclas no le llegan a la máquina mientras escribís en un campo de texto (por
ejemplo, el número de IPF o el editor del Taller) ni mientras está abierta una ventana:
la ayuda, el archivo de la comunidad o la lista de estados. En cualquier otro lugar sí
le llegan, aunque haya un botón o un selector enfocado: por ejemplo, justo después de
elegir un perfil en el selector **Perfil**, W, A, S, D y Retroceso siguen yendo a la
consola.

Además, las **flechas** del teclado y un **joystick** también aprietan teclas del
keypad: cuáles, lo elegís vos (sección 1.9).

### 1.5 La velocidad: instrucciones por frame

CHIP-8 no tiene una velocidad fija. El emulador trabaja de a frames: en cada 1/60 de
segundo ejecuta una cantidad de instrucciones (las **IPF**) y después baja los timers.
En **Velocidad**, la primera sección de la pestaña **Ajustes** del cajón de opciones, la
elegís de tres maneras: con la barra (que es logarítmica, así los valores chicos son
fáciles de elegir), escribiendo el número exacto o con los botones rápidos **7, 15, 30,
100, 500, 1000, 5000 y 10000**. Abajo te muestra cuántas instrucciones por segundo son.
Si escribís un número fuera de 1 a 10.000, te avisa (*Fuera de rango*) y usa el más
cercano.

- **15 IPF** (el valor por defecto, unas 900 instrucciones por segundo) se parece a la
  velocidad del COSMAC VIP.
- Muchos juegos escritos en las últimas décadas esperan bastante más: de 30 a 1000, y
  algunos de la Octojam, miles.
- Si una ROM bajada de internet va muy lenta, fijate primero si la consola la reconoció
  y la configuró sola (sección 1.7). Si no, antes de subir las IPF cambiá el perfil a
  XO-CHIP o SUPER-CHIP: la espera de vblank del perfil COSMAC VIP deja dibujar un solo
  sprite por frame (lo explica el [manual](MANUAL.md#122-instrucciones-por-frame-ipf)).
- Los timers **siempre** bajan 60 veces por segundo, sin importar las IPF. Por eso un
  programa bien escrito mide el tiempo con los timers, no contando instrucciones (lo
  vas a hacer en la [etapa C](#53-etapa-c-el-ritmo-con-el-temporizador)).

### 1.6 Plataformas, perfiles y quirks

Los intérpretes de CHIP-8 que se escribieron a lo largo de los años no se comportan
igual. Hay dos clases de diferencias, y **Compatibilidad**, en la pestaña **Ajustes**
del cajón de opciones, tiene un control para cada una.

**La plataforma: qué máquina es.** Se elige con el selector **Plataforma**:

- **CHIP-8**, el intérprete original del COSMAC VIP: 4 KB de memoria, pantalla de 64 × 32
  y un pitido. Es la máquina de este tutorial.
- **SUPER-CHIP**, de las calculadoras HP-48 (1991): suma una pantalla de alta resolución
  de 128 × 64, sprites de 16 × 16, desplazamientos de la imagen (*scroll*), una fuente
  grande, 16 banderas que se conservan entre partidas y una instrucción para terminar el
  programa.
- **XO-CHIP**, la extensión de Octo: todo lo de SUPER-CHIP, más 64 KB de memoria, dos
  planos de dibujo (cuatro colores en la pantalla) y sonido con un patrón y un tono.

Cada una incluye a la anterior, así que un programa de CHIP-8 bien escrito anda igual en
las tres. Al cambiar la plataforma, la ROM vuelve a empezar. Qué agregan SUPER-CHIP y XO-CHIP lo vas a ver
programado en la [parte 9](#9-más-allá-de-chip-8-super-chip-y-xo-chip).

**Los quirks: los detalles.** Aunque tengan las mismas instrucciones, los intérpretes
difieren en algunos detalles, que se llaman **quirks** ("mañas"). La consola tiene un
interruptor DIP para cada uno (se prende hacia arriba):

| # | Interruptor | Qué hace cuando está prendido | Afecta a |
|---|---|---|---|
| 1 | `VF=0` | OR, AND y XOR ponen VF en 0. | `8XY1` `8XY2` `8XY3` |
| 2 | `MEM` | Guardar o leer registros deja I apuntando después del último. | `FX55` `FX65` |
| 3 | `SHIFT` | Los desplazamientos operan sobre VX e ignoran VY. | `8XY6` `8XYE` |
| 4 | `BXNN` | El salto con desplazamiento suma VX (X = primer dígito de NNN) en vez de V0. | `BNNN` |
| 5 | `CLIP` | Lo que se sale de la pantalla por la derecha o por abajo se recorta (apagado, reaparece del otro lado). | `DXYN` |
| 6 | `VBLANK` | Dibujar espera al próximo frame: como mucho un `DXYN` por frame. | `DXYN` |

**El perfil: todo junto.** El selector **Perfil** elige de una vez la plataforma y los
seis quirks de cada intérprete:

| Perfil | Plataforma | Interruptores prendidos |
|---|---|---|
| **COSMAC VIP** (por defecto) | CHIP-8 | 1, 2, 5 y 6 |
| **SUPER-CHIP** | SUPER-CHIP | 3, 4 y 5 |
| **XO-CHIP** | XO-CHIP | 2 |

Si movés los interruptores a mano y la combinación no coincide con ningún perfil, el
selector muestra **Personalizado**. Los interruptores se aplican en el momento, sin
reiniciar, y nunca cambian la plataforma; un perfil que cambia la plataforma hace que la
ROM vuelva a empezar. Si pasás el mouse por un interruptor o por uno de los selectores
(o llegás a él con Tab), debajo aparece qué hace.

¿Cuándo cambiar? Casi nunca hace falta: los juegos conocidos se configuran solos
(sección 1.7), y si una ROM usa una instrucción que la plataforma elegida no tiene, la
consola te avisa con un botón que la cambia (sección 1.12). Si igual un juego se ve raro
(sprites rotos, números que no cambian, saltos a cualquier lado), probá el perfil
XO-CHIP, que es el de los juegos hechos con Octo (casi todos los modernos), o
SUPER-CHIP, el de los clásicos de las calculadoras. Los programas de este tutorial están
escritos para andar igual con los tres perfiles, y en la
[sección 5.7](#57-código-que-anda-en-cualquier-intérprete) vas a ver cómo se logra.
El detalle de cada quirk está en el [manual, sección 11](MANUAL.md#11-quirks), y el de
cada plataforma, en la [sección 13](MANUAL.md#13-variantes-y-extensiones).

### 1.7 Ajustes por cartucho y el archivo de la comunidad

La consola reconoce cada ROM por su **huella**: un número que se calcula con sus bytes
(el SHA-1) y que cambia si cambia uno solo. Con el interruptor **Ajustes por cartucho**
prendido, que es como viene (está en **Compatibilidad**, en la pestaña **Ajustes**), la
huella le sirve para dos cosas:

- **Los juegos conocidos se configuran solos.** La consola trae los datos de los 104
  programas del archivo de la comunidad de John Earnest, casi todos de las Octojam (los
  concursos anuales de juegos para CHIP-8): con qué plataforma, quirks, velocidad y
  colores se juegan en Octo, y si la pantalla va girada. Si cargás uno, se configura
  antes de arrancar, aparece un aviso que dice qué aplicó y en la ranura, al lado del
  tamaño, dice *ajustes del archivo*. Sus colores quedan en la paleta **Del cartucho**
  (sección 1.8).
- **Lo que cambiás se recuerda.** Si mientras corre una ROM cambiás la plataforma, el
  perfil, un interruptor, las IPF, la paleta o los controles, la consola lo anota para
  esa ROM: la próxima vez arranca así, y la ranura dice *ajustes recordados*. El botón
  **Olvidar ajustes**, que aparece en la ranura y en el aviso de la carga, borra lo
  recordado: si es un juego del archivo, vuelven los del archivo; si no, la próxima vez
  arranca con tus ajustes de siempre.

**Los juegos del archivo vienen con la consola.** Tocá **Archivo**, en la pestaña
**Cartuchos** del cajón, o apretá **L**: se abre una ventana con los juegos, cada uno
con su título, sus autores, el evento, la plataforma y una miniatura de su pantalla.
Buscá por título o por autor, filtrá por plataforma o por evento, y con un clic (o con
Enter) el juego arranca ya configurado y la ventana se cierra. Los que cargás así no
ocupan lugar en **Tus cartuchos**: siempre están en la ventana.

Las 104 ROMs del archivo están también en la carpeta
[`roms/archivo/`](../roms/archivo/LEEME.md) del repositorio (el archivo es de dominio
público, licencia CC0), con un índice, `LEEME.md`, que dice de cada juego la plataforma,
la velocidad, quién lo hizo y para qué evento. Si cargás una con **Cargar ROM** (o la
arrastrás), la consola también la reconoce y se configura sola.

Una ROM que la consola no conoce y que nunca usaste arranca con tus últimos ajustes; un
cartucho incluido, con su plataforma. Lo que la consola aplica sola no cuenta como una
elección tuya: no cambia tus ajustes ni queda recordado. También se recuerdan, para cada
ROM, las banderas donde algunos juegos de SUPER-CHIP y XO-CHIP guardan el récord o la
partida. Con el interruptor apagado, la consola funciona como siempre: todas las ROMs
usan los ajustes que estén puestos y no se aplica ni se recuerda nada por cartucho. Las
prioridades, una por una, están en el
[manual, sección 11.11](MANUAL.md#1111-ajustes-por-cartucho).

Para este tutorial: tus programas no están en el archivo, así que arrancan con tus
ajustes de siempre. Si en algún experimento cambiás el perfil mientras corre uno, ese
programa se lo acuerda, y la ranura te lo dice.

### 1.8 Pantalla, colores y sonido

Todo esto está en **Pantalla y sonido**, en la pestaña **Ajustes** del cajón de
opciones. Como el cajón no tapa la pantalla, cada cambio se ve en el momento, con el
programa corriendo:

- **Modo de pantalla**, con dos opciones:
  - **Tubo CRT** (el que viene): imita un monitor de tubo. Los píxeles tienen un
    resplandor, dejan una estela al apagarse (la persistencia del fósforo) y hay
    scanlines, un oscurecimiento en los bordes y un reflejo en el vidrio.
  - **Píxeles puros**: la pantalla tal cual, con píxeles cuadrados y nítidos, los
    colores exactos de la paleta y ningún efecto: ni estela, ni resplandor, ni
    scanlines. Con un programa de CHIP-8 ves exactamente dos colores, el fondo y el
    píxel. Es la mejor forma de ver cada frame exactamente como quedó en la memoria de
    video; lo vas a aprovechar en la [parte 6](#61-rebote-paso-a-paso).
- **Paleta**: *Verde fósforo*, *Ámbar*, *Blanco*, *LCD* o *Personalizada*. Cada paleta
  tiene cuatro colores: el fondo, el del píxel de siempre (el plano 1) y dos que solo
  usan los programas de XO-CHIP, que dibujan en dos planos: el del plano 2 y el de los
  píxeles prendidos en los dos (sección [9.4](#94-dos-planos-cuatro-colores)). Con
  **Personalizada** aparecen cuatro muestras (Fondo, Píxel / plano 1, Plano 2 y Ambos
  planos) para elegir los tuyos: los cambios se ven en el momento y quedan guardados.
  Si el cartucho cargado trae sus propios colores, como los juegos del archivo de la
  comunidad, aparece además la opción **Del cartucho**.
- **Scanlines** (solo en Tubo CRT): las líneas horizontales de los monitores viejos.
- **Persistencia** (solo en Tubo CRT): los píxeles se apagan de a poco, como el fósforo
  de un tubo. Además de lindo, disimula el parpadeo típico de CHIP-8 (vas a ver de dónde
  sale en la [etapa B](#52-etapa-b-moverlo-con-el-teclado)).
- **Curvatura** (solo en Tubo CRT): la imagen se abomba como el vidrio de un televisor
  viejo. Viene apagada; las capturas (sección 1.10) salen siempre planas.
- **Encendido animado** (solo en Tubo CRT): al abrir la página, el tubo se enciende con
  una línea que se abre. Viene prendido. No demora al programa, que arranca enseguida
  debajo, y no aparece si tu sistema pide reducir el movimiento.
- **Silencio** y **Volumen**.

En *Píxeles puros*, los interruptores de Scanlines, Persistencia, Curvatura y Encendido
animado quedan deshabilitados, pero se acuerdan de cómo los dejaste para cuando vuelvas
al tubo.

La pantalla se adapta sola al programa: los de SUPER-CHIP y XO-CHIP pueden pasar a alta
resolución, 128 × 64 píxeles, y entonces la leyenda al pie del tubo dice *Video 128 × 64*.
La imagen siempre se dibuja con píxeles enteros, del tamaño más grande que entra en el
tubo. Algunos juegos del archivo se pensaron para una pantalla girada; con esos, la
imagen se gira sola.

El beep suena mientras el temporizador de sonido de la máquina vale más de 0, y
mientras suena se prende la luz **SONIDO**. Un programa de XO-CHIP puede cambiar el beep
por un sonido propio (sección [9.6](#96-sonido-con-patrón)). Los navegadores no dejan
reproducir audio hasta que tocás la página: mientras debajo de la pantalla diga
*Sonido: tocá la consola para activarlo*, hacé un clic o apretá una tecla y listo.

Todos los ajustes (velocidad, plataforma, quirks, pantalla, colores, controles y sonido)
se guardan en tu navegador para la próxima vez. Eso incluye el perfil: si en algún
experimento lo cambiás, después volvé a **COSMAC VIP**, que es el que supone este
tutorial.

### 1.9 Controles: flechas y joystick

Además del bloque de 16 teclas, las **flechas** del teclado y un **joystick** (gamepad)
manejan los juegos: cada dirección aprieta una tecla del keypad. Cuál, lo elegís en
**Controles**, la última sección de la pestaña **Ajustes** del cajón de opciones, con el
selector **Flechas y joystick**:

| Opción | ↑ | ↓ | ← | → | Botón A | Botón B |
|---|---|---|---|---|---|---|
| **WASD de Octo** (la que viene) | 5 | 8 | 7 | 9 | 6 | 4 |
| **Teclado numérico del VIP** | 2 | 8 | 4 | 6 | 5 | 0 |

*WASD de Octo* es el de casi todos los juegos de la Octojam, y también el del juego que
vas a escribir en la parte 5: las flechas mueven el fantasmita igual que W, A, S y D.
*Teclado numérico del VIP* es el de muchos juegos clásicos. Con **Personalizado**
aparecen seis selectores, uno por dirección y botón, para elegir cada tecla. Debajo, una
línea te recuerda qué aprieta cada flecha. La elección queda guardada y, con Ajustes por
cartucho, también la de cada ROM.

Del joystick se usan la cruz y la palanca izquierda (las direcciones), los botones A y
B, y Start, que pausa y continúa. Conectalo y tocá un botón para que el navegador lo
reconozca: aparece un aviso con su nombre, y la última línea de **Controles** dice cuál
está conectado. Si se desconecta, o si cambiás de ventana o de pestaña, se sueltan todas
sus teclas.

Las flechas no van al keypad cuando el foco está en un control que las usa para elegir:
un selector, un deslizador o el modo de pantalla.

### 1.10 Controles de ejecución y atajos

| Botón | Atajo | Qué hace |
|---|---|---|
| **Pausa / Continuar** | Espacio | Detiene la máquina o la vuelve a poner en marcha. |
| **Paso** | N | Ejecuta **una sola instrucción**. Si estaba corriendo, primero la pausa. |
| **Por encima** | O | Si la instrucción es un `CALL`, ejecuta la subrutina entera y se detiene en la siguiente; si no, es un Paso. |
| **Salir** | K | Sigue hasta que la subrutina en la que está el PC vuelve con `RET`. |
| **Frame** | | Ejecuta **un frame**: hasta IPF instrucciones y un tic de los timers. También pausa. |
| **Reiniciar** | Retroceso | Reinicia la máquina y vuelve a cargar el mismo programa. Si estaba en pausa, sigue en pausa; si estaba corriendo, arranca. Después de un error, vuelve a como estaba justo antes del error: si ibas con Paso o con Frame, queda en pausa; si corría, arranca de nuevo. |
| Rebobinar, ⏪ (al pie del tubo) | B, mantenida | Mientras lo mantenés apretado, la máquina vuelve atrás en el tiempo, frame por frame, al doble de velocidad, y en la pantalla aparece «⏪». Al soltar, sigue desde ahí. En pausa, un toque vuelve un frame (sección 1.13). |
| Avance rápido (al pie del tubo) | T, mantenida | Mientras lo mantenés apretado, la máquina corre 4 veces más rápido, timers incluidos, y en la pantalla aparece «×4». Al soltar, vuelve a la velocidad de siempre. En pausa no hace nada. |
| Pantalla completa (al pie del tubo) | P | La pantalla ocupa todo el monitor, siempre con píxeles enteros; en un teléfono, el keypad va al lado. Para volver, P o Esc. Si el navegador no tiene pantalla completa, como el del iPhone, el botón no aparece. |
| Captura (al pie del tubo) | G | Baja una imagen PNG de la pantalla, con los colores exactos de la paleta y sin los efectos del tubo, de 640 × 320 (cada píxel, un cuadrado de 10 × 10, o de 5 × 5 en alta resolución). El archivo se llama `chip8-`, el nombre del cartucho y la fecha y la hora. |
| Taller (el lápiz, al lado del **?**) | Y | Abre o cierra el Taller: escribís un programa, lo ensamblás y corre en la consola (sección 4.8). |
| Opciones (los tres deslizadores, arriba) | M | Abre o guarda el cajón de opciones: cartuchos, ajustes y estados (sección 1.1). |
| Monitor (la pantallita con una onda, al lado de las opciones) | | Muestra u oculta el monitor de depuración (sección 1.11). |
| **Guardar** de la ranura **Rápido** (en la pestaña Estados) | I | Guarda el estado de la máquina en la ranura rápida (sección 1.13). |
| **Cargar** de la ranura **Rápido** (en la pestaña Estados) | U | Vuelve al estado de la ranura rápida. |
| **?** | H | Abre o cierra la ayuda. |
| **Archivo** (en la pestaña Cartuchos del cajón) | L | Abre o cierra el archivo de la comunidad: los juegos de la Octojam, para cargarlos con un clic (sección 1.7). |
| | Flechas | Aprietan las teclas del keypad que elegiste en Controles, en la pestaña Ajustes (sección 1.9). |
| | Esc | Cierra la ayuda y las otras ventanas, guarda el cajón de opciones o sale de la pantalla completa. |

Un detalle importante para depurar: **Paso no hace correr el tiempo**. Los timers
bajan una vez por frame, así que con Paso quedan congelados; con Frame, o
con Continuar, vuelven a bajar. El avance rápido, en cambio, corre frames enteros: el
programa va más rápido pero ve el tiempo pasar igual que siempre. Y el rebobinado vuelve
de a frames enteros, con los timers como estaban en cada uno (sección 1.13).

Y uno sobre el foco: los botones que tocás con el mouse no se quedan con el foco, así
que Espacio siempre pausa. Si en cambio llegás a un botón o a un interruptor con Tab,
Espacio y Enter lo activan (no pausan); las teclas del keypad, N, O, K, H, L, T, P, G,
Y, M, I, U, B y Retroceso siguen yendo a la consola.

### 1.11 El monitor

El monitor muestra el estado completo de la máquina y se actualiza mientras corre. Su
botón de la barra de arriba (la pantallita con una onda) lo muestra y lo oculta, y
**Ocultar**, en su cabecera, también lo oculta: la consola queda sola en el medio, el
cajón de opciones sale a su costado y la elección se recuerda. Tiene cuatro pestañas, y
la que elegiste queda para la próxima vez. La primera, **Código**, tiene:

- **ESTADO**: `PC` (la dirección de la próxima instrucción), `I`, `SP` (cuántas
  direcciones hay en la pila), `DT` y `ST` (los timers), las `IPF` elegidas y cuántas
  **INSTRUCCIONES** se ejecutaron desde que cargaste o reiniciaste. PC e I están en
  hexadecimal; SP, DT, ST y las cuentas, en decimal. Abajo, **MÁQUINA** dice la
  plataforma y la resolución (*CHIP-8 · 64×32*) y, con XO-CHIP, en qué planos dibuja el
  programa (*XO-CHIP · 128×64 · planos 1+2*). Con XO-CHIP, que tiene 64 KB, las
  direcciones se muestran con 4 dígitos.
- **REGISTROS V0–VF**: los 16 registros, en hexadecimal. Los que cambiaron desde la
  última actualización se resaltan: cuando avanzás con Paso, ves exactamente qué tocó
  cada instrucción.
- **DESENSAMBLADO**: las instrucciones de la memoria, con su dirección, sus bytes y su
  nombre. La del PC está resaltada y marcada con una flechita (▶): es la que se va a
  ejecutar **a continuación**. La lista sigue al PC: mientras se ve, se queda quieta, y
  cuando se va, lo vuelve a poner arriba, con 7 instrucciones antes. Con la rueda del
  mouse, arrastrando o con las flechas recorrés el resto de la memoria; **Ir a** salta a
  una dirección y **Al PC** vuelve a seguirlo. Lo que el programa todavía no ejecutó se
  ve más tenue. Con el quirk `BXNN` prendido, las instrucciones `BNNN` aparecen como
  `JP VX, NNN`, con el registro que de verdad se suma. Las instrucciones de SUPER-CHIP y
  XO-CHIP aparecen con su nombre solo si la plataforma elegida las tiene: con CHIP-8,
  `00FF` se lee `SYS 0x0FF`; con SUPER-CHIP, `HIGH`.
- **PILA**: los 16 lugares de la pila; el tope (la última dirección guardada) está
  marcado.
- **PUNTOS DE CORTE**: los que pusiste para que la máquina se detenga sola (los vas a usar
  en la [parte 7](#7-depurar)).

Las otras tres pestañas: **Traza**, las últimas instrucciones que se ejecutaron (con la
máquina en pausa o detenida); **Memoria**, un mapa de toda la memoria que muestra qué se
ejecutó, qué se leyó y qué se escribió, y debajo **MEMORIA EN I**, la memoria byte por
byte, que sigue a la dirección a la que apunta I (el byte de I, resaltado) y sirve para
ver qué sprite está por dibujar un `DRW`; y **Sprites**, que dibuja esos mismos bytes
como los va a dibujar el `DRW`.

Si la máquina se detiene por un error, el mensaje aparece también al pie del monitor.

### 1.12 Qué significa cada estado

La etiqueta al lado de **MONITOR**, la luz **RUN** y los carteles sobre la pantalla te
dicen en qué anda la máquina:

| Estado | Luz RUN | En la pantalla | Qué pasa |
|---|---|---|---|
| **Sin cartucho** | Apagada | *INSERTÁ UN CARTUCHO* | No hay programa cargado (casi no pasa: la consola arranca con *Rebote*). |
| **Ejecutando** | Verde | El programa | Corriendo normalmente. |
| **Esperando tecla** | Verde, parpadea | Cartel *ESPERANDO TECLA* | El programa ejecutó `LD Vx, K` (`FX0A`) y está parado hasta que **apretes y sueltes** una tecla. |
| **Pausado** | Ámbar | Cartel *PAUSA* | Lo pausaste vos, o usaste Paso o Frame. |
| **Terminado** | Ámbar | *FIN DEL PROGRAMA* | Un programa de SUPER-CHIP o XO-CHIP terminó con `EXIT` (`00FD`). No es un error: tocá **Reiniciar** para volver a empezar. |
| **Error** | Roja | Cartel *ERROR* con el mensaje | El programa hizo algo imposible: una instrucción que no existe (o que es de otra plataforma), un `RET` sin `CALL` o demasiados `CALL` anidados. El mensaje dice qué instrucción y en qué dirección. Pausa, Paso y Frame quedan deshabilitados: tocá **Reiniciar**, que vuelve a como estaba la máquina antes del error (en pausa o corriendo). |

**Cuando a una ROM le falta plataforma.** Si un programa usa una instrucción que la
plataforma elegida no tiene, la consola no se queda callada. Si es una instrucción de
pantalla (pasar a alta resolución, desplazar la imagen, dibujar un sprite de 16 × 16),
la ignora, como hacía un intérprete de la época, y te avisa una sola vez con un botón,
**Usar SUPER-CHIP** (o **Usar XO-CHIP**), que elige ese perfil y vuelve a empezar la ROM.
Si es de las que no se pueden ignorar, la máquina se detiene con un error que dice qué
plataforma hace falta, y el mensaje trae el botón **Cambiar a XO-CHIP y reiniciar** (o a
SUPER-CHIP). Los detalles, en el
[manual, sección 11.10](MANUAL.md#1110-diagnósticos-de-plataforma).

### 1.13 Estados guardados y rebobinado

Un **estado guardado** es una foto de la máquina entera en un momento: la memoria, los
registros, la pila, los dos timers, la pantalla, el sonido y las banderas. Volver a un
estado deja la máquina exactamente como estaba, y desde ahí sigue igual que la primera
vez. (No tiene nada que ver con los estados de la sección anterior, que dicen qué está
haciendo la máquina: estos son partidas guardadas.)

**Las ranuras.** La pestaña **Estados** del cajón de opciones tiene cinco ranuras:
**Rápido** y de la **Ranura 1** a la **Ranura 4**. La rápida va arriba, sola, y una
ranura hundida la separa de las otras cuatro. Cada una muestra en chiquito la pantalla
del momento que guardaste, con los colores y el giro con que se ve la pantalla, y cuándo
la guardaste (*recién*, *hace 5 min*, *ayer 18:20*); una vacía dice *VACÍA*. Las manejás
con sus botones **Guardar**, **Cargar** y **Borrar**, y el aviso de Borrar trae
**Deshacer**. La ranura rápida se maneja además con el teclado, sin sacar las manos del
juego: **I** guarda y **U** carga. Al guardar, la pantalla muestra un momento
*GUARDADO*; al cargar, *CARGADO*.

**Son de cada cartucho.** Las ranuras son del cartucho que tenés puesto: cada ROM,
reconocida por su huella (sección 1.7), tiene las suyas, y otra ROM no las ve. Quedan
guardadas en tu navegador aunque cierres la página. Si el navegador no deja guardar datos,
o se quedó sin lugar, duran hasta que la cierres, y la consola te avisa. Si un estado
guardado se dañó, su ranura dice *DAÑADO* y no se puede cargar.

**Todos los estados, y en otro navegador.** **Ver todos**, arriba de las ranuras, abre
una ventana con los estados de todos los cartuchos: desde ahí cargás cualquiera (si
el cartucho no está en la ranura, la consola lo pone antes), lo borrás o lo exportás.
**Exportar** baja un archivo `.json` con los estados del cartucho de la ranura, e
**Importar**, o arrastrar ese archivo sobre la página, los trae en otro navegador; si una
ranura ya tiene otro estado, la consola te pregunta antes de reemplazarlo.

**Cargar no reinicia nada** y no toca la pausa: si la máquina estaba en pausa, queda en
pausa en ese momento, con ese frame en la pantalla y en el monitor; si corría, sigue
corriendo desde ahí. Si el estado se guardó con otra plataforma o con otros quirks, la
consola pasa a esos, pero no los anota como una elección tuya. La velocidad (IPF), la
paleta y los controles no viajan con el estado: quedan como los tengas. Un estado que
guardaste con la máquina detenida por un error, o terminada con `EXIT`, vuelve con su
mensaje.

**El rebobinado.** Mientras la máquina corre, la consola saca una foto en cada frame y se
queda con los últimos 30 segundos. Mantené apretada la **B** (o el botón ⏪ del pie del
tubo, con el mouse o con el dedo) y la máquina vuelve atrás en el tiempo, frame por frame,
al doble de velocidad: dos frames por cada frame real (con **T** también apretada, ocho).
En la pantalla aparece «⏪» y el monitor muestra cada momento. Cuando soltás, la máquina
sigue desde ahí como si nada: el programa no se entera de que volviste.

Mientras rebobinás, la máquina no corre: no se ejecuta ninguna instrucción, los timers no
bajan y no suena nada. Pero cada foto tiene sus DT y ST, así que **los timers vuelven
atrás con todo lo demás**: si volvés a un momento en que DT valía 20, al soltar vale 20 y
sigue bajando desde ahí, y si ST todavía no había llegado a 0, el pitido vuelve a sonar
cuando la máquina sigue.

**Las banderas también vuelven.** Las banderas donde algunos juegos de SUPER-CHIP y
XO-CHIP guardan el récord o la partida (sección 1.7) son parte de la foto: si rebobinás, o
cargás un estado, hasta antes de que el juego guardara un récord, el récord también se
pierde.

**En pausa también anda.** Con la máquina en pausa, un toque de **B** vuelve exactamente
un frame, y **Frame** avanza uno: podés ir y venir por un momento difícil de a un frame. Si
la mantenés, después de un instante sigue volviendo, y la máquina queda en pausa. Después
de un error o del fin del programa, rebobinar te lleva a antes y deja la máquina en pausa,
para que mires qué pasó: en la [sección 7.4](#74-volver-atrás-con-b) lo vas a usar para
depurar.

**Hasta dónde.** Debajo de las ranuras, *Podés volver hasta N s.* te dice cuánto pasado hay
guardado. Vuelve a cero cuando cargás otro cartucho o un estado, cuando reiniciás y cuando
cambiás de plataforma: no se puede volver más allá de esos momentos. Con los juegos de
XO-CHIP que reescriben casi toda su memoria de 64 KB en cada frame entran menos segundos
(como mínimo, unos 11), porque las fotos tienen un tope de memoria. Si no usás el
rebobinado, apagá el interruptor **Rebobinado**: la consola deja de sacar fotos y **B** no
hace nada.

Una salvedad: el azar no se guarda. Si el programa usa `RND`, al seguir desde un estado
cargado o desde un momento al que rebobinaste, los números que salgan pueden ser otros, y
el juego, tomar otro camino.

---

## 2. Anatomía de CHIP-8 en 10 minutos

CHIP-8 no es un chip ni una computadora: es una **máquina virtual** que inventó Joseph
Weisbecker en 1977 para que la gente pudiera programar juegos en el COSMAC VIP, una
computadora de aficionado muy modesta, sin pelearse con el código máquina de su
procesador. Un programa CHIP-8 es una lista de instrucciones de 2 bytes que un
programa intérprete lee y ejecuta de a una. Un emulador como este hace lo mismo que
aquel intérprete. La historia completa está en el [manual](MANUAL.md#1-qué-es-chip-8).

Esto es lo que necesitás saber para programar.

### 2.1 La memoria

Hay **4096 bytes** (4 KB) de memoria, con direcciones de `0x000` a `0xFFF` (12 bits).
Todo vive ahí: el programa, sus datos y la fuente de dígitos.

```text
0x000 ┌──────────────────────────────────────┐
      │ Reservado. En el VIP, acá vivía el   │
      │ intérprete; en este emulador está    │
      │ vacío, salvo la fuente.              │
0x050 │   Fuente: 16 dígitos × 5 bytes       │
0x0A0 │                                      │
0x200 ├──────────────────────────────────────┤
      │ Tu programa: instrucciones y datos   │
      │ (hasta 3584 bytes)                   │
      │                                      │
0xFFF └──────────────────────────────────────┘
```

- Los programas **siempre** se cargan a partir de `0x200`, y la ejecución arranca ahí.
- Cada instrucción ocupa **2 bytes**, el más significativo primero (*big-endian*): la
  instrucción `D125` son los bytes `D1` y `25`, en ese orden.
- Instrucciones y datos (los dibujos, por ejemplo) comparten la misma memoria. Nada
  impide que la CPU ejecute tus dibujos como si fueran instrucciones: pasa si te
  olvidás de terminar el programa, y lo vas a ver en la [parte 7](#73-cuando-la-máquina-se-detiene).

Más en el [manual, sección 3](MANUAL.md#3-memoria).

### 2.2 Los registros

```text
 V0 V1 V2 V3 V4 V5 V6 V7 V8 V9 VA VB VC VD VE VF     16 registros de 8 bits (0..255)
┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │▓▓│     VF: la bandera
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
┌────────┐  ┌────────┐
│   I    │  │   PC   │     I: una dirección de memoria.  PC: la próxima instrucción.
└────────┘  └────────┘
```

- **V0 a VF** son 16 registros de 8 bits: cada uno guarda un número de 0 a 255. Las
  cuentas "dan la vuelta": 255 + 1 da 0, y 0 - 1 da 255.
- **VF** es especial: varias instrucciones lo usan como **bandera** (el acarreo de una
  suma, el préstamo de una resta, el choque al dibujar) y lo pisan sin preguntar. No
  guardes ahí nada que quieras conservar.
- **I** guarda una dirección de memoria: la del sprite que vas a dibujar, o la de los
  datos que vas a leer o escribir.
- **PC** (*program counter*) es la dirección de la próxima instrucción. No lo tocás
  directamente: cambia solo, o con saltos y llamadas.

Más en el [manual, sección 4](MANUAL.md#4-registros).

### 2.3 La pila

Para llamar a una **subrutina** se usa `CALL`, que guarda en la **pila** la dirección
a la que hay que volver; `RET` la saca y vuelve ahí. La pila tiene lugar para **16**
direcciones: se pueden anidar hasta 16 llamadas. Un `CALL` de más, o un `RET` sin
`CALL`, detienen la máquina con un error. El monitor muestra la pila y `SP`, que dice
cuántas direcciones hay guardadas. Más en el [manual](MANUAL.md#45-la-pila-y-sp).

### 2.4 Los timers

Hay dos temporizadores de 8 bits. Si valen más de 0, bajan de a uno **60 veces por
segundo**, sin importar la velocidad de la CPU, hasta llegar a 0.

- **DT** (*delay timer*), el temporizador de retardo: lo cargás con un número y lo vas
  mirando; cuando llega a 0, pasó ese tiempo. Si lo cargás con 30, llega a 0 en medio
  segundo.
- **ST** (*sound timer*), el de sonido: mientras vale más de 0, suena el beep. Cargarlo
  con 6 hace sonar un pitido de 1/10 de segundo.

Más en el [manual, sección 5](MANUAL.md#5-timers-de-retardo-y-sonido).

### 2.5 La pantalla

La pantalla tiene **64 × 32 píxeles** en blanco y negro (bueno, en verde y negro).
La coordenada `(0, 0)` es la esquina de arriba a la izquierda: x crece hacia la
derecha (0 a 63) e y crece hacia abajo (0 a 31).

La única forma de dibujar es con **sprites**: dibujitos de **8 píxeles de ancho** y de
1 a 15 filas de alto, guardados en memoria **un byte por fila**. Cada bit es un píxel
(1 = prendido) y el bit más alto es el de la izquierda:

```text
byte   binario     cómo se ve
0x78   01111000    .####...
0xFC   11111100    ######..
0xB4   10110100    #.##.#..
0xFC   11111100    ######..
0xFC   11111100    ######..
0xA8   10101000    #.#.#...
```

La instrucción `DRW Vx, Vy, n` dibuja las `n` filas que hay en memoria a partir de la
dirección `I`, con la esquina en `(Vx, Vy)`. Y lo hace con **XOR**: cada bit en 1 del
sprite **invierte** el píxel que le toca. Eso tiene dos consecuencias enormes:

1. Dibujar el mismo sprite dos veces en el mismo lugar **lo borra**. Así se anima en
   CHIP-8: se borra dibujando de nuevo y se dibuja en el lugar nuevo.
2. Si al dibujar se apagó algún píxel que estaba prendido, `DRW` deja **VF = 1**; si
   no, VF = 0. Así se detectan los **choques**.

Otros detalles: si el sprite se sale por la derecha o por abajo, con el perfil COSMAC
VIP lo que sobra se recorta. Y la posición de partida siempre "da la vuelta": `x = 70`
es lo mismo que `x = 6`. Más en el [manual, sección 6](MANUAL.md#6-pantalla).
(SUPER-CHIP y XO-CHIP suman una pantalla de 128 × 64 y, XO-CHIP, un segundo plano de
dibujo: los vas a ver en la [parte 9](#9-más-allá-de-chip-8-super-chip-y-xo-chip).)

### 2.6 La fuente

El intérprete guarda en memoria, a partir de `0x050`, los **16 dígitos hexadecimales**
(`0` a `F`) dibujados en 4 × 5 píxeles, 5 bytes cada uno. No tenés que saber dónde
está cada uno: `LD F, Vx` apunta I al dígito que vale Vx, listo para dibujarlo con
`DRW Vx, Vy, 5`. El cartucho *Fuente* los muestra todos. Más en el
[manual, sección 8](MANUAL.md#8-fuente-hexadecimal).

### 2.7 El teclado

Las 16 teclas se identifican con su valor, de `0` a `F`. Hay dos formas de leerlas:

- `SKP Vx` y `SKNP Vx` miran si la tecla **cuyo número está en Vx** está apretada o no,
  y según eso saltean o no la instrucción siguiente. No esperan: el programa sigue.
- `LD Vx, K` **detiene** el programa hasta que apretás y soltás una tecla, y guarda su
  número en Vx.

Más en el [manual, sección 7](MANUAL.md#7-teclado-hexadecimal).

### 2.8 Cómo se lee una instrucción

Cada instrucción tiene 4 dígitos hexadecimales (4 *nibbles*). El primero dice qué
familia de instrucción es; los otros, según el caso, son números de registro o valores:

```text
 D 1 2 5        DRW V1, V2, 5
 │ │ │ └── N   = 5     cantidad de filas
 │ │ └──── Y   = 2     registro con la coordenada y
 │ └────── X   = 1     registro con la coordenada x
 └──────── familia D: dibujar

 6 1 1 E        LD V1, 0x1E
 │ │ └─┴── NN  = 0x1E  un byte (30)
 │ └────── X   = 1     el registro
 └──────── familia 6: cargar un número en un registro

 1 2 0 C        JP 0x20C
 │ └─┴─┴── NNN = 0x20C una dirección (12 bits)
 └──────── familia 1: saltar
```

### 2.9 Las 35 instrucciones, de un vistazo

Este es el machete. X e Y son registros, N un dígito, NN un byte y NNN una dirección.
"Saltear" quiere decir no ejecutar la instrucción que sigue (el PC avanza 2 bytes de
más). Donde dice "con `VF=0`", "con `SHIFT`", etc., el resultado depende de ese
quirk (sección [1.6](#16-plataformas-perfiles-y-quirks)). La explicación completa de cada una está en el
[manual, sección 10](MANUAL.md#10-referencia-completa-de-las-35-instrucciones). Las 17
que agregan SUPER-CHIP y XO-CHIP tienen su propio machete en la
[sección 9.1](#91-dos-máquinas-más).

| Opcode | Instrucción | Qué hace |
|---|---|---|
| `00E0` | `CLS` | Borra la pantalla. |
| `00EE` | `RET` | Vuelve de una subrutina. |
| `0NNN` | `SYS NNN` | Llamaba a código máquina del VIP; acá se ignora. |
| `1NNN` | `JP NNN` | Salta a NNN. |
| `2NNN` | `CALL NNN` | Llama a la subrutina en NNN. |
| `3XNN` | `SE VX, NN` | Saltea la siguiente si VX = NN. |
| `4XNN` | `SNE VX, NN` | Saltea la siguiente si VX ≠ NN. |
| `5XY0` | `SE VX, VY` | Saltea la siguiente si VX = VY. |
| `6XNN` | `LD VX, NN` | VX = NN. |
| `7XNN` | `ADD VX, NN` | VX = VX + NN (no toca VF). |
| `8XY0` | `LD VX, VY` | VX = VY. |
| `8XY1` | `OR VX, VY` | VX = VX OR VY. Con el quirk `VF=0`, además VF = 0. |
| `8XY2` | `AND VX, VY` | VX = VX AND VY. Con `VF=0`, además VF = 0. |
| `8XY3` | `XOR VX, VY` | VX = VX XOR VY. Con `VF=0`, además VF = 0. |
| `8XY4` | `ADD VX, VY` | VX = VX + VY; VF = 1 si hubo acarreo (pasó de 255). |
| `8XY5` | `SUB VX, VY` | VX = VX − VY; VF = 1 si **no** hubo préstamo (VX ≥ VY). |
| `8XY6` | `SHR VX, VY` | VX = VY desplazado un bit a la derecha (con `SHIFT`, VX desplazado); VF = el bit que salió. |
| `8XY7` | `SUBN VX, VY` | VX = VY − VX; VF = 1 si **no** hubo préstamo (VY ≥ VX). |
| `8XYE` | `SHL VX, VY` | VX = VY desplazado un bit a la izquierda (con `SHIFT`, VX desplazado); VF = el bit que salió. |
| `9XY0` | `SNE VX, VY` | Saltea la siguiente si VX ≠ VY. |
| `ANNN` | `LD I, NNN` | I = NNN. |
| `BNNN` | `JP V0, NNN` | Salta a NNN + V0 (con `BXNN`, a NNN + VX, donde X es el primer dígito de NNN). |
| `CXNN` | `RND VX, NN` | VX = un número al azar AND NN. |
| `DXYN` | `DRW VX, VY, N` | Dibuja un sprite de N filas en (VX, VY); VF = 1 si hubo choque. |
| `EX9E` | `SKP VX` | Saltea la siguiente si la tecla VX está apretada. |
| `EXA1` | `SKNP VX` | Saltea la siguiente si la tecla VX **no** está apretada. |
| `FX07` | `LD VX, DT` | VX = temporizador de retardo. |
| `FX0A` | `LD VX, K` | Espera una tecla (apretar y soltar) y la guarda en VX. |
| `FX15` | `LD DT, VX` | Temporizador de retardo = VX. |
| `FX18` | `LD ST, VX` | Temporizador de sonido = VX. |
| `FX1E` | `ADD I, VX` | I = I + VX. |
| `FX29` | `LD F, VX` | I = dirección del dígito VX de la fuente. |
| `FX33` | `LD B, VX` | Guarda VX en decimal: centenas en I, decenas en I+1, unidades en I+2. |
| `FX55` | `LD [I], VX` | Guarda V0..VX en la memoria, desde I. Con `MEM`, I queda después del último. |
| `FX65` | `LD VX, [I]` | Carga V0..VX desde la memoria, desde I. Con `MEM`, I queda después del último. |

---

## 3. Tu primer programa, escrito a mano en hexadecimal

Vamos a escribir un programa sin ninguna herramienta: pensando cada byte. Es la mejor
manera de perderle el miedo a la máquina. El programa borra la pantalla y dibuja la
letra **A** de la fuente en el centro. Son 7 instrucciones: 14 bytes.

### 3.1 El plan

1. Borrar la pantalla.
2. Poner en un registro el dígito que queremos dibujar (`0xA`) y apuntar I a su dibujo
   en la fuente.
3. Poner la posición en otros dos registros. Los dígitos de la fuente miden 4 × 5
   píxeles, así que para centrarlo: x = (64 − 4) / 2 = **30** e y = (32 − 5) / 2 = 13,5,
   o sea **13**.
4. Dibujar las 5 filas.
5. Quedarse quieto para siempre. Un programa de CHIP-8 no tiene cómo "terminar": la CPU
   sigue ejecutando lo que venga después. Así que el programa termina en una
   instrucción que salta a sí misma.

### 3.2 Byte por byte

Ahora hay que traducir cada paso a una instrucción, con el machete de la
[sección 2.9](#29-las-35-instrucciones-de-un-vistazo):

- **Borrar la pantalla** es `CLS`, que siempre es `00E0`.
- **V0 = 0x0A** es `LD VX, NN` (`6XNN`) con X = 0 y NN = `0A`: `600A`.
- **I = dirección del dígito que vale V0** es `LD F, VX` (`FX29`) con X = 0: `F029`.
- **V1 = 30**: 30 en hexadecimal es `1E` (1 × 16 + 14), así que es `611E`.
- **V2 = 13**: 13 es `0D`, así que es `620D`.
- **Dibujar 5 filas en (V1, V2)** es `DRW VX, VY, N` (`DXYN`) con X = 1, Y = 2 y N = 5:
  `D125`.
- **Saltar a sí misma**: el programa empieza en `0x200` y cada instrucción ocupa 2
  bytes, así que la séptima está en `0x200 + 6 × 2 = 0x20C`. `JP NNN` es `1NNN`:
  `120C`.

El programa completo, con la dirección donde queda cada instrucción:

<!-- verificar: tabla-a-mano -->
| Dirección | Bytes | Instrucción | Qué hace |
|---|---|---|---|
| `0x200` | `00 E0` | `CLS` | Borra la pantalla. |
| `0x202` | `60 0A` | `LD V0, 0x0A` | V0 = 10, el dígito A. |
| `0x204` | `F0 29` | `LD F, V0` | I = dirección del dibujo de la A (`0x050 + 10 × 5 = 0x082`). |
| `0x206` | `61 1E` | `LD V1, 0x1E` | V1 = 30, la x. |
| `0x208` | `62 0D` | `LD V2, 0x0D` | V2 = 13, la y. |
| `0x20A` | `D1 25` | `DRW V1, V2, 5` | Dibuja 5 filas desde I en (V1, V2). |
| `0x20C` | `12 0C` | `JP 0x20C` | Salta a sí misma, para siempre. |

Todo junto: `00E0 600A F029 611E 620D D125 120C`.

> Para pasar de decimal a hexadecimal (y al revés) sirve la calculadora de tu sistema
> en modo *programador*. O Node: `(30).toString(16)` da `'1e'` y `0x1E` da `30`.

### 3.3 Crear el archivo `.ch8`

Un `.ch8` no es un archivo de texto: son esos 14 bytes, crudos. Un editor de texto no
sirve para escribirlo. Elegí una de estas formas (las tres dejan `a-mano.ch8` en la
carpeta donde estás parado).

**PowerShell** (anda igual en Windows PowerShell 5.1 y en PowerShell 7):

```powershell
[IO.File]::WriteAllBytes("$PWD\a-mano.ch8", [byte[]](0x00,0xE0,0x60,0x0A,0xF0,0x29,0x61,0x1E,0x62,0x0D,0xD1,0x25,0x12,0x0C))
```

`[byte[]](...)` convierte la lista de números en bytes y `WriteAllBytes` los escribe
tal cual. El `$PWD\` hace falta porque `WriteAllBytes` necesita la ruta completa.
Ojo: **no** uses `echo ... > archivo` en PowerShell, porque escribe texto, no bytes.

**Node**, en cualquier sistema:

```sh
node -e "require('fs').writeFileSync('a-mano.ch8', Buffer.from('00E0600AF029611E620DD125120C', 'hex'))"
```

**Linux, macOS o Git Bash**, con `xxd`:

```sh
echo 00E0600AF029611E620DD125120C | xxd -r -p > a-mano.ch8
```

Para comprobar que quedó bien, el archivo tiene que pesar exactamente 14 bytes. En
PowerShell, `Format-Hex a-mano.ch8` te muestra su contenido en hexadecimal; en Linux y
macOS, `xxd a-mano.ch8`.

### 3.4 Cargarlo

Arrastrá `a-mano.ch8` sobre la consola (o usá **Cargar ROM**). En la ranura del
cartucho aparecen el nombre del archivo y su tamaño, 14 bytes, y en el centro de la
pantalla, la A:

<!-- salida (fragmento): node docs/ejemplos/mini-emulador.js docs/ejemplos/01-a-mano.ch8 -->
```text
..............................####..............................
..............................#..#..............................
..............................####..............................
..............................#..#..............................
..............................#..#..............................
```

En el monitor vas a ver que el PC se queda clavado en `0x20C` mientras el contador de
INSTRUCCIONES sube y sube: la máquina está ejecutando el `JP 0x20C` sin parar, unas 900
veces por segundo. Así es un programa CHIP-8 "terminado".

### 3.5 Mirarlo paso a paso

Ahora vamos a ver cada instrucción hacer lo suyo:

1. Apretá **Espacio** para pausar.
2. Apretá **Retroceso** para reiniciar. Como estaba en pausa, queda en pausa: la
   pantalla vacía, `PC = 0x200` y, en el DESENSAMBLADO, tus 7 instrucciones a partir de
   `0x200` (después vienen muchos `SYS 0x000`: es la memoria vacía, llena de ceros,
   que el desensamblador muestra como si fueran instrucciones).
3. Apretá **N** (o el botón **Paso**) y mirá qué cambia cada vez:

| Paso | Se ejecutó | Qué ves en el monitor |
|---|---|---|
| 1 | `CLS` | `PC = 0x202`. La pantalla ya estaba vacía. |
| 2 | `LD V0, 0x0A` | V0 = `0A`, resaltado. |
| 3 | `LD F, V0` | `I = 0x082`. En MEMORIA EN I (pestaña **Memoria**), a partir del byte resaltado: `F0 90 F0 90 90`. ¡Es la A! |
| 4 | `LD V1, 0x1E` | V1 = `1E`. |
| 5 | `LD V2, 0x0D` | V2 = `0D`. |
| 6 | `DRW V1, V2, 5` | Aparece la A. VF = `00`: no se apagó ningún píxel. |
| 7 | `JP 0x20C` | El PC queda en `0x20C`. Y ahí se va a quedar. |

Mirá la memoria en el paso 3: los 5 bytes de la A son `F0 90 F0 90 90`, o sea
`1111`, `1001`, `1111`, `1001`, `1001` en binario (los 4 bits de la izquierda). Si
pintás cada 1, es la A.

### 3.6 Jugá con los bytes

Cambiá bytes, volvé a crear el archivo y cargalo. Algunas ideas:

- **Otro dígito**: cambiá `600A` por `6007` y dibuja un 7. Cualquier valor de `00` a
  `0F` sirve.
- **Otro lugar**: cambiá `611E` (x = 30) y `620D` (y = 13).
- **Pegado al borde**: con `611E` cambiado por `613E` (x = 62), o sea
  `00E0 600A F029 613E 620D D125 120C`, solo entran las dos primeras columnas de la A.
  Con el perfil COSMAC VIP, las otras dos se recortan. Pasá al perfil XO-CHIP (que no
  recorta): como el perfil también cambia la plataforma, la ROM vuelve a empezar sola, y
  las dos columnas que faltaban aparecen del otro lado, en las columnas 0 y 1. Después
  volvé al perfil COSMAC VIP: el perfil queda guardado y el resto del tutorial supone
  ese.
- **Dibujar dos veces**: agregá otro `D125` justo después del primero. La instrucción
  del salto ahora queda en `0x20E`, así que también hay que cambiarla por `120E`:
  `00E0 600A F029 611E 620D D125 D125 120E`. La A **no aparece**: el segundo dibujo, con
  XOR, apagó todo lo que prendió el primero. Y VF queda en `01`, porque ese segundo
  dibujo apagó píxeles prendidos.

Ese último detalle, tener que corregir la dirección del salto porque agregaste una
instrucción, es exactamente lo que resuelve el ensamblador.

---

## 4. El ensamblador

Escribir en hexadecimal es buenísimo para entender, pero para programar de verdad es un
suplicio: hay que calcular direcciones a mano y cualquier instrucción que agregás corre
todas las que vienen después. Un **ensamblador** traduce texto como `DRW V1, V2, 5` a
los bytes `D1 25`, y calcula las direcciones por vos a partir de **etiquetas**. El del
proyecto vive adentro de `chip8.html`, como el núcleo, y no tiene dependencias. Se usa de
dos maneras: desde la terminal, con `tools/chip8asm.js`, que es la que sigue este
tutorial, o en el **Taller** de la consola, sin salir del navegador
([sección 4.8](#48-el-taller-ensamblar-sin-salir-de-la-consola)).

### 4.1 El mismo programa, en ensamblador

Este es el programa de la parte 3 escrito en ensamblador:

```asm
; 01-a-mano.asm — el programa de la parte 3, ahora en ensamblador
;
; Borra la pantalla y dibuja el dígito A de la fuente en el centro.
; Ensamblado da exactamente los mismos 14 bytes que escribimos a mano:
;   00E0 600A F029 611E 620D D125 120C

DIGITO   EQU 0xA        ; el dígito de la fuente que vamos a mostrar
X_CENTRO EQU 30         ; (64 - 4) / 2: centrado en horizontal
Y_CENTRO EQU 13         ; (32 - 5) / 2, redondeado para abajo

        CLS             ; 00E0  borrar la pantalla
        LD V0, DIGITO   ; 600A  V0 = 0x0A
        LD F, V0        ; F029  I = dirección del glifo de V0 en la fuente
        LD V1, X_CENTRO ; 611E  V1 = 30
        LD V2, Y_CENTRO ; 620D  V2 = 13
        DRW V1, V2, 5   ; D125  dibujar 5 filas desde I, en (V1, V2)
fin:    JP fin          ; 120C  saltar acá mismo, para siempre
```

- Todo lo que va después de un `;` es un **comentario**.
- `DIGITO EQU 0xA` define una **constante**: un nombre para un número. No ocupa
  memoria; cada vez que escribís `DIGITO`, el ensamblador pone `0xA`.
- `fin:` es una **etiqueta**: un nombre para la dirección donde queda la instrucción de
  esa línea. `JP fin` salta ahí. Si mañana agregás instrucciones antes, `fin` se corre
  solo y no hay que tocar nada.
- Las instrucciones van con sangría por costumbre, para que las etiquetas resalten.

### 4.2 Ensamblar desde la terminal

Parado en la carpeta raíz del proyecto, escribí:

```sh
node tools/chip8asm.js docs/ejemplos/01-a-mano.asm
```

Y el ensamblador te contesta:

<!-- salida: node tools/chip8asm.js docs/ejemplos/01-a-mano.asm -->
```text
Ensamblado 01-a-mano.asm: 14 bytes -> docs/ejemplos/01-a-mano.ch8
```

Si no le decís otra cosa, el ensamblador escribe el `.ch8` al lado del `.asm`, con el
mismo nombre. Con un segundo argumento elegís otro nombre:
`node tools/chip8asm.js programa.asm salida.ch8`. (También hay un atajo de npm:
`npm run asm -- programa.asm`.) Si te olvidás de cómo se usa, `--help` te lo recuerda:

<!-- salida: node tools/chip8asm.js --help -->
```text
Uso: node tools/chip8asm.js entrada.asm [salida.ch8] [--listing] [--xo]
```

Y si algo sale mal (un archivo que no existe, una opción que no conoce), te dice qué
pasó y no escribe nada. La opción `--xo` es para programas de XO-CHIP que no entran en
4 KB: la vas a ver en la [parte 9](#9-más-allá-de-chip-8-super-chip-y-xo-chip).

Comprobá que el `.ch8` que generó el ensamblador es idéntico a tu archivo hecho a mano.
En Windows:

```powershell
fc.exe /b a-mano.ch8 docs/ejemplos/01-a-mano.ch8
```

(Escribí `fc.exe` y no `fc` a secas, porque en PowerShell `fc` es otro comando.) Te
tiene que decir que no encontró diferencias. En Linux o macOS, `cmp a-mano.ch8
docs/ejemplos/01-a-mano.ch8` no dice nada si los archivos son iguales.

### 4.3 El listado

Con `--listing`, además, te muestra qué bytes generó cada línea y en qué dirección
quedaron:

```sh
node tools/chip8asm.js docs/ejemplos/01-a-mano.asm --listing
```

<!-- salida: node tools/chip8asm.js docs/ejemplos/01-a-mano.asm --listing -->
```text
   1                     ; 01-a-mano.asm — el programa de la parte 3, ahora en ensamblador
   2                     ;
   3                     ; Borra la pantalla y dibuja el dígito A de la fuente en el centro.
   4                     ; Ensamblado da exactamente los mismos 14 bytes que escribimos a mano:
   5                     ;   00E0 600A F029 611E 620D D125 120C
   6                     
   7                     DIGITO   EQU 0xA        ; el dígito de la fuente que vamos a mostrar
   8                     X_CENTRO EQU 30         ; (64 - 4) / 2: centrado en horizontal
   9                     Y_CENTRO EQU 13         ; (32 - 5) / 2, redondeado para abajo
  10                     
  11  0x200  00 E0               CLS             ; 00E0  borrar la pantalla
  12  0x202  60 0A               LD V0, DIGITO   ; 600A  V0 = 0x0A
  13  0x204  F0 29               LD F, V0        ; F029  I = dirección del glifo de V0 en la fuente
  14  0x206  61 1E               LD V1, X_CENTRO ; 611E  V1 = 30
  15  0x208  62 0D               LD V2, Y_CENTRO ; 620D  V2 = 13
  16  0x20A  D1 25               DRW V1, V2, 5   ; D125  dibujar 5 filas desde I, en (V1, V2)
  17  0x20C  12 0C       fin:    JP fin          ; 120C  saltar acá mismo, para siempre
  18                     
Ensamblado 01-a-mano.asm: 14 bytes -> docs/ejemplos/01-a-mano.ch8
```

Las columnas son: número de línea, dirección, bytes y la línea original. El listado es
tu mapa para depurar: cuando el monitor diga que el PC está en `0x20A`, acá ves que es
el `DRW`. Las líneas de comentario y los `EQU` no generan bytes.

### 4.4 La sintaxis, completa

- **Una instrucción por línea.** Los nombres de instrucciones, los registros y las
  directivas se pueden escribir en mayúsculas o minúsculas: `ld v1, 5` es lo mismo que
  `LD V1, 5`. Las etiquetas y las constantes, en cambio, distinguen: `Fin` y `fin` son
  dos nombres distintos.
- **Comentarios**: desde `;` hasta el final de la línea.
- **Etiquetas**: un nombre seguido de `:`. Pueden tener letras, dígitos, `_` y `.`, y
  no pueden empezar con un dígito. Pueden ir solas en su línea o antes de una
  instrucción. Se pueden usar antes de definirlas: el ensamblador lee el archivo dos
  veces, así que `JP mas_adelante` anda aunque `mas_adelante:` esté más abajo.
- **Números**: decimal (`42`), hexadecimal (`0x2A` o `$2A`) y binario (`0b00101010` o
  `%00101010`).
- **Bytes negativos**: donde va un byte podés poner un número de −128 a −1, que se
  guarda en complemento a dos. `ADD V3, -1` es lo mismo que `ADD V3, 0xFF`, y como la
  suma da la vuelta, resta 1.
- **Expresiones**: números, etiquetas y constantes sumados y restados, como
  `tabla + 3` o `XMAX + 1`.
- **`NOMBRE EQU valor`**: define una constante.
- **`DB`**: pone bytes en memoria, tal cual. Para los dibujos y las tablas.
- **`DW`**: pone palabras de 16 bits, el byte alto primero. `DW 0x00E0` genera lo
  mismo que `CLS`.
- **Nombres reservados**: no podés usar como etiqueta ni como constante los nombres de
  los registros (`V0` a `VF`, `I`, `DT`, `ST`), los operandos especiales (`K`, `F`,
  `B`, y los de SUPER-CHIP y XO-CHIP: `HF`, `R` y `LONG`), los nombres de
  instrucciones (también los de SUPER-CHIP y XO-CHIP, como `HIGH`, `LOW`, `SAVE` o
  `PLANE`) ni `EQU`, `DB` y `DW`. Así que `i:`, `b:` o `low:` no sirven como etiquetas;
  un nombre que solo empieza igual, como `low_x` o `r2`, sí.
- **Instrucciones**: las del machete de la
  [sección 2.9](#29-las-35-instrucciones-de-un-vistazo), más dos atajos (`SHR VX` y
  `SHL VX` son `SHR VX, VX` y `SHL VX, VX`) y las de SUPER-CHIP y XO-CHIP de la
  [sección 9.1](#91-dos-máquinas-más). El ensamblador no sabe para qué máquina es tu
  programa: acepta todas, y es la consola, según la plataforma elegida, la que las
  ejecuta o no.

Por ejemplo, este fragmento es válido, y cada par de líneas genera los mismos bytes:

```asm
LARGO   EQU 3
        LD V1, 42
        ld v1, 0x2A
        LD V2, %00001111
        LD V2, 0b00001111
        ADD V3, -1
        ADD V3, 0xFF
        LD I, tabla + LARGO
        LD I, tabla + 3
        DW 0x00E0
        CLS
tabla:  DB 1, 2, 3, 4
```

La documentación completa de la sintaxis está en el comentario del principio del
ensamblador: el bloque `<script id="chip8-asm">` de `chip8.html`.

### 4.5 Sprites propios con `DB`: HOLA

Con `DB` podés dibujar lo que quieras. Escribir cada fila en binario (`%`) es lo más
cómodo: se ve el dibujo en los unos y ceros. Este programa escribe HOLA:

```asm
; 02-hola.asm — sprites propios con DB: escribe HOLA en el centro
;
; Cada letra es un sprite de 5 filas: un byte por fila, un bit por píxel
; (1 = prendido). El bit más alto es el píxel de la izquierda. Las letras
; usan solo las 4 columnas de la izquierda; las otras 4 quedan en 0.

X0      EQU 22          ; x de la primera letra: (64 - 19) / 2, redondeado
Y0      EQU 13          ; y de todas las letras
AVANCE  EQU 5           ; 4 columnas de letra + 1 de separación

        CLS
        LD V1, X0
        LD V2, Y0
        LD I, letra_h
        DRW V1, V2, 5
        ADD V1, AVANCE
        LD I, letra_o
        DRW V1, V2, 5
        ADD V1, AVANCE
        LD I, letra_l
        DRW V1, V2, 5
        ADD V1, AVANCE
        LD I, letra_a
        DRW V1, V2, 5
fin:    JP fin

letra_h:
        DB %10010000    ; #..#
        DB %10010000    ; #..#
        DB %11110000    ; ####
        DB %10010000    ; #..#
        DB %10010000    ; #..#
letra_o:
        DB %01100000    ; .##.
        DB %10010000    ; #..#
        DB %10010000    ; #..#
        DB %10010000    ; #..#
        DB %01100000    ; .##.
letra_l:
        DB %10000000    ; #...
        DB %10000000    ; #...
        DB %10000000    ; #...
        DB %10000000    ; #...
        DB %11110000    ; ####
letra_a:
        DB %01100000    ; .##.
        DB %10010000    ; #..#
        DB %11110000    ; ####
        DB %10010000    ; #..#
        DB %10010000    ; #..#
```

- Los datos van **después** del `JP fin`. Como la CPU nunca pasa del salto, nunca los
  ejecuta como si fueran instrucciones.
- Cada letra tiene su etiqueta: `LD I, letra_o` apunta I a su primer byte. Las
  instrucciones ocupan de `0x200` a `0x21D`, así que `letra_h` queda en `0x21E`,
  `letra_o` en `0x223` (5 bytes después), y así.
- `ADD V1, AVANCE` corre la x 5 píxeles para la letra siguiente.

Así queda (las filas 13 a 17 de la pantalla, con `#` para los píxeles prendidos):

<!-- salida (fragmento): node docs/ejemplos/mini-emulador.js docs/ejemplos/02-hola.ch8 -->
```text
......................#..#..##..#.....##........................
......................#..#.#..#.#....#..#.......................
......................####.#..#.#....####.......................
......................#..#.#..#.#....#..#.......................
......................#..#..##..####.#..#.......................
```

(Esa salida la genera el emulador mínimo que vas a ver en la
[parte 8](#8-cómo-funciona-un-emulador-por-dentro).)

### 4.6 Cuando algo está mal

Si hay un error, el ensamblador no genera nada y te dice **en qué línea** está y por
qué. Estos son los errores más comunes:

<!-- verificar: tabla-errores -->
| Si escribís | El ensamblador dice | Qué pasó |
|---|---|---|
| `DRAW V1, V2, 5` | `Línea 1: instrucción desconocida: "DRAW"` | Se llama `DRW`. |
| `LD V1 5` | `Línea 1: no se puede usar "V1" dentro de una expresión (es un nombre reservado)` | Falta la coma: `LD V1, 5`. |
| `LD V1, 300` | `Línea 1: valor fuera de rango para un byte (-128..255): "300" = 300` | Los registros son de 8 bits. |
| `DRW V1, V2, 16` | `Línea 1: valor fuera de rango para un nibble (0..15): "16" = 16` | Un sprite tiene como mucho 15 filas. |
| `JP 0x1000` | `Línea 1: dirección fuera de rango (0..0xFFF): "0x1000" = 4096` | La memoria llega hasta `0xFFF`. |
| `JP fin` | `Línea 1: etiqueta o constante desconocida: "fin"` | La etiqueta no está definida (o está escrita con otras mayúsculas). |
| `LD V1, V10` | `Línea 1: etiqueta o constante desconocida: "V10" (los registros van de V0 a VF)` | No existe V10: los registros son V0 a VF. |
| `LD V 1, 5` | `Línea 1: el operando "V 1" tiene espacios adentro: se escribe "V1"` | Los nombres de registros van pegados: `V1`, `DT`, `ST`. |
| `LD V1, 0x2G` | `Línea 1: número inválido: "0x2G"` | G no es un dígito hexadecimal. |
| `SKP 5` | `Línea 1: operandos inválidos para SKP: "5" (formas válidas: SKP Vx)` | `SKP` recibe un **registro** que tiene el número de tecla: `LD V0, 5` y después `SKP V0`. |
| `JP V1, 0x300` | `Línea 1: JP V1 solo se puede usar con una dirección que empiece con 1 (0x100..0x1FF, la forma BXNN de SUPER-CHIP), y 0x300 no empieza con 1; JP V0 acepta cualquier dirección` | El salto con desplazamiento clásico es `JP V0, dirección`. Con otro registro es la forma `BXNN` de SUPER-CHIP, en la que el registro es el primer dígito de la dirección: `JP V3, 0x300` sí se ensambla (da `B300`). |
| `CLS V1` | `Línea 1: CLS espera 0 operandos y recibió 1 (formas válidas: CLS)` | `CLS` no lleva operandos. |
| `i: CLS` | `Línea 1: "i" es un nombre reservado y no puede usarse como etiqueta ni constante` | `I` es un registro. |
| `low: CLS` | `Línea 1: "low" es un nombre reservado y no puede usarse como etiqueta ni constante` | `LOW` es una instrucción de SUPER-CHIP (parte 9): sus nombres también están reservados. |
| `LD I, 0x1234` | `Línea 1: dirección fuera de rango (0..0xFFF): "0x1234" = 4660; para cargar en I una dirección de 16 bits usá LD I, LONG (XO-CHIP)` | `LD I` carga direcciones de 12 bits. Más arriba de `0xFFF` solo llega XO-CHIP, con su memoria de 64 KB. |

Cuando el programa tiene varias líneas, el número de línea te lleva directo al
problema. Este archivo tiene una etiqueta repetida:

<!-- verificar: error -->
```asm
; mal.asm — una etiqueta definida dos veces
        LD V0, 5
bucle:  ADD V0, 1
        JP bucle
bucle:  CLS
```

```text
mal.asm: Línea 5: "bucle" ya estaba definido en la línea 3
```

En el Taller (sección 4.8) el mismo programa no se carga: el número del renglón 5 queda
en rojo en el margen, y debajo del editor aparece la lista de los errores, con el mismo
mensaje sin el nombre del archivo. A diferencia de la terminal, que se detiene en el
primero, el Taller los muestra todos de una vez.

Lo que el ensamblador **no** puede ver son los errores de lógica: usar `SKP` donde iba
`SKNP`, olvidarse de apuntar I antes de un `DRW`, pisar un registro que estabas usando.
Para esos está el monitor, y la [parte 7](#7-depurar).

### 4.7 Ida y vuelta con el monitor

El DESENSAMBLADO del monitor usa exactamente esta misma sintaxis, así que cualquier
línea que veas ahí la podés copiar a un `.asm`. Las palabras que no son instrucciones
válidas aparecen como `DW 0x....`, que también se puede ensamblar. Con el quirk `BXNN`
prendido, `B300` aparece como `JP V3, 0x300`, que el ensamblador también entiende (y
vuelve a dar `B300`). Eso sí: el monitor no sabe de antemano qué es código y qué es un
dibujo. Los bytes del fantasmita que vas a dibujar en la parte 5 (`78 FC ...`) aparecen
primero como `ADD V8, 0xFC`, más tenues, como todo lo que todavía no se ejecutó. Cuando
un `DRW` los lee, el monitor se entera de que son datos y los muestra como tales:
`DB 0x78, 0xFC`. Y si en la ranura está un programa que ensamblaste en el Taller, el
DESENSAMBLADO muestra además sus etiquetas: `fin: JP 0x20C`.

### 4.8 El Taller: ensamblar sin salir de la consola

Todo lo de esta parte se puede hacer también adentro de la consola. Tocá el botón del
lápiz, al lado del **?**, o apretá **Y**, y se abre el **Taller**: un editor con el mismo
ensamblador. En una computadora va a la derecha, con la pantalla a la vista; en una
pantalla angosta, debajo de la consola.

- En **Programa** están los once ejemplos de este tutorial, con su nombre de archivo
  (*01-a-mano.asm*, *02-hola.asm*...), los fuentes de los seis cartuchos incluidos y los
  programas tuyos (**Nuevo** empieza uno, **Abrir .asm** trae un archivo).
- **Ensamblar y correr**, o **Ctrl+Enter**, ensambla el programa y lo carga en la
  consola, que lo corre enseguida. No pasa por *Tus cartuchos*. Para tocar el keypad con
  el teclado, hacé clic en la pantalla: mientras escribís en el editor, las teclas son del
  editor.
- Si hay errores, el programa no se carga: se marcan en el margen y en la lista de abajo,
  y el cursor va al primero (sección 4.6).
- Lo que cambiás no se pierde: queda anotado en tu navegador como *sin guardar*, aunque
  recargues la página, hasta que tocás **Guardar**. Un ejemplo o un cartucho que
  cambiaste vuelve a como venía con **Restaurar el original**: los archivos del
  repositorio no se tocan.
- **Descargar .ch8** baja la ROM ensamblada, y **Descargar .asm**, el texto.

Con un ejemplo cargado así, el DESENSAMBLADO muestra sus etiquetas, y todo lo demás
(Paso, el monitor, la [parte 7](#7-depurar)) funciona igual que con el `.ch8`.

---

## 5. Proyecto guiado: el Cazamonedas

Vamos a hacer un juego: un fantasmita que se mueve con **W, A, S y D** y junta las
monedas que van apareciendo, con puntaje y sonido. Lo construimos en seis etapas; cada
una es un programa completo que podés ensamblar y cargar, y cada una agrega algo nuevo.

Todos los `.ch8` ya están ensamblados en `docs/ejemplos/`. Si cambiás un `.asm`,
volvé a ensamblarlo, por ejemplo:

```sh
node tools/chip8asm.js docs/ejemplos/04-mover.asm
```

O hacelo en el Taller ([sección 4.8](#48-el-taller-ensamblar-sin-salir-de-la-consola)):
las seis etapas están en **Programa**, de *03-fantasma.asm* a *08-sonido.asm*. Elegís una,
la cambiás y **Ctrl+Enter** la corre; el archivo de `docs/ejemplos/` queda como estaba.

Antes de empezar, dejá la consola como viene de fábrica: perfil **COSMAC VIP** y
**15 IPF**. Las explicaciones de tiempos de esta parte suponen eso; cuando alguna etapa
te proponga probar otro perfil, después volvé a este.

### El plan antes de empezar

En CHIP-8 no hay variables: hay 16 registros, y algunas instrucciones usan registros
fijos (`LD V2, [I]` carga V0, V1 y V2; `DRW` y las restas pisan VF). Para no pisarnos
solos, conviene repartir los registros desde el principio y respetar el reparto en
todas las etapas:

| Registro | Uso |
|---|---|
| V0 a V3 | Temporales: se usan un momento y se descartan. El puntaje (etapa E) los pisa. |
| V4, V5 | Posición del fantasmita (x, y). |
| V6, V7 | Posición nueva, mientras decidimos si se mueve. |
| V8, V9 | Posición de la moneda. |
| VE | Puntaje. |
| VF | Bandera. Nunca guardamos nada ahí. |

Y la pantalla, con el juego terminado:

```text
filas 0 a 4     el puntaje (etapa E)
fila  6         el techo, una línea de lado a lado (etapa D)
filas 8 a 31    la zona de juego
```

### 5.1 Etapa A: dibujar un sprite

```asm
; 03-fantasma.asm — Cazamonedas, etapa A: dibujar un sprite propio
;
; El protagonista del juego es un fantasmita de 6x6 píxeles. Por ahora
; lo dibujamos una vez en el centro de la pantalla y nos quedamos quietos.
;
; Registros:
;   V4, V5  posición del fantasmita (x, y)

        CLS
        LD V4, 29       ; x = (64 - 6) / 2
        LD V5, 13       ; y = (32 - 6) / 2
        LD I, fantasma  ; I apunta a los 6 bytes del sprite
        DRW V4, V5, 6   ; dibujar 6 filas
fin:    JP fin

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#   los ojos son dos agujeros
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.   el borde de la sábana
```

Ya conocés todo lo que hay acá. El dibujo es el de la
[sección 2.5](#25-la-pantalla): 6 filas de 6 píxeles (los dos bits de la derecha de
cada byte van en 0). Para centrarlo, x = (64 − 6) / 2 = 29 e y = (32 − 6) / 2 = 13.

Cargá `docs/ejemplos/03-fantasma.ch8` y ahí está. Probá cambiarle la cara: los ojos
son los dos ceros del medio de la tercera fila.

### 5.2 Etapa B: moverlo con el teclado

```asm
; 04-mover.asm — Cazamonedas, etapa B: mover el fantasmita con el teclado
;
; W, A, S y D de tu teclado son las teclas 5, 7, 8 y 9 del keypad.
; En cada vuelta del bucle miramos las cuatro teclas con SKNP. Si el
; fantasmita se movió, lo borramos (dibujarlo otra vez en el mismo lugar
; lo apaga, porque DRW dibuja con XOR) y lo dibujamos en la posición nueva.
;
; Registros:
;   V0      temporal (el número de tecla que consultamos)
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D

inicio:
        CLS
        LD V4, 29
        LD V5, 13
        LD I, fantasma
        DRW V4, V5, 6

bucle:
        LD V6, V4       ; la posición nueva arranca igual a la actual
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0         ; si la tecla NO está apretada, saltea la línea siguiente
        ADD V7, -1      ; y = y - 1  (-1 es lo mismo que 0xFF)
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        SE V6, V4       ; ¿cambió x? entonces hay que moverlo
        JP mover
        SE V7, V5       ; ¿cambió y?
        JP mover
        JP bucle        ; no se movió: no hay nada que redibujar

mover:
        DRW V4, V5, 6   ; borrar: XOR sobre el dibujo viejo lo apaga
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6   ; dibujar en la posición nueva
        JP bucle

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
```

Lo nuevo:

- **Leer una tecla.** `SKNP V0` saltea la instrucción siguiente si la tecla cuyo
  número está en V0 **no** está apretada. Leído al revés: la línea de abajo solo se
  ejecuta si la tecla está apretada. Ese par (`SKNP` + una instrucción) es el "if" de
  una línea de CHIP-8, y lo vas a ver en todos lados.
- **Moverse solo si hace falta.** `SE V6, V4` saltea el `JP mover` si la x nueva es
  igual a la vieja; o sea, **salta a `mover` si la x cambió**. Lo mismo con la y. Si
  no cambió nada, no se redibuja.
- **Animar con XOR.** En `mover`, el primer `DRW` dibuja el fantasmita donde ya
  estaba: como dibujar es hacer XOR, eso lo **borra**. Después actualiza la posición y
  lo dibuja en el lugar nuevo.

Cargalo y movelo. Vas a notar dos cosas.

**Parpadea.** Entre el borrado y el nuevo dibujo, el fantasmita no está en la
pantalla. Con el perfil COSMAC VIP, cada `DRW` espera al frame siguiente (el quirk
`VBLANK`), así que durante un frame entero no se ve. Es el parpadeo típico de los juegos
de CHIP-8; la opción **Persistencia** del modo Tubo CRT lo disimula, y en *Píxeles
puros* lo ves tal cual. En la [parte 6](#61-rebote-paso-a-paso) vas a ver otra forma
de reducirlo, y en la [6.2](#62-lo-mejor-de-atrapa), una de eliminarlo.

**La velocidad depende de la máquina.** Con el perfil COSMAC VIP avanza 30 píxeles por
segundo, tanto a 15 como a 1000 IPF: cada paso tiene dos `DRW` y cada uno espera un
frame, así que da un paso cada 2 frames. Pero pasá al perfil XO-CHIP (que no espera; la
ROM vuelve a empezar, porque el perfil también cambia la plataforma): a 15 IPF avanza 50
píxeles por segundo, y a 1000 IPF avanza más de 50 píxeles **en un solo frame**, casi el
ancho de la pantalla. Y si lo llevás contra un borde, reaparece
del otro lado. Cuando termines de probar, volvé al perfil COSMAC VIP. Las dos cosas las
arreglamos en las próximas etapas.

### 5.3 Etapa C: el ritmo con el temporizador

```asm
; 05-ritmo.asm — Cazamonedas, etapa C: velocidad fija con el temporizador
;
; En la etapa B el fantasmita se movía tan rápido como corriera la CPU.
; Ahora cada vuelta del bucle espera a que el temporizador de retardo (DT)
; llegue a 0 y lo vuelve a cargar con RITMO. DT baja 60 veces por segundo
; pase lo que pase, así que el fantasmita avanza 60 / RITMO = 20 píxeles
; por segundo tanto a 15 como a 1000 instrucciones por frame.
;
; Registros:
;   V0      temporal
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros (1/60 s) por paso

inicio:
        CLS
        LD V4, 29
        LD V5, 13
        LD I, fantasma
        DRW V4, V5, 6

bucle:
        LD V0, DT       ; ¿ya pasaron RITMO cuadros desde el paso anterior?
        SE V0, 0
        JP bucle        ; todavía no: seguir esperando
        LD V0, RITMO
        LD DT, V0       ; el próximo paso, dentro de RITMO cuadros

        LD V6, V4
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0
        ADD V7, -1
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        DRW V4, V5, 6   ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6   ; dibujar en la posición nueva
        JP bucle

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
```

Lo único nuevo son las cinco líneas del principio del bucle:

- `LD V0, DT` / `SE V0, 0` / `JP bucle`: mientras el temporizador no llegue a 0,
  seguimos dando vueltas acá.
- Cuando llega a 0, lo volvemos a cargar con `RITMO` (3) y hacemos un paso.

DT baja 60 veces por segundo pase lo que pase, así que hay exactamente un paso cada 3
frames: **20 píxeles por segundo** con cualquier perfil, desde 15 IPF para arriba. Los
tests del proyecto lo comprueban con los tres perfiles y con 15, 30, 100 y 1000 IPF.

Un detalle de diseño: el temporizador se recarga **al principio** del paso, no al
final. Así el tiempo que tarda el paso mismo queda adentro de esos 3 frames, y el ritmo
no se corre.

Otro detalle: **el paso tiene que entrar en esos 3 frames**. Con el perfil COSMAC VIP,
cada `DRW` termina el frame en el que se ejecuta, así que un paso que dibuja dos veces
ocupa como mínimo 2 frames, más las instrucciones de antes del primer `DRW`, que a 15
IPF no entran todas en un frame. Justo entra en 3. Si probás con `RITMO EQU 2`, con el
perfil COSMAC VIP va a 30 píxeles por segundo a 30 IPF o más, pero a 15 IPF el paso no
entra en 2 frames, tarda 3, y baja a 20: la velocidad vuelve a depender de las IPF. Al
diseñar para el VIP, contá los `DRW` de cada paso: cada uno puede costarte un frame.
Y no te olvides de las instrucciones: a 7 IPF, el ajuste más lento de la consola, las
de un paso ya no entran en 3 frames, y el fantasmita baja a 15 píxeles por segundo con
el perfil COSMAC VIP y a 18 con los otros dos.

### 5.4 Etapa D: bordes, una moneda y choques

Esta es la etapa más larga: aparece la moneda, y con ella los choques.

```asm
; 06-monedas.asm — Cazamonedas, etapa D: bordes, una moneda y choques con VF
;
; Tres cosas nuevas:
;   - Bordes: el fantasmita ya no se sale de la pantalla ni se mete en el
;     techo (una línea en la fila 6; arriba va a ir el marcador).
;   - Una moneda en un lugar al azar (RND).
;   - Choques: DRW deja VF = 1 si apagó algún píxel que estaba prendido.
;     Si al dibujar el fantasmita VF queda en 1, es que pisó la moneda.
;
; Registros:
;   V0, V1  temporales
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)
;   V8, V9  posición de la moneda (x, y)
;   VF      bandera: choque de DRW, préstamo de SUB

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros por paso
XMAX    EQU 58          ; 64 - 6: la x más grande del fantasmita
YMIN    EQU 8           ; debajo del techo (fila 6), con una fila de aire
YMAX    EQU 26          ; 32 - 6: la y más grande del fantasmita
MONEDA_XMAX EQU 60      ; 64 - 4: la x más grande de la moneda
MONEDA_DY   EQU 20      ; la moneda va de y = YMIN a y = YMIN + 20 = 28

inicio:
        CLS
        LD I, linea     ; el techo: 8 tramos de 8 píxeles en la fila 6
        LD V0, 0
        LD V1, 6
techo:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP techo

        LD V4, 29
        LD V5, 17
        LD I, fantasma
        DRW V4, V5, 6
        CALL nueva_moneda

bucle:
        LD V0, DT
        SE V0, 0
        JP bucle
        LD V0, RITMO
        LD DT, V0

        LD V6, V4
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0
        ADD V7, -1
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        ; Bordes: como se mueve de a 1 píxel, si se pasó fue por uno solo
        ; y alcanza con devolverlo al límite.
        SNE V6, -1          ; x = -1 (0xFF): se fue por la izquierda
        LD V6, 0
        SNE V6, XMAX + 1    ; se fue por la derecha
        LD V6, XMAX
        SNE V7, YMIN - 1    ; se metió en el techo
        LD V7, YMIN
        SNE V7, YMAX + 1    ; se fue por abajo
        LD V7, YMAX

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        LD I, fantasma      ; las subrutinas cambian I: lo recargamos siempre
        DRW V4, V5, 6       ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6       ; dibujar en la posición nueva
        SE VF, 0            ; VF = 1: apagó algún píxel prendido. ¡La moneda!
        CALL agarrar
        JP bucle

; ----------------------------------------------------------------------
; El fantasmita pisó la moneda. El XOR apagó los píxeles donde se
; superponen, así que primero lo sacamos (la moneda vuelve a estar entera),
; borramos la moneda, lo volvemos a dibujar y ponemos otra moneda.
; ----------------------------------------------------------------------
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        LD I, fantasma
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET

; ----------------------------------------------------------------------
; Pone la moneda en un lugar al azar. Si cae encima del fantasmita
; (VF = 1 al dibujarla), la borra y prueba en otro lugar.
; Usa V0 y cambia I.
; ----------------------------------------------------------------------
nueva_moneda:
        RND V8, 0x3F        ; x al azar entre 0 y 63
        LD V0, MONEDA_XMAX
        SUB V0, V8          ; VF = 1 si no hubo préstamo, o sea si x <= 60
        SE VF, 1
        JP nueva_moneda     ; no entra en la pantalla: probar otra vez
        RND V9, 0x1F        ; y al azar entre 0 y 31
        LD V0, MONEDA_DY
        SUB V0, V9          ; VF = 1 si y <= 20
        SE VF, 1
        JP nueva_moneda
        ADD V9, YMIN        ; bajarla debajo del techo: y entre 8 y 28
        LD I, moneda
        DRW V8, V9, 4
        SE VF, 1            ; ¿no tocó nada? listo
        RET
        DRW V8, V9, 4       ; cayó sobre el fantasmita: borrarla
        JP nueva_moneda     ; y probar en otro lugar

; ----------------------------------------------------------------------
; Sprites
; ----------------------------------------------------------------------
fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
moneda:
        DB %01100000    ; .##.
        DB %11110000    ; ####
        DB %11110000    ; ####
        DB %01100000    ; .##.
linea:
        DB %11111111    ; ########
```

Lo nuevo, por partes:

**El techo.** `techo` es un bucle que dibuja 8 veces el sprite `linea` (un solo byte,
`%11111111`) en la fila 6, avanzando la x de a 8: `ADD V0, 8`, y `SE V0, 64` para
cortar cuando llega al borde.

**Los bordes.** Como el fantasmita se mueve de a un píxel, si se pasó del límite fue
por uno solo, y alcanza con devolverlo:

- `SNE V6, -1` / `LD V6, 0`: si la x nueva es −1 (o sea `0xFF`: 0 − 1 da la vuelta),
  la dejamos en 0. `SNE` saltea el `LD` si **no** es igual; o sea, el `LD` se ejecuta
  solo si es igual.
- `SNE V6, XMAX + 1` / `LD V6, XMAX`: lo mismo contra el borde derecho. Acá se ve lo
  útil de las expresiones: `XMAX + 1` es 59.
- Y lo mismo para arriba (`YMIN - 1`) y para abajo (`YMAX + 1`).

**El choque.** Después de dibujar el fantasmita en su lugar nuevo, `SE VF, 0` saltea
el `CALL agarrar` si VF es 0. Si VF es 1, el dibujo apagó algún píxel que estaba
prendido, y lo único que puede haber en la zona de juego es la moneda. Hay que mirar VF
**inmediatamente**: la próxima instrucción que lo toque (otro `DRW`, una resta) lo pisa.

**Agarrar la moneda.** Cuando el fantasmita pisó la moneda, el XOR dejó un dibujo
mezclado: donde se superponían, los píxeles se apagaron. Por eso `agarrar` va en este
orden: saca el fantasmita (la moneda vuelve a quedar entera), borra la moneda (ahora sí,
dibujándola otra vez), vuelve a dibujar el fantasmita y pone una moneda nueva.

**Un número al azar, dentro de un rango.** `RND V8, 0x3F` da un número entre 0 y 63
(al azar AND `0x3F`). Pero la moneda mide 4 píxeles, así que x tiene que ser 60 como
mucho. CHIP-8 no tiene "si es mayor que": para comparar se **resta** y se mira el
préstamo. `SUB V0, V8` calcula `60 − x` y deja **VF = 1 si no hubo préstamo**, o sea si
`60 >= x`. Si VF es 0, el número no sirve y se tira otro. Con la y pasa lo mismo, y
después se le suma `YMIN` para que la moneda caiga debajo del techo.

**Una moneda encima del fantasmita.** Si la moneda nueva cae sobre el fantasmita, al
dibujarla VF queda en 1. En ese caso `nueva_moneda` la borra y prueba otro lugar.

**`LD I, fantasma` al principio de `mover`.** Las subrutinas apuntan I a la moneda.
Antes, en las etapas B y C, I apuntaba siempre al fantasmita y alcanzaba con cargarlo
una vez; ahora hay que cargarlo antes de dibujar. Anotá esta regla, porque es la fuente
de errores más común en CHIP-8: **antes de cada `DRW`, fijate a dónde apunta I**.

Fijate también el comentario de cada subrutina: "Usa V0 y cambia I". Es su contrato:
quien la llama sabe qué registros puede perder. En la [parte 7](#7-depurar) vas a ver
qué pasa cuando no se respeta.

### 5.5 Etapa E: el puntaje

El puntaje vive en VE. Mostrarlo en decimal lleva tres instrucciones especiales:

- `LD B, VE` (`FX33`) escribe en la memoria, a partir de I, las **centenas**, las
  **decenas** y las **unidades** de VE: con VE = 137, deja 1, 3 y 7.
- `LD V2, [I]` (`FX65`) carga en **V0, V1 y V2** los tres bytes que hay a partir de I.
  Carga todos los registros desde V0 hasta el que nombrás: por eso, en el reparto,
  V0 a V3 son temporales.
- `LD F, Vx` (`FX29`) apunta I al dibujo de cada dígito.

Esta es la subrutina que lo dibuja:

```asm
; (fragmento de docs/ejemplos/07-puntaje.asm)
; ----------------------------------------------------------------------
; Dibuja el puntaje (VE) en decimal en las columnas 1, 6 y 11 de la fila 0.
; DRW dibuja con XOR: llamarla dos veces con el mismo puntaje lo borra.
; Usa V0..V3 y cambia I.
; ----------------------------------------------------------------------
dibuja_puntaje:
        LD I, bcd
        LD B, VE            ; bcd = centenas, bcd+1 = decenas, bcd+2 = unidades
        LD V2, [I]          ; V0, V1, V2 = esos tres dígitos
        LD V3, 0            ; y = 0
        LD F, V0            ; I = glifo de las centenas...
        LD V0, 1            ; ...así que V0 queda libre para la x
        DRW V0, V3, 5
        LD F, V1
        LD V1, 6
        DRW V1, V3, 5
        LD F, V2
        LD V2, 11
        DRW V2, V3, 5
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
bcd:    DB 0, 0, 0          ; lugar para los tres dígitos de LD B, VE
```

`bcd` son tres bytes reservados con `DB 0, 0, 0` para que `LD B, VE` tenga dónde
escribir. Un truco: después de `LD F, V0`, I ya apunta al dígito de las centenas, así
que V0 queda libre y se reusa para la x.

Para cambiar el número de la pantalla se usa, otra vez, XOR: llamar a
`dibuja_puntaje` con el puntaje viejo lo **borra**, y después de sumar, llamarla de
nuevo dibuja el nuevo. Así queda `agarrar`:

```asm
; (fragmento de docs/ejemplos/07-puntaje.asm)
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        CALL dibuja_puntaje ; borrar el puntaje viejo (XOR)...
        ADD VE, 1
        CALL dibuja_puntaje ; ...y dibujar el nuevo
        LD I, fantasma      ; dibuja_puntaje cambió I
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET
```

Y al arrancar, antes del bucle, `LD VE, 0` y un `CALL dibuja_puntaje` muestran el
`000`. Con eso, la subrutina y los tres bytes de `bcd`, la etapa E está completa.

<details>
<summary>Listado completo de <code>07-puntaje.asm</code></summary>

```asm
; 07-puntaje.asm — Cazamonedas, etapa E: el puntaje en pantalla
;
; Cada moneda suma un punto. El puntaje (VE) se muestra en decimal arriba
; a la izquierda, con tres dígitos de la fuente:
;   LD B, VE    (FX33) guarda centenas, decenas y unidades en memoria,
;   LD V2, [I]  (FX65) las carga en V0, V1 y V2,
;   LD F, Vx    (FX29) apunta I al glifo de cada dígito.
;
; Registros:
;   V0..V3  temporales (dibuja_puntaje usa los cuatro)
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)
;   V8, V9  posición de la moneda (x, y)
;   VE      puntaje
;   VF      bandera: choque de DRW, préstamo de SUB

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros por paso
XMAX    EQU 58          ; 64 - 6: la x más grande del fantasmita
YMIN    EQU 8           ; debajo del techo (fila 6), con una fila de aire
YMAX    EQU 26          ; 32 - 6: la y más grande del fantasmita
MONEDA_XMAX EQU 60      ; 64 - 4: la x más grande de la moneda
MONEDA_DY   EQU 20      ; la moneda va de y = YMIN a y = YMIN + 20 = 28

inicio:
        CLS
        LD I, linea     ; el techo: 8 tramos de 8 píxeles en la fila 6
        LD V0, 0
        LD V1, 6
techo:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP techo

        LD VE, 0
        CALL dibuja_puntaje

        LD V4, 29
        LD V5, 17
        LD I, fantasma
        DRW V4, V5, 6
        CALL nueva_moneda

bucle:
        LD V0, DT
        SE V0, 0
        JP bucle
        LD V0, RITMO
        LD DT, V0

        LD V6, V4
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0
        ADD V7, -1
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        ; Bordes: como se mueve de a 1 píxel, si se pasó fue por uno solo
        ; y alcanza con devolverlo al límite.
        SNE V6, -1          ; x = -1 (0xFF): se fue por la izquierda
        LD V6, 0
        SNE V6, XMAX + 1    ; se fue por la derecha
        LD V6, XMAX
        SNE V7, YMIN - 1    ; se metió en el techo
        LD V7, YMIN
        SNE V7, YMAX + 1    ; se fue por abajo
        LD V7, YMAX

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        LD I, fantasma      ; las subrutinas cambian I: lo recargamos siempre
        DRW V4, V5, 6       ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6       ; dibujar en la posición nueva
        SE VF, 0            ; VF = 1: apagó algún píxel prendido. ¡La moneda!
        CALL agarrar
        JP bucle

; ----------------------------------------------------------------------
; El fantasmita pisó la moneda: la sacamos, sumamos un punto y ponemos
; otra moneda.
; ----------------------------------------------------------------------
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        CALL dibuja_puntaje ; borrar el puntaje viejo (XOR)...
        ADD VE, 1
        CALL dibuja_puntaje ; ...y dibujar el nuevo
        LD I, fantasma      ; dibuja_puntaje cambió I
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET

; ----------------------------------------------------------------------
; Pone la moneda en un lugar al azar. Si cae encima del fantasmita
; (VF = 1 al dibujarla), la borra y prueba en otro lugar.
; Usa V0 y cambia I.
; ----------------------------------------------------------------------
nueva_moneda:
        RND V8, 0x3F        ; x al azar entre 0 y 63
        LD V0, MONEDA_XMAX
        SUB V0, V8          ; VF = 1 si no hubo préstamo, o sea si x <= 60
        SE VF, 1
        JP nueva_moneda     ; no entra en la pantalla: probar otra vez
        RND V9, 0x1F        ; y al azar entre 0 y 31
        LD V0, MONEDA_DY
        SUB V0, V9          ; VF = 1 si y <= 20
        SE VF, 1
        JP nueva_moneda
        ADD V9, YMIN        ; bajarla debajo del techo: y entre 8 y 28
        LD I, moneda
        DRW V8, V9, 4
        SE VF, 1            ; ¿no tocó nada? listo
        RET
        DRW V8, V9, 4       ; cayó sobre el fantasmita: borrarla
        JP nueva_moneda     ; y probar en otro lugar

; ----------------------------------------------------------------------
; Dibuja el puntaje (VE) en decimal en las columnas 1, 6 y 11 de la fila 0.
; DRW dibuja con XOR: llamarla dos veces con el mismo puntaje lo borra.
; Usa V0..V3 y cambia I.
; ----------------------------------------------------------------------
dibuja_puntaje:
        LD I, bcd
        LD B, VE            ; bcd = centenas, bcd+1 = decenas, bcd+2 = unidades
        LD V2, [I]          ; V0, V1, V2 = esos tres dígitos
        LD V3, 0            ; y = 0
        LD F, V0            ; I = glifo de las centenas...
        LD V0, 1            ; ...así que V0 queda libre para la x
        DRW V0, V3, 5
        LD F, V1
        LD V1, 6
        DRW V1, V3, 5
        LD F, V2
        LD V2, 11
        DRW V2, V3, 5
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
bcd:    DB 0, 0, 0          ; lugar para los tres dígitos de LD B, VE

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
moneda:
        DB %01100000    ; .##.
        DB %11110000    ; ####
        DB %11110000    ; ####
        DB %01100000    ; .##.
linea:
        DB %11111111    ; ########
```

</details>

### 5.6 Etapa F: sonido

El temporizador de sonido es lo más fácil de CHIP-8: lo cargás con una duración y
suena **mientras valga más de 0**; baja solo, 60 veces por segundo. No hay que
apagarlo. Vamos a hacer un pitido corto por cada moneda y uno largo cada 10:

```asm
; (fragmento de docs/ejemplos/08-sonido.asm)
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        CALL dibuja_puntaje ; borrar el puntaje viejo (XOR)...
        ADD VE, 1
        CALL dibuja_puntaje ; ...y dibujar el nuevo

        ; Sonido: pitido corto, o largo si el puntaje terminó en 0.
        ; LD B, VE (en dibuja_puntaje) dejó las unidades en bcd + 2.
        LD I, bcd + 2
        LD V0, [I]          ; V0 = unidades del puntaje
        LD V1, BIP_CORTO
        SNE V0, 0           ; ¿terminó en 0 (10, 20, 30...)?
        LD V1, BIP_LARGO
        LD ST, V1           ; suena mientras ST > 0; ST baja solo

        LD I, fantasma      ; dibuja_puntaje y LD V0, [I] cambiaron I
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET
```

- `BIP_CORTO EQU 4` y `BIP_LARGO EQU 20`: un quinceavo y un tercio de segundo.
- Para saber si el puntaje terminó en 0, no hace falta dividir: `dibuja_puntaje` ya
  dejó las unidades en `bcd + 2`. `LD V0, [I]` con X = 0 carga **un solo** byte, en V0.
- `SNE V0, 0` / `LD V1, BIP_LARGO`: si las unidades son 0, se cambia la duración.

Ese es el juego completo. Cargá `docs/ejemplos/08-sonido.ch8`, tocá la consola para
habilitar el sonido y juntá diez monedas.

<details>
<summary>Listado completo de <code>08-sonido.asm</code></summary>

```asm
; 08-sonido.asm — Cazamonedas, etapa F: el juego completo, con sonido
;
; Mové el fantasmita con W, A, S y D (teclas 5, 7, 8 y 9 del keypad) y
; juntá monedas. Cada moneda suena con un pitido corto; cada 10 monedas,
; con uno largo. El temporizador de sonido (ST) hace sonar el beep
; mientras vale más de 0 y baja solo, 60 veces por segundo: alcanza con
; cargarlo con la duración que queremos y olvidarse.
;
; Registros:
;   V0..V3  temporales (dibuja_puntaje usa los cuatro)
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)
;   V8, V9  posición de la moneda (x, y)
;   VE      puntaje
;   VF      bandera: choque de DRW, préstamo de SUB

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros por paso
BIP_CORTO EQU 4         ; duración de los pitidos, en sesentavos de segundo
BIP_LARGO EQU 20
XMAX    EQU 58          ; 64 - 6: la x más grande del fantasmita
YMIN    EQU 8           ; debajo del techo (fila 6), con una fila de aire
YMAX    EQU 26          ; 32 - 6: la y más grande del fantasmita
MONEDA_XMAX EQU 60      ; 64 - 4: la x más grande de la moneda
MONEDA_DY   EQU 20      ; la moneda va de y = YMIN a y = YMIN + 20 = 28

inicio:
        CLS
        LD I, linea     ; el techo: 8 tramos de 8 píxeles en la fila 6
        LD V0, 0
        LD V1, 6
techo:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP techo

        LD VE, 0
        CALL dibuja_puntaje

        LD V4, 29
        LD V5, 17
        LD I, fantasma
        DRW V4, V5, 6
        CALL nueva_moneda

bucle:
        LD V0, DT
        SE V0, 0
        JP bucle
        LD V0, RITMO
        LD DT, V0

        LD V6, V4
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0
        ADD V7, -1
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        ; Bordes: como se mueve de a 1 píxel, si se pasó fue por uno solo
        ; y alcanza con devolverlo al límite.
        SNE V6, -1          ; x = -1 (0xFF): se fue por la izquierda
        LD V6, 0
        SNE V6, XMAX + 1    ; se fue por la derecha
        LD V6, XMAX
        SNE V7, YMIN - 1    ; se metió en el techo
        LD V7, YMIN
        SNE V7, YMAX + 1    ; se fue por abajo
        LD V7, YMAX

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        LD I, fantasma      ; las subrutinas cambian I: lo recargamos siempre
        DRW V4, V5, 6       ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6       ; dibujar en la posición nueva
        SE VF, 0            ; VF = 1: apagó algún píxel prendido. ¡La moneda!
        CALL agarrar
        JP bucle

; ----------------------------------------------------------------------
; El fantasmita pisó la moneda: la sacamos, sumamos un punto, hacemos
; sonar un pitido y ponemos otra moneda.
; ----------------------------------------------------------------------
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        CALL dibuja_puntaje ; borrar el puntaje viejo (XOR)...
        ADD VE, 1
        CALL dibuja_puntaje ; ...y dibujar el nuevo

        ; Sonido: pitido corto, o largo si el puntaje terminó en 0.
        ; LD B, VE (en dibuja_puntaje) dejó las unidades en bcd + 2.
        LD I, bcd + 2
        LD V0, [I]          ; V0 = unidades del puntaje
        LD V1, BIP_CORTO
        SNE V0, 0           ; ¿terminó en 0 (10, 20, 30...)?
        LD V1, BIP_LARGO
        LD ST, V1           ; suena mientras ST > 0; ST baja solo

        LD I, fantasma      ; dibuja_puntaje y LD V0, [I] cambiaron I
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET

; ----------------------------------------------------------------------
; Pone la moneda en un lugar al azar. Si cae encima del fantasmita
; (VF = 1 al dibujarla), la borra y prueba en otro lugar.
; Usa V0 y cambia I.
; ----------------------------------------------------------------------
nueva_moneda:
        RND V8, 0x3F        ; x al azar entre 0 y 63
        LD V0, MONEDA_XMAX
        SUB V0, V8          ; VF = 1 si no hubo préstamo, o sea si x <= 60
        SE VF, 1
        JP nueva_moneda     ; no entra en la pantalla: probar otra vez
        RND V9, 0x1F        ; y al azar entre 0 y 31
        LD V0, MONEDA_DY
        SUB V0, V9          ; VF = 1 si y <= 20
        SE VF, 1
        JP nueva_moneda
        ADD V9, YMIN        ; bajarla debajo del techo: y entre 8 y 28
        LD I, moneda
        DRW V8, V9, 4
        SE VF, 1            ; ¿no tocó nada? listo
        RET
        DRW V8, V9, 4       ; cayó sobre el fantasmita: borrarla
        JP nueva_moneda     ; y probar en otro lugar

; ----------------------------------------------------------------------
; Dibuja el puntaje (VE) en decimal en las columnas 1, 6 y 11 de la fila 0.
; DRW dibuja con XOR: llamarla dos veces con el mismo puntaje lo borra.
; Usa V0..V3 y cambia I.
; ----------------------------------------------------------------------
dibuja_puntaje:
        LD I, bcd
        LD B, VE            ; bcd = centenas, bcd+1 = decenas, bcd+2 = unidades
        LD V2, [I]          ; V0, V1, V2 = esos tres dígitos
        LD V3, 0            ; y = 0
        LD F, V0            ; I = glifo de las centenas...
        LD V0, 1            ; ...así que V0 queda libre para la x
        DRW V0, V3, 5
        LD F, V1
        LD V1, 6
        DRW V1, V3, 5
        LD F, V2
        LD V2, 11
        DRW V2, V3, 5
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
bcd:    DB 0, 0, 0          ; lugar para los tres dígitos de LD B, VE

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
moneda:
        DB %01100000    ; .##.
        DB %11110000    ; ####
        DB %11110000    ; ####
        DB %01100000    ; .##.
linea:
        DB %11111111    ; ########
```

</details>

### 5.7 Código que anda en cualquier intérprete

El Cazamonedas anda bien con los perfiles COSMAC VIP, SUPER-CHIP y XO-CHIP, desde
15 IPF para arriba (los tests lo juegan con los tres perfiles). No es casualidad:
sigue estas reglas.

| Regla | Por qué | Quirk que esquiva |
|---|---|---|
| Medí el tiempo con DT, nunca contando instrucciones. | Las IPF cambian de un intérprete a otro. | La velocidad (no es un quirk, pero es la diferencia más grande) |
| Contá los `DRW` de cada paso y dale tiempo de sobra. | En el VIP, cada `DRW` puede costar un frame entero. | `VBLANK` |
| Mirá VF justo después de la instrucción que lo pone; nunca después de `OR`, `AND` o `XOR`. | Algunos intérpretes ponen VF en 0 después de esas tres y otros no. | `VF=0` |
| Después de `LD [I], Vx` o `LD Vx, [I]`, volvé a cargar I. | Algunos intérpretes dejan I donde estaba y otros lo corren. | `MEM` |
| Si desplazás, usá `SHR Vx` / `SHL Vx` (X = Y). | Unos desplazan VX y otros VY; si son el mismo registro, da igual. | `SHIFT` |
| No uses `JP V0, NNN`. | Unos suman V0 y otros VX. | `BXNN` |
| Que los sprites no se salgan de la pantalla. | Unos recortan lo que sobra y otros lo hacen aparecer del otro lado. | `CLIP` |

"Anda bien" no quiere decir "anda idéntico". Con el perfil COSMAC VIP, el paso en que
agarrás una moneda tiene por lo menos 12 `DRW`: los dos de `mover` y, en `agarrar`,
sacar el fantasmita, borrar la moneda, borrar y volver a dibujar el puntaje (tres cada
vez), dibujar otra vez el fantasmita y poner la moneda nueva. Cada uno cuesta un frame,
así que a 15 IPF ese paso dura unos 13 frames en vez de 3, y el fantasmita se frena un
quinto de segundo. Con SUPER-CHIP o XO-CHIP dura 5 o 6 frames a 15 IPF, y casi siempre
3 desde 30. El juego es el mismo y se juega igual; solo cambia esa pausita. Es la regla
de contar los `DRW`, en vivo.

Los detalles de cada quirk, con ejemplos y una tabla comparativa, están en el
[manual, sección 11](MANUAL.md#11-quirks).

---

## 6. Leer un programa real

Leer programas ajenos es la mejor forma de aprender trucos. Los cartuchos incluidos
están escritos en el mismo ensamblador y muy comentados; sus fuentes están en `roms/`.
Vamos a recorrer `rebote.asm` entero y los mejores momentos de `atrapa.asm`.

### 6.1 Rebote, paso a paso

`roms/rebote.asm` tiene la misma forma que nuestro Cazamonedas: un encabezado con
comentarios, las constantes, la preparación, el bucle principal, las subrutinas y, al
final, los dibujos. Las primeras líneas (`; @name Rebote`, `; @description ...`, `;
@controls ...` y `; @order 1`) son etiquetas que lee `tools/embed-roms.js`: el nombre,
la descripción y los controles que muestra la consola en la tarjeta del cartucho y en su
cartel (en la pestaña *Cartuchos*) y en la línea *Controles:* de la ranura, y el lugar
que ocupa en la lista.

Las constantes:

```asm
; (fragmento de roms/rebote.asm)
TICK    EQU 2           ; cuadros por paso de animación
XMIN    EQU 0           ; límites de la esquina superior izquierda de la pelota
XMAX    EQU 56          ; 64 - 8
YMIN    EQU 9           ; justo debajo de la línea
YMAX    EQU 24          ; 32 - 8
BEEP    EQU 3           ; pitido de 3/60 s
```

La preparación: borra la pantalla, dibuja el título una sola vez y pone la pelota en
su lugar. Fijate que **I apunta a la pelota durante todo el bucle**: el título se dibuja
antes, así que después nadie más toca I.

```asm
; (fragmento de roms/rebote.asm)
inicio:
        CLS
        CALL titulo             ; dibuja "CHIP-8" y la línea (una sola vez)

        LD VA, 0xFE
        LD VB, BEEP
        LD V3, 1                ; empieza yendo hacia abajo a la derecha
        LD V4, 1
        LD V1, 20               ; posición actual
        LD V2, 14
        LD V5, 21               ; posición siguiente = actual + dirección
        LD V6, 15

        LD I, pelota            ; I apunta a la pelota durante todo el bucle
        DRW V1, V2, 8           ; primera aparición
```

El bucle principal:

```asm
; (fragmento de roms/rebote.asm)
bucle:
        LD V0, DT               ; esperar a que el temporizador llegue a 0
        SE V0, 0
        JP bucle
        LD V0, TICK             ; y volver a cargarlo para el próximo paso
        LD DT, V0

        LD V7, V5               ; calcular la posición de después
        ADD V7, V3
        LD V8, V6
        ADD V8, V4

        DRW V5, V6, 8           ; 1) dibujar la pelota en la posición nueva

        SNE V7, XMIN            ; ¿la próxima posición toca un borde?
        CALL rebota_x           ;   (SNE saltea el CALL si NO es igual)
        SNE V7, XMAX
        CALL rebota_x
        SNE V8, YMIN
        CALL rebota_y
        SNE V8, YMAX
        CALL rebota_y

        DRW V1, V2, 8           ; 2) borrar la pelota vieja (XOR la apaga)

        LD V1, V5               ; avanzar: actual <- siguiente <- después
        LD V2, V6
        LD V5, V7
        LD V6, V8
        JP bucle
```

- **El ritmo**, con DT, igual que en nuestra etapa C, pero con `TICK EQU 2`: 30 pasos
  por segundo, desde 15 IPF para arriba. (A 7 IPF las instrucciones de un paso no
  entran en 2 frames y la pelota va más despacio: unos 19 pasos por segundo con el
  COSMAC VIP.)
- **Tres posiciones.** V1, V2 es la posición que se ve; V5, V6 la que se dibuja en este
  paso; V7, V8 la del paso siguiente. Calcular un paso por adelantado permite decidir
  el rebote **antes** de llegar al borde.
- **`SNE` + `CALL`**: `SNE V7, XMIN` saltea el `CALL rebota_x` si la próxima x **no**
  es el borde. O sea: "si la próxima x es el borde, rebotá". Es el mismo "if" de una
  línea que usamos con `SKNP`.

**Primero dibuja, después borra.** Nosotros borramos el fantasmita y después lo
dibujamos en el lugar nuevo, así que en el medio queda un frame en el que no está.
Rebote hace al revés: dibuja la pelota en el lugar nuevo y recién después borra la
vieja. Pero ojo con el XOR. Las dos posiciones están a un píxel en diagonal y comparten
la mayoría de sus píxeles, y en esos el segundo dibujo **apaga** lo que había prendido
el primero. Entre los dos `DRW` no se ven dos pelotas, ni una entera: se ve una silueta
deformada, de 36 píxeles en vez de 44, sin cara. Este es el primer paso del programa,
con la pelota yendo de (20, 14) a (21, 15):

<!-- verificar: rebote-xor -->
```text
antes: la vieja    entre los dos DRW    después: la nueva
..####...          ..####...            .........
.######..          .##......            ...####..
##.##.##.          ###..#...            ..######.
########.          #..#..#.#            .##.##.##
#.####.#.          ##....#.#            .########
##....##.          #..###.##            .#.####.#
.######..          ...######            .##....##
..####...          ......##.            ..######.
.........          ...####..            ...####..
```

Igual es mejor que un frame vacío: siempre queda algo prendido donde está la pelota.
Cuánto se nota depende del perfil. Con el COSMAC VIP, cada `DRW` espera al frame
siguiente, así que la silueta queda en pantalla uno de cada dos frames y la pelota
"vibra" (la persistencia del modo Tubo CRT lo suaviza). Sin esa espera, los dos `DRW`
casi siempre caen en el mismo frame: a 15 IPF la silueta aparece en uno de cada cinco,
y desde 30 IPF no aparece nunca. La forma de no tener ningún frame intermedio es mover
el sprite con un solo `DRW`, como hace Atrapa (lo vas a ver en la
[sección 6.2](#62-lo-mejor-de-atrapa)); acá no alcanza, porque al moverse en diagonal
la pelota barre un cuadrado de 9 × 9, y esa diferencia no entra en un sprite de 8
píxeles de ancho.

El rebote:

```asm
; (fragmento de roms/rebote.asm)
; Invierte la dirección horizontal y hace sonar el pitido.
rebota_x:
        XOR V3, VA              ; 1 <-> 0xFF
        LD ST, VB
        RET

; Invierte la dirección vertical y hace sonar el pitido.
rebota_y:
        XOR V4, VA
        LD ST, VB
        RET
```

La dirección se guarda como `1` (avanza) o `0xFF` (que sumado es −1: retrocede). Para
darla vuelta sin preguntar cuál es, se hace XOR con `0xFE`, que VA tiene guardado desde
el principio: `0x01 XOR 0xFE = 0xFF` y `0xFF XOR 0xFE = 0x01`. Y `LD ST, VB` hace sonar
el pitido de 3 frames.

La línea debajo del título es un bucle como nuestro techo:

```asm
; (fragmento de roms/rebote.asm)
        LD I, linea             ; 8 tramos de 8 píxeles = 64 columnas
        LD V0, 0
        LD V1, 7
titulo_linea:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP titulo_linea
        RET
```

Y la pelota, con su carita:

```asm
; (fragmento de roms/rebote.asm)
pelota:                         ; una pelotita con cara
        DB %00111100            ;   ..####..
        DB %01111110            ;   .######.
        DB %11011011            ;   ##.##.##   ojos
        DB %11111111            ;   ########
        DB %10111101            ;   #.####.#   comisuras
        DB %11000011            ;   ##....##   sonrisa
        DB %01111110            ;   .######.
        DB %00111100            ;   ..####..
```

Para verlo funcionar por dentro, cargá *Rebote*, pasá la pantalla a **Píxeles puros**
(así cada frame se ve tal cual, sin estela), pausalo con Espacio y avanzá con **Frame**.
Con el perfil COSMAC VIP cada `DRW` termina el frame, así que cada Frame te lleva de un
`DRW` al siguiente: vas a ver alternarse la silueta y la pelota entera, como en el dibujo
de arriba, y en el monitor, V1, V2 y V5 a V8 cambiando cada dos Frames.

Con **Paso** solo, en cambio, no llegás lejos: después de unas pocas instrucciones
entrás al bucle de espera (`LD V0, DT` / `SE V0, 0` / `JP bucle`, de `0x218` a `0x21C`)
y, como Paso no hace correr el tiempo (sección [1.10](#110-controles-de-ejecución-y-atajos)),
DT no llega nunca a 0 y das vueltas ahí para siempre. Para ir de a una instrucción,
combiná los dos: avanzá con Paso y, cuando veas que el PC da vueltas entre `0x218` y
`0x21C`, apretá Frame (una o dos veces, hasta que DT llegue a 0) para que corra el
tiempo, y seguí con Paso.

### 6.2 Lo mejor de Atrapa

`roms/atrapa.asm` es un juego completo en 374 bytes. Tiene cinco ideas que vale la
pena robar.

**Mover un sprite con un solo `DRW`.** En lugar de borrar la paleta y volver a
dibujarla (dos `DRW`, y parpadeo en el medio), dibuja con XOR solo **la diferencia**
entre la posición vieja y la nueva:

```asm
; (fragmento de roms/atrapa.asm)
        ; --- la paleta ---
        SKNP VB                 ; tecla 7 apretada -> izquierda
        JP izquierda
        SKNP VC                 ; tecla 4 apretada -> izquierda
        JP izquierda
        SKNP VD                 ; tecla 9 apretada -> derecha
        JP derecha
        SKNP VE                 ; tecla 6 apretada -> derecha
        JP derecha
        JP bloque

izquierda:
        SNE V3, 0               ; ya está en el borde
        JP bloque
        ADD V3, -2
        LD I, paleta_delta      ; apaga 2 columnas a la derecha y prende 2 a la izquierda
        LD V0, PALETA_Y
        DRW V3, V0, 2
        JP bloque

derecha:
        SNE V3, PALETA_MAX
        JP bloque
        LD I, paleta_delta      ; apaga 2 columnas a la izquierda y prende 2 a la derecha
        LD V0, PALETA_Y
        DRW V3, V0, 2
        ADD V3, 2
```

```asm
; (fragmento de roms/atrapa.asm)
paleta:         DB %11111100, %11111100
paleta_delta:   DB %11000011, %11000011         ; diferencia al moverse 2 píxeles
bloque_sprite:  DB %11110000, %11110000, %11110000, %11110000
bloque_delta:   DB %11110000, 0, 0, 0, %11110000 ; diferencia al bajar 1 píxel
```

La paleta mide 6 píxeles (`%11111100`). Si se corre 2 a la izquierda, hay que prender
las 2 columnas nuevas de la izquierda y apagar las 2 de la derecha que quedan
descubiertas: dibujado en la x nueva, eso es `%11000011`. Con XOR, prender y apagar es
la misma operación, así que un solo `DRW` de `paleta_delta` mueve la paleta. El bloque
que cae hace lo mismo: `bloque_delta` apaga su fila de arriba y prende una abajo.

**Velocidad con decimales.** El bloque no baja un píxel por paso: baja "96/256 de
píxel". CHIP-8 no tiene decimales, pero tiene acarreo:

```asm
; (fragmento de roms/atrapa.asm)
        ; --- el bloque ---
bloque:
        ADD VA, V9              ; acumulador += velocidad
        SE VF, 1                ; ¿se pasó de 255? entonces baja
        JP toca
        LD I, bloque_delta      ; apaga su fila de arriba y prende la de abajo
        DRW V5, V6, 5
        ADD V6, 1

        ; --- ¿el bloque toca la paleta? ---
toca:
        LD V0, BLOQUE_ARRIBA - 1
        SUB V0, V6              ; VF = 1 si el bloque todavía está arriba (y < 26)
        SE VF, 0
        JP paso
        CALL mira_si_atrapa     ; si la atrapa, ya aparece el bloque siguiente
        SNE V6, BLOQUE_PISO     ; no la atrapó y llegó al piso: se escapó
        JP se_escapo
        JP paso
```

VA es un acumulador: en cada paso se le suma la velocidad (V9). Cuando la suma pasa de
255, `ADD VA, V9` deja VF = 1 y el bloque baja un píxel. Con V9 = 96, eso pasa 96 de
cada 256 pasos, y como cada punto le suma 4 a V9, el bloque cae cada vez más rápido.
(Ojo: esto anda con `ADD VX, VY`, que pone VF. `ADD VX, NN` no lo toca.)

**Comparar con restas.** Como en nuestra `nueva_moneda`, CHIP-8 no tiene "si es mayor
que": se resta y se mira el préstamo. En `toca`, `LD V0, BLOQUE_ARRIBA - 1` y
`SUB V0, V6` calculan `25 − y` y dejan VF = 1 si no hubo préstamo, o sea si el bloque
todavía está arriba (y < 26): entonces no hay nada que mirar y sigue el juego. Si ya
está en la zona de la paleta (y = 26, 27 o 28), hay que ver si se superponen en x, con
dos restas más:

```asm
; (fragmento de roms/atrapa.asm)
; ----------------------------------------------------------------------
; El bloque toca la paleta (y = 26, 27 o 28): ¿se superponen en x?
; Se atrapa si  bloque_x + 3 >= paleta_x  y  paleta_x + 5 >= bloque_x.
; ----------------------------------------------------------------------
mira_si_atrapa:
        LD V0, V5
        ADD V0, 3
        SUB V0, V3              ; VF = 1 si bloque_x + 3 >= paleta_x
        SE VF, 1
        RET
        LD V0, V3
        ADD V0, 5
        SUB V0, V5              ; VF = 1 si paleta_x + 5 >= bloque_x
        SE VF, 1
        RET
```

Fijate que `toca` se mira en **todos** los pasos, no solo cuando el bloque baja: si la
paleta llega de costado cuando el bloque ya está en la zona, también lo atrapa. Si se
los ve tocándose, cuenta. Y solo se pierde una vida si el bloque llega al piso (y = 28)
sin que lo hayas atrapado.

**Un tope para que sea justo.** Si la velocidad creciera para siempre, en algún momento
un bloque que aparece en una punta no daría tiempo a llegar con la paleta desde la otra.
Por eso, al sumar un punto, la velocidad sube pero sin pasarse de `VEL_MAXIMA` (otra
vez, una resta y el préstamo):

```asm
; (fragmento de roms/atrapa.asm)
        ADD V9, VEL_AUMENTO     ; acelerar...
        LD V0, VEL_MAXIMA
        SUB V0, V9              ; VF = 1 si VEL_MAXIMA >= velocidad
        SE VF, 1
        LD V9, VEL_MAXIMA       ; ...sin pasarse del tope
```

La cuenta está en el encabezado del archivo. El bloque aparece en y = 7 y baja 21 filas
hasta el piso; con la velocidad máxima, 160/256 de píxel por paso, eso le lleva
21 × 256 / 160 = 33,6, o sea **34 pasos**. La paleta avanza 2 píxeles por paso y, para
ir de una punta a la otra, necesita como mucho **28 pasos**. Así que cualquier bloque se
puede atrapar, aparezca donde aparezca, y sobran 6 pasos para reaccionar. Diseñar un
juego también es hacer estas cuentas.

**Esperar una tecla para volver a empezar.** Al perder, muestra "FIN", espera un
segundo con DT (para que una tecla que venías apretando no reinicie el juego sin
querer) y después usa `LD V0, K`, que detiene todo hasta que apretás **y soltás** una
tecla. Mientras espera, el monitor dice *Esperando tecla*.

```asm
; (fragmento de roms/atrapa.asm)
fin_del_juego:
        CLS
        CALL dibuja_puntaje
        LD V1, 11
        LD V0, 20
        LD I, grande_f
        DRW V0, V1, 10
        LD V0, 30
        LD I, grande_i
        DRW V0, V1, 10
        LD V0, 38
        LD I, grande_n
        DRW V0, V1, 10
        LD V0, 60               ; un segundo de pausa antes de aceptar teclas
        CALL espera
        LD V0, K                ; esperar que aprieten y suelten una tecla
        JP inicio
```

---

## 7. Depurar

Todo programa tiene errores. El monitor de la consola te deja mirar la máquina por
dentro, instrucción por instrucción, hasta encontrarlos.

### 7.1 El método

1. **Describí el síntoma con precisión.** No "anda mal", sino "muestra el 0, después el
   1, y se queda en el 1".
2. **Pensá qué debería pasar**: qué valor debería tener cada registro en cada momento.
   El listado del ensamblador (`--listing`) te dice en qué dirección está cada línea.
3. **Llevá la máquina hasta ahí.** Pausá (Espacio), reiniciá (Retroceso: sigue en
   pausa) y avanzá con **Paso** (N) de a una instrucción, o con **Frame** de a un frame.
   Si el lugar que te interesa está lejos, poné un **punto de corte**: elegí la línea en
   el DESENSAMBLADO (con un clic, o escribiendo su dirección en **Ir a**) y tocá
   **Punto de corte**, o tocá el margen de la línea. Cuando el programa llega ahí, la
   máquina queda en pausa justo antes de ejecutarla. Con un `CALL` en el PC, **Por
   encima** (O) ejecuta la subrutina entera de una vez; adentro de una subrutina,
   **Salir** (K) corre hasta que vuelve. Si te pasaste, **B** vuelve atrás de a un frame
   (sección 7.4).
4. **Compará** lo que esperabas con lo que muestra el monitor. Los registros que
   cambian se resaltan: con Paso, ves exactamente qué tocó cada instrucción.

Acordate de que **Paso no hace correr el tiempo**: DT y ST solo bajan con Frame o
cuando la máquina corre. Un bucle que espera a DT, avanzado con Paso, no termina nunca.

### 7.2 Un contador que se traba

Este programa debería mostrar los dígitos del 0 al 9, uno cada medio segundo, y
quedarse en el 9:

```asm
; 09-contador-con-bug.asm — tiene un error a propósito (ver la parte 7)
;
; Tendría que mostrar los dígitos del 0 al 9 en el centro de la pantalla,
; uno cada medio segundo, y quedarse en el 9. Pero no hace eso...
;
; Registros:
;   V0      el dígito que toca mostrar
;   V1, V2  posición del dígito (x, y)
;   V3      cuántos cuadros esperar (parámetro de "esperar")

        CLS
        LD V0, 0            ; empezamos por el 0
        LD V1, 30           ; x
        LD V2, 13           ; y
proximo:
        LD F, V0            ; I = glifo del dígito V0
        DRW V1, V2, 5       ; mostrarlo
        LD V3, 30           ; esperar 30 cuadros = medio segundo
        CALL esperar
        SNE V0, 9           ; ¿era el 9? terminamos
        JP fin
        DRW V1, V2, 5       ; borrarlo (I sigue apuntando al mismo glifo)
        ADD V0, 1           ; el dígito siguiente
        JP proximo
fin:    JP fin

; Espera V3 cuadros usando el temporizador de retardo.
esperar:
        LD DT, V3
esperar_bucle:
        LD V0, DT
        SE V0, 0
        JP esperar_bucle
        RET
```

Cargá `docs/ejemplos/09-contador-con-bug.ch8`. **Síntoma**: muestra el 0, después el
1... y se queda en el 1, que parpadea cada medio segundo. Nunca llega al 2.

Vamos a buscarlo. Primero, las direcciones: `proximo` está en `0x208`, el `CALL` en
`0x20E`, `esperar` en `0x21C` y `esperar_bucle` en `0x21E` (el listado o el
DESENSAMBLADO te las dan). Pausá, reiniciá y avanzá con Paso:

| Pasos | Última instrucción | Qué muestra el monitor |
|---|---|---|
| 1 a 7 | de `CLS` a `LD V3, 0x1E` | El 0 está en pantalla. V0 = `00` (el contador), V1 = `1E`, V2 = `0D`, V3 = `1E`, `I = 0x050`. El PC está en `0x20E`: lo que sigue es `CALL 0x21C`. |
| 8 | `CALL 0x21C` | `PC = 0x21C`, `SP = 1` y en la PILA, `0x210`: la dirección de la instrucción que sigue al `CALL`, adonde va a volver el `RET`. |
| 9 | `LD DT, V3` | `DT = 30` (DT se muestra en decimal; `1E` es 30). |
| 10 | `LD V0, DT` | **V0 = `1E`**. |

¡Ahí está! V0 era el contador, y la subrutina `esperar` lo usa para leer el
temporizador. Cuando DT llegue a 0, V0 también va a valer 0: el `RET` vuelve a `0x210`
con el contador en 0, el programa le suma 1 y muestra... otra vez el 1. Y así para
siempre.

No hace falta esperar a que termine la espera para darse cuenta, pero si querés verlo,
fijate que con más Pasos DT sigue en 30 (el tiempo no corre); con **Frame** baja de a
uno, y V0 lo sigue.

**Con un punto de corte llegás más rápido**, sin reiniciar. Con el programa corriendo,
escribí `20E` en **Ir a**, debajo del DESENSAMBLADO, apretá Enter y tocá **Punto de
corte**. En menos de medio segundo el programa vuelve a llegar al `CALL` y la máquina se
detiene antes de ejecutarlo: la insignia del monitor dice PUNTO DE CORTE (y un lector de
pantalla anuncia *Punto de corte en 0x20E («CALL 0x21C»): en pausa, antes de
ejecutarla.*). El contador vale lo que se ve en pantalla: V0 = `01`. Ahora apretá **O**:
la subrutina corre entera, medio segundo, y la máquina se detiene en `0x210`, la
instrucción que sigue al `CALL`, con **V0 = `00`**. La subrutina se llevó el contador.
Para ver dónde, sacá ese punto de corte (con la × de la lista PUNTOS DE CORTE), poné
otro en `0x21E`, el `LD V0, DT`, y seguí con Espacio: cuando se detiene ahí, un Paso, y
V0 pasa de `01` a `1E`.

**El arreglo** es usar en la subrutina un registro que no le importe a nadie. El
parámetro V3 sirve: `esperar` lo recibe y ya no lo necesita. Solo cambian dos
instrucciones:

```asm
; (fragmento de docs/ejemplos/10-contador.asm)
; Espera V3 cuadros usando el temporizador de retardo.
; Solo usa V3: no toca ningún otro registro.
esperar:
        LD DT, V3
esperar_bucle:
        LD V3, DT           ; antes decía LD V0, DT y pisaba el contador
        SE V3, 0
        JP esperar_bucle
        RET
```

Cargá `docs/ejemplos/10-contador.ch8`: ahora cuenta del 0 al 9 en unos cinco segundos
y se queda en el 9.

<details>
<summary>Listado completo de <code>10-contador.asm</code></summary>

```asm
; 10-contador.asm — el contador de la parte 7, ya arreglado
;
; Muestra los dígitos del 0 al 9 en el centro de la pantalla, uno cada
; medio segundo, y se queda en el 9.
;
; Registros:
;   V0      el dígito que toca mostrar
;   V1, V2  posición del dígito (x, y)
;   V3      cuántos cuadros esperar (parámetro de "esperar")

        CLS
        LD V0, 0            ; empezamos por el 0
        LD V1, 30           ; x
        LD V2, 13           ; y
proximo:
        LD F, V0            ; I = glifo del dígito V0
        DRW V1, V2, 5       ; mostrarlo
        LD V3, 30           ; esperar 30 cuadros = medio segundo
        CALL esperar
        SNE V0, 9           ; ¿era el 9? terminamos
        JP fin
        DRW V1, V2, 5       ; borrarlo (I sigue apuntando al mismo glifo)
        ADD V0, 1           ; el dígito siguiente
        JP proximo
fin:    JP fin

; Espera V3 cuadros usando el temporizador de retardo.
; Solo usa V3: no toca ningún otro registro.
esperar:
        LD DT, V3
esperar_bucle:
        LD V3, DT           ; antes decía LD V0, DT y pisaba el contador
        SE V3, 0
        JP esperar_bucle
        RET
```

</details>

La lección: **cada subrutina tiene que decir qué registros usa** (como el "Usa V0 y
cambia I" de las subrutinas del Cazamonedas), y quien la llama no puede guardar nada
ahí. Es el error más común en ensamblador, en CHIP-8 y en cualquier otra máquina.

### 7.3 Cuando la máquina se detiene

Este programa es la etapa A del Cazamonedas sin la última línea:

```asm
; 11-sin-fin.asm — un programa al que le falta el final (ver la parte 7)
;
; Es la etapa A del Cazamonedas (03-fantasma.asm) sin la última
; instrucción, "fin: JP fin". Después de dibujar el fantasmita, la CPU
; sigue de largo y empieza a ejecutar los bytes del sprite como si fueran
; instrucciones.

        CLS
        LD V4, 29       ; x = (64 - 6) / 2
        LD V5, 13       ; y = (32 - 6) / 2
        LD I, fantasma  ; I apunta a los 6 bytes del sprite
        DRW V4, V5, 6   ; dibujar 6 filas

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
```

Cargá `docs/ejemplos/11-sin-fin.ch8`. El fantasmita aparece y, un par de segundos
después, la consola se detiene: la luz RUN se pone roja y la pantalla dice

```text
ERROR
Instrucción inválida o desconocida (opcode 0xF090 en la dirección 0x050).
Presioná Reiniciar (Retroceso) para volver a empezar.
```

El monitor muestra `PC = 0x050` y que se ejecutaron **1457 instrucciones** (el monitor
lo escribe `1.457`). ¿Qué hace el PC en `0x050`, que es la fuente?

Una primera pista está en la pestaña **Traza** (o en **Ver las últimas instrucciones**,
debajo del error, en el monitor). La última fila, en rojo, es la culpable: `DW 0xF090`, en
`0x050`. Arriba hay cientos de `SYS 0x000` en direcciones que suben de a 2 y dan la vuelta
después de `0xFFE`: la CPU venía recorriendo memoria vacía. La traza guarda las últimas
1024 instrucciones, y esta vez no alcanzan para ver de dónde vino: la más vieja es la de
`0x852`, en medio del paseo.

Para verlo desde el principio hay que reiniciar y quedar en pausa. Como la máquina
estaba corriendo cuando se detuvo, Reiniciar la pone a correr otra vez (sección
[1.10](#110-controles-de-ejecución-y-atajos)), así que son tres teclas:

1. **Retroceso**: reinicia y arranca.
2. **Espacio**, enseguida: la pausa. Tenés un segundo y medio antes de que vuelva a
   detenerse; si no llegaste, empezá de nuevo desde el paso 1.
3. **Retroceso** otra vez: como ahora estaba en pausa, queda en pausa en `0x200`: la
   pantalla dice PAUSA y el monitor, PC = `0x200` (un lector de pantalla anuncia
   *Reiniciado (en pausa).*).

(Con el rebobinado hay un camino más corto, y sin apuro: lo vas a ver en la sección 7.4.)

Ahora avanzá con Paso (N):

1. Las 5 primeras instrucciones dibujan el fantasmita. El PC queda en `0x20A`... que
   es donde empieza el dibujo.
2. El DESENSAMBLADO sabe que esos bytes son el dibujo (el `DRW` los acaba de leer) y los
   muestra como datos, `DB 0x78, 0xFC`, con la flechita del PC encima. La CPU, en cambio,
   no sabe nada de eso. Paso: `78 FC` se ejecuta como `ADD V8, 0xFC` (V8 = `FC`, y la
   fila pasa a decir eso). Paso: `B4 FC` es `JP V0, 0x4FC`, y como V0 vale 0, el PC salta
   a `0x4FC`.
3. De `0x4FC` en adelante la memoria está vacía. `0000` es `SYS 0x000`, que se ignora,
   así que la CPU avanza por 1410 instrucciones que no hacen nada hasta `0xFFE`, da la
   vuelta a `0x000`, sigue por los ceros y en `0x050` encuentra la fuente.
4. Los primeros bytes de la fuente, `F0 90`, no son ninguna instrucción (no existe
   `FX90`), y la máquina se detiene.

Dos lecciones. La primera: **el error casi nunca aparece donde está el problema**. La
máquina se detuvo en la fuente, pero el problema era una línea que faltaba 1400
instrucciones antes. La segunda: todo programa termina en `fin: JP fin` (o en un bucle
que no se termina), y los datos van donde la CPU nunca llega.

Y un dato curioso: con los otros perfiles pasan otras cosas. Con **SUPER-CHIP**, el
quirk `BXNN` hace que el `JP V0, 0x4FC` sume V4 (que vale 29) en lugar de V0, y salte a
`0x519`, una dirección **impar**. (Con ese perfil, cuando la CPU ejecuta esos bytes, el
DESENSAMBLADO los muestra como `JP V4, 0x4FC`.) La CPU recorre la memoria desalineada, da la
vuelta, ejecuta como código unos bytes de la fuente chica (uno de ellos resulta ser un
`CALL`) y cae en la fuente grande, que SUPER-CHIP guarda a partir de `0x0A0`. Ahí se
detiene, casi al mismo tiempo que con el VIP:

```text
Instrucción inválida o desconocida (opcode 0xFFC3 en la dirección 0x10A).
```

Con **XO-CHIP**, el salto va a `0x4FC` como con el VIP, pero la memoria es de 64 KB, 16
veces más grande: el paseo por los ceros es mucho más largo, y la máquina tarda más de
medio minuto (a 15 IPF) en dar la vuelta y detenerse en la misma fuente, ahora con la
dirección en 4 dígitos:

```text
Instrucción inválida o desconocida (opcode 0xF090 en la dirección 0x0050).
```

El mismo error de programación, tres síntomas distintos según el intérprete.

### 7.4 Volver atrás con B

El rebobinado de la [sección 1.13](#113-estados-guardados-y-rebobinado) también sirve para
depurar: te deja volver a justo antes de un error y mirarlo con Paso, sin empezar de nuevo.
Probalo con `11-sin-fin.ch8`, con el perfil COSMAC VIP y 15 IPF: cargalo y esperá a que se
detenga con el error de la fuente. Entonces:

1. **Tocá B una vez** (apretala y soltala enseguida). La máquina vuelve **un frame**, al
   momento en que empezó el frame del error, y queda en pausa: el cartel de error se va
   y el monitor muestra el PC en `0x038` (un lector de pantalla anuncia *Rebobinado:
   volviste 1 frame atrás (en pausa, PC = 0x038).*).
2. **Avanzá con Paso (N).** El PC sube de a 2 por los ceros (`SYS 0x000`): `0x03A`,
   `0x03C`... A los 12 Pasos llega a `0x050`, y el DESENSAMBLADO marca ahí la instrucción
   que no existe, `DW 0xF090`. Un Paso más y la máquina se detiene con el mismo error de
   antes.
3. **Mantené B.** La máquina vuelve dos frames por cada frame real, y en poco más de un
   segundo llega al momento más viejo que guardó la consola, que en este programa es el
   principio, con el PC en `0x200` (el anuncio dice *Rebobinado: volviste 1,6 s atrás
   (en pausa, PC = 0x200).*). Desde ahí, con Paso, podés hacer el recorrido de la
   sección 7.3 sin las tres teclas del principio.

Fijate en el paso 1: la máquina no volvió una instrucción sino un frame entero, las 12
instrucciones que había ejecutado en ese frame antes de chocar. El rebobinado guarda una
foto por frame, no por instrucción. Si avanzás con Paso y te pasaste, un toque de B te
devuelve al principio de ese frame.

### 7.5 Los errores que detienen la máquina

La máquina se detiene en tres casos, y el mensaje siempre dice la instrucción y su
dirección. Probalos con estos programitas de una línea:

<!-- verificar: detiene -->
```asm
; Un RET sin CALL
        RET
```

```text
Subdesbordamiento de pila (stack underflow): RET sin dirección de retorno, la pila está vacía (opcode 0x00EE en la dirección 0x200).
```

Pasa cuando se llega a una subrutina con `JP` en lugar de `CALL`, o cuando el programa
"se cae" adentro de una subrutina.

<!-- verificar: detiene -->
```asm
; Una subrutina que se llama a sí misma, sin fin
rutina: CALL rutina
```

```text
Desbordamiento de pila (stack overflow): CALL con los 16 niveles de la pila ocupados (opcode 0x2200 en la dirección 0x200).
```

Pasa cuando se usa `CALL` para volver al principio de un bucle (se necesitaba `JP`),
o cuando una subrutina sale con `JP` en lugar de `RET`: cada vuelta deja una dirección
más en la pila, hasta llenar los 16 lugares.

El tercero, *instrucción inválida*, ya lo viste: casi siempre es la CPU ejecutando
datos.

### 7.6 Lista de errores comunes

- **`SKP` por `SKNP`, `SE` por `SNE`.** Todas "saltean la siguiente": pensá siempre en
  qué caso se **ejecuta** la línea de abajo.
- **I apunta a otra cosa.** Antes de cada `DRW`, `LD I, ...`. Si dibujás basura o un
  número de la fuente, poné un punto de corte en el `DRW` y mirá I en el monitor: la
  pestaña **Sprites** dibuja lo que hay ahí tal como lo va a dibujar el `DRW`.
- **VF leído tarde.** VF lo pisan `DRW`, `ADD VX, VY`, las restas, los
  desplazamientos y (con el perfil COSMAC VIP) `OR`, `AND` y `XOR`. Leelo en la
  instrucción siguiente.
- **`ADD VX, NN` no avisa.** Si necesitás saber si una suma pasó de 255, usá
  `ADD VX, VY`, que sí pone VF.
- **Un registro pisado.** Una subrutina que usa un registro tuyo, o un `LD Vx, [I]`
  que carga desde V0 hasta Vx.
- **Falta el final.** Sin `fin: JP fin`, la CPU sigue de largo y ejecuta tus datos.
- **El tiempo depende de la velocidad.** Si el programa va más rápido o más lento al
  cambiar las IPF, medí el tiempo con DT.

---

## 8. Cómo funciona un emulador por dentro

Un emulador es un programa que imita a otra máquina: guarda el estado de esa máquina
en variables y ejecuta sus instrucciones de a una, haciendo con cada una lo mismo que
haría el original. CHIP-8 es el ejemplo clásico para aprender a escribir uno porque es
chiquito: 35 instrucciones, 4 KB de memoria, una pantalla de 64 × 32.

Para verlo sin distracciones, en `docs/ejemplos/mini-emulador.js` hay un emulador
completo de menos de 200 líneas. Implementa las 35 instrucciones con el comportamiento
del COSMAC VIP, pero sin opciones de quirks, sin la espera del vblank, sin controlar
errores y con un `LD Vx, K` simplificado; y en lugar de dibujar en el navegador,
imprime la pantalla como texto. Los tests del proyecto lo corren al lado del núcleo de
verdad con todos los ejemplos del tutorial y comprueban que, frame a frame, los dos
terminan con la misma pantalla, los mismos registros y el mismo PC.

### 8.1 El estado

Toda la máquina entra en un puñado de variables:

```js
// (fragmento de docs/ejemplos/mini-emulador.js)
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
```

`Uint8Array` es un arreglo de bytes: cada elemento guarda un número de 0 a 255 y, si le
asignás algo más grande, se queda con los 8 bits de abajo. Es justo cómo se comportan
los registros de CHIP-8, así que las cuentas "dan la vuelta" solas.

Que toda la máquina entre en unas pocas variables tiene otra ventaja: guardar la partida
es copiarlas. Eso hacen los estados guardados y el rebobinado de la consola
([sección 1.13](#113-estados-guardados-y-rebobinado)): una copia de la memoria, los
registros, la pila, los timers y la pantalla (y, en el núcleo de verdad, de lo que
agregan SUPER-CHIP y XO-CHIP). No hace falta copiar las teclas, que son de quien juega,
ni la ROM: el programa ya está en la memoria.

### 8.2 Buscar, decodificar, ejecutar

El corazón de cualquier emulador (y de cualquier CPU) es este ciclo:

```js
// (fragmento de docs/ejemplos/mini-emulador.js)
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
```

1. **Buscar** (*fetch*): leer los dos bytes que hay en el PC y juntarlos en un número de
   16 bits. El PC avanza 2 **antes** de ejecutar: por eso "saltear la siguiente" es
   sumarle 2 más, y por eso `CALL` guarda un PC que ya apunta a la instrucción de
   después.
2. **Decodificar** (*decode*): separar los campos con desplazamientos y máscaras. `x`,
   `y`, `n`, `nn` y `nnn` son los mismos X, Y, N, NN y NNN de la
   [sección 2.8](#28-cómo-se-lee-una-instrucción).
3. **Ejecutar** (*execute*): un `switch` sobre el primer nibble, y adentro de cada caso,
   lo que haga falta.

### 8.3 La aritmética y VF

```js
// (fragmento de docs/ejemplos/mini-emulador.js)
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
```

Dos detalles que los emuladores suelen hacer mal: las banderas se calculan con los
valores **originales** (`vx` y `vy` se leen antes de escribir nada), y VF se escribe
**al final**. Así, `SUB VF, V1` deja en VF la bandera y no la resta, como en el VIP.

### 8.4 Dibujar con XOR

```js
// (fragmento de docs/ejemplos/mini-emulador.js)
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
```

La pantalla es un arreglo de 64 × 32 bytes, fila por fila: el píxel (x, y) está en la
posición `y * 64 + x`. Para cada bit en 1 del sprite, el píxel se invierte (`^= 1`), y
si estaba prendido, hubo choque. `0x80 >> col` es la máscara del bit de la columna
`col`, empezando por el más alto.

### 8.5 El tiempo

```js
// (fragmento de docs/ejemplos/mini-emulador.js)
  // Un cuadro de 60 Hz: unas cuantas instrucciones y un tic de cada timer.
  runFrame(ipf = 15) {
    for (let i = 0; i < ipf; i++) this.step();
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;  // mientras sea > 0, suena el beep
  }
```

Esa es toda la idea de "instrucciones por frame": en cada 1/60 de segundo, unas cuantas
instrucciones y un tic de cada timer. El núcleo de la consola hace lo mismo, con los
dos detalles que le faltan al mini emulador: corta el frame si el programa queda
esperando una tecla y, con el quirk `VBLANK`, justo después de un `DRW`:

```js
// (fragmento de chip8.html)
  /*
   * Un frame de 60 Hz: hasta `ipf` instrucciones y después un tic de los timers.
   * Corta antes si la máquina se detiene, si queda esperando una tecla o, con
   * displayWait, justo después de un DXYN (el VIP esperaba el vblank para dibujar).
   */
  Chip8.prototype.runFrame = function (ipf) {
    // ...
    if (this.halted) return 0;
    var executed = 0;
    for (var i = 0; i < ipf; i++) {
      if (!this.step()) break;
      executed++;
      if (this.waitingForKey || (this._drew && this.quirks.displayWait)) break;
    }
    this.tickTimers();
    return executed;
  };
```

(El `// ...` del principio esconde unas líneas del depurador: con puntos de corte puestos,
o mientras corre un **Por encima**, el frame lo corre otra función, que además mira cada
dirección antes de ejecutarla. Sin eso, el frame es exactamente esto.)

¿Y quién llama a `runFrame` 60 veces por segundo? En la consola, el bucle de la
interfaz usa `requestAnimationFrame`, que el navegador llama en cada refresco del
monitor (60 veces por segundo en la mayoría, más en algunos). En cada llamada mide
cuánto tiempo pasó y ejecuta tantos frames de 1/60 de segundo como correspondan. Así el
programa corre a la misma velocidad en un monitor de 60 Hz que en uno de 144 Hz. Si un
refresco llega tarde, se pone al día, pero como mucho con 4 frames seguidos: si la
computadora no da abasto, es mejor que el programa vaya un poco más lento a que la
página se trabe tratando de alcanzarlo. Y si pasó mucho tiempo (más de un cuarto de
segundo, por ejemplo porque la pestaña estuvo oculta), directamente descarta el atraso
y sigue desde ahí.

### 8.6 El teclado

En el mini emulador, el teclado es un arreglo de 16 posiciones: la interfaz pone un 1
mientras la tecla está apretada, y `SKP`/`SKNP` lo miran. `LD Vx, K` es más delicado.
El mini emulador lo simplifica ("si hay alguna tecla apretada, esa es"), pero el
COSMAC VIP esperaba a que apretaras **y soltaras** una tecla. El núcleo de la consola lo
hace así:

```js
// (fragmento de chip8.html)
  /*
   * FX0A en el COSMAC VIP: espera a que una tecla se presione y SE SUELTE.
   * Solo cuenta una transición suelta -> presionada ocurrida después de empezar la
   * espera (una tecla que ya estaba apretada tiene que soltarse y volver a apretarse).
   * El valor se escribe en VX recién cuando se suelta esa misma tecla.
   */
  Chip8.prototype.setKey = function (key, pressed) {
    key &= 0xF;
    var was = this.keys[key] !== 0;
    var now = !!pressed;
    this.keys[key] = now ? 1 : 0;
    if (!this.waitingForKey || was === now) return;
    if (now) {
      if (this._waitKey < 0) this._waitKey = key;
    } else if (key === this._waitKey) {
      this.V[this._waitReg] = key;
      this.waitingForKey = false;
      this._waitKey = -1;
    }
  };
```

`FX0A` no espera adentro de un bucle (eso congelaría el navegador): pone
`waitingForKey = true` y deja que el tiempo siga pasando. Mientras tanto, `step()` no
hace nada. Cuando la interfaz avisa que se soltó la tecla que se había apretado,
`setKey` guarda su número en VX y la máquina sigue.

### 8.7 El sonido

El mini emulador no suena: solo baja el temporizador. En la consola, la interfaz usa Web
Audio: con el primer clic o la primera tecla crea un oscilador de **onda cuadrada de
440 Hz** que queda sonando siempre, conectado a un control de volumen que está en 0. En
cada frame, si la máquina está corriendo y ST vale más de 0, sube ese volumen; si no,
lo baja. Así el beep empieza y termina justo con el temporizador, sin clics.

### 8.8 Probalo

El mini emulador corre desde la terminal: le pasás un `.ch8` y cuántos frames
correrlo (120 si no le decís nada), y te muestra cómo quedó la pantalla:

```sh
node docs/ejemplos/mini-emulador.js docs/ejemplos/01-a-mano.ch8 10
```

<!-- salida (fragmento): node docs/ejemplos/mini-emulador.js docs/ejemplos/01-a-mano.ch8 10 -->
```text
................................................................
................................................................
..............................####..............................
..............................#..#..............................
..............................####..............................
..............................#..#..............................
..............................#..#..............................
................................................................
```

(Son 32 filas de 64 caracteres; acá se ven las del medio.) Probá con los otros
ejemplos, con los cartuchos de CHIP-8 de `roms/` (el mini emulador no sabe nada de
SUPER-CHIP ni de XO-CHIP, así que *Planos* no le sirve), o con tus propios programas. Si le pasás
`docs/ejemplos/11-sin-fin.ch8`, fijate que no se detiene: el mini emulador no controla
errores y sigue ejecutando lo que venga.

Leé el archivo entero: con lo que viste en este tutorial, lo vas a entender línea por
línea. Y en la [parte 10](#10-ejercicios-y-próximos-pasos) hay ideas para mejorarlo.

### 8.9 Cómo está organizado `chip8.html`

La consola es un único archivo HTML, sin dependencias, que funciona abierto
directamente desde el disco. Adentro tiene siete partes:

| Bloque | Qué tiene |
|---|---|
| `<style id="chip8-style">` | Todo el aspecto de la consola. |
| El HTML del `<body>` | La consola, el cajón de opciones (con los cartuchos), el Taller, el monitor, la ayuda y las ventanas del archivo y de los estados. |
| `<script id="chip8-core">` | El núcleo del emulador: la clase `Chip8` con sus tres plataformas, los quirks, las dos fuentes, el desensamblador, la huella SHA-1 de las ROMs, los estados guardados (como objeto y como texto), el buffer del rebobinado y lo que usa el depurador (la traza, el mapa de la memoria y los puntos de corte). No toca la página, así que también corre en Node. |
| `<script id="chip8-asm">` | El ensamblador, el mismo que usa `tools/chip8asm.js`. También es código puro. |
| `<script id="chip8-roms">` | Los cartuchos incluidos y los fuentes que trae el Taller (los de los cartuchos y los ejemplos de este tutorial). Lo genera `tools/embed-roms.js` a partir de `roms/*.asm` y `docs/ejemplos/*.asm`: no se edita a mano. |
| `<script id="chip8-archive">` | La tabla del archivo de la comunidad (los ajustes de cada juego conocido, por su huella) y las ROMs de sus juegos, comprimidas. Lo genera `tools/archive.js` a partir de `data/archive.json` y `roms/archivo/`: tampoco se edita a mano. |
| `<script id="chip8-ui">` | La interfaz: pantalla, keypad, controles, monitor y depurador, sonido, los ajustes por cartucho, tus cartuchos, la ventana del archivo, las ranuras de estados y sus archivos, el rebobinado, el Taller y el bucle principal. |

Alrededor están las herramientas (`tools/chip8asm.js`, el ensamblador en la terminal;
`tools/embed-roms.js`, que ensambla las demos y las incrusta; `tools/archive.js`, que
arma la tabla del archivo y le suma las ROMs; `tools/serve.js`, el servidor local;
`tools/e2e.js`, las pruebas en un navegador de verdad) y los tests, que se corren con
`node --test` desde la raíz. Los tests sacan los bloques de `chip8.html` y los ejecutan
en Node, así que prueban exactamente el código que corre en tu navegador.

La arquitectura completa, las decisiones de diseño y cómo se verificó cada parte están
en [DESARROLLO.md](DESARROLLO.md).

---

## 9. Más allá de CHIP-8: SUPER-CHIP y XO-CHIP

CHIP-8 tuvo descendientes, y dos de ellos están en la consola como plataformas
([sección 1.6](#16-plataformas-perfiles-y-quirks)): **SUPER-CHIP**, que Erik Bryntse
escribió en 1991 para las calculadoras HP-48, y **XO-CHIP**, la extensión que John
Earnest inventó para Octo y que usan casi todos los juegos de hoy. Todo lo que
aprendiste sigue valiendo: las mismas 35 instrucciones, los mismos registros, el mismo
XOR. Lo nuevo son 17 instrucciones más, y la mejor forma de conocerlas es leer un
programa que usa la mayoría: el sexto cartucho, *Planos* (`roms/planos.asm`).

### 9.1 Dos máquinas más

Este es el machete de lo nuevo, con los mismos nombres que usan el ensamblador y el
monitor. XO-CHIP tiene, además, todas las de SUPER-CHIP:

<!-- verificar: tabla-extendida -->
| Opcode | Instrucción | Plataforma | Qué hace |
|---|---|---|---|
| `00CN` | `SCD N` | SUPER-CHIP | Baja la imagen N píxeles. |
| `00FB` | `SCR` | SUPER-CHIP | Corre la imagen 4 píxeles a la derecha. |
| `00FC` | `SCL` | SUPER-CHIP | Corre la imagen 4 píxeles a la izquierda. |
| `00FD` | `EXIT` | SUPER-CHIP | Termina el programa. |
| `00FE` | `LOW` | SUPER-CHIP | Pasa a baja resolución, 64 × 32 (y borra la pantalla). |
| `00FF` | `HIGH` | SUPER-CHIP | Pasa a alta resolución, 128 × 64 (y borra la pantalla). |
| `DXY0` | `DRW VX, VY, 0` | SUPER-CHIP | Dibuja un sprite de 16 × 16: 16 filas de 2 bytes. |
| `FX30` | `LD HF, VX` | SUPER-CHIP | I = dirección del dígito VX de la fuente grande, de 8 × 10. |
| `FX75` | `LD R, VX` | SUPER-CHIP | Guarda V0..VX en las banderas, fuera de la memoria. |
| `FX85` | `LD VX, R` | SUPER-CHIP | Carga V0..VX desde las banderas. |
| `00DN` | `SCU N` | XO-CHIP | Sube la imagen N píxeles. |
| `5XY2` | `SAVE VX, VY` | XO-CHIP | Guarda VX..VY en la memoria, desde I, sin cambiar I. |
| `5XY3` | `LOAD VX, VY` | XO-CHIP | Carga VX..VY desde la memoria, desde I, sin cambiar I. |
| `F000 NNNN` | `LD I, LONG NNNN` | XO-CHIP | I = NNNN, una dirección de 16 bits. Es la única instrucción de 4 bytes. |
| `FN01` | `PLANE N` | XO-CHIP | Elige en qué planos actúan `DRW`, `CLS` y los desplazamientos. |
| `F002` | `AUDIO` | XO-CHIP | Copia 16 bytes, desde I, al patrón de sonido. |
| `FX3A` | `PITCH VX` | XO-CHIP | El tono del sonido = VX. |

Las fichas completas, con cada caso borde y las diferencias con los intérpretes
originales, están en el
[manual, sección 13.11](MANUAL.md#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip).

Para ver *Planos*, tocá su tarjeta en la pestaña **Cartuchos** del cajón de opciones. La
consola pasa sola a la plataforma XO-CHIP: la placa de abajo de la consola dice *MODELO
XO-CHIP · 64 KB RAM · 128×64*, y el monitor, en MÁQUINA, *XO-CHIP · 128×64 · plano 1*
(el plano donde está dibujando). Los quirks no cambian: *Planos* anda igual con
cualquier perfil.

### 9.2 El plan de Planos

Como Rebote, `roms/planos.asm` empieza con un encabezado largo que explica todo. En la
pantalla hay un título, PLANOS, y un contador de rebotes con números grandes; abajo, un
disco que rebota; y por toda la pantalla, un rombo que rebota y pasa por encima del
título sin borrarlo. Donde el disco y el rombo se pisan aparece un cuarto color. Cada
pared suena con su nota, y mientras apretás W (la tecla 5) el rombo se queda quieto.

El ritmo se marca como en la [etapa C](#53-etapa-c-el-ritmo-con-el-temporizador): un
paso cada `TICK` frames, medido con DT.

```asm
; (fragmento de roms/planos.asm)
TICK        EQU 5       ; cuadros por paso: 12 pasos por segundo
ARRANQUE    EQU 30      ; el primer paso empieza en el cuadro 30
PITIDO      EQU 4       ; cada pitido dura 4/60 de segundo
TECLA_FRENO EQU 5       ; tecla 5 (la W del teclado): frena al rombo
```

Y está escrito con las reglas de la
[sección 5.7](#57-código-que-anda-en-cualquier-intérprete): con la plataforma XO-CHIP va
exactamente igual con cualquier perfil de quirks, de 15 a 10.000 IPF (los tests lo
comprueban).

### 9.3 Alta resolución y la fuente grande

El programa empieza así (el listado del ensamblador muestra cómo se codifica cada
instrucción nueva):

<!-- salida (fragmento): node tools/chip8asm.js roms/planos.asm --listing -->
```text
 163                     inicio:
 164  0x200  00 FF               HIGH                    ; 128x64 (y la pantalla queda borrada)
 165  0x202  60 1E               LD V0, ARRANQUE         ; el reloj de los pasos: el primero empieza
 166  0x204  F0 15               LD DT, V0               ; cuando DT llegue a 0
 167  0x206  A3 47               LD I, patron
 168  0x208  F0 02               AUDIO                   ; el patrón de sonido: 16 bytes desde I
 169  0x20A  F1 01               PLANE 1                 ; título, contador y disco: plano 1
```

`HIGH` (`00FF`) pasa la pantalla a **128 × 64** píxeles y la borra. Desde ahí, x va de 0
a 127 e y de 0 a 63: el mismo `DRW` de siempre, en una grilla con cuatro veces más
píxeles. (`LOW`, `00FE`, vuelve a 64 × 32.) Todo programa arranca en baja resolución:
por eso es lo primero que hace. De `AUDIO` y `PLANE` hablamos enseguida.

Después escribe el título con letras de 8 × 10 (dibujadas con `DB`, 10 bytes cada una) y
el contador en 000, con la **fuente grande**:

```asm
; (fragmento de roms/planos.asm)
        LD I, letras            ; "PLANOS": 6 letras de 8x10, una tras otra
        LD V0, 2                ; x
        LD V1, 1                ; y
        LD V2, 10               ; cada letra ocupa 10 bytes
titulo:
        DRW V0, V1, 10
        ADD I, V2               ; I = la letra siguiente
        ADD V0, 10
        SE V0, 62
        JP titulo

        LD V0, 0                ; el contador empieza en 000
        LD HF, V0               ; I = el 0 de la fuente grande
        LD V0, 98
        DRW V0, V1, 10
```

`LD HF, VX` es como `LD F, VX` ([sección 2.6](#26-la-fuente)), pero apunta I a un
dígito de la fuente grande: 16 glifos de 8 × 10, 10 bytes cada uno, que se dibujan con
`DRW VX, VY, 10`. Con ella está escrito el contador de rebotes.

### 9.4 Dos planos, cuatro colores

La pantalla de XO-CHIP son dos pantallas superpuestas, el **plano 1** y el **plano 2**.
Cada píxel tiene un bit en cada una, así que puede estar en cuatro estados, y la consola
pinta cada uno con un color de la paleta:

| Plano 1 | Plano 2 | Color |
|---|---|---|
| apagado | apagado | El fondo |
| prendido | apagado | El del píxel de siempre (plano 1) |
| apagado | prendido | El del plano 2 |
| prendido | prendido | El de los dos planos |

`PLANE N` elige dónde actúan `DRW`, `CLS` y los desplazamientos: `PLANE 1` (lo que hay
al arrancar), `PLANE 2`, `PLANE 3` (los dos) o `PLANE 0` (ninguno). En *Planos*, el
título, el contador y el disco van en el plano 1, y el rombo, solo en el plano 2:

```asm
; (fragmento de roms/planos.asm)
        LD V5, 76               ; el rombo, yendo hacia arriba a la izquierda
        LD V6, 20
        LD V7, -4
        LD V8, -2
        PLANE 2                 ; el rombo es lo único del plano 2
        LD I, rombo
        DRW V5, V6, 0
        PLANE 1
```

`DRW V5, V6, 0`, con N = 0, dibuja un sprite de **16 × 16**: 16 filas de 2 bytes, que
se escriben cómodas con `DW` en binario (el bit más alto es el píxel de la izquierda):

```asm
; (fragmento de roms/planos.asm)
rombo:                          ; el rombo de 16x16
        DW %0000000110000000
        DW %0000001111000000
        DW %0000011111100000
; ...
```

Con `PLANE 3`, un solo `DRW` dibuja en los dos planos: primero las N filas que empiezan
en I, en el plano 1, y después las N siguientes, en el plano 2. El disco, en cambio, se
mueve con el truco de Atrapa ([sección 6.2](#62-lo-mejor-de-atrapa)): un solo `DRW` con
la diferencia entre la posición vieja y la nueva, que acá es un sprite de 16 × 16
(`dif_baja` o `dif_sube`).

Probá esto con *Planos* corriendo: elegí la paleta **Personalizada** y cambiá sus cuatro
colores. Son, en orden, los de la tabla de arriba.

### 9.5 Mover un plano entero

El rombo se mueve **sin ningún `DRW`**: se dibujó una sola vez y, en cada paso, se corre
el plano 2 entero.

```asm
; (fragmento de roms/planos.asm)
        ; --- 2) el rombo: correr el plano 2 ---
        SE V0, 0                ; con la tecla apretada, el rombo no se mueve
        JP fin_rombo
        PLANE 2                 ; los scrolls mueven solo el plano 2
        SNE V7, 4
        SCR                     ; 4 píxeles a la derecha...
        SE V7, 4
        SCL                     ; ...o a la izquierda
        SNE V8, 2
        SCD 2                   ; 2 píxeles para abajo...
        SE V8, 2
        SCU 2                   ; ...o para arriba
        PLANE 1
        ADD V5, V7              ; anotar dónde quedó
        ADD V6, V8
```

`SCR` y `SCL` corren la imagen 4 píxeles a un costado; `SCD N` y `SCU N`, N filas para
abajo o para arriba (`SCU` es solo de XO-CHIP). Y corren **solo los planos elegidos**:
como en el plano 2 no hay otra cosa, correr el plano es mover el rombo, y el plano 1
(el título, el contador y el disco) ni se entera. Cada par `SNE` + desplazamiento es el
"if" de una línea de la parte 5: `SCR` se ejecuta solo si V7 vale 4.

Una trampa: lo que sale por un borde **se pierde**, no aparece del otro lado. Por eso el
rombo rebota apenas llega al borde, antes de que un desplazamiento lo empuje afuera.

### 9.6 Sonido con patrón

En CHIP-8 hay un solo sonido. XO-CHIP conserva la regla de siempre, el sonido suena
mientras ST vale más de 0, pero deja elegir **cómo** suena. `AUDIO` copia 16 bytes desde
I, 128 bits que la consola toca en bucle (cada 1 es la onda arriba y cada 0, abajo); al
principio del programa, `LD I, patron` y `AUDIO` cargan este:

```asm
; (fragmento de roms/planos.asm)
patron: DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000
```

`PITCH VX` elige a qué velocidad se tocan esos bits: 4000 × 2^((VX − 64) / 48) por
segundo. Con 64 son 4000, y cada 48 más, el doble (una octava). Este patrón repite su
ciclo cada 16 bits, así que la nota es esa velocidad dividida por 16. Cuando hay un
rebote, el programa elige la nota de esa pared y hace sonar un pitido corto:

```asm
; (fragmento de roms/planos.asm)
suena:
        PITCH V9                ; la nota (el patrón ya está cargado)
        LD V0, PITIDO
        LD ST, V0               ; suena mientras ST > 0
```

Con `PITCH` 115, por ejemplo, se tocan unos 8354 bits por segundo, y 8354 / 16 da
**522 Hz**: un do. Hasta que un programa ejecuta su primer `AUDIO`, la consola toca el
beep de siempre, así que los programas de CHIP-8 y SUPER-CHIP no se quedan mudos.

### 9.7 Lo demás: SAVE, LOAD, banderas, EXIT y LONG

**`SAVE VX, VY` y `LOAD VX, VY`** guardan y leen un rango cualquiera de registros, como
`LD [I], Vx` y `LD Vx, [I]`, pero **nunca mueven I**: hacen lo mismo con cualquier perfil
de quirks. Por eso *Planos* las usa en su contador:

```asm
; (fragmento de roms/planos.asm)
contador:
        LD I, nuevo - 1
        ADD I, VE
        LOAD VD, VD             ; VD = el dígito que tiene que verse ahí
```

Y el resto, que *Planos* no usa:

- **`LD R, VX` y `LD VX, R`** guardan y leen V0..VX en 16 **banderas** que están fuera
  de la memoria: sobreviven a Reiniciar, a cargar otra ROM y a cambiar de plataforma, y
  con **Ajustes por cartucho** la consola las guarda para cada ROM en tu navegador. Así
  un juego puede recordar su récord de una vez a la otra.
- **`EXIT`** termina el programa: la pantalla dice *FIN DEL PROGRAMA* y el monitor,
  *Terminado* ([sección 1.12](#112-qué-significa-cada-estado)).
- **`LD I, LONG NNNN`** es para los 64 KB de XO-CHIP. Las instrucciones de siempre
  (`JP`, `CALL`, `LD I`) siguen llegando solo hasta `0xFFF`, así que el código va abajo y
  los datos grandes (gráficos, niveles, música) van arriba, donde solo se llega con esta
  instrucción de 4 bytes. Los saltos condicionales la saltean entera. Si tu programa
  pasa de `0xFFF`, ensamblalo con `--xo` (por ejemplo,
  `node tools/chip8asm.js programa.asm --xo`): sin esa opción, el ensamblador te avisa
  que no entra en 4 KB. En el Taller, lo mismo lo hace la etiqueta `; @platform xochip`
  entre los comentarios del principio, que escribe el selector **Plataforma**.

### 9.8 Para practicar

Para cambiar *Planos*, copiá `roms/planos.asm` a otro archivo (por ejemplo,
`mis-planos.asm`), ensamblá la copia con `node tools/chip8asm.js mis-planos.asm` y cargá
el `.ch8`. No edites el de `roms/`: los tests comprueban que el cartucho incluido sea
exactamente ese. Tu copia es otra ROM (cambió su huella), así que la consola no sabe que
es de XO-CHIP: elegí el perfil XO-CHIP antes de cargarla o, si se detiene pidiendo esa
plataforma, tocá **Cambiar a XO-CHIP y reiniciar**, y la consola lo recuerda para esa
ROM.

En el Taller es más directo: elegí **Planos** en **Programa** (está con los cartuchos
incluidos), cambiá lo que quieras y **Ctrl+Enter**. Su etiqueta `; @platform xochip` hace
que se ensamble y corra en XO-CHIP, y lo que cambies queda en tu navegador, sin tocar
`roms/planos.asm` (**Restaurar el original** lo devuelve a como venía).

**1. Una octava más abajo.** Cambiá el patrón de sonido para que su ciclo se repita cada
32 bits en lugar de cada 16, sin tocar ningún `PITCH`. ¿Qué nota suena ahora en la pared
de la izquierda?

<details>
<summary>Pista</summary>

Un ciclo de 32 bits son 4 bytes: por ejemplo, `%11111111, 0, 0, 0`, repetido cuatro
veces para llenar los 16. La velocidad no cambia (con `PITCH` 115, unos 8354 bits por
segundo), pero ahora cada vuelta de la onda dura el doble: 8354 / 32 da unos
**261 Hz**, el mismo do, una octava más abajo. Así se piensa la música en XO-CHIP: el
tono mueve todas las notas juntas, y el patrón decide la octava y el timbre.

</details>

**2. Un récord que no se borra.** Hacé que el contador de rebotes no vuelva a 000 cuando
reiniciás: que arranque donde quedó. Usá las banderas.

<details>
<summary>Pista</summary>

Con X = 0, `LD R, V0` guarda solo V0 en la bandera 0, y `LD V0, R` la lee. Para guardar:
en `suena`, justo después de `LD B, VC`, agregá `LD V0, VC` y `LD R, V0`. Para leer: al
final de `inicio`, cambiá `LD VC, 0` por `LD V0, R` y `LD VC, V0`. Y para que el contador
muestre ese valor desde el principio, cambiá `LD VE, 0` por `LD I, nuevo`, `LD B, VC` y
`LD VE, 3`: el contador se pone al día solo, un dígito por paso, como cuando hay un
rebote. Las banderas sobreviven a Reiniciar y, con **Ajustes por cartucho**, la consola
las guarda para tu ROM: el récord sigue ahí aunque cierres la página. Eso sí, rebobinar o
cargar un estado las vuelve atrás con el resto de la máquina (sección 1.13).

</details>

---

## 10. Ejercicios y próximos pasos

### 10.1 Ejercicios

Van de menor a mayor. Cada uno tiene una pista, escondida para que la mires solo si la
necesitás. Los que parten de un ejemplo se hacen cómodos en el Taller
([sección 4.8](#48-el-taller-ensamblar-sin-salir-de-la-consola)): elegís el ejemplo, lo
cambiás, **Ctrl+Enter**, y cuando terminás, **Restaurar el original** lo deja como venía.

**1. Dos dígitos a mano.** Modificá el programa de la parte 3 para que muestre `42`,
centrado, escribiendo los bytes a mano.

<details>
<summary>Pista</summary>

Necesitás dos veces `LD Vx, NN` + `LD F, Vx` + `DRW`, con la x del segundo dígito 5
píxeles más a la derecha (`ADD V1, 5` es `7105`). Contá bien las instrucciones: la del
salto final cambia de dirección.

</details>

**2. Un fantasmita más rápido.** Hacé que el Cazamonedas avance 2 píxeles por paso.

<details>
<summary>Pista</summary>

Cambiar los `ADD V6, 1` por `ADD V6, 2` es fácil; lo difícil son los bordes. Ahora el
fantasmita se puede pasar por 2, y `SNE V6, -1` no alcanza: desde x = 1, un paso a la
izquierda da −1, pero desde x = 0 da −2 (`0xFE`). Revisá los cuatro bordes.

</details>

**3. Contra reloj.** Agregale al Cazamonedas un límite de 30 segundos. Cuando se
termina, mostrá el puntaje, esperá una tecla con `LD V0, K` y empezá de nuevo.

<details>
<summary>Pista</summary>

Con `RITMO` en 3, hay unos 20 pasos por segundo. Un registro libre (VA a VD no los usa
nadie) que cuente pasos y otro que cuente segundos alcanzan. Para "empezar de nuevo",
`JP inicio`: acordate de que `inicio` tiene que dejar todo como al principio (el puntaje
en 0, la pantalla limpia).

Cuando lo pruebes con el perfil COSMAC VIP, cronometralo: los 30 segundos te van a durar
unos cuantos más. ¿Por qué? Releé el final de la
[sección 5.7](#57-código-que-anda-en-cualquier-intérprete): el paso en que agarrás una
moneda dura unos 13 frames, no 3, y tu contador de pasos no se entera. Para un reloj de
juego alcanza; para uno exacto, habría que medir el tiempo sin depender de los pasos.

</details>

**4. Una moneda inquieta.** Hacé que la moneda cambie de lugar sola cada 3 segundos si
nadie la agarra.

<details>
<summary>Pista</summary>

Ya tenés casi todo: borrar la moneda es dibujarla otra vez, y `nueva_moneda` pone otra.
Solo falta un contador de pasos.

</details>

**5. Récord.** Partiendo del ejercicio 3 (para que haya varias partidas), guardá el
mejor puntaje de la sesión en memoria y mostralo arriba a la derecha.

<details>
<summary>Pista</summary>

Reservá un byte con `DB 0`. Para leerlo y escribirlo: `LD I, record` y después
`LD V0, [I]` o `LD [I], V0` (con X = 0, un solo registro). Para comparar puntajes,
restá y mirá VF, como en `nueva_moneda`.

</details>

**6. Un enemigo.** Agregá algo que rebote por la pantalla, como la pelota de *Rebote*;
si toca al fantasmita, perdés puntos.

<details>
<summary>Pista</summary>

El problema nuevo es que VF = 1 ya no alcanza para saber **con qué** chocaste. Cuando
haya choque, compará las posiciones (con restas) para saber si fue la moneda o el
enemigo.

</details>

**7. Depurar a propósito.** En `08-sonido.asm`, borrá el `LD I, fantasma` del principio
de `mover`. Antes de probarlo, pensá: ¿qué va a pasar la primera vez que muevas el
fantasmita? Después comprobalo en la consola y con el monitor.

<details>
<summary>Pista</summary>

¿Cuál es la última instrucción `LD I` que se ejecuta antes de entrar al bucle? Mirá qué
hace `inicio` justo antes de `bucle`, y a qué apunta I cuando `mover` hace su primer
`DRW`. Si acertaste, vas a ver un fantasmita desarmado y un punto que ganaste sin tocar
ninguna moneda: ¿de dónde salió el VF = 1?

</details>

**8. Mejorá el emulador mínimo.** Algunas ideas, de menor a mayor:

- Que `LD Vx, K` espere a que aprieten **y suelten** una tecla, como el VIP.
- Que se detenga con un mensaje ante una instrucción inválida, un `RET` sin `CALL` o
  una pila llena.
- Una opción para el quirk `VF=0` (o para todos).
- Que dibuje en un `<canvas>` en el navegador, con el teclado de la
  [sección 1.4](#14-el-teclado).

<details>
<summary>Pista</summary>

Compará con el núcleo de `chip8.html` (el bloque `chip8-core`): hace todo eso. Y
`tests/tutorial.test.js` tiene un test que corre el mini emulador al lado del núcleo:
te sirve para comprobar que no rompiste nada.

</details>

**9. ROMs de otros.** Conseguí ROMs de dominio público y cargalas. Las del archivo de la
comunidad de John Earnest ([chip8Archive](https://github.com/JohnEarnest/chip8Archive),
licencia CC0) ya las tenés: son las 104 ROMs del archivo de
[`roms/archivo/`](../roms/archivo/LEEME.md), que vienen también adentro de la consola, y
la consola las reconoce y las configura sola. Elegí una en la ventana del archivo (**L**),
mirá en el aviso y en la ranura qué le puso, cambiá algo y fijate cómo **Olvidar ajustes**
la devuelve a su lugar. Con las demás (hay muchas en los enlaces de abajo), probá vos
cuáles necesitan otro perfil o más IPF.

### 10.2 Próximos pasos

- **El manual.** El [manual de referencia](MANUAL.md) tiene todo lo que este tutorial
  resumió: la historia, cada instrucción con sus casos borde, los quirks con ejemplos y
  la temporización del VIP.
- **ROMs de prueba.** La [chip8-test-suite](https://github.com/Timendus/chip8-test-suite)
  de Timendus tiene ROMs que prueban las instrucciones, los quirks y el teclado, también
  los de SUPER-CHIP y XO-CHIP. Son la forma estándar de comprobar un emulador: cargalas
  en la consola y probá los perfiles.
- **SUPER-CHIP y XO-CHIP a fondo.** La [parte 9](#9-más-allá-de-chip-8-super-chip-y-xo-chip)
  fue una muestra. La [sección 13 del manual](MANUAL.md#13-variantes-y-extensiones)
  cuenta su historia, cómo funciona cada novedad (las dos resoluciones, los planos, la
  fuente grande, las banderas, la memoria de 64 KB, el sonido) y en qué se aparta esta
  consola de los intérpretes originales.
- **Octo.** Si querés hacer juegos en serio, [Octo](https://github.com/JohnEarnest/Octo),
  de John Earnest, es un entorno para programar CHIP-8 y XO-CHIP con un ensamblador de
  alto nivel. Alrededor de él se formó una comunidad que organizó concursos anuales de
  juegos (la Octojam): son los juegos del archivo que la consola reconoce sola.
- **Otras guías.** Las referencias clásicas (la de Cowgod, la guía para escribir un
  emulador de Tobias Langhoff y las demás) están listadas en el
  [manual, sección 15](MANUAL.md#15-referencias).
