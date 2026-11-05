; @name Planos
; @description Muestra de XO-CHIP: pantalla de 128×64, cuatro colores con dos planos, fuente grande, scroll y sonido con patrón.
; @controls W (tecla 5): mientras la tenés apretada, el rombo se queda quieto.
; @order 6
; @platform xochip
;
; ======================================================================
;  PLANOS — lo nuevo de XO-CHIP en un solo programa
; ======================================================================
;
; Este cartucho es para la plataforma XO-CHIP (la extensión de CHIP-8 que
; inventó Octo). Qué muestra:
;   - Alta resolución: HIGH (00FF) pasa la pantalla a 128x64 píxeles, el
;     doble de ancho y de alto que CHIP-8 (y la borra).
;   - Dos planos de dibujo y cuatro colores. La pantalla de XO-CHIP son dos
;     pantallas superpuestas, el plano 1 y el plano 2. PLANE n (Fn01) elige
;     en qué planos actúan DRW, CLS y los scrolls: PLANE 1, PLANE 2, PLANE 3
;     (los dos) o PLANE 0 (ninguno). Cada píxel tiene entonces cuatro
;     estados: apagado, prendido solo en el plano 1, solo en el plano 2, o
;     en los dos. La consola los pinta con cuatro colores distintos.
;   - Sprites de 16x16: DRW Vx, Vy, 0 (DXY0) dibuja 16 filas de 2 bytes.
;   - La fuente grande: LD HF, Vx (FX30) apunta I al dígito Vx de una
;     fuente de 8x10 que el intérprete guarda en memoria (como LD F, Vx con
;     la chica). Con ella está escrito el contador de rebotes.
;   - Scroll: SCR (00FB) y SCL (00FC) corren la imagen 4 píxeles a la
;     derecha o a la izquierda; SCD n (00Cn) la baja n píxeles y SCU n
;     (00Dn, solo de XO-CHIP) la sube. Lo importante: corren SOLO los planos
;     elegidos con PLANE. Lo que sale por un borde se pierde.
;   - Sonido con patrón: AUDIO (F002) carga 16 bytes desde I, 128 muestras
;     de 1 bit que se reproducen en bucle mientras suena el temporizador de
;     sonido (ST), y PITCH Vx (Fx3A) elige la velocidad a la que se tocan,
;     o sea la nota.
;   - SAVE y LOAD (5XY2 y 5XY3): guardan y leen un rango de registros desde
;     I sin cambiar I, en cualquier perfil de quirks.
;
; La pantalla:
;   filas 1..10   el título "PLANOS" y, a la derecha, el contador de
;                 rebotes con la fuente grande (3 dígitos, de 000 a 255)
;   abajo         un disco (A) rebota en el plano 1, de la fila 14 a la 63
;   todo          un rombo (B) rebota en el plano 2 por toda la pantalla y
;                 pasa por encima del título y del contador sin borrarlos
;   Donde el disco y el rombo se pisan aparece el cuarto color (los dos
;   planos prendidos). El título, el contador y el disco están en el plano
;   1; el rombo está SOLO en el plano 2, y eso es lo que permite moverlo
;   sin dibujarlo nunca más (ver "Cómo se mueve el rombo").
;
; Cómo se mueve el disco (A, plano 1):
;   Con un solo DRW por paso, como la paleta de Atrapa: en vez de borrarlo y
;   volver a dibujarlo, se dibuja por XOR la DIFERENCIA entre el disco en la
;   posición vieja y en la nueva (los píxeles que cambian). El disco mide
;   14x14 y avanza 2 píxeles en diagonal, así que las dos posiciones juntas
;   entran en 16x16: la diferencia es un sprite de 16x16. Hay solo dos:
;   dif_baja sirve para ir hacia abajo a la derecha o hacia arriba a la
;   izquierda (la diagonal "\") y dif_sube para las otras dos (la diagonal
;   "/"). Se dibuja en la esquina de arriba a la izquierda de las dos
;   posiciones: (x, y), o 2 menos en cada eje en el que retrocede.
;   Como el disco nunca está a medio mover, no hay cuadros intermedios raros.
;
; Cómo se mueve el rombo (B, plano 2):
;   ¡Sin DRW! Se dibuja una sola vez al principio y después, en cada paso,
;   se corre el plano 2 entero: SCR o SCL (4 píxeles a un costado) y SCD 2 o
;   SCU 2 (2 píxeles para abajo o para arriba). Como en el plano 2 no hay
;   nada más, correr el plano es mover el rombo, y el plano 1 (título,
;   contador y disco) ni se entera. Eso sí: lo que sale por un borde se
;   pierde, así que el rombo rebota apenas llega al borde, antes de que un
;   scroll lo empuje afuera.
;
; El contador:
;   VC cuenta los rebotes (de los dos) y da la vuelta de 255 a 0. Al
;   rebotar, LD B, VC (FX33) guarda sus tres dígitos en "nuevo". Cambiar un
;   dígito en pantalla son dos DRW (borrar el viejo con XOR y dibujar el
;   nuevo), así que el contador se pone al día de a un DRW por paso: en cada
;   paso revisa una posición (VE = 3 unidades, 2 decenas, 1 centenas) y, si
;   lo que se ve ("visto") no es lo que tiene que verse ("nuevo"), borra el
;   dígito viejo o, si ya estaba borrado, dibuja el nuevo. En "visto", un
;   10 (VACIO) quiere decir "acá no hay ningún dígito dibujado".
;
; El sonido:
;   El patrón tiene 4 bits prendidos y 12 apagados, repetidos 8 veces: una
;   onda de pulsos, con un ciclo cada 16 bits. Con PITCH p se tocan
;   4000 * 2^((p - 64) / 48) bits por segundo, y la nota es eso dividido
;   16. Cada pared tiene su nota: con p = 115 suena un do (522 Hz), +16 es
;   una tercera (mi), +28 una quinta (sol) y +48 una octava. El disco usa
;   do, mi, sol y do agudo; el rombo, las mismas notas una octava más abajo.
;   Cada pitido dura PITIDO cuadros: se corta solo cuando ST llega a 0.
;
; La velocidad:
;   Un paso cada TICK = 5 cuadros (lo marca el temporizador de retardo): 12
;   pasos por segundo. El disco va a 24 píxeles por segundo en cada eje; el
;   rombo, a 48 de costado y 24 para arriba o para abajo.
;   Cada paso tiene como mucho 2 DRW (la diferencia del disco y un dígito
;   del contador), y el sonido y el contador no se hacen en el mismo paso:
;   si hubo un rebote, ese paso hace sonar el pitido y el contador espera al
;   siguiente. Con la "espera de vblank" (cada DRW cierra el cuadro, como
;   en el COSMAC VIP) un paso entra en sus 5 cuadros desde 14 instrucciones
;   por cuadro; sin esa espera, desde 12. Así que desde 15 (lo que trae la
;   consola) hasta 10000, y con cualquier perfil de quirks, el programa va
;   exactamente igual: las mismas posiciones en los mismos cuadros.
;   Para eso también: el primer paso arranca siempre en el cuadro ARRANQUE
;   (lo que tarde en dibujar el título no importa), y la tecla se lee al
;   principio de cada paso, en su primer cuadro, antes del DRW.
;   Por las dudas, aunque no pasa nunca, también entraría en 5 cuadros a 15
;   instrucciones por cuadro un paso con 4 rebotes (los dos en una esquina).
;   No pasa porque las paredes de cada uno se tocan cada tantos pasos: el
;   disco toca una pared de los costados cada 57 pasos y una de arriba o
;   abajo cada 18; las dos cuentas son múltiplos de 3, y el primer toque de
;   cada eje (en el paso 47 y en el 10) no difiere en un múltiplo de 3, así
;   que nunca coinciden. El rombo: cada 28 y cada 24 (múltiplos de 4), con
;   el primer toque en el paso 19 y en el 10.
;
; Igual con cualquier perfil de quirks (siempre con la plataforma XO-CHIP):
;   - Los sprites nunca se salen de la pantalla (si no, el perfil decide si
;     se recortan o si aparecen del otro lado).
;   - No usa OR, AND, XOR, SHR, SHL ni JP V0 (los que cambian según el
;     perfil), ni LD [I], Vx o LD Vx, [I] (con el perfil del VIP mueven I):
;     lee y guarda con LOAD y SAVE, que nunca cambian I. LD B, Vx tampoco.
;   - Carga I (con LD I o LD HF) justo antes de cada DRW, AUDIO, LD B, LOAD
;     y SAVE; la única excepción es el título, donde ADD I pasa de una letra
;     a la siguiente.
;
; Registros:
;   V0      temporal; durante el paso, 0 si NO está apretada la tecla que
;           frena al rombo
;   V1, V2  posición del disco (esquina de arriba a la izquierda)
;   V3, V4  dirección del disco: 2 o -2 (= 0xFE) en x y en y
;   V5, V6  posición del rombo
;   V7      dirección del rombo en x: 4 o -4
;   V8      dirección del rombo en y: 2 o -2
;   V9      nota del rebote de este paso (0 = no hubo rebote)
;   VA, VB  esquina donde se dibuja la próxima diferencia del disco
;           (y temporales del contador)
;   VC      rebotes
;   VD      temporal del contador
;   VE      posición del contador que falta revisar (0 = está al día)
;   VF      lo pisa DRW: acá no se usa para nada

