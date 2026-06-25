// entities.js — mobs: AABB physics, simple AI, spawning, drops. DOM-free + testable.

import { GRAVITY, TERMINAL_VELOCITY } from './config.js';
import { BLOCKS, AIR, ID } from './blocks.js';
import { ITEM_ID } from './items.js';

const EPS = 1e-3;

// ---------- mob definitions ----------
// model: array of boxes {x,y,z (center; y measured from feet), w,h,d, color:[r,g,b 0..1]}
// half/height: collision AABB. drops: [{item, min, max, chance}]
function leg(x, z, h, color) { return { x, y: h / 2, z, w: 0.16, h, d: 0.16, color }; }

const PINK = [0.92, 0.62, 0.66], PINK_D = [0.78, 0.45, 0.5];
const COW_B = [0.32, 0.22, 0.16], COW_W = [0.93, 0.93, 0.9];
const WOOL = [0.95, 0.95, 0.92], SHEEP_F = [0.86, 0.7, 0.62];
const CHICK = [0.95, 0.95, 0.95], CHICK_B = [0.95, 0.78, 0.2];
const ZOM_S = [0.3, 0.6, 0.45], ZOM_SHIRT = [0.27, 0.4, 0.78], ZOM_LEG = [0.27, 0.27, 0.45];

export const MOBS = {
  pig: {
    name: 'pig', half: 0.45, height: 0.9, maxHealth: 10, speed: 1.6, hostile: false,
    drops: [{ item: 'porkchop', min: 1, max: 3, chance: 1 }],
    model: [
      { x: 0, y: 0.45, z: 0, w: 0.6, h: 0.5, d: 0.9, color: PINK },
      { x: 0, y: 0.5, z: -0.58, w: 0.5, h: 0.5, d: 0.42, color: PINK },
      { x: 0, y: 0.42, z: -0.82, w: 0.26, h: 0.2, d: 0.1, color: PINK_D },
      leg(-0.18, 0.3, 0.25, PINK_D), leg(0.18, 0.3, 0.25, PINK_D),
      leg(-0.18, -0.3, 0.25, PINK_D), leg(0.18, -0.3, 0.25, PINK_D),
    ],
  },
  cow: {
    name: 'cow', half: 0.45, height: 1.3, maxHealth: 10, speed: 1.4, hostile: false,
    drops: [{ item: 'porkchop', min: 1, max: 3, chance: 1 }, { item: 'leather', min: 0, max: 2, chance: 1 }],
    model: [
      { x: 0, y: 0.7, z: 0, w: 0.7, h: 0.6, d: 1.0, color: COW_B },
      { x: 0, y: 0.85, z: -0.62, w: 0.5, h: 0.5, d: 0.5, color: COW_W },
      { x: -0.18, y: 1.15, z: -0.78, w: 0.08, h: 0.18, d: 0.08, color: COW_W },
      { x: 0.18, y: 1.15, z: -0.78, w: 0.08, h: 0.18, d: 0.08, color: COW_W },
      leg(-0.22, 0.35, 0.55, COW_B), leg(0.22, 0.35, 0.55, COW_B),
      leg(-0.22, -0.35, 0.55, COW_B), leg(0.22, -0.35, 0.55, COW_B),
    ],
  },
  sheep: {
    name: 'sheep', half: 0.45, height: 1.2, maxHealth: 8, speed: 1.4, hostile: false,
    drops: [{ item: 'white_wool', min: 1, max: 1, chance: 1 }, { item: 'mutton', min: 1, max: 2, chance: 1 }],
    model: [
      { x: 0, y: 0.7, z: 0, w: 0.7, h: 0.7, d: 1.0, color: WOOL },
      { x: 0, y: 0.75, z: -0.6, w: 0.4, h: 0.4, d: 0.4, color: SHEEP_F },
      leg(-0.22, 0.3, 0.5, SHEEP_F), leg(0.22, 0.3, 0.5, SHEEP_F),
      leg(-0.22, -0.3, 0.5, SHEEP_F), leg(0.22, -0.3, 0.5, SHEEP_F),
    ],
  },
  chicken: {
    name: 'chicken', half: 0.3, height: 0.7, maxHealth: 4, speed: 1.3, hostile: false,
    drops: [{ item: 'chicken_meat', min: 1, max: 1, chance: 1 }, { item: 'feather', min: 0, max: 2, chance: 1 }],
    model: [
      { x: 0, y: 0.35, z: 0, w: 0.36, h: 0.4, d: 0.5, color: CHICK },
      { x: 0, y: 0.55, z: -0.28, w: 0.28, h: 0.3, d: 0.28, color: CHICK },
      { x: 0, y: 0.55, z: -0.44, w: 0.12, h: 0.1, d: 0.12, color: CHICK_B },
      leg(-0.1, 0.05, 0.2, CHICK_B), leg(0.1, 0.05, 0.2, CHICK_B),
    ],
  },
  zombie: {
    name: 'zombie', half: 0.4, height: 1.9, maxHealth: 20, speed: 1.5, hostile: true,
    attack: 3, drops: [{ item: 'rotten_flesh', min: 0, max: 2, chance: 1 }],
    model: [
      { x: 0, y: 1.05, z: 0, w: 0.5, h: 0.75, d: 0.28, color: ZOM_SHIRT },
      { x: 0, y: 1.65, z: 0, w: 0.5, h: 0.5, d: 0.5, color: ZOM_S },
      { x: -0.33, y: 1.05, z: -0.05, w: 0.18, h: 0.7, d: 0.22, color: ZOM_S },
      { x: 0.33, y: 1.05, z: -0.05, w: 0.18, h: 0.7, d: 0.22, color: ZOM_S },
      { x: -0.13, y: 0.45, z: 0, w: 0.2, h: 0.9, d: 0.24, color: ZOM_LEG },
      { x: 0.13, y: 0.45, z: 0, w: 0.2, h: 0.9, d: 0.24, color: ZOM_LEG },
    ],
  },
};

