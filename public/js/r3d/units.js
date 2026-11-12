// Unités 3D : anatomie détaillée, équipements par civilisation, squelette articulé et animations.
// Chaque unité est décrite par une liste de pièces rattachées à des os ; le moteur de rendu les
// dessine par instanciation (une seule géométrie par couple géométrie/matériau).
import * as THREE from 'three';
import { displaced } from './models.js';
import { UNITS } from '../config.js';

// ------------------------------------------------------------------ géométries
const latheG = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function deform(g, fn) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
function triGeo(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tris.length * 6), 2));
  g.computeVertexNormals();
  return g;
}

export function unitGeometries() {
  const G = {};
  G.cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10); // hauteur totale 2
  G.sph = new THREE.SphereGeometry(0.5, 16, 12);
  G.hemi = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  G.taper = new THREE.CylinderGeometry(0.42, 0.5, 1, 12);
  G.cone = new THREE.ConeGeometry(0.5, 1, 14);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.bow = new THREE.TorusGeometry(0.5, 0.024, 5, 18, Math.PI * 0.9);
  G.disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  G.halfdisc = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI);
  G.kite = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.5, 0.5); sh.quadraticCurveTo(0, 0.56, 0.5, 0.5); sh.quadraticCurveTo(0.5, -0.1, 0, -0.6); sh.quadraticCurveTo(-0.5, -0.1, -0.5, 0.5);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -0.05);
    return deform(g, (v) => { v.z -= 0.22 * v.x * v.x; });
  })();
  // lame : section en losange, pointe effilée
  G.blade = deform(new THREE.BoxGeometry(1, 1, 1, 2, 8, 1), (v) => {
    const edge = Math.abs(v.x) > 0.25;
    v.x *= v.y > 0.32 ? Math.max(0.03, (0.5 - v.y) / 0.18) : 1;
    if (edge) v.z *= 0.18;
  });
  G.katana = deform(new THREE.BoxGeometry(1, 1, 1, 2, 10, 1), (v) => {
    const edge = v.x > 0.25;
    v.x *= v.y > 0.38 ? Math.max(0.05, (0.5 - v.y) / 0.12) : 1;
    if (edge) v.z *= 0.15;
    v.x -= 0.9 * (v.y + 0.5) ** 2;
  });
  G.leaf = deform(new THREE.BoxGeometry(1, 1, 1, 2, 8, 1), (v) => {
    const edge = Math.abs(v.x) > 0.25;
    v.x *= Math.max(0.04, 1 - ((v.y + 0.15) / 0.65) ** 2);
    if (edge) v.z *= 0.2;
  });
  G.axe = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.16); s.lineTo(0.5, 0.42); s.quadraticCurveTo(0.74, 0, 0.5, -0.5); s.lineTo(0.08, -0.2); s.lineTo(0, -0.16); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -0.03);
    return g;
  })();
  G.wool = displaced(new THREE.IcosahedronGeometry(0.5, 2), 0.13, 77, 9);
  G.fur = displaced(new THREE.IcosahedronGeometry(0.5, 2), 0.09, 78, 12);
  G.dodec = new THREE.DodecahedronGeometry(0.5, 0);
  G.ring = new THREE.TorusGeometry(0.5, 0.14, 6, 20);
  G.trim = new THREE.TorusGeometry(0.5, 0.035, 4, 28);
  G.hook = new THREE.TorusGeometry(0.5, 0.06, 5, 12, Math.PI * 0.6);
  G.wheel = new THREE.TorusGeometry(0.5, 0.08, 6, 18);
  // ---- anatomie humaine
  G.torso = deform(latheG([[0, -0.5], [0.4, -0.5], [0.41, -0.42], [0.39, -0.3], [0.42, -0.12], [0.47, 0.05], [0.5, 0.2], [0.49, 0.31], [0.44, 0.4], [0.33, 0.46], [0.2, 0.49], [0, 0.5]], 18), (v) => {
    if (v.z < 0) v.z *= 0.92;
    else if (v.y > -0.1 && v.y < 0.38) v.z *= 1 + 0.1 * Math.sin((v.y + 0.1) / 0.48 * Math.PI);
  });
  // membres : extrémités arrondies de même rayon que le segment voisin, pour des articulations continues
  G.limb = latheG([[0, -1], [0.2, -0.99], [0.32, -0.95], [0.39, -0.86], [0.41, -0.6], [0.44, -0.1], [0.49, 0.4], [0.5, 0.66], [0.47, 0.86], [0.36, 0.96], [0.2, 0.995], [0, 1]], 12);
  G.calf = deform(latheG([[0, -1], [0.18, -0.99], [0.27, -0.95], [0.3, -0.85], [0.32, -0.55], [0.4, -0.05], [0.49, 0.42], [0.5, 0.62], [0.47, 0.84], [0.38, 0.95], [0.2, 0.995], [0, 1]], 12), (v) => { if (v.z < 0 && v.y > -0.3) v.z *= 1.12; });
  G.head = deform(new THREE.SphereGeometry(0.5, 20, 16), (v) => {
    v.y *= 1.04;
    if (v.y < 0) { v.x *= 1 + v.y * 0.42; if (v.z < 0) v.z *= 1 + v.y * 0.35; }
    if (v.y < -0.2 && v.z > 0) v.z *= 1.07;
    if (v.z < 0 && v.y > -0.1) v.z *= 1.07;
    if (v.z > 0.3 && v.y > 0.02 && v.y < 0.18) v.z *= 0.97;
  });
  G.nose = triGeo([
    [[0, 0.5, 0], [0, -0.3, 0.9], [0.5, -0.5, 0]],
    [[0, 0.5, 0], [-0.5, -0.5, 0], [0, -0.3, 0.9]],
    [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0, -0.3, 0.9]],
  ]);
  // boîte arrondie (super-ellipsoïde) : mains, bottes, sacoches
  G.rbox = deform(new THREE.SphereGeometry(0.5, 14, 10), (v) => {
    const f = (a) => Math.sign(a) * Math.pow(Math.abs(a * 2), 0.42) * 0.5;
    v.set(f(v.x), f(v.y), f(v.z));
  });
  // jupe de tunique avec plis
  G.skirt = deform(new THREE.CylinderGeometry(0.42, 0.5, 1, 26, 2), (v) => {
    const r = Math.hypot(v.x, v.z);
    if (r < 0.01) return;
    const a = Math.atan2(v.z, v.x);
    const k = 1 + 0.07 * Math.sin(a * 9) * (0.5 - v.y);
    v.x *= k; v.z *= k;
  });
  G.cape = deform(new THREE.BoxGeometry(1, 1, 0.05, 8, 8, 1).translate(0, -0.5, 0), (v) => {
    const d = -v.y;
    v.x *= 0.7 + 0.34 * d;
    v.z += 0.4 * v.x * v.x + 0.028 * Math.sin(v.x * 16) * d;
  });
  // chevelure : calotte qui dégage le visage (front haut, nuque basse)
  const capShape = (front, back) => deform(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.86), (v) => {
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) return;
    const f = Math.max(0, v.z / r) ** 1.6;
    const hl = back + f * (front - back);
    if (v.y < hl) { const rr = Math.sqrt(Math.max(0, 0.25 - hl * hl)); v.set(v.x / r * rr, hl, v.z / r * rr); }
  });
  G.hairCap = capShape(0.27, -0.36);
  G.coif = capShape(0.2, -0.44); // capuche ou coiffe de mailles (ouverture du visage)
  G.beard = new THREE.SphereGeometry(0.5, 14, 6, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.64, Math.PI * 0.3);
  G.helm = latheG([[0.5, -0.02], [0.5, 0.12], [0.47, 0.32], [0.38, 0.54], [0.24, 0.72], [0.08, 0.84], [0, 0.86]], 18);
  G.helmCone = latheG([[0.5, 0], [0.49, 0.18], [0.4, 0.45], [0.24, 0.72], [0.06, 0.95], [0, 1]], 18);
  G.shell = deform(new THREE.BoxGeometry(1, 1, 0.12, 10, 1, 1), (v) => { v.z -= 0.32 * v.x * v.x; });
  // ---- anatomie du cheval
  G.hbody = deform(latheG([[0, -0.5], [0.2, -0.485], [0.34, -0.44], [0.44, -0.33], [0.48, -0.18], [0.46, -0.02], [0.46, 0.14], [0.48, 0.28], [0.44, 0.4], [0.32, 0.47], [0, 0.5]], 18).rotateX(Math.PI / 2), (v) => {
    if (v.y < 0) v.y *= 1.08 + (v.z > 0.2 ? 0.06 : 0);
    else v.y -= 0.05 * Math.sin((v.z + 0.5) * Math.PI) * (v.y / 0.5);
  });
  G.hneck = latheG([[0, -0.5], [0.5, -0.5], [0.5, -0.32], [0.42, -0.05], [0.34, 0.25], [0.3, 0.45], [0, 0.5]], 14);
  G.hhead = latheG([[0, -0.5], [0.3, -0.48], [0.37, -0.4], [0.34, -0.25], [0.38, -0.05], [0.47, 0.2], [0.5, 0.35], [0.42, 0.46], [0, 0.5]], 14);
  G.hoof = new THREE.CylinderGeometry(0.42, 0.5, 1, 10);
  return G;
}

// ------------------------------------------------------------------ couleurs
const SKIN = [0xe2b48c, 0xc89870, 0xf0c8a0, 0xa87858];
export const SKIN_TONES = SKIN;
export const CIV_SKINS = {
  francs: SKIN, romains: [0xd8a880, 0xc89870, 0xe0b490, 0xb88860], egyptiens: [0xb07850, 0x9a6844, 0xa87048, 0x8a5a38],
  incas: [0xa87048, 0x986040, 0xb07a50, 0x8a5838], japonais: [0xe8c8a0, 0xdcb890, 0xf0d2aa, 0xd0a880], vikings: [0xf0d0b8, 0xe8c4a8, 0xf4dac4, 0xe0b898],
};
export const CIV_HAIR = {
  francs: [0x4a3020, 0x2a1c12, 0x8a6a3a, 0x6a3a1e], romains: [0x2a1c12, 0x1a1210, 0x3a2618, 0x4a3020],
  egyptiens: [0x141010, 0x1a1412, 0x141010, 0x201814], incas: [0x121010, 0x181412, 0x121010, 0x1a1614],
  japonais: [0x121212, 0x161414, 0x121212, 0x1a1816], vikings: [0xc8a060, 0x9a5a2a, 0xd8b878, 0x7a5232],
};
// barbes possibles (indices de variante)
const BEARDS = { francs: [1, 3], romains: [3], egyptiens: [], incas: [], japonais: [2], vikings: [0, 1, 2] };

const C = {
  linen: 0xd9ceb4, tunic: 0x8a6a45, brown: 0x5a3d26, hose: 0x4a3a2a, leather: 0x6b4a2e, belt: 0x3a281a, boot: 0x33251a,
  steel: 0xc4cad2, metal: 0xb0b6be, darkmetal: 0x5e646c, iron: 0x34363c, bronze: 0xb08040, gold: 0xe2b84a, brass: 0xc8a050,
  wood: 0x7a5232, darkwood: 0x4a3220, straw: 0xd8b860, rope: 0x8a7a5a, white: 0xeeeeea, black: 0x1c1c1e, red: 0xa82a22,
  lip: 0x9a5a50, eye: 0x1e1612, olive: 0x56603a, khaki: 0x7d7450, fur: 0x7a6248, felt: 0x2a2420,
  bay: 0x6b4022, dark: 0x2e1e14, grey: 0xc8c2b6, chestnut: 0x8e5a30, mane: 0x241610, hoof: 0x2a2420,
};

/*
 * Pièce : { g, m, c, b, p, s, r, d?, v?, tool?, carry? }
 *  g géométrie · m matériau · c couleur (nombre | 'team' | 'teamDk' | 'teamLt' | 'skin' | 'hair')
 *  b os · p position locale · s échelle · r rotation (euler)
 *  d : détail fin (masqué de loin) · v : variantes où la pièce apparaît (0..3)
 */
const P = (g, m, c, b, p, s, r = [0, 0, 0], x = null) => (x ? { g, m, c, b, p, s, r, ...x } : { g, m, c, b, p, s, r });
const D = { d: 1 };

// ------------------------------------------------------------------ corps humain
function face(o) {
  const L = [];
  L.push(P('head', 'skin', 'skin', 'head', [0, 0.1, 0], [0.17, 0.19, 0.185]));
  L.push(P('nose', 'skin', 'skin', 'head', [0, 0.098, 0.083], [0.03, 0.05, 0.03]));
  for (const x of [-1, 1]) {
    L.push(P('sph', 'skin', 0xf0ece4, 'head', [x * 0.035, 0.117, 0.077], [0.026, 0.016, 0.012], [0, 0, 0], D));
    L.push(P('sph', 'gloss', C.eye, 'head', [x * 0.035, 0.117, 0.083], [0.013, 0.013, 0.006], [0, 0, 0], D));
    L.push(P('box', 'hair', 'hair', 'head', [x * 0.036, 0.139, 0.084], [0.044, 0.008, 0.012], [0.15, 0, x * -0.14], D));
    L.push(P('sph', 'skin', 'skin', 'head', [x * 0.086, 0.104, -0.004], [0.022, 0.048, 0.034], [0, 0, 0], D));
  }
  L.push(P('box', 'skin', C.lip, 'head', [0, 0.053, 0.081], [0.034, 0.009, 0.012], [0, 0, 0], D));
  if (o.hair !== false) {
    L.push(P('hairCap', 'hair', 'hair', 'head', [0, 0.1, -0.002], [0.183, 0.2, 0.196]));
    if (o.hairStyle === 'long') L.push(P('box', 'hair', 'hair', 'head', [0, 0.035, -0.072], [0.15, 0.17, 0.05], [0.12, 0, 0]));
    if (o.hairStyle === 'topknot') { L.push(P('cyl', 'hair', 'hair', 'head', [0, 0.205, -0.03], [0.03, 0.05, 0.08], [1.2, 0, 0])); }
    if (o.hairStyle === 'braids') for (const x of [-1, 1]) L.push(P('cyl', 'hair', 'hair', 'head', [x * 0.08, 0.0, -0.03], [0.022, 0.18, 0.022], [0.15, 0, x * 0.1]));
  }
  const beard = o.beard === undefined ? BEARDS[o.civ] || [] : o.beard;
  if (beard && beard.length) {
    L.push(P('beard', 'hair', 'hair', 'head', [0, 0.098, 0.004], [0.176, 0.2, 0.194], [0, 0, 0], { v: beard }));
    L.push(P('box', 'hair', 'hair', 'head', [0, 0.066, 0.087], [0.046, 0.01, 0.012], [0, 0, 0], { v: beard, d: 1 }));
  }
  return L;
}

