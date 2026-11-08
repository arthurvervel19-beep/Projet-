// Textures procédurales haute résolution (albédo + carte de normales) générées au démarrage.
import * as THREE from 'three';

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// bruit de valeur périodique (pour des textures raccordables)
function makeNoise(r, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

// dessine avec raccord des bords
function wrap(size, x, y, r, fn) {
  for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
    if (x + dx + r < 0 || x + dx - r > size || y + dy + r < 0 || y + dy - r > size) continue;
    fn(x + dx, y + dy);
  }
}

// remplit le canvas avec un fond bruité (couleur de base ± variations)
function noiseFill(ctx, size, base, amp, freqs, r) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const ns = freqs.map((f) => ({ f, n: makeNoise(r, f) }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, w = 0;
    for (const { f, n } of ns) { const k = 1 / f; v += (n(x * f / size, y * f / size) - 0.5) * (1 / Math.sqrt(f)); w += k; }
    const i = (y * size + x) * 4;
    d[i] = base[0] + v * amp[0]; d[i + 1] = base[1] + v * amp[1]; d[i + 2] = base[2] + v * amp[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// carte de normales calculée depuis la luminance (ou un canvas de hauteur)
function normalFrom(src, strength) {
  const size = src.width;
  const sctx = src.getContext('2d');
  const s = sctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = (s[i * 4] * 0.3 + s[i * 4 + 1] * 0.59 + s[i * 4 + 2] * 0.11) / 255;
  const out = canvas(size), octx = out.getContext('2d');
  const img = octx.createImageData(size, size), d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const col = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// ------------------------------------------------------------------ sols
function grass(size) {
  const r = prng(11), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [112, 128, 64], [44, 44, 30], [4, 8, 32], r);
  for (let i = 0; i < size * size / 60; i++) {
    const x = r() * size, y = r() * size, len = 4 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    const light = r();
    g.strokeStyle = light > 0.6 ? col(170 + r() * 40, 178 + r() * 30, 96, 0.55) : light > 0.25 ? col(96, 124, 54, 0.5) : col(58, 80, 34, 0.55);
    g.lineWidth = 1 + r() * 1.2;
    wrap(size, x, y, len, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
  }
  for (let i = 0; i < 90; i++) {
    const x = r() * size, y = r() * size;
    g.fillStyle = col(110, 90, 55, 0.35);
    wrap(size, x, y, 3, (px, py) => { g.beginPath(); g.ellipse(px, py, 1.5 + r() * 2, 1 + r(), 0, 0, 7); g.fill(); });
  }
  return c;
}

function forestFloor(size) {
  const r = prng(12), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [62, 70, 36], [36, 34, 20], [4, 12, 40], r);
  for (let i = 0; i < size * size / 120; i++) {
    const x = r() * size, y = r() * size, k = r();
    g.fillStyle = k < 0.4 ? col(120, 85, 40, 0.6) : k < 0.7 ? col(85, 95, 40, 0.55) : col(150, 110, 50, 0.5);
    const a = r() * Math.PI;
    wrap(size, x, y, 5, (px, py) => { g.beginPath(); g.ellipse(px, py, 3 + r() * 3, 1.5 + r() * 1.5, a, 0, 7); g.fill(); });
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = 8 + r() * 14;
    g.strokeStyle = col(70, 50, 30, 0.7); g.lineWidth = 1.5;
    wrap(size, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  return c;
}

function dirt(size) {
  const r = prng(13), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [138, 108, 72], [50, 42, 30], [3, 8, 24, 64], r);
  for (let i = 0; i < size * size / 260; i++) {
    const x = r() * size, y = r() * size, rr = 1.5 + r() * 4;
    const v = 90 + r() * 70;
    wrap(size, x, y, rr + 2, (px, py) => {
      g.fillStyle = col(40, 30, 20, 0.35); g.beginPath(); g.ellipse(px + 1, py + 1.5, rr, rr * 0.75, 0, 0, 7); g.fill();
      g.fillStyle = col(v, v * 0.88, v * 0.72); g.beginPath(); g.ellipse(px, py, rr, rr * 0.75, 0, 0, 7); g.fill();
      g.fillStyle = col(255, 245, 225, 0.35); g.beginPath(); g.ellipse(px - rr * 0.3, py - rr * 0.3, rr * 0.35, rr * 0.25, 0, 0, 7); g.fill();
    });
  }
  return c;
}

function sand(size) {
  const r = prng(14), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [214, 194, 146], [26, 24, 20], [6, 32, 128], r);
  g.strokeStyle = col(170, 150, 105, 0.25); g.lineWidth = 2;
  for (let k = 0; k < 18; k++) {
    const y0 = k * size / 18;
    g.beginPath();
    for (let x = 0; x <= size; x += 8) g.lineTo(x, y0 + Math.sin(x / size * Math.PI * 4 + k) * 5);
    g.stroke();
  }
  return c;
}

function farmSoil(size) {
  const r = prng(15), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [112, 78, 46], [30, 24, 18], [8, 32], r);
  const rows = 8;
  for (let k = 0; k < rows; k++) {
    const y = (k + 0.5) * size / rows;
    const grd = g.createLinearGradient(0, y - size / rows / 2, 0, y + size / rows / 2);
    grd.addColorStop(0, 'rgba(40,25,12,0.55)'); grd.addColorStop(0.35, 'rgba(150,110,70,0.25)'); grd.addColorStop(0.6, 'rgba(160,120,80,0.15)'); grd.addColorStop(1, 'rgba(40,25,12,0.55)');
    g.fillStyle = grd; g.fillRect(0, y - size / rows / 2, size, size / rows);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = col(70 + r() * 60, 50 + r() * 40, 30, 0.5); g.fillRect(r() * size, r() * size, 2 + r() * 3, 2); }
  return c;
}

// ------------------------------------------------------------------ matériaux de construction
function stoneWall(size, base = [178, 168, 146], mortar = [110, 100, 84], seed = 21, rows = 8, varAmt = 34) {
  const r = prng(seed), c = canvas(size), g = c.getContext('2d');
  g.fillStyle = col(...mortar); g.fillRect(0, 0, size, size);
  const rh = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = (row % 2) * -rh * 0.8;
    while (x < size) {
      const w = rh * (1.1 + r() * 1.1);
      const v = (r() - 0.5) * varAmt;
      const gap = rows > 10 ? 1.5 : 2;
      const x0 = x + gap, y0 = row * rh + gap, ww = w - gap * 2, hh = rh - gap * 2;
      const grd = g.createLinearGradient(0, y0, 0, y0 + hh);
      grd.addColorStop(0, col(base[0] + v + 22, base[1] + v + 22, base[2] + v + 20));
      grd.addColorStop(0.5, col(base[0] + v, base[1] + v, base[2] + v));
      grd.addColorStop(1, col(base[0] + v - 30, base[1] + v - 30, base[2] + v - 28));
      g.fillStyle = grd;
      g.beginPath();
      const rad = 4;
      g.moveTo(x0 + rad, y0); g.lineTo(x0 + ww - rad, y0); g.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rad);
      g.lineTo(x0 + ww, y0 + hh - rad); g.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rad, y0 + hh);
      g.lineTo(x0 + rad, y0 + hh); g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rad); g.lineTo(x0, y0 + rad); g.quadraticCurveTo(x0, y0, x0 + rad, y0);
      g.fill();
      for (let k = 0; k < 14; k++) { g.fillStyle = col(0, 0, 0, r() * 0.12); g.fillRect(x0 + r() * ww, y0 + r() * hh, 2 + r() * 4, 1 + r() * 2); }
      x += w;
    }
  }
  return c;
}

