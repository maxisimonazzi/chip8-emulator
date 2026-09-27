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
