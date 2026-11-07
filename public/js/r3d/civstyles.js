// Styles architecturaux des civilisations (Romains, Égyptiens, Incas, Japonais, Vikings).
// Les Francs utilisent les modèles d'origine (models.js).
import * as THREE from 'three';
import {
  Builder, boxGeo, cylGeo, coneGeo, gableGeo, gableEndGeo, pyramidGeo, displaced, makeBanner,
  barrel, crate, logPile, hay, fence, crenels, roundCrenels,
} from './models.js';

// ------------------------------------------------------------------ géométries spécifiques
// boîte talutée (murs égyptiens, incas) : le haut est rétréci
export function taperBox(w, h, d, tx, tz = tx) {
  const g = boxGeo(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * (1 - tx), p.getY(i), p.getZ(i) * (1 - tz));
  g.computeVertexNormals();
  return g;
}

// toit en croupe (quatre pans), faîtage selon l'axe le plus long, base à y = 0
export function hipGeo(w, d, h, den = 1.2) {
  const swap = d > w;
  const W = swap ? d : w, D = swap ? w : d;
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, r = (W - D) / 2;
  const sl = Math.hypot(D / 2, h);
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  // pan avant et arrière (trapèzes)
  tri([x0, 0, z1], [x1, 0, z1], [r, h, 0], [0, 0], [W * den, 0], [(W / 2 + r) * den, sl * den]);
  tri([x0, 0, z1], [r, h, 0], [-r, h, 0], [0, 0], [(W / 2 + r) * den, sl * den], [(W / 2 - r) * den, sl * den]);
  tri([x1, 0, z0], [x0, 0, z0], [-r, h, 0], [0, 0], [W * den, 0], [(W / 2 + r) * den, sl * den]);
  tri([x1, 0, z0], [-r, h, 0], [r, h, 0], [0, 0], [(W / 2 + r) * den, sl * den], [(W / 2 - r) * den, sl * den]);
  // croupes (triangles)
  const sl2 = Math.hypot(W / 2 - r, h);
  tri([x1, 0, z1], [x1, 0, z0], [r, h, 0], [0, 0], [D * den, 0], [D / 2 * den, sl2 * den]);
  tri([x0, 0, z0], [x0, 0, z1], [-r, h, 0], [0, 0], [D * den, 0], [D / 2 * den, sl2 * den]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (swap) g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ kits de style
export const KITS = {
  francs: { mason: 'stone', wall: 'stone', base: 'darkstone', roof: 'gable', roofMat: 'tile', pitch: 0.9, door: 'arch', tower: 'square' },
  romains: { mason: 'marble', wall: 'stucco', base: 'marble', roof: 'hip', roofMat: 'tile', pitch: 0.4, door: 'arch', tower: 'square' },
  egyptiens: { mason: 'sandstone', wall: 'mudbrick', base: 'sandstone', roof: 'flat', taper: 0.1, door: 'trap', tower: 'pylon' },
  incas: { mason: 'ashlar', wall: 'ashlar', base: 'ashlar', roof: 'hip', roofMat: 'thatch', pitch: 1.15, taper: 0.05, door: 'trap', tower: 'round' },
  japonais: { mason: 'darkstone', wall: 'whiteplaster', base: 'darkstone', roof: 'curved', roofMat: 'kawara', pitch: 0.5, door: 'slide', tower: 'yagura' },
  vikings: { mason: 'darkstone', wall: 'logs', base: 'darkstone', roof: 'gable', roofMat: 'shingle', pitch: 1.15, door: 'plank', tower: 'wood', dragons: true },
};

class Style {
  constructor(civ, M, team) {
    this.K = KITS[civ]; this.civ = civ; this.M = M; this.team = team;
    this.anim = { blades: null, banners: [], smoke: [], forge: null };
  }

  mat(k) { return this.M[k] || this.M.stone; }

  banner(B, x, z, h = 1.1, y = 0) { const b = makeBanner(this.M, this.team, h); b.position.set(x, y, z); B.object(b); }

  plinth(B, c, w, d, h = 0.14) {
    const M = this.M;
    B.box(w, h + 0.4, d, this.mat(this.K.base), c, -0.4, c);
    const t = 0.035, bh = 0.07, y = Math.max(0.02, h - 0.1);
    B.box(w + 0.02, bh, t, this.team.cloth, c, y, c + d / 2 + 0.005); B.box(w + 0.02, bh, t, this.team.cloth, c, y, c - d / 2 - 0.005);
    B.box(t, bh, d + 0.02, this.team.cloth, c + w / 2 + 0.005, y, c); B.box(t, bh, d + 0.02, this.team.cloth, c - w / 2 - 0.005, y, c);
    void M;
  }

  // corps de bâtiment dans le style de la civilisation
  body(B, cx, cz, w, h, d, y0, o = {}) {
    const K = this.K, M = this.M;
    const wall = this.mat(o.wall || K.wall);
    if (K.taper) B.add(taperBox(w, h, d, K.taper * (o.taperMul ?? 1)), wall, cx, y0 + h / 2, cz);
    else B.box(w, h, d, wall, cx, y0, cz);
    const tw = K.taper ? w * (1 - K.taper * (o.taperMul ?? 1)) : w, td = K.taper ? d * (1 - K.taper * (o.taperMul ?? 1)) : d;
    switch (this.civ) {
      case 'romains': {
        for (const [x, z] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]) B.box(0.1, h, 0.1, M.marble, x, y0, z);
        B.box(w + 0.14, 0.09, d + 0.14, M.marble, cx, y0 + h - 0.02, cz);
        B.box(w + 0.03, 0.06, d + 0.03, this.team.cloth, cx, y0 + h - 0.1, cz);
        B.box(w + 0.06, 0.1, d + 0.06, M.marble, cx, y0, cz);
        break;
      }
      case 'egyptiens': {
        B.box(tw + 0.16, 0.1, td + 0.16, M.sandstone, cx, y0 + h, cz);
        B.box(tw + 0.1, 0.05, td + 0.1, this.team.cloth, cx, y0 + h - 0.06, cz);
        B.box(tw + 0.08, 0.035, td + 0.08, M.gold, cx, y0 + h - 0.11, cz);
        break;
      }
      case 'incas': {
        B.box(tw + 0.05, 0.05, td + 0.05, this.team.cloth, cx, y0 + h - 0.06, cz);
        break;
      }
      case 'japonais': {
        // soubassement de bois sombre, poteaux et traverses
        B.box(w + 0.03, h * 0.32, d + 0.03, M.blackwood, cx, y0, cz);
        const t = 0.05;
        for (const [x, z] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]) B.box(t * 1.4, h, t * 1.4, M.blackwood, x, y0, z);
        const nx = Math.max(2, Math.round(w / 0.4)), nz = Math.max(2, Math.round(d / 0.4));
        for (let i = 1; i < nx; i++) { const x = cx - w / 2 + i * w / nx; B.box(t, h, t, M.blackwood, x, y0, cz + d / 2 + 0.01); B.box(t, h, t, M.blackwood, x, y0, cz - d / 2 - 0.01); }
        for (let i = 1; i < nz; i++) { const z = cz - d / 2 + i * d / nz; B.box(t, h, t, M.blackwood, cx + w / 2 + 0.01, y0, z); B.box(t, h, t, M.blackwood, cx - w / 2 - 0.01, y0, z); }
        B.box(w + 0.05, t, d + 0.05, M.blackwood, cx, y0 + h - t, cz);
        B.box(w + 0.05, t * 0.8, d + 0.05, M.blackwood, cx, y0 + h * 0.62, cz);
        break;
      }
      case 'vikings': {
        for (const [x, z] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]) B.add(cylGeo(0.07, 0.08, h + 0.15, 8, 2), M.log, x, y0 + (h + 0.15) / 2, z);
        if (o.shields !== false && w > 1.2) {
          const n = Math.max(2, Math.floor(w / 0.55));
          for (let i = 0; i < n; i++) {
            const x = cx - w / 2 + (i + 0.5) * w / n;
            const sg = cylGeo(0.13, 0.13, 0.03, 14); sg.rotateX(Math.PI / 2);
            B.add(sg, i % 2 ? this.team.cloth : M.planks, x, y0 + h * 0.62, cz + d / 2 + 0.03);
            B.add(new THREE.SphereGeometry(0.035, 8, 6), M.metal, x, y0 + h * 0.62, cz + d / 2 + 0.05);
          }
        }
        break;
      }
      default:
    }
    for (const win of o.windows || []) this.window(B, win);
    if (o.door) this.door(B, o.door);
  }

  door(B, { x, y, z, face = 'z', w = 0.28, h = 0.46 }) {
    const M = this.M, ry = face === 'x' ? Math.PI / 2 : 0;
    const dz = face === 'z' ? 0.02 : 0, dx = face === 'x' ? 0.02 : 0;
    switch (this.K.door) {
      case 'trap':
        B.add(taperBox(w + 0.1, h + 0.08, 0.05, 0.25, 0), this.mat(this.K.mason), x + dx * 0.4, y + (h + 0.08) / 2, z + dz * 0.4, ry);
        B.add(taperBox(w, h, 0.05, 0.28, 0), M.slit, x + dx, y + h / 2, z + dz, ry);
        break;
      case 'slide':
        B.box(w + 0.06, h + 0.05, 0.04, M.blackwood, x + dx * 0.4, y, z + dz * 0.4, ry);
        B.box(w, h, 0.04, M.paper, x + dx, y, z + dz, ry);
        for (let k = 1; k < 3; k++) B.box(0.015, h, 0.05, M.blackwood, x + dx * 1.2 + (face === 'z' ? (k / 3 - 0.5) * w : 0), y, z + dz * 1.2 + (face === 'x' ? (k / 3 - 0.5) * w : 0), ry);
        break;
      case 'plank':
        B.box(w + 0.08, h + 0.06, 0.05, M.log, x + dx * 0.4, y, z + dz * 0.4, ry);
        B.box(w, h, 0.05, M.door, x + dx, y, z + dz, ry);
        for (const yy of [0.12, 0.32]) B.box(w * 0.95, 0.03, 0.055, M.iron, x + dx * 1.1, y + yy * h * 2, z + dz * 1.1, ry);
        break;
      default: {
        B.box(w + 0.1, h + 0.06, 0.05, M.marble, x + dx * 0.4, y, z + dz * 0.4, ry);
        B.box(w, h, 0.05, M.door, x + dx, y, z + dz, ry);
        const arch = cylGeo(w / 2, w / 2, 0.05, 14); arch.rotateX(Math.PI / 2); if (face === 'x') arch.rotateY(Math.PI / 2);
        B.add(arch, M.door, x + dx, y + h, z + dz);
      }
    }
  }

  window(B, { x, y, z, face = 'z', w = 0.15, h = 0.2 }) {
    const M = this.M, ry = face === 'x' ? Math.PI / 2 : 0;
    const dz = face === 'z' ? 0.015 : 0, dx = face === 'x' ? 0.015 : 0;
    if (this.K.door === 'trap') { B.add(taperBox(w, h, 0.04, 0.3, 0), M.slit, x + dx, y + h / 2, z + dz, ry); return; }
    if (this.civ === 'japonais') {
      B.box(w + 0.04, h + 0.04, 0.03, M.blackwood, x + dx * 0.5, y - 0.02, z + dz * 0.5, ry);
      B.box(w, h, 0.03, M.glass, x + dx, y, z + dz, ry);
      for (let k = 1; k < 3; k++) B.box(w, 0.012, 0.035, M.blackwood, x + dx * 1.3, y + k * h / 3, z + dz * 1.3, ry);
      return;
    }
    B.box(w + 0.05, h + 0.05, 0.03, this.civ === 'romains' ? M.marble : M.beam, x + dx * 0.5, y - 0.025, z + dz * 0.5, ry);
    B.box(w, h, 0.03, M.glass, x + dx, y, z + dz, ry);
  }

  // toit dans le style de la civilisation
  roof(B, cx, cz, w, d, y, o = {}) {
    const K = this.K, M = this.M;
    const h = (o.h ?? Math.min(w, d) * 0.5 * K.pitch);
    const ov = o.ov ?? 0.16;
    switch (K.roof) {
      case 'hip': {
        const mat = this.mat(o.mat || K.roofMat);
        B.add(hipGeo(w + ov * 2, d + ov * 2, h), mat, cx, y, cz);
        if (this.civ === 'incas') B.add(hipGeo(w + ov * 2 + 0.04, d + ov * 2 + 0.04, 0.12), mat, cx, y - 0.04, cz);
        break;
      }
      case 'curved': {
        const mat = this.mat(o.mat || K.roofMat);
        // pans principaux + avancée relevée (évoque les toits incurvés)
        B.add(hipGeo(w + 0.1, d + 0.1, h), mat, cx, y + 0.06, cz);
        B.add(hipGeo(w + 0.75, d + 0.75, h * 0.42), mat, cx, y - 0.04, cz);
        const L = Math.max(w, d) - Math.min(w, d) + 0.1;
        B.box(w >= d ? L : 0.07, 0.07, w >= d ? 0.07 : L, M.blackwood, cx, y + 0.06 + h - 0.02, cz);
        for (const s of [-1, 1]) {
          const ex = w >= d ? s * L / 2 : 0, ez = w >= d ? 0 : s * L / 2;
          B.add(coneGeo(0.05, 0.16, 6), M.gold, cx + ex, y + 0.06 + h + 0.08, cz + ez);
        }
        // coins relevés
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const g = boxGeo(0.07, 0.05, 0.3); g.rotateX(-0.5); g.rotateY(Math.atan2(sx, sz));
          B.add(g, mat, cx + sx * (w / 2 + 0.4), y + 0.02, cz + sz * (d / 2 + 0.4));
        }
        break;
      }
      case 'flat': {
        B.box(w + 0.1, 0.07, d + 0.1, this.mat(K.mason), cx, y, cz);
        if (o.parapet !== false) {
          for (const [px, pz, pw, pd] of [[cx, cz + d / 2, w + 0.1, 0.06], [cx, cz - d / 2, w + 0.1, 0.06], [cx + w / 2, cz, 0.06, d + 0.1], [cx - w / 2, cz, 0.06, d + 0.1]]) B.box(pw, 0.1, pd, this.mat(K.mason), px, y + 0.07, pz);
        }
        if (o.canopy) {
          for (const [px, pz] of [[cx - w * 0.3, cz - d * 0.3], [cx + w * 0.3, cz - d * 0.3], [cx + w * 0.3, cz + d * 0.3], [cx - w * 0.3, cz + d * 0.3]]) B.box(0.05, 0.4, 0.05, M.log, px, y + 0.07, pz);
          B.box(w * 0.7, 0.03, d * 0.7, M.canvas, cx, y + 0.47, cz);
        }
        break;
      }
      case 'gable':
      default: {
        const mat = this.mat(o.mat || K.roofMat);
        const along = o.alongZ;
        const g = gableGeo(w + ov * 2, d + ov * 2, h, 1.2);
        B.add(g, mat, cx, y, cz, along ? Math.PI / 2 : 0);
        // pignons
        for (const end of [1, -1]) {
          const ge = gableEndGeo(d - 0.02, h - 0.04, 1);
          if (along) ge.rotateY(Math.PI / 2);
          const ry = along ? (end > 0 ? Math.PI : 0) : (end > 0 ? 0 : Math.PI);
          B.add(ge, this.mat(K.wall), cx + (along ? 0 : end * w / 2), y, cz + (along ? end * w / 2 : 0), ry);
        }
        B.box(along ? 0.07 : w + ov * 2, 0.07, along ? w + ov * 2 : 0.07, M.beam, cx, y + h - 0.03, cz);
        if (K.dragons) {
          // planches croisées et têtes de dragon aux extrémités du faîtage
          for (const end of [1, -1]) {
            const ex = along ? 0 : end * (w / 2 + ov), ez = along ? end * (w / 2 + ov) : 0;
            for (const s of [1, -1]) {
              const b = boxGeo(0.05, 0.55, 0.05);
              if (along) b.rotateX(s * 0.6); else b.rotateZ(s * 0.6);
              B.add(b, M.darkwood, cx + ex, y + h + 0.12, cz + ez);
            }
            const head = coneGeo(0.06, 0.24, 6); head.rotateZ(along ? 0 : -end * 1.2); head.rotateX(along ? end * 1.2 : 0);
            B.add(head, M.darkwood, cx + ex * 1.04, y + h + 0.36, cz + ez * 1.04);
          }
        }
      }
    }
    return h;
  }

  // tour défensive dans le style
  tower(B, cx, cz, size, h, o = {}) {
    const M = this.M, K = this.K, team = this.team;
    switch (K.tower) {
      case 'square': {
        B.box(size, h, size, M.stucco, cx, 0, cz);
        B.box(size + 0.08, 0.1, size + 0.08, M.marble, cx, h - 0.05, cz);
        crenels(B, M.marble, cx, cz, size + 0.08, size + 0.08, h + 0.05, 0.1);
        B.box(size + 0.02, 0.06, size + 0.02, team.cloth, cx, h - 0.15, cz);
        if (o.roof !== false) B.add(hipGeo(size * 0.9, size * 0.9, size * 0.45), M.tile, cx, h + 0.17, cz);
        for (const yy of [h * 0.4, h * 0.65]) B.box(0.05, 0.16, 0.02, M.slit, cx, yy, cz + size / 2 + 0.01);
        break;
      }
      case 'pylon': {
        B.add(taperBox(size, h, size, 0.2), M.sandstone, cx, h / 2, cz);
        B.box(size * 0.8 + 0.14, 0.12, size * 0.8 + 0.14, M.sandstone, cx, h, cz);
        B.box(size * 0.8 + 0.08, 0.05, size * 0.8 + 0.08, team.cloth, cx, h - 0.06, cz);
        for (const yy of [h * 0.45, h * 0.7]) B.add(taperBox(0.05, 0.16, 0.02, 0.3, 0), M.slit, cx, yy + 0.08, cz + size * (0.5 - 0.1 * yy / h) + 0.005);
        break;
      }
      case 'round': {
        B.add(cylGeo(size * 0.45, size * 0.52, h, 14, 1.4), M.ashlar, cx, h / 2, cz);
        B.add(cylGeo(size * 0.5, size * 0.5, 0.06, 14), team.cloth, cx, h - 0.05, cz);
        if (o.roof !== false) B.add(coneGeo(size * 0.62, size * 0.8, 14, 1.4), M.thatch, cx, h + size * 0.4, cz);
        break;
      }
      case 'yagura': {
        B.add(taperBox(size + 0.2, h * 0.35, size + 0.2, 0.15), M.darkstone, cx, h * 0.175, cz);
        const sty = new Style('japonais', M, team);
        sty.body(B, cx, cz, size * 0.85, h * 0.4, size * 0.85, h * 0.35);
        sty.roof(B, cx, cz, size * 0.85, size * 0.85, h * 0.75, { h: size * 0.35 });
        if (o.roof !== false) {
          sty.body(B, cx, cz, size * 0.6, h * 0.22, size * 0.6, h * 0.82);
          sty.roof(B, cx, cz, size * 0.6, size * 0.6, h * 1.04, { h: size * 0.3 });
        }
        break;
      }
      case 'wood':
      default: {
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(cylGeo(0.06, 0.07, h, 7, 2), M.log, cx + x * size * 0.4, h / 2, cz + z * size * 0.4);
        B.box(size * 0.8, h * 0.35, size * 0.8, M.logs, cx, h * 0.62, cz);
        B.box(size + 0.05, 0.07, size + 0.05, M.planks, cx, h * 0.6, cz);
        if (o.roof !== false) B.add(pyramidGeo(size * 0.95, size * 0.95, size * 0.85, 1.5), M.shingle, cx, h * 0.97, cz);
      }
    }
  }
}

