// Sauvegarde des parties solo : état complet de la partie et de l'IA, compressé.
// - sur l'appareil : dans le stockage du navigateur (sauvegarde automatique + bouton)
// - vers un autre appareil : envoi sur le serveur, récupération avec un code (voir online.js)
import { Game } from './game.js';
import { AI } from './ai.js';

export const SAVE_VERSION = 'save-1';
const LOCAL_KEY = 'adr_save';
const CLOUD_CODE_KEY = 'adr_save_code';

// ---------------------------------------------------------------- tableaux typés (codage par plages)
function rle(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let j = i + 1;
    while (j < arr.length && arr[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}

function unrle(target, data) {
  let k = 0;
  for (let i = 0; i < data.length; i += 2) {
    const v = data[i], n = data[i + 1];
    if (k + n > target.length) throw new Error('sauvegarde abîmée');
    target.fill(v, k, k + n);
    k += n;
  }
  if (k !== target.length) throw new Error('sauvegarde abîmée');
  return target;
}

// JSON ne sait pas écrire Infinity : on le remplace par un marqueur
const replacer = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '§nan' : v > 0 ? '§inf' : '§-inf') : v);
const reviver = (k, v) => (v === '§inf' ? Infinity : v === '§-inf' ? -Infinity : v === '§nan' ? NaN : v);

// ---------------------------------------------------------------- partie <-> objet simple
export function serializeGame(g, ai, extra = {}) {
  return {
    v: SAVE_VERSION,
    seed: g.seed,
    size: g.map.w,
    humanPlayer: g.humanPlayer,
    rng: g.rand.getState(),
    time: g.time,
    nextId: g.nextId,
    winner: g.winner,
    victoryReason: g.victoryReason || null,
    marketPrices: g.marketPrices,
    fogTimer: g.fogTimer,
    checkTimer: g.checkTimer,
    map: { terrain: rle(g.map.terrain), occ: rle(g.map.occ), farm: rle(g.map.farm), gate: rle(g.map.gate) },
    units: g.units.filter((e) => !e.dead),
    buildings: g.buildings.filter((e) => !e.dead),
    resources: g.resources.filter((e) => !e.dead),
    projectiles: g.projectiles,
    players: g.players.map((p) => ({
      ...p,
      techs: [...p.techs],
      researching: [...p.researching],
      explored: rle(p.explored),
      visible: rle(p.visible),
      statCache: {},
    })),
    ai: ai ? serializeAI(ai, extra.difficulty) : null,
    ...extra,
  };
}

export function serializeAI(ai, difficulty = 'normal') {
  return {
    id: ai.id, difficulty,
    timer: ai.timer, attackWave: ai.attackWave, nextAttack: ai.nextAttack, attacking: ai.attacking,
    reserve: ai.reserve || null, base: ai.base || null,
  };
}

export function restoreAI(g, d) {
  const ai = new AI(g, d.id, d.difficulty);
  Object.assign(ai, { timer: d.timer, attackWave: d.attackWave, nextAttack: d.nextAttack, attacking: d.attacking });
  if (d.reserve) ai.reserve = d.reserve;
  if (d.base) ai.base = d.base;
  return ai;
}

export function restoreGame(d) {
  if (!d || d.v !== SAVE_VERSION) throw new Error('Cette sauvegarde vient d\'une autre version du jeu.');
  const g = new Game({ seed: d.seed, size: d.size, players: d.players.length, humanPlayer: d.humanPlayer, civs: d.players.map((p) => p.civ) });
  g.rand.setState(d.rng);
  g.time = d.time;
  g.nextId = d.nextId;
  g.winner = d.winner;
  if (d.victoryReason) g.victoryReason = d.victoryReason;
  g.marketPrices = d.marketPrices;
  g.fogTimer = d.fogTimer;
  g.checkTimer = d.checkTimer;
  unrle(g.map.terrain, d.map.terrain);
  unrle(g.map.occ, d.map.occ);
  unrle(g.map.farm, d.map.farm);
  unrle(g.map.gate, d.map.gate);
  g.units = d.units;
  g.buildings = d.buildings;
  g.resources = d.resources;
  g.projectiles = d.projectiles || [];
  g.effects = [];
  g.events = [];
  g.entities.clear();
  for (const list of [g.units, g.buildings, g.resources]) for (const e of list) g.entities.set(e.id, e);
  d.players.forEach((sp, i) => {
    const p = g.players[i];
    const explored = p.explored, visible = p.visible;
    Object.assign(p, sp, {
      techs: new Set(sp.techs), researching: new Set(sp.researching), statCache: {},
      explored: unrle(explored, sp.explored), visible: unrle(visible, sp.visible),
    });
  });
  return { game: g, ai: d.ai ? restoreAI(g, d.ai) : null };
}

// ---------------------------------------------------------------- compression (gzip si le navigateur sait le faire)
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function pack(obj) {
  const json = JSON.stringify(obj, replacer);
  if (typeof CompressionStream === 'undefined') return 'J:' + json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return 'G:' + toBase64(buf);
}

export async function unpack(str) {
  if (typeof str !== 'string') throw new Error('sauvegarde illisible');
  if (str.startsWith('J:')) return JSON.parse(str.slice(2), reviver);
  if (!str.startsWith('G:')) throw new Error('sauvegarde illisible');
  if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur est trop ancien pour lire cette sauvegarde.');
  const stream = new Blob([fromBase64(str.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text(), reviver);
}

// ---------------------------------------------------------------- sur l'appareil
export async function saveLocal(state) {
  const data = serializeGame(state.game, state.ai, {
    difficulty: state.difficulty, label: state.label, savedAt: Date.now(), speed: state.speed,
  });
  const packed = await pack(data);
  try {
    localStorage.setItem(LOCAL_KEY, packed);
    localStorage.setItem(LOCAL_KEY + '_info', JSON.stringify({ label: state.label, savedAt: data.savedAt, time: Math.floor(state.game.time) }));
    return true;
  } catch {
    return false; // stockage plein ou indisponible
  }
}

export function localInfo() {
  try {
    if (!localStorage.getItem(LOCAL_KEY)) return null;
    return JSON.parse(localStorage.getItem(LOCAL_KEY + '_info') || 'null');
  } catch { return null; }
}

export async function loadLocal() {
  const packed = localStorage.getItem(LOCAL_KEY);
  if (!packed) throw new Error('Aucune partie sauvegardée.');
  return unpack(packed);
}

export function localPacked() { try { return localStorage.getItem(LOCAL_KEY); } catch { return null; } }

export function clearLocal() {
  try { localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(LOCAL_KEY + '_info'); } catch { /* ignore */ }
}

// code de transfert retenu sur cet appareil (réutilisé à chaque envoi)
export function cloudCode() { try { return localStorage.getItem(CLOUD_CODE_KEY); } catch { return null; } }
export function setCloudCode(c) { try { if (c) localStorage.setItem(CLOUD_CODE_KEY, c); else localStorage.removeItem(CLOUD_CODE_KEY); } catch { /* ignore */ } }
