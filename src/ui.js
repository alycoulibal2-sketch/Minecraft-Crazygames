// ui.js — DOM-based HUD: crosshair, hotbar, inventory picker, debug overlay, health/hunger.

import { BLOCKS, AIR } from './blocks.js';
import { TILE, ATLAS_COLS } from './textures.js';

const ATLAS_PX = TILE * ATLAS_COLS;

export class UI {
  constructor(root, atlasCanvas, atlasUV, player) {
    this.root = root;
    this.atlasCanvas = atlasCanvas;
    this.atlasUV = atlasUV;
    this.player = player;
    this.iconCache = new Map();
    this.invOpen = false;
    this._lastHotbar = null;
    this._build();
  }

  // Draw a block's representative tile to a scaled canvas (pixel-art).
  makeIcon(blockId, size = 44) {
    const cacheKey = blockId + ':' + size;
    if (this.iconCache.has(cacheKey)) return this.iconCache.get(cacheKey);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const b = BLOCKS[blockId];
    if (b && b.tiles) {
      const name = b.tiles[2] && b.render === 'opaque' && b.tiles[0] !== b.tiles[2] ? b.tiles[0] : b.tiles[0];
      const uv = this.atlasUV.get(b.tiles[0]) || this.atlasUV.get(name);
      if (uv) {
        const sx = uv[0] * ATLAS_PX, sy = uv[1] * ATLAS_PX;
        ctx.drawImage(this.atlasCanvas, sx, sy, TILE, TILE, 0, 0, size, size);
      }
    }
    this.iconCache.set(cacheKey, c);
    return c;
  }

  _build() {
    const root = this.root;
    root.innerHTML = '';

    // crosshair
    const cross = el('div', { id: 'crosshair' });
    cross.textContent = '+';
    root.appendChild(cross);

    // hotbar
    this.hotbarEl = el('div', { id: 'hotbar' });
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = el('div', { class: 'slot' });
      this.slotEls.push(slot);
      this.hotbarEl.appendChild(slot);
    }
    root.appendChild(this.hotbarEl);

    // survival bars
    this.barsEl = el('div', { id: 'bars' });
    this.healthEl = el('div', { class: 'bar health' });
    this.hungerEl = el('div', { class: 'bar hunger' });
    this.barsEl.appendChild(this.healthEl);
    this.barsEl.appendChild(this.hungerEl);
    root.appendChild(this.barsEl);

    // debug
    this.debugEl = el('div', { id: 'debug' });
    this.debugEl.style.display = 'none';
    root.appendChild(this.debugEl);

    // hint
    this.hintEl = el('div', { id: 'hint' });
    this.hintEl.innerHTML = 'Click to play &nbsp;·&nbsp; WASD move · Space jump/up · Shift down · double-Space fly · E inventory · F3 debug · 1-9 hotbar · LMB break · RMB place';
    root.appendChild(this.hintEl);

    // inventory overlay
    this.invEl = el('div', { id: 'inventory' });
    this.invEl.style.display = 'none';
    const panel = el('div', { id: 'inv-panel' });
    const title = el('div', { id: 'inv-title' });
    title.textContent = 'Creative Inventory — click a block to put it in the selected slot';
    panel.appendChild(title);
    const grid = el('div', { id: 'inv-grid' });
    for (let id = 1; id < BLOCKS.length; id++) {
      const b = BLOCKS[id];
      if (!b || b.render === 'none') continue;
      const cell = el('div', { class: 'inv-cell', title: b.name.replace(/_/g, ' ') });
      cell.appendChild(this.makeIcon(id, 40));
      cell.addEventListener('click', () => {
        this.player.hotbar[this.player.selected] = id;
        this._lastHotbar = null; // force hotbar refresh
        this.toggleInventory(false);
      });
      grid.appendChild(cell);
    }
    panel.appendChild(grid);
    this.invEl.appendChild(panel);
    root.appendChild(this.invEl);
  }

  toggleInventory(force) {
    this.invOpen = force !== undefined ? force : !this.invOpen;
    this.invEl.style.display = this.invOpen ? 'flex' : 'none';
    if (this.invOpen && document.pointerLockElement) document.exitPointerLock();
  }

  _refreshHotbar() {
    const hb = this.player.hotbar;
    const sig = hb.join(',') + '|' + this.player.selected;
    if (sig === this._lastHotbar) return;
    this._lastHotbar = sig;
    for (let i = 0; i < 9; i++) {
      const slot = this.slotEls[i];
      slot.classList.toggle('selected', i === this.player.selected);
      slot.innerHTML = '';
      const id = hb[i];
      if (id && id !== AIR) slot.appendChild(this.makeIcon(id, 44));
    }
  }

  setHint(show) { this.hintEl.style.display = show ? 'block' : 'none'; }

  update(game, fps) {
    const p = this.player;
    this._refreshHotbar();

    // bars (survival only)
    if (p.mode === 'survival') {
      this.barsEl.style.display = 'flex';
      this.healthEl.textContent = '❤'.repeat(Math.max(0, Math.ceil(p.health / 2)));
      this.hungerEl.textContent = '🍗'.repeat(Math.max(0, Math.ceil(p.hunger / 2)));
    } else {
      this.barsEl.style.display = 'none';
    }

    // debug
    if (this.debugEl.style.display !== 'none') {
      const t = p.target;
      const look = t && t.hit ? `${BLOCKS[t.id].name} @ ${t.x},${t.y},${t.z}` : '—';
      this.debugEl.innerHTML =
        `<b>Minecraft Crazygames</b> (${game.mode})<br>` +
        `fps: ${fps.toFixed(0)}<br>` +
        `xyz: ${p.pos[0].toFixed(1)} / ${p.pos[1].toFixed(1)} / ${p.pos[2].toFixed(1)}<br>` +
        `chunk: ${Math.floor(p.pos[0] / 16)}, ${Math.floor(p.pos[2] / 16)}<br>` +
        `yaw: ${(p.yaw * 180 / Math.PI).toFixed(0)}° pitch: ${(p.pitch * 180 / Math.PI).toFixed(0)}°<br>` +
        `flying: ${p.flying} onGround: ${p.onGround} water: ${p.inWater}<br>` +
        `looking: ${look}<br>` +
        `chunks loaded: ${game.world.chunks.size}<br>` +
        `time: ${(game.timeOfDay * 24).toFixed(1)}h`;
    }
  }

  toggleDebug() {
    this.debugEl.style.display = this.debugEl.style.display === 'none' ? 'block' : 'none';
  }
}

function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  return e;
}
