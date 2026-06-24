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
assert(atlas.uv.size === TILE_NAMES.length, 'atlas uv map covers all tiles');

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

console.log('\n' + (failures === 0 ? '✅ ALL SMOKE TESTS PASSED' : `❌ ${failures} ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
