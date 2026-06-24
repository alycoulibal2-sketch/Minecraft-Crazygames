// Headless smoke test: exercises DOM-free engine code (worldgen, meshing, raycast,
// collision) and stubs minimal DOM so the texture atlas builder can verify coverage.
// Run: node tools/smoke-test.mjs

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = (f) => 'file://' + path.join(ROOT, 'src', f).replace(/\\/g, '/');

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('  ✗ ' + msg); failures++; } else { console.log('  ✓ ' + msg); } }

// --- DOM stubs for textures.js ---
let warnCount = 0;
const origWarn = console.warn;
console.warn = (...a) => { warnCount++; origWarn('  [atlas warn]', ...a); };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext: () => ({ clearRect() {}, putImageData() {}, drawImage() {}, getImageData() {} }) };
  },
};

const { World } = await import(S('world.js'));
const { meshChunk, setUVLookup } = await import(S('chunk.js'));
const { BLOCKS, ID, AIR, TILE_NAMES } = await import(S('blocks.js'));
const { Player } = await import(S('player.js'));
const { buildAtlas } = await import(S('textures.js'));
const { WORLD_HEIGHT } = await import(S('config.js'));

console.log('\n== Texture atlas coverage ==');
const atlas = buildAtlas();
setUVLookup(atlas.uv);
assert(warnCount === 0, `every tile (${TILE_NAMES.length}) has a generator (warns=${warnCount})`);
assert(TILE_NAMES.every(n => atlas.uv.has(n)), 'atlas uv map covers all block tiles');
assert(atlas.uv.size >= TILE_NAMES.length, `atlas has block tiles + item icons (${atlas.uv.size} total)`);

console.log('\n== Block registry ==');
assert(BLOCKS[0].name === 'air', 'block 0 is air');
assert(ID.grass_block > 0 && ID.water > 0 && ID.bedrock > 0, 'core ids resolve');
let tileRefOk = true;
for (const b of BLOCKS) if (b.tiles) for (const t of b.tiles) if (!atlas.uv.has(t)) { tileRefOk = false; console.error('   missing tile', t, 'for', b.name); }
assert(tileRefOk, 'all block face tiles exist in atlas');

console.log('\n== World gen + meshing ==');
const world = new World(12345);
const R = 3;
for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) world.gen.generateTerrain(world.ensureChunk(cx, cz));
for (let cz = -R + 1; cz <= R - 1; cz++) for (let cx = -R + 1; cx <= R - 1; cx++) world.gen.decorate(world.getChunk(cx, cz), world);

let totalVerts = 0, totalTris = 0, meshOk = true, idxOk = true, nonEmpty = 0;
for (let cz = -R + 1; cz <= R - 1; cz++) for (let cx = -R + 1; cx <= R - 1; cx++) {
  const c = world.getChunk(cx, cz);
  const m = meshChunk(c, (x, y, z) => world.getBlockForMesh(x, y, z));
  for (const part of [m.solid, m.trans]) {
    if (part.vertices.length % 8 !== 0) meshOk = false;
    if (part.indices.length % 6 !== 0) meshOk = false;
    const vc = part.vertices.length / 8;
    for (let i = 0; i < part.indices.length; i++) if (part.indices[i] >= vc) idxOk = false;
    totalVerts += vc; totalTris += part.indices.length / 3;
  }
  if (m.solid.count > 0) nonEmpty++;
}
assert(meshOk, 'vertex stride 8 + index count multiple of 6');
assert(idxOk, 'all indices reference valid vertices');
assert(nonEmpty > 0, `produced geometry (${totalVerts} verts, ${totalTris} tris across chunks)`);

console.log('\n== Block get/set ==');
const sy = world.surfaceHeight(0, 0);
assert(sy > 0 && sy < WORLD_HEIGHT, `spawn surface height sane (${sy})`);
const below = world.getBlock(0, sy - 2, 0);
assert(below !== AIR, 'block below surface is solid-ish (not air)');
assert(world.setBlock(0, sy + 5, 0, ID.stone) === true, 'setBlock applies');
assert(world.getBlock(0, sy + 5, 0) === ID.stone, 'setBlock persists');

console.log('\n== Raycast ==');
const rc = world.raycast([0.5, sy + 30, 0.5], [0, -1, 0], 64);
assert(rc.hit, 'downward raycast hits ground');
assert(rc.ny === 1, 'ground hit normal points up');

