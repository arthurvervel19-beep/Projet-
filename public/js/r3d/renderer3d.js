// Rendu 3D temps réel (WebGL / Three.js) : même interface que le rendu 2D, utilisée par l'UI.
import * as THREE from 'three';
import { mergeGeometries as mergeGeos } from '../../vendor/BufferGeometryUtils.js';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from '../../vendor/jsm/postprocessing/GTAOPass.js';
import { BUILDINGS, UNITS, TERRAIN } from '../config.js';
import { TerrainPainter } from '../terrain.js';
import { buildTextures } from './textures.js';
import { makeWorldUniforms, patchWorld } from './shading.js';
import {
  buildingModel, palisadeModel, stoneWallModel, scaffoldModel, unitGeometries, unitParts, SKIN_TONES, treeGeometries,
  rockGeometries, bushGeometries, sheepGeometries, grassTuftGeometry, arrowGeometry, makeBanner, boxGeo, CIV_SKINS,
} from './models.js';
import { civBuildingModel, civWallMaterial } from './civstyles.js';
import { extraBuildingModel, EXTRA_TYPES } from './extraModels.js';

const MAXU = 520;
const GUNS = new Set(['musketeer', 'fusilier', 'soldier', 'machine_gunner', 'exo_soldier', 'dragoon']);
function unitMidHeight(type) {
  const cls = UNITS[type].cls;
  if (type === 'bomber') return 3.4;
  if (cls === 'air') return 2.3;
  if (type === 'robot') return 0.9;
  return cls === 'cavalry' || cls === 'siege' ? 0.4 : 0.3;
}
function unitTopHeight(type) {
  const cls = UNITS[type].cls;
  if (type === 'bomber') return 3.85;
  if (cls === 'air') return 2.6;
  if (type === 'robot') return 1.85;
  if (type === 'trebuchet') return 1.6;
  return cls === 'cavalry' || cls === 'siege' ? 1.0 : 0.82;
}
function unitScale(type) {
  const cls = UNITS[type].cls;
  if (cls === 'air') return 1;
  if (type === 'robot') return 0.78 * 1.6;
  if (type === 'tank') return 0.95;
  return cls === 'siege' ? 0.85 : 0.78;
}
const HUMAN_SCALE = 0.78;
const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export const QUALITY = {
  high: { pixelRatio: 1.75, shadow: 4096, grass: 5, res: 3, tex: 'high', post: true, ao: 12 },
  medium: { pixelRatio: 1.25, shadow: 2048, grass: 2, res: 2, tex: 'high', post: true, ao: 0 },
  low: { pixelRatio: 1, shadow: 0, grass: 0, res: 2, tex: 'low', post: false, ao: 0 },
};

