; @name Teclado
; @description Muestra el teclado hexadecimal: cada tecla se ilumina mientras la tenés apretada y la última aparece en grande.
; @controls Todas las teclas: 1 2 3 4 / Q W E R / A S D F / Z X C V (teclado del COSMAC VIP: 1 2 3 C / 4 5 6 D / 7 8 9 E / A 0 B F). Podés apretar varias a la vez.
; @order 2
;
; ======================================================================
;  TECLADO — visor del teclado hexadecimal
; ======================================================================
;
; Qué muestra este programa:
;   - Cómo leer el teclado sin detener el programa, con SKP / SKNP
;     (EX9E / EXA1), para detectar varias teclas apretadas a la vez.
;   - Cómo usar la fuente incorporada con LD F, Vx (FX29).
;   - Cómo guardar datos en memoria con LD [I], Vx (FX55) y leerlos con
;     LD Vx, [I] (FX65), incluida una tabla de posiciones.
;   - Cómo resaltar algo con XOR: una caja llena dibujada encima de un
;     dígito lo invierte; dibujarla otra vez lo deja como estaba.
;
; La pantalla:
;   A la izquierda, las 16 teclas en el orden del COSMAC VIP:
;        1 2 3 C
;        4 5 6 D
;        7 8 9 E
;        A 0 B F
;   Cada celda mide 6x7 píxeles; su esquina superior izquierda está en
;   x = 1 + 8*columna, y = 8*fila, y el dígito va en (x+1, y+1).
;   A la derecha, dentro de un marco, la última tecla apretada con un dígito
;   del doble de tamaño (8x10, en x = 44, y = 11).
;
; Cómo funciona:
;   El programa recuerda en memoria (tabla "estado") si cada tecla estaba
;   apretada. Revisa las 16 teclas una y otra vez y solo dibuja cuando una
;   cambia: al apretarla invierte su celda, suena un pitido y cambia el
;   dígito grande; al soltarla vuelve a invertir la celda.
;
;   Para que responda rápido incluso a 15 instrucciones por cuadro, el
;   repaso de las teclas está "desenrollado": en vez de un bucle, hay un
;   bloque de 6 instrucciones por tecla, y los estados de 8 teclas se
;   cargan de una vez en V0..V7 con LD V7, [I]. Así, a 15 instrucciones por
;   cuadro una tecla se ilumina en 7 cuadros como mucho (poco más de 1/10 de
;   segundo); a 7, el ajuste más lento de la consola, puede tardar hasta 13.
;
; Registros:
;   V0..V7  estados de las 8 teclas del grupo que se está revisando
;   V8      tecla que se revisa; V9 = su estado actual (1 apretada, 0 no)
;   VA      temporal
;   VB      primer índice del grupo (0 para las teclas 0-7, 8 para 8-F)
;   VC      desplazamiento del dígito grande visible (tecla * 10), 0xFF = ninguno
;   VD, VE  posición del dígito grande

BEEP    EQU 4           ; pitido de 4/60 s al apretar una tecla
GRANDE_X EQU 44
GRANDE_Y EQU 11

COL0    EQU 1           ; esquina de cada celda
COL1    EQU 9
COL2    EQU 17
COL3    EQU 25
FILA0   EQU 0
FILA1   EQU 8
FILA2   EQU 16
FILA3   EQU 24

inicio:
        CLS
        CALL dibuja_teclas
        CALL dibuja_marco
        LD VC, 0xFF
        LD VD, GRANDE_X
        LD VE, GRANDE_Y

; ----------------------------------------------------------------------
; Bucle principal: revisa las 16 teclas, sin fin.
; Para cada tecla k:  V9 = ¿apretada?;  si V9 != estado guardado -> cambio
; ----------------------------------------------------------------------
bucle:
        LD VB, 0                ; grupo 1: teclas 0..7 -> estados en V0..V7
        LD I, estado
        LD V7, [I]

        LD V8, 0x0
        LD V9, 0
        SKNP V8                 ; si la tecla NO está apretada, saltea el LD
        LD V9, 1
        SE V9, V0               ; si no cambió, saltea el CALL
        CALL cambio

        LD V8, 0x1
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V1
        CALL cambio

        LD V8, 0x2
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V2
        CALL cambio

        LD V8, 0x3
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V3
        CALL cambio

        LD V8, 0x4
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V4
        CALL cambio

        LD V8, 0x5
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V5
        CALL cambio

        LD V8, 0x6
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V6
        CALL cambio

        LD V8, 0x7
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V7
        CALL cambio

        LD VB, 8                ; grupo 2: teclas 8..F -> estados en V0..V7
        LD I, estado + 8
        LD V7, [I]

        LD V8, 0x8
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V0
        CALL cambio

        LD V8, 0x9
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V1
        CALL cambio

        LD V8, 0xA
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V2
        CALL cambio

        LD V8, 0xB
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V3
        CALL cambio

        LD V8, 0xC
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V4
        CALL cambio

        LD V8, 0xD
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V5
        CALL cambio

        LD V8, 0xE
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V6
        CALL cambio

        LD V8, 0xF
        LD V9, 0
        SKNP V8
        LD V9, 1
        SE V9, V7
        CALL cambio

        JP bucle

