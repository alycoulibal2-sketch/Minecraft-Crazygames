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
export function breakSeconds(block, toolItem) {
  if (block.hardness < 0) return Infinity;     // unbreakable
  if (block.hardness === 0) return 0.05;
  const correctTool = toolItem && toolItem.tool === block.tool;
  const base = block.hardness * (correctTool ? 1.5 : 5.0);
  const speed = correctTool ? toolItem.speed : 1;
  return Math.max(0.05, base / speed);
}

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
