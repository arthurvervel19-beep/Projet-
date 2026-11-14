// Point d'entrée du navigateur : menu (avec démonstration 3D en fond), boucle de jeu, écrans de fin.
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { TICK, CIVS, CIV_IDS, UNITS } from './config.js';
import { Renderer3D, webglAvailable } from './r3d/renderer3d.js';
import { resIconURL, icon } from './icons.js';
import { Lockstep, createNetGame } from './net.js';
import { setupLobby } from './lobby.js';

const $ = (id) => document.getElementById(id);
window.__adrReady = true; // le jeu a démarré (voir le message de secours dans index.html)
const audio = new AudioEngine();
window.__audio = audio;
let state = null;
let demo = null;

// appareil tactile (téléphone, tablette) : interface et réglages adaptés ; « ?tactile » force ce mode
const isTouch = new URLSearchParams(location.search).has('tactile') || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (isTouch) document.body.classList.add('touch');
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };
{
  const q = stored('adr_quality');
  $('opt-quality').value = q && [...$('opt-quality').options].some((o) => o.value === q) ? q : isTouch ? 'mobile' : 'high';
  if (isTouch) $('opt-size').value = '72';
}

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
const RICH_START = { food: 1000, wood: 1000, gold: 800, stone: 600 };
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
  for (let i = 0; i < 20 * (isTouch ? 70 : 200); i++) { ais.forEach((a) => a.update(TICK)); game.update(TICK); }
  const q = quality() === '2d' ? '2d' : isTouch || quality() === 'mobile' || quality() === 'low' ? 'mobile' : 'medium';
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
}

function stopDemo() {
  if (!demo) return;
  demo.stop = true;
  window.removeEventListener('resize', demo.onResize);
  if (demo.renderer.dispose) demo.renderer.dispose();
  demo = null;
}

// ------------------------------------------------------------------ partie
// plein écran en paysage sur téléphone (inutile dans l'application Android, déjà en plein écran)
function goFullscreen() {
  if (!isTouch || window.AndroidApp) return;
  try {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch { /* verrouillage refusé */ } };
    if (p && p.then) p.then(lock).catch(() => {}); else lock();
  } catch { /* plein écran refusé */ }
}

function start() {
  audio.init();
  audio.sfxPlay('click');
  goFullscreen();
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
      startRes: rich ? RICH_START : undefined,
    });
    const ai = new AI(game, 1, difficulty);
    beginGame({ game, me: 0, ai, seed, q, civ: myCiv, intro: `${CIVS[myCiv].realm} contre ${CIVS[aiCiv].realm} — carte n°${seed}. Bonne partie !` });
  }, 60);
}

// ------------------------------------------------------------------ partie en ligne
const lobby = setupLobby({
  getSettings: () => ({ civ: civSel.value, size: +$('opt-size').value, rich: $('opt-res').value === 'riche' }),
  onStart: startOnline,
});

function startOnline({ seed, size, rich, players, me }) {
  audio.init();
  audio.sfxPlay('click');
  goFullscreen();
  $('loading').classList.remove('hidden');
  setTimeout(() => {
    stopDemo();
    const civs = players.map((p) => p.civ), names = players.map((p) => p.name);
    const game = createNetGame({ seed, size, civs, names, me, startRes: rich ? RICH_START : undefined });
    const net = new Lockstep({ game, me, names, send: (m) => lobby.send(m) });
    lobby.onNet = (m) => net.receive(m);
    beginGame({ game, me, net, seed, q: quality(), civ: civs[me], intro: `${names.join(' contre ')} — bonne partie !` });
  }, 60);
}

