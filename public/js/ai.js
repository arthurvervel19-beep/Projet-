// Intelligence artificielle de l'adversaire. Elle utilise les mêmes commandes que le joueur.
import { UNITS, BUILDINGS, TECHS, AGES, CIVS } from './config.js';
import { hypot, dsin, dcos } from './dmath.js';

const DIFFICULTY = {
  facile: { gather: 0.8, firstAttack: 720, think: 2.0, maxVil: 30, wave: 6 },
  normal: { gather: 1.0, firstAttack: 540, think: 1.2, maxVil: 50, wave: 10 },
  difficile: { gather: 1.2, firstAttack: 400, think: 0.8, maxVil: 60, wave: 12, wonders: true },
};

const GK = { food: 'berries', wood: 'tree', gold: 'gold', stone: 'stone' };

export class AI {
  constructor(game, playerId, difficulty = 'normal') {
    this.g = game;
    this.id = playerId;
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.p = game.players[playerId];
    this.p.gatherMul = this.cfg.gather;
    this.timer = 0;
    this.attackWave = 0;
    this.nextAttack = this.cfg.firstAttack;
    this.attacking = false;
  }

  update(dt) {
    if (this.p.defeated || this.g.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.think;
    this.think();
  }

  issue(cmd) { return this.g.issue(this.id, cmd); }

  think() {
    const g = this.g, p = this.p;
    this.units = g.units.filter((u) => !u.dead && u.owner === this.id);
    this.vils = this.units.filter((u) => u.type === 'villager');
    this.army = this.units.filter((u) => u.type !== 'villager');
    this.blds = g.buildings.filter((b) => !b.dead && b.owner === this.id);
    this.tc = this.blds.find((b) => b.type === 'town_center' && b.built) || this.blds.find((b) => b.type === 'town_center');
    this.base = this.tc ? { x: this.tc.x, y: this.tc.y } : (this.vils[0] ? { x: this.vils[0].x, y: this.vils[0].y } : null);
    if (!this.base) return;

    this.reserve = { food: 0, gold: 0, wood: 0, stone: 0 };
    this.manageAge();
    this.trainVillagers();
    this.buildHouses();
    this.buildMilitary();
    this.buildEconomy();
    this.assignVillagers();
    this.research();
    this.trainArmy();
    this.trade();
    this.defend() || this.manageAttack();
  }

  count(type, builtOnly = false) { return this.blds.filter((b) => b.type === type && (!builtOnly || b.built)).length; }

  spare(cost) {
    return Object.entries(cost).every(([k, v]) => this.p.res[k] - this.reserve[k] >= v);
  }

  // ------------------------------------------------------------ âge
  manageAge() {
    const p = this.p, g = this.g;
    const next = AGES[p.age + 1];
    if (!next || p.agingUp || !this.tc || !this.tc.built) return;
    const vilNeed = [12, 20, 26, 30, 32, 34, 36][p.age] ?? 99;
    if (this.vils.length < vilNeed) return;
    if (!g.ageRequirementMet(p)) return;
    for (const [k, v] of Object.entries(next.cost)) this.reserve[k] += v;
    if (g.canAfford(p, next.cost)) {
      // libère la file de l'hôtel de ville (villageois en attente) pour lancer le passage d'âge
      if (this.tc.queue.length && this.tc.queue.every((q) => q.kind === 'unit')) {
        for (let i = this.tc.queue.length - 1; i >= 0; i--) this.issue({ type: 'cancel', building: this.tc.id, index: i });
      }
      if (this.tc.queue.length === 0) this.issue({ type: 'ageUp', building: this.tc.id });
    }
  }

  trainVillagers() {
    const tcs = this.blds.filter((b) => b.type === 'town_center' && b.built);
    const target = Math.min(this.cfg.maxVil, [22, 34, 46, 56, 60, 60, 60, 60][this.p.age]);
    for (const tc of tcs) {
      if (this.vils.length >= target || this.p.pop >= this.p.popCap) break;
      if (tc.queue.length < 2 && this.p.res.food - this.reserve.food >= 50) {
        this.issue({ type: 'train', building: tc.id, unit: 'villager' });
      } else if (tc.queue.length < 1 && this.p.res.food >= 50 && !this.p.agingUp) {
        this.issue({ type: 'train', building: tc.id, unit: 'villager' });
      }
    }
  }

  // ------------------------------------------------------------ placement
  findSpot(type, cx, cy, minD = 3, maxD = 14) {
    const g = this.g;
    const s = BUILDINGS[type].size;
    // élargit la recherche si la base est saturée
    for (let k = 0; k < 4; k++) {
      const lo = k === 0 ? minD : maxD * (0.6 + k * 0.4), hi = Math.min(40, maxD * (1 + k * 0.6));
      let best = null, bestScore = Infinity;
      for (let tries = 0; tries < 160; tries++) {
        const a = g.rand() * Math.PI * 2;
        const d = lo + g.rand() * (hi - lo);
        const tx = Math.round(cx + dcos(a) * d - s / 2), ty = Math.round(cy + dsin(a) * d - s / 2);
        if (!g.canPlace(this.id, type, tx, ty)) continue;
        if (!BUILDINGS[type].farm && !this.hasMargin(tx, ty, s)) continue;
        const score = d + g.rand() * 2;
        if (score < bestScore) { bestScore = score; best = { tx, ty }; }
        if (tries > 40 && best) break;
      }
      if (best) return best;
    }
    return null;
  }

  hasMargin(tx, ty, s) {
    const m = this.g.map;
    for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) {
      if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
      const id = m.occ[y * m.w + x];
      if (id) { const e = this.g.get(id); if (e && e.kind === 'building') return false; }
    }
    return true;
  }

