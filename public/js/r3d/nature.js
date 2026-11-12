// Végétation et décor de la carte : arbres à feuillage détaillé, fleurs, fougères, roseaux,
// galets, nénuphars, souches et oiseaux. Tout est procédural et dessiné par instanciation.
import * as THREE from 'three';
import { displaced, colorize, merge, cylGeo } from './models.js';

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// rectangle à deux faces dont les normales suivent « nrm » (éclairage doux, comme un volume)
function card(pos, n, size, roll, nrm, shade) {
  const up = Math.abs(n.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3().crossVectors(up, n).normalize();
  const b = new THREE.Vector3().crossVectors(n, t).normalize();
  const c = Math.cos(roll), s = Math.sin(roll);
  const tx = t.clone().multiplyScalar(c).addScaledVector(b, s), bx = b.clone().multiplyScalar(c).addScaledVector(t, -s);
  const h = size / 2;
  const P = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([u, v]) => pos.clone().addScaledVector(tx, u).addScaledVector(bx, v));
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const idx = [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2];
  const p = [], nn = [], uv = [], col = [];
  for (const i of idx) { p.push(P[i].x, P[i].y, P[i].z); nn.push(nrm.x, nrm.y, nrm.z); uv.push(UV[i][0], UV[i][1]); col.push(shade, shade, shade); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// houppier : masses sombres au cœur, bouquets de feuilles en surface
function canopy(spec, seed, withCards, cardSize = 0.34) {
  const r = prng(seed);
  const blobs = [], cards = [];
  let cy = 0, top = -1e9, bot = 1e9;
  for (const b of spec) { cy += b.y / spec.length; top = Math.max(top, b.y + b.rad); bot = Math.min(bot, b.y - b.rad); }
  spec.forEach((b, bi) => {
    const g = displaced(new THREE.IcosahedronGeometry(b.rad, 1), 0.16 * b.rad / 0.4, seed * 7 + bi, 4);
    g.scale(1, b.sy || 0.92, 1);
    g.translate(b.x, b.y, b.z);
    blobs.push(g);
    if (!withCards) return;
    const n = Math.max(6, Math.round(13 * (b.rad / 0.42) ** 2));
    for (let i = 0; i < n; i++) {
      // répartition régulière sur la sphère, sans le dessous
      const yy = 1 - (i + 0.5) / n * 1.55;
      const rad = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * 2.399963 + bi * 1.3;
      const dir = new THREE.Vector3(Math.cos(th) * rad, yy, Math.sin(th) * rad);
      const pos = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(dir, b.rad * (0.9 + r() * 0.16));
      const face = dir.clone().add(new THREE.Vector3((r() - 0.5) * 0.7, 0.25 + r() * 0.35, (r() - 0.5) * 0.7)).normalize();
      const soft = new THREE.Vector3(pos.x, (pos.y - cy) * 1.2 + 0.25, pos.z).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.3).normalize();
      const k = (pos.y - bot) / Math.max(0.01, top - bot);
      const shade = 0.66 + k * 0.5 + (-pos.x - pos.z) * 0.12 + (r() - 0.5) * 0.2;
      cards.push(card(pos, face, cardSize * (0.8 + r() * 0.5) * Math.min(1.15, 0.75 + b.rad), r() * 6.28, soft, Math.max(0.5, Math.min(1.4, shade))));
    }
  });
  const leaves = merge(blobs, true);
  colorize(leaves, (x, y, z) => {
    const k = (y - bot) / Math.max(0.01, top - bot);
    const l = (withCards ? 0.34 : 0.52) + k * (withCards ? 0.42 : 0.5) + (-x - z) * 0.14;
    return [l, l, l];
  });
  return { leaves, cards: withCards ? merge(cards, true) : null };
}

function trunk(h, r0, bend, seed, branches) {
  const pts = [[r0 * 2.1, 0], [r0 * 1.35, h * 0.07], [r0 * 1.05, h * 0.2], [r0 * 0.9, h * 0.55], [r0 * 0.7, h * 0.85], [r0 * 0.4, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(y * 2.2 + seed) * bend * y); p.setZ(i, p.getZ(i) + Math.cos(y * 1.7 + seed * 2) * bend * 0.6 * y); }
  g.computeVertexNormals();
  const list = [g];
  for (const [y, len, az, tilt] of branches) list.push(cylGeo(r0 * 0.22, r0 * 0.5, len, 5, 2).translate(0, len / 2, 0).rotateZ(tilt).rotateY(az).translate(0, y, 0));
  return merge(list);
}

/**
 * Essences d'arbres. Chaque essence fournit : tronc, feuillage (masses), bouquets de feuilles
 * (si « cards »), et une teinte. Les feuillus et les résineux forment des bois distincts.
 */
export function treeKinds(withCards) {
  const kinds = [];
  // chênes : houppier large et rond
  for (let v = 0; v < 2; v++) {
    const r = prng(900 + v);
    const spec = [{ x: 0, y: 1.42, z: 0, rad: 0.5 }];
    const n = 5 + v;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + r(), d = 0.34 + r() * 0.12; spec.push({ x: Math.cos(a) * d, y: 1.12 + r() * 0.3, z: Math.sin(a) * d, rad: 0.3 + r() * 0.1 }); }
    const c = canopy(spec, 910 + v, withCards);
    kinds.push({ trunk: trunk(1.15, 0.075, 0.06, v, [[0.72, 0.5, 0.4, 0.85], [0.8, 0.45, 2.6, -0.8], [0.62, 0.4, 4.4, 0.9]]), ...c, pine: false, bark: [1, 1, 1], tint: [1, 1, 1], autumn: 0.1 });
  }
  // hêtre élancé : houppier en fuseau
  {
    const r = prng(930);
    const spec = [];
    for (let i = 0; i < 5; i++) spec.push({ x: (r() - 0.5) * 0.24, y: 1.0 + i * 0.3, z: (r() - 0.5) * 0.24, rad: 0.36 - Math.abs(i - 1.6) * 0.045, sy: 1.05 });
    const c = canopy(spec, 931, withCards, 0.3);
    kinds.push({ trunk: trunk(1.5, 0.06, 0.04, 3, [[0.8, 0.4, 1.2, 0.7], [1.05, 0.35, 3.9, -0.7]]), ...c, pine: false, bark: [0.85, 0.82, 0.8], tint: [0.92, 1.02, 0.9], autumn: 0.16 });
  }
  // bouleau : tronc clair, feuillage léger et lumineux
  {
    const r = prng(940);
    const spec = [];
    for (let i = 0; i < 4; i++) spec.push({ x: (r() - 0.5) * 0.4, y: 1.25 + i * 0.22 + r() * 0.1, z: (r() - 0.5) * 0.4, rad: 0.27 + r() * 0.06 });
    const c = canopy(spec, 941, withCards, 0.27);
    kinds.push({ trunk: trunk(1.45, 0.045, 0.07, 5, [[0.95, 0.4, 0.7, 0.6], [1.1, 0.35, 3.4, -0.65], [0.85, 0.3, 5.2, 0.75]]), ...c, pine: false, bark: [2.3, 2.3, 2.2], tint: [1.25, 1.06, 0.8], autumn: 0.3 });
  }
  // sapins : étages retombants, aiguilles sombres au cœur et claires en pointe
  for (let v = 0; v < 2; v++) {
    const nt = 6 + v, tiers = [];
    for (let i = 0; i < nt; i++) {
      const k = i / (nt - 1);
      const rad = 0.62 - k * 0.5, hgt = 0.52 - k * 0.14;
      const g = new THREE.ConeGeometry(rad, hgt, 11, 2);
      const p = g.attributes.position, rr = prng(960 + v * 31 + i);
      const jag = Array.from({ length: 11 }, () => rr());
      for (let j = 0; j < p.count; j++) {
        const y = p.getY(j);
        if (y < -hgt * 0.4) {
          const a = Math.atan2(p.getZ(j), p.getX(j)), s = jag[((Math.round(a / 6.283 * 11) % 11) + 11) % 11];
          const f = 1 + (s - 0.4) * 0.34;
          p.setX(j, p.getX(j) * f); p.setZ(j, p.getZ(j) * f); p.setY(j, y - s * 0.09);
        }
      }
      g.computeVertexNormals();
      g.translate(0, 0.48 + i * 0.3 * (1 - k * 0.12), 0);
      tiers.push(g);
    }
    const leaves = merge(tiers, true);
    colorize(leaves, (x, y, z) => { const l = 0.42 + Math.hypot(x, z) * 0.75 + y * 0.1 + (-x - z) * 0.1; return [l, l, l]; });
    kinds.push({ trunk: merge([cylGeo(0.035, 0.085, 0.9, 7, 3).translate(0, 0.45, 0)]), leaves, cards: null, pine: true, bark: [0.8, 0.72, 0.66], tint: [1, 1, 1], autumn: 0 });
  }
  return kinds;
}