TICK        EQU 5       ; cuadros por paso: 12 pasos por segundo
ARRANQUE    EQU 30      ; el primer paso empieza en el cuadro 30
PITIDO      EQU 4       ; cada pitido dura 4/60 de segundo
TECLA_FRENO EQU 5       ; tecla 5 (la W del teclado): frena al rombo

A_XMIN      EQU 0       ; límites del disco (14x14): x de 0 a 128 - 14
A_XMAX      EQU 114
A_YMIN      EQU 14      ; debajo del título
A_YMAX      EQU 50      ; 64 - 14
B_XMIN      EQU 0       ; límites del rombo (16x16): x de 0 a 128 - 16
B_XMAX      EQU 112
B_YMIN      EQU 0
B_YMAX      EQU 48      ; 64 - 16

CONTADOR_Y  EQU 1       ; fila de los dígitos grandes
VACIO       EQU 10      ; en "visto": esa posición no tiene ningún dígito

TONO_A_IZQ  EQU 115     ; do  (522 Hz)
TONO_A_DER  EQU 143     ; sol (781 Hz)
TONO_A_ARR  EQU 163     ; do agudo (1044 Hz)
TONO_A_ABA  EQU 131     ; mi  (658 Hz)
TONO_B_IZQ  EQU 67      ; las mismas notas, una octava más abajo (48 menos)
TONO_B_DER  EQU 95
TONO_B_ARR  EQU 115
TONO_B_ABA  EQU 83