  pickBuilder(nearX, nearY) {
    // préfère un villageois inactif, sinon un bûcheron/cueilleur proche
    let best = null, bestScore = Infinity;
    for (const u of this.vils) {
      if (u.order && u.order.kind === 'build') continue;
      const idle = !u.order ? -20 : 0;
      const busyGold = u.order && u.order.resType === 'gold' ? 10 : 0;
      const score = hypot(u.x - nearX, u.y - nearY) + idle + busyGold;
      if (score < bestScore) { bestScore = score; best = u; }
    }
    return best;
  }

  tryBuild(type, cx, cy, minD, maxD, builders = 1, priority = false) {
    const def = BUILDINGS[type];
    if (this.p.age < def.age) return false;
    if (!this.spare(def.cost)) {
      if (priority) for (const [k, v] of Object.entries(def.cost)) this.reserve[k] += v;
      return false;
    }
    const spot = this.findSpot(type, cx, cy, minD, maxD);
    if (!spot) return false;
    const ids = [];
    for (let i = 0; i < builders; i++) {
      const b = this.pickBuilder(cx, cy);
      if (!b) break;
      ids.push(b.id);
      b.order = { kind: 'build', target: -1 }; // réservé temporairement
    }
    if (!ids.length) return false;
    const res = this.issue({ type: 'build', ids, building: type, tx: spot.tx, ty: spot.ty });
    if (!res) ids.forEach((id) => { const u = this.g.get(id); if (u) u.order = null; });
    return !!res;
  }

  underConstruction(type) { return this.blds.some((b) => b.type === type && !b.built); }

  // ------------------------------------------------------------ économie
  buildHouses() {
    const p = this.p, base = this.base;
    const prod = this.blds.filter((b) => b.built && (BUILDINGS[b.type].trains)).length;
    const margin = 3 + prod * 2;
    if (p.popCap < 200 && p.pop + margin >= p.popCap && this.blds.filter((b) => b.type === 'house' && !b.built).length < (p.pop > 40 ? 2 : 1)) {
      this.tryBuild('house', base.x, base.y, 4, Math.min(28, 12 + this.count('house') * 0.45), 1, true);
    }
  }

