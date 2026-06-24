// textures.js — procedurally generate an original pixel-art texture atlas at runtime.
// No external/copyrighted assets: every tile is drawn from code into a canvas.

import { TILE_NAMES } from './blocks.js';
import { ITEM_ICON_NAMES } from './items.js';

export const TILE = 16;        // pixels per tile
export const ATLAS_COLS = 16;  // tiles per row (=> up to 256 tiles, 256x256 atlas)

// --- deterministic RNG seeded by tile name ---
function strSeed(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// --- 16x16 tile drawing surface ---
class Tile {
  constructor() { this.d = new Uint8ClampedArray(TILE * TILE * 4); } // starts transparent
  px(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
    const i = (y * TILE + x) * 4; this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  }
  fill(r, g, b, a = 255) { for (let i = 0; i < this.d.length; i += 4) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a; } }
}

const cl = (v) => v < 0 ? 0 : (v > 255 ? 255 : v);

function noiseFill(t, c, jit, rng) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (rng() * 2 - 1) * jit;
    t.px(x, y, cl(c[0] + n), cl(c[1] + n), cl(c[2] + n));
  }
}
function speckle(t, c, count, rng, jit = 0) {
  for (let i = 0; i < count; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const n = jit ? (rng() * 2 - 1) * jit : 0;
    t.px(x, y, cl(c[0] + n), cl(c[1] + n), cl(c[2] + n));
  }
}
function blob(t, cx, cy, r, c, rng) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r + (rng() * 2 - 1)) {
      const n = (rng() * 2 - 1) * 18;
      t.px(cx + x, cy + y, cl(c[0] + n), cl(c[1] + n), cl(c[2] + n));
    }
  }
}

// --- generators ---
const GEN = {};

GEN.stone = (t, r) => { noiseFill(t, [127, 127, 127], 14, r); speckle(t, [105, 105, 105], 26, r); };
GEN.granite = (t, r) => { noiseFill(t, [154, 105, 92], 16, r); speckle(t, [120, 78, 68], 22, r); speckle(t, [190, 150, 140], 14, r); };
GEN.diorite = (t, r) => { noiseFill(t, [200, 200, 202], 16, r); speckle(t, [120, 120, 124], 30, r); };
GEN.andesite = (t, r) => { noiseFill(t, [136, 138, 140], 12, r); speckle(t, [110, 112, 114], 26, r); };
GEN.cobblestone = (t, r) => {
  noiseFill(t, [120, 120, 120], 8, r);
  // chunky cobbles with dark mortar grid
  const cells = [[0, 0, 7, 7], [8, 0, 15, 6], [0, 8, 6, 15], [7, 8, 15, 15]];
  for (const [x0, y0, x1, y1] of cells) {
    const base = 100 + (r() * 50 | 0);
    for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x1 - 1; x++) {
      const n = (r() * 2 - 1) * 16; t.px(x, y, cl(base + n), cl(base + n), cl(base + n));
    }
  }
};
GEN.mossy_cobblestone = (t, r) => { GEN.cobblestone(t, r); speckle(t, [70, 110, 55], 40, r, 20); };
GEN.stone_bricks = (t, r) => {
  noiseFill(t, [122, 122, 122], 8, r);
  drawBrick(t, [100, 100, 100], 8, 8);
};
GEN.bricks = (t, r) => { noiseFill(t, [150, 70, 55], 10, r); drawBrick(t, [180, 170, 160], 8, 4); };
function drawBrick(t, mortar, bw, bh) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = (y / bh) | 0;
    const off = (row % 2) * (bw / 2);
    if (y % bh === 0 || ((x + off) % bw) === 0) t.px(x, y, mortar[0], mortar[1], mortar[2]);
  }
}

