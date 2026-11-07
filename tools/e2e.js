#!/usr/bin/env node
'use strict';
/*
 * Pruebas de punta a punta (E2E) de chip8.html en un navegador de verdad.
 *
 * Qué hace:
 *   - Levanta un servidor estático propio (dentro de este mismo proceso, en un
 *     puerto libre que elige el sistema) que sirve la carpeta del repositorio.
 *   - Abre Chrome sin ventana (headless) con un perfil temporal y el puerto de
 *     depuración remota, y le habla por el Chrome DevTools Protocol usando el
 *     WebSocket global de Node 22. No usa ninguna dependencia.
 *   - Corre escenarios con eventos de entrada reales (teclado, mouse, toques,
 *     selector de archivos y arrastrar y soltar) y con tiempo real: deja correr
 *     requestAnimationFrame y espera con temporizadores de verdad.
 *   - Imprime un informe PASA / FALLA por escenario, guarda capturas de pantalla
 *     y termina con código 1 si algo falló.
 *   - Las ROMs de prueba se arman con el ensamblador del repositorio
 *     (tools/chip8asm.js); los archivos se cargan con «Cargar ROM» (el diálogo de
 *     archivos se intercepta) y las descargas de la captura van a la carpeta
 *     temporal del navegador.
 *   - Al terminar (bien, mal o con Ctrl+C) cierra el navegador y borra el perfil
 *     temporal (con las ROMs de prueba y las descargas).
 *
 * Uso:
 *   node tools/e2e.js [opciones]          (o: npm run e2e -- [opciones])
 *
 * Opciones:
 *   --browser <ruta>   Ejecutable de Chrome o Edge. Por defecto busca Chrome en
 *                      las rutas habituales de Windows y, si no está, Edge.
 *                      También se puede indicar con la variable CHIP8_BROWSER.
 *   --shots <carpeta>  Dónde guardar las capturas (PNG). Por defecto, la carpeta
 *                      "chip8-e2e-shots" dentro del directorio temporal del
 *                      sistema (o la que indique la variable CHIP8_E2E_SHOTS).
 *   --only <lista>     Corre solo algunos escenarios, por número: --only 2,5,12
 *   --headed           Muestra la ventana del navegador (para mirar o depurar).
 *   --verbose          Muestra los mensajes de la consola de la página.
 *   --help             Muestra esta ayuda.
 *
 * Escenarios (todos con entrada real: teclas, clics, toques, archivos y arrastre):
 *    1 carga sin errores por http y por file://, sin 404 del ícono
 *    2 velocidad real: ~60 frames/s con IPF 15 y 1000 (también sin dibujo)
 *    3 teclado físico: las 16 teclas con el demo Teclado
 *    4 keypad en pantalla: mouse, arrastrar afuera y dos dedos a la vez
 *    5 atajos (Espacio, N, Retroceso, H, Esc) y el modelo de foco: un clic no deja el foco en
 *      el botón; con el foco puesto desde el teclado, Espacio activa el control
 *    6 carga de ROMs: selector de archivos, ROM vacía o grande (el aviso no tapa nada) y arrastre
 *    7 cada cartucho del estante carga y corre 3 s
 *    8 Atrapa: A y D mueven la paleta
 *    9 Autotest con cada perfil: 19 comprobaciones y 0 fallas
 *   10 interruptores de quirks, perfiles, ajustes guardados y localStorage roto
 *   11 controles de velocidad: deslizador, campo numérico y botones
 *   12 sonido: gesto para habilitarlo, silencio y pausa
 *   13 monitor: Paso, desensamblado, registros, pila, Frame y ocultar
 *   14 error de ejecución con la máquina corriendo: CRT, monitor, un solo anuncio y Reiniciar
 *   15 diseño adaptable de 360 a 1440 px y nitidez con escala 1,25 y 2
 *   16 prefers-reduced-motion apaga parpadeos y animaciones
 *   17 pestaña congelada u oculta: al volver no se pone al día de golpe
 *   18 modo de pantalla: Tubo CRT y Píxeles puros (dos colores exactos, sin efectos, interruptores
 *      deshabilitados), se conserva al recargar y se cambia con las flechas
 *   19 selector rápido de cartuchos bajo la ranura, a 1440×900 y sin scrollear
 *   20 selectores de perfil y paleta: después de elegir, las teclas van al CHIP-8; N, H y
 *      Retroceso funcionan; con Tab y flechas cambian de forma nativa
 *   21 keypad con el teclado: Tab hasta una tecla, Enter breve (~120 ms) y Espacio sostenido; FX0A
 *   22 error con la máquina en pausa (Reiniciar deja 0x200 en pausa) o corriendo (vuelve a correr)
 *   23 ícono de la pestaña embebido: ningún pedido da 404 por http
 *   24 pantalla angosta (360×640 y 375×667): la pantalla y el keypad entero en la primera vista
 *   25 plataformas: cada perfil elegido con el mouse trae su plataforma (selector, placa y fila MÁQUINA
 *      del monitor), la plataforma sola no toca los quirks, y una ROM de XO-CHIP en 128×64 se ve en
 *      Píxeles puros con exactamente los cuatro colores de la paleta, cada píxel en su lugar
 *   26 una ROM de 4000 bytes pasa sola a XO-CHIP; elegir una plataforma de 4 KB (o el perfil COSMAC
 *      VIP) se rechaza con un aviso y el selector vuelve
 *   27 diagnóstico: instrucción ignorada (aviso, uno por ROM, y «Usar SUPER-CHIP»); error de plataforma
 *      con «Cambiar a XO-CHIP y reiniciar» en el CRT y en el monitor (a 1280×900 el botón del monitor se
 *      puede llevar a la vista); 00FD: «FIN DEL PROGRAMA», LED ámbar y Reiniciar
 *   28 colores: «Personalizada» cambia en vivo y se conserva al recargar; «Del cartucho» aparece con un
 *      juego del archivo y, al cargar otra ROM, se va y vuelve tu paleta
 *   29 autoconfiguración (entrada del archivo de Octo registrada para la prueba): plataforma, quirks,
 *      IPF, colores y giro de 270° aplicados antes del primer frame, con su aviso y la línea de la
 *      ranura; con el interruptor apagado, nada; un cambio tuyo se recuerda y «Olvidar ajustes» (aviso)
 *      vuelve a los del archivo
 *   30 ajustes recordados: ROM con «Cargar ROM», cambios con el mouse, recarga, la misma ROM otra vez
 *      (aviso, ranura y valores) y «Olvidar ajustes» de la ranura
 *   31 banderas RPL: lo que guarda FX75 sobrevive a una recarga y FX85 lo lee
 *   32 biblioteca: «Tus cartuchos» y «Tuyos:», cargar desde los dos, recarga, quitar y «Deshacer»; con
 *      el almacenamiento roto, todo anda en memoria
 *   33 Planos (XO-CHIP) desde el estante: 60 fps, valores de píxel 1 a 3, patrón de sonido y W frena el rombo
 *   34 avance rápido: T sostenida y el botón del bisel dan ×4 instrucciones y ticks de los timers; al
 *      soltar, vuelve a 60 por segundo sin ponerse al día
 *   35 captura: G y el botón de la cámara bajan el PNG (nombre con la fecha, mismos bytes que
 *      screenshot(), colores exactos de la paleta); en 128×64, los cuatro colores
 *   36 pantalla completa: el botón del bisel, P y Esc entran y salen, con escala entera
 *   37 joystick de mentira (Gamepad API): la cruz, la palanca, A y B, Start pausa y desconectarlo
 *   38 flechas y «Controles»: Octo, VIP y personalizado (con el mouse); los controles con foco se
 *      quedan con sus flechas; el mapa de cada cartucho se recuerda al recargar
 *   39 curvatura (apagarla deja el tubo idéntico, píxel por píxel) y encendido animado (al cargar; no
 *      con prefers-reduced-motion ni con el interruptor apagado)
 *   40 diseño con la biblioteca llena y «Controles» personalizados a la vista: 1440, 768 y 360 px
 *   41 estados: I guarda en la ranura rápida y U vuelve exactamente a ese momento (pc, registros, pantalla,
 *      memoria); en pausa sigue en pausa con ese frame en la pantalla y el monitor, corriendo sigue corriendo
 *   42 ranuras 1 a 4 con el mouse: Guardar, la pantallita (el display del estado con la paleta, escala entera,
 *      también al cambiar de paleta), la fecha, Cargar en pausa, y Borrar con «Deshacer»
 *   43 los estados sobreviven a una recarga y son de su cartucho (otra ROM no los ve): «hace 5 min», «ayer
 *      18:20», U después de recargar y el formato de localStorage['chip8-consola.estados']
 *   44 un estado de XO-CHIP cargado con la plataforma en CHIP-8 pasa a XO-CHIP (selector, placa, monitor y
 *      pantalla de cuatro colores) sin tocar tus ajustes ni los del cartucho; un estado guardado con la máquina
 *      detenida (error de plataforma) o terminada (00FD) vuelve con su mensaje, su botón y su LED
 *   45 rebobinado con B sostenida, con el botón ⏪ (mouse y dedo) y con B y T: vuelve a frames exactos ya
 *      vistos, al doble (u ocho veces) de la velocidad, sin sonido y con «⏪»; al soltar, sigue igual que antes
 *   46 rebobinado en pausa: un toque de B vuelve un frame (Frame avanza uno), sostenida sigue, Espacio sobre
 *      el botón ⏪ enfocado también rebobina, y queda en pausa; detenida por un error, vuelve a antes del
 *      error y queda en pausa (con Frame se llega otra vez al error)
 *   47 el interruptor «Rebobinado» apagado: B y ⏪ no hacen nada, sin fotos; se recuerda al recargar
 *   48 estados sin almacenamiento (en memoria, un aviso), sin lugar (QuotaExceededError real: el aviso de qué
 *      borrar y sigue andando), dañados («DAÑADO» y el error al cargar) y sin cartucho (la explicación)
 *   49 diseño con «Estados» a la vista: 1440, 768 y 360 px (pantallitas con escala entera, botones enteros)
 *   50 rebobinado a 60 fps con XO-CHIP a 1000 IPF: Planos y una ROM que reescribe la memoria de 64 KB
 *   51 Taller: se abre al costado sin tapar la pantalla (1440×900), trae los ejemplos y los fuentes de los
 *      cartuchos; Ctrl+Enter ensambla y corre (no va a «Tus cartuchos»; workshopSymbols()); Y y Esc
 *   52 Taller: los errores en el margen de su renglón, la lista, el cursor en el primero, la revisión sola
 *      mientras se corrigen y el margen alineado con el texto (rueda del mouse, un error en el renglón 600)
 *   53 Taller: «sin guardar» aunque recargues, Guardar, «Restaurar el original» y Borrar (con «Deshacer»),
 *      Nuevo, Tab, Mayús+Tab y Ctrl+Z, el nombre (Esc deshace lo escrito) y el formato de
 *      localStorage['chip8-consola.taller']
 *   54 Taller: «Abrir .asm» con @platform xochip corre en XO-CHIP; Plataforma escribe la etiqueta (una que no
 *      vale es un error en su renglón); «Descargar .asm» y «Descargar .ch8» exactos
 *   55 Taller sin almacenamiento, sin lugar (QuotaExceededError real) y con datos dañados
 *   56 diseño con el Taller abierto: 1440 y 1280 px al costado, 768 y 360 px debajo (a 360, con un toque)
 *   57 Taller con el teclado y para lectores de pantalla (roles, nombres, Tab, Esc, foco, Plataforma con las
 *      flechas, Y desde la pantalla completa) y a 60 fps con 10.000 IPF mientras se escribe
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'chip8.html');
// Las ROMs de prueba de los escenarios nuevos se arman con el ensamblador del repositorio.
const { assemble } = require(path.join(ROOT, 'tools', 'chip8asm.js'));

// ---------------------------------------------------------------- utilidades
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tiempo agotado (${ms} ms): ${what}`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function parseArgs(argv) {
  const opts = { browser: process.env.CHIP8_BROWSER || '', shots: process.env.CHIP8_E2E_SHOTS || '', only: null, headed: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${a}`);
      return argv[++i];
    };
    if (a === '--browser') opts.browser = next();
    else if (a.startsWith('--browser=')) opts.browser = a.slice(10);
    else if (a === '--shots') opts.shots = next();
    else if (a.startsWith('--shots=')) opts.shots = a.slice(8);
    else if (a === '--only') opts.only = next();
    else if (a.startsWith('--only=')) opts.only = a.slice(7);
    else if (a === '--headed') opts.headed = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  if (opts.only) {
    opts.only = new Set(String(opts.only).split(',').map((s) => Number(s.trim())).filter((n) => n > 0));
  }
  if (!opts.shots) opts.shots = path.join(os.tmpdir(), 'chip8-e2e-shots');
  opts.shots = path.resolve(opts.shots);
  return opts;
}

function findBrowser(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`No existe el navegador indicado: ${explicit}`);
    return explicit;
  }
  const env = process.env;
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = env.PROGRAMFILES || 'C:\\Program Files';
    const pf86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const local = env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  throw new Error('No encontré Chrome ni Edge. Indicá la ruta con --browser <ruta>.');
}

// ---------------------------------------------------------------- servidor estático
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.asm': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ch8': 'application/octet-stream',
};

function startServer() {
  // Cada pedido queda anotado (ruta y código de respuesta) en server.requests: el escenario 23
  // revisa que la página no pida nada que no exista (por ejemplo, /favicon.ico).
  const requests = [];
  const server = http.createServer((req, res) => {
    const entry = { url: req.url, status: 0, at: Date.now() };
    requests.push(entry);
    if (requests.length > 2000) requests.shift();
    res.on('finish', () => { entry.status = res.statusCode; });
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400);
      return res.end('Solicitud inválida');
    }
    if (urlPath === '/') urlPath = '/chip8.html';
    if (urlPath === '/__vacio') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('<!doctype html><title>vacío</title>');
    }
    const file = path.join(ROOT, path.normalize(urlPath));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end('Prohibido');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('No encontrado');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  server.requests = requests;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------- navegador
class Browser {
  constructor(exe, opts) {
    this.exe = exe;
    this.opts = opts;
    this.proc = null;
    this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chip8-e2e-'));
    this.profile = path.join(this.tmp, 'perfil');
    this.fixtures = path.join(this.tmp, 'roms');
    fs.mkdirSync(this.profile);
    fs.mkdirSync(this.fixtures);
    this.exited = false;
    this.stderr = '';
  }

  async launch() {
    const args = [
      this.opts.headed ? null : '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profile}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--disable-crash-reporter', '--disable-breakpad', '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--mute-audio', '--window-size=1280,900', '--hide-scrollbars=false',
      'about:blank',
    ].filter(Boolean);
    this.proc = spawn(this.exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    this.proc.on('exit', () => { this.exited = true; });
    this.proc.on('error', (e) => { this.stderr += String(e); this.exited = true; });
    this.proc.stderr.on('data', (d) => { if (this.stderr.length < 20000) this.stderr += d; });

    // Chrome escribe el puerto elegido en <perfil>/DevToolsActivePort. Edge a veces se relanza
    // a sí mismo (el proceso que abrimos termina y sigue otro con el mismo perfil), así que un
    // proceso terminado no es un error mientras el archivo todavía pueda aparecer.
    const portFile = path.join(this.profile, 'DevToolsActivePort');
    const deadline = Date.now() + 30000;
    let wsUrl = null;
    let exitedAt = 0;
    while (Date.now() < deadline) {
      if (this.exited && !exitedAt) exitedAt = Date.now();
      if (exitedAt && Date.now() - exitedAt > 8000 && !this.profileProcesses().length) {
        throw new Error('El navegador se cerró al arrancar.\n' + this.stderr.slice(-2000));
      }
      try {
        const lines = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
        if (lines[0] && lines[1]) { wsUrl = `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}`; break; }
      } catch { /* todavía no existe */ }
      await sleep(100);
    }
    if (!wsUrl) throw new Error('El navegador no publicó el puerto de DevTools en 30 s.\n' + this.stderr.slice(-2000));
    this.cdp = await CDP.connect(wsUrl);
    const v = await this.cdp.send('Browser.getVersion');
    this.version = v.product;
  }

  get alive() { return !!(this.cdp && !this.cdp.closed); }

  // Procesos del navegador que usan nuestro perfil temporal (en Windows, por su línea de comandos).
  profileProcesses() {
    if (process.platform !== 'win32') return this.proc && !this.exited ? [this.proc.pid] : [];
    const tag = path.basename(this.tmp).replace(/[^A-Za-z0-9_-]/g, '');
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${tag}*' -and $_.ProcessId -ne $PID } | ForEach-Object { $_.ProcessId }`],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    return String(ps.stdout || '').split(/\s+/).filter(Boolean).map(Number);
  }

  async close() {
    try {
      if (this.alive) await withTimeout(this.cdp.send('Browser.close', {}, null, 5000).catch(() => {}), 6000, 'Browser.close');
    } catch { /* se fuerza abajo */ }
    try { if (this.cdp) this.cdp.close(); } catch { /* nada */ }
    const t0 = Date.now();
    while (this.proc && !this.exited && Date.now() - t0 < 5000) await sleep(100);
    if (this.proc && !this.exited) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else try { this.proc.kill('SIGKILL'); } catch { /* ya terminó */ }
      const t1 = Date.now();
      while (!this.exited && Date.now() - t1 < 5000) await sleep(100);
    }
    // Lo que haya quedado con nuestro perfil (por ejemplo, el Edge relanzado) se cierra a la fuerza.
    for (let i = 0; i < 3; i++) {
      const left = this.profileProcesses();
      if (!left.length) break;
      for (const pid of left) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else try { process.kill(pid, 'SIGKILL'); } catch { /* ya terminó */ }
      }
      await sleep(500);
    }
    this.removeTemp();
  }

  removeTemp() {
    for (let i = 0; i < 20; i++) {
      try {
        fs.rmSync(this.tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        if (!fs.existsSync(this.tmp)) return true;
      } catch { /* archivos todavía bloqueados en Windows */ }
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']);
    }
    return !fs.existsSync(this.tmp);
  }
}

// ---------------------------------------------------------------- cliente CDP
class CDP {
  static connect(url) {
    return withTimeout(new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)), { once: true });
      ws.addEventListener('error', (e) => reject(new Error('No se pudo conectar a DevTools: ' + (e.message || e.type))), { once: true });
    }), 15000, 'conexión WebSocket con DevTools');
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8')); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}${msg.error.data ? ' (' + msg.error.data + ')' : ''}`));
        else p.resolve(msg.result || {});
      } else if (msg.method) {
        for (const fn of this.listeners) { try { fn(msg); } catch { /* un oyente roto no corta el resto */ } }
      }
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error('Se cerró la conexión con el navegador'));
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = null, timeout = 20000) {
    if (this.closed) return Promise.reject(new Error('Conexión con el navegador cerrada'));
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    this.ws.send(JSON.stringify(msg));
    return withTimeout(p, timeout, method).finally(() => this.pending.delete(id));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  waitEvent(method, sessionId, timeout, pred = () => true) {
    let off;
    const p = new Promise((resolve) => {
      off = this.on((m) => { if (m.method === method && (!sessionId || m.sessionId === sessionId) && pred(m.params)) resolve(m.params); });
    });
    return withTimeout(p, timeout, `evento ${method}`).finally(() => off());
  }

  close() { try { this.ws.close(); } catch { /* nada */ } }
}

// ---------------------------------------------------------------- teclas
const KEYS = {};
for (let d = 0; d <= 9; d++) KEYS['Digit' + d] = { key: String(d), vk: 48 + d, text: String(d) };
for (let c = 65; c <= 90; c++) { const ch = String.fromCharCode(c); KEYS['Key' + ch] = { key: ch.toLowerCase(), vk: c, text: ch.toLowerCase() }; }
Object.assign(KEYS, {
  Space: { key: ' ', vk: 32, text: ' ' },
  Enter: { key: 'Enter', vk: 13, text: '\r' },
  Backspace: { key: 'Backspace', vk: 8 },
  Escape: { key: 'Escape', vk: 27 },
  Tab: { key: 'Tab', vk: 9 },
  Home: { key: 'Home', vk: 36 },
  End: { key: 'End', vk: 35 },
  ArrowLeft: { key: 'ArrowLeft', vk: 37 },
  ArrowUp: { key: 'ArrowUp', vk: 38 },
  ArrowRight: { key: 'ArrowRight', vk: 39 },
  ArrowDown: { key: 'ArrowDown', vk: 40 },
});

// ---------------------------------------------------------------- página
class Page {
  constructor(ctx, targetId, sessionId) {
    this.ctx = ctx;
    this.cdp = ctx.browser.cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.errors = [];
    this.favicon = [];
    this.off = this.cdp.on((m) => {
      if (m.sessionId !== this.sessionId) return;
      const p = m.params;
      if (m.method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails || {};
        this.errors.push('Excepción no capturada: ' + ((d.exception && d.exception.description) || d.text || '?') + (d.url ? ` (${d.url}:${d.lineNumber + 1})` : ''));
      } else if (m.method === 'Runtime.consoleAPICalled') {
        const text = (p.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
        if (p.type === 'error' || p.type === 'assert') this.errors.push(`console.${p.type}: ${text}`);
        if (ctx.opts.verbose) console.log(`      [consola ${p.type}] ${text}`);
      } else if (m.method === 'Log.entryAdded') {
        const e = p.entry;
        if (e.level === 'error') {
          const text = `Log (${e.source}): ${e.text}${e.url ? ' ' + e.url : ''}`;
          // El 404 de /favicon.ico se informa aparte (escenario 1) para no tapar el resto.
          if (/\/favicon\.ico$/.test(e.url || '')) this.favicon.push(text); else this.errors.push(text);
        }
        if (ctx.opts.verbose) console.log(`      [log ${e.level}] ${e.text}`);
      }
    });
  }

  static async open(ctx, { width = 1280, height = 900, dpr = 1, mobile = false, initScripts = [], media = null } = {}) {
    const cdp = ctx.browser.cdp;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(ctx, targetId, sessionId);
    ctx.pages.add(page);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('DOM.enable');
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.setViewport(width, height, dpr, mobile);
    if (media) await page.send('Emulation.setEmulatedMedia', { features: media });
    for (const src of initScripts) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    return page;
  }

  send(method, params = {}, timeout) { return this.cdp.send(method, params, this.sessionId, timeout); }

  async setViewport(width, height, dpr = 1, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    this.viewport = { width, height, dpr, mobile };
  }

  async goto(url, { waitApp = true } = {}) {
    const loaded = this.cdp.waitEvent('Page.loadEventFired', this.sessionId, 20000);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`No se pudo abrir ${url}: ${r.errorText}`);
    await loaded;
    if (waitApp) await this.waitFor('!!(window.chip8 && window.chip8.cpu)', { timeout: 10000, desc: 'window.chip8 disponible' });
  }

  async reload() {
    const loaded = this.cdp.waitEvent('Page.loadEventFired', this.sessionId, 20000);
    await this.send('Page.reload', { ignoreCache: true });
    await loaded;
    await this.waitFor('!!(window.chip8 && window.chip8.cpu)', { timeout: 10000, desc: 'window.chip8 después de recargar' });
  }

  async ev(expression, timeout = 15000) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('Error al evaluar en la página: ' + ((d.exception && d.exception.description) || d.text) + '\n  en: ' + expression.slice(0, 200));
    }
    return r.result ? r.result.value : undefined;
  }

  async waitFor(expression, { timeout = 5000, interval = 40, desc = expression } = {}) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeout) {
      last = await this.ev(expression);
      if (last) return last;
      await sleep(interval);
    }
    throw new Error(`No se cumplió a tiempo (${timeout} ms): ${desc}`);
  }

  // Espera sin tirar error: devuelve el valor (o false si no se cumplió).
  async poll(expression, timeout = 3000, interval = 30) {
    const t0 = Date.now();
    let last;
    do {
      last = await this.ev(expression);
      if (last) return last;
      await sleep(interval);
    } while (Date.now() - t0 < timeout);
    return last;
  }

  async rect(selector, scroll = true) {
    const r = await this.ev(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      ${scroll ? "el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });" : ''}
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
    })()`);
    if (!r) throw new Error(`No existe el elemento ${selector}`);
    return r;
  }

  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse', ...extra });
  }

  async clickAt(x, y) {
    await this.mouse('mouseMoved', x, y);
    await this.mouse('mousePressed', x, y);
    await this.mouse('mouseReleased', x, y);
  }

  async click(selector) {
    const r = await this.rect(selector);
    await this.clickAt(r.cx, r.cy);
    return r;
  }

  async keyDown(code, { repeat = false } = {}) {
    const k = KEYS[code];
    if (!k) throw new Error('Tecla sin definir: ' + code);
    await this.send('Input.dispatchKeyEvent', {
      type: k.text ? 'keyDown' : 'rawKeyDown', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      text: k.text, unmodifiedText: k.text, autoRepeat: repeat,
    });
  }

  async keyUp(code) {
    const k = KEYS[code];
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
  }

  async press(code, hold = 30) {
    await this.keyDown(code);
    if (hold) await sleep(hold);
    await this.keyUp(code);
  }

  async type(text) {
    for (const ch of text) {
      const code = /[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch.toUpperCase();
      await this.press(code, 10);
    }
  }

  async setFiles(selector, files) {
    const r = await this.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` });
    if (!r.result || !r.result.objectId) throw new Error('No encontré ' + selector);
    await this.send('DOM.setFileInputFiles', { files, objectId: r.result.objectId });
  }

  async shot(name, { fullPage = false } = {}) {
    // El encendido animado (≈0,7 s después de cargar la página) es una capa encima de la pantalla:
    // la captura espera a que termine, así muestra la consola como queda.
    await this.poll("!document.getElementById('crt-power') || document.getElementById('crt-power').hidden", 1500).catch(() => false);
    const params = { format: 'png' };
    if (fullPage) {
      const m = await this.send('Page.getLayoutMetrics');
      const s = m.cssContentSize || m.contentSize;
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: Math.ceil(s.width), height: Math.ceil(Math.min(s.height, 8000)), scale: 1 };
    }
    const { data } = await this.send('Page.captureScreenshot', params, 30000);
    const file = path.join(this.ctx.opts.shots, name + '.png');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    this.ctx.shots.push(file);
    return file;
  }

  // Cuenta las llamadas a cpu.runFrame (una por tick de 60 Hz) sin cambiar lo que hace.
  async instrument() {
    await this.ev(`(() => {
      const c = window.chip8.cpu;
      if (c.__e2e) return true;
      const E = c.__e2e = { calls: 0, instr: 0, times: [], steps: 0, resets: 0 };
      const rf = c.runFrame, st = c.step, rs = c.reset;
      c.runFrame = function (n) { const r = rf.call(this, n); E.calls++; E.instr += r; E.times.push(performance.now()); if (E.times.length > 4000) E.times.shift(); return r; };
      c.step = function () { E.steps++; return st.apply(this, arguments); };
      c.reset = function () { E.resets++; return rs.apply(this, arguments); };
      return true;
    })()`);
  }

  async close() {
    this.off();
    this.ctx.pages.delete(this);
    try { await this.cdp.send('Target.closeTarget', { targetId: this.targetId }, null, 5000); } catch { /* ya cerrada */ }
  }
}

// ---------------------------------------------------------------- informe
class Scenario {
  constructor(n, title) {
    this.n = n;
    this.title = title;
    this.checks = [];
    this.infos = [];
    this.shots = [];
  }
  check(ok, desc, detail) {
    this.checks.push({ ok: !!ok, desc, detail: ok ? '' : detail === undefined ? '' : String(detail) });
    return !!ok;
  }
  info(text) { this.infos.push(text); }
  get ok() { return this.checks.length > 0 && this.checks.every((c) => c.ok); }
}

// ---------------------------------------------------------------- ayudas de escenarios
const PC_KEYS = [
  ['Digit1', 0x1], ['Digit2', 0x2], ['Digit3', 0x3], ['Digit4', 0xC],
  ['KeyQ', 0x4], ['KeyW', 0x5], ['KeyE', 0x6], ['KeyR', 0xD],
  ['KeyA', 0x7], ['KeyS', 0x8], ['KeyD', 0x9], ['KeyF', 0xE],
  ['KeyZ', 0xA], ['KeyX', 0x0], ['KeyC', 0xB], ['KeyV', 0xF],
];
const KEYPAD_LAYOUT = [0x1, 0x2, 0x3, 0xC, 0x4, 0x5, 0x6, 0xD, 0x7, 0x8, 0x9, 0xE, 0xA, 0x0, 0xB, 0xF];
const hx = (v, d = 3) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(d, '0');

const KEYS_EXPR = 'Array.from(window.chip8.cpu.keys)';
const E2E = 'window.chip8.cpu.__e2e';
// Cantidad de comprobaciones de roms/autotest.asm (la misma constante que tests/roms.test.js).
const AUTOTEST_CHECKS = 19;
const IPF_MAX = 10000;   // tope de instrucciones por frame de la interfaz (IPF_MAX en chip8-ui)

async function counters(page) {
  return page.ev(`({ calls: ${E2E}.calls, instr: ${E2E}.instr, steps: ${E2E}.steps, resets: ${E2E}.resets, now: performance.now() })`);
}

async function measureRate(page, ms) {
  const a = await counters(page);
  await sleep(ms);
  const b = await counters(page);
  const secs = (b.now - a.now) / 1000;
  return { fps: (b.calls - a.calls) / secs, ips: (b.instr - a.instr) / secs, secs, calls: b.calls - a.calls };
}

// Cuenta píxeles encendidos en un rectángulo de la pantalla CHIP-8.
function regionExpr(x0, y0, w, h) {
  return `(() => { const d = window.chip8.cpu.display; let n = 0; for (let y = ${y0}; y < ${y0 + h}; y++) for (let x = ${x0}; x < ${x0 + w}; x++) n += d[y * 64 + x] ? 1 : 0; return n; })()`;
}

async function clickCart(page, id) {
  const idx = await page.ev(`window.chip8.demos.findIndex((d) => d.id === ${JSON.stringify(id)})`);
  if (idx < 0) throw new Error('No hay cartucho ' + id);
  await page.click(`#shelf-list .cart:nth-child(${idx + 1})`);
  const name = await page.ev(`window.chip8.demos[${idx}].name`);
  await page.waitFor(`document.getElementById('cart-name').textContent === ${JSON.stringify(name)}`, { timeout: 3000, desc: `cartucho «${name}» en la ranura` });
  return name;
}

async function toastTexts(page) {
  return page.ev(`Array.from(document.querySelectorAll('#toasts .toast p')).map((p) => p.textContent)`);
}

function writeFixture(ctx, name, bytes) {
  const file = path.join(ctx.browser.fixtures, name);
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
}

async function freshApp(ctx, s, opts = {}) {
  // Cada escenario arranca con los ajustes de fábrica: se borra el localStorage del origen http
  // desde una página vacía del mismo origen, antes de abrir la consola.
  const page = await Page.open(ctx, opts);
  await clearStorage(page, ctx);
  await page.goto(ctx.base + 'chip8.html');
  await page.instrument();
  s.page = page;
  return page;
}

async function clearStorage(page, ctx) {
  await page.goto(ctx.base + '__vacio', { waitApp: false });
  await page.ev('(() => { try { localStorage.clear(); return localStorage.length === 0; } catch (e) { return false; } })()');
}

function presetQuirks(id) {
  const P = {
    vip: { vfReset: true, memory: true, shifting: false, jumping: false, clipping: true, displayWait: true },
    schip: { vfReset: false, memory: false, shifting: true, jumping: true, clipping: true, displayWait: false },
    xochip: { vfReset: false, memory: true, shifting: false, jumping: false, clipping: false, displayWait: false },
  };
  return P[id];
}
const sameQuirks = (a, b) => Object.keys(b).every((k) => !!a[k] === !!b[k]);

// Elige una opción de un <select> con el teclado (foco + flechas), como lo haría una persona.
async function chooseSelect(page, selector, value) {
  const info = await page.ev(`(() => { const s = document.querySelector(${JSON.stringify(selector)}); s.focus(); return { idx: Array.from(s.options).findIndex((o) => o.value === ${JSON.stringify(value)}), cur: s.selectedIndex }; })()`);
  if (info.idx < 0) throw new Error(`La opción ${value} no existe en ${selector}`);
  let cur = info.cur;
  let guard = 0;
  while (cur !== info.idx && guard++ < 10) {
    await page.press(cur < info.idx ? 'ArrowDown' : 'ArrowUp', 10);
    await sleep(30);
    cur = await page.ev(`document.querySelector(${JSON.stringify(selector)}).selectedIndex`);
  }
  await page.ev(`document.querySelector(${JSON.stringify(selector)}).blur()`);
  return cur === info.idx;
}

// ---------------------------------------------------------------- ayudas de los escenarios 25 en adelante
// Elige una opción de un <select> con el mouse: el clic abre la lista desplegable y ahí se elige. En
// Chrome sin ventana la lista no se puede cliquear por coordenadas: flechas + Enter la manejan, y esas
// teclas van a la lista (no al <select>), igual que un clic sobre una opción (por eso el selector suelta
// el foco al cambiar, como con el mouse). Devuelve el valor que quedó (la consola puede rechazar el cambio).
async function chooseWithMouse(page, selector, value) {
  const st = await page.ev(`(() => { const s = document.querySelector(${JSON.stringify(selector)}); return { idx: Array.from(s.options).findIndex((o) => o.value === ${JSON.stringify(value)}), cur: s.selectedIndex }; })()`);
  if (st.idx < 0) throw new Error(`La opción ${value} no existe en ${selector}`);
  await page.click(selector);
  await sleep(200);
  const n = st.idx - st.cur;
  for (let i = 0; i < Math.abs(n); i++) {
    await page.press(n > 0 ? 'ArrowDown' : 'ArrowUp', 10);
    await sleep(30);
  }
  await page.press('Enter');
  await sleep(150);
  return page.ev(`document.querySelector(${JSON.stringify(selector)}).value`);
}

// Carga un archivo como una persona: clic en «Cargar ROM» y, en el diálogo de archivos (interceptado con
// Page.setInterceptFileChooserDialog), el archivo. Espera a que la ROM esté en la ranura: expectName es
// lo que tiene que decir (el nombre del archivo o, si es un juego del archivo de Octo, su título).
async function loadWithButton(page, file, expectName) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const r0 = await page.ev(`window.chip8.cpu.__e2e ? window.chip8.cpu.__e2e.resets : -1`);
  const opened = page.cdp.waitEvent('Page.fileChooserOpened', page.sessionId, 5000);
  await page.click('#btn-load');
  const ev = await opened;
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
  // La misma ROM otra vez deja el mismo nombre: también se espera el reinicio de la carga (instrument()).
  const loaded = `document.getElementById('cart-name').textContent === ${JSON.stringify(expectName)}` + (r0 >= 0 ? ` && window.chip8.cpu.__e2e.resets > ${r0}` : '');
  await page.waitFor(loaded, { timeout: 4000, desc: `«${expectName}» en la ranura (${path.basename(file)} con «Cargar ROM»)` });
}

// Clic con el mouse en el centro de un elemento, después de comprobar que en ese punto no hay otra cosa
// encima (si la hay, el clic de una persona no le llegaría).
async function clickHit(page, selector) {
  const r = await page.rect(selector);
  const hit = await page.ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}), at = document.elementFromPoint(${r.cx}, ${r.cy}); return at ? (at === el || el.contains(at) ? '' : (at.id || at.className || at.tagName)) : 'nada'; })()`);
  if (hit) throw new Error(`Un clic en ${selector} le llegaría a otro elemento (${hit}) en (${Math.round(r.cx)}, ${Math.round(r.cy)})`);
  await page.clickAt(r.cx, r.cy);
}

// Los avisos a la vista: texto, tipo (info o error) y el botón de acción, si tiene.
async function toastsInfo(page) {
  return page.ev(`Array.from(document.querySelectorAll('#toasts .toast')).map((t) => ({ text: t.querySelector('p').textContent, kind: t.classList.contains('toast--error') ? 'error' : 'info', action: t.querySelector('.toast-act') ? t.querySelector('.toast-act').textContent : null }))`);
}

// Clic con el mouse en el botón de acción de un aviso (el último que lo tenga).
async function clickToastAction(page, label) {
  await sleep(250);   // el aviso entra con una animación de 0,2 s
  const r = await page.ev(`(() => { const b = Array.from(document.querySelectorAll('#toasts .toast-act')).filter((x) => x.textContent === ${JSON.stringify(label)}).pop(); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  if (!r) throw new Error(`No hay un aviso con el botón «${label}»`);
  await page.clickAt(r.x, r.y);
}

// Lo que se ve en la consola de un vistazo: máquina, selectores, ranura y estado.
function consoleView(page) {
  return page.ev(`(() => {
    const c = window.chip8.cpu, $ = (id) => document.getElementById(id), info = window.chip8.romInfo();
    return { platform: c.platform, platSel: $('platform').value, preset: $('preset').value, quirks: Object.assign({}, c.quirks),
      ipf: window.chip8.getIpf(), ipfIn: $('ipf-input').value, palette: window.chip8.getPalette(), palSel: $('palette').value, rotation: window.chip8.getRotation(),
      res: c.displayWidth + '×' + c.displayHeight, mem: c.memory.length, mode: $('mon-mode').textContent, video: $('video-label').textContent,
      plate: [$('plate-model').textContent, $('plate-ram').textContent, $('plate-video').textContent].join(' · '),
      name: $('cart-name').textContent, slot: $('cart-size').textContent, slotTip: $('cart-size').title, forget: !$('cart-forget').hidden,
      source: info ? info.source : null, sha1: info ? info.sha1 : null, halted: c.halted, status: $('status').textContent };
  })()`);
}

// Lee un JSON de localStorage (null si no está o si el almacenamiento no anda).
function stored(page, key) {
  return page.ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(key)})); } catch (e) { return null; } })()`);
}

// Los cuatro colores de cada paleta, en el orden de PALETTES en chip8-ui: fondo, plano 1 (el píxel de
// siempre), plano 2 y los dos planos a la vez.
const FOSFORO = ['#041009', '#7CFF96', '#28A858', '#166032'];
const AMBAR = ['#140A02', '#FFB23E', '#D6641A', '#76360C'];
const sortedColors = (list) => list.map((c) => c.toUpperCase()).sort();
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha1Hex = (bytes) => crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex');

// El lienzo #screen comparado con cpu.display (sin giro, en Píxeles puros): cada píxel físico tiene que
// tener exactamente el color de la paleta que le toca a su píxel CHIP-8 (fondo, plano 1, plano 2 o ambos).
function canvasVsDisplayExpr(colors) {
  return `(() => {
    window.chip8.screenColors();   // dibuja lo pendiente
    const cv = document.getElementById('screen'), c = window.chip8.cpu;
    const W = cv.width, H = cv.height, w = c.displayWidth, h = c.displayHeight, sc = W / w;
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data, disp = c.display;
    const pal = ${JSON.stringify(colors)}.map((s) => parseInt(s.slice(1), 16));
    let wrong = 0, first = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, got = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const want = pal[disp[Math.floor(y / sc) * w + Math.floor(x / sc)] & 3];
        if (got !== want) { if (!wrong) first = '(' + x + ',' + y + ') ' + got.toString(16) + ' en vez de ' + want.toString(16); wrong++; }
      }
    }
    return { size: [W, H], res: [w, h], scale: sc, square: H / h === sc, wrong, first };
  })()`;
}

// Valores de píxel (máscaras de planos 0..3) que hay en la pantalla del núcleo.
const DISPLAY_VALUES = 'Array.from(new Set(window.chip8.cpu.display)).sort()';
// El programa terminó de dibujar y quedó en su salto a sí mismo (JP propio): la pantalla ya no cambia.
async function waitSelfJump(page, timeout = 5000) {
  return page.waitFor(`(() => { const c = window.chip8.cpu, m = c.memory; return !c.halted && ((m[c.pc] << 8) | m[c.pc + 1]) === (0x1000 | c.pc); })()`, { timeout, desc: 'el programa llegó a su salto final' });
}

// Cuenta los ticks de los timers (uno por cada runFrame), como instrument() cuenta los frames.
async function instrumentTimers(page) {
  await page.ev(`(() => { const c = window.chip8.cpu; if (c.__ticks) return true; c.__ticks = { n: 0 }; const t = c.tickTimers; c.tickTimers = function () { c.__ticks.n++; return t.apply(this, arguments); }; return true; })()`);
}
async function rates(page, ms) {
  const read = () => page.ev(`({ calls: ${E2E}.calls, instr: ${E2E}.instr, ticks: window.chip8.cpu.__ticks.n, now: performance.now() })`);
  const a = await read();
  await sleep(ms);
  const b = await read();
  const secs = (b.now - a.now) / 1000;
  return { fps: (b.calls - a.calls) / secs, ips: (b.instr - a.instr) / secs, tps: (b.ticks - a.ticks) / secs };
}

// Decodifica un PNG (RGB o RGBA de 8 bits, como los que arma un <canvas>) a { width, height, data RGBA }.
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG');
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = { 6: 4, 2: 3 }[ctype];
  if (depth !== 8 || !bpp) throw new Error(`PNG no soportado (profundidad ${depth}, tipo ${ctype})`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * bpp, out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride), p = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[p++], line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * bpp;
      out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

// Compara una captura PNG con la pantalla del núcleo: cada píxel tiene que ser el color de la paleta que le
// toca (sin giro; scale = píxeles de la captura por píxel CHIP-8).
function pngVsDisplay(img, display, w, colors) {
  const scale = img.width / w;
  const pal = colors.map((c) => c.toUpperCase());
  const hexOf = (o) => '#' + [img.data[o], img.data[o + 1], img.data[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  let wrong = 0, first = '';
  const used = new Set();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4, got = hexOf(o), want = pal[display[Math.floor(y / scale) * w + Math.floor(x / scale)] & 3];
      used.add(got);
      if (got !== want || img.data[o + 3] !== 255) { if (!wrong) first = `(${x},${y}) ${got} en vez de ${want}`; wrong++; }
    }
  }
  return { scale, wrong, first, colors: [...used].sort() };
}

// Captura de la pantalla de la consola (el tubo #crt), con la página arriba de todo.
async function crtCapture(page) {
  await page.ev('window.scrollTo(0, 0)');
  const r = await page.rect('#crt', false);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } }, 30000);
  return decodePng(Buffer.from(data, 'base64'));
}
function imageDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return -1;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  return n;
}

// La próxima descarga del navegador (Browser.setDownloadBehavior con eventsEnabled), hasta que termina:
// { name: el nombre que propuso la página, file: donde quedó, bytes, state }.
function nextDownload(ctx, timeout = 10000) {
  let off, guid = null, name = null;
  const p = new Promise((resolve) => {
    off = ctx.browser.cdp.on((m) => {
      if (m.method === 'Browser.downloadWillBegin' && !guid) { guid = m.params.guid; name = m.params.suggestedFilename; }
      else if (m.method === 'Browser.downloadProgress' && m.params.guid === guid && m.params.state !== 'inProgress') {
        resolve({ name, file: m.params.filePath || null, bytes: m.params.totalBytes, state: m.params.state });
      }
    });
  });
  return withTimeout(p, timeout, 'descarga').finally(() => off());
}

// Joysticks de mentira (Gamepad API): navigator.getGamepads devuelve los que se conectan con
// window.__pad.connect(índice, nombre), y se dispara gamepadconnected como con uno de verdad.
const FAKE_GAMEPADS = `(() => {
  const pads = [null, null, null, null];
  const mk = (index, id) => ({ index, id, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: function () { return pads.slice(); } });
  const fire = (type, g) => { const ev = new Event(type); Object.defineProperty(ev, 'gamepad', { value: g }); window.dispatchEvent(ev); };
  window.__pad = {
    connect(i, id) { pads[i] = mk(i, id); fire('gamepadconnected', pads[i]); },
    disconnect(i) { const g = pads[i]; pads[i] = null; g.connected = false; fire('gamepaddisconnected', g); },
    button(i, b, on) { pads[i].buttons[b] = { pressed: !!on, touched: !!on, value: on ? 1 : 0 }; pads[i].timestamp++; },
    axis(i, a, v) { pads[i].axes[a] = v; pads[i].timestamp++; },
  };
})();`;

const onlyKey = (keys, k) => keys.every((v, i) => (i === k ? v === 1 : v === 0));
const noKeys = (keys) => keys.every((v) => v === 0);
const KEYCAPS_DOWN = "Array.from(document.querySelectorAll('#keypad .key.is-down')).map((e) => Number(e.dataset.key))";

// ROMs de prueba (con tools/chip8asm.js).
const asm = (src, xochip = false) => Array.from(assemble(src, { xochip }).bytes);
const db = (bytes) => 'DB ' + bytes.map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ');
const CUADRO = [0xFF, 0x81, 0xBD, 0xA5, 0xA5, 0xBD, 0x81, 0xFF];
const ROMBO = [0x18, 0x3C, 0x7E, 0xFF, 0xFF, 0x7E, 0x3C, 0x18];
const CUADRO_PIXELS = CUADRO.reduce((n, b) => n + b.toString(2).replace(/0/g, '').length, 0);   // 40 píxeles encendidos
// XO-CHIP en alta resolución: un sprite en el plano 1, otro en el plano 2 y otro en los dos (cuatro colores).
function romCuatroColores(sprite) {
  return asm(`
        HIGH                    ; 128×64
        LD I, sprite
        LD V1, 24
        LD V0, 16
        PLANE 1
        DRW V0, V1, 8
        LD V0, 56
        PLANE 2
        DRW V0, V1, 8
        LD V0, 96
        PLANE 3                 ; los dos planos: DRW lee 8 bytes para cada uno
        DRW V0, V1, 8
fin:    JP fin
sprite: ${db(sprite)}
        ${db(sprite)}`, true);
}
// Dos dígitos de la fuente en el medio de la pantalla (de CHIP-8: corre en las tres plataformas).
function romDigitos(a, b) {
  return asm(`
        CLS
        LD V0, ${a}
        LD F, V0
        LD V1, 24
        LD V2, 13
        DRW V1, V2, 5
        LD V0, ${b}
        LD F, V0
        LD V1, 34
        DRW V1, V2, 5
fin:    JP fin`);
}

// ---------------------------------------------------------------- escenarios
const SCENARIOS = [];
function scenario(n, title, fn, timeout = 90000) { SCENARIOS.push({ n, title, fn, timeout }); }

// 1 --------------------------------------------------------------------------------
scenario(1, 'La página carga sin errores por http y por file://', async (ctx, s) => {
  for (const [label, url] of [['http', ctx.base + 'chip8.html'], ['file://', pathToFileURL(HTML_PATH).href]]) {
    const page = await Page.open(ctx);
    try {
      await page.goto(url);
      await page.instrument();
      await sleep(1500);
      const st = await page.ev(`({ calls: ${E2E}.calls, demo: document.getElementById('cart-name').textContent, halted: window.chip8.cpu.halted, proto: location.protocol })`);
      s.check(st.calls > 20, `${label}: el emulador corre (${st.calls} frames en 1,5 s justo después de cargar, cartucho «${st.demo}»)`, JSON.stringify(st));
      s.check(!st.halted, `${label}: la máquina no se detuvo`);
      s.check(page.errors.length === 0, `${label}: sin errores de consola ni excepciones (sin contar favicon.ico)`, page.errors.join(' | '));
      s.check(page.favicon.length === 0, `${label}: tampoco hay un error por /favicon.ico`, page.favicon.join(' | '));
      await page.shot('01-carga-' + (label === 'http' ? 'http' : 'file'));
    } finally {
      await page.close();
    }
  }
});

// 2 --------------------------------------------------------------------------------
scenario(2, 'Velocidad en tiempo real: 60 frames por segundo', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // Referencia: cuántos requestAnimationFrame por segundo da el navegador.
  const raf = await page.ev(`new Promise((res) => { let n = 0; const t0 = performance.now(); function f(t) { n++; if (t - t0 < 1000) requestAnimationFrame(f); else res(n / ((t - t0) / 1000)); } requestAnimationFrame(f); })`, 5000);
  s.info(`requestAnimationFrame del navegador: ${raf.toFixed(1)} por segundo`);
  for (const ipf of [15, 1000]) {
    await page.ev(`window.chip8.setIpf(${ipf})`);
    await sleep(200);
    const r = await measureRate(page, 3000);
    s.info(`IPF ${ipf}: ${r.fps.toFixed(1)} frames/s, ${Math.round(r.ips)} instrucciones/s (en ${r.secs.toFixed(2)} s)`);
    s.check(r.fps >= 50 && r.fps <= 70, `IPF ${ipf}: ~60 llamadas a runFrame por segundo (medido ${r.fps.toFixed(1)})`, `fuera de 50-70`);
    if (ipf === 15) s.check(r.ips > 0 && r.ips <= 15 * 60 * 1.17, `IPF 15: no más de ~900 instrucciones/s (medido ${Math.round(r.ips)})`);
  }
  // Un bucle sin DXYN (displayWait no corta el frame): IPF 1000 = 60000 instrucciones/s.
  await page.ev("window.chip8.loadRomBytes([0x70, 0x01, 0x12, 0x00], 'bucle')");
  const loop = await measureRate(page, 2000);
  s.info(`IPF 1000 con un bucle sin dibujo: ${loop.fps.toFixed(1)} frames/s, ${Math.round(loop.ips)} instrucciones/s`);
  s.check(loop.fps >= 50 && loop.fps <= 70 && loop.ips >= 1000 * loop.fps * 0.99, `IPF 1000 sin dibujo: ~60 frames/s y 1000 instrucciones por frame (${Math.round(loop.ips)}/s)`);
  // El tope de la interfaz: 10000 IPF = 600.000 instrucciones/s, también a 60 frames/s.
  await page.ev(`window.chip8.setIpf(${IPF_MAX})`);
  await sleep(200);
  const top = await measureRate(page, 2000);
  s.info(`IPF ${IPF_MAX} con un bucle sin dibujo: ${top.fps.toFixed(1)} frames/s, ${Math.round(top.ips)} instrucciones/s`);
  s.check(top.fps >= 50 && top.fps <= 70 && top.ips >= IPF_MAX * top.fps * 0.99, `IPF ${IPF_MAX} sin dibujo: ~60 frames/s y ${IPF_MAX} instrucciones por frame (${Math.round(top.ips)}/s)`);
  // Costo de CPU del núcleo: 60 frames (1 s emulado) a 10000 IPF, sin dibujo y dibujando sin
  // espera de vblank (perfil XO-CHIP: un DXYN cada 4 instrucciones, 150.000 dibujos por segundo).
  const cost = await page.ev(`(() => {
    const a = window.chip8, cpu = a.cpu;
    a.pause();
    const time = () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) cpu.runFrame(${IPF_MAX}); return performance.now() - t0; };
    const loopMs = time();
    a.setPreset('xochip');
    a.loadRomBytes([0xA0, 0x50, 0xD0, 0x15, 0x70, 0x01, 0x12, 0x02], 'dibujo');
    a.pause();
    const drawMs = time();
    a.setPreset('vip');
    return { loopMs, drawMs };
  })()`);
  s.info(`CPU del núcleo por segundo emulado a ${IPF_MAX} IPF: ${cost.loopMs.toFixed(1)} ms sin dibujo, ${cost.drawMs.toFixed(1)} ms dibujando sin vblank`);
  s.check(cost.loopMs < 250 && cost.drawMs < 500, `a ${IPF_MAX} IPF el núcleo usa una fracción de la CPU (${cost.loopMs.toFixed(0)} y ${cost.drawMs.toFixed(0)} ms por segundo emulado)`);
  await page.ev('window.chip8.setIpf(15)');
  await clickCart(page, 'rebote');
  await sleep(300);
  // La pelota se mueve con el tiempo real.
  const posA = await page.ev('[window.chip8.cpu.V[1], window.chip8.cpu.V[2], Array.from(window.chip8.cpu.display).join("")]');
  await sleep(1000);
  const posB = await page.ev('[window.chip8.cpu.V[1], window.chip8.cpu.V[2], Array.from(window.chip8.cpu.display).join("")]');
  const moved = Math.abs(posA[0] - posB[0]) + Math.abs(posA[1] - posB[1]);
  s.info(`Pelota: (${posA[0]}, ${posA[1]}) -> (${posB[0]}, ${posB[1]}) en 1 s`);
  s.check(moved >= 10 && posA[2] !== posB[2], `la pelota de Rebote se mueve en tiempo real (${moved} píxeles en 1 s, la pantalla cambió)`);
  await page.shot('02-rebote');
});

// 3 --------------------------------------------------------------------------------
scenario(3, 'Teclado físico: las 16 teclas y el demo Teclado', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'teclado');
  await page.click('.tagline'); // foco fuera de los botones
  await sleep(600);
  const bad = [];
  for (const [code, k] of PC_KEYS) {
    const i = KEYPAD_LAYOUT.indexOf(k);
    const cell = regionExpr(1 + 8 * (i % 4), 8 * Math.floor(i / 4), 6, 7);
    const before = await page.ev(cell);
    await page.keyDown(code);
    const down = await page.ev(`({ keys: ${KEYS_EXPR}, cap: document.querySelector('#keypad .key[data-key="${k}"]').classList.contains('is-down'), caps: document.querySelectorAll('#keypad .key.is-down').length })`);
    const onlyK = down.keys.every((v, j) => (j === k ? v === 1 : v === 0));
    const lit = await page.poll(`${cell} === ${42 - before}`, 1500);
    const litNow = await page.ev(cell);
    await page.keyUp(code);
    const up = await page.ev(`({ keys: ${KEYS_EXPR}, caps: document.querySelectorAll('#keypad .key.is-down').length })`);
    const back = await page.poll(`${cell} === ${before}`, 1500);
    const ok = onlyK && down.cap && down.caps === 1 && up.keys.every((v) => v === 0) && up.caps === 0 && lit && back;
    if (!ok) bad.push(`${code}->${k.toString(16).toUpperCase()}: soloEsa=${onlyK} tecla=${down.cap} celda=${before}->${litNow} (esperado ${42 - before}) suelta=${up.keys.every((v) => v === 0)} volvió=${!!back}`);
    await sleep(60);
  }
  s.check(bad.length === 0, 'cada tecla física marca solo su tecla CHIP-8, se ve apretada en el keypad, ilumina su celda y se libera al soltar', bad.join('; '));
  // Captura con una tecla apretada.
  await page.keyDown('KeyW');
  await sleep(300);
  await page.shot('03-teclado-W');
  await page.keyUp('KeyW');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 4 --------------------------------------------------------------------------------
scenario(4, 'Keypad en pantalla con el mouse y con varios dedos', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'teclado');
  const bad = [];
  for (const k of KEYPAD_LAYOUT) {
    const r = await page.rect(`#keypad .key[data-key="${k}"]`);
    await page.mouse('mouseMoved', r.cx, r.cy);
    await page.mouse('mousePressed', r.cx, r.cy);
    const d1 = await page.ev(`({ keys: ${KEYS_EXPR}, cap: document.querySelector('#keypad .key[data-key="${k}"]').classList.contains('is-down') })`);
    await sleep(150);
    const d2 = await page.ev(`window.chip8.cpu.keys[${k}]`);
    await page.mouse('mouseReleased', r.cx, r.cy);
    const u = await page.ev(`({ keys: ${KEYS_EXPR}, caps: document.querySelectorAll('#keypad .key.is-down').length })`);
    const ok = d1.keys.every((v, j) => (j === k ? v === 1 : v === 0)) && d1.cap && d2 === 1 && u.keys.every((v) => v === 0) && u.caps === 0;
    if (!ok) bad.push(`${k.toString(16).toUpperCase()}: ${JSON.stringify({ d1: d1.keys.join(''), cap: d1.cap, sostenida: d2, suelta: u.keys.join(''), caps: u.caps })}`);
  }
  s.check(bad.length === 0, 'mouse: apretar, sostener y soltar cada una de las 16 teclas', bad.join('; '));

  // Arrastrar fuera de la tecla con el botón apretado y soltar afuera: la tecla no queda trabada.
  const r5 = await page.rect('#keypad .key[data-key="5"]');
  await page.mouse('mouseMoved', r5.cx, r5.cy);
  await page.mouse('mousePressed', r5.cx, r5.cy);
  await page.mouse('mouseMoved', r5.cx, r5.cy - 200, { buttons: 1, button: 'left' });
  await page.mouse('mouseReleased', r5.cx, r5.cy - 200);
  await sleep(50);
  s.check((await page.ev('window.chip8.cpu.keys[5]')) === 0, 'mouse: apretar la tecla 5, salir arrastrando y soltar afuera la libera');

  // Multitáctil.
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const a = await page.rect('#keypad .key[data-key="1"]');
  const b = await page.rect('#keypad .key[data-key="15"]', false);
  const p1 = { x: a.cx, y: a.cy, id: 1, radiusX: 4, radiusY: 4, force: 1 };
  const p2 = { x: b.cx, y: b.cy, id: 2, radiusX: 4, radiusY: 4, force: 1 };
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
  await sleep(120);
  const both = await page.ev(`({ keys: ${KEYS_EXPR}, caps: Array.from(document.querySelectorAll('#keypad .key.is-down')).map((e) => e.dataset.key) })`);
  s.check(both.keys[1] === 1 && both.keys[15] === 1 && both.keys.reduce((x, y) => x + y) === 2, 'toques: dos dedos a la vez apretan 1 y F', JSON.stringify(both));
  await page.shot('04-keypad-dos-dedos');
  // En CDP, touchEnd lista los dedos que se levantan.
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p2] });
  await sleep(60);
  const one = await page.ev(KEYS_EXPR);
  s.check(one[1] === 1 && one[15] === 0, 'toques: al levantar el segundo dedo se suelta F y 1 sigue apretada', one.join(''));
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p1] });
  await sleep(60);
  const none = await page.ev(`({ keys: ${KEYS_EXPR}, caps: document.querySelectorAll('#keypad .key.is-down').length })`);
  s.check(none.keys.every((v) => v === 0) && none.caps === 0, 'toques: al levantar todos los dedos no queda ninguna tecla apretada', JSON.stringify(none));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 5 --------------------------------------------------------------------------------
scenario(5, 'Atajos: Espacio, N, Retroceso, H, Esc y el campo IPF', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const paused = () => page.ev('window.chip8.isPaused()');
  await page.click('.tagline');
  await page.press('Space');
  await sleep(80);
  const p1 = await paused();
  await page.press('Space');
  await sleep(80);
  const p2 = await paused();
  s.check(p1 === true && p2 === false, 'Espacio pausa y vuelve a continuar', `${p1} ${p2}`);

  // Modelo de foco: un clic con el mouse no le deja el foco al botón, así Espacio sigue pausando
  // (una sola vez por pulsación). Con el foco puesto desde el teclado, Espacio activa el control.
  await page.click('#btn-pause');
  await sleep(80);
  const q1 = await paused();
  const focusId = await page.ev('document.activeElement && (document.activeElement.id || document.activeElement.tagName)');
  await page.press('Space');
  await sleep(120);
  const q2 = await paused();
  await page.press('Space');
  await sleep(120);
  const q3 = await paused();
  s.check(q1 === true && q2 === false && q3 === true && focusId !== 'btn-pause', `clic en Pausa con el mouse: el botón no queda enfocado (foco: ${focusId}) y Espacio cambia una sola vez por pulsación`, `${q1} ${q2} ${q3}`);
  // Clic con el mouse en Scanlines: Espacio pausa/continúa y no toca el interruptor.
  await page.click('#tg-scan');
  await page.click('#tg-scan');
  const scan0 = await page.ev("document.getElementById('tg-scan').getAttribute('aria-pressed')");
  await page.press('Space');
  await sleep(120);
  const scan1 = await page.ev("document.getElementById('tg-scan').getAttribute('aria-pressed')");
  const q4 = await paused();
  s.check(scan0 === scan1 && q4 === false, 'después de un clic en Scanlines, Espacio pausa/continúa y no toca el interruptor', `scan ${scan0}->${scan1}, pausa ${q4}`);
  // Scanlines enfocado desde el teclado (como con Tab): Espacio lo activa y no pausa.
  await page.ev("document.getElementById('tg-scan').focus()");
  await page.press('Space');
  await sleep(120);
  const scan2 = await page.ev("document.getElementById('tg-scan').getAttribute('aria-pressed')");
  const q5 = await paused();
  s.check(scan2 !== scan1 && q5 === q4, 'con Scanlines enfocado desde el teclado, Espacio cambia el interruptor y no pausa', `scan ${scan1}->${scan2}, pausa ${q4}->${q5}`);
  await page.press('Space'); // vuelve a dejarlo como estaba
  await sleep(80);
  await page.click('.tagline');

  // N: una instrucción por pulsación.
  await page.press('Space');
  await sleep(80);
  let stepBad = [];
  for (let i = 0; i < 12; i++) {
    const b = await page.ev(`(() => { const c = window.chip8.cpu; return { pc: c.pc, op: (c.memory[c.pc] << 8) | c.memory[c.pc + 1], top: c.sp ? c.stack[c.sp - 1] : -1, steps: c.__e2e.steps, wait: c.waitingForKey }; })()`);
    await page.press('KeyN');
    await sleep(40);
    const a = await page.ev(`({ pc: window.chip8.cpu.pc, steps: ${E2E}.steps, paused: window.chip8.isPaused() })`);
    const nnn = b.op & 0xfff;
    const allowed = new Set([b.pc + 2, b.pc + 4]);
    if ((b.op & 0xf000) === 0x1000 || (b.op & 0xf000) === 0x2000) allowed.clear(), allowed.add(nnn);
    if (b.op === 0x00ee) allowed.clear(), allowed.add(b.top);
    if ((b.op & 0xf000) === 0xb000) allowed.clear(), allowed.add(-1);
    const ok = a.steps === b.steps + 1 && a.paused && ((b.op & 0xf000) === 0xb000 || allowed.has(a.pc));
    if (!ok) stepBad.push(`${hx(b.pc)} ${b.op.toString(16).padStart(4, '0')} -> ${hx(a.pc)} (pasos +${a.steps - b.steps})`);
  }
  s.check(stepBad.length === 0, 'N en pausa ejecuta exactamente una instrucción (12 pulsaciones: PC avanza 2, salta o vuelve de la subrutina)', stepBad.join('; '));
  await page.press('Space');
  await sleep(100);
  const beforeN = await counters(page);
  await page.press('KeyN');
  await sleep(60);
  const afterN = await page.ev(`({ steps: ${E2E}.steps, paused: window.chip8.isPaused() })`);
  s.check(afterN.paused, 'N con la máquina corriendo la pausa (según la ayuda)');

  // Retroceso reinicia.
  await page.press('Space');
  await sleep(300);
  const r0 = await counters(page);
  await page.press('Backspace');
  await sleep(60);
  const r1 = await page.ev(`({ resets: ${E2E}.resets, instr: document.getElementById('mon-instr').textContent })`);
  s.check(r1.resets === r0.resets + 1, `Retroceso reinicia una vez (contador de instrucciones: ${r1.instr})`, JSON.stringify(r1));

  // H abre la ayuda, Esc la cierra; H también la cierra.
  await page.press('KeyH');
  await sleep(150);
  const h1 = await page.ev("document.getElementById('help').open");
  await page.shot('05-ayuda');
  await page.press('Escape');
  await sleep(150);
  const h2 = await page.ev("document.getElementById('help').open");
  s.check(h1 === true && h2 === false, 'H abre la ayuda y Esc la cierra', `${h1} ${h2}`);
  await page.press('KeyH');
  await sleep(120);
  await page.press('KeyH');
  await sleep(120);
  s.check((await page.ev("document.getElementById('help').open")) === false, 'H con la ayuda abierta la cierra');
  // Con la ayuda abierta, las teclas del keypad no llegan al CHIP-8.
  await page.press('KeyH');
  await sleep(120);
  await page.keyDown('KeyQ');
  const kq = await page.ev('window.chip8.cpu.keys[4]');
  await page.keyUp('KeyQ');
  await page.press('Escape');
  await sleep(120);
  s.check(kq === 0, 'con la ayuda abierta, Q no aprieta la tecla 4');

  // Escribiendo en el campo IPF: ni teclas mapeadas ni atajos.
  await page.click('#btn-pause'); // estado conocido
  const wasPaused = await paused();
  const f = await page.rect('#ipf-input');
  await page.clickAt(f.cx, f.cy);
  await sleep(50);
  const focused = await page.ev("document.activeElement.id");
  const c0 = await counters(page);
  const leaks = [];
  for (const code of ['KeyQ', 'Digit3', 'KeyV']) {
    await page.keyDown(code);
    const ks = await page.ev(KEYS_EXPR);
    if (ks.some((v) => v)) leaks.push(code + '->' + ks.join(''));
    await page.keyUp(code);
  }
  await page.press('Space');
  await page.press('KeyN');
  await page.press('Backspace');
  await page.press('KeyH');
  await sleep(100);
  const c1 = await counters(page);
  const st = await page.ev(`({ paused: window.chip8.isPaused(), help: document.getElementById('help').open, val: document.getElementById('ipf-input').value })`);
  s.check(focused === 'ipf-input' && leaks.length === 0, 'escribiendo en el campo IPF, Q/3/V no aprietan teclas del CHIP-8', `foco ${focused}; ${leaks.join(' ')}`);
  s.check(st.paused === wasPaused && c1.steps === c0.steps && c1.resets === c0.resets && !st.help, 'escribiendo en el campo IPF, Espacio/N/Retroceso/H no hacen nada', JSON.stringify({ st, pasos: c1.steps - c0.steps, reinicios: c1.resets - c0.resets }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 6 --------------------------------------------------------------------------------
scenario(6, 'Carga de ROMs: selector de archivos, errores y arrastrar y soltar', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const fuentePath = path.join(ROOT, 'roms', 'fuente.ch8');
  const fuente = fs.readFileSync(fuentePath);
  await page.setFiles('#file-input', [fuentePath]);
  await page.waitFor("document.getElementById('cart-name').textContent === 'fuente.ch8'", { timeout: 3000, desc: 'fuente.ch8 en la ranura' });
  const lab = await page.ev("({ name: document.getElementById('cart-name').textContent, size: document.getElementById('cart-size').textContent })");
  s.check(lab.size.includes(String(fuente.length)), `la etiqueta muestra nombre y tamaño («${lab.name}», «${lab.size}»)`);
  // Referencia: la misma ROM corrida en Node con el núcleo del archivo.
  const Core = require(path.join(ROOT, 'tests', 'harness.js')).loadCore();
  const ref = new Core.Chip8();
  ref.loadRom(new Uint8Array(fuente));
  for (let i = 0; i < 240; i++) ref.runFrame(15);
  await sleep(1500);
  const disp = await page.ev('Array.from(window.chip8.cpu.display).join("")');
  const lit = [...disp].filter((c) => c === '1').length;
  s.check(disp === Array.from(ref.display).join(''), `la pantalla muestra la fuente (${lit} píxeles encendidos, igual que el núcleo en Node)`);
  await page.shot('06-fuente');

  const vacio = writeFixture(ctx, 'vacia.ch8', []);
  // 65025 bytes: uno más de lo que entra en XO-CHIP (una ROM de 3585 a 65024 bytes no es un error:
  // la consola pasa sola al perfil XO-CHIP).
  const grande = writeFixture(ctx, 'grande.ch8', new Uint8Array(65025).fill(0x12));
  for (const [file, label, pattern] of [[vacio, 'vacía (0 bytes)', /vac[ií]/i], [grande, 'de 65025 bytes', /65[.,]?025/]]) {
    const c0 = await counters(page);
    await page.setFiles('#file-input', [file]);
    const t = await page.poll(`Array.from(document.querySelectorAll('#toasts .toast--error p')).map((p) => p.textContent).join(' | ')`, 2000);
    await sleep(400);
    const c1 = await counters(page);
    const name = await page.ev("document.getElementById('cart-name').textContent");
    s.check(t && pattern.test(t), `ROM ${label}: aparece un aviso de error en castellano («${t}»)`, t);
    const cover = await page.ev(`(() => {
      const t = document.querySelector('#toasts .toast--error'); if (!t) return ['sin aviso'];
      const a = t.getBoundingClientRect();
      return ['#keypad', '#status', '#screen', '#btn-reset'].filter((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; });
    })()`);
    s.check(cover.length === 0, `ROM ${label}: el aviso no tapa el keypad, la línea de estado, la pantalla ni el transporte`, 'tapa: ' + cover.join(', '));
    s.check(name === 'fuente.ch8' && c1.calls > c0.calls + 10 && !(await page.ev('window.chip8.cpu.halted')), `ROM ${label}: la ROM anterior sigue en la ranura y corriendo`, `${name}, frames +${c1.calls - c0.calls}`);
    if (label.startsWith('de')) await page.shot('06-error-rom-grande');
    await page.ev("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())");
  }

  // Arrastrar y soltar teclado.ch8 sobre la página.
  const teclado = path.join(ROOT, 'roms', 'teclado.ch8');
  const data = { items: [], files: [teclado], dragOperationsMask: 1 };
  const x = 400, y = 300;
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await page.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
  await sleep(100);
  const overlay = await page.ev("!document.getElementById('drop').hidden");
  await page.shot('06-arrastre');
  await page.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
  const got = await page.poll("document.getElementById('cart-name').textContent === 'teclado.ch8'", 3000);
  const overlayAfter = await page.ev("!document.getElementById('drop').hidden");
  s.check(overlay, 'al arrastrar un archivo aparece el cartel «Soltá el cartucho acá»');
  s.check(got && !overlayAfter, 'al soltar teclado.ch8 se carga y el cartel se va');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 7 --------------------------------------------------------------------------------
scenario(7, 'Cada cartucho incluido carga desde el estante y corre 3 s', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const demos = await page.ev('window.chip8.demos.map((d) => ({ id: d.id, name: d.name }))');
  s.info('Cartuchos: ' + demos.map((d) => d.id).join(', '));
  s.check(demos.length >= 2, `hay cartuchos incluidos (${demos.length})`);
  for (const d of demos) {
    await clickCart(page, d.id);
    const c0 = await counters(page);
    await sleep(3000);
    const c1 = await counters(page);
    const st = await page.ev(`({ halted: window.chip8.cpu.halted, err: window.chip8.cpu.error, pressed: document.querySelector('#shelf-list .cart[aria-pressed="true"] .cart-name') && document.querySelector('#shelf-list .cart[aria-pressed="true"] .cart-name').textContent, lit: window.chip8.cpu.display.reduce((a, b) => a + b, 0), badge: document.getElementById('mon-badge').textContent })`);
    const fps = (c1.calls - c0.calls) / ((c1.now - c0.now) / 1000);
    s.check(!st.halted && st.pressed === d.name && fps > 50 && st.lit > 0, `«${d.name}»: carga, queda marcado, corre (${fps.toFixed(0)} fps, ${st.lit} píxeles, monitor: ${st.badge})`, JSON.stringify(st));
    await page.shot('07-cartucho-' + d.id);
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 8 --------------------------------------------------------------------------------
scenario(8, 'Atrapa: D mueve la paleta a la derecha y A a la izquierda', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'atrapa');
  await page.click('.tagline');
  await sleep(500);
  const x0 = await page.ev('window.chip8.cpu.V[3]');
  await page.keyDown('KeyD');
  await sleep(250);
  const k9 = await page.ev('window.chip8.cpu.keys[9]');
  await sleep(450);
  await page.keyUp('KeyD');
  await sleep(100);
  const x1 = await page.ev('window.chip8.cpu.V[3]');
  await sleep(300);
  const x1b = await page.ev('window.chip8.cpu.V[3]');
  await page.shot('08-atrapa-derecha');
  await page.keyDown('KeyA');
  await sleep(700);
  await page.keyUp('KeyA');
  await sleep(100);
  const x2 = await page.ev('window.chip8.cpu.V[3]');
  s.info(`Paleta: x=${x0} -> ${x1} (D 0,7 s) -> ${x2} (A 0,7 s)`);
  s.check(k9 === 1 && x1 > x0, `mantener D (tecla 9) mueve la paleta a la derecha (${x0} -> ${x1})`);
  s.check(x1b === x1, `al soltar D la paleta se detiene (${x1} -> ${x1b})`);
  s.check(x2 < x1b, `mantener A (tecla 7) la mueve a la izquierda (${x1b} -> ${x2})`);
  await page.shot('08-atrapa-izquierda');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 9 --------------------------------------------------------------------------------
scenario(9, 'Autotest con cada perfil elegido en el selector', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  for (const id of ['vip', 'schip', 'xochip']) {
    const chosen = await chooseSelect(page, '#preset', id);
    const q = await page.ev('Object.assign({}, window.chip8.cpu.quirks)');
    s.check(chosen && sameQuirks(q, presetQuirks(id)), `perfil ${id} elegido con el teclado en el selector`, JSON.stringify(q));
    await clickCart(page, 'autotest');
    await page.click('.tagline');
    // Termina en un salto a sí mismo (JP propio).
    const t0 = Date.now();
    const done = await page.poll(`(() => { const c = window.chip8.cpu; const op = (c.memory[c.pc] << 8) | c.memory[c.pc + 1]; return c.halted || op === (0x1000 | c.pc); })()`, 30000, 100);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const r = await page.ev('({ vd: window.chip8.cpu.V[13], ve: window.chip8.cpu.V[14], halted: window.chip8.cpu.halted, err: window.chip8.cpu.error })');
    s.check(done && !r.halted && r.ve === 0 && r.vd === AUTOTEST_CHECKS, `${id}: autotest terminó en ${secs} s con VD=${r.vd} comprobaciones (se esperan ${AUTOTEST_CHECKS}) y VE=${r.ve} fallas`, JSON.stringify(r));
    await page.shot('09-autotest-' + id);
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
}, 150000);

// 10 -------------------------------------------------------------------------------
scenario(10, 'Interruptores de quirks, perfiles, ajustes guardados y localStorage roto', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const presetState = () => page.ev(`(() => { const p = document.getElementById('preset'); return { value: p.value, text: p.options[p.selectedIndex].textContent, quirks: Object.assign({}, window.chip8.cpu.quirks), dips: Array.from(document.querySelectorAll('#dip-bank .dip')).map((d) => d.getAttribute('aria-checked')) }; })()`);
  const st0 = await presetState();
  s.check(st0.value === 'vip' && sameQuirks(st0.quirks, presetQuirks('vip')), 'de fábrica: perfil COSMAC VIP', JSON.stringify(st0));
  await page.click('#dip-bank .dip-col:nth-of-type(3) .dip'); // SHIFT
  const st1 = await presetState();
  s.check(st1.quirks.shifting === true && st1.dips[2] === 'true' && st1.value === 'custom' && st1.text === 'Personalizado', 'tocar el interruptor 3 (SHIFT) activa shifting y el perfil pasa a «Personalizado»', JSON.stringify(st1));
  await page.shot('10-dip-personalizado');
  await chooseSelect(page, '#preset', 'schip');
  const st2 = await presetState();
  const dipsOk = st2.dips.every((v, i) => v === String(!!presetQuirks('schip')[['vfReset', 'memory', 'shifting', 'jumping', 'clipping', 'displayWait'][i]]));
  s.check(sameQuirks(st2.quirks, presetQuirks('schip')) && dipsOk && st2.value === 'schip', 'elegir SUPER-CHIP pone los seis quirks (y los seis interruptores)', JSON.stringify(st2));
  await page.click('#dip-bank .dip-col:nth-of-type(1) .dip'); // VF=0 on
  await page.click('#ipf-chips .chip:nth-child(3)'); // 30
  const custom = (await presetState()).quirks;
  await page.reload();
  await page.instrument();
  const st3 = await presetState();
  const ipf3 = await page.ev('window.chip8.getIpf()');
  s.check(sameQuirks(st3.quirks, custom) && st3.value === 'custom' && ipf3 === 30, 'después de recargar se conservan los quirks personalizados y el IPF 30', JSON.stringify({ st3, ipf3 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
  await page.close();

  // localStorage que tira excepción en cada acceso.
  const broken = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Acceso al almacenamiento denegado (e2e)', 'SecurityError'); } });`;
  const p2 = await Page.open(ctx, { initScripts: [broken] });
  s.page = p2;
  await p2.goto(ctx.base + 'chip8.html');
  await p2.instrument();
  const throws = await p2.ev("(() => { try { window.localStorage; return false; } catch (e) { return true; } })()");
  await p2.click('#dip-bank .dip-col:nth-of-type(4) .dip');
  await p2.click('#ipf-chips .chip:nth-child(4)');
  await p2.click('#tg-scan');
  const r = await measureRate(p2, 1000);
  const st4 = await p2.ev(`({ jumping: window.chip8.cpu.quirks.jumping, ipf: window.chip8.getIpf(), preset: document.getElementById('preset').value })`);
  s.check(throws, 'la inyección hace que localStorage tire una excepción');
  s.check(r.fps > 50 && st4.jumping === true && st4.ipf === 100 && st4.preset === 'custom', `con localStorage roto la consola funciona (${r.fps.toFixed(0)} fps, interruptor e IPF responden)`, JSON.stringify(st4));
  s.check(p2.errors.length === 0, 'con localStorage roto no hay excepciones ni errores de consola', p2.errors.join(' | '));
  await p2.shot('10-localstorage-roto');
});

// 11 -------------------------------------------------------------------------------
scenario(11, 'Controles de velocidad: deslizador, campo numérico y botones', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const ipf = () => page.ev('window.chip8.getIpf()');
  const view = () => page.ev("({ ipf: window.chip8.getIpf(), range: Number(document.getElementById('ipf-range').value), input: document.getElementById('ipf-input').value, mon: document.getElementById('mon-ipf').textContent, rate: document.getElementById('ipf-rate').textContent })");
  s.check((await ipf()) === 15, 'IPF de fábrica: 15');
  const r = await page.rect('#ipf-range');
  await page.clickAt(r.x + r.w * 0.5, r.cy);
  await sleep(80);
  const v1 = await view();
  const expected = Math.round(Math.pow(IPF_MAX, v1.range / 1000));
  s.check(v1.ipf !== 15 && v1.ipf === Math.max(1, Math.min(IPF_MAX, expected)) && v1.input === String(v1.ipf), `clic en la mitad del deslizador: IPF ${v1.ipf} (posición ${v1.range}), el campo muestra ${v1.input}`, JSON.stringify(v1));
  await page.press('End');
  await sleep(50);
  const vEnd = await view();
  await page.press('Home');
  await sleep(50);
  const vHome = await view();
  s.check(vEnd.ipf === IPF_MAX && vHome.ipf === 1, `teclas Fin / Inicio sobre el deslizador: ${vEnd.ipf} / ${vHome.ipf}`);
  // Campo numérico.
  const f = await page.rect('#ipf-input');
  for (const [txt, want] of [['250', 250], ['5000', 5000], ['50000', IPF_MAX], ['0', 1]]) {
    await page.clickAt(f.cx, f.cy);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: f.cx, y: f.cy, button: 'left', clickCount: 3 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: f.cx, y: f.cy, button: 'left', clickCount: 3 });
    await page.ev("document.getElementById('ipf-input').select && document.getElementById('ipf-input').select()");
    await page.type(txt);
    await page.press('Enter');
    await sleep(60);
    const v = await view();
    s.check(v.ipf === want && v.input === String(want), `escribir «${txt}» + Enter en el campo: IPF ${v.ipf}, el campo muestra «${v.input}»`, JSON.stringify(v));
  }
  const presets = await page.ev("Array.from(document.querySelectorAll('#ipf-chips .chip')).map((c) => Number(c.textContent))");
  const bad = [];
  for (let i = 0; i < presets.length; i++) {
    await page.click(`#ipf-chips .chip:nth-child(${i + 1})`);
    await sleep(40);
    const v = await view();
    const pressed = await page.ev("Array.from(document.querySelectorAll('#ipf-chips .chip')).map((c) => c.getAttribute('aria-pressed'))");
    if (v.ipf !== presets[i] || pressed.filter((p) => p === 'true').length !== 1 || pressed[i] !== 'true' || v.input !== String(presets[i])) bad.push(`${presets[i]}: ${JSON.stringify(v)}`);
  }
  s.check(bad.length === 0 && presets.length > 0, `botones de velocidad (${presets.join(', ')}) fijan el IPF y quedan marcados`, bad.join('; '));
  // Que el IPF elegido se note en la velocidad real.
  await page.click('#ipf-chips .chip:nth-child(1)');
  await page.ev("window.chip8.loadRomBytes([0x70, 0x01, 0x12, 0x00], 'bucle')");
  await page.instrument();
  const m = await measureRate(page, 1500);
  s.info(`IPF ${presets[0]} con un bucle sin dibujo: ${Math.round(m.ips)} instrucciones/s`);
  s.check(Math.abs(m.ips - presets[0] * 60) / (presets[0] * 60) < 0.15, `con IPF ${presets[0]} se ejecutan ~${presets[0] * 60} instrucciones/s (medido ${Math.round(m.ips)})`);
  await page.shot('11-velocidad');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 12 -------------------------------------------------------------------------------
scenario(12, 'Sonido: se habilita con un gesto, suena, respeta el silencio y la pausa', async (ctx, s) => {
  const spy = `(() => { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const orig = AC.prototype.createGain; window.__e2eGains = []; AC.prototype.createGain = function () { const g = orig.apply(this, arguments); window.__e2eGains.push(g); return g; }; })();`;
  const page = await Page.open(ctx, { initScripts: [spy] });
  s.page = page;
  await clearStorage(page, ctx);
  await page.goto(ctx.base + 'chip8.html');
  await page.instrument();
  await sleep(800);
  const a0 = await page.ev('window.chip8.audioState()');
  const hint0 = await page.ev("document.getElementById('audio-hint').textContent");
  s.check(a0.state === 'sin-iniciar' && a0.enabled === false, `antes de cualquier gesto el audio no arrancó (estado «${a0.state}», aviso «${hint0}»)`, JSON.stringify(a0));
  await page.click('#crt');
  const running = await page.poll("window.chip8.audioState().state === 'running'", 3000);
  const a1 = await page.ev('window.chip8.audioState()');
  s.check(running, `después de un clic real el AudioContext está «${a1.state}»`, JSON.stringify(a1));
  // Rebote: esperar un rebote en un borde.
  const gain = '(window.__e2eGains && window.__e2eGains[0] ? window.__e2eGains[0].gain.value : -1)';
  const master = '(window.__e2eGains && window.__e2eGains[1] ? window.__e2eGains[1].gain.value : -1)';
  const bounce = await page.poll(`(() => { const a = window.chip8.audioState(); return a.beeping && a.soundTimer > 0 ? { g: ${gain}, m: ${master}, st: a.soundTimer } : null; })()`, 8000, 10);
  s.check(bounce && bounce.st > 0, `Rebote: al tocar un borde audioState() informa beeping (ST=${bounce && bounce.st})`);
  // ROM que mantiene el temporizador de sonido siempre cargado.
  await page.ev("window.chip8.loadRomBytes([0x60, 0x1E, 0xF0, 0x18, 0x12, 0x00], 'pitido')");
  await sleep(250);
  const b1 = await page.ev(`({ a: window.chip8.audioState(), g: ${gain}, m: ${master}, led: document.getElementById('led-snd').className })`);
  s.check(b1.a.beeping && b1.g > 0.5 && b1.m > 0, `LD ST: suena (ganancia ${b1.g.toFixed(3)}, volumen ${b1.m.toFixed(3)}, LED «${b1.led}»)`, JSON.stringify(b1));
  await page.click('#tg-mute');
  await sleep(250);
  const b2 = await page.ev(`({ a: window.chip8.audioState(), g: ${gain}, hint: document.getElementById('audio-hint').textContent })`);
  s.check(b2.a.muted && !b2.a.beeping && b2.g < 0.01, `con Silencio: sin ganancia (${b2.g.toFixed(4)}), aviso «${b2.hint}»`, JSON.stringify(b2));
  await page.click('#tg-mute');
  await sleep(250);
  const b3 = await page.ev(`({ a: window.chip8.audioState(), g: ${gain} })`);
  s.check(b3.a.beeping && b3.g > 0.5, `al sacar el silencio vuelve a sonar (${b3.g.toFixed(3)})`, JSON.stringify(b3));
  await page.click('.tagline');
  await page.press('Space');
  await sleep(250);
  const b4 = await page.ev(`({ a: window.chip8.audioState(), g: ${gain}, paused: window.chip8.isPaused() })`);
  s.check(b4.paused && !b4.a.beeping && b4.g < 0.01, `en pausa: silencio (ganancia ${b4.g.toFixed(4)}, ST=${b4.a.soundTimer})`, JSON.stringify(b4));
  await page.press('Space');
  await sleep(250);
  const b5 = await page.ev(`({ a: window.chip8.audioState(), g: ${gain} })`);
  s.check(b5.a.beeping && b5.g > 0.5, 'al continuar vuelve a sonar', JSON.stringify(b5));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 13 -------------------------------------------------------------------------------
scenario(13, 'Monitor: Paso, desensamblado, registros, pila, Frame y ocultar', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // 200: LD V0,05  202: LD V1,07  204: CALL 20A  206: JP 206  208: --  20A: LD V2,01  20C: JP 20C
  const rom = writeFixture(ctx, 'monitor.ch8', [0x60, 0x05, 0x61, 0x07, 0x22, 0x0A, 0x12, 0x06, 0x00, 0x00, 0x62, 0x01, 0x12, 0x0C]);
  await page.setFiles('#file-input', [rom]);
  await page.waitFor("document.getElementById('cart-name').textContent === 'monitor.ch8'", { timeout: 3000 });
  await page.click('#btn-pause');
  await page.click('#btn-reset');
  await sleep(80);
  const mon = () => page.ev(`({ pc: document.getElementById('mon-pc').textContent, row: document.querySelector('#disasm li.is-pc .d-addr').textContent, rowText: document.querySelector('#disasm li.is-pc .d-text').textContent, chg: Array.from(document.querySelectorAll('#vgrid .vcell')).map((c, i) => c.classList.contains('is-chg') ? i : -1).filter((i) => i >= 0), v: Array.from(document.querySelectorAll('#vgrid .vcell span')).slice(0, 3).map((e) => e.textContent), sp: document.getElementById('mon-sp').textContent, stack0: document.querySelector('#stack li .s-val').textContent, top: document.querySelector('#stack li.is-top .s-val') && document.querySelector('#stack li.is-top .s-val').textContent, instr: document.getElementById('mon-instr').textContent, badge: document.getElementById('mon-badge').textContent, paused: window.chip8.isPaused() })`);
  const stepClick = async () => { await page.click('#btn-step'); await sleep(80); };
  const m0 = await mon();
  s.check(m0.paused && m0.pc === '0x200' && m0.row === '0x200', `pausado y reiniciado: PC ${m0.pc}, fila resaltada ${m0.row} (${m0.rowText}), monitor «${m0.badge}»`, JSON.stringify(m0));
  await stepClick();
  const m1 = await mon();
  s.check(m1.pc === '0x202' && m1.row === '0x202' && m1.v[0] === '05' && m1.chg.join() === '0', `Paso 1: PC ${m1.pc}, fila ${m1.row}, V0=${m1.v[0]} resaltado (cambiados: ${m1.chg.join(',')})`, JSON.stringify(m1));
  await stepClick();
  const m2 = await mon();
  s.check(m2.pc === '0x204' && m2.v[1] === '07' && m2.chg.join() === '1', `Paso 2: PC ${m2.pc}, V1=${m2.v[1]} resaltado y V0 ya no (cambiados: ${m2.chg.join(',')})`, JSON.stringify(m2));
  await stepClick();
  const m3 = await mon();
  s.check(m3.pc === '0x20A' && m3.row === '0x20A' && m3.sp === '1' && m3.stack0 === '0x206' && m3.top === '0x206', `Paso 3 (CALL): PC ${m3.pc}, SP ${m3.sp}, la pila muestra ${m3.stack0} como tope`, JSON.stringify(m3));
  // Los títulos DESENSAMBLADO y PILA no quedan pegados a la grilla de registros.
  const gaps = await page.ev(`(() => { const g = document.getElementById('vgrid').getBoundingClientRect(); return Array.from(document.querySelectorAll('#mon-body h3')).filter((h) => /DESENSAMBLADO|PILA/.test(h.textContent)).map((h) => Math.round(h.getBoundingClientRect().top - g.bottom)); })()`);
  s.check(gaps.length === 2 && gaps.every((g) => g >= 8), `DESENSAMBLADO y PILA tienen aire sobre la grilla de registros (${gaps.join(' y ')} px)`, JSON.stringify(gaps));
  await page.shot('13-monitor-call');
  await stepClick();
  const m4 = await mon();
  s.check(m4.pc === '0x20C' && m4.v[2] === '01' && m4.chg.join() === '2', `Paso 4: V2=${m4.v[2]} resaltado`, JSON.stringify(m4));
  const i0 = await page.ev(`${E2E}.instr`);
  await page.click('#btn-frame');
  await sleep(80);
  const i1 = await page.ev(`${E2E}.instr`);
  const m5 = await mon();
  s.check(i1 - i0 === 15 && m5.paused && m5.instr === String(4 + 15), `Frame ejecuta un frame (15 instrucciones con IPF 15) y sigue en pausa (contador ${m5.instr})`, JSON.stringify({ d: i1 - i0, m5 }));
  await page.click('#mon-toggle');
  await sleep(60);
  const h1 = await page.ev("({ hidden: document.getElementById('mon-body').hidden, visible: document.getElementById('mon-body').getBoundingClientRect().height > 0, label: document.getElementById('mon-toggle-label').textContent, exp: document.getElementById('mon-toggle').getAttribute('aria-expanded') })");
  await page.shot('13-monitor-oculto');
  await page.click('#mon-toggle');
  await sleep(60);
  const h2 = await page.ev("({ hidden: document.getElementById('mon-body').hidden, visible: document.getElementById('mon-body').getBoundingClientRect().height > 0, label: document.getElementById('mon-toggle-label').textContent })");
  s.check(h1.hidden && !h1.visible && h1.label === 'Mostrar' && h1.exp === 'false', 'Ocultar esconde el cuerpo del monitor', JSON.stringify(h1));
  s.check(!h2.hidden && h2.visible && h2.label === 'Ocultar', 'Mostrar lo vuelve a mostrar', JSON.stringify(h2));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 14 -------------------------------------------------------------------------------
scenario(14, 'Error de ejecución: opcode inválido 5121 y recuperación', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // 200: LD V0, K   202: 5121 (inválido)
  const rom = writeFixture(ctx, 'invalido.ch8', [0xF0, 0x0A, 0x51, 0x21]);
  await page.setFiles('#file-input', [rom]);
  await page.waitFor("document.getElementById('cart-name').textContent === 'invalido.ch8'", { timeout: 3000 });
  await page.click('.tagline');
  await page.waitFor('window.chip8.cpu.waitingForKey', { timeout: 2000, desc: 'esperando tecla (FX0A)' });
  const waitTag = await page.ev("!document.getElementById('tag-wait').hidden");
  s.check(waitTag, 'la pantalla muestra «ESPERANDO TECLA» mientras corre FX0A');
  await page.press('KeyX', 80);
  await page.waitFor('window.chip8.cpu.halted', { timeout: 2000, desc: 'la máquina se detiene' });
  await sleep(150);
  const e = await page.ev(`({ crt: !document.getElementById('crt-msg').hidden, title: document.getElementById('crt-msg-title').textContent, text: document.getElementById('crt-msg-text').textContent, hint: document.getElementById('crt-msg-hint').textContent, mon: !document.getElementById('mon-error').hidden, monText: document.getElementById('mon-error').textContent, badge: document.getElementById('mon-badge').textContent, pc: window.chip8.cpu.pc, dis: ['btn-pause', 'btn-step', 'btn-frame', 'btn-reset'].map((id) => document.getElementById(id).disabled) })`);
  s.info(`Mensaje: «${e.text}» / «${e.hint}»`);
  s.check(e.crt && /5121/.test(e.text) && /202/.test(e.text) && /opcode|instrucci/i.test(e.text), 'el CRT muestra el error en castellano con el opcode 5121 y la dirección 202', JSON.stringify(e));
  s.check(e.mon && e.monText === e.text && e.badge === 'Error', 'el monitor muestra el mismo error y el estado «Error»', JSON.stringify(e));
  s.check(e.pc === 0x202, `PC queda en la instrucción culpable (${hx(e.pc)})`);
  s.check(e.dis[0] && e.dis[1] && e.dis[2] && !e.dis[3], 'Pausa, Paso y Frame quedan deshabilitados; Reiniciar habilitado', JSON.stringify(e.dis));
  // El error se anuncia una sola vez, por la línea de estado: sin aviso flotante ni role=alert.
  const ann = await page.ev(`({ status: document.getElementById('status').textContent, toasts: document.querySelectorAll('#toasts .toast').length, alerts: document.querySelectorAll('[role="alert"]').length })`);
  s.check(ann.status === 'Error: ' + e.text && ann.toasts === 0 && ann.alerts === 0, `el error se anuncia una vez en la línea de estado («${ann.status.slice(0, 40)}…»), sin aviso flotante ni role=alert`, JSON.stringify(ann));
  await page.shot('14-error');
  await page.press('Space');
  await page.press('KeyN');
  await sleep(80);
  s.check(await page.ev('window.chip8.cpu.halted && !document.getElementById("crt-msg").hidden'), 'Espacio y N no sacan a la máquina del error');
  await page.click('#btn-reset');
  await sleep(200);
  const r = await page.ev(`({ crt: !document.getElementById('crt-msg').hidden, mon: !document.getElementById('mon-error').hidden, halted: window.chip8.cpu.halted, wait: window.chip8.cpu.waitingForKey, paused: window.chip8.isPaused(), dis: ['btn-pause', 'btn-step', 'btn-frame', 'btn-reset'].map((id) => document.getElementById(id).disabled), badge: document.getElementById('mon-badge').textContent })`);
  s.check(!r.crt && !r.mon && !r.halted && r.wait && !r.paused && r.dis.every((d) => !d), `estaba corriendo: Reiniciar borra el error y vuelve a correr (monitor: «${r.badge}»)`, JSON.stringify(r));
  await page.shot('14-recuperado');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 15 -------------------------------------------------------------------------------
scenario(15, 'Diseño adaptable (360 a 1440 px) y nitidez con escala 1,25 y 2', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const measure = () => page.ev(`(() => {
    const keys = Array.from(document.querySelectorAll('#keypad .key')).map((k) => k.getBoundingClientRect());
    const c = document.getElementById('screen').getBoundingClientRect();
    const cv = document.getElementById('screen');
    const over = [];
    document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed') over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className).slice(0, 40)); });
    const cs = document.getElementById('cart-size');
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, cartSize: { text: cs.textContent, sw: cs.scrollWidth, cw: cs.clientWidth }, minKey: Math.min(...keys.map((k) => Math.min(k.width, k.height))), canvas: { l: c.left, r: c.right, w: c.width, h: c.height, t: c.top }, back: [cv.width, cv.height], dpr: devicePixelRatio, over: over.slice(0, 6) };
  })()`);
  for (const w of [360, 414, 768, 1024, 1440]) {
    const mobile = w <= 414;
    await page.setViewport(w, mobile ? 800 : 900, 1, mobile);
    await page.reload();
    await sleep(400);
    const m = await measure();
    s.check(m.sw <= m.iw, `${w}px: sin scroll horizontal (scrollWidth ${m.sw} ≤ ${m.iw})`, 'se salen: ' + m.over.join(', '));
    s.check(m.minKey >= 44, `${w}px: teclas del keypad de al menos 44 px (mínimo ${m.minKey.toFixed(1)})`);
    s.check(m.cartSize.sw <= m.cartSize.cw + 1, `${w}px: la etiqueta del cartucho se lee entera («${m.cartSize.text}»)`, JSON.stringify(m.cartSize));
    s.check(m.canvas.w > 0 && m.canvas.h > 0 && m.canvas.l >= 0 && m.canvas.r <= m.iw + 0.5, `${w}px: la pantalla se ve entera (${m.canvas.w.toFixed(0)}×${m.canvas.h.toFixed(0)} CSS px)`, JSON.stringify(m.canvas));
    await page.ev('window.scrollTo(0, 0)');
    await page.shot(`15-ancho-${w}`);
    await page.shot(`15-ancho-${w}-completa`, { fullPage: true });
  }
  for (const dpr of [1.25, 2]) {
    await page.setViewport(1024, 900, dpr, false);
    await page.reload();
    await sleep(400);
    const m = await measure();
    const devW = m.canvas.w * m.dpr;
    const scale = m.back[0] / 64;
    const leftDev = m.canvas.l * m.dpr;
    s.info(`DPR ${dpr}: lienzo ${m.back[0]}×${m.back[1]} (escala ${scale} px físicos por píxel), CSS ${m.canvas.w.toFixed(2)}×${m.canvas.h.toFixed(2)} = ${devW.toFixed(2)} px físicos, borde izquierdo en x=${leftDev.toFixed(2)} físico`);
    s.check(Number.isInteger(scale) && Math.abs(devW - m.back[0]) < 0.5 && Math.abs(m.canvas.h * m.dpr - m.back[1]) < 0.5, `DPR ${dpr}: el lienzo coincide 1:1 con los píxeles físicos (cada píxel CHIP-8 = ${scale}×${scale})`, `CSS×DPR ${devW.toFixed(2)} vs ${m.back[0]}`);
    await page.ev('window.scrollTo(0, 0)');
    await page.shot(`15-dpr-${String(dpr).replace('.', '_')}`);
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 16 -------------------------------------------------------------------------------
scenario(16, 'prefers-reduced-motion apaga los parpadeos y animaciones', async (ctx, s) => {
  const probe = (page) => page.ev(`(() => {
    const a = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { anim: cs.animationName, tr: cs.transitionDuration }; };
    return { led: a('#led-run'), ledCls: document.getElementById('led-run').className, hint: a('#audio-hint'), hintCls: document.getElementById('audio-hint').className, badge: a('#mon-badge'), glare: a('.crt-glare'), key: a('#keypad .key') };
  })()`);
  const waitRom = [0xF0, 0x0A, 0x12, 0x00];
  const results = {};
  for (const reduce of [false, true]) {
    const page = await freshApp(ctx, s, { media: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
    await page.ev(`window.chip8.loadRomBytes(${JSON.stringify(waitRom)}, 'espera')`);
    await page.waitFor("document.getElementById('led-run').classList.contains('is-blink')", { timeout: 2000, desc: 'LED RUN parpadeando (esperando tecla)' });
    results[reduce] = await probe(page);
    await page.shot(reduce ? '16-movimiento-reducido' : '16-movimiento-normal');
    s.check(page.errors.length === 0, `sin errores de consola (${reduce ? 'reduce' : 'normal'})`, page.errors.join(' | '));
    await page.close();
  }
  const n = results[false], r = results[true];
  s.info(`Normal: LED ${n.led.anim}, aviso de sonido ${n.hint.anim}, estado ${n.badge.anim}, reflejo ${n.glare.anim}, transición de tecla ${n.key.tr}`);
  s.info(`Reducido: LED ${r.led.anim}, aviso de sonido ${r.hint.anim}, estado ${r.badge.anim}, reflejo ${r.glare.anim}, transición de tecla ${r.key.tr}`);
  s.check(n.led.anim !== 'none' && n.hint.anim !== 'none', 'sin preferencia: el LED RUN y el aviso de sonido parpadean', JSON.stringify(n));
  s.check(r.led.anim === 'none' && r.hint.anim === 'none' && r.badge.anim === 'none' && r.glare.anim === 'none', 'con prefers-reduced-motion: LED, aviso, estado y reflejo sin animación', JSON.stringify(r));
  s.check(/^0s(, 0s)*$/.test(r.key.tr), `con prefers-reduced-motion: las teclas no tienen transición (${r.key.tr})`);
});

// 17 -------------------------------------------------------------------------------
scenario(17, 'Pestaña oculta o congelada: al volver no se recupera el atraso', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await page.ev("window.__e2eVis = []; document.addEventListener('visibilitychange', () => window.__e2eVis.push(document.visibilityState + '@' + Math.round(performance.now())));");
  await page.ev("window.chip8.loadRomBytes([0x60, 0xFF, 0xF0, 0x15, 0x70, 0x01, 0x12, 0x04], 'dt')"); // DT = 255, V0++ en bucle
  await page.instrument();
  await sleep(500);

  // Mide con las marcas de tiempo de cada runFrame (reloj de la página). Lo que importa es qué
  // pasa después del último hueco sin frames (más de 250 ms quieta): Chrome a veces congela solo
  // una parte del tiempo pedido, o de a tramos, así que se mide desde el final de ese hueco y no
  // desde el momento en que se la volvió a activar.
  async function trial(label, hide, show, probeMid) {
    const a = await page.ev(`({ dt: window.chip8.cpu.delayTimer, now: performance.now() })`);
    const nodeA = Date.now();
    await hide();
    const tHide = Date.now();
    await sleep(2000);
    const mid = probeMid ? await page.ev('document.visibilityState', 10000).catch(() => null) : null;
    await show();
    const tShow = Date.now();
    await sleep(1300);
    const b = await page.ev(`({ dt: window.chip8.cpu.delayTimer, now: performance.now(), times: ${E2E}.times.slice() })`);
    const hs = a.now + (tHide - nodeA), he = a.now + (tShow - nodeA);
    const T = b.times;
    const inRange = (lo, hi) => T.filter((t) => t >= lo && t < hi).length;
    const during = inRange(hs + 100, he - 100);
    // Huecos de más de 250 ms: cuánto estuvo quieta en total (a veces Chrome deja pasar un frame
    // suelto en medio de la congelación) y dónde termina el último.
    let gap = 0, gapEnd = he, stall = 0, stalls = 0, prev = null;
    for (const t of T) {
      if (t >= hs - 50 && prev !== null && t - prev > 250) { gap = t - prev; gapEnd = t; stall += gap; stalls++; }
      prev = t;
    }
    const first = inRange(gapEnd, gapEnd + 250);
    const after = inRange(gapEnd, gapEnd + 1000);
    let burst = 0;
    for (let i = 0; i < T.length; i++) {
      if (T[i] < gapEnd) continue;
      let j = i;
      while (j + 1 < T.length && T[j + 1] - T[i] < 5) j++;
      burst = Math.max(burst, j - i + 1);
    }
    const r = { hiddenSecs: (tShow - tHide) / 1000, during, gap: Math.round(gap), stall: Math.round(stall), stalls, fits: gapEnd + 1000 <= b.now, first, after, burst, vis: mid, dtDrop: a.dt - b.dt };
    s.info(`${label}: ${r.hiddenSecs.toFixed(1)} s${mid ? ' (estado «' + mid + '»)' : ''}, ${during} frames mientras tanto, quieta ${r.stall} ms en ${stalls} tramo(s), el último de ${r.gap} ms; después de ese tramo: ${first} frames en 0,25 s y ${after} en 1 s (ráfaga máxima ${burst}); DT bajó ${r.dtDrop} en total`);
    return r;
  }
  const noBacklog = (r) => r.fits && r.first <= 22 && r.after >= 15 && r.after <= 75 && r.burst <= 4;

  // a) Congelar la página (Page.setWebLifecycleState). Chrome a veces ignora el pedido con la
  // pestaña visible; entonces se prueba ocultándola primero (como una pestaña en segundo plano).
  let fz = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const alsoHide = attempt > 1;
    let bg = null;
    fz = await trial(`Congelada${alsoHide ? ' y oculta' : ''} (intento ${attempt})`, async () => {
      if (alsoHide) {
        bg = (await ctx.browser.cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
        await ctx.browser.cdp.send('Target.activateTarget', { targetId: bg });
      }
      await page.send('Page.setWebLifecycleState', { state: 'frozen' });
    }, async () => {
      await page.send('Page.setWebLifecycleState', { state: 'active' });
      if (bg) {
        await ctx.browser.cdp.send('Target.activateTarget', { targetId: page.targetId });
        await ctx.browser.cdp.send('Target.closeTarget', { targetId: bg }).catch(() => {});
      }
    }, false);
    if (fz.stall >= 1000 && fz.fits) break;
    await sleep(300);
  }
  if (fz.stall >= 1000 && fz.fits) {
    s.check(noBacklog(fz), `congelada (${(fz.stall / 1000).toFixed(1)} s sin frames, el último tramo de ${(fz.gap / 1000).toFixed(1)} s): al volver no se pone al día (${fz.first} frames en 0,25 s, ${fz.after} en 1 s, ≈60 y no ≈180)`, JSON.stringify(fz));
  } else {
    s.info('El navegador no llegó a congelar la página ni un segundo: esa variante no se evalúa.');
  }

  // b) Ocultar la pestaña activando otra.
  let other = null;
  const hd = await trial('Oculta', async () => {
    const { targetId } = await ctx.browser.cdp.send('Target.createTarget', { url: 'about:blank' });
    other = targetId;
    await ctx.browser.cdp.send('Target.activateTarget', { targetId });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  }, async () => {
    await ctx.browser.cdp.send('Target.activateTarget', { targetId: page.targetId });
    await ctx.browser.cdp.send('Target.closeTarget', { targetId: other }).catch(() => {});
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  }, true);
  const vis = await page.ev('window.__e2eVis');
  s.info('visibilitychange: ' + (vis.length ? vis.join(', ') : '(ninguno)'));
  s.check(hd.vis === 'hidden' && vis.length >= 2, `la pestaña llegó a ocultarse (estado «${hd.vis}») y volvió`);
  s.check(hd.during <= 20 && hd.stall >= 1500, `oculta: casi no corre mientras está oculta (${hd.during} frames en 2 s, ${(hd.stall / 1000).toFixed(1)} s sin frames)`, JSON.stringify(hd));
  s.check(noBacklog(hd), `oculta 2 s: al volver no se pone al día (${hd.first} frames en 0,25 s, ${hd.after} en 1 s, ≈60 y no ≈180)`, JSON.stringify(hd));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// Lee el lienzo #screen píxel por píxel: cuántos colores distintos hay, cuántos píxeles físicos
// no son exactamente el color que les toca según cpu.display (fondo o encendido de la paleta) y
// cuántas celdas CHIP-8 tienen en el centro un brillo intermedio (la estela del fósforo).
const SCREEN_PIXELS_EXPR = `(() => {
  const cv = document.getElementById('screen');
  const W = cv.width, H = cv.height, sc = W / 64;
  const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const crt = document.getElementById('crt');
  const rgb = (v) => { const m = /(\\d+)\\D+(\\d+)\\D+(\\d+)/.exec(v || ''); return m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : -1; };
  const bg = rgb(crt.style.getPropertyValue('--scr-bg')), on = rgb(crt.style.getPropertyValue('--scr-fg'));
  const disp = window.chip8.cpu.display;
  const colors = new Map();
  let wrong = 0, mid = 0, lit = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      colors.set(c, (colors.get(c) || 0) + 1);
      if (c !== (disp[Math.floor(y / sc) * 64 + Math.floor(x / sc)] ? on : bg)) wrong++;
    }
  }
  for (let cy = 0; cy < 32; cy++) {
    for (let cx = 0; cx < 64; cx++) {
      const x = Math.floor((cx + 0.5) * sc), y = Math.floor((cy + 0.5) * sc), i = (y * W + x) * 4;
      const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (c !== bg && c !== on) mid++;
      if (disp[cy * 64 + cx]) lit++;
    }
  }
  const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
  return { distinct: colors.size, wrong, mid, lit, bg: hex6(bg), on: hex6(on), scale: sc, size: [W, H], only: colors.size <= 2 ? Array.from(colors.keys()).map(hex6) : null };
})()`;

// 18 -------------------------------------------------------------------------------
scenario(18, 'Modo de pantalla: Tubo CRT y Píxeles puros (mouse, recarga y flechas)', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const look = () => page.ev(`(() => {
    const crt = document.getElementById('crt');
    const disp = (sel) => getComputedStyle(document.querySelector(sel)).display;
    const seg = (m) => document.querySelector('#screen-mode .seg[data-mode="' + m + '"]');
    const ae = document.activeElement;
    return { mode: window.chip8.getScreenMode(), data: crt.getAttribute('data-mode'), crtChecked: seg('crt').getAttribute('aria-checked'), puroChecked: seg('puro').getAttribute('aria-checked'),
      tabs: [seg('crt').tabIndex, seg('puro').tabIndex], glow: disp('#glow'), vignette: disp('.crt-vignette'), glare: disp('.crt-glare'),
      scanDis: document.getElementById('tg-scan').disabled, persistDis: document.getElementById('tg-persist').disabled,
      scan: document.getElementById('tg-scan').getAttribute('aria-pressed'), persist: document.getElementById('tg-persist').getAttribute('aria-pressed'),
      focus: ae && ae.getAttribute ? ae.getAttribute('data-mode') : null };
  })()`);
  const effectsOn = (l) => l.glow !== 'none' && l.vignette !== 'none' && l.glare !== 'none';
  const effectsOff = (l) => l.glow === 'none' && l.vignette === 'none' && l.glare === 'none';
  const isCrt = (l) => l.mode === 'crt' && l.data === 'crt' && l.crtChecked === 'true' && l.puroChecked === 'false' && effectsOn(l) && !l.scanDis && !l.persistDis;
  const isPuro = (l) => l.mode === 'puro' && l.data === 'puro' && l.puroChecked === 'true' && l.crtChecked === 'false' && effectsOff(l) && l.scanDis && l.persistDis;
  // Varias muestras del lienzo mientras corre Rebote.
  const sample = async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) { out.push(await page.ev(SCREEN_PIXELS_EXPR)); await sleep(70); }
    return out;
  };

  await clickCart(page, 'rebote');
  await sleep(400);
  const l0 = await look();
  s.check(isCrt(l0) && l0.scan === 'true' && l0.persist === 'true', 'de fábrica: Tubo CRT con resplandor, viñeta y reflejo; Scanlines y Persistencia activos', JSON.stringify(l0));
  const c0 = await sample(10);
  const trail = Math.max(...c0.map((p) => p.mid)), crtColors = Math.max(...c0.map((p) => p.distinct));
  s.check(trail > 0 && crtColors > 2, `Tubo CRT con Rebote: la pelota deja estela (hasta ${trail} celdas a medio apagar) y el lienzo tiene más de dos colores (${crtColors})`);
  await page.rect('#crt');
  await page.shot('18-modo-crt');

  // Clic con el mouse en «Píxeles puros».
  await page.click('#screen-mode .seg[data-mode="puro"]');
  await sleep(150);
  const l1 = await look();
  s.check(isPuro(l1), 'clic en «Píxeles puros»: queda elegido y desaparecen el resplandor, la viñeta y el reflejo', JSON.stringify(l1));
  s.check(l1.scanDis && l1.persistDis && l1.scan === 'true' && l1.persist === 'true', 'en Píxeles puros, Scanlines y Persistencia quedan deshabilitados y conservan su preferencia (siguen «activos»)', JSON.stringify(l1));
  const p1 = await sample(10);
  const bad1 = p1.filter((p) => p.distinct > 2 || p.wrong || p.mid).map((p) => JSON.stringify({ colores: p.distinct, distintos: p.wrong, estela: p.mid }));
  s.check(bad1.length === 0 && p1.some((p) => p.lit > 0), `Píxeles puros con Rebote corriendo: en 10 muestras hay solo fondo y encendido (${p1[0].bg} y ${p1[0].on}), cada píxel físico coincide con cpu.display y no queda estela`, bad1.join(' '));
  await page.click('#tg-scan');
  await sleep(60);
  s.check((await page.ev("document.getElementById('tg-scan').getAttribute('aria-pressed')")) === 'true', 'un clic en Scanlines deshabilitado no lo cambia');

  // Imagen fija: dos colores exactos, en cada paleta.
  await clickCart(page, 'fuente');
  await sleep(300);
  const pf = await page.ev(SCREEN_PIXELS_EXPR);
  s.check(pf.distinct === 2 && pf.wrong === 0 && pf.lit > 0 && pf.only.includes(pf.bg) && pf.only.includes(pf.on), `Píxeles puros con Fuente: lienzo de ${pf.size.join('×')} (escala ${pf.scale}), exactamente dos colores (${(pf.only || []).join(', ')}) y 0 píxeles fuera de lugar`, JSON.stringify(pf));
  await page.rect('#crt');
  await page.shot('18-modo-puro');
  const palBad = [];
  for (const pal of ['ambar', 'blanco', 'lcd', 'fosforo']) {
    await chooseSelect(page, '#palette', pal);
    await sleep(120);
    const p = await page.ev(SCREEN_PIXELS_EXPR);
    if (p.distinct !== 2 || p.wrong) palBad.push(`${pal}: ${p.distinct} colores, ${p.wrong} fuera de lugar`);
    if (pal === 'lcd') await page.shot('18-modo-puro-lcd');
  }
  s.check(palBad.length === 0, 'Píxeles puros con las paletas Ámbar, Blanco, LCD y Verde fósforo: siempre dos colores exactos', palBad.join('; '));

  // La elección sobrevive a una recarga.
  await page.reload();
  await page.instrument();
  await sleep(400);
  const l2 = await look();
  const p2 = await page.ev(SCREEN_PIXELS_EXPR);
  s.check(isPuro(l2) && l2.tabs.join() === '-1,0', 'después de recargar sigue en Píxeles puros (y el grupo tiene el foco de Tab en esa opción)', JSON.stringify(l2));
  s.check(p2.distinct <= 2 && p2.wrong === 0 && p2.mid === 0, `después de recargar el lienzo sigue con dos colores exactos (${p2.distinct}, ${p2.wrong} fuera de lugar)`, JSON.stringify(p2));

  // Con el teclado: Tab entra al grupo por la opción elegida y las flechas cambian el modo.
  await page.ev("document.querySelector('#ipf-chips .chip:last-child').focus()");
  await page.press('Tab');
  await sleep(50);
  const f0 = await look();
  s.check(f0.focus === 'puro', `Tab desde el último botón de velocidad entra al grupo por «Píxeles puros» (foco: ${f0.focus})`);
  await page.press('ArrowRight');
  await sleep(150);
  const l3 = await look();
  const p3 = await page.ev(SCREEN_PIXELS_EXPR);
  s.check(isCrt(l3) && l3.focus === 'crt' && l3.tabs.join() === '0,-1', 'Flecha derecha: pasa a Tubo CRT, el foco sigue a la opción y vuelven los efectos', JSON.stringify(l3));
  s.check(p3.distinct > 2, `en Tubo CRT vuelven las scanlines (${p3.distinct} colores en el lienzo)`);
  await page.press('ArrowLeft');
  await sleep(150);
  const l4 = await look();
  s.check(isPuro(l4) && l4.focus === 'puro', 'Flecha izquierda: vuelve a Píxeles puros', JSON.stringify(l4));
  await page.press('ArrowDown');
  await sleep(150);
  const l5 = await look();
  s.check(isCrt(l5) && l5.focus === 'crt' && (await page.ev('window.chip8.isPaused()')) === false, 'Flecha abajo: Tubo CRT otra vez (y las flechas no pausan ni tocan la máquina)', JSON.stringify(l5));
  // Clic de vuelta en «Tubo CRT» con el mouse después de pasar a puros.
  await page.click('#screen-mode .seg[data-mode="puro"]');
  await page.click('#screen-mode .seg[data-mode="crt"]');
  await sleep(150);
  const l6 = await look();
  s.check(isCrt(l6) && l6.scan === 'true' && l6.persist === 'true', 'clic en «Tubo CRT»: vuelven resplandor, viñeta, reflejo y los interruptores', JSON.stringify(l6));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 19 -------------------------------------------------------------------------------
scenario(19, 'Selector rápido de cartuchos bajo la ranura (1440×900, sin scrollear)', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  await sleep(300);
  const demos = await page.ev('window.chip8.demos.map((d) => ({ id: d.id, name: d.name, controls: d.controls, bytes: Array.from(d.bytes) }))');
  const chips = await page.ev("Array.from(document.querySelectorAll('#cart-chips .chip')).map((c) => c.textContent)");
  const picker = await page.ev("({ hidden: document.getElementById('cart-picker').hidden, label: document.getElementById('cart-chips-label').textContent, more: document.querySelector('#cart-picker .cart-more') && document.querySelector('#cart-picker .cart-more').textContent })");
  s.check(!picker.hidden && chips.length === demos.length && chips.every((t, i) => t === demos[i].name), `«${picker.label}» muestra un chip por demo (${chips.join(', ')}) y el enlace «${picker.more}»`, JSON.stringify({ picker, chips }));
  for (let i = 0; i < demos.length; i++) {
    const d = demos[i];
    const r = await page.rect(`#cart-chips .chip:nth-child(${i + 1})`, false);
    const vp = await page.ev('({ sy: scrollY, ih: innerHeight, iw: innerWidth })');
    const inView = vp.sy === 0 && r.y >= 0 && r.y + r.h <= vp.ih && r.x >= 0 && r.x + r.w <= vp.iw;
    await page.clickAt(r.cx, r.cy);
    const loaded = await page.poll(`document.getElementById('cart-name').textContent === ${JSON.stringify(d.name)}`, 3000);
    await sleep(80);
    const st = await page.ev(`(() => {
      const cc = document.getElementById('cart-controls'), b = cc.getBoundingClientRect(), m = window.chip8.cpu.memory;
      const chipEls = document.querySelectorAll('#cart-chips .chip');
      return { pressed: Array.from(chipEls).map((c) => c.getAttribute('aria-pressed')).join(''), shelf: Array.from(document.querySelectorAll('#shelf-list .cart')).map((c) => c.getAttribute('aria-pressed')).join(''),
        ctrl: cc.hidden ? null : cc.textContent, ctrlTop: b.top, ctrlBottom: b.bottom, rom: Array.from(m.slice(0x200, 0x200 + ${d.bytes.length})).join(','),
        sy: scrollY, focused: document.activeElement === chipEls[${i}], halted: window.chip8.cpu.halted, size: document.getElementById('cart-size').textContent };
    })()`);
    const want = demos.map((_, j) => (j === i ? 'true' : 'false')).join('');
    const wantCtrl = d.controls ? 'Controles: ' + d.controls : null;
    const ctrlInView = st.ctrl === null || (st.ctrlTop >= 0 && st.ctrlBottom <= vp.ih);
    s.check(inView && loaded && st.pressed === want && st.shelf === want && st.ctrl === wantCtrl && ctrlInView && st.rom === d.bytes.join(',') && st.sy === 0 && !st.focused && !st.halted,
      `chip «${d.name}»: visible sin scrollear, carga el demo («${st.size}»), queda marcado (también en el estante) y muestra «${(st.ctrl || '(sin controles)').slice(0, 48)}…»`,
      JSON.stringify({ inView, r, loaded, ...st, rom: st.rom === d.bytes.join(',') ? 'igual' : 'DISTINTA', wantCtrl }));
    if (i === 2) await page.shot('19-selector-cartuchos');
  }
  // «Detalles ↓» lleva al estante de abajo.
  const more = await page.rect('#cart-picker .cart-more', false);
  await page.clickAt(more.cx, more.cy);
  const reached = await page.poll("(() => { const b = document.getElementById('shelf-title').getBoundingClientRect(); return b.top >= -1 && b.bottom <= innerHeight && scrollY > 0; })()", 2000);
  const sy = await page.ev('scrollY');
  s.check(reached, `«Detalles ↓» baja hasta el estante «Cartuchos incluidos» (scroll ${Math.round(sy)} px)`);
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 20 -------------------------------------------------------------------------------
scenario(20, 'Selectores de perfil y paleta: el foco no se queda con las teclas del CHIP-8', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'teclado');
  await page.ev('window.scrollTo(0, 0)');
  const st = () => page.ev("({ ae: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, preset: document.getElementById('preset').value, palette: document.getElementById('palette').value, crtPal: document.getElementById('crt').getAttribute('data-palette'), quirks: Object.assign({}, window.chip8.cpu.quirks), help: document.getElementById('help').open, paused: window.chip8.isPaused() })");
  // Elegir con el mouse: el clic abre la lista desplegable y se elige ahí. En Chrome sin ventana
  // la lista no se puede cliquear por coordenadas; flechas + Enter la manejan, y esas teclas van
  // a la lista (no al <select>), igual que un clic sobre una opción.
  async function pickWithMouse(sel) {
    await page.click(sel);
    await sleep(200);
    await page.press('ArrowDown');
    await sleep(60);
    await page.press('Enter');
    await sleep(200);
  }
  // Teclas mapeadas cuyas letras, sin preventDefault, cambiarían la opción por búsqueda
  // (X → XO-CHIP, S → SUPER-CHIP, C → COSMAC VIP, V → Verde fósforo, A → Ámbar).
  const MAPPED = [['KeyX', 0x0], ['KeyS', 0x8], ['KeyC', 0xB], ['KeyV', 0xF], ['KeyA', 0x7], ['Digit1', 0x1]];
  async function keysReach() {
    const bad = [];
    for (const [code, k] of MAPPED) {
      await page.keyDown(code);
      await sleep(30);
      const d = await page.ev(KEYS_EXPR);
      await page.keyUp(code);
      await sleep(20);
      const u = await page.ev(KEYS_EXPR);
      if (!(d.every((v, j) => (j === k ? v === 1 : v === 0)) && u.every((v) => v === 0))) bad.push(`${code}: ${d.join('')} -> ${u.join('')}`);
    }
    return bad;
  }

  await pickWithMouse('#preset');
  const a = await st();
  s.check(a.preset === 'schip' && sameQuirks(a.quirks, presetQuirks('schip')) && a.ae !== 'preset', `perfil SUPER-CHIP elegido con el mouse: el selector suelta el foco (queda en ${a.ae})`, JSON.stringify(a));
  await pickWithMouse('#palette');
  const b = await st();
  s.check(b.palette === 'ambar' && b.crtPal === 'ambar' && b.ae !== 'palette', `paleta Ámbar elegida con el mouse: el selector suelta el foco (queda en ${b.ae})`, JSON.stringify(b));
  const bad1 = await keysReach();
  const b2 = await st();
  s.check(bad1.length === 0 && b2.preset === 'schip' && b2.palette === 'ambar', 'después de elegir con el mouse, X S C V A 1 aprietan sus teclas del CHIP-8 y los selectores no cambian', bad1.join('; ') + ' ' + JSON.stringify(b2));

  // Con el selector enfocado desde el teclado: las teclas mapeadas igual van al CHIP-8 y la
  // búsqueda por letra del <select> no cambia la opción.
  await page.ev("document.getElementById('volume').focus()");
  await page.press('Tab');
  const t1 = await st();
  const bad2 = await keysReach();
  const t2 = await st();
  s.check(t1.ae === 'preset' && bad2.length === 0 && t2.preset === 'schip' && t2.ae === 'preset' && sameQuirks(t2.quirks, presetQuirks('schip')), `con Perfil enfocado (Tab desde Volumen), X S C V A 1 van al CHIP-8 y el perfil sigue en ${t2.preset}`, bad2.join('; ') + ' ' + JSON.stringify(t2));
  await page.ev("document.getElementById('palette').focus()");
  const bad3 = await keysReach();
  const t3 = await st();
  s.check(bad3.length === 0 && t3.palette === 'ambar' && t3.ae === 'palette', `con Paleta enfocada, las mismas teclas van al CHIP-8 y la paleta sigue en ${t3.palette}`, bad3.join('; ') + ' ' + JSON.stringify(t3));

  // N, H y Retroceso con un selector enfocado.
  await page.ev("document.getElementById('preset').focus()");
  await page.press('KeyN'); // con la máquina corriendo, N la pausa (y ejecuta una)
  await sleep(60);
  const n0 = await counters(page);
  await page.press('KeyN');
  await sleep(60);
  await page.press('KeyN');
  await sleep(60);
  const n1 = await counters(page);
  const n1s = await st();
  s.check(n1s.paused && n1.steps === n0.steps + 2 && n1s.preset === 'schip', `con Perfil enfocado, N pausa y ejecuta de a una instrucción (+${n1.steps - n0.steps} pasos) sin cambiar el perfil`, JSON.stringify({ n1s, pasos: n1.steps - n0.steps }));
  await page.press('Backspace');
  await sleep(60);
  const n2 = await counters(page);
  s.check(n2.resets === n1.resets + 1 && (await st()).preset === 'schip', 'con Perfil enfocado, Retroceso reinicia una vez');
  await page.press('KeyH');
  await sleep(150);
  const h1 = await st();
  await page.press('Escape');
  await sleep(150);
  const h2 = await st();
  s.check(h1.help && !h2.help && h2.preset === 'schip', 'con Perfil enfocado, H abre la ayuda (y Esc la cierra)', JSON.stringify({ h1, h2 }));

  // Tab hasta Perfil y flechas: cambian la opción de forma nativa y el foco se queda.
  await page.ev("document.getElementById('volume').focus()");
  await page.press('Tab');
  await page.press('ArrowDown');
  await sleep(100);
  const r1 = await st();
  await page.press('ArrowUp');
  await sleep(100);
  const r2 = await st();
  s.check(r1.ae === 'preset' && r1.preset === 'xochip' && sameQuirks(r1.quirks, presetQuirks('xochip')), `Tab hasta Perfil + Flecha abajo: pasa a XO-CHIP (con sus quirks) y el foco se queda en el selector (${r1.ae})`, JSON.stringify(r1));
  s.check(r2.ae === 'preset' && r2.preset === 'schip' && sameQuirks(r2.quirks, presetQuirks('schip')), 'Flecha arriba: vuelve a SUPER-CHIP', JSON.stringify(r2));
  await page.shot('20-selectores');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 21 -------------------------------------------------------------------------------
scenario(21, 'Keypad con el teclado: Tab hasta una tecla y Enter o Espacio (FX0A la recibe)', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const WAIT_ROM = [0xF3, 0x0A, 0x12, 0x02]; // 200: LD V3, K   202: JP 202
  await page.ev(`window.chip8.loadRomBytes(${JSON.stringify(WAIT_ROM)}, 'espera-tecla')`);
  await page.waitFor('window.chip8.cpu.waitingForKey', { timeout: 2000, desc: 'esperando tecla (FX0A)' });
  // Registro con la hora exacta (reloj de la página) de cada tecla física y de cada cambio en cpu.setKey.
  await page.ev(`(() => {
    const c = window.chip8.cpu;
    window.__e2eKeyEv = [];
    ['keydown', 'keyup'].forEach((t) => document.addEventListener(t, (e) => window.__e2eKeyEv.push([t, e.code, performance.now()]), true));
    const log = c.__keyLog = [];
    const sk = c.setKey;
    c.setKey = function (k, down) { log.push([k, !!down, performance.now()]); return sk.apply(this, arguments); };
  })()`);
  await page.ev("document.getElementById('btn-reset').focus()");
  const order = [];
  for (let i = 0; i < 11; i++) {
    await page.press('Tab', 0);
    order.push(await page.ev('document.activeElement.dataset.key || document.activeElement.id'));
  }
  const want = KEYPAD_LAYOUT.slice(0, 11).map(String);
  s.check(order.join() === want.join(), `Tab desde Reiniciar recorre el keypad en orden (${order.map((k) => (/^\d+$/.test(k) ? Number(k).toString(16).toUpperCase() : k)).join(' ')}) y llega a la tecla 9`, order.join());
  const timing = async (code) => {
    const l = await page.ev('({ keys: window.chip8.cpu.__keyLog.slice(), ev: window.__e2eKeyEv.slice() })');
    const dn = l.keys.find((e) => e[0] === 9 && e[1]);
    const up = l.keys.find((e) => e[0] === 9 && !e[1] && dn && e[2] >= dn[2]);
    const kd = l.ev.find((e) => e[0] === 'keydown' && e[1] === code);
    const ku = l.ev.find((e) => e[0] === 'keyup' && e[1] === code);
    return { hold: dn && up ? Math.round(up[2] - dn[2]) : null, afterKeyUp: up && ku ? Math.round(up[2] - ku[2]) : null, physical: kd && ku ? Math.round(ku[2] - kd[2]) : null };
  };
  const clearLogs = () => page.ev('window.chip8.cpu.__keyLog.length = 0; window.__e2eKeyEv.length = 0; true');

  // Enter breve: la tecla se aprieta y se suelta sola después de ~120 ms.
  await clearLogs();
  const c0 = await counters(page);
  await page.keyDown('Enter');
  const d = await page.ev(`({ key: window.chip8.cpu.keys[9], cap: document.querySelector('#keypad .key[data-key="9"]').classList.contains('is-down') })`);
  await sleep(20);
  await page.keyUp('Enter');
  const still = await page.ev('window.chip8.cpu.keys[9]');
  await page.poll('window.chip8.cpu.keys[9] === 0', 1000);
  await sleep(120);
  const tm = await timing('Enter');
  const r = await page.ev(`({ v3: window.chip8.cpu.V[3], wait: window.chip8.cpu.waitingForKey, pc: window.chip8.cpu.pc, paused: window.chip8.isPaused(), key: window.chip8.cpu.keys[9], cap: document.querySelectorAll('#keypad .key.is-down').length, focus: document.activeElement.dataset.key, halted: window.chip8.cpu.halted })`);
  const c1 = await counters(page);
  s.info(`Enter: tecla física ${tm.physical} ms, tecla 9 apretada ${tm.hold} ms`);
  s.check(d.key === 1 && d.cap && still === 1, 'Enter sobre la tecla 9 enfocada la aprieta (y se ve apretada); soltar Enter enseguida no la suelta todavía', JSON.stringify({ d, still }));
  s.check(tm.hold !== null && tm.hold >= 110 && tm.hold <= 250, `la tecla 9 queda apretada ~120 ms aunque Enter duró ${tm.physical} ms (medido ${tm.hold} ms)`, JSON.stringify(tm));
  s.check(r.v3 === 9 && !r.wait && r.pc === 0x202 && r.key === 0 && r.cap === 0 && !r.halted, `FX0A recibió la tecla: V3 = ${r.v3}, PC ${hx(r.pc)}, ya no espera`, JSON.stringify(r));
  s.check(!r.paused && c1.resets === c0.resets && r.focus === '9', 'Enter no pausa, no reinicia y el foco sigue en la tecla 9', JSON.stringify({ r, reinicios: c1.resets - c0.resets }));

  // Espacio sostenido: la tecla queda apretada todo el rato y se suelta al soltar Espacio.
  await page.ev(`window.chip8.loadRomBytes(${JSON.stringify(WAIT_ROM)}, 'espera-tecla')`);
  await page.waitFor('window.chip8.cpu.waitingForKey', { timeout: 2000, desc: 'esperando tecla otra vez' });
  if ((await page.ev('document.activeElement.dataset.key')) !== '9') await page.ev("document.querySelector('#keypad .key[data-key=\"9\"]').focus()");
  await clearLogs();
  await page.keyDown('Space');
  await sleep(400);
  const mid = await page.ev('({ key: window.chip8.cpu.keys[9], wait: window.chip8.cpu.waitingForKey, paused: window.chip8.isPaused() })');
  await page.keyUp('Space');
  await page.poll('window.chip8.cpu.keys[9] === 0', 1000);
  await sleep(80);
  const tm2 = await timing('Space');
  const r2 = await page.ev('({ v3: window.chip8.cpu.V[3], wait: window.chip8.cpu.waitingForKey, paused: window.chip8.isPaused() })');
  s.info(`Espacio: tecla física ${tm2.physical} ms, tecla 9 apretada ${tm2.hold} ms, se soltó ${tm2.afterKeyUp} ms después de soltar Espacio`);
  s.check(mid.key === 1 && mid.wait && !mid.paused, 'Espacio sostenido sobre la tecla 9: sigue apretada (FX0A espera que se suelte) y la máquina no se pausa', JSON.stringify(mid));
  s.check(tm2.hold >= 380 && tm2.afterKeyUp !== null && tm2.afterKeyUp >= 0 && tm2.afterKeyUp < 60, `se suelta junto con Espacio (${tm2.afterKeyUp} ms después)`, JSON.stringify(tm2));
  s.check(r2.v3 === 9 && !r2.wait && !r2.paused, `FX0A recibió la tecla otra vez (V3 = ${r2.v3}) y la máquina sigue corriendo`, JSON.stringify(r2));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 22 -------------------------------------------------------------------------------
scenario(22, 'Error con la máquina en pausa o corriendo: Reiniciar respeta ese estado', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // 200: SKP V0 (salta si la tecla 0 está apretada)   202: JP 200   204: 5121 (inválido)
  // Sin tocar nada da vueltas para siempre; con X (tecla 0) apretada, va a la instrucción inválida.
  const rom = writeFixture(ctx, 'invalido-con-x.ch8', [0xE0, 0x9E, 0x12, 0x00, 0x51, 0x21]);
  await page.setFiles('#file-input', [rom]);
  await page.waitFor("document.getElementById('cart-name').textContent === 'invalido-con-x.ch8'", { timeout: 3000 });
  const view = () => page.ev(`({ pc: window.chip8.cpu.pc, halted: window.chip8.cpu.halted, paused: window.chip8.isPaused(), crt: !document.getElementById('crt-msg').hidden, tagPause: !document.getElementById('tag-pause').hidden, status: document.getElementById('status').textContent, dis: ['btn-pause', 'btn-step', 'btn-frame', 'btn-reset'].map((id) => document.getElementById(id).disabled), calls: ${E2E}.calls })`);
  await page.click('#btn-pause');
  await sleep(80);
  const p0 = await view();
  s.check(p0.paused && !p0.halted && (p0.pc === 0x200 || p0.pc === 0x202), `en pausa, dando vueltas en ${hx(p0.pc)}`, JSON.stringify(p0));
  // Con el mouse: Paso hasta la instrucción inválida, con X apretada.
  await page.keyDown('KeyX');
  let guard = 0;
  while (!(await page.ev('window.chip8.cpu.halted')) && guard++ < 6) {
    await page.click('#btn-step');
    await sleep(60);
  }
  await page.keyUp('KeyX');
  const e1 = await view();
  s.check(e1.halted && e1.pc === 0x204 && e1.crt && /^Error: .*5121/.test(e1.status), `Paso con X apretada llega al opcode inválido: se detiene en ${hx(e1.pc)} y la línea de estado dice «${e1.status.slice(0, 50)}…»`, JSON.stringify(e1));
  await page.click('.tagline');
  await page.press('KeyN');
  await sleep(60);
  const e2 = await view();
  s.check(e2.status === e1.status, 'N durante el error no pisa el mensaje de la línea de estado', JSON.stringify({ antes: e1.status, despues: e2.status }));
  await page.shot('22-error-en-pausa');
  await page.click('#btn-reset');
  await sleep(100);
  const r1 = await view();
  await sleep(600);
  const r1b = await view();
  s.check(!r1.halted && !r1.crt && r1.pc === 0x200 && r1.paused && r1.tagPause && !r1.dis[1] && /pausa/i.test(r1.status), `Reiniciar (mouse): vuelve a ${hx(r1.pc)} y sigue en pausa, con «PAUSA» en pantalla y Paso habilitado («${r1.status}»)`, JSON.stringify(r1));
  s.check(r1b.pc === 0x200 && r1b.calls === r1.calls, `sigue quieto en 0x200 (${r1b.calls - r1.calls} frames en 0,6 s)`, JSON.stringify(r1b));
  await page.click('#btn-step');
  await sleep(60);
  const r2 = await view();
  s.check(r2.pc === 0x202 && r2.paused && !r2.halted, `Paso sigue funcionando después de reiniciar (PC ${hx(r2.pc)})`, JSON.stringify(r2));
  await page.shot('22-reiniciado-en-pausa');

  // Lo mismo con el teclado: N hasta el error y Retroceso.
  await page.click('.tagline');
  await page.keyDown('KeyX');
  guard = 0;
  while (!(await page.ev('window.chip8.cpu.halted')) && guard++ < 6) {
    await page.press('KeyN');
    await sleep(40);
  }
  await page.keyUp('KeyX');
  const k1 = await view();
  await page.press('Backspace');
  await sleep(100);
  const k2 = await view();
  s.check(k1.halted && !k2.halted && k2.pc === 0x200 && k2.paused, `con el teclado (N hasta el error, después Retroceso): vuelve a 0x200 en pausa`, JSON.stringify({ k1, k2 }));

  // Error con la máquina corriendo: Reiniciar la deja corriendo.
  await page.keyDown('KeyX');
  await page.click('#btn-pause'); // continuar: con X apretada llega enseguida al error
  const halted = await page.poll('window.chip8.cpu.halted', 2000);
  await page.keyUp('KeyX');
  const g1 = await view();
  s.check(halted && g1.pc === 0x204 && g1.crt, `corriendo con X apretada: se detiene en ${hx(g1.pc)}`, JSON.stringify(g1));
  await page.click('#btn-reset');
  await sleep(100);
  const g2 = await view();
  await sleep(500);
  const g3 = await view();
  s.check(!g2.halted && !g2.paused && !g2.tagPause && g3.calls - g2.calls > 20 && !g3.halted && (g3.pc === 0x200 || g3.pc === 0x202), `estaba corriendo: Reiniciar la vuelve a poner en marcha (${g3.calls - g2.calls} frames en 0,5 s, «${g2.status}»)`, JSON.stringify({ g2, g3 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 23 -------------------------------------------------------------------------------
scenario(23, 'Ícono de la pestaña: embebido, sin pedidos que den 404 por http', async (ctx, s) => {
  const page = await Page.open(ctx);
  s.page = page;
  const net = [];
  const off = ctx.browser.cdp.on((m) => {
    if (m.sessionId !== page.sessionId) return;
    if (m.method === 'Network.responseReceived') net.push({ url: m.params.response.url.slice(0, 60), status: m.params.response.status });
    else if (m.method === 'Network.loadingFailed' && !m.params.canceled) net.push({ url: m.params.requestId, status: 'falló: ' + m.params.errorText });
  });
  try {
    await page.send('Network.enable');
    await clearStorage(page, ctx);
    const since = Date.now();
    await page.goto(ctx.base + 'chip8.html');
    await sleep(2500);
    const reqs = ctx.server.requests.filter((r) => r.at >= since);
    const icon = await page.ev(`(async () => {
      const l = document.querySelector('link[rel~="icon"]');
      if (!l) return null;
      const img = new Image();
      const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = l.href; });
      return { href: l.getAttribute('href').slice(0, 26), type: l.type, ok, w: img.naturalWidth, h: img.naturalHeight, links: document.querySelectorAll('link[rel~="icon"]').length };
    })()`);
    s.check(icon && /^data:image\/svg\+xml,/.test(icon.href) && icon.ok && icon.w > 0 && icon.h > 0, `la página declara su ícono embebido (${icon && icon.href}…, ${icon && icon.type}) y el navegador lo dibuja (${icon && icon.w}×${icon && icon.h})`, JSON.stringify(icon));
    const bad = reqs.filter((r) => r.status >= 400);
    const fav = reqs.filter((r) => /favicon/i.test(r.url));
    s.info('Pedidos al servidor: ' + reqs.map((r) => `${r.url} ${r.status}`).join(', '));
    s.check(reqs.some((r) => /chip8\.html/.test(r.url) && r.status === 200) && bad.length === 0 && fav.length === 0, `el servidor recibió ${reqs.length} pedido(s), ninguno con error y ninguno a /favicon.ico`, JSON.stringify(reqs));
    const netBad = net.filter((n) => typeof n.status !== 'number' || n.status >= 400);
    s.check(netBad.length === 0, `la página no ve respuestas con error en la red (${net.length} respuestas)`, JSON.stringify(netBad));
    s.check(page.favicon.length === 0 && page.errors.length === 0, 'sin errores de consola (ni por el ícono)', page.favicon.concat(page.errors).join(' | '));
  } finally {
    off();
  }
});

// 24 -------------------------------------------------------------------------------
scenario(24, 'Pantalla angosta: a 360×640 la pantalla y el keypad entero entran sin scrollear', async (ctx, s) => {
  for (const [w, h] of [[360, 640], [375, 667]]) {
    const page = await freshApp(ctx, s, { width: w, height: h, dpr: 2, mobile: true });
    await page.ev('window.scrollTo(0, 0)');
    await sleep(400);
    const m = await page.ev(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; };
      const keys = Array.from(document.querySelectorAll('#keypad .key')).map((k) => k.getBoundingClientRect());
      return { ih: innerHeight, iw: innerWidth, sy: scrollY, sw: document.documentElement.scrollWidth, crt: r(document.getElementById('crt')), screen: r(document.getElementById('screen')),
        keys: { t: Math.round(Math.min(...keys.map((k) => k.top))), b: Math.round(Math.max(...keys.map((k) => k.bottom))), l: Math.round(Math.min(...keys.map((k) => k.left))), r: Math.round(Math.max(...keys.map((k) => k.right))), min: Math.min(...keys.map((k) => Math.min(k.width, k.height))) },
        slot: r(document.getElementById('slot')).t, transport: r(document.getElementById('btn-pause')).t };
    })()`);
    s.info(`${w}×${h}: pantalla ${m.crt.t}–${m.crt.b} px, keypad ${m.keys.t}–${m.keys.b} px (teclas de ${m.keys.min.toFixed(0)} px), ranura en ${m.slot} px, transporte en ${m.transport} px`);
    s.check(m.sy === 0 && m.sw <= m.iw, `${w}×${h}: arranca arriba y sin scroll horizontal (${m.sw} ≤ ${m.iw})`, JSON.stringify(m));
    s.check(m.crt.t >= 0 && m.crt.b <= m.ih && m.screen.l >= 0 && m.screen.r <= m.iw, `${w}×${h}: la pantalla entra entera en la primera vista (${m.crt.t}–${m.crt.b} de ${m.ih})`, JSON.stringify(m.crt));
    s.check(m.keys.t >= m.crt.b && m.keys.b <= m.ih && m.keys.l >= 0 && m.keys.r <= m.iw, `${w}×${h}: las 16 teclas del keypad entran enteras debajo de la pantalla (${m.keys.t}–${m.keys.b} de ${m.ih})`, JSON.stringify(m.keys));
    s.check(m.keys.min >= 44, `${w}×${h}: teclas de al menos 44 px (${m.keys.min.toFixed(1)})`);
    s.check(m.slot >= m.keys.b && m.transport >= m.keys.b, `${w}×${h}: la ranura y el transporte quedan después del keypad`, JSON.stringify(m));
    await page.shot(`24-angosta-${w}x${h}`);
    s.check(page.errors.length === 0, `${w}×${h}: sin errores de consola`, page.errors.join(' | '));
    await page.close();
  }
});

// 25 -------------------------------------------------------------------------------
scenario(25, 'Plataformas: cada perfil trae su plataforma, la plataforma sola no toca los quirks y XO-CHIP dibuja 128×64 con cuatro colores', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const v0 = await consoleView(page);
  s.check(v0.platform === 'chip8' && v0.platSel === 'chip8' && v0.preset === 'vip' && v0.mode === 'CHIP-8 · 64×32' && v0.plate === 'MODELO VIP · 4 KB RAM · 64×32',
    `de fábrica: perfil COSMAC VIP con la plataforma CHIP-8 (MÁQUINA «${v0.mode}», placa «${v0.plate}»)`, JSON.stringify(v0));
  // Cada perfil elegido con el mouse: su plataforma, sus seis quirks y la ROM (Rebote) vuelve a empezar.
  const PROFILES = [
    ['schip', 'SUPER-CHIP', 'schip', 'SUPER-CHIP · 64×32', 'MODELO SUPER-CHIP · 4 KB RAM · 128×64', 4096],
    ['xochip', 'XO-CHIP', 'xochip', 'XO-CHIP · 64×32 · plano 1', 'MODELO XO-CHIP · 64 KB RAM · 128×64', 65536],
    ['vip', 'COSMAC VIP', 'chip8', 'CHIP-8 · 64×32', 'MODELO VIP · 4 KB RAM · 64×32', 4096],
  ];
  for (const [id, label, platform, mode, plate, mem] of PROFILES) {
    const c0 = await counters(page);
    const got = await chooseWithMouse(page, '#preset', id);
    await sleep(100);
    const v = await consoleView(page);
    const c1 = await counters(page);
    const ae = await page.ev('document.activeElement && document.activeElement.id');
    s.check(got === id && v.platform === platform && v.platSel === platform && v.mem === mem && sameQuirks(v.quirks, presetQuirks(id)) && v.mode === mode && v.plate === plate && c1.resets > c0.resets && /volvió a empezar/.test(v.status) && ae !== 'preset',
      `perfil ${label} elegido con el mouse: plataforma ${platform} (también en el selector «Plataforma»), sus seis quirks, la ROM vuelve a empezar; MÁQUINA «${v.mode}», placa «${v.plate}»`, JSON.stringify({ got, v, ae, reinicios: c1.resets - c0.resets }));
  }
  // La plataforma sola (con el perfil COSMAC VIP): cambia la máquina y no toca los quirks.
  const q0 = await page.ev('Object.assign({}, window.chip8.cpu.quirks)');
  const c2 = await counters(page);
  const gotP = await chooseWithMouse(page, '#platform', 'xochip');
  await sleep(100);
  const v1 = await consoleView(page);
  const c3 = await counters(page);
  s.check(gotP === 'xochip' && v1.platform === 'xochip' && v1.mem === 65536 && sameQuirks(v1.quirks, q0) && v1.preset === 'vip' && c3.resets > c2.resets && v1.status === 'Plataforma XO-CHIP: la ROM «Rebote» volvió a empezar.',
    `Plataforma XO-CHIP elegida con el mouse: 64 KB de memoria, los quirks no cambian (el perfil sigue en COSMAC VIP) y la ROM vuelve a empezar («${v1.status}»)`, JSON.stringify(v1));
  await page.click('#dip-bank .dip-col:nth-of-type(3) .dip'); // SHIFT
  const v2 = await consoleView(page);
  s.check(v2.platform === 'xochip' && v2.quirks.shifting === true && v2.preset === 'custom', 'el interruptor 3 (SHIFT) cambia un quirk y el perfil pasa a «Personalizado», pero la plataforma sigue en XO-CHIP', JSON.stringify(v2));
  // Una ROM de XO-CHIP en alta resolución: un cuadro en el plano 1, otro en el 2 y otro en los dos.
  await loadWithButton(page, writeFixture(ctx, 'cuatro-colores.ch8', romCuatroColores(CUADRO)), 'cuatro-colores.ch8');
  const four = await page.poll(`[1, 2, 3].every((v) => window.chip8.cpu.display.includes(v))`, 3000);
  await page.click('#screen-mode .seg[data-mode="puro"]');
  await sleep(150);
  const v3 = await consoleView(page);
  const colors = await page.ev('window.chip8.screenColors()');
  const m = await page.ev(canvasVsDisplayExpr(FOSFORO));
  s.check(four && v3.platform === 'xochip' && v3.res === '128×64' && v3.video === 'Video 128 × 64' && v3.mode === 'XO-CHIP · 128×64 · planos 1+2' && !v3.halted,
    `«cuatro-colores.ch8» (con «Cargar ROM») corre en XO-CHIP a 128×64 con píxeles en el plano 1, en el 2 y en los dos (MÁQUINA «${v3.mode}», bisel «${v3.video}»)`, JSON.stringify(v3));
  s.check(sameList(colors, sortedColors(FOSFORO)), `Píxeles puros con Verde fósforo: screenColors() da exactamente los cuatro colores de la paleta (${colors.join(' ')})`, JSON.stringify(colors));
  s.check(m.wrong === 0 && m.square && Number.isInteger(m.scale) && m.res.join('×') === '128×64', `cada píxel del lienzo (${m.size.join('×')}, escala ${m.scale}) tiene el color de su píxel en cpu.display (${m.wrong} distintos)`, m.first);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('25-xochip-cuatro-colores');
  const gotPal = await chooseWithMouse(page, '#palette', 'ambar');
  await sleep(100);
  const colors2 = await page.ev('window.chip8.screenColors()');
  const m2 = await page.ev(canvasVsDisplayExpr(AMBAR));
  s.check(gotPal === 'ambar' && sameList(colors2, sortedColors(AMBAR)) && m2.wrong === 0, `paleta Ámbar elegida con el mouse: los cuatro colores de Ámbar (${colors2.join(' ')}), cada píxel en su lugar`, JSON.stringify({ colors2, m2 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 26 -------------------------------------------------------------------------------
scenario(26, 'Una ROM de 4000 bytes pasa sola a XO-CHIP; una plataforma de 4 KB se rechaza con un aviso y el selector vuelve', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // 4000 bytes: el programa al principio y un cuadro al final, en 0x1198 (más allá de los 4 KB de CHIP-8).
  const prog = asm(`
LEJOS   EQU 0x1198
        LD I, LONG LEJOS
        LD V0, 28
        LD V1, 12
        DRW V0, V1, 8
fin:    JP fin`, true);
  const rom = new Uint8Array(4000);
  rom.set(prog);
  rom.set(CUADRO, 0x1198 - 0x200);
  await loadWithButton(page, writeFixture(ctx, 'grande-4000.ch8', rom), 'grande-4000.ch8');
  await page.poll('window.chip8.cpu.display.some((v) => v)', 2000);
  const st = () => page.ev(`(() => { const c = window.chip8.cpu, $ = (id) => document.getElementById(id); return { platform: c.platform, platSel: $('platform').value, preset: $('preset').value, quirks: Object.assign({}, c.quirks), I: c.I, lit: c.display.reduce((a, b) => a + (b ? 1 : 0), 0), halted: c.halted, mode: $('mon-mode').textContent, rom: c.rom.length }; })()`);
  const a = await st();
  const t = await toastsInfo(page);
  s.check(a.platform === 'xochip' && a.platSel === 'xochip' && a.preset === 'xochip' && sameQuirks(a.quirks, presetQuirks('xochip')) && a.rom === 4000,
    `la ROM de 4000 bytes (más de 3584) pasa sola al perfil XO-CHIP: plataforma y quirks (MÁQUINA «${a.mode}»)`, JSON.stringify(a));
  s.check(t.some((x) => x.kind === 'info' && x.text === 'La ROM «grande-4000.ch8» ocupa 4.000 bytes y solo entra en XO-CHIP (64 KB), así que pasé al perfil XO-CHIP.'),
    `aviso: «${t.map((x) => x.text).join(' | ')}»`, JSON.stringify(t));
  s.check(!a.halted && a.I === 0x1198 && a.lit === CUADRO_PIXELS, `corre sin error y dibuja el cuadro que está al final de la ROM, en 0x1198 (I = ${hx(a.I, 4)}, ${a.lit} píxeles encendidos)`, JSON.stringify(a));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('26-rom-grande-en-xochip');
  // La plataforma CHIP-8 o SUPER-CHIP, o el perfil COSMAC VIP: la ROM no entra en 4 KB.
  for (const [sel, value, label, name] of [['#platform', 'chip8', 'plataforma CHIP-8', 'CHIP-8'], ['#platform', 'schip', 'plataforma SUPER-CHIP', 'SUPER-CHIP'], ['#preset', 'vip', 'perfil COSMAC VIP', 'CHIP-8']]) {
    await page.ev("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())");
    const c0 = await counters(page);
    const got = await chooseWithMouse(page, sel, value);
    await sleep(300);
    const b = await st();
    const c1 = await counters(page);
    const tt = await toastsInfo(page);
    const want = `La ROM cargada ocupa 4000 bytes y con la plataforma ${name} el máximo es 3584: no se cambió la plataforma.`;
    s.check(tt.length === 1 && tt[0].kind === 'error' && tt[0].text === want, `${label} con el mouse: aviso de error «${(tt[0] || {}).text}»`, JSON.stringify(tt));
    s.check(got === 'xochip' && b.platSel === 'xochip' && b.preset === 'xochip' && b.platform === 'xochip' && sameQuirks(b.quirks, presetQuirks('xochip')) && c1.resets === c0.resets && c1.calls > c0.calls + 10 && !b.halted,
      `${label}: el selector vuelve a XO-CHIP, no cambia nada y la ROM sigue corriendo sin reiniciarse`, JSON.stringify({ got, b, reinicios: c1.resets - c0.resets, frames: c1.calls - c0.calls }));
    if (value === 'chip8') await page.shot('26-plataforma-rechazada');
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 27 -------------------------------------------------------------------------------
scenario(27, 'Diagnóstico: instrucción ignorada (aviso y botón), error de plataforma (botón en el CRT y en el monitor) y FIN DEL PROGRAMA', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // a) HIGH (00FF, de SUPER-CHIP) en CHIP-8: se ignora, como en un intérprete de la época, y se avisa una
  //    vez por ROM cargada, con un botón para pasar a SUPER-CHIP.
  const alta = asm(`
        HIGH
        LD I, cuadro
        LD V0, 28
        LD V1, 12
        DRW V0, V1, 8
fin:    JP fin
cuadro: ${db(CUADRO)}`);
  await loadWithButton(page, writeFixture(ctx, 'alta.ch8', alta), 'alta.ch8');
  const hint = await page.poll(`(() => { const t = Array.from(document.querySelectorAll('#toasts .toast')).find((x) => x.querySelector('.toast-act')); return t ? { text: t.querySelector('p').textContent, action: t.querySelector('.toast-act').textContent } : null; })()`, 3000);
  const a = await page.ev(`({ platform: window.chip8.cpu.platform, halted: window.chip8.cpu.halted, res: window.chip8.cpu.displayWidth + '×' + window.chip8.cpu.displayHeight, lit: window.chip8.cpu.display.reduce((x, y) => x + y, 0) })`);
  s.check(hint && hint.text === 'La ROM usó «HIGH» (pasar a alta resolución (128×64)), que es de SUPER-CHIP, y la plataforma CHIP-8 la ignora.' && hint.action === 'Usar SUPER-CHIP',
    `aviso: «${hint && hint.text}», con el botón «${hint && hint.action}»`, JSON.stringify(hint));
  s.check(a.platform === 'chip8' && !a.halted && a.res === '64×32' && a.lit > 0, `la máquina sigue en CHIP-8 a ${a.res}: ignoró la instrucción y dibujó igual`, JSON.stringify(a));
  await page.click('#btn-reset');
  await sleep(400);
  const nHints = await page.ev(`Array.from(document.querySelectorAll('#toasts .toast-act')).filter((b) => b.textContent === 'Usar SUPER-CHIP').length`);
  s.check(nHints === 1, `Reiniciar no repite el aviso: uno por ROM cargada (${nHints} a la vista)`);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('27-aviso-instruccion-ignorada');
  const c0 = await counters(page);
  await clickToastAction(page, 'Usar SUPER-CHIP');
  const hi = await page.poll('window.chip8.cpu.displayWidth === 128', 2000);
  const b = await consoleView(page);
  const c1 = await counters(page);
  const left = await page.ev(`document.querySelectorAll('#toasts .toast-act').length`);
  s.check(hi && b.platform === 'schip' && b.preset === 'schip' && sameQuirks(b.quirks, presetQuirks('schip')) && c1.resets > c0.resets && left === 0 && b.mode === 'SUPER-CHIP · 128×64',
    `clic en «Usar SUPER-CHIP»: perfil SUPER-CHIP, la ROM vuelve a empezar y ahora pasa a 128×64 (MÁQUINA «${b.mode}»; «${b.status}»)`, JSON.stringify({ hi, b, left }));

  // b) PLANE (de XO-CHIP) en SUPER-CHIP no se puede ignorar: la máquina se detiene con un botón.
  const plano = asm(`
        LD I, cuadro
        LD V0, 28
        LD V1, 12
        PLANE 1
        DRW V0, V1, 8
fin:    JP fin
cuadro: ${db(CUADRO)}`, true);
  await loadWithButton(page, writeFixture(ctx, 'plano.ch8', plano), 'plano.ch8');
  await page.waitFor('window.chip8.cpu.halted', { timeout: 2000, desc: 'error de plataforma' });
  await sleep(150);
  const errView = () => page.ev(`(() => { const $ = (id) => document.getElementById(id); return { crt: !$('crt-msg').hidden, title: $('crt-msg-title').textContent, text: $('crt-msg-text').textContent, fix: $('crt-msg-fix').hidden ? null : $('crt-msg-fix').textContent,
    mon: $('mon-error').hidden ? null : $('mon-error').textContent, monFix: $('mon-fix').hidden ? null : $('mon-fix-btn').textContent, badge: $('mon-badge').textContent, status: $('status').textContent,
    platform: window.chip8.cpu.platform, halted: window.chip8.cpu.halted, lit: window.chip8.cpu.display.reduce((x, y) => x + (y ? 1 : 0), 0) }; })()`);
  const e1 = await errView();
  const want = 'Instrucción inválida en SUPER-CHIP: «PLANE 1» (elegir el plano de dibujo) es de XO-CHIP (opcode 0xF101 en la dirección 0x206). Elegí la plataforma XO-CHIP.';
  s.info(`Error: «${e1.text}»`);
  s.check(e1.crt && e1.title === 'ERROR' && e1.text === want && e1.fix === 'Cambiar a XO-CHIP y reiniciar', 'el CRT muestra el error de plataforma en castellano con el botón «Cambiar a XO-CHIP y reiniciar»', JSON.stringify(e1));
  s.check(e1.mon === want && e1.monFix === 'Cambiar a XO-CHIP y reiniciar' && e1.badge === 'Error' && e1.status === 'Error: ' + want, 'el monitor muestra el mismo error con el mismo botón y la línea de estado lo anuncia', JSON.stringify(e1));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('27-error-de-plataforma');
  await clickHit(page, '#crt-msg-fix');
  const ok1 = await page.poll('!window.chip8.cpu.halted && window.chip8.cpu.platform === "xochip" && window.chip8.cpu.display.some((v) => v)', 2000);
  const e2 = await errView();
  s.check(ok1 && !e2.crt && e2.mon === null && e2.monFix === null && e2.lit === CUADRO_PIXELS, `clic en el botón del CRT: pasa a XO-CHIP, reinicia y la ROM corre sin error (dibuja su cuadro de ${e2.lit} píxeles)`, JSON.stringify(e2));
  // Otra vez el error (perfil SUPER-CHIP elegido con el mouse) y ahora el botón del monitor.
  await chooseWithMouse(page, '#preset', 'schip');
  const again = await page.poll('window.chip8.cpu.halted', 2000);
  await sleep(100);
  const e3 = await errView();
  // A 1280×900 el monitor (pegado arriba, sticky) con el error es más alto que la ventana: su botón tiene
  // que poder llevarse a la vista (con el foco o scrolleando), no quedar siempre debajo del borde.
  const reach = await page.ev(`(() => { const b = document.getElementById('mon-fix-btn'), m = document.getElementById('monitor'); b.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = b.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, monH: Math.round(m.getBoundingClientRect().height), hit: !!at && (at === b || b.contains(at)), pos: getComputedStyle(m).position }; })()`);
  s.check(reach.hit && reach.top >= 0 && reach.bottom <= reach.ih, `el monitor (${reach.pos}, ${reach.monH} px de alto en una ventana de ${reach.ih}) deja llevar su botón a la vista: queda en ${reach.top}–${reach.bottom} px`, JSON.stringify(reach));
  await clickHit(page, '#mon-fix-btn');
  const ok2 = await page.poll('!window.chip8.cpu.halted && window.chip8.cpu.platform === "xochip"', 2000);
  const e4 = await errView();
  s.check(again && e3.monFix === 'Cambiar a XO-CHIP y reiniciar' && ok2 && !e4.crt && e4.mon === null, 'con el perfil SUPER-CHIP el error vuelve; el botón del monitor también pasa a XO-CHIP y reinicia', JSON.stringify({ e3, e4 }));

  // c) EXIT (00FD) no es un error: «FIN DEL PROGRAMA», LED ámbar, y Reiniciar vuelve a empezar.
  const fin = asm(`
        CLS
        LD V0, 0xE
        LD F, V0
        LD V1, 30
        LD V2, 13
        DRW V1, V2, 5
        LD V3, K                ; espera una tecla...
        EXIT                    ; ...y termina el programa`);
  await loadWithButton(page, writeFixture(ctx, 'fin.ch8', fin), 'fin.ch8');
  await page.waitFor('window.chip8.cpu.waitingForKey', { timeout: 2000, desc: 'esperando una tecla antes de EXIT' });
  await page.click('.tagline');
  await page.press('KeyX', 60);
  await page.waitFor('window.chip8.cpu.halted', { timeout: 2000, desc: 'EXIT detuvo la máquina' });
  await sleep(150);
  const endView = () => page.ev(`(() => { const $ = (id) => document.getElementById(id), c = window.chip8.cpu; return { halted: c.halted, exited: c.exited, wait: c.waitingForKey, crt: !$('crt-msg').hidden, title: $('crt-msg-title').textContent, text: $('crt-msg-text').textContent, hint: $('crt-msg-hint').textContent,
    exit: $('crt-msg').classList.contains('is-exit'), fix: !$('crt-msg-fix').hidden, led: $('led-run').className, badge: $('mon-badge').textContent, mon: !$('mon-error').hidden, status: $('status').textContent, reset: !$('btn-reset').disabled, pause: $('btn-pause').disabled }; })()`);
  const f = await endView();
  s.check(f.exited && f.crt && f.title === 'FIN DEL PROGRAMA' && f.text === 'La ROM terminó con EXIT (00FD).' && f.exit && !f.fix && !f.mon,
    `con una tecla llega a EXIT: el CRT dice «${f.title}» / «${f.text}» / «${f.hint}», sin error en el monitor`, JSON.stringify(f));
  s.check(f.led === 'led is-amber' && f.badge === 'Terminado' && /^Fin del programa/.test(f.status) && f.reset && f.pause, `LED RUN en ámbar («${f.led}»), monitor «${f.badge}», línea de estado «${f.status.slice(0, 45)}…»; solo Reiniciar queda habilitado`, JSON.stringify(f));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('27-fin-del-programa');
  const c2 = await counters(page);
  await page.click('#btn-reset');
  await sleep(250);
  const g = await endView();
  const c3 = await counters(page);
  s.check(!g.halted && !g.exited && !g.crt && g.wait && g.badge === 'Esperando tecla' && /is-green/.test(g.led) && c3.resets > c2.resets,
    `Reiniciar (mouse): la ROM vuelve a empezar y espera la tecla otra vez (LED «${g.led}», monitor «${g.badge}»)`, JSON.stringify(g));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 28 -------------------------------------------------------------------------------
scenario(28, 'Colores: «Personalizada» cambia en vivo y se conserva al recargar; «Del cartucho» aparece con el cartucho y se va con él', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // La ROM de cuatro colores en CHIP-8 se detiene en PLANE (de XO-CHIP); el perfil XO-CHIP, elegido con
  // ella en la ranura, la hace andar. (Elegirlo antes, con Rebote en la ranura, le dejaría a Rebote sus
  // ajustes recordados, paleta incluida: así funcionan los ajustes por cartucho.)
  await loadWithButton(page, writeFixture(ctx, 'cuatro-colores.ch8', romCuatroColores(CUADRO)), 'cuatro-colores.ch8');
  await page.waitFor('window.chip8.cpu.halted', { timeout: 2000, desc: 'PLANE en CHIP-8 detiene la máquina' });
  await chooseWithMouse(page, '#preset', 'xochip');
  const runs = await page.poll(`!window.chip8.cpu.halted && [1, 2, 3].every((v) => window.chip8.cpu.display.includes(v))`, 3000);
  s.check(runs, 'la ROM de cuatro colores se detiene en CHIP-8 y, con el perfil XO-CHIP elegido con el mouse, corre y dibuja en los dos planos');
  await page.click('#screen-mode .seg[data-mode="puro"]');
  const IDS = ['color-bg', 'color-p1', 'color-p2', 'color-both'];
  const inputs = () => page.ev(`({ hidden: document.getElementById('custom-colors').hidden, values: ${JSON.stringify(IDS)}.map((id) => document.getElementById(id).value.toUpperCase()) })`);
  const got = await chooseWithMouse(page, '#palette', 'custom');
  await sleep(100);
  const i0 = await inputs();
  const c0 = await page.ev('window.chip8.screenColors()');
  s.check(got === 'custom' && !i0.hidden && sameList(i0.values, FOSFORO) && sameList(c0, sortedColors(FOSFORO)),
    `«Personalizada» elegida con el mouse: aparecen los cuatro selectores de color (la primera vez, los de Verde fósforo: ${i0.values.join(' ')})`, JSON.stringify({ got, i0, c0 }));
  // El selector de colores del sistema no se maneja por CDP: se hace lo que hace él al elegir un color
  // (cambia el valor y dispara «input» mientras se elige, y «change» al cerrarlo).
  const NEW = ['#102030', '#F0E0D0', '#00C060', '#C03090'];
  const bad = [];
  for (let i = 0; i < 4; i++) {
    const live = await page.ev(`(() => { const el = document.getElementById('${IDS[i]}'); el.value = '${NEW[i].toLowerCase()}'; el.dispatchEvent(new Event('input', { bubbles: true })); return window.chip8.screenColors(); })()`);
    await page.ev(`document.getElementById('${IDS[i]}').dispatchEvent(new Event('change', { bubbles: true }))`);
    const saved = await stored(page, 'chip8-consola.ajustes');
    if (!live.includes(NEW[i]) || !saved || !saved.customColors || saved.customColors[i] !== NEW[i]) bad.push(`${IDS[i]}: en pantalla ${live.join(' ')}, guardado ${saved && saved.customColors}`);
  }
  const c1 = await page.ev('window.chip8.screenColors()');
  const m1 = await page.ev(canvasVsDisplayExpr(NEW));
  s.check(bad.length === 0, 'cada uno de los cuatro colores se ve en la pantalla mientras se elige y queda guardado al cerrar el selector', bad.join('; '));
  s.check(sameList(c1, sortedColors(NEW)) && m1.wrong === 0, `la pantalla tiene exactamente los cuatro colores elegidos (${c1.join(' ')}), cada píxel en su lugar`, JSON.stringify({ c1, m1 }));
  await page.ev("document.getElementById('custom-colors').scrollIntoView({ block: 'center' })");
  await page.shot('28-personalizada');
  // Se conservan al recargar (Rebote arranca solo: fondo y plano 1) y con la ROM de cuatro colores (desde «Tuyos:»).
  await page.reload();
  await page.instrument();
  await sleep(300);
  const i2 = await inputs();
  const r2 = await page.ev(`({ palette: window.chip8.getPalette(), sel: document.getElementById('palette').value, colors: window.chip8.screenColors(), name: document.getElementById('cart-name').textContent })`);
  s.check(r2.palette === 'custom' && r2.sel === 'custom' && !i2.hidden && sameList(i2.values, NEW) && sameList(r2.colors, sortedColors(NEW.slice(0, 2))),
    `después de recargar: «Personalizada» con los cuatro colores en sus selectores; «${r2.name}» usa el fondo y el plano 1 (${r2.colors.join(' ')})`, JSON.stringify({ r2, i2 }));
  await page.click('#lib-chips .chip:nth-child(1)');
  await page.waitFor(`document.getElementById('cart-name').textContent === 'cuatro-colores'`, { timeout: 3000, desc: 'cuatro-colores desde «Tuyos:»' });
  await page.poll(`[1, 2, 3].every((v) => window.chip8.cpu.display.includes(v))`, 3000);
  const c3 = await page.ev('window.chip8.screenColors()');
  s.check(sameList(c3, sortedColors(NEW)), `«cuatro-colores» (desde «Tuyos:») muestra otra vez los cuatro colores elegidos (${c3.join(' ')})`, JSON.stringify(c3));
  // «Del cartucho»: un juego del archivo de Octo con sus colores (entrada registrada para la prueba).
  const CART = ['#662200', '#996600', '#FF6600', '#FFCC00'];
  const cartRom = romCuatroColores(ROMBO);
  const reg = await page.ev(`window.chip8.registerArchiveEntry(${JSON.stringify(sha1Hex(cartRom))}, { id: 'colores-e2e', title: 'Colores del cartucho', platform: 'xochip', colors: ${JSON.stringify(CART)} })`);
  await loadWithButton(page, writeFixture(ctx, 'colores.ch8', cartRom), 'Colores del cartucho');
  await page.poll(`[1, 2, 3].every((v) => window.chip8.cpu.display.includes(v))`, 3000);
  const pal = () => page.ev(`({ options: Array.from(document.getElementById('palette').options).map((o) => o.textContent), sel: document.getElementById('palette').value, palette: window.chip8.getPalette(), colors: window.chip8.screenColors() })`);
  const p1 = await pal();
  const m2 = await page.ev(canvasVsDisplayExpr(CART));
  s.check(reg === true && p1.options.includes('Del cartucho') && p1.sel === 'cartucho' && p1.palette === 'cartucho' && sameList(p1.colors, sortedColors(CART)) && m2.wrong === 0,
    `un juego del archivo con colores: aparece «Del cartucho» en «Paleta», queda elegida y la pantalla usa sus cuatro colores (${p1.colors.join(' ')})`, JSON.stringify({ reg, p1, m2 }));
  await page.ev("document.getElementById('palette').scrollIntoView({ block: 'center' })");
  await page.shot('28-del-cartucho');
  // Otro cartucho (Fuente, desde «Incluidos:»): la opción se va y vuelve tu paleta, la personalizada.
  const fuente = await page.ev("window.chip8.demos.findIndex((d) => d.id === 'fuente')");
  await page.click(`#cart-chips .chip:nth-child(${fuente + 1})`);
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Fuente'`, { timeout: 3000 });
  await sleep(200);
  const p2 = await pal();
  s.check(!p2.options.includes('Del cartucho') && p2.sel === 'custom' && p2.palette === 'custom' && sameList(p2.colors, sortedColors(NEW.slice(0, 2))),
    `al cargar Fuente la opción «Del cartucho» se va y vuelve tu paleta «Personalizada» (${p2.colors.join(' ')}; opciones: ${p2.options.join(', ')})`, JSON.stringify(p2));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 29 -------------------------------------------------------------------------------
scenario(29, 'Autoconfiguración con el archivo de Octo: todo aplicado antes del primer frame; con el interruptor apagado, nada', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const rom = romDigitos(2, 9);
  const sha = sha1Hex(rom);
  const QUIRKS = { vfReset: false, memory: false, shifting: true, jumping: true, clipping: false, displayWait: false };
  const CART = ['#102030', '#F0E0D0', '#00C060', '#C03090'];
  const reg = await page.ev(`window.chip8.registerArchiveEntry(${JSON.stringify(sha)}, { id: 'prueba-e2e', title: 'Prueba E2E', authors: 'Equipo de pruebas', event: 'Octojam 9', year: 2022,
    platform: 'xochip', ipf: 1234, quirks: ${JSON.stringify(QUIRKS)}, colors: ${JSON.stringify(CART)}, rotation: 270 })`);
  s.check(reg === true, 'registerArchiveEntry acepta la entrada de prueba (XO-CHIP, quirks, 1234 IPF, colores y giro de 270°)');
  // Cómo arranca el primer frame de esta ROM (PC en 0x200: todavía no corrió ninguna instrucción suya).
  await page.ev(`(() => {
    const c = window.chip8.cpu, rf = c.runFrame;
    window.__primero = null;
    c.runFrame = function (n) {
      const info = window.chip8.romInfo();
      if (!window.__primero && info && info.sha1 === ${JSON.stringify(sha)} && this.pc === 0x200) {
        const cv = document.getElementById('screen');
        window.__primero = { ipf: n, platform: this.platform, quirks: Object.assign({}, this.quirks), palette: window.chip8.getPalette(), sel: document.getElementById('palette').value,
          rotation: window.chip8.getRotation(), canvas: [cv.width, cv.height], res: [this.displayWidth, this.displayHeight] };
      }
      return rf.call(this, n);
    };
    return true;
  })()`);
  const file = writeFixture(ctx, 'prueba.ch8', rom);
  // a) Con «Ajustes por cartucho» apagado (un clic): carga como siempre, sin aplicar nada.
  await page.click('#tg-perrom');
  const off = await page.ev(`({ api: window.chip8.getPerRom(), pressed: document.getElementById('tg-perrom').getAttribute('aria-pressed') })`);
  await loadWithButton(page, file, 'Prueba E2E');
  const f0 = await page.waitFor('window.__primero', { timeout: 2000, desc: 'primer frame con el interruptor apagado' });
  await sleep(200);
  const v0 = await consoleView(page);
  const t0 = await toastsInfo(page);
  s.check(!off.api && off.pressed === 'false', 'un clic apaga «Ajustes por cartucho»', JSON.stringify(off));
  s.check(f0.platform === 'chip8' && f0.ipf === 15 && sameQuirks(f0.quirks, presetQuirks('vip')) && f0.palette === 'fosforo' && f0.rotation === 0,
    'apagado: el primer frame corre con tus ajustes de siempre (CHIP-8, 15 IPF, quirks del VIP, Verde fósforo, sin giro)', JSON.stringify(f0));
  s.check(!t0.some((x) => /archivo de Octo|recordados/.test(x.text)) && !/ajustes/.test(v0.slot) && !v0.forget && v0.palSel === 'fosforo' && !(await page.ev(`!!document.querySelector('#palette option[value="cartucho"]')`)),
    `apagado: sin aviso de ajustes, la ranura no habla de ajustes («${v0.slot}») y no aparece «Del cartucho»`, JSON.stringify({ t0, v0 }));
  // b) Prendido otra vez (un clic) y la misma ROM con «Cargar ROM»: todo antes del primer frame.
  await page.click('#tg-perrom');
  await page.ev('window.__primero = null; true');
  await loadWithButton(page, file, 'Prueba E2E');
  const f1 = await page.waitFor('window.__primero', { timeout: 2000, desc: 'primer frame con el interruptor prendido' });
  await sleep(200);
  const v1 = await consoleView(page);
  const t1 = await toastsInfo(page);
  s.check(f1.platform === 'xochip' && f1.ipf === 1234 && sameQuirks(f1.quirks, QUIRKS) && f1.palette === 'cartucho' && f1.sel === 'cartucho' && f1.rotation === 270 && f1.canvas[1] > f1.canvas[0],
    `prendido: el primer frame (PC en 0x200) ya corre en XO-CHIP con 1234 IPF, los quirks del archivo, la paleta «Del cartucho» y la pantalla girada 270° (lienzo ${f1.canvas.join('×')})`, JSON.stringify(f1));
  s.check(t1.some((x) => x.text === '«Prueba E2E», del archivo de Octo (Octojam 9): XO-CHIP, 1.234 IPF, sus colores y la pantalla girada 270°.'), `aviso: «${t1.map((x) => x.text).join(' | ')}»`, JSON.stringify(t1));
  s.check(v1.name === 'Prueba E2E' && v1.slot === `${rom.length} bytes · ajustes del archivo` && /Equipo de pruebas/.test(v1.slotTip) && /Octojam 9/.test(v1.slotTip) && !v1.forget && v1.source === 'archivo',
    `ranura: «${v1.name}» / «${v1.slot}» (al pasar el mouse: «${v1.slotTip.slice(0, 60)}…»)`, JSON.stringify(v1));
  const onScreen = await page.ev('window.chip8.screenColors()');
  s.check(v1.platSel === 'xochip' && v1.ipfIn === '1234' && v1.palSel === 'cartucho' && v1.preset === 'custom' && onScreen.includes(CART[0]) && onScreen.includes(CART[1]),
    'los controles muestran lo aplicado (Plataforma XO-CHIP, 1234 IPF, «Del cartucho», perfil «Personalizado») y la pantalla usa el fondo y el color del juego', JSON.stringify({ v1, onScreen: onScreen.slice(0, 12) }));
  const g1 = await stored(page, 'chip8-consola.ajustes');
  const r1 = await stored(page, 'chip8-consola.cartuchos');
  s.check(g1 && g1.platform === 'chip8' && g1.ipf === 15 && g1.palette === 'fosforo' && !(r1 && r1.roms && r1.roms[sha]), 'la autoconfiguración no toca tus ajustes guardados ni queda como «recordada»', JSON.stringify({ g1, r1 }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('29-autoconfiguracion-girada');
  // Un cambio tuyo (IPF 500 con el mouse) queda recordado; «Olvidar ajustes» del aviso vuelve a los del archivo.
  await page.click('#ipf-chips .chip:nth-child(5)');
  await page.ev('window.__primero = null; true');
  await loadWithButton(page, file, 'Prueba E2E');
  await page.waitFor('window.__primero', { timeout: 2000 });
  const v2 = await consoleView(page);
  const t2 = await toastsInfo(page);
  s.check(v2.source === 'recordado' && v2.ipf === 500 && v2.rotation === 270 && t2.some((x) => x.text === 'Ajustes recordados para «Prueba E2E»: XO-CHIP, 500 IPF, sus colores y la pantalla girada 270°.' && x.action === 'Olvidar ajustes'),
    `IPF 500 con el mouse queda recordado: al volver a cargarla, «${(t2.find((x) => x.action) || {}).text}»`, JSON.stringify({ v2, t2 }));
  await clickToastAction(page, 'Olvidar ajustes');
  await sleep(200);
  const v3 = await consoleView(page);
  const t3 = await toastsInfo(page);
  s.check(v3.source === 'archivo' && v3.ipf === 1234 && v3.platform === 'xochip' && v3.rotation === 270 && t3.some((x) => x.text === 'Olvidé los ajustes de «Prueba E2E»: volvieron los del archivo de Octo.'),
    '«Olvidar ajustes» (botón del aviso): vuelven los del archivo (1234 IPF) y lo avisa', JSON.stringify({ v3, t3 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 30 -------------------------------------------------------------------------------
scenario(30, 'Ajustes recordados por cartucho: cambios con el mouse, recarga, la misma ROM por «Cargar ROM» y «Olvidar ajustes»', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const rom = romDigitos(3, 0);
  const sha = sha1Hex(rom);
  const file = writeFixture(ctx, 'juego.ch8', rom);
  await loadWithButton(page, file, 'juego.ch8');
  const v0 = await consoleView(page);
  s.check(v0.source === 'ninguno' && v0.sha1 === sha && v0.slot === `${rom.length} bytes` && !v0.forget && (await toastsInfo(page)).length === 0,
    `una ROM desconocida arranca con tus ajustes, sin aviso («${v0.slot}»)`, JSON.stringify(v0));
  // Cambios con el mouse mientras juega.
  await chooseWithMouse(page, '#preset', 'schip');
  await page.click('#ipf-chips .chip:nth-child(3)');                // 30
  await chooseWithMouse(page, '#palette', 'ambar');
  await page.click('#dip-bank .dip-col:nth-of-type(1) .dip');        // VF=0
  await sleep(150);
  const v1 = await consoleView(page);
  s.check(/ajustes recordados$/.test(v1.slot) && v1.forget && v1.platform === 'schip' && v1.ipf === 30 && v1.palette === 'ambar' && v1.quirks.vfReset === true,
    `perfil SUPER-CHIP, IPF 30, paleta Ámbar y el interruptor VF=0, con el mouse: la ranura dice «${v1.slot}» y aparece «Olvidar ajustes»`, JSON.stringify(v1));
  // Otro cartucho con otros ajustes: los tuyos de siempre pasan a ser IPF 100 y Blanco.
  await page.click('#cart-chips .chip:nth-child(1)');               // Rebote
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Rebote'`, { timeout: 3000 });
  await page.click('#ipf-chips .chip:nth-child(4)');                // 100
  await chooseWithMouse(page, '#palette', 'blanco');
  await sleep(600);   // los ajustes de una ROM se guardan juntos, 400 ms después del último cambio
  const st = await stored(page, 'chip8-consola.cartuchos');
  const e = st && st.roms && st.roms[sha];
  s.check(e && e.platform === 'schip' && e.ipf === 30 && e.palette === 'ambar' && e.quirks.vfReset === true && e.quirks.shifting === true && e.name === 'juego.ch8',
    'quedó guardado el juego de ajustes de «juego.ch8» (SUPER-CHIP, sus quirks con VF=0, 30 IPF, Ámbar)', JSON.stringify(e));
  // Recarga y la misma ROM otra vez con «Cargar ROM».
  await page.reload();
  await page.instrument();
  await loadWithButton(page, file, 'juego.ch8');
  await sleep(150);
  const v2 = await consoleView(page);
  const t2 = await toastsInfo(page);
  s.check(v2.source === 'recordado' && v2.platform === 'schip' && v2.platSel === 'schip' && v2.ipf === 30 && v2.ipfIn === '30' && v2.palette === 'ambar' && v2.palSel === 'ambar' && v2.quirks.vfReset === true && v2.quirks.shifting === true,
    'después de recargar, la misma ROM arranca con lo recordado: SUPER-CHIP, 30 IPF, Ámbar y VF=0 (y los controles lo muestran)', JSON.stringify(v2));
  s.check(t2.some((x) => x.text === 'Ajustes recordados para «juego.ch8»: SUPER-CHIP, 30 IPF y la paleta Ámbar.' && x.action === 'Olvidar ajustes') && /ajustes recordados$/.test(v2.slot) && v2.forget,
    `aviso «${(t2.find((x) => x.action) || {}).text}» y la ranura «${v2.slot}»`, JSON.stringify({ t2, v2 }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('30-ajustes-recordados');
  // «Olvidar ajustes» de la ranura.
  await page.click('#cart-forget');
  await sleep(200);
  const v3 = await consoleView(page);
  const t3 = await toastsInfo(page);
  const st3 = await stored(page, 'chip8-consola.cartuchos');
  const focus = await page.ev('document.activeElement && (document.activeElement.id || document.activeElement.tagName)');
  s.check(!(st3 && st3.roms && st3.roms[sha]) && v3.source === 'ninguno' && !v3.forget && !/recordados/.test(v3.slot) && v3.ipf === 30 && t3.some((x) => x.text === 'Olvidé los ajustes de «juego.ch8»: la próxima vez arranca con tus ajustes de siempre.'),
    '«Olvidar ajustes» (en la ranura): se borra lo recordado, el enlace se va, quedan los ajustes de ahora y lo avisa', JSON.stringify({ v3, t3, st3 }));
  s.check(focus !== 'cart-forget' && focus !== 'btn-load', `con el mouse, el foco no se queda en un botón (${focus})`);
  await loadWithButton(page, file, 'juego.ch8');
  await sleep(150);
  const v4 = await consoleView(page);
  s.check(v4.source === 'ninguno' && v4.ipf === 100 && v4.palette === 'blanco', `la próxima carga arranca con tus ajustes de siempre (${v4.ipf} IPF, paleta ${v4.palette})`, JSON.stringify(v4));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 31 -------------------------------------------------------------------------------
scenario(31, 'Banderas RPL: lo que guarda FX75 sobrevive a una recarga y FX85 lo lee', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // Lee las banderas; si están en cero, guarda 2A y 07 y muestra un 0; si no, muestra el 7 que leyó.
  const { bytes: rom, labels } = assemble(`
        LD V1, R                ; V0 y V1 <- banderas (FX85)
        SE V0, 0
        JP leidas
        LD V0, 0x2A
        LD V1, 7
        LD R, V1                ; banderas <- V0 y V1 (FX75)
        LD V4, 0
        JP muestra
leidas: LD V4, V1
muestra:
        LD F, V4
        LD V2, 28
        LD V3, 12
        DRW V2, V3, 5
fin:    JP fin`);
  const sha = sha1Hex(rom);
  const file = writeFixture(ctx, 'banderas.ch8', rom);
  await chooseWithMouse(page, '#preset', 'schip');   // FX75 y FX85 son de SUPER-CHIP
  await loadWithButton(page, file, 'banderas.ch8');
  await page.waitFor(`window.chip8.cpu.pc === ${labels.fin}`, { timeout: 2000, desc: 'la ROM terminó su trabajo' });
  const a = await page.ev('({ flags: window.chip8.getFlags(), v4: window.chip8.cpu.V[4] })');
  s.check(a.flags[0] === 0x2A && a.flags[1] === 7 && a.v4 === 0, `primera vez: FX75 guarda 2A y 07 en las banderas (${a.flags.slice(0, 3).join(', ')}, …)`, JSON.stringify(a));
  const saved = await page.poll(`(() => { try { const e = JSON.parse(localStorage.getItem('chip8-consola.cartuchos')).roms[${JSON.stringify(sha)}]; return e && e.flags && e.flags[0] === 42 ? e : null; } catch (e) { return null; } })()`, 3000, 100);
  const v = await consoleView(page);
  s.check(saved && saved.flags.length === 16 && saved.flags[1] === 7 && saved.platform === undefined && v.source === 'ninguno' && !v.forget,
    'en menos de 2 s quedan guardadas para esta ROM (solo las banderas: no cuentan como ajustes recordados)', JSON.stringify({ saved, v }));
  await page.click('#cart-chips .chip:nth-child(2)');   // Teclado: otra ROM arranca con las banderas en cero
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Teclado'`, { timeout: 3000 });
  s.check((await page.ev('window.chip8.getFlags()')).every((x) => x === 0), 'otra ROM (Teclado) arranca con sus banderas, en cero');
  await page.reload();
  await page.instrument();
  await loadWithButton(page, file, 'banderas.ch8');
  await page.waitFor(`window.chip8.cpu.pc === ${labels.fin}`, { timeout: 2000, desc: 'la ROM terminó su trabajo después de recargar' });
  const b = await page.ev('({ v0: window.chip8.cpu.V[0], v1: window.chip8.cpu.V[1], v4: window.chip8.cpu.V[4], flags: window.chip8.getFlags(), platform: window.chip8.cpu.platform })');
  s.check(b.v0 === 0x2A && b.v1 === 7 && b.v4 === 7 && b.flags[0] === 0x2A && b.platform === 'schip', `después de recargar, FX85 lee 2A y 07 (las banderas llegaron antes del primer frame) y la ROM muestra el ${b.v4}`, JSON.stringify(b));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('31-banderas-leidas');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 32 -------------------------------------------------------------------------------
scenario(32, 'Biblioteca: «Tus cartuchos» y «Tuyos:», cargar desde ahí, quitar y «Deshacer»; con el almacenamiento roto también anda', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const lib = () => page.ev(`({ api: window.chip8.libraryList().map((x) => x.name), shelf: Array.from(document.querySelectorAll('#lib-list .lib-item')).map((w) => ({ name: w.querySelector('.cart-name').textContent, x: w.querySelector('.cart-remove').getAttribute('aria-label'), meta: w.querySelector('.cart-ctrl').textContent, pressed: w.querySelector('.lib-cart').getAttribute('aria-pressed') })),
    chips: Array.from(document.querySelectorAll('#lib-chips .chip')).map((c) => c.textContent + (c.getAttribute('aria-pressed') === 'true' ? ' *' : '')), picker: !document.getElementById('lib-picker').hidden, empty: !document.getElementById('lib-empty').hidden,
    stored: (() => { try { return JSON.parse(localStorage.getItem('chip8-consola.biblioteca')).items.map((x) => x.name); } catch (e) { return null; } })() })`);
  const l0 = await lib();
  s.check(l0.api.length === 0 && !l0.picker && l0.empty && l0.shelf.length === 0, 'vacía: sin «Tuyos:» y con la explicación del estante', JSON.stringify(l0));
  const NAMES = ['Pong (1 jugador)', 'tetris', 'Space Invaders [David Winter]'];
  for (let i = 0; i < NAMES.length; i++) await loadWithButton(page, writeFixture(ctx, NAMES[i] + '.ch8', romDigitos(i + 1, i + 4)), NAMES[i] + '.ch8');
  const l1 = await lib();
  const order1 = [NAMES[2], NAMES[1], NAMES[0]];
  s.check(sameList(l1.api, order1) && sameList(l1.shelf.map((x) => x.name), order1) && sameList(l1.stored, order1) && l1.picker && !l1.empty,
    `las tres ROMs cargadas con «Cargar ROM» quedan en «Tus cartuchos», la última jugada primero (${l1.api.join(', ')}), y guardadas`, JSON.stringify(l1));
  s.check(sameList(l1.chips, [order1[0] + ' *', order1[1], order1[2]]) && l1.shelf.every((x) => / bytes · jugado hoy$/.test(x.meta)) && l1.shelf[0].pressed === 'true' && l1.shelf[1].x === `Quitar «${order1[1]}» de tus cartuchos`,
    `«Tuyos:» muestra ${l1.chips.join(', ')} (la de la ranura marcada); cada cartucho dice «${l1.shelf[0].meta}» y tiene su ×`, JSON.stringify(l1));
  // Cargar desde «Tuyos:» y desde el estante.
  await page.click('#lib-chips .chip:nth-child(3)');
  await page.waitFor(`document.getElementById('cart-name').textContent === ${JSON.stringify(NAMES[0])}`, { timeout: 3000, desc: 'Pong desde «Tuyos:»' });
  const l2 = await lib();
  s.check(l2.api[0] === NAMES[0] && l2.chips[0] === NAMES[0] + ' *', `clic en «${NAMES[0]}» de «Tuyos:»: lo carga y pasa adelante`, JSON.stringify(l2));
  await page.click('#lib-list .lib-item:nth-child(3) .lib-cart');
  await page.waitFor(`document.getElementById('cart-name').textContent === ${JSON.stringify(NAMES[1])}`, { timeout: 3000, desc: 'tetris desde el estante' });
  const lit = await page.poll('window.chip8.cpu.display.reduce((a, b) => a + b, 0)', 1500);
  const l3 = await lib();
  s.check(l3.api[0] === NAMES[1] && lit > 0, `clic en «${NAMES[1]}» del estante «Tus cartuchos»: lo carga y corre (${lit} píxeles)`, JSON.stringify(l3));
  // Se conserva al recargar.
  await page.reload();
  await page.instrument();
  const l4 = await lib();
  s.check(sameList(l4.api, l3.api) && l4.picker && l4.shelf.length === 3, `después de recargar sigue igual (${l4.api.join(', ')})`, JSON.stringify(l4));
  // Quitar con la × y «Deshacer».
  await page.click('#lib-list .lib-item:nth-child(2) .cart-remove');
  await sleep(150);
  const l5 = await lib();
  const t5 = await toastsInfo(page);
  const removed = l4.api[1];
  s.check(l5.api.length === 2 && !l5.api.includes(removed) && sameList(l5.stored, l5.api) && t5.some((x) => x.text === `Quitaste «${removed}» de tus cartuchos.` && x.action === 'Deshacer'),
    `la × quita «${removed}» (también de lo guardado) y el aviso trae «Deshacer»`, JSON.stringify({ l5, t5 }));
  await page.ev('window.scrollTo(0, document.documentElement.scrollHeight)');
  await page.shot('32-biblioteca-quitar');
  await clickToastAction(page, 'Deshacer');
  await sleep(150);
  const l6 = await lib();
  s.check(sameList(l6.api, l4.api) && sameList(l6.stored, l4.api), `«Deshacer» lo devuelve a su lugar (${l6.api.join(', ')})`, JSON.stringify(l6));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
  await page.close();

  // localStorage que tira excepción en cada acceso: todo en memoria durante la sesión.
  const broken = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Acceso al almacenamiento denegado (e2e)', 'SecurityError'); } });`;
  const p2 = await Page.open(ctx, { initScripts: [broken] });
  s.page = p2;
  await p2.goto(ctx.base + 'chip8.html');
  await p2.instrument();
  const note = await p2.ev(`({ note: !document.getElementById('lib-note').hidden, text: document.getElementById('lib-note').textContent })`);
  await loadWithButton(p2, writeFixture(ctx, 'memoria.ch8', romDigitos(7, 7)), 'memoria.ch8');
  await p2.click('#ipf-chips .chip:nth-child(4)');                 // 100: queda recordado (en memoria)
  await p2.click('#cart-chips .chip:nth-child(2)');                // Teclado
  await p2.waitFor(`document.getElementById('cart-name').textContent === 'Teclado'`, { timeout: 3000 });
  await p2.click('#lib-chips .chip:nth-child(1)');                 // memoria, desde «Tuyos:»
  await p2.waitFor(`document.getElementById('cart-name').textContent === 'memoria'`, { timeout: 3000 });
  const m = await p2.ev(`({ lib: window.chip8.libraryList().map((x) => x.name), info: window.chip8.romInfo(), ipf: window.chip8.getIpf() })`);
  const r = await measureRate(p2, 600);
  s.check(note.note && m.lib.join() === 'memoria' && m.info.source === 'recordado' && m.ipf === 100 && r.fps > 50,
    `con el almacenamiento roto: el estante avisa («${note.text.slice(0, 40)}…»), la ROM queda en «Tus cartuchos» y sus ajustes se recuerdan durante la sesión`, JSON.stringify({ note, m, fps: r.fps }));
  s.check(p2.errors.length === 0, 'con el almacenamiento roto no hay excepciones ni errores de consola', p2.errors.join(' | '));
  await p2.ev('document.getElementById("lib-title").scrollIntoView({ block: "start" })');
  await p2.shot('32-biblioteca-sin-almacenamiento');
});

// 33 -------------------------------------------------------------------------------
scenario(33, 'Planos, el demo de XO-CHIP: desde el estante corre a 60 fps sin errores, con los valores 1 a 3, su patrón de sonido, y W frena el rombo', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const name = await clickCart(page, 'planos');   // clic en el estante «Cartuchos incluidos»
  await page.poll('window.chip8.cpu.displayWidth === 128', 3000);   // su primera instrucción es HIGH
  await sleep(500);   // el primer clic también crea el AudioContext: se mide después
  const v = await consoleView(page);
  s.check(v.platform === 'xochip' && v.platSel === 'xochip' && v.res === '128×64' && /^XO-CHIP · 128×64/.test(v.mode) && v.source === 'demo',
    `«${name}» pide XO-CHIP y la consola pasa sola a esa plataforma, a 128×64 (MÁQUINA «${v.mode}»)`, JSON.stringify(v));
  const c0 = await counters(page);
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    (await page.ev(DISPLAY_VALUES)).forEach((x) => seen.add(x));
    await sleep(100);
  }
  const c1 = await counters(page);
  const fps = (c1.calls - c0.calls) / ((c1.now - c0.now) / 1000);
  s.info(`Planos: ${fps.toFixed(1)} frames por segundo; valores de píxel vistos en 3 s: ${[...seen].sort().join(', ')}`);
  s.check(fps >= 50 && fps <= 70, `corre en tiempo real: ${fps.toFixed(1)} frames por segundo`);
  s.check([1, 2, 3].every((x) => seen.has(x)), `en la pantalla aparecen los valores 1, 2 y 3: plano 1, plano 2 y los dos a la vez (${[...seen].sort().join(', ')})`);
  const au = await page.ev('({ a: window.chip8.audioState(), set: window.chip8.cpu.audioPatternSet })');
  s.check(au.set && au.a.pattern && au.a.patternRate > 0, `cargó un patrón de sonido (AUDIO) y la consola toca ese patrón y no el beep (${Math.round(au.a.patternRate)} bits por segundo)`, JSON.stringify(au));
  const st = await page.ev(`({ halted: window.chip8.cpu.halted, err: window.chip8.cpu.error, toasts: document.querySelectorAll('#toasts .toast').length })`);
  s.check(!st.halted && !st.err && st.toasts === 0 && page.errors.length === 0, 'sin errores: la máquina no se detuvo, no hay avisos y la consola del navegador está limpia', JSON.stringify(st) + ' ' + page.errors.join(' | '));
  // W (tecla 5) sostenida: el rombo, lo único del plano 2, se queda quieto.
  const plane2 = `Array.from(window.chip8.cpu.display, (v) => (v & 2) ? 1 : 0).join('')`;
  await page.click('.tagline');
  await page.keyDown('KeyW');
  await sleep(350);
  const p0 = await page.ev(plane2);
  await sleep(500);
  const p1 = await page.ev(plane2);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('33-planos');
  await page.keyUp('KeyW');
  await sleep(600);
  const p2 = await page.ev(plane2);
  s.check(p0.includes('1') && p0 === p1 && p2 !== p1, 'con W apretada el rombo (plano 2) no se mueve durante medio segundo; al soltarla vuelve a moverse');
});

// 34 -------------------------------------------------------------------------------
scenario(34, 'Avance rápido: con T sostenida (o el botón del bisel) corren 4 veces más instrucciones y ticks de los timers; al soltar, vuelve a 60', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'bucle.ch8', asm(`
bucle:  ADD V0, 1
        JP bucle`)), 'bucle.ch8');
  await instrumentTimers(page);
  await page.click('#ipf-chips .chip:nth-child(4)');   // 100 IPF
  await page.click('.tagline');
  await sleep(300);
  const n0 = await rates(page, 2000);
  s.info(`normal: ${n0.fps.toFixed(1)} frames/s, ${n0.tps.toFixed(1)} ticks de los timers/s, ${Math.round(n0.ips)} instrucciones/s`);
  s.check(n0.fps > 52 && n0.fps < 68 && Math.abs(n0.tps - n0.fps) < 3, `sin avance rápido: ~60 frames y ~60 ticks de los timers por segundo (${n0.tps.toFixed(1)})`, JSON.stringify(n0));
  // T sostenida (el teclado la repite mientras está apretada).
  await page.keyDown('KeyT');
  for (let i = 0; i < 4; i++) { await sleep(40); await page.keyDown('KeyT', { repeat: true }); }
  await sleep(150);
  const on = await page.ev(`({ tag: !document.getElementById('tag-turbo').hidden, text: document.getElementById('tag-turbo').textContent, api: window.chip8.isTurbo(), btn: document.getElementById('btn-turbo').getAttribute('aria-pressed'), paused: window.chip8.isPaused() })`);
  const t1 = await rates(page, 2000);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('34-avance-rapido');
  await page.keyUp('KeyT');
  const tUp = await page.ev('performance.now()');
  const fx = t1.ips / n0.ips, tx = t1.tps / n0.tps;
  s.info(`con T: ${t1.fps.toFixed(1)} frames/s, ${t1.tps.toFixed(1)} ticks de los timers/s, ${Math.round(t1.ips)} instrucciones/s (×${fx.toFixed(2)} y ×${tx.toFixed(2)})`);
  s.check(on.tag && on.text === '×4' && on.api && on.btn === 'true' && !on.paused, 'con T apretada aparece «×4» en la pantalla y el botón del bisel se ve apretado', JSON.stringify(on));
  s.check(fx > 3.5 && fx < 4.5 && tx > 3.5 && tx < 4.5, `con T: ×${fx.toFixed(2)} instrucciones y ×${tx.toFixed(2)} ticks de los timers por segundo real`, JSON.stringify(t1));
  await sleep(1300);
  const times = await page.ev(`${E2E}.times.slice()`);
  const first = times.filter((t) => t >= tUp && t < tUp + 250).length, after = times.filter((t) => t >= tUp && t < tUp + 1000).length;
  const off = await page.ev(`({ tag: !document.getElementById('tag-turbo').hidden, api: window.chip8.isTurbo() })`);
  const n1 = await rates(page, 1000);
  s.check(!off.tag && !off.api && first <= 22 && after >= 50 && after <= 70 && n1.tps > 52 && n1.tps < 68,
    `al soltar T, «×4» se va y vuelve a ~60 por segundo sin ponerse al día (${first} frames en 0,25 s, ${after} en 1 s, ${n1.tps.toFixed(1)} ticks/s)`, JSON.stringify({ off, n1 }));
  // El botón del bisel, mantenido con el mouse.
  const r = await page.rect('#btn-turbo');
  await page.mouse('mouseMoved', r.cx, r.cy);
  await page.mouse('mousePressed', r.cx, r.cy);
  await sleep(250);
  const m1 = await rates(page, 1200);
  const mf = await page.ev(`({ api: window.chip8.isTurbo(), tag: !document.getElementById('tag-turbo').hidden, focus: document.activeElement === document.getElementById('btn-turbo') })`);
  await page.mouse('mouseReleased', r.cx, r.cy);
  await sleep(250);
  const m2 = await rates(page, 1000);
  s.check(m1.tps / n0.tps > 3.5 && m1.tps / n0.tps < 4.5 && mf.api && mf.tag && !mf.focus && m2.tps > 52 && m2.tps < 68 && !(await page.ev('window.chip8.isTurbo()')),
    `el botón del bisel mantenido con el mouse: ${m1.tps.toFixed(0)} ticks/s (×${(m1.tps / n0.tps).toFixed(2)}); al soltarlo, ${m2.tps.toFixed(0)} (y no se queda con el foco)`, JSON.stringify({ m1, mf, m2 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 35 -------------------------------------------------------------------------------
scenario(35, 'Captura: G y el botón de la cámara bajan un PNG (nombre, tamaño y colores exactos); screenshot() es cpu.display con la paleta', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const dir = path.join(ctx.browser.tmp, 'descargas');
  fs.mkdirSync(dir, { recursive: true });
  await ctx.browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
  try {
    await clickCart(page, 'fuente');
    await waitSelfJump(page);   // Fuente dibuja un sprite por frame (espera de vblank): terminó
    await page.click('.tagline');
    const today =await page.ev("(() => { const d = new Date(), t = (n) => String(n).padStart(2, '0'); return '' + d.getFullYear() + t(d.getMonth() + 1) + t(d.getDate()); })()");
    const want = await page.ev('({ url: window.chip8.screenshot(), d: Array.from(window.chip8.cpu.display), w: window.chip8.cpu.displayWidth })');
    const wantBytes = Buffer.from(want.url.slice(want.url.indexOf(',') + 1), 'base64');
    const NAME_RE = /^chip8-fuente-(\d{8})-\d{6}\.png$/;
    const check = (dl, how) => {
      const file = dl.file || path.join(dir, dl.name);
      const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
      const m = NAME_RE.exec(dl.name || '');
      s.check(dl.state === 'completed' && m && m[1] === today && buf && buf.length === dl.bytes,
        `${how}: el navegador baja «${dl.name}» (${buf ? buf.length : 0} bytes; la fecha del nombre es la de hoy)`, JSON.stringify(dl));
      s.check(buf && buf.equals(wantBytes), `${how}: el archivo es la misma imagen PNG que screenshot() (${wantBytes.length} bytes)`);
      return buf;
    };
    const p1 = nextDownload(ctx);
    await page.press('KeyG');
    const buf1 = check(await p1, 'G');
    const status = await page.ev("document.getElementById('status').textContent");
    if (buf1) {
      const img = decodePng(buf1);
      const cmp = pngVsDisplay(img, want.d, want.w, FOSFORO);
      s.check(img.width === 640 && img.height === 320 && cmp.scale === 10 && cmp.wrong === 0 && sameList(cmp.colors, sortedColors(FOSFORO.slice(0, 2))),
        `el PNG mide ${img.width}×${img.height} (cada píxel CHIP-8, un cuadrado de ${cmp.scale}×${cmp.scale}) y cada píxel es el color de la paleta que le toca en cpu.display (${cmp.colors.join(' ')})`, `${cmp.wrong} distintos; ${cmp.first}`);
      const copy = path.join(ctx.opts.shots, '35-captura-bajada-con-G.png');
      fs.writeFileSync(copy, buf1);
      ctx.shots.push(copy);
    }
    s.check(/^Captura guardada: chip8-fuente-\d{8}-\d{6}\.png \(640 × 320 píxeles\)\.$/.test(status), `la línea de estado lo anuncia («${status}»)`);
    const p2 = nextDownload(ctx);
    await page.click('#btn-shot');
    check(await p2, 'botón de la cámara (clic)');
    // XO-CHIP en alta resolución, con los cuatro colores: cada píxel CHIP-8 es un cuadrado de 5×5.
    await chooseWithMouse(page, '#preset', 'xochip');
    await loadWithButton(page, writeFixture(ctx, 'cuatro-colores.ch8', romCuatroColores(CUADRO)), 'cuatro-colores.ch8');
    await page.poll(`[1, 2, 3].every((v) => window.chip8.cpu.display.includes(v))`, 3000);
    const hi = await page.ev('({ url: window.chip8.screenshot(), d: Array.from(window.chip8.cpu.display), w: window.chip8.cpu.displayWidth })');
    const img2 = decodePng(Buffer.from(hi.url.slice(hi.url.indexOf(',') + 1), 'base64'));
    const cmp2 = pngVsDisplay(img2, hi.d, hi.w, FOSFORO);
    s.check(img2.width === 640 && img2.height === 320 && cmp2.scale === 5 && cmp2.wrong === 0 && sameList(cmp2.colors, sortedColors(FOSFORO)),
      `128×64 con dos planos: screenshot() de ${img2.width}×${img2.height} (escala ${cmp2.scale}) con los cuatro colores de la paleta, cada píxel en su lugar (${cmp2.colors.join(' ')})`, `${cmp2.wrong} distintos; ${cmp2.first}`);
  } finally {
    await ctx.browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  }
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('35-captura');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 36 -------------------------------------------------------------------------------
scenario(36, 'Pantalla completa: el botón del bisel, P y Esc entran y salen', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'rebote');
  await sleep(300);
  const state = () => page.ev(`(() => { const b = document.getElementById('bezel'), cv = document.getElementById('screen'), r = cv.getBoundingClientRect();
    return { fs: document.fullscreenElement ? (document.fullscreenElement.id || document.fullscreenElement.tagName) : null, api: window.chip8.isFullscreen(), cls: b.classList.contains('is-fullscreen'),
      btn: document.getElementById('btn-full').getAttribute('aria-pressed'), back: [cv.width, cv.height], css: [r.width, r.height], dpr: devicePixelRatio, status: document.getElementById('status').textContent }; })()`);
  const isIn = (x) => x.fs === 'bezel' && x.api && x.cls && x.btn === 'true';
  const isOut = (x, ref) => !x.fs && !x.api && !x.cls && x.btn === 'false' && x.back.join() === ref.back.join();
  const s0 = await state();
  await page.click('#btn-full');
  await page.poll('!!document.fullscreenElement', 3000);
  await sleep(400);
  const s1 = await state();
  const scale0 = s0.back[0] / 64, scale1 = s1.back[0] / 64;
  s.check(isIn(s1) && s1.status === 'Pantalla completa: P o Esc para volver a la consola.', `clic en el botón del bisel: el bisel pasa a pantalla completa (document.fullscreenElement = #${s1.fs}) y se anuncia`, JSON.stringify(s1));
  s.check(Number.isInteger(scale1) && scale1 > scale0 && Math.abs(s1.css[0] * s1.dpr - s1.back[0]) < 0.5, `en pantalla completa la imagen crece con escala entera: ${scale1}× (antes ${scale0}×), 1:1 con los píxeles físicos`, JSON.stringify({ s0, s1 }));
  await page.shot('36-pantalla-completa');
  await page.press('KeyP');
  await page.poll('!document.fullscreenElement', 3000);
  await sleep(300);
  const s2 = await state();
  s.check(isOut(s2, s0) && s2.status === 'Volviste a la consola.', 'P sale de la pantalla completa y la consola queda como estaba', JSON.stringify(s2));
  await page.press('KeyP');
  const in2 = await page.poll('!!document.fullscreenElement', 3000);
  await sleep(300);
  await page.click('#btn-full');
  const out2 = await page.poll('!document.fullscreenElement', 3000);
  await sleep(300);
  const s3 = await state();
  s.check(in2 && out2 && isOut(s3, s0), 'P entra y el mismo botón del bisel sale', JSON.stringify(s3));
  await page.press('KeyP');
  const in3 = await page.poll('!!document.fullscreenElement', 3000);
  await sleep(300);
  await page.press('Escape');
  const out3 = await page.poll('!document.fullscreenElement', 3000);
  await sleep(300);
  const s4 = await state();
  s.check(in3 && out3 && isOut(s4, s0), 'P entra y Esc sale', JSON.stringify(s4));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 37 -------------------------------------------------------------------------------
scenario(37, 'Joystick (Gamepad API): la cruz, la palanca y A/B aprietan las teclas de «Controles» y Start pausa y continúa', async (ctx, s) => {
  const page = await freshApp(ctx, s, { initScripts: [FAKE_GAMEPADS] });
  await clickCart(page, 'teclado');
  await page.click('.tagline');
  const settle = () => sleep(100);
  const keys = () => page.ev(KEYS_EXPR);
  const g0 = await page.ev(`({ g: window.chip8.gamepadState(), hint: document.getElementById('pad-hint').textContent })`);
  s.check(g0.g.supported && g0.g.connected.length === 0 && /ninguno/.test(g0.hint), `antes de conectar: ningún joystick («${g0.hint}»)`, JSON.stringify(g0));
  await page.ev("window.__pad.connect(0, 'Mando de prueba (STANDARD GAMEPAD)')");
  await settle();
  const t1 = await toastsInfo(page);
  const hint1 = await page.ev("document.getElementById('pad-hint').textContent");
  s.check(t1.some((x) => x.text === 'Joystick conectado: Mando de prueba (STANDARD GAMEPAD)') && hint1 === 'Joystick: Mando de prueba (STANDARD GAMEPAD).',
    `al conectarlo aparece el aviso «Joystick conectado: …» y «Controles» dice «${hint1}»`, JSON.stringify({ t1, hint1 }));
  const bad = [];
  for (const [b, k, label] of [[12, 5, 'cruz arriba'], [13, 8, 'cruz abajo'], [14, 7, 'cruz izquierda'], [15, 9, 'cruz derecha'], [0, 6, 'A'], [1, 4, 'B']]) {
    await page.ev(`window.__pad.button(0, ${b}, true)`);
    await settle();
    const d = await keys(), caps = await page.ev(KEYCAPS_DOWN);
    await page.ev(`window.__pad.button(0, ${b}, false)`);
    await settle();
    const u = await keys();
    if (!(onlyKey(d, k) && caps.join() === String(k) && noKeys(u))) bad.push(`${label}: ${d.join('')} (keypad ${caps}) -> ${u.join('')}`);
  }
  s.check(bad.length === 0, 'con «WASD de Octo»: la cruz arriba/abajo/izquierda/derecha aprieta 5/8/7/9, A aprieta 6 y B aprieta 4 (y se ven en el keypad)', bad.join('; '));
  const axes = [];
  for (const [a, value, k] of [[0, -0.8, 7], [0, 0.8, 9], [1, -0.8, 5], [1, 0.8, 8], [0, -0.3, -1], [1, 0.45, -1]]) {
    await page.ev(`window.__pad.axis(0, ${a}, ${value})`);
    await settle();
    const d = await keys();
    await page.ev(`window.__pad.axis(0, ${a}, 0)`);
    await settle();
    if (!(k < 0 ? noKeys(d) : onlyKey(d, k))) axes.push(`eje ${a} = ${value}: ${d.join('')}`);
  }
  s.check(axes.length === 0 && noKeys(await keys()), 'la palanca izquierda también: ±0,8 aprieta la dirección; 0,3 y 0,45 (zona muerta) no', axes.join('; '));
  await page.ev('window.__pad.button(0, 9, true)');
  await sleep(150);
  const p1 = await page.ev(`({ paused: window.chip8.isPaused(), tag: !document.getElementById('tag-pause').hidden })`);
  await sleep(300);
  const p1b = await page.ev('window.chip8.isPaused()');
  await page.ev('window.__pad.button(0, 9, false)');
  await settle();
  await page.ev('window.__pad.button(0, 9, true)');
  await settle();
  const p2 = await page.ev('window.chip8.isPaused()');
  await page.ev('window.__pad.button(0, 9, false)');
  await settle();
  s.check(p1.paused && p1.tag && p1b && !p2, 'Start pausa (aparece «PAUSA») y, apretado otra vez, continúa; sostenerlo no lo repite', JSON.stringify({ p1, p1b, p2 }));
  await page.ev('window.__pad.button(0, 15, true)');
  await sleep(200);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('37-joystick-derecha');
  await page.ev('window.__pad.button(0, 0, true)');
  await settle();
  const held = await keys();
  await page.ev('window.__pad.disconnect(0)');
  await settle();
  const gone = await keys();
  const t2 = await toastsInfo(page);
  s.check(held[9] === 1 && held[6] === 1 && noKeys(gone) && t2.some((x) => x.text === 'Joystick desconectado: Mando de prueba (STANDARD GAMEPAD)'),
    'al desconectarlo con la cruz y A apretadas, se sueltan sus teclas y aparece «Joystick desconectado: …»', JSON.stringify({ held: held.join(''), gone: gone.join(''), t2 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 38 -------------------------------------------------------------------------------
scenario(38, 'Flechas y «Controles»: cada mapa y uno personalizado, los controles con foco se quedan con sus flechas y el mapa de cada cartucho se recuerda', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await clickCart(page, 'teclado');
  await page.click('.tagline');
  const hexs = (list) => list.map((k) => k.toString(16).toUpperCase()).join(' ');
  async function arrows(want) {
    const bad = [];
    for (const [code, k] of [['ArrowUp', want[0]], ['ArrowDown', want[1]], ['ArrowLeft', want[2]], ['ArrowRight', want[3]]]) {
      const sy0 = await page.ev('scrollY');
      await page.keyDown(code);
      await sleep(30);
      const d = await page.ev(KEYS_EXPR), caps = await page.ev(KEYCAPS_DOWN), sy1 = await page.ev('scrollY');
      await page.keyUp(code);
      await sleep(30);
      const u = await page.ev(KEYS_EXPR);
      if (!(onlyKey(d, k) && caps.join() === String(k) && noKeys(u) && sy0 === sy1)) bad.push(`${code}: ${d.join('')} (keypad ${caps}) -> ${u.join('')}, scroll ${sy0}->${sy1}`);
    }
    return bad;
  }
  const b0 = await arrows([5, 8, 7, 9]);
  s.check(b0.length === 0, 'de fábrica («WASD de Octo»): ↑ ↓ ← → aprietan 5 8 7 9 y la página no se mueve', b0.join('; '));
  const k1 = await chooseWithMouse(page, '#keymap', 'vip');
  await page.click('.tagline');
  const b1 = await arrows([2, 8, 4, 6]);
  const hint1 = await page.ev("document.getElementById('keymap-hint').textContent");
  s.check(k1 === 'vip' && b1.length === 0 && hint1 === 'Flechas y cruz del joystick: ↑ 2 · ↓ 8 · ← 4 · → 6. Botones del joystick: A 5 · B 0 · Start pausa y continúa.',
    `«Teclado numérico del VIP» elegido con el mouse: ↑ ↓ ← → aprietan 2 8 4 6 («${hint1}»)`, b1.join('; ') + ' ' + hint1);
  const k2 = await chooseWithMouse(page, '#keymap', 'custom');
  const vis = await page.ev(`({ hidden: document.getElementById('keymap-keys').hidden, labels: Array.from(document.querySelectorAll('#keymap-keys .keymap-key span')).map((x) => x.textContent), vals: Array.from(document.querySelectorAll('#keymap-keys select')).map((x) => x.value) })`);
  s.check(k2 === 'custom' && !vis.hidden && vis.labels.join() === 'Arriba,Abajo,Izquierda,Derecha,Botón A,Botón B' && vis.vals.join() === '2,8,4,6,5,0',
    `«Personalizado»: aparecen seis selectores (${vis.labels.join(', ')}) que arrancan con el mapa de antes (${vis.vals.join(',')})`, JSON.stringify(vis));
  const up = await chooseWithMouse(page, '#keymap-keys select[data-slot="up"]', '10');
  const right = await chooseWithMouse(page, '#keymap-keys select[data-slot="right"]', '15');
  await page.ev("document.querySelector('.group-controls').scrollIntoView({ block: 'center' })");
  await page.shot('38-controles-personalizado');
  await page.click('.tagline');
  const b2 = await arrows([10, 8, 4, 15]);
  const km = await page.ev('window.chip8.getKeymap()');
  s.check(up === '10' && right === '15' && b2.length === 0 && km.preset === 'custom' && km.up === 10 && km.right === 15,
    `Arriba = A y Derecha = F elegidas con el mouse: ↑ ↓ ← → aprietan ${hexs([10, 8, 4, 15])}`, b2.join('; ') + ' ' + JSON.stringify(km));
  // Con el foco en un control que usa las flechas, las flechas son de ese control y no del keypad.
  const exc = [];
  for (const [sel, desc, val, go, back] of [
    ['#palette', 'el selector «Paleta»', "document.getElementById('palette').value", 'ArrowDown', 'ArrowUp'],
    ['#ipf-range', 'el deslizador de velocidad', "document.getElementById('ipf-range').value", 'ArrowRight', 'ArrowLeft'],
    ['#screen-mode .seg[aria-checked="true"]', 'el modo de pantalla', 'window.chip8.getScreenMode()', 'ArrowDown', 'ArrowUp'],
  ]) {
    await page.ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
    const v0 = await page.ev(val);
    await page.keyDown(go);
    await sleep(40);
    const d = await page.ev(KEYS_EXPR);
    await page.keyUp(go);
    await sleep(60);
    const v1 = await page.ev(val);
    await page.press(back, 20);
    await sleep(60);
    const v2 = await page.ev(val);
    if (!noKeys(d) || v1 === v0 || v2 !== v0) exc.push(`${desc}: teclas ${d.join('')}, ${v0} -> ${v1} -> ${v2}`);
    await page.ev('document.activeElement && document.activeElement.blur()');
  }
  s.check(exc.length === 0, 'con el foco en el selector «Paleta», el deslizador de velocidad o el modo de pantalla, las flechas los cambian (y los devuelven) sin apretar teclas del CHIP-8', exc.join('; '));
  await page.ev(`document.querySelector('#keypad .key[data-key="1"]').focus()`);
  await page.keyDown('ArrowDown');
  const onKey = await page.ev(KEYS_EXPR);
  await page.keyUp('ArrowDown');
  await page.ev('document.activeElement.blur()');
  s.check(onlyKey(onKey, 8), 'con el foco en una tecla del keypad, ↓ sí aprieta su tecla (8)', onKey.join(''));
  // Por cartucho: Teclado queda con el personalizado; Atrapa, con «WASD de Octo» elegido con el mouse.
  await clickCart(page, 'atrapa');
  const atr0 = await page.ev('window.chip8.getKeymap().preset');
  await chooseWithMouse(page, '#keymap', 'octo');
  await sleep(600);
  await page.reload();
  await page.instrument();
  await clickCart(page, 'teclado');
  await sleep(100);
  const r1 = await page.ev(`({ km: window.chip8.getKeymap(), sel: document.getElementById('keymap').value, toast: Array.from(document.querySelectorAll('#toasts .toast p')).map((p) => p.textContent).pop() || '' })`);
  await page.click('.tagline');
  const b3 = await arrows([10, 8, 4, 15]);
  s.check(atr0 === 'custom' && r1.km.preset === 'custom' && r1.km.up === 10 && r1.sel === 'custom' && b3.length === 0 && r1.toast === 'Ajustes recordados para «Teclado»: CHIP-8, 15 IPF y sus controles personalizados.',
    `después de recargar, Teclado arranca con su mapa personalizado (↑ = A) y lo avisa: «${r1.toast}»`, JSON.stringify(r1) + ' ' + b3.join('; '));
  await clickCart(page, 'atrapa');
  await page.click('.tagline');
  const r2 = await page.ev(`({ km: window.chip8.getKeymap(), sel: document.getElementById('keymap').value })`);
  const b4 = await arrows([5, 8, 7, 9]);
  s.check(r2.km.preset === 'octo' && r2.sel === 'octo' && b4.length === 0, 'y Atrapa, con «WASD de Octo»: ↑ ↓ ← → aprietan 5 8 7 9', JSON.stringify(r2) + ' ' + b4.join('; '));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 39 -------------------------------------------------------------------------------
scenario(39, 'Curvatura y encendido animado: la curvatura apagada deja la imagen idéntica; el encendido aparece al cargar, salvo con movimiento reducido', async (ctx, s) => {
  const powerState = (p) => p.ev(`({ hidden: document.getElementById('crt-power').hidden, on: document.getElementById('crt-power').classList.contains('is-on'),
    anims: document.getAnimations().filter((a) => /crt-power/.test(a.animationName)).length, pc: window.chip8.cpu.pc })`);
  const page = await Page.open(ctx);
  s.page = page;
  await clearStorage(page, ctx);
  await page.goto(ctx.base + 'chip8.html');
  const p0 = await powerState(page);
  const gone = await page.poll("document.getElementById('crt-power').hidden", 2000, 20);
  s.check(!p0.hidden && p0.on && p0.anims >= 2, `justo después de cargar, la capa de encendido está animándose (${p0.anims} animaciones)`, JSON.stringify(p0));
  s.check(gone, 'y en menos de 2 s se va sola');
  await page.instrument();
  // Curvatura: con Fuente (imagen fija) y la estela ya apagada, el tubo con y sin curvatura.
  await clickCart(page, 'fuente');
  await waitSelfJump(page);
  await sleep(1000);   // la estela del fósforo termina de apagarse
  const filters = () => page.ev(`({ screen: getComputedStyle(document.getElementById('screen')).filter, glow: getComputedStyle(document.getElementById('glow')).filter, curved: document.getElementById('crt').classList.contains('is-curved'), pressed: document.getElementById('tg-curve').getAttribute('aria-pressed') })`);
  const f0 = await filters();
  const a = await crtCapture(page);
  await page.click('#tg-curve');
  await sleep(400);
  const f1 = await filters();
  const b = await crtCapture(page);
  await page.shot('39-curvatura-prendida');
  await page.click('#tg-curve');
  await sleep(400);
  const f2 = await filters();
  const c = await crtCapture(page);
  const dOn = imageDiff(a, b), dOff = imageDiff(a, c);
  s.check(f0.screen === 'none' && !f0.curved && f0.pressed === 'false', 'de fábrica la curvatura está apagada: ningún filtro en el lienzo', JSON.stringify(f0));
  s.check(f1.curved && /url\(.*crt-warp/.test(f1.screen) && /url\(.*crt-warp/.test(f1.glow) && f1.pressed === 'true' && dOn > 1000,
    `un clic en «Curvatura» curva el lienzo y el resplandor (${dOn} píxeles del tubo cambian)`, JSON.stringify({ f1, dOn }));
  s.check(f2.screen === 'none' && !f2.curved && f2.pressed === 'false' && dOff === 0, `otro clic la apaga y el tubo queda idéntico, píxel por píxel, a antes de prenderla (${a.width}×${a.height}, ${dOff} píxeles distintos)`, JSON.stringify({ f2, dOff }));
  // Encendido animado apagado con un clic: al recargar no aparece.
  await page.click('#tg-power');
  await page.reload();
  const p1 = await powerState(page);
  s.check(p1.hidden && !p1.on && p1.anims === 0, 'con «Encendido animado» apagado, al recargar no hay animación', JSON.stringify(p1));
  await page.close();
  // Con prefers-reduced-motion: no aparece.
  const p2 = await Page.open(ctx, { media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  s.page = p2;
  await clearStorage(p2, ctx);
  await p2.goto(ctx.base + 'chip8.html');
  const r = await powerState(p2);
  s.check(r.hidden && !r.on && r.anims === 0, 'con prefers-reduced-motion no hay animación de encendido (el interruptor sigue prendido)', JSON.stringify(r));
  s.check(page.errors.length === 0 && p2.errors.length === 0, 'sin errores de consola', page.errors.concat(p2.errors).join(' | '));
});

// 40 -------------------------------------------------------------------------------
scenario(40, 'Diseño con la biblioteca llena y «Controles» a la vista: 1440, 768 y 360 px', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  const NAMES = ['Space Invaders [David Winter]', 'Pong (1 jugador)', 'Tetris', 'Blinky', 'Brix', 'UFO'];
  for (let i = 0; i < NAMES.length; i++) await loadWithButton(page, writeFixture(ctx, NAMES[i] + '.ch8', romDigitos(i, 9 - i)), NAMES[i] + '.ch8');
  await chooseWithMouse(page, '#keymap', 'custom');   // con los seis selectores de «Personalizado» a la vista
  for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [360, 640, true]]) {
    await page.setViewport(w, h, mobile ? 2 : 1, mobile);
    await page.reload();
    await sleep(400);
    await page.ev('window.scrollTo(0, 0)');
    const m = await page.ev(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
      const over = [];
      document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed') over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className).slice(0, 40)); });
      const keys = Array.from(document.querySelectorAll('#keypad .key')).map((k) => k.getBoundingClientRect());
      const box = (list) => ({ t: Math.round(Math.min(...list.map((k) => k.top))), b: Math.round(Math.max(...list.map((k) => k.bottom))), l: Math.round(Math.min(...list.map((k) => k.left))), r: Math.round(Math.max(...list.map((k) => k.right))) });
      const sels = Array.from(document.querySelectorAll('#keymap-keys select')).map((x) => x.getBoundingClientRect());
      return { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sy: scrollY, over: over.slice(0, 6),
        minKey: Math.min(...keys.map((k) => Math.min(k.width, k.height))), keys: box(keys), crt: r(document.getElementById('crt')),
        chips: document.querySelectorAll('#lib-chips .chip').length, items: document.querySelectorAll('#lib-list .lib-item').length, picker: !document.getElementById('lib-picker').hidden, pickerBox: r(document.getElementById('lib-picker')),
        controls: r(document.querySelector('.group-controls')), custom: !document.getElementById('keymap-keys').hidden, sels: sels.length ? box(sels) : null, selMin: sels.length ? Math.round(Math.min(...sels.map((x) => x.width))) : 0 };
    })()`);
    s.info(`${w}×${h}: pantalla ${m.crt.t}–${m.crt.b} px, keypad ${m.keys.t}–${m.keys.b} px (teclas de ${m.minKey.toFixed(0)} px), «Tuyos:» ${m.chips} chips, «Controles» ${m.controls.w}×${m.controls.h} px`);
    s.check(m.sw <= m.iw && m.over.length === 0, `${w}px: sin scroll horizontal (${m.sw} ≤ ${m.iw})`, 'se salen: ' + m.over.join(', '));
    s.check(m.minKey >= 44, `${w}px: teclas del keypad de al menos 44 px (${m.minKey.toFixed(1)})`);
    s.check(m.picker && m.chips === 5 && m.items === 6 && m.pickerBox.l >= 0 && m.pickerBox.r <= m.iw, `${w}px: «Tuyos:» muestra 5 cartuchos y el estante los 6, dentro del ancho`, JSON.stringify(m));
    s.check(m.custom && m.controls.w > 0 && m.controls.l >= 0 && m.controls.r <= m.iw && m.sels && m.sels.l >= 0 && m.sels.r <= m.iw && m.selMin >= 40,
      `${w}px: «Controles» con los seis selectores de «Personalizado» entra en el ancho (${m.controls.l}–${m.controls.r} px)`, JSON.stringify({ controls: m.controls, sels: m.sels, selMin: m.selMin }));
    if (w === 360) {
      s.check(m.sy === 0 && m.crt.t >= 0 && m.crt.b <= m.ih && m.keys.t >= m.crt.b && m.keys.b <= m.ih && m.keys.l >= 0 && m.keys.r <= m.iw,
        `360×640: la pantalla (${m.crt.t}–${m.crt.b}) y el keypad entero (${m.keys.t}–${m.keys.b}) entran en la primera vista, sin scrollear`, JSON.stringify({ crt: m.crt, keys: m.keys }));
    }
    await page.shot(`40-diseno-${w}`);
    await page.ev("document.querySelector('.group-controls').scrollIntoView({ block: 'center' })");
    await page.shot(`40-diseno-${w}-controles`);
    await page.ev('window.scrollTo(0, 0)');
    await page.shot(`40-diseno-${w}-completa`, { fullPage: true });
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// ---------------------------------------------------------------- ayudas de los escenarios 41 en adelante (estados y rebobinado)
const STATES_KEY = 'chip8-consola.estados';

// Un contador de frames: VA:VB (16 bits) sube uno por frame. Con la espera de vblank del perfil COSMAC VIP (el
// de fábrica) cada frame termina en su único DRW, así que hay exactamente una suma por frame y VA:VB identifica
// el frame. La pantalla muestra el dígito hexadecimal de VB; con sound, el timer de sonido no se apaga nunca.
function romContador(sound = false) {
  return asm(`
bucle:  CLS
        LD F, VB
        LD V0, 28
        LD V1, 13
        ${sound ? 'LD V2, 4' : 'LD V2, 0'}
        ${sound ? 'LD ST, V2' : 'ADD V2, 0'}
        DRW V0, V1, 5
        ADD VB, 1
        SE VB, 0
        JP bucle
        ADD VA, 1
        JP bucle`);
}

// La huella de la máquina en la página (window.__fp): el frame del contador (VA:VB), registros, pila, timers y
// un hash de la pantalla y de la memoria. instrumentPrints guarda la de cada runFrame en cpu.__prints.
const PRINT_FN = `(c) => {
  const fnv = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619); return h >>> 0; };
  return { id: (c.V[10] << 8) | c.V[11], pc: c.pc, I: c.I, sp: c.sp, V: Array.from(c.V).join(','), stack: Array.from(c.stack).join(','),
    dt: c.delayTimer, st: c.soundTimer, disp: fnv(c.display), mem: fnv(c.memory), res: c.displayWidth + 'x' + c.displayHeight,
    platform: c.platform, halted: c.halted, wait: c.waitingForKey };
}`;
async function instrumentPrints(page) {
  await page.ev(`(() => {
    window.__fp = ${PRINT_FN};
    const c = window.chip8.cpu;
    if (c.__prints) return true;
    const P = c.__prints = [], rf = c.runFrame;
    c.runFrame = function (n) { const r = rf.call(this, n); P.push(window.__fp(this)); if (P.length > 8000) P.splice(0, 2000); return r; };
    return true;
  })()`);
}
const machinePrint = (page) => page.ev('window.__fp(window.chip8.cpu)');
// La máquina de ahora comparada con la primera huella grabada del mismo frame, la de la primera vez que la
// máquina pasó por ahí (diff: los campos distintos).
function printMatch(page) {
  return page.ev(`(() => {
    const now = window.__fp(window.chip8.cpu), P = window.chip8.cpu.__prints;
    for (let i = 0; i < P.length; i++) {
      if (P[i].id === now.id) return { now, found: true, diff: Object.keys(now).filter((k) => now[k] !== P[i][k]) };
    }
    return { now, found: false, diff: [] };
  })()`);
}
// Las huellas grabadas desde mark (después de soltar el rebobinado) comparadas con las del mismo frame la
// primera vez.
function replayCheck(page, mark) {
  return page.ev(`(() => {
    const P = window.chip8.cpu.__prints, mark = ${mark};
    let same = 0, diff = 0, missing = 0, first = '';
    for (let i = mark; i < P.length; i++) {
      let j = 0;
      while (j < mark && P[j].id !== P[i].id) j++;
      if (j === mark) { missing++; continue; }
      const k = Object.keys(P[i]).filter((x) => P[i][x] !== P[j][x]);
      if (k.length) { diff++; if (!first) first = 'frame ' + P[i].id + ': ' + k.join(','); } else same++;
    }
    return { n: P.length - mark, same, diff, missing, first };
  })()`);
}

const slotSel = (slot, act) => `#save-slots .save-slot[data-slot="${slot}"] [data-act="${act}"]`;
// Lo que muestra cada ranura de «Estados».
function slotsView(page) {
  return page.ev(`Array.from(document.querySelectorAll('#save-slots .save-slot')).map((s) => ({
    slot: s.dataset.slot, name: s.querySelector('.save-name').textContent, when: s.querySelector('.save-when').textContent,
    title: s.querySelector('.save-when').title, blank: s.querySelector('.save-blank').hidden ? '' : s.querySelector('.save-blank').textContent,
    canvas: !s.querySelector('canvas').hidden, load: !s.querySelector('[data-act="load"]').disabled,
    del: !s.querySelector('[data-act="delete"]').disabled, empty: s.classList.contains('is-empty') }))`);
}
// La máquina comparada con el estado guardado en una ranura (leído de localStorage y decodificado en la página).
function sameAsSlotExpr(slot) {
  return `(() => {
    const c = window.chip8.cpu, sha = window.chip8.romInfo().sha1, store = JSON.parse(localStorage.getItem('${STATES_KEY}'));
    const st = Chip8Core.decodeState(store.roms[sha].slots[${JSON.stringify(String(slot))}].text);
    const eq = (a, b) => a.length === b.length && Array.prototype.every.call(a, (v, i) => v === b[i]);
    const diff = [];
    for (const k of ['platform', 'pc', 'I', 'sp', 'delayTimer', 'soundTimer', 'hires', 'displayWidth', 'displayHeight', 'planes', 'halted', 'waitingForKey', 'pitch']) if (c[k] !== st[k]) diff.push(k);
    for (const k of ['V', 'stack', 'display', 'memory', 'flags', 'audioPattern']) if (!eq(c[k], st[k])) diff.push(k);
    for (const k of Object.keys(st.quirks)) if (c.quirks[k] !== st.quirks[k]) diff.push('quirks.' + k);
    return { diff, pc: st.pc, vb: st.V[11], cpuVb: c.V[11], platform: st.platform };
  })()`;
}
// La pantallita de una ranura: el display de su estado guardado con los colores de la paleta, y su escala.
function thumbExpr(slot, colors) {
  return `(() => {
    const el = document.querySelector('#save-slots .save-slot[data-slot="${slot}"]'), cv = el.querySelector('canvas');
    const sha = window.chip8.romInfo().sha1, store = JSON.parse(localStorage.getItem('${STATES_KEY}'));
    const st = Chip8Core.decodeState(store.roms[sha].slots['${slot}'].text);
    const pal = ${JSON.stringify(colors)}.map((x) => parseInt(x.slice(1), 16));
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let wrong = 0;
    for (let i = 0; i < st.display.length; i++) { const got = (d[4 * i] << 16) | (d[4 * i + 1] << 8) | d[4 * i + 2]; if (got !== pal[st.display[i] & 3]) wrong++; }
    const scale = parseFloat(cv.style.width) * devicePixelRatio / cv.width;
    const box = cv.getBoundingClientRect(), scr = cv.parentNode.getBoundingClientRect();
    return { size: cv.width + '×' + cv.height, res: st.displayWidth + '×' + st.displayHeight, wrong, lit: st.display.filter((v) => v).length,
      scale: Math.round(scale * 1000) / 1000, integer: Math.abs(scale - Math.round(scale)) < 1e-6, pixelated: getComputedStyle(cv).imageRendering,
      visible: !cv.hidden && box.width > 0, inside: box.left >= scr.left - 0.5 && box.right <= scr.right + 0.5 && box.top >= scr.top - 0.5 && box.bottom <= scr.bottom + 0.5 };
  })()`;
}
const statusText = (page) => page.ev("document.getElementById('status').textContent");

// 41 -------------------------------------------------------------------------------
scenario(41, 'Estados: I guarda en la ranura rápida y U vuelve exactamente a ese momento, en pausa (sigue en pausa) o corriendo (sigue corriendo)', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await page.click('.seg[data-mode="puro"]');   // Píxeles puros: el lienzo se compara con cpu.display, píxel por píxel
  await page.click('.tagline');
  await sleep(1000);
  // I (tecla real): guarda en la ranura rápida, sin apretar ninguna tecla del CHIP-8.
  await page.keyDown('KeyI');
  const kI = await page.ev(KEYS_EXPR);
  await page.keyUp('KeyI');
  await sleep(120);
  const a = await page.ev(`({ status: document.getElementById('status').textContent, tag: document.getElementById('tag-state').hidden ? null : document.getElementById('tag-state').textContent, list: window.chip8.listSlots() })`);
  const sha = (await page.ev('window.chip8.romInfo()')).sha1;
  const store = await stored(page, STATES_KEY);
  const q = store && store.roms && store.roms[sha] && store.roms[sha].slots.rapido;
  s.check(noKeys(kI) && a.status === 'Estado guardado en la ranura rápida.' && a.tag === 'GUARDADO' && a.list[0].slot === 'rapido' && !a.list[0].empty && a.list[0].when === 'recién' && a.list.slice(1).every((x) => x.empty),
    `I guarda en la ranura rápida: «${a.status}», «GUARDADO» en la pantalla y la ranura dice «${a.list[0].when}» (ninguna tecla del CHIP-8)`, JSON.stringify({ kI, a }));
  s.check(store && store.version === 1 && q && typeof q.text === 'string' && q.text.length > 100 && q.text.length < 6000 && Math.abs(q.date - Date.now()) < 10000,
    `queda en localStorage['${STATES_KEY}'], con su fecha y la máquina en texto (${q ? q.text.length : 0} caracteres)`, JSON.stringify(store).slice(0, 300));
  // Sigue corriendo: la máquina se aleja del estado guardado.
  await sleep(1500);
  const far = await page.ev(sameAsSlotExpr('rapido'));
  s.check(far.diff.length > 0 && far.cpuVb !== far.vb, `1,5 s después la máquina ya es otra (VB ${far.vb} -> ${far.cpuVb})`, JSON.stringify(far));
  // En pausa, U vuelve al momento guardado y sigue en pausa, con ese frame en la pantalla y en el monitor.
  await page.press('Space');
  await sleep(100);
  await page.press('KeyU');
  await sleep(150);
  const b = await page.ev(sameAsSlotExpr('rapido'));
  const v = await page.ev(`({ paused: window.chip8.isPaused(), tag: !document.getElementById('tag-pause').hidden, status: document.getElementById('status').textContent,
    loaded: document.getElementById('tag-state').hidden ? null : document.getElementById('tag-state').textContent, monPc: document.getElementById('mon-pc').textContent,
    monVB: document.querySelectorAll('#vgrid .vcell span')[11].textContent })`);
  const screen = await page.ev(canvasVsDisplayExpr(FOSFORO));
  s.check(b.diff.length === 0, `en pausa, U deja la máquina exactamente como se guardó: pc, I, pila, registros, timers, pantalla, memoria y quirks (VB = ${b.vb})`, JSON.stringify(b));
  s.check(v.paused && v.tag && v.status === 'Estado de la ranura rápida cargado (guardado recién).' && v.loaded === 'CARGADO',
    `sigue en pausa (PAUSA en la pantalla), anuncia «${v.status}» y muestra «CARGADO»`, JSON.stringify(v));
  s.check(v.monPc === hx(b.pc) && v.monVB === b.vb.toString(16).toUpperCase().padStart(2, '0') && screen.wrong === 0,
    `el monitor (PC ${v.monPc}, VB ${v.monVB}) y la pantalla (${screen.size.join('×')}, ${screen.wrong} píxeles distintos de cpu.display) muestran el estado cargado`, JSON.stringify({ v, screen }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('41-estado-cargado-en-pausa');
  // Corriendo: U vuelve a ese momento y la máquina sigue corriendo desde ahí.
  await page.press('Space');
  await sleep(1000);
  const c0 = await counters(page);
  await page.keyDown('KeyU');
  const right = await page.ev(`({ vb: window.chip8.cpu.V[11], paused: window.chip8.isPaused() })`);
  await page.keyUp('KeyU');
  await sleep(500);
  const c1 = await counters(page);
  const later = await page.ev(`({ vb: window.chip8.cpu.V[11], paused: window.chip8.isPaused() })`);
  const near = (right.vb - b.vb + 256) % 256, ran = (later.vb - b.vb + 256) % 256;
  s.check(!right.paused && near <= 3 && !later.paused && c1.calls - c0.calls > 20 && ran >= 20,
    `corriendo, U vuelve al estado guardado (VB ${b.vb} -> ${right.vb}) y la máquina sigue desde ahí: medio segundo después va por VB ${later.vb}`, JSON.stringify({ right, later, frames: c1.calls - c0.calls }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 42 -------------------------------------------------------------------------------
scenario(42, 'Estados con el mouse: las ranuras 1 a 4 guardan, muestran su pantalla (paleta y escala entera) y su fecha, cargan, y Borrar trae «Deshacer»', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  const v0 = await slotsView(page);
  s.check(v0.length === 5 && v0[0].name === 'Rápido' && v0.slice(1).every((x, i) => x.name === 'Ranura ' + (i + 1)) &&
    v0.every((x) => x.empty && x.blank === 'VACÍA' && x.when === 'Nada guardado' && !x.load && !x.del && !x.canvas),
  'un cartucho nuevo tiene sus cinco ranuras vacías (Rápido y Ranura 1 a 4): «VACÍA», «Nada guardado», Cargar y Borrar deshabilitados', JSON.stringify(v0));
  for (const slot of [1, 2, 3]) {
    await sleep(350);
    await clickHit(page, slotSel(slot, 'save'));
  }
  await sleep(150);
  const v1 = await slotsView(page);
  const sha = (await page.ev('window.chip8.romInfo()')).sha1;
  const st1 = await stored(page, STATES_KEY);
  const texts = [1, 2, 3].map((n) => st1.roms[sha].slots[String(n)].text);
  const focus1 = await page.ev('document.activeElement === document.body');
  s.check(v1.slice(1, 4).every((x) => !x.empty && x.canvas && x.when === 'recién' && x.load && x.del && /^Guardado el \d+ de \w+ de \d{4} a las \d\d:\d\d$/.test(x.title)) &&
    v1[4].empty && !v1[4].load && v1[0].empty && new Set(texts).size === 3 && focus1,
  `Guardar (clic) en las ranuras 1, 2 y 3: cada una muestra su pantalla y «recién» (título «${v1[1].title}»), Cargar y Borrar se habilitan; la 4 y la rápida siguen vacías; tres estados distintos y el botón no se queda con el foco`, JSON.stringify(v1));
  const th = [];
  for (const slot of [1, 2, 3]) th.push(await page.ev(thumbExpr(slot, FOSFORO)));
  s.check(th.every((t) => t.wrong === 0 && t.lit > 0 && t.size === '64×32' && t.integer && t.scale === 2 && t.pixelated === 'pixelated' && t.visible && t.inside),
    `cada pantallita es el display de su estado con los colores de Verde fósforo, píxel por píxel, a escala entera (×${th[0].scale}, image-rendering: ${th[0].pixelated})`, JSON.stringify(th));
  // Cargar la ranura 2, en pausa: vuelve a ese estado y sigue en pausa.
  await clickHit(page, '#btn-pause');
  await sleep(100);
  await clickHit(page, slotSel(2, 'load'));
  await sleep(150);
  const l2 = await page.ev(sameAsSlotExpr(2));
  const p2 = await page.ev(`({ paused: window.chip8.isPaused(), status: document.getElementById('status').textContent })`);
  s.check(l2.diff.length === 0 && p2.paused && p2.status === 'Estado de la ranura 2 cargado (guardado recién).',
    `Cargar (clic) en la ranura 2 vuelve exactamente a ese estado y sigue en pausa: «${p2.status}»`, JSON.stringify({ l2, p2 }));
  // Borrar la ranura 1: el aviso trae «Deshacer».
  await clickHit(page, slotSel(1, 'delete'));
  await sleep(150);
  const v2 = await slotsView(page);
  const t2 = await toastsInfo(page);
  const st2 = await stored(page, STATES_KEY);
  s.check(v2[1].empty && v2[1].blank === 'VACÍA' && !v2[1].load && !v2[1].del && !('1' in st2.roms[sha].slots) && !v2[2].empty &&
    t2.some((x) => x.text === 'Borraste el estado de la ranura 1 de «contador.ch8».' && x.action === 'Deshacer'),
  'Borrar (clic) vacía la ranura 1 (también en localStorage) y el aviso trae «Deshacer»', JSON.stringify({ v2: v2[1], t2 }));
  await page.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await page.shot('42-estados-borrar');
  await clickToastAction(page, 'Deshacer');
  await sleep(150);
  const v3 = await slotsView(page);
  const st3 = await stored(page, STATES_KEY);
  const s3 = await statusText(page);
  s.check(!v3[1].empty && v3[1].canvas && v3[1].load && st3.roms[sha].slots['1'] && st3.roms[sha].slots['1'].text === texts[0] && s3 === 'El estado de la ranura 1 de «contador.ch8» volvió.',
    `«Deshacer» devuelve el mismo estado a la ranura 1, con su pantallita: «${s3}»`, JSON.stringify({ v3: v3[1], s3 }));
  // Otra paleta (con el mouse): las pantallitas se pintan con sus colores.
  await chooseWithMouse(page, '#palette', 'ambar');
  await sleep(150);
  const th2 = [];
  for (const slot of [1, 2, 3]) th2.push(await page.ev(thumbExpr(slot, AMBAR)));
  s.check(th2.every((t) => t.wrong === 0), 'con la paleta Ámbar, las tres pantallitas usan sus colores (píxel por píxel)', JSON.stringify(th2));
  await page.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await page.shot('42-estados-ambar');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 43 -------------------------------------------------------------------------------
scenario(43, 'Estados por cartucho: sobreviven a una recarga, dicen cuándo se guardaron («hace 5 min», «ayer 18:20») y otra ROM no los ve', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  const A = writeFixture(ctx, 'alfa.ch8', romContador()), B = writeFixture(ctx, 'beta.ch8', romDigitos(4, 2));
  await loadWithButton(page, A, 'alfa.ch8');
  await page.click('.tagline');
  await sleep(600);
  await page.press('KeyI');
  await sleep(400);
  await clickHit(page, slotSel(1, 'save'));
  await sleep(100);
  const shaA = (await page.ev('window.chip8.romInfo()')).sha1;
  // Las fechas, como si se hubieran guardado hace 5 minutos y ayer a las 18:20.
  await page.ev(`(() => {
    const s = JSON.parse(localStorage.getItem('${STATES_KEY}')), r = s.roms['${shaA}'], y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(18, 20, 0, 0);
    r.slots.rapido.date = Date.now() - 5 * 60000 - 15000;
    r.slots['1'].date = y.getTime();
    localStorage.setItem('${STATES_KEY}', JSON.stringify(s));
    return true;
  })()`);
  await page.reload();
  await page.instrument();
  const d0 = await slotsView(page);   // arranca el demo incluido: sus ranuras están vacías
  await page.click('#lib-chips .chip:nth-child(1)');   // alfa, desde «Tuyos:»
  await page.waitFor(`document.getElementById('cart-name').textContent === 'alfa'`, { timeout: 3000, desc: 'alfa desde «Tuyos:»' });
  const d1 = await slotsView(page);
  s.check(d0.every((x) => x.empty) && !d1[0].empty && d1[0].when === 'hace 5 min' && !d1[1].empty && d1[1].when === 'ayer 18:20' && /a las 18:20$/.test(d1[1].title) &&
    d1[2].empty && d1[0].canvas && d1[1].canvas,
  `después de recargar, alfa (desde «Tuyos:») tiene sus dos estados: Rápido «${d1[0].when}» y Ranura 1 «${d1[1].when}»; el demo del arranque, ninguno`, JSON.stringify({ d0, d1 }));
  await page.click('.tagline');
  await page.press('Space');
  await sleep(80);
  await page.press('KeyU');
  await sleep(120);
  const u = await page.ev(sameAsSlotExpr('rapido'));
  const us = await statusText(page);
  s.check(u.diff.length === 0 && us === 'Estado de la ranura rápida cargado (guardado hace 5 min).', `U carga el estado rápido guardado antes de recargar: «${us}»`, JSON.stringify(u));
  await page.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await page.shot('43-estados-de-alfa');
  // Otra ROM no los ve.
  await loadWithButton(page, B, 'beta.ch8');
  const d2 = await slotsView(page);
  const list2 = await page.ev('window.chip8.listSlots()');
  const st2 = await stored(page, STATES_KEY);
  s.check(d2.every((x) => x.empty) && list2.length === 5 && list2.every((x) => x.empty) && Object.keys(st2.roms).join() === shaA,
    'con beta en la ranura las cinco ranuras están vacías; los estados de alfa siguen guardados a su nombre', JSON.stringify({ d2, roms: Object.keys(st2.roms) }));
  await page.click('.tagline');
  await page.press('KeyU');
  await sleep(100);
  const bu = await statusText(page);
  s.check(bu === 'La ranura rápida está vacía: guardá con I.' && (await page.ev("document.getElementById('cart-name').textContent")) === 'beta.ch8',
    `U con beta no carga el estado de alfa: «${bu}»`);
  // El formato guardado.
  const fmt = await page.ev(`(() => {
    const s = JSON.parse(localStorage.getItem('${STATES_KEY}')), r = s.roms['${shaA}'], st = Chip8Core.decodeState(r.slots['1'].text);
    return { version: s.version, keys: Object.keys(s).sort().join(), name: r.name, slots: Object.keys(r.slots).sort().join(), entry: Object.keys(r.slots['1']).sort().join(),
      platform: st.platform, format: JSON.parse(r.slots['1'].text).format };
  })()`);
  s.check(fmt.version === 1 && fmt.keys === 'roms,version' && fmt.slots === '1,rapido' && fmt.entry === 'date,text' && fmt.platform === 'chip8' && fmt.format === 'chip8-state' && /^alfa/.test(fmt.name),
    `formato: { version: 1, roms: { [sha1]: { name: «${fmt.name}», slots: { ${fmt.slots.split(',').reverse().join(', ')}: { date, text } } } } }, y text es un estado de Chip8Core.encodeState`, JSON.stringify(fmt));
  // De vuelta a alfa: ahí están.
  await page.click('#lib-chips .chip:nth-child(2)');
  await page.waitFor(`document.getElementById('cart-name').textContent === 'alfa'`, { timeout: 3000, desc: 'alfa otra vez' });
  const d3 = await slotsView(page);
  s.check(!d3[0].empty && !d3[1].empty && d3[2].empty, 'al volver a alfa, sus dos estados siguen ahí', JSON.stringify(d3));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 44 -------------------------------------------------------------------------------
scenario(44, 'Un estado de XO-CHIP cargado con la plataforma en CHIP-8 pasa la consola a XO-CHIP (selector, placa, monitor y pantalla) sin tocar tus ajustes; un estado detenido o terminado vuelve con su mensaje', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'cuatro.ch8', romCuatroColores(CUADRO)), 'cuatro.ch8');
  const pick = await chooseWithMouse(page, '#preset', 'xochip');   // en CHIP-8 la ROM se detiene: es de XO-CHIP
  await waitSelfJump(page);
  await page.click('.seg[data-mode="puro"]');
  await clickHit(page, slotSel(2, 'save'));
  await sleep(100);
  const sha = (await page.ev('window.chip8.romInfo()')).sha1;
  const saved = await page.ev(`(() => { const s = JSON.parse(localStorage.getItem('${STATES_KEY}')), st = Chip8Core.decodeState(s.roms['${sha}'].slots['2'].text); return { platform: st.platform, res: st.displayWidth + '×' + st.displayHeight, mem: st.memory.length }; })()`);
  s.check(pick === 'xochip' && saved.platform === 'xochip' && saved.res === '128×64' && saved.mem === 65536, `con el perfil XO-CHIP (elegido con el mouse), la ranura 2 guarda un estado de XO-CHIP en 128×64 (${JSON.stringify(saved)})`);
  // Plataforma CHIP-8 con el selector: la ROM vuelve a empezar y se detiene (PLANE es de XO-CHIP).
  const back = await chooseWithMouse(page, '#platform', 'chip8');
  await sleep(300);
  const c8 = await consoleView(page);
  s.check(back === 'chip8' && c8.platform === 'chip8' && c8.halted && c8.mem === 4096, 'con el selector en CHIP-8 la ROM vuelve a empezar y se detiene: PLANE es de XO-CHIP', JSON.stringify(c8));
  await clickHit(page, slotSel(3, 'save'));   // la máquina detenida, con su error, también se guarda
  await sleep(100);
  await clickHit(page, slotSel(2, 'load'));
  await sleep(200);
  const v = await consoleView(page);
  const same = await page.ev(sameAsSlotExpr(2));
  const scr = await page.ev(canvasVsDisplayExpr(FOSFORO));
  const vals = await page.ev(DISPLAY_VALUES);
  const msg = await page.ev(`({ crt: !document.getElementById('crt-msg').hidden, mon: !document.getElementById('mon-error').hidden, wide: document.getElementById('monitor').classList.contains('is-wide'), monPc: document.getElementById('mon-pc').textContent })`);
  s.check(v.platform === 'xochip' && v.platSel === 'xochip' && v.preset === 'xochip' && v.mem === 65536 && v.res === '128×64' && /^XO-CHIP · 128×64/.test(v.mode) &&
    v.plate === 'MODELO XO-CHIP · 64 KB RAM · 128×64' && v.video === 'Video 128 × 64' && !v.halted && msg.wide && msg.monPc === hx(same.pc, 4),
  `Cargar (clic) en la ranura 2 pasa la consola a XO-CHIP: selector «${v.platSel}», placa «${v.plate}», MÁQUINA «${v.mode}», «${v.video}» y direcciones de 4 dígitos (${msg.monPc})`, JSON.stringify({ v, msg }));
  s.check(same.diff.length === 0 && scr.wrong === 0 && sameList(vals, [0, 1, 2, 3]) && !msg.crt && !msg.mon,
    `la máquina es exactamente la guardada, el error de CHIP-8 se va y la pantalla (Píxeles puros) muestra los cuatro colores, cada píxel en su lugar (${scr.wrong} distintos)`, JSON.stringify({ same, scr, vals, msg }));
  await sleep(600);   // los ajustes del cartucho se guardan juntos, después de una pausa
  const st = await stored(page, 'chip8-consola.ajustes');
  const roms = await stored(page, 'chip8-consola.cartuchos');
  s.check(st.platform === 'chip8' && roms.roms[sha] && roms.roms[sha].platform === 'chip8',
    `cargar un estado no cuenta como un cambio tuyo: tu plataforma y la recordada para el cartucho siguen en CHIP-8 (${st.platform}, ${roms.roms[sha] && roms.roms[sha].platform})`, JSON.stringify({ st: st.platform, rom: roms.roms[sha] }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('44-estado-xochip-cargado');
  // La ranura 3 tiene la máquina detenida en CHIP-8: al cargarla vuelven la plataforma y el error, con su botón.
  const halt = () => page.ev(`({ crt: !document.getElementById('crt-msg').hidden, title: document.getElementById('crt-msg-title').textContent, fix: document.getElementById('crt-msg-fix').hidden ? null : document.getElementById('crt-msg-fix').textContent,
    mon: !document.getElementById('mon-error').hidden, led: document.getElementById('led-run').className, paused: window.chip8.isPaused(), halted: window.chip8.cpu.halted, exited: window.chip8.cpu.exited,
    platform: window.chip8.cpu.platform, status: document.getElementById('status').textContent })`);
  await clickHit(page, slotSel(3, 'load'));
  await sleep(150);
  const h3 = await halt();
  const same3 = await page.ev(sameAsSlotExpr(3));
  s.check(h3.crt && h3.title === 'ERROR' && h3.fix === 'Cambiar a XO-CHIP y reiniciar' && h3.mon && h3.led === 'led is-red' && h3.halted && h3.paused && h3.platform === 'chip8' && same3.diff.length === 0 &&
    h3.status === 'Estado de la ranura 3 cargado (guardado recién). La máquina estaba detenida por un error: reiniciá para seguir.',
  `la ranura 3 (guardada con la máquina detenida en CHIP-8) vuelve a CHIP-8 con su error en el CRT y en el monitor, el botón «${h3.fix}» y el LED rojo: «${h3.status}»`, JSON.stringify(h3));
  // Un programa que termina con EXIT (00FD): el estado guardado al final muestra «FIN DEL PROGRAMA» al cargarlo.
  await loadWithButton(page, writeFixture(ctx, 'fin.ch8', asm(`
        LD V0, 90
        LD DT, V0
espera: LD V0, DT
        SE V0, 0
        JP espera
        EXIT`)), 'fin.ch8');
  await chooseWithMouse(page, '#preset', 'schip');   // EXIT es de SUPER-CHIP
  await page.waitFor('window.chip8.cpu.exited', { timeout: 3000, desc: 'el programa terminó con EXIT' });
  await clickHit(page, slotSel(1, 'save'));
  await page.click('.tagline');
  await page.press('Backspace');   // vuelve a empezar: espera 90 frames (1,5 s) antes de terminar
  await sleep(100);
  const running = await halt();
  await clickHit(page, slotSel(1, 'load'));
  await sleep(150);
  const h1 = await halt();
  s.check(!running.crt && !running.halted && h1.crt && h1.title === 'FIN DEL PROGRAMA' && h1.fix === null && h1.led === 'led is-amber' && h1.exited && h1.paused &&
    h1.status === 'Estado de la ranura 1 cargado (guardado recién). El programa había terminado: reiniciá para volver a empezar.',
  `con la ROM corriendo otra vez, cargar el estado guardado al terminar muestra «FIN DEL PROGRAMA» y el LED ámbar: «${h1.status}»`, JSON.stringify({ running, h1 }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('44-estado-fin-del-programa');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 45 -------------------------------------------------------------------------------
scenario(45, 'Rebobinado: con B sostenida (y con el botón ⏪, con el mouse y con un dedo) la máquina vuelve atrás frame a frame, al doble de velocidad (con T, ocho veces); al soltar sigue desde ahí', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'contador-beep.ch8', romContador(true)), 'contador-beep.ch8');
  await instrumentPrints(page);
  await page.click('.tagline');
  await sleep(6000);   // 6 s de historia
  const i0 = await page.ev(`({ info: window.chip8.rewindInfo(), line: document.getElementById('rewind-info').textContent, beeping: window.chip8.audioState().beeping })`);
  s.check(i0.info.entries >= 300 && i0.info.seconds >= 5 && i0.info.bytes > 0 && i0.line === `Podés volver hasta ${Math.floor(i0.info.entries / 60)} s.` && i0.beeping,
    `después de 6 s corriendo hay ${i0.info.entries} fotos (${i0.info.seconds} s, ${Math.round(i0.info.bytes / 1024)} KB) y «Estados» dice «${i0.line}»`, JSON.stringify(i0));
  // B sostenida ~1 s (el teclado la repite).
  const p0 = await machinePrint(page);
  const t0 = await page.ev('performance.now()');
  await page.keyDown('KeyB');
  await sleep(300);
  const during = await page.ev(`({ tag: !document.getElementById('tag-rewind').hidden, active: window.chip8.isRewinding(), btn: document.getElementById('btn-rewind').getAttribute('aria-pressed'),
    beeping: window.chip8.audioState().beeping, st: window.chip8.cpu.soundTimer, led: document.getElementById('led-snd').className, keys: ${KEYS_EXPR},
    monPc: document.getElementById('mon-pc').textContent, pc: window.chip8.cpu.pc, monVB: document.querySelectorAll('#vgrid .vcell span')[11].textContent, vb: window.chip8.cpu.V[11] })`);
  const c0 = await counters(page);   // con B ya apretada: desde acá no tiene que correr ningún frame
  for (let i = 0; i < 10; i++) { await sleep(50); await page.keyDown('KeyB', { repeat: true }); }
  await sleep(150);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('45-rebobinando');
  const c1 = await counters(page);
  await page.keyUp('KeyB');
  const t1 = await page.ev('performance.now()');
  const m1 = await printMatch(page);
  const mark = await page.ev('window.chip8.cpu.__prints.length');
  const secs = (t1 - t0) / 1000, back1 = p0.id - m1.now.id;
  s.info(`B sostenida ${secs.toFixed(2)} s: volvió ${back1} frames (${(back1 / secs).toFixed(0)} por segundo; en tiempo real serían 60)`);
  s.check(during.tag && during.active && during.btn === 'true' && noKeys(during.keys), 'mientras se mantiene B: «⏪» en la pantalla, el botón del bisel apretado y ninguna tecla del CHIP-8', JSON.stringify(during));
  s.check(!during.beeping && during.st > 0 && during.led === 'led', `el sonido se calla mientras rebobina, aunque el timer de sonido del estado esté andando (ST = ${during.st})`, JSON.stringify(during));
  s.check(during.monPc === hx(during.pc) && during.monVB === during.vb.toString(16).toUpperCase().padStart(2, '0'), `el monitor sigue a la máquina rebobinada (PC ${during.monPc}, VB ${during.monVB})`, JSON.stringify(during));
  s.check(c1.calls === c0.calls, `mientras rebobina la máquina no corre (${c1.calls - c0.calls} llamadas a runFrame)`);
  s.check(m1.found && m1.diff.length === 0, `al soltar, la máquina es exactamente la del frame ${m1.now.id}, grabada al pasar por ahí: pc, registros, pila, timers, pantalla y memoria`, JSON.stringify(m1));
  s.check(back1 >= secs * 120 * 0.75 && back1 <= secs * 120 * 1.1 + 4, `vuelve al doble de velocidad: ${back1} frames en ${secs.toFixed(2)} s (≈ ${Math.round(secs * 120)})`);
  // Al soltar sigue desde ahí: los frames que vienen son los mismos que la primera vez.
  await sleep(800);
  const r1 = await replayCheck(page, mark);
  const after = await page.ev(`({ tag: !document.getElementById('tag-rewind').hidden, active: window.chip8.isRewinding(), btn: document.getElementById('btn-rewind').getAttribute('aria-pressed'), beeping: window.chip8.audioState().beeping, status: document.getElementById('status').textContent })`);
  s.check(r1.n >= 40 && r1.same === r1.n && !after.tag && !after.active && after.btn === 'false' && after.beeping,
    `al soltar B la máquina sigue desde ahí: ${r1.same} de ${r1.n} frames idénticos a los de la primera vez; «⏪» se va y vuelve el sonido`, JSON.stringify({ r1, after }));
  s.check(/^Rebobinado: volviste \d+(,\d)? s atrás\.$/.test(after.status), `y lo anuncia: «${after.status}»`);
  // El botón ⏪ del bisel, mantenido con el mouse.
  const rb = await page.rect('#btn-rewind');
  const pb = await machinePrint(page);
  const tb0 = await page.ev('performance.now()');
  await page.mouse('mouseMoved', rb.cx, rb.cy);
  await page.mouse('mousePressed', rb.cx, rb.cy);
  await sleep(500);
  const md = await page.ev(`({ active: window.chip8.isRewinding(), tag: !document.getElementById('tag-rewind').hidden, btn: document.getElementById('btn-rewind').getAttribute('aria-pressed') })`);
  await page.mouse('mouseReleased', rb.cx, rb.cy);
  const tb1 = await page.ev('performance.now()');
  const mb = await printMatch(page);
  const markB = await page.ev('window.chip8.cpu.__prints.length');
  const backB = pb.id - mb.now.id, secsB = (tb1 - tb0) / 1000;
  await sleep(500);
  const rB = await replayCheck(page, markB);
  const fB = await page.ev(`({ focus: document.activeElement === document.getElementById('btn-rewind'), active: window.chip8.isRewinding() })`);
  s.check(md.active && md.tag && md.btn === 'true' && mb.diff.length === 0 && backB >= secsB * 120 * 0.7 && backB <= secsB * 120 * 1.1 + 4 && !fB.active && !fB.focus && rB.n >= 20 && rB.same === rB.n,
    `el botón ⏪ mantenido con el mouse ${secsB.toFixed(2)} s vuelve ${backB} frames, exactos; al soltarlo sigue (${rB.same}/${rB.n} frames iguales) y no se queda con el foco`, JSON.stringify({ md, mb, backB, rB, fB }));
  // Con un dedo.
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const tp = { x: rb.cx, y: rb.cy, id: 7, radiusX: 4, radiusY: 4, force: 1 };
  const pt = await machinePrint(page);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
  await sleep(400);
  const td = await page.ev('window.chip8.isRewinding()');
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp] });
  await sleep(80);
  const mt = await printMatch(page);
  const tu = await page.ev('window.chip8.isRewinding()');
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  s.check(td && !tu && mt.diff.length === 0 && pt.id - mt.now.id >= 30, `con un dedo sobre ⏪ también rebobina (${pt.id - mt.now.id} frames) y al levantarlo sigue`, JSON.stringify({ td, tu, mt }));
  // B y T a la vez: ocho frames por tick.
  await sleep(2500);
  const p8 = await machinePrint(page);
  const t80 = await page.ev('performance.now()');
  await page.keyDown('KeyB');
  await page.keyDown('KeyT');
  await sleep(450);
  const fast = await page.ev(`({ turbo: !document.getElementById('tag-turbo').hidden, back: !document.getElementById('tag-rewind').hidden })`);
  await page.keyUp('KeyT');
  await page.keyUp('KeyB');
  const t81 = await page.ev('performance.now()');
  const m8 = await printMatch(page);
  const back8 = p8.id - m8.now.id, secs8 = (t81 - t80) / 1000;
  s.info(`B y T ${secs8.toFixed(2)} s: volvió ${back8} frames (${(back8 / secs8).toFixed(0)} por segundo)`);
  s.check(fast.turbo && fast.back && m8.diff.length === 0 && back8 / secs8 >= 480 * 0.7 && back8 / secs8 <= 480 * 1.15 + 20,
    `con T también apretada vuelve ocho frames por tick: ${back8} en ${secs8.toFixed(2)} s, con «×4» y «⏪» en la pantalla`, JSON.stringify({ fast, back8, secs8 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
}, 120000);

// 46 -------------------------------------------------------------------------------
scenario(46, 'Rebobinado en pausa: un toque de B vuelve exactamente un frame (Frame avanza uno), sostenida sigue volviendo (también Espacio sobre el botón ⏪) y queda en pausa; después de un error, vuelve a antes y queda en pausa', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await instrumentPrints(page);
  await page.click('.tagline');
  await sleep(3000);
  await page.press('Space');
  await sleep(150);
  const p0 = await machinePrint(page);
  const pausedView = () => page.ev(`({ paused: window.chip8.isPaused(), tag: !document.getElementById('tag-pause').hidden, rw: !document.getElementById('tag-rewind').hidden, status: document.getElementById('status').textContent })`);
  await page.press('KeyB', 40);
  await sleep(120);
  const m1 = await printMatch(page);
  const v1 = await pausedView();
  s.check(m1.now.id === p0.id - 1 && m1.found && m1.diff.length === 0 && v1.paused && v1.tag && !v1.rw,
    `en pausa, un toque de B vuelve exactamente un frame (${p0.id} -> ${m1.now.id}) y la máquina sigue en pausa`, JSON.stringify({ m1, v1 }));
  s.check(v1.status === `Rebobinado: volviste 1 frame atrás (en pausa, PC = ${hx(m1.now.pc)}).`, `y lo anuncia: «${v1.status}»`);
  await page.press('KeyB', 40);
  await sleep(120);
  const m2 = await printMatch(page);
  s.check(m2.now.id === p0.id - 2 && m2.diff.length === 0, `otro toque, otro frame (${m2.now.id})`, JSON.stringify(m2));
  await clickHit(page, '#btn-frame');
  await sleep(120);
  const m3 = await printMatch(page);
  await page.click('.tagline');
  await page.press('KeyB', 40);
  await sleep(120);
  const m4 = await printMatch(page);
  s.check(m3.now.id === p0.id - 1 && m3.diff.length === 0 && m4.now.id === p0.id - 2 && m4.diff.length === 0,
    `Frame (clic) avanza al mismo frame de antes (${m3.now.id}) y B lo deshace (${m4.now.id})`, JSON.stringify({ m3, m4 }));
  // Sostenida 1 s: después de una espera corta sigue volviendo, de a dos frames por tick.
  await page.keyDown('KeyB');
  await sleep(1000);
  await page.keyUp('KeyB');
  await sleep(120);
  const m5 = await printMatch(page);
  const v5 = await pausedView();
  const back5 = m4.now.id - m5.now.id;
  s.check(back5 >= 55 && back5 <= 100 && m5.diff.length === 0 && v5.paused && v5.tag && !v5.rw,
    `sostenida 1 s en pausa vuelve ${back5} frames (uno y, después de la espera, dos por tick), exactos, y queda en pausa`, JSON.stringify({ back5, m5, v5 }));
  // Con el botón ⏪ enfocado desde el teclado, Espacio sostenido rebobina (y no despausa).
  await page.ev("document.getElementById('btn-rewind').focus()");
  await page.keyDown('Space');
  await sleep(150);
  const sd = await page.ev(`({ active: window.chip8.isRewinding(), paused: window.chip8.isPaused(), btn: document.getElementById('btn-rewind').getAttribute('aria-pressed') })`);
  await page.keyUp('Space');
  await sleep(100);
  const mS = await printMatch(page);
  const su = await page.ev(`({ active: window.chip8.isRewinding(), paused: window.chip8.isPaused() })`);
  await page.ev("document.getElementById('btn-rewind').blur()");
  s.check(sd.active && sd.paused && sd.btn === 'true' && !su.active && su.paused && mS.now.id === m5.now.id - 1 && mS.diff.length === 0,
    `con el botón ⏪ enfocado desde el teclado, Espacio sostenido rebobina (un frame: ${m5.now.id} -> ${mS.now.id}) y no saca la pausa`, JSON.stringify({ sd, su, mS }));
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('46-rebobinado-en-pausa');
  // Espacio: sigue desde ahí, con los mismos frames que la primera vez.
  const mark = await page.ev('window.chip8.cpu.__prints.length');
  await page.press('Space');
  await sleep(700);
  const r = await replayCheck(page, mark);
  s.check(r.n >= 30 && r.same === r.n && !(await page.ev('window.chip8.isPaused()')), `al continuar, la máquina sigue desde ese frame: ${r.same} de ${r.n} frames idénticos a los de la primera vez`, JSON.stringify(r));
  // Después de un error (opcode 5121 al cabo de 1 s): un toque de B vuelve a antes y deja la máquina en pausa,
  // sin volver a chocar con el error; con Frame se llega otra vez al error.
  await loadWithButton(page, writeFixture(ctx, 'error.ch8', [0x60, 0x3C, 0xF0, 0x15, 0xF0, 0x07, 0x30, 0x00, 0x12, 0x04, 0x51, 0x21]), 'error.ch8');
  await page.waitFor('window.chip8.cpu.halted', { timeout: 4000, desc: 'la ROM llegó a su opcode inválido' });
  await page.click('.tagline');
  await page.press('KeyB', 40);
  await sleep(400);   // si corriera, en este tiempo volvería a chocar con el error
  const errView = () => page.ev(`({ halted: window.chip8.cpu.halted, paused: window.chip8.isPaused(), msg: !document.getElementById('crt-msg').hidden,
    monErr: !document.getElementById('mon-error').hidden, pc: window.chip8.cpu.pc, status: document.getElementById('status').textContent, led: document.getElementById('led-run').className })`);
  const e1 = await errView();
  s.check(!e1.halted && e1.paused && !e1.msg && !e1.monErr && e1.led === 'led is-amber' && e1.status === `Rebobinado: volviste 1 frame atrás (en pausa, PC = ${hx(e1.pc)}).`,
    `detenida por un error, un toque de B vuelve al frame de antes, saca el mensaje y queda en pausa (LED ámbar): «${e1.status}»`, JSON.stringify(e1));
  let frames = 0;
  while (!(await page.ev('window.chip8.cpu.halted')) && frames < 5) {
    await clickHit(page, '#btn-frame');
    frames++;
    await sleep(60);
  }
  const e2 = await errView();
  s.check(frames === 1 && e2.halted && e2.msg && e2.monErr, `y con Frame (${frames} clic) se llega otra vez al error, que se vuelve a mostrar`, JSON.stringify({ frames, e2 }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 47 -------------------------------------------------------------------------------
scenario(47, 'Rebobinado apagado con el interruptor de «Estados»: B y el botón ⏪ no hacen nada y no se guardan fotos; se recuerda al recargar y prenderlo lo vuelve a activar', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  await loadWithButton(page, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await sleep(1300);
  const view = () => page.ev(`({ pressed: document.getElementById('tg-rewind').getAttribute('aria-pressed'), line: document.getElementById('rewind-info').textContent,
    entries: window.chip8.rewindInfo().entries, disabled: document.getElementById('btn-rewind').disabled, get: window.chip8.getRewind(),
    stored: (() => { try { return JSON.parse(localStorage.getItem('chip8-consola.ajustes')).rewind; } catch (e) { return null; } })(), status: document.getElementById('status').textContent })`);
  const on0 = await view();
  s.check(on0.pressed === 'true' && on0.get && on0.entries > 40 && on0.line === `Podés volver hasta ${Math.floor(on0.entries / 60)} s.` && !on0.disabled,
    `de fábrica está prendido: ${on0.entries} fotos y «${on0.line}»`, JSON.stringify(on0));
  await clickHit(page, '#tg-rewind');
  await sleep(150);
  const off = await view();
  s.check(off.pressed === 'false' && !off.get && off.stored === false && off.entries === 0 && off.disabled && off.line === 'Apagado: la consola no guarda los últimos segundos.' &&
    off.status === 'Rebobinado apagado: la consola ya no guarda los últimos segundos.',
  `un clic lo apaga: sin fotos, el botón ⏪ deshabilitado, «${off.line}», y queda guardado`, JSON.stringify(off));
  await page.click('.tagline');
  const c0 = await counters(page);
  await page.keyDown('KeyB');
  await sleep(500);
  const d = await page.ev(`({ active: window.chip8.isRewinding(), tag: !document.getElementById('tag-rewind').hidden, status: document.getElementById('status').textContent, entries: window.chip8.rewindInfo().entries })`);
  await page.keyUp('KeyB');
  const c1 = await counters(page);
  s.check(!d.active && !d.tag && d.entries === 0 && c1.calls - c0.calls > 20 && d.status === 'El rebobinado está apagado: prendelo en «Estados».',
    `apagado, B no rebobina (la máquina sigue: ${c1.calls - c0.calls} frames) y avisa «${d.status}»`, JSON.stringify(d));
  const rb = await page.rect('#btn-rewind');
  await page.mouse('mouseMoved', rb.cx, rb.cy);
  await page.mouse('mousePressed', rb.cx, rb.cy);
  await sleep(300);
  const dm = await page.ev(`({ active: window.chip8.isRewinding(), tag: !document.getElementById('tag-rewind').hidden })`);
  await page.mouse('mouseReleased', rb.cx, rb.cy);
  s.check(!dm.active && !dm.tag, 'el botón ⏪ deshabilitado no hace nada', JSON.stringify(dm));
  await page.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await page.shot('47-rebobinado-apagado');
  await page.reload();
  await page.instrument();
  await sleep(800);
  const r = await view();
  s.check(r.pressed === 'false' && !r.get && r.entries === 0 && r.disabled, 'después de recargar sigue apagado y sin fotos', JSON.stringify(r));
  await clickHit(page, '#tg-rewind');
  await sleep(1600);
  const on = await view();
  s.check(on.pressed === 'true' && on.get && on.stored === true && on.entries > 60 && on.line === `Podés volver hasta ${Math.floor(on.entries / 60)} s.` && !on.disabled &&
    on.status === 'Rebobinado prendido: mantené B para volver atrás en el tiempo.',
  `otro clic lo prende: vuelve a guardar fotos (${on.entries}) y «${on.line}»`, JSON.stringify(on));
  await page.click('.tagline');
  await page.keyDown('KeyB');
  await sleep(200);
  const again = await page.ev('window.chip8.isRewinding()');
  await page.keyUp('KeyB');
  s.check(again, 'y B vuelve a rebobinar');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 48 -------------------------------------------------------------------------------
scenario(48, 'Estados sin almacenamiento, sin lugar o dañados: el aviso justo y la consola sigue andando; sin cartucho, «Estados» explica de quién son', async (ctx, s) => {
  // localStorage que tira una excepción en cada acceso: los estados viven en memoria.
  const broken = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Acceso al almacenamiento denegado (e2e)', 'SecurityError'); } });`;
  const p1 = await Page.open(ctx, { initScripts: [broken] });
  s.page = p1;
  await p1.goto(ctx.base + 'chip8.html');
  await p1.instrument();
  await loadWithButton(p1, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await instrumentPrints(p1);
  await p1.click('.tagline');
  await sleep(500);
  await p1.press('Space');
  await sleep(80);
  await p1.press('KeyI');
  await sleep(150);
  const ref1 = await machinePrint(p1);
  await clickHit(p1, slotSel(3, 'save'));
  await sleep(150);
  const NO_STORAGE = 'Este navegador no deja guardar datos: los estados duran hasta que cierres la página.';
  const t1 = await toastsInfo(p1);
  const h1 = await p1.ev(`({ hint: document.getElementById('states-hint').textContent, list: window.chip8.listSlots() })`);
  s.check(t1.filter((x) => x.text === NO_STORAGE && x.kind === 'info').length === 1 && !h1.list[0].empty && !h1.list[3].empty && / Este navegador no deja guardar datos: duran hasta que cierres la página\.$/.test(h1.hint),
    `sin almacenamiento: I y Guardar guardan en memoria, el aviso «${NO_STORAGE}» aparece una sola vez y «Estados» lo dice`, JSON.stringify({ t1, h1 }));
  await p1.press('Space');
  await sleep(700);
  await p1.press('Space');
  await sleep(80);
  await p1.press('KeyU');
  await sleep(120);
  const now1 = await machinePrint(p1);
  const diff1 = Object.keys(ref1).filter((k) => ref1[k] !== now1[k]);
  s.check(diff1.length === 0 && (await statusText(p1)) === 'Estado de la ranura rápida cargado (guardado recién).', 'y U vuelve a ese estado, exacto', JSON.stringify(diff1));
  s.check(p1.errors.length === 0, 'sin almacenamiento no hay excepciones ni errores de consola', p1.errors.join(' | '));
  await p1.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await p1.shot('48-estados-sin-almacenamiento');
  await p1.close();

  // localStorage lleno de verdad (QuotaExceededError).
  const p2 = await freshApp(ctx, s);
  await loadWithButton(p2, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await instrumentPrints(p2);
  const sha = (await p2.ev('window.chip8.romInfo()')).sha1;
  const filled = await p2.ev(`(() => {
    let n = 0, total = 0;
    for (let size = 1 << 20; size >= 16; size >>= 1) {
      const chunk = 'x'.repeat(size);
      for (;;) {
        try { localStorage.setItem('relleno-' + n, chunk); n++; total += size; }
        catch (e) { if (e.name !== 'QuotaExceededError') return { error: e.name }; break; }
      }
    }
    return { n, total };
  })()`);
  s.info(`localStorage lleno con ${filled.n} claves de relleno (${Math.round(filled.total / 1024)} K caracteres)`);
  await p2.click('.tagline');
  await p2.press('Space');
  await sleep(80);
  await clickHit(p2, slotSel(2, 'save'));
  await sleep(150);
  const ref2 = await machinePrint(p2);
  const FULL = 'No hay más lugar en este navegador: el estado queda solo hasta que cierres la página. Para hacer lugar, borrá estados viejos o cartuchos de «Tus cartuchos».';
  const t2 = await toastsInfo(p2);
  const v2 = await p2.ev(`({ hint: document.getElementById('states-hint').textContent, list: window.chip8.listSlots(), stored: localStorage.getItem('${STATES_KEY}') })`);
  s.check(!filled.error && t2.some((x) => x.text === FULL && x.kind === 'error') && v2.stored === null && !v2.list[2].empty && /no entró en el navegador/.test(v2.hint),
    `sin lugar: el aviso de error «${FULL.slice(0, 60)}…», la ranura 2 tiene el estado (en memoria) y «Estados» dice que no entró`, JSON.stringify({ filled, t2, v2: { hint: v2.hint, slot: v2.list[2] } }));
  await p2.press('Space');
  await sleep(600);
  await p2.press('Space');
  await sleep(80);
  await clickHit(p2, slotSel(2, 'load'));
  await sleep(120);
  const now2 = await machinePrint(p2);
  const diff2 = Object.keys(ref2).filter((k) => ref2[k] !== now2[k]);
  s.check(diff2.length === 0 && (await statusText(p2)) === 'Estado de la ranura 2 cargado (guardado recién).', 'la consola sigue andando: Cargar vuelve al estado que quedó en memoria', JSON.stringify(diff2));
  await p2.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await p2.shot('48-estados-sin-lugar');
  // Haciendo lugar, el próximo cambio guarda todo (también lo que estaba solo en memoria).
  await p2.ev(`(() => { for (let i = 0; i < ${filled.n || 0}; i++) localStorage.removeItem('relleno-' + i); return true; })()`);
  await clickHit(p2, slotSel(3, 'save'));
  await sleep(120);
  const st3 = await stored(p2, STATES_KEY);
  const h3 = await p2.ev("document.getElementById('states-hint').textContent");
  s.check(st3 && st3.roms[sha] && st3.roms[sha].slots['2'] && st3.roms[sha].slots['3'] && !/no entró/.test(h3), 'con lugar otra vez, el próximo Guardar deja en localStorage la ranura 2 (que estaba en memoria) y la 3', JSON.stringify(st3 && Object.keys(st3.roms[sha].slots)));
  s.check(p2.errors.length === 0, 'sin lugar no hay excepciones ni errores de consola', p2.errors.join(' | '));
  await p2.close();

  // Un estado dañado en localStorage: la ranura lo muestra y Cargar avisa sin tocar la máquina.
  const rom = romContador();
  const p3 = await freshApp(ctx, s);
  await p3.ev(`localStorage.setItem('${STATES_KEY}', JSON.stringify({ version: 1, roms: { '${sha1Hex(rom)}': { name: 'contador.ch8', slots: { '1': { date: Date.now() - 60000, text: '{"format":"chip8-state","version":1,"platform":"chip8"}' } } } } }))`);
  await p3.reload();
  await p3.instrument();
  await loadWithButton(p3, writeFixture(ctx, 'contador.ch8', rom), 'contador.ch8');
  await instrumentPrints(p3);
  await p3.click('.tagline');
  await sleep(300);
  await p3.press('Space');
  await sleep(80);
  const v3 = await slotsView(p3);
  const before3 = await machinePrint(p3);
  await clickHit(p3, slotSel(1, 'load'));
  await sleep(150);
  const after3 = await machinePrint(p3);
  const t3 = await toastsInfo(p3);
  const diff3 = Object.keys(before3).filter((k) => before3[k] !== after3[k]);
  s.check(!v3[1].empty && v3[1].blank === 'DAÑADO' && v3[1].load && /No se puede cargar: Estado inválido: /.test(v3[1].title) &&
    t3.some((x) => x.kind === 'error' && x.text.startsWith('No se pudo cargar el estado de la ranura 1: Estado inválido: ')) && diff3.length === 0 && (await p3.ev('window.chip8.isPaused()')),
  `un estado dañado se ve «DAÑADO» y Cargar avisa «${(t3.find((x) => x.kind === 'error') || { text: '' }).text.slice(0, 70)}…» sin tocar la máquina`, JSON.stringify({ slot: v3[1], t3, diff3 }));
  await p3.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await p3.shot('48-estado-danado');
  s.check(p3.errors.length === 0, 'con un estado dañado no hay excepciones ni errores de consola', p3.errors.join(' | '));
  await p3.close();

  // Sin cartucho (un archivo sin demos incluidos): «Estados» explica que los estados son del cartucho de la ranura.
  const noDemos = `Object.defineProperty(globalThis, 'CHIP8_DEMOS', { configurable: true, get() { return []; }, set() {} });`;
  const p4 = await Page.open(ctx, { initScripts: [noDemos] });
  s.page = p4;
  await clearStorage(p4, ctx);
  await p4.goto(ctx.base + 'chip8.html');
  const e4 = await p4.ev(`({ hidden: document.getElementById('save-slots').hidden, hint: document.getElementById('states-hint').textContent, name: document.getElementById('cart-name').textContent, list: window.chip8.listSlots() })`);
  await p4.click('.tagline');
  await p4.press('KeyI');
  await sleep(80);
  const i4 = await statusText(p4);
  await p4.press('KeyU');
  await sleep(80);
  const u4 = await statusText(p4);
  s.check(e4.hidden && e4.name === 'Ranura vacía' && e4.list === null && e4.hint.startsWith('Los estados son del cartucho que está en la ranura') &&
    i4 === 'No hay un cartucho en la ranura: los estados son de cada cartucho.' && u4 === i4,
  `sin cartucho no hay ranuras: «${e4.hint}»; I y U lo dicen en la línea de estado`, JSON.stringify({ e4, i4, u4 }));
  await p4.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
  await p4.shot('48-estados-sin-cartucho');
  s.check(p4.errors.length === 0, 'sin cartucho no hay excepciones ni errores de consola', p4.errors.join(' | '));
}, 120000);

// 49 -------------------------------------------------------------------------------
scenario(49, 'Diseño con «Estados» a la vista: 1440, 768 y 360 px (sin scroll horizontal, keypad de 44 px, pantallitas con escala entera y botones enteros)', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  await loadWithButton(page, writeFixture(ctx, 'contador.ch8', romContador()), 'contador.ch8');
  await page.click('.tagline');
  await sleep(400);
  await page.press('KeyI');
  await sleep(300);
  await clickHit(page, slotSel(2, 'save'));
  for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [360, 640, true]]) {
    await page.setViewport(w, h, mobile ? 2 : 1, mobile);
    await page.reload();
    await page.click('#lib-chips .chip:nth-child(1)');   // contador, desde «Tuyos:», con sus estados
    await page.waitFor(`document.getElementById('cart-name').textContent === 'contador'`, { timeout: 3000, desc: 'contador desde «Tuyos:»' });
    await sleep(400);
    await page.ev('window.scrollTo(0, 0)');
    const m = await page.ev(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
      const over = [];
      document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed') over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className).slice(0, 40)); });
      const keys = Array.from(document.querySelectorAll('#keypad .key')).map((k) => k.getBoundingClientRect());
      const box = (list) => ({ t: Math.round(Math.min(...list.map((k) => k.top))), b: Math.round(Math.max(...list.map((k) => k.bottom))), l: Math.round(Math.min(...list.map((k) => k.left))), r: Math.round(Math.max(...list.map((k) => k.right))) });
      const group = document.getElementById('states-group'), g = group.getBoundingClientRect();
      const cards = Array.from(group.querySelectorAll('.save-slot')).map((c) => c.getBoundingClientRect());
      const btns = Array.from(group.querySelectorAll('.save-btn')).map((b) => ({ text: b.textContent, clipped: b.scrollWidth > b.clientWidth + 1, h: b.getBoundingClientRect().height }));
      const thumbs = Array.from(group.querySelectorAll('canvas')).filter((c) => !c.hidden).map((c) => Math.round(parseFloat(c.style.width) * devicePixelRatio / c.width * 1000) / 1000);
      const overlap = cards.some((a, i) => cards.some((b, j) => i < j && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
      return { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sy: scrollY, over: over.slice(0, 6),
        minKey: Math.min(...keys.map((k) => Math.min(k.width, k.height))), keys: box(keys), crt: r(document.getElementById('crt')),
        group: r(group), cardsIn: cards.every((c) => c.left >= g.left && c.right <= g.right), overlap, cols: new Set(cards.map((c) => Math.round(c.top))).size,
        clipped: btns.filter((b) => b.clipped).map((b) => b.text), minBtn: Math.min(...btns.map((b) => b.h)), thumbs, rewindBtn: r(document.getElementById('btn-rewind')) };
    })()`);
    s.info(`${w}×${h}: pantalla ${m.crt.t}–${m.crt.b} px, keypad ${m.keys.t}–${m.keys.b} px (teclas de ${m.minKey.toFixed(0)} px), «Estados» ${m.group.w}×${m.group.h} px en ${m.cols} fila(s), pantallitas ×${m.thumbs.join(', ×')}`);
    s.check(m.sw <= m.iw && m.over.length === 0, `${w}px: sin scroll horizontal (${m.sw} ≤ ${m.iw})`, 'se salen: ' + m.over.join(', '));
    s.check(m.minKey >= 44, `${w}px: teclas del keypad de al menos 44 px (${m.minKey.toFixed(1)})`);
    s.check(m.group.l >= 0 && m.group.r <= m.iw && m.cardsIn && !m.overlap && m.clipped.length === 0 && m.minBtn >= 24,
      `${w}px: «Estados» entra en el ancho (${m.group.l}–${m.group.r} px), las cinco ranuras no se pisan y los botones (${Math.round(m.minBtn)} px de alto) muestran su texto entero`, JSON.stringify(m));
    s.check(m.thumbs.length === 2 && m.thumbs.every((x) => Number.isInteger(x) && x >= 2), `${w}px: las dos pantallitas tienen escala entera de al menos 2 píxeles del monitor por píxel CHIP-8 (×${m.thumbs.join(', ×')})`, JSON.stringify(m.thumbs));
    if (w === 360) {
      s.check(m.sy === 0 && m.crt.t >= 0 && m.crt.b <= m.ih && m.keys.t >= m.crt.b && m.keys.b <= m.ih && m.keys.l >= 0 && m.keys.r <= m.iw,
        `360×640: la pantalla (${m.crt.t}–${m.crt.b}) y el keypad entero (${m.keys.t}–${m.keys.b}) siguen entrando en la primera vista`, JSON.stringify({ crt: m.crt, keys: m.keys }));
    }
    await page.shot(`49-diseno-${w}`);
    await page.ev("document.getElementById('states-group').scrollIntoView({ block: 'center' })");
    await page.shot(`49-diseno-${w}-estados`);
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 50 -------------------------------------------------------------------------------
scenario(50, 'Rebobinado a 60 fps con XO-CHIP a 1000 IPF: Planos y una ROM que reescribe la memoria entera corren y rebobinan sin perder cuadros', async (ctx, s) => {
  const page = await freshApp(ctx, s);
  // Cuadros de animación del navegador (requestAnimationFrame) entre dos momentos.
  const rafStart = () => page.ev(`(() => { const R = window.__raf = { n: 0, gaps: [], last: 0, stop: false }; const f = (t) => { if (R.last) R.gaps.push(t - R.last); R.last = t; R.n++; if (!R.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); R.t0 = performance.now(); return true; })()`);
  const rafStop = () => page.ev(`(() => { const R = window.__raf; R.stop = true; const secs = (performance.now() - R.t0) / 1000; const g = R.gaps.slice().sort((a, b) => a - b); return { fps: R.n / secs, max: g[g.length - 1] || 0, p95: g[Math.floor(g.length * 0.95)] || 0 }; })()`);
  async function rewindFor(label, ms) {
    const e0 = await page.ev('window.chip8.rewindInfo().entries');
    await rafStart();
    const t0 = await page.ev('performance.now()');
    await page.keyDown('KeyB');
    await sleep(ms);
    const e1 = await page.ev('window.chip8.rewindInfo().entries');
    const t1 = await page.ev('performance.now()');
    await page.keyUp('KeyB');
    const raf = await rafStop();
    const perSec = (e0 - e1) / ((t1 - t0) / 1000);
    s.info(`${label}: rebobinando ${(ms / 1000).toFixed(1)} s, ${raf.fps.toFixed(1)} cuadros por segundo (el más largo, ${raf.max.toFixed(1)} ms; el 95 %, menos de ${raf.p95.toFixed(1)} ms), ${perSec.toFixed(0)} frames hacia atrás por segundo`);
    return { raf, perSec, e0, e1 };
  }
  // Planos (XO-CHIP, dos planos y sonido), a 1000 IPF.
  await clickCart(page, 'planos');
  await page.click('#ipf-chips .chip:nth-child(6)');   // 1000
  await page.click('.tagline');
  await sleep(4000);
  const run1 = await measureRate(page, 2000);
  const pl = await rewindFor('Planos', 2000);
  s.check(run1.fps >= 55 && run1.fps <= 66, `Planos a 1000 IPF corre a ${run1.fps.toFixed(1)} frames por segundo guardando una foto por frame`);
  s.check(pl.raf.fps >= 55 && pl.raf.p95 < 25 && pl.perSec >= 100 && pl.perSec <= 135,
    `rebobinando Planos: ${pl.raf.fps.toFixed(1)} cuadros por segundo y ${pl.perSec.toFixed(0)} frames hacia atrás por segundo (el doble de 60)`, JSON.stringify(pl));
  // La captura, ya medido: Planos rebobinando (los dos planos y «⏪» en la pantalla).
  await page.keyDown('KeyB');
  await sleep(300);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('50-rebobinando-planos');
  await page.keyUp('KeyB');
  // Una ROM de XO-CHIP que escribe 16 bytes en casi cada página de los 64 KB, a 1000 IPF: cada foto copia la memoria cambiada.
  await loadWithButton(page, writeFixture(ctx, 'memoria64.ch8', asm(`
        LD V3, 240
inicio: LD I, LONG 0x0400
        LD V4, 0
bucle:  LD [I], VF              ; 16 bytes (I avanza 16 con el quirk de memoria de XO-CHIP)
        ADD I, V3               ; y 240 más: la página siguiente
        ADD V0, 1
        ADD V4, 1
        SE V4, 252
        JP bucle
        JP inicio`, true)), 'memoria64.ch8');
  await chooseWithMouse(page, '#preset', 'xochip');
  await page.click('#ipf-chips .chip:nth-child(6)');
  await page.click('.tagline');
  await sleep(3000);
  const run2 = await measureRate(page, 2000);
  const info2 = await page.ev('window.chip8.rewindInfo()');
  const mm = await rewindFor('memoria64', 2000);
  s.info(`memoria64: ${run2.fps.toFixed(1)} frames por segundo corriendo, ${Math.round(run2.ips)} instrucciones por segundo; ${info2.entries} fotos en ${(info2.bytes / 1048576).toFixed(1)} MB`);
  s.check(run2.fps >= 55 && run2.fps <= 66 && run2.ips >= 1000 * run2.fps * 0.95, `memoria64 a 1000 IPF corre a ${run2.fps.toFixed(1)} frames por segundo con las fotos del rebobinado`, JSON.stringify(run2));
  s.check(mm.raf.fps >= 55 && mm.raf.p95 < 25 && mm.perSec >= 100 && mm.perSec <= 135,
    `rebobinando memoria64: ${mm.raf.fps.toFixed(1)} cuadros por segundo y ${mm.perSec.toFixed(0)} frames hacia atrás por segundo`, JSON.stringify(mm));
  s.check(info2.bytes <= 48 * 1024 * 1024, `el buffer respeta su tope de 48 MB (${(info2.bytes / 1048576).toFixed(1)} MB)`);
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
}, 120000);

// ---------------------------------------------------------------- ayudas de los escenarios 51 en adelante (el Taller)
const WORKSHOP_KEY = 'chip8-consola.taller';
const ejemplo = (name) => fs.readFileSync(path.join(ROOT, 'docs', 'ejemplos', name), 'utf8');
const romSource = (id) => fs.readFileSync(path.join(ROOT, 'roms', id + '.asm'), 'utf8');

// Una tecla con modificadores, como la manda el teclado (Ctrl = 2, Mayús = 8).
async function comboKey(page, code, modifiers) {
  const k = KEYS[code];
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
}
// Escribe en el elemento enfocado como un teclado (o un dictado): el texto entra donde está el cursor.
const insertText = (page, text) => page.send('Input.insertText', { text });
// Pone el foco en el editor y el cursor (o una selección) donde se pide, como un clic.
const editorSelect = (page, start, end = start) => page.ev(`(() => { const t = document.getElementById('ws-text'); t.focus(); t.setSelectionRange(${start}, ${end}); return true; })()`);
// Elige un renglón entero del editor (desde 1, sin el salto de línea).
const editorSelectLine = (page, line) => page.ev(`(() => { const t = document.getElementById('ws-text'), v = t.value; let a = 0; for (let i = 1; i < ${line}; i++) a = v.indexOf('\\n', a) + 1; let b = v.indexOf('\\n', a); if (b < 0) b = v.length; t.focus(); t.setSelectionRange(a, b); return [a, b]; })()`);

// Lo que se ve del Taller: el editor (texto, cursor, foco, renglones y los marcados), la lista de errores,
// los selectores, la descripción, los avisos y qué botones están.
function editorView(page) {
  return page.ev(`(() => {
    const $ = (id) => document.getElementById(id), t = $('ws-text'), lines = Array.from(document.querySelectorAll('#ws-lines .ws-ln'));
    const sel = $('ws-program');
    return { open: !$('workshop').hidden, text: t.value, focus: document.activeElement === t, active: document.activeElement ? document.activeElement.id : null,
      caretLine: t.value.slice(0, t.selectionStart).split('\\n').length, start: t.selectionStart, end: t.selectionEnd,
      lines: lines.length, marked: lines.filter((l) => l.classList.contains('is-err')).map((l) => Number(l.textContent)),
      errors: Array.from(document.querySelectorAll('#ws-errors .ws-err')).map((b) => b.textContent), invalid: t.getAttribute('aria-invalid'),
      status: $('ws-status').textContent, program: sel.value, option: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '',
      options: Array.from(sel.options).map((o) => o.textContent), platform: $('ws-platform').value, about: $('ws-about').textContent,
      note: $('ws-note').hidden ? '' : $('ws-note').textContent, badge: !$('ws-badge').hidden, saveOn: !$('ws-save').disabled,
      restore: !$('ws-restore').hidden, remove: !$('ws-delete').hidden, name: $('ws-name-field').hidden ? null : $('ws-name').value };
  })()`);
}
// El margen va con el texto: para tres renglones a la vista, el número está a la altura de su renglón
// (el editor tiene renglones de 20 px y 8 px de margen arriba).
const GUTTER_EXPR = `(() => {
  const t = document.getElementById('ws-text'), r = t.getBoundingClientRect(), lines = document.querySelectorAll('#ws-lines .ws-ln');
  const first = Math.floor(t.scrollTop / 20) + 1, out = [];
  for (const k of [first, first + 7, first + 14]) {
    const el = lines[k - 1];
    if (!el) continue;
    out.push({ k, text: Number(el.textContent), diff: Math.round((el.getBoundingClientRect().top - (r.top + 8 + (k - 1) * 20 - t.scrollTop)) * 10) / 10 });
  }
  return { scrollTop: t.scrollTop, out, ok: out.length === 3 && out.every((o) => o.text === o.k && Math.abs(o.diff) <= 0.5) };
})()`;
const wsOpen = (page) => page.waitFor("!document.getElementById('workshop').hidden", { timeout: 3000, desc: 'el Taller abierto' });

// 51 -------------------------------------------------------------------------------
scenario(51, 'Taller: se abre al costado sin tapar la pantalla, trae los ejemplos y los fuentes de los cartuchos, y un ejemplo se ensambla y corre con Ctrl+Enter (sin ir a «Tus cartuchos», con sus etiquetas para el depurador); Y y Esc', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  await clickHit(page, '#btn-workshop');
  await wsOpen(page);
  await sleep(150);
  const geo = await page.ev(`(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
    const ws = document.getElementById('workshop'), crt = document.getElementById('crt'), con = document.getElementById('console');
    const c = r(crt), at = document.elementFromPoint((c.l + c.r) / 2, (c.t + c.b) / 2);
    return { ws: r(ws), crt: c, con: r(con), fixed: getComputedStyle(ws).position, hit: crt.contains(at), iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth,
      expanded: document.getElementById('btn-workshop').getAttribute('aria-expanded'), focus: document.activeElement && document.activeElement.id,
      groups: Array.from(document.querySelectorAll('#ws-program optgroup')).map((g) => g.label + ':' + g.children.length) };
  })()`);
  s.check(geo.fixed === 'fixed' && geo.ws.r <= geo.iw && geo.ws.t >= 0 && geo.ws.b <= geo.ih && geo.ws.l > geo.con.r && geo.hit && geo.sw <= geo.iw,
    `1440×900: el Taller va fijo a la derecha (${geo.ws.l}–${geo.ws.r} px) y la consola entera queda a su izquierda (${geo.con.l}–${geo.con.r} px): la pantalla se ve y un clic en ella le llega`, JSON.stringify(geo));
  s.check(geo.expanded === 'true' && geo.focus === 'ws-text', 'el botón del lápiz dice que está abierto (aria-expanded) y el foco queda en el editor', JSON.stringify(geo));
  s.check(sameList(geo.groups, ['Ejemplos del tutorial:11', 'Cartuchos incluidos:6']), `la lista trae los 11 ejemplos del tutorial y los 6 fuentes de los cartuchos (${geo.groups.join(', ')})`);
  const first = await editorView(page);
  s.check(first.program === 'demo:rebote' && first.text === romSource('rebote') && first.lines === first.text.split('\n').length && /Fuente del cartucho «Rebote»/.test(first.about),
    `la primera vez abre el fuente del cartucho que está en la ranura (Rebote, ${first.lines} renglones numerados)`, JSON.stringify({ program: first.program, lines: first.lines, about: first.about }));
  const g1 = await page.ev(GUTTER_EXPR);
  s.check(g1.ok, 'cada número del margen está a la altura de su renglón', JSON.stringify(g1));

  // Un ejemplo del tutorial, elegido con el mouse, y Ctrl+Enter en el editor.
  const chosen = await chooseWithMouse(page, '#ws-program', 'ejemplo:03-fantasma.asm');
  const src = ejemplo('03-fantasma.asm'), want = assemble(src);
  const ex = await editorView(page);
  s.check(chosen === 'ejemplo:03-fantasma.asm' && ex.text === src && ex.lines === src.split('\n').length && /^Ejemplo del tutorial: Cazamonedas, etapa A/.test(ex.about) && ex.platform === 'chip8',
    '«03-fantasma.asm» se abre con su texto, sus números de renglón, su descripción y la plataforma CHIP-8', JSON.stringify({ about: ex.about, platform: ex.platform }));
  const ghost = Array.from(want.bytes.slice(-6)).reduce((n, b) => n + b.toString(2).replace(/0/g, '').length, 0);   // los píxeles del sprite
  await page.click('#ws-text');
  await comboKey(page, 'Enter', 2);
  await page.waitFor(`document.getElementById('cart-name').textContent === '03-fantasma'`, { timeout: 3000, desc: '«03-fantasma» en la ranura' });
  await sleep(400);
  const run = await page.ev(`({ info: window.chip8.romInfo(), platform: window.chip8.cpu.platform, lit: Array.from(window.chip8.cpu.display).filter((v) => v).length, running: !window.chip8.isPaused(), lib: window.chip8.libraryList().length, sym: window.chip8.workshopSymbols(), status: document.getElementById('ws-status').textContent, focus: document.activeElement.id, text: document.getElementById('ws-text').value })`);
  s.check(run.info.sha1 === sha1Hex(want.bytes) && run.info.size === want.bytes.length && run.platform === 'chip8' && run.running && run.lit === ghost && run.text === src,
    `Ctrl+Enter lo ensambla y lo carga en la consola: corre en CHIP-8 con los mismos ${want.bytes.length} bytes que da tools/chip8asm.js y el fantasmita en la pantalla (${run.lit} píxeles); el texto no cambió`, JSON.stringify(run));
  s.check(run.lib === 0, 'no llenó «Tus cartuchos» (sigue vacío)', String(run.lib));
  s.check(run.sym && JSON.stringify(run.sym.labels) === JSON.stringify(want.labels) && run.sym.listing.length === want.listing.length &&
    run.sym.listing.every((e, i) => e.addr === want.listing[i].addr && e.line === want.listing[i].line && e.text === want.listing[i].text),
    `workshopSymbols() trae sus etiquetas (${Object.keys(want.labels).join(', ')}) y el listado de los ${want.listing.length} renglones con sus direcciones`, JSON.stringify(run.sym && run.sym.labels));
  s.check(run.status === '«03-fantasma» corre en la consola, en CHIP-8: 18 bytes, de 0x200 a 0x211. Para usar el teclado en el programa, tocá la pantalla.' && run.focus === 'ws-text',
    `la línea del Taller lo dice («${run.status}») y el foco sigue en el editor`);
  await page.ev('window.scrollTo(0, 0)');
  await page.shot('51-taller-corriendo');
  // Y con el foco en el editor escribe una «y», y Retroceso la borra (ninguna de las dos va a la consola).
  const resets0 = await page.ev(`${E2E}.resets`);
  await page.press('KeyY');
  const y1 = await editorView(page);
  await page.press('Backspace');
  const y2 = await editorView(page);
  const resets1 = await page.ev(`${E2E}.resets`);
  s.check(y1.open && y1.text === src.slice(0, y1.start - 1) + 'y' + src.slice(y1.start - 1) && y2.text === src && resets1 === resets0,
    'en el editor, Y escribe una «y» y Retroceso la borra: no abren ni cierran el Taller ni reinician la máquina', JSON.stringify({ resets0, resets1, open: y1.open }));
  // Otro cartucho en la ranura: las etiquetas ya no son de lo que corre.
  await page.click('#cart-chips .chip:nth-child(5)');   // Fuente, debajo de la ranura
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Fuente'`, { timeout: 3000, desc: 'Fuente en la ranura' });
  s.check((await page.ev('window.chip8.workshopSymbols()')) === null, 'con otro cartucho en la ranura, workshopSymbols() devuelve null');
  // Fuera del editor, Y cierra el Taller (la consola vuelve a tener el monitor al costado) y lo vuelve a abrir.
  await page.click('.tagline');
  await page.press('KeyY');
  const closed = await page.ev(`({ open: !document.getElementById('workshop').hidden, cls: document.documentElement.classList.contains('has-workshop'), expanded: document.getElementById('btn-workshop').getAttribute('aria-expanded'), mon: Math.round(document.getElementById('monitor').getBoundingClientRect().left), con: Math.round(document.getElementById('console').getBoundingClientRect().right) })`);
  s.check(!closed.open && !closed.cls && closed.expanded === 'false' && closed.mon > closed.con, 'fuera del editor, Y lo cierra y el monitor vuelve al costado de la consola', JSON.stringify(closed));
  await page.press('KeyY');
  await wsOpen(page);
  const again = await editorView(page);
  s.check(again.focus && again.program === 'ejemplo:03-fantasma.asm' && again.text === src, 'Y lo abre otra vez, en el mismo programa y con el foco en el editor', JSON.stringify({ focus: again.active, program: again.program }));
  // Esc en el editor: el primero avisa que Tab sale; el segundo cierra y el foco vuelve al botón.
  await page.press('Escape');
  const e1 = await editorView(page);
  await page.press('Escape');
  await sleep(50);
  const e2 = await editorView(page);
  s.check(e1.open && e1.focus && e1.status === 'Tab sale del editor. Esc otra vez cierra el Taller.' && !e2.open && e2.active === 'btn-workshop',
    'en el editor, el primer Esc avisa que Tab sale del editor y el segundo cierra el Taller, con el foco de vuelta en el botón del lápiz', JSON.stringify({ e1: e1.status, e2: e2.active }));
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 52 -------------------------------------------------------------------------------
scenario(52, 'Taller: los errores del ensamblador se marcan en el margen de su renglón, se listan y el cursor va al primero; la lista sigue sola mientras se corrigen; el margen se corre con el texto', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  await page.press('KeyY');
  await wsOpen(page);
  await clickHit(page, '#ws-new');
  const fresh = await editorView(page);
  s.check(fresh.program === 'mio:1' && fresh.name === 'Programa 1' && fresh.option === 'Programa 1' && fresh.focus && fresh.remove && !fresh.restore,
    '«Nuevo» crea «Programa 1» en «Tus programas», con su nombre a la vista, «Borrar» y el foco en el editor', JSON.stringify(fresh));
  const BAD = [
    '; tres errores',
    '        CLS',
    '        LDX V0, 1           ; instrucción desconocida',
    '        LD V1, 300          ; un byte no llega a 300',
    '        JP nada             ; etiqueta que no existe',
    'fin:    JP fin',
  ].join('\n');
  await editorSelect(page, 0, fresh.text.length);
  await insertText(page, BAD);
  let thrown = '';
  try { assemble(BAD); } catch (e) { thrown = e.message; }
  const rom0 = await page.ev('window.chip8.romInfo().sha1');
  await clickHit(page, '#ws-run');
  await sleep(150);
  const bad = await editorView(page);
  const want = ['Línea 3: instrucción desconocida: "LDX"', 'Línea 4: valor fuera de rango para un byte (-128..255): "300" = 300', 'Línea 5: etiqueta o constante desconocida: "nada"'];
  s.check(sameList(bad.errors, want) && thrown === want[0], `«Ensamblar y correr» lista los tres errores, con los mensajes del ensamblador (el primero es el que da tools/chip8asm.js: «${thrown}»)`, JSON.stringify(bad.errors));
  s.check(sameList(bad.marked, [3, 4, 5]) && bad.invalid === 'true', 'los renglones 3, 4 y 5 quedan marcados en el margen, y el editor dice que tiene errores (aria-invalid)', JSON.stringify(bad.marked));
  s.check(bad.focus && bad.caretLine === 3 && bad.start === bad.end && bad.start === BAD.indexOf('        LDX'), 'el cursor va al principio del renglón 3, el del primer error', JSON.stringify({ caret: bad.caretLine, start: bad.start }));
  s.check(bad.status === '3 errores. El primero: Línea 3: instrucción desconocida: "LDX"' && (await page.ev('window.chip8.romInfo().sha1')) === rom0,
    `la línea del Taller lo dice («${bad.status}») y la consola sigue con lo que tenía`);
  const tip = await page.ev("document.querySelectorAll('#ws-lines .ws-ln')[3].title");
  s.check(tip === want[1], 'el número marcado muestra su mensaje al pasar el mouse', tip);
  await page.shot('52-taller-errores');
  // Un clic en un error de la lista lleva el cursor a su renglón.
  await clickHit(page, '#ws-errors li:nth-child(3) .ws-err');
  const go = await editorView(page);
  s.check(go.focus && go.caretLine === 5, 'un clic en el error del renglón 5 lleva el cursor ahí', JSON.stringify({ caret: go.caretLine }));
  // Se corrigen de a uno: la lista y las marcas se ponen al día solas.
  await editorSelectLine(page, 3);
  await insertText(page, '        LD V0, 1');
  await sleep(700);
  const fix1 = await editorView(page);
  s.check(sameList(fix1.marked, [4, 5]) && fix1.errors.length === 2 && fix1.status === '2 errores. El primero: ' + want[1], 'al corregir el renglón 3, sola, la revisión deja marcados el 4 y el 5', JSON.stringify(fix1));
  await editorSelectLine(page, 4);
  await insertText(page, '        LD V1, 30');
  await editorSelectLine(page, 5);
  await insertText(page, '        JP fin');
  await sleep(700);
  const fix2 = await editorView(page);
  s.check(fix2.marked.length === 0 && fix2.errors.length === 0 && fix2.invalid === 'false' && fix2.status === 'Sin errores: ya se puede ensamblar y correr.', 'corregidos todos, no queda ninguna marca y la línea lo dice', JSON.stringify(fix2));
  await comboKey(page, 'Enter', 2);
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Programa 1'`, { timeout: 3000, desc: '«Programa 1» en la ranura' });
  s.check((await page.ev('window.chip8.cpu.pc')) >= 0x200, 'ahora sí corre en la consola');
  // El margen se corre con el texto: Autotest (casi 700 renglones), con la rueda del mouse.
  await chooseWithMouse(page, '#ws-program', 'demo:autotest');
  const r = await page.rect('#ws-text', false);
  for (let i = 0; i < 6; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy, deltaX: 0, deltaY: 600 });
    await sleep(60);
  }
  await sleep(200);
  const g = await page.ev(GUTTER_EXPR);
  s.check(g.ok && g.scrollTop > 2000, `con la rueda (${Math.round(g.scrollTop)} px hacia abajo), cada número sigue a la altura de su renglón (${g.out.map((o) => o.k).join(', ')})`, JSON.stringify(g));
  // Un error en el renglón 600: el cursor va hasta ahí y el renglón queda a la vista.
  const auto = await editorView(page);
  const at = auto.text.split('\n').slice(0, 599).join('\n').length + 1;
  await page.ev(`document.getElementById('ws-text').scrollTop = 0`);
  await editorSelect(page, at);
  await insertText(page, 'XYZ ');
  await comboKey(page, 'Enter', 2);
  await sleep(150);
  const far = await editorView(page);
  const vis = await page.ev(`(() => { const t = document.getElementById('ws-text'), y = 8 + 599 * 20 - t.scrollTop; return { y, h: t.clientHeight, mark: document.querySelectorAll('#ws-lines .ws-ln')[599].classList.contains('is-err') }; })()`);
  s.check(far.caretLine === 600 && sameList(far.marked, [600]) && vis.mark && vis.y >= 0 && vis.y + 20 <= vis.h, 'un error en el renglón 600: el cursor va ahí, el editor lo muestra y su número queda marcado', JSON.stringify({ caret: far.caretLine, marked: far.marked, vis }));
  const g2 = await page.ev(GUTTER_EXPR);
  s.check(g2.ok, 'y el margen sigue alineado', JSON.stringify(g2));
  await page.shot('52-taller-error-lejos');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 53 -------------------------------------------------------------------------------
scenario(53, 'Taller: lo que cambiás queda «sin guardar» aunque recargues, Guardar lo deja editado, «Restaurar el original» (con «Deshacer»), Nuevo, Tab, Mayús+Tab y Ctrl+Z, el nombre (Esc deshace lo escrito), Borrar (con «Deshacer») y el formato de localStorage', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  const reopen = async () => {
    await page.reload();
    await page.press('KeyY');
    await wsOpen(page);
    await sleep(100);
  };
  await page.press('KeyY');
  await wsOpen(page);
  await chooseWithMouse(page, '#ws-program', 'ejemplo:02-hola.asm');
  const orig = ejemplo('02-hola.asm');
  // Un cambio sin guardar: la lista, la marca y Guardar lo dicen, y sobrevive a una recarga.
  await editorSelect(page, orig.length);
  await insertText(page, '; un cambio\n');
  const d1 = await editorView(page);
  s.check(d1.text === orig + '; un cambio\n' && d1.option === '02-hola.asm · sin guardar' && d1.badge && d1.saveOn && d1.restore,
    'un cambio: la lista dice «02-hola.asm · sin guardar», aparece la marca SIN GUARDAR y se habilitan Guardar y «Restaurar el original»', JSON.stringify({ option: d1.option, badge: d1.badge, save: d1.saveOn, restore: d1.restore }));
  await sleep(900);   // lo que escribís se anota a los 0,7 s
  await reopen();
  const d2 = await editorView(page);
  s.check(d2.program === 'ejemplo:02-hola.asm' && d2.text === orig + '; un cambio\n' && d2.option === '02-hola.asm · sin guardar',
    'después de recargar, el Taller vuelve a «02-hola.asm» con el cambio, todavía sin guardar', JSON.stringify({ program: d2.program, option: d2.option }));
  // Guardar: queda «editado».
  await clickHit(page, '#ws-save');
  const sv = await editorView(page);
  const st1 = await stored(page, WORKSHOP_KEY);
  s.check(sv.option === '02-hola.asm · editado' && !sv.badge && !sv.saveOn && sv.restore && /^Guardado «02-hola\.asm»/.test(sv.status) && /Lo cambiaste y lo guardaste recién\./.test(sv.about),
    `Guardar lo deja «editado» («${sv.status}»)`, JSON.stringify(sv));
  s.check(st1 && st1.version === 1 && st1.edited['ejemplo:02-hola.asm'].source === orig + '; un cambio\n' && typeof st1.edited['ejemplo:02-hola.asm'].saved === 'number' &&
    Object.keys(st1.drafts).length === 0 && st1.open === 'ejemplo:02-hola.asm' && Array.isArray(st1.programs),
    `localStorage['${WORKSHOP_KEY}'] tiene la versión 1, el ejemplo editado con su fecha, ningún cambio pendiente y el programa abierto`, JSON.stringify(st1).slice(0, 300));
  // Restaurar el original, Deshacer, y otra vez Restaurar.
  await reopen();
  await clickHit(page, '#ws-restore');
  const rs = await editorView(page);
  const t1 = await toastsInfo(page);
  s.check(rs.text === orig && rs.option === '02-hola.asm' && !rs.restore && t1.some((t) => t.text === 'Volvió el original de «02-hola.asm».' && t.action === 'Deshacer'),
    '«Restaurar el original» vuelve el texto de siempre (sin «editado») y el aviso trae «Deshacer»', JSON.stringify({ option: rs.option, t1 }));
  await clickToastAction(page, 'Deshacer');
  const un = await editorView(page);
  s.check(un.text === orig + '; un cambio\n' && un.option === '02-hola.asm · editado', '«Deshacer» devuelve lo editado', JSON.stringify({ option: un.option }));
  await clickHit(page, '#ws-restore');
  // Nuevo, Tab y Mayús+Tab.
  await clickHit(page, '#ws-new');
  const nw = await editorView(page);
  await editorSelect(page, nw.text.length);
  await insertText(page, 'otra:');
  await page.press('Tab');
  await insertText(page, 'CLS');
  const tb = await editorView(page);
  s.check(tb.text.endsWith('\notra:   CLS') && tb.focus, 'Tab agrega espacios hasta la columna 8 (y no saca el foco del editor): «otra:   CLS»', JSON.stringify(tb.text.slice(-14)));
  const lineStart = tb.text.lastIndexOf('\n') + 1;
  await editorSelect(page, lineStart);
  await page.press('Tab');
  const tb2 = await editorView(page);
  await comboKey(page, 'Tab', 8);
  const tb3 = await editorView(page);
  s.check(tb2.text.endsWith('\n        otra:   CLS') && tb3.text.endsWith('\notra:   CLS') && tb3.caretLine === tb3.text.split('\n').length && tb3.focus,
    'al principio del renglón, Tab lo corre 8 espacios y Mayús+Tab los saca', JSON.stringify({ a: tb2.text.slice(-20), b: tb3.text.slice(-12) }));
  // Elegir dos renglones y correrlos juntos.
  const two = tb3.text.lastIndexOf('fin:');
  await editorSelect(page, two, tb3.text.length);
  await page.press('Tab');
  const tb4 = await editorView(page);
  s.check(/\n {8}fin: {4}JP fin {18}; un programa termina en un salto a sí mismo\n {8}otra: {3}CLS$/.test(tb4.text) && tb4.start === two && tb4.end === tb4.text.length,
    'con dos renglones elegidos, Tab corre los dos y quedan elegidos', JSON.stringify(tb4.text.slice(two - 2)));
  // Ctrl+Z deshace la sangría (el editor usa la edición del navegador).
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyZ', key: 'z', windowsVirtualKeyCode: 90, modifiers: 2, commands: ['undo'] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyZ', key: 'z', windowsVirtualKeyCode: 90, modifiers: 2 });
  const tb5 = await editorView(page);
  s.check(tb5.text === tb3.text, 'Ctrl+Z deshace la sangría de los dos renglones', JSON.stringify(tb5.text.slice(-30)));
  // El nombre (y Esc en «Nombre» deshace lo escrito, sin cerrar el Taller).
  await page.click('#ws-name');
  await page.ev("document.getElementById('ws-name').select()");
  await insertText(page, 'Mi juego');
  await page.press('Enter');
  await page.ev("document.getElementById('ws-name').select()");
  await insertText(page, 'Otro nombre');
  await page.press('Escape');
  const esc = await editorView(page);
  s.check(esc.open && esc.name === 'Mi juego' && esc.option === 'Mi juego · sin guardar', 'en «Nombre», Esc deshace lo que escribiste ahí y el Taller sigue abierto', JSON.stringify({ open: esc.open, name: esc.name }));
  await clickHit(page, '#ws-save');
  const nm = await editorView(page);
  s.check(nm.name === 'Mi juego' && nm.option === 'Mi juego' && nm.options[0] === 'Mi juego' && !nm.saveOn, 'el nombre se cambia en «Nombre» (Enter) y la lista lo muestra; Guardar lo guarda', JSON.stringify({ name: nm.name, options: nm.options.slice(0, 2) }));
  // Borrar, Deshacer y la recarga.
  await clickHit(page, '#ws-delete');
  const del = await editorView(page);
  const t2 = await toastsInfo(page);
  s.check(!del.options.includes('Mi juego') && del.program !== 'mio:1' && t2.some((t) => t.text === 'Borraste «Mi juego» del Taller.' && t.action === 'Deshacer'),
    'Borrar lo saca de la lista (el editor pasa a otro programa) y el aviso trae «Deshacer»', JSON.stringify({ program: del.program, t2 }));
  await clickToastAction(page, 'Deshacer');
  const back = await editorView(page);
  s.check(back.program === 'mio:1' && back.name === 'Mi juego' && back.text === tb3.text, '«Deshacer» lo devuelve, con su texto', JSON.stringify({ program: back.program }));
  await reopen();
  const after = await editorView(page);
  const st2 = await stored(page, WORKSHOP_KEY);
  s.check(after.program === 'mio:1' && after.text === tb3.text && after.options[0] === 'Mi juego' && after.option === 'Mi juego' && !after.badge,
    'después de recargar, «Mi juego» sigue ahí, guardado', JSON.stringify({ program: after.program, option: after.option }));
  s.check(st2 && st2.programs.length === 1 && st2.programs[0].id === 'mio:1' && st2.programs[0].name === 'Mi juego' && st2.programs[0].source === tb3.text &&
    typeof st2.programs[0].saved === 'number' && st2.next === 2 && !Object.keys(st2.edited).length,
    'en localStorage: tus programas con id, nombre, fuente y fecha, el próximo número y ningún ejemplo editado (se restauró)', JSON.stringify(st2).slice(0, 300));
  await page.shot('53-taller-tus-programas');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 54 -------------------------------------------------------------------------------
scenario(54, 'Taller: «Abrir .asm» con @platform xochip corre en XO-CHIP; Plataforma escribe la etiqueta @platform (y una que no vale es un error en su renglón); «Descargar .asm» y «Descargar .ch8» bajan el texto y la ROM exactos', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  const dir = path.join(ctx.browser.tmp, 'descargas-taller');
  fs.mkdirSync(dir, { recursive: true });
  await ctx.browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
  try {
    await page.press('KeyY');
    await wsOpen(page);
    // Un programa de XO-CHIP: los datos quedan más allá de 0xFFF.
    const XO = [
      '; Más allá de 4 KB',
      '; @platform xochip',
      '',
      '        LD I, LONG datos',
      '        LD V0, 30',
      '        LD V1, 12',
      '        DRW V0, V1, 4',
      'fin:    JP fin',
      'relleno: DB ' + new Array(3990).fill('0').join(', '),
      'datos:  DB 0xF0, 0x90, 0x90, 0xF0',
      '',
    ].join('\n');
    const file = path.join(ctx.browser.fixtures, 'lejos.asm');
    fs.writeFileSync(file, XO);
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    const opened = page.cdp.waitEvent('Page.fileChooserOpened', page.sessionId, 5000);
    await clickHit(page, '#ws-open');
    const ev = await opened;
    await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
    await page.waitFor(`window.chip8.workshopInfo().name === 'lejos'`, { timeout: 3000, desc: '«lejos» abierto en el Taller' });
    await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
    const op = await editorView(page);
    s.check(op.text === XO && op.program === 'mio:1' && op.name === 'lejos' && op.platform === 'xochip' && /Es de XO-CHIP: lo dice «@platform xochip», en el encabezado\./.test(op.about) && op.status === 'Abriste «lejos».',
      '«Abrir .asm» lo abre como un programa tuyo («lejos»), con su texto y la plataforma XO-CHIP de su etiqueta @platform', JSON.stringify({ name: op.name, platform: op.platform, about: op.about, status: op.status }));
    await comboKey(page, 'Enter', 2);
    await page.waitFor(`document.getElementById('cart-name').textContent === 'lejos'`, { timeout: 3000, desc: '«lejos» en la ranura' });
    await sleep(300);
    const want = assemble(XO, { xochip: true });
    const xo = await page.ev(`({ platform: window.chip8.cpu.platform, sel: document.getElementById('platform').value, sha: window.chip8.romInfo().sha1, size: window.chip8.romInfo().size, lit: Array.from(window.chip8.cpu.display).filter((v) => v).length, status: document.getElementById('ws-status').textContent })`);
    s.check(xo.platform === 'xochip' && xo.sel === 'xochip' && xo.sha === sha1Hex(want.bytes) && xo.size === 4006 && xo.lit === 12 && /en XO-CHIP: 4\.006 bytes, de 0x0200 a 0x11A5\./.test(xo.status),
      `corre en XO-CHIP (la consola cambió de plataforma) con los ${want.bytes.length} bytes que da el ensamblador con --xo, y dibuja el cuadrado que está más allá de 0xFFF`, JSON.stringify(xo));
    // Plataforma: CHIP-8 cambia la etiqueta; el programa no entra en 4 KB y el error queda en su renglón.
    await chooseWithMouse(page, '#ws-platform', 'chip8');
    const c8 = await editorView(page);
    s.check(c8.text === XO.replace('; @platform xochip', '; @platform chip8') && c8.platform === 'chip8' && c8.badge, 'elegir CHIP-8 en Plataforma cambia la etiqueta a «; @platform chip8» (y queda sin guardar)', JSON.stringify(c8.text.slice(0, 60)));
    await clickHit(page, '#ws-run');
    const big = await editorView(page);
    s.check(big.errors.length === 1 && /^Línea 9: el programa no entra en la memoria \(se pasa de la dirección 0xFFF; si es para XO-CHIP/.test(big.errors[0]) && sameList(big.marked, [9]) && big.caretLine === 9,
      'sin XO-CHIP no entra en 4 KB: el error es el del ensamblador, en el renglón 9, y el cursor va ahí', JSON.stringify(big.errors));
    await chooseWithMouse(page, '#ws-platform', 'xochip');
    // Una etiqueta que no es una plataforma: error en su renglón.
    await editorSelectLine(page, 2);
    await insertText(page, '; @platform xo');
    await clickHit(page, '#ws-run');
    const badTag = await editorView(page);
    s.check(sameList(badTag.errors, ['Línea 2: @platform tiene que ser chip8, schip o xochip (dice "xo")']) && sameList(badTag.marked, [2]) && /no es una plataforma/.test(badTag.about),
      'una etiqueta «@platform xo» es un error en el renglón 2 (el mismo texto que da tools/embed-roms.js)', JSON.stringify({ errors: badTag.errors, about: badTag.about }));
    await editorSelectLine(page, 2);
    await insertText(page, '; @platform xochip');
    // Descargar .asm y .ch8.
    const p1 = nextDownload(ctx);
    await clickHit(page, '#ws-dl-asm');
    const d1 = await p1;
    const asmText = fs.readFileSync(d1.file || path.join(dir, d1.name), 'utf8');
    s.check(d1.state === 'completed' && d1.name === 'lejos.asm' && asmText === XO, `«Descargar .asm» baja «${d1.name}» con el texto del editor, exacto`, JSON.stringify(d1));
    const p2 = nextDownload(ctx);
    await clickHit(page, '#ws-dl-ch8');
    const d2 = await p2;
    const rom = fs.readFileSync(d2.file || path.join(dir, d2.name));
    s.check(d2.state === 'completed' && d2.name === 'lejos.ch8' && rom.equals(Buffer.from(want.bytes)), `«Descargar .ch8» baja «${d2.name}»: los ${rom.length} bytes que da el ensamblador`, JSON.stringify(d2));
    // Un ejemplo se baja con el nombre de su archivo; con errores, «Descargar .ch8» no baja nada y marca el error.
    await chooseWithMouse(page, '#ws-program', 'ejemplo:10-contador.asm');
    const p3 = nextDownload(ctx);
    await clickHit(page, '#ws-dl-ch8');
    const d3 = await p3;
    s.check(d3.name === '10-contador.ch8' && fs.readFileSync(d3.file || path.join(dir, d3.name)).equals(Buffer.from(assemble(ejemplo('10-contador.asm')).bytes)), `un ejemplo baja como «${d3.name}»`);
    await editorSelect(page, 0);
    await insertText(page, 'MAL\n');
    let got = null;
    const off = ctx.browser.cdp.on((m) => { if (m.method === 'Browser.downloadWillBegin') got = m.params.suggestedFilename; });
    await clickHit(page, '#ws-dl-ch8');
    await sleep(600);
    off();
    const noDl = await editorView(page);
    s.check(got === null && sameList(noDl.marked, [1]) && noDl.caretLine === 1, 'con un error, «Descargar .ch8» no baja nada: marca el error y lleva el cursor', JSON.stringify({ got, marked: noDl.marked }));
    // Un programa sin etiqueta: SUPER-CHIP la agrega después de los comentarios del encabezado.
    await clickHit(page, '#ws-new');
    await chooseWithMouse(page, '#ws-platform', 'schip');
    const sc = await editorView(page);
    s.check(sc.text.split('\n')[2] === '; @platform schip' && sc.text.split('\n')[3] === '' && sc.platform === 'schip',
      'en un programa sin etiqueta, elegir SUPER-CHIP agrega «; @platform schip» al final de los comentarios del principio', JSON.stringify(sc.text.split('\n').slice(0, 5)));
    await comboKey(page, 'Enter', 2);
    await page.waitFor(`window.chip8.cpu.platform === 'schip'`, { timeout: 3000, desc: 'la consola en SUPER-CHIP' });
    s.check(true, 'y corre en SUPER-CHIP');
    await page.shot('54-taller-plataforma');
  } finally {
    await ctx.browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 55 -------------------------------------------------------------------------------
scenario(55, 'Taller sin almacenamiento, sin lugar o con datos dañados: lo dice una vez, en el Taller, y sigue andando en memoria', async (ctx, s) => {
  // localStorage que tira una excepción en cada acceso.
  const broken = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Acceso al almacenamiento denegado (e2e)', 'SecurityError'); } });`;
  const p1 = await Page.open(ctx, { width: 1440, height: 900, initScripts: [broken] });
  s.page = p1;
  await p1.goto(ctx.base + 'chip8.html');
  await p1.instrument();
  await p1.press('KeyY');
  await wsOpen(p1);
  const NO_STORAGE = 'Este navegador no deja guardar datos: lo que escribas en el Taller dura hasta que cierres la página.';
  await clickHit(p1, '#ws-new');
  await editorSelect(p1, 0);
  await insertText(p1, '; hola\n');
  await clickHit(p1, '#ws-save');
  const a = await editorView(p1);
  await comboKey(p1, 'Enter', 2);
  await p1.waitFor(`document.getElementById('cart-name').textContent === 'Programa 1'`, { timeout: 3000, desc: '«Programa 1» en la ranura' });
  s.check(a.note === NO_STORAGE && a.option === 'Programa 1' && !a.badge && /^Guardado «Programa 1»\. Este navegador no deja guardar datos: dura hasta que cierres la página\.$/.test(a.status) && (await toastTexts(p1)).length === 0,
    `sin almacenamiento: el Taller lo dice («${NO_STORAGE.slice(0, 50)}…»), Guardar guarda en memoria (sin avisos flotantes) y el programa corre`, JSON.stringify({ note: a.note, status: a.status }));
  s.check(p1.errors.length === 0, 'sin almacenamiento no hay excepciones ni errores de consola', p1.errors.join(' | '));
  await p1.shot('55-taller-sin-almacenamiento');
  await p1.close();

  // localStorage lleno de verdad (QuotaExceededError).
  const p2 = await freshApp(ctx, s, { width: 1440, height: 900 });
  await p2.press('KeyY');
  await wsOpen(p2);
  await clickHit(p2, '#ws-new');
  const filled = await p2.ev(`(() => {
    let n = 0, total = 0;
    for (let size = 1 << 20; size >= 16; size >>= 1) {
      const chunk = 'x'.repeat(size);
      for (;;) {
        try { localStorage.setItem('relleno-' + n, chunk); n++; total += size; }
        catch (e) { if (e.name !== 'QuotaExceededError') return { error: e.name }; break; }
      }
    }
    return { n, total };
  })()`);
  s.info(`localStorage lleno con ${filled.n} claves de relleno (${Math.round(filled.total / 1024)} K caracteres)`);
  await editorSelect(p2, 0);
  await insertText(p2, '; ' + 'un programa largo '.repeat(400) + '\n');
  await clickHit(p2, '#ws-save');
  await sleep(150);
  const FULL = 'No hay más lugar en este navegador: «Programa 1» queda solo hasta que cierres la página. Para hacer lugar, borrá programas del Taller que no uses, estados viejos o cartuchos de «Tus cartuchos».';
  const b = await editorView(p2);
  const t2 = await toastsInfo(p2);
  s.check(!filled.error && t2.some((t) => t.text === FULL && t.kind === 'error') && b.note === 'Lo último no entró en el navegador: está solo hasta que cierres la página.' && b.saveOn &&
    b.status === 'No se pudo guardar «Programa 1» en el navegador: queda solo hasta que cierres la página.',
    `sin lugar: el aviso de error («${FULL.slice(0, 50)}…»), el Taller lo dice y Guardar sigue a mano para probar otra vez`, JSON.stringify({ t2, note: b.note, status: b.status }));
  await comboKey(p2, 'Enter', 2);
  await p2.waitFor(`document.getElementById('cart-name').textContent === 'Programa 1'`, { timeout: 3000, desc: '«Programa 1» en la ranura' });
  s.check(true, 'y el programa, que quedó en memoria, se ensambla y corre igual');
  // Se hace lugar y Guardar entra.
  await p2.ev(`(() => { for (let i = 0; i < 400; i++) localStorage.removeItem('relleno-' + i); return true; })()`);
  await clickHit(p2, '#ws-save');
  const c = await editorView(p2);
  const st = await stored(p2, WORKSHOP_KEY);
  s.check(!c.note && !c.saveOn && st && st.programs[0].source === c.text, 'con lugar otra vez, Guardar entra y el aviso del Taller se va', JSON.stringify({ note: c.note }));
  s.check(p2.errors.length === 0, 'sin lugar: sin excepciones ni errores de consola', p2.errors.join(' | '));
  await p2.close();

  // Datos dañados: todo o una parte.
  const p3 = await freshApp(ctx, s, { width: 1440, height: 900 });
  await p3.ev(`localStorage.setItem('${WORKSHOP_KEY}', '{roto')`);
  await p3.reload();
  await p3.press('KeyY');
  await wsOpen(p3);
  const d = await editorView(p3);
  s.check(d.note === 'Los programas guardados del Taller estaban dañados y no se pudieron leer.' && d.program === 'demo:rebote' && d.text === romSource('rebote'),
    'con un JSON roto, el Taller lo dice y arranca como nuevo', JSON.stringify({ note: d.note, program: d.program }));
  await p3.ev(`localStorage.setItem('${WORKSHOP_KEY}', JSON.stringify({ version: 1, next: 3, open: 'mio:1', programs: [{ id: 'mio:1', name: 'Bueno', source: 'fin: JP fin\\n', saved: 1 }, { id: 'mio:2', name: 'Roto', source: 42 }, { id: 'otro', name: 'Raro', source: 'CLS' }], edited: { 'ejemplo:01-a-mano.asm': { source: null }, 'demo:rebote': { source: 'CLS\\n', saved: 2 } }, drafts: { 'mio:1': 'fin: JP fin ; cambio\\n', 'mio:9': 'x' } }))`);
  await p3.reload();
  await p3.press('KeyY');
  await wsOpen(p3);
  const e = await editorView(p3);
  s.check(e.note === '3 programas guardados estaban dañados y los descarté.' && e.program === 'mio:1' && e.text === 'fin: JP fin ; cambio\n' && e.option === 'Bueno · sin guardar' &&
    e.options.includes('Rebote · editado') && !e.options.some((o) => /Roto|Raro/.test(o)),
    'con una parte dañada, quedan los programas que se pueden leer (con su cambio sin guardar) y el Taller dice cuántos descartó', JSON.stringify({ note: e.note, options: e.options.slice(0, 3) }));
  s.check(p3.errors.length === 0, 'datos dañados: sin excepciones ni errores de consola', p3.errors.join(' | '));
  await p3.shot('55-taller-datos-danados');
});

// 56 -------------------------------------------------------------------------------
scenario(56, 'Diseño con el Taller abierto: a 1440 y 1280 px va al costado sin tapar la pantalla; a 768 y 360 px va debajo de los estantes (a 360, abierto con un toque); sin scroll horizontal, botones enteros y el margen alineado', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  for (const [w, h, mobile] of [[1440, 900, false], [1280, 800, false], [768, 1024, false], [360, 640, true]]) {
    await page.setViewport(w, h, mobile ? 2 : 1, mobile);
    await page.reload();
    await sleep(300);
    await page.ev('window.scrollTo(0, 0)');
    const top = await page.ev(`(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; };
      const keys = Array.from(document.querySelectorAll('#keypad .key')).map((k) => k.getBoundingClientRect());
      return { btn: r('btn-workshop'), help: r('btn-help'), crt: r('crt'), keysBottom: Math.round(Math.max(...keys.map((k) => k.bottom))), ih: innerHeight }; })()`);
    s.check(top.btn.r <= top.help.l && top.btn.t === top.help.t && top.btn.b === top.help.b && (w > 480 || top.keysBottom <= top.ih),
      `${w}px: el botón del lápiz va al lado del «?», a la misma altura${w <= 480 ? `, y la pantalla y el keypad siguen entrando en la primera vista (hasta ${top.keysBottom} de ${top.ih} px)` : ''}`, JSON.stringify(top));
    if (mobile) {
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const b = await page.rect('#btn-workshop', false);
      const tp = { x: b.cx, y: b.cy, id: 3, radiusX: 4, radiusY: 4, force: 1 };
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
      await sleep(40);
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp] });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    } else {
      await clickHit(page, '#btn-workshop');
    }
    await wsOpen(page);
    await sleep(300);
    const m = await page.ev(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
      const over = [];
      document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed') over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className).slice(0, 40)); });
      const ws = document.getElementById('workshop'), crt = document.getElementById('crt'), lib = document.getElementById('lib-title').closest('.shelf');
      const btns = Array.from(ws.querySelectorAll('.ws-actions button')).filter((b) => !b.hidden).map((b) => ({ text: b.textContent, clipped: b.scrollWidth > b.clientWidth + 1, h: b.getBoundingClientRect().height, r: Math.round(b.getBoundingClientRect().right) }));
      const c = r(crt), at = document.elementFromPoint((c.l + c.r) / 2, (c.t + c.b) / 2);
      return { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, over: over.slice(0, 6), ws: r(ws), fixed: getComputedStyle(ws).position === 'fixed',
        crt: c, crtHit: !!at && crt.contains(at), lib: r(lib), editor: r(document.getElementById('ws-text')), btns, focus: document.activeElement ? document.activeElement.id : null };
    })()`);
    const g = await page.ev(GUTTER_EXPR);
    s.info(`${w}×${h}: Taller ${m.ws.l}–${m.ws.r} × ${m.ws.t}–${m.ws.b} px (${m.fixed ? 'fijo al costado' : 'debajo de los estantes'}), editor de ${m.editor.w}×${m.editor.h} px`);
    s.check(m.sw <= m.iw && m.over.length === 0 && m.ws.l >= 0 && m.ws.r <= m.iw, `${w}px: sin scroll horizontal y el Taller entra en el ancho (${m.ws.l}–${m.ws.r} px)`, 'se salen: ' + m.over.join(', '));
    const minH = mobile ? 32 : 24;
    s.check(m.btns.length >= 6 && m.btns.every((b) => !b.clipped && b.h >= minH && b.r <= m.ws.r), `${w}px: los botones del Taller muestran su texto entero y miden al menos ${minH} px de alto`, JSON.stringify(m.btns));
    s.check(m.editor.h >= (mobile ? 250 : 300) && m.editor.w >= 200 && g.ok, `${w}px: el editor mide ${m.editor.w}×${m.editor.h} px y cada número del margen está a la altura de su renglón`, JSON.stringify({ editor: m.editor, g }));
    if (w >= 1200) {
      s.check(m.fixed && m.crtHit && m.crt.r < m.ws.l && m.ws.t >= 0 && m.ws.b <= m.ih, `${w}px: el Taller va fijo a la derecha y la pantalla (${m.crt.l}–${m.crt.r} px) queda entera a su izquierda, sin nada encima`, JSON.stringify({ crt: m.crt, ws: m.ws }));
    } else {
      s.check(!m.fixed && m.ws.t >= -1 && m.ws.t < 60 && m.lib.b <= m.ws.t, `${w}px: el Taller va debajo de «Tus cartuchos» y la página se corre hasta él`, JSON.stringify({ ws: m.ws, lib: m.lib }));
    }
    if (mobile) s.check(m.focus === 'ws-title', 'abierto con un toque, el foco va al título del Taller (no al editor: así no aparece el teclado del teléfono)', String(m.focus));
    else s.check(m.focus === 'ws-text', `${w}px: abierto con el mouse, el foco va al editor`, String(m.focus));
    await page.shot(`56-taller-${w}`);
  }
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// 57 -------------------------------------------------------------------------------
scenario(57, 'Taller con el teclado y para lectores de pantalla: Tab hasta el botón y Enter, lo que escribís no llega al keypad, Esc y Tab salen del editor, Plataforma con las flechas, Guardar con Enter no pierde el foco, Esc cierra, Y desde la pantalla completa, roles y nombres; a 10.000 IPF sigue a 60 fps mientras escribís', async (ctx, s) => {
  const page = await freshApp(ctx, s, { width: 1440, height: 900 });
  // Con el teclado: Tab hasta el botón del lápiz y Enter.
  await page.click('.tagline');
  let guard = 0;
  while ((await page.ev('document.activeElement && document.activeElement.id')) !== 'btn-workshop' && guard++ < 20) await page.press('Tab', 10);
  s.check(guard < 20, `Tab llega al botón del lápiz (${guard} veces desde arriba)`);
  await page.press('Enter');
  await wsOpen(page);
  const a = await page.ev(`(() => { const $ = (id) => document.getElementById(id), ws = $('workshop');
    const label = (el) => { const l = document.querySelector('label[for="' + el.id + '"]'); return l ? l.textContent : el.getAttribute('aria-label'); };
    return { focus: document.activeElement.id, expanded: $('btn-workshop').getAttribute('aria-expanded'), controls: $('btn-workshop').getAttribute('aria-controls'), btnName: $('btn-workshop').getAttribute('aria-label'),
      region: ws.tagName + ' ' + document.getElementById(ws.getAttribute('aria-labelledby')).textContent, editor: $('ws-text').getAttribute('aria-label'), describedBy: $('ws-text').getAttribute('aria-describedby'),
      program: label($('ws-program')), platform: label($('ws-platform')), status: $('ws-status').getAttribute('role'), errors: $('ws-errors').getAttribute('aria-label'), actions: $('ws-actions') ? null : ws.querySelector('.ws-actions').getAttribute('aria-label'),
      gutter: $('ws-gutter').getAttribute('aria-hidden'), names: Array.from(ws.querySelectorAll('button')).filter((b) => !b.hidden).map((b) => b.textContent.trim()).filter((t) => !t) };
  })()`);
  s.check(a.focus === 'ws-text' && a.expanded === 'true' && a.controls === 'workshop' && a.btnName === 'Taller (Y)', 'Enter sobre el botón abre el Taller (aria-expanded, aria-controls, nombre «Taller (Y)») y el foco va al editor', JSON.stringify(a));
  s.check(a.region === 'SECTION TALLER' && a.editor === 'Programa en el assembler de CHIP-8' && a.describedBy === 'ws-keys' && a.program === 'Programa' && a.platform === 'Plataforma' &&
    a.status === 'status' && a.errors === 'Errores del ensamblador' && a.actions === 'Acciones del Taller' && a.gutter === 'true' && a.names.length === 0,
    'para un lector de pantalla: una región «TALLER», el editor y los selectores con nombre, la línea de estado (role=status), la lista de errores y las acciones con nombre, y el margen oculto', JSON.stringify(a));
  // Las teclas del keypad, N, H, Espacio y Retroceso escriben en el editor: no llegan a la consola.
  await editorSelect(page, 0);
  const pc0 = await page.ev(`({ resets: ${E2E}.resets, paused: window.chip8.isPaused() })`);
  await page.type('1234qwerzxcv');
  await page.press('Space');
  await page.type('nh');
  const typed = await page.ev(`({ keys: ${KEYS_EXPR}, caps: document.querySelectorAll('#keypad .key.is-down').length, text: document.getElementById('ws-text').value.slice(0, 15), help: document.getElementById('help').open, resets: ${E2E}.resets, paused: window.chip8.isPaused() })`);
  s.check(typed.text === '1234qwerzxcv nh' && noKeys(typed.keys) && typed.caps === 0 && !typed.help && typed.resets === pc0.resets && typed.paused === pc0.paused,
    'en el editor, «1234qwerzxcv nh» se escribe: ninguna tecla llega al keypad, Espacio no pausa, H no abre la ayuda y N no ejecuta', JSON.stringify(typed));
  // Esc y Tab: el foco sale del editor; Mayús+Tab vuelve.
  await page.press('Escape');
  await page.press('Tab');
  const out = await page.ev('({ id: document.activeElement.id, inWs: document.getElementById("workshop").contains(document.activeElement), text: document.getElementById("ws-text").value.slice(0, 15) })');
  await comboKey(page, 'Tab', 8);
  const back = await page.ev('document.activeElement.id');
  s.check(out.id !== 'ws-text' && out.text === '1234qwerzxcv nh' && back === 'ws-text', `Esc y después Tab sacan el foco del editor (a «${out.id}») sin escribir nada; Mayús+Tab vuelve`, JSON.stringify({ out, back }));
  // Si después de Esc el foco se va con un clic, al volver Tab agrega espacios otra vez.
  await page.press('Escape');
  await page.click('.tagline');
  await editorSelect(page, 0);
  await page.press('Tab');
  const again = await page.ev('({ id: document.activeElement.id, text: document.getElementById("ws-text").value.slice(0, 10), keys: document.getElementById("ws-keys").textContent })');
  s.check(again.id === 'ws-text' && again.text === '        12' && /^Tab agrega espacios/.test(again.keys), 'si después de Esc el foco se va con un clic, al volver al editor Tab agrega espacios otra vez', JSON.stringify(again));
  await comboKey(page, 'Tab', 8);
  // Plataforma con el teclado: las flechas recorren las opciones sin reescribir la etiqueta a cada paso.
  const t0 = await page.ev('document.getElementById("ws-text").value');
  await page.ev("document.getElementById('ws-platform').focus()");
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) { await page.press(k, 10); await sleep(40); }
  await sleep(800);
  const t1 = await page.ev('({ text: document.getElementById("ws-text").value, sel: document.getElementById("ws-platform").value, focus: document.activeElement.id })');
  await page.press('ArrowDown', 10);
  await sleep(800);
  const t2 = await page.ev('({ text: document.getElementById("ws-text").value, sel: document.getElementById("ws-platform").value, focus: document.activeElement.id })');
  await page.press('ArrowUp', 10);
  await page.press('Tab');
  const t3 = await page.ev('document.getElementById("ws-text").value');
  s.check(t1.text === t0 && t1.sel === 'chip8' && t1.focus === 'ws-platform' && t2.sel === 'schip' && t2.text.includes('; @platform schip\n') && t3.includes('; @platform chip8\n') && !t3.includes('schip'),
    'Plataforma con el teclado: ir y volver con las flechas no toca el programa; quedarse en SUPER-CHIP escribe la etiqueta, y salir del selector aplica la última', JSON.stringify({ t1: t1.sel, t2: t2.sel, focus: t1.focus }));
  // Guardar con el teclado: el botón se apaga y el foco pasa al editor (no se pierde).
  await page.ev("document.getElementById('ws-save').focus()");
  await page.press('Enter');
  const sv = await page.ev(`({ focus: document.activeElement.id, disabled: document.getElementById('ws-save').disabled, status: document.getElementById('ws-status').textContent })`);
  s.check(sv.disabled && sv.focus === 'ws-text' && /^Guardado «Rebote» \(editado/.test(sv.status), 'Guardar con Enter: el botón se apaga (no hay nada más que guardar) y el foco pasa al editor', JSON.stringify(sv));
  // Esc con el foco en un botón del Taller lo cierra y el foco vuelve al botón del lápiz.
  await page.ev("document.getElementById('ws-new').focus()");
  await page.press('Escape');
  const closed = await page.ev('({ open: !document.getElementById("workshop").hidden, focus: document.activeElement.id })');
  s.check(!closed.open && closed.focus === 'btn-workshop', 'Esc con el foco en un botón del Taller lo cierra y el foco vuelve al botón del lápiz', JSON.stringify(closed));
  // En pantalla completa el Taller no se vería: Y sale de la pantalla completa y lo abre.
  await page.click('.tagline');
  await page.press('KeyP');
  const fs1 = await page.poll('window.chip8.isFullscreen()', 3000);
  await page.press('KeyY');
  await page.poll('!window.chip8.isFullscreen() && !document.getElementById("workshop").hidden', 3000);
  const fs2 = await page.ev('({ full: window.chip8.isFullscreen(), open: !document.getElementById("workshop").hidden, focus: document.activeElement.id })');
  s.check(fs1 && !fs2.full && fs2.open && fs2.focus === 'ws-text', 'en pantalla completa, Y sale de la pantalla completa y abre el Taller, con el foco en el editor', JSON.stringify({ fs1, fs2 }));
  // Rendimiento: un programa del Taller a 10.000 IPF sigue a 60 fps mientras escribís.
  await clickHit(page, '#ws-new');
  const ed = await editorView(page);
  await editorSelect(page, 0, ed.text.length);
  await insertText(page, '; un bucle sin dibujo\nbucle:  ADD V0, 1\n        JP bucle\n; ');
  await comboKey(page, 'Enter', 2);
  await page.waitFor(`document.getElementById('cart-name').textContent === 'Programa 1'`, { timeout: 3000, desc: '«Programa 1» en la ranura' });
  await page.click('#ipf-chips .chip:nth-child(8)');   // 10.000
  await editorSelect(page, (await editorView(page)).text.length);
  await sleep(1500);
  const c0 = await counters(page);
  for (let i = 0; i < 70; i++) {
    await insertText(page, i % 10 === 9 ? '\n; ' : 'x');
    await sleep(25);
  }
  const c1 = await counters(page);
  const secs = (c1.now - c0.now) / 1000, fps = (c1.calls - c0.calls) / secs, ips = (c1.instr - c0.instr) / secs;
  s.info(`a 10.000 IPF, escribiendo ${secs.toFixed(1)} s: ${fps.toFixed(1)} frames por segundo, ${Math.round(ips)} instrucciones por segundo`);
  s.check(fps >= 55 && fps <= 66 && ips >= 10000 * fps * 0.98, `a 10.000 IPF, mientras se escriben 70 caracteres en el editor, la máquina sigue a ${fps.toFixed(1)} frames por segundo con 10.000 instrucciones cada uno`, JSON.stringify({ fps, ips }));
  await page.shot('57-taller-teclado');
  s.check(page.errors.length === 0, 'sin errores de consola', page.errors.join(' | '));
});

// ---------------------------------------------------------------- principal
async function runScenario(ctx, sc) {
  const s = new Scenario(sc.n, sc.title);
  const t0 = Date.now();
  try {
    await withTimeout(sc.fn(ctx, s), sc.timeout, `escenario ${sc.n}`);
  } catch (err) {
    s.check(false, 'el escenario terminó sin errores del arnés', (err && err.stack) || err);
    if (s.page) {
      try { await s.page.shot(`${String(sc.n).padStart(2, '0')}-falla`); } catch { /* sin captura */ }
    }
  } finally {
    for (const p of [...ctx.pages]) await p.close();
  }
  s.secs = (Date.now() - t0) / 1000;
  return s;
}

function printScenario(s) {
  console.log(`\n[${s.ok ? 'PASA' : 'FALLA'}] ${s.n}. ${s.title} (${s.secs.toFixed(1)} s)`);
  for (const i of s.infos) console.log(`        info   ${i}`);
  for (const c of s.checks) {
    console.log(`        ${c.ok ? 'ok   ' : 'FALLA'}  ${c.desc}`);
    if (!c.ok && c.detail) console.log('               -> ' + c.detail.split('\n').slice(0, 8).join('\n                  '));
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (opts.help) {
    const src = fs.readFileSync(__filename, 'utf8');
    console.log(src.slice(src.indexOf('/*') + 2, src.indexOf('*/')).replace(/^ \* ?/gm, ''));
    return 0;
  }
  let exe;
  try {
    exe = findBrowser(opts.browser);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  fs.mkdirSync(opts.shots, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const browser = new Browser(exe, opts);
  const ctx = { opts, browser, server, pages: new Set(), shots: [], base: `http://127.0.0.1:${port}/`, origin: `http://127.0.0.1:${port}` };

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await browser.close();
    server.close();
    if (server.closeAllConnections) server.closeAllConnections();
  };
  const onSignal = () => { console.error('\nInterrumpido: cerrando el navegador…'); cleanup().finally(() => process.exit(130)); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const results = [];
  try {
    console.log('== Pruebas E2E de la consola CHIP-8 ==');
    await browser.launch();
    console.log(`Navegador: ${browser.version}  (${exe})`);
    console.log(`Servidor:  ${ctx.base}`);
    console.log(`Capturas:  ${opts.shots}`);
    for (const sc of SCENARIOS) {
      if (opts.only && !opts.only.has(sc.n)) continue;
      const r = await runScenario(ctx, sc);
      printScenario(r);
      results.push(r);
      if (!browser.alive) { console.error('Se perdió la conexión con el navegador.'); break; }
    }
  } catch (e) {
    console.error('\nError del arnés: ' + ((e && e.stack) || e));
    results.push({ ok: false, n: 'arranque', title: 'arranque' });
  } finally {
    await cleanup();
  }
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nResumen: ${passed} de ${results.length} escenarios pasaron.` + (failed.length ? ` Fallaron: ${failed.map((r) => r.n).join(', ')}.` : ''));
  console.log(`Capturas guardadas en ${opts.shots} (${ctx.shots.length} archivos).`);
  const leftover = fs.existsSync(browser.tmp);
  if (leftover) console.log(`Aviso: no se pudo borrar el perfil temporal ${browser.tmp}`);
  return failed.length || results.length === 0 ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}

module.exports = { Browser, CDP, Page, startServer, findBrowser };
