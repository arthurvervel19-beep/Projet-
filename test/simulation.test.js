import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/game.js';
import { AI } from '../public/js/ai.js';
import { TICK } from '../public/js/config.js';

function simulate(seed, seconds, difficulty = 'normal') {
  const game = new Game({ seed, size: 96, players: 2, humanPlayer: -1 });
  const ais = game.players.map((p) => new AI(game, p.id, difficulty));
  const steps = Math.round(seconds / TICK);
  for (let i = 0; i < steps && game.winner === null; i++) {
    for (const ai of ais) ai.update(TICK);
    game.update(TICK);
  }
  return game;
}

test('la carte est générée avec deux villes et des ressources', () => {
  const g = new Game({ seed: 42, size: 96, players: 2 });
  assert.equal(g.buildings.filter((b) => b.type === 'town_center').length, 2);
  assert.equal(g.units.length, 8);
  for (const t of ['tree', 'gold', 'stone', 'berries']) assert.ok(g.resources.some((r) => r.type === t), t);
  assert.equal(g.players[0].popCap, 5);
});

test('un villageois récolte et rapporte des ressources', () => {
  const g = new Game({ seed: 7, size: 64, players: 2 });
  const v = g.units.find((u) => u.owner === 0 && u.type === 'villager');
  const tc = g.buildings.find((b) => b.owner === 0);
  const berry = g.resources.filter((r) => r.type === 'berries').sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0];
  const before = g.players[0].res.food;
  g.issue(0, { type: 'gather', ids: [v.id], target: berry.id });
  for (let i = 0; i < 60 / TICK; i++) g.update(TICK);
  assert.ok(g.players[0].res.food > before, `nourriture ${g.players[0].res.food}`);
});

test('partie avec joueur humain (brouillard actif) sans erreur', () => {
  const g = new Game({ seed: 99, size: 72, players: 2, humanPlayer: 0 });
  const ai = new AI(g, 1, 'difficile');
  for (let i = 0; i < 300 / TICK; i++) { ai.update(TICK); g.update(TICK); }
  assert.ok(g.players[0].explored.some((v) => v === 1));
  assert.ok(g.units.filter((u) => u.owner === 1).length > 8);
});

test('chaque civilisation peut jouer une partie et former son unité unique', async () => {
  const { CIVS, CIV_IDS } = await import('../public/js/config.js');
  for (let k = 0; k < CIV_IDS.length; k += 2) {
    const civs = [CIV_IDS[k], CIV_IDS[k + 1]];
    const g = new Game({ seed: 10 + k, size: 72, players: 2, humanPlayer: -1, civs, startRes: { food: 5000, wood: 5000, gold: 5000, stone: 5000 } });
    assert.deepEqual(g.players.map((p) => p.civ), civs);
    const ais = g.players.map((p) => new AI(g, p.id, 'difficile'));
    for (let i = 0; i < 240 / TICK; i++) { for (const ai of ais) ai.update(TICK); g.update(TICK); }
    for (const p of g.players) {
      p.age = 2;
      const f = g.createBuilding('fortress', p.id, 2 + p.id * 30, 2, true);
      assert.ok(g.issue(p.id, { type: 'train', building: f.id, unit: CIVS[p.civ].unique }), `${p.civ} forme son unité unique`);
      const other = CIV_IDS.find((c) => c !== p.civ);
      assert.equal(g.issue(p.id, { type: 'train', building: f.id, unit: CIVS[other].unique }), false, 'pas d’unité unique d’une autre civilisation');
    }
  }
});

for (const seed of [1, 2, 3]) {
  test(`IA contre IA (graine ${seed}) : progression économique et militaire`, () => {
    const g = simulate(seed, 16 * 60);
    for (const p of g.players) {
      const vils = g.units.filter((u) => u.owner === p.id && u.type === 'villager').length;
      const army = g.units.filter((u) => u.owner === p.id && u.type !== 'villager').length;
      console.log(`seed ${seed} t=${Math.round(g.time)}s ${p.name}: âge ${p.age} vils ${vils} armée ${army} bâtiments ${g.buildings.filter((b) => b.owner === p.id).length} pop ${p.pop}/${p.popCap} res ${JSON.stringify(p.res)} kills ${p.stats.kills} pertes ${p.stats.losses} techs ${p.techs.size} defeated ${p.defeated}`);
    }
    console.log('winner', g.winner);
    assert.ok(g.players.some((p) => p.age >= 1), 'au moins un joueur a changé d’âge');
    assert.ok(g.players.some((p) => p.stats.kills > 0), 'des combats ont eu lieu');
  });
}

test('les âges avancés : passage jusqu’au Futur et victoire spatiale', () => {
  const R = 300000;
  const g = new Game({ seed: 9, size: 96, players: 2, humanPlayer: -1, civs: ['romains', 'japonais'], startRes: { food: R, wood: R, gold: R, stone: R } });
  const ai = new AI(g, 0, 'normal');
  for (let i = 0; i < 40 * 60 / TICK && g.winner === null; i++) { ai.attacking = false; ai.nextAttack = 1e9; ai.update(TICK); g.update(TICK); }
  assert.equal(g.players[0].age, 7, 'âge du Futur atteint');
  assert.equal(g.winner, 0);
  assert.equal(g.victoryReason, 'space');
});