GEN.dirt = (t, r) => { noiseFill(t, [134, 96, 67], 16, r); speckle(t, [110, 78, 54], 24, r); };
GEN.coarse_dirt = (t, r) => { noiseFill(t, [120, 85, 58], 18, r); speckle(t, [90, 62, 42], 40, r); };
GEN.grass_top = (t, r) => { noiseFill(t, [95, 159, 53], 18, r); speckle(t, [120, 180, 70], 30, r); speckle(t, [70, 130, 40], 24, r); };
GEN.grass_side = (t, r) => {
  GEN.dirt(t, r);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + ((r() * 3) | 0);
    for (let y = 0; y < h; y++) { const n = (r() * 2 - 1) * 18; t.px(x, y, cl(95 + n), cl(159 + n), cl(53 + n)); }
  }
};
GEN.podzol_top = (t, r) => { noiseFill(t, [110, 78, 40], 16, r); speckle(t, [150, 95, 45], 24, r); speckle(t, [70, 50, 28], 20, r); };
GEN.podzol_side = (t, r) => { GEN.dirt(t, r); for (let x = 0; x < TILE; x++) { const h = 3 + ((r() * 2) | 0); for (let y = 0; y < h; y++) t.px(x, y, cl(110 + (r() * 30 - 15)), cl(78 + (r() * 30 - 15)), 40); } };
GEN.farmland = (t, r) => { noiseFill(t, [110, 75, 48], 12, r); for (let y = 4; y < TILE; y += 5) for (let x = 0; x < TILE; x++) t.px(x, y, 80, 52, 32); };
GEN.sand = (t, r) => { noiseFill(t, [219, 209, 160], 12, r); speckle(t, [200, 188, 140], 20, r); };
GEN.red_sand = (t, r) => { noiseFill(t, [190, 110, 60], 14, r); speckle(t, [165, 92, 48], 20, r); };
GEN.gravel = (t, r) => { noiseFill(t, [128, 122, 120], 18, r); speckle(t, [90, 86, 84], 36, r); speckle(t, [160, 156, 152], 18, r); };
GEN.clay = (t, r) => { noiseFill(t, [162, 166, 178], 8, r); speckle(t, [150, 154, 168], 18, r); };
GEN.sandstone_top = (t, r) => { noiseFill(t, [222, 210, 158], 8, r); };
GEN.sandstone_bottom = GEN.sandstone_top;
GEN.sandstone_side = (t, r) => { noiseFill(t, [222, 210, 158], 8, r); for (let y = 0; y < TILE; y++) { if (y < 3 || y > 12) for (let x = 0; x < TILE; x++) { const n = (r() * 2 - 1) * 10; t.px(x, y, cl(205 + n), cl(192 + n), cl(140 + n)); } } };
GEN.snow = (t, r) => { noiseFill(t, [245, 248, 252], 8, r); };
GEN.obsidian = (t, r) => { noiseFill(t, [22, 18, 33], 8, r); speckle(t, [60, 40, 90], 14, r); speckle(t, [12, 10, 20], 20, r); };
GEN.bedrock = (t, r) => { noiseFill(t, [80, 80, 82], 26, r); speckle(t, [40, 40, 42], 40, r); };
GEN.netherrack = (t, r) => { noiseFill(t, [110, 40, 40], 18, r); speckle(t, [80, 26, 26], 30, r); };
GEN.soul_sand = (t, r) => { noiseFill(t, [85, 66, 54], 12, r); blob(t, 5, 6, 2, [40, 30, 24], r); blob(t, 11, 10, 2, [40, 30, 24], r); };
GEN.packed_ice = (t, r) => { noiseFill(t, [150, 180, 230], 10, r); };
GEN.ice = (t, r) => { noiseFill(t, [150, 185, 235], 12, r); for (let i = 0; i < t.d.length; i += 4) t.d[i + 3] = 190; };

