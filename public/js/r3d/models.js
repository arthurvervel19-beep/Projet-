// Modèles 3D procéduraux : bâtiments, unités (pièces animables), nature.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ géométries de base
export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

export function boxGeo(w, h, d, den = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] * den, uv.getY(i) * dims[f][1] * den);
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 14, den = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  return scaleUV(g, Math.PI * (rt + rb) * den, h * den);
}

export function coneGeo(r, h, seg = 14, den = 1) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  return scaleUV(g, Math.PI * 2 * r * den, Math.hypot(r, h) * den);
}

// toit à deux pans (faîtage selon x), base à y=0
export function gableGeo(w, d, h, den = 1) {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const slope = Math.hypot(d / 2, h);
  const pos = [], uv = [];
  const quad = (a, b, c, e, ua, va, ub, vb) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...e);
    uv.push(0, 0, ua, 0, ua, va, 0, 0, ua, va, 0, vb === undefined ? va : vb);
    void ub;
  };
  // pan avant (+z) et arrière (-z)
  quad([x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0], w * den, slope * den);
  quad([x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0], w * den, slope * den);
  // pignons
  pos.push(x1, 0, z1, x1, 0, z0, x1, h, 0); uv.push(0, 0, d * den, 0, d * den / 2, h * den);
  pos.push(x0, 0, z0, x0, 0, z1, x0, h, 0); uv.push(0, 0, d * den, 0, d * den / 2, h * den);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// pignon seul (triangle plein, pour le mur sous le toit)
export function gableEndGeo(d, h, den = 1) {
  const pos = [0, 0, d / 2, 0, 0, -d / 2, 0, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d * den, 0, d * den / 2, h * den], 2));
  g.computeVertexNormals();
  return g;
}

export function pyramidGeo(w, d, h, den = 1) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.scale(w, h, d);
  g.translate(0, h / 2, 0);
  scaleUV(g, (w + d) * 2 * den, Math.hypot(w / 2, h) * den);
  g.computeVertexNormals();
  return g;
}

export function displaced(geo, amt, seed, freq = 3) {
  const r = prng(seed);
  const off = [r() * 10, r() * 10, r() * 10];
  void r;
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + off[0]) * Math.sin(v.y * freq * 1.3 + off[1]) * Math.sin(v.z * freq * 0.9 + off[2]);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function colorize(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, g, b] = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function prep(g) {
  let x = g.index ? g.toNonIndexed() : g;
  if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
  for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
  return x;
}

export function merge(list, withColor = false) {
  const arr = list.map(prep).map((g) => {
    if (withColor && !g.attributes.color) colorize(g, () => [1, 1, 1]);
    if (!withColor && g.attributes.color) g.deleteAttribute('color');
    return g;
  });
  return mergeGeometries(arr, false);
}

// ------------------------------------------------------------------ assembleur de bâtiments
export class Builder {
  constructor(M) { this.M = M; this.byMat = new Map(); this.extra = []; }
  add(geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const g = geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(boxGeo(w, h, d), mat, x, y + h / 2, z, ry, rx, rz); }
  // poutre entre deux points
  beam(a, b, t, mat) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = boxGeo(t, len, t, 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  object(obj) { this.extra.push(obj); return this; }
  build() {
    const grp = new THREE.Group();
    for (const [mat, list] of this.byMat) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      grp.add(mesh);
    }
    for (const o of this.extra) grp.add(o);
    return grp;
  }
}

// Mur à colombages : enduit + poutres sur les faces visibles
export function timberWalls(B, M, cx, cz, w, h, d, y0, windows = []) {
  const t = 0.055;
  B.box(w, h, d, M.plaster, cx, y0, cz);
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const o = 0.012;
  // poteaux d'angle et lisses
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) B.box(t * 1.4, h, t * 1.4, M.beam, x, y0, z);
  for (const yy of [y0 + 0.02, y0 + h - 0.03, y0 + h * 0.5]) {
    B.box(w + 0.02, t, t, M.beam, cx, yy, z1 + o); B.box(w + 0.02, t, t, M.beam, cx, yy, z0 - o);
    B.box(t, t, d + 0.02, M.beam, x1 + o, yy, cz); B.box(t, t, d + 0.02, M.beam, x0 - o, yy, cz);
  }
  // montants et croix de Saint-André
  const nx = Math.max(2, Math.round(w / 0.42)), nz = Math.max(2, Math.round(d / 0.42));
  for (let i = 1; i < nx; i++) {
    const x = x0 + i * w / nx;
    B.box(t, h, t, M.beam, x, y0, z1 + o); B.box(t, h, t, M.beam, x, y0, z0 - o);
    if (i % 2) { B.beam([x - w / nx, y0 + h * 0.5, z1 + o], [x, y0 + h - 0.03, z1 + o], t * 0.8, M.beam); B.beam([x, y0 + h * 0.5, z1 + o], [x - w / nx, y0 + h - 0.03, z1 + o], t * 0.8, M.beam); }
  }
  for (let i = 1; i < nz; i++) {
    const z = z0 + i * d / nz;
    B.box(t, h, t, M.beam, x1 + o, y0, z); B.box(t, h, t, M.beam, x0 - o, y0, z);
    if (i % 2) { B.beam([x1 + o, y0 + 0.03, z - d / nz], [x1 + o, y0 + h * 0.5, z], t * 0.8, M.beam); B.beam([x1 + o, y0 + h * 0.5, z - d / nz], [x1 + o, y0 + 0.03, z], t * 0.8, M.beam); }
  }
  for (const wd of windows) addWindow(B, M, wd);
}

// fenêtre : encadrement + vitre chaude
export function addWindow(B, M, { x, y, z, face, w = 0.16, h = 0.2 }) {
  const ry = face === 'x' ? Math.PI / 2 : 0;
  const dx = face === 'x' ? 0.015 : 0, dz = face === 'z' ? 0.015 : 0;
  B.box(w + 0.06, h + 0.06, 0.03, M.beam, x + dx * 0.5, y - 0.03, z + dz * 0.5, ry);
  B.box(w, h, 0.03, M.glass, x + dx * 1.2, y, z + dz * 1.2, ry);
  B.box(0.02, h, 0.035, M.beam, x + dx * 1.4, y, z + dz * 1.4, ry);
}

export function addDoor(B, M, { x, y, z, face, w = 0.28, h = 0.46 }) {
  const ry = face === 'x' ? Math.PI / 2 : 0;
  const dx = face === 'x' ? 0.02 : 0, dz = face === 'z' ? 0.02 : 0;
  B.box(w + 0.08, h + 0.05, 0.04, M.darkstone, x + dx * 0.4, y, z + dz * 0.4, ry);
  B.box(w, h, 0.04, M.door, x + dx, y, z + dz, ry);
  const arch = cylGeo(w / 2, w / 2, 0.04, 12);
  arch.rotateX(Math.PI / 2);
  if (face === 'x') arch.rotateY(Math.PI / 2);
  B.add(arch, M.door, x + dx, y + h, z + dz);
}

