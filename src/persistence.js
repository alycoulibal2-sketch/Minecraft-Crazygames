// persistence.js — save/load the world to localStorage (or any storage stub).
// We persist the seed + player edits (diff vs procedural terrain), not full chunks,
// so saves stay tiny regardless of how far the player has explored.

const KEY = 'mc-crazygames-save-v1';

export function serializeGame(game) {
  const p = game.player;
  return {
    v: 1,
    seed: game.world.seed,
    mode: game.mode,
    time: game.timeOfDay,
    pos: [p.pos[0], p.pos[1], p.pos[2]],
    yaw: p.yaw, pitch: p.pitch,
    health: p.health, hunger: p.hunger, saturation: p.saturation, air: p.air,
    selected: p.selected,
    inventory: p.inventory.serialize(),
    hotbar: p.hotbar.slice(),
    edits: [...game.world.edits.entries()],
    furnaces: [...game.furnaces.entries()],
    spawn: game.spawnPoint.slice(),
    renderDistance: game.renderDistance,
  };
}

export function applySave(game, data) {
  const p = game.player;
  game.world.edits = new Map(data.edits || []);
  // re-apply edits to any chunks already in memory, and mark them for remesh
  for (const c of game.world.chunks.values()) { if (c.generated) game.world.applyEdits(c); c.dirty = true; }
  game.furnaces = new Map(data.furnaces || []);
  game.mode = data.mode || 'creative';
  game.timeOfDay = data.time ?? 0.3;
  game.renderDistance = data.renderDistance || game.renderDistance;
  if (data.pos) p.pos = data.pos.slice();
  if (typeof data.yaw === 'number') p.yaw = data.yaw;
  if (typeof data.pitch === 'number') p.pitch = data.pitch;
  p.health = data.health ?? p.maxHealth;
  p.hunger = data.hunger ?? p.maxHunger;
  p.saturation = data.saturation ?? 5;
  p.air = data.air ?? p.maxAir;
  p.selected = data.selected || 0;
  p.inventory.load(data.inventory);
  if (data.hotbar) p.hotbar = data.hotbar.slice();
  if (data.spawn) game.spawnPoint = data.spawn.slice();
  p.setMode(game.mode);
  return data.pos;
}

export function save(game, storage) {
  storage = storage || _ls();
  if (!storage) return false;
  try { storage.setItem(KEY, JSON.stringify(serializeGame(game))); return true; }
  catch (e) { console.warn('save failed', e); return false; }
}

export function load(storage) {
  storage = storage || _ls();
  if (!storage) return null;
  try { const s = storage.getItem(KEY); return s ? JSON.parse(s) : null; }
  catch (e) { console.warn('load failed', e); return null; }
}

export function hasSave(storage) {
  storage = storage || _ls();
  try { return !!(storage && storage.getItem(KEY)); } catch { return false; }
}

export function clearSave(storage) {
  storage = storage || _ls();
  try { storage && storage.removeItem(KEY); } catch {}
}

function _ls() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