// Ores: stone base + colored speckle blobs
const ORES = {
  coal_ore: [40, 40, 40], iron_ore: [200, 170, 140], copper_ore: [200, 120, 80],
  gold_ore: [245, 210, 90], redstone_ore: [220, 40, 40], lapis_ore: [40, 70, 200],
  diamond_ore: [110, 230, 230], emerald_ore: [50, 210, 110],
};
for (const [name, col] of Object.entries(ORES)) {
  GEN[name] = (t, r) => { GEN.stone(t, r); for (let i = 0; i < 4; i++) blob(t, 2 + (r() * 12 | 0), 2 + (r() * 12 | 0), 1 + (r() * 1.5 | 0), col, r); };
}
// Mineral blocks
const MINS = {
  iron_block: [225, 225, 225], gold_block: [250, 215, 90], diamond_block: [120, 235, 235],
  emerald_block: [50, 210, 110], lapis_block: [40, 70, 190], coal_block: [30, 30, 30], redstone_block: [200, 35, 35],
};
for (const [name, col] of Object.entries(MINS)) {
  GEN[name] = (t, r) => { noiseFill(t, col, 16, r); for (let i = 0; i < TILE; i++) { t.px(i, 0, cl(col[0] + 40), cl(col[1] + 40), cl(col[2] + 40)); t.px(0, i, cl(col[0] + 40), cl(col[1] + 40), cl(col[2] + 40)); } };
}

// Wood logs (bark + ring tops) and planks
const LOGS = { oak: [102, 81, 49], birch: [200, 200, 190], spruce: [78, 56, 36], jungle: [120, 88, 56] };
const LOG_RING = { oak: [160, 130, 80], birch: [220, 215, 200], spruce: [120, 95, 65], jungle: [165, 130, 90] };
for (const [w, col] of Object.entries(LOGS)) {
  GEN[w + '_log'] = (t, r) => {
    noiseFill(t, col, 12, r);
    for (let x = 2; x < TILE; x += 4) for (let y = 0; y < TILE; y++) { const n = (r() * 2 - 1) * 10; t.px(x, y, cl(col[0] - 25 + n), cl(col[1] - 25 + n), cl(col[2] - 25 + n)); }
    if (w === 'birch') for (let i = 0; i < 6; i++) { const y = r() * TILE | 0; for (let x = 0; x < 2 + (r() * 2 | 0); x++) t.px((r() * TILE | 0), y, 40, 40, 40); }
  };
  GEN[w + '_log_top'] = (t, r) => {
    noiseFill(t, LOG_RING[w], 10, r);
    for (let ring = 6; ring > 0; ring -= 2) for (let a = 0; a < 64; a++) {
      const ang = a / 64 * Math.PI * 2; const x = 8 + Math.cos(ang) * ring | 0; const y = 8 + Math.sin(ang) * ring | 0;
      t.px(x, y, cl(col[0]), cl(col[1]), cl(col[2]));
    }
  };
}
const PLANKS = { oak: [160, 125, 75], birch: [195, 178, 130], spruce: [110, 84, 54] };
for (const [w, col] of Object.entries(PLANKS)) {
  GEN[w + '_planks'] = (t, r) => {
    noiseFill(t, col, 10, r);
    for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x++) t.px(x, y, cl(col[0] - 40), cl(col[1] - 40), cl(col[2] - 40));
    for (let x = 0; x < TILE; x += 8) for (let y = 0; y < TILE; y++) t.px(x, y, cl(col[0] - 40), cl(col[1] - 40), cl(col[2] - 40));
  };
}
// Leaves (cutout: punch transparent holes)
const LEAVES = { oak: [55, 130, 45], birch: [110, 160, 70], spruce: [50, 95, 60] };
for (const [w, col] of Object.entries(LEAVES)) {
  GEN[w + '_leaves'] = (t, r) => {
    noiseFill(t, col, 26, r);
    speckle(t, [col[0] + 30, col[1] + 40, col[2] + 20], 30, r);
    for (let i = 0; i < t.d.length; i += 4) if (r() < 0.16) t.d[i + 3] = 0; // holes
  };
}

