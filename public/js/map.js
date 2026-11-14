// Génération procédurale de la carte : lacs, forêts, mines, positions de départ.
import { TERRAIN } from './config.js';
import { hypot, dsin, dcos } from './dmath.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  const rand = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // état interne du générateur, pour sauvegarder et reprendre une partie
  rand.getState = () => a | 0;
  rand.setState = (s) => { a = s | 0; };
  return rand;
}

function makeNoise(rand, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1];
    const c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

export function startPositions(size, n, rand) {
  const m = Math.round(size * 0.2);
  const corners = [
    [m, size - m], [size - m, m], [m, m], [size - m, size - m],
  ];
  // deux joueurs : diagonale aléatoire
  if (n === 2) return rand() < 0.5 ? [corners[0], corners[1]] : [corners[2], corners[3]];
  return corners.slice(0, n);
}

export function generateMap(game, { size, numPlayers }) {
  const rand = game.rand;
  const map = game.map;
  const W = size, H = size;
  const lake = makeNoise(rand, W, H, 14);
  const lake2 = makeNoise(rand, W, H, 6);
  const forest = makeNoise(rand, W, H, 9);
  const forest2 = makeNoise(rand, W, H, 4);
  const starts = startPositions(size, numPlayers, rand);
  const nearStart = (x, y, r) => starts.some(([sx, sy]) => hypot(x - sx, y - sy) < r);

  // Terrain
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = lake(x, y) * 0.75 + lake2(x, y) * 0.25;
      let t = TERRAIN.GRASS;
      if (v > 0.68 && !nearStart(x, y, 16)) t = TERRAIN.WATER;
      map.terrain[y * W + x] = t;
    }
  }
  // Plages autour de l'eau
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.terrain[y * W + x] !== TERRAIN.GRASS) continue;
      let water = false;
      for (let dy = -1; dy <= 1 && !water; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && map.terrain[ny * W + nx] === TERRAIN.WATER) { water = true; break; }
      }
      if (water) map.terrain[y * W + x] = TERRAIN.SAND;
    }
  }
  // Terre battue autour des villes
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.terrain[y * W + x] !== TERRAIN.GRASS) continue;
      const d = Math.min(...starts.map(([sx, sy]) => hypot(x - sx, y - sy)));
      if (d < 4 + forest2(x, y) * 3) map.terrain[y * W + x] = TERRAIN.DIRT;
    }
  }

  const free = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && map.terrain[y * W + x] !== TERRAIN.WATER && map.occ[y * W + x] === 0;

  // Villes de départ (avant les ressources pour réserver la place)
  starts.forEach(([sx, sy], p) => {
    const tc = game.createBuilding('town_center', p, sx - 2, sy - 2, true);
    game.players[p].startX = sx; game.players[p].startY = sy;
    const spots = [[sx - 3, sy + 3], [sx + 3, sy + 3], [sx + 3, sy - 3]];
    spots.forEach(([x, y]) => game.createUnit('villager', p, x + 0.5, y + 0.5));
    game.createUnit('scout', p, sx - 3.5, sy - 2.5);
    void tc;
  });

  // Place un amas de ressources (formes compactes) à une distance donnée d'un point
  const cluster = (type, cx, cy, count) => {
    const placed = [];
    const queue = [[cx, cy]];
    const tried = new Set();
    while (queue.length && placed.length < count) {
      const idx = Math.floor(rand() * queue.length);
      const [x, y] = queue.splice(idx, 1)[0];
      const key = y * W + x;
      if (tried.has(key)) continue;
      tried.add(key);
      if (!free(x, y)) continue;
      game.createResource(type, x, y);
      placed.push([x, y]);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return placed.length;
  };

  const placeAround = (type, sx, sy, dmin, dmax, count, clearR = 3) => {
    for (let tries = 0; tries < 80; tries++) {
      const a = rand() * Math.PI * 2;
      const d = dmin + rand() * (dmax - dmin);
      const x = Math.round(sx + dcos(a) * d), y = Math.round(sy + dsin(a) * d);
      let ok = true;
      for (let dy = -clearR; dy <= clearR && ok; dy++) for (let dx = -clearR; dx <= clearR; dx++) {
        if (!free(x + dx, y + dy)) { ok = false; break; }
      }
      if (ok) { cluster(type, x, y, count); return [x, y]; }
    }
    return null;
  };

  // Ressources équitables autour de chaque joueur
  starts.forEach(([sx, sy]) => {
    // moutons dispersés près du centre-ville
    let sheep = 0;
    for (let tries = 0; tries < 200 && sheep < 8; tries++) {
      const a = rand() * Math.PI * 2, d = 4 + rand() * 3;
      const x = Math.round(sx + dcos(a) * d), y = Math.round(sy + dsin(a) * d);
      if (free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x - 1, y) && free(x, y - 1)) { game.createResource('sheep', x, y); sheep++; }
    }
    placeAround('berries', sx, sy, 7, 9, 6, 2);
    placeAround('gold', sx, sy, 8, 10, 7, 2);
    placeAround('gold', sx, sy, 14, 18, 6, 2);
    placeAround('stone', sx, sy, 9, 11, 5, 2);
    placeAround('stone', sx, sy, 15, 19, 5, 2);
    placeAround('tree', sx, sy, 10, 12, 30, 3);
    placeAround('tree', sx, sy, 11, 14, 22, 3);
    placeAround('berries', sx, sy, 16, 20, 5, 2);
  });

  // Forêts générales
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!free(x, y) || nearStart(x, y, 12)) continue;
      const v = forest(x, y) * 0.7 + forest2(x, y) * 0.3;
      if (v > 0.66 || (v > 0.6 && rand() < 0.4)) game.createResource('tree', x, y);
      else if (rand() < 0.006) game.createResource('tree', x, y);
    }
  }
  // Ressources supplémentaires au milieu de la carte
  const extra = Math.round(size / 24);
  for (let i = 0; i < extra * 2; i++) {
    const x = Math.floor(W * 0.2 + rand() * W * 0.6), y = Math.floor(H * 0.2 + rand() * H * 0.6);
    if (nearStart(x, y, 20)) continue;
    cluster(i % 2 ? 'gold' : 'stone', x, y, 5 + Math.floor(rand() * 3));
  }

  ensureConnectivity(game, starts);
  return starts;
}

// Garantit qu'un chemin terrestre existe entre les joueurs
function ensureConnectivity(game, starts) {
  const map = game.map;
  const W = map.w, H = map.h;
  const reach = () => {
    const seen = new Uint8Array(W * H);
    const [sx, sy] = starts[0];
    const q = [(sy + 3) * W + sx];
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop();
      const x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen[ni] || !map.walkable(nx, ny)) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return seen;
  };
  const seen = reach();
  for (let p = 1; p < starts.length; p++) {
    const [tx, ty] = starts[p];
    if (seen[(ty + 3) * W + tx]) continue;
    // creuse un couloir en ligne droite
    const [sx, sy] = starts[0];
    const steps = Math.ceil(hypot(tx - sx, ty - sy));
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(sx + (tx - sx) * i / steps), cy = Math.round(sy + (ty - sy) * i / steps);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i2 = y * W + x;
        const id = map.occ[i2];
        if (id) {
          const e = game.entities.get(id);
          if (e && e.kind === 'resource') game.removeEntity(e);
        }
        if (map.terrain[i2] === TERRAIN.WATER) map.terrain[i2] = TERRAIN.SAND;
      }
    }
  }
}