export function crenels(B, mat, cx, cz, w, d, y, size = 0.14) {
  const n = Math.max(2, Math.round(w / (size * 2))), m = Math.max(2, Math.round(d / (size * 2)));
  for (let i = 0; i <= n; i += 1) {
    if (i % 2) continue;
    const x = cx - w / 2 + i * w / n;
    B.box(size, size * 1.1, size, mat, x, y, cz + d / 2 - size / 2);
    B.box(size, size * 1.1, size, mat, x, y, cz - d / 2 + size / 2);
  }
  for (let i = 0; i <= m; i += 1) {
    if (i % 2) continue;
    const z = cz - d / 2 + i * d / m;
    B.box(size, size * 1.1, size, mat, cx + w / 2 - size / 2, y, z);
    B.box(size, size * 1.1, size, mat, cx - w / 2 + size / 2, y, z);
  }
}

export function roundCrenels(B, mat, cx, cz, r, y, n = 10, size = 0.12) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    B.box(size, size * 1.2, size * 0.8, mat, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, -a);
  }
}

export function gableRoof(B, mat, cx, cz, w, d, y, h, alongZ = false, fascia = null) {
  const g = gableGeo(w, d, h, 1.2);
  B.add(g, mat, cx, y, cz, alongZ ? Math.PI / 2 : 0);
  if (fascia) {
    // faîtage
    B.box(alongZ ? 0.07 : w + 0.04, 0.07, alongZ ? w + 0.04 : 0.07, fascia, cx, y + h - 0.03, cz);
  }
}

export function gableWall(B, mat, cx, cz, w, d, y, h, alongZ = false) {
  for (const end of [1, -1]) {
    const g = gableEndGeo(d - 0.02, h - 0.03, 1);
    if (alongZ) g.rotateY(Math.PI / 2);
    const ry = alongZ ? (end > 0 ? Math.PI : 0) : (end > 0 ? 0 : Math.PI);
    B.add(g, mat, cx + (alongZ ? 0 : end * w / 2), y, cz + (alongZ ? end * w / 2 : 0), ry);
  }
}

export function makeBanner(M, team, h = 0.9, w = 0.42, ht = 0.3) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo(0.02, 0.025, h, 6), M.beam);
  pole.position.y = h / 2; pole.castShadow = true;
  grp.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.gold);
  knob.position.y = h + 0.02;
  grp.add(knob);
  const geo = new THREE.PlaneGeometry(w, ht, 10, 3);
  geo.translate(w / 2, 0, 0);
  const flag = new THREE.Mesh(geo, team.banner);
  flag.position.set(0.02, h - ht / 2 - 0.04, 0);
  flag.castShadow = true;
  grp.add(flag);
  grp.userData.banner = true;
  return grp;
}

export function barrel(B, M, x, z, y = 0) {
  B.add(cylGeo(0.1, 0.09, 0.26, 10, 2), M.planks, x, y + 0.13, z);
  B.add(cylGeo(0.105, 0.105, 0.025, 10), M.metal, x, y + 0.05, z);
  B.add(cylGeo(0.105, 0.105, 0.025, 10), M.metal, x, y + 0.21, z);
}

export function crate(B, M, x, z, y = 0, s = 0.22) {
  B.box(s, s, s, M.planks, x, y, z, 0.3);
  B.box(s + 0.01, 0.025, s + 0.01, M.beam, x, y + s - 0.025, z, 0.3);
}

export function logPile(B, M, x, z, n = 9) {
  let k = 0;
  for (let row = 0; row < 3 && k < n; row++) {
    for (let i = 0; i < 4 - row && k < n; i++, k++) {
      const g = cylGeo(0.07, 0.07, 0.75, 9, 2); g.rotateZ(Math.PI / 2);
      B.add(g, M.log, x, 0.08 + row * 0.12, z + (i - (3 - row) / 2) * 0.145);
    }
  }
}

export function hay(B, M, x, z, ry = 0) {
  const g = cylGeo(0.16, 0.16, 0.34, 12, 2); g.rotateZ(Math.PI / 2);
  B.add(g, M.straw, x, 0.16, z, ry);
}

export function fence(B, M, pts, h = 0.32) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.45));
    for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; B.box(0.05, h, 0.05, M.log, x, 0, z); }
    for (const yy of [h * 0.45, h * 0.85]) B.beam([ax, yy, az], [bx, yy, bz], 0.035, M.log);
  }
}