  buildEconomy() {
    const g = this.g, p = this.p, base = this.base;
    // camps près des ressources
    this.ensureCamp('lumber_camp', 'tree', 18);
    this.ensureCamp('mining_camp', 'gold', 20);
    if (this.vils.length >= 10) this.ensureCamp('mill', 'berries', 14);
    if (p.age >= 1 && this.vils.length >= 18) this.ensureCamp('mining_camp', 'stone', 20, true);
    // fermes quand les baies s'épuisent
    const berries = g.resources.filter((r) => (r.type === 'berries' || r.type === 'sheep') && hypot(r.x - base.x, r.y - base.y) < 16).length;
    const farms = this.count('farm');
    const wantFarms = Math.max(0, Math.round(this.foodTarget() - berries * 0.6));
    if (farms < wantFarms && !this.underConstruction('farm') && this.spare({ wood: 60 })) {
      const mill = this.blds.find((b) => b.type === 'mill' && b.built);
      const c = farms < 6 || !mill ? base : mill;
      this.tryBuild('farm', c.x, c.y, 3, 9);
    }
    // marché et tours (pour l'IA difficile surtout)
    if (p.age >= 1 && this.count('market') === 0 && this.vils.length > 22) this.tryBuild('market', base.x, base.y, 6, 14);
    if (p.age >= 1 && this.count('tower') < 1 + p.age && p.res.stone > 250) this.tryBuild('tower', base.x, base.y, 6, 11);
    if (p.age >= 2 && this.count('town_center') < 2 && this.vils.length > 28 && this.spare(BUILDINGS.town_center.cost)) {
      this.tryBuild('town_center', base.x, base.y, 14, 22, 3);
    }
    if (p.age >= 2 && this.count('fortress') === 0 && p.res.stone >= 650) this.tryBuild('fortress', base.x, base.y, 7, 14, 3);
  }

  ensureCamp(type, gk, maxD, extra = false) {
    const g = this.g, base = this.base;
    if (this.underConstruction(type)) return;
    // ressource la plus proche de la base
    let res = null, bestD = maxD + 10;
    for (const r of g.resources) {
      if (r.dead || r.type !== gk) continue;
      const d = hypot(r.x - base.x, r.y - base.y);
      if (d < bestD) { bestD = d; res = r; }
    }
    if (!res) return;
    // un dépôt existe-t-il déjà près de cette ressource ?
    const near = this.blds.some((b) => {
      const def = BUILDINGS[b.type];
      return def.drop && def.drop.includes(BUILDINGS[type].drop[0]) && (extra ? def.drop.includes(gk) : true) && hypot(b.x - res.x, b.y - res.y) < 6;
    });
    if (near) return;
    if (gk === 'tree' && this.count('lumber_camp') >= 3) return;
    this.tryBuild(type, res.x, res.y, 1.5, 4);
  }

  foodTarget() {
    return Math.round(this.vils.length * [0.5, 0.42, 0.4, 0.38][Math.min(3, this.p.age)]);
  }

  desired() {
    const n = this.vils.length;
    const ratios = [
      { food: 0.52, wood: 0.45, gold: 0.03, stone: 0 },
      { food: 0.42, wood: 0.38, gold: 0.16, stone: 0.04 },
      { food: 0.38, wood: 0.32, gold: 0.24, stone: 0.06 },
      { food: 0.36, wood: 0.3, gold: 0.28, stone: 0.06 },
    ][Math.min(3, this.p.age)];
    const out = {};
    for (const k of Object.keys(ratios)) out[k] = Math.round(n * ratios[k]);
    // besoins spécifiques
    if (this.p.agingUp === false && AGES[this.p.age + 1] && AGES[this.p.age + 1].cost.gold && this.p.res.gold < AGES[this.p.age + 1].cost.gold) out.gold += 2;
    return out;
  }

