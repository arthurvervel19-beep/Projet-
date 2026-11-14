// Multijoueur en « lockstep » : chaque navigateur calcule toute la partie, et les joueurs
// n'échangent que leurs ordres. La simulation avance par tours de TURN_TICKS pas ; les ordres
// donnés pendant un tour sont exécutés DELAY tours plus tard, au même pas chez tout le monde.
// Un tour ne démarre que lorsque les ordres de tous les joueurs pour ce tour sont arrivés.
// Ce module ne dépend d'aucun réseau : on lui donne une fonction send() et il reçoit receive().
import { Game } from './game.js';
import { TICK, RESOURCES, BUILDINGS } from './config.js';

export const TURN_TICKS = 4; // 4 pas de 50 ms : un tour = 200 ms
export const DELAY = 2; // ordres exécutés 2 tours après (200 à 400 ms de délai)
const HASH_EVERY = 5; // contrôle de synchronisation toutes les secondes
const NEED_RETRY_MS = 1500; // relance si les ordres d'un joueur se font attendre

// Empreinte de l'état de la partie, pour détecter une désynchronisation
export function stateHash(g) {
  let h = 2166136261;
  const mix = (v) => { h ^= v | 0; h = Math.imul(h, 16777619); };
  mix(g.nextId); mix(g.units.length); mix(g.buildings.length);
  for (const u of g.units) { mix(u.id); mix(Math.round(u.x * 256)); mix(Math.round(u.y * 256)); mix(Math.round(u.hp * 16)); }
  for (const b of g.buildings) { mix(b.id); mix(Math.round(b.hp * 16)); mix(b.queue ? b.queue.length : 0); }
  for (const r of g.resources) { mix(r.id); mix(Math.round((r.amount || 0) * 16)); }
  for (const p of g.players) { for (const k of RESOURCES) mix(Math.round(p.res[k] * 16)); mix(p.age); mix(p.defeated ? 1 : 0); }
  return h >>> 0;
}

export class Lockstep {
  // game : partie déjà créée (même graine chez tous) ; me : mon numéro de joueur
  // names : noms des joueurs ; send(msg) : diffuse un message aux autres joueurs
  constructor({ game, me, names, send }) {
    this.game = game;
    this.me = me;
    this.n = game.players.length;
    this.names = names || game.players.map((p) => p.name);
    this.send = send;
    this.tick = 0;
    this.openTurn = -1; // dernier tour dont les ordres ont été exécutés
    this.sentUpTo = DELAY - 1; // les DELAY premiers tours n'ont pas d'ordres
    this.pending = []; // mes ordres en attente d'envoi
    this.mine = new Map(); // tour -> paquet que j'ai envoyé (pour le renvoyer si besoin)
    this.inbox = Array.from({ length: this.n }, () => new Map()); // joueur -> tour -> ordres
    this.myHash = new Map();
    this.theirHash = Array.from({ length: this.n }, () => new Map());
    this.desync = false;
    this.waitingSince = 0;
    this.lastNeed = 0;
    this.applying = false;
    this.stats = { sent: 0, received: 0, cmds: 0 };
    this.onDesync = null;
    // tous les ordres donnés par l'interface passent par ici au lieu d'être exécutés tout de suite
    game.issue = (owner, cmd) => (this.applying ? Game.prototype.issue.call(game, owner, cmd) : this.submit(owner, cmd));
  }

  // ordre local : vérifié tout de suite pour l'interface, exécuté plus tard chez tout le monde
  submit(owner, cmd) {
    if (owner !== this.me) return false;
    const ok = this.precheck(cmd);
    if (ok) this.pending.push(JSON.parse(JSON.stringify(cmd)));
    return ok;
  }

  // abandon : exécuté au même tour chez tous les joueurs
  resign() { this.pending.push({ type: 'resign' }); }

  precheck(cmd) {
    const g = this.game, p = g.players[this.me];
    if (!p || p.defeated || g.winner !== null) return false;
    switch (cmd.type) {
      case 'build': {
        const def = BUILDINGS[cmd.building];
        if (!def || !g.hasAge(p, def.age)) return false;
        if (!g.canPlace(this.me, cmd.building, cmd.tx, cmd.ty)) { g.msg(this.me, 'Emplacement invalide.', 'warn'); return false; }
        if (!g.canAfford(p, def.cost)) { g.msg(this.me, g.missingText(p, def.cost), 'warn'); return false; }
        return true;
      }
      case 'buildLine': {
        const def = BUILDINGS[cmd.building];
        if (!def || !(cmd.tiles || []).some(([x, y]) => g.canPlace(this.me, cmd.building, x, y))) return false;
        if (!g.canAfford(p, def.cost)) { g.msg(this.me, g.missingText(p, def.cost), 'warn'); return false; }
        return true;
      }
      default: return true;
    }
  }

