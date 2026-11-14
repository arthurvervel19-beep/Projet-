// Salons en ligne : compte anonyme, création / entrée par code, canal temps réel privé.
// Supabase n'est chargé qu'au premier usage du mode en ligne (le jeu solo reste hors connexion).
import { SUPABASE_URL, SUPABASE_KEY } from './online-config.js';

let client = null;
let connecting = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Impossible de charger le module en ligne. Vérifiez la connexion internet.'));
    document.head.appendChild(s);
  });
}

// messages d'erreur du serveur traduits pour le joueur
function readable(error) {
  const m = (error && (error.message || String(error))) || 'Erreur inconnue';
  if (/anonymous/i.test(m)) return 'Les connexions invitées ne sont pas activées sur le serveur.';
  if (/fetch|network|Failed to/i.test(m)) return 'Pas de connexion au serveur. Vérifiez internet.';
  if (/introuvable/.test(m)) return 'Aucun salon avec ce code.';
  if (/complet/.test(m)) return 'Ce salon est complet.';
  if (/commencé/.test(m)) return 'La partie de ce salon a déjà commencé.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques minutes.';
  return m;
}

export async function connect() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    if (!window.supabase) await loadScript('vendor/supabase.js');
    const c = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'adr-auth' },
    });
    let { data: { session } } = await c.auth.getSession();
    if (!session) {
      const { data, error } = await c.auth.signInAnonymously();
      if (error) throw new Error(readable(error));
      session = data.session;
    }
    await c.realtime.setAuth();
    client = c;
    return c;
  })();
  try { return await connecting; } catch (e) { connecting = null; throw e; }
}

export async function myUid() {
  const c = await connect();
  const { data } = await c.auth.getSession();
  return data.session ? data.session.user.id : null;
}

async function rpc(name, args) {
  const c = await connect();
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(readable(error));
  return data;
}

export const createRoom = () => rpc('creer_salon');
export const joinRoom = (code) => rpc('rejoindre_salon', { p_code: code });
export const startRoom = (code) => rpc('lancer_salon', { p_code: code });
export const leaveRoomRpc = (code) => rpc('quitter_salon', { p_code: code });

// Canal temps réel d'un salon : présence des joueurs + messages diffusés
export class Room {
  constructor(code, uid, info) {
    this.code = code;
    this.uid = uid;
    this.info = info; // { name, civ } : ce que les autres voient de moi
    this.onMessage = null;
    this.onMembers = null;
    this.onStatus = null;
    this.channel = null;
    this.closed = false;
  }

  async open() {
    const c = await connect();
    const ch = c.channel(`salon:${this.code}`, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.uid } },
    });
    this.channel = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (this.onMessage) this.onMessage(payload); });
    ch.on('presence', { event: 'sync' }, () => { if (this.onMembers) this.onMembers(this.members()); });
    await new Promise((resolve, reject) => {
      let first = true;
      ch.subscribe(async (status, err) => {
        if (this.closed) return;
        if (status === 'SUBSCRIBED') {
          // à chaque (re)connexion, on se signale à nouveau
          try { await ch.track({ ...this.info, at: Date.now() }); } catch { /* réessayé à la prochaine connexion */ }
          if (first) { first = false; resolve(); }
        } else if (first && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          first = false;
          reject(new Error(err ? readable(err) : 'Connexion au salon impossible.'));
        }
        if (this.onStatus) this.onStatus(status);
      });
    });
  }

  // joueurs présents dans le salon
  members() {
    if (!this.channel) return [];
    const st = this.channel.presenceState();
    return Object.entries(st).map(([uid, metas]) => ({ uid, ...(metas[metas.length - 1] || {}) }));
  }

  async update(info) {
    this.info = { ...this.info, ...info };
    if (this.channel) { try { await this.channel.track({ ...this.info, at: Date.now() }); } catch { /* hors ligne */ } }
  }

  send(payload) {
    if (this.channel && !this.closed) this.channel.send({ type: 'broadcast', event: 'm', payload });
  }

  async close(leave = true) {
    if (this.closed) return;
    this.closed = true;
    try { if (this.channel) { await this.channel.untrack(); await client.removeChannel(this.channel); } } catch { /* déjà fermé */ }
    if (leave) { try { await leaveRoomRpc(this.code); } catch { /* le ménage automatique s'en chargera */ } }
  }
}