// ------------------------------------------------------------------ décor au sol
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const paint = (g, c) => colorize(g, () => c);

function bladeGeo(w, h, bend, seg = 3) {
  // brin effilé et arqué (herbe haute, fougère, roseau)
  const p = [], n = [], uv = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg, b = (i + 1) / seg;
    const wa = w * (1 - a * 0.85) / 2, wb = w * (1 - b * 0.85) / 2;
    const A = [0, a * h, bend * a * a], B = [0, b * h, bend * b * b];
    const quad = [[-wa, A[1], A[2]], [wa, A[1], A[2]], [wb, B[1], B[2]], [-wb, B[1], B[2]]];
    for (const i3 of [0, 1, 2, 0, 2, 3]) { p.push(...quad[i3]); n.push(0, 0.6, 0.8); uv.push(0, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function flowerPatch(seed, petal, heart, n = 6, h = 0.2) {
  const r = prng(seed), list = [];
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.55, z = (r() - 0.5) * 0.55, hh = h * (0.7 + r() * 0.6), ry = r() * 6.28;
    list.push(paint(bladeGeo(0.014, hh, 0.03, 2).rotateY(ry).translate(x, 0, z), col(0x4f8a3a)));
    const tilt = (r() - 0.5) * 0.7;
    const v = 0.85 + r() * 0.3;
    const head = new THREE.CircleGeometry(0.036 + r() * 0.016, 7).rotateX(-Math.PI / 2 + tilt).rotateY(ry).translate(x, hh + 0.004, z + 0.012);
    list.push(paint(head, petal.map((c) => c * v)));
    list.push(paint(new THREE.CircleGeometry(0.014, 6).rotateX(-Math.PI / 2 + tilt).rotateY(ry).translate(x, hh + 0.009, z + 0.012), heart));
  }
  return merge(list, true);
}

function fern(seed) {
  const r = prng(seed), list = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const g = bladeGeo(0.11, 0.3 + r() * 0.12, 0.2 + r() * 0.1, 4).rotateY(i / n * 6.283 + r() * 0.4);
    const v = 0.75 + r() * 0.4;
    list.push(paint(g, [0.2 * v, 0.46 * v, 0.16 * v]));
  }
  return merge(list, true);
}

function reeds(seed) {
  const r = prng(seed), list = [];
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.4, h = 0.42 + r() * 0.35, ry = r() * 6.28;
    const v = 0.8 + r() * 0.35;
    list.push(paint(bladeGeo(0.03, h, 0.08 + r() * 0.08, 3).rotateY(ry).translate(x, 0, z), [0.42 * v, 0.56 * v, 0.24 * v]));
    if (i % 3 === 0) list.push(paint(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 5).translate(x, h * 0.92, z), col(0x5a3a22)));
  }
  return merge(list, true);
}

