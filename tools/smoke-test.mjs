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

console.log('\n' + (failures === 0 ? '✅ ALL SMOKE TESTS PASSED' : `❌ ${failures} ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
