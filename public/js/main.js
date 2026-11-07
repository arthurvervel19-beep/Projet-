// Point d'entrée du navigateur : menu (avec démonstration 3D en fond), boucle de jeu, écrans de fin.
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { TICK, CIVS, CIV_IDS, UNITS } from './config.js';
import { Renderer3D, webglAvailable } from './r3d/renderer3d.js';
import { resIconURL, icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const audio = new AudioEngine();
window.__audio = audio;
let state = null;
let demo = null;

function quality() {
  const q = $('opt-quality').value;
  if (q !== '2d' && !webglAvailable()) return '2d';
  return q;
}

// chaque rendu utilise sa propre toile (un contexte WebGL par toile)
function freshCanvas(id) {
  const old = $(id);
  const c = document.createElement('canvas');
  c.id = id;
  old.replaceWith(c);
  return c;
}

function makeRenderer(game, me, q, canvas) {
  let r;
  if (q === '2d') {
    r = new Renderer(canvas, game, me);
    const o = $('overlay'); o.getContext('2d').clearRect(0, 0, o.width, o.height);
  } else {
    r = new Renderer3D(canvas, game, me, { quality: q });
  }
  r.resIconFn = resIconURL;
  return r;
}

// ------------------------------------------------------------------ démonstration du menu
// ------------------------------------------------------------------ civilisations
const civSel = $('opt-civ'), civAiSel = $('opt-civ-ai');
for (const sel of [civSel, civAiSel]) {
  sel.innerHTML = '<option value="random">Aléatoire</option>' + CIV_IDS.map((id) => `<option value="${id}">${CIVS[id].name}</option>`).join('');
}
try { civSel.value = localStorage.getItem('adr_civ') || 'francs'; } catch { civSel.value = 'francs'; }
civAiSel.value = 'random';
const pickCiv = (v, not) => (v === 'random' ? CIV_IDS.filter((c) => c !== not)[Math.floor(Math.random() * (CIV_IDS.length - 1))] : v);

function updateCivCard() {
  const id = civSel.value;
  const card = $('civ-card');
  if (id === 'random') { card.innerHTML = '<div><h4>Civilisation aléatoire</h4><p>Une des six civilisations sera tirée au sort au lancement de la partie.</p></div>'; return; }
  const c = CIVS[id];
  let pics = '';
  if (demo && demo.renderer.icon) {
    const color = demo.game.players[0].color;
    try { pics = `<div class="pics"><img src="${demo.renderer.icon('building', 'town_center', color, id)}" alt=""><img src="${demo.renderer.icon('unit', c.unique, color, id)}" alt=""></div>`; } catch { pics = ''; }
  }
  card.innerHTML = `${pics}<div><h4>${c.name}</h4><p>${c.desc}</p><p><b>Bonus :</b> ${c.bonus}</p><p><b>Unité unique :</b> ${UNITS[c.unique].name} — ${UNITS[c.unique].desc.replace(/^Unité unique [^:]+: /, '')}</p></div>`;
}
civSel.addEventListener('change', () => { try { localStorage.setItem('adr_civ', civSel.value); } catch { /* ignore */ } updateCivCard(); });

function startDemo() {
  const dc = [...CIV_IDS].sort(() => Math.random() - 0.5);
  const game = new Game({ seed: Math.floor(Math.random() * 1e9), size: 72, players: 2, humanPlayer: -1, civs: [dc[0], dc[1]] });
  for (const p of game.players) { p.explored.fill(1); p.visible.fill(1); }
  const ais = game.players.map((p) => new AI(game, p.id, 'difficile'));
  for (let i = 0; i < 20 * 200; i++) { ais.forEach((a) => a.update(TICK)); game.update(TICK); }
  const q = quality() === '2d' ? '2d' : 'medium';
  const renderer = makeRenderer(game, 0, q, freshCanvas('game'));
  const ui = { selected: new Set(), marker: null, placing: null, dragBox: null };
  demo = { game, renderer, ais, ui, t: 0, last: performance.now(), stop: false, a: game.players[0] };
  window.__demo = demo;
  if (renderer.camState) { renderer.camState.dist = 24; renderer.camState.pitch = 0.72; }
  else renderer.cam.zoom = 1.1;
  demo.onResize = () => renderer.resize();
  window.addEventListener('resize', demo.onResize);
  requestAnimationFrame(demoLoop);
  setTimeout(updateCivCard, 50);
}

function demoLoop(now) {
  const d = demo;
  if (!d || d.stop) return;
  const dt = Math.min(0.1, (now - d.last) / 1000);
  d.last = now;
  d.t += dt;
  d.acc = (d.acc || 0) + dt;
  while (d.acc >= TICK) { d.ais.forEach((a) => a.update(TICK)); d.game.update(TICK); d.acc -= TICK; }
  for (const p of d.game.players) p.visible.fill(1);
  const k = d.t * 0.04;
  d.renderer.centerOn(d.a.startX + Math.cos(k) * 6, d.a.startY + Math.sin(k) * 6);
  if (d.renderer.camState) d.renderer.camState.yaw = Math.PI / 4 + Math.sin(d.t * 0.05) * 0.35;
  d.game.events.length = 0;
  d.renderer.draw(Math.min(1, d.acc / TICK), d.ui);
  requestAnimationFrame(demoLoop);
  setTimeout(updateCivCard, 50);
}

function stopDemo() {
  if (!demo) return;
  demo.stop = true;
  window.removeEventListener('resize', demo.onResize);
  if (demo.renderer.dispose) demo.renderer.dispose();
  demo = null;
}

// ------------------------------------------------------------------ partie
function start() {
  audio.init();
  audio.sfxPlay('click');
  const seedInput = $('opt-seed').value;
  const seed = seedInput ? +seedInput : Math.floor(Math.random() * 1e9);
  const size = +$('opt-size').value;
  const rich = $('opt-res').value === 'riche';
  const difficulty = $('opt-diff').value;
  const q = quality();
  const myCiv = pickCiv(civSel.value), aiCiv = pickCiv(civAiSel.value, myCiv);
  $('loading').classList.remove('hidden');
  // laisse le navigateur afficher l'écran de chargement
  setTimeout(() => {
    stopDemo();
    const game = new Game({
      seed, size, players: 2, humanPlayer: 0, civs: [myCiv, aiCiv],
      startRes: rich ? { food: 1000, wood: 1000, gold: 800, stone: 600 } : undefined,
    });
    game.sound = true;
    const renderer = makeRenderer(game, 0, q, freshCanvas('game'));
    const ui = new UI(game, renderer, 0, audio);
    const ai = new AI(game, 1, difficulty);
    const me = game.players[0];
    renderer.centerOn(me.startX + 1, me.startY + 1);
    if (state) { state.stop = true; state.ui.destroy(); if (state.renderer.dispose) state.renderer.dispose(); }
    state = { game, renderer, ui, ai, acc: 0, last: performance.now(), speed: +$('speed').value, paused: false, stop: false, seed };
    ui.onPause = () => setPaused(!state.paused);
    $('menu').classList.add('hidden');
    document.querySelector('.credits').classList.add('hidden');
    $('end').classList.add('hidden');
    $('loading').classList.add('hidden');
    $('topbar').classList.remove('hidden');
    $('bottom').classList.remove('hidden');
    ui.setupMinimap();
    const tc = game.buildings.find((b) => b.owner === 0);
    ui.selected = new Set([tc.id]);
    ui.msg(`${CIVS[myCiv].realm} contre ${CIVS[aiCiv].realm} — carte n°${seed}. Bonne partie !`, 'good');
    audio.setCiv(CIVS[myCiv].music);
    audio.setScene('peace');
    requestAnimationFrame((t) => loop(state, t));
    window.__game = state; // pratique pour le débogage dans la console
  }, 60);
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
  audio.setScene(won ? 'victory' : 'defeat');
  $('end-title').textContent = won ? 'Victoire !' : 'Défaite…';
  const rows = g.players.map((p) => `<tr><td style="color:${p.color}">${p.name}</td><td>${Object.values(p.stats.gathered).reduce((a, b) => a + b, 0)}</td><td>${p.stats.trained}</td><td>${p.stats.built}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.techs.size}</td></tr>`).join('');
  const t = Math.floor(g.time);
  $('end-stats').innerHTML = `<p>Durée : ${Math.floor(t / 60)} min ${t % 60} s</p>
    <table><tr><th></th><th>Récolté</th><th>Unités</th><th>Bâtiments</th><th>Tués</th><th>Pertes</th><th>Rasés</th><th>Technos</th></tr>${rows}</table>`;
  $('end').classList.remove('hidden');
}

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

function updateMusicBtn() { $('music-btn').classList.toggle('off', audio.muted); }

$('start-btn').addEventListener('click', start);
window.__start = start;
$('again-btn').addEventListener('click', () => {
  $('end').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('topbar').classList.add('hidden');
  $('bottom').classList.add('hidden');
  if (state) { state.stop = true; state.ui.destroy(); if (state.renderer.dispose) state.renderer.dispose(); }
  state = null;
  audio.setScene('menu');
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
$('music-btn').addEventListener('click', (e) => { audio.init(); audio.toggleMute(); updateMusicBtn(); e.currentTarget.blur(); });
$('vol-music').value = audio.musicVol;
$('vol-sfx').value = audio.sfxVol;
$('vol-voice').value = audio.voiceVol;
$('vol-music').addEventListener('input', (e) => audio.setMusicVolume(+e.target.value));
$('vol-sfx').addEventListener('input', (e) => { audio.setSfxVolume(+e.target.value); audio.sfxPlay('select'); });
$('vol-voice').addEventListener('input', (e) => { audio.setVoiceVolume(+e.target.value); audio.voice('villager', 'select', 1); });
$('opt-quality').addEventListener('change', () => { stopDemo(); startDemo(); });
updateMusicBtn();
// la musique démarre au premier geste de l'utilisateur (règle des navigateurs)
window.addEventListener('pointerdown', () => { audio.init(); if (!state) audio.setScene('menu'); }, { once: true });

startDemo();