function plaster(size, base = [228, 214, 182], seed = 22) {
  const r = prng(seed), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, base, [26, 26, 26], [4, 16, 64, 128], r);
  for (let i = 0; i < 30; i++) {
    const x = r() * size, y = r() * size, rr = 10 + r() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(150,120,80,0.12)'); grd.addColorStop(1, 'rgba(150,120,80,0)');
    g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return c;
}

function planks(size, base = [140, 98, 60], seed = 23) {
  const r = prng(seed), c = canvas(size), g = c.getContext('2d');
  const n = 8, w = size / n;
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * 40;
    g.fillStyle = col(base[0] + v, base[1] + v * 0.8, base[2] + v * 0.6); g.fillRect(i * w, 0, w, size);
    for (let k = 0; k < 10; k++) {
      g.strokeStyle = col(70, 45, 25, 0.25 + r() * 0.2); g.lineWidth = 1 + r();
      const x = i * w + 3 + r() * (w - 6);
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 8, size / 3, x + (r() - 0.5) * 8, size * 2 / 3, x, size); g.stroke();
    }
    const kn = r() * size; g.fillStyle = col(60, 38, 20, 0.6); g.beginPath(); g.ellipse(i * w + w / 2, kn, 3, 6, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(i * w, 0, 2.5, size);
    g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(i * w + 2.5, 0, 1.5, size);
    g.fillStyle = '#3a3a3a'; g.fillRect(i * w + w / 2 - 1.5, size * 0.1, 3, 3); g.fillRect(i * w + w / 2 - 1.5, size * 0.6, 3, 3);
  }
  return c;
}

