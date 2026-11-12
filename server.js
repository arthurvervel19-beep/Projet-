// Serveur Node.js minimal (sans dépendance) qui sert le jeu.
// Lancement : npm start  puis ouvrir http://localhost:3000
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Interdit'); return; }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    res.writeHead(500); res.end('Erreur serveur');
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Aube des Royaumes est prêt : http://localhost:${PORT}`);
  // adresses à ouvrir depuis un téléphone ou une tablette branchés sur le même Wi-Fi
  const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  if (lan.length && HOST === '0.0.0.0') {
    console.log('Sur un téléphone connecté au même Wi-Fi, ouvrez :');
    for (const ip of lan) console.log(`  http://${ip}:${PORT}`);
  }
});
