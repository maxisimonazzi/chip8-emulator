; 05-ritmo.asm — Cazamonedas, etapa C: velocidad fija con el temporizador
;
; En la etapa B el fantasmita se movía tan rápido como corriera la CPU.
; Ahora cada vuelta del bucle espera a que el temporizador de retardo (DT)
; llegue a 0 y lo vuelve a cargar con RITMO. DT baja 60 veces por segundo
; pase lo que pase, así que el fantasmita avanza 60 / RITMO = 20 píxeles
; por segundo tanto a 15 como a 1000 instrucciones por frame.
;
; Registros:
;   V0      temporal
;   V4, V5  posición del fantasmita (x, y)
;   V6, V7  posición nueva (x, y)

ARRIBA  EQU 5           ; W
IZQ     EQU 7           ; A
ABAJO   EQU 8           ; S
DER     EQU 9           ; D
RITMO   EQU 3           ; cuadros (1/60 s) por paso

inicio:
        CLS
        LD V4, 29
        LD V5, 13
        LD I, fantasma
        DRW V4, V5, 6

bucle:
        LD V0, DT       ; ¿ya pasaron RITMO cuadros desde el paso anterior?
        SE V0, 0
        JP bucle        ; todavía no: seguir esperando
        LD V0, RITMO
        LD DT, V0       ; el próximo paso, dentro de RITMO cuadros

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

        SE V6, V4
        JP mover
        SE V7, V5
        JP mover
        JP bucle

mover:
        DRW V4, V5, 6   ; borrar
        LD V4, V6
        LD V5, V7
        DRW V4, V5, 6   ; dibujar en la posición nueva
        JP bucle

fantasma:
        DB %01111000    ; .####.
        DB %11111100    ; ######
        DB %10110100    ; #.##.#
        DB %11111100    ; ######
        DB %11111100    ; ######
        DB %10101000    ; #.#.#.