// corps complet ; o : couleurs et matériaux des vêtements
function human(o = {}) {
  const L = [];
  const torsoC = o.torso ?? 'team', torsoM = o.torsoMat ?? 'cloth';
  const slC = o.sleeve ?? torsoC, slM = o.sleeveMat ?? torsoM;
  const fC = o.bareArms ? 'skin' : (o.fore ?? slC), fM = o.bareArms ? 'skin' : (o.foreMat ?? slM);
  const lC = o.bareLegs ? 'skin' : (o.legs ?? C.hose), lM = o.bareLegs ? 'skin' : (o.legMat ?? 'cloth');
  const sC = o.bareLegs ? 'skin' : (o.shins ?? lC), sM = o.bareLegs ? 'skin' : (o.shinMat ?? lM);
  const barefoot = o.boots === false;
  const bC = barefoot ? 'skin' : (o.boots ?? C.boot), bM = barefoot ? 'skin' : (o.bootMat ?? 'leather');
  L.push(P('sph', lM, lC, 'hips', [0, -0.015, 0], [0.3, 0.17, 0.2]));
  for (const s of ['L', 'R']) {
    L.push(P('limb', lM, lC, 'leg' + s, [0, -0.118, 0], [0.098, 0.122, 0.1]));
    L.push(P('sph', sM, sC, 'shin' + s, [0, 0, 0.006], [0.07, 0.07, 0.074]));
    L.push(P('calf', sM, sC, 'shin' + s, [0, -0.102, -0.004], [0.074, 0.108, 0.078]));
    if (!barefoot && o.tallBoots !== false) L.push(P('calf', bM, bC, 'shin' + s, [0, -0.152, -0.002], [0.078, 0.068, 0.082]));
    if (o.sandals) L.push(P('box', 'leather', C.leather, 'shin' + s, [0, -0.16, 0.0], [0.074, 0.012, 0.078]));
    L.push(P('rbox', bM, bC, 'foot' + s, [0, -0.012, 0.032], [barefoot ? 0.068 : 0.078, 0.048, 0.155]));
  }
  L.push(P('torso', torsoM, torsoC, 'body', [0, 0.2, 0], [0.33, 0.42, 0.212]));
  if (o.skirt !== false) {
    const len = o.skirtLen ?? 0.2;
    L.push(P('skirt', o.skirtMat ?? torsoM, o.skirtC ?? torsoC, 'hips', [0, 0.03 - len / 2, 0], [0.32, len, 0.232]));
  }
  if (o.belt !== false) {
    L.push(P('cyl', 'leather', o.beltC ?? C.belt, 'body', [0, 0.022, 0], [0.338, 0.042, 0.226]));
    L.push(P('box', 'gold', C.brass, 'body', [0, 0.022, 0.114], [0.036, 0.03, 0.012], [0, 0, 0], D));
  }
  L.push(P('cyl', 'skin', 'skin', 'body', [0, 0.42, 0], [0.074, 0.07, 0.074]));
  L.push(...face(o));
  for (const s of ['L', 'R']) {
    L.push(P('sph', slM, slC, 'arm' + s, [0, -0.012, 0], [0.076, 0.07, 0.08]));
    L.push(P('limb', slM, slC, 'arm' + s, [0, -0.084, 0], [0.07, 0.088, 0.072]));
    L.push(P('calf', fM, fC, 'fore' + s, [0, -0.072, 0], [0.06, 0.078, 0.062]));
    L.push(P('rbox', o.gloves ? 'leather' : 'skin', o.gloves ?? 'skin', 'fore' + s, [0, -0.162, 0.004], [0.047, 0.068, 0.033]));
  }
  return L;
}

// pièces d'armure génériques
const A = {
  mailShirt(L, len = 0.26, c = C.steel) {
    L.push(P('torso', 'mail', c, 'body', [0, 0.2, 0], [0.345, 0.43, 0.226]));
    L.push(P('skirt', 'mail', c, 'hips', [0, 0.03 - len / 2, 0], [0.355, len, 0.255]));
    for (const s of ['L', 'R']) L.push(P('limb', 'mail', c, 'arm' + s, [0, -0.07, 0], [0.07, 0.075, 0.072]));
  },
  coif(L, c = C.steel) {
    L.push(P('coif', 'mail', c, 'head', [0, 0.098, -0.002], [0.198, 0.215, 0.212]));
    L.push(P('skirt', 'mail', c, 'body', [0, 0.395, 0], [0.24, 0.07, 0.2]));
  },
  plate(L, c = C.steel, team = true) {
    L.push(P('torso', 'metal', c, 'body', [0, 0.2, 0.004], [0.35, 0.43, 0.228]));
    L.push(P('box', 'metal', c, 'body', [0, 0.25, 0.104], [0.012, 0.22, 0.02], [0, 0, 0], D)); // arête du plastron
    L.push(P('skirt', 'metal', c, 'hips', [0, -0.03, 0], [0.36, 0.12, 0.26]));
    for (const s of ['L', 'R']) {
      L.push(P('sph', 'metal', c, 'arm' + s, [0, 0.0, 0], [0.13, 0.11, 0.13]));
      L.push(P('calf', 'metal', c, 'fore' + s, [0, -0.07, 0], [0.062, 0.07, 0.064]));
      L.push(P('calf', 'metal', c, 'shin' + s, [0, -0.1, 0], [0.078, 0.11, 0.08]));
      L.push(P('sph', 'metal', c, 'shin' + s, [0, 0, 0.012], [0.08, 0.075, 0.08]));
      L.push(P('rbox', 'metal', c, 'foot' + s, [0, -0.008, 0.034], [0.082, 0.052, 0.16]));
    }
    if (team) L.push(P('skirt', 'cloth', 'team', 'hips', [0, -0.11, 0], [0.37, 0.12, 0.27]));
  },
  surcoat(L, c = 'team', len = 0.26) {
    L.push(P('torso', 'cloth', c, 'body', [0, 0.17, 0.004], [0.352, 0.36, 0.232]));
    L.push(P('skirt', 'cloth', c, 'hips', [0, 0.03 - len / 2, 0], [0.365, len, 0.27]));
    L.push(P('cyl', 'leather', C.belt, 'body', [0, 0.024, 0], [0.352, 0.035, 0.236]));
  },
  cape(L, c = 'team', len = 0.5) { L.push(P('cape', 'cloth', c, 'cape', [0, 0, 0], [0.34, len, 0.6])); },
  quiver(L, c = C.leather) {
    L.push(P('cyl', 'leather', c, 'back', [0.07, 0.0, -0.13], [0.07, 0.3, 0.07], [0.25, 0, 0.3]));
    for (let i = 0; i < 3; i++) L.push(P('cone', 'cloth', C.white, 'back', [0.105 + i * 0.015, 0.17, -0.09 + i * 0.008], [0.03, 0.06, 0.008], [0.25, 0, 0.3], D));
  },
  pouch(L, x = 0.12) { L.push(P('rbox', 'leather', C.leather, 'body', [x, 0.0, 0.06], [0.06, 0.07, 0.04], [0, 0, 0], D)); },
  scabbard(L, len = 0.34) { L.push(P('box', 'leather', C.belt, 'body', [-0.15, -0.12, 0.02], [0.032, len, 0.022], [0.45, 0, 0.12])); },
};

// panache de plumes
function plume(L, c, y) {
  for (let i = 0; i < 5; i++) L.push(P('sph', 'hair', i % 2 ? c : 'teamLt', 'head', [(i - 2) * 0.014, y + 0.03 + Math.abs(i - 2) * -0.008, -0.05 - Math.abs(i - 2) * 0.01], [0.035, 0.05, 0.2], [0.75 - Math.abs(i - 2) * 0.12, (i - 2) * 0.18, 0]));
}

// ------------------------------------------------------------------ armes (os « tool », poignée à l'origine, +Y = lame)
const W = {
  sword(L, len = 0.4, o = {}) {
    L.push(P(o.curved ? 'katana' : 'blade', 'metal', o.c ?? C.steel, 'tool', [0, 0.075 + len / 2, 0], [o.w ?? 0.034, len, 0.012]));
    if (o.guard !== false) L.push(P('box', 'metal', o.guardC ?? C.darkmetal, 'tool', [0, 0.065, 0], [o.guardW ?? 0.13, 0.018, 0.026]));
    L.push(P('cyl', 'leather', C.belt, 'tool', [0, 0.0, 0], [0.022, 0.11, 0.022]));
    L.push(P('sph', 'metal', o.guardC ?? C.darkmetal, 'tool', [0, -0.06, 0], [0.034, 0.034, 0.034]));
  },
  axe(L, len = 0.5, c = C.steel) {
    L.push(P('cyl', 'wood', C.wood, 'tool', [0, len / 2 - 0.05, 0], [0.024, len, 0.024]));
    L.push(P('axe', 'metal', c, 'tool', [0, len - 0.12, 0.012], [0.24, 0.26, 0.35], [0, -Math.PI / 2, 0]));
  },
  mace(L) {
    L.push(P('cyl', 'wood', C.darkwood, 'tool', [0, 0.18, 0], [0.024, 0.42, 0.024]));
    L.push(P('dodec', 'metal', C.darkmetal, 'tool', [0, 0.41, 0], [0.09, 0.11, 0.09]));
  },
  spear(L, len = 1.35, tip = 0.15, c = C.steel) {
    L.push(P('cyl', 'wood', C.wood, 'tool', [0, len / 2 - 0.35, 0], [0.022, len, 0.022]));
    L.push(P('leaf', 'metal', c, 'tool', [0, len - 0.35 + tip / 2, 0], [0.05, tip, 0.016]));
    L.push(P('cyl', 'metal', C.darkmetal, 'tool', [0, len - 0.36, 0], [0.028, 0.04, 0.028]));
  },
  bow(L, c = C.wood) {
    L.push(P('bow', 'wood', c, 'shield', [0, 0, 0.03], [0.82, 0.82, 0.82], [0, Math.PI / 2, -Math.PI * 0.45]));
    L.push(P('cyl', 'cloth', C.linen, 'shield', [0, 0, -0.015], [0.006, 0.72, 0.006], [0, 0, 0], D));
  },
  crossbow(L) {
    L.push(P('box', 'wood', C.wood, 'tool', [0, 0.16, 0.0], [0.045, 0.42, 0.055]));
    L.push(P('bow', 'metal', C.darkmetal, 'tool', [0, 0.36, 0.0], [0.3, 0.3, 0.3], [0, 0, Math.PI * 0.05]));
    L.push(P('cyl', 'cloth', C.linen, 'tool', [0, 0.33, 0.0], [0.005, 0.27, 0.005], [0, 0, Math.PI / 2], D));
    L.push(P('ring', 'metal', C.darkmetal, 'tool', [0, 0.42, 0], [0.06, 0.06, 0.06], [Math.PI / 2, 0, 0], D));
  },
  musket(L, o = {}) {
    L.push(P('rbox', 'wood', C.wood, 'tool', [0, -0.02, 0.0], [0.045, 0.2, 0.07]));
    L.push(P('cyl', 'wood', C.wood, 'tool', [0, 0.28, 0], [0.034, 0.5, 0.034]));
    L.push(P('cyl', 'metal', C.iron, 'tool', [0, 0.45, 0.02], [0.018, 0.72, 0.018]));
    L.push(P('box', 'metal', C.darkmetal, 'tool', [0.022, 0.1, 0.0], [0.012, 0.06, 0.03], [0, 0, 0], D));
    if (o.bayonet) L.push(P('blade', 'metal', C.steel, 'tool', [0, 0.92, 0.02], [0.018, 0.22, 0.008]));
  },
  rifle(L) {
    L.push(P('rbox', 'wood', 0x5a3a22, 'tool', [0, -0.02, 0.0], [0.04, 0.18, 0.065]));
    L.push(P('box', 'wood', 0x5a3a22, 'tool', [0, 0.25, 0], [0.04, 0.42, 0.045]));
    L.push(P('cyl', 'metal', 0x2a2a2a, 'tool', [0, 0.42, 0.018], [0.016, 0.62, 0.016]));
    L.push(P('box', 'metal', 0x2a2a2a, 'tool', [0, 0.11, 0.03], [0.03, 0.09, 0.04]));
    L.push(P('cyl', 'metal', 0x2a2a2a, 'tool', [0.03, 0.12, 0.03], [0.008, 0.04, 0.008], [0, 0, Math.PI / 2], D));
  },
  mg(L) {
    L.push(P('box', 'metal', 0x262626, 'tool', [0, 0.18, 0], [0.07, 0.36, 0.09]));
    L.push(P('cyl', 'metal', 0x303030, 'tool', [0, 0.52, 0.01], [0.04, 0.34, 0.04]));
    L.push(P('cyl', 'metal', 0x1c1c1c, 'tool', [0, 0.74, 0.01], [0.016, 0.14, 0.016]));
    L.push(P('box', 'gold', 0xb08a3a, 'tool', [0.065, 0.14, 0], [0.04, 0.22, 0.03], [0, 0, 0.2]));
    for (const x of [-1, 1]) L.push(P('cyl', 'metal', 0x222222, 'tool', [x * 0.03, 0.58, -0.04], [0.008, 0.16, 0.008], [0.4, 0, x * 0.3], D));
    L.push(P('rbox', 'wood', 0x3a2a1a, 'tool', [0, -0.02, 0], [0.045, 0.14, 0.07]));
  },
  laser(L) {
    L.push(P('rbox', 'metal', 0xdfe4ea, 'tool', [0, 0.18, 0], [0.07, 0.44, 0.1]));
    L.push(P('cyl', 'metal', 0x6a7078, 'tool', [0, 0.46, 0.015], [0.03, 0.2, 0.03]));
    L.push(P('cyl', 'glow', 'team', 'tool', [0, 0.57, 0.015], [0.026, 0.04, 0.026]));
    L.push(P('box', 'glow', 'team', 'tool', [0.036, 0.2, 0], [0.006, 0.22, 0.03]));
  },
};

// ------------------------------------------------------------------ boucliers (os « shield », face vers +Z)
const S = {
  round(L, c = 'team', r = 0.27, o = {}) {
    L.push(P('disc', 'paint', c, 'shield', [0, 0, 0.02], [r, 0.025, r], [Math.PI / 2, 0, 0]));
    L.push(P('trim', 'metal', o.rim ?? C.darkmetal, 'shield', [0, 0, 0.02], [r * 1.0, r * 1.0, 0.6], [0, 0, 0]));
    L.push(P('hemi', 'metal', o.boss ?? C.metal, 'shield', [0, 0, 0.032], [0.08, 0.06, 0.08], [Math.PI / 2, 0, 0]));
    if (o.half) L.push(P('halfdisc', 'paint', o.half, 'shield', [0, 0, 0.034], [r * 0.96, 0.004, r * 0.96], [Math.PI / 2, Math.PI / 4, 0]));
  },
  kite(L, c = 'team', o = {}) {
    L.push(P('kite', 'paint', c, 'shield', [0, -0.03, 0.02], [0.25, 0.36, 0.25]));
    if (o.cross !== false) {
      L.push(P('box', 'gold', o.charge ?? C.gold, 'shield', [0, 0.0, 0.052], [0.024, 0.26, 0.01], [0, 0, 0], D));
      L.push(P('box', 'gold', o.charge ?? C.gold, 'shield', [0, 0.06, 0.05], [0.17, 0.024, 0.01], [0, 0, 0], D));
    }
  },
  scutum(L, c = 'team') {
    L.push(P('shell', 'paint', c, 'shield', [0, 0, 0.03], [0.3, 0.48, 0.3]));
    L.push(P('hemi', 'gold', C.brass, 'shield', [0, 0, 0.065], [0.08, 0.05, 0.08], [Math.PI / 2, 0, 0]));
    for (const y of [-0.13, 0.13]) L.push(P('box', 'gold', C.gold, 'shield', [0, y, 0.062], [0.2, 0.014, 0.008], [0, 0, 0], D));
    L.push(P('box', 'gold', C.gold, 'shield', [0, 0, 0.062], [0.014, 0.42, 0.008], [0, 0, 0], D));
  },
};

