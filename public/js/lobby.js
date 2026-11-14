// Menu « En ligne » : pseudo, création d'un salon, entrée par code, salle d'attente, lancement.
import { connect, myUid, createRoom, joinRoom, startRoom, Room } from './online.js';
import { NET_VERSION } from './online-config.js';
import { CIVS, CIV_IDS, PLAYER_COLORS } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CODE_RE = /^[A-Z2-9]{5}$/;
const MAX_PLAYERS = 2;

export function setupLobby({ getSettings, onStart }) {
  let room = null;
  let uid = null;
  let hostUid = null;
  let busy = false;
  let started = false;
  let players = null; // ordre des joueurs fixé par l'hôte au lancement
  let startMsg = null;
  let waitingGo = new Set();
  let resendTimer = null;
  let netHandler = null;
  let netBuffer = [];
  let lastSeen = new Map(); // uid -> dernière fois vu présent (ms)
  let enteredAt = 0;
  const HOST_GONE = 'L\'hôte n\'est plus dans le salon.';

  // ---------------------------------------------------------------- pseudo
  const nameInput = $('mp-name');
  const stored = (() => { try { return localStorage.getItem('adr_name'); } catch { return null; } })();
  nameInput.value = stored || `Joueur ${10 + Math.floor(Math.random() * 90)}`;
  const myName = () => (nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 16) || 'Joueur');
  nameInput.addEventListener('change', () => {
    try { localStorage.setItem('adr_name', myName()); } catch { /* stockage indisponible */ }
    if (room) room.update({ name: myName() });
  });

  // ---------------------------------------------------------------- onglets Solo / En ligne
  const setMode = (online) => {
    document.body.classList.toggle('online', online);
    $('tab-solo').classList.toggle('on', !online);
    $('tab-online').classList.toggle('on', online);
    $('tab-solo').setAttribute('aria-selected', String(!online));
    $('tab-online').setAttribute('aria-selected', String(online));
    try { localStorage.setItem('adr_mode', online ? 'online' : 'solo'); } catch { /* ignore */ }
    if (online) connect().catch((e) => status(e.message, true)); // prépare la connexion
  };
  $('tab-solo').addEventListener('click', () => { if (!room) setMode(false); else status('Quittez le salon pour jouer en solo.'); });
  $('tab-online').addEventListener('click', () => setMode(true));
  try { if (localStorage.getItem('adr_mode') === 'online') setMode(true); } catch { /* ignore */ }

  function status(text, err = false) {
    const el = $('mp-status');
    el.textContent = text || '';
    el.classList.toggle('err', !!err);
  }

  // ---------------------------------------------------------------- entrée dans un salon
  const codeInput = $('mp-code');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('mp-join').click(); });

  async function enter(code, isCreator) {
    uid = await myUid();
    const info = await joinRoom(code); // vérifie l'accès (et nous inscrit si on vient d'arriver)
    hostUid = info.hote;
    if (info.statut !== 'attente' && !isCreator) throw new Error('La partie de ce salon a déjà commencé.');
    room = new Room(info.code, uid, { name: myName(), civ: getSettings().civ });
    room.onMembers = renderMembers;
    room.onMessage = onMessage;
    room.onStatus = (st) => {
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') status('Connexion instable… reconnexion en cours.', true);
      else if (st === 'SUBSCRIBED') status(started ? '' : isHost() ? 'Salon prêt. Donnez le code à votre adversaire.' : 'Connecté. En attente du lancement par l\'hôte.');
    };
    await room.open();
    document.body.classList.toggle('mp-guest', !isHost());
    $('mp-home').classList.add('hidden');
    $('mp-lobby').classList.remove('hidden');
    $('mp-code-show').textContent = room.code;
    $('mp-start').classList.toggle('hidden', !isHost());
    $('mp-hint').textContent = isHost()
      ? 'Vous êtes l\'hôte : vous choisissez la taille de la carte et les ressources.'
      : 'L\'hôte choisit la carte et les ressources. Choisissez votre civilisation.';
    enteredAt = Date.now();
    renderMembers(room.members());
    $('mp-lobby').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const isHost = () => uid && uid === hostUid;

  async function guarded(fn) {
    if (busy) return;
    busy = true;
    $('mp-create').disabled = true; $('mp-join').disabled = true;
    try { await fn(); } catch (e) {
      status(e.message || String(e), true);
      if (room) { await room.close(); room = null; }
    } finally {
      busy = false;
      $('mp-create').disabled = false; $('mp-join').disabled = false;
    }
  }

  $('mp-create').addEventListener('click', () => guarded(async () => {
    status('Création du salon…');
    const code = await createRoom();
    await enter(code, true);
  }));

  $('mp-join').addEventListener('click', () => guarded(async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!CODE_RE.test(code)) { status('Le code fait 5 caractères (lettres et chiffres).', true); return; }
    status('Connexion au salon…');
    await enter(code, false);
  }));

  $('mp-leave').addEventListener('click', () => leave());

  $('mp-share').addEventListener('click', async () => {
    if (!room) return;
    const text = `Rejoins-moi sur Aube des Royaumes ! Onglet « En ligne », code du salon : ${room.code}`;
    const url = location.origin + location.pathname + `?salon=${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Aube des Royaumes', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); status('Invitation copiée : collez-la dans un message.'); }
    } catch { /* partage annulé */ }
  });

  // lien d'invitation : ?salon=CODE pré-remplit le code
  const inviteCode = new URLSearchParams(location.search).get('salon');
  if (inviteCode && CODE_RE.test(inviteCode.toUpperCase())) {
    codeInput.value = inviteCode.toUpperCase();
    setMode(true);
    status('Code d\'invitation prêt : choisissez votre pseudo puis « Rejoindre ».');
  }

  // la civilisation choisie est visible des autres joueurs
  $('opt-civ').addEventListener('change', () => { if (room) room.update({ civ: getSettings().civ }); });

  // ---------------------------------------------------------------- salle d'attente
  function ordered(members) {
    // l'hôte d'abord, puis les autres par ordre d'arrivée
    return [...members].sort((a, b) => (a.uid === hostUid ? -1 : b.uid === hostUid ? 1 : (a.at || 0) - (b.at || 0)));
  }

  function renderMembers(members) {
    const now = Date.now();
    for (const m of members) lastSeen.set(m.uid, now);
    if (started) return;
    const list = ordered(members);
    const civName = (c) => (c === 'random' || !CIVS[c] ? 'Aléatoire' : CIVS[c].name);
    let html = list.map((m, i) => `<li><span class="dot" style="background:${PLAYER_COLORS[i] || '#888'}"></span><span class="who">${esc(m.name || 'Joueur')}</span>${m.uid === hostUid ? '<span class="tag">hôte</span>' : ''}${m.uid === uid ? '<span class="tag">vous</span>' : ''}<span class="civ">${esc(civName(m.civ))}</span></li>`).join('');
    for (let i = list.length; i < MAX_PLAYERS; i++) html += '<li class="empty">En attente d\'un joueur…</li>';
    $('mp-players').innerHTML = html;
    const ready = list.length >= 2 && list.length <= MAX_PLAYERS;
    $('mp-start').disabled = !ready;
    if (!isHost() && room) {
      const hostHere = list.some((m) => m.uid === hostUid);
      // la liste de présence peut arriver en plusieurs fois : on laisse quelques secondes avant d'alerter
      if (!hostHere && Date.now() - enteredAt > 5000) status(HOST_GONE, true);
      else if (hostHere && $('mp-status').textContent === HOST_GONE) status('Connecté. En attente du lancement par l\'hôte.');
    }
    if (isHost() && list.length > MAX_PLAYERS) status('Trop de joueurs dans le salon.', true);
  }

  $('mp-start').addEventListener('click', () => guarded(async () => {
    if (!room || !isHost() || started) return;
    const list = ordered(room.members());
    if (list.length < 2) { status('Il faut un deuxième joueur.', true); return; }
    await startRoom(room.code); // ferme le salon aux nouveaux venus
    const s = getSettings();
    // les civilisations « aléatoires » sont tirées par l'hôte pour que tout le monde ait la même
    const taken = new Set(list.map((m) => m.civ).filter((c) => CIVS[c]));
    const ps = list.slice(0, MAX_PLAYERS).map((m) => {
      let civ = m.civ;
      if (!CIVS[civ]) {
        const free = CIV_IDS.filter((c) => !taken.has(c));
        civ = (free.length ? free : CIV_IDS)[Math.floor(Math.random() * (free.length || CIV_IDS.length))];
        taken.add(civ);
      }
      return { uid: m.uid, name: String(m.name || 'Joueur').slice(0, 16), civ };
    });
    startMsg = { k: 'start', v: NET_VERSION, seed: Math.floor(Math.random() * 1e9), size: s.size, rich: s.rich, players: ps };
    waitingGo = new Set(ps.filter((p) => p.uid !== uid).map((p) => p.uid));
    room.send(startMsg);
    // on répète l'annonce jusqu'à ce que chacun ait confirmé
    let tries = 0;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      if (!waitingGo.size || ++tries > 20 || !room) { clearInterval(resendTimer); return; }
      room.send(startMsg);
    }, 800);
    launch(startMsg);
  }));

  function launch(msg) {
    started = true;
    players = msg.players;
    const me = players.findIndex((p) => p.uid === uid);
    status('');
    onStart({ seed: msg.seed, size: msg.size, rich: msg.rich, players, me });
  }

  function onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'start') {
      if (m.v !== NET_VERSION) { status('Votre version du jeu est différente de celle de l\'hôte : rechargez la page.', true); return; }
      if (!Array.isArray(m.players) || !m.players.some((p) => p.uid === uid)) return;
      room.send({ k: 'go', uid });
      if (!started) launch(m);
      return;
    }
    if (m.k === 'go') { waitingGo.delete(m.uid); return; }
    if (m.k === 't' || m.k === 'r' || m.k === 'n') {
      if (netHandler) netHandler(m); else netBuffer.push(m);
    }
  }

  async function leave() {
    clearInterval(resendTimer);
    const r = room;
    room = null; started = false; players = null; hostUid = null; netHandler = null; netBuffer = []; lastSeen = new Map();
    document.body.classList.remove('mp-guest');
    $('mp-lobby').classList.add('hidden');
    $('mp-home').classList.remove('hidden');
    $('mp-start').disabled = true;
    status('');
    if (r) await r.close();
  }

  return {
    send: (m) => { if (room) room.send(m); },
    set onNet(fn) { netHandler = fn; const b = netBuffer; netBuffer = []; if (fn) b.forEach(fn); },
    // le joueur n° i est-il encore connecté ? (absent depuis plus de ms millisecondes = parti)
    present(i, ms = 15000) {
      if (!room || !players || !players[i]) return false;
      if (room.members().some((m) => m.uid === players[i].uid)) { lastSeen.set(players[i].uid, Date.now()); return true; }
      return Date.now() - (lastSeen.get(players[i].uid) || 0) < ms;
    },
    leave,
  };
}
