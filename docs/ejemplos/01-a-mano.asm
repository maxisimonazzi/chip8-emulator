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