inicio:
        HIGH                    ; 128x64 (y la pantalla queda borrada)
        LD V0, ARRANQUE         ; el reloj de los pasos: el primero empieza
        LD DT, V0               ; cuando DT llegue a 0
        LD I, patron
        AUDIO                   ; el patrón de sonido: 16 bytes desde I
        PLANE 1                 ; título, contador y disco: plano 1

        LD I, letras            ; "PLANOS": 6 letras de 8x10, una tras otra
        LD V0, 2                ; x
        LD V1, 1                ; y
        LD V2, 10               ; cada letra ocupa 10 bytes
titulo:
        DRW V0, V1, 10
        ADD I, V2               ; I = la letra siguiente
        ADD V0, 10
        SE V0, 62
        JP titulo

        LD V0, 0                ; el contador empieza en 000
        LD HF, V0               ; I = el 0 de la fuente grande
        LD V0, 98
        DRW V0, V1, 10
        LD V0, 108
        DRW V0, V1, 10
        LD V0, 118
        DRW V0, V1, 10

        LD V1, 20               ; el disco, yendo hacia abajo a la derecha
        LD V2, 30
        LD V3, 2
        LD V4, 2
        LD I, disco
        DRW V1, V2, 0

        LD V5, 76               ; el rombo, yendo hacia arriba a la izquierda
        LD V6, 20
        LD V7, -4
        LD V8, -2
        PLANE 2                 ; el rombo es lo único del plano 2
        LD I, rombo
        DRW V5, V6, 0
        PLANE 1

        LD V9, 0
        LD VC, 0
        LD VE, 0
        JP prepara

