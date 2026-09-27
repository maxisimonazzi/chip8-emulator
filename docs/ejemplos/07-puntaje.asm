; 07-puntaje.asm — Cazamonedas, etapa E: el puntaje en pantalla
;
; Cada moneda suma un punto. El puntaje (VE) se muestra en decimal arriba
; a la izquierda, con tres dígitos de la fuente:
;   LD B, VE    (FX33) guarda centenas, decenas y unidades en memoria,
;   LD V2, [I]  (FX65) las carga en V0, V1 y V2,
;   LD F, Vx    (FX29) apunta I al glifo de cada dígito.
;
; Registros:
;   V0..V3  temporales (dibuja_puntaje usa los cuatro)
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)
;   V8, V9  posición de la moneda (x, y)
;   VE      puntaje
;   VF      bandera: choque de DRW, préstamo de SUB

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros por paso
XMAX    EQU 58          ; 64 - 6: la x más grande del fantasmita
YMIN    EQU 8           ; debajo del techo (fila 6), con una fila de aire
YMAX    EQU 26          ; 32 - 6: la y más grande del fantasmita
MONEDA_XMAX EQU 60      ; 64 - 4: la x más grande de la moneda
MONEDA_DY   EQU 20      ; la moneda va de y = YMIN a y = YMIN + 20 = 28

inicio:
        CLS
        LD I, linea     ; el techo: 8 tramos de 8 píxeles en la fila 6
        LD V0, 0
        LD V1, 6
techo:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP techo

        LD VE, 0
        CALL dibuja_puntaje

        LD V4, 29
        LD V5, 17
        LD I, fantasma
        DRW V4, V5, 6
        CALL nueva_moneda

bucle:
        LD V0, DT
        SE V0, 0
        JP bucle
        LD V0, RITMO
        LD DT, V0

        LD V6, V4
        LD V7, V5
        LD V0, ARRIBA
        SKNP V0
        ADD V7, -1
        LD V0, ABAJO
        SKNP V0
        ADD V7, 1
        LD V0, IZQ
        SKNP V0
        ADD V6, -1
        LD V0, DER
        SKNP V0
        ADD V6, 1

        ; Bordes: como se mueve de a 1 píxel, si se pasó fue por uno solo
        ; y alcanza con devolverlo al límite.
        SNE V6, -1          ; x = -1 (0xFF): se fue por la izquierda
        LD V6, 0
        SNE V6, XMAX + 1    ; se fue por la derecha
        LD V6, XMAX
        SNE V7, YMIN - 1    ; se metió en el techo
        LD V7, YMIN
        SNE V7, YMAX + 1    ; se fue por abajo
        LD V7, YMAX

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        LD I, fantasma      ; las subrutinas cambian I: lo recargamos siempre
        DRW V4, V5, 6       ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6       ; dibujar en la posición nueva
        SE VF, 0            ; VF = 1: apagó algún píxel prendido. ¡La moneda!
        CALL agarrar
        JP bucle

; ----------------------------------------------------------------------
; El fantasmita pisó la moneda: la sacamos, sumamos un punto y ponemos
; otra moneda.
; ----------------------------------------------------------------------
agarrar:
        DRW V4, V5, 6       ; sacar el fantasmita (I todavía apunta a él)
        LD I, moneda
        DRW V8, V9, 4       ; borrar la moneda
        CALL dibuja_puntaje ; borrar el puntaje viejo (XOR)...
        ADD VE, 1
        CALL dibuja_puntaje ; ...y dibujar el nuevo
        LD I, fantasma      ; dibuja_puntaje cambió I
        DRW V4, V5, 6       ; volver a dibujar el fantasmita
        CALL nueva_moneda
        RET

; ----------------------------------------------------------------------
; Pone la moneda en un lugar al azar. Si cae encima del fantasmita
; (VF = 1 al dibujarla), la borra y prueba en otro lugar.
; Usa V0 y cambia I.
; ----------------------------------------------------------------------
nueva_moneda:
        RND V8, 0x3F        ; x al azar entre 0 y 63
        LD V0, MONEDA_XMAX
        SUB V0, V8          ; VF = 1 si no hubo préstamo, o sea si x <= 60
        SE VF, 1
        JP nueva_moneda     ; no entra en la pantalla: probar otra vez
        RND V9, 0x1F        ; y al azar entre 0 y 31
        LD V0, MONEDA_DY
        SUB V0, V9          ; VF = 1 si y <= 20
        SE VF, 1
        JP nueva_moneda
        ADD V9, YMIN        ; bajarla debajo del techo: y entre 8 y 28
        LD I, moneda
        DRW V8, V9, 4
        SE VF, 1            ; ¿no tocó nada? listo
        RET
        DRW V8, V9, 4       ; cayó sobre el fantasmita: borrarla
        JP nueva_moneda     ; y probar en otro lugar

; ----------------------------------------------------------------------
; Dibuja el puntaje (VE) en decimal en las columnas 1, 6 y 11 de la fila 0.
; DRW dibuja con XOR: llamarla dos veces con el mismo puntaje lo borra.
; Usa V0..V3 y cambia I.
; ----------------------------------------------------------------------
dibuja_puntaje:
        LD I, bcd
        LD B, VE            ; bcd = centenas, bcd+1 = decenas, bcd+2 = unidades
        LD V2, [I]          ; V0, V1, V2 = esos tres dígitos
        LD V3, 0            ; y = 0
        LD F, V0            ; I = glifo de las centenas...
        LD V0, 1            ; ...así que V0 queda libre para la x
        DRW V0, V3, 5
        LD F, V1
        LD V1, 6
        DRW V1, V3, 5
        LD F, V2
        LD V2, 11
        DRW V2, V3, 5
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
bcd:    DB 0, 0, 0          ; lugar para los tres dígitos de LD B, VE

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
moneda:
        DB %01100000    ; .##.
        DB %11110000    ; ####
        DB %11110000    ; ####
        DB %01100000    ; .##.
linea:
        DB %11111111    ; ########