// ------------------------------------------------------------------ panoplies des civilisations
// tier : 'light' (milicien, piquier), 'medium' (épéiste), 'heavy' (champion, élite)
const helmBase = (L, mat, c, shape = 'helm', sy = 0.135) => L.push(P(shape, mat, c, 'head', [0, 0.095, -0.004], [0.208, sy, 0.218]));
const KIT = {
  francs: {
    civilian: { torso: C.tunic, legs: C.hose, sleeve: C.linen },
    hat(L, v) { L.push(P('disc', 'cloth', C.straw, 'head', [0, 0.165, 0], [0.4, 0.014, 0.4], [0, 0, 0], { v })); L.push(P('cone', 'cloth', C.straw, 'head', [0, 0.215, 0], [0.2, 0.1, 0.2], [0, 0, 0], { v })); },
    body(tier) { return tier === 'light' ? { torso: 'team', sleeve: C.linen, legs: C.hose } : tier === 'medium' ? { torso: C.linen, legs: C.hose, gloves: C.leather } : { torso: C.linen, legs: C.darkmetal, legMat: 'mail', gloves: C.darkmetal }; },
    armor(L, tier) {
      if (tier === 'light') { L.push(P('torso', 'leather', C.leather, 'body', [0, 0.17, 0.002], [0.345, 0.32, 0.225])); A.pouch(L); }
      else if (tier === 'medium') { A.mailShirt(L, 0.28); A.surcoat(L, 'team', 0.3); A.scabbard(L); }
      else { A.mailShirt(L, 0.2); A.plate(L); A.cape(L, 'teamDk', 0.48); }
    },
    helm(L, tier) {
      if (tier === 'light') { helmBase(L, 'metal', C.darkmetal); L.push(P('disc', 'metal', C.darkmetal, 'head', [0, 0.118, 0], [0.34, 0.012, 0.34])); }
      else if (tier === 'medium') { A.coif(L); helmBase(L, 'metal', C.steel, 'helmCone', 0.17); L.push(P('box', 'metal', C.steel, 'head', [0, 0.098, 0.106], [0.02, 0.085, 0.012])); }
      else {
        A.coif(L);
        L.push(P('cyl', 'metal', C.steel, 'head', [0, 0.11, 0], [0.212, 0.2, 0.222]));
        L.push(P('hemi', 'metal', C.steel, 'head', [0, 0.208, 0], [0.212, 0.06, 0.222]));
        L.push(P('box', 'metal', C.black, 'head', [0, 0.128, 0.108], [0.15, 0.012, 0.01], [0, 0, 0], D));
        L.push(P('box', 'gold', C.gold, 'head', [0, 0.09, 0.11], [0.014, 0.12, 0.008], [0, 0, 0], D));
        plume(L, 'team', 0.215);
      }
    },
    shield(L, tier) { if (tier === 'light') S.round(L, 'team', 0.25); else S.kite(L, 'team'); },
    melee(L, tier) { W.sword(L, tier === 'light' ? 0.34 : tier === 'medium' ? 0.42 : 0.5); },
    spear: { len: 1.4 },
  },
  romains: {
    civilian: { torso: C.linen, bareLegs: true, boots: false, sandals: true, sleeve: C.linen, tallBoots: false },
    hat() {},
    body(tier) { return { torso: 'team', sleeve: 'team', bareArms: tier !== 'heavy', bareLegs: true, boots: C.leather, tallBoots: false, sandals: true, skirtLen: 0.18 }; },
    armor(L, tier) {
      // ptéruges : lanières de cuir
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; L.push(P('box', 'leather', C.leather, 'hips', [Math.cos(a) * 0.15, -0.06, Math.sin(a) * 0.1], [0.04, 0.11, 0.012], [0, -a + Math.PI / 2, 0], D)); }
      if (tier === 'light') { L.push(P('torso', 'leather', C.leather, 'body', [0, 0.2, 0.002], [0.342, 0.4, 0.222])); }
      else if (tier === 'medium') {
        for (let i = 0; i < 5; i++) L.push(P('cyl', 'metal', C.steel, 'body', [0, 0.06 + i * 0.06, 0], [0.345 - i * 0.004, 0.052, 0.232]));
        for (const x of [-1, 1]) for (let i = 0; i < 3; i++) L.push(P('hemi', 'metal', C.steel, 'body', [x * 0.17, 0.35 - i * 0.03, 0], [0.13 - i * 0.01, 0.06, 0.13], [0, 0, x * -0.5]));
        A.scabbard(L, 0.26);
      } else {
        L.push(P('torso', 'metal', C.bronze, 'body', [0, 0.2, 0.004], [0.35, 0.43, 0.23]));
        for (const x of [-1, 1]) L.push(P('sph', 'metal', C.bronze, 'body', [x * 0.06, 0.27, 0.085], [0.12, 0.1, 0.06], [0, 0, 0], D));
        A.cape(L, C.red, 0.5);
      }
    },
    helm(L, tier) {
      const c = tier === 'light' ? C.bronze : C.steel;
      helmBase(L, 'metal', c, 'helm', 0.14);
      for (const x of [-1, 1]) L.push(P('box', 'metal', c, 'head', [x * 0.088, 0.06, 0.04], [0.012, 0.09, 0.07], [0, x * 0.25, 0]));
      L.push(P('box', 'metal', c, 'head', [0, 0.07, -0.1], [0.16, 0.03, 0.05], [-0.4, 0, 0]));
      if (tier !== 'light') L.push(P('fur', 'hair', tier === 'heavy' ? C.gold : C.red, 'head', [0, 0.235, -0.01], tier === 'heavy' ? [0.3, 0.075, 0.05] : [0.045, 0.08, 0.25]));
    },
    shield(L, tier) { if (tier === 'light') { L.push(P('disc', 'paint', 'team', 'shield', [0, 0, 0.02], [0.26, 0.025, 0.36], [Math.PI / 2, 0, 0])); L.push(P('hemi', 'metal', C.bronze, 'shield', [0, 0, 0.03], [0.07, 0.05, 0.07], [Math.PI / 2, 0, 0])); } else S.scutum(L); },
    melee(L) { W.sword(L, 0.3, { w: 0.05, guard: false, guardC: C.brass }); },
    spear: { len: 1.2, tip: 0.2, c: C.iron },
  },
  egyptiens: {
    civilian: { torso: 'skin', torsoMat: 'skin', sleeve: 'skin', bareArms: true, bareLegs: true, boots: false, skirtC: C.white, skirtMat: 'cloth', skirtLen: 0.22, belt: false },
    hat(L) { L.push(P('coif', 'cloth', C.white, 'head', [0, 0.098, -0.004], [0.196, 0.21, 0.21])); },
    body() { return { torso: 'skin', torsoMat: 'skin', sleeve: 'skin', bareArms: true, bareLegs: true, boots: false, sandals: true, skirtC: C.white, skirtMat: 'cloth', skirtLen: 0.22, beltC: 'team' }; },
    armor(L, tier) {
      L.push(P('skirt', 'gold', tier === 'heavy' ? C.gold : 'team', 'body', [0, 0.375, 0.0], [0.28, 0.07, 0.21]));
      if (tier === 'medium') L.push(P('torso', 'cloth', C.linen, 'body', [0, 0.17, 0.002], [0.342, 0.33, 0.224]));
      if (tier === 'heavy') L.push(P('torso', 'mail', C.bronze, 'body', [0, 0.18, 0.003], [0.345, 0.36, 0.226]));
      L.push(P('box', 'cloth', 'team', 'hips', [0, -0.1, 0.12], [0.07, 0.2, 0.012]));
    },
    helm(L, tier) {
      if (tier === 'heavy') { L.push(P('helm', 'cloth', 0x2a4aa0, 'head', [0, 0.095, -0.01], [0.21, 0.3, 0.24])); L.push(P('sph', 'gold', C.gold, 'head', [0, 0.16, 0.11], [0.03, 0.05, 0.02], [0, 0, 0], D)); return; }
      L.push(P('coif', 'cloth', 'team', 'head', [0, 0.098, -0.004], [0.198, 0.212, 0.212]));
      for (const x of [-1, 1]) L.push(P('box', 'cloth', 'team', 'head', [x * 0.085, 0.02, 0.0], [0.04, 0.16, 0.08], [0.1, 0, x * 0.1]));
      L.push(P('cyl', 'gold', C.gold, 'head', [0, 0.15, -0.002], [0.2, 0.018, 0.214]));
    },
    shield(L) {
      L.push(P('box', 'paint', 'team', 'shield', [0, -0.04, 0.02], [0.24, 0.32, 0.035]));
      L.push(P('disc', 'paint', 'team', 'shield', [0, 0.12, 0.02], [0.24, 0.035, 0.24], [Math.PI / 2, 0, 0]));
      L.push(P('box', 'cloth', C.white, 'shield', [0.04, -0.02, 0.04], [0.08, 0.12, 0.004], [0, 0, 0.3], D));
      L.push(P('box', 'cloth', C.white, 'shield', [-0.05, -0.1, 0.04], [0.06, 0.08, 0.004], [0, 0, -0.4], D));
    },
    melee(L) { L.push(P('cyl', 'leather', C.leather, 'tool', [0, 0.0, 0], [0.024, 0.12, 0.024])); L.push(P('box', 'metal', C.bronze, 'tool', [0, 0.14, 0], [0.026, 0.16, 0.01])); L.push(P('hook', 'metal', C.bronze, 'tool', [-0.13, 0.22, 0], [0.26, 0.26, 0.2])); },
    spear: { len: 1.3, tip: 0.15, c: C.bronze },
  },
  incas: {
    civilian: { torso: 'team', sleeve: 'skin', bareArms: true, bareLegs: true, boots: false, sandals: true, skirtLen: 0.18 },
    hat(L) { L.push(P('hairCap', 'cloth', 'team', 'head', [0, 0.11, -0.004], [0.2, 0.22, 0.21])); L.push(P('cone', 'cloth', 'team', 'head', [0, 0.22, -0.01], [0.13, 0.1, 0.13])); for (const x of [-1, 1]) L.push(P('box', 'cloth', 'team', 'head', [x * 0.088, 0.05, -0.01], [0.02, 0.09, 0.06])); },
    body() { return { torso: 'team', sleeve: 'skin', bareArms: true, bareLegs: true, boots: false, sandals: true, skirtLen: 0.18 }; },
    armor(L, tier) {
      for (const y of [0.12, 0.2, 0.28]) L.push(P('box', 'cloth', C.gold, 'body', [0, y, 0.108], [0.2, 0.03, 0.012], [0, 0, 0], D));
      if (tier !== 'light') L.push(P('torso', 'cloth', C.linen, 'body', [0, 0.18, 0.002], [0.345, 0.34, 0.224]));
      if (tier === 'heavy') L.push(P('disc', 'gold', C.gold, 'body', [0, 0.24, 0.115], [0.12, 0.012, 0.12], [Math.PI / 2, 0, 0]));
      for (let i = 0; i < 6; i++) L.push(P('box', 'cloth', i % 2 ? C.gold : C.red, 'hips', [-0.12 + i * 0.048, -0.13, 0.12], [0.045, 0.04, 0.01], [0, 0, 0], D));
    },
    helm(L, tier) {
      if (tier === 'light') { L.push(P('cyl', 'cloth', 'team', 'head', [0, 0.14, 0], [0.19, 0.035, 0.2])); L.push(P('box', 'cloth', C.gold, 'head', [0, 0.25, -0.03], [0.028, 0.14, 0.012], [-0.25, 0, 0])); return; }
      helmBase(L, tier === 'heavy' ? 'gold' : 'wood', tier === 'heavy' ? C.gold : 0x8a6a40, 'helm', 0.13);
      for (let i = 0; i < 5; i++) L.push(P('box', 'cloth', [C.red, C.gold, 0x2a8a4a, C.gold, C.red][i], 'head', [-0.06 + i * 0.03, 0.28, -0.04], [0.022, 0.16, 0.008], [-0.3, 0, (-2 + i) * 0.18]));
      if (tier === 'heavy') L.push(P('disc', 'gold', C.gold, 'head', [0, 0.17, 0.105], [0.09, 0.012, 0.09], [Math.PI / 2, 0, 0]));
    },
    shield(L) {
      L.push(P('disc', 'paint', 'team', 'shield', [0, 0, 0.02], [0.22, 0.025, 0.22], [Math.PI / 2, 0, 0]));
      L.push(P('disc', 'cloth', C.gold, 'shield', [0, 0, 0.034], [0.11, 0.004, 0.11], [Math.PI / 2, 0, 0], D));
      for (let i = 0; i < 5; i++) L.push(P('box', 'cloth', i % 2 ? C.red : C.gold, 'shield', [-0.08 + i * 0.04, -0.16, 0.02], [0.025, 0.1, 0.006], [0, 0, (i - 2) * 0.15]));
    },
    melee(L) { L.push(P('cyl', 'wood', C.darkwood, 'tool', [0, 0.18, 0], [0.026, 0.46, 0.026])); L.push(P('dodec', 'metal', C.bronze, 'tool', [0, 0.42, 0], [0.11, 0.08, 0.11])); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; L.push(P('cone', 'metal', C.bronze, 'tool', [Math.cos(a) * 0.06, 0.42, Math.sin(a) * 0.06], [0.03, 0.06, 0.03], [0, -a, -Math.PI / 2], D)); } },
    spear: { len: 1.5, tip: 0.13, c: C.bronze },
  },
  japonais: {
    civilian: { torso: 0x4a5a6a, sleeve: 0x4a5a6a, legs: 0x3a3a40, skirtLen: 0.24 },
    hat(L) { L.push(P('cone', 'cloth', C.straw, 'head', [0, 0.2, 0], [0.46, 0.12, 0.46])); },
    body(tier) { return tier === 'light' ? { torso: 0x2a2a30, sleeve: 0x2a2a30, legs: 0x2a2a30, skirtLen: 0.26 } : { torso: 0x1e1e22, sleeve: 0x1e1e22, legs: 0x26262c, skirtLen: 0.28, gloves: 0x1e1e22 }; },
    armor(L, tier) {
      if (tier === 'light') { L.push(P('torso', 'leather', 0x2a2a30, 'body', [0, 0.18, 0.002], [0.342, 0.33, 0.222])); L.push(P('cyl', 'cloth', 'team', 'body', [0, 0.03, 0], [0.344, 0.04, 0.228])); return; }
      // dô laqué à laçage aux couleurs du joueur
      L.push(P('torso', 'metal', 0x1c1c22, 'body', [0, 0.2, 0.003], [0.35, 0.43, 0.228]));
      for (let i = 0; i < 4; i++) L.push(P('cyl', 'cloth', 'team', 'body', [0, 0.05 + i * 0.075, 0], [0.352 - (i === 3 ? 0.02 : 0), 0.014, 0.232]));
      for (let i = 0; i < 3; i++) L.push(P('skirt', 'metal', 0x1c1c22, 'hips', [0, -0.04 - i * 0.055, 0], [0.37 + i * 0.012, 0.06, 0.28]));
      L.push(P('skirt', 'cloth', 'team', 'hips', [0, -0.16, 0], [0.4, 0.014, 0.3]));
      for (const x of [-1, 1]) { L.push(P('box', 'metal', 0x1c1c22, 'arm' + (x < 0 ? 'L' : 'R'), [x * 0.02, -0.04, 0], [0.04, 0.13, 0.14], [0, 0, x * 0.2])); L.push(P('box', 'cloth', 'team', 'arm' + (x < 0 ? 'L' : 'R'), [x * 0.025, -0.06, 0], [0.045, 0.012, 0.145], [0, 0, x * 0.2], D)); }
      if (tier === 'heavy') { L.push(P('box', 'cloth', 'team', 'back', [0, 0.35, -0.12], [0.14, 0.24, 0.006])); L.push(P('cyl', 'wood', C.darkwood, 'back', [0.075, 0.28, -0.12], [0.01, 0.62, 0.01])); }
    },
    helm(L, tier) {
      if (tier === 'light') { L.push(P('cone', 'metal', 0x1c1c22, 'head', [0, 0.19, 0], [0.38, 0.1, 0.38])); return; }
      helmBase(L, 'metal', 0x1c1c22, 'helm', 0.135);
      L.push(P('skirt', 'metal', 0x1c1c22, 'head', [0, 0.06, -0.012], [0.3, 0.09, 0.3]));
      L.push(P('skirt', 'cloth', 'team', 'head', [0, 0.017, -0.012], [0.32, 0.012, 0.32]));
      if (tier === 'heavy') {
        for (const x of [-1, 1]) L.push(P('box', 'gold', C.gold, 'head', [x * 0.055, 0.25, 0.1], [0.018, 0.16, 0.012], [0.25, 0, x * -0.5]));
        L.push(P('box', 'metal', 0x6a1a14, 'head', [0, 0.055, 0.088], [0.12, 0.06, 0.03], [0, 0, 0], D));
      }
    },
    shield() {},
    melee(L, tier) { W.sword(L, tier === 'light' ? 0.4 : 0.5, { curved: true, w: 0.03, guardW: 0.06, guardC: C.gold }); },
    spear: { len: 1.5, tip: 0.18, c: C.steel },
  },
  vikings: {
    civilian: { torso: 0x5a6a48, sleeve: 0x5a6a48, legs: 0x6a5a44, hairStyle: 'braids' },
    hat() {},
    body(tier) { return { torso: 'team', sleeve: tier === 'light' ? 0x6a5a44 : 'team', legs: 0x6a5a44, hairStyle: 'braids', gloves: tier === 'heavy' ? C.leather : undefined }; },
    armor(L, tier) {
      if (tier === 'light') { L.push(P('fur', 'hair', C.fur, 'body', [0, 0.36, -0.01], [0.38, 0.12, 0.26])); return; }
      A.mailShirt(L, tier === 'heavy' ? 0.3 : 0.24, 0xa8aeb6);
      L.push(P('cyl', 'leather', C.belt, 'body', [0, 0.02, 0], [0.36, 0.045, 0.24]));
      if (tier === 'heavy') { A.cape(L, 'teamDk', 0.5); L.push(P('fur', 'hair', C.fur, 'body', [0, 0.38, -0.02], [0.38, 0.1, 0.26])); }
    },
    helm(L, tier) {
      if (tier === 'light') return;
      helmBase(L, 'metal', 0x8a9098, 'helm', 0.15);
      L.push(P('cyl', 'metal', 0x6a7078, 'head', [0, 0.1, 0], [0.214, 0.022, 0.224]));
      if (tier === 'heavy') for (const x of [-1, 1]) L.push(P('trim', 'metal', 0x6a7078, 'head', [x * 0.036, 0.115, 0.098], [0.06, 0.05, 0.5], [0, 0, 0]));
      else L.push(P('box', 'metal', 0x8a9098, 'head', [0, 0.09, 0.106], [0.02, 0.08, 0.012]));
    },
    shield(L) { S.round(L, 'team', 0.32, { half: C.white, rim: 0x3a3a3a }); },
    melee(L, tier) { if (tier === 'heavy') W.sword(L, 0.44); else W.axe(L, 0.52); },
    spear: { len: 1.35, tip: 0.18, c: C.steel },
  },
};
const kitOf = (civ) => KIT[civ] || KIT.francs;

