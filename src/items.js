// items.js — item registry. Every placeable block is an item; plus non-block
// items (ingots, gems, tools, food). Used by inventory, drops, crafting, smelting.

import { BLOCKS, ID } from './blocks.js';

// Tool tiers for mining-speed + drop eligibility.
export const TIER = { none: 0, wood: 1, stone: 2, iron: 3, gold: 3, diamond: 4 };
// Material -> mining speed multiplier and tier.
const MATERIAL = {
  wooden: { tier: 1, speed: 2, durability: 59 },
  stone: { tier: 2, speed: 4, durability: 131 },
  iron: { tier: 3, speed: 6, durability: 250 },
  gold: { tier: 3, speed: 12, durability: 32 },
  diamond: { tier: 4, speed: 8, durability: 1561 },
};

export const ITEMS = [];     // index by id
export const ITEM_ID = {};   // name -> id

function def(o) {
  const id = ITEMS.length;
  const item = Object.assign({
    id, name: o.name, stack: o.stack ?? 64,
    icon: o.icon || o.name,      // atlas tile / item-icon name
    block: o.block ?? null,      // block id this places (null = not placeable)
    tool: o.tool ?? null,        // 'pickaxe'|'axe'|'shovel'|'sword'|'hoe'
    tier: o.tier ?? 0,
    speed: o.speed ?? 1,         // mining speed multiplier
    durability: o.durability ?? 0,
    attack: o.attack ?? 1,
    food: o.food ?? 0,           // hunger restored
    fuel: o.fuel ?? 0,           // smelting burn time (items smelted)
  }, {});
  ITEMS.push(item);
  ITEM_ID[o.name] = id;
  return id;
}

// 0) Reserve item id 0 as "empty/none" so it never collides with a real item.
//    (Inventory empty slots and crafting-grid empty cells are encoded as 0.)
def({ name: 'empty', stack: 0, icon: 'empty', block: null });

// 1) Every non-air block becomes a placeable item with the same name.
for (let bid = 1; bid < BLOCKS.length; bid++) {
  const b = BLOCKS[bid];
  if (!b || b.render === 'none') continue;
  def({ name: b.name, block: bid, icon: blockIconName(b), fuel: blockFuel(b.name) });
}

function blockIconName(b) {
  // Prefer the top/front face for a recognizable icon.
  if (!b.tiles) return b.name;
  // grass -> grass_top, logs -> side, etc. Use side (index 0) by default; top for a few.
  const topPreferred = ['grass_block', 'crafting_table', 'furnace', 'pumpkin', 'melon', 'hay_block', 'tnt'];
  return topPreferred.includes(b.name) ? b.tiles[2] : b.tiles[0];
}
function blockFuel(name) {
  if (name.endsWith('_planks') || name.endsWith('_log') || name === 'crafting_table' || name === 'bookshelf') return 1.5;
  if (name === 'coal_block') return 80;
  return 0;
}

// 2) Non-block items.
def({ name: 'stick', icon: 'i_stick', fuel: 0.5 });
def({ name: 'coal', icon: 'i_coal', fuel: 8 });
def({ name: 'charcoal', icon: 'i_charcoal', fuel: 8 });
def({ name: 'raw_iron', icon: 'i_raw_iron' });
def({ name: 'raw_copper', icon: 'i_raw_copper' });
def({ name: 'raw_gold', icon: 'i_raw_gold' });
def({ name: 'iron_ingot', icon: 'i_iron_ingot' });
def({ name: 'copper_ingot', icon: 'i_copper_ingot' });
def({ name: 'gold_ingot', icon: 'i_gold_ingot' });
def({ name: 'diamond', icon: 'i_diamond' });
def({ name: 'emerald', icon: 'i_emerald' });
def({ name: 'lapis_lazuli', icon: 'i_lapis' });
def({ name: 'redstone', icon: 'i_redstone' });
def({ name: 'flint', icon: 'i_flint' });
def({ name: 'apple', icon: 'i_apple', food: 4, stack: 64 });
def({ name: 'bread', icon: 'i_bread', food: 5, stack: 64 });
def({ name: 'wheat', icon: 'i_wheat' });
def({ name: 'cooked_porkchop', icon: 'i_cooked_porkchop', food: 8, stack: 64 });
def({ name: 'porkchop', icon: 'i_porkchop', food: 3, stack: 64 });
def({ name: 'leather', icon: 'i_leather' });
def({ name: 'feather', icon: 'i_feather' });
def({ name: 'mutton', icon: 'i_mutton', food: 2 });
def({ name: 'cooked_mutton', icon: 'i_cooked_mutton', food: 6 });
def({ name: 'chicken_meat', icon: 'i_chicken_meat', food: 2 });
def({ name: 'cooked_chicken', icon: 'i_cooked_chicken', food: 6 });
def({ name: 'rotten_flesh', icon: 'i_rotten_flesh', food: 4 });

