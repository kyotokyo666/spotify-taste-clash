// Production-сервер: отдаёт собранный dist/ и AI-эндпоинты.
// Запуск: npm run build && npm start (Node ≥ 22.18 исполняет TypeScript без сборки).

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './ai.ts';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

async function serveStatic(urlPath: string, res: import('node:http').ServerResponse) {
  // normalize + проверка префикса защищают от выхода за пределы dist/ через ../
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel);
  if (!file.startsWith(DIST.endsWith(sep) ? DIST : DIST + sep)) file = join(DIST, 'index.html');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) file = join(DIST, 'index.html'); // SPA: всё неизвестное — на index.html
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    await serveStatic((req.url ?? '/').split('?')[0], res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, HOST, () => console.log(`Taste Clash: http://${HOST}:${PORT}`));
