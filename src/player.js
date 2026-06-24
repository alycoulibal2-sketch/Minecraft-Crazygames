// player.js — movement, AABB-vs-voxel collision, flight, block interaction.

import {
  GRAVITY, TERMINAL_VELOCITY, WALK_SPEED, SPRINT_SPEED, FLY_SPEED, FLY_SPRINT,
  JUMP_VELOCITY, PLAYER_HEIGHT, PLAYER_EYE, PLAYER_RADIUS, REACH,
} from './config.js';
import { dirFromYawPitch } from './math.js';
import { AIR, BLOCKS, ID, WATER } from './blocks.js';
import { Inventory } from './inventory.js';
import { ITEMS, ITEM_ID, breakSeconds, blockDrops } from './items.js';

const EPS = 1e-3;
const SENS = 0.0022;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = [0.5, 80, 0.5];
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0;
    this.mode = 'creative';      // 'creative' | 'survival' | 'spectator'
    this.flying = true;
    this.onGround = false;
    this.inWater = false;
    this.selected = 0;
    // Creative palette hotbar (block ids). Survival uses `inventory` slots 0-8.
    this.hotbar = [ID.grass_block, ID.dirt, ID.stone, ID.cobblestone, ID.oak_planks, ID.oak_log, ID.glass, ID.glowstone, ID.sand];
    this.inventory = new Inventory();
    this.target = { hit: false };
    this._lastSpace = -1;
    this.health = 20; this.maxHealth = 20;
    this.hunger = 20; this.maxHunger = 20;
    this.saturation = 5; this.exhaustion = 0;
    this.breakTarget = null; this.breakTime = 0; this.breakProgress = 0;
    this.air = 300; this.maxAir = 300;
    this.dead = false;
    this._peakY = null;
  }

  // ---- held item helpers (survival reads inventory; creative reads palette) ----
  heldStack() { return this.mode === 'survival' ? this.inventory.slots[this.selected] : null; }
  heldItem() { const s = this.heldStack(); return s ? ITEMS[s.id] : null; }
  heldBlockId() {
    if (this.mode === 'creative') return this.hotbar[this.selected];
    const it = this.heldItem();
    return it && it.block ? it.block : AIR;
  }
  heldTool() { const it = this.heldItem(); return it && it.tool ? it : null; }

  giveDrops(drops) { for (const d of drops) this.inventory.add(d.id, d.count); }
  damageTool() {
    const s = this.heldStack(); if (!s) return;
    const it = ITEMS[s.id];
    if (!it || !it.tool || !it.durability) return;
    s.dmg = (s.dmg || 0) + 1;
    if (s.dmg >= it.durability) this.inventory.decrement(this.selected, 1);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'survival') { this.flying = false; }
    if (mode === 'spectator') { this.flying = true; }
  }

  update(dt, input, game) {
    this._look(input);
    this._handleHotbar(input);
    this._move(dt, input);
    this._interact(dt, input, game);
  }

  _look(input) {
    const d = input.consumeLook();
    this.yaw -= d.dx * SENS;
    this.pitch -= d.dy * SENS;
    const lim = Math.PI / 2 - 0.001;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  _handleHotbar(input) {
    for (let i = 0; i < 9; i++) if (input.wasTapped('Digit' + (i + 1))) this.selected = i;
    const w = input.consumeWheel();
    if (w) this.selected = (this.selected + w + 9) % 9;
  }

  _move(dt, input) {
    const world = this.world;
    // double-tap space toggles flight (creative/spectator)
    if (input.wasTapped('Space') && this.mode !== 'survival') {
      const now = performance.now();
      if (now - this._lastSpace < 300) { this.flying = !this.flying; this.vel[1] = 0; }
      this._lastSpace = now;
    }

    const sprint = input.isDown('ControlLeft') || input.isDown('ControlRight');
    const sneak = input.isDown('ShiftLeft') && !this.flying;
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const fwd = [-sinY, 0, -cosY];
    const right = [cosY, 0, -sinY];
    let mz = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0) + input.touch.fwd;
    let mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0) + input.touch.strafe;
    let dx = fwd[0] * mz + right[0] * mx;
    let dz = fwd[2] * mz + right[2] * mx;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) { dx /= len; dz /= len; }

    // water check (feet)
    this.inWater = world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.2), Math.floor(this.pos[2])) === WATER;

    let speed;
    if (this.flying) speed = sprint ? FLY_SPRINT : FLY_SPEED;
    else speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * (sneak ? 0.4 : 1) * (this.inWater ? 0.5 : 1);

    this.vel[0] = dx * speed;
    this.vel[2] = dz * speed;

    if (this.flying) {
      let vy = 0;
      if (input.isDown('Space')) vy += 1;
      if (input.isDown('ShiftLeft')) vy -= 1;
      this.vel[1] = vy * speed;
    } else if (this.inWater) {
      this.vel[1] -= GRAVITY * 0.28 * dt;
      if (this.vel[1] < -6) this.vel[1] = -6;
      if (input.isDown('Space') || input.touch.jump) this.vel[1] = 4.5;
    } else {
      this.vel[1] -= GRAVITY * dt;
      if (this.vel[1] < -TERMINAL_VELOCITY) this.vel[1] = -TERMINAL_VELOCITY;
      if ((input.isDown('Space') || input.touch.jump) && this.onGround) { this.vel[1] = JUMP_VELOCITY; this.onGround = false; }
    }

    // integrate with collision (skip collision in spectator)
    if (this.mode === 'spectator') {
      this.pos[0] += this.vel[0] * dt; this.pos[1] += this.vel[1] * dt; this.pos[2] += this.vel[2] * dt;
      this.onGround = false;
      return;
    }
    const wasGround = this.onGround;
    this.onGround = false;
    this._moveAxis(0, this.vel[0] * dt);
    this._moveAxis(2, this.vel[2] * dt);
    this._moveAxis(1, this.vel[1] * dt);

    // ---- fall damage ----
    if (this.flying || this.inWater) {
      this._peakY = this.pos[1];
    } else if (!this.onGround) {
      if (this._peakY === null || this.pos[1] > this._peakY) this._peakY = this.pos[1];
    } else {
      if (this._peakY !== null && !wasGround) {
        const fall = this._peakY - this.pos[1];
        if (fall > 3.5) this.takeDamage(Math.floor(fall - 3));
      }
      this._peakY = this.pos[1];
    }
  }

  _moveAxis(axis, d) {
    if (d === 0) return;
    const half = PLAYER_RADIUS, h = PLAYER_HEIGHT;
    this.pos[axis] += d;
    if (!this._collides()) return;
    const p = this.pos;
    if (axis === 0) {
      if (d > 0) p[0] = Math.floor(p[0] + half) - half - EPS;
      else p[0] = Math.floor(p[0] - half) + 1 + half + EPS;
      this.vel[0] = 0;
    } else if (axis === 2) {
      if (d > 0) p[2] = Math.floor(p[2] + half) - half - EPS;
      else p[2] = Math.floor(p[2] - half) + 1 + half + EPS;
      this.vel[2] = 0;
    } else {
      if (d > 0) { p[1] = Math.floor(p[1] + h) - h - EPS; }
      else { p[1] = Math.floor(p[1]) + 1 + EPS; this.onGround = true; }
      this.vel[1] = 0;
    }
  }

  _collides() {
    const p = this.pos, half = PLAYER_RADIUS, h = PLAYER_HEIGHT, world = this.world;
    const minX = Math.floor(p[0] - half), maxX = Math.floor(p[0] + half);
    const minY = Math.floor(p[1]), maxY = Math.floor(p[1] + h - EPS);
    const minZ = Math.floor(p[2] - half), maxZ = Math.floor(p[2] + half);
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++) {
          const id = world.getBlock(x, y, z);
          if (id !== AIR && BLOCKS[id].solid) return true;
        }
    return false;
  }

  blockIntersectsPlayer(bx, by, bz) {
    const p = this.pos, half = PLAYER_RADIUS, h = PLAYER_HEIGHT;
    return (bx + 1 > p[0] - half && bx < p[0] + half &&
            by + 1 > p[1] && by < p[1] + h &&
            bz + 1 > p[2] - half && bz < p[2] + half);
  }

  _interact(dt, input, game) {
    const eye = [this.pos[0], this.pos[1] + PLAYER_EYE, this.pos[2]];
    const dir = dirFromYawPitch(this.yaw, this.pitch);
    const hit = this.world.raycast(eye, dir, REACH);
    this.target = hit;
    if (this.mode === 'spectator') { this.breakTarget = null; this.breakProgress = 0; return; }
    const sneak = input.isDown('ShiftLeft');

    // ---- break (left held) ----
    if (hit.hit && (input.buttons[0] || input.touch.break)) {
      const b = BLOCKS[hit.id];
      const tk = hit.x + ',' + hit.y + ',' + hit.z;
      if (b.hardness < 0) { this.breakTarget = null; this.breakProgress = 0; }  // unbreakable
      else if (this.mode === 'creative') {
        this._break(hit, game, false);
      } else {
        if (this.breakTarget !== tk) { this.breakTarget = tk; this.breakTime = 0; }
        this.breakTime += dt;
        const needed = breakSeconds(b, this.heldTool());
        this.breakProgress = Math.min(1, this.breakTime / needed);
        if (this.breakTime >= needed) {
          this._break(hit, game, true);
          this.damageTool();
          this.exhaustion += 0.005;
          this.breakTarget = null; this.breakProgress = 0; this.breakTime = 0;
        }
      }
    } else {
      this.breakTarget = null; this.breakProgress = 0;
    }

    // ---- use / place (right click) ----
    if (hit.hit && input.clicked[2]) {
      const tgt = BLOCKS[hit.id];
      // open functional block UIs (unless sneaking, which forces placement)
      if (!sneak && game && (hit.id === ID.crafting_table || hit.id === ID.furnace)) {
        game.openBlockUI(hit.id === ID.crafting_table ? 'crafting' : 'furnace', hit);
      } else {
        const held = this.heldItem();
        if (held && held.food > 0 && this.hunger < this.maxHunger && this.mode === 'survival') {
          this.eat(held);
        } else {
          this._place(hit, game);
        }
      }
    }
    // middle click: pick block into hand
    if (hit.hit && input.clicked[1]) {
      if (this.mode === 'creative') this.hotbar[this.selected] = hit.id;
      else { const it = ITEM_ID[BLOCKS[hit.id].name]; if (it && this.inventory.has(it)) {/* already have */} }
    }
  }

  _place(hit, game) {
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const id = this.heldBlockId();
    if (!id || id === AIR) return;
    const existing = this.world.getBlock(px, py, pz);
    const replaceable = existing === AIR || existing === WATER || BLOCKS[existing].isCross;
    if (!replaceable) return;
    if (BLOCKS[id].solid && this.blockIntersectsPlayer(px, py, pz)) return;
    this.world.setBlock(px, py, pz, id);
    if (this.mode === 'survival') this.inventory.decrement(this.selected, 1);
    if (game) game.onPlace?.(id);
  }

  eat(item) {
    this.hunger = Math.min(this.maxHunger, this.hunger + item.food);
    this.saturation = Math.min(this.hunger, this.saturation + item.food * 0.6);
    this.inventory.decrement(this.selected, 1);
  }

  _break(hit, game, survival) {
    const id = hit.id;
    const block = BLOCKS[id];
    this.world.setBlock(hit.x, hit.y, hit.z, AIR);
    if (survival) this.giveDrops(blockDrops(block, this.heldTool()));
    if (game) game.onBreak?.(id, hit.x, hit.y, hit.z);
  }

  // ---- damage / death ----
  takeDamage(amount) {
    if (this.mode !== 'survival') return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }
  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }
}
