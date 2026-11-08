// Sprites détaillés : textures procédurales, arbres, rochers, buissons et bâtiments.
// Les parties statiques sont pré-rendues en haute résolution puis mises en cache.
import { TILE_W, TILE_H } from './config.js';

const HW = TILE_W / 2, HH = TILE_H / 2;
const SCALE = 2; // résolution des caches
export const iso = (x, y) => ({ x: (x - y) * HW, y: (x + y) * HH });

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function rgb(color) {
  if (color[0] === '#') { const n = parseInt(color.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return color.match(/\d+/g).map(Number);
}
export function tint(color, amt) {
  let [r, g, b] = rgb(color);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; } else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const vary = (base, r, amt) => tint(base, (r() - 0.5) * amt);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ------------------------------------------------------------------ textures
function makeTextures() {
  const T = {};
  const r = prng(1234);
  // pierre de taille
  const stone = (base, mortar) => {
    const c = canvas(72, 36), g = c.getContext('2d');
    g.fillStyle = mortar; g.fillRect(0, 0, 72, 36);
    for (let row = 0; row < 4; row++) {
      let x = row % 2 ? -8 : 0;
      while (x < 72) {
        const w = 10 + Math.floor(r() * 9);
        g.fillStyle = vary(base, r, 0.22);
        g.fillRect(x + 0.5, row * 9 + 0.5, w - 1, 8);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 0.5, row * 9 + 0.5, w - 1, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 0.5, row * 9 + 7, w - 1, 1.5);
        x += w;
      }
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * 72, r() * 36, 1.5, 1.5); }
    return c;
  };
  T.stone = stone('#bdb196', '#857a66');
  T.darkstone = stone('#9c9585', '#6a655a');
  T.redstone = stone('#b39a82', '#7c6a58');
  // enduit (pour colombages)
  {
    const c = canvas(48, 48), g = c.getContext('2d');
    g.fillStyle = '#e8dcbc'; g.fillRect(0, 0, 48, 48);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,100,70' : '255,255,255'},${r() * 0.12})`; g.fillRect(r() * 48, r() * 48, 2, 2); }
    T.plaster = c;
  }
  // planches verticales
  {
    const c = canvas(42, 48), g = c.getContext('2d');
    for (let i = 0; i < 7; i++) {
      g.fillStyle = vary('#94683f', r, 0.25); g.fillRect(i * 6, 0, 6, 48);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * 6 + 5.2, 0, 0.8, 48);
      g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) { const x = i * 6 + 1 + r() * 4; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 1, 16, x - 1, 32, x, 48); g.stroke(); }
    }
    T.planks = c;
  }
  // rangées de toiture (tuiles, ardoise, bardeaux, chaume)
  const roof = (base, kind) => {
    const c = canvas(48, 30), g = c.getContext('2d');
    g.fillStyle = tint(base, -0.25); g.fillRect(0, 0, 48, 30);
    for (let row = 0; row < 5; row++) {
      const y = row * 6;
      if (kind === 'thatch') {
        for (let i = 0; i < 40; i++) {
          g.strokeStyle = vary(base, r, 0.3); g.lineWidth = 1;
          const x = r() * 48; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + 7); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y + 5, 48, 1);
      } else {
        const w = kind === 'tile' ? 6 : kind === 'slate' ? 8 : 7;
        for (let x = (row % 2) * w / 2 - w; x < 48; x += w) {
          g.fillStyle = vary(base, r, kind === 'slate' ? 0.18 : 0.25);
          if (kind === 'tile') { g.beginPath(); g.moveTo(x + 0.4, y); g.lineTo(x + w - 0.4, y); g.lineTo(x + w - 0.4, y + 4.5); g.quadraticCurveTo(x + w / 2, y + 6.5, x + 0.4, y + 4.5); g.closePath(); g.fill(); }
          else g.fillRect(x + 0.5, y, w - 1, 5.4);
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 0.5, y, w - 1, 1);
        }
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 5.4, 48, 0.8);
      }
    }
    return c;
  };
  T.tile = roof('#a8482e', 'tile');
  T.slate = roof('#5b6672', 'slate');
  T.shingle = roof('#7c5534', 'shingle');
  T.thatch = roof('#c7a659', 'thatch');
  return T;
}

// ------------------------------------------------------------------ peintre
export class Painter {
  constructor() {
    this.tex = makeTextures();
    this.pat = {};
    this.cache = new Map();
    this.trees = null;
  }

  pattern(ctx, name) {
    // les motifs sont liés à un contexte
    let m = this.pat[name];
    if (!m || m.ctx !== ctx) { m = { ctx, p: ctx.createPattern(this.tex[name], 'repeat') }; this.pat[name] = m; }
    return m.p;
  }

