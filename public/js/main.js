// Point d'entrée du navigateur : menu (avec partie de démonstration en fond), boucle de jeu, écrans de fin.
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { TICK } from './config.js';

const $ = (id) => document.getElementById(id);
const audio = new AudioEngine();
let state = null;
let demo = null;

// ------------------------------------------------------------------ démonstration du menu
function startDemo() {
  const game = new Game({ seed: Math.floor(Math.random() * 1e9), size: 72, players: 2, humanPlayer: -1 });
  const renderer = new Renderer($('game'), game, 0);
  for (const p of game.players) { p.explored.fill(1); p.visible.fill(1); }
  const ais = game.players.map((p) => new AI(game, p.id, 'difficile'));
  // avance un peu pour montrer une ville déjà développée
  for (let i = 0; i < 20 * 150; i++) { ais.forEach((a) => a.update(TICK)); game.update(TICK); }
  const ui = { selected: new Set(), marker: null, placing: null, dragBox: null };
  const p0 = game.players[0], p1 = game.players[1];
  demo = { game, renderer, ais, ui, t: 0, last: performance.now(), stop: false, a: p0, b: p1 };
  renderer.cam.zoom = 1.1;
  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);
  demo.onResize = onResize;
  requestAnimationFrame(demoLoop);
}

function demoLoop(now) {
  const d = demo;
  if (!d || d.stop) return;
  const dt = Math.min(0.1, (now - d.last) / 1000);
  d.last = now;
  d.t += dt;
  d.acc = (d.acc || 0) + dt;
  while (d.acc >= TICK) { d.ais.forEach((a) => a.update(TICK)); d.game.update(TICK); d.acc -= TICK; }
  // travelling lent autour de la première ville
  const k = d.t * 0.05;
  d.renderer.centerOn(d.a.startX + Math.cos(k) * 7, d.a.startY + Math.sin(k) * 7);
  d.game.events.length = 0;
  d.renderer.draw(Math.min(1, d.acc / TICK), d.ui);
  requestAnimationFrame(demoLoop);
}

function stopDemo() {
  if (!demo) return;
  demo.stop = true;
  window.removeEventListener('resize', demo.onResize);
  demo = null;
}

// ------------------------------------------------------------------ partie
function start() {
  audio.init();
  audio.sfxPlay('click');
  stopDemo();
  const seedInput = $('opt-seed').value;
  const seed = seedInput ? +seedInput : Math.floor(Math.random() * 1e9);
  const size = +$('opt-size').value;
  const rich = $('opt-res').value === 'riche';
  const difficulty = $('opt-diff').value;
  const game = new Game({
    seed, size, players: 2, humanPlayer: 0,
    startRes: rich ? { food: 1000, wood: 1000, gold: 800, stone: 600 } : undefined,
  });
  game.sound = true;
  const renderer = new Renderer($('game'), game, 0);
  const ui = new UI(game, renderer, 0, audio);
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
  audio.sfxPlay(won ? 'victory' : 'defeat');
  $('end-title').textContent = won ? 'Victoire !' : 'Défaite…';
  const rows = g.players.map((p) => `<tr><td style="color:${p.color}">${p.name}</td><td>${Object.values(p.stats.gathered).reduce((a, b) => a + b, 0)}</td><td>${p.stats.trained}</td><td>${p.stats.built}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.techs.size}</td></tr>`).join('');
  const t = Math.floor(g.time);
  $('end-stats').innerHTML = `<p>Durée : ${Math.floor(t / 60)} min ${t % 60} s</p>
    <table><tr><th></th><th>Récolté</th><th>Unités</th><th>Bâtiments</th><th>Tués</th><th>Pertes</th><th>Rasés</th><th>Technos</th></tr>${rows}</table>`;
  $('end').classList.remove('hidden');
}

function updateMusicBtn() { $('music-btn').textContent = audio.muted ? '🔇' : '♫'; }

$('start-btn').addEventListener('click', start);
$('again-btn').addEventListener('click', () => {
  $('end').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('topbar').classList.add('hidden');
  $('bottom').classList.add('hidden');
  if (state) state.stop = true;
  state = null;
  startDemo();
});
$('resume-btn').addEventListener('click', () => setPaused(false));
$('pause-btn').addEventListener('click', () => setPaused(!state.paused));
$('quit-btn').addEventListener('click', () => {
  setPaused(false);
  if (!state) return;
  state.game.players[0].defeated = true;
  state.game.winner = 1;
});
$('speed').addEventListener('change', (e) => { if (state) state.speed = +e.target.value; e.target.blur(); });
$('music-btn').addEventListener('click', (e) => { audio.init(); audio.toggleMute(); updateMusicBtn(); e.target.blur(); });
$('vol-music').value = audio.musicVol;
$('vol-sfx').value = audio.sfxVol;
$('vol-music').addEventListener('input', (e) => audio.setMusicVolume(+e.target.value));
$('vol-sfx').addEventListener('input', (e) => { audio.setSfxVolume(+e.target.value); audio.sfxPlay('select'); });
updateMusicBtn();
// la musique démarre au premier geste de l'utilisateur (règle des navigateurs)
window.addEventListener('pointerdown', () => audio.init(), { once: true });

startDemo();
