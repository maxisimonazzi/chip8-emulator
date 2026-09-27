; @name Autotest
; @description Un programa que se prueba a sí mismo: ejecuta 19 comprobaciones de las instrucciones y muestra cada resultado con una tilde o una cruz.
; @controls Ninguno. No toques ninguna tecla mientras corre (una de las pruebas verifica que no haya teclas apretadas).
; @order 4
;
; ======================================================================
;  AUTOTEST — CHIP-8 comprobándose a sí mismo
; ======================================================================
;
; Cada prueba ejecuta algunas instrucciones y compara los resultados con lo
; que dice la especificación. Todas dan lo mismo con cualquier configuración
; de quirks (COSMAC VIP, SUPER-CHIP o XO-CHIP): nunca se lee VF después de
; OR/AND/XOR, SHR/SHL se usan con X = Y, I se vuelve a cargar antes de cada
; LD [I] / LD Vx, [I] y no se usa JP V0.
;
; La pantalla: una grilla de 4 columnas x 5 filas. Cada celda tiene una
; etiqueta de dos dígitos hexadecimales (dibujados con la fuente, FX29) y a
; la derecha una tilde (bien) o una cruz (mal):
;
;   D0 dibujo DXYN/00E0     60 LD/ADD 6XNN 7XNN 8XY0   81 OR          82 AND
;   83 XOR                  84 ADD con acarreo        85 SUB         86 SHR
;   87 SUBN                 8E SHL                    39 saltos 3/4/5/9  EE CALL/RET
;   1E LD I / ADD I         33 BCD (FX33)             55 FX55/FX65   29 fuente (FX29)
;   15 temporizador         C0 RND con máscara        A1 teclado     [resumen]
;
; La última celda (invertida) es el resumen: la cantidad de pruebas que
; fallaron, en decimal, y una tilde si fueron cero o una cruz si no.
; Al terminar suena un pitido corto si todo anduvo bien, o uno largo si algo falló.
;
; RESULTADO LEGIBLE POR MÁQUINA (lo usan los tests automáticos):
;   Cuando termina, VD = cantidad de pruebas ejecutadas (19) y
;   VE = cantidad de pruebas que fallaron, y el programa se queda para
;   siempre en "fin: JP fin".
;
; Cómo está organizado:
;   Cada prueba es una subrutina que se llama con CALL. Si algo no da lo
;   esperado salta a "falla"; si todo da bien salta a "pasa". Las dos saltan
;   a "informe", que dibuja la celda, actualiza VD y VE y hace el RET que
;   vuelve a la lista de pruebas.
;
; Registros:
;   V0..VC  libres para las pruebas (VC le dice a "informe" si pasó: 0 o 1)
;   VD      cantidad de pruebas hechas (= número de celda de la próxima)
;   VE      cantidad de pruebas que fallaron
;   VF      bandera; varias pruebas la revisan a propósito

inicio:
        CLS
        LD VD, 0
        LD VE, 0

        CALL prueba_dibujo      ; D0
        CALL prueba_carga       ; 60
        CALL prueba_or          ; 81
        CALL prueba_and         ; 82
        CALL prueba_xor         ; 83
        CALL prueba_suma        ; 84
        CALL prueba_resta       ; 85
        CALL prueba_shr         ; 86
        CALL prueba_subn        ; 87
        CALL prueba_shl         ; 8E
        CALL prueba_saltos      ; 39
        CALL prueba_llamadas    ; EE
        CALL prueba_indice      ; 1E
        CALL prueba_bcd         ; 33
        CALL prueba_memoria     ; 55
        CALL prueba_fuente      ; 29
        CALL prueba_tiempo      ; 15
        CALL prueba_azar        ; C0
        CALL prueba_teclas      ; A1

        CALL resumen
fin:    JP fin                  ; VD y VE ya tienen el resultado final

; ----------------------------------------------------------------------
; Resultado de una prueba
; ----------------------------------------------------------------------
pasa:
        LD VC, 0
        JP informe
falla:
        LD VC, 1

