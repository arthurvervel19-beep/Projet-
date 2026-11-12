// Interface : souris, clavier, caméra, panneau de commandes, informations, messages.
import { UNITS, BUILDINGS, TECHS, AGES, BUILD_PAGES, RES_NAME, CIVS } from './config.js';
import { icon, techIcon, resImg, costHTML, resIconURL } from './icons.js';

const RI = (k) => resImg(k);
const fmtTime = (t) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const HOTKEYS = 'QWERTYASDFGHZXCVBN';

export class UI {
  constructor(game, renderer, me, audio = null) {
    this.audio = audio;
    this.g = game;
    this.r = renderer;
    this.me = me;
    this.selected = new Set();
    this.groups = {};
    this.placing = null;
    this.dragBox = null;
    this.mouse = { x: 0, y: 0, inside: false };
    this.keys = new Set();
    this.pings = [];
    this.marker = null;
    this.mode = null; // 'attackMove'
    this.cmdSig = '';
    this.buttons = [];
    this.hudTimer = 0;
    this.lastClick = { t: 0, id: 0 };
    this.paused = false;
    this.el = (id) => document.getElementById(id);
    this.canvas = renderer.canvas;
    this.minimap = this.el('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.setupMinimap();
    this.bind();
    document.querySelectorAll('img.ri').forEach((im) => { im.src = resIconURL(im.dataset.res); });
  }

  setupMinimap() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.minimap.clientWidth || 280, h = this.minimap.clientHeight || 140;
    this.minimap.width = w * dpr; this.minimap.height = h * dpr;
    this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mmW = w; this.mmH = h;
    this.r.minimapBase = null;
    this.mmTimer = 0; // redessinée dès la prochaine image (la toile vient d'être vidée)
  }

  // ------------------------------------------------------------------ événements
  listen(t, ev, fn, o) { t.addEventListener(ev, fn, o); this.listeners.push([t, ev, fn, o]); }

  destroy() {
    for (const [t, ev, fn, o] of this.listeners) t.removeEventListener(ev, fn, o);
    this.listeners = [];
  }