// Functional blocks
GEN.crafting_table_top = (t, r) => { GEN.oak_planks(t, r); for (let x = 1; x < TILE - 1; x++) { t.px(x, 1, 90, 60, 30); t.px(x, TILE - 2, 90, 60, 30); } for (let y = 1; y < TILE - 1; y++) { t.px(1, y, 90, 60, 30); t.px(TILE - 2, y, 90, 60, 30); } blob(t, 8, 8, 3, [70, 45, 25], r); };
GEN.crafting_table_side = (t, r) => { GEN.oak_planks(t, r); for (let y = 4; y < TILE; y++) { t.px(2, y, 80, 52, 28); t.px(7, y, 80, 52, 28); } for (let x = 2; x <= 7; x++) t.px(x, 4, 80, 52, 28); };
GEN.furnace_side = (t, r) => { GEN.stone(t, r); for (let x = 0; x < TILE; x++) { t.px(x, 0, 90, 90, 90); t.px(x, TILE - 1, 90, 90, 90); } };
GEN.furnace_top = (t, r) => { GEN.stone(t, r); for (let x = 4; x <= 11; x++) { t.px(x, 4, 70, 70, 70); t.px(x, 11, 70, 70, 70); } for (let y = 4; y <= 11; y++) { t.px(4, y, 70, 70, 70); t.px(11, y, 70, 70, 70); } };
GEN.furnace_front = (t, r) => { GEN.furnace_side(t, r); for (let y = 6; y <= 12; y++) for (let x = 4; x <= 11; x++) t.px(x, y, 30, 28, 28); for (let y = 9; y <= 12; y++) for (let x = 5; x <= 10; x++) { const f = r(); t.px(x, y, cl(220 * f + 120), cl(120 * f + 40), 20); } };
GEN.bookshelf = (t, r) => {
  GEN.oak_planks(t, r);
  const cols = [200, 60, 60, 60, 80, 120, 90, 60, 150, 70, 60, 200];
  for (let shelf = 0; shelf < 2; shelf++) { const y0 = shelf * 7 + 1; for (let x = 1; x < TILE - 1; x++) { const c = cols[x % cols.length]; for (let y = y0; y < y0 + 5; y++) t.px(x, y, c, cl(c * 0.4), cl(c * 0.3)); } for (let x = 0; x < TILE; x++) { t.px(x, y0 - 1, 90, 60, 30); t.px(x, y0 + 5, 90, 60, 30); } }
};
GEN.tnt_side = (t, r) => { GEN.dirt(t, r); for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t.px(x, y, 190, 40, 40); for (let x = 0; x < TILE; x++) { for (let y = 6; y <= 9; y++) t.px(x, y, 235, 235, 235); } for (let x = 0; x < TILE; x += 1) if (x % 2 === 0) { t.px(x, 7, 40, 40, 40); t.px(x, 8, 40, 40, 40); } };
GEN.tnt_top = (t, r) => { t.fill(200, 50, 50); for (let i = 0; i < 5; i++) blob(t, 4 + (r() * 8 | 0), 4 + (r() * 8 | 0), 1, [40, 40, 40], r); };
GEN.tnt_bottom = (t) => t.fill(120, 70, 40);
GEN.glass = (t, r) => { t.fill(170, 210, 230, 60); for (let x = 0; x < TILE; x++) { t.px(x, 0, 220, 240, 250, 220); t.px(x, TILE - 1, 220, 240, 250, 220); t.px(0, x, 220, 240, 250, 220); t.px(TILE - 1, x, 220, 240, 250, 220); } t.px(3, 3, 255, 255, 255, 230); t.px(4, 4, 255, 255, 255, 180); };
GEN.glowstone = (t, r) => { noiseFill(t, [200, 170, 90], 18, r); for (let i = 0; i < 8; i++) blob(t, 2 + (r() * 12 | 0), 2 + (r() * 12 | 0), 1, [255, 235, 150], r); };
GEN.sea_lantern = (t, r) => { noiseFill(t, [200, 220, 220], 12, r); for (let i = 0; i < 6; i++) blob(t, 3 + (r() * 10 | 0), 3 + (r() * 10 | 0), 1, [240, 250, 250], r); };
GEN.pumpkin_top = (t, r) => { noiseFill(t, [210, 140, 40], 14, r); blob(t, 8, 8, 2, [120, 90, 40], r); };
GEN.pumpkin_side = (t, r) => { noiseFill(t, [220, 130, 30], 12, r); for (let x = 2; x < TILE; x += 4) for (let y = 0; y < TILE; y++) t.px(x, y, 180, 100, 24); };
GEN.melon_top = (t, r) => { noiseFill(t, [80, 140, 50], 14, r); };
GEN.melon_side = (t, r) => { noiseFill(t, [90, 150, 55], 12, r); for (let x = 0; x < TILE; x += 3) for (let y = 0; y < TILE; y++) t.px(x, y, cl(60), cl(110), cl(40)); };
GEN.hay_top = (t, r) => { noiseFill(t, [190, 160, 60], 10, r); for (let x = 4; x <= 11; x++) { t.px(x, 4, 140, 115, 40); t.px(x, 11, 140, 115, 40); } };
GEN.hay_side = (t, r) => { noiseFill(t, [200, 170, 70], 12, r); for (let y = 0; y < TILE; y += 3) for (let x = 0; x < TILE; x++) t.px(x, y, 150, 122, 44); for (let y = 7; y <= 8; y++) for (let x = 0; x < TILE; x++) t.px(x, y, 120, 95, 36); };