; Dibuja la celda número VD: etiqueta (tabla "etiquetas") y marca.
; Celda VD: x = (VD % 4) * 16, y = (VD / 4) * 6 + 1.
informe:
        LD I, etiquetas         ; V0, V1 = los dos dígitos de la etiqueta
        ADD I, VD
        ADD I, VD
        LD V1, [I]
        LD V4, V0
        LD V5, V1

        LD V2, 3                ; x = (VD & 3) * 16
        AND V2, VD
        SHL V2
        SHL V2
        SHL V2
        SHL V2

        LD V3, VD               ; y = (VD >> 2) * 6 + 1
        SHR V3
        SHR V3
        LD V0, V3
        ADD V3, V3              ;   *2
        ADD V3, V0              ;   *3
        ADD V3, V3              ;   *6
        ADD V3, 1

        LD F, V4                ; primer dígito
        DRW V2, V3, 5
        ADD V2, 5
        LD F, V5                ; segundo dígito
        DRW V2, V3, 5
        ADD V2, 5
        LD I, bien              ; tilde o cruz
        SE VC, 0
        LD I, mal
        DRW V2, V3, 5

        ADD VE, VC              ; contar la falla (si la hubo)
        ADD VD, 1
        RET                     ; vuelve a la lista de pruebas

; Celda final invertida con la cantidad de fallas y la marca general.
resumen:
        LD I, caja
        LD V0, 48
        LD V1, 24
        DRW V0, V1, 7
        LD V0, 56
        DRW V0, V1, 7

        LD I, bcd               ; fallas en decimal: V1 = decenas, V2 = unidades
        LD B, VE
        LD V2, [I]
        LD V3, 25
        LD V4, 49
        LD F, V1
        DRW V4, V3, 5
        LD V4, 54
        LD F, V2
        DRW V4, V3, 5
        LD V4, 59
        LD I, bien
        SE VE, 0
        LD I, mal
        DRW V4, V3, 5

        LD V0, 3                ; pitido corto si todo bien...
        SE VE, 0
        LD V0, 6                ; ...o largo si algo falló
        LD ST, V0
        RET

; ======================================================================
; Las pruebas
; ======================================================================

; D0 — DXYN: choque (VF) en 0 y en 1; 00E0 borra la pantalla.
; Dibuja en la fila 30, que la grilla no usa, y la deja vacía al terminar.
prueba_dibujo:
        LD I, barra             ; 4x2
        LD V1, 0
        LD V2, 30
        LD V3, 0                ; V3 = 1 si algo falló
        DRW V1, V2, 2           ; pantalla vacía: no hay choque
        SE VF, 0
        LD V3, 1
        DRW V1, V2, 2           ; mismo lugar: lo borra y hay choque
        SE VF, 1
        LD V3, 1
        DRW V1, V2, 2           ; dibujarlo otra vez...
        LD V4, 2
        DRW V4, V2, 2           ; ...y otro encima, corrido 2 píxeles: choque
        SE VF, 1
        LD V3, 1
        CLS                     ; 00E0 borra todo...
        DRW V1, V2, 2           ; ...así que ahora no hay choque
        SE VF, 0
        LD V3, 1
        DRW V1, V2, 2           ; borrarlo (choque)
        SE VF, 1
        LD V3, 1
        SE V3, 0
        JP falla
        JP pasa

; 60 — LD Vx, nn / ADD Vx, nn (da la vuelta y no toca VF) / LD Vx, Vy.
prueba_carga:
        LD VF, 0x5A
        LD V1, 0xFE
        ADD V1, 3               ; 0xFE + 3 = 0x101 -> 0x01
        SE V1, 0x01
        JP falla
        SE VF, 0x5A             ; 7XNN no modifica VF
        JP falla
        LD V2, 0x80
        LD V1, V2               ; 8XY0
        SE V1, 0x80
        JP falla
        SE V2, 0x80
        JP falla
        ADD V1, 0x7F            ; 0xFF, sin dar la vuelta
        SE V1, 0xFF
        JP falla
        SE VF, 0x5A
        JP falla
        JP pasa

; 81 — OR (solo el valor: VF depende del quirk "reset de VF").
prueba_or:
        LD V1, 0x5C
        LD V2, 0x93
        OR V1, V2
        SE V1, 0xDF
        JP falla
        SE V2, 0x93
        JP falla
        JP pasa

; 82 — AND.
prueba_and:
        LD V1, 0x5C
        LD V2, 0x93
        AND V1, V2
        SE V1, 0x10
        JP falla
        SE V2, 0x93
        JP falla
        JP pasa

; 83 — XOR.
prueba_xor:
        LD V1, 0x5C
        LD V2, 0x93
        XOR V1, V2
        SE V1, 0xCF
        JP falla
        SE V2, 0x93
        JP falla
        JP pasa