// 3) Tools: material x type. Names like 'iron_pickaxe'.
const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
const TOOL_ATTACK = { sword: 6, axe: 5, pickaxe: 2, shovel: 2, hoe: 1 };
for (const mat of Object.keys(MATERIAL)) {
  const m = MATERIAL[mat];
  for (const type of TOOL_TYPES) {
    def({
      name: `${mat}_${type}`, stack: 1, icon: `i_${mat}_${type}`,
      tool: type, tier: m.tier, speed: m.speed, durability: m.durability,
      attack: (TOOL_ATTACK[type] || 1) + (m.tier - 1),
    });
  }
}

export function itemByName(name) { return ITEMS[ITEM_ID[name]]; }
export function itemById(id) { return ITEMS[id]; }

// List of item-icon (non-block) tile names that need procedural icons.
export const ITEM_ICON_NAMES = ITEMS.filter(i => i.icon.startsWith('i_')).map(i => i.icon);

// Mining speed for a tool item vs a block. Returns seconds to break.
// The harsh 5x "wrong tool" penalty only applies to blocks that actually REQUIRE
// a tool to be harvested (pickaxe blocks: stone/ores). Everything else — dirt,
// grass, sand, wood, wool, leaves… — breaks at the normal rate by hand, just
// faster with the matching tool. This matches Minecraft and means you can always
// mine by hand.
export function breakSeconds(block, toolItem) {
  if (block.hardness < 0) return Infinity;     // unbreakable
  if (block.hardness === 0) return 0.05;
  const correctTool = toolItem && toolItem.tool === block.tool;
  const requiresTool = block.tool === 'pickaxe';        // only pickaxe blocks need a tool to harvest
  const canHarvest = correctTool || !requiresTool;      // hand can harvest everything else
  const speed = correctTool ? toolItem.speed : 1;
  const base = block.hardness * (canHarvest ? 1.5 : 5.0);
  return Math.max(0.05, base / speed);
}

// Resolve what a broken block drops as item stacks: [{id,count}, ...].
// rng() in [0,1) controls random drops (pass a seeded rng in tests).
const RAW_ORE = { iron_ore: 'raw_iron', gold_ore: 'raw_gold', copper_ore: 'raw_copper' };
const ORE_GEM = { coal_ore: 'coal', diamond_ore: 'diamond', emerald_ore: 'emerald' };
export function blockDrops(block, toolItem, rng = Math.random) {
  if (block.hardness < 0) return [];            // unbreakable (bedrock/liquids)
  if (!dropsWith(block, toolItem)) return [];   // wrong tool tier -> nothing
  const name = block.name;
  if (RAW_ORE[name]) return mk(RAW_ORE[name], 1);
  if (ORE_GEM[name]) return mk(ORE_GEM[name], 1);
  if (name === 'redstone_ore') return mk('redstone', 4 + ((rng() * 2) | 0));
  if (name === 'lapis_ore') return mk('lapis_lazuli', 4 + ((rng() * 5) | 0));
  if (name.endsWith('_leaves')) {
    const out = [];
    if (name === 'oak_leaves' && rng() < 0.06) out.push(...mk('oak_sapling', 1));
    if (rng() < 0.04) out.push(...mk('stick', 1));
    return out;
  }
  if (name === 'gravel') return rng() < 0.1 ? mk('flint', 1) : mk('gravel', 1);
  // short grass / flowers / saplings drop themselves (so they can be replanted)
  const dropName = (block.drop && ITEM_ID[block.drop] !== undefined) ? block.drop : name;
  return mk(dropName, 1);
}
function mk(name, count) { const id = ITEM_ID[name]; return id ? [{ id, count }] : []; }

// Whether a broken block yields its drop (needs right tool tier for ores/stone).
export function dropsWith(block, toolItem) {
  // blocks requiring a pickaxe drop nothing without one of sufficient tier
  const needsPick = block.tool === 'pickaxe';
  if (!needsPick) return true;
  const tier = toolItem && toolItem.tool === 'pickaxe' ? toolItem.tier : 0;
  // ores/most stone need wood+ ; diamond/gold/redstone/emerald need iron+
  const hardOre = ['diamond_ore', 'emerald_ore', 'gold_ore', 'redstone_ore'].includes(block.name);
  const need = hardOre ? 3 : 1;
  return tier >= need;
}
