// Moteur audio : musique rock / électro générée en temps réel, bruitages, voix et cris des unités.
// Tout est synthétisé avec la Web Audio API (aucun fichier son, compositions originales).

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  pentaMinor: [0, 3, 5, 7, 10],
  inScale: [0, 1, 5, 7, 8],
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function localGet(k) { try { return localStorage.getItem('adr_' + k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem('adr_' + k, String(v)); } catch { /* ignore */ } }

// Styles musicaux
const STYLES = {
  menu: { bpm: [98, 104], modes: ['aeolian'], roots: [38, 40], kit: 'rock', energy: 0.75 },
  peace: { bpm: [100, 112], modes: ['dorian', 'aeolian'], roots: [45, 43, 41], kit: 'electro', energy: 0.45 },
  build: { bpm: [114, 124], modes: ['aeolian', 'dorian'], roots: [40, 38, 42], kit: 'hybrid', energy: 0.7 },
  battle: { bpm: [142, 158], modes: ['phrygian', 'aeolian'], roots: [40, 38], kit: 'rock', energy: 1 },
  victory: { bpm: [120, 126], modes: ['ionian', 'mixolydian'], roots: [40, 43], kit: 'rock', energy: 0.9 },
  defeat: { bpm: [72, 78], modes: ['aeolian'], roots: [38], kit: 'electro', energy: 0.3 },
};

// Répliques des unités
const LINES = {
  villager: {
    select: ['Oui ?', 'Je vous écoute.', 'Une tâche pour moi ?', 'Me voilà !', 'Hmm ?'],
    order: ['Tout de suite !', "J'y vais.", "D'accord !", "C'est parti.", 'Bien compris.'],
    wood: ['Au bois !', 'Je prends ma hache.'], gold: ["À la mine d'or !", 'De l’or, enfin !'], stone: ['À la carrière !'],
    food: ['Aux champs !', 'On va manger ce soir !'], build: ['Je construis !', 'Au travail !', 'Ce sera solide !'],
    attack: ['Euh… à l’attaque ?', 'Je vais me battre !'], trained: ['Prêt à travailler !', 'À votre service !'],
  },
  infantry: {
    select: ['À vos ordres !', 'Prêt !', 'Commandez !', 'Oui, sire ?'],
    order: ['En avant !', 'Compris !', 'Allons-y !', 'En marche !'],
    attack: ["À l'attaque !", 'Pour le royaume !', 'Pas de quartier !', 'Chargez !'],
    trained: ['Soldat prêt !', 'Mon épée est à vous !'],
  },
  archer: {
    select: ['Arc bandé.', 'Prêt à tirer.', 'Je vise.'],
    order: ['Je me place.', 'En position !', 'Compris.'],
    attack: ['Tirez !', 'Feu à volonté !', 'Une flèche pour toi !'],
    trained: ['Archer prêt !'],
  },
  cavalry: {
    select: ['Mon seigneur ?', 'En selle !', 'Mon cheval piaffe.'],
    order: ['Au galop !', 'Tout de suite !', 'Hue !'],
    attack: ['Chargez !', 'Pour la gloire !', 'Sus à l’ennemi !'],
    trained: ['Cavalier prêt !'],
  },
  siege: {
    select: ['Engin prêt.', 'Chargé et paré.'],
    order: ['On avance, lentement.', 'Poussez !'],
    attack: ['Feu !', 'Abattez ces murs !'],
    trained: ['Engin de siège opérationnel.'],
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = +(localGet('musicVol') ?? 0.6);
    this.sfxVol = +(localGet('sfxVol') ?? 0.75);
    this._vv = +(localGet('voiceVol') ?? 0.85);
    this.muted = localGet('muted') === '1';
    this.tension = 0;
    this.scene = 'menu';
    this.events = [];
    this.nextPieceAt = 0;
    this.lastSfx = {};
    this.active = 0;
    this.pieceCount = 0;
    this.lastVoice = 0;
    this.voices = [];
    if (typeof speechSynthesis !== 'undefined') {
      const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang)); };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  get voiceVol() { return this._vv; }

  // ------------------------------------------------------------------ graphe audio
  init(offline = null) {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC && !offline) return;
    const ctx = this.ctx = offline || new AC();
    this.offline = !!offline;
    // maître : compresseur + limiteur
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.18;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    // égalisation générale : graves maîtrisés, aigus aérés
    const lowS = ctx.createBiquadFilter(); lowS.type = 'lowshelf'; lowS.frequency.value = 140; lowS.gain.value = -5;
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2800; presence.Q.value = 0.7; presence.gain.value = 2.5;
    const highS = ctx.createBiquadFilter(); highS.type = 'highshelf'; highS.frequency.value = 7000; highS.gain.value = 4;
    this.master.connect(lowS); lowS.connect(presence); presence.connect(highS); highS.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    // réverbération
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    const rv = ctx.createGain(); rv.gain.value = 0.28;
    this.reverb.connect(rv); rv.connect(this.master);
    // bus musique
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol;
    this.music.connect(this.master);
    this.musicFade = ctx.createGain(); this.musicFade.gain.value = 1;
    this.musicFade.connect(this.music);
    const mrev = ctx.createGain(); mrev.gain.value = 0.5; this.musicFade.connect(mrev); mrev.connect(this.reverb);
    // effet de pompe (sidechain) pour nappes, basse et arpèges
    this.duck = ctx.createGain(); this.duck.connect(this.musicFade);
    this.drums = ctx.createGain(); this.drums.gain.value = 0.95; this.drums.connect(this.musicFade);
    // écho ping-pong
    const dl = ctx.createDelay(1), dr = ctx.createDelay(1), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = 0.3; dr.delayTime.value = 0.3; fb.gain.value = 0.38; dlp.type = 'lowpass'; dlp.frequency.value = 3500;
    const ml = ctx.createChannelMerger(2);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 0.35;
    this.delaySend.connect(dl); dl.connect(dlp); dlp.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(ml, 0, 0); dr.connect(ml, 0, 1);
    const dg = ctx.createGain(); dg.gain.value = 0.55; ml.connect(dg); dg.connect(this.musicFade);
    this.delayL = dl; this.delayR = dr;
    // guitares : deux chaînes (doublage gauche/droite) avec distorsion et simulation de baffle
    this.guitar = [-0.7, 0.7].map((pan) => {
      const input = ctx.createGain();
      const pre = ctx.createBiquadFilter(); pre.type = 'highpass'; pre.frequency.value = 110;
      const shaper = ctx.createWaveShaper(); shaper.curve = this.distCurve(42); shaper.oversample = '4x';
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1800; mid.gain.value = 4; mid.Q.value = 0.8;
      const scoop = ctx.createBiquadFilter(); scoop.type = 'peaking'; scoop.frequency.value = 650; scoop.gain.value = -3; scoop.Q.value = 1;
      const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 5200; cab.Q.value = 0.9;
      const cab2 = ctx.createBiquadFilter(); cab2.type = 'lowpass'; cab2.frequency.value = 7000;
      const out = ctx.createGain(); out.gain.value = 0.34;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (p.pan) p.pan.value = pan;
      input.connect(pre); pre.connect(shaper); shaper.connect(scoop); scoop.connect(mid); mid.connect(cab); cab.connect(cab2); cab2.connect(out); out.connect(p); p.connect(this.musicFade);
      return input;
    });
    // guitare solo
    {
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper(); shaper.curve = this.distCurve(30); shaper.oversample = '4x';
      const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 4600;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2400; pk.gain.value = 5;
      const out = ctx.createGain(); out.gain.value = 0.2;
      input.connect(shaper); shaper.connect(pk); pk.connect(cab); cab.connect(out); out.connect(this.musicFade);
      out.connect(this.delaySend);
      this.leadGtr = input;
    }
    // effets et voix
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    const srev = ctx.createGain(); srev.gain.value = 0.22; this.sfx.connect(srev); srev.connect(this.reverb);
    this.vox = ctx.createGain(); this.vox.gain.value = this._vv; this.vox.connect(this.sfx);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextPieceAt = ctx.currentTime + 0.3;
    if (!offline) this.timer = setInterval(() => this.schedule(), 90);
  }

  distCurve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) * 0.9 + Math.tanh(x * k * 0.3) * 0.1; }
    return c;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }

  setMusicVolume(v) { this.musicVol = v; localSet('musicVol', v); if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setSfxVolume(v) { this.sfxVol = v; localSet('sfxVol', v); if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setVoiceVolume(v) { this._vv = v; localSet('voiceVol', v); if (this.vox) this.vox.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  toggleMute() {
    this.muted = !this.muted; localSet('muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.1);
    if (this.muted && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    return this.muted;
  }

  // ------------------------------------------------------------------ choix du morceau
  setScene(scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.transition();
  }
  setPhase(age) { this.age = age; }
  // gammes propres à la civilisation du joueur
  setCiv(modes) { this.civModes = modes && modes.length ? modes : null; }
  combat(amount = 1) { this.tension = Math.min(10, this.tension + amount); }

  pickStyle() {
    if (this.scene === 'menu' || this.scene === 'victory' || this.scene === 'defeat') return this.scene;
    if (this.tension > 4) return 'battle';
    return (this.age || 0) >= 1 && this.pieceCount % 2 === 1 ? 'build' : 'peace';
  }

  transition() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.events = [];
    this.musicFade.gain.cancelScheduledValues(now);
    this.musicFade.gain.setTargetAtTime(0, now, 0.35);
    this.nextPieceAt = now + 1.4;
    this.fadeBackAt = now + 1.35;
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tension = Math.max(0, this.tension - 0.025);
    if (this.fadeBackAt && now >= this.fadeBackAt) { this.musicFade.gain.cancelScheduledValues(now); this.musicFade.gain.setTargetAtTime(1, now, 0.05); this.fadeBackAt = 0; }
    // une bataille éclate : on bascule vers un morceau de combat
    if (this.currentStyle !== 'battle' && this.tension > 6 && this.scene === 'peace' && this.events.length && !this.fadeBackAt) { this.transition(); return; }
    // la bataille est finie depuis longtemps : retour au calme
    if (this.tension >= 0.5) this.calmSince = undefined;
    else if (this.currentStyle === 'battle' && this.calmSince === undefined) this.calmSince = now;
    if (this.calmSince !== undefined && now - this.calmSince > 25 && this.currentStyle === 'battle') { this.calmSince = undefined; this.transition(); return; }
    if (!this.events.length && now >= this.nextPieceAt) this.compose(Math.max(now + 0.15, this.nextPieceAt));
    const horizon = now + 0.5;
    while (this.events.length && this.events[0].t < horizon) {
      const ev = this.events.shift();
      if (ev.t >= now - 0.05) { try { ev.fn(Math.max(ev.t, now)); } catch { /* note ignorée */ } }
    }
  }

  // ------------------------------------------------------------------ composition
  compose(start, forced) {
    const style = forced || this.pickStyle();
    const S = STYLES[style];
    this.currentStyle = style;
    this.pieceCount++;
    const r = rng((Date.now() ^ (this.pieceCount * 2654435761)) >>> 0);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const bpm = S.bpm[0] + r() * (S.bpm[1] - S.bpm[0]);
    const st = 60 / bpm / 4; // double-croche
    const bar = st * 16;
    const useCiv = this.civModes && style !== 'victory' && style !== 'defeat';
    const mode = MODES[pick(useCiv ? this.civModes : S.modes)] || MODES.aeolian;
    const root = pick(S.roots);
    const N = mode.length;
    const deg = (d, oct = 0) => { const o = Math.floor(d / N), i = ((d % N) + N) % N; return root + mode[i] + 12 * (o + oct); };
    if (this.delayL) { const dtm = st * 3; this.delayL.delayTime.setValueAtTime(dtm, start); this.delayR.delayTime.setValueAtTime(dtm, start); }
    const ev = [];
    const at = (t, fn) => ev.push({ t, fn });

    const progs = {
      peace: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [5, 6, 0, 0]],
      build: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 6, 5]],
      battle: [[0, 0, 5, 6], [0, 1, 0, 6], [0, 5, 6, 4], [0, 0, 1, 0]],
      menu: [[0, 5, 2, 6], [0, 6, 5, 6]],
      victory: [[0, 4, 5, 3], [0, 3, 4, 4]],
      defeat: [[0, 5, 3, 4]],
    }[style];
    const pA = pick(progs), pB = pick(progs);

    // motif mélodique (2 mesures) réutilisé et varié
    const motif = (prog, len = 2) => {
      const notes = [];
      let cur = 7 + Math.floor(r() * 3);
      for (let b = 0; b < len; b++) {
        let pos = 0;
        const rh = pick([[4, 2, 2, 4, 4], [2, 2, 4, 2, 2, 4], [6, 2, 4, 4], [3, 3, 2, 4, 4], [4, 4, 4, 2, 2]]);
        for (const l of rh) {
          const chord = prog[b % prog.length];
          if (pos === 0 || pos === 8) {
            const tones = [chord, chord + 2, chord + 4, chord + 7].map((x) => x + 7 * Math.round((cur - x) / 7)).sort((a, c) => Math.abs(a - cur) - Math.abs(c - cur));
            cur = tones[r() < 0.7 ? 0 : 1];
          } else cur += pick([1, -1, 1, -1, 2, -2, 0]);
          cur = Math.max(4, Math.min(14, cur));
          notes.push({ b, pos, l, d: cur, rest: r() < 0.12 && pos !== 0 });
          pos += l;
          if (pos >= 16) break;
        }
      }
      return notes;
    };
    const mA = motif(pA), mB = motif(pB);

    // sections : [nom, mesures, progression, couches]
    const L = (o) => ({ drums: 0, bass: 0, pad: 0, arp: 0, gtr: 0, chug: 0, lead: 0, synth: 0, riser: 0, dk: 0, ...o });
    const forms = {
      peace: [
        ['intro', 4, pA, L({ pad: 1, arp: 1 })], ['A', 8, pA, L({ pad: 1, arp: 1, drums: 1, bass: 1 })], ['B', 8, pB, L({ pad: 1, arp: 1, drums: 1, bass: 1, synth: 1 })],
        ['break', 4, pA, L({ pad: 1, riser: 1 })], ['C', 8, pA, L({ pad: 1, arp: 1, drums: 2, bass: 1, synth: 1, gtr: 0.5 })], ['outro', 4, pA, L({ pad: 1, arp: 1 })],
      ],
      build: [
        ['intro', 2, pA, L({ drums: 3, chug: 1 })], ['verse', 8, pA, L({ drums: 2, bass: 1, chug: 1, arp: 1 })], ['pre', 4, pB, L({ drums: 2, bass: 1, pad: 1, riser: 1 })],
        ['chorus', 8, pA, L({ drums: 2, bass: 1, gtr: 1, synth: 1, pad: 1 })], ['verse', 8, pB, L({ drums: 2, bass: 1, chug: 1, arp: 1 })], ['chorus', 8, pA, L({ drums: 2, bass: 1, gtr: 1, lead: 1, pad: 1 })], ['outro', 2, pA, L({ gtr: 1 })],
      ],
      battle: [
        ['intro', 4, pA, L({ chug: 1, drums: 3 })], ['riff', 8, pA, L({ chug: 1, drums: 4, bass: 1, dk: 1 })], ['chorus', 8, pB, L({ gtr: 1, drums: 4, bass: 1, lead: 1, synth: 0.6 })],
        ['bridge', 4, pA, L({ chug: 1, drums: 5, bass: 1, riser: 1 })], ['chorus', 8, pB, L({ gtr: 1, drums: 4, bass: 1, lead: 1, dk: 1 })], ['riff', 8, pA, L({ chug: 1, drums: 4, bass: 1, dk: 1, synth: 1 })],
      ],
      menu: [
        ['intro', 4, pA, L({ pad: 1, arp: 1, riser: 1 })], ['verse', 8, pA, L({ pad: 1, arp: 1, drums: 1, bass: 1 })], ['chorus', 8, pB, L({ gtr: 1, drums: 2, bass: 1, lead: 1, pad: 1 })], ['outro', 4, pA, L({ pad: 1, gtr: 0.5 })],
      ],
      victory: [['fanfare', 4, pA, L({ gtr: 1, drums: 2, bass: 1, lead: 1, pad: 1 })], ['end', 2, [0, 0, 0, 0], L({ gtr: 1, pad: 1 })]],
      defeat: [['lament', 6, pA, L({ pad: 1, synth: 1 })]],
    };
    let t = start;
    const form = forms[style];
    form.forEach(([name, bars, prog, lay], si) => {
      const s0 = t;
      if (si > 0 && (lay.gtr || lay.drums >= 2) && form[si - 1][3].riser) at(s0, (tt) => this.impact(tt));
      if (lay.drums >= 2 && (name === 'chorus' || name === 'riff' || name === 'C')) at(s0, (tt) => this.crash(tt, 0.8));
      for (let b = 0; b < bars; b++) {
        const bt = s0 + b * bar;
        const chord = prog[b % prog.length];
        const last = b === bars - 1;
        // ------- batterie
        if (lay.drums) this.drumBar(at, bt, st, lay.drums, S.kit, last && si < form.length - 1, lay.dk);
        // ------- basse
        if (lay.bass) {
          for (let s = 0; s < 16; s++) {
            const on = style === 'battle' ? (lay.chug ? s % 2 === 0 || r() < 0.3 : s % 2 === 0) : S.kit === 'electro' ? [0, 3, 6, 8, 11, 14].includes(s) : s % 2 === 0;
            if (!on) continue;
            const oct = style !== 'battle' && s === 6 ? 1 : 0;
            at(bt + s * st, (tt) => this.bass(tt, mtof(deg(chord, oct) - 12), st * (S.kit === 'electro' ? 2.2 : 1.6), S.kit));
          }
        }
        // ------- nappe
        if (lay.pad) at(bt, (tt) => this.pad(tt, [deg(chord, 0), deg(chord + 2, 0), deg(chord + 4, 0), deg(chord, 1)].map(mtof), bar * 1.02, S.energy));
        // ------- arpèges
        if (lay.arp) {
          const tones = [deg(chord, 1), deg(chord + 2, 1), deg(chord + 4, 1), deg(chord + 7, 1)];
          const pat = [0, 1, 2, 3, 2, 1, 2, 3];
          for (let s = 0; s < 16; s++) {
            if (S.kit === 'rock' && s % 2) continue;
            at(bt + s * st, (tt) => this.pluck(tt, mtof(tones[pat[s % 8]]), st * 1.5, s % 4 === 0 ? 0.9 : 0.6));
          }
        }
        // ------- guitares rythmiques étouffées
        if (lay.chug) {
          const pattern = style === 'battle'
            ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1]
            : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
          for (let s = 0; s < 16; s++) {
            if (!pattern[s]) continue;
            const accent = s === 0 || (style === 'battle' && s === 14 && r() < 0.5);
            const n = accent ? deg(chord, -1) : root - 12 + (style === 'battle' && r() < 0.08 ? 1 : 0);
            at(bt + s * st, (tt) => this.powerChord(tt, n, accent ? st * 3 : st * 0.9, !accent, accent ? 1 : 0.8));
          }
        }
        // ------- accords saturés tenus
        if (lay.gtr) {
          const hits = lay.gtr < 1 ? [0] : [0, 6, 8, 14];
          hits.forEach((s, i) => {
            const len = i === hits.length - 1 ? st * 2 : (hits[i + 1] - s) * st;
            at(bt + s * st, (tt) => this.powerChord(tt, deg(chord, -1), len * 0.98, false, s === 0 ? 1 : 0.85));
          });
        }
        // ------- mélodies (synthé lead / guitare solo)
        if (lay.synth || lay.lead) {
          const m = (si % 2 ? mB : mA);
          for (const n of m) {
            if (n.b !== b % 2 || n.rest) continue;
            let d = n.d;
            if (last && n.pos + n.l >= 16) d = 7;
            const f = mtof(deg(d, 1));
            const dur = n.l * st;
            if (lay.lead) at(bt + n.pos * st, (tt) => this.lead(tt, f, dur * 0.97, n.l >= 4));
            else at(bt + n.pos * st, (tt) => this.synthLead(tt, f, dur * 0.95, lay.synth));
          }
        }
        // ------- montée
        if (lay.riser && b === bars - 2) at(bt, (tt) => this.riser(tt, bar * 2));
      }
      t = s0 + bars * bar;
    });
    // final
    at(t, (tt) => { this.crash(tt, 0.6); if (style !== 'peace' && style !== 'defeat') this.powerChord(tt, root - 12, bar * 0.9, false, 0.9); this.pad(tt, [deg(0, 0), deg(4, 0), deg(0, 1)].map(mtof), bar, 0.5); });
    ev.sort((a, b) => a.t - b.t);
    this.events = ev;
    this.nextPieceAt = t + bar + 1.5 + Math.random() * 3;
    return this.nextPieceAt;
  }

  drumBar(at, bt, st, level, kit, fill, dk) {
    const K = [], Sn = [], H = [], O = [];
    if (level === 1) { K.push(0, 8, 10); Sn.push(4, 12); for (let s = 0; s < 16; s += 2) H.push(s); O.push(14); }
    else if (level === 2) { K.push(0, 3, 8, 10); Sn.push(4, 12); for (let s = 0; s < 16; s++) H.push(s); O.push(6, 14); }
    else if (level === 3) { K.push(0, 6, 8); Sn.push(4, 12); for (let s = 0; s < 16; s += 2) H.push(s); }
    else if (level === 4) { if (dk) for (let s = 0; s < 16; s++) K.push(s); else K.push(0, 2, 6, 8, 10, 11); Sn.push(4, 12); for (let s = 0; s < 16; s += 2) H.push(s); }
    else { K.push(0, 6, 10); Sn.push(8); for (let s = 0; s < 16; s += 4) H.push(s); } // demi-tempo
    const lim = fill ? 8 : 16;
    for (const s of K) if (s < lim) at(bt + s * st, (tt) => this.kick(tt, s % 4 === 0 ? 1 : 0.8, kit));
    for (const s of Sn) if (s < lim) at(bt + s * st, (tt) => this.snare(tt, 1, kit));
    for (const s of H) if (s < lim) at(bt + s * st, (tt) => this.hat(tt, s % 4 === 0 ? 0.9 : 0.55, false, kit));
    for (const s of O) if (s < lim) at(bt + s * st, (tt) => this.hat(tt, 0.6, true, kit));
    if (fill) {
      for (let s = 8; s < 16; s++) {
        const kind = s < 12 ? 'snare' : s < 14 ? 'tomH' : 'tomL';
        at(bt + s * st, (tt) => (kind === 'snare' ? this.snare(tt, 0.5 + (s - 8) * 0.07, kit) : this.tom(tt, kind === 'tomH' ? 180 : 110)));
      }
    }
  }

  // ------------------------------------------------------------------ instruments
  env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end); return o;
  }
  noiseSrc(t, end, dest) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(end); return s;
  }
  filt(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  pan(dest, p) { if (!this.ctx.createStereoPanner) return dest; const n = this.ctx.createStereoPanner(); n.pan.value = p; n.connect(dest); return n; }

  sidechain(t) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.3, t);
    g.linearRampToValueAtTime(1, t + 0.2);
  }

  kick(t, v, kit) {
    const ctx = this.ctx;
    const g = this.gain(); g.connect(this.drums);
    this.env(g, t, 0.002, (kit === 'electro' ? 0.62 : 0.55) * v, 0.02, kit === 'electro' ? 0.36 : 0.24);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(kit === 'electro' ? 150 : 180, t); o.frequency.exponentialRampToValueAtTime(kit === 'electro' ? 44 : 55, t + 0.11);
    const sh = ctx.createWaveShaper(); sh.curve = this.kcurve || (this.kcurve = this.distCurve(2.5));
    o.connect(sh); sh.connect(g); o.start(t); o.stop(t + 0.55);
    const c = this.gain(); this.env(c, t, 0.0005, 0.45 * v, 0, 0.015); c.connect(this.drums);
    const hp = this.filt('highpass', 2500); hp.connect(c); this.noiseSrc(t, t + 0.03, hp);
    this.sidechain(t);
  }

  snare(t, v, kit) {
    const g = this.gain(); g.connect(this.pan(this.drums, 0.05));
    const bp = this.filt('bandpass', kit === 'rock' ? 2200 : 1700, 0.7); const hp = this.filt('highpass', 900);
    bp.connect(hp); hp.connect(g);
    this.env(g, t, 0.001, 0.85 * v, 0, kit === 'rock' ? 0.24 : 0.18);
    this.noiseSrc(t, t + 0.3, bp);
    const tg = this.gain(); this.env(tg, t, 0.001, 0.32 * v, 0, 0.09); tg.connect(this.drums);
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.08); o.connect(tg); o.start(t); o.stop(t + 0.15);
    if (kit !== 'rock') {
      // clap électro
      for (let i = 0; i < 3; i++) {
        const cg = this.gain(); this.env(cg, t + i * 0.011, 0.0005, 0.3 * v, 0, 0.03 + (i === 2 ? 0.12 : 0)); cg.connect(this.drums);
        const cb = this.filt('bandpass', 1200, 1.2); cb.connect(cg); this.noiseSrc(t + i * 0.011, t + i * 0.011 + 0.2, cb);
      }
    }
  }

  hat(t, v, open, kit) {
    const g = this.gain(); g.connect(this.pan(this.drums, 0.35));
    const len = open ? 0.28 : 0.045;
    this.env(g, t, 0.0008, (open ? 0.42 : 0.4) * v, 0, len);
    if (kit === 'rock') { const hp = this.filt('highpass', 7500); hp.connect(g); this.noiseSrc(t, t + len + 0.05, hp); return; }
    // charleston métallique (six carrés inharmoniques)
    const bp = this.filt('bandpass', 10000, 0.8); const hp = this.filt('highpass', 7000);
    bp.connect(hp); hp.connect(g);
    for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) this.osc('square', 40 * ratio * 4, t, t + len + 0.05, bp);
  }

  crash(t, v = 1) {
    const g = this.gain(); g.connect(this.pan(this.drums, -0.3));
    this.env(g, t, 0.002, 0.5 * v, 0, 2.2);
    const hp = this.filt('highpass', 4500); const bp = this.filt('peaking', 8000, 1); bp.gain.value = 6;
    hp.connect(bp); bp.connect(g);
    this.noiseSrc(t, t + 2.4, hp);
  }

  tom(t, f) {
    const g = this.gain(); g.connect(this.drums);
    this.env(g, t, 0.002, 0.6, 0, 0.3);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(g); o.start(t); o.stop(t + 0.4);
  }

  bass(t, f, dur, kit) {
    const g = this.gain(); g.connect(this.duck);
    const lp = this.filt('lowpass', 400, kit === 'electro' ? 6 : 2);
    lp.frequency.setValueAtTime(kit === 'electro' ? 2200 : 1400, t);
    lp.frequency.exponentialRampToValueAtTime(kit === 'electro' ? 260 : 500, t + dur * 0.8);
    lp.connect(g);
    this.env(g, t, 0.004, 0.2, dur * 0.5, dur * 0.5);
    this.osc('sawtooth', f, t, t + dur + 0.1, lp, -6);
    this.osc(kit === 'electro' ? 'square' : 'sawtooth', f, t, t + dur + 0.1, lp, 6);
    const sub = this.gain(0.3); sub.connect(g); this.osc('sine', f / 2, t, t + dur + 0.1, sub);
  }

  pad(t, freqs, dur, energy) {
    const g = this.gain(); g.connect(this.duck);
    const lp = this.filt('lowpass', 900 + energy * 1400, 0.7);
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(900 + energy * 1600, t + dur * 0.6);
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(0.05, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    for (const f of freqs) for (const d of [-14, -5, 5, 14]) this.osc('sawtooth', f, t, t + dur + 0.7, lp, d);
  }

  pluck(t, f, dur, v) {
    const g = this.gain(); g.connect(this.duck); g.connect(this.delaySend);
    const lp = this.filt('lowpass', 500, 4);
    lp.frequency.setValueAtTime(5500, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    lp.connect(g);
    this.env(g, t, 0.002, 0.09 * v, 0, dur + 0.12);
    this.osc('square', f, t, t + dur + 0.2, lp, -4);
    this.osc('sawtooth', f * 2, t, t + dur + 0.2, lp, 5);
  }

  synthLead(t, f, dur, v) {
    const g = this.gain(); g.connect(this.pan(this.musicFade, 0.1)); g.connect(this.delaySend);
    const lp = this.filt('lowpass', 3200, 2); lp.connect(g);
    this.env(g, t, 0.015, 0.075 * v, Math.max(0, dur - 0.1), 0.15);
    for (const d of [-10, 0, 10]) {
      const o = this.osc('sawtooth', f, t, t + dur + 0.3, lp, d);
      if (dur > 0.3) { const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = this.gain(0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + 0.3); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.3); }
    }
  }

  // accord de puissance (fondamentale, quinte, octave) sur deux guitares doublées
  powerChord(t, m, dur, mute, v = 1) {
    const notes = mute ? [m, m + 7] : [m, m + 7, m + 12];
    this.guitar.forEach((input, side) => {
      const td = t + side * 0.006 + Math.random() * 0.004;
      const g = this.gain(); g.connect(input);
      const lp = this.filt('lowpass', mute ? 1100 : 4200, 0.7); lp.connect(g);
      if (mute) this.env(g, td, 0.002, 1.0 * v, 0.02, Math.max(0.05, dur * 0.8));
      else { g.gain.setValueAtTime(0.0001, td); g.gain.linearRampToValueAtTime(1.0 * v, td + 0.006); g.gain.setTargetAtTime(0.6 * v, td + 0.05, 0.4); g.gain.setValueAtTime(0.6 * v, td + dur); g.gain.linearRampToValueAtTime(0.0001, td + dur + 0.08); }
      for (const n of notes) {
        const f = mtof(n);
        this.osc('sawtooth', f, td, td + dur + 0.15, lp, side ? 7 : -7);
        this.osc('square', f, td, td + dur + 0.15, lp, side ? -4 : 4);
      }
    });
  }

  // guitare solo : vibrato et légère glissade d'attaque
  lead(t, f, dur, vib) {
    const g = this.gain(); g.connect(this.leadGtr);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.01); g.gain.setTargetAtTime(0.55, t + 0.05, 0.3);
    g.gain.setValueAtTime(0.55, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
    for (const [type, d] of [['sawtooth', -5], ['square', 5]]) {
      const o = this.ctx.createOscillator(); o.type = type; o.detune.value = d;
      o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      if (vib && dur > 0.25) {
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6.2;
        const lg = this.gain(0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.018, t + dur * 0.6);
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
      }
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  riser(t, dur) {
    const g = this.gain(); g.connect(this.musicFade);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + dur);
    const bp = this.filt('bandpass', 400, 2);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
    bp.connect(g); this.noiseSrc(t, t + dur + 0.05, bp);
    const sg = this.gain(); sg.connect(this.musicFade);
    sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.03, t + dur);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + dur);
    o.connect(sg); o.start(t); o.stop(t + dur + 0.05);
  }

  impact(t) {
    const g = this.gain(); g.connect(this.musicFade);
    this.env(g, t, 0.003, 0.9, 0, 1.6);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    o.connect(g); o.start(t); o.stop(t + 1.7);
    const ng = this.gain(); this.env(ng, t, 0.002, 0.4, 0, 0.9); ng.connect(this.musicFade);
    const lp = this.filt('lowpass', 1200); lp.connect(ng); this.noiseSrc(t, t + 1, lp);
  }

  // rendu immédiat (export hors ligne d'extraits)
  renderPiece(style, start = 0.2) {
    const end = this.compose(start, style);
    for (const ev of this.events) ev.fn(ev.t);
    this.events = [];
    return end;
  }

  // ------------------------------------------------------------------ voix humaines synthétisées (cris)
  formant(t, f0a, f0b, va, vb, dur, vol, opts = {}) {
    const ctx = this.ctx;
    const V = { a: [800, 1150, 2900], o: [450, 800, 2830], e: [400, 2000, 2600], E: [600, 1800, 2600], i: [300, 2300, 3000], u: [325, 700, 2530] };
    const out = this.gain(); out.connect(this.pan(this.vox, opts.pan || 0));
    this.env(out, t, opts.attack ?? 0.02, vol, dur * 0.6, dur * 0.4);
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0a, t);
    if (opts.peak) { src.frequency.linearRampToValueAtTime(opts.peak, t + dur * 0.3); src.frequency.linearRampToValueAtTime(f0b, t + dur); }
    else src.frequency.exponentialRampToValueAtTime(f0b, t + dur);
    if (opts.vib) { const l = ctx.createOscillator(); l.frequency.value = opts.vib; const lg = this.gain(opts.vibDepth || f0a * 0.04); l.connect(lg); lg.connect(src.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const mix = this.gain(); src.connect(mix);
    if (opts.breath) { const bg = this.gain(opts.breath); bg.connect(mix); this.noiseSrc(t, t + dur + 0.1, bg); }
    [0, 1, 2].forEach((k) => {
      const bp = this.filt('bandpass', V[va][k], [6, 9, 12][k]);
      bp.frequency.setValueAtTime(V[va][k], t); bp.frequency.linearRampToValueAtTime(V[vb][k], t + dur);
      const fg = this.gain([1, 0.55, 0.3][k] * 3.2); mix.connect(bp); bp.connect(fg); fg.connect(out);
    });
    src.start(t); src.stop(t + dur + 0.1);
  }

  scream(vol, pan) {
    const t = this.ctx.currentTime + 0.01, fem = Math.random() < 0.3;
    const f = (fem ? 330 : 190) * (0.9 + Math.random() * 0.2);
    this.formant(t, f * 1.15, f * 0.55, 'a', 'o', 0.55 + Math.random() * 0.25, 0.28 * vol, { vib: 7, breath: 0.25, pan });
  }

  grunt(vol, pan) {
    const t = this.ctx.currentTime + 0.01, f = 120 + Math.random() * 40;
    this.formant(t, f * 1.2, f * 0.9, Math.random() < 0.5 ? 'a' : 'E', 'a', 0.16 + Math.random() * 0.08, 0.22 * vol, { breath: 0.5, attack: 0.008, pan });
  }

  neigh(vol, pan) {
    const t = this.ctx.currentTime + 0.01;
    this.formant(t, 700, 380, 'i', 'E', 0.9, 0.2 * vol, { peak: 1250, vib: 15, vibDepth: 70, breath: 0.35, pan });
    const g = this.gain(); this.env(g, t + 0.95, 0.01, 0.12 * vol, 0, 0.18); g.connect(this.vox);
    const bp = this.filt('bandpass', 900, 1.5); bp.connect(g); this.noiseSrc(t + 0.95, t + 1.2, bp);
  }

  bleat(vol, pan) {
    const t = this.ctx.currentTime + 0.01, f = 360 + Math.random() * 80;
    this.formant(t, f, f * 0.92, 'e', 'E', 0.65, 0.14 * vol, { vib: 7.5, vibDepth: 26, breath: 0.15, pan });
  }

  // Réplique d'une unité (synthèse vocale du navigateur si une voix française existe)
  voice(unitType, action, vol = 1, cls = null) {
    if (this.muted || this._vv <= 0.01) return;
    const now = performance.now();
    if (now - this.lastVoice < 650) return;
    this.lastVoice = now;
    const group = cls === 'villager' || unitType === 'villager' ? 'villager' : cls === 'archer' ? 'archer' : cls === 'cavalry' ? 'cavalry' : cls === 'siege' ? 'siege' : 'infantry';
    const set = LINES[group][action] || LINES[group].order;
    const line = set[Math.floor(Math.random() * set.length)];
    if (this.ctx && group === 'cavalry' && action === 'select' && Math.random() < 0.5) this.neigh(0.8, 0);
    if (typeof speechSynthesis === 'undefined' || !this.voices.length) {
      // pas de voix française : courte interjection synthétisée
      if (this.ctx) this.formant(this.ctx.currentTime + 0.01, group === 'villager' ? 210 : 140, group === 'villager' ? 260 : 120, 'E', action === 'attack' ? 'a' : 'i', 0.22, 0.2 * this._vv, { breath: 0.3 });
      return;
    }
    const u = new SpeechSynthesisUtterance(line);
    const pitch = { villager: 1.15, infantry: 0.78, archer: 1.0, cavalry: 0.88, siege: 0.7 }[group];
    u.pitch = Math.max(0.1, Math.min(2, pitch + (Math.random() - 0.5) * 0.15));
    u.rate = action === 'attack' ? 1.2 : 1.08;
    u.volume = Math.min(1, this._vv * vol);
    u.lang = 'fr-FR';
    const idx = (group.length + (unitType || '').length) % this.voices.length;
    u.voice = this.voices[idx];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ------------------------------------------------------------------ bruitages
  sfxPlay(kind, vol = 1, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted || vol <= 0.02) return;
    const now = ctx.currentTime;
    const minGap = { chop: 0.12, mine: 0.12, hammer: 0.15, hit: 0.06, arrow: 0.05, death: 0.15, grunt: 0.25, bleat: 1.5 }[kind] ?? 0.08;
    if (this.lastSfx[kind] && now - this.lastSfx[kind] < minGap) return;
    if (this.active > 26) return;
    this.lastSfx[kind] = now;
    this.active++;
    setTimeout(() => this.active--, 600);
    const out = this.pan(this.sfx, Math.max(-1, Math.min(1, pan)));
    const t = now + 0.01;
    const gn = (peak, a, rel) => { const g = this.gain(); this.env(g, t, a, peak * vol, 0, rel); g.connect(out); return g; };
    const r = Math.random();
    switch (kind) {
      case 'chop': {
        const g = gn(0.55, 0.002, 0.13); const b = this.filt('bandpass', 650 + r * 300, 2.5); b.connect(g); this.noiseSrc(t, t + 0.16, b);
        const g2 = gn(0.5, 0.002, 0.1); const o = ctx.createOscillator(); o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08); o.connect(g2); o.start(t); o.stop(t + 0.15);
        break;
      }
      case 'mine': {
        const g = gn(0.2, 0.001, 0.28); for (const f of [1850, 2720, 3990]) this.osc('sine', f * (0.95 + r * 0.1), t, t + 0.32, g);
        const g2 = gn(0.32, 0.001, 0.06); const b = this.filt('highpass', 2500); b.connect(g2); this.noiseSrc(t, t + 0.08, b);
        break;
      }
      case 'hammer': {
        const g = gn(0.38, 0.001, 0.09); const b = this.filt('bandpass', 1300 + r * 400, 4); b.connect(g); this.noiseSrc(t, t + 0.1, b);
        const g2 = gn(0.22, 0.001, 0.12); this.osc('triangle', 430 + r * 60, t, t + 0.15, g2);
        break;
      }
      case 'hit': {
        const g = gn(0.22, 0.001, 0.26);
        for (const f of [1650, 2380, 3170, 4400]) { const b = this.filt('bandpass', f, 9); b.connect(g); this.osc('square', f * (0.97 + r * 0.06), t, t + 0.28, b); }
        const g2 = gn(0.38, 0.001, 0.05); const b = this.filt('highpass', 3000); b.connect(g2); this.noiseSrc(t, t + 0.06, b);
        if (r < 0.18) this.grunt(vol, pan);
        break;
      }
      case 'arrow': {
        const g = gn(0.24, 0.01, 0.18); const b = this.filt('bandpass', 2500, 1.5);
        b.frequency.setValueAtTime(3600, t); b.frequency.exponentialRampToValueAtTime(900, t + 0.2); b.connect(g); this.noiseSrc(t, t + 0.25, b);
        break;
      }
      case 'launch': {
        const g = gn(0.42, 0.005, 0.32); const b = this.filt('lowpass', 600); b.connect(g); this.noiseSrc(t, t + 0.36, b);
        const g2 = gn(0.32, 0.002, 0.22); this.osc('triangle', 90, t, t + 0.26, g2);
        break;
      }
      case 'boom': {
        const g = gn(0.85, 0.003, 0.8); const b = this.filt('lowpass', 320); b.connect(g); this.noiseSrc(t, t + 0.9, b);
        const g2 = gn(0.65, 0.002, 0.55); const o = ctx.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.45); o.connect(g2); o.start(t); o.stop(t + 0.65);
        break;
      }
      case 'death': this.scream(vol, pan); break;
      case 'grunt': this.grunt(vol, pan); break;
      case 'neigh': this.neigh(vol, pan); break;
      case 'bleat': this.bleat(vol, pan); break;
      case 'collapse': {
        const g = gn(0.95, 0.02, 1.7); const b = this.filt('lowpass', 520); b.connect(g); this.noiseSrc(t, t + 1.9, b);
        for (let i = 0; i < 6; i++) {
          const tt = t + i * 0.17 + Math.random() * 0.1;
          const g2 = this.gain(); this.env(g2, tt, 0.002, 0.32 * vol, 0, 0.16); g2.connect(out);
          const b2 = this.filt('bandpass', 380 + Math.random() * 650, 2); b2.connect(g2); this.noiseSrc(tt, tt + 0.2, b2);
        }
        break;
      }
      case 'built': this.chime([0, 7, 12, 16], 0.07, vol); break;
      case 'trained': this.chime([12, 19], 0.08, vol * 0.7); break;
      case 'tech': this.chime([0, 5, 9, 12, 17], 0.06, vol); break;
      case 'age': { this.impact(t); this.powerChord(t, 40, 2.2, false, Math.min(1, vol)); this.chime([0, 7, 12, 19, 24], 0.12, vol); break; }
      case 'alert': this.horn(vol); break;
      case 'victory': { this.powerChord(t, 40, 0.5, false, vol); this.powerChord(t + 0.5, 43, 0.5, false, vol); this.powerChord(t + 1.0, 45, 2.2, false, vol); this.chime([0, 4, 7, 12, 16, 19, 24], 0.14, vol); break; }
      case 'defeat': { const g = gn(0.5, 0.05, 3); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(55, t + 3); const lp = this.filt('lowpass', 900); o.connect(lp); lp.connect(g); o.start(t); o.stop(t + 3.1); break; }
      case 'click': { const g = gn(0.16, 0.001, 0.035); const b = this.filt('bandpass', 2600, 4); b.connect(g); this.noiseSrc(t, t + 0.05, b); this.osc('sine', 1800, t, t + 0.04, g); break; }
      case 'select': { const g = gn(0.1, 0.003, 0.16); this.osc('sine', 880, t, t + 0.18, g); this.osc('sine', 1320, t + 0.03, t + 0.18, g); break; }
      case 'order': { const g = gn(0.09, 0.003, 0.12); this.osc('sine', 660, t, t + 0.07, g); this.osc('sine', 990, t + 0.06, t + 0.16, g); break; }
      default:
    }
  }

  chime(intervals, step, vol, base = 72) {
    const t0 = this.ctx.currentTime + 0.02;
    intervals.forEach((iv, i) => {
      const t = t0 + i * step, f = mtof(base + iv);
      const g = this.gain(); g.connect(this.sfx); g.connect(this.delaySend);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      this.osc('sine', f, t, t + 1.3, g); this.osc('triangle', f * 2, t, t + 0.4, g);
    });
  }

  horn(vol) {
    // cor de guerre : cuivre grave filtré
    const t0 = this.ctx.currentTime + 0.02;
    [[45, 0.5], [45, 0.25], [50, 1.1]].reduce((t, [m, d]) => {
      const f = mtof(m);
      const g = this.gain(); g.connect(this.sfx);
      this.env(g, t, 0.06, 0.16 * vol, d, 0.25);
      const lp = this.filt('lowpass', 400); lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(f * 5, t + 0.12); lp.connect(g);
      this.osc('sawtooth', f, t, t + d + 0.4, lp, -6); this.osc('sawtooth', f, t, t + d + 0.4, lp, 6); this.osc('sawtooth', f / 2, t, t + d + 0.4, lp);
      return t + d + 0.08;
    }, t0);
  }
}
