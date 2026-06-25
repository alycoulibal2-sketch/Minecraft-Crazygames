// ui.js — DOM HUD + container screens (inventory / crafting / furnace / creative palette).

import { BLOCKS, AIR } from './blocks.js';
import { ITEMS, ITEM_ID } from './items.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { matchRecipe, smeltResult } from './recipes.js';
import { TILE, ATLAS_COLS } from './textures.js';

const ATLAS_PX = TILE * ATLAS_COLS;

export class UI {
  constructor(root, atlasCanvas, atlasUV, player) {
    this.root = root;
    this.atlasCanvas = atlasCanvas;
    this.atlasUV = atlasUV;
    this.player = player;
    this._hotbarSig = null;
    this.isTouch = (typeof window !== 'undefined' && 'ontouchstart' in window) ||
                   (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0);
    this.screen = null;          // null | 'inventory' | 'crafting' | 'furnace' | 'creative'
    this.invOpen = false;        // any blocking screen open
    this.cursor = null;          // {id,count} held by mouse
    this.craftGrid = new Array(9).fill(null);
    this.craftDim = 2;
    this.furnace = null;         // active furnace state
    this._build();
  }

  // ---- icon drawing (by atlas tile name) ----
  // Returns a FRESH canvas every call: a DOM node can only live in one slot, so
  // icons must never be shared between slots (duplicate items would render blank).
  drawTile(tileName, size) {
    const uv = this.atlasUV.get(tileName);
    if (!uv) return null;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.atlasCanvas, uv[0] * ATLAS_PX, uv[1] * ATLAS_PX, TILE, TILE, 0, 0, size, size);
    return c;
  }
  iconForBlock(blockId, size = 44) {
    const b = BLOCKS[blockId];
    if (!b || !b.tiles) return null;
    const top = ['grass_block', 'crafting_table', 'furnace', 'pumpkin', 'melon', 'hay_block', 'tnt'];
    return this.drawTile(top.includes(b.name) ? b.tiles[2] : b.tiles[0], size);
  }
  iconForItem(itemId, size = 44) {
    const it = ITEMS[itemId];
    if (!it || it.name === 'empty') return null;
    return this.drawTile(it.icon, size);
  }
  // legacy alias used by some call sites (creative palette)
  makeIcon(blockId, size = 44) { return this.iconForBlock(blockId, size); }

  _build() {
    const root = this.root;
    root.innerHTML = '';

    const cross = el('div', { id: 'crosshair' }); cross.textContent = '+'; root.appendChild(cross);

    // mining progress bar (under crosshair) — shows hold-to-break progress
    this.breakBarEl = el('div', { id: 'breakbar' });
    this.breakBarFill = el('div');
    this.breakBarEl.appendChild(this.breakBarFill);
    this.breakBarEl.style.display = 'none';
    root.appendChild(this.breakBarEl);

    // hotbar
    this.hotbarEl = el('div', { id: 'hotbar' });
    this.slotEls = [];
    for (let i = 0; i < 9; i++) { const s = el('div', { class: 'slot' }); this.slotEls.push(s); this.hotbarEl.appendChild(s); }
    root.appendChild(this.hotbarEl);

    // survival stat bars
    this.barsEl = el('div', { id: 'bars' });
    this.healthEl = el('div', { class: 'bar health' });
    this.hungerEl = el('div', { class: 'bar hunger' });
    this.airEl = el('div', { class: 'bar air' });
    this.barsEl.append(this.airEl, this.healthEl, this.hungerEl);
    root.appendChild(this.barsEl);

    this.debugEl = el('div', { id: 'debug' }); this.debugEl.style.display = 'none'; root.appendChild(this.debugEl);

    this.hintEl = el('div', { id: 'hint' });
    this.hintEl.innerHTML = 'Click to play &nbsp;·&nbsp; WASD move · Space jump · double-Space fly · Shift sneak/down · Ctrl sprint · E inventory · Esc menu · G options · F5 camera · F3 debug · 1-9 / wheel hotbar · LMB break · RMB place/use<br><b>Change Game Mode (Survival) in Esc → Options.</b>';
    root.appendChild(this.hintEl);

    // death screen (with a real Respawn button)
    this.deathEl = el('div', { id: 'death' }); this.deathEl.style.display = 'none';
    const dHead = el('h1'); dHead.textContent = 'You Died!';
    const dSub = el('p'); dSub.textContent = 'Game over';
    const respawnBtn = el('button', { class: 'mc-btn' }); respawnBtn.textContent = 'Respawn';
    respawnBtn.addEventListener('click', () => { if (this.game) this.game._respawn(); });
    const dOpts = el('button', { class: 'mc-btn' }); dOpts.textContent = 'Options…';
    dOpts.addEventListener('click', () => this.openOptions());
    this.deathEl.append(dHead, dSub, respawnBtn, dOpts);
    root.appendChild(this.deathEl);

    // saved toast
    this.toastEl = el('div', { id: 'toast' }); this.toastEl.style.display = 'none'; root.appendChild(this.toastEl);

    // container overlay
    this.screenEl = el('div', { id: 'screen' }); this.screenEl.style.display = 'none';
    root.appendChild(this.screenEl);

    // cursor item follower
    this.cursorEl = el('div', { id: 'cursor-item' }); this.cursorEl.style.display = 'none';
    root.appendChild(this.cursorEl);
    document.addEventListener('mousemove', (e) => {
      if (this.cursor) { this.cursorEl.style.left = e.clientX + 'px'; this.cursorEl.style.top = e.clientY + 'px'; }
    });
  }

  // ===================== screens =====================
  openContainer(type, ctx = {}) {
    this.furnace = type === 'furnace' ? ctx.furnace : null;
    this.craftDim = type === 'crafting' ? 3 : 2;
    this.screen = type;
    this.invOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderScreen();
    this.screenEl.style.display = 'flex';
  }
  openInventory() { this.openContainer('inventory'); }
  openCreative() {
    this.screen = 'creative'; this.invOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderCreative();
    this.screenEl.style.display = 'flex';
  }

  // ---- pause / options menus ----
  isPauseScreen() { return this.screen === 'pause' || this.screen === 'options'; }

  openPause() {
    this.screen = 'pause'; this.invOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderPause();
    this.screenEl.style.display = 'flex';
  }
  openOptions() {
    this.screen = 'options'; this.invOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderOptions();
    this.screenEl.style.display = 'flex';
  }

  _menuPanel(titleText) {
    const panel = el('div', { class: 'panel mc-menu' });
    const t = el('div', { class: 'panel-title' }); t.textContent = titleText;
    panel.appendChild(t);
    return panel;
  }
  _menuButton(label, onClick) {
    const b = el('button', { class: 'mc-btn' });
    b.textContent = label;
    b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    return b;
  }
  _rangeRow(label, key, min, max, step, fmt) {
    const s = this.game.settings;
    const row = el('div', { class: 'mc-row' });
    const lab = el('label', { class: 'mc-label' });
    const val = el('span', { class: 'mc-val' });
    lab.textContent = label + ': '; lab.appendChild(val);
    const inp = el('input', { class: 'mc-range' });
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
    const render = () => { val.textContent = fmt ? fmt(s[key]) : s[key]; };
    inp.addEventListener('input', () => { s.set(key, parseFloat(inp.value)); this.game.applySettings(); render(); });
    render();
    row.append(lab, inp);
    return row;
  }
  _toggleRow(label, key) {
    const s = this.game.settings;
    const row = el('div', { class: 'mc-row' });
    const lab = el('label', { class: 'mc-label' }); lab.textContent = label;
    const b = this._menuButton('', () => { s.set(key, !s[key]); this.game.applySettings(); upd(); });
    const upd = () => { b.textContent = s[key] ? 'ON' : 'OFF'; };
    upd();
    row.append(lab, b);
    return row;
  }
  _cycleRow(label, options, getCur, setCur) {
    const row = el('div', { class: 'mc-row' });
    const lab = el('label', { class: 'mc-label' }); lab.textContent = label;
    const b = this._menuButton('', () => {
      let i = options.findIndex((o) => o.value === getCur());
      i = (i + 1) % options.length;
      setCur(options[i].value); upd();
    });
    const upd = () => {
      const cur = getCur();
      const o = options.find((x) => x.value === cur) || options[0];
      b.textContent = o.label;
    };
    upd();
    row.append(lab, b);
    return row;
  }

  _renderPause() {
    const g = this.game;
    const panel = this._menuPanel('Game Menu');
    const mode = g ? g.mode : 'creative';
    const sub = el('div', { class: 'mc-sub' });
    sub.textContent = 'Mode: ' + mode.charAt(0).toUpperCase() + mode.slice(1);
    panel.appendChild(sub);
    panel.appendChild(this._menuButton('Back to Game', () => this.closeScreen()));
    panel.appendChild(this._menuButton('Options…', () => this.openOptions()));
    panel.appendChild(this._menuButton('Save Game', () => { if (g && g.saveNow) g.saveNow(); }));
    if (g && this.player.dead) panel.appendChild(this._menuButton('Respawn', () => { g._respawn(); this.closeScreen(); }));
    this.screenEl.innerHTML = ''; this.screenEl.appendChild(panel);
  }

  _renderOptions() {
    const g = this.game, s = g.settings;
    const panel = this._menuPanel('Options');
    const note = el('div', { class: 'mc-sub' }); note.textContent = 'Change Game Mode here to enter Survival.';
    panel.appendChild(note);

    // Game Mode is the gateway to Survival (per design).
    panel.appendChild(this._cycleRow('Game Mode',
      [{ value: 'creative', label: 'Creative' }, { value: 'survival', label: 'Survival' }, { value: 'spectator', label: 'Spectator' }],
      () => g.mode, (v) => g.applyGameMode(v)));
    panel.appendChild(this._cycleRow('Difficulty',
      [{ value: 'peaceful', label: 'Peaceful' }, { value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }],
      () => s.difficulty, (v) => { s.set('difficulty', v); g.applySettings(); }));
    panel.appendChild(this._cycleRow('Camera Perspective',
      [{ value: 0, label: 'First Person' }, { value: 1, label: 'Third Person (Back)' }, { value: 2, label: 'Third Person (Front)' }],
      () => s.perspective, (v) => { s.set('perspective', v); g.applySettings(); }));
    panel.appendChild(this._rangeRow('FOV', 'fov', 30, 110, 1, (v) => Math.round(v) + '°'));
    panel.appendChild(this._rangeRow('Mouse Sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => Math.round(v * 100) + '%'));
    panel.appendChild(this._toggleRow('Invert Y-axis', 'invertY'));
    panel.appendChild(this._rangeRow('Render Distance', 'renderDistance', 3, 16, 1, (v) => Math.round(v) + ' chunks'));
    panel.appendChild(this._rangeRow('Brightness', 'brightness', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
    panel.appendChild(this._rangeRow('Sound Volume', 'volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
    panel.appendChild(this._rangeRow('Music Volume', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
    panel.appendChild(this._toggleRow('Sprint FOV Effect', 'sprintFov'));
    panel.appendChild(this._toggleRow('Pause Time in Menu', 'pauseTimeInMenu'));

    const footer = el('div', { class: 'mc-footer' });
    footer.append(
      this._menuButton('Reset to Defaults', () => { s.reset(); g.applySettings(); this._renderOptions(); }),
      this._menuButton('Done', () => this.openPause())
    );
    panel.appendChild(footer);
    this.screenEl.innerHTML = ''; this.screenEl.appendChild(panel);
  }

  // mode-aware toggle (called by game on 'E')
  toggleInventory(force) {
    const open = force !== undefined ? force : !this.invOpen;
    if (!open) { this.closeScreen(); return; }
    if (this.player.mode === 'creative') this.openCreative();
    else this.openInventory();
  }

  closeScreen() {
    // return crafting-grid + cursor items to inventory (addStack preserves tool dmg)
    if (this.screen === 'inventory' || this.screen === 'crafting') {
      for (let i = 0; i < this.craftGrid.length; i++) {
        const s = this.craftGrid[i];
        if (s) { this.player.inventory.addStack(s); this.craftGrid[i] = null; }
      }
    }
    if (this.cursor) { this.player.inventory.addStack(this.cursor); this.cursor = null; }
    this.cursorEl.style.display = 'none';
    this.screen = null; this.invOpen = false; this.furnace = null;
    this.screenEl.style.display = 'none';
    this.screenEl.innerHTML = '';
  }

  // ---- slot stores ----
  _invStore() { return this.player.inventory; }
  _craftStore() { return { get: (i) => this.craftGrid[i], set: (i, v) => { this.craftGrid[i] = v; } }; }
  _furnaceStore() {
    const f = this.furnace;
    return {
      get: (i) => i === 0 ? f.input : i === 1 ? f.fuel : f.output,
      set: (i, v) => { if (i === 0) f.input = v; else if (i === 1) f.fuel = v; else f.output = v; },
    };
  }

  _renderScreen() {
    const panel = el('div', { class: 'panel' });
    const title = el('div', { class: 'panel-title' });
    title.textContent = this.screen === 'furnace' ? 'Furnace' : (this.screen === 'crafting' ? 'Crafting Table' : 'Inventory');
    panel.appendChild(title);

    if (this.screen === 'furnace') this._buildFurnace(panel);
    else this._buildCrafting(panel, this.craftDim);

    // main inventory (27) + hotbar (9)
    const invWrap = el('div', { class: 'inv-section' });
    const main = el('div', { class: 'grid', style: 'grid-template-columns: repeat(9, 46px);' });
    for (let i = HOTBAR_SIZE; i < HOTBAR_SIZE + 27; i++) main.appendChild(this._slot(this._invStore(), i, 'normal'));
    const hot = el('div', { class: 'grid hotbar-row', style: 'grid-template-columns: repeat(9, 46px); margin-top:8px;' });
    for (let i = 0; i < HOTBAR_SIZE; i++) hot.appendChild(this._slot(this._invStore(), i, 'normal'));
    invWrap.append(main, hot);
    panel.appendChild(invWrap);

    this.screenEl.innerHTML = '';
    this.screenEl.appendChild(panel);
  }

  _buildCrafting(panel, dim) {
    const wrap = el('div', { class: 'craft-section' });
    const grid = el('div', { class: 'grid', style: `grid-template-columns: repeat(${dim}, 46px);` });
    for (let i = 0; i < dim * dim; i++) {
      // map dim grid index to craftGrid (row-major within dim)
      grid.appendChild(this._slot(this._craftStore(), this._craftIndex(i, dim), 'normal'));
    }
    const arrow = el('div', { class: 'arrow' }); arrow.textContent = '➜';
    const out = this._slot({ get: () => this._craftResult(dim), set: () => {} }, 0, 'craftOutput');
    wrap.append(grid, arrow, out);
    panel.appendChild(wrap);
  }
  _craftIndex(i, dim) {
    if (dim === 3) return i;
    // 2x2 uses craftGrid slots 0,1,3,4 to keep storage stable; simpler: 0..3
    const r = (i / 2) | 0, c = i % 2; return r * 2 + c;
  }
  _craftResult(dim) {
    const ids = [];
    for (let i = 0; i < dim * dim; i++) { const s = this.craftGrid[this._craftIndex(i, dim)]; ids.push(s ? s.id : 0); }
    const m = matchRecipe(ids, dim);
    return m ? { id: m.out[0], count: m.out[1] } : null;
  }

  _buildFurnace(panel) {
    const f = this.furnace;
    const wrap = el('div', { class: 'furnace-section' });
    const left = el('div', { class: 'furnace-col' });
    left.appendChild(this._slot(this._furnaceStore(), 0, 'normal'));     // input (top)
    const flame = el('div', { class: 'flame' });
    this._flameEl = flame;
    left.appendChild(flame);
    left.appendChild(this._slot(this._furnaceStore(), 1, 'normal'));     // fuel (bottom)
    const arrow = el('div', { class: 'arrow' }); arrow.textContent = '➜'; this._smeltArrow = arrow;
    const out = this._slot(this._furnaceStore(), 2, 'furnaceOutput');
    wrap.append(left, arrow, out);
    panel.appendChild(wrap);
  }

  _renderCreative() {
    const panel = el('div', { class: 'panel' });
    const title = el('div', { class: 'panel-title' }); title.textContent = 'Creative Inventory — click a block to put it in the selected slot';
    panel.appendChild(title);
    const grid = el('div', { class: 'grid', style: 'grid-template-columns: repeat(12, 42px); max-height:60vh; overflow:auto;' });
    for (let id = 1; id < BLOCKS.length; id++) {
      const b = BLOCKS[id];
      if (!b || b.render === 'none') continue;
      const cell = el('div', { class: 'slot small', title: b.name.replace(/_/g, ' ') });
      const ic = this.iconForBlock(id, 38); if (ic) cell.appendChild(ic);
      cell.addEventListener('click', () => { this.player.hotbar[this.player.selected] = id; this.closeScreen(); });
      grid.appendChild(cell);
    }
    panel.appendChild(grid);
    this.screenEl.innerHTML = ''; this.screenEl.appendChild(panel);
  }

  // ---- a clickable slot bound to (store, index) ----
  _slot(store, index, type) {
    const slot = el('div', { class: 'slot' });
    slot._store = store; slot._index = index; slot._type = type; slot._sig = null;
    this._refreshSlot(slot);
    // Use mousedown (not click): the HUD rebuilds slot contents each frame, which
    // can detach the click target between press and release and swallow the 'click'
    // event entirely (right-click still worked because contextmenu fires on press).
    // mousedown fires on press for BOTH buttons. Left = move/merge, right = take half.
    slot.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault(); e.stopPropagation();
      this._onSlotClick(slot, e.button === 2);
    });
    slot.addEventListener('contextmenu', (e) => e.preventDefault());
    if (!this._slotEls) this._slotEls = [];
    this._slotEls.push(slot);
    return slot;
  }
  _refreshSlot(slot) {
    const stack = slot._store.get(slot._index);
    // change-detection: only rebuild the slot's DOM when its contents changed,
    // so the per-frame HUD update doesn't continually detach child nodes.
    const sig = stack && stack.id ? stack.id + 'x' + stack.count + 'd' + (stack.dmg || 0) : '_';
    if (sig === slot._sig) return;
    slot._sig = sig;
    slot.innerHTML = '';
    if (stack && stack.id) {
      const ic = this.iconForItem(stack.id, 40); if (ic) slot.appendChild(ic);
      if (stack.count > 1) { const c = el('span', { class: 'count' }); c.textContent = stack.count; slot.appendChild(c); }
      const it = ITEMS[stack.id];
      if (it && it.durability && stack.dmg) {
        const bar = el('div', { class: 'durability' });
        const inner = el('div'); inner.style.width = Math.round((1 - stack.dmg / it.durability) * 100) + '%';
        inner.style.background = stack.dmg / it.durability > 0.6 ? '#d33' : '#3d3';
        bar.appendChild(inner); slot.appendChild(bar);
      }
    }
  }

  _onSlotClick(slot, right) {
    const store = slot._store, index = slot._index, type = slot._type;
    if (type === 'craftOutput') { this._takeCraftOutput(); return; }
    if (type === 'furnaceOutput') { this._takeOutputOnly(store, index); return; }

    const slotStack = store.get(index);
    if (right) {
      // right-click: take half (cursor empty) or place one
      if (!this.cursor) {
        if (slotStack) {
          const half = Math.ceil(slotStack.count / 2);
          this.cursor = { id: slotStack.id, count: half, dmg: slotStack.dmg };
          slotStack.count -= half; if (slotStack.count <= 0) store.set(index, null);
        }
      } else {
        if (!slotStack) { store.set(index, { id: this.cursor.id, count: 1, dmg: this.cursor.dmg }); this.cursor.count -= 1; }
        else if (slotStack.id === this.cursor.id && slotStack.count < this.maxStack(slotStack.id)) { slotStack.count += 1; this.cursor.count -= 1; }
        if (this.cursor.count <= 0) this.cursor = null;
      }
    } else {
      // left-click: pick up / drop / merge / swap
      if (!this.cursor) {
        if (slotStack) { this.cursor = slotStack; store.set(index, null); }
      } else if (!slotStack) {
        store.set(index, this.cursor); this.cursor = null;
      } else if (slotStack.id === this.cursor.id) {
        const max = this.maxStack(slotStack.id);
        const can = Math.min(max - slotStack.count, this.cursor.count);
        slotStack.count += can; this.cursor.count -= can;
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        store.set(index, this.cursor); this.cursor = slotStack;
      }
    }
    this._refreshAll();
  }

  maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

  _takeOutputOnly(store, index) {
    const out = store.get(index);
    if (!out) return;
    if (!this.cursor) { this.cursor = out; store.set(index, null); }
    else if (this.cursor.id === out.id) {
      const can = Math.min(this.maxStack(out.id) - this.cursor.count, out.count);
      this.cursor.count += can; out.count -= can; if (out.count <= 0) store.set(index, null);
    }
    this._refreshAll();
  }

  _takeCraftOutput() {
    const dim = this.craftDim;
    const result = this._craftResult(dim);
    if (!result) return;
    if (this.cursor && (this.cursor.id !== result.id || this.cursor.count + result.count > this.maxStack(result.id))) return;
    // consume one of each ingredient
    for (let i = 0; i < dim * dim; i++) {
      const gi = this._craftIndex(i, dim); const s = this.craftGrid[gi];
      if (s) { s.count -= 1; if (s.count <= 0) this.craftGrid[gi] = null; }
    }
    if (this.cursor) this.cursor.count += result.count;
    else this.cursor = { id: result.id, count: result.count };
    this._refreshAll();
  }

  _refreshAll() {
    if (this._slotEls) for (const s of this._slotEls) if (s.isConnected) this._refreshSlot(s);
    this._updateCursor();
  }
  _updateCursor() {
    if (this.cursor) {
      this.cursorEl.innerHTML = '';
      const ic = this.iconForItem(this.cursor.id, 40); if (ic) this.cursorEl.appendChild(ic);
      if (this.cursor.count > 1) { const c = el('span', { class: 'count' }); c.textContent = this.cursor.count; this.cursorEl.appendChild(c); }
      this.cursorEl.style.display = 'block';
    } else { this.cursorEl.style.display = 'none'; this.cursorEl.innerHTML = ''; }
  }

  setHint(show) { this.hintEl.style.display = (show && !this.isTouch) ? 'block' : 'none'; }
  toggleDebug() { this.debugEl.style.display = this.debugEl.style.display === 'none' ? 'block' : 'none'; }
  flashSaved() {
    this.toastEl.textContent = '✓ Saved';
    this.toastEl.style.display = 'block';
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 1200);
  }

  // ===================== per-frame HUD update =====================
  update(game, fps) {
    const p = this.player;

    // hotbar
    this._refreshHotbar();

    // mining progress
    const bp = p.breakProgress || 0;
    if (bp > 0 && bp < 1 && !this.invOpen) {
      this.breakBarEl.style.display = 'block';
      this.breakBarFill.style.width = Math.round(bp * 100) + '%';
    } else {
      this.breakBarEl.style.display = 'none';
    }

    // open screen: refresh live (furnace progress / counts)
    if (this.invOpen && this.screen) {
      this._slotEls = (this._slotEls || []).filter(s => s.isConnected);
      this._refreshAll();
      if (this.screen === 'furnace' && this.furnace) {
        const f = this.furnace;
        if (this._flameEl) this._flameEl.style.opacity = f.burn > 0 ? 1 : 0.2;
        if (this._smeltArrow) this._smeltArrow.style.color = f.progress > 0 ? '#6c6' : '#555';
      }
    }

    // bars
    if (p.mode === 'survival') {
      this.barsEl.style.display = 'flex';
      this.healthEl.innerHTML = redHearts(p.health);
      this.hungerEl.innerHTML = hungerIcons(p.hunger);
      const submerged = p.air < p.maxAir - 1;
      this.airEl.style.display = submerged ? 'block' : 'none';
      if (submerged) this.airEl.textContent = '🫧'.repeat(Math.max(0, Math.round(p.air / p.maxAir * 10)));
      this.deathEl.style.display = p.dead ? 'flex' : 'none';
    } else {
      this.barsEl.style.display = 'none';
      this.deathEl.style.display = 'none';
    }

    // debug
    if (this.debugEl.style.display !== 'none') {
      const t = p.target;
      const look = t && t.hit ? `${BLOCKS[t.id].name} @ ${t.x},${t.y},${t.z}` : '—';
      const held = p.heldItem ? p.heldItem() : null;
      this.debugEl.innerHTML =
        `<b>Minecraft Crazygames</b> (${game.mode})<br>` +
        `fps: ${fps.toFixed(0)} · chunks: ${game.world.chunks.size} · mobs: ${game.entities ? game.entities.mobs.length : 0}<br>` +
        `xyz: ${p.pos[0].toFixed(1)} / ${p.pos[1].toFixed(1)} / ${p.pos[2].toFixed(1)}<br>` +
        `chunk: ${Math.floor(p.pos[0] / 16)}, ${Math.floor(p.pos[2] / 16)}<br>` +
        `facing yaw ${(p.yaw * 180 / Math.PI).toFixed(0)}° pitch ${(p.pitch * 180 / Math.PI).toFixed(0)}°<br>` +
        `fly ${p.flying} ground ${p.onGround} water ${p.inWater}<br>` +
        `held: ${held ? held.name : '—'}<br>` +
        `looking: ${look}<br>` +
        `hp ${p.health.toFixed(1)} hunger ${p.hunger} · time ${(game.timeOfDay * 24).toFixed(1)}h`;
    }
  }

  _refreshHotbar() {
    const p = this.player;
    // change-detection: skip the DOM rebuild when nothing visible changed
    let sig = p.mode + '|' + p.selected + '|';
    if (p.mode === 'creative') sig += p.hotbar.join(',');
    else for (let i = 0; i < 9; i++) { const s = p.inventory.slots[i]; sig += (s ? s.id + 'x' + s.count : '_') + ','; }
    if (sig === this._hotbarSig) return;
    this._hotbarSig = sig;
    for (let i = 0; i < 9; i++) {
      const slot = this.slotEls[i];
      slot.classList.toggle('selected', i === p.selected);
      slot.innerHTML = '';
      if (p.mode === 'creative') {
        const id = p.hotbar[i];
        if (id && id !== AIR) { const ic = this.iconForBlock(id, 44); if (ic) slot.appendChild(ic); }
      } else {
        const s = p.inventory.slots[i];
        if (s && s.id) {
          const ic = this.iconForItem(s.id, 44); if (ic) slot.appendChild(ic);
          if (s.count > 1) { const c = el('span', { class: 'count' }); c.textContent = s.count; slot.appendChild(c); }
        }
      }
    }
  }
}

function redHearts(hp) {
  const full = Math.floor(hp / 2), half = hp % 2 ? 1 : 0, empty = 10 - full - half;
  return '<span class="hp">' + '❤'.repeat(full) + (half ? '♥' : '') + '</span>' + '<span class="hp-empty">' + '♡'.repeat(Math.max(0, empty)) + '</span>';
}
function hungerIcons(h) {
  const full = Math.floor(h / 2), half = h % 2 ? 1 : 0, empty = 10 - full - half;
  return '<span class="hg">' + '🍗'.repeat(full) + '</span>' + '<span class="hg-empty">' + '·'.repeat(Math.max(0, empty)) + '</span>';
}

function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  return e;
}
