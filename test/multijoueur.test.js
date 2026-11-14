// Multijoueur : deux « navigateurs » simulés dans Node, reliés par un faux réseau
// (latence variable, messages perdus). Chaque joueur est piloté par un robot qui donne des ordres
// au hasard via l'interface, comme un humain. Les deux parties doivent rester identiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lockstep, createNetGame, stateHash, TURN_TICKS } from '../public/js/net.js';
import { BUILDINGS, TECHS } from '../public/js/config.js';
import { mulberry32 } from '../public/js/map.js';

const RICH = { food: 3000, wood: 3000, gold: 2000, stone: 1500 };

// robot : un ordre au hasard, donné comme le ferait l'interface (game.issue / smartCommand)
function makeBot(g, me, seed) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return () => {
    const p = g.players[me];
    const mine = g.units.filter((u) => !u.dead && u.owner === me);
    const vils = mine.filter((u) => u.type === 'villager');
    const army = mine.filter((u) => u.type !== 'villager');
    const blds = g.buildings.filter((b) => !b.dead && b.owner === me && b.built);
    const r = rnd();
    const near = g.resources.filter((x) => !x.dead && Math.abs(x.x - p.startX) < 14 && Math.abs(x.y - p.startY) < 14);
    if (r < 0.3 && vils.length && near.length) {
      const res = pick(near);
      const some = vils.filter(() => rnd() < 0.5);
      if (some.length) g.smartCommand(me, some.map((u) => u.id), res.x, res.y, res);
    } else if (r < 0.5 && blds.length) {
      const b = pick(blds);
      const trains = BUILDINGS[b.type].trains;
      if (trains) g.issue(me, { type: 'train', building: b.id, unit: pick(trains), count: 1 + Math.floor(rnd() * 3) });
    } else if (r < 0.68 && vils.length) {
      const type = pick(['house', 'house', 'barracks', 'lumber_camp', 'archery_range', 'stable', 'blacksmith', 'farm']);
      if (!BUILDINGS[type]) return;
      for (let i = 0; i < 12; i++) {
        const tx = Math.floor(p.startX + rnd() * 20 - 10), ty = Math.floor(p.startY + rnd() * 20 - 10);
        if (g.canPlace(me, type, tx, ty)) { g.issue(me, { type: 'build', ids: [pick(vils).id], building: type, tx, ty }); break; }
      }
    } else if (r < 0.8 && army.length) {
      const foe = g.players[1 - me];
      g.issue(me, { type: 'move', ids: army.map((u) => u.id), x: foe.startX, y: foe.startY, aggressive: true });
    } else if (r < 0.88 && blds.length) {
      const b = pick(blds);
      const techs = BUILDINGS[b.type].techs;
      if (techs) { const t = pick(techs); if (TECHS[t]) g.issue(me, { type: 'research', building: b.id, tech: t }); }
    } else if (r < 0.92) {
      const tc = blds.find((b) => b.type === 'town_center');
      if (tc) g.issue(me, { type: 'ageUp', building: tc.id });
    } else if (mine.length) {
      const some = mine.filter(() => rnd() < 0.3);
      if (some.length) g.issue(me, { type: 'move', ids: some.map((u) => u.id), x: rnd() * g.map.w, y: rnd() * g.map.h });
    }
  };
}

// faux réseau : chaque message arrive après 20 à 320 ms, et quelques-uns se perdent
function makeNetwork(seed, lossRate) {
  const rnd = mulberry32(seed);
  const queue = [];
  let delivered = 0, lost = 0;
  return {
    queue,
    get delivered() { return delivered; },
    get lost() { return lost; },
    send(from, to, msg, now) {
      if (rnd() < lossRate) { lost++; return; }
      queue.push({ at: now + 20 + rnd() * 300, to, msg: JSON.parse(JSON.stringify(msg)) });
    },
    deliver(now, clients) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].at <= now) { const m = queue.splice(i, 1)[0]; delivered++; clients[m.to].net.receive(m.msg); }
      }
    },
  };
}

function runMatch({ seed, seconds, lossRate = 0, resignAt = null }) {
  const civs = ['francs', 'vikings'];
  const network = makeNetwork(seed + 1, lossRate);
  let now = 0;
  const clients = [0, 1].map((me) => {
    const game = createNetGame({ seed, size: 72, civs, names: ['Arthur', 'Invité'], me, startRes: RICH });
    const c = { me, game, acc: 0, hashes: new Map(), bot: makeBot(game, me, seed * 10 + me) };
    c.net = new Lockstep({ game, me, names: ['Arthur', 'Invité'], send: (msg) => network.send(me, 1 - me, msg, now) });
    c.net.onDesync = (who, turn) => { c.desync = turn; };
    return c;
  });
  const target = Math.round(seconds * 20);
  let frames = 0;
  while (clients.some((c) => c.net.tick < target && c.game.winner === null) && frames < target * 40) {
    frames++;
    now += 16;
    network.deliver(now, clients);
    for (const c of clients) {
      // les deux machines n'ont pas la même cadence d'images
      c.acc += c.me === 0 ? 16 : 16 + ((frames * 7) % 13);
      if (resignAt !== null && c.me === 1 && c.net.tick === resignAt && !c.resigned) { c.resigned = true; c.net.resign(); }
      if (frames % 60 === c.me * 30 && c.net.tick < target - 40) c.bot();
      while (c.acc >= 50 && c.net.tick < target) {
        if (!c.net.step(now)) { c.acc = Math.min(c.acc, 50); break; }
        c.acc -= 50;
        if (c.net.tick % 20 === 0) c.hashes.set(c.net.tick, stateHash(c.game));
      }
    }
  }
  return { clients, network, target, frames };
}

