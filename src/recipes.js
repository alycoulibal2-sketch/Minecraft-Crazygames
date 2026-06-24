// recipes.js — crafting (shaped + shapeless) and furnace smelting. DOM-free.

import { ITEM_ID } from './items.js';

function rid(name) {
  const id = ITEM_ID[name];
  if (id === undefined) throw new Error('recipe references unknown item: ' + name);
  return id;
}

// --- recipe authoring (names) ---
const WOODS = ['oak', 'birch', 'spruce'];

const SHAPELESS = [];
const SHAPED = [];

// planks: 1 log -> 4 planks
for (const w of WOODS) SHAPELESS.push({ in: [`${w}_log`], out: [`${w}_planks`, 4] });
// generic planks -> sticks, crafting table, etc. accept any planks via symbol 'P'
// sticks: 2 planks vertical -> 4 sticks (use oak as canonical; we also add per-wood shapeless fallback)
for (const w of WOODS) SHAPED.push({ rows: [`${w[0].toUpperCase()}`, `${w[0].toUpperCase()}`], key: { [w[0].toUpperCase()]: `${w}_planks` }, out: ['stick', 4] });
// crafting table: 2x2 oak planks (accept oak)
SHAPED.push({ rows: ['PP', 'PP'], key: { P: 'oak_planks' }, out: ['crafting_table', 1] });
// furnace: 8 cobblestone ring
SHAPED.push({ rows: ['CCC', 'C C', 'CCC'], key: { C: 'cobblestone' }, out: ['furnace', 1] });
// bookshelf: planks + books (no book item; use planks+paper substitute -> skip) -> planks ring w/ wool as filler
// bread: 3 wheat in a row
SHAPED.push({ rows: ['WWW'], key: { W: 'wheat' }, out: ['bread', 1] });
// glass-less; torch-less for now.

// Tools for each material.
const TOOLMAT = { wooden: 'oak_planks', stone: 'cobblestone', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond' };
for (const [mat, m] of Object.entries(TOOLMAT)) {
  SHAPED.push({ rows: ['MMM', ' S ', ' S '], key: { M: m, S: 'stick' }, out: [`${mat}_pickaxe`, 1] });
  SHAPED.push({ rows: ['MM', 'MS', ' S'], key: { M: m, S: 'stick' }, out: [`${mat}_axe`, 1] });
  SHAPED.push({ rows: ['M', 'S', 'S'], key: { M: m, S: 'stick' }, out: [`${mat}_shovel`, 1] });
  SHAPED.push({ rows: ['M', 'M', 'S'], key: { M: m, S: 'stick' }, out: [`${mat}_sword`, 1] });
  SHAPED.push({ rows: ['MM', ' S', ' S'], key: { M: m, S: 'stick' }, out: [`${mat}_hoe`, 1] });
}
// storage / blocks
SHAPED.push({ rows: ['III', 'III', 'III'], key: { I: 'iron_ingot' }, out: ['iron_block', 1] });
SHAPED.push({ rows: ['GGG', 'GGG', 'GGG'], key: { G: 'gold_ingot' }, out: ['gold_block', 1] });
SHAPED.push({ rows: ['DDD', 'DDD', 'DDD'], key: { D: 'diamond' }, out: ['diamond_block', 1] });
SHAPED.push({ rows: ['CCC', 'CCC', 'CCC'], key: { C: 'coal' }, out: ['coal_block', 1] });
// stone bricks: 4 stone
SHAPED.push({ rows: ['SS', 'SS'], key: { S: 'stone' }, out: ['stone_bricks', 1] });

// --- compile to id-based patterns ---
function compileShaped(r) {
  const h = r.rows.length, w = Math.max(...r.rows.map(s => s.length));
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const ch = r.rows[y][x] || ' ';
      row.push(ch === ' ' ? 0 : rid(r.key[ch]));
    }
    grid.push(row);
  }
  const trimmed = trim(grid);
  return { w: trimmed.w, h: trimmed.h, grid: trimmed.grid, out: [rid(r.out[0]), r.out[1]] };
}
function compileShapeless(r) {
  return { ingredients: r.in.map(rid).sort((a, b) => a - b), out: [rid(r.out[0]), r.out[1]] };
}

// trim empty rows/cols, return {w,h,grid(2D ids)}
function trim(grid) {
  let minR = grid.length, maxR = -1, minC = grid[0].length, maxC = -1;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x] !== 0) { if (y < minR) minR = y; if (y > maxR) maxR = y; if (x < minC) minC = x; if (x > maxC) maxC = x; }
  }
  if (maxR < 0) return { w: 0, h: 0, grid: [] };
  const out = [];
  for (let y = minR; y <= maxR; y++) { const row = []; for (let x = minC; x <= maxC; x++) row.push(grid[y][x] || 0); out.push(row); }
  return { w: maxC - minC + 1, h: maxR - minR + 1, grid: out };
}

let COMPILED_SHAPED = null, COMPILED_SHAPELESS = null;
function ensureCompiled() {
  if (COMPILED_SHAPED) return;
  COMPILED_SHAPED = SHAPED.map(compileShaped);
  COMPILED_SHAPELESS = SHAPELESS.map(compileShapeless);
}

// Match a crafting grid (flat array of ids, length = dim*dim, 0=empty) to a recipe.
// Returns {out:[id,count]} or null.
export function matchRecipe(flat, dim) {
  ensureCompiled();
  // build 2D
  const grid = [];
  for (let y = 0; y < dim; y++) { const row = []; for (let x = 0; x < dim; x++) row.push(flat[y * dim + x] || 0); grid.push(row); }
  const t = trim(grid);

  // shaped
  for (const r of COMPILED_SHAPED) {
    if (r.w !== t.w || r.h !== t.h) continue;
    let ok = true;
    for (let y = 0; y < r.h && ok; y++) for (let x = 0; x < r.w; x++) if (r.grid[y][x] !== t.grid[y][x]) { ok = false; break; }
    if (ok) return { out: r.out };
  }
  // shapeless: compare multiset of non-empty ids
  const present = flat.filter(v => v).sort((a, b) => a - b);
  for (const r of COMPILED_SHAPELESS) {
    if (r.ingredients.length !== present.length) continue;
    let ok = true;
    for (let i = 0; i < present.length; i++) if (present[i] !== r.ingredients[i]) { ok = false; break; }
    if (ok) return { out: r.out };
  }
  return null;
}

// --- smelting ---
const SMELT_DEFS = [
  ['raw_iron', 'iron_ingot'], ['iron_ore', 'iron_ingot'],
  ['raw_copper', 'copper_ingot'], ['copper_ore', 'copper_ingot'],
  ['raw_gold', 'gold_ingot'], ['gold_ore', 'gold_ingot'],
  ['sand', 'glass'], ['cobblestone', 'stone'], ['stone', 'stone_bricks'],
  ['oak_log', 'charcoal'], ['birch_log', 'charcoal'], ['spruce_log', 'charcoal'],
  ['porkchop', 'cooked_porkchop'], ['clay', 'bricks'],
];
let SMELT = null;
export function smeltResult(id) {
  if (!SMELT) { SMELT = new Map(); for (const [a, b] of SMELT_DEFS) SMELT.set(rid(a), rid(b)); }
  return SMELT.has(id) ? SMELT.get(id) : null;
}

export function listRecipes() { ensureCompiled(); return { shaped: COMPILED_SHAPED, shapeless: COMPILED_SHAPELESS }; }
