// Local server for dist/ and the API functions. Usage: npm run preview
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const MAX_BODY = 2 * 1024 * 1024 + 65536;
const routes = {
  '/api/config': '../api/config.ts',
  '/api/workspace': '../api/workspace.ts',
  '/api/chat': '../api/chat.ts',
};
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.html': 'text/html; charset=utf-8',
};

async function api(req, res, file) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'O espaço excede o limite de envio.' }));
    }
    chunks.push(chunk);
  }
  if (chunks.length) req.body = Buffer.concat(chunks).toString('utf8');
  const { default: handler } = await import(file);
  return handler(req, res);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (routes[name]) return await api(req, res, routes[name]);
      const file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(dist + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (error, data) => {
        if (error) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        res.end(data);
      });
    } catch {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Não foi possível atender a solicitação.' }));
    }
  });
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const env = path.join(root, '.env.local');
  if (fs.existsSync(env)) process.loadEnvFile(env);
  const port = Number(process.env.PORT) || 4187;
  createServer().listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
}