test('unités aériennes, revenus et merveille', async () => {
  const { BUILDINGS, WONDER_TIME } = await import('../public/js/config.js');
  const g = new Game({ seed: 4, size: 72, players: 2, humanPlayer: -1 });
  const [p0, p1] = g.players;
  p0.age = 7; p1.age = 7;
  // un avion ne peut pas être attaqué au corps à corps, mais par une unité à distance
  const plane = g.createUnit('bomber', 1, 30, 30);
  const sword = g.createUnit('champion', 0, 31, 30);
  const gun = g.createUnit('soldier', 0, 29, 31);
  assert.equal(g.issue(0, { type: 'attack', ids: [sword.id], target: plane.id }), true);
  assert.equal(sword.order, null, 'la mêlée ignore les avions');
  g.issue(0, { type: 'attack', ids: [gun.id], target: plane.id });
  assert.equal(gun.order.kind, 'attack');
  // la banque produit de l'or en continu
  const bank = g.createBuilding('bank', 0, 5, 5, true);
  const gold = p0.res.gold;
  for (let i = 0; i < 10 / TICK; i++) g.update(TICK);
  assert.ok(p0.res.gold > gold + 8, 'or produit par la banque');
  void bank;
  // une seule merveille, et victoire après le compte à rebours
  const w = g.createBuilding('wonder', 0, 10, 40, true);
  assert.equal(g.canPlace(0, 'wonder', 20, 50), false);
  assert.ok(Math.abs(w.countdown - WONDER_TIME) < 1);
  for (let i = 0; i < (WONDER_TIME + 5) / TICK && g.winner === null; i++) g.update(TICK);
  assert.equal(g.winner, 0);
  assert.equal(g.victoryReason, 'wonder');
  void BUILDINGS;
});

test('les portes laissent passer leur propriétaire et bloquent l’ennemi', async () => {
  const { TERRAIN } = await import('../public/js/config.js');
  const g = new Game({ seed: 5, size: 64, players: 2, humanPlayer: -1 });
  const W = g.map.w;
  // une colonne libre, transformée en rempart sur toute la hauteur de la carte
  let cx = 32;
  const bandFree = (c) => { for (let y = 0; y < W; y++) for (let x = c - 3; x <= c + 3; x++) { const e = g.entities.get(g.map.occ[y * W + x]); if (e && e.kind === 'building') return false; } return true; };
  while (!bandFree(cx)) cx++;
  for (let y = 0; y < W; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    const i = y * W + x;
    const e = g.entities.get(g.map.occ[i]);
    if (e && e.kind === 'resource') g.removeEntity(e);
    g.map.terrain[i] = TERRAIN.GRASS;
  }
  for (const u of g.units) if (Math.abs(u.x - cx) < 4) g.removeEntity(u);
  g.cleanup();
  const gy = 32;
  for (let y = 0; y < W; y++) if (y !== gy) g.createBuilding('stone_wall', 0, cx, y, true);
  // la porte se pose sur un segment de mur existant
  g.createBuilding('stone_wall', 0, cx, gy, true);
  const vil = g.createUnit('villager', 0, cx - 1.5, gy + 0.5);
  g.players[0].age = 1;
  g.players[0].res.stone = 500;
  assert.equal(g.canPlace(0, 'gate', cx, gy), true, 'porte sur la muraille');
  assert.equal(g.canPlace(1, 'gate', cx, gy), false, 'pas sur la muraille adverse');
  const gate = g.issue(0, { type: 'build', ids: [vil.id], building: 'gate', tx: cx, ty: gy });
  assert.ok(gate && gate.type === 'gate');
  for (let i = 0; i < 40 / TICK && !gate.built; i++) g.update(TICK);
  assert.ok(gate.built, 'porte construite');
  // nos unités traversent
  const mine = g.createUnit('spearman', 0, cx - 2.5, gy + 0.5);
  g.issue(0, { type: 'move', ids: [mine.id], x: cx + 3.5, y: gy + 0.5 });
  for (let i = 0; i < 15 / TICK; i++) g.update(TICK);
  assert.ok(mine.x > cx + 2, `l’unité alliée a franchi la porte (${mine.x.toFixed(1)})`);
  // l'ennemi est bloqué
  const foe = g.createUnit('spearman', 1, cx + 3.5, gy - 3.5);
  g.issue(1, { type: 'move', ids: [foe.id], x: cx - 3.5, y: gy - 3.5 });
  for (let i = 0; i < 15 / TICK; i++) g.update(TICK);
  assert.ok(foe.x > cx + 0.9, `l’ennemi reste dehors (${foe.x.toFixed(1)})`);
  // verrouillée, la porte bloque aussi son propriétaire
  g.issue(0, { type: 'gateLock', building: gate.id, locked: true });
  g.issue(0, { type: 'move', ids: [mine.id], x: cx - 3.5, y: gy + 0.5 });
  for (let i = 0; i < 10 / TICK; i++) g.update(TICK);
  assert.ok(mine.x > cx + 0.9, 'porte verrouillée');
  g.issue(0, { type: 'gateLock', building: gate.id, locked: false });
  g.issue(0, { type: 'move', ids: [mine.id], x: cx - 3.5, y: gy + 0.5 });
  for (let i = 0; i < 12 / TICK; i++) g.update(TICK);
  assert.ok(mine.x < cx - 1, 'porte rouverte');
  g.removeEntity(mine); g.cleanup();
  // en attaque-mouvement, l'ennemi s'attaque au rempart qui le bloque
  const hp = gate.hp;
  const rams = [0, 1, 2].map((k) => g.createUnit('champion', 1, cx + 2.5, gy - 1 + k));
  g.issue(1, { type: 'move', ids: rams.map((u) => u.id), x: cx - 6, y: gy + 0.5, aggressive: true });
  for (let i = 0; i < 30 / TICK; i++) g.update(TICK);
  const walls = g.buildings.filter((b) => b.owner === 0 && (b.type === 'stone_wall' || b.type === 'gate'));
  assert.ok(gate.hp < hp || gate.dead || walls.some((w) => w.hp < w.maxHp), 'le rempart est attaqué');
});