function roofRows(size, kind, base, seed) {
  const r = prng(seed), c = canvas(size), g = c.getContext('2d');
  g.fillStyle = col(base[0] * 0.5, base[1] * 0.5, base[2] * 0.5); g.fillRect(0, 0, size, size);
  const rows = kind === 'thatch' ? 10 : 12, rh = size / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rh;
    if (kind === 'thatch') {
      for (let i = 0; i < 260; i++) {
        const x = r() * size, v = (r() - 0.5) * 60;
        g.strokeStyle = col(base[0] + v, base[1] + v * 0.9, base[2] + v * 0.5, 0.9); g.lineWidth = 1 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + (r() - 0.5) * 4, y + rh * 1.3); g.stroke();
      }
      const grd = g.createLinearGradient(0, y, 0, y + rh);
      grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(0.3, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(255,240,200,0.1)');
      g.fillStyle = grd; g.fillRect(0, y, size, rh);
      continue;
    }
    const tw = kind === 'tile' ? size / 10 : kind === 'slate' ? size / 7 : size / 8;
    for (let x = (row % 2) * -tw / 2; x < size + tw; x += tw) {
      const v = (r() - 0.5) * (kind === 'slate' ? 30 : 45);
      const grd = g.createLinearGradient(0, y, 0, y + rh);
      grd.addColorStop(0, col(base[0] + v + 25, base[1] + v + 20, base[2] + v + 15));
      grd.addColorStop(1, col(base[0] + v - 35, base[1] + v - 35, base[2] + v - 30));
      g.fillStyle = grd;
      g.beginPath();
      if (kind === 'tile') { g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + rh * 0.9); g.quadraticCurveTo(x + tw / 2, y + rh * 1.3, x + 1, y + rh * 0.9); }
      else { g.moveTo(x + 1.5, y); g.lineTo(x + tw - 1.5, y); g.lineTo(x + tw - 1.5, y + rh - 1); g.lineTo(x + 1.5, y + rh - 1); }
      g.closePath(); g.fill();
      if (kind === 'shingle') { g.strokeStyle = 'rgba(50,30,15,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + tw * 0.3, y + 2); g.lineTo(x + tw * 0.35, y + rh - 3); g.stroke(); }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + rh - 2, size, 2);
  }
  return c;
}

function bark(size) {
  const r = prng(31), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [96, 70, 48], [30, 24, 18], [8, 32], r);
  for (let i = 0; i < 140; i++) {
    const x = r() * size, l = 20 + r() * 80, y = r() * size;
    g.strokeStyle = col(40, 28, 18, 0.5 + r() * 0.3); g.lineWidth = 1.5 + r() * 2.5;
    wrap(size, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + (r() - 0.5) * 6, py + l / 3, px + (r() - 0.5) * 6, py + l * 2 / 3, px, py + l); g.stroke(); });
  }
  return c;
}