// étalonnage final (espace linéaire, avant le tone mapping)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.02 }, uWarm: { value: new THREE.Vector3(1.05, 1.0, 0.93) }, uVig: { value: 0.32 }, uContrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig, uContrast; uniform vec3 uWarm; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uWarm;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = pow(max(col, 0.0), vec3(uContrast)) * (1.0 + (uContrast - 1.0) * 0.5);
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVig * 2.2;
      gl_FragColor = vec4(col * v, c.a);
    }`,
};

// ------------------------------------------------------------------ particules
class Particles {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('size', this.aSize); g.setAttribute('pcolor', this.aCol);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float uScale;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; gl_FragColor = vec4(vC.rgb, vC.a * a); if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0) {
    let i = this.n;
    if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1;
    this.c0.set(c0, i * 4); this.c1.set(c1, i * 4); this.grav[i] = grav;
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      if (w !== i) {
        this.pos.copyWithin(w * 3, i * 3, i * 3 + 3); this.vel.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.life[w] = this.life[i]; this.age[w] = this.age[i]; this.s0[w] = this.s0[i]; this.s1[w] = this.s1[i];
        this.c0.copyWithin(w * 4, i * 4, i * 4 + 4); this.c1.copyWithin(w * 4, i * 4, i * 4 + 4); this.grav[w] = this.grav[i];
      }
      w++;
    }
    this.n = w;
    const P = this.aPos.array, S = this.aSize.array, Cc = this.aCol.array;
    for (let i = 0; i < this.n; i++) {
      const k = this.age[i] / this.life[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let j = 0; j < 3; j++) { this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; P[i * 3 + j] = this.pos[i * 3 + j]; }
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      for (let j = 0; j < 4; j++) Cc[i * 4 + j] = this.c0[i * 4 + j] + (this.c1[i * 4 + j] - this.c0[i * 4 + j]) * k;
      const fade = Math.min(1, k * 8) * (1 - k);
      Cc[i * 4 + 3] *= fade;
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.n);
  }
}

// ------------------------------------------------------------------ rendu
export class Renderer3D {
  constructor(canvas, game, me, opts = {}) {
    this.canvas = canvas;
    this.game = game;
    this.me = me;
    this.q = QUALITY[opts.quality || 'high'];
    this.cam = { zoom: 1 };
    this.camState = { tx: 10, tz: 10, dist: 34, targetDist: 34, pitch: 0.96, yaw: Math.PI / 4 };
    this.time = 0;
    this.last = performance.now();
    this.minimapBase = null;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = this.q.shadow > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    // calque 2D (barres de vie, cadre de sélection)
    this.overlay = document.getElementById('overlay') || (() => {
      const o = document.createElement('canvas'); o.id = 'overlay';
      Object.assign(o.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '1' });
      canvas.after(o); return o;
    })();
    this.octx = this.overlay.getContext('2d');

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d12);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

    this.setupLights();
    this.setupEnvironment();
    this.painter = new TerrainPainter(game);
    this.T = buildTextures(r, this.q.tex);
    this.setupFogTexture();
    this.U = makeWorldUniforms(this.fogTex, game.map.w, game.map.h);
    this.makeMaterials();
    this.buildTerrain();
    this.buildWater();
    this.setupUnits();
    this.setupNature();
    this.setupMisc();
    this.buildings = new Map();
    this.templates = new Map();
    this.unitState = new Map();
    this.seenFx = new WeakSet();
    this.setupPost();
    this.resize();
  }

  // ------------------------------------------------------------------ scène
  setupLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6b5a3e, 0.65);
    s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe9cc, 2.7);
    sun.castShadow = this.q.shadow > 0;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.025;
      sun.shadow.radius = 3;
      const c = sun.shadow.camera; c.near = 1; c.far = 160;
    }
    s.add(sun); s.add(sun.target);
    this.sunOffset = new THREE.Vector3(-34, 46, 8);
  }

  setupEnvironment() {
    // ciel procédural pour les reflets (métal, eau)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#3d6ea8'); grd.addColorStop(0.45, '#9cc0e0'); grd.addColorStop(0.5, '#e8dcc0'); grd.addColorStop(0.56, '#7a7458'); grd.addColorStop(1, '#3a3428');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    const sg = g.createRadialGradient(90, 70, 0, 90, 70, 60);
    sg.addColorStop(0, 'rgba(255,250,230,1)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 512, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromEquirectangular(tex).texture;
    this.scene.environmentIntensity = 0.55;
    tex.dispose(); pm.dispose();
  }

  setupFogTexture() {
    const { w, h } = this.game.map;
    this.fogData = new Uint8Array(w * h);
    this.fogTex = new THREE.DataTexture(this.fogData, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTex.magFilter = THREE.LinearFilter; this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    this.updateFog(1, true);
  }

  updateFog(dt, instant = false) {
    const p = this.game.players[this.me];
    const d = this.fogData;
    const k = instant ? 1 : Math.min(1, dt * 7);
    let changed = false;
    for (let i = 0; i < d.length; i++) {
      const t = p.visible[i] ? 255 : p.explored[i] ? 128 : 0;
      if (d[i] !== t) { d[i] = Math.abs(t - d[i]) < 3 ? t : d[i] + (t - d[i]) * k; changed = true; }
    }
    if (changed) this.fogTex.needsUpdate = true;
  }

  std(params, opts = {}) { return patchWorld(new THREE.MeshStandardMaterial(params), this.U, opts); }

  makeMaterials() {
    const T = this.T;
    const tm = (pair, color, rough = 0.85, ns = 0.8, extra = {}) => this.std({ map: pair.map, normalMap: pair.normal, normalScale: new THREE.Vector2(ns, ns), color, roughness: rough, ...extra });
    this.M = {
      stone: tm(T.stone, 0xffffff, 0.88, 1),
      darkstone: tm(T.darkstone, 0xffffff, 0.9, 1),
      paving: tm(T.stone, 0xc8c0b0, 0.92, 0.6),
      plaster: tm(T.plaster, 0xffffff, 0.92, 0.5, { side: THREE.DoubleSide }),
      planks: tm(T.planks, 0xffffff, 0.85, 0.8, { side: THREE.DoubleSide }),
      darkwood: tm(T.darkwood, 0xffffff, 0.8, 0.8),
      door: tm(T.darkwood, 0x9a7a5a, 0.75, 0.8),
      gate: tm(T.darkwood, 0x6a5040, 0.7, 1),
      beam: tm(T.darkwood, 0x6a5038, 0.8, 0.6),
      log: tm(T.bark, 0xffffff, 0.9, 0.8),
      tile: tm(T.tile, 0xffffff, 0.75, 1, { side: THREE.DoubleSide }),
      slate: tm(T.slate, 0xffffff, 0.6, 1, { side: THREE.DoubleSide }),
      shingle: tm(T.shingle, 0xffffff, 0.8, 1, { side: THREE.DoubleSide }),
      thatch: tm(T.thatch, 0xffffff, 0.95, 1, { side: THREE.DoubleSide }),
      farmSoil: tm(T.farm, 0xffffff, 0.95, 1),
      glass: this.std({ color: 0xffc070, emissive: 0xff9a30, emissiveIntensity: 0.55, roughness: 0.3 }),
      slit: this.std({ color: 0x15110c, roughness: 1 }),
      metal: this.std({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.35 }),
      iron: this.std({ color: 0x3a3a40, metalness: 0.8, roughness: 0.45 }),
      gold: this.std({ color: 0xe8c050, metalness: 1, roughness: 0.3 }),
      rope: this.std({ color: 0x8a7a5a, roughness: 1 }),
      sack: this.std({ map: T.cloth, color: 0xd8c49a, roughness: 1 }),
      straw: this.std({ map: T.thatch.map, color: 0xffffff, roughness: 1 }),
      canvas: this.std({ map: T.cloth, color: 0xf0e8d4, roughness: 0.95 }),
      sail: this.std({ map: T.cloth, color: 0xeee4cc, roughness: 0.95, side: THREE.DoubleSide }),
      embers: this.std({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 2.2 }),
      ore: this.std({ color: 0xd8b040, metalness: 0.9, roughness: 0.35 }),
      rock: this.std({ color: 0x8a8a8a, roughness: 0.9, flatShading: true }),
      fruit: this.std({ color: 0xc8403a, roughness: 0.6 }),
      wood_end: this.std({ color: 0xd8b07a, roughness: 0.9 }),
      targetWhite: this.std({ color: 0xeee6d0, roughness: 0.9 }),
      targetRed: this.std({ color: 0xb8302a, roughness: 0.9 }),
      targetGold: this.std({ color: 0xe0b840, roughness: 0.6 }),
      marble: tm(T.marble, 0xffffff, 0.55, 0.7),
      sandstone: tm(T.sandstone, 0xffffff, 0.9, 0.9),
      mudbrick: tm(T.mudbrick, 0xffffff, 0.95, 0.9),
      stucco: tm(T.stucco, 0xffffff, 0.9, 0.5),
      whiteplaster: tm(T.whiteplaster, 0xffffff, 0.85, 0.4),
      ashlar: tm(T.ashlar, 0xffffff, 0.9, 1.1),
      logs: tm(T.logs, 0xffffff, 0.85, 1, { side: THREE.DoubleSide }),
      kawara: tm(T.kawara, 0xffffff, 0.55, 1, { side: THREE.DoubleSide }),
      blackwood: tm(T.darkwood, 0x3a302a, 0.6, 0.6),
      paper: this.std({ map: T.cloth, color: 0xf4efe2, roughness: 0.9, emissive: 0x403020, emissiveIntensity: 0.25 }),
      clay: this.std({ color: 0xb8673a, roughness: 0.8 }),
      copper: this.std({ color: 0x5f9e8a, metalness: 0.6, roughness: 0.45 }),
      concrete: tm(T.plaster, 0xa8a8a2, 0.95, 0.6),
      brick: tm(T.mudbrick, 0xc8765a, 0.9, 0.9),
      steel: this.std({ color: 0x8a9096, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
      steelRibbed: tm(T.planks, 0x9aa2aa, 0.45, 1.2, { metalness: 0.6, side: THREE.DoubleSide }),
      redSteel: this.std({ color: 0xb8402a, metalness: 0.5, roughness: 0.45 }),
      glassDark: this.std({ color: 0x2a3a48, metalness: 0.4, roughness: 0.12, emissive: 0x3a5a70, emissiveIntensity: 0.3 }),
      asphalt: this.std({ color: 0x2c2e30, roughness: 0.95 }),
      paint: this.std({ color: 0xf2f2ee, roughness: 0.5 }),
      sandbag: this.std({ map: T.cloth, color: 0xb8a070, roughness: 1 }),
      travertine: tm(T.stucco, 0xf0e4cc, 0.9, 0.6, { side: THREE.DoubleSide }),
      lacquer: this.std({ color: 0xb8301e, roughness: 0.4 }),
    };
    // matériaux d'équipe
    this.teams = this.game.players.map((p) => ({
      glow: patchWorld(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.35) }), this.U),
      cloth: this.std({ map: T.cloth, color: new THREE.Color(p.color), roughness: 0.85 }),
      banner: this.std({ map: T.cloth, color: new THREE.Color(p.color), roughness: 0.85, side: THREE.DoubleSide }, { banner: true }),
    }));
  }

  // ------------------------------------------------------------------ terrain
  hAt(x, z) {
    // hauteur analytique (relief doux, creux sous l'eau)
    const P = this.painter;
    const ww = P.field(P.water, x, z);
    const hill = Math.max(0, P.fbm(x * 0.055 + 40, z * 0.055 + 40) - 0.45) * 2.6;
    const flat = this.flatMask ? this.flatMask(x, z) : 1;
    return 0.06 + hill * flat + (P.vnoise(x * 0.7, z * 0.7) - 0.5) * 0.05 - ww * 0.95;
  }

  heightAt(x, z) {
    const R = this.res, W = this.game.map.w * R;
    const fx = Math.max(0, Math.min(W - 0.001, x * R)), fz = Math.max(0, Math.min(this.game.map.h * R - 0.001, z * R));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const H = this.hgrid, s = W + 1;
    const a = H[iz * s + ix], b = H[iz * s + ix + 1], c = H[(iz + 1) * s + ix], d = H[(iz + 1) * s + ix + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  buildTerrain() {
    const g = this.game, { w, h } = g.map;
    const starts = g.players.map((p) => [p.startX, p.startY]);
    this.flatMask = (x, z) => { let m = 1; for (const [sx, sy] of starts) { const d = Math.hypot(x - sx, z - sy); m = Math.min(m, Math.max(0, Math.min(1, (d - 7) / 9))); } return m; };
    const R = this.res = this.q.res;
    const geo = new THREE.PlaneGeometry(w, h, w * R, h * R);
    geo.rotateX(-Math.PI / 2);
    geo.translate(w / 2, 0, h / 2);
    const pos = geo.attributes.position;
    this.hgrid = new Float32Array((w * R + 1) * (h * R + 1));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.hAt(x, z);
      pos.setY(i, y);
      const ix = Math.round(x * R), iz = Math.round(z * R);
      this.hgrid[iz * (w * R + 1) + ix] = y;
    }
    geo.computeVertexNormals();
    // texture de répartition des sols
    const P = this.painter;
    const sp = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      sp[i * 4] = P.dirt[i] * 255; sp[i * 4 + 1] = P.sand[i] * 255; sp[i * 4 + 2] = P.water[i] * 255; sp[i * 4 + 3] = Math.min(1, P.forest[i] * 1.4) * 255;
    }
    const splat = new THREE.DataTexture(sp, w, h, THREE.RGBAFormat);
    splat.magFilter = splat.minFilter = THREE.LinearFilter; splat.needsUpdate = true;
    const T = this.T;
    const mat = this.std({ roughness: 0.95, metalness: 0 }, {
      terrain: true,
      uniforms: { uSplat: { value: splat }, uGrass: { value: T.grass }, uForest: { value: T.forest }, uDirt: { value: T.dirt }, uSand: { value: T.sand } },
    });
    const mesh = this.terrain = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // jupe sombre autour de la carte
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(w * 6, h * 6), new THREE.MeshBasicMaterial({ color: 0x07090c }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(w / 2, -1.2, h / 2);
    this.scene.add(skirt);
  }

  buildWater() {
    const { w, h } = this.game.map;
    const P = this.painter;
    const dd = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) dd[i] = P.water[i] ? Math.min(255, 40 + P.depth[i] * 215) : 0;
    const dtex = new THREE.DataTexture(dd, w, h, THREE.RedFormat);
    dtex.magFilter = dtex.minFilter = THREE.LinearFilter; dtex.needsUpdate = true;
    const mat = this.std({ color: 0xffffff, roughness: 0.08, metalness: 0.1, transparent: true }, { water: true, uniforms: { uDepth: { value: dtex } } });
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.rotateX(-Math.PI / 2); geo.translate(w / 2, -0.12, h / 2);
    const water = this.water = new THREE.Mesh(geo, mat);
    water.receiveShadow = true;
    water.renderOrder = 2;
    this.scene.add(water);
  }

  // ------------------------------------------------------------------ unités (instanciation)
  setupUnits() {
    const G = this.UG = unitGeometries();
    const T = this.T;
    const fogOpt = {};
    this.UM = {
      cloth: this.std({ map: T.cloth, roughness: 0.85 }, fogOpt),
      skin: this.std({ roughness: 0.6 }, fogOpt),
      metal: this.std({ metalness: 0.85, roughness: 0.32 }, fogOpt),
      leather: this.std({ roughness: 0.65 }, fogOpt),
      wood: this.std({ map: T.darkwood.map, roughness: 0.8 }, fogOpt),
      gold: this.std({ metalness: 1, roughness: 0.28 }, fogOpt),
      glow: patchWorld(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.U),
    };
    this.unitDefs = {};
    this.parts = new Map(); // clé géométrie|matériau → { mesh, n }
    const mult = new Map();
    const civs = [...new Set(['francs', ...this.game.players.map((p) => p.civ || 'francs')])];
    for (const civ of civs) {
      this.unitDefs[civ] = {};
      for (const type of Object.keys(UNITS)) {
        const list = this.partsFor(type, civ);
        this.unitDefs[civ][type] = list;
        const cnt = {};
        for (const pt of list) cnt[pt.key] = (cnt[pt.key] || 0) + 1;
        for (const [k, v] of Object.entries(cnt)) mult.set(k, Math.max(mult.get(k) || 0, v));
      }
    }
    for (const [key, m] of mult) {
      const [g, mt] = key.split('|');
      const cap = m * MAXU;
      const mesh = new THREE.InstancedMesh(G[g], this.UM[mt], cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      this.parts.set(key, { mesh, n: 0 });
    }
    this.teamColors = this.game.players.map((p) => ({ team: new THREE.Color(p.color), teamDk: new THREE.Color(p.color).multiplyScalar(0.55) }));
    this.skins = SKIN_TONES.map((c) => new THREE.Color(c));
    this.civSkins = {};
    for (const [civ, arr] of Object.entries(CIV_SKINS)) this.civSkins[civ] = arr.map((c) => new THREE.Color(c));
    this.bones = {};
    for (const b of ['root', 'body', 'head', 'legL', 'legR', 'armL', 'armR', 'tool', 'shield', 'back', 'hbody', 'hhead', 'hlegFL', 'hlegFR', 'hlegBL', 'hlegBR', 'tail']) this.bones[b] = new THREE.Matrix4();
  }

  partsFor(type, civ) {
    return unitParts(type, civ).map((pt) => ({ ...pt, key: `${pt.g}|${pt.m}`, local: mat4(...pt.p, ...pt.r, ...pt.s), fixed: typeof pt.c === 'number' ? new THREE.Color(pt.c) : null }));
  }

  // calcule les os d'une unité dans this.bones
  pose(type, st, x, y, z, yaw, scale, dead = 0) {
    const B = this.bones;
    const def = UNITS[type];
    const t = this.time + st.seed * 10;
    const walk = st.walk;
    const ph = st.phase;
    B.root.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, yaw, 0)), tmpS.set(scale, scale, scale));
    if (dead) { B.root.multiply(tmpM.makeTranslation(0, 0.12, 0)).multiply(tmpM.makeRotationZ(Math.PI / 2 * Math.min(1, dead * 4))); }
    const cls = def.cls;
    if (cls === 'air') {
      const alt = type === 'bomber' ? 3.4 : 2.3;
      B.root.compose(tmpV.set(x, y + (dead ? Math.max(0, alt - dead * alt) : alt + Math.sin(t * 1.7) * 0.06), z), tmpQ.setFromEuler(tmpE.set(dead ? 0.6 : 0, yaw, st.bank || 0, 'YXZ')), tmpS.set(scale, scale, scale));
      if (type === 'bomber') B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0, 0.78)).multiply(tmpM2.makeRotationZ(t * 45));
      else B.tool.copy(B.root);
      return;
    }
    if (cls === 'siege') {
      const sw = st.swing;
      if (type === 'tank') { B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0.45, sw > 0 ? -Math.sin(sw * Math.PI) * 0.06 : 0)).multiply(tmpM2.makeRotationY(st.turret || 0)); return; }
      if (type === 'trebuchet') { B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 1.12, 0)).multiply(tmpM2.makeRotationX(sw > 0 ? 0.75 - Math.sin(Math.min(1, sw * 1.4) * Math.PI / 2) * 2.4 : 0.75)); return; }
      if (type === 'cannon' || type === 'field_gun') { B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0.4, 0.05 - (sw > 0 ? Math.sin(sw * Math.PI) * 0.15 : 0))).multiply(tmpM2.makeRotationX(-0.1)); return; }
      if (type === 'ram') B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0.5, sw > 0 ? Math.sin(sw * Math.PI) * 0.25 : 0));
      else if (type === 'mangonel') B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0.3, -0.12)).multiply(tmpM2.makeRotationX(-1.2 + (sw > 0 ? Math.sin(Math.min(1, sw * 1.6) * Math.PI / 2) * 1.7 : 0)));
      else B.tool.copy(B.root).multiply(tmpM.makeTranslation(0, 0.45, 0.1 - (sw > 0 ? Math.sin(sw * Math.PI) * 0.1 : 0))).multiply(tmpM2.makeRotationX(-0.12));
      return;
    }
    let bodyBase = B.root;
    if (cls === 'cavalry') {
      const bob = Math.abs(Math.sin(ph)) * 0.05 * walk;
      B.hbody.copy(B.root).multiply(tmpM.makeTranslation(0, 0.56 + bob, 0));
      const legs = [['hlegFL', -0.11, 0.3, 0], ['hlegFR', 0.11, 0.3, Math.PI], ['hlegBL', -0.11, -0.3, Math.PI], ['hlegBR', 0.11, -0.3, 0]];
      for (const [b, lx, lz, off] of legs) B[b].copy(B.hbody).multiply(tmpM.makeTranslation(lx, -0.04, lz)).multiply(tmpM2.makeRotationX(Math.sin(ph + off) * 0.75 * walk));
      B.hhead.copy(B.hbody).multiply(tmpM.makeTranslation(0, 0.1, 0.36)).multiply(tmpM2.makeRotationX(Math.sin(ph * 2) * 0.08 * walk + (walk < 0.1 ? Math.max(0, Math.sin(t * 0.4)) * 0.4 : 0)));
      B.tail.copy(B.hbody).multiply(tmpM.makeTranslation(0, 0.12, -0.42)).multiply(tmpM2.makeRotationX(0.5 + Math.sin(t * 2.3) * 0.12)).multiply(tmpM.makeRotationZ(Math.sin(t * 1.7) * 0.15));
      B.body.copy(B.hbody).multiply(tmpM.makeTranslation(0, type === 'chariot' ? 0.12 : 0.22, type === 'chariot' ? -0.72 : -0.03));
      B.legL.copy(B.body); B.legR.copy(B.body);
      bodyBase = null;
    } else {
      const bob = Math.abs(Math.sin(ph)) * 0.035 * walk + Math.sin(t * 2) * 0.004;
      B.body.copy(B.root).multiply(tmpM.makeTranslation(0, 0.48 + bob, 0)).multiply(tmpM2.makeRotationX(0.06 * walk + st.lean));
      B.legL.copy(B.root).multiply(tmpM.makeTranslation(-0.075, 0.48 + bob, 0)).multiply(tmpM2.makeRotationX(Math.sin(ph) * 0.65 * walk));
      B.legR.copy(B.root).multiply(tmpM.makeTranslation(0.075, 0.48 + bob, 0)).multiply(tmpM2.makeRotationX(-Math.sin(ph) * 0.65 * walk));
    }
    void bodyBase;
    B.head.copy(B.body).multiply(tmpM.makeTranslation(0, 0.38, 0)).multiply(tmpM2.makeRotationY(Math.sin(t * 0.5) * 0.15 * (1 - walk)));
    B.back.copy(B.body).multiply(tmpM.makeTranslation(0, 0.2, 0));
    // bras : marche, attaque ou travail
    let aL = -Math.sin(ph) * 0.5 * walk * (cls === 'cavalry' ? 0.2 : 1), aR = Math.sin(ph) * 0.5 * walk * (cls === 'cavalry' ? 0.2 : 1);
    let toolA = 1.25, lz = 0;
    const sw = st.swing; // 0..1 progression de l'attaque
    const work = st.work;
    if (cls === 'cavalry') { aR = -0.6; toolA = type === 'scout' ? 1.2 : 1.45; aL = -0.7; }
    if (type === 'chariot') { aL = -0.5; aR = -0.3; }
    if (type === 'spearman' || type === 'royal_guard') { aR = -0.35; toolA = 0.4; }
    if (type === 'archer' || type === 'crossbowman') { aL = -0.5; aR = -0.3; }
    if (type === 'slinger') { aR = -0.2; toolA = 0.2; }
    const gun = GUNS.has(type);
    if (gun) { aR = -0.55; aL = -0.45; toolA = 1.0; }
    if (gun && st.aim) { aR = -1.5; aL = -1.35; toolA = 1.57; lz = 0.02; }
    if (type === 'robot') { aL = st.aim ? -1.4 : -0.3; aR = st.aim ? -1.5 : -0.3; toolA = 1.57; }
    if (sw > 0 && (gun || type === 'robot')) {
      lz = -Math.max(0, 1 - sw * 3) * 0.05;
    } else if (sw > 0) {
      const e = sw < 0.35 ? sw / 0.35 : 1 - (sw - 0.35) / 0.65;
      if (type === 'archer' || type === 'crossbowman' || type === 'skirmisher' || type === 'chariot') { aL = -1.45; aR = -1.4 + e * 0.3; lz = e * 0.1; toolA = type === 'skirmisher' ? 1.4 - e : toolA; }
      else if (type === 'slinger') { aR = -2.6 - Math.sin(sw * Math.PI * 4) * 0.6; toolA = 0.3 + e * 2; aL = -0.4; }
      else if (type === 'spearman' || type === 'royal_guard' || (cls === 'cavalry' && type !== 'scout')) { aR = -0.9 - e * 0.8; toolA = 1.55; }
      else { aR = sw < 0.35 ? -0.4 - (sw / 0.35) * 2.4 : -2.8 + ((sw - 0.35) / 0.65) * 2.3; toolA = 1.3; aL = -0.6; }
    } else if (work > 0) {
      const wk = st.workKind;
      const c = Math.sin(t * (wk === 'hammer' ? 9 : 5.5));
      if (wk === 'axe' || wk === 'pick') { aR = -1.5 - c * 0.9; aL = -1.3 - c * 0.9; toolA = 1.4; }
      else if (wk === 'hammer') { aR = -1.1 - Math.max(0, c) * 0.8; aL = -0.5; toolA = 1.5; }
      else if (wk === 'hoe') { aR = -0.9 - c * 0.5; aL = -0.8 - c * 0.5; toolA = 1.9; }
      else { aR = -0.9 + c * 0.25; aL = -0.9 - c * 0.25; toolA = 1.0; }
      if (wk === 'axe' || wk === 'pick' || wk === 'hoe') B.body.multiply(tmpM.makeRotationX(0.18 + c * 0.08));
    }
    B.armL.copy(B.body).multiply(tmpM.makeTranslation(-0.2, 0.34, 0)).multiply(tmpM2.makeRotationX(aL)).multiply(tmpM.makeRotationZ(-0.1));
    B.armR.copy(B.body).multiply(tmpM.makeTranslation(0.2, 0.34, lz)).multiply(tmpM2.makeRotationX(aR)).multiply(tmpM.makeRotationZ(0.1));
    B.tool.copy(B.armR).multiply(tmpM.makeTranslation(0, -0.31, 0)).multiply(tmpM2.makeRotationX(toolA));
    B.shield.copy(B.armL).multiply(tmpM.makeTranslation(0, -0.22, 0.07)).multiply(tmpM2.makeRotationX(-aL));
  }

  emitUnit(u, type, owner, x, y, z, yaw, st, dead = 0) {
    const def = UNITS[type];
    const scale = unitScale(type);
    this.pose(type, st, x, y, z, yaw, scale, dead);
    const tc = this.teamColors[owner] || { team: tmpC.set(0x888888), teamDk: tmpC };
    const civ = this.civOf(owner);
    const skin = (this.civSkins[civ] || this.skins)[st.seed * 4 | 0];
    const toolKind = st.toolKind, carry = st.carry;
    const defs = (this.unitDefs[civ] || this.unitDefs.francs)[type];
    for (const pt of defs) {
      if (pt.tool && pt.tool !== toolKind) continue;
      if (pt.carry && pt.carry !== carry) continue;
      const slot = this.parts.get(pt.key);
      if (!slot) continue;
      if (slot.n >= slot.mesh.instanceMatrix.count) continue;
      tmpM.multiplyMatrices(this.bones[pt.b], pt.local);
      slot.mesh.setMatrixAt(slot.n, tmpM);
      const col = pt.fixed || (pt.c === 'team' ? tc.team : pt.c === 'teamDk' ? tc.teamDk : skin);
      if (dead) tmpC.copy(col).multiplyScalar(0.55); else tmpC.copy(col);
      slot.mesh.setColorAt(slot.n, tmpC);
      slot.n++;
    }
  }

  unitState_(u, dt) {
    let st = this.unitState.get(u.id);
    if (!st) { st = { yaw: Math.random() * 6, phase: 0, walk: 0, seed: hash(u.id, 7), swing: 0, work: 0, lean: 0, lx: u.x, ly: u.y }; this.unitState.set(u.id, st); }
    return st;
  }

  syncUnits(alpha, dt) {
    const g = this.game, me = this.me, vis = g.players[me].visible, W = g.map.w;
    for (const s of this.parts.values()) s.n = 0;
    const alive = new Set();
    for (const u of g.units) {
      if (u.dead) continue;
      alive.add(u.id);
      if (u.owner !== me && !vis[Math.floor(u.y) * W + Math.floor(u.x)]) continue;
      const st = this.unitState_(u, dt);
      const x = u.px + (u.x - u.px) * alpha, z = u.py + (u.y - u.py) * alpha;
      const dx = x - st.lx, dz = z - st.ly, dist = Math.hypot(dx, dz);
      st.lx = x; st.ly = z;
      const moving = dist > 0.0005;
      st.walk += ((moving ? 1 : 0) - st.walk) * Math.min(1, dt * 10);
      st.phase += dist * (UNITS[u.type].cls === 'cavalry' ? 6 : u.type === 'robot' ? 5 : 10.5);
      let targetYaw = st.yaw;
      if (moving && dist > 0.002) targetYaw = Math.atan2(dx, dz);
      const o = u.order;
      const tgt = o && o.target ? g.get(o.target) : null;
      if ((u.working || u.atkAnim > 0) && tgt) targetYaw = Math.atan2(tgt.x - x, tgt.y - z);
      st.yaw = lerpAngle(st.yaw, targetYaw, Math.min(1, dt * 9));
      st.swing = u.atkAnim > 0 ? 1 - u.atkAnim / 0.35 : 0;
      st.aim = !!(o && o.kind === 'attack' && (u.working || u.atkAnim > 0));
      if (UNITS[u.type].cls === 'air') { const dy = lerpAngle(0, targetYaw - st.yaw, 1); st.bank = (st.bank || 0) + (Math.max(-0.6, Math.min(0.6, -dy * 1.5)) - (st.bank || 0)) * Math.min(1, dt * 3); }
      if (u.type === 'tank') { const want = tgt ? lerpAngle(0, Math.atan2(tgt.x - x, tgt.y - z) - st.yaw, 1) : 0; st.turret = lerpAngle(st.turret || 0, want, Math.min(1, dt * 4)); }
      st.work = u.working && u.type === 'villager' ? 1 : 0;
      st.toolKind = null;
      if (u.type === 'villager' && o) {
        const gk = o.gk || (o.resume && o.resume.gk);
        st.toolKind = o.kind === 'build' ? 'hammer' : gk === 'tree' ? 'axe' : (gk === 'gold' || gk === 'stone') ? 'pick' : gk === 'farm' ? 'hoe' : (gk === 'berries' || gk === 'sheep') ? 'basket' : null;
      }
      st.workKind = st.toolKind;
      st.carry = u.carry && u.carry.amount > 0 ? u.carry.type : null;
      const y = this.heightAt(x, z);
      this.emitUnit(u, u.type, u.owner, x, y, z, st.yaw, st);
      // poussière des cavaliers
      if (moving && UNITS[u.type].cls === 'cavalry' && Math.random() < dt * 8) this.dust.emit(x, y + 0.05, z, (Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3, 0.9, 0.25, 0.7, [0.6, 0.52, 0.4, 0.35], [0.6, 0.55, 0.45, 0]);
    }
    for (const id of this.unitState.keys()) if (!alive.has(id)) this.unitState.delete(id);
    // cadavres
    for (const fx of g.effects) {
      if (fx.kind !== 'corpse' || !vis[Math.floor(fx.y) * W + Math.floor(fx.x)]) continue;
      if (!fx._st) fx._st = { yaw: Math.random() * 6, phase: 0, walk: 0, seed: Math.random(), swing: 0, work: 0, lean: 0 };
      const sink = Math.max(0, fx.t - 6) * 0.08;
      this.emitUnit(null, fx.type, fx.owner, fx.x, this.heightAt(fx.x, fx.y) - sink, fx.y, fx._st.yaw, fx._st, Math.min(1, fx.t + 0.01));
    }
    for (const s of this.parts.values()) {
      s.mesh.count = s.n;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ nature
  setupNature() {
    const T = this.T;
    this.barkMat = this.std({ map: T.bark.map, normalMap: T.bark.normal, roughness: 0.9 });
    this.leafMat = this.std({ map: T.foliage, vertexColors: true, roughness: 0.82, color: 0xffffff }, { wind: 0.014 });
    this.pineMat = this.std({ map: T.foliage, vertexColors: true, roughness: 0.85, color: 0xffffff }, { wind: 0.01 });
    const kinds = this.treeKinds = treeGeometries();
    const count = this.game.map.w * this.game.map.h;
    const cap = Math.min(count, 6000);
    this.treeMeshes = kinds.map((k) => {
      const trunk = new THREE.InstancedMesh(k.trunk, this.barkMat, cap);
      const leaves = new THREE.InstancedMesh(k.leaves, k.pine ? this.pineMat : this.leafMat, cap);
      for (const m of [trunk, leaves]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; this.scene.add(m); }
      leaves.setColorAt(0, new THREE.Color(1, 1, 1));
      return { trunk, leaves, ids: [] };
    });
    const R = rockGeometries();
    this.rockMatGold = this.std({ color: 0x8a7a62, roughness: 0.85, flatShading: true });
    this.rockMatStone = this.std({ color: 0xb4b2ae, roughness: 0.85, flatShading: true });
    this.nuggetMat = this.std({ color: 0xffc83a, metalness: 1, roughness: 0.25, emissive: 0x3a2400, flatShading: true });
    const inst = (geo, mat, n, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; this.scene.add(m); return m; };
    this.rocks = {
      gold: R.gold.map((g) => ({ mesh: inst(g, this.rockMatGold, 800), ids: [] })),
      nugget: R.nugget.map((g) => ({ mesh: inst(g, this.nuggetMat, 800), ids: [] })),
      stone: R.stone.map((g) => ({ mesh: inst(g, this.rockMatStone, 800), ids: [] })),
    };
    const BG = bushGeometries();
    this.bushMat = this.std({ map: T.foliage, vertexColors: true, color: 0x6a9a48, roughness: 0.85 }, { wind: 0.05 });
    this.berryMat = this.std({ color: 0xc02a48, roughness: 0.35 });
    this.bushMesh = { mesh: inst(BG.bush, this.bushMat, 500), ids: [] };
    this.berryMesh = inst(BG.berries, this.berryMat, 500, false);
    const SG = sheepGeometries();
    this.sheepWool = inst(SG.wool, this.std({ color: 0xf2efe6, roughness: 1 }), 200);
    this.sheepDark = inst(SG.dark, this.std({ color: 0x2e2a26, roughness: 0.8 }), 200);
    this.sheepIds = [];
    // herbe
    this.grassMesh = null;
    if (this.q.grass > 0) this.buildGrass();
    // cultures des fermes
    this.cropMat = this.std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }, { wind: 1.4 });
    this.cropMesh = inst(grassTuftGeometry(7, 0.3, 610), this.cropMat, 6000, false);
    this.cropMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.resSig = '';
  }

  buildGrass() {
    const g = this.game, { w, h } = g.map;
    const per = this.q.grass;
    const list = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = g.map.terrain[y * w + x];
      if (t === TERRAIN.WATER || t === TERRAIN.SAND) continue;
      const n = t === TERRAIN.DIRT ? Math.floor(per / 3) : per;
      for (let k = 0; k < n; k++) list.push([x + hash(x * 13 + k, y) * 0.95, y + hash(x, y * 17 + k) * 0.95, y * w + x, k]);
    }
    const geo = grassTuftGeometry(6, 0.2, 600);
    const mat = this.std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, color: 0xffffff }, { wind: 1.8 });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.grassMats = new Float32Array(list.length * 16);
    this.grassTile = new Int32Array(list.length);
    const forest = this.painter.forest;
    list.forEach(([x, z, ti, k], i) => {
      const s = 0.7 + hash(ti, k + 3) * 0.8;
      tmpM.compose(tmpV.set(x, this.heightAt(x, z), z), tmpQ.setFromAxisAngle(UP, hash(ti, k) * 6.28), tmpS.set(s, s * (0.8 + hash(k, ti) * 0.6), s));
      tmpM.toArray(this.grassMats, i * 16);
      mesh.setMatrixAt(i, tmpM);
      const f = forest[ti];
      const yel = hash(ti * 3, k);
      tmpC.setRGB(0.72 + yel * 0.3 - f * 0.25, 0.78 + yel * 0.08 - f * 0.2, 0.44 - f * 0.12);
      mesh.setColorAt(i, tmpC);
      this.grassTile[i] = ti;
    });
    this.grassBlocked = new Uint8Array(w * h);
    this.grassMesh = mesh;
    this.scene.add(mesh);
    this.updateGrassBlocking(true);
  }

  updateGrassBlocking(force = false) {
    if (!this.grassMesh) return;
    const m = this.game.map, n = m.w * m.h;
    let dirty = false;
    const now = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const id = m.occ[i];
      let b = m.farm[i] ? 1 : 0;
      if (id) { const e = this.game.entities.get(id); if (e && e.kind === 'building') b = 1; }
      now[i] = b;
      if (b !== this.grassBlocked[i]) dirty = true;
    }
    if (!dirty && !force) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.grassTile.length; i++) {
      const ti = this.grassTile[i];
      if (now[ti] === this.grassBlocked[ti] && !force) continue;
      if (now[ti]) this.grassMesh.setMatrixAt(i, zero);
      else { tmpM.fromArray(this.grassMats, i * 16); this.grassMesh.setMatrixAt(i, tmpM); }
    }
    this.grassBlocked = now;
    this.grassMesh.instanceMatrix.needsUpdate = true;
  }

  syncResources() {
    const g = this.game;
    let sig = g.resources.length;
    for (const r of g.resources) if (r.type !== 'tree') sig = (sig * 31 + Math.ceil(r.amount / r.maxAmount * 6)) | 0;
    if (sig === this.resSig) return;
    this.resSig = sig;
    for (const k of this.treeMeshes) { k.trunk.count = 0; k.leaves.count = 0; k.ids = []; }
    for (const arr of Object.values(this.rocks)) for (const r of arr) { r.mesh.count = 0; r.ids = []; }
    this.bushMesh.mesh.count = 0; this.bushMesh.ids = []; this.berryMesh.count = 0;
    this.sheepIds = [];
    const put = (mesh, ids, e, x, y, z, ry, s, sy = s) => {
      const i = mesh.count;
      if (i >= mesh.instanceMatrix.count) return -1;
      tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromAxisAngle(UP, ry), tmpS.set(s, sy, s));
      mesh.setMatrixAt(i, tmpM);
      mesh.count++;
      if (ids) ids.push(e.id);
      return i;
    };
    for (const r of g.resources) {
      if (r.dead) continue;
      const v = r.variant;
      const x = r.x + (hash(v, 1) - 0.5) * 0.35, z = r.y + (hash(v, 2) - 0.5) * 0.35;
      const y = this.heightAt(x, z);
      if (r.type === 'tree') {
        const k = this.treeMeshes[v % this.treeMeshes.length];
        const s = 0.95 + hash(v, 3) * 0.45;
        put(k.trunk, k.ids, r, x, y, z, hash(v, 4) * 6.28, s, s * (0.9 + hash(v, 5) * 0.3));
        const i = put(k.leaves, null, r, x, y, z, hash(v, 4) * 6.28, s, s * (0.9 + hash(v, 5) * 0.3));
        if (i >= 0) { const hh = hash(v, 6), au = hash(v, 8) > 0.88 ? 1 : 0; tmpC.setRGB(0.36 + hh * 0.22 + au * 0.45, 0.74 + hh * 0.14 - au * 0.1, 0.16 + hh * 0.05); k.leaves.setColorAt(i, tmpC); }
      } else if (r.type === 'gold' || r.type === 'stone') {
        const k = r.amount / r.maxAmount;
        const s = 0.55 + 0.5 * Math.sqrt(k);
        const set = this.rocks[r.type][v % 2];
        put(set.mesh, set.ids, r, r.x, y, r.y, hash(v, 4) * 6.28, s);
        if (r.type === 'gold') { const n = this.rocks.nugget[v % 2]; put(n.mesh, n.ids, r, r.x, y, r.y, hash(v, 4) * 6.28, s); }
      } else if (r.type === 'berries') {
        put(this.bushMesh.mesh, this.bushMesh.ids, r, x, y, z, hash(v, 4) * 6.28, 1.1);
        const k = r.amount / r.maxAmount;
        put(this.berryMesh, null, r, x, y, z, hash(v, 4) * 6.28, 1.1 * (k > 0.02 ? 1 : 0) * (0.6 + 0.4 * k));
      } else if (r.type === 'sheep') {
        this.sheepIds.push(r.id);
      }
    }
    const all = [...this.treeMeshes.flatMap((k) => [k.trunk, k.leaves]), ...Object.values(this.rocks).flat().map((r) => r.mesh), this.bushMesh.mesh, this.berryMesh];
    for (const m of all) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.boundingSphere = null; }
  }

  syncSheep() {
    const g = this.game;
    let n = 0;
    for (const id of this.sheepIds) {
      const r = g.get(id);
      if (!r) continue;
      const v = r.variant, t = this.time + v;
      const graze = Math.sin(t * 0.6) > 0.2 ? 0.35 : 0;
      const yaw = hash(v, 9) * 6.28 + Math.sin(t * 0.15) * 0.6;
      tmpM.compose(tmpV.set(r.x, this.heightAt(r.x, r.y) + Math.abs(Math.sin(t * 3)) * 0.005, r.y), tmpQ.setFromEuler(tmpE.set(graze * 0.3, yaw, 0)), tmpS.set(1.35, 1.35, 1.35));
      this.sheepWool.setMatrixAt(n, tmpM); this.sheepDark.setMatrixAt(n, tmpM);
      n++;
    }
    this.sheepWool.count = this.sheepDark.count = n;
    this.sheepWool.instanceMatrix.needsUpdate = true; this.sheepDark.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ divers
  setupMisc() {
    this.smoke = new Particles(2500, false);
    this.fire = new Particles(1500, true);
    this.dust = new Particles(1500, false);
    this.scene.add(this.smoke.points, this.fire.points, this.dust.points);
    const ring = new THREE.RingGeometry(0.84, 1, 48); ring.rotateX(-Math.PI / 2);
    // cadre carré fin pour les bâtiments (coins marqués)
    const sq = [];
    for (const [x, z, w, d] of [[0, -0.5, 1, 0.04], [0, 0.5, 1, 0.04], [-0.5, 0, 0.04, 1], [0.5, 0, 0.04, 1]]) sq.push(new THREE.BoxGeometry(w, 0.02, d).translate(x, 0, z));
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) sq.push(new THREE.BoxGeometry(0.12, 0.03, 0.12).translate(x, 0, z));
    this.squareMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
    this.squares = new THREE.InstancedMesh(mergeGeos(sq), this.squareMat, 120);
    this.squares.frustumCulled = false; this.squares.count = 0; this.squares.renderOrder = 5;
    this.squares.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.squares);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.rings = new THREE.InstancedMesh(ring, this.ringMat, 600);
    this.rings.frustumCulled = false; this.rings.count = 0; this.rings.renderOrder = 5;
    this.rings.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.rings);
    this.arrowMat = this.std({ color: 0x5a4028, roughness: 0.8 });
    this.arrows = new THREE.InstancedMesh(arrowGeometry(), this.arrowMat, 400);
    this.arrows.frustumCulled = false; this.arrows.count = 0; this.arrows.castShadow = true;
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 1), this.std({ color: 0x55504a, roughness: 0.8, flatShading: true }), 80);
    this.balls.frustumCulled = false; this.balls.count = 0; this.balls.castShadow = true;
    this.scene.add(this.arrows, this.balls);
    // balles traçantes et faisceaux
    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 0.55);
    this.tracers = new THREE.InstancedMesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }), 400);
    this.tracers.frustumCulled = false; this.tracers.count = 0;
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8); beamGeo.rotateX(Math.PI / 2);
    this.beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
    this.beams.frustumCulled = false; this.beams.count = 0;
    this.beams.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.tracers, this.beams);
    this.rubble = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), this.std({ color: 0x7a6e60, roughness: 0.95, flatShading: true }), 1500);
    this.rubble.frustumCulled = false; this.rubble.count = 0; this.rubble.castShadow = true; this.rubble.receiveShadow = true;
    this.scene.add(this.rubble);
    this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, depthWrite: false }));
    this.marker.visible = false; this.marker.renderOrder = 6;
    this.scene.add(this.marker);
    this.rally = null;
    this.ghost = null;
    this.ghostKey = '';
    this.ghostOk = this.std({ color: 0x60ff70, transparent: true, opacity: 0.45, emissive: 0x20a030, emissiveIntensity: 0.6, depthWrite: false });
    this.ghostBad = this.std({ color: 0xff5050, transparent: true, opacity: 0.45, emissive: 0xa02020, emissiveIntensity: 0.6, depthWrite: false });
    this.footOk = new THREE.MeshBasicMaterial({ color: 0x60ff70, transparent: true, opacity: 0.3, depthWrite: false });
    this.footBad = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false });
  }

  civOf(owner) { return (this.game.players[owner] && this.game.players[owner].civ) || 'francs'; }

  template(type, owner, civ = this.civOf(owner)) {
    const key = type + owner + civ;
    let t = this.templates.get(key);
    if (!t) {
      const def = BUILDINGS[type];
      const team = this.teams[owner] || this.teams[0];
      if (EXTRA_TYPES.has(type)) t = extraBuildingModel(type, def.size, this.M, team, civ);
      else t = civ !== 'francs' && !def.farm && !def.wall ? civBuildingModel(type, def.size, this.M, team, civ) : buildingModel(type, def.size, this.M, team);
      this.templates.set(key, t);
    }
    return t;
  }

  instantiate(type, owner) {
    const tpl = this.template(type, owner);
    const g = tpl.clone(true);
    // retrouve les éléments animés dans la copie
    const anim = { blades: null, banners: [] };
    g.traverse((o) => { if (o.userData.banner) anim.banners.push(o); });
    const tan = tpl.anim || {};
    if (tan.blades) {
      const path = [];
      let o = tan.blades;
      while (o && o !== tpl) { path.unshift(o.parent.children.indexOf(o)); o = o.parent; }
      let c = g; for (const i of path) c = c.children[i];
      anim.blades = c;
    }
    if (tan.rocket) anim.rocket = g.getObjectByName('rocket');
    g.userData = { anim, smoke: tan.smoke || [], forge: tan.forge || null };
    return g;
  }

  baseHeight(b) {
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of [[b.tx, b.ty], [b.tx + b.size, b.ty], [b.tx, b.ty + b.size], [b.tx + b.size, b.ty + b.size], [b.x, b.y]]) {
      const h = this.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return Math.max(-0.05, (lo + hi) / 2);
  }

  palMask(b) {
    const m = this.game.map;
    let mask = 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], i) => {
      const x = b.tx + dx, y = b.ty + dy;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
      const e = this.game.entities.get(m.occ[y * m.w + x]);
      if (e && e.kind === 'building' && e.type === b.type && !e.dead) mask |= 1 << i;
    });
    return mask;
  }

  syncBuildings(dt) {
    const g = this.game, me = this.me;
    const seen = new Set();
    for (const b of g.buildings) {
      if (b.dead) continue;
      if (!g.isVisible(me, b)) continue;
      seen.add(b.id);
      let e = this.buildings.get(b.id);
      const def = BUILDINGS[b.type];
      const mask = def.wall ? this.palMask(b) : 0;
      if (e && def.wall && e.mask !== mask) { this.scene.remove(e.group); e = null; }
      if (!e) {
        const group = def.wall ? (b.type === 'stone_wall' ? stoneWallModel(mask, this.M, this.teams[b.owner], civWallMaterial(this.civOf(b.owner), this.M)) : palisadeModel(mask, this.M)) : this.instantiate(b.type, b.owner);
        if (def.wall) group.userData = { anim: { banners: [] } };
        group.traverse((o) => { o.userData.entityId = b.id; });
        const base = this.baseHeight(b);
        group.position.set(b.tx, base, b.ty);
        this.scene.add(group);
        e = { group, base, built: null, mask, scaffold: null, emitT: 0 };
        this.buildings.set(b.id, e);
      }
      if (e.built !== b.built) {
        e.built = b.built;
        if (!b.built && !def.farm) {
          e.scaffold = scaffoldModel(b.size, this.M);
          e.scaffold.position.copy(e.group.position);
          e.scaffold.traverse((o) => { o.userData.entityId = b.id; });
          this.scene.add(e.scaffold);
        } else if (e.scaffold) {
          this.scene.remove(e.scaffold); e.scaffold = null;
          this.burst(b, 12, true);
        }
      }
      const k = b.built ? 1 : Math.max(0.04, b.progress);
      e.group.scale.set(1, def.farm ? 1 : k, 1);
      // animations
      const an = e.group.userData.anim;
      if (an && an.blades) an.blades.rotation.z += dt * 0.9;
      if (an && an.rocket) {
        // décollage de la fusée dans les dernières secondes du compte à rebours
        const left = b.countdown;
        if (left !== undefined && left < 12) {
          const k = 12 - left;
          an.rocket.position.y = 0.1 + Math.max(0, k - 3) ** 2.2 * 0.12;
          const rx = b.tx + an.rocket.position.x, rz = b.ty + an.rocket.position.z, ry = e.base + an.rocket.position.y;
          for (let i = 0; i < 6; i++) this.fire.emit(rx + (Math.random() - 0.5) * 0.3, ry, rz + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, -1.5 - Math.random(), (Math.random() - 0.5) * 0.6, 0.6, 0.6, 0.2, [1, 0.8, 0.4, 1], [1, 0.3, 0.05, 0]);
          for (let i = 0; i < 3; i++) this.smoke.emit(rx + (Math.random() - 0.5) * 0.8, e.base + 0.3 + Math.max(0, ry - e.base - 1) * Math.random() * 0.5, rz + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6, 0.3, (Math.random() - 0.5) * 1.6, 5, 0.8, 3.2, [0.92, 0.9, 0.88, 0.6], [0.7, 0.7, 0.7, 0]);
        }
      }
      if (b.built && g.players[me].visible[Math.floor(b.y) * g.map.w + Math.floor(b.x)]) {
        e.emitT -= dt;
        if (e.emitT <= 0) {
          e.emitT = 0.18;
          for (const s of e.group.userData.smoke || []) this.smoke.emit(b.tx + s[0], e.base + s[1], b.ty + s[2], 0.08 + Math.random() * 0.05, 0.35, 0.02, 4, 0.25, 0.9, [0.85, 0.85, 0.85, 0.35], [0.7, 0.7, 0.72, 0]);
          const f = e.group.userData.forge;
          if (f && Math.random() < 0.6) this.fire.emit(b.tx + f[0] + (Math.random() - 0.5) * 0.15, e.base + f[1], b.ty + f[2], 0, 0.5, 0, 0.5, 0.16, 0.04, [1, 0.55, 0.15, 0.9], [1, 0.2, 0.05, 0]);
        }
        const dmg = 1 - b.hp / b.maxHp;
        if (dmg > 0.35 && !def.wall && !def.farm && Math.random() < dt * 12 * dmg) {
          const px = b.tx + b.size * (0.25 + Math.random() * 0.5), pz = b.ty + b.size * (0.25 + Math.random() * 0.5);
          const py = e.base + 0.6 + b.size * 0.4 * Math.random();
          this.fire.emit(px, py, pz, (Math.random() - 0.5) * 0.2, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.2, 0.7, 0.45 * (0.6 + dmg), 0.1, [1, 0.6, 0.2, 0.9], [1, 0.15, 0.02, 0]);
          if (Math.random() < 0.5) this.smoke.emit(px, py + 0.4, pz, 0.15, 0.6, 0.05, 3.5, 0.5, 1.8, [0.18, 0.16, 0.15, 0.55], [0.3, 0.3, 0.3, 0]);
        }
      }
    }
    for (const [id, e] of this.buildings) {
      if (seen.has(id)) continue;
      const b = g.entities.get(id);
      this.scene.remove(e.group);
      if (e.scaffold) this.scene.remove(e.scaffold);
      this.buildings.delete(id);
      if (b && b.dead) this.burst(b, 40, false);
    }
    // cultures
    let n = 0;
    const cm = this.cropMesh;
    for (const b of g.buildings) {
      if (b.dead || !BUILDINGS[b.type].farm || !b.built || !g.isVisible(me, b)) continue;
      const e = this.buildings.get(b.id);
      if (!e) continue;
      const k = Math.max(0, Math.min(1, b.food / (BUILDINGS.farm.food + 1)));
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        if (n >= cm.instanceMatrix.count) break;
        const x = b.tx + 0.3 + i * 0.34 + (hash(b.id + i, j) - 0.5) * 0.08, z = b.ty + 0.3 + j * 0.34;
        const s = 0.8 + hash(i, j + b.id) * 0.3;
        tmpM.compose(tmpV.set(x, e.base + 0.02, z), tmpQ.setFromAxisAngle(UP, hash(j, i) * 6), tmpS.set(s, s * (0.35 + k * 1.0), s));
        cm.setMatrixAt(n, tmpM);
        tmpC.setRGB(0.55 + (1 - k) * 0.45, 0.72 - (1 - k) * 0.05, 0.25);
        cm.setColorAt(n, tmpC);
        n++;
      }
    }
    cm.count = n; cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
  }

  burst(b, n, light) {
    const base = this.buildings.get(b.id)?.base ?? this.heightAt(b.x, b.y);
    for (let i = 0; i < n; i++) {
      const x = b.tx + Math.random() * b.size, z = b.ty + Math.random() * b.size;
      this.dust.emit(x, base + 0.2 + Math.random() * 0.6, z, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, light ? 1.2 : 2.5, light ? 0.4 : 0.7, light ? 1.2 : 2.4, [0.62, 0.56, 0.46, light ? 0.4 : 0.7], [0.55, 0.52, 0.48, 0]);
    }
  }

  syncEffects(dt) {
    const g = this.game, vis = g.players[this.me].visible, W = g.map.w;
    let rn = 0;
    for (const fx of g.effects) {
      if (fx.kind === 'blast' && !this.seenFx.has(fx)) {
        this.seenFx.add(fx);
        const y = this.heightAt(fx.x, fx.y);
        for (let i = 0; i < 18; i++) this.fire.emit(fx.x, y + 0.2, fx.y, (Math.random() - 0.5) * 2.4, Math.random() * 2, (Math.random() - 0.5) * 2.4, 0.5, 0.5, 0.1, [1, 0.7, 0.3, 1], [1, 0.2, 0, 0], 2);
        for (let i = 0; i < 10; i++) this.smoke.emit(fx.x, y + 0.3, fx.y, (Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8, 2.5, 0.6, 1.8, [0.3, 0.28, 0.25, 0.6], [0.4, 0.4, 0.4, 0]);
      }
      if (fx.kind === 'rubble' && this.game.players[this.me].explored[Math.floor(fx.y) * W + Math.floor(fx.x)]) {
        const base = this.heightAt(fx.x, fx.y);
        const n = Math.round(fx.size * 9);
        const sink = Math.max(0, fx.t - 14) * 0.05;
        for (let i = 0; i < n && rn < this.rubble.instanceMatrix.count; i++) {
          const x = fx.x - fx.size / 2 + hash(i, fx.size * 7 + Math.floor(fx.x)) * fx.size, z = fx.y - fx.size / 2 + hash(fx.size * 3 + Math.floor(fx.y), i) * fx.size;
          const s = 0.6 + hash(i, 3) * 1.4;
          tmpM.compose(tmpV.set(x, base + 0.02 - sink, z), tmpQ.setFromEuler(tmpE.set(hash(i, 1) * 3, hash(i, 2) * 3, 0)), tmpS.set(s, s * 0.6, s));
          this.rubble.setMatrixAt(rn++, tmpM);
        }
        if (vis[Math.floor(fx.y) * W + Math.floor(fx.x)] && fx.t < 5 && Math.random() < dt * 6) this.smoke.emit(fx.x + (Math.random() - 0.5) * fx.size, base + 0.3, fx.y + (Math.random() - 0.5) * fx.size, 0.1, 0.4, 0, 3, 0.6, 1.6, [0.35, 0.33, 0.3, 0.5], [0.45, 0.45, 0.45, 0]);
      }
    }
    this.rubble.count = rn; this.rubble.instanceMatrix.needsUpdate = true;
    // projectiles
    let an = 0, bn = 0, tn = 0, ln = 0;
    for (const pr of g.projectiles) {
      if (pr.owner !== this.me && !vis[Math.floor(pr.y) * W + Math.floor(pr.x)]) continue;
      const k = Math.min(1, pr.t / pr.dur);
      const h0 = this.heightAt(pr.x0, pr.y0) + (pr.air0 ? 2.9 : pr.fromBuilding ? 1.6 : 0.55), h1 = this.heightAt(pr.tx, pr.ty) + (pr.air1 ? 2.9 : 0.3);
      const pos = (kk) => {
        const x = pr.x0 + (pr.tx - pr.x0) * kk, z = pr.y0 + (pr.ty - pr.y0) * kk;
        const y = pr.kind === 'bomb' ? h0 - (h0 - h1) * kk * kk : h0 + (h1 - h0) * kk + Math.sin(kk * Math.PI) * pr.arc * 0.8;
        return new THREE.Vector3(x, y, z);
      };
      const p0 = pos(k), p1 = pos(Math.min(1, k + 0.03));
      // éclair de bouche à la création du projectile
      if (!this.seenFx.has(pr)) {
        this.seenFx.add(pr);
        const s0 = pos(0), dir = pos(0.05).sub(s0).normalize();
        if (pr.kind === 'bullet' || pr.kind === 'shell') {
          const big = pr.kind === 'shell';
          this.fire.emit(s0.x + dir.x * 0.3, s0.y, s0.z + dir.z * 0.3, dir.x, 0.1, dir.z, big ? 0.18 : 0.07, big ? 0.9 : 0.28, 0.05, [1, 0.9, 0.5, 1], [1, 0.4, 0.1, 0]);
          this.smoke.emit(s0.x + dir.x * 0.4, s0.y, s0.z + dir.z * 0.4, dir.x * 0.4, 0.2, dir.z * 0.4, big ? 2.2 : 1.1, big ? 0.5 : 0.18, big ? 1.6 : 0.6, [0.85, 0.85, 0.82, big ? 0.6 : 0.35], [0.7, 0.7, 0.7, 0]);
        } else if (pr.kind === 'laser') {
          this.fire.emit(s0.x, s0.y, s0.z, 0, 0, 0, 0.12, 0.5, 0.1, [0.6, 0.95, 1, 1], [0.3, 0.6, 1, 0]);
        }
      }
      if (pr.kind === 'arrow' || pr.kind === 'javelin') {
        if (an >= this.arrows.instanceMatrix.count) continue;
        tmpM.lookAt(p1, p0, UP); tmpM.setPosition(p0);
        if (pr.kind === 'javelin') tmpM.scale(tmpS.set(1.3, 1.3, 1.8));
        this.arrows.setMatrixAt(an++, tmpM);
      } else if (pr.kind === 'bullet') {
        if (tn >= this.tracers.instanceMatrix.count) continue;
        tmpM.lookAt(p1, p0, UP); tmpM.setPosition(p0);
        this.tracers.setMatrixAt(tn++, tmpM);
      } else if (pr.kind === 'laser') {
        if (ln >= this.beams.instanceMatrix.count) continue;
        const a0 = pos(0), a1 = pos(1);
        const len = a0.distanceTo(a1);
        tmpM.lookAt(a1, a0, UP); tmpM.setPosition(a0.clone().add(a1).multiplyScalar(0.5)); tmpM.scale(tmpS.set(1 - k * 0.6, 1 - k * 0.6, len));
        this.beams.setMatrixAt(ln, tmpM);
        this.beams.setColorAt(ln++, tmpC.set(g.players[pr.owner] ? g.players[pr.owner].color : '#ffffff').lerp(new THREE.Color(0xffffff), 0.45));
        if (Math.random() < 0.5) this.fire.emit(a1.x, a1.y, a1.z, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), 0.25, 0.25, 0.05, [0.7, 0.95, 1, 1], [0.3, 0.5, 1, 0]);
      } else {
        if (bn >= this.balls.instanceMatrix.count) continue;
        tmpM.makeTranslation(p0.x, p0.y, p0.z);
        if (pr.kind === 'ball' || pr.kind === 'shell') tmpM.scale(tmpS.set(0.7, 0.7, 0.7));
        if (pr.kind === 'bomb') tmpM.scale(tmpS.set(1.1, 1.6, 1.1));
        if (pr.kind === 'pebble') tmpM.scale(tmpS.set(0.35, 0.35, 0.35));
        this.balls.setMatrixAt(bn++, tmpM);
        if (pr.kind !== 'pebble' && Math.random() < 0.5) this.smoke.emit(p0.x, p0.y, p0.z, 0, 0.1, 0, 0.8, 0.15, 0.5, [0.6, 0.6, 0.6, 0.4], [0.6, 0.6, 0.6, 0]);
      }
    }
    this.arrows.count = an; this.balls.count = bn; this.tracers.count = tn; this.beams.count = ln;
    this.tracers.instanceMatrix.needsUpdate = true; this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    this.arrows.instanceMatrix.needsUpdate = true; this.balls.instanceMatrix.needsUpdate = true;
  }

  syncSelection(ui) {
    const g = this.game;
    let n = 0, sn = 0;
    const put = (x, z, r, color) => {
      if (n >= this.rings.instanceMatrix.count) return;
      tmpM.compose(tmpV.set(x, this.heightAt(x, z) + 0.04, z), tmpQ.identity(), tmpS.set(r, 1, r));
      this.rings.setMatrixAt(n, tmpM); this.rings.setColorAt(n, tmpC.set(color)); n++;
    };
    for (const id of ui.selected) {
      const e = g.get(id);
      if (!e) continue;
      const col = e.owner === this.me ? 0x7dff7a : e.owner < 0 ? 0xffe066 : 0xff5a4e;
      if (e.kind === 'unit') {
        const st = this.unitState.get(e.id);
        const x = st ? st.lx : e.x, z = st ? st.ly : e.y;
        put(x, z, UNITS[e.type].cls === 'cavalry' || UNITS[e.type].cls === 'siege' ? 0.42 : 0.27, col);
      } else if (sn < this.squares.instanceMatrix.count) {
        const base = this.buildings.get(e.id)?.base ?? this.heightAt(e.x, e.y);
        tmpM.compose(tmpV.set(e.x, base + 0.06, e.y), tmpQ.identity(), tmpS.set(e.size + 0.15, 1, e.size + 0.15));
        this.squares.setMatrixAt(sn, tmpM); this.squares.setColorAt(sn, tmpC.set(col)); sn++;
      }
    }
    this.squares.count = sn; this.squares.instanceMatrix.needsUpdate = true; if (this.squares.instanceColor) this.squares.instanceColor.needsUpdate = true;
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    // marqueur d'ordre
    const now = performance.now() / 1000;
    if (ui.marker && now - ui.marker.t < 0.7) {
      const k = (now - ui.marker.t) / 0.7;
      this.marker.visible = true;
      this.marker.position.set(ui.marker.x, this.heightAt(ui.marker.x, ui.marker.y) + 0.05, ui.marker.y);
      this.marker.scale.setScalar(0.6 * (1 - k) + 0.15);
      this.marker.material.color.set(ui.marker.color);
      this.marker.material.opacity = 1 - k;
    } else this.marker.visible = false;
    // drapeau de ralliement
    const rb = [...ui.selected].map((id) => g.get(id)).find((b) => b && b.kind === 'building' && b.owner === this.me && b.rally);
    if (rb) {
      if (!this.rally) { this.rally = makeBanner(this.M, this.teams[this.me], 0.8, 0.34, 0.22); this.scene.add(this.rally); }
      this.rally.visible = true;
      this.rally.position.set(rb.rally.x, this.heightAt(rb.rally.x, rb.rally.y), rb.rally.y);
    } else if (this.rally) this.rally.visible = false;
    // fantôme de placement
    const pl = ui.placing;
    const key = pl ? `${pl.type}` : '';
    if (key !== this.ghostKey) {
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
      if (this.ghostFeet) { for (const f of this.ghostFeet) this.scene.remove(f); this.ghostFeet = null; }
      this.ghostKey = key;
      if (pl && !BUILDINGS[pl.type].wall) {
        this.ghost = this.template(pl.type, this.me).clone(true);
        this.scene.add(this.ghost);
      }
    }
    if (pl) {
      const def = BUILDINGS[pl.type];
      const tiles = pl.tiles || [[pl.tx, pl.ty]];
      const okAll = tiles.every(([x, y]) => g.canPlace(this.me, pl.type, x, y));
      if (this.ghost) {
        this.ghost.position.set(pl.tx, this.baseHeight({ tx: pl.tx, ty: pl.ty, size: def.size, x: pl.tx + def.size / 2, y: pl.ty + def.size / 2 }), pl.ty);
        const m = okAll ? this.ghostOk : this.ghostBad;
        this.ghost.traverse((o) => { if (o.isMesh) o.material = m; });
      }
      if (!this.ghostFeet) this.ghostFeet = [];
      while (this.ghostFeet.length < tiles.length) {
        const f = new THREE.Mesh(boxGeo(1, 0.02, 1), this.footOk); f.renderOrder = 4; this.scene.add(f); this.ghostFeet.push(f);
      }
      this.ghostFeet.forEach((f, i) => {
        if (i >= tiles.length) { f.visible = false; return; }
        const [x, y] = tiles[i];
        f.visible = true;
        f.scale.set(def.size * 0.98, 1, def.size * 0.98);
        f.position.set(x + def.size / 2, this.heightAt(x + def.size / 2, y + def.size / 2) + 0.05, y + def.size / 2);
        f.material = g.canPlace(this.me, pl.type, x, y) ? this.footOk : this.footBad;
      });
    }
  }

  setupPost() {
    this.composer = null;
    if (!this.q.post) return;
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.ao) {
      const ao = this.gtao = new GTAOPass(this.scene, this.camera, 16, 16);
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.3, scale: 1.15, samples: this.q.ao, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 1.0;
      c.addPass(ao);
    }
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
  }

  // ------------------------------------------------------------------ caméra
  resize() {
    this.w = window.innerWidth; this.h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(this.w, this.h); }
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = this.w * dpr; this.overlay.height = this.h * dpr;
    this.dpr = dpr;
    for (const p of [this.smoke, this.fire, this.dust]) p.points.material.uniforms.uScale.value = this.h * pr * 1.8;
    this.updateCamera();
  }

  updateCamera() {
    const c = this.camState;
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
    const ty = this.hgrid ? this.heightAt(c.tx, c.tz) * 0.6 : 0;
    this.camera.position.set(c.tx + off.x, ty + off.y, c.tz + off.z);
    this.camera.lookAt(c.tx, ty, c.tz);
    this.camera.updateMatrixWorld();
    this.cam.zoom = 34 / c.dist;
    // l'ombre suit la caméra (alignée sur les texels pour éviter le scintillement)
    const R = Math.max(16, Math.min(60, c.dist * 0.75));
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix();
    const snap = (2 * R) / Math.max(1, this.q.shadow);
    const fx = Math.round(c.tx / snap) * snap, fz = Math.round(c.tz / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunOffset.x, this.sunOffset.y, fz + this.sunOffset.z);
    this.sun.target.updateMatrixWorld();
  }

  clampCam() {
    const c = this.camState, m = this.game.map;
    c.tx = Math.max(0, Math.min(m.w, c.tx)); c.tz = Math.max(0, Math.min(m.h, c.tz));
    this.updateCamera();
  }

  centerOn(x, y) { this.camState.tx = x; this.camState.tz = y; this.clampCam(); }

  worldPerPixel() { return 2 * this.camState.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / this.h; }

  panBy(dx, dy) {
    const k = this.worldPerPixel();
    const c = this.camState;
    // droite écran = (cos, 0, -sin) ; haut écran = -(sin, 0, cos) / sin(pitch)
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const ky = k / Math.sin(c.pitch);
    c.tx += rx * dx * k - fx * dy * ky; c.tz += rz * dx * k - fz * dy * ky;
    this.clampCam();
  }

  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    const c = this.camState;
    c.dist = Math.max(12, Math.min(90, c.dist / factor));
    this.updateCamera();
    const after = this.toWorld(sx, sy);
    c.tx += before.x - after.x; c.tz += before.y - after.y;
    this.clampCam();
  }

  toScreen(x, y, h = 0.35) {
    tmpV.set(x, (this.hgrid ? this.heightAt(x, y) : 0) + h, y).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.w, y: (-tmpV.y * 0.5 + 0.5) * this.h, z: tmpV.z };
  }

  ray(sx, sy) {
    const rc = this.raycaster || (this.raycaster = new THREE.Raycaster());
    rc.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera);
    return rc;
  }

  toWorld(sx, sy) {
    const rc = this.ray(sx, sy);
    const o = rc.ray.origin, d = rc.ray.direction;
    let y = 0.06;
    let x = 0, z = 0;
    for (let i = 0; i < 3; i++) {
      const t = (y - o.y) / d.y;
      x = o.x + d.x * t; z = o.z + d.z * t;
      if (this.hgrid) y = this.heightAt(x, z);
    }
    return { x, y: z };
  }

  // sélection précise : unités (écran), puis bâtiments et ressources (lancer de rayon)
  pick(sx, sy) {
    const g = this.game, me = this.me, pl = g.players[me], W = g.map.w;
    let best = null, bestD = Infinity;
    const px = 1 / this.worldPerPixel();
    for (const u of g.units) {
      if (u.dead || (u.owner !== me && !pl.visible[Math.floor(u.y) * W + Math.floor(u.x)])) continue;
      const cls = UNITS[u.type].cls;
      const big = cls === 'cavalry' || cls === 'siege' || cls === 'mech' || cls === 'air';
      const p = this.toScreen(u.x, u.y, unitMidHeight(u.type));
      const rad = Math.max(10, (cls === 'air' || cls === 'mech' ? 0.7 : big ? 0.45 : 0.3) * px);
      const d = Math.hypot(sx - p.x, (sy - p.y) * 0.8);
      if (d < rad && d - p.z * 0.001 < bestD) { bestD = d; best = u; }
    }
    if (best) return best;
    const rc = this.ray(sx, sy);
    const objs = [];
    for (const [, e] of this.buildings) { objs.push(e.group); if (e.scaffold) objs.push(e.scaffold); }
    const inst = [];
    for (const k of this.treeMeshes) inst.push([k.trunk, k.ids], [k.leaves, k.ids]);
    for (const arr of Object.values(this.rocks)) for (const r of arr) inst.push([r.mesh, r.ids]);
    inst.push([this.bushMesh.mesh, this.bushMesh.ids]);
    const hits = rc.intersectObjects([...objs, ...inst.map((i) => i[0])], true);
    for (const h of hits) {
      let id = h.object.userData.entityId;
      if (id === undefined && h.instanceId !== undefined) {
        const pair = inst.find((i) => i[0] === h.object);
        if (pair) id = pair[1][h.instanceId];
      }
      if (id === undefined) continue;
      const e = g.get(id);
      if (e && (e.kind !== 'resource' || pl.explored[e.ty * W + e.tx])) return e;
    }
    // moutons et sol
    const w = this.toWorld(sx, sy);
    for (const id of this.sheepIds) { const r = g.get(id); if (r && Math.hypot(r.x - w.x, r.y - w.y) < 0.45) return r; }
    const tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (tx >= 0 && ty >= 0 && tx < W && ty < g.map.h) {
      const id = g.map.occ[ty * W + tx] || g.map.farm[ty * W + tx];
      const e = id && g.get(id);
      if (e && g.isVisible(me, e)) return e;
    }
    return null;
  }

  // ------------------------------------------------------------------ dessin
  draw(alpha, ui) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.U.uTime.value = this.time;
    const c = this.camState;
    this.updateFog(dt);
    this.syncResources();
    this.gTimer = (this.gTimer || 0) - dt;
    if (this.gTimer <= 0) { this.gTimer = 0.5; this.updateGrassBlocking(); }
    this.syncBuildings(dt);
    this.syncUnits(alpha, dt);
    this.syncSheep();
    this.syncEffects(dt);
    this.syncSelection(ui);
    this.smoke.update(dt); this.fire.update(dt); this.dust.update(dt);
    this.M.embers.emissiveIntensity = 1.8 + Math.sin(this.time * 7) * 0.4 + Math.sin(this.time * 13) * 0.2;
    void c;
    this.updateCamera();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.drawOverlay(alpha, ui);
  }

  drawOverlay(alpha, ui) {
    const ctx = this.octx, g = this.game, me = this.me, vis = g.players[me].visible, W = g.map.w;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const bar = (x, y, w, k, prog) => {
      ctx.fillStyle = 'rgba(8,10,14,0.75)';
      ctx.beginPath(); ctx.roundRect(x - w / 2 - 1.5, y - 1.5, w + 3, prog !== undefined ? 9 : 6, 3); ctx.fill();
      const grd = ctx.createLinearGradient(0, y, 0, y + 3);
      const col = k > 0.5 ? ['#8ef070', '#3aa82e'] : k > 0.25 ? ['#ffe070', '#d0a020'] : ['#ff7060', '#c02818'];
      grd.addColorStop(0, col[0]); grd.addColorStop(1, col[1]);
      ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect(x - w / 2, y, w * k, 3, 1.5); ctx.fill();
      if (prog !== undefined) { ctx.fillStyle = '#8fd4ff'; ctx.beginPath(); ctx.roundRect(x - w / 2, y + 4, w * prog, 2, 1); ctx.fill(); }
    };
    const zoom = this.cam.zoom;
    for (const u of g.units) {
      if (u.dead) continue;
      const sel = ui.selected.has(u.id);
      if (!sel && u.hp >= u.maxHp) continue;
      if (u.owner !== me && !vis[Math.floor(u.y) * W + Math.floor(u.x)]) continue;
      const st = this.unitState.get(u.id);
      const p = this.toScreen(st ? st.lx : u.x, st ? st.ly : u.y, unitTopHeight(u.type));
      if (p.z > 1) continue;
      bar(p.x, p.y - 6, Math.max(18, 26 * Math.min(1.3, zoom)), Math.max(0, u.hp / u.maxHp));
    }
    for (const b of g.buildings) {
      if (b.dead) continue;
      const sel = ui.selected.has(b.id);
      if (!sel && b.hp >= b.maxHp && b.built) continue;
      if (!g.isVisible(me, b) || BUILDINGS[b.type].wall && !sel) continue;
      const hh = { tower: 3.9, fortress: 4.2, town_center: 5.3, mill: 2.6, wonder: 5.2, space_program: 5.0, factory: 3.6, laser_turret: 2.3 }[b.type] || (BUILDINGS[b.type].farm ? 0.4 : 1.2 + b.size * 0.5);
      const p = this.toScreen(b.x, b.y, hh * (b.built ? 1 : Math.max(0.3, b.progress)));
      if (p.z > 1) continue;
      bar(p.x, p.y - 10, Math.max(40, (24 + b.size * 18) * Math.min(1.2, zoom)), Math.max(0, b.hp / b.maxHp), b.built ? undefined : b.progress);
    }
    if (ui.dragBox) {
      const { x0, y0, x1, y1 } = ui.dragBox;
      ctx.fillStyle = 'rgba(160,255,150,0.08)'; ctx.strokeStyle = 'rgba(200,255,190,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), 3); ctx.fill(); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ minicarte
  buildMinimapBase(size) {
    const g = this.game, m = g.map;
    const cv = document.createElement('canvas');
    cv.width = size * 2; cv.height = size;
    const c = cv.getContext('2d');
    const img = c.createImageData(cv.width, cv.height);
    const col = [0, 0, 0];
    for (let py = 0; py < cv.height; py++) for (let px = 0; px < cv.width; px++) {
      const u = px / cv.width * 2 - 1, v = py / cv.height * 2 - 1;
      const wx = ((u + v) / 2 + 0.5) * m.w, wy = ((v - u) / 2 + 0.5) * m.h;
      const i = (py * cv.width + px) * 4;
      if (wx < 0 || wy < 0 || wx >= m.w || wy >= m.h) { img.data[i + 3] = 0; continue; }
      this.painter.color(wx, wy, col);
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
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
    const g = this.game, m = g.map, me = this.me, pl = g.players[me];
    if (!this.minimapBase) this.buildMinimapBase(Math.round(h * 1.5));
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(this.minimapBase, 0, 0, w, h);
    const cell = Math.max(1, w / m.w);
    for (let y = 0; y < m.h; y += 2) for (let x = 0; x < m.w; x += 2) {
      const i = y * m.w + x;
      if (pl.visible[i]) continue;
      const p = this.minimapPos(x + 1, y + 1, w, h);
      mctx.fillStyle = pl.explored[i] ? 'rgba(5,8,14,0.45)' : '#0a0d12';
      mctx.fillRect(p.x - cell * 1.15, p.y - cell * 0.62, cell * 2.3, cell * 1.24);
    }
    for (const r of g.resources) {
      if (r.type === 'sheep' || r.type === 'tree' || !pl.explored[r.ty * m.w + r.tx]) continue;
      const p = this.minimapPos(r.x, r.y, w, h);
      mctx.fillStyle = r.type === 'gold' ? '#ffd040' : r.type === 'stone' ? '#c8ccd0' : '#e0507a';
      mctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    for (const b of g.buildings) {
      if (!g.isVisible(me, b)) continue;
      const p = this.minimapPos(b.x, b.y, w, h);
      mctx.fillStyle = g.players[b.owner].color;
      const s = 1.8 + b.size * 1.3;
      mctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const u of g.units) {
      if (u.owner !== me && !pl.visible[Math.floor(u.y) * m.w + Math.floor(u.x)]) continue;
      const p = this.minimapPos(u.x, u.y, w, h);
      mctx.fillStyle = g.players[u.owner].color;
      mctx.beginPath(); mctx.arc(p.x, p.y, 1.4, 0, 7); mctx.fill();
    }
    const now = performance.now() / 1000;
    for (const pg of pings) {
      const k = (now - pg.t) / 3;
      if (k > 1) continue;
      const p = this.minimapPos(pg.x, pg.y, w, h);
      mctx.strokeStyle = `rgba(255,70,50,${1 - k})`; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(p.x, p.y, 4 + 14 * ((k * 3) % 1), 0, Math.PI * 2); mctx.stroke();
    }
    const corners = [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, this.h), this.toWorld(0, this.h)].map((c) => this.minimapPos(c.x, c.y, w, h));
    mctx.strokeStyle = 'rgba(255,255,255,0.9)'; mctx.lineWidth = 1.2;
    mctx.beginPath(); corners.forEach((c, i) => (i ? mctx.lineTo(c.x, c.y) : mctx.moveTo(c.x, c.y))); mctx.closePath(); mctx.stroke();
  }

  // ------------------------------------------------------------------ portraits 3D
  iconRenderer() {
    if (this.ir) return this.ir;
    const S = 192;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    r.setSize(S, S, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x6a5a40, 1.6));
    const d = new THREE.DirectionalLight(0xffeedd, 3); d.position.set(-2, 4, 3); scene.add(d);
    const rim = new THREE.DirectionalLight(0x99bbff, 1.6); rim.position.set(3, 2, -3); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.ir = { r, scene, camera, cv };
    return this.ir;
  }

  unitGroup(type, owner, civ = this.civOf(owner)) {
    // modèle non instancié d'une unité (pour les portraits)
    const grp = new THREE.Group();
    const st = { yaw: 0, phase: 0, walk: 0, seed: 0.3, swing: 0, work: 0, lean: 0, toolKind: type === 'villager' ? 'axe' : null, carry: null };
    this.pose(type, st, 0, 0, 0, 0, unitScale(type));
    const tc = this.teamColors[owner] || this.teamColors[0];
    const skins = this.civSkins[civ] || this.skins;
    for (const pt of this.partsFor(type, civ)) {
      if (pt.tool && pt.tool !== st.toolKind) continue;
      if (pt.carry) continue;
      const col = pt.fixed || (pt.c === 'team' ? tc.team : pt.c === 'teamDk' ? tc.teamDk : skins[1]);
      const mat = this.UM[pt.m].clone();
      mat.onBeforeCompile = () => {};
      mat.color = col.clone();
      const mesh = new THREE.Mesh(this.UG[pt.g], mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.multiplyMatrices(this.bones[pt.b], pt.local);
      grp.add(mesh);
    }
    return grp;
  }

  icon(kind, type, color, civOverride = null) {
    this.icons = this.icons || new Map();
    const key = kind + type + color + (civOverride || '');
    if (this.icons.has(key)) return this.icons.get(key);
    const { r, scene, camera, cv } = this.iconRenderer();
    const owner = Math.max(0, this.game.players.findIndex((p) => p.color === color));
    const civ = civOverride || this.civOf(owner);
    let obj;
    if (kind === 'unit') {
      obj = this.unitGroup(type, owner, civ);
      const cls = UNITS[type].cls;
      const box = new THREE.Box3().setFromObject(obj);
      const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const d = Math.max(size.y, size.x, size.z) * (cls === 'cavalry' || cls === 'siege' ? 2.6 : 2.4);
      obj.rotation.y = cls === 'siege' ? 0.7 : cls === 'cavalry' ? 1.35 : 0.5;
      camera.position.set(ctr.x + d * 0.55, ctr.y + d * 0.3, ctr.z + d * 0.8);
      camera.lookAt(ctr.x, ctr.y + (cls === 'cavalry' ? 0.05 : 0.08), ctr.z);
    } else {
      const def = BUILDINGS[type];
      obj = def.wall ? (type === 'stone_wall' ? stoneWallModel(4, this.M, this.teams[owner], civWallMaterial(civ, this.M)) : palisadeModel(3, this.M)) : this.template(type, owner, civ).clone(true);
      if (def.farm) {
        const crops = new THREE.InstancedMesh(this.cropMesh.geometry, this.std({ vertexColors: true, side: THREE.DoubleSide, color: 0xd8c060 }), 64);
        let k = 0;
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { tmpM.compose(tmpV.set(0.3 + i * 0.34, 0.02, 0.3 + j * 0.34), tmpQ.identity(), tmpS.set(1, 1.2, 1)); crops.setMatrixAt(k++, tmpM); }
        obj.add(crops);
      }
      obj.traverse((o) => { if (o.isMesh && o.material.onBeforeCompile) { o.material = o.material.clone(); o.material.onBeforeCompile = () => {}; o.material.customProgramCacheKey = () => 'icon'; } });
      const box = new THREE.Box3().setFromObject(obj);
      const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const d = Math.max(size.x, size.y, size.z) * 2.15;
      camera.position.set(ctr.x + d * 0.62, ctr.y + d * 0.5, ctr.z + d * 0.62);
      camera.lookAt(ctr);
      void def;
    }
    camera.updateProjectionMatrix();
    scene.add(obj);
    r.render(scene, camera);
    scene.remove(obj);
    const url = cv.toDataURL('image/png');
    this.icons.set(key, url);
    return url;
  }

  resIcon(res) { return this.resIconFn ? this.resIconFn(res) : ''; }

  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.ir) { this.ir.r.dispose(); this.ir.r.forceContextLoss(); }
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}