  bind() {
    this.listeners = [];
    const c = this.canvas;
    // après un toucher, le navigateur simule des événements de souris : la carte les ignore
    this.lastTouch = -1e9;
    const touched = () => { this.lastTouch = performance.now(); };
    this.listen(window, 'touchstart', touched, { capture: true, passive: true });
    this.listen(window, 'touchend', touched, { capture: true, passive: true });
    const real = (fn) => (e) => { if (performance.now() - this.lastTouch > 900) fn(e); };
    this.listen(c, 'contextmenu', (e) => e.preventDefault());
    this.listen(c, 'mousedown', real((e) => this.onDown(e)));
    this.listen(window, 'mousemove', real((e) => this.onMove(e)));
    this.listen(window, 'mouseup', real((e) => this.onUp(e)));
    this.listen(document, 'mouseleave', () => { this.mouse.inside = false; });
    this.listen(document, 'mouseenter', () => { this.mouse.inside = true; });
    this.listen(c, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(window, 'keydown', (e) => this.onKey(e));
    this.listen(window, 'keyup', (e) => this.keys.delete(e.key));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen(window, 'resize', () => { this.r.resize(); this.setupMinimap(); });

    // minicarte
    let mmDrag = false;
    const mmMove = (e) => {
      const rect = this.minimap.getBoundingClientRect();
      const w = this.r.minimapToWorld(e.clientX - rect.left, e.clientY - rect.top, this.mmW, this.mmH);
      return w;
    };
    this.listen(this.minimap, 'contextmenu', (e) => e.preventDefault());
    this.listen(this.minimap, 'mousedown', (e) => {
      if (performance.now() - this.lastTouch < 900) return;
      const w = mmMove(e);
      if (e.button === 2) { this.commandAt(w.x, w.y, null, e.shiftKey); return; }
      mmDrag = true; this.r.centerOn(w.x, w.y);
    });
    this.listen(window, 'mousemove', (e) => { if (mmDrag) { const w = mmMove(e); this.r.centerOn(w.x, w.y); } });
    this.listen(window, 'mouseup', () => { mmDrag = false; });

    // panneaux (délégation : fonctionne même si le contenu est régénéré)
    const cmds = this.el('commands');
    this.listen(cmds, 'mousedown', (e) => {
      const b = e.target.closest('[data-btn]');
      if (!b) return;
      e.preventDefault();
      const btn = this.buttons[+b.dataset.btn];
      if (!btn) return;
      if (this.touchMode && btn.danger) {
        // au doigt, une destruction demande un second appui
        const now = performance.now();
        if (this.armed !== btn.tip || now - this.armedT > 2500) { this.armed = btn.tip; this.armedT = now; this.sound('click'); this.msg('Touchez de nouveau pour confirmer.', 'warn'); return; }
        this.armed = null;
      }
      this.sound('click'); btn.action(e);
    });
    const info = this.el('info');
    this.listen(info, 'mousedown', (e) => {
      const q = e.target.closest('[data-cancel]');
      if (q) { this.g.issue(this.me, { type: 'cancel', building: +q.dataset.b, index: +q.dataset.cancel }); this.hudTimer = 0; return; }
      const m = e.target.closest('[data-sel]');
      if (m) {
        const id = +m.dataset.sel;
        if (e.shiftKey) this.selected.delete(id); else { this.selected = new Set([id]); }
        this.hudTimer = 0;
      }
    });
    const tip = this.el('tooltip');
    const showTip = (e) => {
      const t = e.target.closest('[data-tip], [data-btn]');
      if (!t) { tip.classList.add('hidden'); return; }
      let html = t.dataset.btn !== undefined ? (this.buttons[+t.dataset.btn] || {}).tip : t.dataset.tip;
      if (!html) { tip.classList.add('hidden'); return; }
      // au doigt, les raccourcis du clavier n'ont pas de sens
      if (this.touchMode) html = html.replace(/ \((?:[A-Z.]|Suppr|Échap)\)/g, '').replace(/ — Maj\+clic : ×5/, '').replace(/ \(touche \.\)| — clic pour annuler/g, (m) => (m.includes('annuler') ? ' — touchez pour annuler' : ''));
      tip.innerHTML = html;
      tip.classList.remove('hidden');
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 14) + 'px';
      tip.style.top = Math.max(8, e.clientY - r.height - 12) + 'px';
    };
    for (const el of [cmds, info, this.el('topbar')]) {
      this.listen(el, 'mousemove', real(showTip));
      this.listen(el, 'mouseleave', real(() => tip.classList.add('hidden')));
      // au doigt : l'info-bulle s'affiche au toucher, au-dessus du panneau, puis s'efface
      this.listen(el, 'touchstart', (e) => {
        this.setTouchMode();
        const t = e.touches[0];
        showTip({ target: e.target, clientX: t.clientX, clientY: t.clientY });
        if (tip.classList.contains('hidden')) return;
        const r = tip.getBoundingClientRect();
        const top = el === this.el('topbar') ? el.getBoundingClientRect().bottom + 8 : this.el('bottom').getBoundingClientRect().top - r.height - 8;
        tip.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, t.clientX - r.width / 2)) + 'px';
        tip.style.top = Math.max(8, top) + 'px';
        clearTimeout(this.tipTimer);
        this.tipTimer = setTimeout(() => tip.classList.add('hidden'), 2600);
      }, { passive: true });
    }
    this.listen(this.el('idle-btn'), 'click', () => this.selectIdleVillager());
    this.bindTouch();
  }

  // ------------------------------------------------------------------ tactile
  // Un doigt : toucher = sélectionner ou donner un ordre, glisser = déplacer la vue,
  // appui long puis glisser = zone de sélection. Deux doigts : zoom et déplacement.
  setTouchMode() {
    if (this.touchMode) return;
    this.touchMode = true;
    document.body.classList.add('touch');
    this.cmdSig = ''; this.hudTimer = 0;
  }

  bindTouch() {
    if (document.body.classList.contains('touch')) this.touchMode = true;
    const c = this.canvas, opt = { passive: false };
    const LIFT = 44; // le bâtiment glissé reste visible au-dessus du doigt
    const T = this.tch = { mode: null, x0: 0, y0: 0, x: 0, y: 0, timer: 0, long: false, pinch: null };
    const clearTimer = () => { if (T.timer) { clearTimeout(T.timer); T.timer = 0; } };
    const startPinch = (e) => {
      clearTimer();
      if (T.mode === 'box') this.dragBox = null;
      if (T.mode === 'line' && this.placing) { this.placing.lineStart = null; this.placing.tiles = null; }
      const a = e.touches[0], b = e.touches[1];
      T.mode = 'pinch';
      T.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    };
    this.listen(c, 'touchstart', (e) => {
      e.preventDefault();
      this.setTouchMode();
      this.el('tooltip').classList.add('hidden');
      if (this.paused) return;
      if (e.touches.length >= 2) { startPinch(e); return; }
      const t = e.touches[0];
      Object.assign(T, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, mode: 'tap', long: false });
      if (this.placing) {
        const def = BUILDINGS[this.placing.type];
        const w = this.worldAt(t.clientX, t.clientY);
        if (def.wall && !def.gate) { this.placing.lineStart = [Math.floor(w.x), Math.floor(w.y)]; T.mode = 'line'; } else T.mode = 'place';
        this.updatePlacement(w);
        return;
      }
      if (this.boxMode) { T.mode = 'box'; return; }
      T.timer = setTimeout(() => {
        T.timer = 0;
        if (T.mode !== 'tap') return;
        T.mode = 'box'; T.long = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* sans vibreur */ }
      }, 380);
    }, opt);
    this.listen(c, 'touchmove', (e) => {
      e.preventDefault();
      if (this.paused || !T.mode) return;
      if (e.touches.length >= 2) {
        if (T.mode !== 'pinch') startPinch(e);
        const a = e.touches[0], b = e.touches[1], P = T.pinch;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
        this.r.panBy(-(cx - P.cx), -(cy - P.cy));
        const f = d / P.d;
        if (Math.abs(f - 1) > 0.003) this.r.zoomAt(cx, cy, Math.max(0.6, Math.min(1.6, f)));
        P.d = d; P.cx = cx; P.cy = cy;
        return;
      }
      if (T.mode === 'pinch') return;
      const t = e.touches[0];
      const dx = t.clientX - T.x, dy = t.clientY - T.y;
      T.x = t.clientX; T.y = t.clientY;
      const far = Math.hypot(T.x - T.x0, T.y - T.y0) > 10;
      if (T.mode === 'tap' && far) { clearTimer(); T.mode = 'pan'; }
      if (T.mode === 'pan') this.r.panBy(-dx, -dy);
      else if (T.mode === 'box') { if (far) this.dragBox = { x0: T.x0, y0: T.y0, x1: T.x, y1: T.y }; }
      else if (T.mode === 'place' && this.placing) this.updatePlacement(this.worldAt(T.x, T.y - (far ? LIFT : 0)));
      else if (T.mode === 'line' && this.placing) this.updatePlacement(this.worldAt(T.x, T.y));
    }, opt);
    const end = (e) => {
      e.preventDefault();
      clearTimer();
      if (e.touches.length > 0) {
        // un doigt reste posé après un pincement : il continue à déplacer la vue
        if (T.mode === 'pinch' && e.touches.length === 1) { const t = e.touches[0]; T.mode = 'pan'; T.x = t.clientX; T.y = t.clientY; }
        return;
      }
      const mode = T.mode;
      T.mode = null;
      if (this.paused || e.type === 'touchcancel') { this.dragBox = null; if (this.placing) { this.placing.lineStart = null; this.placing.tiles = null; } return; }
      if (mode === 'tap') this.tapAt(T.x, T.y);
      else if (mode === 'box') {
        if (this.dragBox) this.finishBox(false);
        else if (T.long) this.longPressAt(T.x, T.y);
        else this.tapAt(T.x, T.y);
      } else if (mode === 'line' && this.placing) this.finishLine(false);
      this.hudTimer = 0;
    };
    this.listen(c, 'touchend', end, opt);
    this.listen(c, 'touchcancel', end, opt);

    // minicarte au doigt
    const mm = (e) => {
      e.preventDefault();
      this.setTouchMode();
      const t = e.touches[0];
      if (!t) return;
      const rect = this.minimap.getBoundingClientRect();
      const w = this.r.minimapToWorld(t.clientX - rect.left, t.clientY - rect.top, this.mmW, this.mmH);
      this.r.centerOn(w.x, w.y);
    };
    this.listen(this.minimap, 'touchstart', mm, opt);
    this.listen(this.minimap, 'touchmove', mm, opt);

    // barre d'outils tactile
    const tb = (id, fn) => { const b = this.el(id); if (b) this.listen(b, 'click', (e) => { e.preventDefault(); this.sound('click'); fn(); this.hudTimer = 0; b.blur(); }); };
    tb('tb-ok', () => { if (this.placing) this.placeBuilding(false); });
    tb('tb-cancel', () => this.cancelAll());
    tb('tb-box', () => { this.boxMode = !this.boxMode; if (this.boxMode) this.msg('Sélection par zone : glissez le doigt autour de vos unités.'); });
    tb('tb-army', () => this.selectArmy());
  }

  // annule la pose, le mode en cours ou la sélection (touche Échap, bouton ✕)
  cancelAll() {
    if (this.placing || this.mode) { this.placing = null; this.mode = null; return true; }
    if (this.boxMode) { this.boxMode = false; return true; }
    if (this.selected.size) { this.selected.clear(); return true; }
    return false;
  }

  selectArmy() {
    const army = this.g.units.filter((u) => !u.dead && u.owner === this.me && u.type !== 'villager');
    if (!army.length) { this.msg("Vous n'avez pas encore d'armée.", 'warn'); return; }
    this.selected = new Set(army.map((u) => u.id));
    this.announce(army, 'select');
    this.msg(`${army.length} unité${army.length > 1 ? 's' : ''} militaire${army.length > 1 ? 's' : ''} sélectionnée${army.length > 1 ? 's' : ''}.`);
  }

  // cible sous le doigt, avec une tolérance autour des unités (elles sont petites à l'écran)
  pickTouch(sx, sy) {
    const direct = this.pick(sx, sy);
    if (direct && direct.kind === 'unit') return direct;
    const g = this.g, vis = g.players[this.me].visible, W = g.map.w;
    const lift = this.r.pick ? 0 : 12 * this.r.cam.zoom;
    let best = null, bestD = 30;
    for (const u of g.units) {
      if (u.dead || (u.owner !== this.me && !vis[Math.floor(u.y) * W + Math.floor(u.x)])) continue;
      const p = this.r.toScreen(u.x, u.y, 0.45);
      const d = Math.hypot(p.x - sx, p.y - lift - sy) + (u.owner === this.me ? 0 : 4);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best || direct;
  }

  // toucher bref : sélection, ou ordre si des unités sont déjà sélectionnées
  tapAt(sx, sy) {
    const w = this.worldAt(sx, sy);
    const t = this.pickTouch(sx, sy);
    if (this.mode === 'attackMove') { this.attackMoveAt(w, t, false); return; }
    const now = performance.now();
    const mine = !!t && t.owner === this.me;
    if (mine && t.kind === 'unit' && this.lastClick.id === t.id && now - this.lastClick.t < 400) { this.selectSameType(t); this.lastClick = { t: 0, id: 0 }; return; }
    const units = this.myUnits();
    let order = false;
    if (units.length) {
      if (!t || !mine) order = true; // sol, ressource, ennemi
      else if (t.kind === 'building') {
        // bâtiment allié : seulement s'il y a quelque chose à y faire
        const def = BUILDINGS[t.type], vils = units.filter((u) => u.type === 'villager');
        order = vils.length > 0 && (!t.built || t.hp < t.maxHp || !!def.farm || (!!def.drop && vils.some((v) => v.carry.amount > 0 && def.drop.includes(v.carry.type))));
      }
    } else if (!t || t.kind === 'resource') {
      // point de ralliement d'un bâtiment de production
      order = [...this.selected].some((id) => { const b = this.g.get(id); return b && b.kind === 'building' && b.owner === this.me && b.built && BUILDINGS[b.type].trains; });
    }
    if (order) { this.commandAt(w.x, w.y, t, false); return; }
    if (t) {
      this.selected = new Set([t.id]);
      if (mine) { this.sound('select'); if (t.kind === 'unit') this.announce([t], 'select'); } else if (t.kind === 'resource' && t.type === 'sheep') this.sound('bleat');
      this.lastClick = { t: now, id: t.id };
    } else this.selected.clear();
  }

  // appui long sans glisser : toutes les unités du même type, ou tout désélectionner
  longPressAt(sx, sy) {
    const t = this.pickTouch(sx, sy);
    if (t && t.owner === this.me && t.kind === 'unit') this.selectSameType(t);
    else this.cancelAll();
  }

  worldAt(sx, sy) { return this.r.toWorld(sx, sy); }

  onDown(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.paused) return;
    if (e.button === 1) { this.pan = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    const w = this.worldAt(e.clientX, e.clientY);
    if (e.button === 2) {
      if (this.placing) { this.placing = null; return; }
      if (this.mode) { this.mode = null; return; }
      const target = this.pick(e.clientX, e.clientY);
      this.commandAt(w.x, w.y, target, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) {
      const def = BUILDINGS[this.placing.type];
      if (def.wall && !def.gate) { this.placing.lineStart = [Math.floor(w.x), Math.floor(w.y)]; this.updatePlacement(w); return; }
      this.placeBuilding(e.shiftKey);
      return;
    }
    if (this.mode === 'attackMove') { this.attackMoveAt(w, this.pick(e.clientX, e.clientY), e.shiftKey); return; }
    this.dragStart = { x: e.clientX, y: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey };
  }

  attackMoveAt(w, target, keep) {
    const ids = this.myUnits().map((u) => u.id);
    if (target && this.g.isEnemy(this.me, target.owner)) this.g.issue(this.me, { type: 'attack', ids, target: target.id });
    else this.g.issue(this.me, { type: 'move', ids, x: w.x, y: w.y, aggressive: true });
    this.sound('order');
    this.marker = { x: w.x, y: w.y, t: performance.now() / 1000, color: '#ff6b5e' };
    if (!keep) this.mode = null;
    this.hudTimer = 0;
  }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.pan) {
      this.r.panBy(-(e.clientX - this.pan.x), -(e.clientY - this.pan.y));
      this.pan.x = e.clientX; this.pan.y = e.clientY;
      return;
    }
    if (this.placing) this.updatePlacement(this.worldAt(e.clientX, e.clientY));
    if (this.dragStart) {
      const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.dragBox = { x0: this.dragStart.x, y0: this.dragStart.y, x1: e.clientX, y1: e.clientY };
    }
    this.updateCursor(e);
  }

  updateCursor(e) {
    if (e.target !== this.canvas) return;
    let cur = 'default';
    if (this.placing) cur = 'crosshair';
    else if (this.mode === 'attackMove') cur = 'crosshair';
    else if (this.hasOwnUnits()) {
      // limite la fréquence des tests de survol (lancer de rayon)
      const now = performance.now();
      if (now - (this.lastHover || 0) < 70) return;
      this.lastHover = now;
      const t = this.pick(e.clientX, e.clientY);
      if (t && this.g.isEnemy(this.me, t.owner)) cur = 'crosshair';
      else if (t && (t.kind === 'resource' || (t.kind === 'building' && t.owner === this.me))) cur = 'pointer';
    }
    this.canvas.style.cursor = cur;
  }

  onUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button !== 0) return;
    if (this.placing && this.placing.lineStart) { this.finishLine(e.shiftKey); return; }
    if (!this.dragStart) return;
    const ds = this.dragStart;
    this.dragStart = null;
    if (this.dragBox) { this.finishBox(ds.shift); return; }
    const t = this.pick(e.clientX, e.clientY);
    const now = performance.now();
    if (t) {
      if (t.kind === 'unit' && t.owner === this.me && this.lastClick.id === t.id && now - this.lastClick.t < 350) {
        this.selectSameType(t); // double-clic
      } else if (ds.shift && t.owner === this.me && t.kind === 'unit') {
        if (this.selected.has(t.id)) this.selected.delete(t.id); else this.selected.add(t.id);
        // ne pas mélanger avec des bâtiments
        for (const id of [...this.selected]) { const x = this.g.get(id); if (!x || x.kind !== 'unit') this.selected.delete(id); }
      } else {
        this.selected = new Set([t.id]);
        if (t.owner === this.me) { this.sound('select'); if (t.kind === 'unit') this.announce([t], 'select'); }
        else if (t.kind === 'resource' && t.type === 'sheep') this.sound('bleat');
      }
      this.lastClick = { t: now, id: t.id };
    } else if (!ds.shift) this.selected.clear();
    this.hudTimer = 0;
  }

  // fin du tracé d'un mur : pose les fondations le long de la ligne
  finishLine(keep) {
    const tiles = this.placing.tiles || [];
    const ids = this.myVillagers().map((u) => u.id);
    if (tiles.length && ids.length) {
      const ok = this.g.issue(this.me, { type: 'buildLine', ids, building: this.placing.type, tiles });
      if (!ok) this.msg('Emplacement invalide.', 'warn');
    }
    if (!keep) this.placing = null; else { this.placing.lineStart = null; this.placing.tiles = null; }
    this.hudTimer = 0;
  }

  // fin d'une sélection par zone
  finishBox(add) {
    const b = this.dragBox;
    this.dragBox = null;
    if (!b) return;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const list = this.g.units.filter((u) => u.owner === this.me && !u.dead && (() => {
      const p = this.r.toScreen(u.x, u.y);
      return p.x >= x0 && p.x <= x1 && p.y - 10 * this.r.cam.zoom >= y0 - 10 && p.y - 10 * this.r.cam.zoom <= y1 + 10;
    })());
    if (!add) this.selected.clear();
    list.forEach((u) => this.selected.add(u.id));
    if (list.length) this.announce(list, 'select');
    this.hudTimer = 0;
  }

  // toutes les unités du même type visibles à l'écran
  selectSameType(t) {
    this.selected.clear();
    for (const u of this.g.units) {
      if (u.dead || u.owner !== this.me || u.type !== t.type) continue;
      const p = this.r.toScreen(u.x, u.y);
      if (p.x >= 0 && p.y >= 0 && p.x <= this.r.w && p.y <= this.r.h) this.selected.add(u.id);
    }
    this.announce([t], 'select');
    this.hudTimer = 0;
  }

  onWheel(e) {
    e.preventDefault();
    const f = Math.pow(1.0015, -e.deltaY);
    this.r.zoomAt(e.clientX, e.clientY, Math.max(0.8, Math.min(1.25, f)));
  }

  onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const k = e.key;
    this.keys.add(k);
    if (k === 'Escape') {
      if (this.cancelAll()) { this.hudTimer = 0; return; }
      this.onPause && this.onPause();
      return;
    }
    if (this.paused) return;
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups[k] = [...this.selected]; this.msg(`Groupe ${k} créé.`); return; }
      const ids = (this.groups[k] || []).filter((id) => this.g.get(id));
      if (ids.length) {
        const now = performance.now();
        if (this.lastGroup === k && now - this.lastGroupT < 400) { const u = this.g.get(ids[0]); this.r.centerOn(u.x, u.y); }
        this.lastGroup = k; this.lastGroupT = now;
        this.selected = new Set(ids); this.hudTimer = 0;
        this.announce(ids.map((id) => this.g.get(id)), 'select');
      }
      return;
    }
    if (k === 'Delete') { this.g.issue(this.me, { type: 'delete', ids: [...this.selected] }); this.selected.clear(); return; }
    if (k === '.') { this.selectIdleVillager(); return; }
    if (k.startsWith('Arrow')) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const up = k.toUpperCase();
    this.buttons = this.computeButtons();
    const btn = this.buttons.find((b) => b.key === up);
    if (btn) { btn.action(e); return; }
    if (up === 'H') {
      const tc = this.g.buildings.find((b) => b.owner === this.me && b.type === 'town_center');
      if (tc) { this.selected = new Set([tc.id]); this.r.centerOn(tc.x, tc.y); this.hudTimer = 0; }
    }
    if (k === ' ') {
      const id = [...this.selected][0]; const ent = id && this.g.get(id);
      if (ent) this.r.centerOn(ent.x, ent.y);
    }
  }

  // ------------------------------------------------------------------ sélection et ordres
  pick(sx, sy) {
    if (this.r.pick) return this.r.pick(sx, sy);
    const g = this.g, r = this.r, me = this.me;
    const z = r.cam.zoom;
    const pl = g.players[me];
    let best = null, bestD = Infinity;
    for (const u of g.units) {
      if (u.dead) continue;
      if (u.owner !== me && !pl.visible[Math.floor(u.y) * g.map.w + Math.floor(u.x)]) continue;
      const p = r.toScreen(u.x, u.y);
      const big = UNITS[u.type].cls === 'cavalry' || UNITS[u.type].cls === 'siege';
      const hw = (big ? 15 : 9) * z, top = (big ? 34 : 26) * z;
      if (sx >= p.x - hw && sx <= p.x + hw && sy >= p.y - top && sy <= p.y + 5 * z) {
        const d = Math.hypot(sx - p.x, sy - (p.y - top / 2)) - (u.y + u.x) * 0.01;
        if (d < bestD) { bestD = d; best = u; }
      }
    }
    if (best) return best;
    // bâtiments et ressources : on teste plusieurs hauteurs
    for (let k = 0; k <= 90; k += 6) {
      const w = r.toWorld(sx, sy + k * z);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (tx < 0 || ty < 0 || tx >= g.map.w || ty >= g.map.h) continue;
      const i = ty * g.map.w + tx;
      if (!pl.explored[i]) continue;
      const id = g.map.occ[i] || g.map.farm[i];
      if (!id) continue;
      const e = g.get(id);
      if (!e) continue;
      if (e.kind === 'resource' && k > (e.type === 'tree' ? 50 : 20)) continue;
      if (e.kind === 'building') {
        const def = BUILDINGS[e.type];
        const h = def.farm ? 0 : !e.built ? 20 : e.type === 'tower' ? 80 : e.type === 'fortress' ? 100 : 30 + e.size * 14;
        if (k > h) continue;
        if (!g.isVisible(me, e)) continue;
      }
      return e;
    }
    return null;
  }

  myUnits() { return [...this.selected].map((id) => this.g.get(id)).filter((u) => u && u.kind === 'unit' && u.owner === this.me); }
  myVillagers() { return this.myUnits().filter((u) => u.type === 'villager'); }
  hasOwnUnits() { return this.myUnits().length > 0; }

  commandAt(x, y, target, shift) {
    const units = this.myUnits();
    const t = performance.now() / 1000;
    if (units.length) {
      const kind = this.g.smartCommand(this.me, units.map((u) => u.id), x, y, target);
      this.sound('order');
      let act = kind === 'attack' ? 'attack' : kind === 'build' ? 'build' : 'order';
      if (kind === 'gather' && target) act = this.g.resTypeOf(target) || 'order';
      this.announce(units, act);
      this.marker = { x: target ? target.x : x, y: target ? target.y : y, t, color: kind === 'attack' ? '#ff6b5e' : kind === 'move' ? '#7dff7a' : '#ffe066' };
      void shift;
      return;
    }
    // point de ralliement des bâtiments
    const blds = [...this.selected].map((id) => this.g.get(id)).filter((b) => b && b.kind === 'building' && b.owner === this.me && BUILDINGS[b.type].trains);
    for (const b of blds) this.g.issue(this.me, { type: 'rally', building: b.id, x, y, target: target && target.kind !== 'unit' ? target.id : 0 });
    if (blds.length) this.marker = { x, y, t, color: '#7dff7a' };
  }

  selectIdleVillager() {
    const idle = this.g.units.filter((u) => u.owner === this.me && u.type === 'villager' && !u.order);
    if (!idle.length) return;
    this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length;
    const u = idle[this.idleIdx];
    this.selected = new Set([u.id]);
    this.r.centerOn(u.x, u.y);
    this.hudTimer = 0;
  }

  startPlacing(type) {
    const p = this.g.players[this.me];
    const def = BUILDINGS[type];
    if (p.age < def.age) { this.msg(`Nécessite l'${AGES[def.age].name.slice(2)}.`, 'warn'); return; }
    if (!this.g.canAfford(p, def.cost)) { this.msg(this.g.missingText(p, def.cost), 'warn'); return; }
    this.placing = { type, tx: 0, ty: 0 };
    if (this.touchMode) {
      this.updatePlacement(this.worldAt(window.innerWidth / 2, window.innerHeight * 0.42));
      this.msg(def.wall && !def.gate ? 'Glissez le doigt pour tracer le mur.' : 'Touchez ou glissez pour placer, puis validez avec ✓.');
    } else this.updatePlacement(this.worldAt(this.mouse.x, this.mouse.y));
    this.hudTimer = 0;
  }

  updatePlacement(w) {
    const def = BUILDINGS[this.placing.type];
    this.placing.tx = Math.round(w.x - def.size / 2);
    this.placing.ty = Math.round(w.y - def.size / 2);
    if (def.wall && !def.gate && this.placing.lineStart) {
      const [x0, y0] = this.placing.lineStart, x1 = Math.floor(w.x), y1 = Math.floor(w.y);
      const tiles = [];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      let lx = null, ly = null;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (x1 - x0) * (n ? i / n : 0)), y = Math.round(y0 + (y1 - y0) * (n ? i / n : 0));
        // évite les trous en diagonale
        if (lx !== null && x !== lx && y !== ly) tiles.push([x, ly]);
        tiles.push([x, y]); lx = x; ly = y;
      }
      this.placing.tiles = tiles.slice(0, 40);
    } else if (def.wall && !def.gate) this.placing.tiles = [[Math.floor(w.x), Math.floor(w.y)]];
  }

  placeBuilding(shift) {
    const pl = this.placing;
    const ids = this.myVillagers().map((u) => u.id);
    if (!ids.length) { this.placing = null; return; }
    const ok = this.g.issue(this.me, { type: 'build', ids, building: pl.type, tx: pl.tx, ty: pl.ty });
    if (ok && !shift) this.placing = null;
    if (ok) this.hudTimer = 0;
  }

  msg(text, kind = 'info') {
    const box = this.el('messages');
    const d = document.createElement('div');
    d.className = kind; d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 4500);
  }

  // ------------------------------------------------------------------ mise à jour par image
  update(dt) {
    const r = this.r;
    // défilement de la caméra
    const sp = 1100 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    if (this.mouse.inside && !this.touchMode && !this.pan && !this.dragStart && document.hasFocus()) {
      const m = 6;
      if (this.mouse.x <= m) dx -= 1;
      if (this.mouse.x >= window.innerWidth - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1;
      if (this.mouse.y >= window.innerHeight - m) dy += 1;
    }
    if (dx || dy) r.panBy(dx * sp, dy * sp);

    // événements du jeu
    for (const ev of this.g.events) {
      if (ev.type === 'msg' && (ev.player === this.me || ev.player === -1)) this.msg(ev.text, ev.kind);
      if (ev.type === 'sfx') this.positional(ev);
      if (ev.type === 'attacked' && ev.player === this.me) {
        this.msg('Vous êtes attaqué !', 'alert');
        this.sound('alert');
        if (this.audio) this.audio.combat(4);
        this.pings.push({ x: ev.x, y: ev.y, t: performance.now() / 1000 });
        this.lastAlert = { x: ev.x, y: ev.y };
      }
      if (ev.type === 'age' && ev.player === this.me) { this.hudTimer = 0; this.sound('age'); }
      if (ev.type === 'trained' && ev.player === this.me) {
        this.hudTimer = 0; this.sound('trained', 0.6);
        const nu = this.g.get(ev.unit);
        if (nu && Math.random() < 0.6) this.announce([nu], 'trained');
      }
    }
    this.g.events.length = 0;
    if (this.audio) this.audio.setPhase(this.g.players[this.me].age);
    this.pings = this.pings.filter((p) => performance.now() / 1000 - p.t < 3);

    // nettoyage de la sélection
    for (const id of this.selected) if (!this.g.get(id)) this.selected.delete(id);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.refreshHUD(); }
    this.mmTimer = (this.mmTimer || 0) - dt;
    if (this.mmTimer <= 0) { this.mmTimer = 0.1; this.r.drawMinimap(this.mctx, this.mmW, this.mmH, this.pings); }
  }

  // ------------------------------------------------------------------ HUD
  refreshHUD() {
    const g = this.g, p = g.players[this.me];
    for (const k of ['food', 'wood', 'gold', 'stone']) {
      this.el('r-' + k).textContent = Math.floor(p.res[k]);
      const n = g.units.filter((u) => u.owner === this.me && u.order && u.order.kind === 'gather' && u.order.resType === k).length;
      this.el('v-' + k).textContent = n ? `(${n})` : '';
    }
    const popEl = this.el('r-pop');
    popEl.textContent = `${p.pop}/${p.popCap}`;
    popEl.style.color = p.pop >= p.popCap ? '#ff7a5a' : '';
    this.el('age-label').textContent = `${CIVS[p.civ] ? CIVS[p.civ].name + ' · ' : ''}${AGES[p.age].name}${p.agingUp ? ' ⏳' : ''}`;
    const s = Math.floor(g.time);
    this.el('clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.el('idle-count').textContent = g.units.filter((u) => u.owner === this.me && u.type === 'villager' && !u.order).length;
    this.renderInfo();
    this.renderCommands();
    this.renderCountdowns();
    this.renderTouchBar();
  }

  renderTouchBar() {
    const bar = this.el('touchbar');
    if (!bar) return;
    bar.classList.toggle('hidden', !this.touchMode);
    if (!this.touchMode) return;
    const pl = this.placing && !(BUILDINGS[this.placing.type].wall && !BUILDINGS[this.placing.type].gate);
    this.el('tb-ok').classList.toggle('hidden', !pl);
    this.el('tb-cancel').classList.toggle('hidden', !(this.placing || this.mode || this.selected.size || this.boxMode));
    this.el('tb-box').classList.toggle('on', !!this.boxMode);
    this.el('tb-box').classList.toggle('hidden', !!this.placing);
    this.el('tb-army').classList.toggle('hidden', !!this.placing);
  }

  sel() { return [...this.selected].map((id) => this.g.get(id)).filter(Boolean); }

  sound(kind, vol = 1) { if (this.audio) this.audio.sfxPlay(kind, vol); }

  // bandeau des comptes à rebours (merveilles et fusées)
  renderCountdowns() {
    const el = this.el('countdown');
    if (!el) return;
    const list = this.g.buildings.filter((b) => !b.dead && b.countdown !== undefined);
    if (!list.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = list.map((b) => {
      const p = this.g.players[b.owner], sp = BUILDINGS[b.type].space;
      return `<div class="cd ${b.owner === this.me ? 'mine' : 'enemy'}"><span class="dot" style="background:${p.color}"></span>${sp ? 'Lancement spatial' : 'Merveille'} — ${p.name} <b>${fmtTime(b.countdown)}</b></div>`;
    }).join('');
  }

  // réplique vocale de l'unité principale d'un groupe
  announce(units, action) {
    if (!this.audio) return;
    const list = units.filter((u) => u && u.kind === 'unit' && u.owner === this.me);
    if (!list.length) return;
    const mil = list.find((u) => u.type !== 'villager');
    const u = action === 'attack' && mil ? mil : (mil && list.filter((x) => x.type !== 'villager').length >= list.length / 2 ? mil : list[0]);
    this.audio.voice(u.type, action, 1, UNITS[u.type].cls);
  }

  // son spatialisé selon la position à l'écran
  positional(ev) {
    if (!this.audio) return;
    if (ev.ui) { if (ev.player === this.me) this.sound(ev.kind, 0.8); return; }
    const p = this.r.toScreen(ev.x, ev.y);
    const dx = (p.x - this.r.w / 2) / (this.r.w / 2), dy = (p.y - this.r.h / 2) / (this.r.h / 2);
    const d = Math.hypot(dx, dy);
    if (d > 1.5) return;
    if (!this.g.players[this.me].visible[Math.floor(ev.y) * this.g.map.w + Math.floor(ev.x)]) return;
    const vol = Math.max(0, 1 - d / 1.5) * (0.6 + 0.4 * Math.min(1, this.r.cam.zoom));
    if (['hit', 'arrow', 'boom', 'gunshot', 'mg', 'cannon', 'laser'].includes(ev.kind)) this.audio.combat(0.12);
    this.audio.sfxPlay(ev.kind, vol, dx * 0.7);
  }

  img(kind, type, owner = this.me) {
    const color = owner >= 0 ? this.g.players[owner].color : '#888888';
    return `<img src="${this.r.icon(kind, type, color)}" alt="">`;
  }

  iconOf(e) {
    if (e.kind === 'unit') return this.img('unit', e.type, e.owner);
    if (e.kind === 'building') return this.img('building', e.type, e.owner);
    return RI({ tree: 'wood', gold: 'gold', stone: 'stone', berries: 'food', sheep: 'food' }[e.type]);
  }

  portrait(e) {
    if (e.kind === 'resource') return '';
    const color = e.owner >= 0 ? this.g.players[e.owner].color : '#888888';
    return `<img class="portrait" src="${this.r.icon(e.kind, e.type, color)}" alt="">`;
  }

  renderInfo() {
    const g = this.g;
    const list = this.sel();
    const info = this.el('info');
    info.classList.toggle('empty', !list.length);
    if (!list.length) {
      const p = g.players[this.me];
      info.innerHTML = `<h3>${p.name}</h3><div class="row">${AGES[p.age].name}</div>
        <div class="row">Récolté : ${Object.entries(p.stats.gathered).map(([k, v]) => `<span class="stat">${RI(k)}<b>${v}</b></span>`).join(' ')}</div>
        <div class="row">Ennemis tués : <b>${p.stats.kills}</b> — Pertes : <b>${p.stats.losses}</b></div>
        <div class="row" style="margin-top:10px">Astuce : sélectionnez un villageois pour construire, ou l'hôtel de ville${this.touchMode ? '' : ' (H)'} pour former des villageois.</div>`;
      return;
    }
    if (list.length > 1) {
      const counts = {};
      list.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
      info.innerHTML = `<h3>${list.length} unités</h3><div class="row">${Object.entries(counts).map(([t, n]) => `${(UNITS[t] || BUILDINGS[t] || {}).name || t} ×${n}`).join(' · ')}</div>
        <div class="multi">${list.slice(0, 60).map((e) => `<div class="m" data-sel="${e.id}" data-tip="${(UNITS[e.type] || {}).name || ''}">${this.iconOf(e)}<div class="hb"><div style="width:${100 * e.hp / e.maxHp}%"></div></div></div>`).join('')}</div>`;
      return;
    }
    const e = list[0];
    const owner = e.owner >= 0 ? g.players[e.owner] : null;
    const ownerTxt = owner ? `<span style="color:${owner.color}">${owner.name}</span>` : 'Nature';
    let html = '';
    if (e.kind === 'resource') {
      const n = { tree: 'Arbre', gold: "Filon d'or", stone: 'Carrière de pierre', berries: 'Buisson de baies', sheep: 'Mouton' }[e.type];
      const rt = { tree: 'wood', gold: 'gold', stone: 'stone', berries: 'food', sheep: 'food' }[e.type];
      html = `<div class="head"><div class="portrait res">${RI(rt)}</div><div><h3>${n}</h3><div class="row owner">${ownerTxt}</div><div class="row keep"><span class="stat">${RI(rt)} Restant : <b>${Math.ceil(e.amount)}</b> / ${e.maxAmount}</span></div></div></div>`;
    } else if (e.kind === 'unit') {
      const st = g.unitStats(e.owner, e.type);
      html = `<div class="head">${this.portrait(e)}<div><h3>${st.name}</h3><div class="row owner">${ownerTxt}</div>
        <div class="hpbar"><div style="width:${100 * e.hp / e.maxHp}%"></div></div></div></div>
        <div class="row stats"><span class="stat" data-tip="Points de vie">${icon('heart')}<b>${Math.ceil(e.hp)}/${e.maxHp}</b></span><span class="stat" data-tip="Attaque">${icon('sword')}<b>${st.atk}</b></span>${st.range ? `<span class="stat" data-tip="Portée">${icon('range')}<b>${st.range}</b></span>` : ''}<span class="stat" data-tip="Armure (mêlée / perçage)">${icon('shield')}<b>${st.armor[0]}/${st.armor[1]}</b></span><span class="stat" data-tip="Champ de vision">${icon('eye')}<b>${st.los}</b></span></div>`;
      if (Object.keys(st.bonus || {}).length) html += `<div class="row">Bonus : ${Object.entries(st.bonus).map(([k, v]) => `+${v} contre ${{ cavalry: 'cavalerie', archer: 'archers', infantry: 'infanterie', building: 'bâtiments' }[k] || k}`).join(', ')}</div>`;
      if (e.type === 'villager') {
        const o = e.order;
        const act = !o ? 'Inactif' : o.kind === 'gather' ? `Récolte : ${RES_NAME[o.resType]}` : o.kind === 'build' ? 'Construit' : o.kind === 'drop' ? 'Dépose sa récolte' : o.kind === 'attack' ? 'Attaque' : 'Se déplace';
        html += `<div class="row">${act}${e.carry.amount ? ` — porte ${RI(e.carry.type)} <b>${e.carry.amount}</b>/${g.carryCap(e.owner)}` : ''}</div>`;
      }
      html += `<div class="row desc">${st.desc}</div>`;
    } else {
      const def = BUILDINGS[e.type];
      html = `<div class="head">${this.portrait(e)}<div><h3>${def.name}</h3><div class="row owner">${ownerTxt}</div>
        <div class="hpbar"><div style="width:${100 * e.hp / e.maxHp}%"></div></div></div></div>
        <div class="row stats"><span class="stat" data-tip="Points de vie">${icon('heart')}<b>${Math.ceil(e.hp)}/${e.maxHp}</b></span><span class="stat" data-tip="Armure (mêlée / perçage)">${icon('shield')}<b>${g.armorOf(e).join('/')}</b></span>${def.attack ? `<span class="stat" data-tip="Attaque">${icon('sword')}<b>${g.buildingAttack(e).atk}</b></span><span class="stat" data-tip="Portée">${icon('range')}<b>${g.buildingAttack(e).range}</b></span>` : ''}</div>`;
      if (!e.built) html += `<div class="row keep">En construction : <b>${Math.floor(e.progress * 100)}%</b></div>`;
      if (def.farm && e.built) html += `<div class="row keep"><span class="stat">${RI('food')} Nourriture restante : <b>${Math.ceil(e.food)}</b></span></div>`;
      if (def.pop) html += `<div class="row"><span class="stat">${icon('pop')} +${def.pop + (e.type === 'house' ? g.players[e.owner].mods.housePop : 0)} population</span></div>`;
      if (def.income && e.built) html += `<div class="row"><span class="stat">${RI('gold')} +${(def.income.gold * g.players[e.owner].mods.income.bank).toFixed(1)} or / s</span></div>`;
      if (def.gate && e.built) html += `<div class="row keep"><span class="stat">${icon(e.locked ? 'lock' : 'unlock')} ${e.locked ? 'Verrouillée : personne ne passe' : 'Ouverte à vos unités, fermée à l’ennemi'}</span></div>`;
      if (def.factory && e.built) html += `<div class="row"><span class="stat">${RI(e.mode || 'wood')} +${(1.5 * g.players[e.owner].mods.income.factory).toFixed(1)} ${RES_NAME[e.mode || 'wood'].toLowerCase()} / s</span></div>`;
      if (e.countdown !== undefined) html += `<div class="row keep"><span class="stat">${icon('clock')} ${def.space ? 'Lancement dans' : 'Victoire dans'} <b>${fmtTime(e.countdown)}</b></span></div>`;
      if (def.market && e.owner === this.me) {
        html += `<div class="row">Cours : ${Object.entries(g.marketPrices).map(([k, v]) => `<span class="stat">${RI(k)} achat <b>${v}</b> · vente <b>${Math.round(v * 0.7)}</b> ${RI('gold')}</span>`).join(' — ')}</div>`;
      }
      if (e.queue.length && e.owner === this.me) {
        html += '<div class="queue">' + e.queue.map((q, i) => {
          const qi = q.kind === 'unit' ? this.img('unit', q.id) : q.kind === 'tech' ? techIcon(q.id) : icon('ageUp');
          const name = q.kind === 'unit' ? UNITS[q.id].name : q.kind === 'tech' ? TECHS[q.id].name : AGES[q.id].name;
          return `<div class="q ${q.housed ? 'housed' : ''}" data-cancel="${i}" data-b="${e.id}" data-tip="${name} — clic pour annuler">${qi}${i === 0 ? `<div class="bar" style="width:${100 * q.t / q.time}%"></div>` : ''}</div>`;
        }).join('') + '</div>';
      }
      if (!e.queue.length || e.owner !== this.me) html += `<div class="row desc">${def.desc}</div>`;
    }
    info.innerHTML = html;
  }

  // Construit la liste des boutons de commande selon la sélection
  computeButtons() {
    const g = this.g, p = g.players[this.me];
    const list = this.sel().filter((e) => e.owner === this.me);
    const btns = [];
    const reqTxt = (age) => `<div class="no">Nécessite l'${AGES[age].name.slice(2)}</div>`;
    const costHtml = (cost) => `<div class="cost">${costHTML(cost)}</div>`;
    if (!list.length) return btns;
    const units = list.filter((e) => e.kind === 'unit');
    if (units.length) {
      if (units.some((u) => u.type === 'villager')) {
        const page = BUILD_PAGES[this.buildPage || 0];
        for (const type of page.list) {
          const def = BUILDINGS[type];
          const okAge = p.age >= def.age;
          btns.push({
            icon: this.img('building', type), key: def.hotkey, disabled: !okAge || !g.canAfford(p, def.cost),
            tip: `<b>${def.name}</b> (${def.hotkey})<div>${def.desc}</div>${costHtml(def.cost)}${okAge ? '' : reqTxt(def.age)}`,
            action: () => this.startPlacing(type),
          });
        }
        const other = BUILD_PAGES[(this.buildPage + 1) % BUILD_PAGES.length || 0] || BUILD_PAGES[1];
        btns.push({ icon: icon('menu'), key: 'V', badge: (this.buildPage || 0) + 1 + '/2', tip: `<b>Page suivante</b> (V)<div>Afficher : ${other.name}</div>`, action: () => { this.buildPage = ((this.buildPage || 0) + 1) % BUILD_PAGES.length; this.cmdSig = ''; this.hudTimer = 0; } });
      } else {
        btns.push({ icon: icon('attackMove'), key: 'Q', tip: '<b>Attaque-mouvement</b> (Q)<div>Se déplace en attaquant les ennemis rencontrés.</div>', action: () => { this.mode = 'attackMove'; } });
      }
      btns.push({ icon: icon('stop'), key: 'X', tip: '<b>Stop</b> (X)', action: () => this.g.issue(this.me, { type: 'stop', ids: units.map((u) => u.id) }) });
      btns.push({ icon: icon('delete'), key: null, danger: true, tip: '<b>Supprimer</b> (Suppr)', action: () => { this.g.issue(this.me, { type: 'delete', ids: units.map((u) => u.id) }); this.selected.clear(); } });
      return btns;
    }
    const b = list[0];
    if (b.kind !== 'building') return btns;
    const def = BUILDINGS[b.type];
    let hk = 0;
    const nextKey = () => HOTKEYS[hk++];
    if (b.built) {
      for (const type of def.trains || []) {
        const u = UNITS[type];
        if (u.civ && u.civ !== p.civ) continue;
        const okAge = p.age >= u.age;
        if (!okAge && u.age > p.age + 1) continue;
        const key = nextKey();
        const st = g.unitStats(this.me, type);
        btns.push({
          icon: this.img('unit', type), key, disabled: !okAge || !g.canAfford(p, u.cost),
          tip: `<b>${u.name}</b> (${key}) — Maj+clic : ×5<div>${u.desc}</div><div class="tip-stats">${icon('heart')} ${st.hp} ${icon('sword')} ${st.atk}${st.range ? ` ${icon('range')} ${st.range}` : ''} ${icon('shield')} ${st.armor.join('/')} ${icon('clock')} ${u.time}s</div>${costHtml(u.cost)}${okAge ? '' : reqTxt(u.age)}`,
          action: (e) => this.g.issue(this.me, { type: 'train', building: b.id, unit: type, count: e && e.shiftKey ? 5 : 1 }) && (this.hudTimer = 0),
        });
      }
      for (const tech of def.techs || []) {
        const t = TECHS[tech];
        if (p.techs.has(tech) || p.researching.has(tech)) continue;
        if (t.req && !p.techs.has(t.req)) continue;
        const okAge = p.age >= t.age;
        const key = nextKey();
        btns.push({
          icon: techIcon(tech), key, disabled: !okAge || !g.canAfford(p, t.cost),
          tip: `<b>${t.name}</b> (${key})<div>${t.desc}</div><div class="tip-stats">${icon('clock')} ${t.time}s</div>${costHtml(t.cost)}${okAge ? '' : reqTxt(t.age)}`,
          action: () => this.g.issue(this.me, { type: 'research', building: b.id, tech }) && (this.hudTimer = 0),
        });
      }
      if (b.type === 'town_center' && AGES[p.age + 1] && !p.agingUp) {
        const next = AGES[p.age + 1];
        const reqOk = g.ageRequirementMet(p);
        btns.push({
          icon: icon('ageUp'), key: 'Z', disabled: !reqOk || !g.canAfford(p, next.cost),
          tip: `<b>Passer à l'${next.name.slice(2)}</b> (Z)<div>Débloque de nouveaux bâtiments, unités et technologies.</div><div class="tip-stats">${icon('clock')} ${next.time}s</div>${costHtml(next.cost)}${reqOk ? '' : `<div class="no">${g.ageRequirementText(p)}</div>`}`,
          action: () => this.g.issue(this.me, { type: 'ageUp', building: b.id }) && (this.hudTimer = 0),
        });
      }
      if (def.gate) {
        btns.push({
          icon: icon(b.locked ? 'unlock' : 'lock'), key: 'L', badge: b.locked ? 'fermée' : '',
          tip: b.locked ? '<b>Déverrouiller la porte</b> (L)<div>Vos unités peuvent de nouveau la franchir.</div>' : '<b>Verrouiller la porte</b> (L)<div>Plus personne ne passe, même vos unités.</div>',
          action: () => { this.g.issue(this.me, { type: 'gateLock', building: b.id }); this.cmdSig = ''; this.hudTimer = 0; },
        });
      }
      if (def.factory) {
        for (const r of ['food', 'wood', 'gold', 'stone']) {
          const on = (b.mode || 'wood') === r;
          btns.push({ icon: resImg(r, 'mk'), badge: on ? 'actif' : '', key: nextKey(), tip: `<b>Produire : ${RES_NAME[r]}</b><div>L'usine produit cette ressource en continu.</div>`, action: () => { this.g.issue(this.me, { type: 'factoryMode', building: b.id, res: r }); this.cmdSig = ''; this.hudTimer = 0; } });
        }
      }
      if (def.market) {
        for (const r of ['food', 'wood', 'stone']) {
          btns.push({ icon: `${resImg(r, 'mk')}${icon('buy', 'mk-arrow buy')}`, badge: 'achat', key: nextKey(), tip: `<b>Acheter 100 ${RES_NAME[r]}</b><div>Coût : ${g.marketPrices[r]} ${RI('gold')}</div>`, action: () => this.g.issue(this.me, { type: 'market', action: 'buy', res: r }) });
        }
        for (const r of ['food', 'wood', 'stone']) {
          btns.push({ icon: `${resImg(r, 'mk')}${icon('sell', 'mk-arrow sell')}`, badge: 'vente', key: nextKey(), tip: `<b>Vendre 100 ${RES_NAME[r]}</b><div>Gain : ${Math.round(g.marketPrices[r] * 0.7)} ${RI('gold')}</div>`, action: () => this.g.issue(this.me, { type: 'market', action: 'sell', res: r }) });
        }
      }
    }
    btns.push({ icon: icon('delete'), key: null, danger: true, tip: '<b>Détruire le bâtiment</b> (Suppr)', action: () => { this.g.issue(this.me, { type: 'delete', ids: [b.id] }); this.selected.clear(); } });
    return btns;
  }

  renderCommands() {
    const btns = this.computeButtons();
    this.buttons = btns;
    const sig = btns.map((b) => b.icon + b.key + (b.disabled ? 1 : 0) + (b.badge || '')).join('|') + [...this.selected].join(',');
    this.el('commands').classList.toggle('empty', !btns.length);
    if (sig === this.cmdSig) return;
    this.cmdSig = sig;
    // la liste revient au début quand la sélection ou la page change, pas à chaque rafraîchissement
    const ctx = [...this.selected].join(',') + '|' + (this.buildPage || 0);
    if (ctx !== this.cmdCtx) { this.cmdCtx = ctx; this.el('commands').scrollLeft = 0; }
    this.el('commands').innerHTML = btns.map((b, i) => `<button class="cmd ${b.disabled ? 'disabled' : ''}" data-btn="${i}">${b.icon}${b.key ? `<span class="hk">${b.key}</span>` : ''}${b.badge ? `<span class="badge">${b.badge}</span>` : ''}</button>`).join('');
  }
}
