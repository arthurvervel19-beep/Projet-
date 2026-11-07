// Moteur audio : musique médiévale générée en temps réel (compositions originales procédurales)
// et bruitages, entièrement synthétisés avec la Web Audio API (aucun fichier son).

const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Styles de morceaux : calme (village), danse (prospérité), bataille (tension)
const STYLES = {
  calm: { tempo: [66, 80], meter: [3, 4], modes: ['dorian', 'aeolian', 'mixolydian'], drums: 0, drone: 1, melody: 'flute' },
  dance: { tempo: [100, 116], meter: [6], modes: ['mixolydian', 'dorian', 'ionian'], drums: 0.7, drone: 0.6, melody: 'flute' },
  battle: { tempo: [112, 128], meter: [4, 6], modes: ['aeolian', 'phrygian', 'dorian'], drums: 1, drone: 1, melody: 'shawm' },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = +(localGet('musicVol') ?? 0.55);
    this.sfxVol = +(localGet('sfxVol') ?? 0.7);
    this.muted = localGet('muted') === '1';
    this.tension = 0;
    this.events = [];
    this.nextPieceAt = 0;
    this.lastSfx = {};
    this.active = 0;
    this.pieceCount = 0;
  }

  // offline : OfflineAudioContext optionnel (pour exporter des extraits)
  init(offline = null) {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !offline) return;
    const ctx = this.ctx = offline || new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    // réverbération « grande salle »
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.32;
    this.reverb.connect(revGain); revGain.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol;
    const boost = ctx.createGain(); boost.gain.value = 2.4;
    this.music.connect(boost); boost.connect(this.master);
    this.musicRev = ctx.createGain(); this.musicRev.gain.value = 0.9;
    boost.connect(this.musicRev); this.musicRev.connect(this.reverb);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    const sfxRev = ctx.createGain(); sfxRev.gain.value = 0.25;
    this.sfx.connect(sfxRev); sfxRev.connect(this.reverb);
    // bruit blanc réutilisable
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextPieceAt = ctx.currentTime + 0.5;
    if (!offline) this.timer = setInterval(() => this.schedule(), 100);
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setMusicVolume(v) { this.musicVol = v; localSet('musicVol', v); if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setSfxVolume(v) { this.sfxVol = v; localSet('sfxVol', v); if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  toggleMute() {
    this.muted = !this.muted; localSet('muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  // la tension (combats) influence le style du morceau suivant
  combat(amount = 1) { this.tension = Math.min(10, this.tension + amount); }

  // ------------------------------------------------------------------ séquenceur
  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tension = Math.max(0, this.tension - 0.03); // décroît de 0,3 par seconde
    if (!this.events.length && now >= this.nextPieceAt) this.compose(now + 0.2);
    // si une bataille éclate pendant un morceau calme, on enchaîne plus vite
    if (this.currentStyle !== 'battle' && this.tension > 6 && this.events.length) {
      const fadeAt = now + 0.1;
      this.music.gain.setTargetAtTime(0, fadeAt, 0.6);
      this.events = [];
      this.nextPieceAt = now + 2.5;
      setTimeout(() => { if (this.music) this.music.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.2); }, 2300);
      return;
    }
    const horizon = now + 0.6;
    while (this.events.length && this.events[0].t < horizon) {
      const ev = this.events.shift();
      if (ev.t >= now - 0.05) ev.fn(Math.max(ev.t, now));
    }
  }

  // rendu immédiat de tous les événements d'un morceau (mode hors ligne)
  renderPiece(style, start = 0.2) {
    this.tension = style === 'battle' ? 9 : 0;
    this.pieceCount = style === 'dance' ? 1 : 0;
    this.compose(start);
    for (const ev of this.events) ev.fn(ev.t);
    this.events = [];
    return this.nextPieceAt;
  }

  compose(start) {
    const seed = (Date.now() + this.pieceCount * 7919) & 0x7fffffff;
    const r = rng(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const styleName = this.tension > 4 ? 'battle' : (this.pieceCount % 3 === 1 ? 'dance' : 'calm');
    this.currentStyle = styleName;
    this.pieceCount++;
    const st = STYLES[styleName];
    const mode = MODES[pick(st.modes)];
    const root = 50 + Math.floor(r() * 7); // ré à la#
    const tempo = st.tempo[0] + r() * (st.tempo[1] - st.tempo[0]);
    const meter = pick(st.meter); // 3, 4 ou 6 (6/8)
    const slots = meter === 6 ? 6 : meter * 2; // grille en croches
    const slot = 60 / tempo / 2; // une croche
    const barDur = slots * slot;
    const evs = [];
    const add = (t, fn) => evs.push({ t, fn });

    const deg = (d, oct = 0) => {
      const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
      return root + mode[i] + 12 * (o + oct);
    };
    // progressions modales (degrés)
    const progs = styleName === 'battle'
      ? [[0, 6, 5, 6], [0, 5, 6, 0], [0, 3, 6, 4]]
      : [[0, 6, 0, 4], [0, 3, 6, 0], [0, 4, 5, 6], [0, 6, 3, 4], [0, 5, 3, 4]];
    const progA = pick(progs), progB = pick(progs.filter((p) => p !== progA)) || progA;

    const rhythms = {
      6: [[2, 1, 2, 1], [3, 3], [1, 1, 1, 2, 1], [2, 1, 3], [3, 2, 1]],
      8: [[2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [4, 2, 2], [1, 1, 2, 2, 2], [3, 1, 4]],
      6.1: [[2, 2, 2], [4, 2], [3, 1, 2], [2, 4]], // 3/4
    };
    const rhy = meter === 6 ? rhythms[6] : meter === 3 ? rhythms[6.1] : rhythms[8];

    // génère une phrase mélodique de 4 mesures
    const phrase = (prog, cadence) => {
      const notes = [];
      let cur = 7 + Math.floor(r() * 3); // autour de l'octave supérieure
      for (let b = 0; b < 4; b++) {
        const pattern = b === 3 ? (meter === 6 ? [3, 3] : meter === 3 ? [2, 4] : [2, 2, 4]) : pick(rhy);
        let pos = 0;
        pattern.forEach((len, k) => {
          const chord = prog[b];
          const strong = pos === 0 || (meter !== 3 && pos === slots / 2);
          if (b === 3 && k === pattern.length - 1) {
            cur = cadence ? 7 : chord + 7 + (r() < 0.5 ? 2 : 4); // résolution
          } else if (strong) {
            const tones = [chord, chord + 2, chord + 4, chord + 7, chord + 9].map((x) => x + 7 * Math.round((cur - x) / 7));
            tones.sort((a, b2) => Math.abs(a - cur) - Math.abs(b2 - cur));
            cur = tones[r() < 0.7 ? 0 : 1];
          } else {
            const step = r() < 0.75 ? (r() < 0.5 ? 1 : -1) : (r() < 0.5 ? 2 : -2);
            cur += step;
          }
          cur = Math.max(3, Math.min(13, cur));
          notes.push({ bar: b, pos, len, d: cur });
          pos += len;
        });
      }
      return notes;
    };
    const A = phrase(progA, false), A2 = phrase(progA, true), B = phrase(progB, false);
    // variation : A' reprend A sauf la dernière mesure
    const Ap = A.filter((n) => n.bar < 3).concat(A2.filter((n) => n.bar === 3));
    const form = styleName === 'calm' ? [[A, progA], [Ap, progA], [B, progB], [Ap, progA]]
      : [[A, progA], [Ap, progA], [B, progB], [B, progB], [A, progA], [Ap, progA]];

    let t = start;
    const melodyInst = st.melody;
    form.forEach(([mel, prog], sec) => {
      const secStart = t;
      const second = sec >= 2 && r() < 0.6; // voix d'accompagnement en tierce
      for (const n of mel) {
        const nt = secStart + n.bar * barDur + n.pos * slot;
        const f = mtof(deg(n.d, 1));
        const dur = n.len * slot;
        const inst = (sec === 2 && styleName !== 'battle') ? 'lute' : melodyInst;
        add(nt, (tt) => this.play(inst, tt, f, dur * 0.95, 0.8 + r() * 0.2));
        if (second && n.len >= 2) {
          const f2 = mtof(deg(n.d - 2, 1));
          add(nt, (tt) => this.play('flute2', tt, f2, dur * 0.9, 0.45));
        }
      }
      // accompagnement : luth arpégé / accords
      for (let b = 0; b < 4; b++) {
        const bt = secStart + b * barDur;
        const c = prog[b];
        const arp = meter === 6 ? [0, 4, 7, 4, 7, 4] : meter === 3 ? [0, 4, 7, 4, 7, 4] : [0, 4, 7, 9, 7, 4, 7, 4];
        const chordTones = [deg(c, 0), deg(c + 2, 0), deg(c + 4, 0), deg(c + 7, 0), deg(c + 9, 0)];
        for (let s = 0; s < slots; s++) {
          if (styleName === 'calm' && s % 2 === 1 && r() < 0.5) continue;
          const which = arp[s % arp.length];
          const m = which === 0 ? chordTones[0] : which === 4 ? chordTones[2] : which === 7 ? chordTones[3] : chordTones[1] + 12;
          add(bt + s * slot, (tt) => this.play('lute', tt, mtof(m), slot * 2.2, s === 0 ? 0.75 : 0.45));
        }
        // basse
        add(bt, (tt) => this.play('bass', tt, mtof(deg(c, -1)), barDur * 0.9, 0.8));
        // percussions
        if (st.drums > 0) {
          for (let s = 0; s < slots; s++) {
            const beat = meter === 6 ? (s === 0 || s === 3) : s % 2 === 0;
            const accent = s === 0;
            if (beat) add(bt + s * slot, (tt) => this.play('drum', tt, 0, 0, (accent ? 1 : 0.6) * st.drums));
            else if (r() < 0.8) add(bt + s * slot, (tt) => this.play('tamb', tt, 0, 0, 0.5 * st.drums));
            if (styleName === 'battle' && s === slots - 1 && b === 3) add(bt + (s + 0.5) * slot, (tt) => this.play('drum', tt, 0, 0, 0.7));
          }
        }
      }
      // bourdon (vielle à roue) sur chaque section
      if (st.drone) add(secStart, (tt) => this.play('drone', tt, mtof(root - 12), barDur * 4, st.drone));
      t = secStart + barDur * 4;
    });
    // final : accord tenu
    add(t, (tt) => { this.play('lute', tt, mtof(deg(0, 0)), 2.5, 0.8); this.play('lute', tt + 0.03, mtof(deg(4, 0)), 2.5, 0.6); this.play(melodyInst, tt, mtof(deg(7, 1)), 2, 0.7); });
    evs.sort((a, b) => a.t - b.t);
    this.events = evs;
    this.nextPieceAt = t + 4 + Math.random() * 6;
  }

  // ------------------------------------------------------------------ instruments
  env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end);
    return o;
  }

  noiseSrc(t, end, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(end);
    return s;
  }

  panner(dest, pan) {
    if (!this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); return p;
  }

  play(inst, t, f, dur, vel) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const out = this.music;
    switch (inst) {
      case 'lute': {
        // corde pincée : oscillateurs riches filtrés, brillance qui décroît
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2;
        flt.frequency.setValueAtTime(Math.min(9000, f * 9), t);
        flt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.35);
        flt.connect(g); g.connect(this.panner(out, -0.25));
        const len = Math.min(2.6, dur + 0.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        this.osc('sawtooth', f, t, t + len, flt, -4);
        this.osc('triangle', f * 2, t, t + len, flt, 5);
        break;
      }
      case 'bass': {
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 500;
        flt.connect(g); g.connect(out);
        this.env(g, t, 0.01, 0.12 * vel, 0.05, Math.min(2.5, dur));
        this.osc('triangle', f, t, t + dur + 0.2, flt);
        break;
      }
      case 'flute':
      case 'flute2': {
        // flûte à bec : sinusoïde + vibrato + souffle
        const g = ctx.createGain();
        g.connect(this.panner(out, inst === 'flute' ? 0.2 : 0.35));
        const peak = (inst === 'flute' ? 0.085 : 0.05) * vel;
        this.env(g, t, 0.05, peak, Math.max(0.02, dur - 0.12), 0.14);
        const end = t + dur + 0.3;
        const o = this.osc('sine', f, t, end, g);
        const o2g = ctx.createGain(); o2g.gain.value = 0.25; o2g.connect(g);
        const o2 = this.osc('triangle', f, t, end, o2g);
        if (dur > 0.25) {
          const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
          const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + 0.25);
          lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
          lfo.start(t); lfo.stop(end);
        }
        const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f * 2; bf.Q.value = 3;
        const bg = ctx.createGain(); this.env(bg, t, 0.02, 0.025 * vel, 0.02, 0.1);
        bf.connect(bg); bg.connect(g);
        this.noiseSrc(t, t + 0.3, bf);
        break;
      }
      case 'shawm': {
        // chalémie : anche nasillarde pour les batailles
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f * 3; flt.Q.value = 1.2;
        flt.connect(g); g.connect(this.panner(out, 0.15));
        this.env(g, t, 0.03, 0.07 * vel, Math.max(0.02, dur - 0.1), 0.1);
        const o = this.osc('square', f, t, t + dur + 0.2, flt, -3);
        this.osc('sawtooth', f, t, t + dur + 0.2, flt, 4);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
        const lg = ctx.createGain(); lg.gain.value = f * 0.005; lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.2);
        break;
      }
      case 'drone': {
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 700; flt.Q.value = 0.7;
        flt.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03 * vel, t + 1.5);
        g.gain.setValueAtTime(0.03 * vel, t + dur - 1.2);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
        this.osc('sawtooth', f, t, t + dur + 0.6, flt, -6);
        this.osc('sawtooth', f * 1.5, t, t + dur + 0.6, flt, 5);
        this.osc('sawtooth', f * 2, t, t + dur + 0.6, flt, 2);
        break;
      }
      case 'drum': {
        // tambour sur cadre
        const g = ctx.createGain(); g.connect(out);
        this.env(g, t, 0.003, 0.35 * vel, 0, 0.35);
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        o.connect(g); o.start(t); o.stop(t + 0.45);
        const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
        const ng = ctx.createGain(); this.env(ng, t, 0.002, 0.12 * vel, 0, 0.08);
        nf.connect(ng); ng.connect(out);
        this.noiseSrc(t, t + 0.15, nf);
        break;
      }
      case 'tamb': {
        const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 7000;
        const ng = ctx.createGain(); this.env(ng, t, 0.002, 0.06 * vel, 0, 0.07);
        nf.connect(ng); ng.connect(this.panner(out, 0.4));
        this.noiseSrc(t, t + 0.12, nf);
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ bruitages
  // vol : 0..1 (atténuation selon la distance à la caméra), pan : -1..1
  sfxPlay(kind, vol = 1, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted || vol <= 0.02) return;
    const now = ctx.currentTime;
    const minGap = { chop: 0.12, mine: 0.12, hammer: 0.15, hit: 0.06, arrow: 0.05, death: 0.1 }[kind] ?? 0.08;
    if (this.lastSfx[kind] && now - this.lastSfx[kind] < minGap) return;
    if (this.active > 24) return;
    this.lastSfx[kind] = now;
    this.active++;
    setTimeout(() => this.active--, 600);
    const out = this.panner(this.sfx, Math.max(-1, Math.min(1, pan)));
    const t = now + 0.01;
    const gainNode = (peak, a, rel) => { const g = ctx.createGain(); this.env(g, t, a, peak * vol, 0, rel); g.connect(out); return g; };
    const filt = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const r = Math.random();
    switch (kind) {
      case 'chop': {
        const g = gainNode(0.5, 0.002, 0.12);
        const b = filt('bandpass', 700 + r * 300, 2); b.connect(g); this.noiseSrc(t, t + 0.15, b);
        const g2 = gainNode(0.4, 0.002, 0.1);
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08); o.connect(g2); o.start(t); o.stop(t + 0.15);
        break;
      }
      case 'mine': {
        const g = gainNode(0.18, 0.001, 0.25);
        for (const f of [1800, 2650, 3900]) this.osc('sine', f * (0.95 + r * 0.1), t, t + 0.3, g);
        const g2 = gainNode(0.3, 0.001, 0.06);
        const b = filt('highpass', 2500); b.connect(g2); this.noiseSrc(t, t + 0.08, b);
        break;
      }
      case 'hammer': {
        const g = gainNode(0.35, 0.001, 0.09);
        const b = filt('bandpass', 1200 + r * 400, 4); b.connect(g); this.noiseSrc(t, t + 0.1, b);
        const g2 = gainNode(0.2, 0.001, 0.12);
        this.osc('triangle', 420 + r * 60, t, t + 0.15, g2);
        break;
      }
      case 'hit': {
        // choc d'épées
        const g = gainNode(0.2, 0.001, 0.22);
        for (const f of [1650, 2380, 3170, 4400]) this.osc('square', f * (0.97 + r * 0.06), t, t + 0.25, (() => { const b = filt('bandpass', f, 8); b.connect(g); return b; })());
        const g2 = gainNode(0.35, 0.001, 0.05);
        const b = filt('highpass', 3000); b.connect(g2); this.noiseSrc(t, t + 0.06, b);
        break;
      }
      case 'arrow': {
        const g = gainNode(0.22, 0.01, 0.18);
        const b = filt('bandpass', 2500, 1.5);
        b.frequency.setValueAtTime(3500, t); b.frequency.exponentialRampToValueAtTime(900, t + 0.2);
        b.connect(g); this.noiseSrc(t, t + 0.25, b);
        break;
      }
      case 'launch': {
        const g = gainNode(0.4, 0.005, 0.3);
        const b = filt('lowpass', 600); b.connect(g); this.noiseSrc(t, t + 0.35, b);
        const g2 = gainNode(0.3, 0.002, 0.2);
        this.osc('triangle', 90, t, t + 0.25, g2);
        break;
      }
      case 'boom': {
        const g = gainNode(0.8, 0.003, 0.7);
        const b = filt('lowpass', 300); b.connect(g); this.noiseSrc(t, t + 0.8, b);
        const g2 = gainNode(0.6, 0.002, 0.5);
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.4); o.connect(g2); o.start(t); o.stop(t + 0.6);
        break;
      }
      case 'death': {
        const g = gainNode(0.3, 0.005, 0.25);
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(260 + r * 80, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
        const b = filt('lowpass', 900); o.connect(b); b.connect(g); o.start(t); o.stop(t + 0.3);
        break;
      }
      case 'collapse': {
        const g = gainNode(0.9, 0.02, 1.6);
        const b = filt('lowpass', 500); b.connect(g); this.noiseSrc(t, t + 1.8, b);
        for (let i = 0; i < 5; i++) {
          const tt = t + i * 0.18 + Math.random() * 0.1;
          const g2 = ctx.createGain(); this.env(g2, tt, 0.002, 0.3 * vol, 0, 0.15); g2.connect(out);
          const b2 = filt('bandpass', 400 + Math.random() * 600, 2); b2.connect(g2); this.noiseSrc(tt, tt + 0.2, b2);
        }
        break;
      }
      case 'built': this.jingle([0, 4, 7, 12], 0.09, 'pluck', vol); break;
      case 'trained': this.jingle([7, 12], 0.12, 'horn', vol * 0.8); break;
      case 'tech': this.jingle([0, 5, 9, 12], 0.1, 'pluck', vol); break;
      case 'age': this.jingle([0, 7, 12, 7, 12, 16, 19], 0.16, 'horn', vol); break;
      case 'alert': this.jingle([0, 0, 5], 0.35, 'horn', vol, 50); break;
      case 'victory': this.jingle([0, 4, 7, 12, 16, 19, 24], 0.2, 'horn', vol); break;
      case 'defeat': this.jingle([12, 10, 8, 7, 3, 0], 0.32, 'horn', vol, 52); break;
      case 'click': {
        const g = gainNode(0.2, 0.001, 0.04);
        const b = filt('bandpass', 1800, 3); b.connect(g); this.noiseSrc(t, t + 0.05, b);
        break;
      }
      case 'select': {
        const g = gainNode(0.15, 0.002, 0.12);
        this.osc('triangle', 660, t, t + 0.15, g);
        break;
      }
      case 'order': {
        const g = gainNode(0.12, 0.002, 0.1);
        this.osc('triangle', 520, t, t + 0.06, g); this.osc('triangle', 780, t + 0.05, t + 0.14, g);
        break;
      }
      default:
    }
  }

  jingle(intervals, step, voice, vol, base = 62) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    intervals.forEach((iv, i) => {
      const t = t0 + i * step;
      const f = mtof(base + iv);
      const g = ctx.createGain(); g.connect(this.sfx);
      if (voice === 'horn') {
        // cor : cuivre filtré avec attaque douce
        const len = i === intervals.length - 1 ? step * 3 : step * 1.1;
        this.env(g, t, 0.04, 0.12 * vol, len, 0.2);
        const b = ctx.createBiquadFilter(); b.type = 'lowpass';
        b.frequency.setValueAtTime(400, t); b.frequency.linearRampToValueAtTime(f * 4, t + 0.08);
        b.connect(g);
        this.osc('sawtooth', f, t, t + len + 0.3, b, -5);
        this.osc('sawtooth', f, t, t + len + 0.3, b, 6);
      } else {
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        const b = ctx.createBiquadFilter(); b.type = 'lowpass';
        b.frequency.setValueAtTime(f * 8, t); b.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4);
        b.connect(g);
        this.osc('sawtooth', f * 2, t, t + 1.3, b);
      }
    });
  }
}

function localGet(k) { try { return localStorage.getItem('adr_' + k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem('adr_' + k, String(v)); } catch { /* ignore */ } }