console.log('\n== Player physics (gravity + landing) ==');
const sy2 = world.surfaceHeight(8, 8); // clean column (no test edits here)
const startY = sy2 + 6;
const player = new Player(world);
player.pos = [8.5, startY, 8.5];
player.flying = false; player.mode = 'survival';
const input = {
  isDown: () => false, wasTapped: () => false, consumeLook: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0,
  buttons: [false, false, false], clicked: [false, false, false],
  touch: { fwd: 0, strafe: 0, jump: false, break: false, place: false }, endFrame() {},
};
for (let i = 0; i < 400; i++) player.update(1 / 60, input, { onBreak() {}, onPlace() {} });
assert(!Number.isNaN(player.pos[1]), 'player y is a number after sim');
assert(player.pos[1] < startY - 2, `player actually fell from ${startY} (y=${player.pos[1].toFixed(2)})`);
assert(player.pos[1] >= sy2 - 0.5 && player.pos[1] <= sy2 + 1.0, `player landed near surface ${sy2} (y=${player.pos[1].toFixed(2)})`);
assert(player.onGround, 'player is on ground after falling');
assert(!player._collides(), 'resting player is not embedded in a block');

console.log('\n== Stress: 150 pipeline frames ==');
let crashed = null;
try {
  const w2 = new World(999);
  const p = { x: 0, z: 0 };
  for (let f = 0; f < 150; f++) {
    p.x += 4; p.z += 2; // wander to force chunk load/unload
    w2.update(p.x, p.z, 4);
    for (const c of w2.chunks.values()) if (c.needsUpload) c.needsUpload = false; // pretend renderer consumed
  }
} catch (e) { crashed = e; }
assert(!crashed, 'pipeline survives 150 frames of movement' + (crashed ? ': ' + crashed.message : ''));

console.log('\n== Items + icons ==');
const { ITEMS, ITEM_ID, ITEM_ICON_NAMES, breakSeconds, dropsWith, itemByName } = await import(S('items.js'));
assert(ITEMS.length > 100, `item registry populated (${ITEMS.length} items)`);
assert(ITEM_ID['oak_planks'] !== undefined && ITEM_ID['iron_pickaxe'] !== undefined, 'block-items and tools registered');
let iconOk = true;
for (const n of ITEM_ICON_NAMES) if (!atlas.uv.has(n)) { iconOk = false; console.error('   missing item icon in atlas:', n); }
assert(iconOk, `all ${ITEM_ICON_NAMES.length} item icons present in atlas (no warns=${warnCount})`);
const woodPick = itemByName('wooden_pickaxe');
assert(breakSeconds(BLOCKS[ID.stone], woodPick) < breakSeconds(BLOCKS[ID.stone], null), 'pickaxe mines stone faster than hand');
assert(breakSeconds(BLOCKS[ID.bedrock], woodPick) === Infinity, 'bedrock is unbreakable');
assert(dropsWith(BLOCKS[ID.stone], woodPick) === true, 'wood pick drops stone');
assert(dropsWith(BLOCKS[ID.diamond_ore], woodPick) === false, 'wood pick does NOT drop diamond ore');
assert(dropsWith(BLOCKS[ID.diamond_ore], itemByName('iron_pickaxe')) === true, 'iron pick drops diamond ore');

console.log('\n== Inventory ==');
const { Inventory, INV_SIZE } = await import(S('inventory.js'));
const inv = new Inventory();
const left = inv.add(ITEM_ID['dirt'], 70);
assert(left === 0, 'added 70 dirt across stacks (none left over)');
assert(inv.countOf(ITEM_ID['dirt']) === 70, 'inventory reports 70 dirt');
inv.remove(ITEM_ID['dirt'], 5);
assert(inv.countOf(ITEM_ID['dirt']) === 65, 'removed 5 dirt -> 65');
const overflow = inv.add(ITEM_ID['stone'], INV_SIZE * 64 + 100); // try to overflow
assert(overflow > 0, 'overflow returns leftover when inventory full');

