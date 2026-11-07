// Rendu isométrique sur canvas : terrain, ressources, bâtiments, unités, brouillard de guerre.
import { TILE_W, TILE_H, TERRAIN, BUILDINGS, UNITS } from './config.js';
import { TerrainPainter, CHUNK } from './terrain.js';
import { Painter } from './sprites.js';

const HW = TILE_W / 2, HH = TILE_H / 2;

export function iso(x, y) { return { x: (x - y) * HW, y: (x + y) * HH }; }

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function shade(color, amt) {
  let r, g, b;
  if (color[0] === '#') {
    const n = parseInt(color.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    [r, g, b] = color.match(/\d+/g).map(Number);
  }
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; } else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const TERRAIN_COLORS = {
  [TERRAIN.GRASS]: ['#5f9a3c', '#639f3f', '#5a9438', '#67a443'],
  [TERRAIN.WATER]: ['#2f6fa6', '#3174ab', '#2c6aa0', '#3378b0'],
  [TERRAIN.SAND]: ['#d8c58a', '#dccb90', '#d2bf83', '#e0cf96'],
  [TERRAIN.DIRT]: ['#9a8455', '#a08a5a', '#937e50', '#a68f5f'],
};

function diamondPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x, y + h); ctx.lineTo(x - w / 2, y + h / 2); ctx.closePath();
}

function makeTileSprites() {
  const sprites = {};
  for (const [t, colors] of Object.entries(TERRAIN_COLORS)) {
    sprites[t] = colors.map((c, vi) => {
      const cv = document.createElement('canvas');
      cv.width = TILE_W + 2; cv.height = TILE_H + 2;
      const g = cv.getContext('2d');
      diamondPath(g, HW + 1, 0, TILE_W + 2, TILE_H + 2);
      g.fillStyle = c; g.fill();
      g.save(); g.clip();
      // texture (petites touches)
      for (let i = 0; i < 26; i++) {
        const x = hash(i, vi * 31 + +t) * TILE_W, y = hash(i + 99, vi * 17 + +t) * TILE_H;
        const l = hash(i + 7, vi + 3) - 0.5;
        g.fillStyle = shade(c, l * (+t === TERRAIN.WATER ? 0.25 : 0.18));
        if (+t === TERRAIN.WATER) g.fillRect(x, y, 6 + l * 6, 1);
        else if (+t === TERRAIN.GRASS) g.fillRect(x, y, 1.5, 3);
        else g.fillRect(x, y, 2, 2);
      }
      g.restore();
      return cv;
    });
  }
  return sprites;
}

