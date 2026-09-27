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
 *   - Al terminar (bien, mal o con Ctrl+C) cierra el navegador y borra el perfil
 *     temporal.
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
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'chip8.html');

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
  const grande = writeFixture(ctx, 'grande.ch8', new Uint8Array(3585).fill(0x12));
  for (const [file, label, pattern] of [[vacio, 'vacía (0 bytes)', /vac[ií]/i], [grande, 'de 3585 bytes', /3[.,]?585/]]) {
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
  const expected = Math.round(Math.pow(1000, v1.range / 1000));
  s.check(v1.ipf !== 15 && v1.ipf === Math.max(1, Math.min(1000, expected)) && v1.input === String(v1.ipf), `clic en la mitad del deslizador: IPF ${v1.ipf} (posición ${v1.range}), el campo muestra ${v1.input}`, JSON.stringify(v1));
  await page.press('End');
  await sleep(50);
  const vEnd = await view();
  await page.press('Home');
  await sleep(50);
  const vHome = await view();
  s.check(vEnd.ipf === 1000 && vHome.ipf === 1, `teclas Fin / Inicio sobre el deslizador: ${vEnd.ipf} / ${vHome.ipf}`);
  // Campo numérico.
  const f = await page.rect('#ipf-input');
  for (const [txt, want] of [['250', 250], ['5000', 1000], ['0', 1]]) {
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