; 84 — ADD Vx, Vy: VF = acarreo. Con X = F gana la bandera.
prueba_suma:
        LD V1, 200
        LD V2, 100
        ADD V1, V2              ; 300 -> 44, acarreo
        SE V1, 44
        JP falla
        SE VF, 1
        JP falla
        LD VF, 1
        LD V1, 10
        LD V2, 20
        ADD V1, V2              ; 30, sin acarreo: VF vuelve a 0
        SE V1, 30
        JP falla
        SE VF, 0
        JP falla
        LD V1, 255
        LD V2, 1
        ADD V1, V2              ; 256 -> 0, acarreo
        SE V1, 0
        JP falla
        SE VF, 1
        JP falla
        LD VF, 200
        LD V1, 100
        ADD VF, V1              ; VF = bandera (1), no la suma
        SE VF, 1
        JP falla
        LD VF, 10
        LD V1, 20
        ADD VF, V1              ; VF = bandera (0), no 30
        SE VF, 0
        JP falla
        JP pasa

; 85 — SUB Vx, Vy: VF = 1 si NO hubo préstamo (Vx >= Vy).
prueba_resta:
        LD V1, 100
        LD V2, 30
        SUB V1, V2              ; 70, sin préstamo
        SE V1, 70
        JP falla
        SE VF, 1
        JP falla
        LD V1, 30
        LD V2, 100
        SUB V1, V2              ; -70 -> 186, con préstamo
        SE V1, 186
        JP falla
        SE VF, 0
        JP falla
        LD V1, 50
        LD V2, 50
        SUB V1, V2              ; 0: iguales cuenta como "sin préstamo"
        SE V1, 0
        JP falla
        SE VF, 1
        JP falla
        LD VF, 100
        LD V1, 30
        SUB VF, V1              ; VF = bandera (1)
        SE VF, 1
        JP falla
        LD VF, 30
        LD V1, 100
        SUB VF, V1              ; VF = bandera (0)
        SE VF, 0
        JP falla
        JP pasa

; 86 — SHR Vx (con Y = X): VF = el bit que sale por la derecha.
prueba_shr:
        LD V1, 0x85
        SHR V1                  ; 0x42, sale un 1
        SE V1, 0x42
        JP falla
        SE VF, 1
        JP falla
        SHR V1                  ; 0x21, sale un 0
        SE V1, 0x21
        JP falla
        SE VF, 0
        JP falla
        LD VF, 0x85
        SHR VF                  ; VF = bandera (1)
        SE VF, 1
        JP falla
        LD VF, 0x84
        SHR VF                  ; VF = bandera (0)
        SE VF, 0
        JP falla
        JP pasa

; 87 — SUBN Vx, Vy: Vx = Vy - Vx, VF = 1 si Vy >= Vx.
prueba_subn:
        LD V1, 30
        LD V2, 100
        SUBN V1, V2             ; 100 - 30 = 70
        SE V1, 70
        JP falla
        SE VF, 1
        JP falla
        LD V1, 100
        LD V2, 30
        SUBN V1, V2             ; 30 - 100 -> 186
        SE V1, 186
        JP falla
        SE VF, 0
        JP falla
        LD V1, 50
        LD V2, 50
        SUBN V1, V2             ; 0: iguales cuenta como "sin préstamo"
        SE V1, 0
        JP falla
        SE VF, 1
        JP falla
        LD VF, 30
        LD V1, 100
        SUBN VF, V1             ; VF = bandera (1)
        SE VF, 1
        JP falla
        LD VF, 100
        LD V1, 30
        SUBN VF, V1             ; VF = bandera (0)
        SE VF, 0
        JP falla
        JP pasa

; 8E — SHL Vx (con Y = X): VF = el bit que sale por la izquierda.
prueba_shl:
        LD V1, 0x85
        SHL V1                  ; 0x0A, sale un 1
        SE V1, 0x0A
        JP falla
        SE VF, 1
        JP falla
        SHL V1                  ; 0x14, sale un 0
        SE V1, 0x14
        JP falla
        SE VF, 0
        JP falla
        LD VF, 0x81
        SHL VF                  ; VF = bandera (1)
        SE VF, 1
        JP falla
        LD VF, 0x41
        SHL VF                  ; VF = bandera (0)
        SE VF, 0
        JP falla
        JP pasa

; 39 — Saltos condicionales 3XNN, 4XNN, 5XY0 y 9XY0, cuando saltean y
; cuando no. Si una instrucción saltea mal, cae en un "JP falla".
prueba_saltos:
        LD V1, 0x33
        LD V2, 0x33
        LD V3, 0x44
        SE V1, 0x33             ; igual: saltea
        JP falla
        SE V1, 0x34             ; distinto: no saltea
        JP saltos_1
        JP falla
saltos_1:
        SNE V1, 0x34            ; distinto: saltea
        JP falla
        SNE V1, 0x33            ; igual: no saltea
        JP saltos_2
        JP falla