// ---------- physics ----------
function aabbSolid(world, p, half, height) {
  const minX = Math.floor(p[0] - half), maxX = Math.floor(p[0] + half);
  const minY = Math.floor(p[1]), maxY = Math.floor(p[1] + height - EPS);
  const minZ = Math.floor(p[2] - half), maxZ = Math.floor(p[2] + half);
  for (let y = minY; y <= maxY; y++)
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const id = world.getBlock(x, y, z);
        if (id !== AIR && BLOCKS[id].solid) return true;
      }
  return false;
}
function moveAxis(world, e, axis, d, half, height) {
  if (d === 0) return;
  const p = e.pos;
  p[axis] += d;
  if (!aabbSolid(world, p, half, height)) return;
  if (axis === 1) {
    if (d > 0) p[1] = Math.floor(p[1] + height) - height - EPS;
    else { p[1] = Math.floor(p[1]) + 1 + EPS; e.onGround = true; }
    e.vel[1] = 0;
  } else {
    if (d > 0) p[axis] = Math.floor(p[axis] + half) - half - EPS;
    else p[axis] = Math.floor(p[axis] - half) + 1 + half + EPS;
    e.vel[axis] = 0; e.blockedHoriz = true;
  }
}
export function stepPhysics(world, e, dt, half, height) {
  e.onGround = false; e.blockedHoriz = false;
  e.vel[1] -= GRAVITY * dt;
  if (e.vel[1] < -TERMINAL_VELOCITY) e.vel[1] = -TERMINAL_VELOCITY;
  moveAxis(world, e, 0, e.vel[0] * dt, half, height);
  moveAxis(world, e, 2, e.vel[2] * dt, half, height);
  moveAxis(world, e, 1, e.vel[1] * dt, half, height);
}

