// Sauvegarde : une partie reprise doit continuer exactement comme si elle n'avait pas été interrompue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/game.js';
import { AI } from '../public/js/ai.js';
import { TICK } from '../public/js/config.js';
import { stateHash } from '../public/js/net.js';
import { serializeGame, restoreGame, serializeAI, restoreAI, pack, unpack } from '../public/js/save.js';

function run(game, ais, seconds) {
  for (let i = 0; i < Math.round(seconds / TICK) && game.winner === null; i++) {
    for (const ai of ais) ai.update(TICK);
    game.update(TICK);
  }
}

test('une partie sauvegardée puis reprise continue à l’identique', async () => {
  const g = new Game({ seed: 31, size: 96, players: 2, humanPlayer: 0, civs: ['japonais', 'romains'] });
  const ais = [new AI(g, 0, 'difficile'), new AI(g, 1, 'normal')];
  run(g, ais, 420); // 7 minutes de jeu
  assert.ok(g.units.length > 15, 'la partie doit être bien avancée');

  // sauvegarde (avec compression et caractères spéciaux comme dans le navigateur)
  const data = serializeGame(g, ais[1], { difficulty: 'normal', label: 'test' });
  data.ai0 = serializeAI(ais[0], 'difficile');
  const packed = await pack(data);
  assert.ok(packed.startsWith('G:'), 'compressée');
  const kb = Math.round(packed.length / 1024);
  assert.ok(kb < 600, `taille de la sauvegarde : ${kb} Ko`);

  const back = await unpack(packed);
  const { game: g2, ai: ai1 } = restoreGame(back);
  const ais2 = [restoreAI(g2, back.ai0), ai1];
  assert.equal(stateHash(g2), stateHash(g), 'état identique juste après la reprise');
  assert.equal(g2.players[0].techs.size, g.players[0].techs.size);
  assert.deepEqual([...g2.players[1].researching], [...g.players[1].researching]);

  // les deux parties continuent 3 minutes : elles doivent rester identiques
  run(g, ais, 180);
  run(g2, ais2, 180);
  assert.equal(stateHash(g2), stateHash(g), 'les deux parties ont divergé après la reprise');
  assert.equal(g2.time, g.time);
});

test('une sauvegarde d’une autre version est refusée proprement', () => {
  assert.throws(() => restoreGame({ v: 'ancienne' }), /autre version/);
});