// ------------------------------------------------------------------ bâtiments
export function buildingModel(type, s, M, team) {
  const B = new Builder(M);
  const c = s / 2;
  const plinth = (w, d, h = 0.16, mat = M.darkstone) => {
    B.box(w, h + 0.4, d, mat, c, -0.4, c);
    // bande aux couleurs du joueur au pied du bâtiment
    if (mat !== M.paving) {
      const t = 0.035, bh = 0.07, y = Math.max(0.02, h - 0.1);
      B.box(w + 0.02, bh, t, team.cloth, c, y, c + d / 2 + 0.005); B.box(w + 0.02, bh, t, team.cloth, c, y, c - d / 2 - 0.005);
      B.box(t, bh, d + 0.02, team.cloth, c + w / 2 + 0.005, y, c); B.box(t, bh, d + 0.02, team.cloth, c - w / 2 - 0.005, y, c);
    }
  };
  const anim = { blades: null, banners: [], smoke: [], forge: null };
  const banner = (x, z, h = 1.0) => { const b = makeBanner(M, team, h); b.position.set(x, 0, z); B.object(b); };
  switch (type) {
    case 'house': {
      plinth(1.62, 1.42);
      timberWalls(B, M, c, c, 1.4, 0.72, 1.2, 0.16, [
        { x: c + 0.35, y: 0.42, z: c + 0.6, face: 'z' }, { x: c + 0.7, y: 0.42, z: c, face: 'x' },
      ]);
      addDoor(B, M, { x: c - 0.3, y: 0.16, z: c + 0.6, face: 'z', h: 0.42, w: 0.24 });
      gableWall(B, M.plaster, c, c, 1.4, 1.2, 0.88, 0.62);
      gableRoof(B, M.thatch, c, c, 1.66, 1.5, 0.86, 0.72, false, M.beam);
      B.box(0.2, 0.8, 0.2, M.stone, c - 0.4, 0.95, c - 0.3);
      anim.smoke.push([c - 0.4, 1.8, c - 0.3]);
      B.box(0.36, 0.04, 0.22, M.beam, c - 0.3, 0.62, c + 0.72);
      barrel(B, M, c + 0.72, c + 0.78);
      break;
    }
    case 'town_center': {
      plinth(3.8, 3.8, 0.22);
      // cour pavée
      B.box(3.9, 0.04, 3.9, M.paving, c, 0.0, c);
      // donjon rond à l'arrière
      B.add(cylGeo(0.62, 0.7, 3.6, 18, 1.2), M.stone, 0.95, 0.22 + 1.8, 0.95);
      roundCrenels(B, M.stone, 0.95, 0.95, 0.66, 3.82, 12, 0.16);
      B.add(cylGeo(0.75, 0.75, 0.12, 18), M.stone, 0.95, 3.82, 0.95);
      B.add(coneGeo(0.72, 1.35, 18, 1.3), M.slate, 0.95, 3.95 + 0.675, 0.95);
      { const b = makeBanner(M, team, 0.8, 0.5, 0.32); b.position.set(0.95, 5.25, 0.95); B.object(b); }
      for (let k = 0; k < 4; k++) addWindow(B, M, { x: 0.95 + Math.cos(k * 0.9) * 0.66, y: 2.6, z: 0.95 + Math.sin(k * 0.9) * 0.66, face: 'z', w: 0.1, h: 0.24 });
      // grande salle
      B.box(3.1, 1.05, 2.9, M.stone, c + 0.1, 0.22, c + 0.15);
      for (const t of [-1, -0.35, 0.35, 1]) addWindow(B, M, { x: c + 0.1 + t * 1.1, y: 0.7, z: c + 1.6, face: 'z', w: 0.18, h: 0.3 });
      for (const t of [-0.8, 0, 0.8]) addWindow(B, M, { x: c + 1.65, y: 0.7, z: c + 0.15 + t * 1.1, face: 'x', w: 0.18, h: 0.3 });
      B.box(3.3, 0.08, 3.1, M.beam, c + 0.1, 1.27, c + 0.15);
      timberWalls(B, M, c + 0.1, c + 0.15, 3.25, 0.85, 3.05, 1.35, [
        { x: c - 0.9, y: 1.65, z: c + 1.68, face: 'z' }, { x: c + 0.1, y: 1.65, z: c + 1.68, face: 'z' }, { x: c + 1.1, y: 1.65, z: c + 1.68, face: 'z' },
        { x: c + 1.73, y: 1.65, z: c - 0.6, face: 'x' }, { x: c + 1.73, y: 1.65, z: c + 0.7, face: 'x' },
      ]);
      gableWall(B, M.plaster, c + 0.1, c + 0.15, 3.25, 3.05, 2.2, 1.35);
      gableRoof(B, M.tile, c + 0.1, c + 0.15, 3.6, 3.5, 2.18, 1.45, false, M.beam);
      // porche avant
      B.box(1.1, 0.95, 0.7, M.stone, c + 0.1, 0.22, c + 1.85);
      addDoor(B, M, { x: c + 0.1, y: 0.22, z: c + 2.2, face: 'z', w: 0.42, h: 0.55 });
      gableWall(B, M.stone, c + 0.1, c + 1.85, 0.7, 1.1, 1.17, 0.5, true);
      gableRoof(B, M.tile, c + 0.1, c + 1.9, 0.95, 1.3, 1.15, 0.55, true, M.beam);
      // marches
      B.box(0.7, 0.08, 0.25, M.stone, c + 0.1, 0.0, c + 2.35);
      banner(c - 1.4, c + 1.8, 1.4); banner(c + 1.6, c + 1.8, 1.4);
      barrel(B, M, c - 1.6, c + 1.55); barrel(B, M, c - 1.4, c + 1.6); crate(B, M, c + 1.7, c - 1.6);
      break;
    }
    case 'mill': {
      plinth(1.7, 1.7);
      B.add(cylGeo(0.5, 0.66, 1.55, 16, 1.4), M.plaster, c, 0.16 + 0.775, c);
      B.add(cylGeo(0.67, 0.67, 0.08, 16), M.beam, c, 0.2, c);
      B.add(cylGeo(0.52, 0.52, 0.06, 16), M.beam, c, 1.68, c);
      B.add(coneGeo(0.66, 0.85, 16, 1.4), M.thatch, c, 1.7 + 0.425, c);
      addDoor(B, M, { x: c + 0.45, y: 0.16, z: c + 0.45, face: 'z', w: 0.22, h: 0.38 });
      addWindow(B, M, { x: c - 0.1, y: 1.0, z: c + 0.58, face: 'z', w: 0.12, h: 0.16 });
      // ailes animées
      const hub = new THREE.Group();
      hub.position.set(c + 0.42, 1.55, c + 0.42);
      hub.rotation.y = Math.PI / 4;
      const blades = new THREE.Group();
      const axle = new THREE.Mesh(cylGeo(0.06, 0.06, 0.3, 8), M.beam); axle.rotation.x = Math.PI / 2; blades.add(axle);
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
        const spar = new THREE.Mesh(boxGeo(0.05, 1.15, 0.04), M.beam); spar.position.y = 0.6; spar.castShadow = true; arm.add(spar);
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.85), M.sail); sail.position.set(0.15, 0.68, 0.03); sail.castShadow = true; arm.add(sail);
        for (let k = 0; k < 4; k++) { const rung = new THREE.Mesh(boxGeo(0.3, 0.02, 0.02), M.beam); rung.position.set(0.14, 0.3 + k * 0.25, 0.04); arm.add(rung); }
        blades.add(arm);
      }
      blades.position.z = 0.18;
      hub.add(blades);
      B.object(hub);
      anim.blades = blades;
      for (const [x, z] of [[c + 0.85, c - 0.3], [c + 0.75, c - 0.55]]) B.add(displaced(new THREE.SphereGeometry(0.13, 10, 8), 0.12, 3), M.sack, x, 0.13, z);
      break;
    }
    case 'lumber_camp':
    case 'mining_camp': {
      plinth(1.7, 1.6, 0.1, M.paving);
      const roof = type === 'lumber_camp' ? M.shingle : M.slate;
      for (const [x, z] of [[0.25, 0.3], [1.75, 0.3], [1.75, 1.5], [0.25, 1.5]]) B.box(0.09, 0.95, 0.09, M.log, x, 0.1, z);
      B.box(1.55, 0.7, 0.06, M.planks, c, 0.1, 0.28);
      B.box(0.06, 0.7, 1.2, M.planks, 0.23, 0.1, 0.9);
      B.box(1.62, 0.07, 0.07, M.beam, c, 1.0, 1.5);
      B.box(1.62, 0.07, 0.07, M.beam, c, 1.0, 0.3);
      gableRoof(B, roof, c, 0.9, 1.85, 1.55, 1.02, 0.5, false, M.beam);
      if (type === 'lumber_camp') {
        logPile(B, M, 0.95, 0.85, 9);
        B.add(cylGeo(0.17, 0.19, 0.24, 12), M.log, 1.75, 0.12, 1.8);
        B.add(cylGeo(0.168, 0.168, 0.01, 12), M.wood_end, 1.75, 0.245, 1.8);
        const axe = boxGeo(0.03, 0.4, 0.03); axe.rotateZ(0.5); B.add(axe, M.beam, 1.82, 0.4, 1.8);
        B.box(0.12, 0.08, 0.02, M.metal, 1.72, 0.38, 1.8, 0, 0, 0.5);
        logPile(B, M, 1.6, 0.6, 3);
      } else {
        // chariot de minerai
        B.box(0.5, 0.22, 0.34, M.planks, 1.0, 0.16, 0.95);
        for (const [x, z] of [[0.82, 0.76], [1.18, 0.76], [0.82, 1.14], [1.18, 1.14]]) { const w = cylGeo(0.1, 0.1, 0.04, 12); w.rotateX(Math.PI / 2); B.add(w, M.darkwood, x, 0.12, z); }
        for (let i = 0; i < 6; i++) B.add(displaced(new THREE.IcosahedronGeometry(0.07, 0), 0.2, i), i % 2 ? M.ore : M.rock, 0.88 + (i % 3) * 0.11, 0.42, 0.88 + Math.floor(i / 3) * 0.14);
        for (let i = 0; i < 5; i++) B.box(0.18, 0.12, 0.14, M.stone, 1.55 + (i % 2) * 0.05, 0.1 + Math.floor(i / 2) * 0.12, 0.6 + (i % 3) * 0.16, i);
        const pk = boxGeo(0.025, 0.42, 0.025); pk.rotateZ(-0.3); B.add(pk, M.beam, 0.4, 0.3, 1.3);
      }
      banner(1.85, 1.65, 1.2);
      break;
    }
    case 'barracks': {
      plinth(2.75, 2.5, 0.18);
      B.box(2.5, 1.1, 1.7, M.stone, c, 0.18, c - 0.35);
      for (const t of [-0.8, 0, 0.8]) addWindow(B, M, { x: c + t, y: 0.62, z: c + 0.51, face: 'z', w: 0.14, h: 0.26 });
      addWindow(B, M, { x: c + 1.26, y: 0.62, z: c - 0.35, face: 'x', w: 0.14, h: 0.26 });
      addDoor(B, M, { x: c - 0.4, y: 0.18, z: c + 0.51, face: 'z', w: 0.34, h: 0.5 });
      B.box(2.6, 0.08, 1.8, M.beam, c, 1.28, c - 0.35);
      gableWall(B, M.stone, c, c - 0.35, 2.5, 1.7, 1.33, 0.82);
      gableRoof(B, M.tile, c, c - 0.35, 2.75, 2.05, 1.32, 0.88, false, M.beam);
      // cour d'entraînement
      B.box(2.6, 0.03, 0.9, M.paving, c, 0.0, c + 0.95);
      B.box(0.06, 0.55, 0.06, M.log, c + 0.75, 0, c + 1.0);
      B.box(0.32, 0.05, 0.05, M.log, c + 0.75, 0.42, c + 1.0);
      B.add(displaced(new THREE.SphereGeometry(0.11, 10, 8), 0.1, 5).scale(1, 1.4, 1), M.sack, c + 0.75, 0.38, c + 1.0);
      for (let i = 0; i < 4; i++) { const sp = cylGeo(0.012, 0.012, 0.8, 5); sp.rotateX(-0.25); B.add(sp, M.beam, c - 1.0 + i * 0.12, 0.38, c + 1.15); }
      B.box(0.6, 0.04, 0.05, M.log, c - 0.82, 0.5, c + 1.06);
      banner(c - 1.25, c + 1.35, 1.3); banner(c + 1.3, c + 1.35, 1.3);
      break;
    }
    case 'archery_range': {
      plinth(2.7, 2.7, 0.06, M.paving);
      B.box(1.3, 0.8, 1.3, M.planks, 0.85, 0.06, 0.85);
      addDoor(B, M, { x: 0.85, y: 0.06, z: 1.51, face: 'z', w: 0.26, h: 0.42 });
      gableWall(B, M.planks, 0.85, 0.85, 1.3, 1.3, 0.86, 0.55);
      gableRoof(B, M.shingle, 0.85, 0.85, 1.5, 1.55, 0.85, 0.6, false, M.beam);
      fence(B, M, [[0.15, 2.85], [2.85, 2.85], [2.85, 0.15]]);
      for (const [x, z] of [[2.35, 1.0], [2.35, 2.0], [1.4, 2.35]]) {
        B.box(0.05, 0.5, 0.05, M.log, x - 0.12, 0, z - 0.05);
        B.box(0.05, 0.5, 0.05, M.log, x + 0.12, 0, z - 0.05);
        const rings = [[0.24, M.targetWhite], [0.18, M.targetRed], [0.11, M.targetWhite], [0.05, M.targetGold]];
        rings.forEach(([r, m], i) => { const g = cylGeo(r, r, 0.04 + i * 0.005, 18); g.rotateX(Math.PI / 2); g.rotateY(-0.6); B.add(g, m, x, 0.5, z + i * 0.004); });
      }
      hay(B, M, 1.9, 0.45); hay(B, M, 0.4, 2.2, 1.2);
      banner(0.2, 1.7, 1.3);
      break;
    }
    case 'stable': {
      plinth(2.8, 2.4, 0.1);
      B.box(2.55, 0.9, 1.45, M.planks, c, 0.1, c - 0.5);
      for (const t of [-0.85, 0, 0.85]) { B.box(0.36, 0.5, 0.04, M.darkwood, c + t, 0.1, c + 0.24); B.box(0.36, 0.04, 0.05, M.beam, c + t, 0.6, c + 0.25); }
      gableWall(B, M.planks, c, c - 0.5, 2.55, 1.45, 1.0, 0.72);
      gableRoof(B, M.thatch, c, c - 0.5, 2.85, 1.85, 0.98, 0.8, false, M.beam);
      fence(B, M, [[0.2, 2.85], [2.8, 2.85], [2.8, 1.1]]);
      hay(B, M, 2.4, 1.4); hay(B, M, 2.2, 1.6, 0.8); hay(B, M, 0.5, 2.4, 0.3);
      B.box(0.6, 0.14, 0.18, M.darkwood, c - 0.3, 0, c + 1.0);
      banner(0.25, 2.5, 1.3);
      break;
    }
    case 'blacksmith': {
      plinth(2.6, 2.5, 0.16);
      B.box(2.2, 0.95, 1.7, M.darkstone, c - 0.1, 0.16, c - 0.3);
      addDoor(B, M, { x: c - 0.6, y: 0.16, z: c + 0.56, face: 'z', w: 0.32, h: 0.5 });
      addWindow(B, M, { x: c + 0.3, y: 0.55, z: c + 0.56, face: 'z', w: 0.2, h: 0.2 });
      gableWall(B, M.darkstone, c - 0.1, c - 0.3, 2.2, 1.7, 1.11, 0.7);
      gableRoof(B, M.slate, c - 0.1, c - 0.3, 2.45, 2.05, 1.1, 0.75, false, M.beam);
      B.box(0.42, 2.3, 0.42, M.stone, c + 0.55, 0.16, c - 0.75);
      B.box(0.5, 0.1, 0.5, M.stone, c + 0.55, 2.46, c - 0.75);
      anim.smoke.push([c + 0.55, 2.7, c - 0.75]);
      // forge sous auvent
      for (const [x, z] of [[c + 1.15, c + 0.65], [c + 1.15, c + 1.15]]) B.box(0.07, 0.75, 0.07, M.log, x, 0, z);
      B.add(gableGeo(0.7, 0.8, 0.25), M.shingle, c + 0.95, 0.75, c + 0.9, Math.PI / 2);
      B.box(0.45, 0.35, 0.4, M.stone, c + 0.85, 0, c + 0.9);
      B.box(0.3, 0.05, 0.25, M.embers, c + 0.85, 0.35, c + 0.9);
      anim.forge = [c + 0.85, 0.45, c + 0.9];
      // enclume
      B.box(0.14, 0.18, 0.1, M.darkwood, c + 0.3, 0, c + 1.05);
      B.box(0.22, 0.07, 0.1, M.iron, c + 0.3, 0.18, c + 1.05);
      barrel(B, M, c - 1.05, c + 0.9); crate(B, M, c - 0.75, c + 1.05);
      banner(c - 1.2, c + 1.2, 1.2);
      break;
    }
    case 'market': {
      plinth(2.8, 2.8, 0.1, M.paving);
      timberWalls(B, M, 0.95, 0.95, 1.4, 0.8, 1.4, 0.1, [{ x: 1.66, y: 0.45, z: 0.95, face: 'x' }]);
      addDoor(B, M, { x: 0.95, y: 0.1, z: 1.66, face: 'z', w: 0.26, h: 0.42 });
      gableWall(B, M.plaster, 0.95, 0.95, 1.4, 1.4, 0.9, 0.6);
      gableRoof(B, M.tile, 0.95, 0.95, 1.62, 1.75, 0.9, 0.65, false, M.beam);
      // étals avec auvents rayés
      const stall = (x, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
        const posts = [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.25], [0.32, 0.25]];
        for (const [px, pz] of posts) { const m = new THREE.Mesh(boxGeo(0.04, 0.62, 0.04), M.log); m.position.set(px, 0.31, pz); m.castShadow = true; g.add(m); }
        const table = new THREE.Mesh(boxGeo(0.66, 0.05, 0.36), M.planks); table.position.set(0, 0.3, 0); table.castShadow = true; table.receiveShadow = true; g.add(table);
        for (let i = 0; i < 6; i++) {
          const stripe = new THREE.Mesh(boxGeo(0.12, 0.015, 0.58), i % 2 ? M.canvas : team.cloth);
          stripe.position.set(-0.3 + i * 0.12, 0.66, 0.02); stripe.rotation.x = 0.28; stripe.castShadow = true; g.add(stripe);
        }
        const goods = [M.fruit, M.ore, M.sack, M.fruit];
        goods.forEach((gm, i) => { const m = new THREE.Mesh(displaced(new THREE.IcosahedronGeometry(0.055, 1), 0.1, i), gm); m.position.set(-0.22 + i * 0.15, 0.37, -0.02); g.add(m); });
        return g;
      };
      B.object(stall(2.25, 1.2, -Math.PI / 2)); B.object(stall(1.3, 2.3, 0)); B.object(stall(2.3, 2.3, -Math.PI / 4));
      barrel(B, M, 0.4, 2.4); crate(B, M, 0.65, 2.55); crate(B, M, 2.55, 0.45);
      break;
    }
    case 'tower': {
      plinth(0.95, 0.95, 0.12);
      B.box(0.74, 2.3, 0.74, M.stone, c, 0.12, c);
      B.box(0.92, 0.12, 0.92, M.stone, c, 2.42, c);
      crenels(B, M.stone, c, c, 0.92, 0.92, 2.54, 0.12);
      for (const yy of [0.9, 1.6]) { B.box(0.05, 0.2, 0.02, M.slit, c, yy, c + 0.375); B.box(0.02, 0.2, 0.05, M.slit, c + 0.375, yy, c); }
      addDoor(B, M, { x: c, y: 0.12, z: c + 0.375, face: 'z', w: 0.2, h: 0.34 });
      for (const [x, z] of [[c - 0.32, c - 0.32], [c + 0.32, c - 0.32], [c + 0.32, c + 0.32], [c - 0.32, c + 0.32]]) B.box(0.05, 0.4, 0.05, M.log, x, 2.54, z);
      B.add(pyramidGeo(0.98, 0.98, 0.75, 1.5), M.slate, c, 2.94, c);
      { const b = makeBanner(M, team, 0.55, 0.32, 0.2); b.position.set(c, 3.68, c); B.object(b); }
      break;
    }
    case 'siege_workshop': {
      plinth(2.75, 2.6, 0.1);
      B.box(2.3, 1.25, 1.75, M.planks, c - 0.1, 0.1, c - 0.3);
      B.box(0.9, 0.85, 0.05, M.darkwood, c - 0.1, 0.1, c + 0.58);
      for (const [x, z] of [[c - 1.25, c - 1.18], [c + 1.05, c - 1.18], [c + 1.05, c + 0.58], [c - 1.25, c + 0.58]]) B.box(0.08, 1.25, 0.08, M.log, x, 0.1, z);
      gableWall(B, M.planks, c - 0.1, c - 0.3, 2.3, 1.75, 1.35, 0.8);
      gableRoof(B, M.shingle, c - 0.1, c - 0.3, 2.55, 2.1, 1.34, 0.85, false, M.beam);
      // grue
      B.box(0.1, 2.1, 0.1, M.log, c + 1.2, 0, c + 0.9);
      B.beam([c + 1.2, 2.05, c + 0.9], [c + 0.3, 1.75, c + 1.25], 0.07, M.log);
      B.beam([c + 1.2, 1.4, c + 0.9], [c + 0.75, 1.9, c + 1.08], 0.05, M.log);
      B.beam([c + 0.3, 1.75, c + 1.25], [c + 0.3, 0.9, c + 1.25], 0.012, M.rope);
      // roue en cours de fabrication
      const wh = new THREE.TorusGeometry(0.22, 0.035, 6, 16); wh.rotateY(0.7); B.add(wh, M.darkwood, c - 0.8, 0.26, c + 1.1);
      logPile(B, M, c + 0.3, c + 1.0, 5);
      banner(c - 1.25, c + 1.25, 1.4);
      break;
    }
    case 'fortress': {
      plinth(3.95, 3.95, 0.12);
      // donjon
      B.box(1.7, 2.9, 1.7, M.darkstone, c - 0.1, 0.12, c - 0.1);
      B.box(1.85, 0.12, 1.85, M.darkstone, c - 0.1, 3.02, c - 0.1);
      crenels(B, M.darkstone, c - 0.1, c - 0.1, 1.85, 1.85, 3.14, 0.16);
      for (const yy of [1.2, 2.1]) { B.box(0.07, 0.26, 0.02, M.slit, c - 0.4, yy, c + 0.76); B.box(0.07, 0.26, 0.02, M.slit, c + 0.2, yy, c + 0.76); B.box(0.02, 0.26, 0.07, M.slit, c + 0.76, yy, c - 0.1); }
      { const b = makeBanner(M, team, 1.0, 0.6, 0.38); b.position.set(c - 0.1, 3.2, c - 0.1); B.object(b); }
      // courtines
      const wallH = 1.25, t = 0.3, e = 3.5, x0 = c - e / 2, x1 = c + e / 2;
      B.box(e, wallH, t, M.darkstone, c, 0.12, x0 + t / 2); B.box(e, wallH, t, M.darkstone, c, 0.12, x1 - t / 2);
      B.box(t, wallH, e, M.darkstone, x0 + t / 2, 0.12, c); B.box(t, wallH, e, M.darkstone, x1 - t / 2, 0.12, c);
      for (let i = 0; i < 9; i++) {
        const k = x0 + 0.25 + i * (e - 0.5) / 8;
        if (i % 2) continue;
        for (const [x, z] of [[k, x1 - 0.08], [k, x0 + 0.08], [x1 - 0.08, k], [x0 + 0.08, k]]) B.box(0.16, 0.16, 0.16, M.darkstone, x, 0.12 + wallH, z);
      }
      // porte fortifiée
      B.box(0.6, 0.75, 0.05, M.gate, c, 0.12, x1 + 0.01);
      for (const dx of [-0.48, 0.48]) {
        B.add(cylGeo(0.26, 0.28, 1.7, 14, 1.4), M.darkstone, c + dx, 0.12 + 0.85, x1);
        roundCrenels(B, M.darkstone, c + dx, x1, 0.26, 1.82, 8, 0.1);
      }
      // tours d'angle
      for (const [x, z] of [[x0, x0], [x1, x0], [x0, x1], [x1, x1]]) {
        B.add(cylGeo(0.42, 0.46, 2.0, 16, 1.3), M.darkstone, x, 0.12 + 1.0, z);
        B.add(cylGeo(0.48, 0.48, 0.1, 16), M.darkstone, x, 2.14, z);
        roundCrenels(B, M.darkstone, x, z, 0.44, 2.2, 10, 0.12);
        B.add(coneGeo(0.47, 0.9, 16, 1.3), M.slate, x, 2.25 + 0.45, z);
      }
      banner(x1 + 0.1, x1 + 0.25, 1.1);
      break;
    }
    case 'farm': {
      B.box(2.9, 0.05, 2.9, M.farmSoil, c, -0.02, c);
      for (const [x0, z0, x1, z1] of [[0.05, 0.05, 2.95, 0.05], [2.95, 0.05, 2.95, 2.95], [2.95, 2.95, 0.05, 2.95], [0.05, 2.95, 0.05, 0.05]]) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const g = cylGeo(0.035, 0.035, len, 6, 2); g.rotateZ(Math.PI / 2);
        B.add(g, M.log, (x0 + x1) / 2, 0.05, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
      }
      for (const [x, z] of [[0.05, 0.05], [2.95, 0.05], [2.95, 2.95], [0.05, 2.95]]) B.box(0.06, 0.28, 0.06, M.log, x, 0, z);
      break;
    }
    case 'palisade':
    default:
      break;
  }
  const grp = B.build();
  grp.anim = anim;
  return grp;
}