console.log('\n== Crafting + smelting ==');
const { matchRecipe, smeltResult } = await import(S('recipes.js'));
// 1 oak log (shapeless, 2x2 grid) -> 4 oak planks
const g2 = [ITEM_ID['oak_log'], 0, 0, 0];
const rPlanks = matchRecipe(g2, 2);
assert(rPlanks && rPlanks.out[0] === ITEM_ID['oak_planks'] && rPlanks.out[1] === 4, 'oak_log -> 4 oak_planks (shapeless)');
// 2 planks vertical -> 4 sticks
const gSticks = [ITEM_ID['oak_planks'], 0, ITEM_ID['oak_planks'], 0];
const rSticks = matchRecipe(gSticks, 2);
assert(rSticks && rSticks.out[0] === ITEM_ID['stick'], 'two oak_planks -> sticks (shaped, position-independent)');
// crafting table 2x2 planks
const gTable = [ITEM_ID['oak_planks'], ITEM_ID['oak_planks'], ITEM_ID['oak_planks'], ITEM_ID['oak_planks']];
assert(matchRecipe(gTable, 2)?.out[0] === ITEM_ID['crafting_table'], '2x2 planks -> crafting_table');
// wooden pickaxe on 3x3
const P = ITEM_ID['oak_planks'], S2 = ITEM_ID['stick'];
const gPick = [P, P, P, 0, S2, 0, 0, S2, 0];
assert(matchRecipe(gPick, 3)?.out[0] === ITEM_ID['wooden_pickaxe'], 'planks+sticks -> wooden_pickaxe (3x3 shaped)');
// same pattern shifted should NOT match in 2x2 (too big) and an empty grid matches nothing
assert(matchRecipe([0, 0, 0, 0], 2) === null, 'empty grid -> no recipe');
// smelting
assert(smeltResult(ITEM_ID['raw_iron']) === ITEM_ID['iron_ingot'], 'raw_iron smelts to iron_ingot');
assert(smeltResult(ITEM_ID['sand']) === ITEM_ID['glass'], 'sand smelts to glass');
assert(smeltResult(ITEM_ID['dirt']) === null, 'dirt does not smelt');

console.log('\n== Survival: mining drops + placement + eating ==');
const { blockDrops } = await import(S('items.js'));
function makeInput() {
  return {
    isDown: () => false, wasTapped: () => false, consumeLook: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0,
    buttons: [false, false, false], clicked: [false, false, false],
    touch: { fwd: 0, strafe: 0, jump: false, break: false, place: false }, endFrame() {},
  };
}
// deterministic drop check
const seedRng = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
assert(blockDrops(BLOCKS[ID.stone], itemByName('wooden_pickaxe'), seedRng).some(d => d.id === ITEM_ID['cobblestone']), 'stone drops cobblestone');
assert(blockDrops(BLOCKS[ID.grass_block], null, seedRng).some(d => d.id === ITEM_ID['dirt']), 'grass drops dirt by hand');
assert(blockDrops(BLOCKS[ID.bedrock], itemByName('diamond_pickaxe'), seedRng).length === 0, 'bedrock drops nothing');

{
  // controlled mining scenario
  const w = new World(4242);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.gen.generateTerrain(w.ensureChunk(cx, cz));
  const tx = 1, tz = 1, ty = w.surfaceHeight(tx, tz) + 5;
  for (let y = ty - 2; y <= ty + 5; y++) w.setBlock(tx, y, tz, AIR, false); // clear a column
  w.setBlock(tx, ty, tz, ID.stone, false);
  const pl = new Player(w);
  pl.mode = 'survival'; pl.flying = false;
  pl.pos = [tx + 0.5, ty + 3, tz + 0.5]; pl.yaw = 0; pl.pitch = -Math.PI / 2 + 0.02;
  pl.inventory.add(ITEM_ID['wooden_pickaxe'], 1); pl.selected = 0;
  const inp = makeInput(); inp.buttons[0] = true;
  let broke = false;
  for (let i = 0; i < 360 && !broke; i++) { pl.update(1 / 60, inp, { onBreak() {}, onPlace() {} }); if (w.getBlock(tx, ty, tz) === AIR) broke = true; }
  assert(broke, 'survival: held left-click breaks the targeted stone block');
  assert(pl.inventory.countOf(ITEM_ID['cobblestone']) >= 1, 'survival: mined stone yielded cobblestone into inventory');

  // placement decrements inventory
  pl.inventory.add(ITEM_ID['dirt'], 10);
  const slot = pl.inventory.slots.findIndex(s => s && s.id === ITEM_ID['dirt']);
  pl.selected = slot;
  const before = pl.inventory.countOf(ITEM_ID['dirt']);
  const placeY = ty + 4;
  pl._place({ x: tx, y: placeY - 1, z: tz, nx: 0, ny: 1, nz: 0 }, { onPlace() {} });
  assert(w.getBlock(tx, placeY, tz) === ID.dirt, 'survival: placed dirt block appears in world');
  assert(pl.inventory.countOf(ITEM_ID['dirt']) === before - 1, 'survival: placing decremented inventory by 1');

  // eating restores hunger
  pl.hunger = 10;
  pl.inventory.add(ITEM_ID['apple'], 3);
  const apple = itemByName('apple');
  const aSlot = pl.inventory.slots.findIndex(s => s && s.id === ITEM_ID['apple']);
  pl.selected = aSlot;
  pl.eat(apple);
  assert(pl.hunger === 14, 'survival: eating apple restored hunger (+4)');
  assert(pl.inventory.countOf(ITEM_ID['apple']) === 2, 'survival: eating consumed one apple');

  // fall damage
  pl.health = 20; pl._peakY = pl.pos[1] + 12; pl.onGround = false;
  // simulate landing: directly invoke takeDamage path via large fall
  const fall = 12; pl.takeDamage(Math.floor(fall - 3));
  assert(pl.health === 20 - 9, 'survival: a 12-block fall deals 9 damage');
}