// Wool (16 colours)
const WOOL = {
  white: [235, 235, 235], orange: [220, 120, 30], magenta: [190, 70, 190], light_blue: [90, 160, 220],
  yellow: [220, 200, 50], lime: [120, 200, 40], pink: [230, 150, 170], gray: [80, 80, 80],
  light_gray: [160, 160, 160], cyan: [40, 150, 160], purple: [130, 50, 180], blue: [50, 60, 180],
  brown: [110, 75, 45], green: [80, 120, 40], red: [190, 50, 45], black: [30, 30, 30],
};
for (const [c, col] of Object.entries(WOOL)) {
  GEN[c + '_wool'] = (t, r) => { noiseFill(t, col, 14, r); speckle(t, [cl(col[0] - 25), cl(col[1] - 25), cl(col[2] - 25)], 30, r); };
}

// Liquids
GEN.water = (t, r) => { noiseFill(t, [50, 90, 200], 16, r); for (let i = 0; i < t.d.length; i += 4) t.d[i + 3] = 165; };
GEN.lava = (t, r) => { noiseFill(t, [210, 80, 20], 30, r); speckle(t, [255, 200, 60], 30, r); speckle(t, [140, 30, 10], 24, r); };

// Cross plants (transparent background)
GEN.short_grass = (t, r) => { for (let x = 2; x < TILE; x += 3) { const h = 5 + (r() * 5 | 0); for (let y = TILE - 1; y > TILE - 1 - h; y--) t.px(x + (r() * 2 - 1 | 0), y, cl(70 + r() * 60), cl(140 + r() * 50), 50); } };
GEN.fern = (t, r) => { for (let i = 0; i < 5; i++) { const bx = 3 + i * 2; for (let y = 6; y < TILE; y++) t.px(bx, y, 60, 120, 50); for (let k = -2; k <= 2; k++) t.px(bx + k, 6 + Math.abs(k), 70, 130, 55); } };
function flower(t, r, petal) { for (let y = 8; y < TILE; y++) t.px(7, y, 40, 120, 40); t.px(8, 12, 40, 120, 40); blob(t, 7, 6, 2, petal, r); t.px(7, 6, 250, 230, 80); }
GEN.dandelion = (t, r) => flower(t, r, [240, 220, 40]);
GEN.poppy = (t, r) => flower(t, r, [210, 40, 40]);
GEN.cornflower = (t, r) => flower(t, r, [60, 90, 220]);
GEN.oxeye_daisy = (t, r) => { flower(t, r, [235, 235, 235]); t.px(7, 6, 250, 220, 60); };
GEN.red_mushroom = (t, r) => { for (let y = 9; y < TILE; y++) t.px(7, y, 220, 220, 210); blob(t, 7, 7, 3, [200, 40, 40], r); t.px(5, 6, 240, 240, 240); t.px(9, 7, 240, 240, 240); };
GEN.brown_mushroom = (t, r) => { for (let y = 9; y < TILE; y++) t.px(7, y, 220, 220, 210); blob(t, 7, 8, 2, [150, 100, 70], r); };
GEN.dead_bush = (t, r) => { for (let i = 0; i < 5; i++) { let x = 7, y = TILE - 1; for (let s = 0; s < 9; s++) { t.px(x, y, 120, 85, 40); x += (r() * 3 - 1) | 0; y--; } } };
GEN.oak_sapling = (t, r) => { for (let y = 9; y < TILE; y++) t.px(7, y, 90, 60, 30); blob(t, 7, 6, 3, [60, 140, 50], r); };
GEN.sugar_cane = (t, r) => { for (let y = 0; y < TILE; y++) { t.px(7, y, 110, 180, 90); t.px(8, y, 90, 160, 75); } for (let y = 3; y < TILE; y += 4) { t.px(7, y, 70, 130, 60); t.px(8, y, 70, 130, 60); } };
GEN.cactus_top = (t, r) => { noiseFill(t, [70, 140, 60], 10, r); blob(t, 8, 8, 3, [90, 160, 70], r); };
GEN.cactus_side = (t, r) => { noiseFill(t, [60, 130, 55], 10, r); for (let x = 1; x < TILE; x += 5) for (let y = 0; y < TILE; y++) t.px(x, y, 40, 100, 40); };