// fantassin médiéval générique
function footman(L, civ, tier, weapon = 'melee', shield = true) {
  const K = kitOf(civ);
  const o = { ...K.body(tier), civ, hair: false };
  L.push(...human(o));
  K.armor(L, tier);
  K.helm(L, tier);
  if (weapon === 'melee') K.melee(L, tier);
  else if (weapon === 'spear') W.spear(L, K.spear.len, K.spear.tip, K.spear.c);
  if (shield) K.shield(L, tier);
}

// ------------------------------------------------------------------ cheval
function horse(L, coat, o = {}) {
  L.push(P('hbody', 'coat', coat, 'hbody', [0, 0, 0], [0.32, 0.38, 0.96]));
  L.push(P('sph', 'coat', coat, 'hbody', [0, 0.0, 0.29], [0.33, 0.38, 0.34]));
  L.push(P('sph', 'coat', coat, 'hbody', [0, 0.025, -0.29], [0.34, 0.38, 0.36]));
  // encolure, crinière, tête
  L.push(P('hneck', 'coat', coat, 'hneck', [0, 0.2, 0], [0.15, 0.46, 0.25]));
  L.push(P('fur', 'hair', o.mane ?? C.mane, 'hneck', [0.012, 0.21, -0.1], [0.045, 0.44, 0.07]));
  L.push(P('hhead', 'coat', coat, 'hhead', [0, -0.1, 0.14], [0.145, 0.36, 0.185], [-0.93, 0, 0]));
  L.push(P('box', 'hair', o.mane ?? C.mane, 'hhead', [0, 0.02, 0.04], [0.04, 0.06, 0.06], [0.6, 0, 0], D));
  for (const x of [-1, 1]) {
    L.push(P('cone', 'coat', coat, 'hhead', [x * 0.045, 0.06, -0.02], [0.03, 0.08, 0.022], [-0.1, 0, x * -0.25]));
    L.push(P('sph', 'gloss', C.eye, 'hhead', [x * 0.068, -0.045, 0.07], [0.022, 0.026, 0.026], [0, 0, 0], D));
    L.push(P('sph', 'gloss', 0x141010, 'hhead', [x * 0.03, -0.27, 0.26], [0.022, 0.016, 0.02], [0, 0, 0], D));
    // bride et rênes
    L.push(P('box', 'leather', C.belt, 'hhead', [x * 0.072, -0.12, 0.16], [0.008, 0.012, 0.2], [0.95, 0, 0], D));
    L.push(P('cyl', 'leather', C.belt, 'hneck', [x * 0.07, 0.24, 0.13], [0.007, 0.48, 0.007], [-0.16, 0, 0], D));
  }
  L.push(P('trim', 'leather', C.belt, 'hhead', [0, -0.19, 0.24], [0.14, 0.14, 1.5], [0.6435, 0, 0], D));
  // jambes
  for (const leg of ['FL', 'FR', 'BL', 'BR']) {
    const front = leg[0] === 'F';
    L.push(P('limb', 'coat', coat, 'hleg' + leg, [0, front ? -0.13 : -0.15, front ? 0 : -0.025], front ? [0.085, 0.165, 0.1] : [0.1, 0.19, 0.135]));
    L.push(P('calf', 'coat', coat, 'hshin' + leg, [0, -0.15, 0], [0.05, 0.155, 0.058]));
    const sock = o.socks && (leg === 'FL' || leg === 'BR');
    if (sock) L.push(P('cyl', 'coat', C.white, 'hshin' + leg, [0, -0.25, 0], [0.052, 0.1, 0.058]));
    L.push(P('sph', 'coat', sock ? C.white : coat, 'hshin' + leg, [0, -0.3, 0.004], [0.064, 0.06, 0.066]));
    L.push(P('hoof', 'leather', C.hoof, 'hshin' + leg, [0, -0.355, 0.012], [0.068, 0.065, 0.08]));
  }
  // queue
  L.push(P('sph', 'hair', o.mane ?? C.mane, 'tail', [0, -0.02, -0.01], [0.07, 0.09, 0.08]));
  L.push(P('fur', 'hair', o.mane ?? C.mane, 'tail', [0, -0.17, -0.015], [0.08, 0.3, 0.07]));
  L.push(P('fur', 'hair', o.mane ?? C.mane, 'tail', [0, -0.36, -0.02], [0.1, 0.22, 0.08]));
  // selle et tapis
  if (o.saddle !== false) {
    L.push(P('rbox', 'leather', C.leather, 'hbody', [0, 0.2, -0.04], [0.24, 0.08, 0.3]));
    L.push(P('rbox', 'leather', C.leather, 'hbody', [0, 0.235, 0.09], [0.12, 0.06, 0.05], [0, 0, 0], D));
    L.push(P('box', 'cloth', o.blanket ?? 'team', 'hbody', [0, 0.182, -0.04], [0.26, 0.02, 0.38]));
    for (const x of [-1, 1]) {
      L.push(P('box', 'cloth', o.blanket ?? 'team', 'hbody', [x * 0.15, 0.1, -0.04], [0.012, 0.17, 0.36], [0, 0, x * 0.32]));
      L.push(P('cyl', 'leather', C.belt, 'hbody', [x * 0.16, 0.04, 0.06], [0.01, 0.28, 0.01], [0, 0, x * 0.25], D));
    }
  }
  if (o.barding) {
    L.push(P('hbody', 'cloth', o.barding, 'hbody', [0, 0.01, 0.0], [0.37, 0.42, 1.04]));
    L.push(P('sph', 'cloth', o.barding, 'hbody', [0, 0.0, 0.29], [0.36, 0.41, 0.37]));
    L.push(P('sph', 'cloth', o.barding, 'hbody', [0, 0.025, -0.29], [0.37, 0.41, 0.39]));
    L.push(P('skirt', 'cloth', o.barding, 'hbody', [0, -0.14, 0.0], [0.385, 0.28, 1.06]));
    L.push(P('trim', 'gold', C.gold, 'hbody', [0, -0.278, 0], [0.39, 1.07, 1.2], [Math.PI / 2, 0, 0]));
    L.push(P('hneck', 'cloth', o.barding, 'hneck', [0, 0.17, 0.004], [0.165, 0.38, 0.265]));
  }
  if (o.chanfron) L.push(P('hhead', 'metal', C.steel, 'hhead', [0, -0.1, 0.152], [0.12, 0.3, 0.16], [-0.93, 0, 0]));
}

// cavalier assis (os du corps posés sur le cheval par l'animation)
function rider(L, o) {
  L.push(...human({ ...o, skirt: o.skirt ?? true }));
}

