# ROMs de las Octojam en itch.io

Son los 68 juegos de las Octojam 6 a 10 (de 2019 a 2023) publicados en itch.io
que no están en el [archivo de John Earnest](../archivo/LEEME.md) (22 de CHIP-8, 10 de SUPER-CHIP, 36 de XO-CHIP),
bajados el 2026-11-07. Cada ROM sale de la versión jugable de la página del juego, que es una
exportación de Octo: trae los bytes ya armados y las opciones con que se juega (velocidad, quirks,
colores y giro).

Cada juego es de sus autores: itch.io no les pone una licencia común (a diferencia del archivo, que es
de dominio público), así que antes de repartir uno mirá lo que dice su página.

Cargalas en la consola con «Cargar ROM» o arrastrándolas. La consola las reconoce por su huella SHA-1 y
se configura sola con la plataforma, la velocidad (IPF), los quirks y los colores de su exportación. La
exportación no dice la plataforma (Octo acepta todas las instrucciones): sale del tamaño de la ROM, del
perfil de Octo (maxSize 3583 es SUPER-CHIP) y de las instrucciones que ejecuta en un minuto de juego.

Esta carpeta la arma `node tools/archive.js itch`: no la edites a mano.

| Jam | Año | Entradas | Ya en el archivo | Nuevas | Salteadas |
|---|---:|---:|---:|---:|---:|
| [Octojam 6](https://itch.io/jam/octojam-6) | 2019 | 11 | 4 | 6 | 1 |
| [Octojam 7](https://itch.io/jam/octojam-7) | 2020 | 26 | 6 | 20 | 0 |
| [Octojam 8](https://itch.io/jam/octojam-8) | 2021 | 22 | 3 | 18 | 1 |
| [Octojam 9](https://itch.io/jam/octojam-9) | 2022 | 14 (la página dice 24) | 1 | 13 | 0 |
| [Octojam 10](https://itch.io/jam/octojam-10) | 2023 | 13 | 1 | 11 | 1 |

La página de la Octojam 9 dice 24 entradas, pero su lista pública tiene 14: las demás no son públicas (las borraron o las ocultaron sus autores).

| Juego | Archivo | Plataforma | IPF | Autores | Evento |
|---|---|---|---:|---|---|
| [3D VIP'r maze](https://timendus.itch.io/3d-vipr-maze) | [`3d-vipr-maze.ch8`](3d-vipr-maze.ch8) | CHIP-8 | 30 | Timendus | Octojam 8 |
| [3D Viper Maze](https://timendus.itch.io/3d-viper-maze) | [`3d-viper-maze.ch8`](3d-viper-maze.ch8) | XO-CHIP | 500 | Timendus | Octojam 7 |
| [8min](https://atomr.itch.io/8min) | [`8min.ch8`](8min.ch8) | CHIP-8 | 100 | TomR | Octojam 7 |
| [Akahad](https://chromatophore.itch.io/akahad) | [`akahad.ch8`](akahad.ch8) | XO-CHIP | 1000 | Chromatophore | Octojam 8 |
| [AKIR8](https://atomr.itch.io/akir8) | [`akir8.ch8`](akir8.ch8) | XO-CHIP | 100 | TomR | Octojam 7 |
| [Angle of Death](https://chromatophore.itch.io/angle-of-death) | [`angle-of-death.ch8`](angle-of-death.ch8) | XO-CHIP | 500 | Chromatophore | Octojam 7 |
| [Bad Apple](https://timendus.itch.io/bad-apple) | [`bad-apple-timendus.ch8`](bad-apple-timendus.ch8) | XO-CHIP | 10000 | Timendus | Octojam 9 |
| [Bad Apple!!](https://koorogi.itch.io/bad-apple) | [`bad-apple-koorogi.ch8`](bad-apple-koorogi.ch8) | XO-CHIP | 10000 | koorogi | Octojam 9 |
| [Beware of Sn8k!](https://cratmang.itch.io/beware-of-sn8k) | [`beware-of-sn8k.ch8`](beware-of-sn8k.ch8) | XO-CHIP | 10000 | Cratmang | Octojam 9 |
| [BIM Logo Animation](https://sysl.itch.io/bim-logo-animation) | [`bim-logo-animation.ch8`](bim-logo-animation.ch8) | XO-CHIP | 500 | Sysl | Octojam 9 |
| [Blobo](https://voror.itch.io/blobo) | [`blobo.ch8`](blobo.ch8) | SUPER-CHIP | 100 | Voror | Octojam 9 |
| [Bustin](https://atomr.itch.io/bustin) | [`bustin.ch8`](bustin.ch8) | XO-CHIP | 7 | TomR | Octojam 6 |
| [C8SALT logo](https://ninjaweedle.itch.io/c8salt-logo) | [`c8salt-logo.ch8`](c8salt-logo.ch8) | SUPER-CHIP | 7 | NinjaWeedle | Octojam 9 |
| [CHIP-8 Calculator](https://hilariousppp.itch.io/rpncalc) | [`rpncalc.ch8`](rpncalc.ch8) | CHIP-8 | 100 | hilariousppp | Octojam 8 |
| [CHIP-8 Snake](https://kiedtl.itch.io/chip-8-snake) | [`chip-8-snake-kiedtl.ch8`](chip-8-snake-kiedtl.ch8) | XO-CHIP | 1000 | kiedtl | Octojam 8 |
| [CHIP-8 Snake](https://zyogram.itch.io/chip-8-snake) | [`chip-8-snake-zyogram.ch8`](chip-8-snake-zyogram.ch8) | CHIP-8 | 7 | zyogram | Octojam 7 |
| [Chipception OS](https://timendus.itch.io/chipception-os) | [`chipception-os.ch8`](chipception-os.ch8) | XO-CHIP | 10000 | Timendus | Octojam 10 |
| [Chipolarium](https://tvil.itch.io/chipolarium) | [`chipolarium.ch8`](chipolarium.ch8) | SUPER-CHIP | 30 | Tobias V. I. Langhoff | Octojam 8 |
| [Clostro](https://jibbl.itch.io/clostro) | [`clostro.ch8`](clostro.ch8) | SUPER-CHIP | 100 | jibbl | Octojam 7 |
| [Collision Course](https://ninjaweedle.itch.io/collision-course) | [`collision-course.ch8`](collision-course.ch8) | CHIP-8 | 200 | NinjaWeedle | Octojam 9 |
| [Computer Simulator](https://atomr.itch.io/computer-simulator) | [`computer-simulator.ch8`](computer-simulator.ch8) | XO-CHIP | 30 | TomR | Octojam 8 |
| [Cool 3D Spinning Octo](https://sysl.itch.io/cool-3d-spinning-octo) | [`cool-3d-spinning-octo.ch8`](cool-3d-spinning-octo.ch8) | XO-CHIP | 200 | Sysl | Octojam 8 |
| [D8GN](https://sysl.itch.io/d8gn) | [`d8gn.ch8`](d8gn.ch8) | XO-CHIP | 100 | Sysl | Octojam 7 |
| [Destroy The Line](https://atomr.itch.io/destroy-the-line) | [`destroy-the-line.ch8`](destroy-the-line.ch8) | SUPER-CHIP | 7 | TomR | Octojam 9 |
| [Dodge Catch Shoot](https://miratha.itch.io/dodge-catch-shoot) | [`dodge-catch-shoot.ch8`](dodge-catch-shoot.ch8) | CHIP-8 | 500 | miratha | Octojam 10 |
| [Duel Of The F8s](https://chromatophore.itch.io/duel-of-the-f8s) | [`duel-of-the-f8s.ch8`](duel-of-the-f8s.ch8) | XO-CHIP | 1000 | Chromatophore | Octojam 6 |
| [Duel Of The F8s: Special Edition](https://chromatophore.itch.io/duel-of-the-f8s-special-edition) | [`duel-of-the-f8s-special-edition.ch8`](duel-of-the-f8s-special-edition.ch8) | XO-CHIP | 10000 | Chromatophore | Octojam 10 |
| [Elite International Golf: Hyper Turbo](https://tobekko.itch.io/elite-international-golf-hyper-turbo) | [`elite-international-golf-hyper-turbo.ch8`](elite-international-golf-hyper-turbo.ch8) | CHIP-8 | 100 | Tobekko | Octojam 8 |
| [Elm8tal](https://sysl.itch.io/elm8tal) | [`elm8tal.ch8`](elm8tal.ch8) | XO-CHIP | 7 | Sysl | Octojam 8 |
| [Enter the mine](https://tquester.itch.io/enter-the-mine) | [`enter-the-mine.ch8`](enter-the-mine.ch8) | SUPER-CHIP | 100 | tquester | Octojam 10 |
| [F-Chip8 Racing](https://darklynx.itch.io/f-chip8-racing) | [`f-chip8-racing.ch8`](f-chip8-racing.ch8) | CHIP-8 | 20 | darklynx | Octojam 10 |
| [Falling Ghosts](https://veganjay.itch.io/falling-ghosts) | [`falling-ghosts.ch8`](falling-ghosts.ch8) | CHIP-8 | 100 | veganjay | Octojam 9 |
| [Fest](https://juniboco.itch.io/fest) | [`fest.ch8`](fest.ch8) | XO-CHIP | 100 | Juniboco | Octojam 7 |
| [FLIP-8: Think-a-Dot for CHIP-8](https://tvil.itch.io/flip-8) | [`flip-8.ch8`](flip-8.ch8) | CHIP-8 | 20 | Tobias V. I. Langhoff | Octojam 7 |
| [Frog](https://atomr.itch.io/frog) | [`frog.ch8`](frog.ch8) | XO-CHIP | 100 | TomR | Octojam 8 |
| [Golf](https://buffi.itch.io/golf) | [`golf.ch8`](golf.ch8) | CHIP-8 | 10000 | buffi | Octojam 6 |
| [H8 2: Carry Flag](https://chromatophore.itch.io/h8-2-carry-flag) | [`h8-2-carry-flag.ch8`](h8-2-carry-flag.ch8) | XO-CHIP | 10000 | Chromatophore | Octojam 9 |
| [Halloween-Blaster](https://tquester.itch.io/halloween-blaster) | [`halloween-blaster.ch8`](halloween-blaster.ch8) | SUPER-CHIP | 100 | tquester | Octojam 10 |
| [infinibr8kr](https://hailthefish.itch.io/infinibr8kr) | [`infinibr8kr.ch8`](infinibr8kr.ch8) | XO-CHIP | 100 | HailTheFish | Octojam 7 |
| [Invisible Man](https://mremerson.itch.io/invisible-man) | [`invisible-man.ch8`](invisible-man.ch8) | CHIP-8 | 7 | MrEmerson | Octojam 7 |
| [Kanji Calculator (WIP)](https://cratmang.itch.io/kanji-calculator) | [`kanji-calculator.ch8`](kanji-calculator.ch8) | XO-CHIP | 200 | Cratmang | Octojam 10 |
| [Labyrinthine](https://schnert.itch.io/labyrinthine) | [`labyrinthine.ch8`](labyrinthine.ch8) | CHIP-8 | 20 | TempVar Studios | Octojam 7 |
| [Lady Runner](https://noodulz.itch.io/lady-runner) | [`lady-runner.ch8`](lady-runner.ch8) | XO-CHIP | 20 | noodulz | Octojam 7 |
| [m8ze](https://zalinius.itch.io/m8ze) | [`m8ze.ch8`](m8ze.ch8) | CHIP-8 | 100 | Zalinius | Octojam 8 |
| [Man Hang](https://atomr.itch.io/man-hang) | [`man-hang.ch8`](man-hang.ch8) | CHIP-8 | 15 | TomR | Octojam 10 |
| [No internet](https://pushfoo.itch.io/no-internet) | [`no-internet.ch8`](no-internet.ch8) | XO-CHIP | 500 | pushfoo | Octojam 7 |
| [Octo Lander](https://privatebutts.itch.io/octo-lander) | [`octo-lander.ch8`](octo-lander.ch8) | CHIP-8 | 20 | Private Butts | Octojam 7 |
| [Octo Space Program](https://badcloudgames.itch.io/octo-space-program) | [`octo-space-program.ch8`](octo-space-program.ch8) | XO-CHIP | 200 | badcloudgames | Octojam 7 |
| [Octoamp](https://sysl.itch.io/octoamp) | [`octoamp.ch8`](octoamp.ch8) | XO-CHIP | 500 | Sysl | Octojam 8 |
| [Octogon Trail](https://tarsi.itch.io/octogon-trail) | [`octogon-trail.ch8`](octogon-trail.ch8) | XO-CHIP | 500 | tarsi | Octojam 9 |
| [Octojam 10 Entry - Fencing](https://estus-dev.itch.io/fencing) | [`fencing.ch8`](fencing.ch8) | CHIP-8 | 20 | Estus Dev | Octojam 10 |
| [Octris](https://zunil.itch.io/octris) | [`octris.ch8`](octris.ch8) | CHIP-8 | 100 | sunil. | Octojam 9 |
| [Only the Good Die Neil Young](https://cishetkayfaber.itch.io/only-the-good-die-neil-young) | [`only-the-good-die-neil-young.ch8`](only-the-good-die-neil-young.ch8) | CHIP-8 | 10000 | cishetkayfaber | Octojam 7 |
| [Patrick’s CHIP-8 Challenge](https://tvil.itch.io/patrick-chip8) | [`patrick-chip8.ch8`](patrick-chip8.ch8) | CHIP-8 | 15 | Tobias V. I. Langhoff | Octojam 6 |
| [Pizza Topping Panic!](https://atomr.itch.io/pizza-topping-panic) | [`pizza-topping-panic.ch8`](pizza-topping-panic.ch8) | XO-CHIP | 7 | TomR | Octojam 6 |
| [RPN Calculator](https://tquester.itch.io/upn-calculator) | [`upn-calculator.ch8`](upn-calculator.ch8) | SUPER-CHIP | 200 | tquester | Octojam 10 |
| [Safecracker](https://pushfoo.itch.io/safecracker) | [`safecracker.ch8`](safecracker.ch8) | XO-CHIP | 500 | pushfoo | Octojam 8 |
| [Sand](https://atomr.itch.io/sand) | [`sand.ch8`](sand.ch8) | XO-CHIP | 15 | TomR | Octojam 8 |
| [Skellespresso](https://juniboco.itch.io/skellespresso) | [`skellespresso.ch8`](skellespresso.ch8) | XO-CHIP | 500 | Juniboco | Octojam 8 |
| [SneakSurround](https://tomswan.itch.io/sneaksurround) | [`sneaksurround.ch8`](sneaksurround.ch8) | CHIP-8 | 20 | TomSwan | Octojam 7 |
| [Tapeworm](https://tarsi.itch.io/tapeworm) | [`tapeworm.ch8`](tapeworm.ch8) | XO-CHIP | 100 | tarsi | Octojam 8 |
| [Termlib demo](https://pushfoo.itch.io/termlib-demo) | [`termlib-demo.ch8`](termlib-demo.ch8) | XO-CHIP | 100 | pushfoo | Octojam 10 |
| [The Rude Street - Chip8/Octo Jam](https://sysl.itch.io/the-rude-street-chip8octo-jam) | [`the-rude-street-chip8octo-jam.ch8`](the-rude-street-chip8octo-jam.ch8) | SUPER-CHIP | 500 | Sysl | Octojam 6 |
| [Turm8](https://tvil.itch.io/turm8) | [`turm8.ch8`](turm8.ch8) | SUPER-CHIP | 10000 | Tobias V. I. Langhoff | Octojam 7 |
| [WAVE Emulator Logo](https://aart1256.itch.io/wave-emulator-logo) | [`wave-emulator-logo.ch8`](wave-emulator-logo.ch8) | XO-CHIP | 500 | AArt1256 | Octojam 8 |
| [Worm](https://rstein.itch.io/worm) | [`worm.ch8`](worm.ch8) | CHIP-8 | 500 | rstein | Octojam 7 |
| [XO-NYANCAT!!](https://kouzeru.itch.io/xo-nyancat) | [`xo-nyancat.ch8`](xo-nyancat.ch8) | XO-CHIP | 10000 | Kouzerumatsukite | Octojam 9 |
| [XO-TRACKER DEMO](https://kouzeru.itch.io/xo-tracker-demo) | [`xo-tracker-demo.ch8`](xo-tracker-demo.ch8) | XO-CHIP | 6400 | Kouzerumatsukite | Octojam 8 |

## Los que ya estaban en el archivo

La consola ya los traía: tienen la misma ROM que uno del archivo o son el mismo juego (de la misma jam y con el
mismo título) en otra versión. Estos no se suman, para no tener dos veces el mismo juego.

| Juego | Evento | En el archivo | Por qué |
|---|---|---|---|
| [An Evening to Die For](https://internet-janitor.itch.io/an-evening-to-die-for) | Octojam 6 | [`anEveningToDieFor.ch8`](../archivo/anEveningToDieFor.ch8) | otra versión de la ROM (72 bytes distintos) |
| [Applejak](https://internet-janitor.itch.io/applejak) | Octojam 7 | [`applejak.ch8`](../archivo/applejak.ch8) | la misma ROM (la misma huella SHA-1) |
| [Bulb.](https://internet-janitor.itch.io/bulb) | Octojam 7 | [`bulb.ch8`](../archivo/bulb.ch8) | la misma ROM (la misma huella SHA-1) |
| [Chicken Scratch](https://internet-janitor.itch.io/chicken-scratch) | Octojam 7 | [`chickenScratch.ch8`](../archivo/chickenScratch.ch8) | otra versión de la ROM (2 bytes distintos) |
| [Flutter By](https://atomr.itch.io/flutter-by) | Octojam 6 | [`flutterby.ch8`](../archivo/flutterby.ch8) | otra versión de la ROM (40 bytes distintos) |
| [Knumber Knower](https://internet-janitor.itch.io/knumber-knower) | Octojam 10 | [`knumberknower.ch8`](../archivo/knumberknower.ch8) | la misma ROM (la misma huella SHA-1) |
| [Mini Lights Out](https://tvil.itch.io/mini-lights-out) | Octojam 6 | [`mini-lights-out.ch8`](../archivo/mini-lights-out.ch8) | la misma ROM (la misma huella SHA-1) |
| [Octo Party Mix!](https://cratmang.itch.io/octo-party-mix) | Octojam 7 | [`OctoPartyMix.ch8`](../archivo/OctoPartyMix.ch8) | la misma ROM (la misma huella SHA-1) |
| [Octojam 6 Greeting](https://internet-janitor.itch.io/octojam-6-greeting) | Octojam 6 | [`octojam6title.ch8`](../archivo/octojam6title.ch8) | su exportación de Octo trae solo el fuente, sin la ROM armada, pero es la misma pantalla |
| [Octoma](https://cratmang.itch.io/octoma) | Octojam 8 | [`octoma.ch8`](../archivo/octoma.ch8) | la misma ROM (la misma huella SHA-1) |
| [Spock Paper Scissors](https://f0ntz.itch.io/spock-paper-scissors) | Octojam 7 | [`spockpaperscissors.ch8`](../archivo/spockpaperscissors.ch8) | la misma ROM (la misma huella SHA-1) |
| [Squad](https://internet-janitor.itch.io/squad) | Octojam 7 | [`squad.ch8`](../archivo/squad.ch8) | la misma ROM (la misma huella SHA-1) |
| [Super Octogon](https://internet-janitor.itch.io/super-octogon) | Octojam 8 | [`octogon.ch8`](../archivo/octogon.ch8) | la misma ROM (la misma huella SHA-1) |
| [Super Pong](https://offstatic.itch.io/superpong) | Octojam 8 | [`superpong.ch8`](../archivo/superpong.ch8) | la misma ROM (la misma huella SHA-1) |
| [WDL](https://internet-janitor.itch.io/wdl) | Octojam 9 | [`wdl.ch8`](../archivo/wdl.ch8) | la misma ROM (la misma huella SHA-1) |

## Los que no se sumaron

| Juego | Autores | Evento | Motivo |
|---|---|---|---|
| [Alien Inv8sion](https://timendus.itch.io/alien-inv8sion) | Timendus | Octojam 8 | su versión jugable no es una exportación de Octo (es Silicon8) |
| [Dump Trump](https://mwales.itch.io/dump-trump) | mwales | Octojam 6 | no tiene versión jugable en la página |
| [Octogon Trail](https://tarsi.itch.io/octogon-trail) | tarsi | Octojam 10 | es la misma página que su entrada de la Octojam 9 |