// ---- item icons (non-block items: i_*) ----
function outlinePx(t, x, y, r, g, b) { t.px(x, y, r, g, b); }
function ingot(t, r, col) {
  // little metal bar
  for (let y = 6; y <= 11; y++) for (let x = 3; x <= 12; x++) {
    const n = (r() * 2 - 1) * 14; t.px(x + (y < 8 ? 1 : 0) - (y > 9 ? 1 : 0), y, cl(col[0] + n), cl(col[1] + n), cl(col[2] + n));
  }
  for (let x = 4; x <= 12; x++) t.px(x, 6, cl(col[0] + 40), cl(col[1] + 40), cl(col[2] + 40));
}
function gem(t, r, col) {
  const pts = [[7, 3], [9, 3], [11, 6], [8, 13], [5, 6]];
  for (let y = 3; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    // diamond/gem shape via bounding rhombus
    const cx = 8, top = 4, bot = 12;
    const w = (y <= 7) ? (y - 2) : (13 - y);
    if (Math.abs(x - cx) <= w) { const n = (r() * 2 - 1) * 16; t.px(x, y, cl(col[0] + n), cl(col[1] + n), cl(col[2] + n)); }
  }
  t.px(7, 6, 255, 255, 255); t.px(8, 5, cl(col[0] + 70), cl(col[1] + 70), cl(col[2] + 70));
}
function nugget(t, r, col) { blob(t, 8, 9, 3, col, r); blob(t, 6, 6, 1, [cl(col[0] + 40), cl(col[1] + 40), cl(col[2] + 40)], r); }
function toolIcon(t, r, headCol, type) {
  const handle = [120, 85, 45];
  // handle diagonal from (5,14) to (10,8)
  for (let i = 0; i <= 8; i++) { const x = 5 + (i * 0.55) | 0, y = 14 - i; t.px(x, y, handle[0], handle[1], handle[2]); t.px(x + 1, y, cl(handle[0] - 20), cl(handle[1] - 20), cl(handle[2] - 20)); }
  const hx = 9, hy = 5;
  const H = (x, y) => { const n = (r() * 2 - 1) * 12; t.px(x, y, cl(headCol[0] + n), cl(headCol[1] + n), cl(headCol[2] + n)); };
  if (type === 'pickaxe') { for (let x = 4; x <= 12; x++) H(x, 4); H(4, 5); H(12, 5); H(5, 5); H(11, 5); }
  else if (type === 'axe') { for (let y = 3; y <= 7; y++) for (let x = 8; x <= 11 - Math.abs(y - 5); x++) H(x, y); }
  else if (type === 'shovel') { for (let y = 3; y <= 6; y++) for (let x = 8; x <= 11; x++) H(x, y); }
  else if (type === 'sword') { for (let i = 0; i <= 9; i++) { H(11 - i, 3 + i); } H(4, 11); H(6, 11); H(5, 10); H(5, 12); } // blade + guard
  else if (type === 'hoe') { for (let x = 8; x <= 12; x++) H(x, 4); H(8, 5); H(9, 5); }
}

