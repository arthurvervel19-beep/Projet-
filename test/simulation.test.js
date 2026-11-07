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
