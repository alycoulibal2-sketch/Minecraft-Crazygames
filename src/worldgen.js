// worldgen.js — procedural terrain: heightmap, biomes, caves, ores, surface, trees, plants.

import { Noise, hash01, hash01_3 } from './noise.js';
import { CHUNK_X, CHUNK_Z, WORLD_HEIGHT, SEA_LEVEL } from './config.js';
import { ID, AIR } from './blocks.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, MOUNTAIN: 5, SNOWY: 6, TAIGA: 7 };

export class WorldGen {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.nHeight = new Noise(this.seed);
    this.nMountain = new Noise(this.seed ^ 0x9e3779b1);
    this.nTemp = new Noise(this.seed ^ 0x12345);
    this.nHumid = new Noise(this.seed ^ 0xabcdef);
    this.nCave = new Noise(this.seed ^ 0x55aa55);
    this.nCave2 = new Noise(this.seed ^ 0x77bb33);
  }

  heightAt(wx, wz) {
    const rolling = this.nHeight.fbm2(wx * 0.0065, wz * 0.0065, 4) * 16;
    let h = SEA_LEVEL + 2 + rolling;
    const m = this.nMountain.fbm2(wx * 0.0016, wz * 0.0016, 4);
    if (m > 0.35) h += (m - 0.35) * 150;        // mountains
    const detail = this.nHeight.fbm2(wx * 0.03, wz * 0.03, 3) * 3;
    return Math.floor(h + detail);
  }

  biomeAt(wx, wz, h) {
    if (h < SEA_LEVEL - 1) return BIOME.OCEAN;
    const temp = this.nTemp.fbm2(wx * 0.0022, wz * 0.0022, 3);
    const humid = this.nHumid.fbm2(wx * 0.0024 + 100, wz * 0.0024 - 100, 3);
    if (h > SEA_LEVEL + 42) return temp < -0.1 ? BIOME.SNOWY : BIOME.MOUNTAIN;
    if (h <= SEA_LEVEL + 1) return BIOME.BEACH;
    if (temp < -0.25) return humid > 0 ? BIOME.TAIGA : BIOME.SNOWY;
    if (temp > 0.3 && humid < -0.05) return BIOME.DESERT;
    if (humid > 0.1) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  // Fill a chunk's block array from terrain (no cross-chunk writes).
  generateTerrain(chunk) {
    const ox = chunk.originX, oz = chunk.originZ;
    const data = chunk.blocks;
    const STONE = ID.stone, DIRT = ID.dirt, GRASS = ID.grass_block, SAND = ID.sand,
      WATER = ID.water, BEDROCK = ID.bedrock, SANDSTONE = ID.sandstone, SNOW = ID.snow_block,
      GRAVEL = ID.gravel, GRANITE = ID.granite, DIORITE = ID.diorite, ANDESITE = ID.andesite;
    chunk.surface = new Int16Array(CHUNK_X * CHUNK_Z);
    chunk.biome = new Uint8Array(CHUNK_X * CHUNK_Z);

    for (let z = 0; z < CHUNK_Z; z++) {
      for (let x = 0; x < CHUNK_X; x++) {
        const wx = ox + x, wz = oz + z;
        const h = Math.max(1, Math.min(WORLD_HEIGHT - 2, this.heightAt(wx, wz)));
        const biome = this.biomeAt(wx, wz, h);
        chunk.surface[z * CHUNK_X + x] = h;
        chunk.biome[z * CHUNK_X + x] = biome;

        for (let y = 0; y <= h; y++) {
          let id = STONE;
          const depth = h - y;
          if (y === 0) id = BEDROCK;
          else if (y <= 2 && hash01_3(wx, y, wz, this.seed) < 0.6) id = BEDROCK;
          else if (depth === 0) {
            // surface block
            if (biome === BIOME.DESERT) id = SAND;
            else if (biome === BIOME.BEACH || biome === BIOME.OCEAN) id = SAND;
            else if (biome === BIOME.SNOWY || biome === BIOME.TAIGA) id = (h > SEA_LEVEL + 50) ? STONE : GRASS;
            else if (biome === BIOME.MOUNTAIN) id = (h > SEA_LEVEL + 60) ? STONE : GRASS;
            else id = GRASS;
          } else if (depth <= 4) {
            if (biome === BIOME.DESERT) id = (depth <= 3) ? SAND : SANDSTONE;
            else if (biome === BIOME.BEACH || biome === BIOME.OCEAN) id = SAND;
            else id = DIRT;
          } else {
            // stone variants
            const v = this.nCave2.perlin3(wx * 0.04, y * 0.04, wz * 0.04);
            if (v > 0.55) id = GRANITE; else if (v < -0.55) id = DIORITE; else if (v > 0.35) id = ANDESITE;
            // ores
            id = this.maybeOre(id, wx, y, wz, STONE);
          }
          data[y * CHUNK_X * CHUNK_Z + z * CHUNK_X + x] = id;
        }

        // caves
        this.carveCaves(chunk, x, z, h);

        // water fill up to sea level
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          const i = y * CHUNK_X * CHUNK_Z + z * CHUNK_X + x;
          if (data[i] === AIR) data[i] = WATER;
        }
        // snow cover on cold biomes
        if ((biome === BIOME.SNOWY || biome === BIOME.TAIGA) && h >= SEA_LEVEL) {
          const i = h * CHUNK_X * CHUNK_Z + z * CHUNK_X + x;
          if (data[i] === GRASS && h <= SEA_LEVEL + 50) {
            const top = (h + 1) * CHUNK_X * CHUNK_Z + z * CHUNK_X + x;
            if (data[top] === AIR && h + 1 < WORLD_HEIGHT) data[top] = SNOW;
          }
        }
        chunk.empty = false;
      }
    }
    chunk.generated = true;
  }

  maybeOre(id, wx, y, wz, STONE) {
    if (id !== STONE && id !== ID.granite && id !== ID.diorite && id !== ID.andesite) return id;
    const r = hash01_3(wx, y, wz, this.seed ^ 0xfeed);
    if (y < 16 && r < 0.0016) return ID.diamond_ore;
    if (y < 32 && r < 0.004) return ID.gold_ore;
    if (y < 32 && r < 0.006) return ID.lapis_ore;
    if (y < 24 && r < 0.010) return ID.redstone_ore;
    if (y < 64 && r < 0.012) return ID.iron_ore;
    if (y < 72 && r < 0.012) return ID.copper_ore;
    if (y < 80 && r < 0.018) return ID.coal_ore;
    return id;
  }

  carveCaves(chunk, x, z, h) {
    const ox = chunk.originX, oz = chunk.originZ;
    const wx = ox + x, wz = oz + z;
    const data = chunk.blocks;
    const top = Math.min(h - 2, WORLD_HEIGHT - 2);
    for (let y = 4; y <= top; y++) {
      const c1 = this.nCave.perlin3(wx * 0.05, y * 0.08, wz * 0.05);
      const c2 = this.nCave2.perlin3(wx * 0.05 + 50, y * 0.08, wz * 0.05 - 50);
      // tunnel where both noises near zero (worm-like intersection)
      if (c1 * c1 + c2 * c2 < 0.018) {
        const i = y * CHUNK_X * CHUNK_Z + z * CHUNK_X + x;
        const cur = data[i];
        if (cur !== ID.bedrock && cur !== ID.water) data[i] = AIR;
      }
    }
  }

  // Place trees & plants. Writes via world.setBlockGen (can spill into neighbours).
  decorate(chunk, world) {
    const ox = chunk.originX, oz = chunk.originZ;
    for (let z = 0; z < CHUNK_Z; z++) {
      for (let x = 0; x < CHUNK_X; x++) {
        const wx = ox + x, wz = oz + z;
        const idx = z * CHUNK_X + x;
        const h = chunk.surface[idx];
        const biome = chunk.biome[idx];
        const top = chunk.getLocal(x, h, z);
        const aboveY = h + 1;
        if (aboveY >= WORLD_HEIGHT - 8) continue;
        if (top === ID.water) continue;

        const r = hash01(wx, wz, this.seed ^ 0xa11ce);

        if (biome === BIOME.FOREST && top === ID.grass_block && r < 0.10) {
          this.placeTree(world, wx, aboveY, wz, r < 0.03 ? 'birch' : 'oak');
        } else if (biome === BIOME.PLAINS && top === ID.grass_block && r < 0.012) {
          this.placeTree(world, wx, aboveY, wz, 'oak');
        } else if ((biome === BIOME.TAIGA || biome === BIOME.SNOWY) && top === ID.grass_block && r < 0.08) {
          this.placeTree(world, wx, aboveY, wz, 'spruce');
        } else if (biome === BIOME.DESERT && top === ID.sand && r < 0.02) {
          const ch = 1 + ((hash01(wx, wz, this.seed ^ 7) * 3) | 0);
          for (let i = 0; i < ch; i++) world.setBlockGen(wx, aboveY + i, wz, ID.cactus, true);
          if (r < 0.006) world.setBlockGen(wx, aboveY, wz, ID.dead_bush, true);
        } else if (top === ID.grass_block) {
          // ground plants
          const pr = hash01(wx + 7, wz - 13, this.seed ^ 0xb0b);
          if (pr < 0.18) world.setBlockGen(wx, aboveY, wz, ID.short_grass, true);
          else if (pr < 0.21) world.setBlockGen(wx, aboveY, wz, this.pickFlower(wx, wz), true);
          else if (pr < 0.215) world.setBlockGen(wx, aboveY, wz, ID.fern, true);
        }
      }
    }
    chunk.decorated = true;
  }

  pickFlower(wx, wz) {
    const f = (hash01(wx * 3, wz * 5, this.seed ^ 0xf10) * 4) | 0;
    return [ID.dandelion, ID.poppy, ID.cornflower, ID.oxeye_daisy][f];
  }

  placeTree(world, wx, y, wz, type) {
    const rng = hash01(wx, wz, this.seed ^ 0x77ee);
    const height = 4 + ((rng * 3) | 0);
    const log = type === 'birch' ? ID.birch_log : type === 'spruce' ? ID.spruce_log : ID.oak_log;
    const leaf = type === 'birch' ? ID.birch_leaves : type === 'spruce' ? ID.spruce_leaves : ID.oak_leaves;
    // trunk
    for (let i = 0; i < height; i++) world.setBlockGen(wx, y + i, wz, log, true);

    if (type === 'spruce') {
      // conical canopy
      let r = 2;
      for (let ly = y + height - 1; ly >= y + 2; ly--) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= r) world.setBlockGen(wx + dx, ly, wz + dz, leaf, true);
        }
        r = (r === 2) ? 1 : 2; // alternate
      }
      world.setBlockGen(wx, y + height, wz, leaf, true);
    } else {
      const cy = y + height;
      for (let dy = -2; dy <= 1; dy++) {
        const r = (dy <= -1) ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || (rng * 13 % 1) > 0.5)) continue; // round corners
          world.setBlockGen(wx + dx, cy + dy, wz + dz, leaf, true);
        }
      }
    }
  }
}
