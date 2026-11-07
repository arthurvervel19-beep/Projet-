// Interface : souris, clavier, caméra, panneau de commandes, informations, messages.
import { UNITS, BUILDINGS, TECHS, AGES, BUILD_MENU, RES_ICON, RES_NAME, costText } from './config.js';

const HOTKEYS = 'QWERTYASDFGHZXCVBN';

export class UI {
  constructor(game, renderer, me) {
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
  }

  setupMinimap() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.minimap.clientWidth || 280, h = this.minimap.clientHeight || 140;
    this.minimap.width = w * dpr; this.minimap.height = h * dpr;
    this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mmW = w; this.mmH = h;
    this.r.minimapBase = null;
  }

  // ------------------------------------------------------------------ événements
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    document.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => { this.r.resize(); this.setupMinimap(); });

    // minicarte
    let mmDrag = false;
    const mmMove = (e) => {
      const rect = this.minimap.getBoundingClientRect();
      const w = this.r.minimapToWorld(e.clientX - rect.left, e.clientY - rect.top, this.mmW, this.mmH);
      return w;
    };
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
    this.minimap.addEventListener('mousedown', (e) => {
      const w = mmMove(e);
      if (e.button === 2) { this.commandAt(w.x, w.y, null, e.shiftKey); return; }
      mmDrag = true; this.r.centerOn(w.x, w.y);
    });
    window.addEventListener('mousemove', (e) => { if (mmDrag) { const w = mmMove(e); this.r.centerOn(w.x, w.y); } });
    window.addEventListener('mouseup', () => { mmDrag = false; });

    // panneaux (délégation : fonctionne même si le contenu est régénéré)
    const cmds = this.el('commands');
    cmds.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-btn]');
      if (!b) return;
      e.preventDefault();
      const btn = this.buttons[+b.dataset.btn];
      if (btn) btn.action(e);
    });
    const info = this.el('info');
    info.addEventListener('mousedown', (e) => {
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
      const html = t.dataset.btn !== undefined ? (this.buttons[+t.dataset.btn] || {}).tip : t.dataset.tip;
      if (!html) { tip.classList.add('hidden'); return; }
      tip.innerHTML = html;
      tip.classList.remove('hidden');
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 14) + 'px';
      tip.style.top = Math.max(8, e.clientY - r.height - 12) + 'px';
    };
    for (const el of [cmds, info, this.el('topbar')]) {
      el.addEventListener('mousemove', showTip);
      el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    }
    this.el('idle-btn').addEventListener('click', () => this.selectIdleVillager());
  }

  worldAt(sx, sy) { return this.r.toWorld(sx, sy); }

  onDown(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.paused) return;
    if (e.button === 1) { this.pan = { x: e.clientX, y: e.clientY, cx: this.r.cam.x, cy: this.r.cam.y }; e.preventDefault(); return; }
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
      if (def.wall) { this.placing.lineStart = [Math.floor(w.x), Math.floor(w.y)]; this.updatePlacement(w); return; }
      this.placeBuilding(e.shiftKey);
      return;
    }
    if (this.mode === 'attackMove') {
      const ids = this.myUnits().map((u) => u.id);
      const target = this.pick(e.clientX, e.clientY);
      if (target && this.g.isEnemy(this.me, target.owner)) this.g.issue(this.me, { type: 'attack', ids, target: target.id });
      else this.g.issue(this.me, { type: 'move', ids, x: w.x, y: w.y, aggressive: true });
      this.marker = { x: w.x, y: w.y, t: performance.now() / 1000, color: '#ff6b5e' };
      if (!e.shiftKey) this.mode = null;
      return;
    }
    this.dragStart = { x: e.clientX, y: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey };
  }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.pan) {
      this.r.cam.x = this.pan.cx - (e.clientX - this.pan.x) / this.r.cam.zoom;
      this.r.cam.y = this.pan.cy - (e.clientY - this.pan.y) / this.r.cam.zoom;
      this.r.clampCam();
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
      const t = this.pick(e.clientX, e.clientY);
      if (t && this.g.isEnemy(this.me, t.owner)) cur = 'crosshair';
      else if (t && (t.kind === 'resource' || (t.kind === 'building' && t.owner === this.me))) cur = 'pointer';
    }
    this.canvas.style.cursor = cur;
  }

  onUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button !== 0) return;
    if (this.placing && this.placing.lineStart) {
      const tiles = this.placing.tiles || [];
      const ids = this.myVillagers().map((u) => u.id);
      if (tiles.length && ids.length) {
        const ok = this.g.issue(this.me, { type: 'buildLine', ids, building: this.placing.type, tiles });
        if (!ok) this.msg('Emplacement invalide.', 'warn');
      }
      if (!e.shiftKey) this.placing = null; else { this.placing.lineStart = null; this.placing.tiles = null; }
      return;
    }
    if (!this.dragStart) return;
    const ds = this.dragStart;
    this.dragStart = null;
    if (this.dragBox) {
      const b = this.dragBox;
      this.dragBox = null;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const inBox = this.g.units.filter((u) => u.owner === this.me && !u.dead && (() => {
        const p = this.r.toScreen(u.x, u.y);
        return p.x >= x0 && p.x <= x1 && p.y - 10 * this.r.cam.zoom >= y0 - 10 && p.y - 10 * this.r.cam.zoom <= y1 + 10;
      })());
      // si l'on sélectionne des militaires et des villageois, on garde les militaires
      let list = inBox;
      if (!ds.shift) this.selected.clear();
      list.forEach((u) => this.selected.add(u.id));
      this.hudTimer = 0;
      return;
    }
    const t = this.pick(e.clientX, e.clientY);
    const now = performance.now();
    if (t) {
      if (t.kind === 'unit' && t.owner === this.me && this.lastClick.id === t.id && now - this.lastClick.t < 350) {
        // double-clic : toutes les unités du même type à l'écran
        this.selected.clear();
        for (const u of this.g.units) {
          if (u.owner !== this.me || u.type !== t.type) continue;
          const p = this.r.toScreen(u.x, u.y);
          if (p.x >= 0 && p.y >= 0 && p.x <= this.r.w && p.y <= this.r.h) this.selected.add(u.id);
        }
      } else if (ds.shift && t.owner === this.me && t.kind === 'unit') {
        if (this.selected.has(t.id)) this.selected.delete(t.id); else this.selected.add(t.id);
        // ne pas mélanger avec des bâtiments
        for (const id of [...this.selected]) { const x = this.g.get(id); if (!x || x.kind !== 'unit') this.selected.delete(id); }
      } else {
        this.selected = new Set([t.id]);
      }
      this.lastClick = { t: now, id: t.id };
    } else if (!ds.shift) this.selected.clear();
    this.hudTimer = 0;
  }

  onWheel(e) {
    e.preventDefault();
    const before = this.worldAt(e.clientX, e.clientY);
    const z = this.r.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
    this.r.cam.zoom = Math.max(0.45, Math.min(1.8, z));
    const after = this.worldAt(e.clientX, e.clientY);
    // garde le point sous le curseur fixe
    const pb = { x: (before.x - before.y) * 32, y: (before.x + before.y) * 16 };
    const pa = { x: (after.x - after.y) * 32, y: (after.x + after.y) * 16 };
    this.r.cam.x += pb.x - pa.x; this.r.cam.y += pb.y - pa.y;
    this.r.clampCam();
  }

  onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const k = e.key;
    this.keys.add(k);
    if (k === 'Escape') {
      if (this.placing || this.mode) { this.placing = null; this.mode = null; return; }
      if (this.selected.size) { this.selected.clear(); this.hudTimer = 0; return; }
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
      }
      return;
    }
    if (k === 'Delete') { this.g.issue(this.me, { type: 'delete', ids: [...this.selected] }); this.selected.clear(); return; }
    if (k === '.') { this.selectIdleVillager(); return; }
    if (k.startsWith('Arrow')) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const up = k.toUpperCase();
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
    this.updatePlacement(this.worldAt(this.mouse.x, this.mouse.y));
  }

  updatePlacement(w) {
    const def = BUILDINGS[this.placing.type];
    this.placing.tx = Math.round(w.x - def.size / 2);
    this.placing.ty = Math.round(w.y - def.size / 2);
    if (def.wall && this.placing.lineStart) {
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
    } else if (def.wall) this.placing.tiles = [[Math.floor(w.x), Math.floor(w.y)]];
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
    const sp = 900 / r.cam.zoom * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    if (this.mouse.inside && !this.pan && !this.dragStart && document.hasFocus()) {
      const m = 6;
      if (this.mouse.x <= m) dx -= 1;
      if (this.mouse.x >= window.innerWidth - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1;
      if (this.mouse.y >= window.innerHeight - m) dy += 1;
    }
    if (dx || dy) { r.cam.x += dx * sp; r.cam.y += dy * sp; r.clampCam(); }

    // événements du jeu
    for (const ev of this.g.events) {
      if (ev.type === 'msg' && (ev.player === this.me || ev.player === -1)) this.msg(ev.text, ev.kind);
      if (ev.type === 'attacked' && ev.player === this.me) {
        this.msg('Vous êtes attaqué !', 'alert');
        this.pings.push({ x: ev.x, y: ev.y, t: performance.now() / 1000 });
        this.lastAlert = { x: ev.x, y: ev.y };
      }
      if (ev.type === 'age' && ev.player === this.me) this.hudTimer = 0;
      if (ev.type === 'trained' && ev.player === this.me) this.hudTimer = 0;
    }
    this.g.events.length = 0;
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
    this.el('age-label').textContent = AGES[p.age].name + (p.agingUp ? ' ⏳' : '');
    const s = Math.floor(g.time);
    this.el('clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.el('idle-count').textContent = g.units.filter((u) => u.owner === this.me && u.type === 'villager' && !u.order).length;
    this.renderInfo();
    this.renderCommands();
  }

  sel() { return [...this.selected].map((id) => this.g.get(id)).filter(Boolean); }

  iconOf(e) {
    if (e.kind === 'unit') return UNITS[e.type].icon;
    if (e.kind === 'building') return BUILDINGS[e.type].icon;
    return { tree: '🌳', gold: '🪙', stone: '🪨', berries: '🫐', sheep: '🐑' }[e.type];
  }

  renderInfo() {
    const g = this.g;
    const list = this.sel();
    const info = this.el('info');
    if (!list.length) {
      const p = g.players[this.me];
      info.innerHTML = `<h3>${p.name}</h3><div class="row">${AGES[p.age].name}</div>
        <div class="row">Récolté : ${Object.entries(p.stats.gathered).map(([k, v]) => `${RES_ICON[k]} <b>${v}</b>`).join(' ')}</div>
        <div class="row">Ennemis tués : <b>${p.stats.kills}</b> — Pertes : <b>${p.stats.losses}</b></div>
        <div class="row" style="margin-top:10px">Astuce : sélectionnez un villageois pour construire, ou l'hôtel de ville (H) pour former des villageois.</div>`;
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
      html = `<h3>${this.iconOf(e)} ${n}</h3><div class="row">${ownerTxt}</div><div class="row">${RES_ICON[rt]} Restant : <b>${Math.ceil(e.amount)}</b> / ${e.maxAmount}</div>`;
    } else if (e.kind === 'unit') {
      const st = g.unitStats(e.owner, e.type);
      html = `<h3>${st.icon} ${st.name}</h3><div class="row">${ownerTxt}</div>
        <div class="hpbar"><div style="width:${100 * e.hp / e.maxHp}%"></div></div>
        <div class="row">❤️ <b>${Math.ceil(e.hp)}/${e.maxHp}</b> ⚔️ <b>${st.atk}</b>${st.range ? ` 🎯 <b>${st.range}</b>` : ''} 🛡️ <b>${st.armor[0]}/${st.armor[1]}</b> 👁️ <b>${st.los}</b></div>`;
      if (Object.keys(st.bonus || {}).length) html += `<div class="row">Bonus : ${Object.entries(st.bonus).map(([k, v]) => `+${v} contre ${{ cavalry: 'cavalerie', archer: 'archers', infantry: 'infanterie', building: 'bâtiments' }[k] || k}`).join(', ')}</div>`;
      if (e.type === 'villager') {
        const o = e.order;
        const act = !o ? 'Inactif' : o.kind === 'gather' ? `Récolte : ${RES_NAME[o.resType]}` : o.kind === 'build' ? 'Construit' : o.kind === 'drop' ? 'Dépose sa récolte' : o.kind === 'attack' ? 'Attaque' : 'Se déplace';
        html += `<div class="row">${act}${e.carry.amount ? ` — porte ${RES_ICON[e.carry.type]} <b>${e.carry.amount}</b>/${g.carryCap(e.owner)}` : ''}</div>`;
      }
      html += `<div class="row" style="font-size:12px">${st.desc}</div>`;
    } else {
      const def = BUILDINGS[e.type];
      html = `<h3>${def.icon} ${def.name}</h3><div class="row">${ownerTxt}</div>
        <div class="hpbar"><div style="width:${100 * e.hp / e.maxHp}%"></div></div>
        <div class="row">❤️ <b>${Math.ceil(e.hp)}/${e.maxHp}</b> 🛡️ <b>${g.armorOf(e).join('/')}</b>${def.attack ? ` ⚔️ <b>${g.buildingAttack(e).atk}</b> 🎯 <b>${g.buildingAttack(e).range}</b>` : ''}</div>`;
      if (!e.built) html += `<div class="row">En construction : <b>${Math.floor(e.progress * 100)}%</b></div>`;
      if (def.farm && e.built) html += `<div class="row">🍖 Nourriture restante : <b>${Math.ceil(e.food)}</b></div>`;
      if (def.pop) html += `<div class="row">👥 +${def.pop} population</div>`;
      if (def.market && e.owner === this.me) {
        html += `<div class="row">Cours : ${Object.entries(g.marketPrices).map(([k, v]) => `${RES_ICON[k]} achat <b>${v}</b> / vente <b>${Math.round(v * 0.7)}</b> 🪙`).join(' — ')}</div>`;
      }
      if (e.queue.length && e.owner === this.me) {
        html += '<div class="queue">' + e.queue.map((q, i) => {
          const icon = q.kind === 'unit' ? UNITS[q.id].icon : q.kind === 'tech' ? TECHS[q.id].icon : '⬆️';
          const name = q.kind === 'unit' ? UNITS[q.id].name : q.kind === 'tech' ? TECHS[q.id].name : AGES[q.id].name;
          return `<div class="q ${q.housed ? 'housed' : ''}" data-cancel="${i}" data-b="${e.id}" data-tip="${name} — clic pour annuler">${icon}${i === 0 ? `<div class="bar" style="width:${100 * q.t / q.time}%"></div>` : ''}</div>`;
        }).join('') + '</div>';
      }
      if (!e.queue.length || e.owner !== this.me) html += `<div class="row" style="font-size:12px">${def.desc}</div>`;
    }
    info.innerHTML = html;
  }

  // Construit la liste des boutons de commande selon la sélection
  computeButtons() {
    const g = this.g, p = g.players[this.me];
    const list = this.sel().filter((e) => e.owner === this.me);
    const btns = [];
    const reqTxt = (age) => `<div class="no">Nécessite l'${AGES[age].name.slice(2)}</div>`;
    const costHtml = (cost) => `<div class="cost">${costText(cost)}</div>`;
    if (!list.length) return btns;
    const units = list.filter((e) => e.kind === 'unit');
    if (units.length) {
      if (units.some((u) => u.type === 'villager')) {
        for (const type of BUILD_MENU) {
          const def = BUILDINGS[type];
          const okAge = p.age >= def.age;
          btns.push({
            icon: def.icon, key: def.hotkey, disabled: !okAge || !g.canAfford(p, def.cost),
            tip: `<b>${def.name}</b> (${def.hotkey})<div>${def.desc}</div>${costHtml(def.cost)}${okAge ? '' : reqTxt(def.age)}`,
            action: () => this.startPlacing(type),
          });
        }
      } else {
        btns.push({ icon: '⚔️', key: 'Q', tip: '<b>Attaque-mouvement</b> (Q)<div>Se déplace en attaquant les ennemis rencontrés.</div>', action: () => { this.mode = 'attackMove'; } });
      }
      btns.push({ icon: '✋', key: 'X', tip: '<b>Stop</b> (X)', action: () => this.g.issue(this.me, { type: 'stop', ids: units.map((u) => u.id) }) });
      btns.push({ icon: '💀', key: null, tip: '<b>Supprimer</b> (Suppr)', action: () => { this.g.issue(this.me, { type: 'delete', ids: units.map((u) => u.id) }); this.selected.clear(); } });
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
        const okAge = p.age >= u.age;
        if (!okAge && u.age > p.age + 1) continue;
        const key = nextKey();
        const st = g.unitStats(this.me, type);
        btns.push({
          icon: u.icon, key, disabled: !okAge || !g.canAfford(p, u.cost),
          tip: `<b>${u.name}</b> (${key}) — Maj+clic : ×5<div>${u.desc}</div><div>❤️ ${st.hp} ⚔️ ${st.atk}${st.range ? ` 🎯 ${st.range}` : ''} 🛡️ ${st.armor.join('/')} ⏱️ ${u.time}s</div>${costHtml(u.cost)}${okAge ? '' : reqTxt(u.age)}`,
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
          icon: t.icon, key, disabled: !okAge || !g.canAfford(p, t.cost),
          tip: `<b>${t.name}</b> (${key})<div>${t.desc}</div><div>⏱️ ${t.time}s</div>${costHtml(t.cost)}${okAge ? '' : reqTxt(t.age)}`,
          action: () => this.g.issue(this.me, { type: 'research', building: b.id, tech }) && (this.hudTimer = 0),
        });
      }
      if (b.type === 'town_center' && AGES[p.age + 1] && !p.agingUp) {
        const next = AGES[p.age + 1];
        const reqOk = g.ageRequirementMet(p);
        btns.push({
          icon: '⬆️', key: 'Z', disabled: !reqOk || !g.canAfford(p, next.cost),
          tip: `<b>Passer à l'${next.name.slice(2)}</b> (Z)<div>Débloque de nouveaux bâtiments, unités et technologies.</div><div>⏱️ ${next.time}s</div>${costHtml(next.cost)}${reqOk ? '' : `<div class="no">${g.ageRequirementText(p)}</div>`}`,
          action: () => this.g.issue(this.me, { type: 'ageUp', building: b.id }) && (this.hudTimer = 0),
        });
      }
      if (def.market) {
        for (const r of ['food', 'wood', 'stone']) {
          btns.push({ icon: RES_ICON[r], badge: 'achat', key: nextKey(), tip: `<b>Acheter 100 ${RES_NAME[r]}</b><div>Coût : ${g.marketPrices[r]} 🪙</div>`, action: () => this.g.issue(this.me, { type: 'market', action: 'buy', res: r }) });
        }
        for (const r of ['food', 'wood', 'stone']) {
          btns.push({ icon: RES_ICON[r], badge: 'vente', key: nextKey(), tip: `<b>Vendre 100 ${RES_NAME[r]}</b><div>Gain : ${Math.round(g.marketPrices[r] * 0.7)} 🪙</div>`, action: () => this.g.issue(this.me, { type: 'market', action: 'sell', res: r }) });
        }
      }
    }
    btns.push({ icon: '💀', key: null, tip: '<b>Détruire le bâtiment</b> (Suppr)', action: () => { this.g.issue(this.me, { type: 'delete', ids: [b.id] }); this.selected.clear(); } });
    return btns;
  }

  renderCommands() {
    const btns = this.computeButtons();
    this.buttons = btns;
    const sig = btns.map((b) => b.icon + b.key + (b.disabled ? 1 : 0) + (b.badge || '')).join('|') + [...this.selected].join(',');
    if (sig === this.cmdSig) return;
    this.cmdSig = sig;
    this.el('commands').innerHTML = btns.map((b, i) => `<button class="cmd ${b.disabled ? 'disabled' : ''}" data-btn="${i}">${b.icon}${b.key ? `<span class="hk">${b.key}</span>` : ''}${b.badge ? `<span class="badge">${b.badge}</span>` : ''}</button>`).join('');
  }
}