export class Renderer {
  constructor(canvas, game, me) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.me = me;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.sprites = makeTileSprites();
    this.terrain = new TerrainPainter(game);
    this.painter = new Painter();
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
  }

  panBy(dx, dy) { this.cam.x += dx / this.cam.zoom; this.cam.y += dy / this.cam.zoom; this.clampCam(); }

  zoomAt(sx, sy, f) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(0.45, Math.min(1.8, this.cam.zoom * f));
    const after = this.toWorld(sx, sy);
    this.cam.x += ((before.x - before.y) - (after.x - after.y)) * HW;
    this.cam.y += ((before.x + before.y) - (after.x + after.y)) * HH;
    this.clampCam();
  }

  centerOn(x, y) { const p = iso(x, y); this.cam.x = p.x; this.cam.y = p.y; this.clampCam(); }

  clampCam() {
    const m = this.game.map;
    const minX = -m.h * HW, maxX = m.w * HW, maxY = (m.w + m.h) * HH;
    this.cam.x = Math.max(minX, Math.min(maxX, this.cam.x));
    this.cam.y = Math.max(0, Math.min(maxY, this.cam.y));
  }

  toScreen(x, y) {
    const p = iso(x, y);
    return { x: (p.x - this.cam.x) * this.cam.zoom + this.w / 2, y: (p.y - this.cam.y) * this.cam.zoom + this.h / 2 };
  }

  toWorld(sx, sy) {
    const px = (sx - this.w / 2) / this.cam.zoom + this.cam.x;
    const py = (sy - this.h / 2) / this.cam.zoom + this.cam.y;
    return { x: (px / HW + py / HH) / 2, y: (py / HH - px / HW) / 2 };
  }

  viewBounds() {
    const c = [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(0, this.h), this.toWorld(this.w, this.h)];
    const m = this.game.map;
    return {
      x0: Math.max(0, Math.floor(Math.min(...c.map((p) => p.x))) - 2), x1: Math.min(m.w - 1, Math.ceil(Math.max(...c.map((p) => p.x))) + 2),
      y0: Math.max(0, Math.floor(Math.min(...c.map((p) => p.y))) - 2), y1: Math.min(m.h - 1, Math.ceil(Math.max(...c.map((p) => p.y))) + 2),
    };
  }

  // ------------------------------------------------------------------ dessin principal
  draw(alpha, ui) {
    const ctx = this.ctx, g = this.game, me = this.me;
    this.time = performance.now() / 1000;
    const z = this.cam.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z, (this.w / 2 - this.cam.x * this.cam.zoom) * this.dpr, (this.h / 2 - this.cam.y * this.cam.zoom) * this.dpr);
    const vb = this.viewBounds();
    const W = g.map.w;
    const player = g.players[me];
    const explored = player.explored, visible = player.visible;
    const vx0 = this.cam.x - this.w / 2 / this.cam.zoom - TILE_W, vx1 = this.cam.x + this.w / 2 / this.cam.zoom + TILE_W;
    const vy0 = this.cam.y - this.h / 2 / this.cam.zoom - TILE_H * 3, vy1 = this.cam.y + this.h / 2 / this.cam.zoom + TILE_H;

    // terrain peint (blocs mis en cache, générés progressivement)
    let budget = 2;
    const nChunks = Math.ceil(g.map.w / CHUNK);
    const cx0 = Math.max(0, Math.floor(vb.x0 / CHUNK)), cx1 = Math.min(nChunks - 1, Math.floor(vb.x1 / CHUNK));
    const cy0 = Math.max(0, Math.floor(vb.y0 / CHUNK)), cy1 = Math.min(nChunks - 1, Math.floor(vb.y1 / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const top = iso(cx * CHUNK, cy * CHUNK);
        if (top.x + CHUNK * HW < vx0 || top.x - CHUNK * HW > vx1 || top.y > vy1 || top.y + CHUNK * TILE_H < vy0) continue;
        let ch = this.terrain.chunk(cx, cy);
        if (!ch && budget > 0) { ch = this.terrain.build(cx, cy); budget--; }
        if (ch) { ctx.drawImage(ch.cv, ch.ox, ch.oy); continue; }
        // repli tant que le bloc n'est pas prêt
        for (let y = cy * CHUNK; y < Math.min(g.map.h, (cy + 1) * CHUNK); y++) {
          for (let x = cx * CHUNK; x < Math.min(g.map.w, (cx + 1) * CHUNK); x++) {
            const p = iso(x, y);
            ctx.drawImage(this.sprites[g.map.terrain[y * W + x]][Math.floor(hash(x, y) * 4)], p.x - HW - 1, p.y - 1);
          }
        }
      }
    }
    if (budget === 2) this.prebuild(nChunks);
    // bord de la carte adouci
    {
      const m = g.map, A = iso(0, 0), B = iso(m.w, 0), C = iso(m.w, m.h), D = iso(0, m.h);
      ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.stroke();
    }
    // reflets animés sur l'eau
    for (let y = vb.y0; y <= vb.y1; y++) {
      for (let x = vb.x0; x <= vb.x1; x++) {
        const i = y * W + x;
        if (g.map.terrain[i] !== TERRAIN.WATER || !visible[i]) continue;
        const p = iso(x, y);
        if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
        const s1 = Math.sin(this.time * 1.3 + x * 0.9 + y * 0.5), s2 = Math.sin(this.time * 0.9 - x * 0.4 + y * 1.1);
        if (s1 > 0.5) { ctx.fillStyle = `rgba(230,245,255,${(s1 - 0.5) * 0.35})`; ctx.fillRect(p.x - 12 + s2 * 6, p.y + 12, 14, 1.2); }
        if (s2 > 0.7) { ctx.fillStyle = `rgba(230,245,255,${(s2 - 0.7) * 0.5})`; ctx.fillRect(p.x + 4, p.y + 20 + s1 * 2, 8, 1); }
      }
    }

    // décombres, cadavres (au sol)
    for (const fx of g.effects) {
      if (fx.kind === 'rubble') this.drawRubble(ctx, fx);
      else if (fx.kind === 'corpse' && this.tileVisible(fx.x, fx.y)) this.drawCorpse(ctx, fx);
    }

    // éléments à dessiner triés par profondeur
    const list = [];
    const inView = (e) => e.x >= vb.x0 - 4 && e.x <= vb.x1 + 4 && e.y >= vb.y0 - 4 && e.y <= vb.y1 + 4;
    for (const b of g.buildings) {
      if (b.dead || !inView(b) || !g.isVisible(me, b)) continue;
      if (BUILDINGS[b.type].farm) this.drawFarm(ctx, b, ui.selected.has(b.id));
      else list.push({ d: b.tx + b.ty + b.size, e: b });
    }
    for (const r of g.resources) {
      if (r.dead || !inView(r) || !explored[r.ty * W + r.tx]) continue;
      list.push({ d: r.tx + r.ty + 1, e: r });
    }
    for (const u of g.units) {
      if (u.dead || !inView(u)) continue;
      if (u.owner !== me && !visible[Math.floor(u.y) * W + Math.floor(u.x)]) continue;
      list.push({ d: u.x + u.y + 0.2, e: u });
    }
    // marqueurs de sélection sous les unités
    for (const id of ui.selected) {
      const e = g.get(id);
      if (!e) continue;
      if (e.kind === 'unit') {
        const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
        const p = iso(x, y);
        ctx.strokeStyle = e.owner === me ? '#7dff7a' : e.owner < 0 ? '#ffe066' : '#ff6b5e';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 13 * (e.radius / 0.26) ** 0.6, 6.5 * (e.radius / 0.26) ** 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'building' || e.kind === 'resource') {
        const p = iso(e.tx, e.ty);
        ctx.strokeStyle = e.owner === me ? '#7dff7a' : e.owner < 0 ? '#ffe066' : '#ff6b5e';
        ctx.lineWidth = 1.5;
        diamondPath(ctx, p.x, p.y, TILE_W * e.size, TILE_H * e.size); ctx.stroke();
      }
    }

    list.sort((a, b) => a.d - b.d);
    for (const it of list) {
      const e = it.e;
      if (e.kind === 'resource') this.drawResource(ctx, e);
      else if (e.kind === 'building') this.drawBuilding(ctx, e, g.players[e.owner].color);
      else this.drawUnit(ctx, e, alpha);
    }

    // projectiles
    for (const pr of g.projectiles) this.drawProjectile(ctx, pr);
    for (const fx of g.effects) if (fx.kind === 'blast') {
      const p = iso(fx.x, fx.y); const k = fx.t / fx.dur;
      ctx.fillStyle = `rgba(255,${150 + 80 * k | 0},60,${0.6 * (1 - k)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 10 + 30 * k, 5 + 15 * k, 0, 0, Math.PI * 2); ctx.fill();
    }

    // brouillard de guerre : les zones explorées sont assombries via un calque opaque
    // (évite le quadrillage dû au chevauchement de losanges semi-transparents)
    if (!this.fog || this.fog.width !== this.canvas.width || this.fog.height !== this.canvas.height) {
      this.fog = document.createElement('canvas');
      this.fog.width = this.canvas.width; this.fog.height = this.canvas.height;
    }
    const fctx = this.fog.getContext('2d');
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, this.fog.width, this.fog.height);
    fctx.setTransform(z, 0, 0, z, (this.w / 2 - this.cam.x * this.cam.zoom) * this.dpr, (this.h / 2 - this.cam.y * this.cam.zoom) * this.dpr);
    fctx.fillStyle = '#05080c';
    ctx.fillStyle = '#0b0d10';
    let anyFog = false;
    for (let y = vb.y0; y <= vb.y1; y++) {
      for (let x = vb.x0; x <= vb.x1; x++) {
        const p = iso(x, y);
        if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
        const i = y * W + x;
        if (visible[i]) continue;
        if (explored[i]) { diamondPath(fctx, p.x, p.y - 0.8, TILE_W + 2, TILE_H + 2); fctx.fill(); anyFog = true; }
        else { diamondPath(ctx, p.x, p.y - 0.8, TILE_W + 2, TILE_H + 2); ctx.fill(); }
      }
    }
    if (anyFog) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.42;
      ctx.drawImage(this.fog, 0, 0);
      ctx.restore();
    }

    // barres de vie
    for (const it of list) {
      const e = it.e;
      if (e.kind === 'resource') continue;
      const sel = ui.selected.has(e.id);
      if (!sel && e.hp >= e.maxHp && (e.kind !== 'building' || e.built)) continue;
      if (e.kind === 'unit' && e.owner !== me && !visible[Math.floor(e.y) * W + Math.floor(e.x)]) continue;
      this.drawHpBar(ctx, e, alpha);
    }

    // point de ralliement
    for (const id of ui.selected) {
      const b = g.get(id);
      if (b && b.kind === 'building' && b.owner === me && b.rally) this.drawFlag(ctx, b.rally.x, b.rally.y, g.players[me].color);
    }
    // marqueur d'ordre
    if (ui.marker && this.time - ui.marker.t < 0.6) {
      const p = iso(ui.marker.x, ui.marker.y); const k = (this.time - ui.marker.t) / 0.6;
      ctx.strokeStyle = ui.marker.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 14 * (1 - k) + 3, 7 * (1 - k) + 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // fantôme de placement
    if (ui.placing) this.drawPlacement(ctx, ui.placing);

    // rectangle de sélection (coordonnées écran)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // étalonnage chaud et vignettage
    if (!this.vignette || this.vignette.w !== this.w || this.vignette.h !== this.h) {
      const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      vg.addColorStop(0, 'rgba(255,220,160,0)'); vg.addColorStop(1, 'rgba(25,12,0,0.42)');
      this.vignette = { g: vg, w: this.w, h: this.h };
    }
    ctx.fillStyle = 'rgba(255,200,120,0.05)'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.vignette.g; ctx.fillRect(0, 0, this.w, this.h);
    if (ui.dragBox) {
      const { x0, y0, x1, y1 } = ui.dragBox;
      ctx.strokeStyle = '#e8f5d0'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(200,255,180,0.08)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  // génère en tâche de fond les blocs de terrain hors écran
  prebuild(n) {
    if (this.allBuilt) return;
    for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
      if (!this.terrain.chunk(cx, cy)) { this.terrain.build(cx, cy); return; }
    }
    this.allBuilt = true;
  }

  tileVisible(x, y) {
    const p = this.game.players[this.me];
    return !!p.visible[Math.floor(y) * this.game.map.w + Math.floor(x)];
  }

  // ------------------------------------------------------------------ ressources
  drawResource(ctx, r) {
    const p = iso(r.x, r.y);
    const v = r.variant;
    const blit = (spr, ox = 0, oy = 0) => ctx.drawImage(spr.cv, p.x - spr.ax + ox, p.y - spr.ay + oy, spr.w, spr.h);
    if (r.type === 'tree') {
      blit(this.painter.tree(v), (hash(v, 1) - 0.5) * 8, (hash(v, 2) - 0.5) * 4);
    } else if (r.type === 'gold' || r.type === 'stone') {
      const k = r.amount / r.maxAmount;
      blit(this.painter.rocks(r.type, k > 0.66 ? 2 : k > 0.33 ? 1 : 0, v));
    } else if (r.type === 'berries') {
      const k = r.amount / r.maxAmount;
      blit(this.painter.bush(k > 0.66 ? 2 : k > 0.25 ? 1 : 0, v));
    } else if (r.type === 'sheep') {
      const bob = Math.sin(this.time * 2 + v) * 0.6;
      const graze = Math.sin(this.time * 0.7 + v * 3) > 0.3;
      ctx.fillStyle = 'rgba(15,20,8,0.28)';
      ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 1, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2e2a26'; ctx.lineWidth = 1.6;
      for (const lx of [-5, -2, 2, 5]) { ctx.beginPath(); ctx.moveTo(p.x + lx, p.y - 3); ctx.lineTo(p.x + lx, p.y + 1); ctx.stroke(); }
      ctx.fillStyle = '#cfcabb';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 6 + bob, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f1e6';
      for (const [dx, dy, rr] of [[-4, -8, 4], [0, -10, 4.5], [4, -8, 4], [-1, -6, 4.5]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy + bob, rr, 0, Math.PI * 2); ctx.fill(); }
      const hx = v % 2 ? 9 : -9;
      ctx.fillStyle = '#3b3631'; ctx.beginPath(); ctx.ellipse(p.x + hx, p.y - (graze ? 4 : 9) + bob, 3.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e4d8'; ctx.fillRect(p.x + hx - 1, p.y - (graze ? 7 : 12) + bob, 2, 1.5);
      if (r.amount < r.maxAmount) { ctx.fillStyle = '#8b2b2b'; ctx.fillRect(p.x - 1, p.y - 3, 3, 2); }
    }
  }

  // ------------------------------------------------------------------ bâtiments
  box(ctx, x0, y0, s, h, base, opts = {}) {
    const N = iso(x0, y0), E = iso(x0 + s, y0), S = iso(x0 + s, y0 + s), Wp = iso(x0, y0 + s);
    const left = opts.left || shade(base, -0.18), right = opts.right || shade(base, -0.35), top = opts.top || shade(base, 0.08);
    ctx.fillStyle = left;
    ctx.beginPath(); ctx.moveTo(Wp.x, Wp.y); ctx.lineTo(S.x, S.y); ctx.lineTo(S.x, S.y - h); ctx.lineTo(Wp.x, Wp.y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = right;
    ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.lineTo(E.x, E.y - h); ctx.lineTo(S.x, S.y - h); ctx.closePath(); ctx.fill();
    if (!opts.noTop) {
      ctx.fillStyle = top;
      ctx.beginPath(); ctx.moveTo(N.x, N.y - h); ctx.lineTo(E.x, E.y - h); ctx.lineTo(S.x, S.y - h); ctx.lineTo(Wp.x, Wp.y - h); ctx.closePath(); ctx.fill();
    }
    if (opts.lines) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let k = 1; k < opts.lines; k++) {
        const yy = h * k / opts.lines;
        ctx.beginPath(); ctx.moveTo(Wp.x, Wp.y - yy); ctx.lineTo(S.x, S.y - yy); ctx.lineTo(E.x, E.y - yy); ctx.stroke();
      }
    }
    return { N, E, S, W: Wp };
  }

  drawFarm(ctx, b, sel) {
    const s = b.size;
    const corner = (x, y) => iso(b.tx + x, b.ty + y);
    const a = corner(0.12, 0.12), c = corner(s - 0.12, 0.12), d = corner(s - 0.12, s - 0.12), e = corner(0.12, s - 0.12);
    ctx.fillStyle = b.built ? '#6e4e2c' : 'rgba(110,78,44,0.55)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.fill();
    if (b.built) {
      const k = Math.max(0, Math.min(1, b.food / (BUILDINGS.farm.food + 1)));
      // sillons
      for (let i = 1; i < 10; i++) {
        const y = 0.12 + i * (s - 0.24) / 10;
        const p0 = corner(0.18, y), p1 = corner(s - 0.18, y);
        ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y + 1); ctx.lineTo(p1.x, p1.y + 1); ctx.stroke();
        // plants
        const plant = k > 0.5 ? ['#8fb43a', '#a6c64a'] : k > 0.2 ? ['#c9b443', '#dcc85a'] : ['#b48d52', '#c49c60'];
        for (let j = 0; j < 9; j++) {
          const q = corner(0.3 + j * (s - 0.5) / 9, y);
          const hh = 2 + k * 4;
          ctx.strokeStyle = plant[(i + j) % 2]; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(q.x - 1.5, q.y); ctx.lineTo(q.x - 2, q.y - hh); ctx.moveTo(q.x + 1.5, q.y); ctx.lineTo(q.x + 2, q.y - hh); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - hh - 1); ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.stroke();
    for (const q of [a, c, d, e]) { ctx.fillStyle = '#4e3420'; ctx.fillRect(q.x - 1, q.y - 7, 2, 7); }
    void sel;
  }

  drawBuilding(ctx, b, color) {
    if (!b.built) { this.drawFoundation(ctx, b, color); return; }
    const P = iso(b.tx, b.ty);
    const c = this.painter.building(b.type, b.size, color);
    ctx.drawImage(c.cv, P.x - c.ox, P.y - c.oy, c.w, c.h);
    const an = c.anim;
    for (const bn of an.banners) this.banner(ctx, P.x + bn.x, P.y + bn.y, bn.h, color);
    for (const sm of an.smoke) this.smoke(ctx, P.x + sm.x, P.y + sm.y, sm.k, b.id);
    if (an.blades) this.blades(ctx, P.x + an.blades.x, P.y + an.blades.y);
    for (const f of an.fires) this.flame(ctx, P.x + f.x, P.y + f.y, 0.5, b.id);
    // dégâts : flammes et fumée
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.3 && !BUILDINGS[b.type].wall) {
      const n = dmg > 0.7 ? 3 : dmg > 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const q = iso(b.tx + b.size * (0.3 + 0.4 * hash(b.id, i)), b.ty + b.size * (0.3 + 0.4 * hash(i, b.id)));
        const hgt = 16 + b.size * 8;
        this.flame(ctx, q.x, q.y - hgt, 1 + dmg, b.id + i);
        this.smoke(ctx, q.x, q.y - hgt - 10, 1.4, b.id + i * 7, true);
      }
    }
  }

  banner(ctx, x, y, h, color) {
    ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h - 2); ctx.stroke();
    ctx.fillStyle = '#d9b24a'; ctx.beginPath(); ctx.arc(x, y - h - 2.5, 1.6, 0, Math.PI * 2); ctx.fill();
    const t = this.time * 4 + x * 0.1;
    const w1 = Math.sin(t) * 2, w2 = Math.sin(t + 1.4) * 2.5;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y - h);
    ctx.bezierCurveTo(x + 5, y - h + w1, x + 10, y - h - w2, x + 15, y - h + 1 + w2 * 0.5);
    ctx.lineTo(x + 13, y - h + 5 + w2 * 0.5); ctx.lineTo(x + 15, y - h + 9 + w2 * 0.5);
    ctx.bezierCurveTo(x + 10, y - h + 8 - w2, x + 5, y - h + 9 + w1, x, y - h + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.moveTo(x, y - h + 5); ctx.bezierCurveTo(x + 5, y - h + 5 + w1, x + 10, y - h + 5 - w2, x + 14, y - h + 6 + w2 * 0.5); ctx.lineTo(x + 15, y - h + 9 + w2 * 0.5); ctx.bezierCurveTo(x + 10, y - h + 8 - w2, x + 5, y - h + 9 + w1, x, y - h + 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,140,0.8)'; ctx.fillRect(x + 4, y - h + 3 + w1 * 0.4, 3, 2);
  }

  smoke(ctx, x, y, k, seed, thick = false) {
    for (let i = 0; i < 4; i++) {
      const t = (this.time * 0.35 * (thick ? 1.4 : 1) + i / 4 + hash(seed, i) * 0.3) % 1;
      const a = (thick ? 0.45 : 0.28) * (1 - t) * Math.min(1, t * 6);
      ctx.fillStyle = thick ? `rgba(40,38,36,${a})` : `rgba(215,215,210,${a})`;
      ctx.beginPath(); ctx.arc(x + t * 14 * k + Math.sin(this.time + i) * 2, y - t * 34 * k, (3 + t * 9) * k, 0, Math.PI * 2); ctx.fill();
    }
  }

  flame(ctx, x, y, k, seed) {
    for (let i = 0; i < 3; i++) {
      const f = Math.sin(this.time * 12 + i * 2 + seed) * 0.5 + 0.5;
      const h = (8 + f * 6) * k, w = (4 - i) * k * 1.3;
      ctx.fillStyle = ['rgba(255,90,20,0.85)', 'rgba(255,170,40,0.9)', 'rgba(255,240,150,0.95)'][i];
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.6, x + (f - 0.5) * 3, y - h); ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y); ctx.closePath(); ctx.fill();
    }
  }

  blades(ctx, x, y) {
    const a = this.time * 0.9;
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 4; i++) {
      const ang = a + i * Math.PI / 2;
      ctx.save(); ctx.rotate(ang); ctx.scale(1, 0.85);
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(236,226,200,0.92)'; ctx.fillRect(8, 1, 22, 7);
      ctx.strokeStyle = 'rgba(90,60,30,0.7)'; ctx.lineWidth = 0.7;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(8 + k * 7, 1); ctx.lineTo(8 + k * 7, 8); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(8, 4.5); ctx.lineTo(30, 4.5); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawFoundation(ctx, b, color) {
    const p = iso(b.tx, b.ty);
    diamondPath(ctx, p.x, p.y, TILE_W * b.size, TILE_H * b.size);
    ctx.fillStyle = 'rgba(120,95,60,0.6)'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    if (BUILDINGS[b.type].farm) return;
    const h = 8 + b.progress * 24 * Math.min(2, b.size * 0.6);
    const s = b.size;
    ctx.globalAlpha = 0.35 + b.progress * 0.5;
    this.box(ctx, b.tx + 0.25, b.ty + 0.25, s - 0.5, h * b.progress, '#c8b48a', { lines: 3 });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
    for (const [dx, dy] of [[0.2, 0.2], [s - 0.2, 0.2], [s - 0.2, s - 0.2], [0.2, s - 0.2]]) {
      const q = iso(b.tx + dx, b.ty + dy); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - h - 6); ctx.stroke();
    }
    const a = iso(b.tx + 0.2, b.ty + s - 0.2), c = iso(b.tx + s - 0.2, b.ty + s - 0.2), e = iso(b.tx + s - 0.2, b.ty + 0.2);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h * 0.5); ctx.lineTo(c.x, c.y - h * 0.5); ctx.lineTo(e.x, e.y - h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h); ctx.lineTo(c.x, c.y - h); ctx.lineTo(e.x, e.y - h); ctx.stroke();
  }

  drawRubble(ctx, fx) {
    if (!this.tileVisible(fx.x, fx.y) && !this.game.players[this.me].explored[Math.floor(fx.y) * this.game.map.w + Math.floor(fx.x)]) return;
    const k = 1 - fx.t / fx.dur;
    const s = fx.size;
    const p = iso(fx.x - s / 2, fx.y - s / 2);
    ctx.globalAlpha = Math.min(1, k * 2);
    diamondPath(ctx, p.x, p.y, TILE_W * s * 0.9, TILE_H * s * 0.9);
    ctx.fillStyle = 'rgba(60,50,40,0.7)'; ctx.fill();
    for (let i = 0; i < 6 * s; i++) {
      const q = iso(fx.x - s / 2 + hash(i, s) * s, fx.y - s / 2 + hash(s, i) * s);
      ctx.fillStyle = i % 2 ? '#7d7366' : '#5c4a36'; ctx.fillRect(q.x - 3, q.y - 3, 6, 4);
    }
    if (fx.t < 6) {
      for (let i = 0; i < 3; i++) {
        const kk = ((this.time * 0.4 + i / 3) % 1);
        const c = iso(fx.x, fx.y);
        ctx.fillStyle = `rgba(90,90,90,${0.35 * (1 - kk) * (1 - fx.t / 6)})`;
        ctx.beginPath(); ctx.arc(c.x + kk * 8, c.y - kk * 40, 6 + kk * 12, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCorpse(ctx, fx) {
    const p = iso(fx.x, fx.y);
    const k = 1 - fx.t / fx.dur;
    ctx.globalAlpha = Math.min(1, k * 3) * 0.85;
    const col = fx.owner >= 0 ? this.game.players[fx.owner].color : '#888';
    ctx.fillStyle = 'rgba(90,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (UNITS[fx.type].cls === 'siege') { ctx.fillStyle = '#5a3d22'; ctx.fillRect(p.x - 10, p.y - 5, 20, 6); }
    else {
      ctx.fillStyle = col; ctx.fillRect(p.x - 8, p.y - 3, 11, 4);
      ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(p.x + 6, p.y - 1, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ unités
  drawUnit(ctx, u, alpha) {
    const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
    const p = iso(x, y);
    const color = this.game.players[u.owner].color;
    const def = UNITS[u.type];
    const t = this.time + u.anim;
    const walk = u.moving ? Math.sin(t * 11) : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 0, def.cls === 'cavalry' || def.cls === 'siege' ? 13 : 7, def.cls === 'cavalry' || def.cls === 'siege' ? 5 : 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(u.dir * 1.3, 1.3);
    const swing = u.atkAnim > 0 ? Math.sin((0.35 - u.atkAnim) / 0.35 * Math.PI) : 0;
    const work = u.working && u.type === 'villager' ? Math.max(0, Math.sin(t * 6)) : 0;

    if (def.cls === 'siege') this.drawSiege(ctx, u, color, swing, walk);
    else if (def.cls === 'cavalry') this.drawRider(ctx, u, color, walk, swing);
    else this.drawFoot(ctx, u, color, walk, swing, work);
    ctx.restore();
  }

  drawFoot(ctx, u, color, walk, swing, work) {
    const skin = '#e0b48a';
    const vil = u.type === 'villager';
    const big = u.type === 'champion' || u.type === 'royal_guard' ? 1.1 : 1;
    ctx.scale(big, big);
    // jambes
    ctx.strokeStyle = '#3b2c22'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1.5, -8); ctx.lineTo(-1.5 - walk * 3, -0.5); ctx.moveTo(1.5, -8); ctx.lineTo(1.5 + walk * 3, -0.5); ctx.stroke();
    // corps
    const torso = vil ? '#8a6a45' : color;
    ctx.fillStyle = torso;
    ctx.beginPath(); ctx.moveTo(-4.5, -8); ctx.lineTo(4.5, -8); ctx.lineTo(3.5, -17); ctx.lineTo(-3.5, -17); ctx.closePath(); ctx.fill();
    if (vil) { ctx.fillStyle = color; ctx.fillRect(-4.5, -12, 9, 2); }
    if (u.type === 'swordsman' || u.type === 'champion' || u.type === 'royal_guard') {
      ctx.fillStyle = 'rgba(200,205,215,0.7)'; ctx.fillRect(-3.5, -17, 7, 4);
    }
    // tête
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -20, 3.3, 0, Math.PI * 2); ctx.fill();
    // coiffe
    if (vil) { ctx.fillStyle = '#c9a65a'; ctx.beginPath(); ctx.ellipse(0, -22, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2.5, -25, 5, 3); }
    else if (u.type === 'archer' || u.type === 'crossbowman' || u.type === 'skirmisher') { ctx.fillStyle = shade(color, -0.35); ctx.beginPath(); ctx.arc(0, -21, 3.6, Math.PI, 0); ctx.fill(); }
    else {
      ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(0, -21, 3.7, Math.PI, 0); ctx.fill();
      if (u.type === 'royal_guard' || u.type === 'champion') { ctx.fillStyle = color; ctx.fillRect(-0.8, -28, 1.6, 4); }
    }
    // équipement
    const a = swing;
    if (vil) {
      const o = u.order;
      const gk = o && (o.gk || (o.resume && o.resume.gk));
      const building = o && o.kind === 'build';
      ctx.save(); ctx.translate(4, -13); ctx.rotate(-0.9 + work * 1.4 + a * 1.2);
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
      if (building) { ctx.fillStyle = '#777'; ctx.fillRect(-2.5, -12, 5, 3); }
      else if (gk === 'tree') { ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, -11); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill(); }
      else if (gk === 'gold' || gk === 'stone') { ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(0, -12, 4, -8); ctx.stroke(); }
      else if (gk === 'farm') { ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, -9); ctx.stroke(); }
      ctx.restore();
      if (u.carry.amount > 0) {
        const cc = { food: '#c8463c', wood: '#8b5a2b', gold: '#f2c230', stone: '#a0a4a8' }[u.carry.type];
        ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(-5, -12, 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (u.type === 'archer' || u.type === 'crossbowman') {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5;
      if (u.type === 'archer') { ctx.beginPath(); ctx.arc(4, -14, 7, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(4 + 7 * Math.cos(-1.2), -14 + 7 * Math.sin(-1.2)); ctx.lineTo(4 - a * 3, -14); ctx.lineTo(4 + 7 * Math.cos(1.2), -14 + 7 * Math.sin(1.2)); ctx.stroke(); }
      else { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(1, -15, 10, 2); ctx.beginPath(); ctx.moveTo(9, -19); ctx.lineTo(9, -10); ctx.stroke(); }
    } else if (u.type === 'skirmisher') {
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(3, -10 + a * 4); ctx.lineTo(8, -24 + a * 4); ctx.stroke();
      ctx.fillStyle = '#8b6b3a'; ctx.beginPath(); ctx.ellipse(-4, -12, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (u.type === 'spearman') {
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-1 + a * 4, -6); ctx.lineTo(7 + a * 6, -28); ctx.stroke();
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(7 + a * 6, -28); ctx.lineTo(9 + a * 6, -32); ctx.lineTo(5.5 + a * 6, -29); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(color, -0.3); ctx.beginPath(); ctx.ellipse(-4, -12, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // épée + bouclier
      ctx.save(); ctx.translate(4, -13); ctx.rotate(-0.4 + a * 1.8);
      ctx.strokeStyle = '#d9dde2'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = shade(color, -0.25); ctx.beginPath(); ctx.ellipse(-4.5, -12, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8d070'; ctx.beginPath(); ctx.arc(-4.5, -12, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawRider(ctx, u, color, walk, swing) {
    const horse = u.type === 'scout' ? '#8a5a32' : u.type === 'paladin' ? '#e8e4dc' : '#5a3a22';
    // pattes
    ctx.strokeStyle = shade(horse, -0.3); ctx.lineWidth = 2; ctx.lineCap = 'round';
    const g = walk * 3;
    ctx.beginPath();
    ctx.moveTo(-7, -8); ctx.lineTo(-7 - g, 0); ctx.moveTo(-4, -8); ctx.lineTo(-4 + g, 0);
    ctx.moveTo(6, -8); ctx.lineTo(6 + g, 0); ctx.moveTo(9, -8); ctx.lineTo(9 - g, 0);
    ctx.stroke();
    // corps
    ctx.fillStyle = horse;
    ctx.beginPath(); ctx.ellipse(1, -11, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    // caparaçon
    if (u.type !== 'scout') { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(1, -10, 9, 4, 0, 0, Math.PI); ctx.fill(); }
    // cou + tête
    ctx.fillStyle = horse;
    ctx.beginPath(); ctx.moveTo(8, -13); ctx.lineTo(13, -21); ctx.lineTo(16, -19); ctx.lineTo(12, -11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -19, 4, 2.4, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(-14, -8, -12, -4); ctx.stroke();
    // cavalier
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(4, -14); ctx.lineTo(3, -24); ctx.lineTo(-2, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(0.5, -27, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = u.type === 'scout' ? '#6b4a2a' : '#a0a6ae'; ctx.beginPath(); ctx.arc(0.5, -28, 3.3, Math.PI, 0); ctx.fill();
    if (u.type === 'paladin') { ctx.fillStyle = color; ctx.fillRect(0, -35, 1.5, 5); }
    // arme
    ctx.strokeStyle = u.type === 'scout' ? '#d9dde2' : '#8a6a45'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (u.type === 'scout') { ctx.moveTo(3, -20); ctx.lineTo(10 + swing * 3, -30 + swing * 8); }
    else { ctx.moveTo(-2, -18); ctx.lineTo(18 + swing * 4, -26 + swing * 4); }
    ctx.stroke();
  }

  drawSiege(ctx, u, color, swing, walk) {
    const wood = '#7a5230';
    ctx.fillStyle = '#2b2b2b';
    for (const wx of [-8, 8]) { ctx.beginPath(); ctx.arc(wx, -3, 3.5, 0, Math.PI * 2); ctx.fill(); }
    if (u.type === 'ram') {
      ctx.fillStyle = shade(wood, -0.15);
      ctx.beginPath(); ctx.moveTo(-13, -5); ctx.lineTo(12, -5); ctx.lineTo(9, -20); ctx.lineTo(-10, -20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a5743f'; ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(0, -28); ctx.lineTo(11, -20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3420'; ctx.fillRect(10 + swing * 5, -13, 7, 5);
      ctx.fillStyle = color; ctx.fillRect(-6, -16, 12, 3);
    } else if (u.type === 'mangonel') {
      ctx.fillStyle = wood; ctx.fillRect(-12, -8, 24, 4);
      ctx.strokeStyle = wood; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(0, -18); ctx.lineTo(4, -8); ctx.stroke();
      ctx.save(); ctx.translate(0, -16); ctx.rotate(-0.4 - swing * 1.4);
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-12, -1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = color; ctx.fillRect(-10, -6, 5, 2);
    } else {
      ctx.fillStyle = wood; ctx.fillRect(-11, -9, 18, 6);
      ctx.save(); ctx.translate(-2, -12); ctx.rotate(-0.15 - swing * 0.15);
      ctx.fillStyle = '#3a3a3e'; ctx.fillRect(-4, -4, 20, 7);
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(15, -5, 3, 9);
      ctx.restore();
      ctx.fillStyle = color; ctx.fillRect(-10, -6, 6, 2);
      if (swing > 0.6) { ctx.fillStyle = 'rgba(255,200,80,0.8)'; ctx.beginPath(); ctx.arc(20, -15, 5, 0, Math.PI * 2); ctx.fill(); }
    }
    void walk;
  }

  drawProjectile(ctx, pr) {
    if (!this.tileVisible(pr.x, pr.y) && pr.owner !== this.me) return;
    const k = Math.min(1, pr.t / pr.dur);
    const p = iso(pr.x, pr.y);
    const hgt = Math.sin(k * Math.PI) * pr.arc * TILE_H + 14 * (1 - k) + 6;
    if (pr.kind === 'arrow' || pr.kind === 'javelin') {
      const q = iso(pr.tx, pr.ty), o = iso(pr.x0, pr.y0);
      const dx = q.x - o.x, dy = (q.y - o.y) - Math.cos(k * Math.PI) * pr.arc * TILE_H * Math.PI / pr.dur * 0.15;
      const ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(p.x, p.y - hgt); ctx.rotate(ang);
      ctx.strokeStyle = pr.kind === 'arrow' ? '#3b2a1a' : '#6b4a2a'; ctx.lineWidth = pr.kind === 'arrow' ? 1.2 : 1.8;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pr.kind === 'ball' ? '#222' : '#7d7366';
      ctx.beginPath(); ctx.arc(p.x, p.y - hgt, pr.kind === 'ball' ? 3 : 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawHpBar(ctx, e, alpha) {
    let x, y, h;
    if (e.kind === 'unit') {
      x = e.px + (e.x - e.px) * alpha; y = e.py + (e.y - e.py) * alpha; h = UNITS[e.type].cls === 'cavalry' ? 48 : 38;
    } else { x = e.x; y = e.y; h = BUILDINGS[e.type].farm ? 4 : e.type === 'tower' ? 110 : e.type === 'fortress' ? 150 : e.type === 'town_center' ? 150 : 40 + e.size * 18; }
    const p = iso(x, y);
    const w = e.kind === 'unit' ? 22 : 18 + e.size * 10;
    const k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y - h - 1, w + 2, 5);
    ctx.fillStyle = k > 0.5 ? '#4bd04b' : k > 0.25 ? '#e0c030' : '#e04030';
    ctx.fillRect(p.x - w / 2, p.y - h, w * k, 3);
    if (e.kind === 'building' && !e.built) {
      ctx.fillStyle = '#7fc8ff'; ctx.fillRect(p.x - w / 2, p.y - h + 4, w * e.progress, 2);
    }
  }

  drawFlag(ctx, x, y, color) {
    const p = iso(x, y);
    this.banner(ctx, p.x, p.y, 22, color);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawPlacement(ctx, pl) {
    const g = this.game;
    const def = BUILDINGS[pl.type];
    const tiles = pl.tiles || [[pl.tx, pl.ty]];
    for (const [tx, ty] of tiles) {
      const ok = g.canPlace(this.me, pl.type, tx, ty);
      const p = iso(tx, ty);
      diamondPath(ctx, p.x, p.y, TILE_W * def.size, TILE_H * def.size);
      ctx.fillStyle = ok ? 'rgba(90,255,90,0.28)' : 'rgba(255,60,60,0.35)'; ctx.fill();
      ctx.strokeStyle = ok ? '#8f8' : '#f66'; ctx.lineWidth = 1.5; ctx.stroke();
      if (!pl.tiles) {
        ctx.globalAlpha = 0.6;
        const fake = { type: pl.type, tx, ty, size: def.size, x: tx + def.size / 2, y: ty + def.size / 2, built: true, food: def.food || 0 };
        if (def.farm) this.drawFarm(ctx, fake, false); else this.drawBuilding(ctx, fake, g.players[this.me].color);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ portraits pour l'interface
  icon(kind, type, color) {
    this.icons = this.icons || new Map();
    const key = kind + type + color;
    if (this.icons.has(key)) return this.icons.get(key);
    const S = 96;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#9ab8c8'); bg.addColorStop(0.55, '#d9cfa8'); bg.addColorStop(0.56, '#6f8f45'); bg.addColorStop(1, '#4b6a2e');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    if (kind === 'unit') {
      const cls = UNITS[type].cls;
      g.translate(S / 2 + (cls === 'cavalry' ? -6 : 0), S * 0.88);
      const k = cls === 'cavalry' ? 2.3 : cls === 'siege' ? 2.4 : 3.1;
      g.scale(k, k);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 0, cls === 'cavalry' || cls === 'siege' ? 13 : 7, 3, 0, 0, Math.PI * 2); g.fill();
      const fake = { type, dir: 1, carry: { amount: 0 }, order: null, moving: false, working: false, atkAnim: 0, anim: 0, radius: 0.26 };
      if (cls === 'siege') this.drawSiege(g, fake, color, 0, 0);
      else if (cls === 'cavalry') this.drawRider(g, fake, color, 0, 0);
      else this.drawFoot(g, fake, color, 0, 0, 0);
    } else if (kind === 'building') {
      const def = BUILDINGS[type];
      if (def.farm) {
        g.save(); g.translate(S / 2, S * 0.2); g.scale(0.85, 0.85);
        this.drawFarm(g, { tx: 0, ty: 0, size: 3, built: true, food: def.food }, false);
        g.restore();
      } else {
        const c = this.painter.building(type, def.size, color);
        const sc = Math.min(S * 1.05 / c.w, 1.1);
        const bottom = c.oy + def.size * TILE_H + 4;
        const top = c.oy - ({ tower: 120, fortress: 125, town_center: 145, mill: 70 }[type] || 30 + def.size * 16);
        const sc2 = Math.min(sc, S * 0.95 / (bottom - top));
        g.drawImage(c.cv, (S - c.w * sc2) / 2, S * 0.97 - bottom * sc2, c.w * sc2, c.h * sc2);
      }
    }
    const url = cv.toDataURL();
    this.icons.set(key, url);
    return url;
  }

  resIcon(res) {
    this.icons = this.icons || new Map();
    const key = 'res' + res;
    if (this.icons.has(key)) return this.icons.get(key);
    const S = 48, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    g.translate(S / 2, S / 2);
    if (res === 'food') {
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(9, 9, 4, 6, -0.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9c4a26'; g.beginPath(); g.ellipse(-3, -3, 13, 10, -0.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c4703a'; g.beginPath(); g.ellipse(-5, -6, 8, 5, -0.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,230,180,0.5)'; g.beginPath(); g.ellipse(-7, -8, 3, 2, -0.8, 0, Math.PI * 2); g.fill();
    } else if (res === 'wood') {
      for (const [x, y] of [[-8, 6], [6, 6], [-1, -6]]) {
        g.fillStyle = '#7a4e28'; g.fillRect(x - 9, y - 5, 16, 10);
        g.fillStyle = '#d8b07a'; g.beginPath(); g.ellipse(x + 7, y, 4, 5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a5f34'; g.lineWidth = 1; g.beginPath(); g.arc(x + 7, y, 2, 0, Math.PI * 2); g.stroke();
      }
    } else if (res === 'gold') {
      for (const [x, y] of [[-8, 8], [7, 8], [0, 3], [-4, -4], [5, -7]]) {
        g.fillStyle = '#9a6e10'; g.beginPath(); g.ellipse(x, y + 1.5, 8, 4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2c230'; g.beginPath(); g.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffe78a'; g.beginPath(); g.ellipse(x - 2, y - 1, 3, 1.4, 0, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = '#6e7174'; g.beginPath(); g.moveTo(-14, 6); g.lineTo(-4, 12); g.lineTo(14, 4); g.lineTo(14, -6); g.lineTo(4, -12); g.lineTo(-14, -4); g.closePath(); g.fill();
      g.fillStyle = '#b7babc'; g.beginPath(); g.moveTo(-14, -4); g.lineTo(4, -12); g.lineTo(14, -6); g.lineTo(-4, 2); g.closePath(); g.fill();
      g.fillStyle = '#8f9295'; g.beginPath(); g.moveTo(-14, -4); g.lineTo(-4, 2); g.lineTo(-4, 12); g.lineTo(-14, 6); g.closePath(); g.fill();
    }
    const url = cv.toDataURL();
    this.icons.set(key, url);
    return url;
  }

  // ------------------------------------------------------------------ minicarte
  buildMinimapBase(size) {
    const g = this.game, m = g.map;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size / 2;
    const c = cv.getContext('2d');
    const img = c.createImageData(cv.width, cv.height);
    const cols = { [TERRAIN.GRASS]: [86, 140, 54], [TERRAIN.WATER]: [44, 100, 155], [TERRAIN.SAND]: [205, 188, 130], [TERRAIN.DIRT]: [150, 128, 85] };
    for (let py = 0; py < cv.height; py++) {
      for (let px = 0; px < cv.width; px++) {
        // inverse de la projection losange
        const u = px / cv.width * 2 - 1, v = py / cv.height * 2 - 1;
        const wx = ((u + v) / 2 + 0.5) * m.w, wy = ((v - u) / 2 + 0.5) * m.h;
        const i = (py * cv.width + px) * 4;
        if (wx < 0 || wy < 0 || wx >= m.w || wy >= m.h) { img.data[i + 3] = 0; continue; }
        const t = m.terrain[Math.floor(wy) * m.w + Math.floor(wx)];
        const col = cols[t];
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    this.minimapBase = cv;
  }

  minimapPos(x, y, w, h) {
    const m = this.game.map;
    return { x: ((x / m.w) - (y / m.h)) * w / 2 + w / 2, y: ((x / m.w) + (y / m.h)) * h / 2 };
  }

  minimapToWorld(px, py, w, h) {
    const m = this.game.map;
    const u = (px - w / 2) / (w / 2), v = py / (h / 2);
    return { x: (u + v) / 2 * m.w, y: (v - u) / 2 * m.h };
  }

  drawMinimap(mctx, w, h, pings) {
    const g = this.game, m = g.map, me = this.me;
    const pl = g.players[me];
    if (!this.minimapBase) this.buildMinimapBase(w);
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(this.minimapBase, 0, 0, w, h);
    // brouillard
    const cell = Math.max(1, w / m.w);
    for (let y = 0; y < m.h; y += 2) {
      for (let x = 0; x < m.w; x += 2) {
        const i = y * m.w + x;
        if (pl.visible[i]) continue;
        const p = this.minimapPos(x + 1, y + 1, w, h);
        mctx.fillStyle = pl.explored[i] ? 'rgba(0,0,0,0.4)' : '#0b0d10';
        mctx.fillRect(p.x - cell * 1.1, p.y - cell * 0.6, cell * 2.2, cell * 1.2);
      }
    }
    for (const r of g.resources) {
      if (r.type === 'sheep' || !pl.explored[r.ty * m.w + r.tx]) continue;
      const p = this.minimapPos(r.x, r.y, w, h);
      mctx.fillStyle = r.type === 'tree' ? '#24502a' : r.type === 'gold' ? '#f2c230' : r.type === 'stone' ? '#b8bcc0' : '#d0405a';
      const s = r.type === 'tree' ? 1.5 : 2.2;
      mctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const b of g.buildings) {
      if (!g.isVisible(me, b)) continue;
      const p = this.minimapPos(b.x, b.y, w, h);
      mctx.fillStyle = g.players[b.owner].color;
      const s = 1.5 + b.size * 1.2;
      mctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const u of g.units) {
      if (u.owner !== me && !pl.visible[Math.floor(u.y) * m.w + Math.floor(u.x)]) continue;
      const p = this.minimapPos(u.x, u.y, w, h);
      mctx.fillStyle = shade(g.players[u.owner].color, 0.25);
      mctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
    }
    // alertes
    const now = performance.now() / 1000;
    for (const pg of pings) {
      const k = (now - pg.t) / 3;
      if (k > 1) continue;
      const p = this.minimapPos(pg.x, pg.y, w, h);
      mctx.strokeStyle = `rgba(255,60,40,${1 - k})`; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(p.x, p.y, 4 + 14 * ((k * 3) % 1), 0, Math.PI * 2); mctx.stroke();
    }
    // vue caméra
    const corners = [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, this.h), this.toWorld(0, this.h)].map((c) => this.minimapPos(c.x, c.y, w, h));
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
    mctx.beginPath(); corners.forEach((c, i) => (i ? mctx.lineTo(c.x, c.y) : mctx.moveTo(c.x, c.y))); mctx.closePath(); mctx.stroke();
  }
}
