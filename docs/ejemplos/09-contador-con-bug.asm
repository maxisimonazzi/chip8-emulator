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