function foliage(size) {
  const r = prng(32), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [225, 225, 225], [50, 50, 50], [8, 24], r);
  for (let i = 0; i < size * size / 90; i++) {
    const x = r() * size, y = r() * size, v = 160 + r() * 95, a = r() * Math.PI;
    g.fillStyle = col(v, v, v, 0.7);
    wrap(size, x, y, 6, (px, py) => { g.beginPath(); g.ellipse(px, py, 4 + r() * 3, 2 + r() * 1.5, a, 0, 7); g.fill(); });
  }
  return c;
}

function cloth(size) {
  const r = prng(33), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [225, 225, 225], [20, 20, 20], [16, 64], r);
  g.globalAlpha = 0.12;
  for (let y = 0; y < size; y += 3) { g.fillStyle = y % 6 ? '#000' : '#fff'; g.fillRect(0, y, size, 1); }
  for (let x = 0; x < size; x += 3) { g.fillStyle = x % 6 ? '#000' : '#fff'; g.fillRect(x, 0, 1, size); }
  g.globalAlpha = 1;
  return c;
}

// cotte de mailles : anneaux entrelacés
function mail(size) {
  const c = canvas(size), g = c.getContext('2d');
  g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, size, size);
  const n = 16, cell = size / n;
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    const x = (i + (j % 2 ? 0.5 : 0)) * cell, y = j * cell * 0.86;
    g.lineWidth = cell * 0.24;
    g.strokeStyle = '#d8d8d8';
    g.beginPath(); g.ellipse(x, y, cell * 0.42, cell * 0.36, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = cell * 0.08; g.strokeStyle = '#ffffff';
    g.beginPath(); g.ellipse(x - cell * 0.05, y - cell * 0.05, cell * 0.36, cell * 0.3, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  }
  return c;
}

// cuir : grain et éraflures
function leather(size) {
  const r = prng(71), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [215, 215, 215], [26, 26, 26], [32, 96], r);
  g.globalAlpha = 0.18;
  for (let i = 0; i < 90; i++) { g.strokeStyle = r() < 0.5 ? '#000' : '#fff'; g.lineWidth = 0.6 + r(); const x = r() * size, y = r() * size; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); }
  g.globalAlpha = 1;
  return c;
}

// mèches (cheveux, crins, fourrure)
function fur(size) {
  const r = prng(72), c = canvas(size), g = c.getContext('2d');
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 6; i++) {
    const x = r() * size, y = r() * size, l = 6 + r() * 18, v = 150 + r() * 105;
    g.strokeStyle = `rgba(${v},${v},${v},0.7)`; g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 4, y + l / 2, x + (r() - 0.5) * 6, y + l); g.stroke();
  }
  return c;
}

// robe du cheval : pelage fin
function coat(size) {
  const r = prng(73), c = canvas(size), g = c.getContext('2d');
  noiseFill(g, size, [228, 228, 228], [14, 14, 14], [8, 48], r);
  g.globalAlpha = 0.1;
  for (let i = 0; i < size * 3; i++) { const x = r() * size, y = r() * size; g.strokeStyle = r() < 0.5 ? '#000' : '#fff'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y + 5 + r() * 4); g.stroke(); }
  g.globalAlpha = 1;
  return c;
}

// pierres polygonales ajustées (maçonnerie inca)
function ashlar(size) {
  const r = prng(61), c = canvas(size), g = c.getContext('2d');
  const n = 6, cell = size / n;
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + 0.15 + r() * 0.7) * cell, (j + 0.15 + r() * 0.7) * cell, (r() - 0.5) * 40]);
  const img = g.createImageData(size, size), d = img.data;
  const nz = makeNoise(r, 32);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + n) % n, jj = (cj + dj + n) % n;
      const p = pts[jj * n + ii];
      const px = p[0] + (ci + di - ii) * cell, py = p[1] + (cj + dj - jj) * cell;
      const dd = Math.hypot(x - px, y - py);
      if (dd < d1) { d2 = d1; d1 = dd; best = jj * n + ii; } else if (dd < d2) d2 = dd;
    }
    const edge = d2 - d1;
    const v = pts[best][2] + (nz(x / size * 32, y / size * 32) - 0.5) * 30;
    const bevel = Math.min(1, edge / 10);
    const k = edge < 2.2 ? 0.25 : 0.55 + bevel * 0.45;
    const i = (y * size + x) * 4;
    d[i] = (150 + v) * k; d[i + 1] = (146 + v) * k; d[i + 2] = (136 + v) * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// rondins horizontaux (architecture viking)