test('deux joueurs restent synchronisés malgré la latence', () => {
  const { clients, network, target } = runMatch({ seed: 2024, seconds: 240 });
  const [a, b] = clients;
  assert.equal(a.desync, undefined, 'désynchronisation détectée');
  assert.equal(b.desync, undefined, 'désynchronisation détectée');
  assert.ok(a.net.tick >= target - TURN_TICKS * 3 && b.net.tick >= target - TURN_TICKS * 3, `pas atteints ${a.net.tick} / ${b.net.tick}`);
  let compared = 0;
  for (const [t, h] of a.hashes) if (b.hashes.has(t)) { assert.equal(h, b.hashes.get(t), `état différent au pas ${t}`); compared++; }
  assert.ok(compared >= 230, `comparaisons ${compared}`);
  // les robots ont vraiment joué : de nombreux ordres exécutés, des unités formées, des bâtiments posés
  assert.ok(a.net.stats.cmds > 200, `ordres exécutés ${a.net.stats.cmds}`);
  for (const p of a.game.players) assert.ok(p.stats.trained > 0 && p.stats.built > 0, `${p.name} : ${JSON.stringify(p.stats)}`);
  // budget de messages : environ 5 par seconde et par joueur
  const perSecond = network.delivered / 240 / 2;
  assert.ok(perSecond < 6, `messages par seconde et par joueur : ${perSecond}`);
});

test('les messages perdus sont redemandés et la partie continue', () => {
  const { clients, network, target } = runMatch({ seed: 77, seconds: 120, lossRate: 0.05 });
  const [a, b] = clients;
  assert.ok(network.lost > 10, `messages perdus ${network.lost}`);
  assert.equal(a.desync, undefined);
  assert.equal(b.desync, undefined);
  assert.ok(a.net.tick >= target - TURN_TICKS * 3 && b.net.tick >= target - TURN_TICKS * 3, `pas atteints ${a.net.tick} / ${b.net.tick}`);
  for (const [t, h] of a.hashes) if (b.hashes.has(t)) assert.equal(h, b.hashes.get(t), `état différent au pas ${t}`);
});

test("l'abandon d'un joueur donne la victoire à l'autre chez les deux", () => {
  const { clients } = runMatch({ seed: 5, seconds: 60, resignAt: 400 });
  for (const c of clients) assert.equal(c.game.winner, 0, `vainqueur vu par le joueur ${c.me}`);
});

test('une désynchronisation est détectée', () => {
  const civs = ['francs', 'incas'];
  const queue = [];
  const games = [0, 1].map((me) => createNetGame({ seed: 11, size: 72, civs, me }));
  const nets = games.map((game, me) => new Lockstep({ game, me, send: (m) => queue.push({ to: 1 - me, m: JSON.parse(JSON.stringify(m)) }) }));
  let seen = null;
  nets[0].onDesync = (who, turn) => { seen = { who, turn }; };
  for (let i = 0; i < 400; i++) {
    if (i === 100) games[1].players[1].res.wood += 1; // tricherie : on modifie l'état d'un seul côté
    for (const n of nets) n.step();
    while (queue.length) { const { to, m } = queue.shift(); nets[to].receive(m); }
  }
  assert.ok(seen, 'la désynchronisation aurait dû être signalée');
});

test("un ordre invalide est refusé tout de suite par l'interface", () => {
  const g = createNetGame({ seed: 3, size: 72, civs: ['francs', 'romains'], me: 0 });
  const sent = [];
  const net = new Lockstep({ game: g, me: 0, send: (m) => sent.push(m) });
  const tc = g.buildings.find((b) => b.owner === 0 && b.type === 'town_center');
  const v = g.units.find((u) => u.owner === 0 && u.type === 'villager');
  assert.equal(g.issue(0, { type: 'build', ids: [v.id], building: 'house', tx: tc.tx, ty: tc.ty }), false);
  assert.equal(g.issue(1, { type: 'stop', ids: [] }), false, 'on ne commande pas les unités adverses');
  assert.equal(g.issue(0, { type: 'stop', ids: [v.id] }), true);
  assert.equal(net.pending.length, 1);
});