// ------------------------------------------------------------------ véhicules et machines (repris tels quels)
function machine(L, type) {
  const add = (...a) => L.push(...a);
  switch (type) {
    case 'ram':
      add(P('box', 'wood', C.wood, 'root', [0, 0.32, 0], [0.6, 0.1, 1.2]));
      for (const [x, z] of [[-0.3, -0.42], [0.3, -0.42], [-0.3, 0.42], [0.3, 0.42]]) add(P('disc', 'wood', 0x4a3220, 'root', [x, 0.2, z], [0.36, 0.06, 0.36], [0, 0, Math.PI / 2]));
      for (const [x, z] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]]) add(P('box', 'wood', C.wood, 'root', [x, 0.6, z], [0.07, 0.55, 0.07]));
      add(P('box', 'wood', 0x8a6038, 'root', [-0.2, 0.92, 0], [0.42, 0.05, 1.25], [0, 0, 0.75]));
      add(P('box', 'wood', 0x8a6038, 'root', [0.2, 0.92, 0], [0.42, 0.05, 1.25], [0, 0, -0.75]));
      add(P('fur', 'hair', 0x6a5238, 'root', [0, 1.02, 0], [0.3, 0.08, 1.2], [0, 0, 0], D));
      add(P('cyl', 'wood', 0x6b4a2a, 'tool', [0, 0, 0], [0.16, 1.4, 0.16], [Math.PI / 2, 0, 0]));
      add(P('cyl', 'metal', C.iron, 'tool', [0, 0, 0.72], [0.19, 0.14, 0.19], [Math.PI / 2, 0, 0]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.85, -0.62], [0.3, 0.2, 0.02]));
      break;
    case 'mangonel':
      add(P('box', 'wood', C.wood, 'root', [-0.25, 0.22, 0], [0.08, 0.08, 1.0])); add(P('box', 'wood', C.wood, 'root', [0.25, 0.22, 0], [0.08, 0.08, 1.0]));
      add(P('box', 'wood', C.wood, 'root', [0, 0.22, 0.4], [0.58, 0.07, 0.08])); add(P('box', 'wood', C.wood, 'root', [0, 0.22, -0.4], [0.58, 0.07, 0.08]));
      for (const [x, z] of [[-0.3, -0.35], [0.3, -0.35], [-0.3, 0.35], [0.3, 0.35]]) add(P('disc', 'wood', 0x4a3220, 'root', [x, 0.16, z], [0.3, 0.05, 0.3], [0, 0, Math.PI / 2]));
      add(P('box', 'wood', C.wood, 'root', [-0.2, 0.45, 0.05], [0.06, 0.5, 0.06], [-0.3, 0, 0])); add(P('box', 'wood', C.wood, 'root', [0.2, 0.45, 0.05], [0.06, 0.5, 0.06], [-0.3, 0, 0]));
      add(P('cyl', 'cloth', C.rope, 'root', [0, 0.3, -0.1], [0.12, 0.36, 0.12], [0, 0, Math.PI / 2]));
      add(P('box', 'wood', 0x6b4a2a, 'tool', [0, 0.38, 0], [0.07, 0.8, 0.07]));
      add(P('hemi', 'wood', 0x5a3d22, 'tool', [0, 0.78, 0], [0.18, 0.1, 0.18], [Math.PI, 0, 0]));
      add(P('sph', 'wood', 0x8a8a8a, 'tool', [0, 0.82, 0], [0.12, 0.12, 0.12]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.32, -0.42], [0.25, 0.14, 0.02]));
      break;
    case 'bombard':
      add(P('box', 'wood', C.wood, 'root', [0, 0.25, -0.1], [0.4, 0.14, 0.9]));
      for (const x of [-0.27, 0.27]) add(P('wheel', 'wood', 0x4a3220, 'root', [x, 0.24, 0.12], [0.46, 0.46, 0.46], [0, Math.PI / 2, 0]));
      add(P('cyl', 'metal', C.iron, 'tool', [0, 0, 0], [0.22, 0.95, 0.22], [Math.PI / 2, 0, 0]));
      for (let i = 0; i < 4; i++) add(P('cyl', 'metal', 0x2a2a2e, 'tool', [0, 0, -0.35 + i * 0.22], [0.235, 0.04, 0.235], [Math.PI / 2, 0, 0]));
      add(P('cyl', 'metal', 0x2a2a2e, 'tool', [0, 0, 0.47], [0.27, 0.1, 0.27], [Math.PI / 2, 0, 0]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.42, -0.5], [0.25, 0.14, 0.02]));
      break;
    case 'trebuchet':
      for (const x of [-0.32, 0.32]) {
        add(P('box', 'wood', C.wood, 'root', [x, 0.1, 0], [0.08, 0.08, 1.6]));
        add(P('box', 'wood', C.wood, 'root', [x, 0.62, -0.25], [0.07, 1.1, 0.07], [-0.45, 0, 0])); add(P('box', 'wood', C.wood, 'root', [x, 0.62, 0.25], [0.07, 1.1, 0.07], [0.45, 0, 0]));
      }
      add(P('box', 'wood', C.wood, 'root', [0, 0.1, 0.7], [0.72, 0.08, 0.08])); add(P('box', 'wood', C.wood, 'root', [0, 0.1, -0.7], [0.72, 0.08, 0.08]));
      add(P('cyl', 'wood', 0x5a3d22, 'root', [0, 1.12, 0], [0.06, 0.8, 0.06], [0, 0, Math.PI / 2]));
      for (const [x, z] of [[-0.36, -0.6], [0.36, -0.6], [-0.36, 0.6], [0.36, 0.6]]) add(P('wheel', 'wood', 0x4a3220, 'root', [x, 0.14, z], [0.26, 0.26, 0.26], [0, Math.PI / 2, 0]));
      add(P('box', 'wood', 0x6b4a2a, 'tool', [0, 0, 0.45], [0.08, 0.08, 1.9]));
      add(P('box', 'wood', 0x4a3a2a, 'tool', [0, -0.12, -0.5], [0.34, 0.3, 0.3]));
      add(P('cyl', 'cloth', C.rope, 'tool', [0, -0.25, 1.38], [0.012, 0.5, 0.012]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.3, -0.75], [0.3, 0.18, 0.02]));
      break;
    case 'cannon':
    case 'field_gun': {
      const steel = type === 'cannon' ? 0xa07838 : 0x5a5e62;
      add(P('box', 'wood', type === 'cannon' ? C.wood : 0x4a4e40, 'root', [0, 0.18, -0.35], [0.16, 0.1, 0.8], [0.25, 0, 0]));
      for (const x of [-0.27, 0.27]) {
        add(P('wheel', 'wood', type === 'cannon' ? 0x5a3d22 : 0x2a2a2a, 'root', [x, 0.27, 0.05], [0.5, 0.5, 0.5], [0, Math.PI / 2, 0]));
        for (let k = 0; k < 3; k++) add(P('cyl', 'wood', 0x5a3d22, 'root', [x, 0.27, 0.05], [0.025, 0.46, 0.025], [k * Math.PI / 3, 0, 0]));
      }
      add(P('cyl', 'metal', 0x3a3a3a, 'root', [0, 0.27, 0.05], [0.04, 0.6, 0.04], [0, 0, Math.PI / 2]));
      add(P('cyl', 'metal', steel, 'tool', [0, 0, 0.2], [0.15, 0.85, 0.15], [Math.PI / 2, 0, 0]));
      add(P('cyl', 'metal', steel, 'tool', [0, 0, 0.62], [0.18, 0.06, 0.18], [Math.PI / 2, 0, 0]));
      add(P('sph', 'metal', steel, 'tool', [0, 0, -0.24], [0.17, 0.17, 0.17]));
      if (type === 'field_gun') add(P('box', 'metal', 0x4a4e40, 'root', [0, 0.45, 0.32], [0.6, 0.4, 0.03]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.3, -0.65], [0.2, 0.12, 0.02]));
      break;
    }
    case 'tank': {
      const hull = 0x55603a;
      add(P('box', 'metal', hull, 'root', [0, 0.32, 0], [0.82, 0.24, 1.3]));
      add(P('box', 'metal', hull, 'root', [0, 0.32, 0.72], [0.78, 0.16, 0.2], [0.6, 0, 0]));
      for (const x of [-0.46, 0.46]) {
        add(P('box', 'metal', 0x26282a, 'root', [x, 0.2, 0], [0.2, 0.3, 1.45]));
        for (let i = 0; i < 5; i++) add(P('cyl', 'metal', 0x3a3c3e, 'root', [x * 1.04, 0.15, -0.56 + i * 0.28], [0.17, 0.08, 0.17], [0, 0, Math.PI / 2]));
        add(P('box', 'metal', hull, 'root', [x * 0.98, 0.37, 0], [0.22, 0.03, 1.4]));
      }
      add(P('box', 'cloth', 'team', 'root', [0, 0.45, -0.2], [0.84, 0.03, 0.12]));
      add(P('cyl', 'metal', hull, 'tool', [0, 0.1, 0], [0.55, 0.22, 0.6])); add(P('box', 'metal', hull, 'tool', [0, 0.1, -0.18], [0.4, 0.2, 0.3]));
      add(P('cyl', 'metal', 0x3a3e30, 'tool', [0, 0.12, 0.6], [0.07, 0.75, 0.07], [Math.PI / 2, 0, 0]));
      add(P('cyl', 'metal', 0x3a3e30, 'tool', [0, 0.12, 0.98], [0.1, 0.1, 0.1], [Math.PI / 2, 0, 0]));
      add(P('cyl', 'metal', hull, 'tool', [0.12, 0.24, -0.05], [0.12, 0.05, 0.12]));
      add(P('cyl', 'metal', 0x202020, 'tool', [-0.18, 0.5, -0.2], [0.008, 0.6, 0.008]));
      add(P('box', 'cloth', 'team', 'tool', [0, 0.22, -0.32], [0.3, 0.02, 0.02]));
      break;
    }
    case 'bomber': {
      const body = 0x6a7268;
      add(P('cap', 'metal', body, 'root', [0, 0, 0], [0.3, 0.75, 0.3], [Math.PI / 2, 0, 0]));
      add(P('sph', 'gloss', 0x9ac8e8, 'root', [0, 0.12, 0.38], [0.18, 0.12, 0.3]));
      add(P('box', 'metal', body, 'root', [0, -0.02, 0.05], [2.4, 0.05, 0.42]));
      add(P('box', 'cloth', 'team', 'root', [-0.95, 0.005, 0.05], [0.3, 0.06, 0.43])); add(P('box', 'cloth', 'team', 'root', [0.95, 0.005, 0.05], [0.3, 0.06, 0.43]));
      add(P('box', 'metal', body, 'root', [0, 0.02, -0.68], [0.9, 0.04, 0.22])); add(P('box', 'metal', body, 'root', [0, 0.18, -0.7], [0.04, 0.34, 0.24]));
      add(P('box', 'cloth', 'team', 'root', [0, 0.2, -0.7], [0.05, 0.16, 0.16]));
      for (const x of [-0.6, 0.6]) { add(P('cap', 'metal', 0x4a4e4a, 'root', [x, -0.07, 0.2], [0.14, 0.24, 0.14], [Math.PI / 2, 0, 0])); add(P('box', 'metal', 0x202020, 'root', [x, -0.07, 0.48], [0.6, 0.04, 0.02])); }
      add(P('cap', 'metal', 0x303030, 'root', [0, -0.2, 0.05], [0.1, 0.25, 0.1], [Math.PI / 2, 0, 0]));
      add(P('box', 'metal', 0x202020, 'tool', [0, 0, 0], [0.6, 0.05, 0.02])); add(P('box', 'metal', 0x202020, 'tool', [0, 0, 0], [0.05, 0.6, 0.02]));
      break;
    }
    case 'drone': {
      add(P('rbox', 'metal', 0x2a2e34, 'root', [0, 0, 0], [0.3, 0.1, 0.38])); add(P('sph', 'glow', 'team', 'root', [0, -0.02, 0.2], [0.08, 0.06, 0.06]));
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        add(P('box', 'metal', 0x3a3e44, 'root', [x * 0.2, 0.02, z * 0.2], [0.05, 0.03, 0.34], [0, Math.atan2(x, z), 0]));
        add(P('disc', 'cloth', 'team', 'root', [x * 0.32, 0.06, z * 0.32], [0.3, 0.01, 0.3]));
        add(P('cyl', 'metal', 0x202020, 'root', [x * 0.32, 0.03, z * 0.32], [0.04, 0.06, 0.04]));
      }
      add(P('box', 'metal', 0x202428, 'tool', [0, -0.06, 0.05], [0.06, 0.06, 0.3])); add(P('cyl', 'glow', 'team', 'tool', [0, -0.06, 0.22], [0.025, 0.04, 0.025], [Math.PI / 2, 0, 0]));
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------------ description de chaque unité
export function unitParts(type, civ = 'francs') {
  const L = [];
  const K = kitOf(civ);
  switch (type) {
    case 'villager': {
      const o = { ...K.civilian, civ };
      L.push(...human(o));
      if (civ === 'francs' || civ === 'vikings') L.push(P('box', 'cloth', C.linen, 'hips', [0, -0.08, 0.118], [0.22, 0.22, 0.012], [0.08, 0, 0], D)); // tablier
      K.hat(L, [0, 2]);
      A.pouch(L, -0.13);
      // outils (selon l'activité)
      const T = (pt, tool) => L.push({ ...pt, tool });
      T(P('cyl', 'wood', C.wood, 'tool', [0, 0.16, 0], [0.024, 0.46, 0.024]), 'axe');
      T(P('axe', 'metal', C.steel, 'tool', [0, 0.34, 0.012], [0.2, 0.22, 0.35], [0, -Math.PI / 2, 0]), 'axe');
      T(P('cyl', 'wood', C.wood, 'tool', [0, 0.16, 0], [0.024, 0.46, 0.024]), 'pick');
      T(P('box', 'metal', C.darkmetal, 'tool', [0, 0.36, 0], [0.03, 0.03, 0.3], [0.12, 0, 0]), 'pick');
      T(P('cone', 'metal', C.darkmetal, 'tool', [0, 0.38, 0.17], [0.03, 0.06, 0.03], [Math.PI / 2, 0, 0]), 'pick');
      T(P('cyl', 'wood', C.wood, 'tool', [0, 0.1, 0], [0.022, 0.32, 0.022]), 'hammer');
      T(P('box', 'metal', C.darkmetal, 'tool', [0, 0.25, 0], [0.05, 0.05, 0.12]), 'hammer');
      T(P('cyl', 'wood', C.wood, 'tool', [0, 0.22, 0], [0.02, 0.62, 0.02]), 'hoe');
      T(P('box', 'metal', C.darkmetal, 'tool', [0, 0.52, 0.04], [0.11, 0.025, 0.09], [0.3, 0, 0]), 'hoe');
      T(P('cyl', 'wood', C.straw, 'tool', [0, -0.06, 0.06], [0.16, 0.1, 0.16]), 'basket');
      T(P('trim', 'wood', C.wood, 'tool', [0, 0.0, 0.06], [0.14, 0.14, 2], [0, Math.PI / 2, 0]), 'basket');
      // chargement porté
      const K2 = (pt, carry) => L.push({ ...pt, carry });
      for (let i = 0; i < 3; i++) K2(P('cyl', 'wood', C.wood, 'back', [-0.06 + i * 0.06, 0.06 + (i % 2) * 0.05, -0.16], [0.06, 0.38, 0.06], [0, 0, Math.PI / 2]), 'wood');
      K2(P('rbox', 'cloth', C.linen, 'back', [0, 0.04, -0.15], [0.18, 0.2, 0.12]), 'gold');
      K2(P('dodec', 'gold', C.gold, 'back', [0, 0.16, -0.15], [0.1, 0.08, 0.08]), 'gold');
      K2(P('dodec', 'wood', 0x9a9a98, 'back', [0, 0.06, -0.17], [0.2, 0.16, 0.16]), 'stone');
      K2(P('cyl', 'wood', C.straw, 'back', [0, 0.04, -0.16], [0.18, 0.16, 0.16]), 'food');
      K2(P('sph', 'cloth', 0xc04a36, 'back', [0, 0.13, -0.16], [0.16, 0.08, 0.14]), 'food');
      break;
    }
    case 'militia': footman(L, civ, 'light'); break;
    case 'spearman': footman(L, civ, 'light', 'spear'); break;
    case 'swordsman': footman(L, civ, 'medium'); break;
    case 'champion': footman(L, civ, 'heavy'); break;
    case 'royal_guard':
      L.push(...human({ torso: C.linen, legs: C.darkmetal, legMat: 'mail', gloves: C.darkmetal, hair: false, civ }));
      A.mailShirt(L, 0.2); A.plate(L, 0xd8dde4); A.cape(L, 'team', 0.56);
      L.push(P('box', 'gold', C.gold, 'body', [0, 0.28, 0.12], [0.07, 0.07, 0.015], [0, 0, Math.PI / 4]));
      A.coif(L);
      L.push(P('helm', 'metal', 0xd8dde4, 'head', [0, 0.09, -0.004], [0.21, 0.15, 0.22]));
      L.push(P('box', 'metal', C.black, 'head', [0, 0.12, 0.104], [0.14, 0.012, 0.01], [0, 0, 0], D));
      L.push(P('cyl', 'gold', C.gold, 'head', [0, 0.19, 0], [0.18, 0.04, 0.19]));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; L.push(P('cone', 'gold', C.gold, 'head', [Math.cos(a) * 0.085, 0.225, Math.sin(a) * 0.09], [0.022, 0.04, 0.022], [0, 0, 0], D)); }
      L.push(P('cyl', 'wood', C.darkwood, 'tool', [0, 0.32, 0], [0.024, 1.45, 0.024]));
      L.push(P('axe', 'metal', C.steel, 'tool', [0, 0.92, 0.012], [0.26, 0.3, 0.3], [0, -Math.PI / 2, 0]));
      L.push(P('leaf', 'metal', C.steel, 'tool', [0, 1.1, 0], [0.04, 0.2, 0.014]));
      L.push(P('cone', 'metal', C.steel, 'tool', [0, 0.95, -0.07], [0.03, 0.1, 0.03], [-Math.PI / 2, 0, 0]));
      break;
    case 'archer': {
      const o = { ...K.body('light'), civ, hair: civ === 'egyptiens' || civ === 'incas' ? undefined : false };
      L.push(...human(o));
      if (civ === 'francs' || civ === 'vikings') {
        L.push(P('coif', 'cloth', 'teamDk', 'head', [0, 0.098, -0.004], [0.2, 0.215, 0.212]));
        L.push(P('skirt', 'cloth', 'teamDk', 'body', [0, 0.38, 0], [0.3, 0.1, 0.26]));
        L.push(P('cone', 'cloth', 'teamDk', 'head', [0, 0.12, -0.13], [0.06, 0.18, 0.05], [-1.9, 0, 0]));
      } else if (civ === 'japonais') K.helm(L, 'light');
      else if (civ === 'romains') K.helm(L, 'light');
      else if (civ === 'egyptiens') K.helm(L, 'light');
      else K.helm(L, 'light');
      L.push(P('torso', 'leather', C.leather, 'body', [0, 0.17, 0.002], [0.342, 0.3, 0.222]));
      L.push(P('calf', 'leather', C.leather, 'foreL', [0, -0.08, 0], [0.06, 0.05, 0.062], [0, 0, 0], D));
      A.quiver(L);
      W.bow(L, civ === 'japonais' ? 0x2a1a12 : C.wood);
      break;
    }
    case 'crossbowman':
      L.push(...human({ ...K.body('light'), torso: civ === 'francs' ? C.linen : K.body('light').torso, civ, hair: false }));
      if (civ === 'francs') { L.push(P('torso', 'cloth', 'team', 'body', [0, 0.17, 0.003], [0.345, 0.33, 0.226])); for (let i = 0; i < 4; i++) L.push(P('cyl', 'cloth', 0xbfb498, 'body', [0, 0.08 + i * 0.07, 0], [0.346, 0.01, 0.227], [0, 0, 0], D)); }
      else K.armor(L, 'light');
      if (civ === 'francs') { helmBase(L, 'metal', C.darkmetal); L.push(P('disc', 'metal', C.darkmetal, 'head', [0, 0.118, 0], [0.36, 0.012, 0.36])); }
      else K.helm(L, 'light');
      L.push(P('cyl', 'leather', C.leather, 'body', [0.15, -0.06, 0.02], [0.06, 0.18, 0.06], [0, 0, 0.2]));
      L.push(P('box', 'paint', 'team', 'back', [0, 0.02, -0.14], [0.3, 0.46, 0.04], [0.12, 0, 0]));
      L.push(P('box', 'gold', C.gold, 'back', [0, 0.05, -0.165], [0.06, 0.06, 0.01], [0.12, 0, Math.PI / 4], D));
      W.crossbow(L);
      break;
    case 'skirmisher':
      L.push(...human({ ...K.body('light'), civ }));
      L.push(P('torso', 'leather', C.leather, 'body', [0, 0.17, 0.002], [0.342, 0.3, 0.222]));
      L.push(P('cyl', 'wood', C.wood, 'tool', [0, 0.28, 0], [0.018, 0.85, 0.018])); L.push(P('leaf', 'metal', C.steel, 'tool', [0, 0.74, 0], [0.035, 0.09, 0.012]));
      S.round(L, 'teamDk', 0.17);
      L.push(P('cyl', 'leather', C.leather, 'back', [0.06, 0.02, -0.13], [0.07, 0.26, 0.07], [0.2, 0, 0.25]));
      for (let i = 0; i < 4; i++) L.push(P('cyl', 'wood', C.wood, 'back', [0.0 + i * 0.03, 0.22, -0.11], [0.012, 0.5, 0.012], [0.2, 0, 0.25]));
      break;
    // ---------------------------------------------------------------- cavalerie
    case 'scout':
    case 'knight':
    case 'paladin':
    case 'cuirassier':
    case 'dragoon': {
      const coat = { scout: C.bay, knight: C.dark, paladin: C.grey, cuirassier: C.dark, dragoon: C.chestnut }[type];
      horse(L, coat, {
        barding: type === 'knight' ? 'team' : type === 'paladin' ? 'team' : null, chanfron: type === 'paladin',
        socks: type === 'scout' || type === 'dragoon', mane: type === 'paladin' ? 0xd8d0c0 : undefined, blanket: type === 'cuirassier' ? C.red : 'team',
      });
      if (type === 'scout') {
        rider(L, { ...K.body('light'), civ, legs: C.leather });
        L.push(P('torso', 'leather', C.leather, 'body', [0, 0.17, 0.002], [0.342, 0.32, 0.222]));
        if (civ === 'francs' || civ === 'vikings') L.push(P('cape', 'cloth', 'teamDk', 'cape', [0, 0, 0], [0.3, 0.32, 0.5]));
        K.melee(L, 'light');
      } else if (type === 'knight' || type === 'paladin') {
        rider(L, { ...K.body('heavy'), civ, hair: false });
        K.armor(L, type === 'paladin' ? 'heavy' : 'medium');
        K.helm(L, type === 'paladin' ? 'heavy' : 'medium');
        if (type === 'paladin') plume(L, C.white, 0.23);
        // lance avec fanion
        L.push(P('cone', 'paint', 'team', 'tool', [0, 0.6, 0], [0.05, 1.7, 0.05]));
        L.push(P('cone', 'metal', C.steel, 'tool', [0, 0.1, 0], [0.09, 0.1, 0.09], [Math.PI, 0, 0]));
        L.push(P('cyl', 'wood', C.darkwood, 'tool', [0, -0.1, 0], [0.03, 0.3, 0.03]));
        L.push(P('box', 'cloth', 'team', 'tool', [0, 1.22, -0.07], [0.01, 0.1, 0.14], [0, 0, 0], D));
        K.shield(L, 'medium');
      } else if (type === 'cuirassier') {
        rider(L, { torso: 0xd8c8a0, sleeve: 0xd8c8a0, legs: 0xd8c8a0, boots: 0x1c1610, gloves: C.leather, civ, hair: false });
        L.push(P('torso', 'metal', 0x2a2c30, 'body', [0, 0.2, 0.004], [0.35, 0.43, 0.23]));
        L.push(P('box', 'cloth', C.red, 'body', [0, 0.02, 0.0], [0.36, 0.04, 0.24], [0, 0, 0.25]));
        helmBase(L, 'metal', 0x2a2c30, 'helm', 0.14);
        L.push(P('box', 'metal', 0x2a2c30, 'head', [0, 0.06, -0.1], [0.17, 0.1, 0.04], [-0.5, 0, 0]));
        L.push(P('box', 'metal', 0x2a2c30, 'head', [0, 0.12, 0.11], [0.12, 0.012, 0.06], [0.3, 0, 0]));
        W.sword(L, 0.52, { w: 0.03, guardC: C.brass });
      } else {
        rider(L, { torso: 'team', sleeve: 'team', legs: C.white, boots: 0x1c1610, gloves: C.leather, civ, skirtLen: 0.3 });
        for (const z of [1, -1]) L.push(P('box', 'cloth', C.white, 'body', [0, 0.2, z * 0.112], [0.04, 0.42, 0.01], [0, 0, z * 0.6], D));
        L.push(P('cyl', 'cloth', C.felt, 'head', [0, 0.19, -0.004], [0.23, 0.05, 0.23]));
        L.push(P('helm', 'cloth', C.felt, 'head', [0, 0.17, -0.004], [0.19, 0.12, 0.2]));
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 2; L.push(P('box', 'cloth', C.felt, 'head', [Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1], [0.16, 0.06, 0.012], [0, -a + Math.PI / 2, 0])); }
        W.rifle(L);
      }
      break;
    }
    case 'chariot': {
      horse(L, C.bay, { saddle: false, blanket: 'team' });
      L.push(P('box', 'cloth', 'team', 'hbody', [0, 0.182, 0.0], [0.26, 0.02, 0.5]));
      for (const x of [-1, 1]) L.push(P('box', 'cloth', 'team', 'hbody', [x * 0.15, 0.1, 0.0], [0.012, 0.17, 0.48], [0, 0, x * 0.32]));
      L.push(P('cone', 'cloth', 'team', 'hhead', [0, 0.14, 0.0], [0.05, 0.14, 0.05]));
      L.push(P('box', 'wood', 0xa8783a, 'hbody', [0, -0.4, -0.88], [0.62, 0.3, 0.42]));
      L.push(P('box', 'gold', C.gold, 'hbody', [0, -0.25, -0.67], [0.64, 0.05, 0.03]));
      L.push(P('cyl', 'wood', C.wood, 'hbody', [0, -0.36, -0.42], [0.035, 0.7, 0.035], [Math.PI / 2 + 0.1, 0, 0]));
      for (const x of [-0.36, 0.36]) {
        L.push(P('wheel', 'wood', 0x5a3d22, 'hbody', [x, -0.525, -0.9], [0.56, 0.56, 0.56], [0, Math.PI / 2, 0]));
        for (let k = 0; k < 3; k++) L.push(P('cyl', 'wood', 0x5a3d22, 'hbody', [x, -0.525, -0.9], [0.02, 0.52, 0.02], [k * Math.PI / 3, 0, 0]));
        L.push(P('cyl', 'gold', C.gold, 'hbody', [x, -0.525, -0.9], [0.06, 0.06, 0.06], [0, 0, Math.PI / 2]));
      }
      L.push(...human({ ...KIT.egyptiens.body(), civ: 'egyptiens' }));
      KIT.egyptiens.armor(L, 'medium');
      KIT.egyptiens.helm(L, 'heavy');
      A.quiver(L);
      W.bow(L);
      break;
    }
    case 'legionary':
      L.push(...human({ ...KIT.romains.body('medium'), civ: 'romains', hair: false }));
      KIT.romains.armor(L, 'medium'); KIT.romains.helm(L, 'medium');
      S.scutum(L); KIT.romains.melee(L);
      L.push(P('cyl', 'wood', C.wood, 'back', [0.1, 0.1, -0.13], [0.016, 0.9, 0.016], [0.25, 0, 0.3]));
      break;
    case 'samurai':
      L.push(...human({ ...KIT.japonais.body('heavy'), civ: 'japonais', hair: false }));
      KIT.japonais.armor(L, 'heavy'); KIT.japonais.helm(L, 'heavy');
      W.sword(L, 0.56, { curved: true, w: 0.032, guardW: 0.07, guardC: C.gold });
      L.push(P('cyl', 'cloth', 0x2a2a2a, 'body', [0.16, -0.0, -0.02], [0.022, 0.5, 0.022], [1.15, 0, 0.35]));
      break;
    case 'berserker':
      L.push(...human({ torso: 'skin', torsoMat: 'skin', sleeve: 'skin', bareArms: true, legs: 0x5a4a34, skirtC: 0x4a3424, skirtMat: 'leather', civ: 'vikings', hair: false, beard: [0, 1, 2, 3] }));
      L.push(P('cyl', 'cloth', 'team', 'body', [0, 0.02, 0], [0.345, 0.07, 0.235]));
      L.push(P('fur', 'hair', 0x4a3424, 'body', [0, 0.37, -0.03], [0.42, 0.14, 0.3]));
      L.push(P('cape', 'hair', 0x4a3424, 'cape', [0, 0, 0], [0.4, 0.46, 0.6]));
      L.push(P('hairCap', 'hair', 0x4a3424, 'head', [0, 0.11, -0.01], [0.22, 0.24, 0.23]));
      for (const x of [-1, 1]) L.push(P('sph', 'hair', 0x4a3424, 'head', [x * 0.07, 0.21, 0.02], [0.04, 0.04, 0.03], [0, 0, 0], D));
      L.push(P('box', 'cloth', 'teamDk', 'head', [0, 0.117, 0.075], [0.15, 0.022, 0.03], [0, 0, 0], D));
      W.axe(L, 0.5);
      L.push(P('cyl', 'wood', C.wood, 'shield', [0, 0.1, 0.0], [0.024, 0.44, 0.024], [0.3, 0, 0]));
      L.push(P('axe', 'metal', C.steel, 'shield', [0, 0.3, 0.07], [0.2, 0.22, 0.35], [0.3, -Math.PI / 2, 0]));
      break;
    case 'slinger':
      L.push(...human({ ...KIT.incas.body(), civ: 'incas' }));
      KIT.incas.armor(L, 'light'); KIT.incas.helm(L, 'light');
      L.push(P('cyl', 'cloth', C.rope, 'tool', [0, 0.16, 0], [0.01, 0.32, 0.01]));
      L.push(P('sph', 'leather', C.leather, 'tool', [0, 0.33, 0], [0.05, 0.04, 0.05]));
      L.push(P('rbox', 'cloth', 'team', 'body', [0.14, -0.04, 0.04], [0.08, 0.09, 0.06]));
      break;
    // ---------------------------------------------------------------- âges de la poudre et modernes
    case 'musketeer':
      L.push(...human({ torso: 'team', sleeve: 'team', legs: 0x4a3a2a, boots: 0x2a1e14, gloves: C.leather, civ, hair: true, hairStyle: 'long', skirtLen: 0.26 }));
      L.push(P('torso', 'leather', 0x8a6a40, 'body', [0, 0.17, 0.004], [0.345, 0.36, 0.226]));
      L.push(P('box', 'leather', C.belt, 'body', [0, 0.2, 0.115], [0.04, 0.44, 0.012], [0, 0, 0.62]));
      for (let i = 0; i < 4; i++) L.push(P('cyl', 'wood', 0x6a4a2a, 'body', [-0.12 + i * 0.05, 0.22 - i * 0.06, 0.13], [0.018, 0.05, 0.018], [0, 0, 0.62], D));
      L.push(P('disc', 'cloth', C.felt, 'head', [0, 0.17, 0], [0.42, 0.016, 0.42], [0.12, 0, 0.05]));
      L.push(P('helm', 'cloth', C.felt, 'head', [0, 0.17, -0.004], [0.19, 0.11, 0.2]));
      L.push(P('cone', 'cloth', 'team', 'head', [0.1, 0.26, -0.06], [0.04, 0.22, 0.06], [-0.6, 0, -0.45]));
      W.musket(L);
      break;
    case 'fusilier':
      L.push(...human({ torso: 'team', sleeve: 'team', legs: C.white, shins: 0x1c1c1c, shinMat: 'leather', boots: 0x141414, civ, hair: false, skirtLen: 0.3 }));
      for (const z of [1, -1]) L.push(P('box', 'cloth', C.white, 'body', [0, 0.2, z * 0.114], [0.045, 0.44, 0.01], [0, 0, z * 0.62]));
      L.push(P('box', 'cloth', C.white, 'body', [0, 0.16, 0.11], [0.12, 0.3, 0.006]));
      for (const s of ['L', 'R']) L.push(P('cyl', 'cloth', C.red, 'fore' + s, [0, -0.13, 0], [0.062, 0.04, 0.064], [0, 0, 0], D));
      L.push(P('cyl', 'cloth', C.black, 'head', [0, 0.22, -0.004], [0.19, 0.18, 0.2]));
      L.push(P('box', 'leather', 0x101010, 'head', [0, 0.14, 0.1], [0.16, 0.012, 0.07], [0.15, 0, 0]));
      L.push(P('sph', 'cloth', 'team', 'head', [0, 0.33, 0.07], [0.05, 0.07, 0.05]));
      L.push(P('disc', 'gold', C.brass, 'head', [0, 0.22, 0.1], [0.06, 0.006, 0.06], [Math.PI / 2, 0, 0], D));
      L.push(P('rbox', 'leather', 0x1a1a1a, 'back', [0, 0.0, -0.13], [0.22, 0.24, 0.08]));
      W.musket(L, { bayonet: true });
      break;
    case 'soldier':
    case 'machine_gunner':
      L.push(...human({ torso: C.olive, sleeve: C.olive, legs: 0x4a5232, boots: 0x2a2018, civ, hair: false, skirt: false }));
      L.push(P('cyl', 'cloth', 'team', 'armL', [0, -0.06, 0], [0.072, 0.04, 0.074]));
      L.push(P('helm', 'metal', 0x4a5530, 'head', [0, 0.095, -0.004], [0.23, 0.15, 0.24]));
      L.push(P('disc', 'metal', 0x4a5530, 'head', [0, 0.1, 0], [0.27, 0.01, 0.28]));
      L.push(P('box', 'cloth', 0x6a6440, 'body', [0, 0.04, 0.1], [0.3, 0.07, 0.05]));
      for (const z of [1, -1]) L.push(P('box', 'cloth', 0x6a6440, 'body', [0, 0.22, z * 0.11], [0.04, 0.4, 0.01], [0, 0, z * 0.2]));
      L.push(P('rbox', 'cloth', 0x5a5230, 'back', [0, 0.04, -0.14], [0.24, 0.26, 0.11]));
      L.push(P('rbox', 'cloth', 0x5a5230, 'back', [0, -0.13, -0.14], [0.2, 0.06, 0.08]));
      L.push(P('cyl', 'cloth', 0x3a3a2a, 'body', [-0.13, -0.02, -0.08], [0.06, 0.12, 0.06], [0, 0, 0], D));
      if (type === 'soldier') W.rifle(L);
      else { W.mg(L); for (let i = 0; i < 6; i++) L.push(P('box', 'gold', 0xb08a3a, 'body', [-0.12 + i * 0.048, 0.24 - i * 0.04, 0.12], [0.02, 0.05, 0.02], [0, 0, 0.7], D)); }
      break;
    case 'exo_soldier': {
      const w = 0xdfe4ea;
      L.push(...human({ torso: 0x8a9098, torsoMat: 'metal', sleeve: 0x8a9098, legs: 0x6a7078, legMat: 'metal', boots: w, bootMat: 'metal', gloves: 0x4a5058, civ, hair: false, skirt: false }));
      L.push(P('torso', 'metal', w, 'body', [0, 0.21, 0.01], [0.38, 0.38, 0.27]));
      L.push(P('box', 'glow', 'team', 'body', [0, 0.25, 0.145], [0.14, 0.03, 0.01]));
      for (const s of ['L', 'R']) {
        L.push(P('sph', 'metal', w, 'arm' + s, [0, 0.0, 0], [0.15, 0.12, 0.15]));
        L.push(P('calf', 'metal', w, 'fore' + s, [0, -0.07, 0], [0.068, 0.075, 0.07]));
        L.push(P('calf', 'metal', w, 'shin' + s, [0, -0.1, 0.004], [0.084, 0.11, 0.086]));
        L.push(P('rbox', 'metal', w, 'leg' + s, [0, -0.1, 0.02], [0.1, 0.17, 0.1]));
        L.push(P('box', 'glow', 'team', 'shin' + s, [0, -0.05, 0.045], [0.03, 0.06, 0.006], [0, 0, 0], D));
      }
      L.push(P('sph', 'metal', w, 'head', [0, 0.11, 0], [0.23, 0.24, 0.24]));
      L.push(P('rbox', 'gloss', 0x101418, 'head', [0, 0.115, 0.08], [0.17, 0.07, 0.08]));
      L.push(P('box', 'glow', 'team', 'head', [0, 0.115, 0.122], [0.13, 0.014, 0.006], [0, 0, 0], D));
      L.push(P('rbox', 'metal', 0x6a7078, 'back', [0, 0.05, -0.17], [0.28, 0.32, 0.1]));
      for (const x of [-1, 1]) L.push(P('cyl', 'glow', 'team', 'back', [x * 0.08, 0.05, -0.23], [0.035, 0.2, 0.035]));
      W.laser(L);
      break;
    }
    case 'robot': {
      const g = 0x7a828c, d = 0x3a4048;
      L.push(P('rbox', 'metal', d, 'hips', [0, 0, 0], [0.34, 0.14, 0.24]));
      for (const s of ['L', 'R']) {
        L.push(P('rbox', 'metal', g, 'leg' + s, [0, -0.11, 0.0], [0.13, 0.24, 0.15]));
        L.push(P('sph', 'metal', d, 'shin' + s, [0, 0, 0], [0.11, 0.11, 0.11]));
        L.push(P('rbox', 'metal', g, 'shin' + s, [0, -0.1, 0.01], [0.11, 0.22, 0.14]));
        L.push(P('rbox', 'metal', d, 'foot' + s, [0, -0.01, 0.04], [0.15, 0.06, 0.24]));
        L.push(P('sph', 'metal', d, 'arm' + s, [0, 0, 0], [0.16, 0.16, 0.16]));
        L.push(P('rbox', 'metal', g, 'arm' + s, [0, -0.09, 0], [0.11, 0.18, 0.11]));
        L.push(P('rbox', 'metal', g, 'fore' + s, [0, -0.08, 0], [0.1, 0.18, 0.1]));
      }
      L.push(P('rbox', 'metal', g, 'body', [0, 0.22, 0], [0.48, 0.36, 0.32]));
      L.push(P('rbox', 'metal', d, 'body', [0, 0.04, 0], [0.34, 0.12, 0.24]));
      L.push(P('box', 'cloth', 'team', 'body', [0, 0.27, 0.162], [0.3, 0.07, 0.01]));
      L.push(P('cyl', 'glow', 'team', 'body', [0, 0.15, 0.16], [0.09, 0.02, 0.09], [Math.PI / 2, 0, 0]));
      L.push(P('rbox', 'metal', d, 'head', [0, 0.07, 0], [0.2, 0.13, 0.19]));
      L.push(P('box', 'glow', 'team', 'head', [0, 0.08, 0.096], [0.15, 0.03, 0.01]));
      L.push(P('cyl', 'metal', d, 'head', [0.07, 0.2, -0.04], [0.012, 0.18, 0.012]));
      L.push(P('rbox', 'metal', d, 'tool', [0, 0.18, 0], [0.1, 0.4, 0.12])); L.push(P('cyl', 'glow', 'team', 'tool', [0, 0.4, 0], [0.05, 0.06, 0.05]));
      L.push(P('rbox', 'metal', d, 'shield', [0, 0.06, 0], [0.12, 0.26, 0.12])); L.push(P('rbox', 'metal', g, 'shield', [0, 0.22, 0.02], [0.16, 0.12, 0.16]));
      break;
    }
    default:
      if (UNITS[type] && (UNITS[type].cls === 'siege' || UNITS[type].cls === 'air')) machine(L, type);
      else L.push(...human({ civ }));
  }
  return L;
}

