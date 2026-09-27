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