// palissade : pieux reliés aux voisins (masque 4 bits : +x, -x, +z, -z)
export function palisadeModel(mask, M) {
  const B = new Builder(M);
  const stake = (x, z, h) => {
    B.add(cylGeo(0.055, 0.06, h, 7, 2), M.log, x, h / 2, z);
    B.add(coneGeo(0.058, 0.14, 7), M.log, x, h + 0.07, z);
  };
  const r = prng(mask + 5);
  stake(0.5, 0.5, 0.95);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  dirs.forEach(([dx, dz], i) => {
    if (!(mask & (1 << i))) return;
    for (let k = 1; k <= 4; k++) stake(0.5 + dx * k * 0.125, 0.5 + dz * k * 0.125, 0.82 + r() * 0.2);
    B.beam([0.5, 0.5, 0.5], [0.5 + dx * 0.5, 0.5, 0.5 + dz * 0.5], 0.04, M.beam);
  });
  if (!mask) { stake(0.36, 0.5, 0.85); stake(0.64, 0.5, 0.88); }
  return B.build();
}

// muraille de pierre : segments crénelés, contreforts et tours aux angles (masque 4 bits)
export function stoneWallModel(mask, M, team, wallMat = null) {
  const B = new Builder(M);
  const STONE = wallMat || M.darkstone;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const n = [0, 1, 2, 3].filter((i) => mask & (1 << i)).length;
  const straight = (mask === 3 || mask === 12);
  const H = 1.35, T = 0.5, band = (w, d, x, z, y = 0.22) => B.box(w, 0.09, d, team.cloth, x, y, z);
  if (straight) {
    const alongX = mask === 3;
    const w = alongX ? 1.02 : T, d = alongX ? T : 1.02;
    B.box(w, H + 0.4, d, STONE, 0.5, -0.4, 0.5);
    band(w + 0.02, d + 0.02, 0.5, 0.5);
    // chemin de ronde et créneaux des deux côtés
    for (let k = 0; k < 4; k++) {
      if (k % 2) continue;
      const o = -0.5 + (k + 0.5) / 4;
      for (const side of [-1, 1]) {
        const x = alongX ? 0.5 + o : 0.5 + side * (T / 2 - 0.06), z = alongX ? 0.5 + side * (T / 2 - 0.06) : 0.5 + o;
        B.box(alongX ? 0.2 : 0.12, 0.18, alongX ? 0.12 : 0.2, STONE, x, H, z);
      }
    }
    // contrefort côté extérieur
    for (const side of [-1, 1]) {
      const x = alongX ? 0.5 : 0.5 + side * (T / 2 + 0.06), z = alongX ? 0.5 + side * (T / 2 + 0.06) : 0.5;
      B.box(alongX ? 0.22 : 0.14, H * 0.85, alongX ? 0.14 : 0.22, STONE, x, 0, z);
      band(alongX ? 0.24 : 0.16, alongX ? 0.16 : 0.24, x, z);
    }
  } else {
    // tour de rempart (extrémité, angle ou jonction)
    const R = n >= 3 ? 0.46 : 0.42;
    for (let i = 0; i < 4; i++) {
      if (!(mask & (1 << i))) continue;
      const [dx, dz] = dirs[i];
      B.box(Math.abs(dx) ? 0.55 : T, H + 0.4, Math.abs(dz) ? 0.55 : T, STONE, 0.5 + dx * 0.25, -0.4, 0.5 + dz * 0.25);
      band(Math.abs(dx) ? 0.56 : T + 0.02, Math.abs(dz) ? 0.56 : T + 0.02, 0.5 + dx * 0.25, 0.5 + dz * 0.25);
    }
    B.add(cylGeo(R, R + 0.05, H + 0.9, 14, 1.3), STONE, 0.5, (H + 0.9) / 2 - 0.2, 0.5);
    B.add(cylGeo(R + 0.08, R + 0.08, 0.12, 14), STONE, 0.5, H + 0.72, 0.5);
    roundCrenels(B, STONE, 0.5, 0.5, R + 0.04, H + 0.78, 10, 0.13);
    B.add(cylGeo(R + 0.062, R + 0.062, 0.09, 14), team.cloth, 0.5, 0.27, 0.5);
    B.add(cylGeo(R + 0.09, R + 0.09, 0.06, 14), team.cloth, 0.5, H + 0.62, 0.5);
    for (const a of [0.8, 2.4]) B.box(0.05, 0.22, 0.02, M.slit, 0.5 + Math.cos(a) * (R + 0.01), H * 0.55, 0.5 + Math.sin(a) * (R + 0.01), -a + Math.PI / 2);
  }
  return B.build();
}