  // un message reçu d'un autre joueur
  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.k === 't') this.store(msg);
    else if (msg.k === 'r' && Array.isArray(msg.list)) msg.list.forEach((m) => this.store(m));
    else if (msg.k === 'n' && msg.p !== this.me && Number.isInteger(msg.from)) this.resend(msg.from);
  }

  store(m) {
    const p = m.p;
    if (!Number.isInteger(p) || p < 0 || p >= this.n || p === this.me || !Number.isInteger(m.t)) return;
    if (m.t <= this.openTurn || this.inbox[p].has(m.t)) return; // déjà reçu ou déjà joué
    this.inbox[p].set(m.t, Array.isArray(m.c) ? m.c : []);
    this.stats.received++;
    if (m.h) { this.theirHash[p].set(m.h[0], m.h[1]); this.compare(p, m.h[0]); }
  }

  resend(from) {
    const list = [];
    for (const [t, pk] of this.mine) if (t >= from) list.push(pk);
    for (let i = 0; i < list.length; i += 100) this.send({ k: 'r', p: this.me, list: list.slice(i, i + 100) });
  }

  compare(p, turn) {
    const a = this.myHash.get(turn), b = this.theirHash[p].get(turn);
    if (a === undefined || b === undefined) return;
    if (a !== b && !this.desync) {
      this.desync = true;
      if (this.onDesync) this.onDesync(this.names[p], turn);
    }
    this.theirHash[p].delete(turn);
  }

  // joueur dont on attend les ordres (ou -1)
  missing(turn) {
    if (turn < DELAY) return -1;
    for (let p = 0; p < this.n; p++) if (p !== this.me && !this.inbox[p].has(turn)) return p;
    return -1;
  }

  // avance d'un pas de simulation ; renvoie false si on attend un autre joueur
  step(now = Date.now()) {
    const g = this.game;
    if (this.tick % TURN_TICKS === 0 && this.openTurn < this.tick / TURN_TICKS) {
      const turn = this.tick / TURN_TICKS;
      // 1) j'envoie mes ordres pour le tour turn + DELAY (une seule fois)
      if (this.sentUpTo < turn + DELAY) {
        const t = turn + DELAY;
        const pk = { k: 't', p: this.me, t, c: this.pending };
        this.pending = [];
        if (turn % HASH_EVERY === 0) {
          const h = stateHash(g);
          this.myHash.set(turn, h);
          pk.h = [turn, h];
          for (let p = 0; p < this.n; p++) if (p !== this.me) this.compare(p, turn);
        }
        this.mine.set(t, pk);
        this.sentUpTo = t;
        this.send(pk);
        this.stats.sent++;
      }
      // 2) j'attends les ordres des autres pour ce tour
      const miss = this.missing(turn);
      if (miss >= 0) {
        if (!this.waitingSince) this.waitingSince = now;
        if (now - this.waitingSince > NEED_RETRY_MS && now - this.lastNeed > NEED_RETRY_MS) {
          this.lastNeed = now;
          this.send({ k: 'n', p: this.me, from: turn });
        }
        return false;
      }
      this.waitingSince = 0;
      // 3) j'exécute les ordres du tour, joueur par joueur, dans le même ordre partout
      this.applying = true;
      try {
        for (let p = 0; p < this.n; p++) {
          const cmds = p === this.me ? (this.mine.get(turn) || { c: [] }).c : this.inbox[p].get(turn) || [];
          for (const cmd of cmds) this.apply(p, cmd);
          this.inbox[p].delete(turn);
        }
      } finally { this.applying = false; }
      this.openTurn = turn;
      // on garde mes paquets récents pour pouvoir les renvoyer
      for (const t of this.mine.keys()) if (t < turn - 300) this.mine.delete(t);
      for (const t of this.myHash.keys()) if (t < turn - 100) this.myHash.delete(t);
    }
    g.update(TICK);
    this.tick++;
    return true;
  }

  apply(p, cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    const g = this.game;
    this.stats.cmds++;
    if (cmd.type === 'resign') {
      const pl = g.players[p];
      if (pl && !pl.defeated && g.winner === null) { pl.defeated = true; pl.resigned = true; g.msg(-1, `${this.names[p]} abandonne la partie.`, 'warn'); g.checkTimer = 0; }
      return;
    }
    try { Game.prototype.issue.call(g, p, cmd); } catch (e) { console.warn('ordre ignoré', cmd, e); }
  }

  // nombre de tours de retard sur les autres joueurs (pour accélérer un peu et les rattraper)
  lag() {
    const cur = Math.floor(this.tick / TURN_TICKS);
    let ahead = Infinity;
    for (let p = 0; p < this.n; p++) {
      if (p === this.me) continue;
      let mx = -1;
      for (const t of this.inbox[p].keys()) if (t > mx) mx = t;
      ahead = Math.min(ahead, mx);
    }
    return ahead === Infinity || ahead < 0 ? 0 : Math.max(0, ahead - cur - DELAY);
  }

  // joueur attendu depuis plus de ms millisecondes (pour l'affichage), ou -1
  waitingPlayer(now = Date.now(), ms = 700) {
    if (!this.waitingSince || now - this.waitingSince < ms) return -1;
    return this.missing(this.tick / TURN_TICKS);
  }

  // nom du joueur attendu depuis plus de ms millisecondes (pour l'affichage)
  waitingFor(now = Date.now(), ms = 700) {
    if (!this.waitingSince || now - this.waitingSince < ms) return null;
    const p = this.missing(this.tick / TURN_TICKS);
    return p >= 0 ? this.names[p] : null;
  }
}

// Crée la partie de la même façon chez tous les joueurs (même graine, mêmes réglages)
export function createNetGame({ seed, size, civs, names, me, startRes }) {
  const g = new Game({ seed, size, players: civs.length, humanPlayer: me, civs, startRes });
  // chaque joueur est humain : le brouillard et les règles de placement sont calculés pareil partout
  g.players.forEach((p, i) => { p.isHuman = true; if (names && names[i]) p.name = names[i]; });
  g.updateFog(true);
  return g;
}