// ------------------------------------------------------------------ squelette et animations
export const BONES = ['root', 'hips', 'body', 'head', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR',
  'tool', 'shield', 'back', 'cape', 'hbody', 'hneck', 'hhead', 'hlegFL', 'hlegFR', 'hlegBL', 'hlegBR', 'hshinFL', 'hshinFR', 'hshinBL', 'hshinBR', 'tail'];

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _r2 = new THREE.Matrix4(), _r3 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const T = (x, y, z) => _m.makeTranslation(x, y, z);
const RX = (a) => _r.makeRotationX(a);
const RY = (a) => _r2.makeRotationY(a);
const RZ = (a) => _r3.makeRotationZ(a);
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const mix = (a, b, k) => a + (b - a) * k;

const KIND = {
  militia: 'sword', swordsman: 'sword', champion: 'sword', legionary: 'sword', scout: 'sword', cuirassier: 'sword',
  spearman: 'spear', royal_guard: 'pole', samurai: 'katana', berserker: 'dual', archer: 'bow', chariot: 'bow', crossbowman: 'xbow',
  skirmisher: 'jav', slinger: 'sling', musketeer: 'gun', fusilier: 'gun', soldier: 'gun', exo_soldier: 'gun', dragoon: 'gun',
  machine_gunner: 'hmg', knight: 'lance', paladin: 'lance', villager: 'villager', robot: 'robot',
};

