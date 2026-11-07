// Recherche de chemin A* sur une grille 8 directions, avec lissage du trajet.

const SQRT2 = Math.SQRT2;

class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.vals.length; }
  push(key, val) {
    const k = this.keys, v = this.vals;
    let i = v.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.keys, v = this.vals;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = v.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c];
        i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

export function distToRect(px, py, r) {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}

export class PathFinder {
  constructor(map) {
    this.map = map;
    const n = map.w * map.h;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 0;
  }

  // goal : { x0, y0, x1, y1 } rectangle (en tuiles), range : distance acceptable au rectangle
  find(sx, sy, goal, range = 0, maxNodes = 5000) {
    const map = this.map;
    const W = map.w, H = map.h;
    const scx = Math.min(W - 1, Math.max(0, Math.floor(sx)));
    const scy = Math.min(H - 1, Math.max(0, Math.floor(sy)));
    this.gen++;
    if (this.gen >= 0xffffffff) { this.seen.fill(0); this.closed.fill(0); this.gen = 1; }
    const gen = this.gen;
    const g = this.g, parent = this.parent, seen = this.seen, closed = this.closed;
    const heap = new MinHeap();
    const start = scy * W + scx;
    const h0 = Math.max(0, distToRect(scx + 0.5, scy + 0.5, goal) - range);
    g[start] = 0; parent[start] = -1; seen[start] = gen;
    heap.push(h0, start);
    let best = start, bestH = h0, found = -1, expanded = 0;
    if (h0 <= 0 && map.walkable(scx, scy)) found = start;

    while (found < 0 && heap.size > 0 && expanded < maxNodes) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      expanded++;
      const cx = cur % W, cy = (cur - cx) / W;
      const hc = Math.max(0, distToRect(cx + 0.5, cy + 0.5, goal) - range);
      if (hc <= 0 && (cur !== start || map.walkable(cx, cy))) { found = cur; break; }
      if (hc < bestH) { bestH = hc; best = cur; }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!map.walkable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (!map.walkable(cx + dx, cy) || !map.walkable(cx, cy + dy))) continue;
          const ni = ny * W + nx;
          if (closed[ni] === gen) continue;
          const ng = g[cur] + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
          if (seen[ni] !== gen || ng < g[ni]) {
            seen[ni] = gen; g[ni] = ng; parent[ni] = cur;
            const h = Math.max(0, distToRect(nx + 0.5, ny + 0.5, goal) - range);
            heap.push(ng + h * 1.05, ni);
          }
        }
      }
    }
    const end = found >= 0 ? found : best;
    const cells = [];
    for (let c = end; c !== -1 && c !== start; c = parent[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 }));
    // déjà sur la bonne case : on se recentre
    if (!pts.length && found >= 0 && (Math.abs(sx - scx - 0.5) > 0.05 || Math.abs(sy - scy - 0.5) > 0.05)) {
      pts.push({ x: scx + 0.5, y: scy + 0.5 });
    }
    return { points: this.smooth(sx, sy, pts), reached: found >= 0 };
  }

  // Vérifie qu'une ligne droite est praticable (avec une petite marge)
  lineWalkable(ax, ay, bx, by) {
    const map = this.map;
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 0.2);
    const m = 0.22;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (!map.walkable(Math.floor(x - m), Math.floor(y - m)) || !map.walkable(Math.floor(x + m), Math.floor(y - m)) ||
        !map.walkable(Math.floor(x - m), Math.floor(y + m)) || !map.walkable(Math.floor(x + m), Math.floor(y + m))) {
        // la tuile de départ peut être bloquée (unité dans une fondation)
        if (i === 0) continue;
        return false;
      }
    }
    return true;
  }

  smooth(sx, sy, pts) {
    if (pts.length <= 1) return pts;
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 14);
      while (j > i && !this.lineWalkable(ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}