// porte (palissade ou porterie de pierre) ; alongX : le rempart suit l'axe X, on passe selon Z
export function gateModel(type, alongX, M, team, wallMat = null) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  if (!alongX) { pivot.rotation.y = Math.PI / 2; pivot.position.set(0, 0, 1); }
  root.add(pivot);
  const B = new Builder(M);
  const doors = [];
  // battant de porte : charnière à l'origine, s'étend vers +x (sens = 1) ou -x (sens = -1)
  const leaf = (hx, sens, w, h, wood) => {
    const D = new Builder(M);
    const c = sens * w / 2;
    if (wood === 'stakes') {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = sens * (w * (i + 0.5) / n);
        const hh = h + (i % 2) * 0.05;
        D.add(cylGeo(0.045, 0.05, hh, 7, 2), M.log, x, hh / 2, 0);
        D.add(coneGeo(0.047, 0.12, 7), M.log, x, hh + 0.06, 0);
      }
      for (const y of [0.25, h - 0.2]) D.box(w, 0.06, 0.05, M.beam, c, y, 0.05);
      D.beam([sens * 0.03, 0.28, 0.06], [sens * (w - 0.03), h - 0.2, 0.06], 0.04, M.beam);
      D.beam([sens * 0.03, 0.28, -0.06], [sens * (w - 0.03), h - 0.2, -0.06], 0.04, M.beam);
    } else {
      D.box(w, h, 0.06, M.planks || M.darkwood, c, 0, 0);
      for (const y of [0.18, h * 0.5, h - 0.18]) {
        D.box(w * 0.96, 0.045, 0.075, M.iron || M.darkmetal || M.slit, c, y - 0.02, 0);
        for (let k = 1; k < 4; k++) D.add(new THREE.SphereGeometry(0.013, 6, 4), M.iron || M.slit, sens * w * k / 4, y, 0.04);
      }
      D.box(0.03, 0.1, 0.09, M.iron || M.slit, sens * (w - 0.06), h * 0.45, 0);
    }
    const g = D.build();
    g.position.set(hx, 0, 0.5);
    pivot.add(g);
    doors.push(g);
  };
  if (type === 'palisade_gate') {
    const post = (x) => {
      B.add(cylGeo(0.085, 0.095, 1.5, 9, 2), M.log, x, 0.75, 0.5);
      B.add(coneGeo(0.09, 0.18, 9), M.log, x, 1.59, 0.5);
    };
    post(0.07); post(0.93);
    // linteau, auvent et chemin de garde
    B.beam([0.0, 1.22, 0.5], [1.0, 1.22, 0.5], 0.09, M.log);
    B.beam([0.07, 1.0, 0.5], [0.3, 1.22, 0.5], 0.05, M.beam); B.beam([0.93, 1.0, 0.5], [0.7, 1.22, 0.5], 0.05, M.beam);
    B.box(0.98, 0.04, 0.34, M.beam, 0.5, 1.27, 0.5);
    for (const z of [0.36, 0.64]) for (let i = 0; i < 6; i++) B.add(cylGeo(0.03, 0.03, 0.22, 6), M.log, 0.1 + i * 0.16, 1.4, z);
    B.box(0.18, 0.26, 0.015, team.cloth, 0.5, 0.86, 0.66);
    B.box(0.18, 0.26, 0.015, team.cloth, 0.5, 0.86, 0.34);
    leaf(0.13, 1, 0.37, 0.95, 'stakes');
    leaf(0.87, -1, 0.37, 0.95, 'stakes');
  } else {
    const STONE = wallMat || M.darkstone;
    const H = 1.35, T = 0.5;
    // tours de flanquement
    for (const x of [-0.02, 1.02]) {
      B.add(cylGeo(0.27, 0.31, H + 1.2, 14, 1.3), STONE, x, (H + 1.2) / 2 - 0.2, 0.5);
      B.add(cylGeo(0.33, 0.33, 0.12, 14), STONE, x, H + 1.0, 0.5);
      roundCrenels(B, STONE, x, 0.5, 0.3, H + 1.06, 9, 0.11);
      B.add(cylGeo(0.315, 0.315, 0.09, 14), team.cloth, x, 0.27, 0.5);
      B.add(cylGeo(0.335, 0.335, 0.06, 14), team.cloth, x, H + 0.88, 0.5);
      for (const z of [0.2, 0.8]) B.box(0.05, 0.22, 0.02, M.slit, x, H * 0.55, z + (z < 0.5 ? 0.01 : -0.01));
      B.add(coneGeo(0.36, 0.5, 14), M.slate || STONE, x, H + 1.45, 0.5);
    }
    // bloc au-dessus du passage, avec arc et créneaux
    B.box(0.74, H + 0.35 - 0.98, T + 0.16, STONE, 0.5, 0.98, 0.5);
    for (const z of [0.5 - (T + 0.16) / 2, 0.5 + (T + 0.16) / 2]) {
      B.add(new THREE.TorusGeometry(0.255, 0.05, 6, 14, Math.PI), STONE, 0.5, 0.74, z);
      B.box(0.06, 0.12, 0.03, STONE, 0.5, 0.95, z);
    }
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) B.box(0.12, 0.16, 0.1, STONE, 0.2 + i * 0.2, H + 0.35, 0.5 + side * (T / 2 + 0.02));
    B.box(0.76, 0.06, T + 0.18, team.cloth, 0.5, 1.0, 0.5);
    // herse relevée et bannière
    for (let i = 0; i < 5; i++) B.box(0.025, 0.36, 0.025, M.iron || M.slit, 0.29 + i * 0.105, 0.98, 0.5 - T / 2 + 0.04);
    B.box(0.24, 0.42, 0.02, team.cloth, 0.5, 1.05, 0.5 + (T + 0.16) / 2 + 0.012);
    B.box(0.24, 0.04, 0.03, M.gold || team.cloth, 0.5, 1.47, 0.5 + (T + 0.16) / 2 + 0.012);
    leaf(0.25, 1, 0.25, 0.92, 'planks');
    leaf(0.75, -1, 0.25, 0.92, 'planks');
  }
  pivot.add(B.build());
  root.userData = { anim: { banners: [], doors } };
  return root;
}