export function civStyle(civ, M, team) { return new Style(KITS[civ] ? civ : 'francs', M, team); }

// ------------------------------------------------------------------ bâtiments des civilisations
export function civBuildingModel(type, s, M, team, civ) {
  const S = new Style(civ, M, team), K = S.K;
  const B = new Builder(M);
  const c = s / 2;
  const anim = S.anim;
  const flagAnim = (x, z, h, y = 0) => S.banner(B, x, z, h, y);
  switch (type) {
    case 'house': {
      S.plinth(B, c, 1.62, 1.42);
      if (civ === 'egyptiens') {
        S.body(B, c, c, 1.4, 0.8, 1.2, 0.14, { door: { x: c - 0.3, y: 0.14, z: c + 0.6 * 0.95 }, windows: [{ x: c + 0.66, y: 0.5, z: c, face: 'x' }] });
        S.roof(B, c, c, 1.26, 1.08, 0.94, { canopy: true });
        for (let i = 0; i < 3; i++) B.box(0.3, 0.06, 0.2, M.sandstone, c + 0.6 - i * 0.22, 0.14 + i * 0.27, c - 0.75);
        for (const [x, z] of [[c + 0.78, c + 0.72], [c + 0.62, c + 0.82]]) B.add(displaced(new THREE.SphereGeometry(0.1, 10, 8), 0.05, 7).scale(1, 1.5, 1), M.clay, x, 0.15, z);
      } else if (civ === 'japonais') {
        S.body(B, c, c, 1.36, 0.62, 1.16, 0.22, { door: { x: c - 0.25, y: 0.22, z: c + 0.59 }, windows: [{ x: c + 0.69, y: 0.45, z: c, face: 'x' }] });
        B.box(1.5, 0.05, 0.3, M.darkwood, c, 0.18, c + 0.72);
        S.roof(B, c, c, 1.36, 1.16, 0.84, { h: 0.4 });
      } else if (civ === 'vikings') {
        S.body(B, c, c, 1.5, 0.55, 1.05, 0.14, { door: { x: c - 0.35, y: 0.14, z: c + 0.53, h: 0.4 }, shields: false });
        S.roof(B, c, c, 1.5, 1.05, 0.69, { mat: 'thatch', h: 0.75, ov: 0.22 });
        anim.smoke.push([c + 0.1, 1.5, c]);
      } else {
        S.body(B, c, c, 1.4, 0.75, 1.2, 0.14, { door: { x: c - 0.3, y: 0.14, z: c + 0.6 * (1 - (K.taper || 0) * 0.5) }, windows: [{ x: c + 0.35, y: 0.45, z: c + 0.6 * (1 - (K.taper || 0) * 0.5), face: 'z' }, { x: c + 0.7 * (1 - (K.taper || 0) * 0.5), y: 0.45, z: c, face: 'x' }] });
        S.roof(B, c, c, 1.4 * (1 - (K.taper || 0)), 1.2 * (1 - (K.taper || 0)), 0.89);
      }
      barrel(B, M, c + 0.75, c + 0.78);
      break;
    }
    case 'town_center': townCenter(S, B, M, team, civ, c); break;
    case 'mill': {
      S.plinth(B, c, 1.7, 1.7);
      if (civ === 'egyptiens') {
        for (const [x, z, r] of [[c - 0.35, c - 0.3, 0.32], [c + 0.35, c - 0.3, 0.3], [c, c + 0.35, 0.34]]) {
          B.add(cylGeo(r, r * 1.05, 0.7, 14, 1.4), M.mudbrick, x, 0.14 + 0.35, z);
          B.add(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.mudbrick, x, 0.84, z);
        }
        B.box(0.7, 0.04, 0.4, M.sandstone, c + 0.4, 0.14, c + 0.55);
      } else if (civ === 'incas') {
        for (const [x, z] of [[c - 0.38, c - 0.1], [c + 0.38, c + 0.12]]) {
          B.add(cylGeo(0.3, 0.33, 0.6, 14, 1.4), M.ashlar, x, 0.14 + 0.3, z);
          B.add(coneGeo(0.42, 0.6, 14, 1.4), M.thatch, x, 0.74 + 0.3, z);
          B.add(taperBox(0.14, 0.24, 0.04, 0.3, 0), M.slit, x, 0.3, z + 0.31);
        }
      } else {
        S.body(B, c, c, 1.25, 0.8, 1.1, 0.14, { door: { x: c, y: 0.14, z: c + 0.55, w: 0.36 } });
        S.roof(B, c, c, 1.25, 1.1, 0.94);
      }
      for (const [x, z] of [[c + 0.85, c - 0.3], [c + 0.75, c - 0.55]]) B.add(displaced(new THREE.SphereGeometry(0.13, 10, 8), 0.12, 3), M.sack, x, 0.13, z);
      break;
    }
    case 'lumber_camp':
    case 'mining_camp': {
      S.plinth(B, c, 1.7, 1.6, 0.08);
      for (const [x, z] of [[0.25, 0.3], [1.75, 0.3], [1.75, 1.5], [0.25, 1.5]]) B.box(0.09, 0.9, 0.09, civ === 'japonais' ? M.blackwood : M.log, x, 0.08, z);
      B.box(1.55, 0.6, 0.06, civ === 'egyptiens' ? M.mudbrick : civ === 'incas' ? M.ashlar : civ === 'vikings' ? M.logs : M.planks, c, 0.08, 0.28);
      S.roof(B, c, 0.9, 1.6, 1.3, 0.98, { h: K.roof === 'flat' ? 0 : 0.45, parapet: false });
      if (type === 'lumber_camp') { logPile(B, M, 0.95, 0.85, 9); logPile(B, M, 1.6, 0.6, 3); }
      else {
        B.box(0.5, 0.22, 0.34, M.planks, 1.0, 0.16, 0.95);
        for (let i = 0; i < 6; i++) B.add(displaced(new THREE.IcosahedronGeometry(0.07, 0), 0.2, i), i % 2 ? M.ore : M.rock, 0.88 + (i % 3) * 0.11, 0.42, 0.88 + Math.floor(i / 3) * 0.14);
        for (let i = 0; i < 5; i++) B.box(0.18, 0.12, 0.14, S.mat(K.mason), 1.55 + (i % 2) * 0.05, 0.1 + Math.floor(i / 2) * 0.12, 0.6 + (i % 3) * 0.16, i);
      }
      flagAnim(1.85, 1.65, 1.2);
      break;
    }
    case 'barracks': {
      S.plinth(B, c, 2.75, 2.5, 0.16);
      S.body(B, c, c - 0.35, 2.4, 1.05, 1.6, 0.16, {
        door: { x: c - 0.4, y: 0.16, z: c - 0.35 + 0.8 * (1 - (K.taper || 0) * 0.5), w: 0.34, h: 0.5 },
        windows: [-0.8, 0.2, 0.8].map((t) => ({ x: c + t, y: 0.6, z: c - 0.35 + 0.8 * (1 - (K.taper || 0) * 0.5), face: 'z', w: 0.13, h: 0.24 })),
      });
      S.roof(B, c, c - 0.35, 2.4 * (1 - (K.taper || 0)), 1.6 * (1 - (K.taper || 0)), 1.21);
      if (civ === 'romains') for (let i = 0; i < 5; i++) { const x = c - 1.0 + i * 0.5; B.add(cylGeo(0.06, 0.07, 1.0, 10), M.marble, x, 0.16 + 0.5, c + 0.62); }
      B.box(2.6, 0.03, 0.9, M.paving, c, 0.0, c + 0.95);
      B.box(0.06, 0.55, 0.06, M.log, c + 0.75, 0, c + 1.0); B.box(0.32, 0.05, 0.05, M.log, c + 0.75, 0.42, c + 1.0);
      B.add(displaced(new THREE.SphereGeometry(0.11, 10, 8), 0.1, 5).scale(1, 1.4, 1), M.sack, c + 0.75, 0.38, c + 1.0);
      for (let i = 0; i < 4; i++) { const sp = cylGeo(0.012, 0.012, 0.8, 5); sp.rotateX(-0.25); B.add(sp, M.beam, c - 1.0 + i * 0.12, 0.38, c + 1.15); }
      flagAnim(c - 1.25, c + 1.35, 1.3); flagAnim(c + 1.3, c + 1.35, 1.3);
      break;
    }
    case 'archery_range': {
      S.plinth(B, c, 2.7, 2.7, 0.06);
      S.body(B, 0.85, 0.85, 1.25, 0.78, 1.25, 0.06, { door: { x: 0.85, y: 0.06, z: 0.85 + 0.62 * (1 - (K.taper || 0) * 0.5), w: 0.26, h: 0.42 } });
      S.roof(B, 0.85, 0.85, 1.25 * (1 - (K.taper || 0)), 1.25 * (1 - (K.taper || 0)), 0.84);
      fence(B, M, [[0.15, 2.85], [2.85, 2.85], [2.85, 0.15]]);
      for (const [x, z] of [[2.35, 1.0], [2.35, 2.0], [1.4, 2.35]]) {
        B.box(0.05, 0.5, 0.05, M.log, x - 0.12, 0, z - 0.05); B.box(0.05, 0.5, 0.05, M.log, x + 0.12, 0, z - 0.05);
        [[0.24, M.targetWhite], [0.18, M.targetRed], [0.11, M.targetWhite], [0.05, M.targetGold]].forEach(([r, m], i) => { const g = cylGeo(r, r, 0.04 + i * 0.005, 18); g.rotateX(Math.PI / 2); g.rotateY(-0.6); B.add(g, m, x, 0.5, z + i * 0.004); });
      }
      hay(B, M, 1.9, 0.45);
      flagAnim(0.2, 1.7, 1.3);
      break;
    }
    case 'stable': {
      S.plinth(B, c, 2.8, 2.4, 0.08);
      S.body(B, c, c - 0.5, 2.5, 0.88, 1.4, 0.08, { shields: civ !== 'vikings' ? undefined : true });
      for (const t of [-0.85, 0, 0.85]) B.box(0.36, 0.48, 0.04, M.darkwood, c + t, 0.08, c - 0.5 + 0.7 * (1 - (K.taper || 0) * 0.5) + 0.02);
      S.roof(B, c, c - 0.5, 2.5 * (1 - (K.taper || 0)), 1.4 * (1 - (K.taper || 0)), 0.96, { mat: civ === 'romains' ? 'tile' : K.roof === 'hip' || K.roof === 'gable' ? 'thatch' : undefined });
      fence(B, M, [[0.2, 2.85], [2.8, 2.85], [2.8, 1.1]]);
      hay(B, M, 2.4, 1.4); hay(B, M, 2.2, 1.6, 0.8); hay(B, M, 0.5, 2.4, 0.3);
      flagAnim(0.25, 2.5, 1.3);
      break;
    }
    case 'blacksmith': {
      S.plinth(B, c, 2.6, 2.5, 0.14);
      S.body(B, c - 0.1, c - 0.3, 2.1, 0.95, 1.6, 0.14, { door: { x: c - 0.6, y: 0.14, z: c - 0.3 + 0.8 * (1 - (K.taper || 0) * 0.5), w: 0.32, h: 0.5 }, windows: [{ x: c + 0.3, y: 0.55, z: c - 0.3 + 0.8 * (1 - (K.taper || 0) * 0.5), face: 'z' }] });
      S.roof(B, c - 0.1, c - 0.3, 2.1 * (1 - (K.taper || 0)), 1.6 * (1 - (K.taper || 0)), 1.09);
      B.box(0.4, 2.2, 0.4, S.mat(K.mason), c + 0.55, 0.14, c - 0.75);
      anim.smoke.push([c + 0.55, 2.55, c - 0.75]);
      B.box(0.45, 0.35, 0.4, S.mat(K.mason), c + 0.85, 0, c + 0.9);
      B.box(0.3, 0.05, 0.25, M.embers, c + 0.85, 0.35, c + 0.9);
      anim.forge = [c + 0.85, 0.45, c + 0.9];
      B.box(0.14, 0.18, 0.1, M.darkwood, c + 0.3, 0, c + 1.05); B.box(0.22, 0.07, 0.1, M.iron, c + 0.3, 0.18, c + 1.05);
      barrel(B, M, c - 1.05, c + 0.9); crate(B, M, c - 0.75, c + 1.05);
      flagAnim(c - 1.2, c + 1.2, 1.2);
      break;
    }
    case 'market': {
      S.plinth(B, c, 2.8, 2.8, 0.08);
      S.body(B, 0.95, 0.95, 1.4, 0.8, 1.4, 0.08, { door: { x: 0.95, y: 0.08, z: 0.95 + 0.7 * (1 - (K.taper || 0) * 0.5) } });
      S.roof(B, 0.95, 0.95, 1.4 * (1 - (K.taper || 0)), 1.4 * (1 - (K.taper || 0)), 0.88);
      const stall = (x, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
        for (const [px, pz] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.25], [0.32, 0.25]]) { const m = new THREE.Mesh(boxGeo(0.04, 0.62, 0.04), M.log); m.position.set(px, 0.31, pz); m.castShadow = true; g.add(m); }
        const table = new THREE.Mesh(boxGeo(0.66, 0.05, 0.36), M.planks); table.position.set(0, 0.3, 0); table.castShadow = true; g.add(table);
        for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(boxGeo(0.12, 0.015, 0.58), i % 2 ? M.canvas : team.cloth); st.position.set(-0.3 + i * 0.12, 0.66, 0.02); st.rotation.x = 0.28; st.castShadow = true; g.add(st); }
        [M.fruit, M.ore, M.sack, M.clay].forEach((gm, i) => { const m = new THREE.Mesh(displaced(new THREE.IcosahedronGeometry(0.055, 1), 0.1, i), gm); m.position.set(-0.22 + i * 0.15, 0.37, -0.02); g.add(m); });
        return g;
      };
      B.object(stall(2.25, 1.2, -Math.PI / 2)); B.object(stall(1.3, 2.3, 0)); B.object(stall(2.3, 2.3, -Math.PI / 4));
      barrel(B, M, 0.4, 2.4); crate(B, M, 0.65, 2.55);
      break;
    }
    case 'tower': {
      S.plinth(B, c, 0.95, 0.95, 0.1);
      S.tower(B, c, c, 0.78, 2.5);
      flagAnim(c + 0.3, c + 0.3, 0.7, K.tower === 'yagura' ? 2.9 : 2.6);
      break;
    }
    case 'siege_workshop': {
      S.plinth(B, c, 2.75, 2.6, 0.08);
      S.body(B, c - 0.1, c - 0.3, 2.3, 1.2, 1.7, 0.08, { shields: false });
      B.box(0.9, 0.85, 0.05, M.darkwood, c - 0.1, 0.08, c - 0.3 + 0.85 * (1 - (K.taper || 0) * 0.5) + 0.02);
      S.roof(B, c - 0.1, c - 0.3, 2.3 * (1 - (K.taper || 0)), 1.7 * (1 - (K.taper || 0)), 1.28);
      B.box(0.1, 2.1, 0.1, M.log, c + 1.2, 0, c + 0.9);
      B.beam([c + 1.2, 2.05, c + 0.9], [c + 0.3, 1.75, c + 1.25], 0.07, M.log);
      B.beam([c + 0.3, 1.75, c + 1.25], [c + 0.3, 0.9, c + 1.25], 0.012, M.rope);
      const wh = new THREE.TorusGeometry(0.22, 0.035, 6, 16); wh.rotateY(0.7); B.add(wh, M.darkwood, c - 0.8, 0.26, c + 1.1);
      logPile(B, M, c + 0.3, c + 1.0, 5);
      flagAnim(c - 1.25, c + 1.25, 1.4);
      break;
    }
    case 'fortress': fortress(S, B, M, team, civ, c); break;
    default: break;
  }
  const grp = B.build();
  grp.anim = anim;
  return grp;
}

