; @name Rebote
; @description Una pelotita sonriente rebota por la pantalla y suena cada vez que toca un borde.
; @controls Ninguno: solo mirá.
; @order 1
;
; ======================================================================
;  REBOTE — el "hola mundo" animado de CHIP-8
; ======================================================================
;
; Qué muestra este programa:
;   - Cómo dibujar con DRW (DXYN) y cómo el dibujo por XOR permite BORRAR
;     un sprite volviendo a dibujarlo en el mismo lugar.
;   - Cómo animar a velocidad constante usando el temporizador de retardo
;     (DT), que baja 60 veces por segundo sin importar lo rápido que corra
;     la CPU.
;   - Cómo hacer sonar un pitido corto con el temporizador de sonido (ST).
;
; La pantalla:
;   filas 1..5   el título "CHIP-8" (sprites propios de 4x5)
;   fila 7       una línea horizontal
;   filas 9..31  el área donde rebota la pelota (sprite de 8x8)
;
; Cómo se mueve sin parpadear demasiado:
;   En cada paso dibujamos la pelota en la posición NUEVA y recién después
;   borramos la VIEJA (dibujándola otra vez, que por XOR la apaga). Como las
;   dos posiciones se superponen casi por completo, el cuadro intermedio
;   muestra la pelota casi entera en vez de una pantalla vacía.
;
;   En el COSMAC VIP (quirk "espera de vblank") cada DRW espera al próximo
;   cuadro, así que un paso usa como mínimo dos cuadros. Por eso cada paso
;   dura exactamente 2 cuadros (TICK): 30 pasos por segundo, 1 píxel por paso,
;   igual a 15 que a 1000 instrucciones por cuadro.
;
; Registros:
;   V1, V2  posición que se ve ahora (x, y)
;   V5, V6  posición siguiente (la que se dibuja en este paso)
;   V7, V8  posición de después (se calcula por adelantado)
;   V3, V4  dirección en x y en y: 1 (avanza) o 0xFF (= -1, retrocede)
;   VA      constante 0xFE: hacer XOR con ella convierte 1 en 0xFF y al revés
;   VB      duración del pitido (en sesentavos de segundo)
;   V0      temporal
;   VF      lo pisan DRW y ADD Vx, Vy: acá no lo usamos para nada

TICK    EQU 2           ; cuadros por paso de animación
XMIN    EQU 0           ; límites de la esquina superior izquierda de la pelota
XMAX    EQU 56          ; 64 - 8
YMIN    EQU 9           ; justo debajo de la línea
YMAX    EQU 24          ; 32 - 8
BEEP    EQU 3           ; pitido de 3/60 s

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

; ----------------------------------------------------------------------
; Bucle principal: un paso de animación cada TICK cuadros.
; ----------------------------------------------------------------------
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

; ----------------------------------------------------------------------
; Título "CHIP-8" en la fila 1 y línea en la fila 7.
; ----------------------------------------------------------------------
titulo:
        LD V1, 1                ; y del título
        LD V0, 17               ; x de la primera letra
        LD I, letra_c
        DRW V0, V1, 5
        LD V0, 22
        LD I, letra_h
        DRW V0, V1, 5
        LD V0, 27
        LD I, letra_i
        DRW V0, V1, 5
        LD V0, 32
        LD I, letra_p
        DRW V0, V1, 5
        LD V0, 37
        LD I, guion
        DRW V0, V1, 5
        LD V0, 42
        LD I, ocho
        DRW V0, V1, 5

        LD I, linea             ; 8 tramos de 8 píxeles = 64 columnas
        LD V0, 0
        LD V1, 7
titulo_linea:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP titulo_linea
        RET

; ----------------------------------------------------------------------
; Sprites. Cada byte es una fila; el bit más alto es el píxel de la izquierda.
; ----------------------------------------------------------------------
pelota:                         ; una pelotita con cara
        DB %00111100            ;   ..####..
        DB %01111110            ;   .######.
        DB %11011011            ;   ##.##.##   ojos
        DB %11111111            ;   ########
        DB %10111101            ;   #.####.#   comisuras
        DB %11000011            ;   ##....##   sonrisa
        DB %01111110            ;   .######.
        DB %00111100            ;   ..####..

letra_c: DB %11110000, %10000000, %10000000, %10000000, %11110000
letra_h: DB %10010000, %10010000, %11110000, %10010000, %10010000
letra_i: DB %11100000, %01000000, %01000000, %01000000, %11100000
letra_p: DB %11110000, %10010000, %11110000, %10000000, %10000000
guion:   DB %00000000, %00000000, %11100000, %00000000, %00000000
ocho:    DB %11110000, %10010000, %11110000, %10010000, %11110000
linea:   DB %11111111