// échafaudage de chantier
export function scaffoldModel(s, M) {
  const B = new Builder(M);
  const h = Math.min(2, 0.6 + s * 0.35);
  for (const x of [0.15, s - 0.15]) for (const z of [0.15, s - 0.15]) B.box(0.06, h, 0.06, M.log, x, 0, z);
  for (const yy of [h * 0.35, h * 0.7, h]) {
    B.beam([0.15, yy, s - 0.15], [s - 0.15, yy, s - 0.15], 0.04, M.log);
    B.beam([s - 0.15, yy, 0.15], [s - 0.15, yy, s - 0.15], 0.04, M.log);
    B.beam([0.15, yy, 0.15], [s - 0.15, yy, 0.15], 0.04, M.log);
    B.beam([0.15, yy, 0.15], [0.15, yy, s - 0.15], 0.04, M.log);
  }
  B.beam([0.15, 0, s - 0.15], [s - 0.15, h * 0.7, s - 0.15], 0.035, M.log);
  B.beam([s - 0.15, 0, 0.15], [s - 0.15, h * 0.7, s - 0.15], 0.035, M.log);
  B.box(s - 0.2, 0.04, s - 0.2, M.paving, s / 2, 0.0, s / 2);
  logPile(B, M, 0.35, s - 0.1, 4);
  return B.build();
}