function townCenter(S, B, M, team, civ, c) {
  const flag = (x, z, h, y = 0) => S.banner(B, x, z, h, y);
  switch (civ) {
    case 'romains': {
      // temple sur podium, colonnade et fronton
      B.box(3.7, 0.9, 3.7, M.marble, c, -0.4, c);
      B.box(3.72, 0.06, 3.72, team.cloth, c, 0.36, c);
      for (let i = 0; i < 4; i++) B.box(1.3, 0.12, 0.25, M.marble, c, 0.5 - i * 0.12 - 0.12, 3.72 + i * 0.12 - 0.05);
      S.body(B, c, c - 0.25, 1.9, 1.45, 2.3, 0.5, { door: { x: c, y: 0.5, z: c - 0.25 + 1.15, w: 0.42, h: 0.7 } });
      const colY = 0.5, colH = 1.45;
      const cols = [];
      for (let i = 0; i < 6; i++) cols.push([c - 1.25 + i * 0.5, c + 1.45]);
      for (let k = 0; k < 4; k++) { cols.push([c - 1.25, c - 1.2 + k * 0.7]); cols.push([c + 1.25, c - 1.2 + k * 0.7]); }
      for (const [x, z] of cols) {
        B.add(cylGeo(0.085, 0.1, colH - 0.16, 12, 2), M.marble, x, colY + 0.08 + (colH - 0.16) / 2, z);
        B.box(0.24, 0.08, 0.24, M.marble, x, colY, z); B.box(0.26, 0.08, 0.26, M.marble, x, colY + colH - 0.08, z);
      }
      B.box(2.75, 0.2, 3.1, M.marble, c, colY + colH, c + 0.1);
      B.box(2.77, 0.06, 3.12, team.cloth, c, colY + colH + 0.07, c + 0.1);
      // toit à deux pans perpendiculaire (fronton côté avant)
      const g = gableGeo(3.2, 2.9, 0.75, 1.2); g.rotateY(Math.PI / 2);
      B.add(g, M.tile, c, colY + colH + 0.2, c + 0.1);
      for (const end of [1, -1]) {
        const ge = gableEndGeo(2.75, 0.72, 1); ge.rotateY(Math.PI / 2);
        B.add(ge, M.marble, c, colY + colH + 0.2, c + 0.1 + end * 1.55, end > 0 ? Math.PI : 0);
      }
      B.add(new THREE.OctahedronGeometry(0.12, 0), M.gold, c, colY + colH + 1.05, c + 1.62);
      for (const x of [c - 1.7, c + 1.7]) flag(x, c + 1.75, 1.6, 0.5);
      break;
    }
    case 'egyptiens': {
      S.plinth(B, c, 3.9, 3.9, 0.08);
      // salle hypostyle
      B.add(taperBox(3.3, 1.25, 2.1, 0.04), M.sandstone, c, 0.08 + 0.625, c - 0.75);
      B.box(3.4, 0.1, 2.2, M.sandstone, c, 1.33, c - 0.75);
      B.box(3.32, 0.05, 2.12, team.cloth, c, 1.27, c - 0.75);
      for (let i = 0; i < 5; i++) { const x = c - 1.3 + i * 0.65; B.add(cylGeo(0.11, 0.13, 1.0, 12, 2), M.sandstone, x, 0.08 + 0.5, c + 0.42); B.add(coneGeo(0.2, 0.18, 12), M.gold, x, 1.17, c + 0.42); }
      // pylônes et porte
      for (const x of [c - 1.25, c + 1.25]) {
        B.add(taperBox(1.25, 2.3, 0.75, 0.2, 0.15), M.sandstone, x, 0.08 + 1.15, c + 1.25);
        B.box(1.1, 0.14, 0.7, M.sandstone, x, 2.38, c + 1.25);
        B.box(1.04, 0.06, 0.66, team.cloth, x, 2.3, c + 1.25);
        B.box(0.7, 0.04, 0.02, M.gold, x, 1.6, c + 1.25 + 0.34);
        flag(x - 0.35, c + 1.68, 2.7); flag(x + 0.35, c + 1.68, 2.7);
      }
      B.box(1.3, 1.5, 0.6, M.sandstone, c, 0.08, c + 1.25);
      B.box(1.36, 0.1, 0.64, M.sandstone, c, 1.58, c + 1.25);
      B.add(taperBox(0.55, 1.15, 0.05, 0.12, 0), M.slit, c, 0.08 + 0.575, c + 1.56);
      // obélisques
      for (const x of [c - 1.75, c + 1.75]) {
        B.box(0.32, 0.12, 0.32, M.sandstone, x, 0.08, c + 1.75);
        B.add(taperBox(0.2, 1.7, 0.2, 0.35), M.sandstone, x, 0.2 + 0.85, c + 1.75);
        B.add(pyramidGeo(0.14, 0.14, 0.16, 1), M.gold, x, 1.9, c + 1.75);
      }
      break;
    }
    case 'incas': {
      // plateforme à degrés (ushnu)
      B.box(3.85, 0.75, 3.85, M.ashlar, c, -0.4, c);
      B.box(3.1, 0.35, 3.1, M.ashlar, c, 0.35, c);
      B.box(2.35, 0.35, 2.35, M.ashlar, c, 0.7, c);
      B.box(3.87, 0.06, 3.87, team.cloth, c, 0.28, c); B.box(3.12, 0.05, 3.12, team.cloth, c, 0.62, c);
      for (let i = 0; i < 6; i++) B.box(0.8, 0.12, 0.26, M.ashlar, c, 0.35 + i * 0.12 - 0.36, c + 1.93 - i * 0.13 + 0.12);
      S.body(B, c, c - 0.15, 1.75, 0.95, 1.35, 1.05, { door: { x: c, y: 1.05, z: c - 0.15 + 0.66, w: 0.34, h: 0.55 }, windows: [{ x: c + 0.86, y: 1.4, z: c - 0.15, face: 'x', w: 0.14, h: 0.2 }] });
      S.roof(B, c, c - 0.15, 1.65, 1.28, 2.0, { h: 1.0, ov: 0.2 });
      const sun = cylGeo(0.24, 0.24, 0.04, 20); sun.rotateX(Math.PI / 2); B.add(sun, M.gold, c, 1.78, c - 0.15 + 0.72);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const ray = boxGeo(0.04, 0.14, 0.03); ray.rotateZ(-a); B.add(ray, M.gold, c + Math.sin(a) * 0.32, 1.78 + Math.cos(a) * 0.32, c - 0.15 + 0.72); }
      for (const [x, z] of [[c - 1.05, c + 1.05], [c + 1.05, c + 1.05], [c - 1.05, c - 1.05], [c + 1.05, c - 1.05]]) flag(x, z, 1.1, 1.05);
      break;
    }
    case 'japonais': {
      // château à trois étages sur base de pierre talutée
      B.add(taperBox(3.6, 0.95, 3.4, 0.12), M.darkstone, c, 0.475 - 0.1, c);
      for (const [x, z, w, d] of [[c, c + 1.52, 3.2, 0.05], [c, c - 1.52, 3.2, 0.05], [c + 1.6, c, 0.05, 3.0], [c - 1.6, c, 0.05, 3.0]]) B.box(w, 0.05, d, team.cloth, x, 0.8, z);
      const sty = S;
      sty.body(B, c, c, 2.5, 0.85, 2.2, 0.86, { windows: [-0.7, 0, 0.7].map((t) => ({ x: c + t, y: 1.15, z: c + 1.11, face: 'z' })), door: { x: c, y: 0.86, z: c + 1.11, w: 0.36, h: 0.5 } });
      sty.roof(B, c, c, 2.5, 2.2, 1.71, { h: 0.5 });
      sty.body(B, c, c, 1.85, 0.7, 1.6, 2.15, { windows: [-0.45, 0.45].map((t) => ({ x: c + t, y: 2.4, z: c + 0.81, face: 'z' })) });
      sty.roof(B, c, c, 1.85, 1.6, 2.85, { h: 0.42 });
      sty.body(B, c, c, 1.2, 0.6, 1.05, 3.22, { windows: [{ x: c, y: 3.42, z: c + 0.53, face: 'z' }] });
      sty.roof(B, c, c, 1.2, 1.05, 3.82, { h: 0.5 });
      for (const [x, z] of [[c - 1.65, c + 1.55], [c + 1.65, c + 1.55]]) flag(x, z, 1.7, 0);
      break;
    }
    case 'vikings': {
      S.plinth(B, c, 3.9, 3.0, 0.1);
      // grande halle
      S.body(B, c, c - 0.2, 3.5, 0.9, 1.7, 0.1, { door: { x: c, y: 0.1, z: c - 0.2 + 0.85, w: 0.42, h: 0.62 } });
      S.roof(B, c, c - 0.2, 3.5, 1.7, 1.0, { h: 1.45, ov: 0.25 });
      // annexe
      S.body(B, c + 1.2, c + 1.35, 1.1, 0.6, 0.9, 0.1, { shields: false });
      S.roof(B, c + 1.2, c + 1.35, 1.1, 0.9, 0.7, { h: 0.6, mat: 'thatch' });
      for (const x of [c - 0.32, c + 0.32]) { B.add(cylGeo(0.06, 0.07, 1.0, 8, 2), M.darkwood, x, 0.6, c + 0.7); B.add(coneGeo(0.08, 0.2, 6), M.darkwood, x, 1.2, c + 0.7); }
      S.anim.smoke.push([c, 2.7, c - 0.2]);
      flag(c - 1.7, c + 1.4, 1.6); flag(c - 0.9, c + 1.6, 1.6);
      logPile(B, M, c - 1.3, c + 1.05, 6);
      break;
    }
    default:
  }
}

