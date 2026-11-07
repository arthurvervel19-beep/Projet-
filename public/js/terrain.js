// Terrain peint : calcul pixel par pixel par blocs de 16×16 tuiles (mis en cache),
// avec transitions douces entre herbe, terre, sable et eau, relief simulé et détails.
import { TILE_W, TILE_H, TERRAIN } from './config.js';

const HW = TILE_W / 2, HH = TILE_H / 2;
export const CHUNK = 16;

const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export class TerrainPainter {
  constructor(game) {
    this.game = game;
    const m = game.map;
    this.W = m.w; this.H = m.h;
    // bruit de valeur (table 256×256 répétée)
    let seed = (game.seed * 2654435761) >>> 0;
    const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    this.grid = new Float32Array(256 * 256);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rnd();
    // champs par tuile
    const n = m.w * m.h;
    this.water = new Float32Array(n); this.sand = new Float32Array(n); this.dirt = new Float32Array(n);
    this.depth = new Float32Array(n); this.forest = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = m.terrain[i];
      this.water[i] = t === TERRAIN.WATER ? 1 : 0;
      this.sand[i] = t === TERRAIN.SAND ? 1 : 0;
      this.dirt[i] = t === TERRAIN.DIRT ? 1 : 0;
    }
    // profondeur de l'eau : distance à la rive
    const dist = new Float32Array(n).fill(99);
    const q = [];
    for (let i = 0; i < n; i++) if (!this.water[i]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % m.w, y = (c - x) / m.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const ni = ny * m.w + nx;
        if (dist[ni] > dist[c] + 1) { dist[ni] = dist[c] + 1; q.push(ni); }
      }
    }
    for (let i = 0; i < n; i++) this.depth[i] = Math.max(0, Math.min(1, (dist[i] - 0.5) / 4));
    // densité de forêt (sous-bois plus sombre)
    for (const r of game.resources) if (r.type === 'tree') this.forest[r.ty * m.w + r.tx] = 1;
    const f2 = new Float32Array(n);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        s += this.forest[ny * m.w + nx]; c++;
      }
      f2[y * m.w + x] = s / c;
    }
    this.forest = f2;
    this.chunks = new Map();
  }

  vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const g = this.grid;
    const x0 = ix & 255, y0 = iy & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = g[y0 * 256 + x0], b = g[y0 * 256 + x1], c = g[y1 * 256 + x0], d = g[y1 * 256 + x1];
    return mix(mix(a, b, fx), mix(c, d, fx), fy);
  }

  fbm(x, y) {
    return this.vnoise(x, y) * 0.55 + this.vnoise(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + this.vnoise(x * 4.3 + 31, y * 4.3 + 3) * 0.15;
  }

  // interpolation bilinéaire d'un champ par tuile (centres des tuiles)
  field(arr, x, y) {
    const W = this.W, H = this.H;
    const fx = x - 0.5, fy = y - 0.5;
    let ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ix1 = Math.min(W - 1, Math.max(0, ix + 1)), iy1 = Math.min(H - 1, Math.max(0, iy + 1));
    ix = Math.min(W - 1, Math.max(0, ix)); iy = Math.min(H - 1, Math.max(0, iy));
    const a = arr[iy * W + ix], b = arr[iy * W + ix1], c = arr[iy1 * W + ix], d = arr[iy1 * W + ix1];
    return mix(mix(a, b, tx), mix(c, d, tx), ty);
  }

  // couleur d'un point du monde
  color(wx, wy, out) {
    // déformation organique des contours
    const wxp = wx + (this.vnoise(wx * 0.9, wy * 0.9) - 0.5) * 0.7;
    const wyp = wy + (this.vnoise(wx * 0.9 + 50, wy * 0.9 + 50) - 0.5) * 0.7;
    const ww = this.field(this.water, wxp, wyp);
    const ws = this.field(this.sand, wxp, wyp);
    const wd = this.field(this.dirt, wxp, wyp);
    const wf = this.field(this.forest, wx, wy);
    const big = this.fbm(wx * 0.12, wy * 0.12);
    const mid = this.vnoise(wx * 0.6, wy * 0.6);
    const fine = this.vnoise(wx * 7.3, wy * 7.3);
    // herbe : nuances jaunes / sombres par plaques
    let r = 86, g = 136, b = 50;
    const yel = sstep(0.55, 0.8, big), dark = sstep(0.45, 0.2, big);
    r = mix(r, 132, yel * 0.6); g = mix(g, 150, yel * 0.6); b = mix(b, 58, yel * 0.6);
    r = mix(r, 58, dark * 0.6); g = mix(g, 108, dark * 0.6); b = mix(b, 40, dark * 0.6);
    const gr = (fine - 0.5) * 22 + (mid - 0.5) * 14;
    r += gr * 0.6; g += gr; b += gr * 0.4;
    // sous-bois
    if (wf > 0) { const k = sstep(0.05, 0.6, wf) * 0.75; r = mix(r, 54, k); g = mix(g, 74, k); b = mix(b, 34, k); }
    // terre battue
    const da = sstep(0.32, 0.62, wd + (mid - 0.5) * 0.45);
    if (da > 0) {
      const dv = (fine - 0.5) * 26;
      r = mix(r, 146 + dv, da); g = mix(g, 118 + dv * 0.8, da); b = mix(b, 78 + dv * 0.6, da);
    }
    // sable (entoure l'eau)
    const sa = sstep(0.3, 0.55, ws + ww * 1.4 + (mid - 0.5) * 0.35);
    if (sa > 0) {
      const sv = (fine - 0.5) * 18;
      r = mix(r, 216 + sv, sa); g = mix(g, 196 + sv, sa); b = mix(b, 138 + sv * 0.7, sa);
    }
    // relief simulé (ombrage d'une carte de hauteur)
    const e = 0.35;
    const h0 = this.fbm(wx * 0.22 + 100, wy * 0.22);
    const hx = this.fbm((wx + e) * 0.22 + 100, wy * 0.22), hy = this.fbm(wx * 0.22 + 100, (wy + e) * 0.22);
    const light = 1 + ((h0 - hx) * 1.1 + (h0 - hy) * 1.6) * 2.2 * (1 - ww);
    r *= light; g *= light; b *= light;
    // eau
    const wa = sstep(0.44, 0.56, ww + (mid - 0.5) * 0.12);
    if (wa > 0) {
      const dep = this.field(this.depth, wx, wy);
      const ripple = (this.vnoise(wx * 3.1 + wy * 1.3, wy * 5.2) - 0.5) * 12;
      let wr = mix(78, 22, dep) + ripple * 0.5, wg = mix(150, 72, dep) + ripple * 0.8, wb = mix(168, 124, dep) + ripple;
      // écume le long de la rive
      const foam = sstep(0.0, 0.08, wa) * (1 - sstep(0.15, 0.55, wa));
      const fo = foam * (0.35 + 0.45 * sstep(0.4, 0.7, fine));
      wr = mix(wr, 225, fo); wg = mix(wg, 238, fo); wb = mix(wb, 236, fo);
      r = mix(r, wr, wa); g = mix(g, wg, wa); b = mix(b, wb, wa);
    }
    out[0] = r; out[1] = g; out[2] = b;
    return ww;
  }

  chunk(cx, cy) {
    const key = cy * 1000 + cx;
    return this.chunks.get(key);
  }

  // génère un bloc ; retourne le canvas
  build(cx, cy) {
    const key = cy * 1000 + cx;
    if (this.chunks.has(key)) return this.chunks.get(key);
    const S = CHUNK;
    const x0 = cx * S, y0 = cy * S;
    const pad = 2;
    const w = S * TILE_W + pad * 2, h = S * TILE_H + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const topX = (x0 - y0) * HW, topY = (x0 + y0) * HH;
    const col = [0, 0, 0];
    const eps = 0.04;
    const BL = 2; // calcul par blocs de 2×2 pixels
    for (let py = 0; py < h; py += BL) {
      for (let px = 0; px < w; px += BL) {
        const ix = px + BL / 2 - w / 2 + topX, iy = py + BL / 2 - pad + topY;
        const wx = (ix / HW + iy / HH) / 2, wy = (iy / HH - ix / HW) / 2;
        if (wx < x0 - eps || wy < y0 - eps || wx > x0 + S + eps || wy > y0 + S + eps) continue;
        if (wx < -eps || wy < -eps || wx > this.W + eps || wy > this.H + eps) continue;
        this.color(Math.max(0, Math.min(this.W - 0.001, wx)), Math.max(0, Math.min(this.H - 0.001, wy)), col);
        for (let by = 0; by < BL && py + by < h; by++) {
          for (let bx = 0; bx < BL && px + bx < w; bx++) {
            const i = ((py + by) * w + px + bx) * 4;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
          }
        }
      }
    }
    c.putImageData(img, 0, 0);
    this.decorate(c, x0, y0, S, topX - w / 2, topY - pad);
    const entry = { cv, ox: topX - w / 2, oy: topY - pad };
    this.chunks.set(key, entry);
    return entry;
  }

  // touffes d'herbe, fleurs, cailloux (dessinés dans le bloc)
  decorate(c, x0, y0, S, ox, oy) {
    const m = this.game.map;
    const h = (a, b) => { let v = (a * 374761393 + b * 668265263 + this.game.seed) | 0; v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
    for (let ty = y0; ty < y0 + S; ty++) {
      for (let tx = x0; tx < x0 + S; tx++) {
        if (tx >= m.w || ty >= m.h) continue;
        const t = m.terrain[ty * m.w + tx];
        if (t === TERRAIN.WATER) continue;
        const n = 3 + Math.floor(h(tx, ty) * 5);
        for (let k = 0; k < n; k++) {
          const fx = tx + 0.1 + h(tx * 7 + k, ty) * 0.8, fy = ty + 0.1 + h(tx, ty * 7 + k) * 0.8;
          const px = (fx - fy) * HW - ox, py = (fx + fy) * HH - oy;
          const rr = h(k, tx * ty + 3);
          if (t === TERRAIN.GRASS) {
            const wf = this.field(this.forest, fx, fy);
            if (rr < 0.62) {
              // touffe d'herbe
              c.strokeStyle = rr < 0.3 ? 'rgba(40,80,25,0.55)' : 'rgba(150,190,90,0.5)';
              c.lineWidth = 1;
              c.beginPath();
              for (let j = -1; j <= 1; j++) { c.moveTo(px + j * 1.5, py); c.lineTo(px + j * 2.5, py - 3 - rr * 3); }
              c.stroke();
            } else if (rr < 0.68 && wf < 0.2) {
              c.fillStyle = ['#f4f0d8', '#f2d24a', '#d86a8a', '#9aa8f0'][Math.floor(rr * 100) % 4];
              c.fillRect(px, py - 1, 2, 2);
            } else if (wf > 0.3 && rr < 0.8) {
              c.fillStyle = 'rgba(30,45,20,0.45)';
              c.beginPath(); c.ellipse(px, py, 4, 2, 0, 0, Math.PI * 2); c.fill();
            }
          } else if (t === TERRAIN.DIRT || t === TERRAIN.SAND) {
            if (rr < 0.35) {
              c.fillStyle = t === TERRAIN.DIRT ? 'rgba(90,70,45,0.6)' : 'rgba(160,140,100,0.6)';
              c.beginPath(); c.ellipse(px, py, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();
              c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(px - 1, py - 1, 1, 1);
            } else if (t === TERRAIN.DIRT && rr < 0.5) {
              c.strokeStyle = 'rgba(80,110,40,0.5)'; c.lineWidth = 1;
              c.beginPath(); c.moveTo(px, py); c.lineTo(px - 1, py - 3); c.moveTo(px, py); c.lineTo(px + 1.5, py - 2.5); c.stroke();
            }
          }
        }
      }
    }
  }
}