  assignVillagers() {
    const g = this.g;
    const cur = { food: 0, wood: 0, gold: 0, stone: 0 };
    const idle = [];
    for (const u of this.vils) {
      if (!u.order) { idle.push(u); continue; }
      if (u.order.kind === 'build' && u.order.target === -1) { u.order = null; idle.push(u); continue; }
      const rt = u.order.resType || (u.order.resume && u.order.resume.resType);
      if (rt) cur[rt]++;
    }
    const want = this.desired();
    // rééquilibrage léger : réaffecte un villageois sur-représenté
    for (let k = 0; k < 2; k++) {
      const over = Object.keys(cur).find((r) => cur[r] > want[r] + 1);
      const under = Object.keys(cur).find((r) => cur[r] < want[r] - 1);
      if (!over || !under || idle.length > 1) break;
      const u = this.vils.find((v) => v.order && v.order.kind === 'gather' && v.order.resType === over && v.order.gk !== 'farm');
      if (!u) break;
      u.order = null; idle.push(u); cur[over]--;
    }
    for (const u of idle) {
      const order = ['food', 'wood', 'gold', 'stone'].sort((a, b) => (cur[a] - want[a]) - (cur[b] - want[b]));
      let assigned = false;
      for (const rt of order) {
        let target = null;
        if (rt === 'food') {
          target = g.findNearestResource('food', 'sheep', this.base.x, this.base.y, 12, this.id) ||
            g.findNearestResource('food', 'berries', this.base.x, this.base.y, 18, this.id) ||
            g.findNearestResource('food', 'farm', u.x, u.y, 30, this.id);
        } else {
          target = g.findNearestResource(rt, GK[rt], this.base.x, this.base.y, 40, this.id);
        }
        if (target) {
          this.issue({ type: 'gather', ids: [u.id], target: target.id });
          cur[rt]++; assigned = true; break;
        }
      }
      void assigned;
    }
    // fondations abandonnées : on y envoie un constructeur
    for (const b of this.blds) {
      if (b.built) continue;
      if (this.vils.some((v) => v.order && v.order.kind === 'build' && v.order.target === b.id)) continue;
      const u = this.pickBuilder(b.x, b.y);
      if (u) this.issue({ type: 'repair', ids: [u.id], target: b.id });
    }
  }

  // ------------------------------------------------------------ militaire
  buildMilitary() {
    const p = this.p, base = this.base;
    if (this.vils.length >= 10 && this.count('barracks') === 0) this.tryBuild('barracks', base.x, base.y, 6, 12, 1, true);
    if (p.age >= 1) {
      if (this.count('archery_range') === 0) this.tryBuild('archery_range', base.x, base.y, 6, 13, 1, true);
      else if (this.count('blacksmith') === 0) this.tryBuild('blacksmith', base.x, base.y, 5, 12, 1, true);
      else if (this.count('stable') === 0) this.tryBuild('stable', base.x, base.y, 6, 13);
      else if (this.vils.length > 25 && this.count('archery_range') < 2) this.tryBuild('archery_range', base.x, base.y, 6, 14);
    }
    if (p.age >= 2 && this.count('siege_workshop') === 0) this.tryBuild('siege_workshop', base.x, base.y, 6, 14);
    if (p.age >= 2 && this.vils.length > 30 && this.count('barracks') < 2) this.tryBuild('barracks', base.x, base.y, 6, 15);
    // âges avancés : bâtiments requis pour progresser et nouvelles armes
    if (p.age >= 3 && this.count('university') === 0) this.tryBuild('university', base.x, base.y, 6, 15, 2, true);
    if (p.age >= 4 && this.count('bank') < 2) this.tryBuild('bank', base.x, base.y, 6, 15, 1, this.count('bank') === 0);
    if (p.age >= 5 && this.count('factory') < 2) this.tryBuild('factory', base.x, base.y, 7, 17, 2, this.count('factory') === 0);
    if (p.age >= 5 && this.count('bunker') < 2 && p.res.stone > 500) this.tryBuild('bunker', base.x, base.y, 6, 11);
    if (p.age >= 6 && this.count('airfield') === 0) this.tryBuild('airfield', base.x, base.y, 7, 17, 2, true);
    if (p.age >= 7 && this.count('laser_turret') < 3 && p.res.gold > 800) this.tryBuild('laser_turret', base.x, base.y, 6, 11);
    // merveille et programme spatial (IA difficile surtout)
    if (p.age >= 3 && this.cfg.wonders && this.count('wonder') === 0 && this.vils.length > 34) this.tryBuild('wonder', base.x, base.y, 8, 18, 6);
    if (p.age >= 7 && this.count('space_program') === 0 && this.vils.length > 34) this.tryBuild('space_program', base.x, base.y, 8, 18, 8);
    // réglage des usines : produire la ressource la plus rare
    for (const f of this.blds.filter((b) => b.type === 'factory' && b.built)) {
      const want = ['wood', 'gold', 'food', 'stone'].sort((a, c) => p.res[a] - p.res[c])[0];
      if (f.mode !== want && (!f.lastSwitch || this.g.time - f.lastSwitch > 30)) { this.issue({ type: 'factoryMode', building: f.id, res: want }); f.lastSwitch = this.g.time; }
    }
  }