; ----------------------------------------------------------------------
; Bucle principal: un paso cada TICK cuadros.
; ----------------------------------------------------------------------
paso:
        LD V0, TECLA_FRENO      ; la tecla se lee acá, en el primer cuadro
        SKP V0                  ; del paso: ¿está apretada?
        LD V0, 0                ; no: V0 = 0 (si sí, V0 queda en 5)

        ; --- 1) el disco: un DRW con la diferencia ---
        LD I, dif_baja          ; diagonal "\": las dos direcciones iguales
        SE V3, V4
        LD I, dif_sube          ; diagonal "/": una positiva y otra negativa
        DRW VA, VB, 0
        ADD V1, V3              ; ya está en la posición nueva
        ADD V2, V4
        SNE V1, A_XMIN          ; ¿llegó a una pared? (SNE saltea el CALL
        CALL a_izquierda        ;  si NO es igual)
        SNE V1, A_XMAX
        CALL a_derecha
        SNE V2, A_YMIN
        CALL a_arriba
        SNE V2, A_YMAX
        CALL a_abajo

        ; --- 2) el rombo: correr el plano 2 ---
        SE V0, 0                ; con la tecla apretada, el rombo no se mueve
        JP fin_rombo
        PLANE 2                 ; los scrolls mueven solo el plano 2
        SNE V7, 4
        SCR                     ; 4 píxeles a la derecha...
        SE V7, 4
        SCL                     ; ...o a la izquierda
        SNE V8, 2
        SCD 2                   ; 2 píxeles para abajo...
        SE V8, 2
        SCU 2                   ; ...o para arriba
        PLANE 1
        ADD V5, V7              ; anotar dónde quedó
        ADD V6, V8
        SNE V5, B_XMIN
        CALL b_izquierda
        SNE V5, B_XMAX
        CALL b_derecha
        SNE V6, B_YMIN
        CALL b_arriba
        SNE V6, B_YMAX
        CALL b_abajo
fin_rombo:

        ; --- 3) el pitido o el contador (nunca los dos en el mismo paso) ---
        SE V9, 0
        JP suena                ; hubo un rebote
        SE VE, 0
        CALL contador           ; el contador está atrasado: un DRW

; Calcula dónde va la próxima diferencia del disco: (x, y), o 2 menos en
; cada eje en el que retrocede.
prepara:
        LD VA, V1
        SE V3, 2
        ADD VA, -2
        LD VB, V2
        SE V4, 2
        ADD VB, -2

; Espera a que DT llegue a 0 y lo vuelve a cargar para el paso siguiente.
espera:
        LD V0, DT
        SE V0, 0
        JP espera
        LD V0, TICK
        LD DT, V0
        JP paso

; Hubo un rebote: suena la nota de esa pared y el contador se anota los
; dígitos nuevos (los dibuja en los pasos siguientes).
suena:
        PITCH V9                ; la nota (el patrón ya está cargado)
        LD V0, PITIDO
        LD ST, V0               ; suena mientras ST > 0
        LD V9, 0
        LD I, nuevo
        LD B, VC                ; nuevo = centenas, decenas y unidades de VC
        LD VE, 3                ; revisar desde las unidades
        JP prepara

; ----------------------------------------------------------------------
; Rebotes: dan vuelta la dirección, eligen la nota y cuentan uno más.
; ----------------------------------------------------------------------
a_izquierda:
        LD V3, 2
        LD V9, TONO_A_IZQ
        ADD VC, 1
        RET
a_derecha:
        LD V3, -2
        LD V9, TONO_A_DER
        ADD VC, 1
        RET
a_arriba:
        LD V4, 2
        LD V9, TONO_A_ARR
        ADD VC, 1
        RET
a_abajo:
        LD V4, -2
        LD V9, TONO_A_ABA
        ADD VC, 1
        RET
b_izquierda:
        LD V7, 4
        LD V9, TONO_B_IZQ
        ADD VC, 1
        RET
b_derecha:
        LD V7, -4
        LD V9, TONO_B_DER
        ADD VC, 1
        RET
b_arriba:
        LD V8, 2
        LD V9, TONO_B_ARR
        ADD VC, 1
        RET
b_abajo:
        LD V8, -2
        LD V9, TONO_B_ABA
        ADD VC, 1
        RET