saltos_2:
        SE V1, V2               ; iguales: saltea
        JP falla
        SE V1, V3               ; distintos: no saltea
        JP saltos_3
        JP falla
saltos_3:
        SNE V1, V3              ; distintos: saltea
        JP falla
        SNE V1, V2              ; iguales: no saltea
        JP pasa
        JP falla

; EE — JP, y CALL/RET anidados tres niveles. V1 lleva la cuenta de por
; dónde pasó el programa; V2 = 1 si algo salió en otro orden.
prueba_llamadas:
        LD V1, 0
        LD V2, 0
        JP llamadas_salto
        LD V2, 1                ; el JP tiene que saltear esta línea
llamadas_salto:
        CALL llamadas_a
        SE V1, 5
        LD V2, 1
        SE V2, 0
        JP falla
        JP pasa
llamadas_a:
        SE V1, 0
        LD V2, 1
        LD V1, 1
        CALL llamadas_b
        SE V1, 4                ; volvió al lugar correcto
        LD V2, 1
        LD V1, 5
        RET
llamadas_b:
        SE V1, 1
        LD V2, 1
        LD V1, 2
        CALL llamadas_c
        SE V1, 3
        LD V2, 1
        LD V1, 4
        RET
llamadas_c:
        SE V1, 2
        LD V2, 1
        LD V1, 3
        RET

; 1E — LD I, nnn y ADD I, Vx (que no toca VF). Se comprueba adónde quedó
; apuntando I leyendo un byte de una tabla conocida.
prueba_indice:
        LD VF, 0x77
        LD V1, 3
        LD I, tabla
        ADD I, V1               ; tabla + 3
        SE VF, 0x77
        JP falla
        ADD I, V1               ; tabla + 6
        LD V0, [I]
        SE V0, 0x16
        JP falla
        LD I, tabla - 128
        LD V1, 133
        ADD I, V1               ; tabla + 5
        LD V0, [I]
        SE V0, 0x15
        JP falla
        JP pasa

; 33 — LD B, Vx: centenas, decenas y unidades en I, I+1, I+2 (sin mover I).
prueba_bcd:
        LD V3, 254
        LD I, bcd
        LD B, V3
        LD V2, [I]
        SE V0, 2
        JP falla
        SE V1, 5
        JP falla
        SE V2, 4
        JP falla
        LD V3, 7
        LD I, bcd
        LD B, V3
        LD V2, [I]
        SE V0, 0
        JP falla
        SE V1, 0
        JP falla
        SE V2, 7
        JP falla
        LD V3, 90
        LD I, bcd
        LD B, V3
        LD V2, [I]
        SE V0, 0
        JP falla
        SE V1, 9
        JP falla
        SE V2, 0
        JP falla
        JP pasa

; 55 — LD [I], Vx y LD Vx, [I]: guardan y cargan de V0 a Vx, ni uno más.
prueba_memoria:
        LD V0, 0x99
        LD V1, 0x99
        LD V2, 0x99
        LD V3, 0x99
        LD V4, 0x99
        LD I, memoria
        LD [I], V4              ; memoria[0..4] = 0x99
        LD V0, 1
        LD V1, 2
        LD V2, 3
        LD V3, 4
        LD V4, 0x55
        LD I, memoria
        LD [I], V3              ; guarda V0..V3, no V4
        LD V0, 0
        LD V1, 0
        LD V2, 0
        LD V3, 0
        LD V4, 0x42
        LD I, memoria
        LD V3, [I]              ; carga V0..V3, no V4
        SE V0, 1
        JP falla
        SE V1, 2
        JP falla
        SE V2, 3
        JP falla
        SE V3, 4
        JP falla
        SE V4, 0x42
        JP falla
        LD I, memoria
        LD V4, [I]              ; memoria[4] tiene que seguir en 0x99
        SE V4, 0x99
        JP falla
        JP pasa

; 29 — LD F, Vx: I apunta al dígito de la fuente; se leen sus bytes.
prueba_fuente:
        LD V5, 0xA
        LD F, V5
        LD V4, [I]              ; "A" = F0 90 F0 90 90
        SE V0, 0xF0
        JP falla
        SE V1, 0x90
        JP falla
        SE V2, 0xF0
        JP falla
        SE V4, 0x90
        JP falla
        LD V5, 7
        LD F, V5
        LD V4, [I]              ; "7" = F0 10 20 40 40
        SE V1, 0x10
        JP falla
        SE V2, 0x20
        JP falla
        SE V4, 0x40
        JP falla
        JP pasa

