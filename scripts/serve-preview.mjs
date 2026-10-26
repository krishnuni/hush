import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'dist');
const baseFlag = process.argv.indexOf('--base');
const base = baseFlag < 0 ? (process.env.HUSH_BASE_PATH ?? '/') : process.argv[baseFlag + 1];
if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(base))
  throw new Error('Choose a local base path ending in a slash.');
const portFlag = process.argv.indexOf('--port');
const port = portFlag < 0 ? 1420 : Number(process.argv[portFlag + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a port between 1024 and 65535.');
await stat(resolve(root, 'index.html')).catch(() => {
  throw new Error('The reader build is missing. Run npm ci and npm run build first.');
});
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (!path.startsWith(base)) {
      res.writeHead(404);
      res.end('This path is outside Hush.');
      return;
    }
    const relative = path.slice(base.length);
    const file = resolve(root, relative || 'index.html');
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end('This page is not part of Hush.');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Hush is ready at http://127.0.0.1:${port}${base}. Press Ctrl+C to close.`),
);