function fortress(S, B, M, team, civ, c) {
  const K = S.K;
  S.plinth(B, c, 3.95, 3.95, 0.1);
  const e = 3.5, x0 = c - e / 2, x1 = c + e / 2, wallH = 1.25, t = 0.3;
  const wallMat = civ === 'vikings' ? M.logs : civ === 'japonais' ? M.whiteplaster : S.mat(K.mason);
  // donjon
  if (civ === 'japonais') {
    S.body(B, c - 0.1, c - 0.1, 1.6, 0.9, 1.6, 0.1); S.roof(B, c - 0.1, c - 0.1, 1.6, 1.6, 1.0, { h: 0.45 });
    S.body(B, c - 0.1, c - 0.1, 1.15, 0.7, 1.15, 1.42); S.roof(B, c - 0.1, c - 0.1, 1.15, 1.15, 2.12, { h: 0.45 });
  } else if (civ === 'vikings') {
    S.body(B, c - 0.1, c - 0.1, 2.0, 0.9, 1.3, 0.1); S.roof(B, c - 0.1, c - 0.1, 2.0, 1.3, 1.0, { h: 1.1 });
  } else {
    if (K.taper) B.add(taperBox(1.7, 2.6, 1.7, K.taper * 1.5), S.mat(K.mason), c - 0.1, 0.1 + 1.3, c - 0.1);
    else B.box(1.7, 2.6, 1.7, S.mat(K.mason), c - 0.1, 0.1, c - 0.1);
    B.box(1.75, 0.07, 1.75, team.cloth, c - 0.1, 2.45, c - 0.1);
    if (K.roof === 'hip') S.roof(B, c - 0.1, c - 0.1, 1.6, 1.6, 2.7, { h: civ === 'incas' ? 0.9 : 0.45 });
    else { B.box(1.85, 0.1, 1.85, S.mat(K.mason), c - 0.1, 2.7, c - 0.1); crenels(B, S.mat(K.mason), c - 0.1, c - 0.1, 1.85, 1.85, 2.8, 0.16); }
  }
  S.banner(B, c - 0.1, c - 0.1, 1.0, civ === 'japonais' ? 2.55 : civ === 'vikings' ? 2.3 : 2.9);
  // courtines
  const wall = (w, d, x, z) => {
    if (civ === 'vikings') {
      const n = Math.round(Math.max(w, d) / 0.13);
      for (let i = 0; i < n; i++) {
        const px = w > d ? x - w / 2 + (i + 0.5) * w / n : x, pz = w > d ? z : z - d / 2 + (i + 0.5) * d / n;
        B.add(cylGeo(0.065, 0.07, wallH + 0.1, 7, 2), M.log, px, (wallH + 0.1) / 2, pz);
        B.add(coneGeo(0.07, 0.16, 7), M.log, px, wallH + 0.18, pz);
      }
      return;
    }
    B.box(w, wallH, d, wallMat, x, 0.1, z);
    if (civ === 'japonais') { B.add(gableGeo(w > d ? w + 0.05 : d + 0.05, 0.5, 0.2), M.kawara, x, 0.1 + wallH, z, w > d ? 0 : Math.PI / 2); B.box(w > d ? w : 0.31, 0.35, w > d ? 0.31 : d, M.darkstone, x, 0.1, z); }
    else crenels(B, S.mat(K.mason), x, z, w, d, 0.1 + wallH, 0.15);
    B.box(w + 0.02, 0.07, d + 0.02, team.cloth, x, 0.32, z);
  };
  wall(e, t, c, x0 + t / 2); wall(e, t, c, x1 - t / 2); wall(t, e, x0 + t / 2, c); wall(t, e, x1 - t / 2, c);
  B.box(0.62, 0.78, 0.06, M.gate, c, 0.1, x1 + 0.01);
  for (const [x, z] of [[x0, x0], [x1, x0], [x0, x1], [x1, x1]]) { B.box(0.95, 0.12, 0.95, S.mat(K.mason), x, 0, z); S.tower(B, x, z, 0.85, 1.95); }
  S.banner(B, x1 + 0.12, x1 + 0.25, 1.1);
}

// muraille de pierre selon le style (matériau)
export function civWallMaterial(civ, M) {
  if (!civ || civ === 'francs') return M.darkstone;
  return M[KITS[civ].mason] || M.darkstone;
}