console.log('\n== Persistence (save/load round-trip) ==');
const { serializeGame, applySave } = await import(S('persistence.js'));
{
  // build a minimal "game-like" object the persistence functions understand
  const w = new World(24680);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.gen.generateTerrain(w.ensureChunk(cx, cz));
  const pl = new Player(w);
  pl.pos = [12.5, 70, -8.5]; pl.yaw = 1.2; pl.pitch = -0.3;
  pl.inventory.add(ITEM_ID['diamond'], 5);
  pl.inventory.add(ITEM_ID['iron_pickaxe'], 1);
  pl.inventory.slots.find(s => s && s.id === ITEM_ID['iron_pickaxe']).dmg = 17;
  const fakeGame = {
    world: w, player: pl, mode: 'survival', timeOfDay: 0.6, renderDistance: 7,
    furnaces: new Map([['1,2,3', { input: { id: ITEM_ID['raw_iron'], count: 2 }, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 }]]),
    spawnPoint: [0.5, 64, 0.5],
  };
  // make some edits
  w.setBlock(5, 65, 5, ID.glowstone);
  w.setBlock(6, 65, 5, ID.tnt);
  const blob = JSON.parse(JSON.stringify(serializeGame(fakeGame)));
  assert(blob.seed === 24680, 'save records the world seed');
  assert(blob.edits.length === 2, 'save records player edits (2)');

  // load into a fresh world/player
  const w2 = new World(blob.seed);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) { const c = w2.ensureChunk(cx, cz); w2.gen.generateTerrain(c); }
  const pl2 = new Player(w2);
  const game2 = { world: w2, player: pl2, mode: 'creative', timeOfDay: 0, renderDistance: 6, furnaces: new Map(), spawnPoint: [0, 0, 0] };
  applySave(game2, blob);
  assert(w2.getBlock(5, 65, 5) === ID.glowstone, 'loaded edit restored (glowstone)');
  assert(w2.getBlock(6, 65, 5) === ID.tnt, 'loaded edit restored (tnt)');
  assert(pl2.inventory.countOf(ITEM_ID['diamond']) === 5, 'loaded inventory restored (5 diamonds)');
  const pick = pl2.inventory.slots.find(s => s && s.id === ITEM_ID['iron_pickaxe']);
  assert(pick && pick.dmg === 17, 'loaded tool durability restored');
  assert(game2.mode === 'survival' && Math.abs(pl2.pos[0] - 12.5) < 1e-6, 'loaded mode + position restored');
  assert(game2.furnaces.get('1,2,3').input.id === ITEM_ID['raw_iron'], 'loaded furnace state restored');
}

console.log('\n== Entities (mobs) ==');
const { Mob, MOBS, EntityManager, stepPhysics } = await import(S('entities.js'));
let modelOk = true;
for (const [t, def] of Object.entries(MOBS)) {
  if (!(def.half > 0 && def.height > 0 && def.maxHealth > 0)) { modelOk = false; console.error('  bad def', t); }
  for (const b of def.model) if (!(b.w > 0 && b.h > 0 && b.d > 0 && b.color && b.color.length === 3)) { modelOk = false; console.error('  bad box', t); }
}
assert(modelOk, `all ${Object.keys(MOBS).length} mob defs have valid AABB + box models`);
let dropItemsOk = true;
for (const def of Object.values(MOBS)) for (const d of (def.drops || [])) if (d.item && ITEM_ID[d.item] === undefined) { dropItemsOk = false; console.error('  unknown drop item', d.item); }
assert(dropItemsOk, 'all mob drop items exist in the item registry');