function pebbles(seed) {
  const r = prng(seed), list = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.035 + r() * 0.06;
    const g = displaced(new THREE.IcosahedronGeometry(s, 0), 0.3, seed + i, 6).scale(1, 0.55, 1).translate((r() - 0.5) * 0.5, s * 0.25, (r() - 0.5) * 0.5);
    const v = 0.3 + r() * 0.22;
    list.push(paint(g, [v, v * 0.96, v * 0.9]));
  }
  return merge(list, true);
}

function lilies(seed) {
  const r = prng(seed), list = [];
  for (let i = 0; i < 4; i++) {
    const x = (r() - 0.5) * 0.6, z = (r() - 0.5) * 0.6, s = 0.07 + r() * 0.06;
    const pad = new THREE.CircleGeometry(s, 10, 0.5, 5.6).rotateX(-Math.PI / 2).rotateY(r() * 6.28).translate(x, 0, z);
    const v = 0.8 + r() * 0.3;
    list.push(paint(pad, [0.16 * v, 0.42 * v, 0.2 * v]));
    if (r() < 0.4) list.push(paint(new THREE.ConeGeometry(0.03, 0.045, 6).rotateX(Math.PI).translate(x, 0.03, z), col(0xf6b8cc)));
  }
  return merge(list, true);
}