GEN.i_stick = (t, r) => { for (let i = 0; i <= 9; i++) { const x = 6 + ((i * 0.3) | 0), y = 13 - i; t.px(x, y, 140, 100, 55); t.px(x + 1, y, 110, 78, 42); } };
GEN.i_coal = (t, r) => nugget(t, r, [40, 40, 42]);
GEN.i_charcoal = (t, r) => nugget(t, r, [55, 45, 40]);
GEN.i_raw_iron = (t, r) => nugget(t, r, [196, 160, 130]);
GEN.i_raw_copper = (t, r) => nugget(t, r, [200, 120, 80]);
GEN.i_raw_gold = (t, r) => nugget(t, r, [230, 190, 70]);
GEN.i_iron_ingot = (t, r) => ingot(t, r, [220, 220, 225]);
GEN.i_copper_ingot = (t, r) => ingot(t, r, [200, 120, 80]);
GEN.i_gold_ingot = (t, r) => ingot(t, r, [245, 215, 90]);
GEN.i_diamond = (t, r) => gem(t, r, [110, 235, 235]);
GEN.i_emerald = (t, r) => gem(t, r, [50, 210, 110]);
GEN.i_lapis = (t, r) => nugget(t, r, [40, 70, 200]);
GEN.i_redstone = (t, r) => nugget(t, r, [210, 30, 30]);
GEN.i_flint = (t, r) => { blob(t, 8, 9, 3, [60, 55, 55], r); t.px(6, 7, 110, 105, 105); };
GEN.i_apple = (t, r) => { blob(t, 8, 9, 4, [210, 40, 40], r); for (let y = 3; y < 6; y++) t.px(8, y, 90, 60, 30); t.px(10, 4, 60, 160, 50); t.px(11, 5, 60, 160, 50); t.px(6, 7, 255, 180, 180); };
GEN.i_bread = (t, r) => { for (let y = 6; y <= 11; y++) for (let x = 3; x <= 12; x++) { const n = (r() * 2 - 1) * 18; t.px(x, y, cl(190 + n), cl(140 + n), cl(70 + n)); } for (let x = 4; x <= 11; x += 2) t.px(x, 6, 150, 100, 50); };
GEN.i_wheat = (t, r) => { for (let y = 3; y < TILE; y++) { t.px(7, y, 200, 180, 70); t.px(8, y, 180, 160, 60); } for (let y = 4; y < 12; y += 2) { t.px(6, y, 220, 200, 90); t.px(9, y, 220, 200, 90); } };
GEN.i_porkchop = (t, r) => { blob(t, 8, 9, 4, [225, 150, 150], r); blob(t, 6, 7, 1, [255, 200, 200], r); t.px(11, 11, 240, 240, 240); };
GEN.i_cooked_porkchop = (t, r) => { blob(t, 8, 9, 4, [170, 100, 60], r); blob(t, 6, 7, 1, [200, 140, 90], r); t.px(11, 11, 230, 220, 200); };
GEN.i_leather = (t, r) => { for (let y = 5; y <= 11; y++) for (let x = 4; x <= 11; x++) { const n = (r() * 2 - 1) * 14; t.px(x, y, cl(150 + n), cl(95 + n), cl(55 + n)); } t.px(5, 6, 110, 70, 40); t.px(10, 10, 110, 70, 40); };
GEN.i_feather = (t, r) => { for (let i = 0; i <= 9; i++) { const x = 5 + (i * 0.4 | 0), y = 13 - i; t.px(x, y, 240, 240, 245); t.px(x + 1, y, 200, 200, 210); } for (let k = 1; k <= 3; k++) { t.px(6 + k, 6 + k, 235, 235, 240); t.px(6 - k + 4, 6 + k, 235, 235, 240); } };
GEN.i_mutton = (t, r) => { blob(t, 8, 9, 4, [220, 130, 130], r); blob(t, 6, 7, 1, [250, 190, 190], r); t.px(5, 11, 240, 240, 240); };
GEN.i_cooked_mutton = (t, r) => { blob(t, 8, 9, 4, [150, 90, 55], r); blob(t, 6, 7, 1, [190, 130, 85], r); };
GEN.i_chicken_meat = (t, r) => { blob(t, 8, 9, 4, [240, 200, 190], r); blob(t, 6, 7, 1, [255, 225, 215], r); };
GEN.i_cooked_chicken = (t, r) => { blob(t, 8, 9, 4, [200, 150, 90], r); blob(t, 6, 7, 1, [225, 180, 120], r); };
GEN.i_rotten_flesh = (t, r) => { blob(t, 8, 9, 4, [110, 95, 70], r); speckle(t, [70, 90, 50], 10, r); blob(t, 6, 7, 1, [130, 120, 90], r); };
{
  const MATCOL = { wooden: [150, 110, 60], stone: [130, 130, 130], iron: [225, 225, 230], gold: [245, 215, 90], diamond: [110, 235, 235] };
  for (const [mat, col] of Object.entries(MATCOL))
    for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'])
      GEN[`i_${mat}_${type}`] = (t, r) => toolIcon(t, r, col, type);
}