; 15 — LD DT, Vx / LD Vx, DT: el temporizador de retardo se lee igual a
; como se cargó y después baja solo. También ejecuta LD ST, Vx (con 0).
;
; Para no quedarse esperando para siempre si DT no baja, la espera tiene un
; tope de 400 vueltas de 5 instrucciones (unas 2000 instrucciones). DT tiene
; que bajar en el cuadro siguiente, así que alcanza de sobra hasta con 1000
; instrucciones por cuadro, el máximo de la consola; y si DT no baja, la cruz
; aparece enseguida: en unos 2 segundos a 15 instrucciones por cuadro y en
; unos 5 a 7.
prueba_tiempo:
        LD V1, 0
        LD ST, V1               ; FX18 (silencio)
        LD V1, 30
        LD DT, V1
        LD V2, DT               ; 30 (o 29 si justo terminó un cuadro)
        LD V3, V2
        ADD V3, -29             ; 0 o 1 si estaba bien
        LD V4, 0xFE
        AND V4, V3
        SE V4, 0
        JP falla
        LD V5, 200              ; tope de la espera: 200 x 2 vueltas
        LD V6, 2
tiempo_espera:                  ; esperar hasta que DT cambie
        LD V3, DT
        SE V3, V2
        JP tiempo_bajo
        ADD V5, -1
        SE V5, 0
        JP tiempo_espera
        LD V5, 200
        ADD V6, -1
        SE V6, 0
        JP tiempo_espera
        JP falla                ; se cansó de esperar: el temporizador no baja
tiempo_bajo:
        SNE V3, 0               ; cambió, pero no de golpe a 0
        JP falla
        LD V4, 8                ; y bajó (no subió): sumándole de 1 a 8 a lo que
tiempo_cuenta:                  ; se leyó ahora, se vuelve a lo de antes. Con
        ADD V3, 1               ; muy pocas instrucciones por cuadro, entre dos
        SE V3, V2               ; lecturas pasan varios cuadros: por eso hasta 8.
        JP tiempo_sigue
        JP pasa
tiempo_sigue:
        ADD V4, -1
        SE V4, 0
        JP tiempo_cuenta
        JP falla

; C0 — RND Vx, 0 siempre da 0; RND Vx, 0x0F nunca pasa de 15.
prueba_azar:
        LD V2, 16               ; 16 intentos
azar_bucle:
        LD V1, 0xFF
        RND V1, 0x00
        SE V1, 0
        JP falla
        RND V1, 0x0F
        LD V3, 0xF0
        AND V3, V1
        SE V3, 0
        JP falla
        ADD V2, -1
        SE V2, 0
        JP azar_bucle
        JP pasa

; A1 — SKNP / SKP con ninguna tecla apretada, para las 16 teclas.
prueba_teclas:
        LD V1, 0
teclas_bucle:
        SKNP V1                 ; no apretada: saltea
        JP falla
        SKP V1                  ; no apretada: no saltea
        JP teclas_sigue
        JP falla
teclas_sigue:
        ADD V1, 1
        SE V1, 16
        JP teclas_bucle
        JP pasa

; ----------------------------------------------------------------------
; Datos
; ----------------------------------------------------------------------
etiquetas:                      ; dos dígitos hexadecimales por prueba, en orden
        DB 0xD, 0x0             ; dibujo
        DB 0x6, 0x0             ; carga
        DB 0x8, 0x1             ; OR
        DB 0x8, 0x2             ; AND
        DB 0x8, 0x3             ; XOR
        DB 0x8, 0x4             ; ADD
        DB 0x8, 0x5             ; SUB
        DB 0x8, 0x6             ; SHR
        DB 0x8, 0x7             ; SUBN
        DB 0x8, 0xE             ; SHL
        DB 0x3, 0x9             ; saltos
        DB 0xE, 0xE             ; llamadas
        DB 0x1, 0xE             ; índice
        DB 0x3, 0x3             ; BCD
        DB 0x5, 0x5             ; memoria
        DB 0x2, 0x9             ; fuente
        DB 0x1, 0x5             ; temporizador
        DB 0xC, 0x0             ; azar
        DB 0xA, 0x1             ; teclado

bien:   DB %00001000, %00001000, %00010000, %10100000, %01000000   ; tilde
mal:    DB %10001000, %01010000, %00100000, %01010000, %10001000   ; cruz
barra:  DB %11110000, %11110000
caja:   DB %11111111, %11111111, %11111111, %11111111
        DB %11111111, %11111111, %11111111
tabla:  DB 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17
bcd:    DB 0, 0, 0
memoria: DB 0, 0, 0, 0, 0
