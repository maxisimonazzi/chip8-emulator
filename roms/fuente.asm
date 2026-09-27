; @name Fuente
; @description Muestra los 16 dígitos hexadecimales de la fuente que el intérprete guarda en memoria.
; @controls Ninguno: es una imagen fija.
; @order 5
;
; ======================================================================
;  FUENTE — los 16 dígitos incorporados, del 0 a la F
; ======================================================================
;
; Todo intérprete de CHIP-8 guarda en memoria una fuente de 16 dígitos
; hexadecimales de 4x5 píxeles (5 bytes cada uno). En este emulador está en
; la dirección 0x050. No hace falta saber dónde: LD F, Vx (FX29) deja en I
; la dirección del dígito que está en Vx, listo para dibujarlo con DRW.
;
; La pantalla:
;   Un marco de x = 2..62, y = 5..26 y adentro dos filas de 8 dígitos:
;     0 1 2 3 4 5 6 7   en y = 9
;     8 9 A B C D E F   en y = 18
;   El dígito número i de cada fila está en x = 6 + 7 * i.
;
; Registros:
;   V0  dígito que se dibuja (0..F)
;   V1  x    V2  y    V3, V4  temporales del marco

inicio:
        CLS
        CALL marco

        LD V0, 0                ; primer dígito
        LD V1, 6                ; x
        LD V2, 9                ; y (primera fila)
digito:
        LD F, V0                ; I = dirección del dígito V0 en la fuente
        DRW V1, V2, 5
        ADD V0, 1
        ADD V1, 7               ; el siguiente, 7 píxeles más a la derecha
        SE V0, 8                ; después del 7 pasamos a la segunda fila
        JP no_baja
        LD V1, 6
        LD V2, 18
no_baja:
        SE V0, 16
        JP digito

fin:    JP fin                  ; listo: el programa se queda acá para siempre

; ----------------------------------------------------------------------
; Marco: dos líneas horizontales (y = 5 y y = 26) de x = 2 a 62, y dos
; verticales (x = 2 y x = 62) de y = 6 a 25.
; ----------------------------------------------------------------------
marco:
        LD V1, 2
        LD V2, 5
        LD V3, 26
        LD I, linea
marco_h:                        ; 7 tramos de 8 píxeles: x = 2..57
        DRW V1, V2, 1
        DRW V1, V3, 1
        ADD V1, 8
        SE V1, 58
        JP marco_h
        LD I, punta             ; y un tramo de 5 píxeles: x = 58..62
        DRW V1, V2, 1
        DRW V1, V3, 1

        LD I, columna           ; lados: 2 tramos de 10 filas
        LD V1, 2
        LD V2, 62
        LD V3, 6
        DRW V1, V3, 10
        DRW V2, V3, 10
        LD V3, 16
        DRW V1, V3, 10
        DRW V2, V3, 10
        RET

linea:   DB %11111111
punta:   DB %11111000
columna: DB %10000000, %10000000, %10000000, %10000000, %10000000
         DB %10000000, %10000000, %10000000, %10000000, %10000000