function logs(size) {
  const r = prng(62), c = canvas(size), g = c.getContext('2d');
  const n = 6, h = size / n;
  for (let k = 0; k < n; k++) {
    const y = k * h;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    const v = (r() - 0.5) * 30;
    grd.addColorStop(0, col(70 + v, 48 + v, 30 + v)); grd.addColorStop(0.35, col(132 + v, 96 + v, 62 + v));
    grd.addColorStop(0.7, col(104 + v, 74 + v, 46 + v)); grd.addColorStop(1, col(46 + v, 30 + v, 18 + v));
    g.fillStyle = grd; g.fillRect(0, y, size, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = col(50, 34, 20, 0.35); g.lineWidth = 1 + r(); const yy = y + 4 + r() * (h - 8), x = r() * size; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 20 + r() * 60, yy + (r() - 0.5) * 3); g.stroke(); }
    g.fillStyle = 'rgba(20,12,6,0.7)'; g.fillRect(0, y + h - 2, size, 2);
  }
  return c;
}

// ------------------------------------------------------------------ fabrique
export function buildTextures(renderer, quality = 'high') {
  const S = quality === 'high' ? 512 : 256;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (cv, srgb = true) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const pair = (cv, strength) => ({ map: tex(cv), normal: tex(normalFrom(cv, strength), false) });
  const T = {
    grass: tex(grass(S)), forest: tex(forestFloor(S)), dirt: tex(dirt(S)), sand: tex(sand(S)),
    farm: pair(farmSoil(S), 3),
    stone: pair(stoneWall(S), 4),
    darkstone: pair(stoneWall(S, [138, 132, 120], [80, 76, 68], 24), 4),
    plaster: pair(plaster(S), 1.5),
    planks: pair(planks(S), 3),
    darkwood: pair(planks(S, [88, 60, 38], 25), 3),
    tile: pair(roofRows(S, 'tile', [168, 74, 46], 26), 5),
    slate: pair(roofRows(S, 'slate', [88, 98, 110], 27), 4),
    shingle: pair(roofRows(S, 'shingle', [120, 84, 52], 28), 4),
    thatch: pair(roofRows(S, 'thatch', [196, 160, 88], 29), 3),
    bark: pair(bark(S / 2), 4),
    foliage: tex(foliage(S / 2)),
    cloth: pair(cloth(S / 4), 1.5),
    mail: pair(mail(S / 4), 5),
    leather: pair(leather(S / 4), 2),
    fur: pair(fur(S / 4), 3),
    coat: pair(coat(S / 4), 1.5),
    marble: pair(stoneWall(S, [236, 232, 222], [200, 194, 182], 40, 6, 16), 2.5),
    sandstone: pair(stoneWall(S, [224, 192, 140], [184, 152, 106], 41, 7, 22), 3),
    mudbrick: pair(stoneWall(S, [198, 150, 104], [168, 126, 86], 42, 14, 30), 2.5),
    stucco: pair(plaster(S, [236, 210, 164], 43), 1.2),
    whiteplaster: pair(plaster(S, [242, 238, 228], 44), 0.8),
    ashlar: pair(ashlar(S), 4),
    logs: pair(logs(S), 4),
    kawara: pair(roofRows(S, 'tile', [92, 96, 106], 45), 5),
  };
  T.metalNoise = T.leather.normal;
  for (const k of ['mail', 'cloth', 'leather']) for (const t of [T[k].map, T[k].normal]) t.repeat.set(k === 'mail' ? 3 : 2, k === 'mail' ? 3 : 2);
  return T;
}