// ---------- Mob ----------
let MOB_UID = 1;
export class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOBS[type];
    this.id = MOB_UID++;
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.health = this.def.maxHealth;
    this.onGround = false;
    this.dead = false;
    this._aiTimer = 0;
    this._wanderYaw = 0;
    this._moving = false;
    this._panic = 0;
    this._attackCd = 0;
    this._hurtFlash = 0;
    this.age = 0;
  }

  hurt(amount, fromYaw) {
    this.health -= amount;
    this._hurtFlash = 0.3;
    this._panic = 4;
    // knockback
    if (fromYaw != null) { this.vel[0] += -Math.sin(fromYaw) * 4; this.vel[2] += -Math.cos(fromYaw) * 4; this.vel[1] = 4; }
    if (this.health <= 0) this.dead = true;
  }

  update(dt, world, player, env) {
    this.age += dt;
    const def = this.def;
    if (this._attackCd > 0) this._attackCd -= dt;
    if (this._hurtFlash > 0) this._hurtFlash -= dt;
    if (this._panic > 0) this._panic -= dt;

    const dx = player.pos[0] - this.pos[0], dz = player.pos[2] - this.pos[2];
    const distToPlayer = Math.hypot(dx, dz);

    let targetYaw = this._wanderYaw, wantMove = this._moving, speed = def.speed;

    if (def.hostile) {
      // chase player when close-ish and dark; otherwise wander
      const dark = env ? env.dayLight < 0.45 : true;
      if (distToPlayer < 18 && (dark || distToPlayer < 6)) {
        targetYaw = Math.atan2(-dx, -dz);
        wantMove = true; speed = def.speed * 1.15;
        if (distToPlayer < 1.4 && this._attackCd <= 0) {
          if (player.takeDamage) player.takeDamage(def.attack || 2);
          this._attackCd = 1.0;
        }
      } else { this._aiWander(dt); targetYaw = this._wanderYaw; wantMove = this._moving; }
      // burn in daylight
      if (env && env.dayLight > 0.7 && this._skyExposed(world)) { this.health -= dt * 2; this._hurtFlash = 0.2; if (this.health <= 0) this.dead = true; }
    } else {
      if (this._panic > 0) { targetYaw = Math.atan2(-dx, -dz) + Math.PI; wantMove = true; speed = def.speed * 1.8; }
      else { this._aiWander(dt); targetYaw = this._wanderYaw; wantMove = this._moving; }
    }

    // smooth turn toward target yaw
    this.yaw = approachAngle(this.yaw, targetYaw, dt * 6);

    if (wantMove) {
      this.vel[0] = -Math.sin(this.yaw) * speed;
      this.vel[2] = -Math.cos(this.yaw) * speed;
    } else { this.vel[0] *= 0.6; this.vel[2] *= 0.6; }

    stepPhysics(world, this, dt, def.half, def.height);

    // hop over 1-block obstacles
    if (this.blockedHoriz && this.onGround && wantMove) this.vel[1] = 7;

    // drown-safety: if stuck underwater/in block, nudge up
    if (this.pos[1] < -8) this.dead = true;
  }

  _aiWander(dt) {
    this._aiTimer -= dt;
    if (this._aiTimer <= 0) {
      this._aiTimer = 2 + Math.random() * 4;
      this._moving = Math.random() < 0.6;
      this._wanderYaw = Math.random() * Math.PI * 2;
    }
  }

  _skyExposed(world) {
    const x = Math.floor(this.pos[0]), z = Math.floor(this.pos[2]);
    const top = Math.floor(this.pos[1] + this.def.height);
    for (let y = top + 1; y < 128; y++) { const id = world.getBlock(x, y, z); if (id !== AIR && BLOCKS[id].occludes) return false; }
    return true;
  }
}

function approachAngle(cur, target, t) {
  let d = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, t);
}

// ---------- manager ----------
const PASSIVE = ['pig', 'cow', 'sheep', 'chicken'];
const ITEM_HALF = 0.125, ITEM_H = 0.25, ITEM_PICKUP = 1.4, ITEM_MAGNET = 2.2, ITEM_TTL = 300, MAX_ITEMS = 220;

export class EntityManager {
  constructor(world) {
    this.world = world;
    this.mobs = [];
    this.items = [];           // dropped item entities {pos,vel,id,count,age,pickupDelay,...}
    this._spawnTimer = 0;
    this.maxPassive = 18;
    this.maxHostile = 16;
    this.spawnRadius = 44;
  }

  // Spawn a dropped item entity at (x,y,z). Merges into a nearby same-id stack
  // to keep the entity count down. scatter gives it a little pop when it appears.
  spawnItem(x, y, z, id, count, scatter = true) {
    if (!id || count <= 0) return;
    for (const it of this.items) {
      if (it.id === id && Math.abs(it.pos[0] - x) < 0.7 && Math.abs(it.pos[1] - y) < 0.7 && Math.abs(it.pos[2] - z) < 0.7) {
        it.count += count; return;
      }
    }
    if (this.items.length >= MAX_ITEMS) this.items.shift();
    const v = scatter ? [(Math.random() - 0.5) * 2, 2 + Math.random() * 1.2, (Math.random() - 0.5) * 2] : [0, 1, 0];
    this.items.push({ pos: [x, y, z], vel: v, id, count, age: 0, pickupDelay: 0.5, onGround: false, blockedHoriz: false });
  }

  spawnDrops(drops, x, y, z) { if (drops) for (const d of drops) this.spawnItem(x, y, z, d.id, d.count); }