// phases d'une frappe : armé → frappe → retour ; renvoie [poids armé, poids frappe]
function strike(sw) {
  if (sw < 0.3) return [ease(sw / 0.3), 0];
  if (sw < 0.55) { const k = ease((sw - 0.3) / 0.25); return [1 - k, k]; }
  return [0, 1 - ease((sw - 0.55) / 0.45)];
}

export function poseUnit(B, type, st, x, y, z, yaw, scale, time, dead = 0) {
  const def = UNITS[type], cls = def.cls;
  const t = time + st.seed * 10;
  const walk = st.walk, ph = st.phase, idle = 1 - walk;
  B.root.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(scale, scale, scale));
  if (cls === 'air') {
    const alt = type === 'bomber' ? 3.4 : 2.3;
    B.root.compose(_v.set(x, y + (dead ? Math.max(0, alt - dead * alt) : alt + Math.sin(t * 1.7) * 0.06), z), _q.setFromEuler(_e.set(dead ? 0.6 : 0, yaw, st.bank || 0, 'YXZ')), _s.set(scale, scale, scale));
    if (type === 'bomber') B.tool.copy(B.root).multiply(T(0, 0, 0.78)).multiply(RZ(t * 45));
    else B.tool.copy(B.root);
    return;
  }
  if (cls === 'siege') {
    const sw = st.swing;
    if (type === 'tank') { B.tool.copy(B.root).multiply(T(0, 0.45, sw > 0 ? -Math.sin(sw * Math.PI) * 0.06 : 0)).multiply(RY(st.turret || 0)); return; }
    if (type === 'trebuchet') { B.tool.copy(B.root).multiply(T(0, 1.12, 0)).multiply(RX(sw > 0 ? 0.75 - Math.sin(Math.min(1, sw * 1.4) * Math.PI / 2) * 2.4 : 0.75)); return; }
    if (type === 'cannon' || type === 'field_gun') { B.tool.copy(B.root).multiply(T(0, 0.4, 0.05 - (sw > 0 ? Math.sin(sw * Math.PI) * 0.15 : 0))).multiply(RX(-0.1)); return; }
    if (type === 'ram') B.tool.copy(B.root).multiply(T(0, 0.5, sw > 0 ? Math.sin(sw * Math.PI) * 0.25 : 0));
    else if (type === 'mangonel') B.tool.copy(B.root).multiply(T(0, 0.3, -0.12)).multiply(RX(-1.2 + (sw > 0 ? Math.sin(Math.min(1, sw * 1.6) * Math.PI / 2) * 1.7 : 0)));
    else B.tool.copy(B.root).multiply(T(0, 0.45, 0.1 - (sw > 0 ? Math.sin(sw * Math.PI) * 0.1 : 0))).multiply(RX(-0.12));
    return;
  }
  const dk = dead ? ease(Math.min(1, dead * 2.2)) : 0;
  if (dead) {
    if (cls === 'cavalry') B.root.multiply(T(0, 0.18 * dk, 0)).multiply(RZ(Math.PI / 2 * dk));
    else B.root.multiply(T(0, 0.1 * dk, 0)).multiply(RX(-Math.PI / 2 * 0.96 * dk));
  }
  const kind = KIND[type] || 'sword';
  const mounted = cls === 'cavalry' && type !== 'chariot';
  const sw = st.swing, aim = !!st.aim;
  const s1 = Math.sin(ph), c1 = Math.cos(ph);
  const ww = mounted || type === 'chariot' ? 0 : walk;
  // ---- jambes et bassin (marche, repos, garde)
  let hipH = 0.52, hipX = 0, hipYaw = 0, lean = 0.02, twist = 0, headYaw = 0, headPitch = 0;
  let thL = s1 * 0.5 * ww, thR = -s1 * 0.5 * ww;
  let knL = 0.05 + ww * 0.9 * Math.max(0, -c1), knR = 0.05 + ww * 0.9 * Math.max(0, c1);
  let splL = -0.03, splR = 0.03;
  hipH += ww * ((1 - Math.abs(s1)) * 0.028 - 0.018);
  twist = s1 * 0.07 * ww; hipYaw = -s1 * 0.06 * ww; lean += 0.05 * ww;
  const breath = Math.sin(t * 1.7) * 0.012 * idle;
  hipX = Math.sin(t * 0.45) * 0.008 * idle;
  headYaw = Math.sin(t * 0.5) * 0.25 * idle * (aim ? 0 : 1);
  // ---- bras (balancier de marche par défaut)
  let aL = -s1 * 0.38 * ww + 0.04, aR = s1 * 0.38 * ww + 0.04;
  let eL = -0.22 - Math.max(0, s1 * 0.38 * ww) * 0.9, eR = -0.22 - Math.max(0, -s1 * 0.38 * ww) * 0.9;
  let sL = -0.12 - breath, sR = 0.12 + breath;
  let tp = 1.1, troll = 0, tyaw = 0, trel = false, shP = 0, shYaw = 0, shAt = 'arm', shRel = false;
  const melee = kind === 'sword' || kind === 'spear' || kind === 'pole' || kind === 'katana' || kind === 'dual';
  if (aim && melee && walk < 0.5 && !mounted) { thL -= 0.16; thR += 0.12; knL += 0.25; knR += 0.2; hipH -= 0.025; lean += 0.08; splL -= 0.05; splR += 0.05; }
  const lunge = (k) => { if (mounted) return; thL -= 0.3 * k; knL += 0.3 * k; thR += 0.22 * k; hipH -= 0.02 * k; };
  switch (kind) {
    case 'sword': {
      aR = 0.1 + aR * 0.5; eR = -0.75; tp = 0.95; troll = -0.15;
      aL = -0.15 + aL * 0.3; eL = -1.3; sL = -0.25; shYaw = -0.3;
      if (aim) { aR = -0.35; eR = -1.0; tp = 1.15; aL = -0.45; eL = -1.15; }
      if (sw > 0) {
        const [w, s] = strike(sw);
        aR = mix(aR, -2.5, w); eR = mix(eR, -1.3, w); tp = mix(tp, -0.7, w); twist += 0.35 * w;
        aR = mix(aR, -0.7, s); eR = mix(eR, -0.15, s); tp = mix(tp, 2.1, s); twist -= 0.45 * s; lean += 0.18 * s; lunge(s);
        aL = mix(aL, -0.6, Math.max(w, s));
      }
      break;
    }
    case 'spear': {
      aR = 0.12 + aR * 0.4; eR = -1.15; tp = 0.06 + walk * 0.12; troll = -0.05;
      aL = -0.2 + aL * 0.3; eL = -1.25; sL = -0.22; shYaw = -0.3;
      if (aim) { aR = -0.4; eR = -1.6; tp = 1.35; }
      if (sw > 0) {
        const [w, s] = strike(sw);
        aR = mix(aR, -0.5, w); eR = mix(eR, -1.9, w); tp = mix(tp, 1.5, w); twist += 0.25 * w;
        aR = mix(aR, -1.25, s); eR = mix(eR, -0.1, s); tp = mix(tp, 1.52, s); twist -= 0.3 * s; lean += 0.2 * s; lunge(s);
      }
      break;
    }
    case 'pole':
    case 'katana': {
      const pole = kind === 'pole';
      aR = pole ? 0.15 : -0.35; eR = pole ? -1.2 : -1.2; tp = pole ? 0.05 : 0.7;
      aL = pole ? -0.35 : -0.4; eL = pole ? -1.6 : -1.3; sL = pole ? 0.1 : 0.45; sR = pole ? 0.12 : -0.25;
      if (aim && !pole) { aR = -0.6; aL = -0.65; tp = 0.95; }
      if (sw > 0) {
        const [w, s] = strike(sw);
        aR = mix(aR, -2.6, w); eR = mix(eR, -1.0, w); tp = mix(tp, -0.85, w); aL = mix(aL, -2.4, w); eL = mix(eL, -1.1, w);
        aR = mix(aR, -1.0, s); eR = mix(eR, -0.2, s); tp = mix(tp, 1.9, s); aL = mix(aL, -1.0, s); eL = mix(eL, -0.3, s);
        lean += 0.2 * s; lunge(s);
      }
      break;
    }
    case 'dual': {
      aR = 0.1 + aR * 0.5; eR = -0.8; tp = 0.9; aL = 0.1 + aL * 0.5; eL = -0.8; shP = 0.6; shAt = 'hand'; sL = -0.18;
      if (sw > 0) {
        const [w, s] = strike(sw);
        aR = mix(aR, -2.6, w); eR = mix(eR, -1.2, w); tp = mix(tp, -0.6, w); aR = mix(aR, -0.6, s); eR = mix(eR, -0.1, s); tp = mix(tp, 2.0, s);
        aL = mix(aL, -1.0, w); aL = mix(aL, -2.2, s); shP = mix(shP, 2.0, w); shP = mix(shP, -0.4, s);
        twist += 0.35 * w - 0.4 * s; lean += 0.22 * s; lunge(s);
      }
      break;
    }
    case 'bow': {
      shAt = 'hand'; aL = 0.05 + aL * 0.5; eL = -0.4; sL = -0.1; shP = 0.25;
      if (aim) {
        const draw = sw > 0 ? (sw < 0.3 ? 0.12 : ease((sw - 0.3) / 0.7)) : 1;
        twist += 0.45; headYaw = -0.45; sL = -0.5; aL = -1.5; eL = -0.05; shP = 0;
        aR = -1.45; eR = -0.3 - 2.15 * draw; sR = -0.42 + draw * 0.1;
      }
      tp = 0.4; trel = false;
      break;
    }
    case 'xbow': {
      aR = 0.2; eR = -1.3; tp = 1.25; aL = -0.25; eL = -1.4; sL = 0.22;
      if (aim) { aR = -0.7; eR = -1.25; sR = 0.3; tp = Math.PI / 2 - (sw > 0 && sw < 0.2 ? 0.15 : 0); aL = -1.15; eL = -0.45; sL = 0.2; headPitch = 0.08; }
      break;
    }
    case 'jav': {
      aR = 0.1 + aR * 0.4; eR = -0.8; tp = 0.35; aL = -0.2 + aL * 0.3; eL = -1.2; sL = -0.2; shYaw = -0.3;
      if (aim) {
        const k = sw > 0 ? ease(sw) : 1;
        aR = mix(-1.6, 0.6, k); eR = mix(-0.2, -0.9, k); tp = 1.3; twist += mix(0.35, -0.4, k); lean += mix(0.2, -0.05, k);
      }
      break;
    }
    case 'sling': {
      aR = 0.1; eR = -0.5; tp = 0.2;
      if (aim) {
        const k = sw > 0 ? ease(sw) : 1;
        aR = mix(-1.4, -2.7 + Math.sin(t * 14) * 0.25, k); eR = mix(-0.2, -0.4, k); trel = true; tp = k > 0.5 ? t * 14 : Math.PI;
        aL = -0.6; sL = -0.4;
      }
      break;
    }
    case 'gun': {
      aR = 0.3; eR = -1.4; tp = 0.3; troll = 0.6; aL = -0.65; eL = -1.35; sL = 0.15;
      if (aim) {
        aR = -0.45; eR = -1.7; sR = 0.4; tp = Math.PI / 2 - 0.04; troll = 0; aL = -1.2; eL = -0.4; sL = 0.28;
        twist += 0.15; headPitch = 0.08; headYaw = -0.1;
        if (sw > 0 && sw < 0.25) { tp -= 0.14 * (1 - sw / 0.25); lean -= 0.04 * (1 - sw / 0.25); }
      }
      break;
    }
    case 'hmg': {
      aR = 0.25; eR = -1.3; tp = 1.2; aL = -0.5; eL = -1.1; sL = 0.15;
      if (aim) { aR = -0.1; eR = -1.45; tp = Math.PI / 2 - 0.05 + (sw > 0 ? Math.sin(t * 60) * 0.02 : 0); aL = -0.7; eL = -0.9; sL = 0.25; lean += 0.08; knL += 0.15; knR += 0.15; hipH -= 0.012; }
      break;
    }
    case 'lance': {
      aR = -0.1; eR = -1.0; tp = 0.2 + walk * 0.15; troll = 0.05;
      aL = -0.45; eL = -1.0; sL = -0.15; shYaw = -0.2;
      if (aim) { aR = 0.1; eR = -1.25; tp = 1.38; sR = 0.2; }
      if (sw > 0) { const [w, s] = strike(sw); tp = mix(tp, 1.35, w); aR = mix(aR, 0.2, w); aR = mix(aR, -0.7, s); eR = mix(eR, -0.5, s); tp = mix(tp, 1.5, s); lean += 0.15 * s; }
      break;
    }
    case 'robot': {
      aL = 0.05 + aL * 0.5; aR = 0.05 + aR * 0.5; eL = eR = -0.3; trel = true; shRel = true; tp = Math.PI; shP = Math.PI; shAt = 'hand';
      if (aim) { aL = aR = -1.45; eL = eR = -0.1; sL = 0.12; sR = -0.12; }
      break;
    }
    case 'villager': {
      const wk = st.workKind;
      tp = 0.9;
      if (st.work > 0) {
        const c = Math.sin(t * (wk === 'hammer' ? 9 : 5.5));
        trel = true;
        if (wk === 'axe' || wk === 'pick') { aR = aL = -1.9 - c * 0.8; eR = eL = -0.35; sL = 0.45; sR = -0.3; tp = 1.3; lean += 0.15 + c * 0.08; knL += 0.15; knR += 0.15; }
        else if (wk === 'hammer') { aR = -1.2 - Math.max(0, c) * 0.9; eR = -0.6; tp = 1.5; aL = -0.6; eL = -1.0; lean += 0.3; knL += 0.4; knR += 0.35; thL -= 0.25; thR -= 0.15; hipH -= 0.04; }
        else if (wk === 'hoe') { aR = aL = -0.9 - c * 0.45; eR = eL = -0.6; sL = 0.2; tp = 1.9; lean += 0.3; }
        else { aR = -0.8 + c * 0.25; eR = -0.9; aL = -0.9 - c * 0.25; eL = -0.8; tp = 1.0; lean += 0.45; knL += 0.4; knR += 0.4; thL -= 0.3; thR -= 0.3; hipH -= 0.05; }
      }
      break;
    }
    default: break;
  }
  if (dead) {
    aL = mix(aL, -0.4, dk); aR = mix(aR, -0.3, dk); sL = mix(sL, -1.1, dk); sR = mix(sR, 1.0, dk); eL = mix(eL, -0.4, dk); eR = mix(eR, -0.5, dk);
    thL = mix(thL, -0.5, dk); knL = mix(knL, 0.9, dk); thR = mix(thR, 0.05, dk); knR = mix(knR, 0.15, dk);
    headYaw = mix(headYaw, 0.5, dk); lean = mix(lean, -0.08, dk); twist *= 1 - dk; tp = mix(tp, 0.25, dk); troll = mix(troll, 0.5, dk); trel = trel && dk < 0.5;
  }
  // ---- os : cheval puis cavalier, ou fantassin
  let hips;
  if (cls === 'cavalry') {
    const bob = Math.abs(s1) * 0.035 * walk;
    B.hbody.copy(B.root).multiply(T(0, 0.79 + bob, 0)).multiply(RX(Math.sin(ph * 2) * 0.025 * walk));
    const legs = [['FL', -0.1, 0.34, 0], ['FR', 0.1, 0.34, Math.PI], ['BL', -0.1, -0.32, Math.PI], ['BR', 0.1, -0.32, 0]];
    for (const [l, lx, lz, off] of legs) {
      const p = ph + off, front = l[0] === 'F';
      const rest = !front && l === 'BR' && Math.sin(t * 0.2) > 0 ? 0.3 * idle : 0;
      B['hleg' + l].copy(B.hbody).multiply(T(lx, front ? -0.08 : -0.04, lz)).multiply(RX(Math.sin(p) * 0.5 * walk - rest * 0.3));
      B['hshin' + l].copy(B['hleg' + l]).multiply(T(0, front ? -0.3 : -0.33, 0)).multiply(RX(Math.max(0, -Math.cos(p)) * (front ? 1.2 : 0.8) * walk + rest));
    }
    const graze = type === 'chariot' || aim ? 0 : idle * Math.max(0, Math.sin(t * 0.27)) ** 3;
    const nod = Math.sin(ph * 2) * 0.06 * walk;
    B.hneck.copy(B.hbody).multiply(T(0, 0.1, 0.4)).multiply(RX(0.62 + graze * 1.1 + nod));
    B.hhead.copy(B.hneck).multiply(T(0, 0.42, 0)).multiply(RX(-0.62 - graze * 0.5 - nod * 0.5));
    B.tail.copy(B.hbody).multiply(T(0, 0.13, -0.47)).multiply(RX(0.04 + Math.sin(t * 2.3) * 0.06 + walk * 0.18)).multiply(RZ(Math.sin(t * 1.7) * 0.18));
    if (type === 'chariot') {
      hips = B.hips.copy(B.hbody).multiply(T(0, -0.02, -0.88));
    } else {
      hips = B.hips.copy(B.hbody).multiply(T(0, 0.28, -0.04));
      thL = -1.3; thR = -1.3; knL = knR = 1.45; splL = -0.42; splR = 0.42;
    }
  } else {
    hips = B.hips.copy(B.root).multiply(T(hipX, hipH, 0)).multiply(RY(hipYaw));
  }
  B.body.copy(hips).multiply(RX(lean + breath)).multiply(RY(twist - hipYaw));
  B.head.copy(B.body).multiply(T(0, 0.425, 0)).multiply(RY(headYaw - twist * 0.6)).multiply(RX(headPitch - lean * 0.5));
  B.legL.copy(hips).multiply(T(-0.085, -0.03, 0)).multiply(RX(thL)).multiply(RZ(splL));
  B.legR.copy(hips).multiply(T(0.085, -0.03, 0)).multiply(RX(thR)).multiply(RZ(splR));
  B.shinL.copy(B.legL).multiply(T(0, -0.235, 0)).multiply(RX(knL));
  B.shinR.copy(B.legR).multiply(T(0, -0.235, 0)).multiply(RX(knR));
  B.footL.copy(B.shinL).multiply(T(0, -0.215, 0)).multiply(RX(-(thL + knL) + Math.max(0, thL - 0.15) * 0.8 * ww));
  B.footR.copy(B.shinR).multiply(T(0, -0.215, 0)).multiply(RX(-(thR + knR) + Math.max(0, thR - 0.15) * 0.8 * ww));
  B.armL.copy(B.body).multiply(T(-0.185, 0.33, 0)).multiply(RX(aL)).multiply(RZ(sL));
  B.armR.copy(B.body).multiply(T(0.185, 0.33, 0)).multiply(RX(aR)).multiply(RZ(sR));
  B.foreL.copy(B.armL).multiply(T(0, -0.16, 0)).multiply(RX(eL));
  B.foreR.copy(B.armR).multiply(T(0, -0.16, 0)).multiply(RX(eR));
  // arme : orientation exprimée dans le repère du buste (sauf outils tenus « dans l'axe »)
  B.tool.copy(B.foreR).multiply(T(0, -0.16, 0));
  if (trel) B.tool.multiply(RX(tp)).multiply(RZ(troll));
  else B.tool.multiply(RX(-eR)).multiply(RZ(-sR)).multiply(RX(tp - aR)).multiply(RZ(troll)).multiply(RY(tyaw));
  B.shield.copy(B.foreL).multiply(T(0, shAt === 'hand' ? -0.16 : -0.085, 0));
  if (shRel) B.shield.multiply(RX(shP));
  else {
    B.shield.multiply(RX(-eL)).multiply(RZ(-sL)).multiply(RX(-aL));
    if (shAt !== 'hand') B.shield.multiply(T(-0.02, 0, 0.05));
    B.shield.multiply(RY(shYaw)).multiply(RX(shP));
  }
  B.back.copy(B.body).multiply(T(0, 0.2, 0));
  B.cape.copy(B.body).multiply(T(0, 0.385, -0.115)).multiply(RX(0.08 + walk * (mounted ? 0.2 : 0.35) + Math.sin(t * 2.1) * 0.03 - lean * 0.6));
}

// hauteur des unités (barres de vie, sélection)
export function unitTop(type) {
  const cls = UNITS[type].cls;
  if (type === 'bomber') return 3.85;
  if (cls === 'air') return 2.6;
  if (type === 'robot') return 1.85;
  if (type === 'trebuchet') return 1.6;
  if (cls === 'cavalry') return 1.32;
  if (cls === 'siege') return 1.0;
  return 0.94;
}