// mise en place commune aux parties solo et en ligne
function beginGame({ game, me, ai = null, net = null, seed, q, civ, intro }) {
  game.sound = true;
  const renderer = makeRenderer(game, me, q, freshCanvas('game'));
  const ui = new UI(game, renderer, me, audio);
  renderer.onAdapt = () => ui.msg('Affichage allégé pour garder un jeu fluide.');
  const mine = game.players[me];
  renderer.centerOn(mine.startX + 1, mine.startY + 1);
  if (state) { state.stop = true; state.ui.destroy(); if (state.renderer.dispose) state.renderer.dispose(); }
  state = { game, renderer, ui, ai, net, me, acc: 0, last: performance.now(), speed: net ? 1 : +$('speed').value, paused: false, stop: false, seed };
  ui.onPause = () => setPaused(!state.paused);
  document.body.classList.toggle('in-mp', !!net);
  $('pause-title').textContent = net ? 'Menu' : 'Pause';
  $('pause-note').classList.toggle('hidden', !net);
  $('quit-btn').textContent = 'Abandonner la partie';
  if (net) net.onDesync = (who) => ui.msg(`Attention : votre partie et celle de ${who} ne sont plus identiques.`, 'alert');
  $('menu').classList.add('hidden');
  document.querySelector('.credits').classList.add('hidden');
  $('end').classList.add('hidden');
  $('loading').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('bottom').classList.remove('hidden');
  ui.setupMinimap();
  const tc = game.buildings.find((b) => b.owner === me && b.type === 'town_center') || game.buildings.find((b) => b.owner === me);
  if (tc) ui.selected = new Set([tc.id]);
  ui.msg(intro, 'good');
  audio.setCiv(CIVS[civ].music);
  audio.setScene('peace');
  requestAnimationFrame((t) => loop(state, t));
  if (net) {
    // en ligne, la partie continue si l'onglet passe en arrière-plan (le navigateur n'y dessine plus d'images)
    const s = state;
    s.bgTimer = setInterval(() => {
      if (s.stop) { clearInterval(s.bgTimer); return; }
      const t = performance.now();
      if (t - s.last > 400) { const dt = Math.min(1, (t - s.last) / 1000); s.last = t; netStep(s, dt); if (s.game.winner !== null && !s.ended) { s.ended = true; showEnd(s); } }
    }, 500);
  }
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
  const dt = Math.min(s.net ? 1 : 0.25, (now - s.last) / 1000);
  s.last = now;
  if (s.net) netStep(s, dt, now);
  else if (!s.paused && s.game.winner === null) {
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

// en ligne : la partie n'avance que si les ordres de tous les joueurs sont arrivés
function netStep(s, dt) {
  const net = s.net;
  if (s.game.winner === null) {
    s.acc += dt * (net.lag() > 2 ? 1.6 : 1); // un peu plus vite si l'on est en retard sur les autres
    let steps = 0;
    while (s.acc >= TICK && steps < 40) {
      if (!net.step()) { s.acc = Math.min(s.acc, TICK); break; }
      s.acc -= TICK;
      steps++;
    }
  }
  // bandeau d'attente quand un joueur ne répond plus
  const p = s.game.winner === null ? net.waitingPlayer() : -1;
  const box = $('mp-wait');
  box.classList.toggle('hidden', p < 0);
  if (p >= 0) {
    const gone = !lobby.present(p);
    const text = gone ? `${net.names[p]} semble avoir quitté la partie.` : `En attente de ${net.names[p]}…`;
    if ($('mp-wait-text').textContent !== text) $('mp-wait-text').textContent = text;
    $('mp-wait-end').classList.toggle('hidden', !gone);
  }
}

$('mp-wait-end').addEventListener('click', () => {
  if (!state || !state.net || state.game.winner !== null) return;
  state.game.winner = state.me;
  state.game.victoryReason = 'left';
  $('mp-wait').classList.add('hidden');
});

function showEnd(s) {
  const g = s.game;
  const won = g.winner === s.me;
  if (s.net) $('mp-wait').classList.add('hidden');
  if (s.net && won && !g.victoryReason && g.players.some((p) => p.resigned)) g.victoryReason = 'resign';
  audio.sfxPlay(won ? 'victory' : 'defeat');
  audio.setScene(won ? 'victory' : 'defeat');
  const reasons = { space: ' — victoire scientifique', wonder: ' — victoire par la merveille', resign: ' — votre adversaire a abandonné', left: ' — votre adversaire a quitté la partie' };
  const reason = reasons[g.victoryReason] || '';
  $('end-title').textContent = (won ? 'Victoire !' : 'Défaite…');
  $('end-stats').dataset.reason = reason;
  const rows = g.players.map((p) => `<tr><td style="color:${p.color}">${p.name}</td><td>${Object.values(p.stats.gathered).reduce((a, b) => a + b, 0)}</td><td>${p.stats.trained}</td><td>${p.stats.built}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.techs.size}</td></tr>`).join('');
  const t = Math.floor(g.time);
  $('end-stats').innerHTML = `<p>${g.players[g.winner] ? g.players[g.winner].name : ''}${reason}</p><p>Durée : ${Math.floor(t / 60)} min ${t % 60} s</p>
    <table><tr><th></th><th>Récolté</th><th>Unités</th><th>Bâtiments</th><th>Tués</th><th>Pertes</th><th>Rasés</th><th>Technos</th></tr>${rows}</table>`;
  $('end').classList.remove('hidden');
}

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

function updateMusicBtn() { $('music-btn').classList.toggle('off', audio.muted); }

$('start-btn').addEventListener('click', start);
window.__start = start;
$('again-btn').addEventListener('click', () => {
  if (state && state.net) { lobby.leave(); document.body.classList.remove('in-mp'); }
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
  if (!state || state.game.winner !== null) return;
  if (state.net) {
    // en ligne : l'abandon est transmis et appliqué au même moment chez tous les joueurs
    state.net.resign();
    state.ui.msg('Abandon envoyé…', 'warn');
    return;
  }
  state.game.players[0].defeated = true;
  state.game.winner = 1;
});
const setSpeed = (v) => { $('speed').value = v; $('speed-pause').value = v; if (state) state.speed = +v; };
$('speed').addEventListener('change', (e) => { setSpeed(e.target.value); e.target.blur(); });
$('speed-pause').addEventListener('change', (e) => setSpeed(e.target.value));
$('music-btn').addEventListener('click', (e) => { audio.init(); audio.toggleMute(); updateMusicBtn(); e.currentTarget.blur(); });
$('vol-music').value = audio.musicVol;
$('vol-sfx').value = audio.sfxVol;
$('vol-voice').value = audio.voiceVol;
$('vol-music').addEventListener('input', (e) => audio.setMusicVolume(+e.target.value));
$('vol-sfx').addEventListener('input', (e) => { audio.setSfxVolume(+e.target.value); audio.sfxPlay('select'); });
$('vol-voice').addEventListener('input', (e) => { audio.setVoiceVolume(+e.target.value); audio.voice('villager', 'select', 1); });
$('opt-quality').addEventListener('change', () => { store('adr_quality', $('opt-quality').value); stopDemo(); startDemo(); });
updateMusicBtn();
// la musique démarre au premier geste de l'utilisateur (règle des navigateurs)
window.addEventListener('pointerdown', () => { audio.init(); if (!state) audio.setScene('menu'); }, { once: true });

// application en arrière-plan : la partie se met en pause et le son s'arrête
window.__appPause = () => { if (state && !state.net && !state.ended && !state.paused && state.game.winner === null) setPaused(true); audio.suspend(); };
window.__appResume = () => audio.resume();
document.addEventListener('visibilitychange', () => { if (document.hidden) window.__appPause(); else window.__appResume(); });
// touche « retour » d'Android : annuler, puis pause ; « exit » quitte l'application
window.__androidBack = () => {
  if (!state || !$('menu').classList.contains('hidden')) return 'exit';
  if (!$('end').classList.contains('hidden')) { $('again-btn').click(); return 'ok'; }
  if (state.paused) { setPaused(false); return 'ok'; }
  if (state.ui.cancelAll()) { state.ui.hudTimer = 0; return 'ok'; }
  setPaused(true);
  return 'ok';
};

// sur téléphone, le menu s'affiche avant que la démonstration ne se construise
if (isTouch) requestAnimationFrame(() => setTimeout(startDemo, 0)); else startDemo();