  research() {
    const g = this.g, p = this.p;
    if (this.vils.length < 10) return;
    const prio = ['double_axe', 'horse_collar', 'loom', 'wheelbarrow', 'gold_mining', 'fletching', 'forging', 'scale_armor',
      'bow_saw', 'heavy_plow', 'barding', 'bloodlines', 'iron_casting', 'bodkin', 'chain_mail', 'hand_cart', 'masonry', 'stone_mining',
      'census', 'chemistry', 'crop_rotation', 'two_man_saw', 'gold_shaft', 'conscription', 'blast_furnace', 'plate_armor', 'plate_barding', 'architecture',
      'printing', 'flintlock', 'compound_interest', 'bastion', 'steam_power', 'railway', 'rifling', 'medicine',
      'mechanization', 'kevlar', 'radar', 'jet_engines', 'fusion', 'ai_tactics', 'nanotech', 'stone_shaft'];
    for (const t of prio) {
      const def = TECHS[t];
      if (p.techs.has(t) || p.researching.has(t) || p.age < def.age) continue;
      if (def.req && !p.techs.has(def.req)) continue;
      const b = this.blds.find((x) => x.built && (BUILDINGS[x.type].techs || []).includes(t) && x.queue.length === 0);
      if (!b) continue;
      if (!this.spare(def.cost)) continue;
      this.issue({ type: 'research', building: b.id, tech: t });
      return;
    }
  }

  trade() {
    const p = this.p, g = this.g;
    if (!g.buildingsOf(this.id, 'market').length) return;
    for (const r of ['wood', 'food']) {
      if (p.res.gold > 500 && p.res[r] < 150 && g.marketPrices[r] < 220) { this.issue({ type: 'market', action: 'buy', res: r }); return; }
    }
    if (p.res.stone > 800) this.issue({ type: 'market', action: 'sell', res: 'stone' });
  }

  composition() {
    const a = this.p.age;
    const enemyCav = this.g.units.filter((u) => !u.dead && this.g.isEnemy(this.id, u.owner) && UNITS[u.type].cls === 'cavalry').length;
    const enemyArch = this.g.units.filter((u) => !u.dead && this.g.isEnemy(this.id, u.owner) && UNITS[u.type].cls === 'archer').length;
    const list = [];
    if (a === 0) list.push('militia');
    if (a >= 1) list.push(enemyCav > 3 ? 'spearman' : 'militia', enemyArch > 3 ? 'skirmisher' : 'archer', 'scout');
    if (a >= 2) list.splice(0, list.length, a >= 3 ? 'champion' : 'swordsman', enemyArch > 4 ? 'skirmisher' : 'crossbowman', a >= 3 ? 'paladin' : 'knight', enemyCav > 4 ? 'spearman' : 'crossbowman');
    if (a >= 4) list.splice(0, list.length, 'musketeer', 'cuirassier', 'champion');
    if (a >= 5) list.splice(0, list.length, 'fusilier', 'dragoon', 'musketeer');
    if (a >= 6) list.splice(0, list.length, 'soldier', 'machine_gunner', 'tank', 'bomber', 'dragoon', 'fusilier');
    if (a >= 7) list.splice(0, list.length, 'exo_soldier', 'robot', 'drone', 'tank', 'soldier', 'dragoon', 'fusilier');
    return list;
  }

