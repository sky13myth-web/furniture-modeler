import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
export const cacheDir = path.resolve(root, 'assets', 'textures');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

// 1x1 neutral gray JPEG fallback for offline / error cases
export const FALLBACK_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

export async function handleTextureRequest(pathname, res, localCacheDir = cacheDir) {
  const match = pathname.match(/^\/(?:textures\/yildiz|api\/texture|assets\/textures)\/([^/]+?)(?:\.jpg)?$/i);
  if (!match) return false;
  const rawCode = match[1];
  const safeCode = rawCode.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeCode) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end('Invalid decor code');
    return true;
  }

  const filePath = path.join(localCacheDir, `${safeCode}.jpg`);
  try {
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat && fileStat.isFile()) {
      const data = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(data);
      return true;
    }

    const cdnUrl = `https://app.yildiz.com/Bundles/onizleme/${encodeURIComponent(safeCode)}.jpg`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(cdnUrl, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeout);

    if (resp && resp.ok) {
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      await mkdir(localCacheDir, { recursive: true }).catch(() => {});
      await writeFile(filePath, buffer).catch(() => {});
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(buffer);
      return true;
    }
  } catch (err) {
    // Gracefully handle network/disk exceptions
  }

  // Graceful fallback for offline / upstream 404 / connection error
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(FALLBACK_JPEG);
  return true;
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      res.end();
      return;
    }

    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

    // 1. Texture proxy endpoint
    if (await handleTextureRequest(pathname, res)) {
      return;
    }

    // 2. Static file serving
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) || pathname.split('/').some(p => p.startsWith('.'))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!(await stat(target)).isFile()) throw new Error('not file');
    const data = await readFile(target);
    res.writeHead(200, {
      'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open http://localhost:${port}` : err);
  process.exit(1);
});

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  server.listen(port, '127.0.0.1', () => console.log(`ATOLYE Furniture Studio: http://localhost:${port}\nPress Ctrl+C to stop.`));
}