  // Face verticale texturée entre A et B (au sol), hauteur h, avec ombrage et occlusion au pied
  face(ctx, A, B, h, mat, dark, opts = {}) {
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    ctx.save();
    ctx.transform(dx / len, dy / len, 0, -1, A.x, A.y);
    ctx.fillStyle = this.pattern(ctx, mat);
    ctx.fillRect(0, 0, len, h);
    if (opts.timber) {
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(0, h - 2.5, len, 2.5); ctx.fillRect(0, 0, len, 2); ctx.fillRect(0, h * 0.5 - 1, len, 1.8);
      const n = Math.max(2, Math.round(len / 13));
      for (let i = 0; i <= n; i++) ctx.fillRect(i * len / n - 1.2, 0, 2.4, h);
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 1.8;
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        const xa = i * len / n, xb = (i + 1) * len / n;
        ctx.beginPath(); ctx.moveTo(xa, 0); ctx.lineTo(xb, h * 0.5); ctx.moveTo(xb, h * 0.5); ctx.lineTo(xa, h); ctx.stroke();
      }
    }
    if (opts.trim) { ctx.fillStyle = opts.trim; ctx.fillRect(0, h - 4, len, 3); }
    for (const w of opts.windows || []) {
      const x = w.t * len - w.w / 2;
      ctx.fillStyle = '#3b2a1a'; ctx.fillRect(x - 1, w.y - 1, w.w + 2, w.h + 2);
      ctx.fillStyle = w.lit ? '#f2c66a' : '#1e1610'; ctx.fillRect(x, w.y, w.w, w.h);
      if (w.arch) { ctx.beginPath(); ctx.arc(x + w.w / 2, w.y + w.h, w.w / 2, 0, Math.PI); ctx.fill(); }
      if (w.bars) { ctx.fillStyle = '#3b2a1a'; ctx.fillRect(x + w.w / 2 - 0.5, w.y, 1, w.h); }
    }
    if (opts.door) {
      const d = opts.door, x = d.t * len - d.w / 2;
      ctx.fillStyle = '#2e1e12'; ctx.fillRect(x - 1.5, -0.5, d.w + 3, d.h + 1.5);
      ctx.fillStyle = '#6a4424'; ctx.fillRect(x, 0, d.w, d.h);
      ctx.beginPath(); ctx.arc(x + d.w / 2, d.h, d.w / 2, 0, Math.PI); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 3; i++) ctx.fillRect(x + i * d.w / 3, 0, 0.8, d.h + d.w / 3);
    }
    if (opts.slits) for (const t of opts.slits) { ctx.fillStyle = '#1a140e'; ctx.fillRect(t * len - 1, opts.slitY || h * 0.6, 2, 7); }
    // éclairage
    ctx.fillStyle = `rgba(20,12,5,${dark})`; ctx.fillRect(0, 0, len, h);
    const g = ctx.createLinearGradient(0, 0, 0, Math.min(10, h));
    g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, len, Math.min(10, h));
    ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(0, h - 1, len, 1);
    if (opts.crenel) {
      ctx.fillStyle = this.pattern(ctx, mat);
      const n = Math.max(2, Math.round(len / 7));
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * len / n, h, len / n, 5);
      ctx.fillStyle = `rgba(20,12,5,${dark})`;
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * len / n, h, len / n, 5);
    }
    ctx.restore();
  }

  // bloc de murs (faces visibles + dessus)
  walls(ctx, x0, y0, s, h, mat, opts = {}) {
    const N = iso(x0, y0), E = iso(x0 + s, y0), S = iso(x0 + s, y0 + s), W = iso(x0, y0 + s);
    this.face(ctx, W, S, h, mat, 0.06, opts.left || opts.both || {});
    this.face(ctx, S, E, h, mat, 0.34, opts.right || opts.both || {});
    if (opts.top !== false) {
      ctx.fillStyle = opts.topColor || '#8f8472';
      ctx.beginPath(); ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h); ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h); ctx.closePath(); ctx.fill();
      if (opts.crenelTop) {
        // créneaux des faces arrière
        ctx.fillStyle = tint(opts.topColor || '#8f8472', -0.15);
        ctx.beginPath(); ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h); ctx.lineTo(E.x, E.y - h - 5); ctx.lineTo(N.x, N.y - h - 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(N.x, N.y - h); ctx.lineTo(W.x, W.y - h); ctx.lineTo(W.x, W.y - h - 5); ctx.lineTo(N.x, N.y - h - 5); ctx.closePath(); ctx.fill();
      }
    }
    return { N, E, S, W };
  }

  roofFace(ctx, pts, A, B, P, mat, dark) {
    // pts : polygone ; A→B : ligne d'égout ; P : point vers le faîtage
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const mx = P.x - A.x, my = P.y - A.y;
    // composante de P perpendiculaire à l'égout
    const ux = dx / len, uy = dy / len;
    const along = mx * ux + my * uy;
    const vx = mx - along * ux, vy = my - along * uy, vl = Math.hypot(vx, vy) || 1;
    ctx.save();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.clip();
    ctx.transform(ux, uy, vx / vl, vy / vl, A.x, A.y);
    ctx.fillStyle = this.pattern(ctx, mat);
    ctx.fillRect(-len, -2, len * 3, vl * 1.2 + 6);
    ctx.fillStyle = `rgba(20,12,5,${dark})`; ctx.fillRect(-len, -2, len * 3, vl * 1.2 + 6);
    const g = ctx.createLinearGradient(0, 0, 0, vl);
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,240,210,0.12)');
    ctx.fillStyle = g; ctx.fillRect(-len, 0, len * 3, vl);
    ctx.restore();
  }

  // toit à deux pans (faîtage parallèle à l'axe x)
  gable(ctx, x0, y0, s, h, rh, mat, endMat = 'plaster', ov = 0.12, sy = s) {
    const W = iso(x0 - ov, y0 + sy + ov), S = iso(x0 + s + ov, y0 + sy + ov), E = iso(x0 + s + ov, y0 - ov), N = iso(x0 - ov, y0 - ov);
    [W, S, E, N].forEach((p) => { p.y -= h; });
    const R1 = iso(x0 - ov, y0 + sy / 2), R2 = iso(x0 + s + ov, y0 + sy / 2);
    R1.y -= h + rh; R2.y -= h + rh;
    // pignon (côté droit)
    const gs = iso(x0 + s, y0 + sy), ge = iso(x0 + s, y0), gr = iso(x0 + s, y0 + sy / 2);
    gs.y -= h; ge.y -= h; gr.y -= h + rh;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(gs.x, gs.y); ctx.lineTo(ge.x, ge.y); ctx.lineTo(gr.x, gr.y); ctx.closePath(); ctx.clip();
    ctx.fillStyle = this.pattern(ctx, endMat); ctx.fillRect(gs.x - 2, gr.y - 2, ge.x - gs.x + 4, gs.y - gr.y + 30);
    ctx.fillStyle = 'rgba(20,12,5,0.34)'; ctx.fillRect(gs.x - 2, gr.y - 2, ge.x - gs.x + 4, gs.y - gr.y + 30);
    if (endMat === 'plaster') { ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gr.x, gr.y); ctx.lineTo(gr.x, gs.y + (ge.y - gs.y) / 2); ctx.stroke(); }
    ctx.restore();
    this.roofFace(ctx, [N, E, R2, R1], N, E, R1, mat, 0.05); // pan arrière (peu visible)
    this.roofFace(ctx, [W, S, R2, R1], W, S, R1, mat, 0.0);
    // bord de toit et faîtage
    ctx.strokeStyle = 'rgba(30,18,10,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.lineTo(S.x, S.y); ctx.lineTo(R2.x, R2.y); ctx.lineTo(E.x, E.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(R1.x, R1.y); ctx.lineTo(R2.x, R2.y); ctx.stroke();
    return { R1, R2 };
  }

  // toit en pyramide
  pyramid(ctx, x0, y0, s, h, rh, mat, ov = 0.1) {
    const N = iso(x0 - ov, y0 - ov), E = iso(x0 + s + ov, y0 - ov), S = iso(x0 + s + ov, y0 + s + ov), W = iso(x0 - ov, y0 + s + ov), C = iso(x0 + s / 2, y0 + s / 2);
    [N, E, S, W].forEach((p) => { p.y -= h; });
    const P = { x: C.x, y: C.y - h - rh };
    this.roofFace(ctx, [N, W, P], N, W, P, mat, 0.0);
    this.roofFace(ctx, [W, S, P], W, S, P, mat, 0.08);
    this.roofFace(ctx, [S, E, P], S, E, P, mat, 0.36);
    ctx.strokeStyle = 'rgba(30,18,10,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.lineTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.moveTo(S.x, S.y); ctx.lineTo(P.x, P.y); ctx.stroke();
    return P;
  }

  shadow(ctx, x0, y0, s, h) {
    // ombre portée vers la droite (soleil en haut à gauche)
    const N = iso(x0, y0), E = iso(x0 + s, y0), S = iso(x0 + s, y0 + s), W = iso(x0, y0 + s);
    const off = Math.min(60, h * 0.7);
    ctx.fillStyle = 'rgba(10,15,5,0.28)';
    ctx.beginPath();
    ctx.moveTo(W.x, W.y); ctx.lineTo(S.x, S.y); ctx.lineTo(E.x, E.y);
    ctx.lineTo(E.x + off, E.y - off * 0.15); ctx.lineTo(S.x + off, S.y - off * 0.15); ctx.lineTo(W.x + off * 0.5, W.y);
    ctx.lineTo(N.x, N.y); ctx.closePath(); ctx.fill();
  }

  post(ctx, x, y, h, w = 2.5) {
    const p = iso(x, y);
    ctx.fillStyle = '#4e3420'; ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(p.x - w / 2, p.y - h, w / 3, h);
  }

  logs(ctx, x, y, n) {
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 3), k = i % 3;
      const p = iso(x + k * 0.18 - row * 0.05, y + k * 0.05);
      const py = p.y - 4 - row * 6;
      ctx.fillStyle = '#7a4e28'; ctx.beginPath(); ctx.ellipse(p.x + 6, py - 3, 13, 3.4, -0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(p.x - 5, py + 2, 3.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a5f34'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(p.x - 5, py + 2, 1.6, 0, Math.PI * 2); ctx.stroke();
    }
  }

  crate(ctx, x, y, c = '#8a6038') {
    const N = iso(x, y), s = 0.32;
    const E = iso(x + s, y), S = iso(x + s, y + s), W = iso(x, y + s), h = 8;
    ctx.fillStyle = tint(c, -0.1); ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.lineTo(S.x, S.y); ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h); ctx.fill();
    ctx.fillStyle = tint(c, -0.4); ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.lineTo(E.x, E.y - h); ctx.lineTo(S.x, S.y - h); ctx.fill();
    ctx.fillStyle = tint(c, 0.15); ctx.beginPath(); ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h); ctx.lineTo(S.x, S.y - h); ctx.lineTo(W.x, W.y - h); ctx.fill();
  }

  fence(ctx, pts, h = 8) {
    ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1.6;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = iso(...pts[i]), b = iso(...pts[i + 1]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - h * 0.4); ctx.lineTo(b.x, b.y - h * 0.4); ctx.moveTo(a.x, a.y - h * 0.85); ctx.lineTo(b.x, b.y - h * 0.85); ctx.stroke();
      const n = Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 0.4);
      for (let k = 0; k <= n; k++) {
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / n, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / n;
        this.post(ctx, x, y, h, 1.8);
      }
    }
  }

  // ------------------------------------------------------------------ bâtiments
  // Dessin statique (mis en cache) d'un bâtiment à l'origine (0,0). Retourne les points d'animation.
  buildingStatic(ctx, type, s, color) {
    const anim = { banners: [], smoke: [], blades: null, fires: [] };
    const ban = (x, y, h) => anim.banners.push({ ...iso(x, y), h });
    const trim = tint(color, -0.1);
    switch (type) {
      case 'town_center': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 80);
        // cour pavée
        ctx.fillStyle = 'rgba(150,140,120,0.5)';
        const a = iso(0.05, 0.05), b = iso(s - 0.05, 0.05), c = iso(s - 0.05, s - 0.05), d = iso(0.05, s - 0.05);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
        // donjon central à l'arrière (dessiné d'abord : le toit le recouvre)
        this.walls(ctx, 0.55, 0.55, 1.3, 100, 'stone', { left: { slits: [0.5], slitY: 78 }, right: { slits: [0.5], slitY: 78 }, top: false });
        const P = this.pyramid(ctx, 0.5, 0.5, 1.4, 100, 36, 'slate', 0.08);
        anim.banners.push({ x: P.x, y: P.y, h: 18 });
        // rez-de-chaussée en pierre
        this.walls(ctx, 0.3, 0.3, s - 0.6, 28, 'stone', {
          left: { windows: [{ t: 0.2, y: 12, w: 5, h: 8, arch: 1, bars: 1 }, { t: 0.8, y: 12, w: 5, h: 8, arch: 1, bars: 1 }], door: { t: 0.5, w: 12, h: 13 }, trim },
          right: { windows: [{ t: 0.25, y: 12, w: 5, h: 8, arch: 1 }, { t: 0.5, y: 12, w: 5, h: 8, arch: 1 }, { t: 0.75, y: 12, w: 5, h: 8, arch: 1 }], trim },
          topColor: '#8c826e',
        });
        // étage à colombages
        ctx.save(); ctx.translate(0, -28);
        this.walls(ctx, 0.55, 0.55, s - 1.1, 22, 'plaster', {
          both: { timber: true, windows: [{ t: 0.3, y: 8, w: 4, h: 6, lit: 1 }, { t: 0.7, y: 8, w: 4, h: 6, lit: 1 }] }, top: false,
        });
        this.gable(ctx, 0.5, 0.5, s - 1, 22, 26, 'tile');
        ctx.restore();
        ban(0.35, s - 0.35, 44); ban(s - 0.35, s - 0.35, 44);
        break;
      }
      case 'house': {
        this.shadow(ctx, 0.25, 0.25, s - 0.5, 40);
        this.walls(ctx, 0.3, 0.3, s - 0.6, 5, 'darkstone', { top: false });
        ctx.save(); ctx.translate(0, -5);
        this.walls(ctx, 0.3, 0.3, s - 0.6, 16, 'plaster', {
          left: { timber: true, door: { t: 0.3, w: 6, h: 9 }, windows: [{ t: 0.72, y: 6, w: 5, h: 5, lit: 1 }] },
          right: { timber: true, windows: [{ t: 0.5, y: 6, w: 5, h: 5 }] }, top: false,
        });
        // cheminée
        const ch = iso(0.6, 0.7);
        ctx.fillStyle = '#7d7468'; ctx.fillRect(ch.x - 3, ch.y - 44, 6, 18); ctx.fillStyle = '#5c544a'; ctx.fillRect(ch.x + 1, ch.y - 44, 2, 18);
        anim.smoke.push({ x: ch.x, y: ch.y - 49, k: 0.5 });
        this.gable(ctx, 0.3, 0.3, s - 0.6, 16, 17, 'thatch');
        ctx.restore();
        break;
      }
      case 'mill': {
        this.shadow(ctx, 0.35, 0.35, s - 0.7, 60);
        this.walls(ctx, 0.4, 0.4, s - 0.8, 12, 'stone', { top: false, left: { door: { t: 0.5, w: 6, h: 8 } } });
        ctx.save(); ctx.translate(0, -12);
        this.walls(ctx, 0.45, 0.45, s - 0.9, 26, 'plaster', { both: { timber: true }, top: false, left: { timber: true, windows: [{ t: 0.5, y: 12, w: 4, h: 5 }] } });
        const P = this.pyramid(ctx, 0.42, 0.42, s - 0.84, 26, 18, 'thatch');
        ctx.restore();
        const L = iso(0.45, s - 0.45), Sx = iso(s - 0.45, s - 0.45);
        anim.blades = { x: (L.x + Sx.x) / 2 + 3, y: (L.y + Sx.y) / 2 - 36 };
        // sacs de grain
        for (const [x, y] of [[s - 0.25, 0.9], [s - 0.1, 1.2]]) { const q = iso(x, y); ctx.fillStyle = '#d9c39a'; ctx.beginPath(); ctx.ellipse(q.x, q.y - 4, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b89f74'; ctx.fillRect(q.x - 2, q.y - 10, 4, 2); }
        void P;
        break;
      }
      case 'lumber_camp': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 26);
        // mur arrière en planches
        const n = iso(0.2, 0.2), e = iso(s - 0.2, 0.2), w = iso(0.2, s - 0.2);
        this.faceBack(ctx, w, n, 16, 'planks'); this.faceBack(ctx, n, e, 16, 'planks');
        this.logs(ctx, 0.45, 0.9, 6);
        for (const [x, y] of [[0.2, 0.2], [s - 0.2, 0.2], [s - 0.2, s - 0.2], [0.2, s - 0.2]]) this.post(ctx, x, y, 22);
        this.gable(ctx, 0.2, 0.2, s - 0.4, 22, 10, 'shingle', 'planks');
        // souche et hache
        const st = iso(s - 0.05, s + 0.25);
        ctx.fillStyle = '#6b4526'; ctx.beginPath(); ctx.ellipse(st.x, st.y - 3, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(st.x - 6, st.y - 3, 12, 4);
        ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(st.x, st.y - 4, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(st.x, st.y - 5); ctx.lineTo(st.x + 4, st.y - 14); ctx.stroke();
        ctx.fillStyle = '#9aa0a6'; ctx.fillRect(st.x - 2, st.y - 7, 4, 3);
        ban(0.1, s - 0.1, 34);
        break;
      }
      case 'mining_camp': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 26);
        const n = iso(0.2, 0.2), e = iso(s - 0.2, 0.2), w = iso(0.2, s - 0.2);
        this.faceBack(ctx, w, n, 16, 'planks'); this.faceBack(ctx, n, e, 16, 'planks');
        // tas de minerai
        const pile = (x, y, col, hi) => { const q = iso(x, y); for (let i = 0; i < 9; i++) { ctx.fillStyle = tint(col, (i % 3 - 1) * 0.15); ctx.beginPath(); ctx.arc(q.x + (i % 3 - 1) * 4, q.y - 3 - Math.floor(i / 3) * 3, 3.2, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = hi; ctx.fillRect(q.x - 1, q.y - 10, 2, 2); };
        pile(0.7, 0.9, '#8c8f93', '#ddd'); pile(1.2, 0.7, '#9a7d3a', '#ffe680');
        for (const [x, y] of [[0.2, 0.2], [s - 0.2, 0.2], [s - 0.2, s - 0.2], [0.2, s - 0.2]]) this.post(ctx, x, y, 22);
        this.gable(ctx, 0.2, 0.2, s - 0.4, 22, 10, 'slate', 'planks');
        // chariot
        const q = iso(s + 0.05, 1.1);
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(q.x - 9, q.y - 13, 18, 8);
        ctx.fillStyle = '#e2bf4a'; ctx.beginPath(); ctx.arc(q.x - 2, q.y - 13, 4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#a0a3a6'; ctx.beginPath(); ctx.arc(q.x + 4, q.y - 13, 3.5, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 2; for (const wx of [-6, 6]) { ctx.beginPath(); ctx.arc(q.x + wx, q.y - 3, 3, 0, Math.PI * 2); ctx.stroke(); }
        ban(0.1, s - 0.1, 34);
        break;
      }
      case 'palisade': {
        for (let i = 0; i < 5; i++) {
          for (const [ax, ay] of [[0.1 + i * 0.2, 0.5], [0.5, 0.1 + i * 0.2]]) {
            const q = iso(ax, ay);
            const hh = 24 + ((i * 7) % 3) * 2;
            ctx.fillStyle = i % 2 ? '#7a5530' : '#8e6438';
            ctx.beginPath(); ctx.moveTo(q.x - 3.2, q.y); ctx.lineTo(q.x + 3.2, q.y); ctx.lineTo(q.x + 3.2, q.y - hh); ctx.lineTo(q.x, q.y - hh - 6); ctx.lineTo(q.x - 3.2, q.y - hh); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(q.x + 1, q.y - hh, 2.2, hh);
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(q.x - 3, q.y - hh, 1.2, hh);
          }
        }
        const a = iso(0.05, 0.5), b = iso(0.95, 0.5), c = iso(0.5, 0.05), d = iso(0.5, 0.95);
        ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 14); ctx.lineTo(b.x, b.y - 14); ctx.moveTo(c.x, c.y - 14); ctx.lineTo(d.x, d.y - 14); ctx.stroke();
        break;
      }
      case 'barracks': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 50);
        this.walls(ctx, 0.25, 0.25, s - 0.5, 26, 'stone', {
          left: { door: { t: 0.5, w: 10, h: 12 }, windows: [{ t: 0.2, y: 12, w: 4, h: 7, arch: 1 }, { t: 0.8, y: 12, w: 4, h: 7, arch: 1 }], trim },
          right: { windows: [{ t: 0.3, y: 12, w: 4, h: 7, arch: 1 }, { t: 0.7, y: 12, w: 4, h: 7, arch: 1 }], trim }, top: false,
        });
        this.gable(ctx, 0.25, 0.25, s - 0.5, 26, 22, 'tile', 'stone');
        // râtelier d'armes et mannequin
        const r = iso(s + 0.1, s - 0.9);
        ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x - 8, r.y - 4); ctx.lineTo(r.x + 8, r.y + 4); ctx.stroke();
        ctx.strokeStyle = '#c9ccd0'; ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r.x - 6 + i * 4, r.y - 2 + i * 2); ctx.lineTo(r.x - 8 + i * 4, r.y - 20 + i * 2); ctx.stroke(); }
        const m = iso(s - 0.3, s + 0.35);
        ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x, m.y - 18); ctx.moveTo(m.x - 7, m.y - 13); ctx.lineTo(m.x + 7, m.y - 13); ctx.stroke();
        ctx.fillStyle = '#d6c08a'; ctx.beginPath(); ctx.ellipse(m.x, m.y - 13, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(m.x, m.y - 21, 3, 0, Math.PI * 2); ctx.fill();
        ban(0.15, s - 0.15, 50); ban(s - 0.15, s - 0.15, 50);
        break;
      }
      case 'archery_range': {
        this.shadow(ctx, 0.2, 0.2, 1.6, 36);
        this.walls(ctx, 0.2, 0.2, 1.6, 20, 'planks', { left: { door: { t: 0.5, w: 7, h: 10 } }, top: false });
        this.gable(ctx, 0.2, 0.2, 1.6, 20, 14, 'shingle', 'planks');
        this.fence(ctx, [[0.1, s - 0.1], [s - 0.1, s - 0.1], [s - 0.1, 0.1]], 8);
        for (const [x, y] of [[2.3, 0.9], [2.3, 2.0]]) {
          const tq = iso(x, y);
          ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tq.x - 5, tq.y); ctx.lineTo(tq.x, tq.y - 14); ctx.lineTo(tq.x + 5, tq.y); ctx.stroke();
          ['#e8dcbc', '#b8342a', '#e8dcbc', '#b8342a', '#e7c24a'].forEach((cc, i) => { ctx.fillStyle = cc; ctx.beginPath(); ctx.ellipse(tq.x, tq.y - 16, 8 - i * 1.6, 9 - i * 1.8, 0, 0, Math.PI * 2); ctx.fill(); });
        }
        ban(0.1, 1.9, 44);
        break;
      }
      case 'stable': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 40);
        this.walls(ctx, 0.25, 0.25, s - 0.5, 22, 'planks', {
          left: { windows: [{ t: 0.2, y: 2, w: 8, h: 12 }, { t: 0.5, y: 2, w: 8, h: 12 }, { t: 0.8, y: 2, w: 8, h: 12 }] },
          right: { windows: [{ t: 0.5, y: 12, w: 5, h: 5 }] }, top: false,
        });
        this.gable(ctx, 0.25, 0.25, s - 0.5, 22, 20, 'thatch', 'planks');
        for (const [x, y] of [[s + 0.1, 0.6], [s + 0.15, 1.1], [s - 0.4, s + 0.3]]) { const q = iso(x, y); ctx.fillStyle = '#d4b25a'; ctx.beginPath(); ctx.ellipse(q.x, q.y - 4, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(120,90,30,0.5)'; ctx.fillRect(q.x - 6, q.y - 5, 12, 1); }
        this.fence(ctx, [[s - 1.4, s + 0.05], [s + 0.05, s + 0.05]], 8);
        ban(0.15, s - 0.15, 44);
        break;
      }
      case 'blacksmith': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 44);
        this.walls(ctx, 0.25, 0.25, s - 0.5, 24, 'darkstone', {
          left: { door: { t: 0.35, w: 10, h: 12 }, windows: [{ t: 0.75, y: 6, w: 7, h: 6, lit: 1 }] }, right: { windows: [{ t: 0.5, y: 12, w: 4, h: 6, lit: 1 }] }, top: false,
        });
        const c = iso(1.9, 0.75);
        ctx.fillStyle = '#6d655a'; ctx.fillRect(c.x - 5, c.y - 66, 10, 30); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(c.x + 1, c.y - 66, 4, 30);
        this.gable(ctx, 0.25, 0.25, s - 0.5, 24, 16, 'slate', 'darkstone');
        ctx.fillStyle = '#6d655a'; ctx.fillRect(c.x - 5, c.y - 66, 10, 14); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(c.x + 1, c.y - 66, 4, 14);
        anim.smoke.push({ x: c.x, y: c.y - 68, k: 1 });
        const an = iso(s + 0.05, s - 0.7);
        ctx.fillStyle = '#3a3a3e'; ctx.fillRect(an.x - 6, an.y - 9, 12, 4); ctx.fillRect(an.x - 3, an.y - 5, 6, 5);
        anim.fires.push({ x: (iso(0.25, s - 0.25).x + iso(s - 0.25, s - 0.25).x) / 2 + 8, y: iso(0.25, s - 0.25).y + 4, small: 1, forge: 1 });
        ban(s - 0.1, s - 0.1, 44);
        break;
      }
      case 'market': {
        this.shadow(ctx, 0.3, 0.3, s - 0.6, 40);
        this.walls(ctx, 0.35, 0.35, s - 0.7, 20, 'plaster', { both: { timber: true }, left: { timber: true, door: { t: 0.5, w: 8, h: 10 } }, top: false });
        this.gable(ctx, 0.35, 0.35, s - 0.7, 20, 16, 'tile');
        // étals
        const stall = (x, y, col) => {
          this.crate(ctx, x, y, '#8a6038'); this.crate(ctx, x + 0.35, y, '#7a5030');
          const a = iso(x - 0.1, y + 0.45), b = iso(x + 0.8, y + 0.45);
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = k % 2 ? '#f0e8d4' : col;
            const t0 = k / 6, t1 = (k + 1) / 6;
            const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }, p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y - 20); ctx.lineTo(p1.x, p1.y - 20); ctx.lineTo(p1.x - 3, p1.y - 13); ctx.lineTo(p0.x - 3, p0.y - 13); ctx.closePath(); ctx.fill();
          }
          this.post(ctx, x - 0.1, y + 0.45, 20, 1.6); this.post(ctx, x + 0.8, y + 0.45, 20, 1.6);
          const q = iso(x + 0.2, y + 0.1); ctx.fillStyle = '#c8463c'; ctx.beginPath(); ctx.arc(q.x, q.y - 10, 1.8, 0, 7); ctx.arc(q.x + 4, q.y - 9, 1.8, 0, 7); ctx.fill();
        };
        stall(0.4, s - 0.15, color); stall(1.6, s - 0.15, '#c99a2e');
        break;
      }
      case 'tower': {
        this.shadow(ctx, 0.1, 0.1, 0.8, 110);
        this.walls(ctx, 0.12, 0.12, 0.76, 64, 'stone', { left: { slits: [0.5], slitY: 40, door: { t: 0.5, w: 7, h: 10 } }, right: { slits: [0.5], slitY: 46 }, top: false });
        this.walls(ctx, 0.02, 0.02, 0.96, 6, 'stone', { both: { crenel: true }, top: false });
        ctx.save(); ctx.translate(0, -64);
        this.walls(ctx, 0.02, 0.02, 0.96, 6, 'stone', { both: { crenel: true }, topColor: '#8a7f6c', crenelTop: true });
        ctx.restore();
        const P = this.pyramid(ctx, 0.14, 0.14, 0.72, 74, 30, 'slate', 0.04);
        anim.banners.push({ x: P.x, y: P.y, h: 14 });
        break;
      }
      case 'siege_workshop': {
        this.shadow(ctx, 0.2, 0.2, s - 0.4, 40);
        this.walls(ctx, 0.25, 0.25, s - 0.5, 26, 'planks', { left: { door: { t: 0.5, w: 16, h: 18 } }, top: false });
        this.gable(ctx, 0.25, 0.25, s - 0.5, 26, 18, 'shingle', 'planks');
        const q = iso(s, 0.8);
        ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 64); ctx.lineTo(q.x - 30, q.y - 54); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = '#2b1d10'; ctx.beginPath(); ctx.moveTo(q.x - 30, q.y - 54); ctx.lineTo(q.x - 30, q.y - 30); ctx.stroke();
        const wq = iso(s + 0.2, s - 0.6);
        ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(wq.x, wq.y - 8, 4, 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(wq.x, wq.y - 8); ctx.lineTo(wq.x + Math.cos(k * 0.8) * 4, wq.y - 8 + Math.sin(k * 0.8) * 8); ctx.stroke(); }
        ban(0.15, s - 0.15, 48);
        break;
      }
      case 'fortress': {
        this.shadow(ctx, 0.1, 0.1, s - 0.2, 120);
        const towerAt = (x, y) => {
          this.walls(ctx, x, y, 0.95, 52, 'darkstone', { left: { slits: [0.5], slitY: 36 }, right: { slits: [0.5], slitY: 36 }, top: false });
          this.pyramid(ctx, x - 0.02, y - 0.02, 0.99, 52, 26, 'slate', 0.06);
        };
        towerAt(0.05, 0.05); towerAt(s - 1.0, 0.05); towerAt(0.05, s - 1.0);
        // donjon
        this.walls(ctx, 1.05, 1.05, 1.9, 78, 'darkstone', { left: { slits: [0.3, 0.7], slitY: 56 }, right: { slits: [0.5], slitY: 56 }, top: false });
        ctx.save(); ctx.translate(0, -78);
        this.walls(ctx, 0.98, 0.98, 2.04, 7, 'darkstone', { both: { crenel: true }, topColor: '#7d7668', crenelTop: true });
        ctx.restore();
        // courtine (faces avant)
        this.walls(ctx, 0.3, 0.3, s - 0.6, 34, 'darkstone', { left: { crenel: true, door: { t: 0.5, w: 14, h: 18 }, trim }, right: { crenel: true, trim }, top: false });
        towerAt(s - 1.0, s - 1.0);
        const top = iso(s / 2, s / 2);
        anim.banners.push({ x: top.x, y: top.y - 90, h: 22 });
        ban(0.5, s - 0.02, 66); ban(s - 0.02, s - 0.5, 66);
        break;
      }
      case 'palisade_gate': {
        for (const [x, y] of [[0.12, 0.5], [0.88, 0.5]]) this.post(ctx, x, y, 34);
        const a = iso(0.12, 0.5), b = iso(0.88, 0.5);
        ctx.fillStyle = '#7a5530';
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(b.x, b.y - 2); ctx.lineTo(b.x, b.y - 22); ctx.lineTo(a.x, a.y - 22); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 30); ctx.lineTo(b.x, b.y - 30); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(b.x, b.y - 20); ctx.stroke();
        ctx.fillStyle = trim; const m = iso(0.5, 0.5); ctx.fillRect(m.x - 3, m.y - 20, 6, 9);
        break;
      }
      case 'gate': {
        this.walls(ctx, 0.05, 0.05, 0.9, 30, 'darkstone', { left: { crenel: true, door: { t: 0.5, w: 12, h: 18 }, trim }, right: { crenel: true, door: { t: 0.5, w: 12, h: 18 }, trim }, top: false });
        ban(0.5, 0.95, 40);
        break;
      }
      default:
        this.walls(ctx, 0.2, 0.2, s - 0.4, 24, 'stone');
    }
    return anim;
  }

  // face arrière simple (vue de l'intérieur, plus sombre)
  faceBack(ctx, A, B, h, mat) { this.face(ctx, A, B, h, mat, 0.45); }

  // retourne { cv, ox, oy, anim } pour un bâtiment (cache par type + couleur)
  building(type, s, color) {
    const key = type + color;
    let c = this.cache.get(key);
    if (c) return c;
    const top = 150, side = 40;
    const w = s * TILE_W + side * 2, h = s * TILE_H + top + 10;
    const cv = canvas(w * SCALE, h * SCALE);
    const ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.translate(w / 2, top);
    const anim = this.buildingStatic(ctx, type, s, color);
    c = { cv, ox: w / 2, oy: top, w, h, anim };
    this.cache.set(key, c);
    return c;
  }

  // ------------------------------------------------------------------ nature
  makeTree(seed, pine) {
    const r = prng(seed * 977 + 13);
    const w = 84, h = 110, ax = 42, ay = 96;
    const cv = canvas(w * SCALE, h * SCALE), g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    g.fillStyle = 'rgba(15,25,8,0.3)';
    g.beginPath(); g.ellipse(ax + 8, ay - 1, 20, 8, 0, 0, Math.PI * 2); g.fill();
    // tronc
    const tw = pine ? 3.2 : 4;
    g.fillStyle = '#5a3a22';
    g.beginPath(); g.moveTo(ax - tw, ay); g.lineTo(ax - tw * 0.6, ay - 30); g.lineTo(ax + tw * 0.6, ay - 30); g.lineTo(ax + tw, ay); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(ax, ay - 30, tw, 30);
    if (pine) {
      const base = ['#1e4f2a', '#245a2f', '#2a6234'][Math.floor(r() * 3)];
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const k = i / (tiers - 1);
        const by = ay - 14 - i * 14, ty = by - 22, half = 22 - k * 14;
        const pts = [[ax, ty]];
        const teeth = 6;
        for (let j = 0; j <= teeth; j++) { const t = j / teeth; pts.push([ax + half - t * half * 2, by + (j % 2 ? -3 : 1) + (r() - 0.5) * 2]); }
        const poly = () => { g.beginPath(); pts.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
        g.fillStyle = '#122e18'; g.save(); g.translate(0, 1.5); poly(); g.fill(); g.restore();
        g.fillStyle = tint(base, -0.15); poly(); g.fill();
        g.save(); poly(); g.clip(); g.fillStyle = tint(base, 0.12); g.fillRect(ax - 30, ty - 5, 30, 40);
        g.fillStyle = 'rgba(255,255,220,0.1)'; g.fillRect(ax - 30, ty - 5, 14, 40); g.restore();
      }
    } else {
      const palettes = [['#2f6a2a', '#3f8034', '#5c9a42'], ['#356b28', '#4a8536', '#6ca44a'], ['#2c5f2e', '#3b7639', '#58914c'], ['#40692a', '#557f34', '#7a9e48']];
      const [dk, md, lt] = palettes[Math.floor(r() * palettes.length)];
      const cx = ax, cy = ay - 50, rx = 24 + r() * 4, ry = 26 + r() * 4;
      const blobs = [];
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        blobs.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d * 0.9, rr: 7 + r() * 5 });
      }
      blobs.sort((a, b) => a.y - b.y);
      // branches visibles
      g.strokeStyle = '#4a3020'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax, ay - 28); g.lineTo(ax - 8, ay - 44); g.moveTo(ax, ay - 30); g.lineTo(ax + 9, ay - 46); g.stroke();
      g.fillStyle = '#16301a';
      for (const b of blobs) { g.beginPath(); g.arc(b.x, b.y + 1.5, b.rr + 1.8, 0, Math.PI * 2); g.fill(); }
      for (const b of blobs) {
        const l = (-(b.x - cx) / rx - (b.y - cy) / ry) * 0.5; // éclairé en haut à gauche
        g.fillStyle = l > 0.25 ? lt : l > -0.2 ? md : dk;
        g.beginPath(); g.arc(b.x, b.y, b.rr, 0, Math.PI * 2); g.fill();
      }
      for (const b of blobs) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.beginPath(); g.arc(b.x + b.rr * 0.3, b.y + b.rr * 0.35, b.rr * 0.6, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * 0.9;
        if (x - cx + y - cy > 10) continue;
        g.fillStyle = `rgba(200,230,140,${0.15 + r() * 0.25})`;
        g.beginPath(); g.arc(x, y, 1.5 + r() * 2, 0, Math.PI * 2); g.fill();
      }
    }
    return { cv, w, h, ax, ay };
  }

  tree(variant) {
    if (!this.trees) {
      this.trees = [];
      for (let i = 0; i < 14; i++) this.trees.push(this.makeTree(i + 1, i % 3 === 0));
    }
    return this.trees[variant % this.trees.length];
  }

  makeRocks(type, stage, seed) {
    const r = prng(seed * 31 + stage * 7 + (type === 'gold' ? 1 : 2));
    const w = 70, h = 54, ax = 35, ay = 40;
    const cv = canvas(w * SCALE, h * SCALE), g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    const k = [0.55, 0.78, 1][stage];
    g.fillStyle = 'rgba(15,20,8,0.3)'; g.beginPath(); g.ellipse(ax + 3, ay + 1, 24 * k + 4, 9 * k + 2, 0, 0, Math.PI * 2); g.fill();
    const n = Math.round(3 + stage * 1.5);
    const rocks = [];
    for (let i = 0; i < n; i++) rocks.push({ x: ax + (r() - 0.5) * 30 * k, y: ay - 2 + (r() - 0.5) * 12 * k, rad: (7 + r() * 6) * (0.7 + 0.3 * k) });
    rocks.sort((a, b) => a.y - b.y);
    const base = type === 'gold' ? '#7a6c52' : '#a5a8aa';
    for (const rk of rocks) {
      const { x, y, rad } = rk;
      const pts = [];
      for (let j = 0; j < 7; j++) { const a = Math.PI * 2 * j / 7 + r() * 0.4; pts.push([x + Math.cos(a) * rad * (0.8 + r() * 0.3), y + Math.sin(a) * rad * 0.62 * (0.8 + r() * 0.3) - rad * 0.25]); }
      g.fillStyle = tint(base, -0.45); g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py + 1.5) : g.moveTo(px, py + 1.5))); g.closePath(); g.fill();
      g.fillStyle = tint(base, -0.12); g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
      // facette éclairée
      g.fillStyle = tint(base, 0.22);
      g.beginPath(); g.moveTo(pts[3][0], pts[3][1]); g.lineTo(pts[4][0], pts[4][1]); g.lineTo(pts[5][0], pts[5][1]); g.lineTo(x - rad * 0.1, y - rad * 0.3); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(x, y - rad * 0.2); g.closePath(); g.fill();
      if (type === 'gold') {
        for (let j = 0; j < 4; j++) {
          const px = x + (r() - 0.5) * rad, py = y - rad * 0.3 + (r() - 0.5) * rad * 0.5;
          g.fillStyle = '#c99a1e'; g.beginPath(); g.arc(px, py, 2.2, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(px - 0.6, py - 0.6, 1.1, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = 'rgba(240,200,70,0.7)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x - rad * 0.5, y - rad * 0.2); g.lineTo(x, y - rad * 0.45); g.lineTo(x + rad * 0.4, y - rad * 0.1); g.stroke();
      } else {
        g.strokeStyle = 'rgba(60,60,60,0.45)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x - rad * 0.3, y - rad * 0.5); g.lineTo(x, y - rad * 0.1); g.lineTo(x + rad * 0.2, y + rad * 0.1); g.stroke();
      }
    }
    return { cv, w, h, ax, ay };
  }

  rocks(type, stage, variant) {
    const key = `${type}${stage}${variant % 4}`;
    let c = this.cache.get(key);
    if (!c) { c = this.makeRocks(type, stage, variant % 4); this.cache.set(key, c); }
    return c;
  }

  makeBush(stage, seed) {
    const r = prng(seed * 53 + stage);
    const w = 54, h = 44, ax = 27, ay = 34;
    const cv = canvas(w * SCALE, h * SCALE), g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    g.fillStyle = 'rgba(15,20,8,0.3)'; g.beginPath(); g.ellipse(ax + 3, ay + 1, 17, 7, 0, 0, Math.PI * 2); g.fill();
    const blobs = [];
    for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()); blobs.push({ x: ax + Math.cos(a) * 12 * d, y: ay - 9 + Math.sin(a) * 7 * d, rr: 4 + r() * 3 }); }
    blobs.sort((a, b) => a.y - b.y);
    g.fillStyle = '#16301a'; for (const b of blobs) { g.beginPath(); g.arc(b.x, b.y + 1, b.rr + 1.4, 0, Math.PI * 2); g.fill(); }
    for (const b of blobs) { const l = -(b.x - ax) / 12 - (b.y - ay + 9) / 7; g.fillStyle = l > 0.3 ? '#4f8f3c' : l > -0.3 ? '#3b7530' : '#2d5e27'; g.beginPath(); g.arc(b.x, b.y, b.rr, 0, Math.PI * 2); g.fill(); }
    const nb = [5, 11, 18][stage];
    for (let i = 0; i < nb; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const x = ax + Math.cos(a) * 11 * d, y = ay - 9 + Math.sin(a) * 6 * d;
      g.fillStyle = '#7a1630'; g.beginPath(); g.arc(x + 0.4, y + 0.4, 1.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = r() < 0.5 ? '#c8284a' : '#9c2a6a'; g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - 0.8, y - 0.9, 0.8, 0.8);
    }
    return { cv, w, h, ax, ay };
  }

  bush(stage, variant) {
    const key = `bush${stage}${variant % 3}`;
    let c = this.cache.get(key);
    if (!c) { c = this.makeBush(stage, variant % 3); this.cache.set(key, c); }
    return c;
  }
}