  update(dt, player, game, env) {
    const world = this.world;
    const difficulty = (game && game.difficulty) || 'normal';
    const peaceful = difficulty === 'peaceful';
    for (const m of this.mobs) m.update(dt, world, player, env);

    // handle deaths + drops, and despawn far mobs (and all hostiles on Peaceful)
    const px = player.pos[0], pz = player.pos[2];
    const keep = [];
    for (const m of this.mobs) {
      const far = Math.hypot(m.pos[0] - px, m.pos[2] - pz) > this.spawnRadius + 24;
      if (m.dead) { this._onDeath(m, player, game); continue; }
      if (far) continue;
      if (peaceful && m.def.hostile) continue;   // Peaceful clears hostile mobs
      keep.push(m);
    }
    this.mobs = keep;

    // dropped item entities: physics, magnet toward player, walk-over pickup
    this._updateItems(dt, player, game);

    // spawning
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = 2.5;
      this._trySpawn(player, env, peaceful);
    }
  }

  _updateItems(dt, player, game) {
    if (this.items.length === 0) return;
    const world = this.world;
    const survival = game && game.mode === 'survival' && player.inventory;
    const kept = [];
    for (const it of this.items) {
      it.age += dt;
      if (it.pickupDelay > 0) it.pickupDelay -= dt;
      stepPhysics(world, it, dt, ITEM_HALF, ITEM_H);
      if (it.onGround) { it.vel[0] *= 0.6; it.vel[2] *= 0.6; }

      const dx = player.pos[0] - it.pos[0];
      const dy = (player.pos[1] + 0.7) - it.pos[1];
      const dz = player.pos[2] - it.pos[2];
      const dist = Math.hypot(dx, dy, dz);
      if (survival && it.pickupDelay <= 0 && dist < ITEM_MAGNET) {
        // glide toward the player (kinematic, like MC's pickup) so it reliably
        // lifts grounded drops up to the player instead of fighting gravity.
        const k = Math.min(1, dt * 9);
        it.pos[0] += dx * k; it.pos[1] += dy * k; it.pos[2] += dz * k;
        it.vel[0] = it.vel[1] = it.vel[2] = 0;
        if (dist < ITEM_PICKUP) {
          const left = player.inventory.add(it.id, it.count);
          if (left < it.count && game.audio && game.audio.pickup) game.audio.pickup();
          it.count = left;
          if (it.count <= 0) continue;       // fully collected -> remove
        }
      }
      if (it.age > ITEM_TTL || it.pos[1] < -16) continue;
      if (Math.hypot(it.pos[0] - player.pos[0], it.pos[2] - player.pos[2]) > this.spawnRadius + 40) continue;
      kept.push(it);
    }
    this.items = kept;
  }

  counts() {
    let passive = 0, hostile = 0;
    for (const m of this.mobs) (m.def.hostile ? hostile++ : passive++);
    return { passive, hostile };
  }

  _onDeath(m, player, game) {
    if (game && game.mode === 'survival') {
      for (const d of m.def.drops || []) {
        if (Math.random() <= d.chance) {
          const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
          const itemId = ITEM_ID[d.item];
          if (itemId && n > 0) this.spawnItem(m.pos[0], m.pos[1] + 0.4, m.pos[2], itemId, n);
        }
      }
    }
  }

  _trySpawn(player, env, peaceful) {
    const { passive, hostile } = this.counts();
    const night = env ? env.dayLight < 0.35 : false;
    const wantHostile = night && hostile < this.maxHostile && !peaceful;
    const wantPassive = !night && passive < this.maxPassive;
    if (!wantHostile && !wantPassive) return;

    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * (this.spawnRadius - 24);
      const wx = Math.floor(player.pos[0] + Math.cos(ang) * r);
      const wz = Math.floor(player.pos[2] + Math.sin(ang) * r);
      const sy = this._groundAt(wx, wz);
      if (sy < 1) continue;
      const ground = this.world.getBlock(wx, sy - 1, wz);
      if (ground === AIR || !BLOCKS[ground].solid) continue;
      if (this.world.getBlock(wx, sy, wz) !== AIR || this.world.getBlock(wx, sy + 1, wz) !== AIR) continue;

      if (wantHostile) { this.mobs.push(new Mob('zombie', wx + 0.5, sy, wz + 0.5)); return; }
      if (wantPassive) {
        if (ground !== ID.grass_block) continue;        // animals spawn on grass
        const type = PASSIVE[(Math.random() * PASSIVE.length) | 0];
        this.mobs.push(new Mob(type, wx + 0.5, sy, wz + 0.5));
        return;
      }
    }
  }

  _groundAt(wx, wz) {
    for (let y = 120; y > 1; y--) {
      const id = this.world.getBlock(wx, y, wz);
      if (id !== AIR && BLOCKS[id].solid) return y + 1;
    }
    return 0;
  }

  // ray vs mob AABBs; returns {mob, t} of nearest hit within maxDist or null
  raycastMob(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      const t = rayAABB(origin, dir, m.pos[0] - m.def.half, m.pos[1], m.pos[2] - m.def.half,
        m.pos[0] + m.def.half, m.pos[1] + m.def.height, m.pos[2] + m.def.half);
      if (t != null && t < bestT) { bestT = t; best = m; }
    }
    return best ? { mob: best, t: bestT } : null;
  }
}

function rayAABB(o, d, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const lo = [minx, miny, minz][i], hi = [maxx, maxy, maxz][i];
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < lo || o[i] > hi) return null; }
    else {
      let t1 = (lo - o[i]) / d[i], t2 = (hi - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
