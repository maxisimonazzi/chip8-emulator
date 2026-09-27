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
