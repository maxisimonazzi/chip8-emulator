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
