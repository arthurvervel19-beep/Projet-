// Point d'entrée du navigateur : menu, boucle de jeu, écrans de fin.
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { TICK } from './config.js';

const $ = (id) => document.getElementById(id);
let state = null;

function start() {
  const seedInput = $('opt-seed').value;
  const seed = seedInput ? +seedInput : Math.floor(Math.random() * 1e9);
  const size = +$('opt-size').value;
  const rich = $('opt-res').value === 'riche';
  const difficulty = $('opt-diff').value;
  const game = new Game({
    seed, size, players: 2, humanPlayer: 0,
    startRes: rich ? { food: 1000, wood: 1000, gold: 800, stone: 600 } : undefined,
  });
  const renderer = new Renderer($('game'), game, 0);
  const ui = new UI(game, renderer, 0);
  const ai = new AI(game, 1, difficulty);
  const me = game.players[0];
  renderer.centerOn(me.startX, me.startY + 2);
  if (state) state.stop = true;
  state = { game, renderer, ui, ai, acc: 0, last: performance.now(), speed: +$('speed').value, paused: false, stop: false, seed };
  ui.onPause = () => setPaused(!state.paused);
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('bottom').classList.remove('hidden');
  ui.setupMinimap();
  const tc = game.buildings.find((b) => b.owner === 0);
  ui.selected = new Set([tc.id]);
  ui.msg(`Bienvenue ! Carte n°${seed}. Formez des villageois et développez votre royaume.`, 'good');
  requestAnimationFrame((t) => loop(state, t));
  window.__game = state; // pratique pour le débogage dans la console
}

function setPaused(p) {
  if (!state) return;
  state.paused = p;
  state.ui.paused = p;
  $('pause').classList.toggle('hidden', !p);
}

function loop(s, now) {
  if (s.stop) return;
  const dt = Math.min(0.25, (now - s.last) / 1000);
  s.last = now;
  if (!s.paused && s.game.winner === null) {
    s.acc += dt * s.speed;
    let steps = 0;
    while (s.acc >= TICK && steps < 10) {
      s.ai.update(TICK);
      s.game.update(TICK);
      s.acc -= TICK;
      steps++;
    }
  }
  s.ui.update(dt);
  s.renderer.draw(Math.min(1, s.acc / TICK), s.ui);
  if (s.game.winner !== null && !s.ended) { s.ended = true; showEnd(s); }
  requestAnimationFrame((t) => loop(s, t));
}

function showEnd(s) {
  const g = s.game;
  const won = g.winner === 0;
  $('end-title').textContent = won ? 'Victoire !' : 'Défaite…';
  const rows = g.players.map((p) => `<tr><td style="color:${p.color}">${p.name}</td><td>${Object.values(p.stats.gathered).reduce((a, b) => a + b, 0)}</td><td>${p.stats.trained}</td><td>${p.stats.built}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.techs.size}</td></tr>`).join('');
  const t = Math.floor(g.time);
  $('end-stats').innerHTML = `<p>Durée : ${Math.floor(t / 60)} min ${t % 60} s</p>
    <table><tr><th></th><th>Récolté</th><th>Unités</th><th>Bâtiments</th><th>Tués</th><th>Pertes</th><th>Rasés</th><th>Technos</th></tr>${rows}</table>`;
  $('end').classList.remove('hidden');
}

$('start-btn').addEventListener('click', start);
$('again-btn').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); });
$('resume-btn').addEventListener('click', () => setPaused(false));
$('pause-btn').addEventListener('click', () => setPaused(!state.paused));
$('quit-btn').addEventListener('click', () => {
  setPaused(false);
  if (!state) return;
  state.game.players[0].defeated = true;
  state.game.winner = 1;
});
$('speed').addEventListener('change', (e) => { if (state) state.speed = +e.target.value; e.target.blur(); });