  trainArmy() {
    const p = this.p;
    if (this.vils.length < 8) return;
    const comp = this.composition();
    const military = this.blds.filter((b) => b.built && BUILDINGS[b.type].trains && b.type !== 'town_center');
    for (const b of military) {
      if (b.queue.length >= 2) continue;
      const options = BUILDINGS[b.type].trains.filter((t) => UNITS[t].age <= p.age);
      let pick = comp.find((t) => options.includes(t));
      if (b.type === 'siege_workshop') {
        const sieges = this.army.filter((u) => UNITS[u.type].cls === 'siege').length;
        if (sieges >= 4) continue;
        pick = p.age >= 5 ? 'field_gun' : p.age >= 4 ? 'cannon' : sieges % 2 === 0 ? 'ram' : (p.age >= 3 ? (sieges % 3 === 1 ? 'trebuchet' : 'bombard') : 'mangonel');
      }
      if (b.type === 'fortress') pick = CIVS[p.civ].unique;
      if (!pick) continue;
      if (this.army.length > 60 + this.p.age * 5) continue;
      // une armée minimale est maintenue même pendant l'épargne pour le passage d'âge
      const minArmy = 8 + p.age * 4;
      if (this.army.length < minArmy ? this.g.canAfford(p, UNITS[pick].cost) : this.spare(UNITS[pick].cost)) this.issue({ type: 'train', building: b.id, unit: pick });
    }
  }

  // Défend la base si des ennemis s'en approchent
  defend() {
    const g = this.g;
    const threats = g.units.filter((u) => !u.dead && g.isEnemy(this.id, u.owner) &&
      this.blds.some((b) => hypot(b.x - u.x, b.y - u.y) < 12));
    if (!threats.length) return false;
    const defenders = this.army.filter((u) => !u.order || u.order.kind !== 'attack' || !u.order.defending);
    for (const u of defenders) {
      let best = null, bestD = Infinity;
      for (const t of threats) {
        if (UNITS[u.type].onlyBuildings) continue;
        const d = hypot(t.x - u.x, t.y - u.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best && (bestD < 30 || !this.attacking)) {
        this.issue({ type: 'attack', ids: [u.id], target: best.id });
        if (u.order) u.order.defending = true;
      }
    }
    // villageois menacés près du centre-ville : les militaires s'en chargent, le centre tire
    return true;
  }

  manageAttack() {
    const g = this.g;
    const idleArmy = this.army.filter((u) => !u.order || (u.order.kind === 'move' && !u.order.aggressive));
    const needed = this.cfg.wave + this.attackWave * 4;
    if (!this.attacking && g.time >= this.nextAttack && this.army.length >= Math.min(needed, 40)) {
      this.attacking = true;
      this.attackWave++;
    }
    if (this.attacking) {
      const target = this.pickTarget();
      if (!target) return;
      for (const u of idleArmy) {
        this.issue({ type: 'move', ids: [u.id], x: target.x, y: target.y, aggressive: true });
      }
      // si les attaquants arrivés sont inactifs près de la cible détruite, on cible la suivante
      if (this.army.length < 3) {
        this.attacking = false;
        this.nextAttack = g.time + 90;
      }
    } else {
      // rassemblement devant la base
      const enemy = this.pickTarget();
      if (!enemy) return;
      const dx = enemy.x - this.base.x, dy = enemy.y - this.base.y, d = hypot(dx, dy) || 1;
      const rx = this.base.x + dx / d * 7, ry = this.base.y + dy / d * 7;
      const far = idleArmy.filter((u) => hypot(u.x - rx, u.y - ry) > 5);
      if (far.length) this.issue({ type: 'move', ids: far.map((u) => u.id), x: rx, y: ry });
    }
  }

  pickTarget() {
    const g = this.g;
    let best = null, bestD = Infinity;
    for (const b of g.buildings) {
      if (b.dead || !g.isEnemy(this.id, b.owner) || BUILDINGS[b.type].wall) continue;
      const d = hypot(b.x - this.base.x, b.y - this.base.y) - (b.type === 'town_center' ? 4 : 0);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) return best;
    for (const u of g.units) {
      if (u.dead || !g.isEnemy(this.id, u.owner)) continue;
      const d = hypot(u.x - this.base.x, u.y - this.base.y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }
}