// ------------------------------------------------------------------ nature
export function treeGeometries() {
  const kinds = [];
  for (let v = 0; v < 3; v++) {
    const r = prng(100 + v);
    const trunk = merge([
      cylGeo(0.06, 0.1, 0.95, 7, 3).translate(0, 0.47, 0),
      cylGeo(0.025, 0.045, 0.45, 5, 3).rotateZ(0.8).translate(0.14, 0.82, 0),
      cylGeo(0.025, 0.04, 0.4, 5, 3).rotateZ(-0.7).rotateY(1.8).translate(-0.08, 0.78, 0.1),
    ]);
    const blobs = [];
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + r(), d = i === 0 ? 0 : 0.22 + r() * 0.12;
      const rad = (i === 0 ? 0.48 : 0.3 + r() * 0.12) * (0.95 + v * 0.05);
      const g = displaced(new THREE.IcosahedronGeometry(rad, 2), 0.16, v * 17 + i, 5);
      g.translate(Math.cos(a) * d, 1.15 + (i === 0 ? 0.2 : r() * 0.3 - 0.05), Math.sin(a) * d);
      blobs.push(g);
    }
    const leaves = merge(blobs, true);
    colorize(leaves, (x, y, z) => {
      const l = 0.62 + (y - 0.9) * 0.45 + (-x - z) * 0.18;
      return [Math.min(1.25, l), Math.min(1.25, l), Math.min(1.25, l)];
    });
    kinds.push({ trunk, leaves, pine: false });
  }
  for (let v = 0; v < 2; v++) {
    const trunk = merge([cylGeo(0.04, 0.08, 0.8, 7, 3).translate(0, 0.4, 0)]);
    const tiers = [];
    const nt = 4 + v;
    for (let i = 0; i < nt; i++) {
      const k = i / (nt - 1);
      const g = displaced(new THREE.ConeGeometry(0.55 - k * 0.32, 0.6 - k * 0.12, 9, 2), 0.07, 200 + v * 10 + i, 7);
      g.translate(0, 0.55 + i * 0.36, 0);
      tiers.push(g);
    }
    const leaves = merge(tiers, true);
    colorize(leaves, (x, y, z) => { const l = 0.55 + (y - 0.5) * 0.18 + Math.hypot(x, z) * 0.35 + (-x - z) * 0.12; return [l, l, l]; });
    kinds.push({ trunk, leaves, pine: true });
  }
  return kinds;
}