function log(seed) {
  const r = prng(seed);
  const body = cylGeo(0.09, 0.1, 0.9, 8, 2).rotateZ(Math.PI / 2).translate(0, 0.085, 0);
  const moss = paint(displaced(new THREE.SphereGeometry(0.11, 8, 5, 0, 6.283, 0, 1.3), 0.2, seed, 6).scale(3.2, 0.5, 0.9).translate((r() - 0.5) * 0.3, 0.12, 0), [0.26, 0.42, 0.16]);
  return merge([paint(body, [0.42, 0.3, 0.2]), moss, paint(cylGeo(0.07, 0.09, 0.16, 8, 2).translate(0.75, 0.08, 0.2), [0.45, 0.33, 0.22])], true);
}

function shrub(seed) {
  const r = prng(seed), list = [];
  for (let i = 0; i < 3; i++) list.push(displaced(new THREE.IcosahedronGeometry(0.16 + r() * 0.08, 1), 0.2, seed + i, 5).scale(1, 0.75, 1).translate((r() - 0.5) * 0.3, 0.13 + r() * 0.05, (r() - 0.5) * 0.3));
  const g = merge(list, true);
  // couleurs en espace linéaire : valeurs basses pour un vert profond
  colorize(g, (x, y) => { const l = 0.6 + y * 2.4; return [0.085 * l, 0.24 * l, 0.045 * l]; });
  return g;
}

/** Géométries du décor (couleurs cuites dans les sommets). */
export function decorGeometries() {
  return {
    flowers: [
      flowerPatch(701, col(0xfafafa), col(0xf2c230)), // marguerites
      flowerPatch(702, col(0xf6d23a), col(0xb87a10)), // boutons d'or
      flowerPatch(703, col(0xe0352b), col(0x2a1410), 5, 0.24), // coquelicots
      flowerPatch(704, col(0x8a6ae0), col(0xf0e0a0), 7, 0.17), // campanules
    ],
    fern: [fern(711), fern(712)],
    reeds: [reeds(721), reeds(722)],
    pebbles: [pebbles(731), pebbles(732), pebbles(733)],
    lilies: [lilies(741), lilies(742)],
    log: [log(751)],
    shrub: [shrub(761), shrub(762)],
  };
}

/** Oiseau en vol : le battement des ailes est animé dans le shader (option « flap »). */
export function birdGeometry() {
  const p = [
    // corps
    0, 0, 0.16, -0.035, 0, -0.08, 0.035, 0, -0.08,
    0, 0, -0.06, -0.05, 0.01, -0.2, 0.05, 0.01, -0.2,
    // ailes
    0.02, 0.005, 0.07, 0.42, 0.01, -0.04, 0.02, 0.005, -0.07,
    -0.02, 0.005, 0.07, -0.02, 0.005, -0.07, -0.42, 0.01, -0.04,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

// texture des bouquets de feuilles : feuilles claires sur fond transparent (teintées ensuite)
export function leafCardCanvas(size = 256, seed = 88) {
  const r = prng(seed), c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const leaf = (x, y, len, w, ang, v) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, -len / 2); g.quadraticCurveTo(w, -len * 0.1, 0, len / 2); g.quadraticCurveTo(-w, -len * 0.1, 0, -len / 2); g.closePath();
    g.fillStyle = `rgb(${v},${Math.min(255, v + 8)},${Math.round(v * 0.94)})`; g.fill();
    g.strokeStyle = `rgba(${Math.round(v * 0.72)},${Math.round(v * 0.78)},${Math.round(v * 0.66)},0.9)`; g.lineWidth = size / 256;
    g.beginPath(); g.moveTo(0, -len / 2); g.lineTo(0, len / 2); g.stroke();
    g.restore();
  };
  const cx = size / 2, cy = size / 2;
  // couches du fond vers l'avant : les feuilles du dessous sont plus sombres
  for (let layer = 0; layer < 3; layer++) {
    const n = 16 + layer * 6;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * size * 0.4;
      const len = size * (0.2 + r() * 0.1) * (1 - layer * 0.12);
      leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d, len, len * (0.3 + r() * 0.12), a + Math.PI / 2 + (r() - 0.5) * 1.2, 150 + layer * 38 + Math.floor(r() * 30));
    }
  }
  return c;
}
