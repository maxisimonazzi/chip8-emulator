# Manual de referencia de CHIP-8

Este manual explica CHIP-8 de punta a punta: de dónde viene, cómo es la máquina por
dentro, qué hace cada una de sus 35 instrucciones y en qué detalles difieren las
distintas implementaciones que existieron desde 1977. También cubre sus dos extensiones
más difundidas, SUPER-CHIP y XO-CHIP, que este emulador ejecuta (sección
[13](#13-variantes-y-extensiones)). Está pensado para programadores que nunca vieron
CHIP-8, pero también sirve como referencia rápida mientras escribís un programa o
depurás uno ajeno.

- Si querés aprender haciendo, empezá por el [tutorial](TUTORIAL.md).
- Si te interesa cómo está construido este emulador (arquitectura, tests, decisiones),
  leé [DESARROLLO.md](DESARROLLO.md).
- Para instalar, abrir y usar la consola, mirá el [README](../README.md) y la
  [parte 1 del tutorial](TUTORIAL.md#1-usar-el-emulador).

## Convenciones de este manual

- **Hexadecimal.** Los números con prefijo `0x` están en base 16. Las direcciones se
  escriben con 3 dígitos (`0x200`, o 4 cuando son de los 64 KB de XO-CHIP: `0x8000`),
  los bytes con 2 (`0x2A`) y los opcodes con 4 (`0xD01F`). En las tablas a veces se
  omite el prefijo.
- **"El VIP"** es el RCA COSMAC VIP con el intérprete CHIP-8 original de 1977-1978.
  **"Este emulador"** es `chip8.html`, el programa que acompaña a este manual.
- Cuando el hardware original y este emulador se comportan distinto, aparece un
  párrafo marcado **Diferencia con el VIP**. Todo lo que dice "este emulador" describe
  exactamente lo que hace el código y lo que verifican los tests del proyecto.
- **SUPER-CHIP 1.1** es la versión de 1991 para las calculadoras HP-48 que se toma como
  referencia de SUPER-CHIP, y **Octo** es el entorno de John Earnest donde nació
  XO-CHIP. Este emulador ejecuta las instrucciones de las dos extensiones como Octo; donde
  eso se aparta de SUPER-CHIP 1.1, o donde este emulador se aparta de Octo, aparece un
  párrafo marcado **Diferencia con SUPER-CHIP 1.1** o **Diferencia con Octo**.
- **"El monitor"** es el panel de depuración de la consola, el que se titula MONITOR (su
  botón, arriba, en la consola, lo muestra y lo oculta), con cuatro pestañas: **Código**
  (registros, pila, el desensamblado, que sigue al PC, y los puntos de corte), **Traza**
  (las últimas instrucciones ejecutadas), **Memoria** (un mapa de la memoria y su
  contenido) y **Sprites**. Cuando se habla del sistema operativo en ROM del VIP, que
  también se llamaba así, se dice **"el programa monitor del VIP"**.
- Los mnemónicos son los de la referencia de Cowgod (`LD`, `DRW`, `SKP`, ...). Son los
  mismos que acepta el ensamblador del proyecto (el que usa el **Taller** de la consola y,
  desde la terminal, `tools/chip8asm.js`, con la sintaxis que explica la
  [sección 4.4 del tutorial](TUTORIAL.md#44-la-sintaxis-completa)) y los que muestra el
  desensamblador del monitor. Las instrucciones de SUPER-CHIP y XO-CHIP
  usan los mnemónicos del mismo ensamblador (`SCD`, `HIGH`, `PLANE`, ...; sección
  [13.11](#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip)). Los ejemplos
  de este manual se ensamblan tal cual, salvo los que empiezan con `; Fragmento`: son
  pedazos de un programa más grande y usan etiquetas (subrutinas, destinos de salto,
  tablas) que están en otra parte; el comentario del principio dice cuáles son, y para
  ensamblarlos tenés que definirlas vos.
- Los ejemplos que usan instrucciones de SUPER-CHIP o XO-CHIP dicen su plataforma en un
  comentario al principio, `; Plataforma: SUPER-CHIP` o `; Plataforma: XO-CHIP`: es la
  que tenés que elegir en la consola para correrlos. Los que no dicen nada son de
  CHIP-8. Un programa de XO-CHIP que pase de `0xFFF` se ensambla con la opción `--xo`.
- En los opcodes, `X` e `Y` son números de registro (un dígito hex), `N` es un dígito
  hex, `NN` un byte y `NNN` una dirección de 12 bits; `NNNN` es una dirección de 16 bits,
  la que sigue a `F000` en XO-CHIP. La sección [9](#9-formato-de-las-instrucciones) lo
  explica en detalle.

<!--
Convención de los bloques de código asm de este manual (la verifica tests/manual.test.js):
- Un bloque asm sin marca es un ejemplo que se ensambla tal cual con tools/chip8asm.js.
- Un fragmento empieza con una línea de comentario "; Fragmento: ..." que nombra las
  etiquetas que usa y no define. El test las agrega como etiquetas de relleno y exige que
  así se ensamble; también exige que el fragmento use al menos una etiqueta que no define.
- Un bloque (fragmento o no) puede declarar su plataforma con una línea de comentario
  entre las que lo abren: "; Plataforma: SUPER-CHIP" o "; Plataforma: XO-CHIP" (también
  "; Plataforma: CHIP-8", que es lo que se supone si no dice nada). En un fragmento va
  después de la línea "; Fragmento: ...". Un bloque de XO-CHIP se ensambla con la opción
  xochip (puede pasar de 0xFFF). Un bloque que usa instrucciones de SUPER-CHIP o XO-CHIP
  tiene que declarar una plataforma que las tenga.
- Un ejemplo que termina en el bucle "fin: JP fin" es un programa completo: el test lo
  ejecuta en la plataforma que declara, con cada perfil de quirks, y exige que llegue a
  ese bucle sin que la máquina se detenga ni ignore ninguna instrucción.
El test también exige que la referencia de 13.11 tenga una ficha por cada instrucción de
SUPER-CHIP y XO-CHIP del ensamblador y del núcleo (con el opcode que genera el ensamblador
y la plataforma que dice el núcleo), y compara con el núcleo y con data/archive.json la
tabla y los dibujos de la fuente grande, la tabla de tonos de 13.10 y los números del
archivo de la comunidad.
-->

## Índice

1. [Qué es CHIP-8](#1-qué-es-chip-8)
2. [Arquitectura general](#2-arquitectura-general)
3. [Memoria](#3-memoria)
4. [Registros](#4-registros)
5. [Timers de retardo y sonido](#5-timers-de-retardo-y-sonido)
6. [Pantalla](#6-pantalla)
7. [Teclado hexadecimal](#7-teclado-hexadecimal)
8. [Fuente hexadecimal](#8-fuente-hexadecimal)
9. [Formato de las instrucciones](#9-formato-de-las-instrucciones)
10. [Referencia completa de las 35 instrucciones](#10-referencia-completa-de-las-35-instrucciones)
11. [Quirks](#11-quirks)
12. [Temporización](#12-temporización)
13. [Variantes y extensiones](#13-variantes-y-extensiones)
14. [Glosario](#14-glosario)
15. [Referencias](#15-referencias)

---

## 1. Qué es CHIP-8

### 1.1 Una computadora que nunca existió

CHIP-8 no es un chip ni una computadora: es un lenguaje de máquina *inventado*,
diseñado para que lo ejecute un programa intérprete que corre sobre una CPU real. Hoy
lo llamaríamos una **máquina virtual**. Un programa CHIP-8 es una secuencia de
instrucciones de 2 bytes que el intérprete lee, decodifica y ejecuta de a una, igual que
una CPU de verdad hace con su código máquina.

Como la "máquina" es abstracta, sus características (4 KB de memoria, 16 registros de
8 bits, una pantalla de 64×32 píxeles, un teclado de 16 teclas, dos timers y un
buzzer) son las que el intérprete original decidió ofrecer, no las de ningún circuito.
Por eso el mismo programa CHIP-8 podía correr en computadoras distintas: bastaba con
escribir un intérprete para cada una.

### 1.2 Joseph Weisbecker, el RCA 1802 y el COSMAC VIP

**Joseph Weisbecker** (1932–1990) fue ingeniero de RCA Laboratories, en Nueva Jersey. A
principios de los años 70 diseñó una arquitectura de computadora de 8 bits que RCA
llamó **COSMAC** (*Complementary Symmetry Monolithic Array Computer*) y que terminó
fabricándose como el microprocesador **RCA CDP1802**, considerado el primer
microprocesador CMOS y conocido, entre otras cosas, por haber volado en la sonda
Galileo.

El 1802 tiene rasgos poco comunes que importan para entender CHIP-8:

- **Dieciséis registros de 16 bits** (R0–RF), y *cualquiera* de ellos puede hacer de
  contador de programa: la instrucción `SEP` elige cuál. Esto hace que saltar a una
  subrutina "de sistema" y volver sea muy barato, que es justo lo que necesita un
  intérprete.
- Un acumulador de 8 bits (**D**) con un único bit de acarreo (**DF**).
- Una salida de un bit (**Q**) y cuatro entradas de un bit (**EF1–EF4**), que el VIP
  usa para el parlante, el teclado, el video y el cassette.
- **DMA** incorporado, que el chip de video usa para leer la memoria de pantalla.
- Cada ciclo de máquina dura 8 ciclos de reloj.

En su artículo de 1978 en la revista BYTE, Weisbecker cuenta que ya tenía en mente este
tipo de programación interpretada cuando incluyó los múltiples contadores de programa
en la arquitectura del 1802.

El **RCA COSMAC VIP** (CDP18S711) fue una computadora de una sola placa que RCA vendió
como kit hacia 1977 (Wikipedia menciona un precio de US$275; algunas fuentes ubican su
lanzamiento a fines de 1976). Según su manual de instrucciones, traía:

| Componente | COSMAC VIP |
|---|---|
| CPU | RCA CDP1802, reloj de ≈1,76 MHz (cristal de 3,52 MHz dividido por 2); un ciclo de máquina ≈ 4,54 µs |
| RAM | 2048 bytes en la placa, ampliable a 4096 en la misma placa (y más con módulos externos) |
| ROM | 512 bytes con el sistema operativo (el programa monitor), en la dirección 0x8000 |
| Video | Chip CDP1861 ("Pixie"), salida para un monitor de video o un televisor; sincronismo vertical de 60 Hz |
| Entrada | Teclado hexadecimal de 16 teclas (0–F) |
| Sonido | Un generador de tono que suena mientras la línea Q del 1802 está en 1 |
| Almacenamiento | Interfaz de cassette de 100 bytes por segundo |

El manual incluía el listado hexadecimal del intérprete CHIP-8 (512 bytes que había
que tipear a mano con el teclado hex y después guardar en cassette), una descripción
del lenguaje y **veinte juegos**: los programas 1 a 8 son de Joe Weisbecker, el 9 y el
10 de su hija **Joyce Weisbecker** (a quien Wikipedia describe como la primera mujer
diseñadora de videojuegos), del 11 al 13 de Jef Winsor, del 14 al 16 de Tom Chen y del
17 al 20 de Phil Baltzer.

### 1.3 Por qué una máquina interpretada

En diciembre de 1978 Weisbecker publicó en BYTE el artículo *An Easy Programming
System* (páginas 108–122), donde explica la idea detrás de CHIP-8. Su argumento, en
resumen:

- Diseñás un **pseudo-lenguaje de máquina** más poderoso que el código máquina real para
  un tipo de aplicación (en este caso, juegos y gráficos en pantalla) y escribís un
  intérprete chico que lo ejecuta. Cada pseudo-instrucción es, en el fondo, el código de
  una subrutina en lenguaje de máquina. Weisbecker lo compara con la
  *microprogramación vertical*: el código máquina del 1802 hace de microcódigo.
- Al quedarse en un formato numérico (sin nombres ni etiquetas) y limitar el rango de
  direcciones y la cantidad de variables, cada instrucción entra en **2 bytes** y el
  intérprete en **512 bytes**.
- El resultado necesita **mucha menos memoria** que un lenguaje de alto nivel. Como
  ejemplo, cuenta que escribió un ta-te-ti en CHIP-8 que ocupaba 500 bytes, contra 3000
  de una versión equivalente en BASIC; el intérprete CHIP-8 era unas ocho veces más
  chico que el de BASIC, y el programa corría en un sistema de 1,5 KB con teclado hex,
  mientras que el de BASIC necesitaba 8 KB, teclado ASCII y terminal.
- Es **mucho más fácil que el código máquina**: aritmética de 8 bits, subrutinas,
  números aleatorios, conversión a decimal, un timer y, sobre todo, una instrucción que
  dibuja un sprite y detecta colisiones.

En 1977 la memoria era cara: un VIP básico tenía 2 KB en total. Un lenguaje que
permitía escribir un juego completo en unos cientos de bytes, y que el hobbista podía
entender y tipear en hexadecimal, era una solución muy práctica. El manual del VIP y el
artículo de BYTE describen **31 instrucciones**; la sección
[10](#10-referencia-completa-de-las-35-instrucciones) explica de dónde salen las 35 que
se cuentan hoy.

### 1.4 Otras máquinas de la época

Como CHIP-8 era independiente del hardware, pronto apareció en otras computadoras
hobbistas, y los programas eran compatibles a nivel binario entre ellas:

- **Telmac 1800** (1977): un clon finlandés del VIP, también basado en el 1802,
  introducido por Telercas Oy.
- **DREAM 6800** (1979): una computadora en kit publicada por la revista *Electronics
  Australia*, parecida al VIP pero basada en el Motorola 6800; su autor, Michael J.
  Bauer, fue quien acuñó la expansión en inglés de la sigla, *Compact Hexadecimal
  Interpretive Programming – 8-bit*.
- **ETI-660** (1981): otra computadora en kit, publicada por *Electronics Today
  International*. Sus programas CHIP-8 empiezan en `0x600` en lugar de `0x200`.
- **CHIP-8X** (1980): la sucesora "oficial" de RCA, con color, placa de sonido y un
  segundo teclado. Tuvo mucha menos difusión.

### 1.5 El renacimiento: CHIP-48 y SUPER-CHIP

En 1990 **Andreas Gustafsson** escribió **CHIP-48**, un intérprete de CHIP-8 para las
calculadoras gráficas **HP-48**. Como las calculadoras no tenían una forma sencilla de
programar juegos rápidos, CHIP-8 se volvió popular de nuevo. CHIP-48 introdujo,
aparentemente sin querer, algunas diferencias con el intérprete del VIP en el
funcionamiento de ciertas instrucciones (desplazamientos, carga/guardado de registros y
el salto con desplazamiento), que son el origen de varios de los *quirks* de la
sección [11](#11-quirks).

En mayo de 1991 **Erik Bryntse** publicó **SUPER-CHIP** (también llamado SCHIP o
Super Chip-48), basado en CHIP-48: modo de alta resolución de 128×64, scroll, sprites
de 16×16 y una fuente grande, entre otras cosas (ver sección
[13](#13-variantes-y-extensiones)). La versión 1.1, de fines de ese mismo mes, es la que
se toma como referencia.

Durante los 90 aparecieron intérpretes para MS-DOS, Windows, Amiga y otras plataformas
(los de David Winter, Paul Robson y otros). En 1997 Thomas P. Greene ("Cowgod")
compiló la *Chip-8 Technical Reference*, que se convirtió en la referencia de facto para
quienes escriben emuladores. Es muy útil, pero describe algunas instrucciones según el
comportamiento de CHIP-48/SUPER-CHIP y no según el VIP, y eso generó mucha confusión
(ver la sección [11](#11-quirks)).

### 1.6 Octo, XO-CHIP y la comunidad actual

**John Earnest** creó **Octo**, un entorno de desarrollo para CHIP-8 que corre en el
navegador, con un ensamblador de alto nivel propio. Alrededor de 2014 definió
**XO-CHIP**, una extensión que agrega más memoria direccionable, color mediante planos
de bits y sonido programable (sección [13](#13-variantes-y-extensiones)). Entre 2014
y 2023 organizó todos los años la **Octojam**, una game jam de CHIP-8 que se hacía en
octubre; hubo diez ediciones y la de 2023 fue la última.

John Earnest mantiene además el **archivo de la comunidad** (*Chip8 Community Archive*):
un repositorio con programas de CHIP-8, SUPER-CHIP y XO-CHIP, sus autores y las
opciones con que se juegan en Octo, todo con licencia CC0. La mayoría son de las
Octojam. Esta consola lo usa para configurar sola los juegos que reconoce
([11.11](#1111-ajustes-por-cartucho)). Desde la sexta (2019), las entradas de la Octojam se
publicaron en itch.io, y no todas llegaron al archivo: la consola trae también las de las
Octojam 6 a 10 que faltan.

Buena parte de lo que hoy se sabe con precisión sobre el comportamiento original viene
de trabajo reciente de la comunidad: el análisis del intérprete del VIP publicado por
Laurence Scotford, la suite de tests de Timendus, las tablas de variantes de Steffen
Schümann (Gulrak) y la base de datos de programas `chip-8-database`. Todos están en las
[referencias](#15-referencias).

### 1.7 Por qué es el "primer emulador" clásico

CHIP-8 es, probablemente, el proyecto más recomendado para aprender a escribir
emuladores:

- **Es chico.** 35 instrucciones, todas de 2 bytes, que se decodifican mirando dígitos
  hexadecimales. Un intérprete completo entra en unos cientos de líneas.
- **No tiene las partes difíciles de una consola real**: ni interrupciones que el
  programa maneje, ni bancos de memoria, ni un chip de video con registros y tiempos
  que haya que imitar ciclo a ciclo.
- **Pero tiene todos los conceptos importantes**: ciclo fetch-decode-execute,
  registros, flags, pila de llamadas, memoria compartida por código y datos, un
  framebuffer, entrada, sonido y temporización.
- **Hay muchísimo material**: cientos de programas, suites de tests y documentación.
- **Y enseña la lección más importante de la emulación**: la documentación y el
  comportamiento real no siempre coinciden, y los programas dependen del
  comportamiento real. De eso se tratan los quirks.

### 1.8 Línea de tiempo

| Año | Hito |
|---|---|
| 1970–71 | Weisbecker desarrolla la arquitectura que se convertiría en el COSMAC (RCA 1802) |
| 1977 | RCA vende el COSMAC VIP con el intérprete CHIP-8; aparece la Telmac 1800 |
| 1978 | Manual del VIP (VIP-311) y artículo *An Easy Programming System* en BYTE (diciembre) |
| 1979 | DREAM 6800 (*Electronics Australia*) |
| 1980 | CHIP-8X de RCA |
| 1981 | ETI-660 |
| 1990 | CHIP-48 de Andreas Gustafsson para la HP-48 |
| 1991 | SUPER-CHIP 1.0 y 1.1 de Erik Bryntse |
| 1997 | *Chip-8 Technical Reference* de Cowgod (Thomas P. Greene) |
| 2014 | Octo y XO-CHIP de John Earnest; primera Octojam |
| 2020 | Laurence Scotford publica su análisis del intérprete original del VIP |
| 2023 | Décima y última Octojam |

---

## 2. Arquitectura general

### 2.1 Diagrama de bloques

```
 +--------------------------------------------------------------------------+
 |                         INTÉRPRETE  (la "CPU")                           |
 |                                                                          |
 |      +------+     +-------+     +--------+     +---------+               |
 |      |  PC  |---->| fetch |---->| decode |---->| execute |               |
 |      +------+     +-------+     +--------+     +---------+               |
 |                                                                          |
 |      V0 V1 V2 V3 V4 V5 V6 V7 V8 V9 VA VB VC VD VE VF      I      SP      |
 +------+------------------+-----------------+------------+-----------+-----+
        |                  |                 |            |           |
        | lee / escribe    | XOR de sprites  | push/pop   | lee/carga | consulta
        v                  v                 v            v           v
 +--------------+   +-------------+   +-----------+   +---------+   +-------------+
 |   MEMORIA    |   |  PANTALLA   |   |   PILA    |   | TIMERS  |   |  TECLADO    |
 |   4096 B     |   |  64 x 32    |   | 16 direc. |   | DT   ST |   |  HEX 0..F   |
 | 0x000-0xFFF  |   |  1 bit/px   |   | (12 en el |   | 60 Hz   |   |  16 teclas  |
 | fuente, ROM, |   +-------------+   |   VIP)    |   +----+----+   +-------------+
 | datos        |                     +-----------+        |
 +--------------+                                  ST > 0  |
                                                           v
                                                     +-----------+
                                                     |  BUZZER   |
                                                     +-----------+
```

| Bloque | Qué es | Sección |
|---|---|---|
| Memoria | 4096 bytes. Contiene el programa, sus datos y la fuente hexadecimal | [3](#3-memoria) |
| V0–VF | 16 registros de 8 bits; VF además sirve de flag | [4](#4-registros) |
| I | Registro de dirección (índice) para leer y escribir memoria | [4.3](#43-i-el-registro-índice) |
| PC | Contador de programa: dirección de la próxima instrucción | [4.4](#44-pc-el-contador-de-programa) |
| Pila y SP | Direcciones de retorno de las subrutinas | [4.5](#45-la-pila-y-sp) |
| DT, ST | Timers de 8 bits que bajan solos a 60 Hz | [5](#5-timers-de-retardo-y-sonido) |
| Pantalla | 64×32 píxeles de un bit; se dibuja con XOR | [6](#6-pantalla) |
| Teclado | 16 teclas hexadecimales | [7](#7-teclado-hexadecimal) |
| Buzzer | Suena mientras ST > 0 | [5.3](#53-el-buzzer) |

Así es CHIP-8, la plataforma de siempre. Las extensiones que este emulador también
ejecuta cambian algunos números del diagrama: SUPER-CHIP agrega una pantalla de
**128 × 64**, una fuente grande y 16 **banderas** que viven fuera de la memoria y
sobreviven al reinicio; XO-CHIP suma **64 KB** de memoria, un segundo plano de dibujo
(2 bits por píxel, cuatro colores) y un patrón de audio con su tono. La sección
[13](#13-variantes-y-extensiones) explica cada cosa.

### 2.2 El ciclo fetch-decode-execute

El intérprete repite siempre lo mismo:

```
repetir para siempre:
    opcode ← (memoria[PC] << 8) | memoria[PC + 1]   ; fetch: 2 bytes, big-endian
    PC     ← PC + 2                                  ; ya apunta a la siguiente
    decodificar opcode                               ; decode: mirar sus dígitos hex
    ejecutarlo                                       ; execute
```

Dos detalles de este esquema explican el comportamiento de varias instrucciones:

1. **El PC avanza antes de ejecutar.** Por eso una instrucción de *skip* ("saltear la
   siguiente") solo tiene que sumarle 2 al PC otra vez, y `CALL` guarda en la pila el
   PC tal como está, que ya es la dirección de retorno correcta.
2. **No hay nada más.** CHIP-8 no tiene interrupciones visibles para el programa, ni
   modos privilegiados, ni excepciones. Los timers bajan "solos" (en el VIP lo hacía la
   rutina de interrupción de video del sistema operativo) y el programa los consulta
   cuando quiere.

```
      +----------+       +-----------+       +------------+
 +--->|  FETCH   |------>|  DECODE   |------>|  EXECUTE   |----+
 |    | PC += 2  |       | nibbles   |       | registros, |    |
 |    +----------+       +-----------+       | memoria,   |    |
 |                                           | pantalla   |    |
 |                                           +------------+    |
 +-------------------------------------------------------------+
```

### 2.3 El modelo de frame de este emulador

El VIP no tenía una "velocidad de CHIP-8": cada instrucción tardaba lo que tardaba su
rutina en el 1802 (sección [12](#12-temporización)). Este emulador, como casi todos
los modernos, organiza la ejecución en **frames de 1/60 de segundo**:

```
cada 1/60 s (un frame):
    repetir hasta IPF veces:                  ; IPF = instrucciones por frame
        si la máquina está detenida (por un error o por EXIT) o esperando una tecla (FX0A): cortar
        ejecutar una instrucción (step)
        si el quirk displayWait está activo y la instrucción fue un DXYN: cortar
    bajar los timers una vez (tickTimers)      ; también mientras espera una tecla
    la interfaz redibuja la pantalla si cambió y hace sonar el beep si ST > 0
```

En el código del núcleo esto es `Chip8.runFrame(ipf)`; `step()` ejecuta exactamente
una instrucción y `tickTimers()` baja los timers. En la consola, el botón **Paso**
ejecuta una sola instrucción (sin tocar los timers) y el botón **Frame** ejecuta un
frame completo; los dos dejan la máquina en pausa, y el monitor muestra cómo quedó.

Un **punto de corte** (en el desensamblado del monitor) detiene la máquina en el medio de
un frame, antes de ejecutar la instrucción marcada. Ese frame queda abierto: todavía no
bajó los timers. Al seguir con **Continuar** o con **Frame**, primero se ejecutan las
instrucciones que le faltaban a ese frame y recién entonces bajan los timers, así que
detenerse y seguir no cambia lo que hace el programa (**Paso**, como siempre, ejecuta una
instrucción sin tocar los timers). **Por encima** (O), **Salir** (K) y **Hasta acá** hacen
correr la máquina, frame por frame y con sus tics, hasta la instrucción que buscan, y ahí
se detienen como en un punto de corte: antes de ejecutarla y con el frame abierto.

---

## 3. Memoria

CHIP-8 direcciona **4096 bytes** (4 KB), de `0x000` a `0xFFF`: las direcciones de las
instrucciones tienen 12 bits. Código y datos comparten la misma memoria (no hay
separación entre programa y datos), y todo se puede leer y escribir. SUPER-CHIP se queda
con esos 4 KB; XO-CHIP llega a **64 KB**, de `0x0000` a `0xFFFF`
([13.9](#139-la-memoria-de-64-kb-y-la-carga-larga)).

### 3.1 El mapa de memoria del COSMAC VIP

En el VIP, el intérprete ocupaba los primeros 512 bytes de la RAM (`0x000`–`0x1FF`) y
los programas debían empezar en `0x200`. Al final de la RAM, el intérprete reservaba
espacio para la pila, sus variables y el buffer de pantalla. Según el análisis de
Laurence Scotford, en un VIP de 2 KB el mapa era:

| Direcciones (2 KB) | Tamaño | Uso |
|---|---|---|
| `0x000`–`0x1FF` | 512 B | Intérprete CHIP-8 |
| `0x200`–`0x69F` | 1184 B | Programa (592 instrucciones) |
| `0x6A0`–`0x6CF` | 48 B | Pila del intérprete: direcciones de retorno y uso interno del 1802; alcanza para 12 niveles de `CALL`. Crece hacia abajo |
| `0x6D0`–`0x6EF` | 32 B | Área de trabajo para armar sprites |
| `0x6F0`–`0x6FF` | 16 B | Las variables V0–VF |
| `0x700`–`0x7FF` | 256 B | Memoria de pantalla (64×32 bits) |

En un VIP de 4 KB la estructura es la misma, corrida al final de la RAM: pila en
`0xEA0`–`0xECF`, área de trabajo en `0xED0`–`0xEEF`, variables en `0xEF0`–`0xEFF` y
pantalla en `0xF00`–`0xFFF`. El manual del VIP dice que "los últimos 352 bytes" de la
RAM se usan para variables y refresco de pantalla (352 = `0x1000 − 0xEA0`) y ofrece al
programa el área `0x200`–`0xE8F` (3216 bytes, 1608 instrucciones); el manual no explica
los 16 bytes que quedan entre `0xE90` y `0xE9F`.

Ojo con un detalle: la fuente hexadecimal **no** estaba en la RAM, sino en la ROM del
sistema operativo, en la página `0x81xx` (sección [8](#8-fuente-hexadecimal)).

### 3.2 El mapa de memoria de este emulador

En este emulador la pila, los registros y la pantalla son estructuras separadas y no
ocupan memoria CHIP-8. Con las plataformas CHIP-8 y SUPER-CHIP, los 4 KB quedan así:

```
 0xFFF +--------------------------------------+
       |                                      |
       |                                      |
       |      programa y datos (la ROM)       |   hasta 3584 bytes
       |                                      |   (MAX_ROM_SIZE = 4096 - 0x200)
       |                                      |
 0x200 +--------------------------------------+   PROGRAM_START: acá se copia la ROM
       |      libre (ceros)                   |   0x140 - 0x1FF    y arranca el PC
 0x140 +--------------------------------------+
       |      fuente grande (160 bytes)       |   0x0A0 - 0x13F    BIG_FONT_ADDR = 0x0A0
       |      (con CHIP-8, ceros)             |                    (SUPER-CHIP y XO-CHIP)
 0x0A0 +--------------------------------------+
       |      fuente hexadecimal (80 bytes)   |   0x050 - 0x09F    FONT_ADDR = 0x050
 0x050 +--------------------------------------+
       |      libre (ceros)                   |   0x000 - 0x04F
 0x000 +--------------------------------------+
```

Con XO-CHIP, la parte de abajo es igual y la memoria sigue hasta `0xFFFF`: la ROM puede
ocupar hasta 65.024 bytes. El mapa completo está en
[13.9](#139-la-memoria-de-64-kb-y-la-carga-larga).

- Al reiniciar (`reset()`), toda la memoria se pone en cero, se copia la fuente a
  `0x050` (y, con SUPER-CHIP y XO-CHIP, la fuente grande a `0x0A0`), se vuelve a copiar
  la última ROM cargada a `0x200` y el PC queda en `0x200`. Las banderas de `FX75` no se
  borran ([13.8](#138-las-banderas-rpl)).
- Con CHIP-8 y SUPER-CHIP, una ROM puede ocupar **hasta 3584 bytes** (`0x200`–`0xFFF`);
  con XO-CHIP, **hasta 65.024** (`0x200`–`0xFFFF`). Si cargás una ROM de más de 3584
  bytes con otra plataforma, la consola pasa sola al perfil XO-CHIP y te avisa por qué
  ([11.10](#1110-diagnósticos-de-plataforma)). Si el archivo es más grande que 65.024
  bytes (o está vacío), la consola rechaza la carga con un aviso, arriba de la página,
  y deja en la ranura el cartucho que había.
- La ROM llega con el botón **Cargar ROM**, arrastrando el archivo sobre la página o
  eligiendo un cartucho: todo eso está en la pestaña **Cartuchos** del cajón de opciones
  (la tecla M), con los **Incluidos** y, en **Tus cartuchos**, las ROMs que cargaste
  desde un archivo, listas para volver a jugarlas ([11.11](#1111-ajustes-por-cartucho)).
  Cada cartucho es una tarjeta con una miniatura de su pantalla y su nombre; al pasar el
  mouse (o al llegar con Tab) aparece un cartel con su descripción, sus controles, su
  plataforma y su tamaño. La ranura, arriba de la pestaña, muestra el cartucho puesto
  (con un incluido, también sus controles), y su nombre va impreso debajo de la
  pantalla. Los juegos del archivo de la comunidad se cargan desde su ventana (la tecla
  L o el botón **Archivo**, en la misma pestaña), y un programa escrito en el **Taller**
  (la tecla Y) entra en la ranura al ensamblarlo.
- La zona `0x000`–`0x1FF` no está protegida: un programa puede escribirla (por
  ejemplo, pisar la fuente).
- En el monitor, la pestaña **Memoria** dibuja este mapa con lo que el programa hizo con
  cada byte desde el último reinicio: el código que se ejecutó, los datos que leyó (los
  sprites de `DXYN`, `FX65`) o escribió (`FX55`, `FX33`), la fuente, los bytes de la ROM
  que nadie tocó todavía y la memoria vacía, con el PC y la I marcados. Tocar una celda
  lleva el desensamblado o el volcado de la memoria a esa dirección.

> **Diferencia con el VIP.** En el VIP, un programa de 4 KB que escribiera en
> `0xEA0`–`0xFFF` pisaba la pila, las variables o la pantalla; un programa podía, por
> ejemplo, escribir la memoria de video directamente con `FX55`. En este emulador esas
> direcciones son memoria común: escribirlas no cambia la pantalla ni los registros.
> Para que tu programa sea portable, no uses memoria por encima de `0xE8F` y no
> dependas de dónde está la fuente.

### 3.3 Instrucciones de 2 bytes, en orden big-endian

Toda instrucción ocupa 2 bytes y se guarda con el **byte más significativo primero**
(*big-endian*). Si en `0x200` hay `D0` y en `0x201` hay `1F`, la instrucción es
`0xD01F`:

```
 dirección:   0x200   0x201   0x202   0x203
 contenido:  [ D0  ] [ 1F  ] [ 12  ] [ 02  ]
              \_____________/ \_____________/
               0xD01F           0x1202
               DRW V0, V1, 15   JP 0x202
```

### 3.4 Alineación

Por convención las instrucciones están en direcciones pares, porque el programa empieza
en `0x200` y cada instrucción ocupa 2 bytes. Pero nada lo exige: el intérprete lee la
palabra en la dirección que diga el PC, sea par o impar. Si mezclás datos de longitud
impar (un sprite de 5 bytes, por ejemplo) *entre* instrucciones, las que vengan después
van a quedar en direcciones impares; funciona, pero es fácil equivocarse al contar.
La costumbre (que ya recomendaba Cowgod) es poner los datos al final del programa, o
rellenarlos con un byte extra para que el código siguiente quede en dirección par.

### 3.5 Código automodificable

Como código y datos comparten la memoria, un programa puede **modificar sus propias
instrucciones** con `FX55` (guardar registros) o `FX33` (guardar BCD). Era una técnica
habitual para ahorrar memoria: por ejemplo, cambiar el byte `NN` de un `6XNN` o la
dirección de un `ANNN` para recorrer una tabla.

```asm
; Copia V0 en el operando de la instrucción marcada con "parche".
        LD   I, parche + 1   ; I apunta al segundo byte (NN) de esa instrucción
        LD   [I], V0         ; memoria[I] = V0
parche: LD   V1, 0x00        ; al ejecutarse, NN ya vale lo que tenía V0
```

El monitor de la consola desensambla la memoria *actual*, así que si el programa se
modifica a sí mismo vas a ver el código cambiado. En el mapa de la pestaña **Memoria**,
los bytes que el programa escribió aparecen como escritos, salvo los que además se
ejecutaron, que aparecen como código.

### 3.6 Direcciones que dan la vuelta

En este emulador, con CHIP-8 y SUPER-CHIP, el PC se mantiene siempre en 12 bits
(`& 0xFFF`) y **toda** lectura o escritura de memoria usa la dirección módulo 4096
(`dirección & 0xFFF`). Si `I` vale `0x1002`, `FX65` lee desde `0x002`; si el PC pasa de
`0xFFE`, sigue en `0x000`. Con XO-CHIP pasa lo mismo, pero en 16 bits: todo da la vuelta
en `0xFFFF` ([13.9](#139-la-memoria-de-64-kb-y-la-carga-larga)).

Un caso típico de depuración: si tu programa "se cae" a memoria vacía, el emulador
ejecuta cada `0000` como `SYS 0x000`, que no hace nada (ver
[0NNN](#0nnn--sys-nnn)), y el PC avanza de a 2 hasta dar la vuelta. Al llegar a
`0x050` se encuentra con la fuente: `F0 90` se lee como `0xF090`, que no es una
instrucción válida, y la máquina se detiene con un error que indica el opcode y su
dirección. La pestaña **Traza** del monitor muestra el camino: las últimas 1024
instrucciones que ejecutó, con la que falló al final, en rojo.

---

## 4. Registros

### 4.1 V0 a VF: los registros de datos

CHIP-8 tiene **16 registros de 8 bits**, `V0` a `VF` (el manual del VIP los llama
"variables"). Casi todas las instrucciones trabajan con ellos: cargar constantes,
sumar, comparar, pasar coordenadas a `DRW`, leer teclas, etc. Sus valores van de 0 a
255 y toda la aritmética es módulo 256. No hay números negativos como tales, pero podés
pensar en complemento a dos: sumar `0xFF` es lo mismo que restar 1.

En el VIP los registros vivían en memoria (`0x6F0`–`0x6FF` en una máquina de 2 KB), lo
que permitía inspeccionarlos con el programa monitor del VIP. En este emulador son el
arreglo `V: Uint8Array(16)`, y el monitor de la consola los muestra en la grilla
REGISTROS V0–VF.

### 4.2 VF, el registro de flags

`VF` es un registro como los demás, **pero varias instrucciones lo sobrescriben** para
informar un resultado:

| Instrucción | Qué deja en VF |
|---|---|
| `8XY4` ADD | 1 si hubo acarreo (la suma pasó de 255), si no 0 |
| `8XY5` SUB | 1 si **no** hubo préstamo (VX ≥ VY), si no 0 |
| `8XY7` SUBN | 1 si **no** hubo préstamo (VY ≥ VX), si no 0 |
| `8XY6` SHR | El bit que salió por la derecha |
| `8XYE` SHL | El bit que salió por la izquierda |
| `DXYN` DRW | 1 si algún píxel encendido se apagó (colisión), si no 0 |
| `8XY1`/`8XY2`/`8XY3` | 0, solo si el quirk `vfReset` está activo (por defecto sí) |

Por eso la regla práctica es: **no guardes datos en VF**. Usalo solo para leer el flag
inmediatamente después de la instrucción que lo produjo.

**Orden de escritura.** Cuando una instrucción escribe VX *y* VF, este emulador escribe
**VF al final**. Si X es F (por ejemplo `8FE4`, `ADD VF, VE`), el resultado de la
operación se pierde y VF queda con el flag. Es lo que hacía el VIP y lo que esperan las
suites de test modernas.

### 4.3 I, el registro índice

`I` guarda una dirección de memoria. Lo usan las instrucciones que leen o escriben
memoria: `DXYN` (lee el sprite), `FX33` (escribe BCD), `FX55`/`FX65` (guardan y cargan
registros). Se carga con `ANNN` (una dirección de 12 bits), se incrementa con `FX1E`,
y `FX29` lo apunta al glifo de un dígito de la fuente. SUPER-CHIP agrega `FX30`, que lo
apunta a un dígito de la fuente grande; XO-CHIP lo usa también en `5XY2`/`5XY3` y en
`F002`, y lo carga con 16 bits con `F000 NNNN` (`LD I, LONG`).

En el VIP, `I` era el registro RA del 1802, de 16 bits. En este emulador `I` se guarda
con 16 bits (`I & 0xFFFF`) y, con CHIP-8 y SUPER-CHIP, cada acceso a memoria usa
`I & 0xFFF`, así que un `I` "desbordado" por `FX1E` sigue funcionando, dando la vuelta
dentro de los 4 KB. Con XO-CHIP, cada acceso usa los 16 bits de `I` y llega a toda la
memoria de 64 KB.

### 4.4 PC, el contador de programa

El PC tiene la dirección de la próxima instrucción. El programa no puede leerlo ni
escribirlo directamente: solo lo modifican los saltos (`1NNN`, `BNNN`), las llamadas y
retornos (`2NNN`, `00EE`) y los *skips*. Arranca en `0x200`. En el VIP era el registro
R5 del 1802; en este emulador se mantiene siempre en el rango `0x000`–`0xFFF`
(`0x0000`–`0xFFFF` con XO-CHIP).

### 4.5 La pila y SP

La pila guarda las **direcciones de retorno** de las subrutinas. `2NNN` (CALL) apila la
dirección de la instrucción siguiente y salta; `00EE` (RET) desapila y vuelve. El
programa no puede apilar datos propios: la pila solo sirve para CALL/RET.

```
 programa:                               pila después de cada paso
 0x200  CALL 0x300   ; apila 0x202       [0x202]                   SP = 1
 ...
 0x300  CALL 0x400   ; apila 0x302       [0x202, 0x302]            SP = 2
 ...
 0x400  RET          ; desapila 0x302    [0x202]                   SP = 1
 0x302  RET          ; desapila 0x202    []                        SP = 0
```

En este emulador la pila es `stack: Uint16Array(16)` y `sp` indica **cuántas**
direcciones hay guardadas (de 0 a 16); la de arriba es `stack[sp - 1]`. Admite **16
niveles** de anidamiento. Un `CALL` con la pila llena o un `RET` con la pila vacía
detienen la máquina con un error (no corrompen memoria). El monitor muestra la pila en
el recuadro PILA. Para depurar subrutinas, la consola tiene **Por encima** (O), que con
el PC en un `CALL` ejecuta la subrutina entera y se detiene en la instrucción siguiente,
y **Salir** (K), que corre hasta que vuelve la subrutina en la que está el PC. Los dos
miran el nivel de la pila, no solo la dirección: una subrutina recursiva que pasa otra
vez por la misma dirección, más adentro, no los detiene.

> **Diferencia con el VIP.** El intérprete del VIP reservaba 48 bytes para la pila,
> que también usaba para sus propias cuentas; alcanzaban para **12 niveles** de
> llamadas anidadas. SUPER-CHIP y la mayoría de los intérpretes
> modernos ofrecen 16. Un programa que use más de 12 niveles no va a funcionar bien en
> un VIP real; si querés compatibilidad total, no anides más de 12 llamadas.

> **Diferencia con Octo.** El emulador de Octo también se detiene, con un aviso de
> desbordamiento, cuando un `CALL` encuentra 12 niveles ocupados. La especificación de
> XO-CHIP pide 16 niveles, con un error al desbordar o al vaciar la pila, y eso hace este
> emulador en las tres plataformas.

### 4.6 DT y ST, los timers

Dos registros de 8 bits que el hardware (en el VIP, la rutina de interrupción de video)
decrementa 60 veces por segundo hasta llegar a 0: **DT** (*delay timer*, timer de
retardo) y **ST** (*sound timer*, timer de sonido). Los explica la sección siguiente.

### 4.7 El estado completo de la máquina en este emulador

Para depurar (desde el monitor o desde la consola de JavaScript del navegador, con
`window.chip8.cpu`) te sirve saber qué representa cada campo del objeto `Chip8`:

| Campo | Tipo | Significado |
|---|---|---|
| `platform` | texto | La plataforma: `'chip8'`, `'schip'` o `'xochip'` (se cambia con `setPlatform`; [13.3](#133-las-plataformas-de-este-emulador)) |
| `memory` | `Uint8Array` | La memoria: 4096 bytes (65.536 con XO-CHIP) |
| `V` | `Uint8Array(16)` | V0–VF |
| `I` | número | Registro índice (16 bits) |
| `pc` | número | Contador de programa (12 bits; 16 con XO-CHIP) |
| `stack`, `sp` | `Uint16Array(16)`, número | Pila y cantidad de elementos |
| `delayTimer`, `soundTimer` | número 0–255 | DT y ST |
| `display` | `Uint8Array` | Pantalla, fila por fila: índice = `y * displayWidth + x`. Cada valor es una máscara de planos: 0 o 1 (de 0 a 3 con XO-CHIP; [13.6](#136-planos-y-colores)) |
| `displayWidth`, `displayHeight`, `hires` | números, booleano | La resolución actual: 64 × 32 o 128 × 64 ([13.5](#135-alta-y-baja-resolución)) |
| `planes` | número 0–3 | Los planos elegidos con `FN01` (siempre 1 fuera de XO-CHIP) |
| `flags` | `Uint8Array(16)` | Las banderas RPL de `FX75`/`FX85` ([13.8](#138-las-banderas-rpl)) |
| `audioPattern`, `audioPatternSet`, `pitch` | `Uint8Array(16)`, booleano, número | El patrón de audio de XO-CHIP, si `F002` ya lo cargó desde el último reinicio, y el tono ([13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)) |
| `keys` | `Uint8Array(16)` | 1 = tecla apretada |
| `quirks` | objeto | Los seis quirks (sección [11](#11-quirks)) |
| `waitingForKey` | booleano | `true` mientras un `FX0A` espera una tecla |
| `halted`, `error`, `errorInfo` | booleano, texto, objeto | Máquina detenida, el mensaje de error y sus datos (`kind`, `opcode`, `addr` y, en un error de plataforma, `needs`) |
| `exited` | booleano | `true` si la máquina se detuvo por `00FD`: el programa terminó, sin error |
| `hint` | objeto o `null` | La primera instrucción de otra plataforma que se ignoró desde el último reinicio ([11.10](#1110-diagnósticos-de-plataforma)) |

El arreglo `display` se reemplaza por otro cuando cambia la resolución: si lo mirás desde
la consola de JavaScript, volvé a leer `cpu.display` en lugar de guardarlo.

Para el depurador, el objeto tiene además, fuera del estado de la máquina (no se guardan
con los estados ni se rebobinan), el mapa de accesos `access` (qué hizo el programa con
cada dirección: ejecutarla, leerla, escribirla), la traza (`cpu.trace()`: las últimas 1024
instrucciones), los últimos 16 dibujos (`cpu.spriteLog()`), los puntos de corte
(`setBreakpoint`, `breakpoints`) y `debugStop`, que dice dónde y por qué se detuvo el
último frame: en un punto de corte o en la instrucción que buscaban **Por encima**,
**Salir** o **Hasta acá**. Los detalles están en [DESARROLLO.md](DESARROLLO.md).

---

## 5. Timers de retardo y sonido

### 5.1 Cómo cuentan

CHIP-8 tiene dos timers de 8 bits:

| Timer | Se escribe con | Se lee con | Efecto mientras es mayor que 0 |
|---|---|---|---|
| **DT** (retardo) | `FX15` (`LD DT, VX`) | `FX07` (`LD VX, DT`) | Ninguno: solo baja |
| **ST** (sonido) | `FX18` (`LD ST, VX`) | no se puede leer | Suena el buzzer |

Los dos bajan de a uno **60 veces por segundo** hasta llegar a 0, y ahí se quedan. En
el VIP, la rutina de interrupción que el chip de video dispara en cada cuadro (60 por
segundo, controlado por cristal) decrementaba los dos contadores; el manual dice que
cargar `0xFF` tarda "unos 4 segundos" en llegar a 0 (255/60 ≈ 4,25 s).

Los timers **no dependen de la velocidad del intérprete**: en este emulador bajan a
60 Hz aunque cambies las instrucciones por frame.

### 5.2 Usar DT para medir el tiempo

El uso más simple es una espera activa:

```asm
; Esperar aproximadamente un segundo (60 tics de 1/60 s)
        LD   V0, 60
        LD   DT, V0
espera: LD   V0, DT
        SE   V0, 0          ; ¿llegó a 0?
        JP   espera         ; todavía no
```

Un patrón más útil para juegos es usar DT como **metrónomo del bucle principal**: así
el juego avanza siempre a la misma velocidad, aunque el emulador ejecute más o menos
instrucciones por frame.

```asm
bucle:  LD   V0, DT
        SE   V0, 0
        JP   bucle          ; esperar a que termine el tic anterior
        LD   V0, 2
        LD   DT, V0         ; el próximo paso del juego, dentro de 2/60 s
        ; ... leer teclas, mover, dibujar ...
        JP   bucle
```

### 5.3 El buzzer

Mientras ST es mayor que 0, suena un tono. CHIP-8 no tiene control de frecuencia ni de
volumen: hay un solo sonido, encendido o apagado. (XO-CHIP sí deja elegir cómo suena:
[13.10](#1310-el-audio-de-xo-chip-patrón-y-tono).)

En el VIP, la rutina de interrupción encendía la línea Q del 1802 mientras el timer de
sonido no fuera 0, y la línea Q activaba un circuito generador de tono conectado a un
pequeño parlante (y la luz "Q" de la placa). La frecuencia la fijaba una red RC del
circuito; el manual explica cómo cambiar un componente para ajustarla "a tu gusto", así
que no había una frecuencia estándar. Como decía Cowgod, la frecuencia del tono la
decide quien escribe el intérprete.

> **Diferencia con el VIP.** El manual del VIP aclara que el valor mínimo al que
> responde el parlante es `0x02`: con `ST = 1` no se oye nada. Este emulador hace sonar
> el beep siempre que ST sea mayor que 0, así que `ST = 1` produce un pitido muy corto
> (1/60 s).

En este emulador el beep es una **onda cuadrada de 440 Hz generada con Web Audio**,
salvo que un programa de XO-CHIP haya cargado un patrón de audio: desde ese momento
suena el patrón ([13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)). Mientras suena se
prende la luz SONIDO de la consola. En **Pantalla y sonido**, en la pestaña **Ajustes**
del cajón de opciones (la tecla M), hay un interruptor **Silencio** y un control de
**Volumen**. Los navegadores no permiten reproducir sonido hasta que el usuario
interactúa con la página, así que el beep se habilita con el primer clic o la primera
tecla.

```asm
; Un "bip" de 10/60 s (≈ 0,17 s)
        LD   V0, 10
        LD   ST, V0
```

### 5.4 Los timers mientras se espera una tecla o en pausa

- Mientras un `FX0A` espera una tecla, la ejecución de instrucciones se detiene, pero
  **los timers siguen bajando**, igual que en el VIP (su rutina de interrupción seguía
  corriendo).
- Con el emulador en **pausa** no se ejecutan frames, así que los timers quedan
  congelados y el beep se calla. El botón **Paso** ejecuta una instrucción sin
  tocarlos; el botón **Frame** ejecuta un frame entero, que incluye un tic de los
  timers.
- Un **punto de corte** detiene la máquina en el medio de un frame, antes del tic: los
  timers bajan recién cuando ese frame se completa, al seguir. Entre un tic y el
  siguiente el programa ejecuta las mismas instrucciones que sin el punto de corte
  ([2.3](#23-el-modelo-de-frame-de-este-emulador)).

---

## 6. Pantalla

### 6.1 Resolución y coordenadas

La pantalla tiene **64 × 32 píxeles monocromos**: cada píxel está encendido o apagado.
El origen `(0, 0)` es la esquina superior izquierda; `x` crece hacia la derecha y `y`
hacia abajo.

```
       x = 0                                                         x = 63
 y = 0  +----------------------------------------------------------------+
        |(0,0)                                                    (63,0) |
        |                                                                |
        |                        64 x 32 píxeles                         |
        |                                                                |
        |(0,31)                                                  (63,31) |
 y = 31 +----------------------------------------------------------------+
```

Esa es la pantalla de CHIP-8. SUPER-CHIP y XO-CHIP agregan un modo de alta resolución de
**128 × 64**, y XO-CHIP, un segundo plano de dibujo que da cuatro colores: secciones
[13.5](#135-alta-y-baja-resolución) y [13.6](#136-planos-y-colores).

Los colores son una decisión de presentación: el VIP mostraba puntos blancos sobre fondo
negro. Este emulador escala la imagen por un número entero, así que cada píxel CHIP-8 es
un cuadrado nítido del mismo tamaño que los demás. En **Pantalla y sonido**, en la
pestaña **Ajustes** del cajón de opciones, ofrece cuatro paletas (verde fósforo, ámbar,
blanco y LCD), una **Personalizada**, en la que elegís los colores vos, y la **Del
cartucho**, que aparece cuando un juego trae sus propios colores
([11.11](#1111-ajustes-por-cartucho)). Cada paleta tiene cuatro colores: el fondo, el de
los píxeles encendidos (el plano 1) y dos que solo usa XO-CHIP, el del plano 2 y el de
los píxeles encendidos en los dos planos. También ofrece dos **modos de pantalla**:

| Modo | Cómo se ve |
|---|---|
| **Tubo CRT** (por defecto) | Imita una pantalla de tubo: resplandor alrededor de los píxeles, estela del fósforo (la *persistencia* de [6.5](#65-el-parpadeo)), líneas de barrido (*scanlines*), viñeta y reflejo del vidrio. La persistencia y las scanlines tienen su propio interruptor. Con la paleta LCD no hay resplandor y, en lugar de scanlines, se ve la grilla de celdas de una pantalla de cristal líquido |
| **Píxeles puros** | Píxeles cuadrados y nítidos, solo con los colores de la paleta (dos, o hasta cuatro con XO-CHIP): sin estela, resplandor, scanlines, viñeta ni reflejo. Cada cuadro muestra exactamente lo que hay en la pantalla de la máquina |

En **Píxeles puros** los interruptores Scanlines y Persistencia quedan deshabilitados,
pero guardan lo que elegiste para cuando vuelvas al tubo. El modo es solo de
presentación: no cambia nada de lo que ve el programa.

### 6.2 Sprites

La única forma de dibujar es `DXYN` (`DRW VX, VY, N`): dibuja un **sprite** de
**8 píxeles de ancho** y **N filas de alto** (N de 1 a 15), leyendo N bytes de memoria
a partir de la dirección `I`. Cada byte es una fila, y el bit más significativo es el
píxel de la izquierda. (Con N = 0, SUPER-CHIP y XO-CHIP dibujan un sprite de 16 × 16:
ficha [DXY0](#dxy0--drw-vx-vy-0).)

```
 dirección  byte   bits        píxeles
 I + 0      0x3C   00111100    ..####..
 I + 1      0x7E   01111110    .######.
 I + 2      0xFF   11111111    ########
 I + 3      0x7E   01111110    .######.
 I + 4      0x3C   00111100    ..####..
```

```asm
        LD   I, pelota
        LD   V0, 28         ; x
        LD   V1, 13         ; y
        DRW  V0, V1, 5      ; dibuja las 5 filas en (28, 13)
fin:    JP   fin
pelota: DB   0x3C, 0x7E, 0xFF, 0x7E, 0x3C
```

Para dibujar algo más grande que 8 píxeles de ancho, se dibujan varios sprites uno al
lado del otro.

En la consola, la pestaña **Sprites** del monitor dibuja los bytes a los que apunta `I`
como los dibujaría el próximo `DXYN` (con el alto del último, o con el que elijas), con cada
fila en hexadecimal y en bits, y lista los últimos 16 dibujos: desde qué dirección, en qué
lugar de la pantalla, de qué tamaño y si chocaron.

### 6.3 XOR y detección de colisiones

El sprite no se "pega" sobre la pantalla: cada píxel del sprite se combina con el de
la pantalla mediante **XOR** (o exclusivo):

| Píxel en pantalla | Bit del sprite | Resultado | ¿Colisión? |
|:---:|:---:|:---:|:---:|
| 0 | 0 | 0 | no |
| 0 | 1 | 1 | no |
| 1 | 0 | 1 | no |
| 1 | 1 | **0** | **sí** |

Consecuencias:

- **Dibujar dos veces lo mismo en el mismo lugar lo borra.** Así se mueve un objeto:
  se lo dibuja en la posición vieja (lo que lo borra), se actualizan las coordenadas y
  se lo dibuja en la nueva.
- **VF informa colisiones.** Después de `DXYN`, VF vale 1 si algún píxel que estaba
  encendido se apagó, y 0 si no. Es una detección a nivel de píxel, muy barata, que los
  juegos usan para saber si la pelota tocó la paleta o si un disparo pegó en un
  enemigo.
- **Cuidado con los falsos positivos.** Borrar un sprite también pone VF en 1 (sus
  píxeles se apagan). La costumbre es mirar VF solo después del dibujo en la posición
  nueva.

### 6.4 Bordes: coordenadas que dan la vuelta, clipping y wrapping

Hay que distinguir dos cosas:

1. **La posición inicial siempre da la vuelta.** Las coordenadas se toman módulo el
   tamaño de la pantalla: `x0 = VX % 64`, `y0 = VY % 32`. Dibujar en `x = 70` es lo
   mismo que dibujar en `x = 6`, y en `y = 32` es lo mismo que en `y = 0`. (En alta
   resolución, módulo 128 y 64.)
2. **Lo que se sale por la derecha o por abajo depende del quirk `clipping`.** Si un
   sprite empieza cerca del borde, los píxeles que quedan afuera se **recortan**
   (*clipping*, lo que hacía el VIP) o **aparecen del otro lado** (*wrapping*, lo que
   hace XO-CHIP).

```
 Sprite de 8 píxeles de ancho (########) dibujado en x = 60:

 clipping activado (VIP)                    clipping desactivado (XO-CHIP)
 x:  0 1 2 3 . . . 60 61 62 63              x:  0 1 2 3 . . . 60 61 62 63
     . . . .        #  #  #  #                  # # # #        #  #  #  #
     las 4 columnas que sobran                  las 4 columnas que sobran
     no se dibujan                              aparecen a la izquierda
```

Lo mismo vale verticalmente con las filas que pasan de `y = 31`. Los píxeles recortados
no se dibujan y **nunca cuentan como colisión**.

El análisis de Scotford confirma los dos comportamientos en el VIP: las partes de un
sprite que se salen por la derecha o por abajo no se muestran, pero un sprite que
empieza completamente afuera "da la vuelta" (`y = 0x20` equivale a `y = 0`).

### 6.5 El parpadeo

Muchísimos juegos de CHIP-8 **parpadean**. No es un defecto del emulador sino una
consecuencia de cómo se dibuja:

- Para mover un objeto hay que borrarlo (un `DRW`) y volver a dibujarlo (otro `DRW`).
  Si la pantalla se muestra justo entre los dos, en ese cuadro el objeto no está.
- El programa no tiene forma de dibujar "fuera de pantalla" y mostrar todo junto: no
  hay doble buffer, y la pantalla se ve continuamente.
- En el VIP, además, cada `DXYN` esperaba al siguiente cuadro de video (el quirk
  `displayWait`), así que el borrado y el nuevo dibujo quedan en cuadros distintos: un
  objeto que se mueve en cada paso puede pasar hasta la mitad de los cuadros invisible.
  Cuantos más objetos se mueven, más se nota.

Los programadores lo atenúan borrando y redibujando cada objeto lo más juntos posible
y moviendo solo lo que cambia. Este emulador ofrece además, en el modo **Tubo CRT**,
una opción de **persistencia** (anti-parpadeo, prendida por defecto): los píxeles que
se apagan se desvanecen de a poco, como el fósforo de un tubo de rayos catódicos, y el
ojo deja de notar los cuadros en los que un sprite faltó. La estela se termina de
apagar aunque la máquina esté en pausa o detenida por un error, hasta que la imagen
coincide con la pantalla real. Es puramente visual: no cambia en nada el estado de la
pantalla que ve el programa. Si querés ver cada cuadro tal como es, con el parpadeo
incluido, apagala o elegí el modo **Píxeles puros**.

### 6.6 Cómo lo mostraba el VIP

El VIP generaba la imagen con el chip **CDP1861**, que leía por DMA un bloque de 256
bytes de RAM (64 × 32 bits = 2048 bits = 256 bytes) en cada cuadro. Cada fila de 8
bytes se mostraba en cuatro líneas de barrido consecutivas, y así las 32 filas llenaban
la imagen. El sincronismo vertical era de 60 Hz y el horizontal de 15.720 Hz. Atender
el video consumía casi la mitad del tiempo de CPU disponible, un dato clave para
entender por qué el intérprete era lento (sección [12](#12-temporización)).

El 1861 podía mostrar hasta 64 × 128 puntos (el manual incluye un programa en lenguaje
de máquina que usa 64 × 64), pero CHIP-8 usa siempre 64 × 32.

---

## 7. Teclado hexadecimal

### 7.1 El teclado del COSMAC VIP

El VIP tenía un teclado de **16 teclas**, una por cada dígito hexadecimal, con esta
disposición:

```
 +---+---+---+---+
 | 1 | 2 | 3 | C |
 +---+---+---+---+
 | 4 | 5 | 6 | D |
 +---+---+---+---+
 | 7 | 8 | 9 | E |
 +---+---+---+---+
 | A | 0 | B | F |
 +---+---+---+---+
```

Fijate que 2, 4, 6 y 8 quedan arriba, a la izquierda, a la derecha y abajo del 5: por
eso muchísimos juegos usan **2/4/6/8 como flechas** (el *Kaleidoscope* del manual del
VIP, por ejemplo, se maneja así).

### 7.2 El mapeo en tu computadora

Este emulador asigna las teclas por **posición física** (`KeyboardEvent.code`), así que
el mapeo es el mismo con cualquier distribución de teclado (QWERTY, AZERTY, etc.). El
bloque 4×4 de la izquierda del teclado reproduce la forma del teclado del VIP:

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

| Tecla CHIP-8 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tecla de la PC | X | 1 | 2 | 3 | Q | W | E | A | S | D | Z | C | 4 | R | F | V |

Con este mapeo, las "flechas" 2/4/6/8 quedan en **2, Q, E y S**. También podés usar el
**keypad en pantalla**: con el mouse o con los dedos (admite varias teclas a la vez), o
llegando a una tecla con Tab y apretándola con Enter o Espacio, que la mantienen
apretada hasta que los soltás (como mínimo 120 ms, para que el programa llegue a
leerla). Si la activa un lector de pantalla o el control por voz, la tecla queda
apretada 120 ms y se suelta sola.

Los atajos de la consola no chocan con ninguna tecla del mapeo:

| Atajo | Acción |
|---|---|
| Espacio | Pausa / continuar |
| N | Paso: ejecutar una sola instrucción (y dejar la máquina en pausa) |
| O | Paso por encima: si la instrucción es un `CALL`, ejecutar la subrutina entera y detenerse en la siguiente |
| K | Salir de la subrutina: seguir hasta que la subrutina en la que está el PC vuelve con `RET` |
| Retroceso (Backspace) | Reiniciar la ROM |
| H (o el botón **?**) | Abrir o cerrar la ayuda |
| L (o el botón **Archivo**, en la pestaña «Cartuchos» del cajón) | Abrir o cerrar la ventana del archivo de la comunidad |
| T, mantenida | Avance rápido |
| P | Pantalla completa |
| G | Guardar una captura de la pantalla (PNG) |
| Y (o el botón del lápiz) | Abrir o cerrar el Taller |
| M (o el botón de los deslizadores, arriba) | Abrir o cerrar el cajón de opciones: cartuchos, ajustes y estados |
| I | Guardar el estado en la ranura rápida |
| U | Cargar el estado de la ranura rápida |
| B, mantenida | Rebobinar |
| Flechas | Las teclas del keypad que elegiste en «Controles» (en «Ajustes») |
| Esc | Cerrar diálogos y el cajón de opciones |

Los botones, interruptores y enlaces que tocás con el mouse o con el dedo no se quedan
con el foco, así que **Espacio** siempre pausa. Si llegás a un control con **Tab**, en
cambio, Espacio y Enter lo activan (no pausan). Las teclas del keypad y los atajos de
letra van a la consola aunque haya un control enfocado, incluso un selector; solo los
campos donde se escribe, como el número de IPF o el editor del Taller, se quedan con las
teclas. Mientras está abierta una ventana (la ayuda, el archivo de la comunidad o la
lista de estados), las teclas son de esa ventana y no le llegan a la máquina.

### 7.3 Leer el teclado sin detenerse: EX9E y EXA1

`EX9E` (`SKP VX`) saltea la instrucción siguiente si la tecla cuyo número está en VX
está apretada; `EXA1` (`SKNP VX`) la saltea si **no** lo está. Solo se usa el dígito
hexadecimal bajo de VX (`VX & 0xF`), como aclara el manual del VIP. No esperan nada:
consultan el estado en ese instante, así que sirven para juegos en tiempo real, donde
se revisan las teclas en cada vuelta del bucle.

```asm
; Mover V0 (x) con las teclas 4 (izquierda) y 6 (derecha)
        LD   V2, 4
        SKNP V2             ; si la tecla 4 NO está apretada, saltear el ADD
        ADD  V0, -1
        LD   V2, 6
        SKNP V2
        ADD  V0, 1
```

El manual del VIP advierte que, por la forma en que su hardware lee el teclado,
conviene apretar una sola tecla a la vez. En este emulador podés mantener varias
apretadas y cada `EX9E`/`EXA1` consulta la suya.

### 7.4 Esperar una tecla: FX0A

`FX0A` (`LD VX, K`) **detiene la ejecución** hasta que se aprieta una tecla, y guarda
su número en VX. Sirve para menús, pausas y programas por turnos.

En el VIP, el manual lo describe así: espera a que se apriete una tecla, pone su valor
en VX y **la ejecución continúa cuando la tecla se suelta**. Además se escucha un tono
mientras la tecla está apretada; según Scotford, es un efecto secundario de que la
rutina usa el timer de sonido para eliminar el rebote de las teclas.

Este emulador implementa la semántica de "apretar y soltar" del VIP:

1. Al ejecutar `FX0A`, el PC avanza, se activa `waitingForKey` y se recuerda X.
2. Mientras espera, no se ejecuta ninguna instrucción (los timers siguen bajando).
3. La primera tecla que pasa de suelta a apretada **después** de empezar la espera
   queda elegida. Si una tecla ya estaba apretada al empezar la espera, no cuenta hasta
   que la sueltes y la vuelvas a apretar.
4. Cuando **esa** tecla se suelta, VX recibe su número y la ejecución continúa.

Mientras espera, la consola muestra el cartel ESPERANDO TECLA sobre la pantalla, la luz
RUN parpadea y el monitor dice «Esperando tecla».

```
 tiempo  ───────────────────────────────────────────────────────────────►
 FX0A      ejecutada
 tecla 5               apretada ───────────────────────── soltada
 esperando  sí ────────────────────────────────────────────────┐ no
 V[X]                                                           = 5
 programa  detenido ────────────────────────────────────────────► sigue
```

> **Diferencia con el VIP.** El núcleo de este emulador no usa el timer de sonido
> durante `FX0A`, así que no reproduce el tono que el VIP emitía mientras la tecla
> estaba apretada.

Por qué importa esperar a que se suelte: si `FX0A` terminara apenas se aprieta la
tecla, un programa que hace dos `FX0A` seguidos leería la misma pulsación dos veces.
Es un error común en emuladores, y la suite de tests de Timendus lo detecta
específicamente.

---

## 8. Fuente hexadecimal

### 8.1 Dónde vive la fuente

Para mostrar números, CHIP-8 trae **16 glifos**, los dígitos `0`–`F`, de 4 píxeles de
ancho por 5 de alto. Cada uno ocupa 5 bytes (una fila por byte; los 4 bits bajos de
cada byte son siempre 0), 80 bytes en total. `FX29` (`LD F, VX`) apunta `I` al glifo
del dígito bajo de VX, y después se lo dibuja con `DRW VX, VY, 5`.

En **este emulador** la fuente está en la RAM, en `0x050`–`0x09F` (`FONT_ADDR`). Es la
ubicación que se volvió costumbre entre los emuladores modernos; en principio podría
estar en cualquier lugar de `0x000`–`0x1FF`, que ningún programa debería usar. Como
está en RAM, un programa podría modificarla. Con SUPER-CHIP y XO-CHIP hay además una
fuente grande, de 8 × 10, en `0x0A0`–`0x13F` ([13.7](#137-la-fuente-grande)).

> **Diferencia con el VIP.** En el VIP los dígitos estaban en la **ROM del sistema
> operativo**, en la página `0x81xx`. `FX29` usaba una tabla de 16 bytes en
> `0x8100`–`0x810F` con la dirección baja de cada glifo, y dejaba `I` apuntando a la
> ROM, fuera de los 4 KB que un programa CHIP-8 puede direccionar con `ANNN`. Un
> programa que suponga que la fuente está en una dirección fija no es portable.

> **Diferencia con Octo.** Octo guarda la fuente chica en `0x000` y la grande a
> continuación, en `0x050`. Otra razón para no suponer direcciones fijas: pedile siempre
> la dirección del glifo al intérprete, con `FX29` (y `FX30` para la grande).

### 8.2 Los 16 glifos

Esta es la fuente estándar que usan este emulador y la mayoría de los modernos (la
misma que publica la referencia de Cowgod y la que trae Octo). La columna izquierda de
cada glifo es el byte y la derecha el dibujo (`#` = píxel encendido):

```
      0            1            2            3
 F0  ####     20  ..#.     F0  ####     F0  ####
 90  #..#     60  .##.     10  ...#     10  ...#
 90  #..#     20  ..#.     F0  ####     F0  ####
 90  #..#     20  ..#.     80  #...     10  ...#
 F0  ####     70  .###     F0  ####     F0  ####

      4            5            6            7
 90  #..#     F0  ####     F0  ####     F0  ####
 90  #..#     80  #...     80  #...     10  ...#
 F0  ####     F0  ####     F0  ####     20  ..#.
 10  ...#     10  ...#     90  #..#     40  .#..
 10  ...#     F0  ####     F0  ####     40  .#..

      8            9            A            B
 F0  ####     F0  ####     F0  ####     E0  ###.
 90  #..#     90  #..#     90  #..#     90  #..#
 F0  ####     F0  ####     F0  ####     E0  ###.
 90  #..#     10  ...#     90  #..#     90  #..#
 F0  ####     F0  ####     90  #..#     E0  ###.

      C            D            E            F
 F0  ####     E0  ###.     F0  ####     F0  ####
 80  #...     90  #..#     80  #...     80  #...
 80  #...     90  #..#     F0  ####     F0  ####
 80  #...     90  #..#     80  #...     80  #...
 F0  ####     E0  ###.     F0  ####     80  #...
```

La misma información en forma de tabla, con la dirección donde queda cada glifo en este
emulador:

| Dígito | Bytes | Dirección | Dígito | Bytes | Dirección |
|:---:|---|:---:|:---:|---|:---:|
| 0 | `F0 90 90 90 F0` | `0x050` | 8 | `F0 90 F0 90 F0` | `0x078` |
| 1 | `20 60 20 20 70` | `0x055` | 9 | `F0 90 F0 10 F0` | `0x07D` |
| 2 | `F0 10 F0 80 F0` | `0x05A` | A | `F0 90 F0 90 90` | `0x082` |
| 3 | `F0 10 F0 10 F0` | `0x05F` | B | `E0 90 E0 90 E0` | `0x087` |
| 4 | `90 90 F0 10 10` | `0x064` | C | `F0 80 80 80 F0` | `0x08C` |
| 5 | `F0 80 F0 10 F0` | `0x069` | D | `E0 90 90 90 E0` | `0x091` |
| 6 | `F0 80 F0 90 F0` | `0x06E` | E | `F0 80 F0 80 F0` | `0x096` |
| 7 | `F0 10 20 40 40` | `0x073` | F | `F0 80 F0 80 80` | `0x09B` |

### 8.3 Cómo calcula la dirección FX29

En este emulador:

```
I ← 0x050 + (V[X] & 0xF) × 5
```

Solo importa el dígito hexadecimal bajo de VX: si V3 vale `0x2B`, `LD F, V3` apunta al
glifo `B` (`0x087`). La fuente grande tiene su propia instrucción, `FX30`, que hace lo
mismo con glifos de 10 bytes ([FX30](#fx30--ld-hf-vx)).

### 8.4 La fuente original del VIP

El listado de la ROM que publica el manual del VIP (Apéndice B) permite reconstruir su
fuente. Once glifos coinciden con los de arriba, pero **cinco son distintos**: `1`, `4`,
`7`, `B` y `D`. Además, en la ROM los glifos se superponen entre sí para ahorrar bytes
(el final de uno es el principio de otro).

```
  1 (VIP)      4 (VIP)      7 (VIP)      B (VIP)      D (VIP)
 60  .##.     A0  #.#.     F0  ####     F0  ####     F0  ####
 20  ..#.     A0  #.#.     10  ...#     50  .#.#     50  .#.#
 20  ..#.     F0  ####     10  ...#     70  .###     50  .#.#
 20  ..#.     20  ..#.     10  ...#     50  .#.#     50  .#.#
 70  .###     20  ..#.     10  ...#     F0  ####     F0  ####
```

Estos bytes salen de una transcripción del listado impreso en el manual; si necesitás
exactitud absoluta, contrastalos con un volcado de la ROM. En la práctica, casi ningún
programa depende de la forma exacta de los dígitos, y este emulador usa la fuente
estándar moderna.

---

## 9. Formato de las instrucciones

### 9.1 Nibbles y campos

Cada instrucción es una palabra de 16 bits. Se la lee como **cuatro dígitos
hexadecimales** (cada dígito es un *nibble*, 4 bits). El primero indica el tipo de
instrucción y los demás son operandos:

```
  bits:  15    12 11     8 7      4 3      0
        +--------+--------+--------+--------+
        |  tipo  |   X    |   Y    |   N    |
        +--------+--------+--------+--------+
                 |<----------- NNN --------->|
                          |<------ NN ------>|
```

| Campo | Bits | Tamaño | Significado |
|---|---|---|---|
| tipo | 15–12 | nibble | Qué instrucción es (el primer dígito hex) |
| `X` | 11–8 | nibble | Número de registro (V0–VF) |
| `Y` | 7–4 | nibble | Número de otro registro |
| `N` | 3–0 | nibble | Un número de 0 a 15 (filas de un sprite, o subtipo) |
| `NN` | 7–0 | byte | Una constante de 0 a 255 (el manual del VIP la llama `KK`) |
| `NNN` | 11–0 | 12 bits | Una dirección de memoria (el manual del VIP la llama `MMM`) |
| `NNNN` | la palabra siguiente | 16 bits | Solo en `F000 NNNN` de XO-CHIP, la única instrucción de 4 bytes: una dirección de 16 bits |

Ejemplo: en `0xD01F` el tipo es `D` (dibujar), `X = 0`, `Y = 1` y `N = 0xF` = 15 filas:
`DRW V0, V1, 15`.

### 9.2 Decodificación por el primer nibble

| Primer nibble | Instrucciones | Cómo se distinguen | Además, en SUPER-CHIP y XO-CHIP |
|:---:|---|---|---|
| `0` | `00E0`, `00EE`, `0NNN` | Por el opcode completo | `00CN` y `00FB` a `00FF`; en XO-CHIP, también `00DN` |
| `1` | `1NNN` | — | — |
| `2` | `2NNN` | — | — |
| `3` | `3XNN` | — | — |
| `4` | `4XNN` | — | — |
| `5` | `5XY0` | El último nibble debe ser 0 | En XO-CHIP, `5XY2` y `5XY3` |
| `6` | `6XNN` | — | — |
| `7` | `7XNN` | — | — |
| `8` | `8XY0`–`8XY7`, `8XYE` | Por el último nibble (N) | — |
| `9` | `9XY0` | El último nibble debe ser 0 | — |
| `A` | `ANNN` | — | — |
| `B` | `BNNN` | — | — |
| `C` | `CXNN` | — | — |
| `D` | `DXYN` | — | Con N = 0, `DXY0` dibuja 16 × 16 |
| `E` | `EX9E`, `EXA1` | Por el último byte (NN) | — |
| `F` | `FX07`, `FX0A`, `FX15`, `FX18`, `FX1E`, `FX29`, `FX33`, `FX55`, `FX65` | Por el último byte (NN) | `FX30`, `FX75`, `FX85`; en XO-CHIP, también `F000 NNNN`, `FN01`, `F002` y `FX3A` |

En código, la decodificación se reduce a separar los campos con desplazamientos y
máscaras y hacer un `switch` sobre el primer nibble:

```js
const op  = (memory[pc] << 8) | memory[(pc + 1) & 0xFFF];
const x   = (op >> 8) & 0xF;
const y   = (op >> 4) & 0xF;
const n   = op & 0xF;
const nn  = op & 0xFF;
const nnn = op & 0xFFF;
switch (op >> 12) {
  case 0x1: pc = nnn; break;                        // JP NNN
  case 0x6: V[x] = nn; break;                       // LD VX, NN
  case 0x8: /* segundo switch sobre n */ break;
  // ...
}
```

### 9.3 Opcodes inválidos

En CHIP-8 hay combinaciones que no corresponden a ninguna instrucción: `5XYN` y `9XYN`
con N distinto de 0; `8XY8` a `8XYD` y `8XYF`; cualquier `EX??` que no sea `9E` o `A1`;
y cualquier `FX??` fuera de los nueve de la tabla.

SUPER-CHIP y XO-CHIP les dan sentido a algunas (las de la última columna de la tabla
anterior). Las demás siguen siendo inválidas en las tres plataformas, y también estas,
que se parecen a instrucciones de XO-CHIP pero no lo son: `5XYN` con N distinto de 0, 2
y 3; `FN01` con N mayor que 3; y `FX00` y `FX02` con X distinto de 0 (solo existen
`F000` y `F002`). Una instrucción de SUPER-CHIP o XO-CHIP en una plataforma que no la
tiene es otro caso: la consola la ignora con un aviso o detiene la máquina con un error
que dice qué plataforma hace falta ([11.10](#1110-diagnósticos-de-plataforma)).

En **este emulador**, un opcode inválido detiene la máquina: `halted` pasa a `true`, el
PC queda apuntando **a la instrucción culpable** y `error` guarda un mensaje en
castellano con el opcode y su dirección en hexadecimal. La consola muestra ese mensaje
sobre la pantalla y en el monitor, y lo anuncia una sola vez a los lectores de pantalla
(«Error: ...»). Lo mismo pasa con un `CALL` con la pila llena o un `RET` con la pila
vacía. Debajo del error, el monitor ofrece **Ver las últimas instrucciones**: la pestaña
**Traza**, con las instrucciones que llevaron hasta ahí y la culpable al final, en rojo.
El desensamblador muestra estos opcodes como `DW 0x5121` (una palabra de datos), y el
ensamblador acepta esa misma sintaxis. El desensamblador del monitor usa además los
mnemónicos de la plataforma elegida: con CHIP-8, `F130` se ve como `DW 0xF130`; con
SUPER-CHIP, como `LD HF, V1`.

Para seguir hay que reiniciar (**Reiniciar** o Retroceso): la ROM vuelve a empezar en
`0x200` y se respeta cómo venías ejecutándola justo antes del error. Si la máquina
estaba corriendo, arranca sola; si estaba en pausa o la venías ejecutando de a un
**Paso**, queda en pausa, lista para seguir de a una instrucción.

> **Diferencia con el VIP.** El intérprete original no validaba los opcodes. Por
> ejemplo, según el análisis de Scotford, todo el grupo `8XYN` se resuelve armando una
> instrucción de la ALU del 1802 a partir de N (`F1` = OR, `F2` = AND, `F3` = XOR,
> `F4` = ADD, `F5` = SD, `F6` = SHR, `F7` = SM, `FE` = SHL) y ejecutándola. Por eso las
> instrucciones `8XY3`, `8XY6`, `8XY7` y `8XYE` funcionaban aunque el manual no las
> documentara; con otros valores de N, el resultado dependía de qué instrucción del
> 1802 quedara armada. Detenerse con un mensaje claro es más útil para depurar.

---

## 10. Referencia completa de las 35 instrucciones

### 10.1 ¿31, 35 o 36 instrucciones?

El manual del VIP y el artículo de BYTE describen **31 instrucciones**. El intérprete
original ejecutaba además cuatro que no estaban documentadas: `8XY3` (XOR), `8XY6`
(SHR), `8XY7` (SUBN) y `8XYE` (SHL), que funcionaban por la forma en que el intérprete
resuelve el grupo `8XYN` (ver [9.3](#93-opcodes-inválidos)). Con ellas se llega a las
**35** que se cuentan hoy, incluyendo `0NNN`. La referencia de Cowgod dice "36", aunque
lista las mismas 35.

### 10.2 Tabla resumen

| Opcode | Mnemónico | Qué hace | VF | Quirk |
|---|---|---|---|---|
| `0NNN` | `SYS NNN` | Rutina en código máquina (VIP); acá se ignora | — | — |
| `00E0` | `CLS` | Borra la pantalla | — | — |
| `00EE` | `RET` | Vuelve de una subrutina | — | — |
| `1NNN` | `JP NNN` | Salta a NNN | — | — |
| `2NNN` | `CALL NNN` | Llama a la subrutina en NNN | — | — |
| `3XNN` | `SE VX, NN` | Saltea la siguiente si VX = NN | — | — |
| `4XNN` | `SNE VX, NN` | Saltea la siguiente si VX ≠ NN | — | — |
| `5XY0` | `SE VX, VY` | Saltea la siguiente si VX = VY | — | — |
| `6XNN` | `LD VX, NN` | VX = NN | — | — |
| `7XNN` | `ADD VX, NN` | VX = VX + NN (sin acarreo) | — | — |
| `8XY0` | `LD VX, VY` | VX = VY | — | — |
| `8XY1` | `OR VX, VY` | VX = VX OR VY | 0 | `vfReset` |
| `8XY2` | `AND VX, VY` | VX = VX AND VY | 0 | `vfReset` |
| `8XY3` | `XOR VX, VY` | VX = VX XOR VY | 0 | `vfReset` |
| `8XY4` | `ADD VX, VY` | VX = VX + VY | acarreo | — |
| `8XY5` | `SUB VX, VY` | VX = VX − VY | no préstamo | — |
| `8XY6` | `SHR VX, VY` | VX = VY >> 1 | bit que sale | `shifting` |
| `8XY7` | `SUBN VX, VY` | VX = VY − VX | no préstamo | — |
| `8XYE` | `SHL VX, VY` | VX = VY << 1 | bit que sale | `shifting` |
| `9XY0` | `SNE VX, VY` | Saltea la siguiente si VX ≠ VY | — | — |
| `ANNN` | `LD I, NNN` | I = NNN | — | — |
| `BNNN` | `JP V0, NNN` | Salta a NNN + V0 | — | `jumping` |
| `CXNN` | `RND VX, NN` | VX = aleatorio AND NN | — | — |
| `DXYN` | `DRW VX, VY, N` | Dibuja un sprite de 8×N en (VX, VY) | colisión | `clipping`, `displayWait` |
| `EX9E` | `SKP VX` | Saltea la siguiente si la tecla VX está apretada | — | — |
| `EXA1` | `SKNP VX` | Saltea la siguiente si la tecla VX no está apretada | — | — |
| `FX07` | `LD VX, DT` | VX = DT | — | — |
| `FX0A` | `LD VX, K` | Espera una tecla y la guarda en VX | — | — |
| `FX15` | `LD DT, VX` | DT = VX | — | — |
| `FX18` | `LD ST, VX` | ST = VX | — | — |
| `FX1E` | `ADD I, VX` | I = I + VX | — | — |
| `FX29` | `LD F, VX` | I = glifo del dígito VX | — | — |
| `FX33` | `LD B, VX` | Guarda VX en decimal en I, I+1, I+2 | — | — |
| `FX55` | `LD [I], VX` | Guarda V0..VX en memoria desde I | — | `memory` |
| `FX65` | `LD VX, [I]` | Carga V0..VX desde memoria en I | — | `memory` |

En la columna VF, "—" significa que la instrucción no lo toca como flag (si X es F,
VF igual cambia porque es el registro destino). Los "0" de `8XY1`–`8XY3` valen solo con
`vfReset` activo.

Las 17 instrucciones que agregan SUPER-CHIP y XO-CHIP tienen su propia tabla y sus
fichas, con este mismo formato, en la sección
[13.11](#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip).

### 10.3 Cómo leer cada ficha

Cada instrucción tiene: su opcode y mnemónico, una línea con su efecto sobre VF y el
quirk relacionado, un **pseudocódigo** preciso (`←` es asignación; `&`, `|`, `^`, `>>`
y `<<` son las operaciones de bits habituales), una explicación, las diferencias con el
VIP cuando las hay, y un ejemplo en la sintaxis del ensamblador del proyecto. En los
pseudocódigos, "saltear" significa `PC ← PC + 2`; como el PC ya avanzó al leer la
instrucción, eso hace que la siguiente no se ejecute. Con XO-CHIP, saltear es saltear
la instrucción siguiente **entera**: si es `F000 NNNN`, son 4 bytes
([13.9](#139-la-memoria-de-64-kb-y-la-carga-larga)). Los pseudocódigos usan la pantalla
de 64 × 32 y la memoria de 4 KB de CHIP-8; qué cambia con las otras plataformas lo
explican [13.5](#135-alta-y-baja-resolución) (la pantalla de 128 × 64),
[13.6](#136-planos-y-colores) (los planos) y
[13.9](#139-la-memoria-de-64-kb-y-la-carga-larga) (las direcciones de 16 bits).

---

#### `0NNN` — SYS NNN

**Ejecutar una rutina en código máquina (en el VIP). En este emulador se ignora.**

**VF:** sin cambios · **Quirk:** ninguno

```
; COSMAC VIP:     ejecutar la subrutina en código máquina del 1802 que está en NNN
; este emulador:  nada
```

En el VIP, `0NNN` llamaba a una subrutina escrita en lenguaje de máquina del 1802,
ubicada en la dirección NNN. La subrutina debía terminar con el byte `D4` para devolver
el control al intérprete, que seguía con la instrucción CHIP-8 siguiente. Mientras
corría, el registro R5 del 1802 apuntaba a la siguiente instrucción CHIP-8, así que la
rutina podía leer "parámetros" de los bytes que seguían y avanzar R5 antes de volver.
Los programas que usan esta instrucción (a veces llamados *híbridos*) dependen del
hardware del VIP y no pueden correr en un intérprete que no emule el 1802.

En este emulador `0NNN` no hace nada para cualquier NNN que no sea `0E0` o `0EE` (que
son `CLS` y `RET`). Dos consecuencias prácticas:

- `0000` es `SYS 0x000`: la memoria vacía se ejecuta como una serie de instrucciones
  que no hacen nada.
- Las instrucciones de pantalla de SUPER-CHIP y XO-CHIP (`00CN`, `00DN` y `00FB` a
  `00FF`) también tienen la forma `0NNN`. Con una plataforma que las tiene, se ejecutan
  ([13.11](#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip)); con una que
  no, se ignoran como cualquier `0NNN`, pero la consola avisa la primera vez
  ([11.10](#1110-diagnósticos-de-plataforma)).

> **Diferencia con Octo.** En Octo, `0000` termina el programa y cualquier otro `0NNN`
> lo detiene con el aviso de que el código máquina no está soportado. Acá no hacen nada,
> en ninguna plataforma.

```asm
        SYS  0x300          ; en un VIP ejecutaría código 1802 en 0x300; acá no hace nada
```

---

#### `00E0` — CLS

**Borrar la pantalla.**

**VF:** sin cambios · **Quirk:** ninguno

```
para cada píxel (x, y):  display[y][x] ← 0
```

Apaga los 2048 píxeles (los 8192 en la alta resolución de SUPER-CHIP y XO-CHIP). No toca
registros, memoria ni timers. Es habitual al empezar un programa o al pasar de una
pantalla a otra. Con XO-CHIP borra solo los planos elegidos con `PLANE`
([13.6](#136-planos-y-colores)).

```asm
        CLS                 ; empezar con la pantalla en negro
```

---

#### `00EE` — RET

**Volver de una subrutina.**

**VF:** sin cambios · **Quirk:** ninguno

```
si SP = 0:  error (pila vacía), la máquina se detiene
SP ← SP − 1
PC ← pila[SP]
```

Desapila la dirección que guardó el último `CALL` y sigue desde ahí, es decir, en la
instrucción siguiente a ese `CALL`. Toda subrutina llamada con `CALL` debe terminar con
`RET`; el manual del VIP advierte que no hacerlo causa errores difíciles de encontrar.

Un `RET` sin ningún `CALL` pendiente es un error: este emulador se detiene con un
mensaje que indica el opcode y la dirección, y el PC queda apuntando al `RET`.

```asm
        CALL dibujar
fin:    JP   fin

dibujar:
        DRW  V0, V1, 5
        RET                 ; vuelve a la instrucción siguiente al CALL
```

---

#### `1NNN` — JP NNN

**Saltar a NNN.**

**VF:** sin cambios · **Quirk:** ninguno

```
PC ← NNN
```

El salto incondicional. Un salto a sí mismo (`fin: JP fin`) es la forma idiomática de
"terminar" un programa, porque CHIP-8 no tiene instrucción para detenerse. El manual
del VIP sugería el mismo truco como punto de parada para depurar.

```asm
bucle:  ; ... cuerpo del bucle principal ...
        JP   bucle
```

---

#### `2NNN` — CALL NNN

**Llamar a la subrutina que empieza en NNN.**

**VF:** sin cambios · **Quirk:** ninguno

```
si SP = 16:  error (pila llena), la máquina se detiene
pila[SP] ← PC          ; el PC ya apunta a la instrucción siguiente al CALL
SP ← SP + 1
PC ← NNN
```

Las subrutinas pueden llamar a otras (anidamiento). En este emulador hay 16 niveles;
el decimoséptimo `CALL` sin ningún `RET` en el medio detiene la máquina con un error de
desbordamiento de pila, dejando el PC en ese `CALL`. La recursión sin fin es la causa
típica.

> **Diferencia con el VIP.** El VIP admitía 12 niveles (48 bytes de pila). Ni el manual
> ni el análisis de Scotford mencionan un control de desbordamiento; como la pila vivía
> en la RAM, al lado del área de programa, pasarse de 12 niveles la haría invadir la
> memoria vecina.

```asm
; Fragmento: borrar_marcador, sumar_punto y dibujar_marcador son subrutinas
; de tu programa (cada una termina con RET).
        CALL borrar_marcador
        CALL sumar_punto
        CALL dibujar_marcador
```

---

#### `3XNN` — SE VX, NN

**Saltear la instrucción siguiente si VX es igual a NN.**

**VF:** sin cambios · **Quirk:** ninguno

```
si V[X] = NN:  PC ← PC + 2
```

CHIP-8 no tiene saltos condicionales: tiene **skips** condicionales. La forma de
escribir un "si ... entonces saltar" es un skip seguido de un `JP`. Como el skip se
saltea la instrucción siguiente cuando su condición se cumple, un skip seguido de `JP`
salta cuando la condición **no** se cumple: conviene leerlo como "si VX = NN, no hagas
lo que sigue". Con XO-CHIP, si lo que sigue es `F000 NNNN`, la saltea entera (4 bytes);
lo mismo vale para los otros cinco skips.

```asm
        LD   V0, 0
otra:   ADD  V0, 1
        SE   V0, 10         ; ¿ya van 10 vueltas?
        JP   otra           ; todavía no: repetir
```

---

#### `4XNN` — SNE VX, NN

**Saltear la instrucción siguiente si VX es distinto de NN.**

**VF:** sin cambios · **Quirk:** ninguno

```
si V[X] ≠ NN:  PC ← PC + 2
```

El complemento de `3XNN`. Muy usado para ejecutar una instrucción solo cuando un
registro tiene cierto valor.

```asm
        SNE  V0, 63         ; si V0 no llegó al borde derecho, saltear el LD
        LD   V0, 0          ; llegó: volver a la izquierda
```

---

#### `5XY0` — SE VX, VY

**Saltear la instrucción siguiente si VX es igual a VY.**

**VF:** sin cambios · **Quirk:** ninguno

```
si V[X] = V[Y]:  PC ← PC + 2
```

Igual que `3XNN`, pero compara dos registros. El último nibble tiene que ser 0: `5XY2` y
`5XY3` son `SAVE` y `LOAD` de XO-CHIP ([5XY2](#5xy2--save-vx-vy)), y los demás (`5XY1` y
`5XY4`–`5XYF`) son opcodes inválidos en las tres plataformas.

```asm
; Fragmento: seguir y gano son etiquetas de tu programa.
        SE   V0, V1         ; ¿el jugador está en la misma columna que la meta?
        JP   seguir
        JP   gano
```

---

#### `6XNN` — LD VX, NN

**Cargar la constante NN en VX.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
V[X] ← NN
```

La forma de poner un valor en un registro. El ensamblador acepta NN en decimal, hex o
binario, y también bytes negativos de −128 a −1 (en complemento a dos).

```asm
        LD   V0, 32         ; decimal
        LD   V1, 0x10       ; hexadecimal
        LD   V2, 0b1010     ; binario
        LD   V3, -1         ; se ensambla como 0xFF
```

---

#### `7XNN` — ADD VX, NN

**Sumar la constante NN a VX, sin acarreo.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
V[X] ← (V[X] + NN) & 0xFF
```

Suma módulo 256 y **no informa acarreo**: VF no cambia. Para restar se suma el
complemento a dos (`ADD V0, -1` es `70FF` y resta 1). Es la instrucción típica para
mover coordenadas y contar vueltas.

```asm
        ADD  V0, 1          ; x = x + 1
        ADD  V1, -2         ; y = y - 2
```

---

#### `8XY0` — LD VX, VY

**Copiar VY en VX.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
V[X] ← V[Y]
```

```asm
        LD   V5, V0         ; guardar una copia de x antes de modificarlo
```

---

#### `8XY1` — OR VX, VY

**VX = VX OR VY (bit a bit).**

**VF:** 0 si `vfReset` está activo · **Quirk:** [`vfReset`](#112-vfreset-las-operaciones-lógicas-ponen-vf-en-0)

```
V[X] ← V[X] | V[Y]
si quirks.vfReset:  V[F] ← 0
```

Enciende en VX los bits que estén encendidos en VY. Con el quirk `vfReset` (activo por
defecto, como en el VIP), VF queda en 0 después de la operación; sin el quirk, VF no se
toca (salvo que X sea F).

```asm
        LD   V1, 0b10000000
        OR   V0, V1         ; encender el bit 7 de V0
```

---

#### `8XY2` — AND VX, VY

**VX = VX AND VY (bit a bit).**

**VF:** 0 si `vfReset` está activo · **Quirk:** [`vfReset`](#112-vfreset-las-operaciones-lógicas-ponen-vf-en-0)

```
V[X] ← V[X] & V[Y]
si quirks.vfReset:  V[F] ← 0
```

Deja en VX solo los bits que están encendidos en los dos registros. Sirve como máscara
y como "módulo potencia de 2": `AND` con 63 deja un valor entre 0 y 63.

```asm
        LD   V1, 63
        AND  V0, V1         ; x = x mod 64: vuelve a entrar por la izquierda
```

---

#### `8XY3` — XOR VX, VY

**VX = VX XOR VY (bit a bit).**

**VF:** 0 si `vfReset` está activo · **Quirk:** [`vfReset`](#112-vfreset-las-operaciones-lógicas-ponen-vf-en-0)

```
V[X] ← V[X] ^ V[Y]
si quirks.vfReset:  V[F] ← 0
```

Invierte en VX los bits que estén encendidos en VY. No figuraba en el manual del VIP,
pero funcionaba.

```asm
        LD   V1, 1
        XOR  V2, V1         ; alternar V2 entre 0 y 1 (un "flip-flop")
```

---

#### `8XY4` — ADD VX, VY

**VX = VX + VY, con acarreo en VF.**

**VF:** 1 si hubo acarreo, 0 si no · **Quirk:** ninguno

```
suma ← V[X] + V[Y]
V[X] ← suma & 0xFF
V[F] ← 1 si suma > 255, si no 0          ; VF se escribe al final
```

A diferencia de `7XNN`, esta suma sí informa el acarreo. Con eso se puede hacer
aritmética de más de 8 bits:

```asm
; (V1:V0) = (V1:V0) + (V3:V2)   suma de 16 bits; V1 y V3 son los bytes altos
        ADD  V0, V2         ; byte bajo; VF = acarreo
        ADD  V1, VF         ; sumar el acarreo al byte alto
        ADD  V1, V3         ; sumar el byte alto del otro número
```

---

#### `8XY5` — SUB VX, VY

**VX = VX − VY; VF = 1 si no hubo préstamo.**

**VF:** 1 si VX ≥ VY, 0 si no · **Quirk:** ninguno

```
vx ← V[X];  vy ← V[Y]                    ; valores originales
V[X] ← (vx − vy) & 0xFF
V[F] ← 1 si vx ≥ vy, si no 0             ; VF se escribe al final
```

Ojo con el sentido del flag: **VF = 1 significa que NO hubo préstamo**, o sea que el
resultado no "dio negativo". Si los dos valores son iguales, VF es 1. El manual del VIP
lo dice exactamente así ("VF = 01 if VX g.e. VY"); la referencia de Cowgod escribe
"VX > VY", que da un resultado distinto cuando son iguales.

Como VF queda en 1 exactamente cuando VX ≥ VY, `SUB` sirve para comparar:

```asm
; Fragmento: es_menor es una etiqueta de tu programa.
; ¿V3 ≥ V4? (sin perder V3)
        LD   V5, V3
        SUB  V5, V4         ; VF = 1 si V3 ≥ V4
        SE   VF, 1
        JP   es_menor
```

---

#### `8XY6` — SHR VX, VY

**Desplazar un bit a la derecha; VF = el bit que salió.**

**VF:** el bit menos significativo del valor desplazado · **Quirk:** [`shifting`](#114-shifting-desplazar-vx-o-vy)

```
si quirks.shifting:  valor ← V[X]        ; CHIP-48 / SUPER-CHIP
si no:               valor ← V[Y]        ; COSMAC VIP (por defecto)
V[X] ← valor >> 1
V[F] ← valor & 1                         ; VF se escribe al final
```

En el VIP, `8XY6` desplaza **VY** y guarda el resultado en VX. CHIP-48 y SUPER-CHIP
desplazan **VX** e ignoran Y. No figuraba en el manual del VIP.

```asm
        LD   V1, 0x05
        LD   V2, 0x0C
        SHR  V1, V2         ; VIP:        V1 = 0x0C >> 1 = 0x06, VF = 0
                            ; SUPER-CHIP: V1 = 0x05 >> 1 = 0x02, VF = 1
```

**Consejo de portabilidad:** si usás el mismo registro en X y en Y, el resultado es
idéntico con o sin el quirk. El ensamblador acepta la forma corta `SHR VX`, que genera
exactamente eso (`SHR V3` = `8336`).

```asm
        SHR  V3             ; V3 = V3 / 2 en cualquier intérprete; VF = resto
```

---

#### `8XY7` — SUBN VX, VY

**VX = VY − VX; VF = 1 si no hubo préstamo.**

**VF:** 1 si VY ≥ VX, 0 si no · **Quirk:** ninguno

```
vx ← V[X];  vy ← V[Y]                    ; valores originales
V[X] ← (vy − vx) & 0xFF
V[F] ← 1 si vy ≥ vx, si no 0             ; VF se escribe al final
```

La resta "al revés": el resultado queda en VX, pero es VY menos VX. Útil para calcular
`constante − VX` sin registros extra. No figuraba en el manual del VIP.

```asm
; Reflejar horizontalmente una coordenada: x = 56 - x
        LD   V1, 56
        SUBN V0, V1         ; V0 = 56 - V0
```

---

#### `8XYE` — SHL VX, VY

**Desplazar un bit a la izquierda; VF = el bit que salió.**

**VF:** el bit más significativo del valor desplazado · **Quirk:** [`shifting`](#114-shifting-desplazar-vx-o-vy)

```
si quirks.shifting:  valor ← V[X]        ; CHIP-48 / SUPER-CHIP
si no:               valor ← V[Y]        ; COSMAC VIP (por defecto)
V[X] ← (valor << 1) & 0xFF
V[F] ← valor >> 7                        ; VF se escribe al final
```

Multiplica por 2 (módulo 256). Mismo quirk y mismo consejo que `8XY6`: la forma corta
`SHL VX` funciona igual en todos los intérpretes. No figuraba en el manual del VIP.

```asm
; Fragmento: tabla es una etiqueta de tu programa (los datos de la tabla).
; Índice de una tabla de entradas de 2 bytes: desplazamiento = 2 × V0
        LD   V1, V0
        SHL  V1             ; V1 = 2 × V0
        LD   I, tabla
        ADD  I, V1
```

---

#### `9XY0` — SNE VX, VY

**Saltear la instrucción siguiente si VX es distinto de VY.**

**VF:** sin cambios · **Quirk:** ninguno

```
si V[X] ≠ V[Y]:  PC ← PC + 2
```

Igual que `4XNN`, pero con dos registros. El último nibble tiene que ser 0: en este
emulador `9XY1`–`9XYF` son opcodes inválidos.

```asm
; Fragmento: coinciden es una subrutina de tu programa.
        SNE  V0, V1         ; si son distintos, saltear el CALL
        CALL coinciden
```

---

#### `ANNN` — LD I, NNN

**Cargar la dirección NNN en I.**

**VF:** sin cambios · **Quirk:** ninguno

```
I ← NNN
```

Casi siempre se usa con una etiqueta: el ensamblador calcula la dirección. Con XO-CHIP,
las direcciones de más de 12 bits se cargan con `LD I, LONG`
([F000 NNNN](#f000-nnnn--ld-i-long-nnnn)).

```asm
        LD   I, nave        ; I apunta a los bytes del sprite
        DRW  V0, V1, 3
fin:    JP   fin
nave:   DB   0b00011000, 0b00111100, 0b11111111
```

---

#### `BNNN` — JP V0, NNN

**Saltar a NNN + V0.**

**VF:** sin cambios · **Quirk:** [`jumping`](#115-jumping-bnnn-o-bxnn)

```
si quirks.jumping:  PC ← (NNN + V[X]) & 0xFFF    ; BXNN: X = primer dígito de NNN
si no:              PC ← (NNN + V[0]) & 0xFFF    ; COSMAC VIP (por defecto)
; con XO-CHIP es & 0xFFFF: el salto puede pasar de 0xFFF (hasta 0x10FE)
```

El único salto calculado de CHIP-8. Sirve para **tablas de saltos**: según el valor de
V0, el programa va a una u otra rutina.

```asm
; Fragmento: opcion0, opcion1 y opcion2 son rutinas de tu programa.
; V0 = 0, 2 o 4 elige la rutina (cada entrada de la tabla es un JP de 2 bytes)
        JP   V0, tabla
tabla:  JP   opcion0
        JP   opcion1
        JP   opcion2
```

**La trampa del quirk:** CHIP-48 y SUPER-CHIP interpretan el opcode como `BXNN` y suman
**VX**, donde X es el primer dígito de la dirección. Si `tabla` quedara en `0x2A0`, con
`jumping` activo el salto usaría **V2** en lugar de V0. Si tu programa tiene que correr
en los dos tipos de intérprete, evitá `BNNN` o asegurate de que ese registro tenga el
mismo valor que V0.

**En el monitor y en el ensamblador.** El desensamblador del monitor sigue el quirk:
con `jumping` apagado muestra `B2A0` como `JP V0, 0x2A0`, y con `jumping` activo como
`JP V2, 0x2A0`, que es lo que la instrucción va a hacer; si cambiás el interruptor, el
desensamblado se actualiza en el momento. El ensamblador acepta las dos formas:
`JP V0, dirección` con cualquier dirección, y `JP VX, dirección` solo si X es el primer
dígito hexadecimal de la dirección (`JP V2, 0x2A0` genera `B2A0`; `JP V1, 0x2A0` es un
error). Las dos producen el mismo opcode: lo que cambia es cómo lo ejecuta el intérprete.

---

#### `CXNN` — RND VX, NN

**VX = un byte aleatorio AND NN.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
V[X] ← aleatorio(0..255) & NN
```

NN es una **máscara**, no un máximo: `RND V0, 0x3F` da un número entre 0 y 63, pero
`RND V0, 10` solo puede dar 0, 2, 8 o 10 (los bits encendidos de 10 = `0b1010`). Para
un rango que no es potencia de 2, se sortea y se descarta lo que no sirve:

```asm
; V0 = número al azar entre 0 y 9
otro:   RND  V0, 0x0F       ; 0..15
        LD   V1, 10
        LD   V2, V0
        SUB  V2, V1         ; VF = 1 si V0 ≥ 10
        SE   VF, 0
        JP   otro           ; fuera de rango: sortear de nuevo
```

En el VIP, el número salía de una "semilla" (el registro R9 del 1802) que la rutina de
interrupción incrementaba 60 veces por segundo, combinada con bytes del propio código
del intérprete. Scotford señala que por eso la distribución no es pareja, aunque
alcanza para juegos. Este emulador usa el generador del navegador (`Math.random`).

---

#### `DXYN` — DRW VX, VY, N

**Dibujar un sprite de 8×N en (VX, VY) con XOR; VF = colisión.**

**VF:** 1 si algún píxel encendido se apagó, 0 si no · **Quirks:** [`clipping`](#116-clipping-recortar-o-dar-la-vuelta), [`displayWait`](#117-displaywait-esperar-el-vblank)

```
x0 ← V[X] % 64                       ; la posición inicial siempre da la vuelta
y0 ← V[Y] % 32
colisión ← 0
para fila de 0 a N−1:
    byte ← memoria[(I + fila) & 0xFFF]
    y ← y0 + fila
    si y ≥ 32:
        si quirks.clipping:  terminar       ; las filas que sobran no se dibujan
        si no:               y ← y % 32
    para bit de 0 a 7:                     ; bit 0 = el más significativo del byte
        si el bit (7 − bit) de byte vale 1:
            x ← x0 + bit
            si x ≥ 64:
                si quirks.clipping:  seguir con el próximo bit
                si no:               x ← x % 64
            si display[y][x] = 1:  colisión ← 1
            display[y][x] ← display[y][x] ^ 1
V[F] ← colisión                           ; VF se escribe al final
```

La instrucción más importante de CHIP-8, explicada en detalle en la sección
[6](#6-pantalla). Resumen:

- Lee N bytes desde `I` (I no cambia) y los combina con la pantalla mediante XOR.
- VF indica si algún píxel encendido se apagó.
- Las coordenadas iniciales dan la vuelta; lo que sobresale se recorta o da la vuelta
  según `clipping`. Los píxeles recortados no cuentan como colisión.
- Con `N = 0`, en la plataforma CHIP-8 no dibuja nada, pone VF en 0 y la consola avisa
  que es una instrucción de SUPER-CHIP ([11.10](#1110-diagnósticos-de-plataforma)); con
  SUPER-CHIP y XO-CHIP dibuja un sprite de 16×16 (ficha [DXY0](#dxy0--drw-vx-vy-0)).
- Con SUPER-CHIP y XO-CHIP, el pseudocódigo es el mismo con el ancho y el alto de la
  resolución actual en lugar de 64 y 32 ([13.5](#135-alta-y-baja-resolución)), y con
  XO-CHIP se repite para cada plano elegido, cada uno con sus N bytes
  ([13.6](#136-planos-y-colores)).
- Con `displayWait` activo (por defecto), después de un `DXYN` termina el frame: se
  ejecuta como máximo un dibujo cada 1/60 s, imitando la espera del VIP (sección
  [12.4](#124-la-espera-del-vblank)).

```asm
; Fragmento: choque es una subrutina de tu programa.
; Dibujar el dígito que está en V2 en la posición (V0, V1)
        LD   F, V2
        DRW  V0, V1, 5
        SE   VF, 0          ; ¿tocó algo que ya estaba dibujado?
        CALL choque
```

---

#### `EX9E` — SKP VX

**Saltear la instrucción siguiente si la tecla VX está apretada.**

**VF:** sin cambios · **Quirk:** ninguno

```
si teclas[V[X] & 0xF] = apretada:  PC ← PC + 2
```

Consulta el teclado sin esperar (sección [7.3](#73-leer-el-teclado-sin-detenerse-ex9e-y-exa1)).
Solo cuenta el dígito hex bajo de VX.

```asm
; Fragmento: no_dispara es una etiqueta y disparar una subrutina de tu programa.
        LD   V2, 5
        SKP  V2             ; si la tecla 5 está apretada, saltear el JP
        JP   no_dispara
        CALL disparar
```

---

#### `EXA1` — SKNP VX

**Saltear la instrucción siguiente si la tecla VX NO está apretada.**

**VF:** sin cambios · **Quirk:** ninguno

```
si teclas[V[X] & 0xF] = suelta:  PC ← PC + 2
```

La más usada en los bucles de juego: "si no apretaron esta tecla, saltear la acción".
Cualquier `EX??` que no sea `9E` o `A1` es un opcode inválido.

```asm
        LD   V2, 8          ; tecla 8 = abajo (S en tu teclado)
        SKNP V2
        ADD  V1, 1          ; bajar un píxel
```

---

#### `FX07` — LD VX, DT

**VX = valor actual del timer de retardo.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
V[X] ← DT
```

Es la única forma de leer un timer (ST no se puede leer). Ver el ejemplo de espera en
la sección [5.2](#52-usar-dt-para-medir-el-tiempo).

```asm
; Fragmento: todavia_no es una etiqueta de tu programa.
        LD   V0, DT
        SE   V0, 0
        JP   todavia_no
```

---

#### `FX0A` — LD VX, K

**Esperar a que se apriete y se suelte una tecla; VX = la tecla.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno

```
; al ejecutarse (el PC ya avanzó):
waitingForKey ← verdadero;  recordar X
; mientras espera, no se ejecutan instrucciones (los timers siguen bajando):
;   la primera tecla que pasa de suelta a apretada queda elegida
;   (las que ya estaban apretadas al empezar cuentan solo si se sueltan y se vuelven a apretar)
;   cuando ESA tecla se suelta:  V[X] ← tecla;  waitingForKey ← falso
```

Detalle completo, diagrama y diferencias con el VIP en la sección
[7.4](#74-esperar-una-tecla-fx0a).

```asm
; Fragmento: juego es una etiqueta de tu programa.
; "Apretá una tecla para empezar"
        LD   V0, K          ; se queda acá hasta que aprietes y sueltes una tecla
        CLS
        JP   juego
```

---

#### `FX15` — LD DT, VX

**Timer de retardo = VX.**

**VF:** sin cambios · **Quirk:** ninguno

```
DT ← V[X]
```

A partir de acá DT baja de a uno por cada 1/60 s hasta 0.

```asm
        LD   V0, 30
        LD   DT, V0         ; medio segundo
```

---

#### `FX18` — LD ST, VX

**Timer de sonido = VX (suena mientras sea mayor que 0).**

**VF:** sin cambios · **Quirk:** ninguno

```
ST ← V[X]
```

El beep dura V[X]/60 segundos. Cargar 0 lo corta de inmediato.

> **Diferencia con el VIP.** En el VIP, un valor de 1 no se oía (el mínimo audible era
> 2). Este emulador suena con cualquier valor mayor que 0.

```asm
        LD   V0, 4
        LD   ST, V0         ; bip corto: 4/60 s
```

---

#### `FX1E` — ADD I, VX

**I = I + VX.**

**VF:** sin cambios · **Quirk:** ninguno

```
I ← (I + V[X]) & 0xFFFF                  ; VF NO se modifica
```

Sirve para recorrer tablas y listas de sprites: se carga la base con `ANNN` y se suma
el desplazamiento.

A diferencia de las sumas entre registros, **no toca VF**, ni siquiera si I pasa de
`0xFFF`. Algunos intérpretes (según Langhoff, el de Amiga) ponían VF en 1 cuando I se
"desbordaba", y al menos un juego, *Spacefight 2091!*, depende de eso; la
`chip-8-database` incluye una versión corregida del juego que ya no lo necesita. Este
emulador sigue al VIP: VF no cambia.

```asm
; Fragmento: tabla es una etiqueta de tu programa (los datos de la tabla).
; I = tabla + V0
        LD   I, tabla
        ADD  I, V0
```

---

#### `FX29` — LD F, VX

**I = dirección del glifo de la fuente para el dígito VX.**

**VF:** sin cambios · **Quirk:** ninguno

```
I ← 0x050 + (V[X] & 0xF) × 5              ; en este emulador
```

Apunta I al glifo de 5 filas del dígito hexadecimal bajo de VX, listo para
`DRW VX, VY, 5` (sección [8](#8-fuente-hexadecimal)). Para la fuente grande de
SUPER-CHIP y XO-CHIP está [`FX30`](#fx30--ld-hf-vx).

```asm
        LD   V2, 0x0A
        LD   F, V2          ; I apunta a la "A"
        DRW  V0, V1, 5
```

---

#### `FX33` — LD B, VX

**Guardar VX en decimal (BCD): centenas, decenas y unidades en I, I+1 e I+2.**

**VF:** sin cambios · **Quirk:** ninguno

```
memoria[I]     ← V[X] / 100              ; centenas (división entera)
memoria[I + 1] ← (V[X] / 10) % 10        ; decenas
memoria[I + 2] ← V[X] % 10               ; unidades
; I no cambia
```

Es la herramienta para mostrar números en decimal. El ejemplo del artículo de BYTE: si
V9 = `0xA7` (167), `LD B, V9` escribe `01`, `06` y `07`. Después se cargan esos tres
bytes en registros con `FX65` y se dibuja cada dígito con `FX29` + `DXYN`:

```asm
; Mostrar V3 (0 a 255) en decimal en la esquina superior izquierda
        LD   I, bcd
        LD   B, V3          ; bcd = centenas, decenas, unidades
        LD   V2, [I]        ; V0 = centenas, V1 = decenas, V2 = unidades
        LD   V4, 0          ; x
        LD   V5, 0          ; y
        LD   F, V0
        DRW  V4, V5, 5
        ADD  V4, 5
        LD   F, V1
        DRW  V4, V5, 5
        ADD  V4, 5
        LD   F, V2
        DRW  V4, V5, 5
fin:    JP   fin
bcd:    DB   0, 0, 0
```

---

#### `FX55` — LD [I], VX

**Guardar V0..VX (inclusive) en memoria, a partir de I.**

**VF:** sin cambios · **Quirk:** [`memory`](#113-memory-fx55-y-fx65-avanzan-i)

```
para i de 0 a X:
    memoria[(I + i) & 0xFFF] ← V[i]       ; & 0xFFFF con XO-CHIP
si quirks.memory:  I ← I + X + 1          ; COSMAC VIP (por defecto)
```

Guarda siempre un **bloque** de registros que empieza en V0: `LD [I], V3` guarda V0,
V1, V2 y V3. Si X = 0, guarda solo V0. En el VIP, el bucle de copia avanzaba el
registro I en cada byte, así que al terminar I quedaba apuntando al byte siguiente al
último guardado; es el comportamiento del quirk `memory`. CHIP-48 y SUPER-CHIP 1.0
dejaban I en I + X, y SUPER-CHIP 1.1 no lo modificaba.

**Consejo de portabilidad:** volvé a cargar I con `ANNN` antes de cada `FX55`/`FX65`
y no dependas de dónde queda después. Con XO-CHIP también podés usar `SAVE` y `LOAD`
([5XY2](#5xy2--save-vx-vy)), que nunca mueven I, con cualquier perfil.

```asm
; Guardar V0..V2 en "copia" y recuperarlos más tarde
        LD   I, copia
        LD   [I], V2
        ; ... código que usa V0..V2 para otra cosa ...
        LD   I, copia       ; recargar I: no depender del quirk
        LD   V2, [I]
fin:    JP   fin
copia:  DB   0, 0, 0
```

---

#### `FX65` — LD VX, [I]

**Cargar V0..VX (inclusive) desde memoria, a partir de I.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** [`memory`](#113-memory-fx55-y-fx65-avanzan-i)

```
para i de 0 a X:
    V[i] ← memoria[(I + i) & 0xFFF]       ; & 0xFFFF con XO-CHIP
si quirks.memory:  I ← I + X + 1          ; COSMAC VIP (por defecto)
```

La operación inversa de `FX55`. Muy usada para leer registros de una tabla (por
ejemplo, las coordenadas de un nivel) o los tres dígitos que deja `FX33`. Mismo quirk y
mismo consejo que `FX55`. En CHIP-8, cualquier `FX??` que no sea uno de los nueve de la
tabla es un opcode inválido; SUPER-CHIP y XO-CHIP agregan los de la sección
[13.11](#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip).

```asm
; Cargar posición inicial (V0 = x, V1 = y) desde una tabla
        LD   I, inicio
        LD   V1, [I]
        ; ...
inicio: DB   10, 20
```

---

## 11. Quirks

### 11.1 Qué es un quirk y de dónde salen

Un **quirk** es una instrucción que se comporta distinto en implementaciones conocidas
de CHIP-8, cuando además hay programas que dependen de una u otra forma. No hay un
comportamiento "correcto" en abstracto: el correcto es el del intérprete para el que se
escribió el programa. Los quirks tienen orígenes distintos:

- **Efectos secundarios del intérprete del VIP** que nadie documentó, pero que los
  programas de la época daban por sentados (VF en las operaciones lógicas, la espera del
  vblank, el avance de I).
- **Instrucciones sin documentar**: `8XY6` y `8XYE` no estaban en el manual, así que
  cada implementador posterior tuvo que deducir qué hacían.
- **Reimplementaciones a partir de documentación incompleta**: CHIP-48 introdujo
  diferencias en los desplazamientos, en `FX55`/`FX65` y en `BNNN`, que SUPER-CHIP
  heredó y que miles de programas de los 90 asumieron.
- **Decisiones de diseño deliberadas**, como el wrapping de sprites de XO-CHIP.

Este emulador expone seis quirks. Cada uno es un interruptor que se lee en cada
instrucción, así que los cambios se aplican en vivo. Los valores por defecto son los del
**COSMAC VIP**. Los quirks son independientes de la plataforma: cualquier combinación
vale con CHIP-8, SUPER-CHIP o XO-CHIP
([11.9](#119-cómo-elegir-la-configuración-en-este-emulador)).

| Identificador | Activado significa... | Instrucciones afectadas |
|---|---|---|
| `vfReset` | AND/OR/XOR ponen VF en 0 | `8XY1`, `8XY2`, `8XY3` |
| `memory` | `FX55`/`FX65` dejan I en I + X + 1 | `FX55`, `FX65` |
| `shifting` | Los desplazamientos operan sobre VX e ignoran VY | `8XY6`, `8XYE` |
| `jumping` | `BNNN` suma VX (X = primer dígito de NNN) en lugar de V0 | `BNNN` |
| `clipping` | Lo que sale de la pantalla se recorta en lugar de dar la vuelta | `DXYN` |
| `displayWait` | Después de un `DXYN` termina el frame (un dibujo por frame) | `DXYN` |

### 11.2 vfReset: las operaciones lógicas ponen VF en 0

**Qué controla.** Si está activo, `8XY1` (OR), `8XY2` (AND) y `8XY3` (XOR) dejan VF en 0
después de calcular el resultado. Si no, VF no cambia (salvo que X sea F).

**En el VIP.** El intérprete resuelve todo el grupo `8XYN` ejecutando una instrucción de
la ALU del 1802 y después copia en VF el flag DF del procesador. En las sumas, restas y
desplazamientos, DF es el acarreo o el bit que salió; en las operaciones lógicas, DF no
depende de la operación. Scotford lo describe como un valor indefinido, que refleja la
última instrucción del 1802 que tocó DF; las suites de test modernas (Timendus) y las
tablas de variantes (Gulrak) lo modelan como VF = 0, y eso hace este emulador.

**Después.** CHIP-48, SUPER-CHIP y XO-CHIP no tocan VF en las operaciones lógicas.

**Impacto.** Chico: pocos programas dependen de esto. Puede afectar a un programa que
guarda algo en VF y hace una operación lógica antes de leerlo (con el quirk activo, lo
pierde), o a uno del VIP que da por hecho que VF queda en 0.

### 11.3 memory: FX55 y FX65 avanzan I

**Qué controla.** Si está activo, después de `FX55` o `FX65` el registro I queda en
`I + X + 1`, es decir, apuntando al byte siguiente al último copiado. Si no, I no
cambia.

**En el VIP.** El bucle que copia los registros usa I como puntero y lo incrementa en
cada byte (Scotford), así que I termina después del bloque. El manual lo documenta:
"I = I + X + 1".

**Después.** CHIP-48 y SUPER-CHIP 1.0 dejaban I en `I + X` (uno menos); SUPER-CHIP 1.1,
la versión más difundida, no modificaba I. XO-CHIP (y Octo, por defecto) volvió al
comportamiento del VIP y agregó instrucciones nuevas (`5XY2`/`5XY3`) que nunca tocan I.
Este emulador modela los
dos casos más comunes (avanzar X + 1 o no tocar I); la variante `I + X` de CHIP-48 no
está disponible.

**Impacto.** Alto. Un programa escrito para SUPER-CHIP que lee varias veces la misma
tabla sin recargar I, en un intérprete con el quirk activo, lee datos de más adelante; y
al revés, un programa del VIP que guarda bloques consecutivos sin recargar I los
superpone. Los síntomas típicos son gráficos con basura, puntajes que no se actualizan o
datos corruptos. Ejemplos catalogados en la `chip-8-database`: una versión de *Astro
Dodge* (Revival Studios, 2008) que, con el comportamiento del VIP, muestra basura a los
costados y no suma puntos; y *Blinky* (Hans Christian Egeberg, 1991), escrito para
SUPER-CHIP.

### 11.4 shifting: desplazar VX o VY

**Qué controla.** Si está activo, `8XY6` y `8XYE` desplazan VX en su lugar e ignoran Y.
Si no, desplazan VY y guardan el resultado en VX.

**En el VIP.** VX recibe VY desplazado (el 1802 desplaza el valor que carga desde VY y
lo guarda en VX).

**Después.** CHIP-48 los implementó desplazando VX, y SUPER-CHIP heredó ese
comportamiento. Como estas instrucciones no figuraban en el manual del VIP, cada
implementador tuvo que deducirlas; la `chip-8-database` describe el cambio de CHIP-48
como un error de interpretación. XO-CHIP sigue al VIP.

**Impacto.** Alto para programas de la era HP-48: muchos usan `8XY6` con X ≠ Y
esperando el desplazamiento "en su lugar". La versión corregida de *Blinky* que publica
la `chip-8-database` explica que la original, con el comportamiento del VIP, dibuja mal
el laberinto y se cuelga al chocar contra una pared (por este quirk y por `memory`).
Síntomas típicos: cuentas que dan cualquier cosa, movimientos erráticos, gráficos
desarmados. La forma corta `SHR VX` / `SHL VX` evita el problema.

### 11.5 jumping: BNNN o BXNN

**Qué controla.** Si está activo, `BNNN` se interpreta como `BXNN`: salta a `XNN + VX`,
donde X es el primer dígito de NNN. Si no, salta a `NNN + V0`.

**En el VIP.** `NNN + V0`, como dice el manual.

**Después.** CHIP-48 introdujo la variante `BXNN` y SUPER-CHIP la heredó. XO-CHIP usa
V0.

**Impacto.** Bajo: `BNNN` se usa poco. Cuando falla, el programa salta a un lugar
equivocado y suele terminar en un opcode inválido.

**En el monitor.** El desensamblado de `BNNN` sigue este quirk: con el quirk activo,
`B2A0` aparece como `JP V2, 0x2A0` en lugar de `JP V0, 0x2A0` (ver la ficha de
[BNNN](#bnnn--jp-v0-nnn)).

### 11.6 clipping: recortar o dar la vuelta

**Qué controla.** Si está activo, los píxeles de un sprite que se salen por la derecha
o por abajo se descartan. Si no, aparecen del otro lado. En los dos casos la posición
*inicial* da la vuelta (sección [6.4](#64-bordes-coordenadas-que-dan-la-vuelta-clipping-y-wrapping)).

**En el VIP.** Recorta (Scotford).

**Después.** CHIP-48 y SUPER-CHIP también recortan. XO-CHIP (Octo) da la vuelta.

**Impacto.** Medio. Un juego pensado para wrapping puede mostrar objetos que "se cortan"
en el borde en lugar de cruzarlo, y uno pensado para clipping puede mostrar pedazos de
sprites del lado contrario o detectar colisiones falsas contra lo que haya ahí.

### 11.7 displayWait: esperar el vblank

**Qué controla.** Si está activo, `DXYN` termina el frame actual: se dibuja como máximo
un sprite cada 1/60 s. En este emulador vale para todos los dibujos, también los de
16 × 16 (`DXY0`) y los de alta resolución.

**En el VIP.** La rutina de dibujo espera la próxima interrupción de video antes de
escribir en la memoria de pantalla, para que el chip de video nunca muestre un sprite a
medio dibujar (Scotford). En la práctica eso limita la velocidad a unos 60 sprites por
segundo (Timendus) y, según Gulrak, a veces el VIP necesita incluso dos cuadros.

**Después.** Los intérpretes modernos en general no esperan, y XO-CHIP (Octo) tampoco.
Con SUPER-CHIP hay un matiz: según la suite de Timendus, que Gulrak probó en dos
calculadoras HP-48, SUPER-CHIP 1.0 y 1.1 esperan el cuadro siguiente en baja resolución
(64×32), como el VIP, y no esperan en alta. Los intérpretes que la suite llama de
SUPER-CHIP "moderno" no esperan nunca, y así lo modelan también la `chip-8-database` y
el perfil SUPER-CHIP de este emulador.

**Impacto.** En la velocidad, no en la lógica. Sin la espera, algunos programas del VIP
corren demasiado rápido, porque su ritmo dependía implícitamente de ella. Con la espera,
los programas modernos que dibujan muchos sprites por paso se vuelven lentísimos. Ver
[12.4](#124-la-espera-del-vblank).

### 11.8 Tabla comparativa

| Quirk | COSMAC VIP | CHIP-48 | SUPER-CHIP 1.1 | XO-CHIP | Octo (por defecto) |
|---|---|---|---|---|---|
| `vfReset` (AND/OR/XOR ponen VF = 0) | sí | no | no | no | no |
| `memory` (I después de FX55/FX65) | I + X + 1 | I + X | sin cambios | I + X + 1 | I + X + 1 |
| `shifting` (8XY6/8XYE sobre VX) | no: usan VY | sí | sí | no: usan VY | no: usan VY |
| `jumping` (BXNN) | no: usa V0 | sí | sí | no: usa V0 | no: usa V0 |
| `clipping` | recorta | recorta | recorta | da la vuelta | da la vuelta |
| `displayWait` | sí | no (ver 11.7) | no (ver 11.7) | no | no |

La columna de Octo son los valores con que arranca su emulador (`js/emulator.js`): sus
siete opciones de quirks empiezan apagadas. Coinciden con la columna de XO-CHIP, porque
XO-CHIP se definió en Octo, y son exactamente los quirks del perfil XO-CHIP de este
emulador. Importan aunque el programa no use nada de XO-CHIP: casi todos los juegos
modernos se hicieron y se probaron en Octo, y en el archivo de la comunidad
([11.11](#1111-ajustes-por-cartucho)) 89 de los 104 programas usan esa combinación, sean
de CHIP-8, de SUPER-CHIP o de XO-CHIP.

Las opciones de Octo tienen otros nombres; esta es la correspondencia (la misma que usa
`tools/archive.js` para pasar los ajustes del archivo a la consola):

| Opción de Octo | Quirk de este emulador |
|---|---|
| `logicQuirks` | `vfReset` |
| `loadStoreQuirks` | `memory`, al revés: en Octo, `true` quiere decir que I **no** se mueve |
| `shiftQuirks` | `shifting` |
| `jumpQuirks` | `jumping` |
| `clipQuirks` | `clipping` |
| `vBlankQuirks` | `displayWait` |
| `vfOrderQuirks` | No existe acá: este emulador escribe VF siempre al final ([4.2](#42-vf-el-registro-de-flags)), que es lo que hace Octo con la opción apagada |

Y los perfiles que ofrece este emulador:

| | Perfil COSMAC VIP (por defecto) | Perfil SUPER-CHIP | Perfil XO-CHIP |
|---|:---:|:---:|:---:|
| `vfReset` | activado | — | — |
| `memory` | activado | — | activado |
| `shifting` | — | activado | — |
| `jumping` | — | activado | — |
| `clipping` | activado | activado | — |
| `displayWait` | activado | — | — |
| **Plataforma** | CHIP-8 | SUPER-CHIP | XO-CHIP |

El perfil SUPER-CHIP reproduce los quirks de SUPER-CHIP 1.1 tal como los modelan las
suites modernas, y el perfil XO-CHIP, los de Octo. Cada perfil elige además su
plataforma, que es la que trae las instrucciones nuevas (sección
[13](#13-variantes-y-extensiones)).

### 11.9 Cómo elegir la configuración en este emulador

En **Compatibilidad**, en la pestaña **Ajustes** del cajón de opciones (el botón de los
deslizadores, arriba, o la tecla M), hay dos selectores, **Perfil** y **Plataforma**,
seis interruptores DIP (uno por quirk: al pasar el mouse por uno, o al llegar a él con
Tab, aparece qué hace) y el interruptor **Ajustes por cartucho**
([11.11](#1111-ajustes-por-cartucho)). Perfil y plataforma son dos cosas distintas:

| | Qué decide | Opciones | Al cambiarlo |
|---|---|---|---|
| **Plataforma** | Qué máquina es: el juego de instrucciones, la memoria y la pantalla ([13.3](#133-las-plataformas-de-este-emulador)) | CHIP-8, SUPER-CHIP y XO-CHIP | La ROM vuelve a empezar; los quirks no cambian |
| **Perfil** | Los seis quirks y la plataforma que va con ellos | COSMAC VIP (con CHIP-8), SUPER-CHIP (con SUPER-CHIP), XO-CHIP (con XO-CHIP) y Personalizado | Mueve los seis interruptores y elige la plataforma del perfil. Si la plataforma cambia, la ROM vuelve a empezar; si no, los quirks se aplican en el momento |
| **Interruptores DIP** | Un quirk cada uno | Activado o desactivado | Se aplican en el momento; nunca cambian la plataforma |

Si tocás los interruptores y la combinación ya no coincide con ningún perfil, el
selector Perfil pasa solo a "Personalizado"; si coincide con otro perfil, muestra ese,
aunque la plataforma sea otra (el selector compara solo los quirks). Cualquier
combinación de quirks vale con cualquier plataforma. Los cambios de quirks se aplican sin
reiniciar, aunque si el programa ya calculó algo con la configuración anterior conviene
reiniciarlo.

**La consola recuerda la configuración.** Lo que elegís a mano (perfil, plataforma,
interruptores, IPF y paleta) se guarda en este navegador, junto con el modo de pantalla
y el sonido, y vuelve la próxima vez que abrís la página. Con **Ajustes por cartucho**
prendido, además, cada ROM recuerda lo que le cambiaste. Por eso "por defecto" quiere
decir "la primera vez": si ayer elegiste SUPER-CHIP, hoy la consola arranca en
SUPER-CHIP, y una ROM que ya jugaste arranca como la dejaste. Si un programa se comporta
raro, antes que nada revisá el perfil y la plataforma.

Una guía rápida, en este orden:

1. **Si el juego está en el archivo de la comunidad**, no tenés que hacer nada: la
   consola lo reconoce por su huella y lo configura sola, con la plataforma, los quirks,
   las IPF y los colores con que se juega en Octo. En la ranura dice «ajustes del
   archivo».
2. **Programas hechos con Octo**, que son casi todos los modernos (los de las Octojam
   incluidos): perfil **XO-CHIP**, aunque sean juegos de CHIP-8 puro. Sus quirks son
   exactamente los de Octo por defecto, con los que se probaron, y la plataforma XO-CHIP
   también ejecuta todo CHIP-8 y SUPER-CHIP.
3. **Juegos clásicos de SUPER-CHIP para la HP-48** (los de los 90, muchas veces con
   extensión `.sc8`, o documentados como SCHIP): perfil **SUPER-CHIP**.
4. **Programas del VIP y CHIP-8 de los 70 y 80** (los juegos del manual del VIP, por
   ejemplo) y los cartuchos de CHIP-8 incluidos en la consola: perfil **COSMAC VIP**.
5. Si no sabés de dónde salió un programa, buscalo en la
   [chip-8-database](https://github.com/chip-8/chip-8-database), que cataloga cientos de
   ROMs con su plataforma y su velocidad recomendada.

Después ajustá la velocidad ([12.2](#122-instrucciones-por-frame-ipf)). Si algo se ve
mal, estos síntomas orientan:

| Síntoma | Probá cambiar |
|---|---|
| Un programa que conocés anda distinto que la última vez | Si en la ranura dice «ajustes recordados», **Olvidar ajustes** ([11.11](#1111-ajustes-por-cartucho)); si no, el perfil, la plataforma y las IPF: la consola recuerda los que usaste la vez anterior |
| Un aviso dice que la ROM usó una instrucción de SUPER-CHIP o XO-CHIP y que la plataforma la ignora | El botón del aviso, **Usar SUPER-CHIP** o **Usar XO-CHIP** ([11.10](#1110-diagnósticos-de-plataforma)) |
| La máquina se detiene con «Instrucción inválida en CHIP-8: ... es de SUPER-CHIP» (o de XO-CHIP) | El botón del mensaje, **Cambiar a SUPER-CHIP y reiniciar** (o a XO-CHIP) |
| La pantalla dice FIN DEL PROGRAMA | Nada: no es un error, la ROM terminó con `EXIT` (`00FD`). Reiniciá para volver a empezar |
| Gráficos desarmados, laberintos mal dibujados, cuentas absurdas | `shifting` y `memory`: perfil SUPER-CHIP para los de la HP-48, XO-CHIP para los de Octo |
| Basura en la pantalla, puntaje que no sube, datos corruptos | `memory` |
| El programa salta a cualquier lado después de un `BNNN` y se detiene | `jumping` |
| Pedazos de sprites del lado opuesto de la pantalla, o sprites que se cortan en el borde | `clipping` |
| El juego va lentísimo aunque subas las instrucciones por frame | Apagar `displayWait` (los perfiles SUPER-CHIP y XO-CHIP lo traen apagado) |
| Un juego del VIP va demasiado rápido | Encender `displayWait` o bajar las instrucciones por frame |
| Colisiones o condiciones que fallan justo después de un AND/OR/XOR | `vfReset` |

### 11.10 Diagnósticos de plataforma

Cuando una ROM usa una instrucción que la plataforma elegida no tiene, la consola no se
queda callada. Lo que hace depende de la instrucción:

**Una instrucción de pantalla se ignora, con un aviso.** `00CN`, `00DN`, `00FB` a `00FF`
y `DXY0` tienen, en CHIP-8, la forma de instrucciones que no hacen nada: `0NNN`, y
`DXYN` con N = 0, que no dibuja. Un intérprete de la época las ignoraba, y la consola
hace lo mismo: el programa sigue (en 64 × 32, sin desplazamientos y sin terminar en
`00FD`), pero la primera vez aparece un aviso como este, con un botón:

```text
La ROM usó «HIGH» (pasar a alta resolución (128×64)), que es de SUPER-CHIP, y la plataforma CHIP-8 la ignora.
```

El botón, **Usar SUPER-CHIP** (o **Usar XO-CHIP**), elige el perfil de esa plataforma,
con sus quirks, y reinicia la ROM. El aviso sale una sola vez por cada ROM que cargás;
en el núcleo, esa primera instrucción ignorada queda en `cpu.hint`. Con SUPER-CHIP pasa
lo mismo con `00DN`, que es de XO-CHIP.

**Cualquier otra detiene la máquina.** `FX30`, `FX75`, `FX85`, `5XY2`, `5XY3`,
`F000 NNNN`, `FN01`, `F002` y `FX3A` no se pueden ignorar sin romper el programa, así que
la máquina se detiene con un error que nombra las dos plataformas:

```text
Instrucción inválida en CHIP-8: «LD HF, V1» (fuente grande) es de SUPER-CHIP (opcode 0xF130 en la dirección 0x20A). Elegí la plataforma SUPER-CHIP.
```

El mensaje aparece sobre la pantalla y en el monitor, con el botón **Cambiar a
SUPER-CHIP y reiniciar** (o a XO-CHIP), que también elige el perfil completo. En el
núcleo, `cpu.errorInfo.kind` vale `'platform'` y `cpu.errorInfo.needs` dice la
plataforma que hace falta.

**Una ROM de más de 3584 bytes pasa sola a XO-CHIP.** Con CHIP-8 y SUPER-CHIP no entra
en la memoria, así que la consola elige el perfil XO-CHIP (plataforma y quirks) antes de
cargarla y te avisa por qué. Hasta 65.024 bytes; una más grande no entra en ninguna
plataforma y la carga se rechaza.

**`00FD` no es un error.** Cuando un programa de SUPER-CHIP o XO-CHIP termina con
`EXIT`, la máquina se detiene sin error: la pantalla muestra «FIN DEL PROGRAMA» y «La ROM
terminó con EXIT (00FD).», la luz RUN queda en ámbar y el monitor dice «Terminado».
Reiniciá (Retroceso) para volver a empezar.

### 11.11 Ajustes por cartucho

Cada ROM se reconoce por su **huella SHA-1**: un número de 40 dígitos hexadecimales que
se calcula con sus bytes y que cambia si cambia uno solo (el núcleo la calcula con
`Chip8Core.sha1`). Con el interruptor **Ajustes por cartucho** prendido, que es como
viene, la consola usa esa huella para dos cosas:

- **Los juegos conocidos se configuran solos.** La consola trae una tabla con 172 juegos
  de la comunidad, la mayoría de las Octojam, cada uno con la plataforma, los quirks, la
  velocidad, los colores y la orientación de la pantalla con que se juega en Octo. Si
  cargás uno, se configura antes de arrancar y en la ranura (en la pestaña **Cartuchos**
  del cajón) dice «ajustes del archivo». Sus colores quedan en la paleta **Del cartucho**,
  y si el juego se pensó para una pantalla girada, la imagen se gira. La tabla la genera
  `tools/archive.js` a partir del archivo de la comunidad de John Earnest (*Chip8
  Community Archive*, licencia CC0, en `data/archive.json`: 104 programas, 50 de CHIP-8,
  26 de SUPER-CHIP y 28 de XO-CHIP) y de las exportaciones de Octo de las Octojam
  publicadas en itch.io que no están en el archivo (en `data/octojam-itch.json`: 68
  juegos de las Octojam 6 a 10, con CHIP-8: 22, SUPER-CHIP: 10 y XO-CHIP: 36, que son
  de sus autores y no de dominio público).
- **Lo que vos cambiás se recuerda.** Si mientras corre una ROM cambiás la plataforma,
  el perfil, un interruptor, las IPF, la paleta o los controles (en **Controles**, en la
  pestaña **Ajustes** del cajón de opciones, qué teclas del keypad aprietan las flechas
  y el joystick), la consola lo recuerda para esa ROM: la próxima vez arranca así, y en
  la ranura dice «ajustes recordados». **Olvidar ajustes** borra lo recordado; si es un
  juego del archivo, vuelven los del archivo.

Cuando cargás una ROM, cada fuente de ajustes pisa a la de abajo, campo por campo:

| Prioridad | De dónde salen | Qué aportan |
|:---:|---|---|
| 1 (gana) | Lo que le cambiaste a esa ROM | Plataforma, quirks, IPF, paleta, giro y controles |
| 2 | El archivo de la comunidad, si es un juego conocido | Plataforma, quirks, IPF, colores y giro |
| 3 | El cartucho incluido, si es uno de los demos | Su plataforma |
| 4 | Tus últimas elecciones explícitas | Plataforma, quirks, IPF, paleta y controles: con esto arranca una ROM que nunca usaste |

Lo que aplica la consola sola no cuenta como una elección tuya: no cambia tus ajustes
generales ni queda recordado para la ROM. Las banderas RPL de los juegos que guardan
récords o partidas también se recuerdan por ROM ([13.8](#138-las-banderas-rpl)).

En el archivo, la plataforma de cada programa es la más chica en la que funciona bien
(así lo pide el archivo), y por eso un juego "de CHIP-8" puede necesitar igual los
quirks de Octo: 89 de los 104 usan exactamente los de Octo por defecto. Las velocidades
van de 7 a 10.000 IPF ([12.2](#122-instrucciones-por-frame-ipf)).

Con el interruptor apagado, la consola funciona como siempre: todas las ROMs usan los
ajustes que estén puestos y no se aplica ni se recuerda nada por cartucho (las banderas
duran lo que dura la página).

Las ROMs que cargás desde un archivo quedan además en **Tus cartuchos**, en la pestaña
**Cartuchos** del cajón, debajo de los incluidos, con la que jugaste por última vez
primero, cada una con una miniatura de su pantalla. Entran hasta 60 ROMs y unos 2,5 MB
entre todas, y quedan guardadas en este navegador.

**Los juegos del archivo vienen adentro de la consola.** Además de la tabla,
`chip8.html` trae las ROMs de los 172 juegos de la comunidad, comprimidas. El botón
**Archivo**, en la pestaña **Cartuchos** del cajón, o la tecla **L** abren la ventana
*Archivo de la comunidad*, con todos juntos: cada juego con su título, sus autores, el
evento, el año, la plataforma, el tamaño y una miniatura de su pantalla de título. Se
busca por título o por autor (sin importar mayúsculas ni tildes), se filtra por
plataforma y por evento o año, y se ordena por título, por fecha o por evento. Un clic, o **Enter**, carga el juego con los ajustes
de la tabla (o con los que le recordaste; con el interruptor apagado, con los tuyos) y
cierra la ventana. Los juegos que se cargan así no van a **Tus cartuchos**: siempre
están en la ventana. Si el navegador no puede descomprimirlos (le falta
`DecompressionStream`), la ventana lo dice, y el juego se puede cargar igual desde la
carpeta `roms/archivo/` o `roms/octojam/` del repositorio con **Cargar ROM**.

Los **estados guardados** también son de cada ROM: las cinco ranuras de la pestaña
**Estados** del cajón de opciones (la rápida, con **I** y **U**, y cuatro más) se
guardan por la huella del cartucho, y otra ROM no las ve. Cargar un estado, o rebobinar
con **B**, vuelve la máquina entera a ese momento, timers (DT y ST) y banderas RPL
incluidos: un récord que el juego guardó después se pierde. **Ver todos**, arriba de las
ranuras, muestra los estados de todos los cartuchos, agrupados por cartucho, y carga
cualquiera (si el cartucho no está en la ranura, la consola lo pone antes, siempre que
tenga su ROM). **Exportar** baja los estados en un archivo `.json` y **Importar** (o
arrastrar ese archivo sobre la página) los trae a otro navegador; el archivo lleva
también la ROM cuando no es un demo ni un juego del archivo, y si una ranura ya tiene
otro estado, la consola pregunta antes de reemplazarlo. Cómo se usan, en la [parte 1.13
del tutorial](TUTORIAL.md#113-estados-guardados-y-rebobinado).

### 11.12 Otras diferencias con el VIP que no son configurables

| Tema | COSMAC VIP | Este emulador |
|---|---|---|
| Profundidad de la pila | 12 niveles | 16 niveles |
| Pila, variables y pantalla | En la RAM (`0xEA0`–`0xFFF` en 4 KB) | Fuera de la memoria CHIP-8 |
| Fuente | En ROM (`0x81xx`); 5 glifos distintos | En RAM (`0x050`); fuente estándar |
| `0NNN` | Ejecuta código máquina del 1802 | Se ignora |
| Opcodes inválidos | Comportamiento indefinido | Se detiene con un mensaje de error |
| `CALL`/`RET` fuera de rango | Sin control documentado (la pila está en la RAM) | Se detiene con un mensaje de error |
| Beep con ST = 1 | No se oye (mínimo 2) | Suena 1/60 s |
| Tono mientras se mantiene la tecla en `FX0A` | Sí | No |
| `FX1E` y VF | No toca VF | No toca VF |
| Velocidad | Cada instrucción tarda distinto | Cantidad fija de instrucciones por frame |
| Números aleatorios | Semilla + bytes del intérprete | `Math.random` |

---

## 12. Temporización

### 12.1 La velocidad del VIP original

El VIP no ejecutaba "N instrucciones por segundo": cada instrucción CHIP-8 era una
rutina del 1802 con su propia duración. Algunos datos, del manual y del análisis de
Scotford:

- El reloj es de ≈1,76 MHz y cada ciclo de máquina del 1802 son 8 ciclos de reloj: un
  ciclo de máquina dura ≈4,54 µs (unos 220.000 por segundo).
- Un cuadro de TV dura exactamente **3668 ciclos de máquina** (60 cuadros por segundo).
- El chip de video lee la pantalla por DMA: **1024 ciclos por cuadro**. Sumando la
  rutina de interrupción, **casi la mitad del tiempo de CPU** se va en atender el video.
- Lo que tarda cada instrucción varía muchísimo. La rutina de `00EE` son 10 ciclos; la
  de `8XYN`, 44 (≈200 µs); `FX55`/`FX65`, 14 ciclos más 14 por registro; y `DXYN`, entre
  170 ciclos (una fila, sin desplazamiento ni colisión) y 3812 (15 filas con el peor
  desplazamiento y colisiones), **sin contar** la espera de la interrupción. A todo eso
  se suma el costo común de leer y decodificar cada instrucción.

El resultado es una velocidad que depende de la mezcla de instrucciones. No hay una
cifra oficial; hay estimaciones de la comunidad: el emulador *jchip* habla de unas 11
instrucciones por frame; John Earnest (autor de Octo) dijo que el VIP "está más cerca de
15"; la `chip-8-database` usa 15 como valor por defecto para el VIP; y la guía de
Langhoff recomienda unas 700 instrucciones por segundo como valor general. Todo eso
equivale a unas **600 a 900 instrucciones por segundo**.

### 12.2 Instrucciones por frame (IPF)

Este emulador ejecuta una cantidad fija de instrucciones en cada frame de 1/60 s:
**IPF** (*instrucciones por frame*), configurable de **1 a 10.000**, con **15 por
defecto** (≈900 instrucciones por segundo, cerca del VIP). En **Velocidad**, en la
pestaña **Ajustes** del cajón de opciones, se elige con el deslizador, con el campo
numérico o con los botones de valores prefijados (7, 15, 30, 100, 500, 1000, 5000 y
10000), y debajo se ve la velocidad aproximada en instrucciones por segundo. Si escribís
un valor fuera de rango, el campo se marca en rojo y el aviso dice qué valor se usa
mientras tanto (1 o 10.000, el más cercano). El monitor muestra las IPF actuales, y la
consola las recuerda para la próxima vez y, con **Ajustes por cartucho**, las de cada
ROM (ver [11.9](#119-cómo-elegir-la-configuración-en-este-emulador)).

¿Por qué exponer IPF en lugar de fijar una velocidad "correcta"? Porque los programas de
CHIP-8 se escribieron para máquinas muy distintas: el VIP, las calculadoras HP-48 y los
intérpretes modernos, donde los programas de Octo asumen a menudo cientos o miles de
instrucciones por frame. Muchos juegos no usan el timer para regular su ritmo y
dependen de la velocidad del intérprete. No hay un valor que sirva para todos: el
correcto es el que hace que ese programa sea jugable.

Valores de referencia (los `defaultTickrate` de la `chip-8-database`):

| Plataforma | IPF sugerido |
|---|---|
| COSMAC VIP | 15 |
| CHIP-8 "moderno" | 12 |
| CHIP-48 / SUPER-CHIP | 30 |
| XO-CHIP | 100 |
| Juegos de la Octojam | a menudo 200 o más (la base de datos lo indica por ROM) |

El archivo de la comunidad ([11.11](#1111-ajustes-por-cartucho)) muestra cuánto varía:
sus 104 programas se juegan en Octo con velocidades de 7 a 10.000 IPF, así repartidas
(20 es el valor que usa Octo cuando un programa no dice nada):

| IPF | Programas del archivo |
|---:|---:|
| 7 | 22 |
| 12 | 1 |
| 15 | 15 |
| 20 | 12 |
| 30 | 7 |
| 60 | 1 |
| 100 | 8 |
| 120 | 1 |
| 200 | 9 |
| 500 | 4 |
| 1000 | 22 |
| 10.000 | 2 |

Los timers bajan siempre a 60 Hz, sin importar el IPF. Un juego que regula su ritmo con
DT (como en [5.2](#52-usar-dt-para-medir-el-tiempo)) no se acelera al subir el IPF;
uno que no lo hace, sí.

**¿Una ROM bajada de internet va muy lenta, o anda rara?** Casi nunca es por falta de
potencia: el núcleo ejecuta 600.000 instrucciones por segundo (10.000 IPF) usando una
fracción chica de la CPU (el escenario 2 de `tools/e2e.js` lo mide). Probá en este
orden:

1. **Fijate si la consola la reconoció.** Si la ROM está en el archivo de la comunidad,
   la consola la configura sola al cargarla, con la plataforma, los quirks y la
   velocidad con que se juega en Octo, y en la ranura dice «ajustes del archivo»
   ([11.11](#1111-ajustes-por-cartucho)). No hace falta tocar nada.
2. **Si no, elegí el perfil según de dónde salió.** Los juegos hechos con Octo, que son
   casi todos los modernos (los de las Octojam incluidos), van con el perfil
   **XO-CHIP** aunque sean de CHIP-8 puro: sus quirks son exactamente los de Octo por
   defecto, con los que se probaron (en el archivo, 89 de los 104 programas los usan).
   Los clásicos de SUPER-CHIP de la HP-48 van con **SUPER-CHIP**, y los programas del
   VIP de los 70 y los 80, con **COSMAC VIP**. Ojo con este último fuera de su época:
   trae la espera de vblank (`displayWait`), como mucho un `DXYN` por frame
   ([12.4](#124-la-espera-del-vblank)), y un juego moderno que dibuja decenas de
   sprites por frame se arrastra con ella aunque subas las IPF.
3. **Recién ahí, ajustá las IPF.** Para un juego de Octo, empezá por 20 (lo que usa Octo
   si el programa no dice nada) y subí: en el archivo hay juegos que piden 1000 y hasta
   10.000. Si el juego va demasiado rápido, bajalas: el valor correcto es el que lo hace
   jugable.

Si se ve roto (gráficos desarmados, saltos a cualquier lado, avisos de instrucciones
ignoradas), no es la velocidad: son los quirks o la plataforma; mirá la tabla de
síntomas de [11.9](#119-cómo-elegir-la-configuración-en-este-emulador).

### 12.3 El frame de 60 Hz en este emulador

Cada frame hace, en este orden:

1. Ejecuta instrucciones hasta completar IPF, o hasta que la máquina se detenga (por un
   error o por `EXIT`), empiece a esperar una tecla (`FX0A`) o, con `displayWait`,
   ejecute un `DXYN`.
2. Decrementa DT y ST una vez (también si está esperando una tecla).
3. La interfaz redibuja la pantalla si cambió y enciende o apaga el beep según ST.

Consecuencias que conviene conocer:

- Dentro de un mismo frame, los timers no cambian: si hacés `LD DT, V0` y enseguida
  `LD V1, DT`, leés el mismo valor.
- Una espera activa sobre DT (el bucle de [5.2](#52-usar-dt-para-medir-el-tiempo))
  "quema" instrucciones hasta el frame siguiente: eso es normal.
- Con la máquina en pausa, no corren frames: ni instrucciones ni timers. **Paso**
  ejecuta una instrucción sin tocar los timers; **Frame** ejecuta un frame completo.

### 12.4 La espera del vblank

Con `displayWait` activo, cada `DXYN` es la última instrucción del frame: el resto de
las IPF de ese frame se pierden y el frame siguiente arranca con la instrucción que
sigue al `DXYN`. Así se ejecutan como máximo 60 `DXYN` por segundo, como en el VIP.
También cuentan los dibujos de SUPER-CHIP y XO-CHIP: los sprites de 16 × 16 (`DXY0`) y
los de alta resolución.

Dos efectos prácticos:

- Un programa que dibuja 10 sprites por cada paso de su bucle avanza, como mucho, 6
  pasos por segundo, sin importar el IPF.
- Subir el IPF solo acelera el código que hay *entre* dibujos.

Es una aproximación: el VIP no tenía "frames de instrucciones", y a veces un dibujo le
llevaba más de un cuadro. Este emulador no intenta imitar la duración de cada
instrucción, solo la regla "un dibujo por cuadro", que es lo que afecta a los programas.

### 12.5 Avance rápido

Mientras mantenés apretada la **T** (o el botón de avance rápido, debajo de la
pantalla), la consola corre **cuatro frames emulados por cada frame real**: en cada
1/60 de segundo ejecuta cuatro veces el frame de
[12.3](#123-el-frame-de-60-hz-en-este-emulador), cada uno con sus IPF y su tic de los
timers. En la pantalla aparece «×4».

Como los timers también van cuatro veces más rápido, el programa no nota nada raro: ve
exactamente la misma sucesión de frames que a velocidad normal, con DT y ST bajando una
vez por frame, solo que todo pasa en la cuarta parte del tiempo. Un juego que mide su
ritmo con DT sigue igual de parejo (la lógica, las animaciones y la música no se
desfasan entre sí) y la espera del vblank sigue permitiendo un dibujo por frame emulado.
Sirve para pasar rápido una presentación lenta o una parte aburrida.

Al soltar, la velocidad vuelve a la de siempre, sin atraso que recuperar. En pausa, o
con la máquina detenida, no hace nada.

---

## 13. Variantes y extensiones

CHIP-8 tuvo muchos descendientes. Dos de ellos, **SUPER-CHIP** y **XO-CHIP**, forman con
CHIP-8 las tres plataformas principales de hoy (así las trata, por ejemplo, la suite de
Timendus), y están implementados en este emulador: son sus otras dos **plataformas**,
que se eligen en **Compatibilidad**, en la pestaña Ajustes del cajón de opciones
([11.9](#119-cómo-elegir-la-configuración-en-este-emulador)). Las demás variantes
([13.12](#1312-otras-variantes)) no lo están.

Esta sección cuenta de dónde salió cada extensión (13.1 y 13.2), qué ofrece cada
plataforma de este emulador y en qué se aparta de los originales (13.3), qué pasa cuando
cargás una ROM (13.4) y cómo funciona cada novedad: las dos resoluciones, los planos de
color, la fuente grande, las banderas, la memoria de 64 KB y el audio (13.5 a 13.10). Al
final, en [13.11](#1311-referencia-de-las-instrucciones-de-super-chip-y-xo-chip), está la
referencia de cada instrucción nueva, con el mismo formato que la sección
[10](#10-referencia-completa-de-las-35-instrucciones).

### 13.1 SUPER-CHIP (SCHIP)

Erik Bryntse lo publicó en 1991, a partir de CHIP-48, para las calculadoras HP-48
(sección [1.5](#15-el-renacimiento-chip-48-y-super-chip)). Agrega una pantalla de alta
resolución, desplazamientos de la imagen (*scroll*), sprites de 16 × 16, una fuente
grande y un lugar fuera de la memoria donde guardar registros:

| Opcode | Mnemónico | Qué hace | Desde |
|---|---|---|---|
| `00CN` | `SCD N` | Desplaza la imagen N píxeles hacia abajo | 1.1 |
| `00FB` | `SCR` | Desplaza la imagen 4 píxeles a la derecha | 1.1 |
| `00FC` | `SCL` | Desplaza la imagen 4 píxeles a la izquierda | 1.1 |
| `00FD` | `EXIT` | Sale del intérprete: termina el programa | 1.0 |
| `00FE` | `LOW` | Pasa a baja resolución (64 × 32) | 1.0 |
| `00FF` | `HIGH` | Pasa a alta resolución (**128 × 64**) | 1.0 |
| `DXY0` | `DRW VX, VY, 0` | Dibuja un sprite de **16 × 16** (32 bytes) | 1.0 |
| `FX30` | `LD HF, VX` | I = glifo del dígito VX en la fuente grande (10 filas de alto) | 1.0 |
| `FX75` | `LD R, VX` | Guarda V0..VX en las banderas RPL, fuera de la memoria | 1.0 |
| `FX85` | `LD VX, R` | Carga V0..VX desde las banderas RPL | 1.0 |

Los mnemónicos son los de la referencia de Cowgod, que son también los del ensamblador
del proyecto. La columna "Desde" sigue la tabla de variantes de Gulrak: según ella, la
versión 1.0 ya tenía las dos resoluciones, los sprites grandes, la fuente grande y las
banderas, y la 1.1 agregó los desplazamientos.

Lo que hacía SUPER-CHIP en la calculadora no es exactamente lo que esperan los programas
de hoy. Muchos juegos de SUPER-CHIP se escribieron (o se probaron) en intérpretes
modernos, sobre todo en Octo, que resolvieron algunos detalles de otra manera; la suite
de Timendus llama **SUPER-CHIP moderno** a ese comportamiento y ***legacy*** al de la
calculadora. Según la tabla de Gulrak y la suite de Timendus, en la HP-48:

- En baja resolución, cada píxel se dibuja como un cuadrado de 2 × 2 de la pantalla de la
  calculadora, y los desplazamientos mueven píxeles de la calculadora: en baja
  resolución, la mitad de lo esperado.
- `00C0` (desplazar cero filas) no es una instrucción válida.
- Cambiar de resolución no borra la pantalla.
- En baja resolución, `DXY0` dibuja un sprite de 8 × 16.
- En alta resolución, la versión 1.1 deja en VF la cantidad de filas del sprite que
  chocaron más las que quedaron recortadas abajo, en lugar de 0 o 1.
- `FX75` y `FX85` admiten solo V0 a V7: la calculadora tiene 8 banderas.
- En baja resolución, cada `DXYN` espera el cuadro siguiente, como en el VIP; en alta,
  no espera. (Timendus cuenta que Bryntse presentaba la alta resolución como un modo más
  rápido.)
- En los quirks, hereda de CHIP-48 `shifting` y `jumping`; la 1.1 no modifica I en
  `FX55`/`FX65` (la 1.0 lo dejaba en I + X) y los sprites se recortan en los bordes.

Timendus aclara que casi todos los programas escritos para la calculadora funcionan
también con el comportamiento moderno, y que casi ninguno depende del desplazamiento a
medias. Este emulador implementa el moderno, el de Octo (13.3).

### 13.2 XO-CHIP

John Earnest definió XO-CHIP para Octo (sección
[1.6](#16-octo-xo-chip-y-la-comunidad-actual)). Su especificación explica que los
agregados son pocos a propósito, para conservar el sabor de las limitaciones de CHIP-8,
y que todo lo de CHIP-8 y SUPER-CHIP sigue funcionando igual. Tiene dos versiones: la
1.0 y la 1.1, que agregó `pitch` y llevó las banderas de SUPER-CHIP de 8 a 16. Parte de
SUPER-CHIP y agrega:

| Opcode | Mnemónico | En Octo | Qué hace |
|---|---|---|---|
| `00DN` | `SCU N` | `scroll-up n` | Desplaza la imagen N píxeles hacia arriba |
| `5XY2` | `SAVE VX, VY` | `save vx - vy` | Guarda VX..VY en memoria desde I, **sin** modificar I |
| `5XY3` | `LOAD VX, VY` | `load vx - vy` | Carga VX..VY desde la memoria en I, sin modificar I |
| `F000 NNNN` | `LD I, LONG NNNN` | `i := long NNNN` | Carga en I una dirección de **16 bits** (instrucción de 4 bytes) |
| `FN01` | `PLANE N` | `plane n` | Elige en qué planos de bits se dibuja (N de 0 a 3) |
| `F002` | `AUDIO` | `audio` | Copia 16 bytes desde I al patrón de audio |
| `FX3A` | `PITCH VX` | `pitch := vx` | Tono: el patrón suena a 4000 × 2^((VX − 64) / 48) bits por segundo |

Los mnemónicos son los del ensamblador del proyecto (la referencia de Cowgod es anterior
a XO-CHIP); la columna "En Octo" muestra cómo se escriben en el lenguaje de Octo. Las
ideas principales:

- **Más memoria.** El PC e I tienen 16 bits: 64 KB direccionables. La carga larga de I
  es la única instrucción de 4 bytes, y los saltos condicionales la saltean entera
  ([13.9](#139-la-memoria-de-64-kb-y-la-carga-larga)).
- **Color.** Un segundo plano de bits, superpuesto al primero, da cuatro colores: el
  fondo, el plano 1, el plano 2 y los dos juntos. `CLS`, `DRW` y los desplazamientos
  actúan solo sobre los planos elegidos ([13.6](#136-planos-y-colores)).
- **Sonido programable.** Mientras suena el buzzer se reproduce un patrón de 128 bits a
  la velocidad que fija `pitch`: tonos distintos, ruido y hasta música
  ([13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)).
- **Rangos de registros.** `5XY2` y `5XY3` vienen de CHIP-8E: leen y escriben cualquier
  rango de registros, en el orden en que se nombran, y no tocan I.
- **Banderas y desplazamientos.** `FX75`/`FX85` admiten los 16 registros, y `00DN`
  completa los desplazamientos de SUPER-CHIP, que no tenía uno hacia arriba.
- **Pila.** La especificación pide 16 niveles, y que llamar con la pila llena o volver
  con la pila vacía sea un error que detenga el programa.

La especificación no habla de quirks. En la práctica, un programa de XO-CHIP espera los
de Octo por defecto (tabla de [11.8](#118-tabla-comparativa)): sigue al VIP en los
desplazamientos de bits, en `FX55`/`FX65` y en `BNNN`, da la vuelta en los bordes en
lugar de recortar, no pone VF en 0 en las operaciones lógicas y no espera el vblank.

### 13.3 Las plataformas de este emulador

El núcleo tiene tres plataformas, y cada una incluye a la anterior:

| | CHIP-8 | SUPER-CHIP | XO-CHIP |
|---|:---:|:---:|:---:|
| Nombre en el núcleo (`cpu.platform`) | `chip8` | `schip` | `xochip` |
| Instrucciones | las 35 de CHIP-8 | + las 10 de SUPER-CHIP | + las 7 de XO-CHIP |
| Memoria | 4 KB | 4 KB | 64 KB |
| ROM más grande | 3584 bytes | 3584 bytes | 65.024 bytes |
| Direcciones (PC y accesos a memoria) | 12 bits | 12 bits | 16 bits |
| Pantalla | 64 × 32 | 64 × 32 y 128 × 64 | 64 × 32 y 128 × 64 |
| Planos (colores) | 1 (2) | 1 (2) | 2 (4) |
| Fuente chica / grande | `0x050` / — | `0x050` / `0x0A0` | `0x050` / `0x0A0` |
| Banderas RPL | — | 16 | 16 |
| Sonido | el beep | el beep | el beep, o el patrón con su tono |

En las tres, la pila tiene 16 niveles, I se guarda con 16 bits y los seis quirks valen
igual: la plataforma es independiente del perfil de quirks
([11.9](#119-cómo-elegir-la-configuración-en-este-emulador)). Cambiar de plataforma
reinicia la máquina con la misma ROM (`setPlatform`); las banderas se conservan.

Las instrucciones de SUPER-CHIP y XO-CHIP se ejecutan como en Octo, que es lo que
esperan los programas modernos: la suite de Timendus toma a Octo como la referencia de
XO-CHIP, y lo que hace Octo con las instrucciones de SUPER-CHIP es lo que la suite llama
SUPER-CHIP moderno. Con algunas decisiones propias, que también aparecen en las fichas
de 13.11:

| Tema | SUPER-CHIP 1.1 en la HP-48 | Octo | Este emulador |
|---|---|---|---|
| Profundidad de la pila | 16 niveles | 12 niveles | 16 niveles, como pide la especificación de XO-CHIP |
| Dónde están las fuentes | — | La chica en `0x000` y la grande en `0x050` | La chica en `0x050` y la grande en `0x0A0` |
| Fuente grande | Solo los dígitos 0 a 9 | Dígitos propios, más cuadrados, y las letras A a F | Los dígitos de SUPER-CHIP 1.1, byte a byte ([13.7](#137-la-fuente-grande)), y las letras de Octo |
| `0NNN` | — | `0000` termina el programa; los demás lo detienen con un aviso | No hacen nada |
| `FN01` con N > 3 y `FX02` con X ≠ 0 | No existen | Se aceptan (`plane` usa N & 3; `FX02` es `audio`) | Opcodes inválidos |
| VF después de dibujar | 0 o 1; en alta resolución, filas con choque más filas recortadas abajo | 0 o 1 | 0 o 1 |
| `DXY0` en baja resolución | 8 × 16 | 16 × 16 | 16 × 16 |
| Desplazamientos en baja resolución | La mitad | Píxeles enteros de baja resolución | Píxeles enteros de baja resolución |
| `00C0` | Inválido | No hace nada | No hace nada |
| `00FE` y `00FF` | No borran la pantalla | Borran la pantalla | Borran la pantalla |
| `FX75` y `FX85` | Hasta V7 | Hasta VF | Hasta VF, también con SUPER-CHIP |
| Sonido antes del primer `F002` | — | Silencio (el patrón empieza en ceros) | El beep de 440 Hz |

Un guion quiere decir que no aplica o que no lo sabemos. Los datos de la HP-48 salen de
la tabla de Gulrak y de la suite de Timendus; los de Octo, de su código (`js/emulator.js`)
y de la especificación de XO-CHIP.

**El ensamblador y el monitor.**

- El ensamblador acepta todas las instrucciones en cualquier programa: no sabe para qué
  plataforma es, y `SYS 0x0FF` sigue valiendo lo mismo que `HIGH`. Con la opción `--xo`
  (o `{ xochip: true }` en la API) el programa puede pasar de `0xFFF` y llegar hasta
  `0xFFFF`; `LD I, LONG` acepta direcciones de 16 bits con o sin esa opción.
- En el **Taller** de la consola, la plataforma de un programa es la que dice la etiqueta
  `; @platform` de sus comentarios del principio (`chip8`, `schip` o `xochip`; sin la
  etiqueta, CHIP-8), la misma que usan los cartuchos incluidos. El selector
  **Plataforma** del Taller escribe esa etiqueta. Al correr el programa, la consola pasa
  a esa plataforma; con `xochip`, además, lo ensambla con la opción de 64 KB.
- El desensamblador del monitor usa los mnemónicos de la plataforma elegida: con CHIP-8,
  `00FF` se ve como `SYS 0x0FF` y `F130` como `DW 0xF130`; con SUPER-CHIP o XO-CHIP,
  como `HIGH` y `LD HF, V1`. Con XO-CHIP, la fila del `F000` muestra la instrucción
  entera (`LD I, LONG 0x8000`) y, una vez que se ejecutó, la fila siguiente, la de
  `NNNN`, dice «(operando)»; las direcciones tienen 4 dígitos.
- El campo MÁQUINA del monitor muestra la plataforma, la resolución y, con XO-CHIP, los
  planos elegidos (por ejemplo, «XO-CHIP · 128×64 · planos 1+2»). La placa de la consola
  dice el modelo, la memoria y la resolución más grande de la plataforma.

### 13.4 Qué pasa si cargás una ROM de SUPER-CHIP o XO-CHIP acá

Casi siempre, la consola lo resuelve sola:

1. **Si la ROM está en el archivo de la comunidad**, se configura antes del primer frame
   con la plataforma, los quirks, la velocidad y los colores con que se juega en Octo
   (con **Ajustes por cartucho** prendido, como viene; [11.11](#1111-ajustes-por-cartucho)).
2. **Si ocupa más de 3584 bytes**, solo puede ser de XO-CHIP: la consola pasa al perfil
   XO-CHIP y te avisa por qué ([11.10](#1110-diagnósticos-de-plataforma)).
3. **Si no**, corre con la plataforma elegida. Si es más chica que la que la ROM
   necesita, cada instrucción que falta hace esto:

| Instrucción | Con CHIP-8 | Con SUPER-CHIP |
|---|---|---|
| `00CN`, `00FB`, `00FC`, `00FE`, `00FF` | Se ignora, con un aviso: la imagen no se desplaza y la pantalla sigue en 64 × 32 | Se ejecuta |
| `00FD` | Se ignora, con un aviso: el programa no termina y sigue con la instrucción siguiente | Se ejecuta |
| `DXY0` | No dibuja nada y pone VF en 0, con un aviso | Se ejecuta |
| `00DN` | Se ignora, con un aviso | Se ignora, con un aviso |
| `FX30`, `FX75`, `FX85` | La máquina se detiene con un error de plataforma | Se ejecuta |
| `5XY2`, `5XY3`, `F000 NNNN`, `FN01`, `F002`, `FX3A` | La máquina se detiene con un error de plataforma | La máquina se detiene con un error de plataforma |

Con XO-CHIP se ejecuta todo. El aviso y el error traen un botón que elige el perfil de la
plataforma que hace falta y reinicia la ROM, así que en la práctica alcanza con un clic
([11.10](#1110-diagnósticos-de-plataforma)).

Un programa de SUPER-CHIP o XO-CHIP que no usa ninguna de estas instrucciones (por
ejemplo, un juego de Octo de CHIP-8 puro) corre con cualquier plataforma; lo que importa
entonces son los quirks ([11.9](#119-cómo-elegir-la-configuración-en-este-emulador)). El
cartucho incluido **Planos** es un ejemplo de XO-CHIP: al elegirlo, la consola pasa sola
a esa plataforma.

### 13.5 Alta y baja resolución

SUPER-CHIP y XO-CHIP tienen dos modos de pantalla:

| Modo | Tamaño | x | y | Se elige con |
|---|---|---|---|---|
| Baja resolución (*lores*) | 64 × 32 | 0 a 63 | 0 a 31 | `00FE` (`LOW`) |
| Alta resolución (*hires*) | 128 × 64 | 0 a 127 | 0 a 63 | `00FF` (`HIGH`) |

Es la misma pantalla con el doble de píxeles en cada dirección: un píxel de baja
resolución equivale a un cuadrado de 2 × 2 de alta.

```
 baja resolución: el píxel (1, 0)       alta resolución: los píxeles (2, 0), (3, 0), (2, 1) y (3, 1)

  x:  0   1   2                           x: 0 1 2 3 4 5
    +---+---+---+                           +-+-+-+-+-+-+
    |   |###|   |  y = 0                    | | |#|#| | |  y = 0
    +---+---+---+                           +-+-+-+-+-+-+
                                            | | |#|#| | |  y = 1
                                            +-+-+-+-+-+-+
```

Las reglas:

- **Todo programa arranca en baja resolución**, también los de SUPER-CHIP y XO-CHIP:
  reiniciar, cargar una ROM o cambiar de plataforma vuelven a 64 × 32.
- **`HIGH` y `LOW` borran la pantalla**, aunque ya estuviera en ese modo, y los dos
  planos aunque `PLANE` haya elegido uno solo. No tocan los registros, la memoria ni el
  plano elegido.
- **Las coordenadas dan la vuelta según el modo**: en alta resolución, `x0 = VX % 128` e
  `y0 = VY % 64`, y el quirk `clipping` recorta (o da la vuelta) en los bordes de 128 y
  de 64.
- **`DXY0` dibuja 16 × 16 en los dos modos**, y `DXYN` con N de 1 a 15 sigue siendo de
  8 × N.
- **Los desplazamientos se miden en píxeles del modo actual**: `SCD N` y `SCU N` mueven
  N filas (de 0 a 15) y `SCR` y `SCL`, 4 columnas. Lo que sale por un borde se pierde
  (no vuelve por el otro) y lo que queda libre se apaga.
- **VF** vale 1 o 0 después de dibujar, en los dos modos.
- **En el núcleo**, `cpu.hires` dice el modo y `cpu.displayWidth` × `cpu.displayHeight`
  el tamaño. El arreglo `cpu.display` se reemplaza por uno nuevo cuando el tamaño
  cambia, así que hay que volver a leerlo en cada frame en lugar de guardarlo.

Con la plataforma CHIP-8, `HIGH`, `LOW` y los desplazamientos se ignoran (con aviso) y
la pantalla queda siempre en 64 × 32.

> **Diferencia con SUPER-CHIP 1.1.** En la calculadora, cambiar de modo no borraba la
> pantalla, los desplazamientos en baja resolución movían la mitad, `DXY0` dibujaba
> 8 × 16 en baja resolución y VF contaba filas en alta (13.1). Este emulador hace lo que
> Octo.

### 13.6 Planos y colores

La pantalla de XO-CHIP son dos pantallas superpuestas del mismo tamaño, el **plano 1** y
el **plano 2**. Cada píxel tiene un bit en cada plano, así que puede estar en cuatro
estados, y la consola pinta cada uno con un color de la paleta:

| Valor del píxel | Plano 2 | Plano 1 | Color de la paleta | En los diagramas |
|:---:|:---:|:---:|---|:---:|
| 0 | apagado | apagado | El fondo | `.` |
| 1 | apagado | prendido | El del plano 1: el color de siempre | `#` |
| 2 | prendido | apagado | El del plano 2 | `+` |
| 3 | prendido | prendido | El de los dos planos | `@` |

En el núcleo, cada elemento de `cpu.display` es esa máscara: el bit 0 es el plano 1 y
el bit 1, el plano 2. Con CHIP-8 y SUPER-CHIP hay un solo plano, el 1 (valores 0 y 1).

**`PLANE` elige dónde actúan las instrucciones de dibujo.** `FN01` (`PLANE N`) guarda
una máscara de 2 bits: `PLANE 1` (lo que hay al arrancar), `PLANE 2`, `PLANE 3` (los
dos) o `PLANE 0` (ninguno). `DRW`, `CLS` y los cuatro desplazamientos actúan solo sobre
los planos elegidos y dejan los otros como estaban. `HIGH` y `LOW` son la excepción:
siempre borran los dos.

**Con los dos planos elegidos, el sprite usa el doble de bytes.** Primero se dibujan en
el plano 1 los N bytes que empiezan en I, y después, en el plano 2, los N bytes
siguientes (con `DXY0`, 32 y 32). Con un solo plano elegido, sus datos empiezan en I, sea
el 1 o el 2. Así, un solo `DRW` con `PLANE 3` dibuja (o borra, por el XOR) un sprite de
cuatro colores:

```asm
; Plataforma: XO-CHIP
; Un cuadrado de 8 × 8 con los cuatro colores
        PLANE 3
        LD   I, cuadro
        LD   V0, 28
        LD   V1, 12
        DRW  V0, V1, 8      ; 8 bytes para el plano 1 y los 8 siguientes para el plano 2
fin:    JP   fin
cuadro: DB   0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00   ; plano 1: la mitad de arriba
        DB   0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0, 0xF0   ; plano 2: la mitad izquierda
```

```
   plano 1 (bytes 0 a 7)     plano 2 (bytes 8 a 15)     en la pantalla
   ########                  ####....                   @@@@####
   ########                  ####....                   @@@@####
   ########                  ####....                   @@@@####
   ########                  ####....                   @@@@####
   ........                  ####....                   ++++....
   ........                  ####....                   ++++....
   ........                  ####....                   ++++....
   ........                  ####....                   ++++....
```

**VF** vale 1 si algún píxel encendido se apagó en cualquiera de los planos dibujados;
lo que pase en un plano no elegido no cuenta. Con `PLANE 0`, `DRW` no dibuja nada y deja
VF en 0.

Un uso típico, que muestra el cartucho incluido **Planos**: lo que se mueve en un plano y
lo fijo en el otro. Como `SCR`, `SCL`, `SCD` y `SCU` corren solo los planos elegidos, se
puede desplazar un plano entero sin tocar el otro.

**Los colores los decide la consola, no el programa**: la especificación deja la paleta
a cargo del intérprete. Cada paleta de este emulador tiene sus cuatro colores; con
**Personalizada** los elegís vos, y los juegos del archivo de la comunidad traen los
suyos (la paleta **Del cartucho**, [11.11](#1111-ajustes-por-cartucho)).

### 13.7 La fuente grande

SUPER-CHIP agrega una segunda fuente, de **8 × 10** píxeles, para mostrar números
grandes, por ejemplo un puntaje en alta resolución. `FX30` (`LD HF, VX`) apunta I al
glifo del dígito bajo de VX, que se dibuja con `DRW VX, VY, 10`:

```
I ← 0x0A0 + (V[X] & 0xF) × 10              ; en este emulador
```

Con SUPER-CHIP y XO-CHIP, este emulador guarda los 16 glifos (160 bytes) en
`0x0A0`–`0x13F` (`BIG_FONT_ADDR`), justo después de la fuente chica; con CHIP-8 esa
zona queda en cero. Los dígitos 0 a 9 tienen la forma de los de SUPER-CHIP 1.1 y las
letras A a F son las de Octo, porque SUPER-CHIP 1.1 no tenía letras grandes. Como en la
sección [8.2](#82-los-16-glifos), a la izquierda de cada fila está su byte:

```
        0                 1                 2                 3
 3C  ..####..      18  ...##...      3E  ..#####.      3C  ..####..
 7E  .######.      38  ..###...      7F  .#######      7E  .######.
 E7  ###..###      58  .#.##...      C3  ##....##      C3  ##....##
 C3  ##....##      18  ...##...      06  .....##.      03  ......##
 C3  ##....##      18  ...##...      0C  ....##..      0E  ....###.
 C3  ##....##      18  ...##...      18  ...##...      0E  ....###.
 C3  ##....##      18  ...##...      30  ..##....      03  ......##
 E7  ###..###      18  ...##...      60  .##.....      C3  ##....##
 7E  .######.      18  ...##...      FF  ########      7E  .######.
 3C  ..####..      3C  ..####..      FF  ########      3C  ..####..

        4                 5                 6                 7
 06  .....##.      FF  ########      3E  ..#####.      FF  ########
 0E  ....###.      FF  ########      7C  .#####..      FF  ########
 1E  ...####.      C0  ##......      E0  ###.....      03  ......##
 36  ..##.##.      C0  ##......      C0  ##......      06  .....##.
 66  .##..##.      FC  ######..      FC  ######..      0C  ....##..
 C6  ##...##.      FE  #######.      FE  #######.      18  ...##...
 FF  ########      03  ......##      C3  ##....##      30  ..##....
 FF  ########      C3  ##....##      C3  ##....##      60  .##.....
 06  .....##.      7E  .######.      7E  .######.      60  .##.....
 06  .....##.      3C  ..####..      3C  ..####..      60  .##.....

        8                 9                 A                 B
 3C  ..####..      3C  ..####..      7E  .######.      FC  ######..
 7E  .######.      7E  .######.      FF  ########      FC  ######..
 C3  ##....##      C3  ##....##      C3  ##....##      C3  ##....##
 C3  ##....##      C3  ##....##      C3  ##....##      C3  ##....##
 7E  .######.      7F  .#######      C3  ##....##      FC  ######..
 7E  .######.      3F  ..######      FF  ########      FC  ######..
 C3  ##....##      03  ......##      FF  ########      C3  ##....##
 C3  ##....##      03  ......##      C3  ##....##      C3  ##....##
 7E  .######.      3E  ..#####.      C3  ##....##      FC  ######..
 3C  ..####..      7C  .#####..      C3  ##....##      FC  ######..

        C                 D                 E                 F
 3C  ..####..      FC  ######..      FF  ########      FF  ########
 FF  ########      FE  #######.      FF  ########      FF  ########
 C3  ##....##      C3  ##....##      C0  ##......      C0  ##......
 C0  ##......      C3  ##....##      C0  ##......      C0  ##......
 C0  ##......      C3  ##....##      FF  ########      FF  ########
 C0  ##......      C3  ##....##      FF  ########      FF  ########
 C0  ##......      C3  ##....##      C0  ##......      C0  ##......
 C3  ##....##      C3  ##....##      C0  ##......      C0  ##......
 FF  ########      FE  #######.      FF  ########      C0  ##......
 3C  ..####..      FC  ######..      FF  ########      C0  ##......
```

Los mismos bytes, con la dirección de cada glifo en este emulador:

| Dígito | Bytes | Dirección |
|:---:|---|:---:|
| 0 | `3C 7E E7 C3 C3 C3 C3 E7 7E 3C` | `0x0A0` |
| 1 | `18 38 58 18 18 18 18 18 18 3C` | `0x0AA` |
| 2 | `3E 7F C3 06 0C 18 30 60 FF FF` | `0x0B4` |
| 3 | `3C 7E C3 03 0E 0E 03 C3 7E 3C` | `0x0BE` |
| 4 | `06 0E 1E 36 66 C6 FF FF 06 06` | `0x0C8` |
| 5 | `FF FF C0 C0 FC FE 03 C3 7E 3C` | `0x0D2` |
| 6 | `3E 7C E0 C0 FC FE C3 C3 7E 3C` | `0x0DC` |
| 7 | `FF FF 03 06 0C 18 30 60 60 60` | `0x0E6` |
| 8 | `3C 7E C3 C3 7E 7E C3 C3 7E 3C` | `0x0F0` |
| 9 | `3C 7E C3 C3 7F 3F 03 03 3E 7C` | `0x0FA` |
| A | `7E FF C3 C3 C3 FF FF C3 C3 C3` | `0x104` |
| B | `FC FC C3 C3 FC FC C3 C3 FC FC` | `0x10E` |
| C | `3C FF C3 C0 C0 C0 C0 C3 FF 3C` | `0x118` |
| D | `FC FE C3 C3 C3 C3 C3 C3 FE FC` | `0x122` |
| E | `FF FF C0 C0 FF FF C0 C0 FF FF` | `0x12C` |
| F | `FF FF C0 C0 FF FF C0 C0 C0 C0` | `0x136` |

> **Diferencia con SUPER-CHIP 1.1.** Su fuente grande tenía solo los diez dígitos: así
> la reproducen Octo y Cadmium, el emulador de Gulrak, y los diez de esta consola
> coinciden byte a byte con esas dos tablas (incluida la tercera fila del 6, `E0`).
> Las letras A a F son un agregado de Octo.

> **Diferencia con Octo.** Octo guarda la fuente chica en `0x000` y la grande a
> continuación, en `0x050`, y con su estilo de fuente por defecto los dígitos grandes son
> otros, más cuadrados (las letras A a F sí son las mismas). Un programa que dependa de
> la dirección o de la forma exacta de los glifos no es portable: usá siempre `FX30`.

### 13.8 Las banderas RPL

SUPER-CHIP puede guardar registros fuera de la memoria del programa. En la HP-48 eran
variables del sistema operativo de la calculadora (así lo cuenta la especificación de
XO-CHIP), y por eso se las suele llamar **banderas RPL**: RPL es el lenguaje de la
HP-48. `FX75` (`LD R, VX`) copia V0..VX en las banderas y `FX85` (`LD VX, R`) las vuelve
a cargar. La especificación agrega que algunos intérpretes modernos las conservan de una
ejecución a otra: así un juego puede guardar, por ejemplo, su récord.

En este emulador:

- Hay **16 banderas** (`cpu.flags`), con SUPER-CHIP y con XO-CHIP: X puede ir de 0 a F.
- Están fuera de la memoria: `FX75` y `FX85` no tocan I ni la memoria.
- Sobreviven a todo lo que reinicia la máquina: **Reiniciar**, cargar otra ROM o cambiar
  de plataforma.
- Con **Ajustes por cartucho** prendido, la consola además las guarda en el navegador
  para cada ROM, por su huella, y se las devuelve la próxima vez que la cargues: un
  récord dura de una sesión a otra. Una ROM que nunca guardó banderas arranca con las 16
  en cero. Con el interruptor apagado, las banderas duran lo que dura la página y las
  comparten todas las ROMs.

```asm
; Plataforma: SUPER-CHIP
; Cuenta cuántas veces arrancó este programa: la cuenta sobrevive a Reiniciar
        LD   V0, R          ; V0 = bandera 0 (cero la primera vez)
        ADD  V0, 1
        LD   R, V0          ; bandera 0 = V0, para la próxima
        LD   F, V0          ; mostrar la cuenta (su dígito hexadecimal bajo)
        LD   V1, 0
        DRW  V1, V1, 5
fin:    JP   fin
```

> **Diferencia con SUPER-CHIP 1.1.** En una HP-48 hay solo 8 banderas: `FX75` y `FX85`
> admiten X de 0 a 7 (Gulrak). La versión 1.1 de XO-CHIP las extendió a 16, y este
> emulador, como Octo, ofrece las 16 también con la plataforma SUPER-CHIP.

### 13.9 La memoria de 64 KB y la carga larga

Con XO-CHIP, el PC e I tienen 16 bits y la memoria llega a 64 KB:

```
 0xFFFF +--------------------------------------+
        |                                      |
        |   programa y datos (la ROM)          |   hasta 65.024 bytes
        |   lo que está arriba de 0xFFF solo   |   (de 0x0200 a 0xFFFF)
        |   se alcanza con LD I, LONG          |
        |                                      |
 0x1000 + - - - - - - - - - - - - - - - - - - -+   hasta acá llegan JP, CALL y LD I, NNN
        |                                      |
 0x0200 +--------------------------------------+   PROGRAM_START: la ROM y el PC
        |   libre (ceros)                      |   0x0140 - 0x01FF
 0x0140 +--------------------------------------+
        |   fuente grande (160 bytes)          |   0x00A0 - 0x013F
 0x00A0 +--------------------------------------+
        |   fuente chica (80 bytes)            |   0x0050 - 0x009F
 0x0050 +--------------------------------------+
        |   libre (ceros)                      |   0x0000 - 0x004F
 0x0000 +--------------------------------------+
```

Las instrucciones de siempre siguen teniendo direcciones de 12 bits: `JP`, `CALL` y
`LD I, NNN` llegan solo hasta `0xFFF` (y `JP V0`, como mucho, hasta `0x10FE`). Por eso
conviene que el código esté abajo; arriba de `0xFFF` van los datos (gráficos, niveles,
música), y a ellos se llega con la única instrucción de 4 bytes: `F000 NNNN`
(`LD I, LONG NNNN`), que carga en I la palabra que la sigue.

**Todo da la vuelta en 16 bits.** El PC pasa de `0xFFFE` a `0x0000`, y todas las
lecturas y escrituras de memoria (`DXYN`, `FX33`, `FX55`, `FX65`, `5XY2`, `5XY3` y
`F002`) usan la dirección completa, módulo 65.536. `ADD I, VX` también da la vuelta en
`0xFFFF`, y `JP V0, NNN` puede saltar más allá de `0xFFF` (`NNN + V0` llega hasta
`0x10FE`).

**Los saltos condicionales saltean `F000 NNNN` entera.** `3XNN`, `4XNN`, `5XY0`,
`9XY0`, `EX9E` y `EXA1` miran la instrucción siguiente: si es `F000`, avanzan 4 bytes en
lugar de 2, para no caer en el medio de la instrucción (en la palabra `NNNN`). Con
CHIP-8 y SUPER-CHIP, `F000` no es una instrucción y los saltos avanzan 2 bytes, como
siempre. La especificación aprovecha esa diferencia para que un programa averigüe si
está en un intérprete de XO-CHIP:

```asm
; ¿El intérprete tiene XO-CHIP? (la idea es de la especificación de XO-CHIP)
        LD   V0, 0          ; V0 = 0: no hay XO-CHIP
        SE   VF, VF         ; siempre saltea la instrucción siguiente...
        DW   0xF000         ; ...que con XO-CHIP es F000 NNNN: 4 bytes, junto con el JP
        JP   fin            ; CHIP-8 y SUPER-CHIP saltean solo el F000 y llegan acá
        LD   V0, 1          ; XO-CHIP saltea los 4 bytes y llega acá
fin:    JP   fin
```

**Para ensamblar** un programa que pasa de `0xFFF`, usá
`node tools/chip8asm.js programa.asm --xo` (o `assemble(fuente, { xochip: true })`):
sin esa opción, el ensamblador avisa que el programa no entra en 4 KB. En el Taller de la
consola, lo mismo lo hace la etiqueta `; @platform xochip` al principio del programa
([13.3](#133-las-plataformas-de-este-emulador)). Con XO-CHIP, el monitor muestra las
direcciones con 4 dígitos, y los mensajes de error también («... en la dirección
0x020A»); el mapa de la pestaña **Memoria** muestra la memoria de a páginas de 4 KB, con
una tira arriba que resume las 16.

### 13.10 El audio de XO-CHIP: patrón y tono

CHIP-8 tiene un solo sonido, que suena mientras ST es mayor que 0 (sección
[5.3](#53-el-buzzer)). XO-CHIP lo conserva, ST sigue decidiendo **cuándo** suena, y
agrega **cómo** suena:

- **El patrón** son 16 bytes, 128 bits. `F002` (`AUDIO`) los copia desde I. Mientras ST
  es mayor que 0, la consola los reproduce en bucle, del bit más alto del primer byte al
  más bajo del último: cada 1 es la onda arriba y cada 0, abajo. Es una copia: cambiar
  la memoria después no cambia el sonido hasta el próximo `F002`.
- **El tono** (`pitch`) es la velocidad a la que se leen esos bits. `FX3A` (`PITCH VX`)
  lo carga desde VX; al arrancar vale 64. La velocidad, en bits por segundo, es

```
velocidad = 4000 × 2^((pitch − 64) / 48)
```

Con 64 son 4000 bits por segundo, y cada 48 de `pitch` la velocidad se duplica (una
octava): sumar 4 sube un semitono. La nota que se oye depende también del patrón: si el
patrón repite un ciclo cada 16 bits, la frecuencia es la velocidad dividida por 16; si
tiene un solo ciclo en los 128 bits, la velocidad dividida por 128. En la tabla, las
tres últimas columnas son la nota con un ciclo cada 128, 32 y 16 bits:

| `pitch` | Bits por segundo | Ciclo de 128 bits | Ciclo de 32 bits | Ciclo de 16 bits |
|---:|---:|---:|---:|---:|
| 0 | 1587 | 12,40 Hz | 49,61 Hz | 99,21 Hz |
| 16 | 2000 | 15,63 Hz | 62,50 Hz | 125,00 Hz |
| 64 (al arrancar) | 4000 | 31,25 Hz | 125,00 Hz | 250,00 Hz |
| 112 | 8000 | 62,50 Hz | 250,00 Hz | 500,00 Hz |
| 115 | 8354 | 65,27 Hz | 261,07 Hz | 522,14 Hz |
| 160 | 16.000 | 125,00 Hz | 500,00 Hz | 1000,00 Hz |
| 208 | 32.000 | 250,00 Hz | 1000,00 Hz | 2000,00 Hz |
| 247 | 56.200 | 439,06 Hz | 1756,25 Hz | 3512,50 Hz |
| 255 | 63.082 | 492,83 Hz | 1971,33 Hz | 3942,65 Hz |

Los dos patrones de la especificación son estos: con `pitch` 247, el primero da 439 Hz,
casi el la de 440 Hz, y el segundo, dos octavas más arriba, 1756 Hz. El cartucho
incluido **Planos** usa un ciclo cada 16 bits: con `pitch` 115 suena un do de 522 Hz.

```
00 00 00 00 00 00 00 00 FF FF FF FF FF FF FF FF     un ciclo en los 128 bits
00 00 FF FF 00 00 FF FF 00 00 FF FF 00 00 FF FF     un ciclo cada 32 bits
```

**Cómo lo hace esta consola:**

- Hasta que el programa ejecuta su primer `F002`, suena el beep de siempre (440 Hz): los
  programas de CHIP-8 y SUPER-CHIP no se quedan mudos. Desde el primer `F002`, y hasta
  que la máquina se reinicie, suena el patrón.
- El patrón respeta el volumen y el silencio de la consola, como el beep. Además, se le
  resta su promedio: un patrón parejo (todo ceros o todo unos) no suena, y así es como
  se calla un programa de XO-CHIP.
- Reiniciar vuelve todo al principio: patrón en ceros, `pitch` en 64 y el beep.

> **Diferencia con Octo.** La especificación deja el contenido inicial del patrón a
> cargo del intérprete y recomienda cargarlo siempre; Octo lo empieza en ceros, así que
> un programa que nunca ejecuta `F002` no suena. Acá suena el beep hasta el primer
> `F002`. Además, la especificación pide que la reproducción vuelva al principio del
> patrón solo cuando ST llega a 0 o se pone en 0, y así lo hace Octo; esta consola, en
> cambio, vuelve al principio del bucle cuando cambian el patrón o el tono, y no cuando
> ST llega a 0.

### 13.11 Referencia de las instrucciones de SUPER-CHIP y XO-CHIP

Las fichas tienen el mismo formato que las de la sección
[10](#10-referencia-completa-de-las-35-instrucciones) y una línea más, **Plataforma**,
que dice con cuáles se ejecutan; con una plataforma más chica pasa lo que explica
[13.4](#134-qué-pasa-si-cargás-una-rom-de-super-chip-o-xo-chip-acá). Cada ejemplo dice,
en un comentario al principio, la plataforma que hay que elegir para correrlo.

| Opcode | Mnemónico | Qué hace | VF | Plataforma |
|---|---|---|---|---|
| `00CN` | `SCD N` | Desplaza los planos elegidos N filas hacia abajo | — | SUPER-CHIP y XO-CHIP |
| `00DN` | `SCU N` | Desplaza los planos elegidos N filas hacia arriba | — | XO-CHIP |
| `00FB` | `SCR` | Desplaza los planos elegidos 4 columnas a la derecha | — | SUPER-CHIP y XO-CHIP |
| `00FC` | `SCL` | Desplaza los planos elegidos 4 columnas a la izquierda | — | SUPER-CHIP y XO-CHIP |
| `00FD` | `EXIT` | Termina el programa | — | SUPER-CHIP y XO-CHIP |
| `00FE` | `LOW` | Pasa a 64 × 32 y borra la pantalla | — | SUPER-CHIP y XO-CHIP |
| `00FF` | `HIGH` | Pasa a 128 × 64 y borra la pantalla | — | SUPER-CHIP y XO-CHIP |
| `5XY2` | `SAVE VX, VY` | Guarda VX..VY en memoria desde I; I no cambia | — | XO-CHIP |
| `5XY3` | `LOAD VX, VY` | Carga VX..VY desde la memoria en I; I no cambia | — | XO-CHIP |
| `DXY0` | `DRW VX, VY, 0` | Dibuja un sprite de 16 × 16 en (VX, VY) | colisión | SUPER-CHIP y XO-CHIP |
| `F000 NNNN` | `LD I, LONG NNNN` | I = NNNN (instrucción de 4 bytes) | — | XO-CHIP |
| `FN01` | `PLANE N` | Elige los planos de dibujo (N de 0 a 3) | — | XO-CHIP |
| `F002` | `AUDIO` | Copia 16 bytes desde I al patrón de audio | — | XO-CHIP |
| `FX30` | `LD HF, VX` | I = glifo grande del dígito VX | — | SUPER-CHIP y XO-CHIP |
| `FX3A` | `PITCH VX` | Tono del patrón de audio = VX | — | XO-CHIP |
| `FX75` | `LD R, VX` | Guarda V0..VX en las banderas RPL | — | SUPER-CHIP y XO-CHIP |
| `FX85` | `LD VX, R` | Carga V0..VX desde las banderas RPL | — | SUPER-CHIP y XO-CHIP |

---

#### `00CN` — SCD N

**Desplazar la imagen N filas hacia abajo.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
para cada plano elegido (con SUPER-CHIP, solo el plano 1):
    cada fila baja N filas; las N de más abajo se pierden
    las N filas de arriba quedan apagadas
; las filas son las de la resolución actual (32 o 64); con N = 0 no hace nada
```

Corre la imagen hacia abajo de 0 a 15 filas, en píxeles de la resolución actual. Lo que
sale por abajo no vuelve por arriba, y arriba quedan N filas vacías. No toca registros
ni memoria. Con XO-CHIP corre solo los planos elegidos con `PLANE`
([13.6](#136-planos-y-colores)); con CHIP-8 se ignora, con un aviso
([11.10](#1110-diagnósticos-de-plataforma)).

> **Diferencia con SUPER-CHIP 1.1.** En la HP-48, en baja resolución el desplazamiento
> mueve la mitad, y `00C0` no es una instrucción válida (Gulrak). Este emulador, como
> Octo, mueve N filas enteras en las dos resoluciones, y `SCD 0` no hace nada.

```asm
; Plataforma: SUPER-CHIP
        LD   I, barra
        LD   V0, 0
        LD   V1, 0
        DRW  V0, V1, 1      ; una barra de 8 píxeles en la fila 0
        SCD  4              ; ahora está en la fila 4, y las filas 0 a 3 quedan vacías
fin:    JP   fin
barra:  DB   0xFF
```

---

#### `00DN` — SCU N

**Desplazar la imagen N filas hacia arriba.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
para cada plano elegido:
    cada fila sube N filas; las N de más arriba se pierden
    las N filas de abajo quedan apagadas
; con N = 0 no hace nada
```

El complemento de `SCD N`, que XO-CHIP agregó porque SUPER-CHIP tenía desplazamientos
para abajo y para los costados, pero no para arriba. Las mismas reglas: de 0 a 15 filas
de la resolución actual, sin dar la vuelta, solo en los planos elegidos. Con CHIP-8 y
con SUPER-CHIP se ignora, con un aviso (en el monitor de SUPER-CHIP se ve como
`SYS 0x0DN`).

```asm
; Plataforma: XO-CHIP
        LD   I, barra
        LD   V0, 0
        LD   V1, 31
        DRW  V0, V1, 1      ; una barra en la última fila (la 31, en baja resolución)
        SCU  8              ; sube a la fila 23; abajo quedan 8 filas vacías
fin:    JP   fin
barra:  DB   0xFF
```

---

#### `00FB` — SCR

**Desplazar la imagen 4 píxeles a la derecha.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
para cada plano elegido, en cada fila:
    cada píxel se corre 4 columnas a la derecha; las 4 de más a la derecha se pierden
    las columnas 0 a 3 quedan apagadas
```

Siempre son 4 columnas de la resolución actual. Lo que sale por la derecha no vuelve
por la izquierda ni pasa a la fila de abajo. Con XO-CHIP, solo en los planos elegidos.

> **Diferencia con SUPER-CHIP 1.1.** En la HP-48, en baja resolución mueve la mitad: 2
> píxeles de baja resolución (Gulrak). Acá, como en Octo, son 4 en los dos modos.

```asm
; Plataforma: SUPER-CHIP
        LD   I, punto
        LD   V0, 0
        LD   V1, 0
        DRW  V0, V1, 1      ; un punto en (0, 0)
        SCR                 ; ahora está en (4, 0)
        SCR                 ; y ahora en (8, 0)
fin:    JP   fin
punto:  DB   0x80
```

---

#### `00FC` — SCL

**Desplazar la imagen 4 píxeles a la izquierda.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
para cada plano elegido, en cada fila:
    cada píxel se corre 4 columnas a la izquierda; las 4 de más a la izquierda se pierden
    las 4 columnas de la derecha quedan apagadas
```

El espejo de `SCR`, con las mismas reglas y la misma diferencia con SUPER-CHIP 1.1 en
baja resolución.

```asm
; Plataforma: SUPER-CHIP
; Correr la imagen entera 32 píxeles a la izquierda, 4 por frame
        LD   V2, 8          ; 8 desplazamientos de 4 píxeles
otra:   SCL
        LD   V0, 1
        LD   DT, V0
espera: LD   V0, DT         ; esperar al frame siguiente
        SE   V0, 0
        JP   espera
        ADD  V2, -1
        SE   V2, 0
        JP   otra
fin:    JP   fin
```

---

#### `00FD` — EXIT

**Terminar el programa.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
halted ← verdadero;  exited ← verdadero      ; la máquina se detiene, sin error
PC ← la dirección del 00FD                   ; queda apuntando a la instrucción
```

En SUPER-CHIP salía del intérprete. En esta consola, la máquina se detiene **sin
error** (`cpu.error` queda en `null` y `cpu.exited` en `true`) y la pantalla muestra
«FIN DEL PROGRAMA» ([11.10](#1110-diagnósticos-de-plataforma)). Para volver a jugar hay
que reiniciar. Con CHIP-8 se ignora, con un aviso, y el programa sigue con la
instrucción siguiente.

```asm
; Fragmento: partida es una subrutina de tu programa.
; Plataforma: SUPER-CHIP
otra:   CALL partida
        LD   V0, K          ; al terminar: la tecla 0 sale, cualquier otra vuelve a jugar
        SE   V0, 0
        JP   otra
        EXIT
```

---

#### `00FE` — LOW

**Pasar a baja resolución (64 × 32) y borrar la pantalla.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
resolución ← 64 × 32
apagar todos los píxeles, en los dos planos
```

Vuelve al modo de CHIP-8 y borra la pantalla entera, aunque ya estuviera en baja
resolución y aunque `PLANE` haya elegido un solo plano ([13.5](#135-alta-y-baja-resolución)).
Toda ROM arranca en baja resolución, así que `LOW` hace falta solo para volver de
`HIGH`.

> **Diferencia con SUPER-CHIP 1.1.** En la HP-48, cambiar de resolución no borraba la
> pantalla, y quedaban restos (Gulrak). Este emulador, como Octo, la borra siempre.

```asm
; Fragmento: titulo es una subrutina y juego una etiqueta de tu programa.
; Plataforma: SUPER-CHIP
        HIGH                ; la pantalla de título, en 128 × 64
        CALL titulo
        LD   V0, K          ; esperar una tecla
        LOW                 ; el juego, en 64 × 32 (y con la pantalla borrada)
        JP   juego
```

---

#### `00FF` — HIGH

**Pasar a alta resolución (128 × 64) y borrar la pantalla.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
resolución ← 128 × 64
apagar todos los píxeles, en los dos planos
```

Desde acá, las coordenadas van de 0 a 127 y de 0 a 63, y `DXYN`, `DXY0` y los
desplazamientos trabajan en píxeles de alta resolución
([13.5](#135-alta-y-baja-resolución)). Como `LOW`, borra la pantalla entera siempre.
Con CHIP-8 se ignora, con un aviso, y la pantalla sigue en 64 × 32.

```asm
; Plataforma: SUPER-CHIP
        HIGH                ; 128 × 64, con la pantalla borrada
        LD   I, punto
        LD   V0, 127
        LD   V1, 63
        DRW  V0, V1, 1      ; la esquina de abajo a la derecha: existe recién en alta resolución
fin:    JP   fin
punto:  DB   0x80
```

---

#### `5XY2` — SAVE VX, VY

**Guardar VX..VY en memoria, a partir de I, sin mover I.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
si X ≤ Y:  para k de 0 a Y − X:  memoria[I + k] ← V[X + k]
si no:     para k de 0 a X − Y:  memoria[I + k] ← V[X − k]
; I no cambia; las direcciones dan la vuelta en 0xFFFF
```

Guarda un rango de registros en el orden en que los nombrás: `SAVE V2, V5` guarda V2,
V3, V4 y V5; `SAVE V5, V2` guarda V5, V4, V3 y V2. A diferencia de `FX55`, no tiene que
empezar en V0 y **nunca mueve I**, con cualquier perfil (el quirk `memory` no la
afecta). XO-CHIP la tomó de CHIP-8E, que según Gulrak solo admitía X ≤ Y.

```asm
; Plataforma: XO-CHIP
; Guardar la posición del jugador (V4, V5) sin tocar V0..V3
        LD   I, jugador
        SAVE V4, V5         ; jugador = V4, V5; I sigue apuntando a "jugador"
fin:    JP   fin
jugador: DB  0, 0
```

---

#### `5XY3` — LOAD VX, VY

**Cargar VX..VY desde la memoria en I, sin mover I.**

**VF:** sin cambios (salvo que el rango incluya VF) · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
si X ≤ Y:  para k de 0 a Y − X:  V[X + k] ← memoria[I + k]
si no:     para k de 0 a X − Y:  V[X − k] ← memoria[I + k]
; I no cambia
```

La operación inversa de `SAVE`, con las mismas reglas: el orden de los registros es el
que escribís y I queda donde estaba. Con las dos juntas se puede, por ejemplo, dar
vuelta un bloque de memoria sin calcular nada.

```asm
; Plataforma: XO-CHIP
; Dar vuelta 4 bytes en el lugar (el ejemplo de la especificación)
        LD   I, datos
        LOAD V0, V3         ; V0..V3 = 1, 2, 3, 4
        SAVE V3, V0         ; datos = 4, 3, 2, 1 (I no se movió)
fin:    JP   fin
datos:  DB   1, 2, 3, 4
```

---

#### `DXY0` — DRW VX, VY, 0

**Dibujar un sprite de 16 × 16 en (VX, VY) con XOR; VF = colisión.**

**VF:** 1 si algún píxel encendido se apagó, 0 si no · **Quirks:** [`clipping`](#116-clipping-recortar-o-dar-la-vuelta), [`displayWait`](#117-displaywait-esperar-el-vblank) · **Plataforma:** SUPER-CHIP y XO-CHIP

```
x0 ← V[X] % ancho;  y0 ← V[Y] % alto          ; 64 × 32 o 128 × 64
colisión ← 0;  dirección ← I
para cada plano elegido (primero el 1, después el 2):
    para fila de 0 a 15:
        bits ← memoria[dirección + 2 × fila] << 8 | memoria[dirección + 2 × fila + 1]
        dibujar los 16 bits como DXYN dibuja 8 (XOR; clipping decide en los bordes)
        si se apagó un píxel encendido de ese plano:  colisión ← 1
    dirección ← dirección + 32
V[F] ← colisión
```

Con N = 0, SUPER-CHIP y XO-CHIP dibujan un sprite de 16 × 16 píxeles: 32 bytes desde I,
dos por fila. El primer byte de cada fila es la mitad izquierda, con su bit más alto en
la columna 0. En todo lo demás es [`DXYN`](#dxyn--drw-vx-vy-n): XOR, coordenadas
iniciales que dan la vuelta, el quirk `clipping` en los bordes, VF = 1 si algo se apagó
y, con `displayWait`, fin del frame. Con XO-CHIP y los dos planos elegidos usa 64 bytes:
32 para cada plano. Escribir el sprite con un `DW` por fila es lo más cómodo: cada
palabra es una fila. Con CHIP-8 no dibuja nada, pone VF en 0 y la consola avisa que es
de SUPER-CHIP.

> **Diferencia con SUPER-CHIP 1.1.** En baja resolución dibujaba 8 × 16, no 16 × 16, y
> en alta resolución VF no era 0 o 1 sino la cantidad de filas que chocaron más las que
> quedaron recortadas abajo (Gulrak). Este emulador hace lo de Octo: 16 × 16 en las dos
> resoluciones y VF de 0 o 1, también para `DXYN` en alta resolución.

```asm
; Plataforma: SUPER-CHIP
        HIGH
        LD   I, cara
        LD   V0, 56
        LD   V1, 24
        DRW  V0, V1, 0      ; 16 × 16: 32 bytes desde I, una palabra por fila
fin:    JP   fin
cara:   DW   %0000011111100000
        DW   %0001100000011000
        DW   %0010000000000100
        DW   %0100000000000010
        DW   %0100011001100010
        DW   %1000011001100001
        DW   %1000000000000001
        DW   %1000000000000001
        DW   %1001000000001001
        DW   %1000100000010001
        DW   %0100011111100010
        DW   %0100000000000010
        DW   %0010000000000100
        DW   %0001100000011000
        DW   %0000011111100000
        DW   %0000000000000000
```

---

#### `F000 NNNN` — LD I, LONG NNNN

**Cargar en I una dirección de 16 bits.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
I ← memoria[PC] << 8 | memoria[PC + 1]      ; NNNN, la palabra que sigue al F000
PC ← PC + 2                                 ; el PC queda después de NNNN
```

La única instrucción de 4 bytes: la palabra `F000` y después la dirección. Llega a toda
la memoria de 64 KB, mientras que `ANNN` no pasa de `0xFFF`
([13.9](#139-la-memoria-de-64-kb-y-la-carga-larga)). En el ensamblador se escribe
`LD I, LONG` y una expresión de 0 a `0xFFFF`. Los saltos condicionales la saltean
entera, y en el monitor la fila del `F000` la muestra completa (`LD I, LONG 0x8000`);
cuando ya se ejecutó, la fila siguiente, la de la dirección, dice «(operando)». Con
CHIP-8 o SUPER-CHIP detiene la máquina con un error de plataforma; `FX00` con X distinto
de 0 no existe en ninguna.

```asm
; Plataforma: XO-CHIP
; Usar la memoria alta como lugar de trabajo: 0x8000 está lejos del programa
BUFFER  EQU  0x8000
        LD   I, LONG BUFFER
        LD   V0, 0x55
        LD   [I], V0        ; memoria[0x8000] = 0x55
        LD   I, LONG BUFFER
        LD   V0, [I]        ; y se puede volver a leer
fin:    JP   fin
```

---

#### `FN01` — PLANE N

**Elegir en qué planos se dibuja.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
planos ← N            ; máscara de 2 bits: bit 0 = plano 1, bit 1 = plano 2
```

Elige los planos sobre los que actúan `DRW`, `CLS` y los desplazamientos: 1 (el de
siempre, el que está elegido al arrancar), 2, 3 (los dos) o 0 (ninguno). No cambia la
pantalla ([13.6](#136-planos-y-colores)). Con N de 4 a 15 es un opcode inválido, y el
ensamblador solo acepta de 0 a 3.

> **Diferencia con Octo.** Octo acepta cualquier N y usa sus dos bits bajos. La
> especificación dice que N va de 0 a 3 (y que un programa que use más planos no es
> válido), así que acá un N mayor detiene la máquina.

```asm
; Plataforma: XO-CHIP
; Borrar solo el plano 2 y dejar el 1 como está
        PLANE 2
        CLS
        PLANE 1             ; volver al plano de siempre
fin:    JP   fin
```

---

#### `F002` — AUDIO

**Copiar 16 bytes desde I al patrón de audio.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
para k de 0 a 15:  patrón[k] ← memoria[I + k]
; I no cambia
```

Carga los 128 bits que suenan mientras ST es mayor que 0
([13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)). Desde el primer `F002`, la consola
reproduce el patrón en lugar del beep. Es una copia: después se puede reusar esa
memoria. Con X distinto de 0 (`FX02`) es un opcode inválido.

> **Diferencia con Octo.** Octo acepta `FX02` con cualquier X como `audio`; acá solo
> existe `F002`.

```asm
; Plataforma: XO-CHIP
; Un la de medio segundo: el patrón y el tono del ejemplo de la especificación
        LD   I, onda
        AUDIO               ; el patrón: 64 bits en 0 y 64 en 1, un ciclo
        LD   V0, 247
        PITCH V0            ; 56.200 bits por segundo / 128 = 439 Hz
        LD   V0, 30
        LD   ST, V0         ; suena mientras ST > 0: medio segundo
fin:    JP   fin
onda:   DB   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        DB   0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
```

---

#### `FX30` — LD HF, VX

**I = dirección del glifo grande del dígito VX.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
I ← 0x0A0 + (V[X] & 0xF) × 10              ; en este emulador
```

Como [`FX29`](#fx29--ld-f-vx), pero con la fuente de 8 × 10: apunta I al glifo del
dígito hexadecimal bajo de VX, listo para `DRW VX, VY, 10`
([13.7](#137-la-fuente-grande)). Con CHIP-8 detiene la máquina con un error de
plataforma.

```asm
; Plataforma: SUPER-CHIP
; Mostrar V3 (0 a 255) en decimal con la fuente grande
        HIGH
        LD   V3, 255
        LD   I, bcd
        LD   B, V3
        LD   V2, [I]        ; V0, V1, V2 = centenas, decenas, unidades
        LD   V4, 49         ; x
        LD   V5, 27         ; y
        LD   HF, V0
        DRW  V4, V5, 10
        ADD  V4, 10
        LD   HF, V1
        DRW  V4, V5, 10
        ADD  V4, 10
        LD   HF, V2
        DRW  V4, V5, 10
fin:    JP   fin
bcd:    DB   0, 0, 0
```

---

#### `FX3A` — PITCH VX

**Tono del patrón de audio = VX.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** XO-CHIP

```
pitch ← V[X]
; el patrón suena a 4000 × 2^((pitch − 64) / 48) bits por segundo
```

Al arrancar, `pitch` vale 64: 4000 bits por segundo. Cada 48 la velocidad se duplica
(una octava) y cada 4 sube un semitono; la tabla de
[13.10](#1310-el-audio-de-xo-chip-patrón-y-tono) tiene algunos valores. El tono vale
para el patrón que esté cargado y para los que se carguen después.

```asm
; Fragmento: patron son los 16 bytes del patrón de tu programa.
; Plataforma: XO-CHIP
        LD   I, patron
        AUDIO
        LD   V0, 112        ; una octava más arriba que al arrancar (64 + 48)
        PITCH V0
        LD   V0, 10
        LD   ST, V0
```

---

#### `FX75` — LD R, VX

**Guardar V0..VX en las banderas RPL.**

**VF:** sin cambios · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
para i de 0 a X:  banderas[i] ← V[i]
; I y la memoria no cambian
```

Guarda un bloque de registros que empieza en V0, como `FX55`, pero en las 16 banderas
que viven fuera de la memoria y sobreviven a los reinicios
([13.8](#138-las-banderas-rpl)). Con CHIP-8 detiene la máquina con un error de
plataforma.

> **Diferencia con SUPER-CHIP 1.1.** En la HP-48, X va solo de 0 a 7: hay 8 banderas
> (Gulrak). Acá, como en Octo y en XO-CHIP 1.1, son 16 con las dos plataformas.

```asm
; Plataforma: SUPER-CHIP
; Guardar el récord (V5) en la bandera 0
        LD   V0, V5
        LD   R, V0          ; bandera 0 = V0 (las demás no cambian)
```

---

#### `FX85` — LD VX, R

**Cargar V0..VX desde las banderas RPL.**

**VF:** sin cambios (salvo que X sea F) · **Quirk:** ninguno · **Plataforma:** SUPER-CHIP y XO-CHIP

```
para i de 0 a X:  V[i] ← banderas[i]
```

La operación inversa de `FX75`: carga V0..VX con lo que guardó la última partida (o con
ceros, si la ROM nunca guardó nada). El ejemplo de [13.8](#138-las-banderas-rpl) usa las
dos para contar cuántas veces arrancó un programa. Con CHIP-8 detiene la máquina con un
error de plataforma.

```asm
; Plataforma: SUPER-CHIP
; Al arrancar: leer el récord guardado en la bandera 0
        LD   V0, R          ; V0 = bandera 0
        LD   V5, V0
```

---

### 13.12 Otras variantes

Ninguna de estas está implementada en este emulador:

- **CHIP-8X** (RCA, 1980): color, placa de sonido y un segundo teclado.
- **CHIP-8E**, **CHIP-10** y otras variantes de la época para el VIP y máquinas afines;
  CHIP-10 usa una pantalla de mayor resolución. De CHIP-8E salen `5XY2` y `5XY3`, que
  XO-CHIP adoptó.
- **MEGA-CHIP** (Revival Studios, 2007): una extensión moderna con resolución de hasta
  256×192.

---

## 14. Glosario

**1802 (RCA CDP1802).** El microprocesador de 8 bits del COSMAC VIP, diseñado a partir
de la arquitectura COSMAC de Weisbecker.

**1861 (RCA CDP1861, "Pixie").** El chip de video del VIP. Lee la memoria de pantalla
por DMA y genera la señal de video para el monitor o el televisor.

**Alta resolución.** El modo de 128 × 64 píxeles de SUPER-CHIP y XO-CHIP. Se entra con
`00FF` (`HIGH`) y se vuelve a la baja resolución, la de 64 × 32, con `00FE` (`LOW`)
(sección [13.5](#135-alta-y-baja-resolución)). Ver también *Hires / lores*.

**Archivo de la comunidad.** El *Chip8 Community Archive* de John Earnest: un
repositorio con programas de CHIP-8, SUPER-CHIP y XO-CHIP, sus autores y las opciones con
que se juegan en Octo, con licencia CC0. Esta consola trae su tabla para configurar sola
los juegos que reconoce, y sus ROMs, que se cargan con un clic desde la ventana del archivo
([11.11](#1111-ajustes-por-cartucho)).

**Banderas RPL.** Los 16 bytes, fuera de la memoria, que guardan `FX75` y leen `FX85`
en SUPER-CHIP y XO-CHIP. Sobreviven a los reinicios, y los juegos los usan para guardar
récords o partidas. En la HP-48 eran 8 (sección [13.8](#138-las-banderas-rpl)).

**BCD (decimal codificado en binario).** Representar un número con un dígito decimal
por byte. `FX33` convierte un registro a BCD.

**Big-endian.** Orden en que el byte más significativo va primero (en la dirección más
baja). Las instrucciones CHIP-8 se guardan así.

**Buzzer.** El generador de sonido: un solo tono, que suena mientras ST es mayor que 0.
En XO-CHIP, lo que suena es el *patrón de audio*.

**Clipping.** Recortar lo que queda fuera de la pantalla. Lo contrario de *wrapping*.

**Colisión.** En `DXYN`, que un píxel encendido del sprite coincida con uno encendido de
la pantalla y lo apague. VF queda en 1.

**COSMAC VIP.** La computadora en kit de RCA (hacia 1977) para la que se creó CHIP-8.

**DMA (acceso directo a memoria).** Mecanismo por el cual un dispositivo (el chip de
video) lee la memoria sin pasar por el programa.

**DT (delay timer).** Timer de retardo: baja a 60 Hz; se lee con `FX07` y se escribe con
`FX15`.

**Fetch-decode-execute.** El ciclo básico de una CPU: leer la instrucción, entender qué
es y ejecutarla.

**Frame.** Un sesenteavo de segundo. En este emulador, la unidad de ejecución: IPF
instrucciones y un tic de los timers.

**Glifo.** El dibujo de un carácter. La fuente de CHIP-8 tiene 16 glifos de 4×5, y la
fuente grande de SUPER-CHIP y XO-CHIP, 16 de 8×10.

**Hires / lores.** Alta y baja resolución: 128×64 y 64×32 en SUPER-CHIP y XO-CHIP.
CHIP-8 solo tiene lores.

**Híbrido (programa).** Un programa CHIP-8 que usa código máquina del 1802 (`0NNN`) o
partes internas del intérprete del VIP.

**Huella SHA-1.** Un resumen de 160 bits (40 dígitos hexadecimales) que se calcula con
los bytes de un archivo y cambia si cambia uno solo: dos ROMs con la misma huella son,
en la práctica, la misma ROM. La consola reconoce así los cartuchos
([11.11](#1111-ajustes-por-cartucho)).

**I.** El registro índice: guarda una dirección de memoria.

**IPF (instrucciones por frame).** Cuántas instrucciones ejecuta este emulador en cada
frame de 1/60 s.

**Máquina virtual.** Una computadora definida por software: su "hardware" es un
programa que la interpreta.

**Monitor.** En este manual, el panel de depuración de la consola, con cuatro pestañas:
Código (estado: PC, I, SP, DT, ST, IPF, la plataforma y su resolución; registros V0–VF;
el desensamblado de toda la memoria, que sigue al PC; la pila y los puntos de corte),
Traza, Memoria (un mapa de lo que el programa hizo con cada byte y el volcado de la
memoria en I) y Sprites. En el VIP, *el programa monitor* era el sistema operativo en ROM,
con el que se leía y escribía la memoria desde el teclado hex y se grababan y leían
cassettes.

**Nibble.** Medio byte: 4 bits, un dígito hexadecimal.

**Octo.** El entorno de John Earnest para programar CHIP-8 en el navegador, con un
lenguaje ensamblador propio y un emulador. Ahí nació XO-CHIP, y sus valores por defecto
son los que esperan los programas hechos con él (secciones
[1.6](#16-octo-xo-chip-y-la-comunidad-actual) y [11.8](#118-tabla-comparativa)).

**Opcode.** El código numérico de una instrucción; en CHIP-8, una palabra de 16 bits
(en XO-CHIP, `F000 NNNN` ocupa dos).

**Patrón de audio.** En XO-CHIP, los 16 bytes (128 bits) que suenan en bucle mientras
ST es mayor que 0; se cargan con `F002` (sección
[13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)).

**PC (program counter).** El contador de programa: la dirección de la próxima
instrucción.

**Perfil.** En este emulador, una combinación de los seis quirks junto con la plataforma
que va con ella: COSMAC VIP, SUPER-CHIP o XO-CHIP
([11.9](#119-cómo-elegir-la-configuración-en-este-emulador)).

**Persistencia (de fósforo).** El brillo que le queda a un punto de un tubo de rayos
catódicos después de apagarse. En el modo Tubo CRT de este emulador, un efecto visual
opcional que disimula el parpadeo (sección [6.5](#65-el-parpadeo)).

**Pila.** La estructura donde `CALL` guarda las direcciones de retorno y de donde `RET`
las saca.

**Plano.** En XO-CHIP, cada una de las dos capas de un bit por píxel que forman la
pantalla. Con dos planos, cada píxel puede estar en cuatro estados, que se ven con
cuatro colores; `FN01` elige en cuáles se dibuja (sección [13.6](#136-planos-y-colores)).

**Plataforma.** En este emulador, la máquina que se emula: CHIP-8, SUPER-CHIP o XO-CHIP.
Decide el juego de instrucciones, la memoria y la pantalla; los quirks se eligen aparte
([13.3](#133-las-plataformas-de-este-emulador)).

**Punto de corte (*breakpoint*).** Una marca en una dirección del programa: cuando el PC
llega ahí, la máquina queda en pausa antes de ejecutar esa instrucción. En la consola se
ponen desde el desensamblado del monitor, son de cada cartucho y duran hasta que se
cierra la página ([2.3](#23-el-modelo-de-frame-de-este-emulador)).

**Quirk.** Una diferencia de comportamiento entre implementaciones de las que dependen
los programas (sección [11](#11-quirks)).

**ROM.** En emulación, el archivo con el programa (por costumbre, aunque se cargue en
RAM). En el VIP, además, la memoria de solo lectura con el sistema operativo y la
fuente.

**Skip.** Instrucción que saltea la siguiente si se cumple una condición.

**SP (stack pointer).** Indica cuántas direcciones hay en la pila.

**Sprite.** Un dibujo de 8 píxeles de ancho y 1 a 15 de alto que `DXYN` pone en
pantalla con XOR. SUPER-CHIP y XO-CHIP agregan los de 16 × 16 (`DXY0`).

**ST (sound timer).** Timer de sonido: baja a 60 Hz y el buzzer suena mientras es
mayor que 0; se escribe con `FX18`.

**SUPER-CHIP (SCHIP).** La extensión de CHIP-8 que Erik Bryntse escribió en 1991 para
las calculadoras HP-48: alta resolución, desplazamientos de pantalla, sprites de
16 × 16, fuente grande y banderas. Este emulador la ejecuta como una de sus plataformas
(sección [13.1](#131-super-chip-schip)).

**Tono (pitch).** En XO-CHIP, el registro que fija a qué velocidad se reproduce el
patrón de audio: 4000 × 2^((pitch − 64) / 48) bits por segundo. Se carga con `FX3A`
(sección [13.10](#1310-el-audio-de-xo-chip-patrón-y-tono)).

**Traza.** La lista de las últimas instrucciones que ejecutó la máquina, en orden. La de
esta consola guarda las últimas 1024, con su dirección y su opcode, y se ve en la pestaña
Traza del monitor con la máquina en pausa o detenida
([3.6](#36-direcciones-que-dan-la-vuelta)).

**Vblank (borrado vertical).** El momento entre dos cuadros de video en que no se está
dibujando la imagen; el VIP esperaba la interrupción de video antes de dibujar.

**VF.** El registro 15, que también hace de flag (acarreo, préstamo, bit desplazado,
colisión).

**Wrapping.** Dar la vuelta: lo que sale por un borde aparece por el opuesto.

**XO-CHIP.** La extensión de CHIP-8 que John Earnest definió para Octo: 64 KB de
memoria, dos planos de dibujo (cuatro colores) y sonido por patrón, sobre todo lo de
SUPER-CHIP. Este emulador la ejecuta como una de sus plataformas (sección
[13.2](#132-xo-chip)).

**XOR (o exclusivo).** Operación que da 1 si los dos bits son distintos. `DXYN` la usa
para combinar el sprite con la pantalla.

---

## 15. Referencias

### Fuentes primarias

- RCA Corporation, *RCA COSMAC VIP CDP18S711 Instruction Manual* (VIP-311), 1978.
  Incluye la descripción de CHIP-8, el listado del intérprete, el de la ROM y los 20
  juegos. [Internet Archive](https://archive.org/details/rca-cosmac-vip-cdp-18-s-711-instruction-manual-vdp-311)
  · [copia en GitHub (trapexit/chipce8)](https://github.com/trapexit/chipce8/blob/master/docs/CHIP-8/Misc/RCA%20COSMAC%20VIP%20CDP18S711%20Instruction%20Manual.pdf)
- Joseph Weisbecker, "An Easy Programming System", *BYTE*, vol. 3, n.º 12, diciembre de
  1978, pp. 108–122. [Internet Archive](https://archive.org/details/byte-magazine-1978-12)

### Análisis del intérprete original

- Laurence Scotford, *Chip-8 on the COSMAC VIP* (serie de artículos, 2020).
  [Índice](https://laurencescotford.net/2020/07/25/chip-8-on-the-cosmac-vip-index/) ·
  [Memoria](https://laurencescotford.net/2020/07/14/chip-8-ram-or-memory-management-with-chip-8/) ·
  [Interrupciones](https://laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-interrupts/) ·
  [Aritmética y lógica](https://laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-arithmetic-and-logic-instructions/) ·
  [Sprites](https://www.laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-drawing-sprites/) ·
  [Teclado](https://www.laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-keyboard-input/) ·
  [Carga y guardado de variables](https://www.laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-loading-and-saving-variables/) ·
  [Números aleatorios](https://www.laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-generating-random-numbers/) ·
  [Juego de caracteres](https://www.laurencescotford.net/2020/07/19/chip-8-on-the-cosmac-vip-the-character-set/)

### Referencias técnicas y guías

- Thomas P. Greene (Cowgod), *Cowgod's Chip-8 Technical Reference v1.0*, 1997.
  [devernay.free.fr](http://devernay.free.fr/hacks/chip8/C8TECH10.HTM)
- Tobias V. Langhoff, *Guide to making a CHIP-8 emulator*.
  [tobiasvl.github.io](https://tobiasvl.github.io/blog/write-a-chip-8-emulator/)
- Matthew Mikolay, *Mastering CHIP-8* y *CHIP-8 Technical Reference*.
  [Mastering CHIP-8](https://github.com/mattmikolay/chip-8/wiki/Mastering-CHIP%E2%80%908) ·
  [Technical Reference](https://github.com/mattmikolay/chip-8/wiki/CHIP%E2%80%908-Technical-Reference)

### Quirks, variantes y pruebas

- Timendus, *chip8-test-suite*: incluye el test de quirks (para CHIP-8, SUPER-CHIP
  moderno y *legacy*, y XO-CHIP), el de teclado y uno de desplazamientos para SUPER-CHIP
  y XO-CHIP, y una nota sobre las diferencias entre SUPER-CHIP en la HP-48 y los
  intérpretes modernos.
  [GitHub](https://github.com/Timendus/chip8-test-suite) ·
  [Legacy SUPER-CHIP](https://github.com/Timendus/chip8-test-suite/blob/main/legacy-superchip.md)
- Steffen Schümann (Gulrak), *CHIP-8 Variant Opcode Table*: qué instrucciones tiene cada
  variante (también qué agregó cada versión de SUPER-CHIP) y sus quirks.
  [chip8.gulrak.net](https://chip8.gulrak.net/) ·
  [los datos de la tabla, en JSON](https://chip8.gulrak.net/data/opcode-table.json)
- Steffen Schümann (Gulrak), *Cadmium*, emulador de muchas variantes; su código tiene las
  fuentes grandes de SUPER-CHIP 1.0 y 1.1 (`src/emulation/chip8emulatorbase.cpp`).
  [GitHub](https://github.com/gulrak/cadmium)
- *CHIP-8 Database* (plataformas, quirks y velocidades de cientos de ROMs).
  [GitHub](https://github.com/chip-8/chip-8-database)
- John Earnest, *XO-CHIP Specification* (versión 1.1) y el entorno Octo.
  [Especificación](https://johnearnest.github.io/Octo/docs/XO-ChipSpecification.html) ·
  [su texto fuente](https://github.com/JohnEarnest/Octo/blob/gh-pages/docs/XO-ChipSpecification.md) ·
  [Octo](https://github.com/JohnEarnest/Octo)
- John Earnest, el código del emulador de Octo: los valores por defecto de los quirks,
  las fuentes y cómo ejecuta cada instrucción de SUPER-CHIP y XO-CHIP (`js/emulator.js`),
  y cómo reproduce el patrón de audio (`js/shared.js`).
  [emulator.js](https://github.com/JohnEarnest/Octo/blob/gh-pages/js/emulator.js) ·
  [shared.js](https://github.com/JohnEarnest/Octo/blob/gh-pages/js/shared.js)
- John Earnest y colaboradores, *Chip8 Community Archive*: programas de CHIP-8,
  SUPER-CHIP y XO-CHIP con sus autores y las opciones con que se juegan en Octo, todo con
  licencia CC0. Es la fuente de la tabla de autoconfiguración de la consola
  (`tools/archive.js` y `data/archive.json`).
  [GitHub](https://github.com/JohnEarnest/chip8Archive) ·
  [galería](https://beyondloom.com/octo/archive.html)
- ArkoSammy12, *jchip* (emulador multivariante; estimación de velocidad del VIP).
  [GitHub](https://github.com/ArkoSammy12/jchip)
- John Earnest ("Internet Janitor"), respuesta sobre la velocidad del VIP en el foro de
  la Octojam 7. [itch.io](https://itch.io/post/1925542)
- John Earnest, *End of Octojam* (el anuncio de que la décima Octojam, la de 2023, fue
  la última). [beyondloom.com](https://beyondloom.com/blog/octojam.html) ·
  [Octojam 10 en itch.io](https://itch.io/jam/octojam-10)

### Contexto histórico

- Wikipedia: [CHIP-8](https://en.wikipedia.org/wiki/CHIP-8) ·
  [COSMAC VIP](https://en.wikipedia.org/wiki/COSMAC_VIP) ·
  [RCA 1802](https://en.wikipedia.org/wiki/RCA_1802) ·
  [Joseph Weisbecker](https://en.wikipedia.org/wiki/Joseph_Weisbecker) ·
  [Telmac 1800](https://en.wikipedia.org/wiki/Telmac_1800)

### Qué no pudimos verificar del todo

Para no presentar como hecho lo que no lo es, estos puntos quedan con reservas:

- **El año de lanzamiento del VIP.** Wikipedia da 1977 en el artículo del VIP y 1976 en
  el de Weisbecker. El manual está fechado en 1978 y el artículo de Weisbecker remite a
  una descripción del VIP publicada en BYTE en agosto de 1977.
- **La velocidad efectiva del VIP en instrucciones por frame.** Solo hay estimaciones
  (11 a 15); depende de la mezcla de instrucciones.
- **El valor exacto de VF después de AND/OR/XOR en el VIP.** Scotford lo describe como
  indefinido (lo que haya quedado en DF); las suites modernas lo modelan como 0.
- **La espera del vblank en la HP-48.** Según la suite de Timendus, probada por Gulrak en
  una HP48SX y una HP48GX, SUPER-CHIP 1.0 y 1.1 esperan en baja resolución y no en
  alta; la `chip-8-database` modela CHIP-48 y SUPER-CHIP sin esa espera. No lo
  comprobamos nosotros.
- **Qué agregó exactamente SUPER-CHIP 1.1 respecto de la 1.0.** Seguimos la tabla de
  Gulrak (el desplazamiento de pantalla es de la 1.1; lo demás ya estaba en la 1.0); no
  la contrastamos con los anuncios originales de Bryntse.
- **Cómo se comportaba SUPER-CHIP en la HP-48.** El desplazamiento a medias en baja
  resolución, VF con la cuenta de filas en alta, `DXY0` de 8 × 16 en baja, la pantalla
  que no se borra al cambiar de modo y las banderas hasta V7 salen de la tabla de Gulrak
  y de la suite de Timendus; no los probamos en una calculadora ni en un emulador de la
  HP-48.
- **La fuente grande de SUPER-CHIP 1.1.** Comparamos la de este emulador con las tablas
  de Octo y de Cadmium, que coinciden entre sí, y no con un volcado del intérprete de la
  HP-48. Las dos tablas difieren de la de este emulador en un byte del 6
  ([13.7](#137-la-fuente-grande)).
- **El comportamiento de Octo.** Lo tomamos de su código (`js/emulator.js` y
  `js/shared.js`, leídos en noviembre de 2026) y de la especificación de XO-CHIP, no de
  correr Octo. En particular, la profundidad de su pila y lo que hace con `0NNN`, con
  `FN01` (N > 3) y con `FX02` (X ≠ 0) son lo que dice ese código.
- **La fuente original del VIP.** Los bytes de la sección [8.4](#84-la-fuente-original-del-vip)
  salen de una transcripción del listado de la ROM del manual; no los contrastamos con
  un volcado binario.
- **Los 16 bytes entre `0xE90` y `0xE9F`** en un VIP de 4 KB: el manual los deja fuera
  del área de programa sin explicar por qué.
- **El comportamiento del VIP ante opcodes no documentados** que no sean los cuatro
  `8XYN` conocidos: no lo analizamos.
