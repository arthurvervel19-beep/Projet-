// Moteur de simulation du jeu (sans DOM : utilisable dans le navigateur et dans Node).
import {
  UNITS, BUILDINGS, TECHS, AGES, RESOURCE_DEFS, GATHER_RATE, RESOURCES, TERRAIN, REACH,
  PLAYER_COLORS, PLAYER_NAMES, MAX_POP, defaultMods, CIVS, CIV_IDS, WONDER_TIME, LAUNCH_TIME,
} from './config.js';
import { PathFinder, distToRect } from './pathfinding.js';
import { generateMap, mulberry32 } from './map.js';

const SCAN_INTERVAL = 0.5;

export class Game {
  constructor({ seed = Date.now() % 1e9, size = 96, players = 2, humanPlayer = 0, startRes, civs = [] } = {}) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.time = 0;
    this.nextId = 1;
    this.entities = new Map();
    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.effects = [];
    this.events = [];
    this.humanPlayer = humanPlayer;
    this.sound = false; // activé dans le navigateur pour émettre des événements sonores
    this.winner = null;
    this.marketPrices = { food: 100, wood: 100, stone: 130 };
    const n = size * size;
    const self = this;
    this.map = {
      w: size, h: size,
      terrain: new Uint8Array(n),
      occ: new Int32Array(n), // entité bloquante (bâtiment / ressource)
      farm: new Int32Array(n), // fermes (non bloquantes)
      walkable(x, y) {
        if (x < 0 || y < 0 || x >= size || y >= size) return false;
        const i = y * size + x;
        return self.map.terrain[i] !== TERRAIN.WATER && self.map.occ[i] === 0;
      },
    };
    this.pathfinder = new PathFinder(this.map);
    this.players = [];
    for (let i = 0; i < players; i++) {
      const civ = CIVS[civs[i]] ? civs[i] : CIV_IDS[i % CIV_IDS.length];
      const mods = defaultMods();
      CIVS[civ].apply(mods);
      this.players.push({
        id: i, name: CIVS[civ].realm || PLAYER_NAMES[i], civ, color: PLAYER_COLORS[i], isHuman: i === humanPlayer,
        res: { ...(startRes || { food: 200, wood: 200, gold: 100, stone: 200 }) },
        age: 0, agingUp: false, techs: new Set(), researching: new Set(),
        mods, statCache: {}, pop: 0, popCap: 0,
        explored: new Uint8Array(n), visible: new Uint8Array(n),
        defeated: false, lastAttackAlert: -99,
        stats: { gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, kills: 0, losses: 0, trained: 0, built: 0, razed: 0 },
      });
    }
    this.fogTimer = 0;
    this.checkTimer = 0;
    generateMap(this, { size, numPlayers: players });
    this.updateFog(true);
  }

  // ---------------------------------------------------------------- entités
  get(id) { const e = this.entities.get(id); return e && !e.dead ? e : null; }

  createUnit(type, owner, x, y) {
    const st = this.unitStats(owner, type);
    const def = UNITS[type];
    const u = {
      id: this.nextId++, kind: 'unit', type, owner, x, y, px: x, py: y,
      hp: st.hp, maxHp: st.hp, order: null, path: null, pathI: 0, repathAt: 0, pathFail: 0,
      carry: { type: null, amount: 0 }, cooldown: 0, dir: 1, moving: false, working: false,
      anim: this.rand() * 10, atkAnim: 0, scanAt: this.rand() * SCAN_INTERVAL,
      radius: def.cls === 'cavalry' || def.cls === 'siege' ? 0.36 : 0.26,
    };
    this.entities.set(u.id, u);
    this.units.push(u);
    if (owner >= 0) this.players[owner].pop += 1;
    return u;
  }

  createBuilding(type, owner, tx, ty, built = false) {
    const def = BUILDINGS[type];
    const s = def.size;
    const maxHp = Math.round(def.hp * this.players[owner].mods.bhp);
    const b = {
      id: this.nextId++, kind: 'building', type, owner, tx, ty, size: s, x: tx + s / 2, y: ty + s / 2,
      hp: built ? maxHp : 1, maxHp, built, progress: built ? 1 : 0, queue: [], rally: null,
      cooldown: 0, food: def.farm ? def.food + this.players[owner].mods.farmFood : 0, farmer: 0,
    };
    this.entities.set(b.id, b);
    this.buildings.push(b);
    const arr = def.farm ? this.map.farm : this.map.occ;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) arr[y * this.map.w + x] = b.id;
    if (!def.farm) this.pushUnitsOut(b);
    if (built) this.onBuilt(b);
    return b;
  }

  createResource(type, tx, ty) {
    const def = RESOURCE_DEFS[type];
    const r = {
      id: this.nextId++, kind: 'resource', type, owner: -1, tx, ty, size: 1, x: tx + 0.5, y: ty + 0.5,
      amount: def.amount, maxAmount: def.amount, variant: Math.floor(this.rand() * 1000),
    };
    this.entities.set(r.id, r);
    this.resources.push(r);
    this.map.occ[ty * this.map.w + tx] = r.id;
    return r;
  }

  removeEntity(e) {
    if (e.dead) return;
    e.dead = true;
    const W = this.map.w;
    if (e.kind === 'building' || e.kind === 'resource') {
      const isFarm = e.kind === 'building' && BUILDINGS[e.type].farm;
      const arr = isFarm ? this.map.farm : this.map.occ;
      for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) {
        if (arr[y * W + x] === e.id) arr[y * W + x] = 0;
      }
      if (e.kind === 'building') {
        const p = this.players[e.owner];
        // rembourse la file d'attente
        for (const q of e.queue) this.cancelQueueItem(e, q, false);
        e.queue = [];
        if (e.built) this.recomputePopCap(p);
      }
    }
    if (e.kind === 'unit' && e.owner >= 0) this.players[e.owner].pop -= 1;
  }

  pushUnitsOut(b) {
    for (const u of this.units) {
      if (u.dead || this.isAir(u)) continue;
      if (u.x >= b.tx - 0.2 && u.x <= b.tx + b.size + 0.2 && u.y >= b.ty - 0.2 && u.y <= b.ty + b.size + 0.2) {
        if (this.map.walkable(Math.floor(u.x), Math.floor(u.y))) continue;
        const spot = this.findFreeSpot(b, u.x, u.y);
        if (spot) { u.x = u.px = spot.x; u.y = u.py = spot.y; u.path = null; }
      }
    }
  }

  // Cherche une tuile libre autour d'un rectangle (pour faire apparaître une unité)
  findFreeSpot(rect, nearX, nearY) {
    const s = rect.size || 1;
    let best = null, bestD = Infinity;
    for (let ring = 1; ring < 8 && !best; ring++) {
      for (let y = rect.ty - ring; y < rect.ty + s + ring; y++) {
        for (let x = rect.tx - ring; x < rect.tx + s + ring; x++) {
          if (x > rect.tx - ring && x < rect.tx + s + ring - 1 && y > rect.ty - ring && y < rect.ty + s + ring - 1) continue;
          if (!this.map.walkable(x, y)) continue;
          const d = Math.hypot(x + 0.5 - nearX, y + 0.5 - nearY);
          if (d < bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- stats
  unitStats(owner, type) {
    if (owner < 0) return UNITS[type];
    const p = this.players[owner];
    if (p.statCache[type]) return p.statCache[type];
    const d = UNITS[type], m = p.mods;
    const s = { ...d, armor: [...d.armor], bonus: d.bonus || {} };
    if (d.cls === 'villager') {
      s.hp += m.vilHp; s.armor[0] += m.vilArmor[0]; s.armor[1] += m.vilArmor[1]; s.speed *= m.vilSpeed;
    } else {
      s.hp += m.hp[d.cls] || 0;
      s.atk += m.atk[d.cls] || 0;
      if (d.range > 0) s.range += m.range[d.cls] || 0;
      if (m.armor[d.cls]) { s.armor[0] += m.armor[d.cls][0]; s.armor[1] += m.armor[d.cls][1]; }
    }
    s.rof *= m.rof[d.cls] || 1;
    s.speed *= (m.speed[d.cls] || 1) * m.speedAll;
    if (d.cls !== 'villager') {
      s.atk += m.atkAll + (d.gunpowder ? m.gunAtk : 0);
      if (d.gunpowder && d.range > 0) s.range += m.gunRange;
      s.armor[0] += m.armorAll[0]; s.armor[1] += m.armorAll[1];
    }
    s.los += m.losAll;
    p.statCache[type] = s;
    return s;
  }

  buildingAttack(b) {
    const a = BUILDINGS[b.type].attack;
    if (!a) return null;
    const m = this.players[b.owner].mods;
    return { atk: a.atk + m.atk.building, range: a.range + m.range.building, rof: a.rof, atkType: 'pierce', bonus: {}, projectile: a.kind || 'arrow', kind: a.kind || 'arrow' };
  }

  armorOf(e) {
    if (e.kind === 'unit') return this.unitStats(e.owner, e.type).armor;
    if (e.kind === 'building') {
      const a = BUILDINGS[e.type].armor, m = this.players[e.owner].mods.armor.building;
      return [a[0] + m[0], a[1] + m[1]];
    }
    return [0, 0];
  }

  clsOf(e) { return e.kind === 'unit' ? UNITS[e.type].cls : 'building'; }

  losOf(e) {
    if (e.kind === 'unit') return UNITS[e.type].los;
    if (e.kind === 'building') return e.built ? BUILDINGS[e.type].los + e.size / 2 : 2;
    return 0;
  }

  carryCap(owner) { return this.players[owner].mods.carry; }

  // ---------------------------------------------------------------- utilitaires
  rectOf(e) {
    if (e.kind === 'unit') return { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
    return { x0: e.tx, y0: e.ty, x1: e.tx + e.size, y1: e.ty + e.size };
  }

  distTo(u, e) {
    if (e.kind === 'unit') return Math.max(0, Math.hypot(e.x - u.x, e.y - u.y) - e.radius);
    return distToRect(u.x, u.y, this.rectOf(e));
  }

  isEnemy(a, b) { return a >= 0 && b >= 0 && a !== b; }

  isAir(e) { return e && e.kind === 'unit' && UNITS[e.type].cls === 'air'; }

  // une unité de mêlée ne peut pas frapper un avion
  canHit(st, t) { return !(this.isAir(t) && !(st.range > 0)); }

  resTypeOf(e) {
    if (!e) return null;
    if (e.kind === 'resource') return RESOURCE_DEFS[e.type].res;
    if (e.kind === 'building' && BUILDINGS[e.type].farm) return 'food';
    return null;
  }

  gatherKind(e) { return e.kind === 'resource' ? e.type : 'farm'; }

  canAfford(p, cost) { return Object.entries(cost || {}).every(([k, v]) => p.res[k] >= v); }

  pay(p, cost) { for (const [k, v] of Object.entries(cost || {})) p.res[k] -= v; }

  refund(p, cost) { for (const [k, v] of Object.entries(cost || {})) p.res[k] += v; }

  sfx(kind, x, y) { if (this.sound) this.events.push({ type: 'sfx', kind, x, y }); }

  msg(player, text, kind = 'info') { this.events.push({ type: 'msg', player, text, kind }); }

  missingText(p, cost) {
    const names = { food: 'nourriture', wood: 'bois', gold: 'or', stone: 'pierre' };
    const miss = Object.entries(cost).filter(([k, v]) => p.res[k] < v).map(([k]) => names[k]);
    return `Pas assez de ${miss.join(', ')}.`;
  }

  // Âge requis pour une unité/bâtiment/techno
  hasAge(p, age) { return p.age >= age; }

  buildingsOf(owner, type, builtOnly = true) {
    return this.buildings.filter((b) => !b.dead && b.owner === owner && (!type || b.type === type) && (!builtOnly || b.built));
  }

  ageRequirementMet(p) {
    const next = AGES[p.age + 1];
    if (!next) return false;
    const types = new Set(this.buildingsOf(p.id).filter((b) => BUILDINGS[b.type].countsForAge && BUILDINGS[b.type].age === p.age).map((b) => b.type));
    return types.size >= next.req;
  }

  ageRequirementText(p) {
    const next = AGES[p.age + 1];
    const names = Object.entries(BUILDINGS).filter(([, d]) => d.countsForAge && d.age === p.age).map(([, d]) => d.name);
    return `Nécessite ${next.req} bâtiment(s) parmi : ${names.join(', ')}.`;
  }

  // ---------------------------------------------------------------- placement
  canPlace(owner, type, tx, ty) {
    const def = BUILDINGS[type];
    const s = def.size, W = this.map.w;
    const p = this.players[owner];
    if (def.unique && this.buildings.some((b) => !b.dead && b.owner === owner && b.type === type)) return false;
    for (let y = ty; y < ty + s; y++) {
      for (let x = tx; x < tx + s; x++) {
        if (x < 0 || y < 0 || x >= W || y >= this.map.h) return false;
        const i = y * W + x;
        if (this.map.terrain[i] === TERRAIN.WATER || this.map.occ[i] || this.map.farm[i]) return false;
        if (p.isHuman && !p.explored[i]) return false;
      }
    }
    // pas sur une unité ennemie
    for (const u of this.units) {
      if (u.dead || u.owner === owner) continue;
      if (u.x > tx && u.x < tx + s && u.y > ty && u.y < ty + s) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- commandes
  // Toutes les actions des joueurs (humain et IA) passent par issue()
  issue(owner, cmd) {
    const p = this.players[owner];
    if (!p || p.defeated || this.winner !== null) return false;
    const units = (cmd.ids || []).map((id) => this.get(id)).filter((u) => u && u.kind === 'unit' && u.owner === owner);
    switch (cmd.type) {
      case 'move': return this.cmdMove(units, cmd.x, cmd.y, !!cmd.aggressive);
      case 'stop': units.forEach((u) => { u.order = null; u.path = null; }); return true;
      case 'gather': {
        const t = this.get(cmd.target);
        if (!t) return false;
        let ok = false;
        units.filter((u) => u.type === 'villager').forEach((u) => { this.orderGather(u, t); ok = true; });
        return ok;
      }
      case 'build': return this.cmdBuild(owner, units, cmd.building, cmd.tx, cmd.ty, cmd.queue);
      case 'buildLine': return this.cmdBuildLine(owner, units, cmd.building, cmd.tiles);
      case 'repair': {
        const t = this.get(cmd.target);
        if (!t || t.kind !== 'building' || t.owner !== owner) return false;
        units.filter((u) => u.type === 'villager').forEach((u) => { u.order = { kind: 'build', target: t.id }; u.path = null; });
        return true;
      }
      case 'attack': {
        const t = this.get(cmd.target);
        if (!t) return false;
        units.forEach((u) => {
          const st = this.unitStats(u.owner, u.type);
          if (st.onlyBuildings && t.kind !== 'building') return;
          if (!this.canHit(st, t)) return;
          u.order = { kind: 'attack', target: t.id }; u.path = null;
        });
        return true;
      }
      case 'drop': units.forEach((u) => { if (u.carry.amount > 0) { u.order = { kind: 'drop', target: cmd.target }; u.path = null; } }); return true;
      case 'train': return this.cmdTrain(owner, cmd.building, cmd.unit, cmd.count || 1);
      case 'research': return this.cmdResearch(owner, cmd.building, cmd.tech);
      case 'ageUp': return this.cmdAgeUp(owner, cmd.building);
      case 'cancel': {
        const b = this.get(cmd.building);
        if (!b || b.owner !== owner || !b.queue[cmd.index]) return false;
        const [item] = b.queue.splice(cmd.index, 1);
        this.cancelQueueItem(b, item, true);
        return true;
      }
      case 'rally': {
        const b = this.get(cmd.building);
        if (!b || b.owner !== owner) return false;
        b.rally = { x: cmd.x, y: cmd.y, target: cmd.target || 0 };
        return true;
      }
      case 'delete': {
        (cmd.ids || []).map((id) => this.get(id)).filter((e) => e && e.owner === owner && e.kind !== 'resource').forEach((e) => this.kill(e, -1));
        return true;
      }
      case 'market': return this.cmdMarket(owner, cmd.action, cmd.res);
      case 'factoryMode': {
        const b = this.get(cmd.building);
        if (!b || b.owner !== owner || !BUILDINGS[b.type].factory || !RESOURCES.includes(cmd.res)) return false;
        b.mode = cmd.res;
        return true;
      }
      default: return false;
    }
  }

  // Clic droit contextuel
  smartCommand(owner, ids, x, y, target) {
    const units = ids.map((id) => this.get(id)).filter((u) => u && u.kind === 'unit' && u.owner === owner);
    if (!units.length) return null;
    if (target && target.kind === 'resource') {
      const vils = units.filter((u) => u.type === 'villager');
      const others = units.filter((u) => u.type !== 'villager');
      if (vils.length) this.issue(owner, { type: 'gather', ids: vils.map((u) => u.id), target: target.id });
      if (others.length) this.issue(owner, { type: 'move', ids: others.map((u) => u.id), x, y });
      return vils.length ? 'gather' : 'move';
    }
    if (target && this.isEnemy(owner, target.owner)) {
      this.issue(owner, { type: 'attack', ids: units.map((u) => u.id), target: target.id });
      return 'attack';
    }
    if (target && target.kind === 'building' && target.owner === owner) {
      const def = BUILDINGS[target.type];
      const vils = units.filter((u) => u.type === 'villager');
      const others = units.filter((u) => u.type !== 'villager');
      if (others.length) this.issue(owner, { type: 'move', ids: others.map((u) => u.id), x, y });
      if (vils.length) {
        if (!target.built || target.hp < target.maxHp) this.issue(owner, { type: 'repair', ids: vils.map((u) => u.id), target: target.id });
        else if (def.farm) this.issue(owner, { type: 'gather', ids: vils.map((u) => u.id), target: target.id });
        else if (def.drop) {
          vils.forEach((u) => {
            if (u.carry.amount > 0 && def.drop.includes(u.carry.type)) this.issue(owner, { type: 'drop', ids: [u.id], target: target.id });
            else this.issue(owner, { type: 'move', ids: [u.id], x, y });
          });
        } else this.issue(owner, { type: 'move', ids: vils.map((u) => u.id), x, y });
        return 'build';
      }
      return 'move';
    }
    this.issue(owner, { type: 'move', ids: units.map((u) => u.id), x, y });
    return 'move';
  }

  cmdMove(units, x, y, aggressive) {
    if (!units.length) return false;
    // formation simple : grille centrée sur la destination
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    const sp = 0.75;
    const cx = units.reduce((s, u) => s + u.x, 0) / n, cy = units.reduce((s, u) => s + u.y, 0) / n;
    const sorted = [...units].sort((a, b) => (a.x - cx + a.y - cy) - (b.x - cx + b.y - cy));
    sorted.forEach((u, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ox = n === 1 ? 0 : (c - (cols - 1) / 2) * sp;
      const oy = n === 1 ? 0 : (r - (Math.ceil(n / cols) - 1) / 2) * sp;
      let tx = x + ox, ty = y + oy;
      if (!this.map.walkable(Math.floor(tx), Math.floor(ty))) { tx = x; ty = y; }
      u.order = { kind: 'move', x: tx, y: ty, aggressive };
      u.path = null;
    });
    return true;
  }

  orderGather(u, t) {
    u.order = { kind: 'gather', target: t.id, resType: this.resTypeOf(t), gk: this.gatherKind(t), lastX: t.x, lastY: t.y, acc: 0 };
    u.path = null;
  }

  cmdBuild(owner, units, type, tx, ty) {
    const p = this.players[owner];
    const def = BUILDINGS[type];
    if (!def || !this.hasAge(p, def.age)) return false;
    if (def.unique && this.buildings.some((b) => !b.dead && b.owner === owner && b.type === type)) { this.msg(owner, `Vous ne pouvez construire qu'un seul bâtiment « ${def.name} ».`, 'warn'); return false; }
    if (!this.canPlace(owner, type, tx, ty)) { this.msg(owner, 'Emplacement invalide.', 'warn'); return false; }
    if (!this.canAfford(p, def.cost)) { this.msg(owner, this.missingText(p, def.cost), 'warn'); return false; }
    this.pay(p, def.cost);
    const b = this.createBuilding(type, owner, tx, ty, false);
    units.filter((u) => u.type === 'villager').forEach((u) => { u.order = { kind: 'build', target: b.id }; u.path = null; });
    return b;
  }

  cmdBuildLine(owner, units, type, tiles) {
    const p = this.players[owner];
    const def = BUILDINGS[type];
    const placed = [];
    for (const [tx, ty] of tiles) {
      if (!this.canPlace(owner, type, tx, ty)) continue;
      if (!this.canAfford(p, def.cost)) { this.msg(owner, this.missingText(p, def.cost), 'warn'); break; }
      this.pay(p, def.cost);
      placed.push(this.createBuilding(type, owner, tx, ty, false));
    }
    if (!placed.length) return false;
    const vils = units.filter((u) => u.type === 'villager');
    vils.forEach((u, i) => {
      const b = placed[Math.floor(i * placed.length / vils.length)];
      u.order = { kind: 'build', target: b.id, chain: true }; u.path = null;
    });
    return placed;
  }

  cmdTrain(owner, bid, type, count) {
    const p = this.players[owner];
    const b = this.get(bid);
    const def = UNITS[type];
    if (!b || b.owner !== owner || !b.built || !def || def.from !== b.type) return false;
    if (!this.hasAge(p, def.age)) return false;
    if (def.civ && def.civ !== p.civ) return false;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (b.queue.length >= 10) break;
      if (!this.canAfford(p, def.cost)) { if (n === 0) this.msg(owner, this.missingText(p, def.cost), 'warn'); break; }
      this.pay(p, def.cost);
      b.queue.push({ kind: 'unit', id: type, time: def.time, t: 0, cost: def.cost });
      n++;
    }
    return n > 0;
  }

  cmdResearch(owner, bid, tech) {
    const p = this.players[owner];
    const b = this.get(bid);
    const def = TECHS[tech];
    if (!b || b.owner !== owner || !b.built || !def) return false;
    if (!(BUILDINGS[b.type].techs || []).includes(tech)) return false;
    if (p.techs.has(tech) || p.researching.has(tech) || !this.hasAge(p, def.age)) return false;
    if (def.req && !p.techs.has(def.req)) return false;
    if (!this.canAfford(p, def.cost)) { this.msg(owner, this.missingText(p, def.cost), 'warn'); return false; }
    this.pay(p, def.cost);
    p.researching.add(tech);
    b.queue.push({ kind: 'tech', id: tech, time: def.time, t: 0, cost: def.cost });
    return true;
  }

  cmdAgeUp(owner, bid) {
    const p = this.players[owner];
    const b = this.get(bid);
    const next = AGES[p.age + 1];
    if (!b || b.owner !== owner || b.type !== 'town_center' || !b.built || !next || p.agingUp) return false;
    if (!this.ageRequirementMet(p)) { this.msg(owner, this.ageRequirementText(p), 'warn'); return false; }
    if (!this.canAfford(p, next.cost)) { this.msg(owner, this.missingText(p, next.cost), 'warn'); return false; }
    this.pay(p, next.cost);
    p.agingUp = true;
    b.queue.push({ kind: 'age', id: p.age + 1, time: next.time, t: 0, cost: next.cost });
    return true;
  }

  cancelQueueItem(b, item, doRefund) {
    const p = this.players[b.owner];
    if (doRefund) this.refund(p, item.cost);
    if (item.kind === 'tech') p.researching.delete(item.id);
    if (item.kind === 'age') p.agingUp = false;
  }

  cmdMarket(owner, action, res) {
    const p = this.players[owner];
    if (!this.buildingsOf(owner, 'market').length || !this.marketPrices[res]) return false;
    const price = this.marketPrices[res];
    if (action === 'buy') {
      if (p.res.gold < price) { this.msg(owner, "Pas assez d'or.", 'warn'); return false; }
      p.res.gold -= price; p.res[res] += 100;
      this.marketPrices[res] = Math.min(400, price + 6);
    } else {
      if (p.res[res] < 100) { this.msg(owner, 'Pas assez de ressources à vendre.', 'warn'); return false; }
      p.res[res] -= 100; p.res.gold += Math.round(price * 0.7);
      this.marketPrices[res] = Math.max(25, price - 6);
    }
    return true;
  }

  // ---------------------------------------------------------------- boucle principale
  update(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    for (const u of this.units) { u.px = u.x; u.py = u.y; }
    for (const u of this.units) {
      if (u.dead) continue;
      this.updateUnit(u, dt);
      if (u.owner >= 0 && u.hp < u.maxHp) { const rg = this.players[u.owner].mods.regen; if (rg) u.hp = Math.min(u.maxHp, u.hp + rg * dt); }
    }
    this.separate();
    for (const b of this.buildings) if (!b.dead) this.updateBuilding(b, dt);
    this.updateProjectiles(dt);
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < fx.dur);
    this.cleanup();
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.fogTimer = 0.25; this.updateFog(); }
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) { this.checkTimer = 1; this.checkVictory(); }
  }

  cleanup() {
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.buildings.some((b) => b.dead)) this.buildings = this.buildings.filter((b) => !b.dead);
    if (this.resources.some((r) => r.dead)) this.resources = this.resources.filter((r) => !r.dead);
    for (const [id, e] of this.entities) if (e.dead) this.entities.delete(id);
  }

  // ---------------------------------------------------------------- déplacement
  pathTo(u, rect, range) {
    const res = this.pathfinder.find(u.x, u.y, rect, range);
    u.path = res.points; u.pathI = 0;
    u.repathAt = this.time + 1 + this.rand() * 0.5;
    return res;
  }

  // Avance le long du chemin. Retourne true si la fin du chemin est atteinte.
  step(u, dt) {
    if (!u.path || u.pathI >= u.path.length) { u.moving = false; return true; }
    let remaining = this.unitStats(u.owner, u.type).speed * dt;
    while (remaining > 0 && u.pathI < u.path.length) {
      const wp = u.path[u.pathI];
      const dx = wp.x - u.x, dy = wp.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) u.dir = dx - dy >= 0 ? 1 : -1;
      if (d <= remaining) { u.x = wp.x; u.y = wp.y; u.pathI++; remaining -= d; }
      else { u.x += dx / d * remaining; u.y += dy / d * remaining; remaining = 0; }
    }
    u.moving = true;
    // bloqué par une nouvelle construction ?
    if (u.pathI < u.path.length) {
      const wp = u.path[u.pathI];
      if (!this.map.walkable(Math.floor(wp.x), Math.floor(wp.y))) u.path = null;
    }
    return !u.path || u.pathI >= u.path.length;
  }

  // Se rapproche d'une entité. Retourne true (à portée), false (en route) ou null (inaccessible)
  // vol direct (unités aériennes)
  flyTo(u, x, y, dt) {
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
    const sp = this.unitStats(u.owner, u.type).speed * dt;
    if (d < 0.01) { u.moving = false; return true; }
    u.dir = dx - dy >= 0 ? 1 : -1;
    if (d <= sp) { u.x = x; u.y = y; u.moving = false; return true; }
    u.x += dx / d * sp; u.y += dy / d * sp;
    u.x = Math.max(0.2, Math.min(this.map.w - 0.2, u.x)); u.y = Math.max(0.2, Math.min(this.map.h - 0.2, u.y));
    u.moving = true;
    return false;
  }

  approach(u, e, range, dt) {
    const d = this.distTo(u, e);
    if (d <= range + 0.05) { u.path = null; u.moving = false; u.pathFail = 0; return true; }
    if (this.isAir(u)) { this.flyTo(u, e.x, e.y, dt); return false; }
    const needPath = !u.path || u.pathI >= u.path.length || (e.kind === 'unit' && this.time >= u.repathAt);
    if (needPath) {
      if (u.pathFail > 0 && this.time < u.retryAt) { u.moving = false; return false; }
      const rect = this.rectOf(e);
      const res = this.pathTo(u, rect, Math.max(0, range - 0.05));
      if (!res.points.length) {
        u.pathFail++; u.retryAt = this.time + 0.6;
        if (u.pathFail > 4) { u.pathFail = 0; return null; }
        u.moving = false;
        return false;
      }
      if (!res.reached) u.pathFail++; else u.pathFail = 0;
    }
    this.step(u, dt);
    return false;
  }

  separate() {
    // repousse légèrement les unités qui se chevauchent
    const cell = new Map();
    const key = (x, y) => (Math.floor(x) << 16) | Math.floor(y);
    for (const u of this.units) {
      if (u.dead || this.isAir(u)) continue;
      const k = key(u.x, u.y);
      let a = cell.get(k);
      if (!a) cell.set(k, a = []);
      a.push(u);
    }
    for (const u of this.units) {
      if (u.dead || this.isAir(u)) continue;
      const cx = Math.floor(u.x), cy = Math.floor(u.y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = cell.get(((cx + dx) << 16) | (cy + dy));
        if (!list) continue;
        for (const o of list) {
          if (o.id <= u.id) continue;
          const ddx = o.x - u.x, ddy = o.y - u.y;
          const min = (u.radius + o.radius) * 0.9;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const push = (min - d) * 0.35;
          const nx = d2 === 0 ? 1 : ddx / d, ny = d2 === 0 ? 0 : ddy / d;
          const uw = u.working ? 0.2 : 1, ow = o.working ? 0.2 : 1;
          this.nudge(u, -nx * push * uw, -ny * push * uw);
          this.nudge(o, nx * push * ow, ny * push * ow);
        }
      }
    }
  }

  nudge(u, dx, dy) {
    const nx = u.x + dx, ny = u.y + dy;
    if (this.map.walkable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
  }

  // ---------------------------------------------------------------- unités
  updateUnit(u, dt) {
    u.cooldown -= dt;
    u.atkAnim = Math.max(0, u.atkAnim - dt);
    u.working = false;
    const o = u.order;
    const def = UNITS[u.type];
    if (!o) {
      u.moving = false;
      u.scanAt -= dt;
      if (u.scanAt <= 0 && def.cls !== 'villager') {
        u.scanAt = SCAN_INTERVAL;
        const t = this.findTarget(u, def.los + 0.5);
        if (t) u.order = { kind: 'attack', target: t.id, auto: true, homeX: u.x, homeY: u.y };
      }
      return;
    }
    switch (o.kind) {
      case 'move': this.updateMove(u, o, dt); break;
      case 'attack': this.updateAttack(u, o, dt); break;
      case 'gather': this.updateGather(u, o, dt); break;
      case 'build': this.updateBuild(u, o, dt); break;
      case 'drop': this.updateDrop(u, o, dt); break;
      default: u.order = null;
    }
  }

  updateMove(u, o, dt) {
    if (o.aggressive) {
      u.scanAt -= dt;
      if (u.scanAt <= 0) {
        u.scanAt = SCAN_INTERVAL;
        const t = this.findTarget(u, UNITS[u.type].los + 0.5);
        if (t) { u.order = { kind: 'attack', target: t.id, then: o, auto: true }; u.path = null; return; }
      }
    }
    if (this.isAir(u)) { if (this.flyTo(u, o.x, o.y, dt)) u.order = null; return; }
    if (!u.path) {
      const res = this.pathTo(u, { x0: o.x, y0: o.y, x1: o.x, y1: o.y }, 0);
      // remplace le dernier point par la destination exacte si atteignable
      if (res.reached && this.map.walkable(Math.floor(o.x), Math.floor(o.y))) {
        if (res.points.length) res.points[res.points.length - 1] = { x: o.x, y: o.y };
        else res.points.push({ x: o.x, y: o.y });
      }
      if (!res.points.length) { u.order = null; return; }
    }
    if (this.step(u, dt)) {
      if (u.path === null) return; // chemin bloqué → on recalculera
      u.order = null; u.path = null;
    }
  }

  // Trouve la meilleure cible ennemie à proximité
  findTarget(u, radius) {
    const st = this.unitStats(u.owner, u.type);
    let best = null, bestScore = Infinity;
    for (const e of this.units) {
      if (e.dead || !this.isEnemy(u.owner, e.owner) || st.onlyBuildings) continue;
      if (!this.canHit(st, e)) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d > radius) continue;
      if (st.minRange && d < st.minRange) continue;
      const score = d + (e.type === 'villager' ? 1.5 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) return best;
    for (const b of this.buildings) {
      if (b.dead || !this.isEnemy(u.owner, b.owner)) continue;
      if (BUILDINGS[b.type].wall && !st.onlyBuildings) continue;
      const d = this.distTo(u, b);
      if (d > radius) continue;
      const score = d + (BUILDINGS[b.type].attack ? -2 : 0);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  updateAttack(u, o, dt) {
    const t = this.get(o.target);
    const st = this.unitStats(u.owner, u.type);
    if (!t || (t.kind === 'unit' && t.hp <= 0)) {
      u.path = null;
      if (o.then) { u.order = o.then; return; }
      u.order = null;
      // enchaîne automatiquement sur une cible proche
      if (UNITS[u.type].cls !== 'villager') {
        const n = this.findTarget(u, st.los + 1);
        if (n) u.order = { kind: 'attack', target: n.id, auto: true };
      }
      return;
    }
    if (o.auto && this.distTo(u, t) > st.los * 2.2) { u.order = o.then || null; u.path = null; return; }
    if (!this.canHit(st, t)) { u.order = o.then || null; u.path = null; return; }
    const range = st.range > 0 ? st.range : REACH - 0.15 + (t.kind === 'unit' ? u.radius : 0);
    const r = this.approach(u, t, range, dt);
    if (r === null) { u.order = o.then || null; return; }
    if (!r) return;
    u.dir = (t.x - u.x) - (t.y - u.y) >= 0 ? 1 : -1;
    u.working = true;
    if (u.cooldown <= 0) {
      u.cooldown = st.rof;
      u.atkAnim = 0.35;
      if (st.range > 0) this.fire(u.owner, u.x, u.y, t, st, st.projectile || 'arrow', u);
      else { this.damage(t, this.calcDamage(st, t), u.owner, u); this.sfx(u.type === 'villager' ? 'chop' : UNITS[u.type].cls === 'siege' ? 'boom' : 'hit', u.x, u.y); }
    }
  }

  calcDamage(st, t) {
    const armor = this.armorOf(t);
    let dmg = Math.max(0, st.atk - armor[st.atkType === 'pierce' ? 1 : 0]);
    const cls = this.clsOf(t);
    if (st.bonus && st.bonus[cls]) dmg += st.bonus[cls];
    return Math.max(1, dmg);
  }

  fire(owner, x, y, target, st, kind, from = null) {
    const speed = { arrow: 9, javelin: 8, bullet: 38, shell: 11, laser: 80, pebble: 9, bomb: 1 }[kind] || 5;
    const tx = target.x, ty = target.y;
    const d = Math.hypot(tx - x, ty - y);
    const sound = { arrow: 'arrow', javelin: 'arrow', pebble: 'arrow', bullet: st.rof < 0.6 ? 'mg' : 'gunshot', shell: 'cannon', laser: 'laser', bomb: 'bombdrop' }[kind] || 'launch';
    this.sfx(sound, x, y);
    const dur = kind === 'bomb' ? 0.75 : kind === 'laser' ? 0.1 : Math.max(kind === 'bullet' ? 0.05 : 0.15, d / speed);
    const flat = kind === 'bullet' || kind === 'laser';
    this.projectiles.push({
      owner, x0: x, y0: y, x: x, y: y, tx, ty, target: target.id, t: 0, dur,
      st, kind, arc: flat || kind === 'bomb' ? 0 : kind === 'arrow' || kind === 'javelin' || kind === 'pebble' ? 0.5 + d * 0.08 : 0.8 + d * 0.15,
      air0: this.isAir(from), air1: this.isAir(target), fromBuilding: from && from.kind === 'building' ? from.id : 0,
    });
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt;
      const t = this.get(p.target);
      if (t && !p.st.splash) { p.tx = t.x; p.ty = t.y; }
      const k = Math.min(1, p.t / p.dur);
      p.x = p.x0 + (p.tx - p.x0) * k;
      p.y = p.y0 + (p.ty - p.y0) * k;
      if (k >= 1) {
        p.done = true;
        if (p.st.splash) {
          this.effects.push({ kind: 'blast', x: p.tx, y: p.ty, t: 0, dur: 0.5 });
          this.sfx('boom', p.tx, p.ty);
          const targets = [...this.units, ...this.buildings].filter((e) => !e.dead && this.isEnemy(p.owner, e.owner));
          for (const e of targets) {
            const d = e.kind === 'unit' ? Math.hypot(e.x - p.tx, e.y - p.ty) : distToRect(p.tx, p.ty, this.rectOf(e));
            if (d <= p.st.splash) this.damage(e, this.calcDamage(p.st, e) * (d < 0.4 ? 1 : 0.5), p.owner, null);
          }
        } else if (t) {
          this.damage(t, this.calcDamage(p.st, t), p.owner, null);
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  damage(e, amount, attackerOwner, attacker) {
    if (e.dead) return;
    e.hp -= amount;
    if (e.owner >= 0 && attackerOwner >= 0) {
      const p = this.players[e.owner];
      if (this.time - p.lastAttackAlert > 12) {
        p.lastAttackAlert = this.time;
        this.events.push({ type: 'attacked', player: e.owner, x: e.x, y: e.y });
      }
      // riposte des unités inactives
      if (e.kind === 'unit' && !e.order && attacker && UNITS[e.type].cls !== 'villager') {
        e.order = { kind: 'attack', target: attacker.id, auto: true };
      }
    }
    if (e.hp <= 0) this.kill(e, attackerOwner);
  }

  kill(e, killerOwner) {
    if (e.dead) return;
    e.hp = 0;
    if (e.kind === 'unit') {
      this.effects.push({ kind: 'corpse', x: e.x, y: e.y, type: e.type, owner: e.owner, dir: e.dir, t: 0, dur: 10 });
      this.sfx('death', e.x, e.y);
      if (e.owner >= 0) this.players[e.owner].stats.losses++;
      if (killerOwner >= 0) this.players[killerOwner].stats.kills++;
    } else if (e.kind === 'building') {
      this.effects.push({ kind: 'rubble', x: e.x, y: e.y, size: e.size, t: 0, dur: 20 });
      if (!BUILDINGS[e.type].farm) this.sfx('collapse', e.x, e.y);
      if (killerOwner >= 0) this.players[killerOwner].stats.razed++;
      if (BUILDINGS[e.type].farm) {
        const f = this.get(e.farmer);
        if (f && f.order && f.order.target === e.id) f.order = null;
      }
    }
    this.removeEntity(e);
  }

  // ---------------------------------------------------------------- récolte
  findNearestResource(resType, gk, x, y, maxD, owner, excludeId = 0) {
    let best = null, bestD = maxD;
    if (gk === 'farm') {
      for (const b of this.buildings) {
        if (b.dead || b.owner !== owner || !BUILDINGS[b.type].farm || !b.built || b.id === excludeId) continue;
        const f = this.get(b.farmer);
        if (f && f.order && f.order.target === b.id) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bestD) { bestD = d; best = b; }
      }
      return best;
    }
    for (const r of this.resources) {
      if (r.dead || r.type !== gk || r.id === excludeId) continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  findDropSite(u, resType) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== u.owner || !b.built) continue;
      const def = BUILDINGS[b.type];
      if (!def.drop || !def.drop.includes(resType)) continue;
      const d = this.distTo(u, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  updateGather(u, o, dt) {
    const cap = this.carryCap(u.owner);
    let t = this.get(o.target);
    if (t && t.kind === 'building' && BUILDINGS[t.type].farm) {
      const f = this.get(t.farmer);
      if (!t.built) { u.order = { kind: 'build', target: t.id, thenGather: true }; return; }
      if (f && f !== u && f.order && f.order.target === t.id) t = null; // ferme occupée
    }
    if (!t) {
      const next = this.findNearestResource(o.resType, o.gk, o.lastX, o.lastY, 9, u.owner, o.target);
      if (next) { o.target = next.id; t = next; u.path = null; } else {
        u.path = null;
        if (u.carry.amount > 0) { u.order = { kind: 'drop', target: 0, idleAfter: true }; } else u.order = null;
        return;
      }
    }
    o.lastX = t.x; o.lastY = t.y;
    if (u.carry.amount > 0 && u.carry.type !== o.resType) u.carry = { type: null, amount: 0 };
    if (u.carry.amount >= cap) { u.order = { kind: 'drop', target: 0, resume: o }; u.path = null; return; }
    const isFarm = t.kind === 'building';
    const r = this.approach(u, t, isFarm ? 0 : REACH, dt);
    if (r === null) {
      // inaccessible : on cherche une autre ressource
      const next = this.findNearestResource(o.resType, o.gk, u.x, u.y, 12, u.owner, t.id);
      if (next) { o.target = next.id; u.path = null; } else u.order = null;
      return;
    }
    if (!r) return;
    if (isFarm) t.farmer = u.id;
    u.working = true;
    u.dir = (t.x - u.x) - (t.y - u.y) >= 0 ? 1 : -1;
    const rate = GATHER_RATE[o.gk] * this.players[u.owner].mods.gather[o.gk] * (this.players[u.owner].gatherMul || 1);
    o.acc += rate * dt;
    while (o.acc >= 1) {
      o.acc -= 1;
      if (isFarm) {
        t.food -= 1;
        if (t.food <= 0) { this.reseedFarm(t); }
      } else {
        t.amount -= 1;
        if (t.amount <= 0) { this.removeEntity(t); }
      }
      u.carry.type = o.resType;
      u.carry.amount += 1;
      if (o.gk === 'tree') this.sfx('chop', u.x, u.y);
      else if (o.gk === 'gold' || o.gk === 'stone') this.sfx('mine', u.x, u.y);
      else if (o.gk === 'sheep' && this.rand() < 0.06) this.sfx('bleat', u.x, u.y);
      if (u.carry.amount >= cap || t.dead) break;
    }
  }

  reseedFarm(f) {
    const p = this.players[f.owner];
    if (p.res.wood >= 60) {
      p.res.wood -= 60;
      f.food = BUILDINGS.farm.food + p.mods.farmFood;
    } else {
      this.msg(f.owner, 'Une ferme est épuisée (60 bois pour la ressemer).', 'warn');
      this.kill(f, -1);
    }
  }

  updateDrop(u, o, dt) {
    if (!u.carry.amount) { u.order = o.resume || null; return; }
    let site = o.target ? this.get(o.target) : null;
    if (!site || !site.built) {
      site = this.findDropSite(u, u.carry.type);
      if (!site) { u.order = null; u.path = null; return; }
      o.target = site.id;
    }
    const r = this.approach(u, site, REACH, dt);
    if (r === null) { u.order = null; return; }
    if (!r) return;
    const p = this.players[u.owner];
    p.res[u.carry.type] += u.carry.amount;
    p.stats.gathered[u.carry.type] += u.carry.amount;
    u.carry = { type: null, amount: 0 };
    u.path = null;
    u.order = o.idleAfter ? null : o.resume || null;
  }

  // ---------------------------------------------------------------- construction
  updateBuild(u, o, dt) {
    const b = this.get(o.target);
    if (!b) { u.order = null; this.findNextFoundation(u, o); return; }
    const def = BUILDINGS[b.type];
    if (b.built && b.hp >= b.maxHp) { this.afterBuild(u, b, o); return; }
    const r = this.approach(u, b, REACH, dt);
    if (r === null) { u.order = null; return; }
    if (!r) return;
    u.working = true;
    u.dir = (b.x - u.x) - (b.y - u.y) >= 0 ? 1 : -1;
    if (this.sound && this.rand() < dt * 1.3) this.sfx('hammer', u.x, u.y);
    if (!b.built) {
      const inc = dt / def.time;
      b.progress = Math.min(1, b.progress + inc);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * inc);
      if (b.progress >= 1) { b.built = true; b.hp = Math.max(b.hp, b.maxHp * 0.999); this.onBuilt(b); this.afterBuild(u, b, o); }
    } else {
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp / (def.time * 2.5) * dt);
    }
  }

  findNextFoundation(u, o) {
    if (!o || !o.chain) return;
    let best = null, bestD = 8;
    for (const b of this.buildings) {
      if (b.dead || b.built || b.owner !== u.owner) continue;
      const d = this.distTo(u, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) u.order = { kind: 'build', target: best.id, chain: true };
  }

  afterBuild(u, b, o) {
    u.order = null; u.path = null;
    const def = BUILDINGS[b.type];
    if (def.farm) {
      const f = this.get(b.farmer);
      if (!f || !f.order || f.order.target !== b.id) { this.orderGather(u, b); b.farmer = u.id; }
      return;
    }
    if (o.chain) { this.findNextFoundation(u, o); if (u.order) return; }
    if (def.drop && def.drop.length <= 2) {
      // camp spécialisé : récolte la ressource la plus proche
      const kinds = { food: 'berries', wood: 'tree', gold: 'gold', stone: 'stone' };
      let best = null, bestD = 10;
      for (const rt of def.drop) {
        const r = this.findNearestResource(rt, kinds[rt], b.x, b.y, bestD, u.owner);
        if (r) { const d = Math.hypot(r.x - b.x, r.y - b.y); if (d < bestD) { bestD = d; best = r; } }
      }
      if (best) this.orderGather(u, best);
    }
  }

  onBuilt(b) {
    const p = this.players[b.owner];
    this.recomputePopCap(p);
    p.stats.built++;
    const bd = BUILDINGS[b.type];
    if (bd.wonder || bd.space) {
      b.countdown = bd.space ? LAUNCH_TIME : WONDER_TIME;
      const mins = Math.round(b.countdown / 60);
      this.msg(-1, bd.space ? `${p.name} a achevé son programme spatial : lancement dans ${mins} minutes !` : `${p.name} a achevé sa merveille : victoire dans ${mins} minutes si elle tient !`, b.owner === this.humanPlayer ? 'good' : 'alert');
    }
    if (this.time > 1 && !BUILDINGS[b.type].wall) this.events.push({ type: 'sfx', kind: 'built', x: b.x, y: b.y, player: b.owner, ui: true });
    if (b.owner === this.humanPlayer && this.time > 1 && !BUILDINGS[b.type].farm && !BUILDINGS[b.type].wall) this.msg(b.owner, `${BUILDINGS[b.type].name} terminé(e).`);
  }

  recomputePopCap(p) {
    let cap = 0;
    for (const b of this.buildings) if (!b.dead && b.owner === p.id && b.built) cap += (BUILDINGS[b.type].pop || 0) + (b.type === 'house' ? p.mods.housePop : 0);
    p.popCap = Math.min(p.mods.maxPop || MAX_POP, cap);
  }

  // ---------------------------------------------------------------- bâtiments
  updateBuilding(b, dt) {
    if (!b.built) return;
    const p = this.players[b.owner];
    const bdef = BUILDINGS[b.type];
    // revenus passifs
    if (bdef.income) for (const [k, v] of Object.entries(bdef.income)) { const a = v * p.mods.income.bank * dt; p.res[k] += a; p.stats.gathered[k] += a; }
    if (bdef.factory) { const k = b.mode || 'wood'; const a = 1.5 * p.mods.income.factory * dt; p.res[k] += a; p.stats.gathered[k] += a; }
    if (p.mods.bregen && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + p.mods.bregen * dt);
    // compte à rebours de victoire (merveille, fusée)
    if (b.countdown !== undefined && this.winner === null) {
      b.countdown -= dt;
      if (b.countdown <= 0) {
        b.countdown = 0;
        this.winner = b.owner;
        this.victoryReason = bdef.space ? 'space' : 'wonder';
        this.events.push({ type: 'victory', player: b.owner, reason: this.victoryReason });
        return;
      }
    }
    const item = b.queue[0];
    if (item) {
      if (item.kind === 'unit' && p.pop >= p.popCap) {
        if (!item.housed) { item.housed = true; if (b.owner === this.humanPlayer) this.msg(b.owner, 'Population maximale atteinte : construisez des maisons.', 'warn'); }
      } else {
        item.housed = false;
        const m = p.mods;
        item.t += dt * (item.kind === 'tech' || item.kind === 'age' ? m.researchSpeed : item.kind === 'unit' && item.id !== 'villager' ? m.trainSpeed : 1);
        if (item.t >= item.time) { b.queue.shift(); this.completeItem(b, item); }
      }
    }
    const atk = this.buildingAttack(b);
    if (atk) {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        let best = null, bestD = atk.range + b.size / 2;
        for (const u of this.units) {
          if (u.dead || !this.isEnemy(b.owner, u.owner)) continue;
          const d = this.distTo(u, b) + b.size / 2;
          if (d < bestD) { bestD = d; best = u; }
        }
        if (best) {
          b.cooldown = atk.rof;
          this.fire(b.owner, b.x, b.y, best, atk, atk.kind || 'arrow', b);
        }
      }
    }
  }

  completeItem(b, item) {
    const p = this.players[b.owner];
    if (item.kind === 'unit') {
      const spot = this.findFreeSpot(b, b.rally ? b.rally.x : b.x + b.size, b.rally ? b.rally.y : b.y + b.size) || { x: b.tx + b.size + 0.5, y: b.ty + b.size + 0.5 };
      const u = this.createUnit(item.id, b.owner, spot.x, spot.y);
      p.stats.trained++;
      if (b.rally) {
        const rt = b.rally.target ? this.get(b.rally.target) : null;
        if (rt && u.type === 'villager' && this.resTypeOf(rt)) this.orderGather(u, rt);
        else u.order = { kind: 'move', x: b.rally.x, y: b.rally.y };
      }
      this.events.push({ type: 'trained', player: b.owner, unit: u.id });
    } else if (item.kind === 'tech') {
      const def = TECHS[item.id];
      p.researching.delete(item.id);
      p.techs.add(item.id);
      def.apply(p.mods);
      p.statCache = {};
      this.refreshStats(p);
      if (b.owner === this.humanPlayer) this.msg(b.owner, `Technologie « ${def.name} » recherchée.`, 'good');
    } else if (item.kind === 'age') {
      p.age = item.id;
      p.agingUp = false;
      this.events.push({ type: 'age', player: b.owner, age: p.age });
      this.msg(-1, `${p.name} entre dans l'${AGES[p.age].name.slice(2)} !`, b.owner === this.humanPlayer ? 'good' : 'info');
    }
  }

  refreshStats(p) {
    for (const u of this.units) {
      if (u.dead || u.owner !== p.id) continue;
      const st = this.unitStats(p.id, u.type);
      if (st.hp !== u.maxHp) { const ratio = u.hp / u.maxHp; u.maxHp = st.hp; u.hp = Math.max(1, Math.round(st.hp * ratio)); }
    }
    for (const b of this.buildings) {
      if (b.dead || b.owner !== p.id) continue;
      const mh = Math.round(BUILDINGS[b.type].hp * p.mods.bhp);
      if (mh !== b.maxHp) { const ratio = b.hp / b.maxHp; b.maxHp = mh; b.hp = mh * ratio; }
    }
  }

  // ---------------------------------------------------------------- brouillard
  updateFog(force = false) {
    const W = this.map.w, H = this.map.h;
    for (const p of this.players) {
      if (!p.isHuman && !force) continue;
      p.visible.fill(0);
    }
    const mark = (p, cx, cy, r) => {
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          if (dx * dx + dy * dy <= r2) { const i = y * W + x; p.visible[i] = 1; p.explored[i] = 1; }
        }
      }
    };
    for (const e of this.units) if (!e.dead && e.owner >= 0 && (this.players[e.owner].isHuman || force)) mark(this.players[e.owner], e.x, e.y, this.losOf(e));
    for (const e of this.buildings) if (!e.dead && (this.players[e.owner].isHuman || force)) mark(this.players[e.owner], e.x, e.y, this.losOf(e));
  }

  isVisible(playerId, e) {
    if (playerId < 0) return true;
    const p = this.players[playerId];
    if (e.owner === playerId) return true;
    const W = this.map.w;
    if (e.kind === 'unit') return !!p.visible[Math.floor(e.y) * W + Math.floor(e.x)];
    for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (p.explored[y * W + x]) return true;
    return false;
  }

  // ---------------------------------------------------------------- victoire
  checkVictory() {
    const alive = [];
    for (const p of this.players) {
      if (p.defeated) continue;
      const hasUnits = this.units.some((u) => !u.dead && u.owner === p.id);
      const hasKey = this.buildings.some((b) => !b.dead && b.owner === p.id && !BUILDINGS[b.type].wall && b.type !== 'house' && !BUILDINGS[b.type].farm);
      if (!hasUnits && !hasKey) {
        p.defeated = true;
        this.events.push({ type: 'defeat', player: p.id });
        this.msg(-1, `${p.name} a été vaincu !`, 'warn');
        for (const b of this.buildings) if (b.owner === p.id) this.kill(b, -1);
      } else alive.push(p);
    }
    if (alive.length === 1) { this.winner = alive[0].id; this.events.push({ type: 'victory', player: alive[0].id }); }
  }
}

export { RESOURCES };
