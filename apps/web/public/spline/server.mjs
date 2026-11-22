import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.splinecode': 'application/octet-stream',
};

const LONG_CACHE = 'public, max-age=31536000, immutable';

function send(req, res, filePath, cacheControl) {
  const ext = extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  };

  let bodyPath = filePath;
  const accept = req.headers['accept-encoding'] || '';
  if (statSync(filePath).size > 1024) {
    if (accept.includes('br') && existsSync(`${filePath}.br`)) {
      bodyPath = `${filePath}.br`;
      headers['Content-Encoding'] = 'br';
    } else if (accept.includes('gzip') && existsSync(`${filePath}.gz`)) {
      bodyPath = `${filePath}.gz`;
      headers['Content-Encoding'] = 'gzip';
    }
  }

  headers['Content-Length'] = statSync(bodyPath).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(bodyPath).pipe(res);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = resolve(join(root, pathname));

  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const cacheControl = /[\\/](vendor|assets)[\\/]/.test(filePath) ? LONG_CACHE : 'no-cache';
  send(req, res, filePath, cacheControl);
});

server.listen(port, () => {
  console.log(`Spline scene running at http://localhost:${port}`);
});