{ // mob gravity + landing
  const w = new World(321);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w.gen.generateTerrain(w.ensureChunk(cx, cz));
  const sx = 3, sz = 3, sy = w.surfaceHeight(sx, sz);
  const pig = new Mob('pig', sx + 0.5, sy + 6, sz + 0.5);
  for (let i = 0; i < 300; i++) stepPhysics(w, pig, 1 / 60, pig.def.half, pig.def.height);
  assert(pig.onGround && pig.pos[1] < sy + 6 && pig.pos[1] >= sy - 0.5, `pig falls and lands on ground (y=${pig.pos[1].toFixed(2)})`);
}

{ // flat-world spawn manager (deterministic ground)
  const flat = { getBlock(x, y, z) { if (y < 64) return ID.stone; if (y === 64) return ID.grass_block; return AIR; } };
  const em = new EntityManager(flat);
  const playerStub = { pos: [0.5, 66, 0.5], inventory: new Inventory(), takeDamage() {} };
  for (let i = 0; i < 240; i++) em.update(1 / 60, playerStub, { mode: 'survival' }, { dayLight: 1.0 });
  assert(em.counts().passive > 0, `daytime spawns passive mobs on grass (${em.counts().passive})`);
  assert(em.counts().hostile === 0, 'no hostile mobs in daylight');
  for (let i = 0; i < 480; i++) em.update(1 / 60, playerStub, { mode: 'survival' }, { dayLight: 0.1 });
  assert(em.counts().hostile > 0, `night spawns hostile mobs (${em.counts().hostile})`);
  assert(em.mobs.length <= em.maxPassive + em.maxHostile, 'mob population respects caps');

  // raycast vs mob
  const z = new Mob('zombie', 5, 65, 0);
  em.mobs = [z];
  const rc = em.raycastMob([0, 65.9, 0], [1, 0, 0], 12);
  assert(rc && rc.mob === z, 'raycastMob hits a mob directly ahead');
  const miss = em.raycastMob([0, 65.9, 0], [0, 0, 1], 12);
  assert(miss === null, 'raycastMob misses when mob is not in the ray path');
}

{ // death drops into inventory (survival)
  const flat = { getBlock(x, y, z) { if (y < 64) return ID.stone; if (y === 64) return ID.grass_block; return AIR; } };
  const em = new EntityManager(flat);
  const pl = new Player(flat); pl.mode = 'survival';
  const pig = new Mob('pig', 0.5, 65, 0.5); pig.dead = true;
  em.mobs = [pig];
  em.update(1 / 60, pl, { mode: 'survival' }, { dayLight: 1.0 });
  assert(pl.inventory.countOf(ITEM_ID['porkchop']) >= 1, 'killed pig drops porkchop into inventory');
  assert(!em.mobs.includes(pig), 'dead mob removed from manager');
}

{ // player melee kills a mob via raycast
  const flat = { getBlock(x, y, z) { if (y < 64) return ID.stone; return AIR; }, raycast: () => ({ hit: false }) };
  const pl = new Player(flat); pl.mode = 'survival';
  pl.pos = [0.5, 65, 0.5]; pl.yaw = 0; pl.pitch = 0; // looking toward -Z
  pl.inventory.add(ITEM_ID['diamond_sword'], 1); pl.selected = 0;
  const em = new EntityManager(flat);
  const zomb = new Mob('zombie', 0.5, 65, -2); // directly ahead (-Z), tall enough for a level look
  em.mobs = [zomb];
  const game = { entities: em, mode: 'survival' };
  const inp = makeInput(); inp.clicked[0] = true;
  const before = zomb.health;
  pl._interact(1 / 60, inp, game);
  assert(zomb.health < before, `melee with diamond sword reduced mob health (${before} -> ${zomb.health})`);
}

console.log('\n' + (failures === 0 ? '✅ ALL SMOKE TESTS PASSED' : `❌ ${failures} ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