; ----------------------------------------------------------------------
; cambio: la tecla V8 pasó al estado V9. Usa V0..V2 y VA libremente y al
; final vuelve a cargar los estados del grupo en V0..V7.
; ----------------------------------------------------------------------
cambio:
        LD V0, V9               ; estado[V8] = V9
        LD I, estado
        ADD I, V8
        LD [I], V0

        LD I, celdas            ; V0, V1 = esquina de la celda (tabla de 2 bytes por tecla)
        ADD I, V8
        ADD I, V8
        LD V1, [I]
        LD I, caja              ; invertir la celda
        DRW V0, V1, 7

        SE V9, 1                ; ¿se soltó? entonces no hay nada más que hacer
        JP cambio_fin

        LD VA, BEEP             ; se apretó: pitido
        LD ST, VA
        LD VA, V8               ; VA = tecla * 10 = tecla*8 + tecla*2
        SHL VA                  ;   *2
        LD V2, VA
        SHL VA                  ;   *4
        SHL VA                  ;   *8
        ADD VA, V2              ;   *8 + *2
        SE VC, 0xFF             ; si ya había un dígito grande, borrarlo
        CALL digito_grande
        LD VC, VA
        CALL digito_grande      ; y dibujar el nuevo

cambio_fin:
        LD I, estado            ; recargar los estados del grupo actual
        ADD I, VB
        LD V7, [I]
        RET

; Dibuja (o borra, por XOR) el dígito grande que empieza en digitos + VC.
digito_grande:
        LD I, digitos
        ADD I, VC
        DRW VD, VE, 10
        RET

; ----------------------------------------------------------------------
; Dibujo inicial
; ----------------------------------------------------------------------
dibuja_teclas:                  ; el dígito de cada tecla, con la fuente incorporada
        LD V8, 0
dibuja_teclas_bucle:
        LD I, celdas
        ADD I, V8
        ADD I, V8
        LD V1, [I]              ; V0, V1 = esquina de la celda
        ADD V0, 1               ; el dígito va un píxel adentro
        ADD V1, 1
        LD F, V8                ; I = dígito V8 de la fuente
        DRW V0, V1, 5
        ADD V8, 1
        SE V8, 16
        JP dibuja_teclas_bucle
        RET

dibuja_marco:                   ; rectángulo de x = 36..59, y = 6..25
        LD I, linea
        LD V0, 36
        LD V1, 6
        LD V2, 25
dibuja_marco_h:
        DRW V0, V1, 1           ; lado de arriba
        DRW V0, V2, 1           ; lado de abajo
        ADD V0, 8
        SE V0, 60
        JP dibuja_marco_h

        LD I, columna
        LD V0, 36
        LD V1, 59
        LD V2, 7
        DRW V0, V2, 9           ; lado izquierdo, filas 7..15
        DRW V1, V2, 9           ; lado derecho
        LD V2, 16
        DRW V0, V2, 9           ; filas 16..24
        DRW V1, V2, 9
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
estado:                         ; 1 si la tecla estaba apretada
        DB 0, 0, 0, 0, 0, 0, 0, 0
        DB 0, 0, 0, 0, 0, 0, 0, 0

celdas:                         ; esquina (x, y) de la celda de cada tecla 0..F
        DB COL1, FILA3          ; 0
        DB COL0, FILA0          ; 1
        DB COL1, FILA0          ; 2
        DB COL2, FILA0          ; 3
        DB COL0, FILA1          ; 4
        DB COL1, FILA1          ; 5
        DB COL2, FILA1          ; 6
        DB COL0, FILA2          ; 7
        DB COL1, FILA2          ; 8
        DB COL2, FILA2          ; 9
        DB COL0, FILA3          ; A
        DB COL2, FILA3          ; B
        DB COL3, FILA0          ; C
        DB COL3, FILA1          ; D
        DB COL3, FILA2          ; E
        DB COL3, FILA3          ; F

caja:                           ; 6x7 lleno: invierte una celda
        DB %11111100, %11111100, %11111100, %11111100
        DB %11111100, %11111100, %11111100

linea:   DB %11111111
columna: DB %10000000, %10000000, %10000000, %10000000, %10000000
         DB %10000000, %10000000, %10000000, %10000000

digitos:                        ; la fuente al doble de tamaño: 8x10, 10 bytes por dígito
        DB 0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF   ; 0
        DB 0x0C, 0x0C, 0x3C, 0x3C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3F, 0x3F   ; 1
        DB 0xFF, 0xFF, 0x03, 0x03, 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF   ; 2
        DB 0xFF, 0xFF, 0x03, 0x03, 0xFF, 0xFF, 0x03, 0x03, 0xFF, 0xFF   ; 3
        DB 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03   ; 4
        DB 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0x03, 0x03, 0xFF, 0xFF   ; 5
        DB 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC3, 0xC3, 0xFF, 0xFF   ; 6
        DB 0xFF, 0xFF, 0x03, 0x03, 0x0C, 0x0C, 0x30, 0x30, 0x30, 0x30   ; 7
        DB 0xFF, 0xFF, 0xC3, 0xC3, 0xFF, 0xFF, 0xC3, 0xC3, 0xFF, 0xFF   ; 8
        DB 0xFF, 0xFF, 0xC3, 0xC3, 0xFF, 0xFF, 0x03, 0x03, 0xFF, 0xFF   ; 9
        DB 0xFF, 0xFF, 0xC3, 0xC3, 0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3   ; A
        DB 0xFC, 0xFC, 0xC3, 0xC3, 0xFC, 0xFC, 0xC3, 0xC3, 0xFC, 0xFC   ; B
        DB 0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xFF, 0xFF   ; C
        DB 0xFC, 0xFC, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFC, 0xFC   ; D
        DB 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF   ; E
        DB 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0   ; F
