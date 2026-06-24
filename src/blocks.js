// blocks.js — block registry. Each block has render/collision/texture metadata.
//
// renderLayer: 'opaque' (default cube, fully occludes), 'cutout' (leaves; alpha-tested,
//   occludes for culling), 'transparent' (water/glass; blended, does not occlude),
//   'cross' (plants drawn as an X billboard, no collision).
//
// tiles: 6 atlas tile names in face order [ +X, -X, +Y(top), -Y(bottom), +Z, -Z ].

export const FACE = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 };

function sides(name) { return [name, name, name, name, name, name]; }
function tbs(top, bottom, side) { return [side, side, top, bottom, side, side]; }
function column(top, side) { return [side, side, top, top, side, side]; }

// Block definitions (order defines numeric id; AIR must be 0).
const DEFS = [
  { name: 'air', render: 'none', solid: false },

  { name: 'stone', tiles: sides('stone'), hardness: 1.5, tool: 'pickaxe', drop: 'cobblestone' },
  { name: 'granite', tiles: sides('granite'), hardness: 1.5, tool: 'pickaxe' },
  { name: 'diorite', tiles: sides('diorite'), hardness: 1.5, tool: 'pickaxe' },
  { name: 'andesite', tiles: sides('andesite'), hardness: 1.5, tool: 'pickaxe' },
  { name: 'cobblestone', tiles: sides('cobblestone'), hardness: 2.0, tool: 'pickaxe' },
  { name: 'mossy_cobblestone', tiles: sides('mossy_cobblestone'), hardness: 2.0, tool: 'pickaxe' },
  { name: 'stone_bricks', tiles: sides('stone_bricks'), hardness: 1.5, tool: 'pickaxe' },
  { name: 'bricks', tiles: sides('bricks'), hardness: 2.0, tool: 'pickaxe' },

  { name: 'dirt', tiles: sides('dirt'), hardness: 0.5, tool: 'shovel' },
  { name: 'coarse_dirt', tiles: sides('coarse_dirt'), hardness: 0.5, tool: 'shovel' },
  { name: 'grass_block', tiles: tbs('grass_top', 'dirt', 'grass_side'), hardness: 0.6, tool: 'shovel', drop: 'dirt' },
  { name: 'podzol', tiles: tbs('podzol_top', 'dirt', 'podzol_side'), hardness: 0.5, tool: 'shovel' },
  { name: 'farmland', tiles: tbs('farmland', 'dirt', 'dirt'), hardness: 0.6, tool: 'shovel' },
  { name: 'sand', tiles: sides('sand'), hardness: 0.5, tool: 'shovel', falls: true },
  { name: 'red_sand', tiles: sides('red_sand'), hardness: 0.5, tool: 'shovel', falls: true },
  { name: 'gravel', tiles: sides('gravel'), hardness: 0.6, tool: 'shovel', falls: true },
  { name: 'clay', tiles: sides('clay'), hardness: 0.6, tool: 'shovel' },
  { name: 'sandstone', tiles: tbs('sandstone_top', 'sandstone_bottom', 'sandstone_side'), hardness: 0.8, tool: 'pickaxe' },
  { name: 'snow_block', tiles: sides('snow'), hardness: 0.2, tool: 'shovel' },
  { name: 'ice', tiles: sides('ice'), hardness: 0.5, tool: 'pickaxe', render: 'transparent' },
  { name: 'packed_ice', tiles: sides('packed_ice'), hardness: 0.5, tool: 'pickaxe' },
  { name: 'obsidian', tiles: sides('obsidian'), hardness: 50, tool: 'pickaxe' },
  { name: 'bedrock', tiles: sides('bedrock'), hardness: -1, tool: 'none' }, // unbreakable

  // Ores
  { name: 'coal_ore', tiles: sides('coal_ore'), hardness: 3.0, tool: 'pickaxe', drop: 'coal' },
  { name: 'iron_ore', tiles: sides('iron_ore'), hardness: 3.0, tool: 'pickaxe' },
  { name: 'copper_ore', tiles: sides('copper_ore'), hardness: 3.0, tool: 'pickaxe' },
  { name: 'gold_ore', tiles: sides('gold_ore'), hardness: 3.0, tool: 'pickaxe' },
  { name: 'redstone_ore', tiles: sides('redstone_ore'), hardness: 3.0, tool: 'pickaxe', drop: 'redstone' },
  { name: 'lapis_ore', tiles: sides('lapis_ore'), hardness: 3.0, tool: 'pickaxe', drop: 'lapis' },
  { name: 'diamond_ore', tiles: sides('diamond_ore'), hardness: 3.0, tool: 'pickaxe', drop: 'diamond' },
  { name: 'emerald_ore', tiles: sides('emerald_ore'), hardness: 3.0, tool: 'pickaxe', drop: 'emerald' },

  // Metal/mineral blocks
  { name: 'iron_block', tiles: sides('iron_block'), hardness: 5.0, tool: 'pickaxe' },
  { name: 'gold_block', tiles: sides('gold_block'), hardness: 3.0, tool: 'pickaxe' },
  { name: 'diamond_block', tiles: sides('diamond_block'), hardness: 5.0, tool: 'pickaxe' },
  { name: 'emerald_block', tiles: sides('emerald_block'), hardness: 5.0, tool: 'pickaxe' },
  { name: 'lapis_block', tiles: sides('lapis_block'), hardness: 3.0, tool: 'pickaxe' },
  { name: 'coal_block', tiles: sides('coal_block'), hardness: 5.0, tool: 'pickaxe' },
  { name: 'redstone_block', tiles: sides('redstone_block'), hardness: 5.0, tool: 'pickaxe' },

  // Wood
  { name: 'oak_log', tiles: column('oak_log_top', 'oak_log'), hardness: 2.0, tool: 'axe' },
  { name: 'birch_log', tiles: column('birch_log_top', 'birch_log'), hardness: 2.0, tool: 'axe' },
  { name: 'spruce_log', tiles: column('spruce_log_top', 'spruce_log'), hardness: 2.0, tool: 'axe' },
  { name: 'jungle_log', tiles: column('jungle_log_top', 'jungle_log'), hardness: 2.0, tool: 'axe' },
  { name: 'oak_planks', tiles: sides('oak_planks'), hardness: 2.0, tool: 'axe' },
  { name: 'birch_planks', tiles: sides('birch_planks'), hardness: 2.0, tool: 'axe' },
  { name: 'spruce_planks', tiles: sides('spruce_planks'), hardness: 2.0, tool: 'axe' },
  { name: 'oak_leaves', tiles: sides('oak_leaves'), hardness: 0.2, tool: 'shears', render: 'cutout' },
  { name: 'birch_leaves', tiles: sides('birch_leaves'), hardness: 0.2, tool: 'shears', render: 'cutout' },
  { name: 'spruce_leaves', tiles: sides('spruce_leaves'), hardness: 0.2, tool: 'shears', render: 'cutout' },

  // Functional
  { name: 'crafting_table', tiles: tbs('crafting_table_top', 'oak_planks', 'crafting_table_side'), hardness: 2.5, tool: 'axe' },
  { name: 'furnace', tiles: [
      'furnace_side', 'furnace_front', 'furnace_top', 'furnace_top', 'furnace_side', 'furnace_side'
    ], hardness: 3.5, tool: 'pickaxe' },
  { name: 'bookshelf', tiles: column('oak_planks', 'bookshelf'), hardness: 1.5, tool: 'axe' },
  { name: 'tnt', tiles: tbs('tnt_top', 'tnt_bottom', 'tnt_side'), hardness: 0, tool: 'none' },
  { name: 'glass', tiles: sides('glass'), hardness: 0.3, tool: 'none', render: 'transparent' },
  { name: 'glowstone', tiles: sides('glowstone'), hardness: 0.3, tool: 'none', light: 15 },
  { name: 'sea_lantern', tiles: sides('sea_lantern'), hardness: 0.3, tool: 'pickaxe', light: 15 },
  { name: 'pumpkin', tiles: column('pumpkin_top', 'pumpkin_side'), hardness: 1.0, tool: 'axe' },
  { name: 'melon', tiles: column('melon_top', 'melon_side'), hardness: 1.0, tool: 'axe' },
  { name: 'hay_block', tiles: column('hay_top', 'hay_side'), hardness: 0.5, tool: 'none' },
  { name: 'netherrack', tiles: sides('netherrack'), hardness: 0.4, tool: 'pickaxe' },
  { name: 'soul_sand', tiles: sides('soul_sand'), hardness: 0.5, tool: 'shovel' },

  // Wool (all 16 colours)
  ...['white','orange','magenta','light_blue','yellow','lime','pink','gray',
      'light_gray','cyan','purple','blue','brown','green','red','black']
     .map(c => ({ name: c + '_wool', tiles: sides(c + '_wool'), hardness: 0.8, tool: 'shears' })),

  // Liquids
  { name: 'water', tiles: sides('water'), render: 'transparent', solid: false, liquid: true, hardness: -1, tool: 'none' },
  { name: 'lava', tiles: sides('lava'), render: 'opaque', solid: false, liquid: true, light: 15, hardness: -1, tool: 'none' },

  // Cross / plants (no collision)
  { name: 'short_grass', tiles: sides('short_grass'), render: 'cross', solid: false, hardness: 0, tool: 'shears' },
  { name: 'fern', tiles: sides('fern'), render: 'cross', solid: false, hardness: 0, tool: 'shears' },
  { name: 'dandelion', tiles: sides('dandelion'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'poppy', tiles: sides('poppy'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'cornflower', tiles: sides('cornflower'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'oxeye_daisy', tiles: sides('oxeye_daisy'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'red_mushroom', tiles: sides('red_mushroom'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'brown_mushroom', tiles: sides('brown_mushroom'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'dead_bush', tiles: sides('dead_bush'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'cactus', tiles: column('cactus_top', 'cactus_side'), hardness: 0.4, tool: 'none' },
  { name: 'oak_sapling', tiles: sides('oak_sapling'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
  { name: 'sugar_cane', tiles: sides('sugar_cane'), render: 'cross', solid: false, hardness: 0, tool: 'none' },
];

// Build the registry.
export const BLOCKS = [];          // index by id
export const ID = {};              // name -> id
const ALL_TILE_NAMES = new Set();

DEFS.forEach((d, id) => {
  const render = d.render || 'opaque';
  const block = {
    id,
    name: d.name,
    render,
    solid: d.solid !== undefined ? d.solid : (render === 'opaque' || render === 'cutout' || render === 'transparent') && render !== 'none' && d.render !== 'none',
    liquid: !!d.liquid,
    light: d.light || 0,
    hardness: d.hardness !== undefined ? d.hardness : 1.0,
    tool: d.tool || 'none',
    drop: d.drop || d.name,
    falls: !!d.falls,
    tiles: d.tiles || null,
    // occludes: fully hides neighbour faces (opaque + cutout leaves). Transparent/cross/air do not.
    occludes: render === 'opaque' || render === 'cutout',
    isCross: render === 'cross',
    isCube: render === 'opaque' || render === 'cutout' || render === 'transparent',
  };
  if (d.name === 'air') { block.solid = false; block.isCube = false; }
  // Cross plants & non-solid liquids have no collision.
  if (render === 'cross' || d.liquid) block.solid = false;
  BLOCKS[id] = block;
  ID[d.name] = id;
  if (block.tiles) block.tiles.forEach(t => ALL_TILE_NAMES.add(t));
});

export const TILE_NAMES = [...ALL_TILE_NAMES];

export function blockById(id) { return BLOCKS[id] || BLOCKS[0]; }
export function blockByName(name) { return BLOCKS[ID[name]]; }
export const AIR = 0;

// Convenience id constants used across the engine.
export const WATER = ID['water'];
export const LAVA = ID['lava'];
export const BEDROCK = ID['bedrock'];