; ----------------------------------------------------------------------
; Contador: revisa la posición VE (3 = unidades, 2 = decenas, 1 =
; centenas) y hace como mucho un DRW.
; ----------------------------------------------------------------------
contador:
        LD I, nuevo - 1
        ADD I, VE
        LOAD VD, VD             ; VD = el dígito que tiene que verse ahí
        LD I, visto - 2         ; visto: un par (dígito, x) por posición
        ADD I, VE
        ADD I, VE
        LOAD VA, VB             ; VA = el dígito que se ve, VB = su x
        SNE VA, VD
        JP contador_listo       ; esa posición ya está bien
        SNE VA, VACIO           ; vacía: toca dibujar el dígito nuevo;
        LD VA, VD               ; si no, toca borrar el viejo (el de VA)
        LD HF, VA               ; I = el dígito VA de la fuente grande
        LD V0, CONTADOR_Y
        DRW VB, V0, 10          ; lo dibuja, o lo borra por XOR
        SE VA, VD               ; si borró el viejo, ahí no queda nada
        LD VA, VACIO
        LD I, visto - 2
        ADD I, VE
        ADD I, VE
        SAVE VA, VA             ; anotar lo que se ve ahora en esa posición
        RET
contador_listo:
        ADD VE, -1              ; la próxima vez, la posición de la izquierda
        RET                     ; (al llegar a 0, el contador está al día)

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
visto:  DB 0, 98                ; centenas: dígito que se ve y su x
        DB 0, 108               ; decenas
        DB 0, 118               ; unidades
nuevo:  DB 0, 0, 0              ; los dígitos que tienen que verse (LD B, VC)

; El patrón de sonido: 128 bits que se tocan en bucle. Cada par de bytes es
; un ciclo: 4 bits prendidos y 12 apagados.
patron: DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000
        DB %11110000, %00000000, %11110000, %00000000

; "PLANOS" en letras de 8x10 (10 bytes cada una).
letras: DB 0xFC, 0xFE, 0xC3, 0xC3, 0xFE, 0xFC, 0xC0, 0xC0, 0xC0, 0xC0  ; P
        DB 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xFF, 0xFF  ; L
        DB 0x3C, 0x7E, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0xC3, 0xC3, 0xC3  ; A
        DB 0xC3, 0xE3, 0xF3, 0xF3, 0xDB, 0xDB, 0xCF, 0xCF, 0xC7, 0xC3  ; N
        DB 0x7E, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0x7E  ; O
        DB 0x7E, 0xFF, 0xC0, 0xC0, 0xFE, 0x7F, 0x03, 0x03, 0xFF, 0x7E  ; S

; Sprites de 16x16: una palabra (2 bytes) por fila, el bit más alto a la
; izquierda.
disco:                          ; el disco de 14x14
        DW %0000011110000000
        DW %0001111111100000
        DW %0011111111110000
        DW %0111111111111000
        DW %0111111111111000
        DW %1111111111111100
        DW %1111111111111100
        DW %1111111111111100
        DW %1111111111111100
        DW %0111111111111000
        DW %0111111111111000
        DW %0011111111110000
        DW %0001111111100000
        DW %0000011110000000
        DW %0000000000000000
        DW %0000000000000000

dif_baja:                       ; el disco en (0, 0) XOR el disco en (2, 2)
        DW %0000011110000000
        DW %0001111111100000
        DW %0011111000010000
        DW %0111100000000000
        DW %0111000000000100
        DW %1110000000000010
        DW %1110000000000010
        DW %1100000000000011
        DW %1100000000000011
        DW %0100000000000111
        DW %0100000000000111
        DW %0010000000001110
        DW %0000000000011110
        DW %0000100001111100
        DW %0000011111111000
        DW %0000000111100000

dif_sube:                       ; el disco en (0, 2) XOR el disco en (2, 0)
        DW %0000000111100000
        DW %0000011111111000
        DW %0000100001111100
        DW %0000000000011110
        DW %0010000000001110
        DW %0100000000000111
        DW %0100000000000111
        DW %1100000000000011
        DW %1100000000000011
        DW %1110000000000010
        DW %1110000000000010
        DW %0111000000000100
        DW %0111100000000000
        DW %0011111000010000
        DW %0001111111100000
        DW %0000011110000000

rombo:                          ; el rombo de 16x16
        DW %0000000110000000
        DW %0000001111000000
        DW %0000011111100000
        DW %0000111111110000
        DW %0001111111111000
        DW %0011111111111100
        DW %0111111111111110
        DW %1111111111111111
        DW %1111111111111111
        DW %0111111111111110
        DW %0011111111111100
        DW %0001111111111000
        DW %0000111111110000
        DW %0000011111100000
        DW %0000001111000000
        DW %0000000110000000
