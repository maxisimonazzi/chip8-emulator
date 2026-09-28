# Manual de referencia de CHIP-8

Este manual explica CHIP-8 de punta a punta: de dónde viene, cómo es la máquina por
dentro, qué hace cada una de sus 35 instrucciones y en qué detalles difieren las
distintas implementaciones que existieron desde 1977. Está pensado para programadores
que nunca vieron CHIP-8, pero también sirve como referencia rápida mientras escribís
un programa o depurás uno ajeno.

- Si querés aprender haciendo, empezá por el [tutorial](TUTORIAL.md).
- Si te interesa cómo está construido este emulador (arquitectura, tests, decisiones),
  leé [DESARROLLO.md](DESARROLLO.md).
- Para instalar, abrir y usar la consola, mirá el [README](../README.md) y la
  [parte 1 del tutorial](TUTORIAL.md#1-usar-el-emulador).

## Convenciones de este manual

- **Hexadecimal.** Los números con prefijo `0x` están en base 16. Las direcciones se
  escriben con 3 dígitos (`0x200`), los bytes con 2 (`0x2A`) y los opcodes con 4
  (`0xD01F`). En las tablas a veces se omite el prefijo.
- **"El VIP"** es el RCA COSMAC VIP con el intérprete CHIP-8 original de 1977-1978.
  **"Este emulador"** es `chip8.html`, el programa que acompaña a este manual.
- Cuando el hardware original y este emulador se comportan distinto, aparece un
  párrafo marcado **Diferencia con el VIP**. Todo lo que dice "este emulador" describe
  exactamente lo que hace el código y lo que verifican los tests del proyecto.
- **"El monitor"** es el panel de depuración de la consola, el que se titula MONITOR:
  registros, desensamblado alrededor del PC, pila y memoria. Cuando se habla del
  sistema operativo en ROM del VIP, que también se llamaba así, se dice **"el programa
  monitor del VIP"**.
- Los mnemónicos son los de la referencia de Cowgod (`LD`, `DRW`, `SKP`, ...). Son los
  mismos que acepta el ensamblador del proyecto (`tools/chip8asm.js`, con la sintaxis
  que explica la [sección 4.4 del tutorial](TUTORIAL.md#44-la-sintaxis-completa)) y los
  que muestra el desensamblador del monitor. Los ejemplos de este manual se ensamblan
  tal cual, salvo los que empiezan con `; Fragmento`: son pedazos de un programa más
  grande y usan etiquetas (subrutinas, destinos de salto, tablas) que están en otra
  parte; el comentario del principio dice cuáles son, y para ensamblarlos tenés que
  definirlas vos.
- En los opcodes, `X` e `Y` son números de registro (un dígito hex), `N` es un dígito
  hex, `NN` un byte y `NNN` una dirección de 12 bits. La sección
  [9](#9-formato-de-las-instrucciones) lo explica en detalle.

<!--
Convención de los bloques de código asm de este manual (la verifica tests/manual.test.js):
- Un bloque asm sin marca es un ejemplo que se ensambla tal cual con tools/chip8asm.js.
- Un fragmento empieza con una línea de comentario "; Fragmento: ..." que nombra las
  etiquetas que usa y no define. El test las agrega como etiquetas de relleno y exige que
  así se ensamble; también exige que el fragmento use al menos una etiqueta que no define.
- Un ejemplo que termina en el bucle "fin: JP fin" es un programa completo: el test lo
  ejecuta con cada perfil y exige que llegue a ese bucle sin que la máquina se detenga.
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
        si la máquina está detenida por un error, o esperando una tecla (FX0A): cortar
        ejecutar una instrucción (step)
        si el quirk displayWait está activo y la instrucción fue un DXYN: cortar
    bajar los timers una vez (tickTimers)      ; también mientras espera una tecla
    la interfaz redibuja la pantalla si cambió y hace sonar el beep si ST > 0
```

En el código del núcleo esto es `Chip8.runFrame(ipf)`; `step()` ejecuta exactamente
una instrucción y `tickTimers()` baja los timers. En la consola, el botón **Paso**
ejecuta una sola instrucción (sin tocar los timers) y el botón **Frame** ejecuta un
frame completo; los dos dejan la máquina en pausa, y el monitor muestra cómo quedó.

---

## 3. Memoria

CHIP-8 direcciona **4096 bytes** (4 KB), de `0x000` a `0xFFF`: las direcciones de las
instrucciones tienen 12 bits. Código y datos comparten la misma memoria (no hay
separación entre programa y datos), y todo se puede leer y escribir.

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
ocupan memoria CHIP-8. Los 4 KB quedan así:

```
 0xFFF +--------------------------------------+
       |                                      |
       |                                      |
       |      programa y datos (la ROM)       |   hasta 3584 bytes
       |                                      |   (MAX_ROM_SIZE = 4096 - 0x200)
       |                                      |
 0x200 +--------------------------------------+   PROGRAM_START: acá se copia la ROM
       |      libre (ceros)                   |   0x0A0 - 0x1FF    y arranca el PC
 0x0A0 +--------------------------------------+
       |      fuente hexadecimal (80 bytes)   |   0x050 - 0x09F    FONT_ADDR = 0x050
 0x050 +--------------------------------------+
       |      libre (ceros)                   |   0x000 - 0x04F
 0x000 +--------------------------------------+
```

- Al reiniciar (`reset()`), toda la memoria se pone en cero, se copia la fuente a
  `0x050`, se vuelve a copiar la última ROM cargada a `0x200` y el PC queda en `0x200`.
- Una ROM puede ocupar **hasta 3584 bytes** (`0x200`–`0xFFF`). Si el archivo es más
  grande (o está vacío), la consola rechaza la carga con un aviso, arriba de la página,
  y deja en la ranura el cartucho que había.
- La ROM llega con el botón **Cargar ROM**, arrastrando el archivo sobre la página o
  eligiendo un cartucho incluido: con los botones de la fila **Incluidos:**, debajo de
  la ranura, o desde el estante **Cartuchos incluidos**, debajo de la consola, que
  además los describe. Con un cartucho incluido en la ranura, debajo aparecen sus
  controles.
- La zona `0x000`–`0x1FF` no está protegida: un programa puede escribirla (por
  ejemplo, pisar la fuente).

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
modifica a sí mismo vas a ver el código cambiado.

### 3.6 Direcciones que dan la vuelta

En este emulador el PC se mantiene siempre en 12 bits (`& 0xFFF`) y **toda** lectura o
escritura de memoria usa la dirección módulo 4096 (`dirección & 0xFFF`). Si `I` vale
`0x1002`, `FX65` lee desde `0x002`; si el PC pasa de `0xFFE`, sigue en `0x000`.

Un caso típico de depuración: si tu programa "se cae" a memoria vacía, el emulador
ejecuta cada `0000` como `SYS 0x000`, que no hace nada (ver
[0NNN](#0nnn--sys-nnn)), y el PC avanza de a 2 hasta dar la vuelta. Al llegar a
`0x050` se encuentra con la fuente: `F0 90` se lee como `0xF090`, que no es una
instrucción válida, y la máquina se detiene con un error que indica el opcode y su
dirección.

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
y `FX29` lo apunta al glifo de un dígito de la fuente.

En el VIP, `I` era el registro RA del 1802, de 16 bits. En este emulador `I` se guarda
con 16 bits (`I & 0xFFFF`) y cada acceso a memoria usa `I & 0xFFF`, así que un `I`
"desbordado" por `FX1E` sigue funcionando, dando la vuelta dentro de los 4 KB.

### 4.4 PC, el contador de programa

El PC tiene la dirección de la próxima instrucción. El programa no puede leerlo ni
escribirlo directamente: solo lo modifican los saltos (`1NNN`, `BNNN`), las llamadas y
retornos (`2NNN`, `00EE`) y los *skips*. Arranca en `0x200`. En el VIP era el registro
R5 del 1802; en este emulador se mantiene siempre en el rango `0x000`–`0xFFF`.

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
el recuadro PILA.

> **Diferencia con el VIP.** El intérprete del VIP reservaba 48 bytes para la pila,
> que también usaba para sus propias cuentas; alcanzaban para **12 niveles** de
> llamadas anidadas. SUPER-CHIP y la mayoría de los intérpretes
> modernos ofrecen 16. Un programa que use más de 12 niveles no va a funcionar bien en
> un VIP real; si querés compatibilidad total, no anides más de 12 llamadas.

### 4.6 DT y ST, los timers

Dos registros de 8 bits que el hardware (en el VIP, la rutina de interrupción de video)
decrementa 60 veces por segundo hasta llegar a 0: **DT** (*delay timer*, timer de
retardo) y **ST** (*sound timer*, timer de sonido). Los explica la sección siguiente.

### 4.7 El estado completo de la máquina en este emulador

Para depurar (desde el monitor o desde la consola de JavaScript del navegador, con
`window.chip8.cpu`) te sirve saber qué representa cada campo del objeto `Chip8`:

| Campo | Tipo | Significado |
|---|---|---|
| `memory` | `Uint8Array(4096)` | La memoria CHIP-8 |
| `V` | `Uint8Array(16)` | V0–VF |
| `I` | número | Registro índice (16 bits) |
| `pc` | número | Contador de programa (12 bits) |
| `stack`, `sp` | `Uint16Array(16)`, número | Pila y cantidad de elementos |
| `delayTimer`, `soundTimer` | número 0–255 | DT y ST |
| `display` | `Uint8Array(2048)` | Pantalla, fila por fila: índice = `y * 64 + x`, valores 0 o 1 |
| `keys` | `Uint8Array(16)` | 1 = tecla apretada |
| `quirks` | objeto | Los seis quirks (sección [11](#11-quirks)) |
| `waitingForKey` | booleano | `true` mientras un `FX0A` espera una tecla |
| `halted`, `error` | booleano, texto | Máquina detenida y el mensaje de error |

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
volumen: hay un solo sonido, encendido o apagado.

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

En este emulador el beep es una **onda cuadrada de 440 Hz generada con Web Audio**, y
mientras suena se prende la luz SONIDO de la consola. En el grupo «Pantalla y sonido»
hay un interruptor **Silencio** y un control de **Volumen**. Los navegadores no permiten
reproducir sonido hasta que el usuario interactúa con la página, así que el beep se
habilita con el primer clic o la primera tecla.

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

Los colores son una decisión de presentación: el VIP mostraba puntos blancos sobre
fondo negro. Este emulador escala la imagen por un número entero, así que cada píxel
CHIP-8 es un cuadrado nítido del mismo tamaño que los demás, y en el grupo «Pantalla y
sonido» ofrece cuatro paletas (verde fósforo, ámbar, blanco y LCD) y dos **modos de
pantalla**:

| Modo | Cómo se ve |
|---|---|
| **Tubo CRT** (por defecto) | Imita una pantalla de tubo: resplandor alrededor de los píxeles, estela del fósforo (la *persistencia* de [6.5](#65-el-parpadeo)), líneas de barrido (*scanlines*), viñeta y reflejo del vidrio. La persistencia y las scanlines tienen su propio interruptor. Con la paleta LCD no hay resplandor y, en lugar de scanlines, se ve la grilla de celdas de una pantalla de cristal líquido |
| **Píxeles puros** | Píxeles cuadrados y nítidos, con exactamente dos colores (el fondo y el de los píxeles encendidos): sin estela, resplandor, scanlines, viñeta ni reflejo. Cada cuadro muestra exactamente lo que hay en la pantalla de la máquina |

En **Píxeles puros** los interruptores Scanlines y Persistencia quedan deshabilitados,
pero guardan lo que elegiste para cuando vuelvas al tubo. El modo es solo de
presentación: no cambia nada de lo que ve el programa.

### 6.2 Sprites

La única forma de dibujar es `DXYN` (`DRW VX, VY, N`): dibuja un **sprite** de
**8 píxeles de ancho** y **N filas de alto** (N de 1 a 15), leyendo N bytes de memoria
a partir de la dirección `I`. Cada byte es una fila, y el bit más significativo es el
píxel de la izquierda.

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
   mismo que dibujar en `x = 6`, y en `y = 32` es lo mismo que en `y = 0`.
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
| Retroceso (Backspace) | Reiniciar la ROM |
| H (o el botón **?**) | Abrir o cerrar la ayuda |
| Esc | Cerrar diálogos |

Los botones, interruptores y enlaces que tocás con el mouse o con el dedo no se quedan
con el foco, así que **Espacio** siempre pausa. Si llegás a un control con **Tab**, en
cambio, Espacio y Enter lo activan (no pausan). Las teclas del keypad, N, H y Retroceso
van a la consola aunque haya un control enfocado, incluso un selector; solo los campos
donde se escribe, como el número de IPF, se quedan con las teclas.

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
está en RAM, un programa podría modificarla.

> **Diferencia con el VIP.** En el VIP los dígitos estaban en la **ROM del sistema
> operativo**, en la página `0x81xx`. `FX29` usaba una tabla de 16 bytes en
> `0x8100`–`0x810F` con la dirección baja de cada glifo, y dejaba `I` apuntando a la
> ROM, fuera de los 4 KB que un programa CHIP-8 puede direccionar con `ANNN`. Un
> programa que suponga que la fuente está en una dirección fija no es portable.

### 8.2 Los 16 glifos

Esta es la fuente estándar que usan este emulador y la mayoría de los modernos (la
misma que publica la referencia de Cowgod). La columna izquierda de cada glifo es el
byte y la derecha el dibujo (`#` = píxel encendido):

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
glifo `B` (`0x087`).

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

Ejemplo: en `0xD01F` el tipo es `D` (dibujar), `X = 0`, `Y = 1` y `N = 0xF` = 15 filas:
`DRW V0, V1, 15`.

### 9.2 Decodificación por el primer nibble

| Primer nibble | Instrucciones | Cómo se distinguen |
|:---:|---|---|
| `0` | `00E0`, `00EE`, `0NNN` | Por el opcode completo |
| `1` | `1NNN` | — |
| `2` | `2NNN` | — |
| `3` | `3XNN` | — |
| `4` | `4XNN` | — |
| `5` | `5XY0` | El último nibble debe ser 0 |
| `6` | `6XNN` | — |
| `7` | `7XNN` | — |
| `8` | `8XY0`–`8XY7`, `8XYE` | Por el último nibble (N) |
| `9` | `9XY0` | El último nibble debe ser 0 |
| `A` | `ANNN` | — |
| `B` | `BNNN` | — |
| `C` | `CXNN` | — |
| `D` | `DXYN` | — |
| `E` | `EX9E`, `EXA1` | Por el último byte (NN) |
| `F` | `FX07`, `FX0A`, `FX15`, `FX18`, `FX1E`, `FX29`, `FX33`, `FX55`, `FX65` | Por el último byte (NN) |

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

Hay combinaciones que no corresponden a ninguna instrucción: `5XYN` y `9XYN` con N
distinto de 0; `8XY8` a `8XYD` y `8XYF`; cualquier `EX??` que no sea `9E` o `A1`; y
cualquier `FX??` fuera de los nueve de la tabla.

En **este emulador**, un opcode inválido detiene la máquina: `halted` pasa a `true`, el
PC queda apuntando **a la instrucción culpable** y `error` guarda un mensaje en
castellano con el opcode y su dirección en hexadecimal. La consola muestra ese mensaje
sobre la pantalla y en el monitor, y lo anuncia una sola vez en la línea de estado
(«Error: ...»). Lo mismo pasa con un `CALL` con la pila llena o un `RET` con la pila
vacía. El desensamblador muestra estos opcodes como `DW 0x5121` (una palabra de datos),
y el ensamblador acepta esa misma sintaxis.

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

### 10.3 Cómo leer cada ficha

Cada instrucción tiene: su opcode y mnemónico, una línea con su efecto sobre VF y el
quirk relacionado, un **pseudocódigo** preciso (`←` es asignación; `&`, `|`, `^`, `>>`
y `<<` son las operaciones de bits habituales), una explicación, las diferencias con el
VIP cuando las hay, y un ejemplo en la sintaxis del ensamblador del proyecto. En los
pseudocódigos, "saltear" significa `PC ← PC + 2`; como el PC ya avanzó al leer la
instrucción, eso hace que la siguiente no se ejecute.

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
- Varias instrucciones de SUPER-CHIP (`00FF`, `00FE`, `00FB`, `00FC`, `00FD`, `00CN`)
  caen en este grupo, así que acá se ignoran (ver [13](#13-variantes-y-extensiones)).

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

Apaga los 2048 píxeles. No toca registros, memoria ni timers. Es habitual al empezar un
programa o al pasar de una pantalla a otra.

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
lo que sigue".

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

Igual que `3XNN`, pero compara dos registros. El último nibble tiene que ser 0: en este
emulador `5XY1`–`5XYF` son opcodes inválidos.

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

Casi siempre se usa con una etiqueta: el ensamblador calcula la dirección.

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
- Con `N = 0` este emulador no dibuja nada y pone VF en 0. (En SUPER-CHIP, `DXY0`
  dibuja un sprite de 16×16; eso no está implementado acá.)
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
`DRW VX, VY, 5` (sección [8](#8-fuente-hexadecimal)).

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
    memoria[(I + i) & 0xFFF] ← V[i]
si quirks.memory:  I ← I + X + 1          ; COSMAC VIP (por defecto)
```

Guarda siempre un **bloque** de registros que empieza en V0: `LD [I], V3` guarda V0,
V1, V2 y V3. Si X = 0, guarda solo V0. En el VIP, el bucle de copia avanzaba el
registro I en cada byte, así que al terminar I quedaba apuntando al byte siguiente al
último guardado; es el comportamiento del quirk `memory`. CHIP-48 y SUPER-CHIP 1.0
dejaban I en I + X, y SUPER-CHIP 1.1 no lo modificaba.

**Consejo de portabilidad:** volvé a cargar I con `ANNN` antes de cada `FX55`/`FX65`
y no dependas de dónde queda después.

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
    V[i] ← memoria[(I + i) & 0xFFF]
si quirks.memory:  I ← I + X + 1          ; COSMAC VIP (por defecto)
```

La operación inversa de `FX55`. Muy usada para leer registros de una tabla (por
ejemplo, las coordenadas de un nivel) o los tres dígitos que deja `FX33`. Mismo quirk y
mismo consejo que `FX55`. Cualquier `FX??` que no sea uno de los nueve de la tabla es
un opcode inválido.

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
**COSMAC VIP**.

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
la versión más difundida, no modificaba I. XO-CHIP volvió al comportamiento del VIP y
agregó instrucciones nuevas (`5XY2`/`5XY3`) que nunca tocan I. Este emulador modela los
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
un sprite cada 1/60 s.

**En el VIP.** La rutina de dibujo espera la próxima interrupción de video antes de
escribir en la memoria de pantalla, para que el chip de video nunca muestre un sprite a
medio dibujar (Scotford). En la práctica eso limita la velocidad a unos 60 sprites por
segundo (Timendus) y, según Gulrak, a veces el VIP necesita incluso dos cuadros.

**Después.** Los intérpretes de la HP-48 y los modernos en general no esperan (Gulrak
señala que los de la HP-48 sí esperaban el cuadro siguiente en el modo de 64×32; las
fuentes no coinciden del todo). XO-CHIP no espera.

**Impacto.** En la velocidad, no en la lógica. Sin la espera, algunos programas del VIP
corren demasiado rápido, porque su ritmo dependía implícitamente de ella. Con la espera,
los programas modernos que dibujan muchos sprites por paso se vuelven lentísimos. Ver
[12.4](#124-la-espera-del-vblank).

### 11.8 Tabla comparativa

| Quirk | COSMAC VIP | CHIP-48 | SUPER-CHIP 1.1 | XO-CHIP |
|---|---|---|---|---|
| `vfReset` (AND/OR/XOR ponen VF = 0) | sí | no | no | no |
| `memory` (I después de FX55/FX65) | I + X + 1 | I + X | sin cambios | I + X + 1 |
| `shifting` (8XY6/8XYE sobre VX) | no: usan VY | sí | sí | no: usan VY |
| `jumping` (BXNN) | no: usa V0 | sí | sí | no: usa V0 |
| `clipping` | recorta | recorta | recorta | da la vuelta |
| `displayWait` | sí | no (ver 11.7) | no (ver 11.7) | no |

Y los perfiles que ofrece este emulador:

| Quirk | Perfil COSMAC VIP (por defecto) | Perfil SUPER-CHIP | Perfil XO-CHIP |
|---|:---:|:---:|:---:|
| `vfReset` | activado | — | — |
| `memory` | activado | — | activado |
| `shifting` | — | activado | — |
| `jumping` | — | activado | — |
| `clipping` | activado | activado | — |
| `displayWait` | activado | — | — |

El perfil SUPER-CHIP reproduce los quirks de SUPER-CHIP 1.1 tal como los modelan las
suites modernas, pero **no** agrega sus instrucciones nuevas (sección
[13](#13-variantes-y-extensiones)).

### 11.9 Cómo elegir la configuración en este emulador

En el grupo **Quirks** del panel de control hay un selector **Perfil** (**COSMAC VIP**,
**SUPER-CHIP**, **XO-CHIP** y **Personalizado**) y seis interruptores DIP, uno por
quirk; al pasar el mouse por uno, o al llegar a él con Tab, aparece qué hace. Elegir un
perfil mueve los seis interruptores; si después tocás alguno y la combinación ya no
coincide con ningún perfil, el selector pasa solo a "Personalizado" (y si coincide con
otro perfil, muestra ese). Los cambios se aplican en el momento, sin reiniciar, aunque
si el programa ya calculó algo con la configuración anterior conviene reiniciarlo.

**La consola recuerda la configuración.** Los quirks (y con ellos el perfil), las IPF,
el modo de pantalla, la paleta y el sonido se guardan en este navegador y vuelven la
próxima vez que abrís la página. Por eso "por defecto" quiere decir "la primera vez":
si ayer elegiste SUPER-CHIP, hoy la consola arranca en SUPER-CHIP. Si un programa se
comporta raro, antes que nada revisá que el perfil sea el que corresponde.

Una guía rápida:

- **Programas del VIP y CHIP-8 "clásico"** (los juegos del manual, los de los 70 y 80,
  y los cartuchos incluidos en la consola): perfil **COSMAC VIP**.
- **Programas de la HP-48** (los de los 90, muchas veces con extensión `.sc8`, o
  documentados como SCHIP): perfil **SUPER-CHIP**. Si usan el modo de alta resolución u
  otras instrucciones propias de SUPER-CHIP, no van a funcionar bien acá.
- **Programas escritos con Octo** que solo usan instrucciones de CHIP-8: perfil
  **XO-CHIP**, y probablemente más instrucciones por frame.
- Si no sabés para qué plataforma es un programa, buscalo en la
  [chip-8-database](https://github.com/chip-8/chip-8-database), que cataloga cientos de
  ROMs con su plataforma y su velocidad recomendada.

Si algo se ve mal, estos síntomas orientan:

| Síntoma | Probá cambiar |
|---|---|
| Un programa que conocés anda distinto que la última vez, o todos andan raro | El perfil y las IPF: la consola recuerda los que usaste la vez anterior |
| Gráficos desarmados, laberintos mal dibujados, cuentas absurdas | `shifting` y `memory` (perfil SUPER-CHIP) |
| Basura en la pantalla, puntaje que no sube, datos corruptos | `memory` |
| El programa salta a cualquier lado después de un `BNNN` y se detiene | `jumping` |
| Pedazos de sprites del lado opuesto de la pantalla, o sprites que se cortan en el borde | `clipping` |
| El juego va lentísimo aunque subas las instrucciones por frame | apagar `displayWait` |
| Un juego del VIP va demasiado rápido | encender `displayWait` o bajar las instrucciones por frame |
| Colisiones o condiciones que fallan justo después de un AND/OR/XOR | `vfReset` |

### 11.10 Otras diferencias con el VIP que no son configurables

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
defecto** (≈900 instrucciones por segundo, cerca del VIP). En el grupo **Velocidad** se
elige con el deslizador, con el campo numérico o con los botones de valores prefijados
(7, 15, 30, 100, 500, 1000, 5000 y 10000), y debajo se ve la velocidad aproximada en
instrucciones por segundo. Si escribís un valor fuera de rango, el campo se marca en rojo
y el aviso dice qué valor se usa mientras tanto (1 o 10.000, el más cercano). El monitor muestra las
IPF actuales, y la consola las recuerda para la próxima vez (ver
[11.9](#119-cómo-elegir-la-configuración-en-este-emulador)).

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

Los timers bajan siempre a 60 Hz, sin importar el IPF. Un juego que regula su ritmo con
DT (como en [5.2](#52-usar-dt-para-medir-el-tiempo)) no se acelera al subir el IPF;
uno que no lo hace, sí.

**¿Una ROM bajada de internet va muy lenta?** Casi nunca es por falta de potencia: el
núcleo ejecuta 600.000 instrucciones por segundo (10.000 IPF) usando una fracción chica
de la CPU (el escenario 2 de `tools/e2e.js` lo mide). Probá en este orden:

1. **Cambiá el perfil a SUPER-CHIP o XO-CHIP.** El perfil COSMAC VIP (el de fábrica)
   trae la espera de vblank (`displayWait`): como mucho un `DXYN` por frame, o sea 60
   sprites por segundo ([12.4](#124-la-espera-del-vblank)). Los juegos modernos dibujan
   decenas de sprites por frame y con esa espera se arrastran, aunque subas las IPF.
2. **Subí las IPF**: 500 o 1000 para la mayoría de los juegos de SUPER-CHIP y de la
   Octojam; algunos piden 5000 o más. Si el juego va demasiado rápido, bajalas: el
   valor correcto es el que lo hace jugable.
3. **Si se ve roto** (gráficos desarmados, saltos a cualquier lado), no es la
   velocidad: son los quirks; mirá la tabla de síntomas de
   [11.9](#119-cómo-elegir-la-configuración-en-este-emulador).

Si la ROM usa la pantalla de 128×64 de SUPER-CHIP o las extensiones de XO-CHIP, no va
a andar bien con ninguna velocidad: esas instrucciones no están implementadas
([13](#13-variantes-y-extensiones)).

### 12.3 El frame de 60 Hz en este emulador

Cada frame hace, en este orden:

1. Ejecuta instrucciones hasta completar IPF, o hasta que la máquina se detenga por un
   error, empiece a esperar una tecla (`FX0A`) o, con `displayWait`, ejecute un `DXYN`.
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

Dos efectos prácticos:

- Un programa que dibuja 10 sprites por cada paso de su bucle avanza, como mucho, 6
  pasos por segundo, sin importar el IPF.
- Subir el IPF solo acelera el código que hay *entre* dibujos.

Es una aproximación: el VIP no tenía "frames de instrucciones", y a veces un dibujo le
llevaba más de un cuadro. Este emulador no intenta imitar la duración de cada
instrucción, solo la regla "un dibujo por cuadro", que es lo que afecta a los programas.

---

## 13. Variantes y extensiones

> **Nada de esta sección está implementado en este emulador.** Se incluye para que
> sepas qué son y por qué una ROM de SUPER-CHIP o XO-CHIP puede no funcionar acá.

### 13.1 SUPER-CHIP (SCHIP)

Creado por Erik Bryntse en 1991 a partir de CHIP-48, para la HP-48. Agrega:

| Opcode | Mnemónico (Cowgod) | Qué hace |
|---|---|---|
| `00CN` | `SCD N` | Scroll de la pantalla N píxeles hacia abajo |
| `00FB` | `SCR` | Scroll 4 píxeles a la derecha |
| `00FC` | `SCL` | Scroll 4 píxeles a la izquierda |
| `00FD` | `EXIT` | Salir del intérprete |
| `00FE` | `LOW` | Modo de baja resolución (64×32) |
| `00FF` | `HIGH` | Modo de alta resolución (**128×64**) |
| `DXY0` | `DRW VX, VY, 0` | Sprite de **16×16** (32 bytes) |
| `FX30` | `LD HF, VX` | I = dígito de la fuente grande (10 filas de alto) |
| `FX75` | `LD R, VX` | Guarda V0..VX en los "flags" de usuario de la HP-48, fuera de la memoria |
| `FX85` | `LD VX, R` | Carga V0..VX desde esos flags |

Otros detalles: la pila tiene 16 niveles; hereda de CHIP-48 los quirks `shifting` y
`jumping`, y la versión 1.1 no modifica I en `FX55`/`FX65`; según Gulrak, en una HP-48
real `FX75`/`FX85` solo admiten hasta V7, y en alta resolución SUPER-CHIP 1.1 deja en
VF la cantidad de filas del sprite que chocaron más las que quedaron recortadas abajo,
en lugar de 0 o 1. Las fuentes no coinciden del todo sobre qué agregó exactamente la
1.1 respecto de la 1.0 (en particular el scroll y la fuente grande).

### 13.2 XO-CHIP

Definido por John Earnest para Octo (versión 1.0 hacia 2014; la 1.1 agregó `pitch`).
Parte de SUPER-CHIP y agrega:

| Opcode | En Octo | Qué hace |
|---|---|---|
| `5XY2` | `save vx - vy` | Guarda el rango VX..VY en memoria desde I, **sin** modificar I |
| `5XY3` | `load vx - vy` | Carga el rango VX..VY desde I, sin modificar I |
| `F000 NNNN` | `i := long NNNN` | Carga una dirección de **16 bits** en I (instrucción de 4 bytes) |
| `FN01` | `plane n` | Elige en qué plano de bits se dibuja (1, 2 o ambos) |
| `F002` | `audio` | Copia 16 bytes desde I al buffer de patrón de audio |
| `FX3A` | `pitch := vx` | Frecuencia de reproducción del patrón: 4000 × 2^((VX − 64) / 48) Hz |
| `00DN` | `scroll-up n` | Scroll de N píxeles hacia arriba |

Las ideas principales:

- **Más memoria.** El PC e I pasan a tener 16 bits: 64 KB direccionables. Las
  instrucciones de skip saltean los 4 bytes completos de `F000 NNNN`, y eso permite que
  un programa detecte si está corriendo en un intérprete XO-CHIP.
- **Color.** Un segundo plano de bits superpuesto al primero da hasta 4 colores (fondo,
  plano 1, plano 2 y la superposición). `CLS`, `DRW` y el scroll afectan solo a los
  planos elegidos.
- **Sonido programable.** Mientras suena el buzzer, se reproduce un patrón de 16 bytes
  interpretado como 128 muestras de 1 bit, a la frecuencia que fija `pitch`: así se
  pueden hacer tonos distintos, ruido y hasta música.
- **Quirks:** sigue al VIP en desplazamientos, `FX55`/`FX65` y `BNNN`; da la vuelta en
  los bordes en lugar de recortar; no pone VF en 0 en las operaciones lógicas y no
  espera el vblank. La especificación recomienda una pila de 16 niveles que dé error si
  se desborda o se vacía.

### 13.3 Otras variantes

- **CHIP-8X** (RCA, 1980): color, placa de sonido y un segundo teclado.
- **CHIP-8E**, **CHIP-10** y otras variantes de la época para el VIP y máquinas afines;
  CHIP-10 usa una pantalla de mayor resolución.
- **MEGA-CHIP** (Revival Studios, 2007): una extensión moderna con resolución de hasta
  256×192.

### 13.4 Qué pasa si cargás una ROM de SUPER-CHIP o XO-CHIP acá

| Instrucción | Qué hace este emulador |
|---|---|
| `00FF`, `00FE`, `00FB`, `00FC`, `00FD`, `00CN` | Nada: caen en `0NNN` y se ignoran. El programa sigue en 64×32, sin scroll, y `00FD` no termina nada |
| `DXY0` | No dibuja nada y pone VF en 0 |
| `FX30`, `FX75`, `FX85`, `FX3A`, `FN01`, `F002`, `F000` | Opcode inválido: la máquina se detiene con un error |
| `5XY2`, `5XY3` | Opcode inválido: la máquina se detiene con un error |

Algunos programas de SUPER-CHIP que solo usan la baja resolución funcionan con el
perfil SUPER-CHIP; los que usan alta resolución, sprites de 16×16 o la fuente grande,
no.

---

## 14. Glosario

**1802 (RCA CDP1802).** El microprocesador de 8 bits del COSMAC VIP, diseñado a partir
de la arquitectura COSMAC de Weisbecker.

**1861 (RCA CDP1861, "Pixie").** El chip de video del VIP. Lee la memoria de pantalla
por DMA y genera la señal de video para el monitor o el televisor.

**BCD (decimal codificado en binario).** Representar un número con un dígito decimal
por byte. `FX33` convierte un registro a BCD.

**Big-endian.** Orden en que el byte más significativo va primero (en la dirección más
baja). Las instrucciones CHIP-8 se guardan así.

**Buzzer.** El generador de sonido: un solo tono, que suena mientras ST es mayor que 0.

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

**Glifo.** El dibujo de un carácter. La fuente de CHIP-8 tiene 16 glifos de 4×5.

**Hires / lores.** Alta y baja resolución: 128×64 y 64×32 en SUPER-CHIP. CHIP-8 solo
tiene lores.

**Híbrido (programa).** Un programa CHIP-8 que usa código máquina del 1802 (`0NNN`) o
partes internas del intérprete del VIP.

**I.** El registro índice: guarda una dirección de memoria.

**IPF (instrucciones por frame).** Cuántas instrucciones ejecuta este emulador en cada
frame de 1/60 s.

**Máquina virtual.** Una computadora definida por software: su "hardware" es un
programa que la interpreta.

**Monitor.** En este manual, el panel de depuración de la consola: estado (PC, I, SP,
DT, ST, IPF), registros V0–VF, desensamblado alrededor del PC, pila y memoria en I. En
el VIP, *el programa monitor* era el sistema operativo en ROM, con el que se leía y
escribía la memoria desde el teclado hex y se grababan y leían cassettes.

**Nibble.** Medio byte: 4 bits, un dígito hexadecimal.

**Opcode.** El código numérico de una instrucción; en CHIP-8, una palabra de 16 bits.

**PC (program counter).** El contador de programa: la dirección de la próxima
instrucción.

**Persistencia (de fósforo).** El brillo que le queda a un punto de un tubo de rayos
catódicos después de apagarse. En el modo Tubo CRT de este emulador, un efecto visual
opcional que disimula el parpadeo (sección [6.5](#65-el-parpadeo)).

**Pila.** La estructura donde `CALL` guarda las direcciones de retorno y de donde `RET`
las saca.

**Quirk.** Una diferencia de comportamiento entre implementaciones de las que dependen
los programas (sección [11](#11-quirks)).

**ROM.** En emulación, el archivo con el programa (por costumbre, aunque se cargue en
RAM). En el VIP, además, la memoria de solo lectura con el sistema operativo y la
fuente.

**Skip.** Instrucción que saltea la siguiente si se cumple una condición.

**SP (stack pointer).** Indica cuántas direcciones hay en la pila.

**Sprite.** Un dibujo de 8 píxeles de ancho y 1 a 15 de alto que `DXYN` pone en
pantalla con XOR.

**ST (sound timer).** Timer de sonido: baja a 60 Hz y el buzzer suena mientras es
mayor que 0; se escribe con `FX18`.

**Vblank (borrado vertical).** El momento entre dos cuadros de video en que no se está
dibujando la imagen; el VIP esperaba la interrupción de video antes de dibujar.

**VF.** El registro 15, que también hace de flag (acarreo, préstamo, bit desplazado,
colisión).

**Wrapping.** Dar la vuelta: lo que sale por un borde aparece por el opuesto.

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

- Timendus, *chip8-test-suite* (incluye el test de quirks y el de teclado).
  [GitHub](https://github.com/Timendus/chip8-test-suite)
- Steffen Schümann (Gulrak), *CHIP-8 Variant Opcode Table*.
  [chip8.gulrak.net](https://chip8.gulrak.net/)
- *CHIP-8 Database* (plataformas, quirks y velocidades de cientos de ROMs).
  [GitHub](https://github.com/chip-8/chip-8-database)
- John Earnest, *XO-CHIP Specification* y el entorno Octo.
  [Especificación](https://johnearnest.github.io/Octo/docs/XO-ChipSpecification.html) ·
  [Octo](https://github.com/JohnEarnest/Octo)
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
- **La espera del vblank en la HP-48.** Gulrak indica que los intérpretes de la HP-48
  esperaban en el modo de 64×32; la `chip-8-database` modela CHIP-48 y SUPER-CHIP sin
  esa espera.
- **Qué agregó exactamente SUPER-CHIP 1.1 respecto de la 1.0.** Las fuentes difieren.
- **La fuente original del VIP.** Los bytes de la sección [8.4](#84-la-fuente-original-del-vip)
  salen de una transcripción del listado de la ROM del manual; no los contrastamos con
  un volcado binario.
- **Los 16 bytes entre `0xE90` y `0xE9F`** en un VIP de 4 KB: el manual los deja fuera
  del área de programa sin explicar por qué.
- **El comportamiento del VIP ante opcodes no documentados** que no sean los cuatro
  `8XYN` conocidos: no lo analizamos.
