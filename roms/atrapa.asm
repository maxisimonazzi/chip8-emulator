; @name Atrapa
; @description Mové la paleta y atrapá los bloques que caen: cada uno suma un punto y la caída se acelera. Si se te escapan tres, perdés.
; @controls Izquierda: A (tecla 7) o Q (tecla 4). Derecha: D (tecla 9) o E (tecla 6). Al terminar, cualquier tecla vuelve a empezar.
; @order 3
;
; ======================================================================
;  ATRAPA — un jueguito completo en menos de 500 bytes
; ======================================================================
;
; Qué muestra este programa:
;   - Leer el teclado sin frenar el juego (SKNP / EXA1).
;   - Números al azar con RND (CXNN) para elegir la columna de cada bloque.
;   - Mostrar un número en decimal: LD B, Vx (FX33) lo separa en centenas,
;     decenas y unidades, LD V2, [I] (FX65) los carga en V0..V2 y
;     LD F, Vx (FX29) apunta I al dígito de la fuente.
;   - Mover sprites con un solo DRW: en lugar de borrar y volver a dibujar,
;     se dibuja por XOR solo la "diferencia" entre la posición vieja y la
;     nueva. Así no hay parpadeo y alcanza con un DRW por objeto.
;   - Velocidad "con decimales": un acumulador de 8 bits al que se le suma la
;     velocidad en cada paso; cuando se pasa de 255 (VF = 1) el bloque baja
;     un píxel. Cuanto más grande la velocidad, más seguido baja.
;   - Esperar una tecla con LD Vx, K (FX0A) para volver a empezar.
;
; La pantalla:
;   filas 0..4    puntaje (3 dígitos, arriba a la izquierda) y vidas (corazones)
;   fila 6        línea que separa el marcador
;   filas 7..31   zona de juego; la paleta (6x2) está en las filas 30 y 31
;
; El juego avanza un "paso" cada TICK cuadros (lo marca el temporizador de
; retardo), así que corre igual a 15 que a 1000 instrucciones por cuadro.
;
; Registros:
;   V0, V1, V2, V4  temporales (FX33/FX65 usan V0..V2)
;   V3      x de la paleta (0..58, siempre par)
;   V5, V6  x, y del bloque que cae
;   V7      vidas
;   V8      puntaje
;   V9      velocidad de caída (en 1/256 de píxel por paso)
;   VA      acumulador de la caída
;   VB, VC  teclas para ir a la izquierda (7 y 4)
;   VD, VE  teclas para ir a la derecha (9 y 6)
;   VF      bandera (acarreo / préstamo / choque)

TICK      EQU 3         ; cuadros por paso: 20 pasos por segundo
PALETA_Y  EQU 30
PALETA_MAX EQU 58       ; 64 - 6
BLOQUE_Y0 EQU 7         ; donde aparece cada bloque
BLOQUE_ARRIBA EQU 26    ; justo encima de la paleta: ¿la atrapó?
BLOQUE_PISO EQU 28      ; tocó el piso: se escapó
VEL_INICIAL EQU 96      ; 96/256 de píxel por paso = 7,5 píxeles por segundo
VEL_AUMENTO EQU 6       ; cuánto se acelera por cada punto
VEL_MAXIMA EQU 249      ; tope de la velocidad (antes de sumar)

inicio:
        CLS
        LD V8, 0                ; puntaje
        LD V7, 3                ; vidas
        LD V9, VEL_INICIAL
        LD V3, 28               ; paleta en el centro
        LD VB, 7
        LD VC, 4
        LD VD, 9
        LD VE, 6

        CALL dibuja_puntaje
        CALL dibuja_marcador    ; línea y corazones
        LD I, paleta
        LD V0, PALETA_Y
        DRW V3, V0, 2
        CALL nuevo_bloque

; ----------------------------------------------------------------------
; Bucle principal: un paso cada TICK cuadros.
; ----------------------------------------------------------------------
paso:
        LD V0, DT
        SE V0, 0
        JP paso
        LD V0, TICK
        LD DT, V0

        ; --- la paleta ---
        SKNP VB                 ; tecla 7 apretada -> izquierda
        JP izquierda
        SKNP VC                 ; tecla 4 apretada -> izquierda
        JP izquierda
        SKNP VD                 ; tecla 9 apretada -> derecha
        JP derecha
        SKNP VE                 ; tecla 6 apretada -> derecha
        JP derecha
        JP bloque

izquierda:
        SNE V3, 0               ; ya está en el borde
        JP bloque
        ADD V3, -2
        LD I, paleta_delta      ; apaga 2 columnas a la derecha y prende 2 a la izquierda
        LD V0, PALETA_Y
        DRW V3, V0, 2
        JP bloque

derecha:
        SNE V3, PALETA_MAX
        JP bloque
        LD I, paleta_delta      ; apaga 2 columnas a la izquierda y prende 2 a la derecha
        LD V0, PALETA_Y
        DRW V3, V0, 2
        ADD V3, 2

        ; --- el bloque ---
bloque:
        ADD VA, V9              ; acumulador += velocidad
        SE VF, 1                ; ¿se pasó de 255? entonces baja
        JP paso
        LD I, bloque_delta      ; apaga su fila de arriba y prende la de abajo
        DRW V5, V6, 5
        ADD V6, 1
        SNE V6, BLOQUE_ARRIBA
        CALL mira_si_atrapa
        SNE V6, BLOQUE_PISO
        JP se_escapo
        JP paso