function missing(t) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const c = ((x >> 3) ^ (y >> 3)) & 1; t.px(x, y, c ? 240 : 20, 0, c ? 240 : 20); } }

// Build the atlas canvas. Returns { canvas, uv: Map(name -> [u0,v0,u1,v1]) }.
export function buildAtlas() {
  const size = ATLAS_COLS * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const uv = new Map();
  const inset = 0.0; // NEAREST filtering; no inset needed for face-mapped tiles
  const ALL = [...TILE_NAMES, ...ITEM_ICON_NAMES];
  if (ALL.length > ATLAS_COLS * ATLAS_COLS) console.warn('Atlas overflow:', ALL.length, 'tiles >', ATLAS_COLS * ATLAS_COLS);
  ALL.forEach((name, idx) => {
    const col = idx % ATLAS_COLS, row = (idx / ATLAS_COLS) | 0;
    const tile = new Tile();
    const gen = GEN[name];
    if (gen) gen(tile, mulberry32(strSeed(name)));
    else { missing(tile); console.warn('No texture generator for tile:', name); }
    const img = new ImageData(tile.d, TILE, TILE);
    ctx.putImageData(img, col * TILE, row * TILE);
    const u0 = (col * TILE + inset) / size, v0 = (row * TILE + inset) / size;
    const u1 = ((col + 1) * TILE - inset) / size, v1 = ((row + 1) * TILE - inset) / size;
    uv.set(name, [u0, v0, u1, v1]);
  });
  return { canvas, uv };
}
