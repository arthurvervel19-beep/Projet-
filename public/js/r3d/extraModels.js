// Bâtiments des âges avancés et merveilles des civilisations.
import * as THREE from 'three';
import {
  Builder, boxGeo, cylGeo, coneGeo, gableGeo, gableEndGeo, pyramidGeo, displaced, makeBanner,
  barrel, crate, logPile, crenels,
} from './models.js';
import { KITS, taperBox, hipGeo, civStyle } from './civstyles.js';

export const EXTRA_TYPES = new Set(['university', 'bank', 'factory', 'bunker', 'airfield', 'laser_turret', 'space_program', 'wonder']);

export function extraBuildingModel(type, s, M, team, civ) {
  const B = new Builder(M);
  const c = s / 2;
  const S = civStyle(civ, M, team);
  const anim = S.anim;
  const K = KITS[civ] || KITS.francs;
  const taper = K.taper || 0;
  const banner = (x, z, h = 1.2, y = 0) => S.banner(B, x, z, h, y);
  switch (type) {
    case 'university': {
      S.plinth(B, c, 2.8, 2.7, 0.14);
      S.body(B, c - 0.25, c, 2.0, 1.1, 2.2, 0.14, {
        door: { x: c - 0.25, y: 0.14, z: c + 1.1 * (1 - taper * 0.5), w: 0.36, h: 0.56 },
        windows: [-0.6, 0.6].map((t) => ({ x: c - 0.25 + t, y: 0.62, z: c + 1.1 * (1 - taper * 0.5), face: 'z', w: 0.16, h: 0.28 })),
      });
      S.roof(B, c - 0.25, c, 2.0 * (1 - taper), 2.2 * (1 - taper), 1.25);
      // observatoire
      B.add(cylGeo(0.48, 0.52, 1.6, 18, 1.3), S.mat(K.mason), c + 0.9, 0.14 + 0.8, c - 0.55);
      B.add(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, c + 0.9, 1.74, c - 0.55);
      B.box(0.12, 0.5, 0.04, M.slit, c + 0.9, 1.78, c - 0.07);
      const tel = cylGeo(0.06, 0.09, 0.8, 10); tel.rotateX(-0.9); B.add(tel, M.gold, c + 0.9, 2.15, c - 0.35);
      for (let i = 0; i < 3; i++) B.box(0.28, 0.06, 0.2, M.planks, c + 1.15, 0.14 + i * 0.07, c + 1.0 - i * 0.05);
      banner(c - 1.35, c + 1.3, 1.5);
      break;
    }
    case 'bank': {
      S.plinth(B, c, 2.8, 2.8, 0.2);
      S.body(B, c, c - 0.25, 2.3, 1.2, 1.8, 0.2, { door: { x: c, y: 0.2, z: c - 0.25 + 0.9 * (1 - taper * 0.5), w: 0.4, h: 0.62 } });
      S.roof(B, c, c - 0.25, 2.3 * (1 - taper), 1.8 * (1 - taper), 1.4);
      // portique à colonnes et fronton
      for (let i = 0; i < 4; i++) {
        const x = c - 0.75 + i * 0.5;
        B.add(cylGeo(0.07, 0.085, 1.05, 12, 2), M.marble, x, 0.2 + 0.53, c + 0.95);
        B.box(0.2, 0.07, 0.2, M.marble, x, 0.2, c + 0.95); B.box(0.2, 0.07, 0.2, M.marble, x, 1.19, c + 0.95);
      }
      B.box(1.9, 0.14, 0.5, M.marble, c, 1.26, c + 0.85);
      { const g = gableGeo(0.6, 2.0, 0.42, 1.2); g.rotateY(Math.PI / 2); B.add(g, M.tile, c, 1.4, c + 0.85); }
      { const ge = gableEndGeo(1.95, 0.4, 1); ge.rotateY(Math.PI / 2); B.add(ge, M.marble, c, 1.4, c + 1.14, Math.PI); }
      const coin = cylGeo(0.18, 0.18, 0.05, 20); coin.rotateX(Math.PI / 2); B.add(coin, M.gold, c, 1.52, c + 1.16);
      for (let i = 0; i < 3; i++) B.box(1.4 - i * 0.2, 0.07, 0.22, M.marble, c, 0.2 - (i + 1) * 0.07, c + 1.25 + i * 0.12);
      for (const [x, z] of [[c - 1.15, c + 1.2], [c + 1.15, c + 1.2]]) { B.add(cylGeo(0.12, 0.12, 0.3, 12), M.darkwood, x, 0.15, z); B.add(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, x, 0.3, z); }
      banner(c - 1.3, c - 1.2, 1.8);
      break;
    }
    case 'factory': {
      B.box(3.9, 0.45, 3.8, M.concrete, c, -0.4, c);
      B.box(3.4, 1.4, 2.6, M.brick, c - 0.1, 0.05, c - 0.45);
      // toit en dents de scie avec verrières
      for (let i = 0; i < 4; i++) {
        const z = c - 1.6 + i * 0.66;
        const g = new THREE.BufferGeometry();
        const w = 3.45, x0 = c - 0.1 - w / 2, x1 = c - 0.1 + w / 2, h = 0.45, y = 1.45;
        const pts = [x0, y, z, x1, y, z, x1, y + h, z, x0, y, z, x1, y + h, z, x0, y + h, z, x0, y, z + 0.66, x1, y, z + 0.66, x1, y + h, z, x0, y, z + 0.66, x1, y + h, z, x0, y + h, z];
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, k) => (k % 2 ? 0.5 : 1)), 2));
        g.computeVertexNormals();
        B.add(g, i % 2 ? M.steel : M.steel, 0, 0, 0);
        B.box(w, h * 0.8, 0.03, M.glassDark, c - 0.1, y + 0.02, z + 0.005);
      }
      for (const [x, z, h] of [[c + 1.25, c - 1.25, 3.4], [c + 0.55, c - 1.4, 2.9]]) {
        B.add(cylGeo(0.16, 0.22, h, 14, 1.4), M.brick, x, h / 2, z);
        B.add(cylGeo(0.2, 0.2, 0.08, 14), M.steel, x, h - 0.15, z);
        anim.smoke.push([x - c + c, h + 0.15, z]);
      }
      B.box(1.1, 0.95, 0.06, M.steel, c - 0.6, 0.05, c + 0.86);
      for (let k = 0; k < 6; k++) B.box(1.1, 0.02, 0.07, M.iron, c - 0.6, 0.12 + k * 0.15, c + 0.88);
      B.box(0.4, 0.5, 0.06, M.glassDark, c + 0.8, 0.5, c + 0.86);
      // tuyaux et réservoir
      B.add(cylGeo(0.35, 0.35, 0.9, 16), M.steel, c + 1.4, 0.5, c + 1.25);
      { const pipe = cylGeo(0.05, 0.05, 1.2, 8); pipe.rotateZ(Math.PI / 2); B.add(pipe, M.iron, c + 0.8, 0.85, c + 1.25); }
      crate(B, M, c - 1.5, c + 1.4, 0.05); crate(B, M, c - 1.2, c + 1.55, 0.05); barrel(B, M, c - 1.6, c + 1.0, 0.05);
      B.box(3.42, 0.08, 0.04, team.cloth, c - 0.1, 1.2, c + 0.86);
      banner(c - 1.75, c + 1.7, 1.8);
      break;
    }
    case 'bunker': {
      B.add(taperBox(1.85, 0.75, 1.85, 0.18), M.concrete, c, 0.375 - 0.05, c);
      B.box(1.52, 0.12, 1.52, M.concrete, c, 0.68, c);
      for (const [x, z, w, d] of [[c, c + 0.82, 1.0, 0.04], [c + 0.82, c, 0.04, 1.0], [c - 0.82, c, 0.04, 1.0], [c, c - 0.82, 1.0, 0.04]]) B.box(w, 0.09, d, M.slit, x, 0.42, z);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        B.add(displaced(new THREE.SphereGeometry(0.13, 8, 6), 0.1, i).scale(1.6, 0.55, 0.9).rotateY(-a), M.sandbag, c + Math.cos(a) * 1.0, 0.07 + (i % 2) * 0.06, c + Math.sin(a) * 1.0);
      }
      B.box(1.54, 0.05, 1.54, team.cloth, c, 0.62, c);
      banner(c + 0.6, c - 0.6, 0.9, 0.74);
      break;
    }
    case 'airfield': {
      B.box(3.95, 0.42, 3.95, M.concrete, c, -0.4, c);
      // piste
      B.box(3.9, 0.04, 0.9, M.asphalt, c, 0.02, c + 1.3);
      for (let i = 0; i < 6; i++) B.box(0.35, 0.045, 0.06, M.paint, c - 1.6 + i * 0.65, 0.02, c + 1.3);
      // hangar à toit voûté
      const vault = new THREE.CylinderGeometry(0.95, 0.95, 2.2, 20, 1, true, -Math.PI / 2, Math.PI);
      vault.rotateX(-Math.PI / 2);
      for (let i = 0; i < vault.attributes.uv.count; i++) vault.attributes.uv.setXY(i, vault.attributes.uv.getX(i) * 3, vault.attributes.uv.getY(i) * 2);
      B.add(vault, M.steelRibbed, c - 0.6, 0.05, c - 0.55);
      B.box(1.9, 0.06, 2.2, M.concrete, c - 0.6, 0.02, c - 0.55);
      B.add(new THREE.CircleGeometry(0.95, 20, 0, Math.PI).rotateY(0), M.steel, c - 0.6, 0.05, c + 0.55 - 0.01);
      B.box(1.2, 0.75, 0.04, M.glassDark, c - 0.6, 0.05, c + 0.56);
      B.box(1.92, 0.06, 0.04, team.cloth, c - 0.6, 0.05, c + 0.57);
      // tour de contrôle
      B.box(0.45, 1.5, 0.45, M.concrete, c + 1.35, 0.05, c - 1.2);
      B.add(cylGeo(0.42, 0.34, 0.4, 8), M.glassDark, c + 1.35, 1.75, c - 1.2);
      B.add(cylGeo(0.47, 0.47, 0.06, 8), M.steel, c + 1.35, 1.98, c - 1.2);
      B.add(cylGeo(0.012, 0.012, 0.6, 5), M.iron, c + 1.35, 2.3, c - 1.2);
      // manche à air
      B.add(cylGeo(0.02, 0.02, 0.9, 5), M.iron, c + 1.7, 0.45, c + 0.55);
      { const sock = coneGeo(0.08, 0.36, 10); sock.rotateZ(-Math.PI / 2); B.add(sock, team.cloth, c + 1.88, 0.86, c + 0.55); }
      barrel(B, M, c + 1.1, c - 0.35, 0.05); barrel(B, M, c + 1.3, c - 0.4, 0.05);
      banner(c - 1.8, c - 1.75, 1.4);
      break;
    }
    case 'laser_turret': {
      B.add(taperBox(0.92, 0.5, 0.92, 0.2), M.concrete, c, 0.25 - 0.05, c);
      B.add(cylGeo(0.26, 0.34, 1.3, 14), M.steel, c, 0.45 + 0.65, c);
      B.add(cylGeo(0.36, 0.36, 0.08, 16), team.cloth, c, 0.62, c);
      B.add(new THREE.SphereGeometry(0.3, 18, 12), M.steel, c, 1.85, c);
      B.add(new THREE.SphereGeometry(0.16, 14, 10), team.glow, c, 1.85, c + 0.18);
      { const em = cylGeo(0.05, 0.08, 0.6, 10); em.rotateX(Math.PI / 2); B.add(em, M.iron, c, 1.85, c + 0.4); }
      for (let i = 0; i < 3; i++) { const fin = boxGeo(0.04, 0.6, 0.3); fin.rotateY(i * Math.PI * 2 / 3); B.add(fin, M.steel, c + Math.cos(i * 2.1) * 0.3, 1.1, c + Math.sin(i * 2.1) * 0.3); }
      break;
    }
    case 'space_program': {
      B.box(4.9, 0.5, 4.9, M.concrete, c, -0.4, c);
      B.box(1.6, 0.05, 1.6, M.asphalt, c, 0.1, c);
      // portique de lancement
      const gx = c - 1.05;
      for (const [x, z] of [[gx - 0.25, c - 0.25], [gx + 0.25, c - 0.25], [gx + 0.25, c + 0.25], [gx - 0.25, c + 0.25]]) B.box(0.07, 4.6, 0.07, M.redSteel, x, 0.1, z);
      for (let k = 0; k < 9; k++) {
        const y = 0.3 + k * 0.5;
        B.beam([gx - 0.25, y, c + 0.25], [gx + 0.25, y + 0.5, c + 0.25], 0.035, M.redSteel);
        B.beam([gx + 0.25, y, c - 0.25], [gx + 0.25, y + 0.5, c + 0.25], 0.035, M.redSteel);
        B.box(0.55, 0.04, 0.55, M.redSteel, gx, y, c);
      }
      for (const y of [1.6, 3.0, 4.1]) B.box(0.75, 0.05, 0.08, M.redSteel, gx + 0.6, y, c);
      // réservoirs, antenne, bâtiment de contrôle
      for (const [x, z] of [[c + 1.6, c + 1.6], [c + 1.1, c + 1.75]]) B.add(new THREE.SphereGeometry(0.32, 16, 12), M.paint, x, 0.45, z);
      B.box(1.4, 0.7, 0.9, M.concrete, c + 1.4, 0.1, c - 1.6);
      B.box(1.42, 0.2, 0.04, M.glassDark, c + 1.4, 0.55, c - 1.14);
      const dish = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2); dish.rotateX(Math.PI * 0.75);
      B.add(dish, M.paint, c - 1.6, 1.1, c + 1.6); B.add(cylGeo(0.04, 0.06, 0.9, 8), M.steel, c - 1.6, 0.55, c + 1.6);
      // fusée (groupe animé lors du lancement)
      const rocket = new THREE.Group();
      rocket.name = 'rocket';
      const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; rocket.add(m); };
      part(cylGeo(0.32, 0.34, 3.2, 20), M.paint, 0, 1.75, 0);
      part(cylGeo(0.325, 0.325, 0.18, 20), team.cloth, 0, 2.6, 0);
      part(cylGeo(0.335, 0.335, 0.1, 20), M.iron, 0, 1.1, 0);
      part(coneGeo(0.32, 0.9, 20), M.paint, 0, 3.8, 0);
      part(coneGeo(0.05, 0.2, 10), team.cloth, 0, 4.35, 0);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const fin = boxGeo(0.04, 0.6, 0.32); fin.rotateY(a);
        part(fin, team.cloth, Math.cos(a) * 0.38, 0.5, Math.sin(a) * 0.38);
      }
      for (const a of [Math.PI / 4, Math.PI * 1.25]) {
        part(cylGeo(0.13, 0.14, 1.9, 12), M.paint, Math.cos(a) * 0.46, 1.1, Math.sin(a) * 0.46);
        part(coneGeo(0.13, 0.35, 12), M.paint, Math.cos(a) * 0.46, 2.22, Math.sin(a) * 0.46);
      }
      part(cylGeo(0.22, 0.3, 0.25, 14), M.iron, 0, 0.18, 0);
      rocket.position.set(c, 0.1, c);
      B.object(rocket);
      anim.rocket = true;
      banner(c + 1.9, c + 2.2, 1.8);
      break;
    }
    case 'wonder': wonder(S, B, M, team, civ, c); break;
    default: break;
  }
  const grp = B.build();
  grp.anim = anim;
  return grp;
}