; ----------------------------------------------------------------------
; El bloque llegó justo encima de la paleta: ¿se superponen en x?
; Se atrapa si  bloque_x + 3 >= paleta_x  y  paleta_x + 5 >= bloque_x.
; ----------------------------------------------------------------------
mira_si_atrapa:
        LD V0, V5
        ADD V0, 3
        SUB V0, V3              ; VF = 1 si bloque_x + 3 >= paleta_x
        SE VF, 1
        RET
        LD V0, V3
        ADD V0, 5
        SUB V0, V5              ; VF = 1 si paleta_x + 5 >= bloque_x
        SE VF, 1
        RET

        ; ¡Atrapado!
        LD I, bloque_sprite     ; borrar el bloque
        DRW V5, V6, 4
        LD V0, 2                ; pitido corto
        LD ST, V0
        CALL dibuja_puntaje     ; borrar el puntaje viejo (XOR)...
        ADD V8, 1
        CALL dibuja_puntaje     ; ...y dibujar el nuevo
        LD V0, VEL_MAXIMA       ; acelerar, sin pasarse del tope
        SUB V0, V9              ; VF = 1 si VEL_MAXIMA >= velocidad
        SE VF, 0
        ADD V9, VEL_AUMENTO
        CALL nuevo_bloque
        RET

; ----------------------------------------------------------------------
; El bloque llegó al piso: se pierde una vida.
; ----------------------------------------------------------------------
se_escapo:
        LD I, bloque_sprite     ; borrar el bloque
        DRW V5, V6, 4
        LD V0, 6                ; pitido más largo
        LD ST, V0
        ADD V7, -1              ; una vida menos
        LD V0, V7               ; borrar el corazón número V7: x = 46 + 6 * V7
        ADD V0, V0
        LD V1, V0
        ADD V0, V0
        ADD V0, V1
        ADD V0, 46
        LD V1, 0
        LD I, corazon
        DRW V0, V1, 5
        LD V0, 30               ; medio segundo de pausa
        CALL espera
        SE V7, 0
        JP sigue
        JP fin_del_juego
sigue:
        CALL nuevo_bloque
        JP paso

; ----------------------------------------------------------------------
; Fin del juego: pantalla de "FIN" con el puntaje; cualquier tecla reinicia.
; ----------------------------------------------------------------------
fin_del_juego:
        CLS
        CALL dibuja_puntaje
        LD V1, 11
        LD V0, 20
        LD I, grande_f
        DRW V0, V1, 10
        LD V0, 30
        LD I, grande_i
        DRW V0, V1, 10
        LD V0, 38
        LD I, grande_n
        DRW V0, V1, 10
        LD V0, 60               ; un segundo de pausa antes de aceptar teclas
        CALL espera
        LD V0, K                ; esperar que aprieten y suelten una tecla
        JP inicio

; ----------------------------------------------------------------------
; Subrutinas
; ----------------------------------------------------------------------

; Espera V0 cuadros usando el temporizador de retardo.
espera:
        LD DT, V0
espera_bucle:
        LD V0, DT
        SE V0, 0
        JP espera_bucle
        RET

; Elige una columna al azar (0..60) y dibuja un bloque nuevo arriba.
nuevo_bloque:
        RND V5, 0x3F            ; 0..63
        LD V0, 60
        SUB V0, V5              ; VF = 1 si 60 >= x
        SE VF, 1
        JP nuevo_bloque         ; 61, 62 o 63: probar de nuevo
        LD V6, BLOQUE_Y0
        LD VA, 0
        LD I, bloque_sprite
        DRW V5, V6, 4
        RET

; Dibuja el puntaje V8 en decimal en (1, 0). Llamarla dos veces lo borra.
dibuja_puntaje:
        LD I, bcd
        LD B, V8                ; bcd = centenas, decenas, unidades
        LD V2, [I]              ; V0, V1, V2 = esos tres dígitos
        LD V4, 0
        LD F, V0
        LD V0, 1
        DRW V0, V4, 5
        LD F, V1
        LD V1, 6
        DRW V1, V4, 5
        LD F, V2
        LD V2, 11
        DRW V2, V4, 5
        RET

; Línea de la fila 6 y los tres corazones.
dibuja_marcador:
        LD I, linea
        LD V0, 0
        LD V1, 6
dibuja_marcador_linea:
        DRW V0, V1, 1
        ADD V0, 8
        SE V0, 64
        JP dibuja_marcador_linea
        LD I, corazon
        LD V0, 46
        LD V1, 0
dibuja_marcador_vidas:
        DRW V0, V1, 5
        ADD V0, 6
        SE V0, 64
        JP dibuja_marcador_vidas
        RET

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
bcd:            DB 0, 0, 0

paleta:         DB %11111100, %11111100
paleta_delta:   DB %11000011, %11000011         ; diferencia al moverse 2 píxeles
bloque_sprite:  DB %11110000, %11110000, %11110000, %11110000
bloque_delta:   DB %11110000, 0, 0, 0, %11110000 ; diferencia al bajar 1 píxel
linea:          DB %11111111
corazon:        DB %01010000, %11111000, %11111000, %01110000, %00100000

grande_f:       DB 0xFF, 0xFF, 0xC0, 0xC0, 0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0
grande_i:       DB 0xFC, 0xFC, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0xFC, 0xFC
grande_n:       DB 0xC3, 0xC3, 0xF3, 0xF3, 0xDB, 0xDB, 0xCF, 0xCF, 0xC3, 0xC3