export function rockGeometries() {
  const cluster = (seed, n, spread, size) => {
    const r = prng(seed);
    const list = [];
    for (let i = 0; i < n; i++) {
      const g = displaced(new THREE.IcosahedronGeometry(size * (0.6 + r() * 0.5), 1), 0.22, seed + i, 4);
      g.scale(1, 0.62 + r() * 0.25, 1);
      g.rotateY(r() * 6);
      g.translate((r() - 0.5) * spread, size * 0.22, (r() - 0.5) * spread);
      list.push(g);
    }
    return merge(list);
  };
  const nuggets = (seed) => {
    const r = prng(seed), list = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.OctahedronGeometry(0.06 + r() * 0.05, 0);
      g.rotateX(r() * 3); g.rotateZ(r() * 3);
      g.translate((r() - 0.5) * 0.6, 0.15 + r() * 0.2, (r() - 0.5) * 0.6);
      list.push(g);
    }
    return merge(list);
  };
  return {
    gold: [cluster(300, 4, 0.55, 0.3), cluster(310, 3, 0.5, 0.33)],
    nugget: [nuggets(320), nuggets(330)],
    stone: [cluster(340, 4, 0.6, 0.32), cluster(350, 5, 0.6, 0.28)],
  };
}

export function bushGeometries() {
  const r = prng(400);
  const list = [];
  for (let i = 0; i < 6; i++) {
    const g = displaced(new THREE.IcosahedronGeometry(0.18 + r() * 0.08, 1), 0.18, 400 + i, 6);
    g.translate((r() - 0.5) * 0.42, 0.18 + r() * 0.12, (r() - 0.5) * 0.42);
    list.push(g);
  }
  const bush = merge(list, true);
  colorize(bush, (x, y) => { const l = 0.55 + y * 1.1; return [l, l, l]; });
  const berries = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 0.15 + r() * 0.17;
    const g = new THREE.SphereGeometry(0.03, 6, 5);
    g.translate(Math.cos(a) * d, 0.18 + r() * 0.22, Math.sin(a) * d);
    berries.push(g);
  }
  return { bush, berries: merge(berries) };
}

export function sheepGeometries() {
  const wool = merge([
    displaced(new THREE.IcosahedronGeometry(0.2, 2), 0.12, 500, 10).scale(1, 0.85, 1.35).translate(0, 0.26, 0),
    displaced(new THREE.IcosahedronGeometry(0.09, 1), 0.15, 501, 10).translate(0, 0.36, 0.22),
  ]);
  const dark = merge([
    new THREE.SphereGeometry(0.07, 10, 8).scale(0.85, 0.9, 1.3).translate(0, 0.3, 0.33),
    ...[[-0.09, -0.15], [0.09, -0.15], [-0.09, 0.15], [0.09, 0.15]].map(([x, z]) => new THREE.CylinderGeometry(0.022, 0.02, 0.2, 5).translate(x, 0.1, z)),
    new THREE.SphereGeometry(0.03, 6, 5).scale(1.6, 0.6, 1).translate(-0.06, 0.34, 0.3),
    new THREE.SphereGeometry(0.03, 6, 5).scale(1.6, 0.6, 1).translate(0.06, 0.34, 0.3),
  ]);
  return { wool, dark };
}

export function grassTuftGeometry(blades = 6, height = 0.22, seed = 600) {
  const r = prng(seed);
  const pos = [], colr = [];
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.08;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const w = 0.018 + r() * 0.012, h = height * (0.6 + r() * 0.6);
    const lean = (r() - 0.5) * 0.12, ang = r() * Math.PI;
    const ox = Math.cos(ang) * w, oz = Math.sin(ang) * w;
    pos.push(bx - ox, 0, bz - oz, bx + ox, 0, bz + oz, bx + lean, h, bz + lean * 0.5);
    colr.push(0.35, 0.45, 0.25, 0.35, 0.45, 0.25, 1.15, 1.2, 0.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  // normales orientées vers le haut pour un éclairage doux
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return g;
}

export function arrowGeometry() {
  return merge([
    new THREE.CylinderGeometry(0.008, 0.008, 0.42, 4).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.018, 0.06, 4).rotateX(Math.PI / 2).translate(0, 0, 0.23),
    new THREE.BoxGeometry(0.04, 0.002, 0.07).translate(0, 0, -0.18),
    new THREE.BoxGeometry(0.002, 0.04, 0.07).translate(0, 0, -0.18),
  ]);
}