function wonder(S, B, M, team, civ, c) {
  const banner = (x, z, h = 1.6, y = 0) => S.banner(B, x, z, h, y);
  switch (civ) {
    case 'romains': {
      // Colisée
      B.box(4.9, 0.45, 4.9, M.marble, c, -0.4, c);
      const R = 2.25;
      B.add(cylGeo(R, R + 0.05, 2.3, 48, 1.2, true), M.travertine, c, 0.05 + 1.15, c);
      B.add(cylGeo(R - 0.32, R - 0.3, 2.0, 48, 1.2, true), M.travertine, c, 0.05 + 1.0, c);
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * Math.PI * 2;
          const g = boxGeo(0.14, 0.42, 0.03); g.rotateY(-a + Math.PI / 2);
          B.add(g, M.slit, c + Math.cos(a) * (R + 0.04), 0.3 + row * 0.7 + 0.21, c + Math.sin(a) * (R + 0.04));
        }
        B.add(cylGeo(R + 0.08, R + 0.08, 0.06, 48, 1, true), M.marble, c, 0.05 + 0.7 + row * 0.7, c);
      }
      // gradins et arène
      for (let k = 0; k < 4; k++) B.add(cylGeo(R - 0.35 - k * 0.22, R - 0.35 - k * 0.22, 0.05, 40), M.stucco, c, 1.6 - k * 0.35, c);
      B.add(cylGeo(1.15, 1.15, 0.06, 32), M.sandstone, c, 0.12, c);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.add(cylGeo(0.02, 0.02, 0.6, 5), M.log, c + Math.cos(a) * (R - 0.15), 2.5, c + Math.sin(a) * (R - 0.15)); }
      banner(c - 0.4, c + R + 0.05, 1.3, 2.35); banner(c + 0.4, c + R + 0.05, 1.3, 2.35);
      break;
    }
    case 'egyptiens': {
      B.box(4.95, 0.42, 4.95, M.sandstone, c, -0.4, c);
      B.add(pyramidGeo(4.4, 4.4, 3.3, 1.2), M.sandstone, c - 0.15, 0.02, c - 0.15);
      B.add(pyramidGeo(0.42, 0.42, 0.32, 1), M.gold, c - 0.15, 3.0, c - 0.15);
      // sphinx
      const sx = c + 1.6, sz = c + 1.85;
      B.box(0.42, 0.32, 0.9, M.sandstone, sx, 0.02, sz - 0.25);
      B.box(0.3, 0.32, 0.26, M.sandstone, sx, 0.3, sz + 0.12);
      B.box(0.38, 0.12, 0.3, team.cloth, sx, 0.52, sz + 0.1);
      for (const x of [c - 1.9, c + 0.6]) { B.add(taperBox(0.18, 1.4, 0.18, 0.35), M.sandstone, x, 0.02 + 0.7, c + 2.1); B.add(pyramidGeo(0.12, 0.12, 0.14, 1), M.gold, x, 1.43, c + 2.1); }
      banner(c - 2.2, c + 2.3, 1.8); banner(c + 2.3, c - 2.2, 1.8);
      break;
    }
    case 'incas': {
      // temple du Soleil sur pyramide à degrés
      const tiers = [4.9, 4.1, 3.3, 2.5, 1.8];
      tiers.forEach((w, i) => {
        B.box(w, 0.42, w, M.ashlar, c, -0.4 + (i === 0 ? 0 : 0.42 + (i - 1) * 0.42), c);
        const y = 0.02 + i * 0.42 + (i === 0 ? 0 : 0);
        for (const [x, z, ww, dd] of [[c, c + w / 2 + 0.005, w + 0.02, 0.03], [c + w / 2 + 0.005, c, 0.03, w + 0.02]]) B.box(ww, 0.05, dd, M.gold, x, y - 0.06, z);
      });
      for (let i = 0; i < 12; i++) B.box(0.9, 0.18, 0.3, M.ashlar, c, -0.15 + i * 0.18, c + 2.4 - i * 0.18);
      S.body(B, c, c - 0.1, 1.4, 0.85, 1.2, 1.7, { door: { x: c, y: 1.7, z: c - 0.1 + 0.58, w: 0.3, h: 0.5 } });
      S.roof(B, c, c - 0.1, 1.33, 1.14, 2.55, { h: 0.85, ov: 0.18 });
      const sun = cylGeo(0.45, 0.45, 0.05, 28); sun.rotateX(Math.PI / 2); B.add(sun, M.gold, c, 3.0, c + 0.62);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const ray = boxGeo(0.06, 0.24, 0.03); ray.rotateZ(-a); B.add(ray, M.gold, c + Math.sin(a) * 0.6, 3.0 + Math.cos(a) * 0.6, c + 0.62); }
      for (const [x, z] of [[c - 0.95, c + 0.95], [c + 0.95, c + 0.95]]) banner(x, z, 1.2, 1.7);
      break;
    }
    case 'japonais': {
      // pagode à cinq étages et portique torii
      B.add(taperBox(3.0, 0.5, 3.0, 0.1), M.darkstone, c - 0.3, 0.25 - 0.1, c - 0.3);
      let y = 0.45;
      for (let i = 0; i < 5; i++) {
        const w = 1.9 - i * 0.24;
        S.body(B, c - 0.3, c - 0.3, w, 0.5, w, y, i === 0 ? { door: { x: c - 0.3, y, z: c - 0.3 + w / 2, w: 0.3, h: 0.4 } } : {});
        S.roof(B, c - 0.3, c - 0.3, w, w, y + 0.5, { h: 0.32 });
        y += 0.82;
      }
      B.add(cylGeo(0.035, 0.05, 1.3, 8), M.gold, c - 0.3, y + 0.55, c - 0.3);
      for (let k = 0; k < 7; k++) { const r = new THREE.TorusGeometry(0.09 - k * 0.006, 0.018, 6, 14); r.rotateX(Math.PI / 2); B.add(r, M.gold, c - 0.3, y + 0.2 + k * 0.12, c - 0.3); }
      // torii
      const tz = c + 1.95;
      for (const x of [c + 0.6, c + 1.8]) B.add(cylGeo(0.07, 0.08, 1.45, 12), M.lacquer, x, 0.05 + 0.72, tz);
      B.box(1.7, 0.1, 0.16, M.blackwood, c + 1.2, 1.47, tz); B.box(1.45, 0.08, 0.1, M.lacquer, c + 1.2, 1.2, tz);
      for (const x of [c + 1.8, c - 1.6]) { B.box(0.18, 0.4, 0.18, M.darkstone, x, 0.05, c + 0.9); B.box(0.26, 0.14, 0.26, M.darkstone, x, 0.45, c + 0.9); }
      banner(c - 1.9, c + 1.9, 1.8);
      break;
    }
    case 'vikings': {
      // église en bois debout à toits étagés et têtes de dragon
      B.box(4.9, 0.42, 4.9, M.darkstone, c, -0.4, c);
      S.body(B, c, c, 2.4, 1.0, 1.8, 0.05, { door: { x: c, y: 0.05, z: c + 0.9, w: 0.42, h: 0.62 }, shields: false });
      S.roof(B, c, c, 2.4, 1.8, 1.05, { h: 0.9, ov: 0.3 });
      S.body(B, c, c, 1.5, 0.7, 1.2, 1.7, { shields: false });
      S.roof(B, c, c, 1.5, 1.2, 2.4, { h: 0.75, ov: 0.25, alongZ: true });
      S.body(B, c, c, 0.7, 0.6, 0.7, 2.95, { shields: false });
      B.add(pyramidGeo(0.85, 0.85, 1.4, 1.5), M.shingle, c, 3.55, c);
      B.add(coneGeo(0.03, 0.3, 6), M.gold, c, 5.1, c);
      for (const [x, z] of [[c - 1.5, c + 1.3], [c + 1.5, c + 1.3], [c - 1.5, c - 1.3], [c + 1.5, c - 1.3]]) { B.add(cylGeo(0.07, 0.08, 1.1, 8, 2), M.darkwood, x, 0.6, z); B.add(coneGeo(0.09, 0.22, 6), M.darkwood, x, 1.25, z); }
      logPile(B, M, c + 1.7, c + 2.0, 6);
      banner(c - 2.1, c + 2.1, 1.7); banner(c + 2.1, c + 2.1, 1.7);
      break;
    }
    case 'francs':
    default: {
      // cathédrale gothique
      B.box(4.9, 0.42, 4.9, M.darkstone, c, -0.4, c);
      B.box(1.9, 2.0, 3.3, M.stone, c, 0.02, c - 0.35);
      { const g = gableGeo(2.2, 3.6, 1.5, 1.2); g.rotateY(Math.PI / 2); B.add(g, M.slate, c, 2.02, c - 0.35); }
      // abside
      B.add(new THREE.CylinderGeometry(0.95, 0.95, 2.0, 16, 1, false, Math.PI / 2, Math.PI), M.stone, c, 1.02, c - 2.0);
      B.add(new THREE.ConeGeometry(1.05, 1.2, 16, 1, true, Math.PI / 2, Math.PI), M.slate, c, 2.62, c - 2.0);
      // contreforts
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
        const z = c - 1.6 + i * 0.8;
        B.box(0.16, 1.5, 0.22, M.stone, c + sd * 1.15, 0.02, z);
        B.beam([c + sd * 1.15, 1.5, z], [c + sd * 0.95, 1.95, z], 0.09, M.stone);
        B.add(coneGeo(0.08, 0.35, 6), M.stone, c + sd * 1.15, 1.7, z);
      }
      // façade et tours
      B.box(2.0, 2.4, 0.4, M.stone, c, 0.02, c + 1.45);
      { const rose = cylGeo(0.38, 0.38, 0.05, 24); rose.rotateX(Math.PI / 2); B.add(rose, M.glass, c, 1.75, c + 1.66); }
      { const ring = new THREE.TorusGeometry(0.4, 0.05, 6, 24); B.add(ring, M.stone, c, 1.75, c + 1.67); }
      B.box(0.6, 0.9, 0.05, M.door, c, 0.02, c + 1.66);
      { const arch = cylGeo(0.3, 0.3, 0.05, 14); arch.rotateX(Math.PI / 2); B.add(arch, M.door, c, 0.92, c + 1.66); }
      for (const x of [c - 1.2, c + 1.2]) {
        B.box(0.75, 3.4, 0.75, M.stone, x, 0.02, c + 1.45);
        crenels(B, M.stone, x, c + 1.45, 0.8, 0.8, 3.42, 0.12);
        B.add(pyramidGeo(0.62, 0.62, 1.7, 1.5), M.slate, x, 3.42, c + 1.45);
        B.box(0.12, 0.45, 0.03, M.slit, x, 2.4, c + 1.84);
      }
      banner(c - 1.2, c + 1.45, 0.8, 5.1); banner(c + 1.2, c + 1.45, 0.8, 5.1);
    }
  }
  void hipGeo; void displaced;
}
