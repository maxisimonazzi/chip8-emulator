#!/usr/bin/env node
'use strict';
// Servidor estático mínimo (sin dependencias) para probar chip8.html en el navegador.
// chip8.html también funciona abierto directamente desde el disco (file://); este
// servidor solo existe para las pruebas automatizadas y la vista previa.
// Uso: node tools/serve.js [puerto]   (por defecto 8008)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8008);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.asm': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      return res.end('Solicitud inválida');
    }
    if (urlPath === '/') urlPath = '/chip8.html';
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
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Sirviendo ${ROOT} en http://localhost:${PORT}/`));
