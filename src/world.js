// world.js — chunk manager, generation pipeline, block access, raycast.

import { Chunk, meshChunk } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { CHUNK_X, CHUNK_Z, WORLD_HEIGHT } from './config.js';
import { AIR, BLOCKS, ID } from './blocks.js';

const GEN_PER_FRAME = 3;
const DEC_PER_FRAME = 3;
const MESH_PER_FRAME = 4;

function key(cx, cz) { return cx + ',' + cz; }

export class World {
  constructor(seed = 1337) {
    this.gen = new WorldGen(seed);
    this.seed = seed;
    this.chunks = new Map();
    this.edits = new Map(); // "wx,wy,wz" -> id  (player modifications, for save/load)
  }

  getChunk(cx, cz) { return this.chunks.get(key(cx, cz)); }

  ensureChunk(cx, cz) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  }

  // ---- block access (global coords) ----
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return AIR;
    return c.getLocal(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z);
  }

  // For meshing: treat below-world as solid so bottom faces cull; missing chunks as air.
  getBlockForMesh(wx, wy, wz) {
    if (wy < 0) return ID.bedrock;
    if (wy >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return AIR;
    return c.getLocal(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z);
  }

  // Player edit. Returns true if applied.
  setBlock(wx, wy, wz, id, record = true) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return false;
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    c.setLocal(lx, wy, lz, id);
    if (record) this.edits.set(wx + ',' + wy + ',' + wz, id);
    // mark border neighbours dirty so AO/faces update
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  // Generation-time write (trees/plants); may spill into neighbouring chunks.
  setBlockGen(wx, wy, wz, id, onlyAir = false) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return; // neighbour not ready; skip (rare at edges)
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    if (onlyAir && c.getLocal(lx, wy, lz) !== AIR) return;
    c.setLocal(lx, wy, lz, id);
  }

  markDirty(cx, cz) { const c = this.chunks.get(key(cx, cz)); if (c) c.dirty = true; }

  neighborsGenerated(cx, cz, diagonal) {
    const offs = diagonal
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of offs) {
      const c = this.chunks.get(key(cx + dx, cz + dz));
      if (!c || !c.generated) return false;
    }
    return true;
  }

  // ---- per-frame pipeline ----
  update(px, pz, R) {
    const pcx = Math.floor(px / CHUNK_X), pcz = Math.floor(pz / CHUNK_Z);

    // 1. ensure chunks within radius
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz <= R * R + R) this.ensureChunk(pcx + dx, pcz + dz);
      }
    }

    // 2. collect work, nearest-first
    const toGen = [], toDec = [], toMesh = [];
    for (const c of this.chunks.values()) {
      const d2 = (c.cx - pcx) * (c.cx - pcx) + (c.cz - pcz) * (c.cz - pcz);
      c._d2 = d2;
      if (!c.generated) toGen.push(c);
      else if (!c.decorated && this.neighborsGenerated(c.cx, c.cz, true)) toDec.push(c);
      else if (c.decorated && c.dirty && this.neighborsGenerated(c.cx, c.cz, false)) toMesh.push(c);
    }
    const byDist = (a, b) => a._d2 - b._d2;
    toGen.sort(byDist); toDec.sort(byDist); toMesh.sort(byDist);

    let n = GEN_PER_FRAME;
    for (const c of toGen) { if (n-- <= 0) break; this.gen.generateTerrain(c); this.applyEdits(c); c.dirty = true; }
    n = DEC_PER_FRAME;
    for (const c of toDec) { if (n-- <= 0) break; this.gen.decorate(c, this); c.dirty = true; }
    n = MESH_PER_FRAME;
    for (const c of toMesh) {
      if (n-- <= 0) break;
      c.meshData = meshChunk(c, this._getMesh);
      c.dirty = false;
      c.needsUpload = true;
    }

    // 3. unload far chunks
    const unloadR = R + 2;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > unloadR || Math.abs(c.cz - pcz) > unloadR) {
        this.chunks.delete(k);
      }
    }
  }

  // bound version for the mesher
  get _getMesh() { return (x, y, z) => this.getBlockForMesh(x, y, z); }

  // re-apply player edits after a chunk (re)generates
  applyEdits(chunk) {
    if (this.edits.size === 0) return;
    const ox = chunk.originX, oz = chunk.originZ;
    for (const [k, id] of this.edits) {
      const [wx, wy, wz] = k.split(',').map(Number);
      if (wx >= ox && wx < ox + CHUNK_X && wz >= oz && wz < oz + CHUNK_Z) {
        chunk.setLocal(wx - ox, wy, wz - oz, id);
      }
    }
  }

  // ---- voxel raycast (Amanatides & Woo) ----
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin[0]), y = Math.floor(origin[1]), z = Math.floor(origin[2]);
    const stepX = Math.sign(dir[0]), stepY = Math.sign(dir[1]), stepZ = Math.sign(dir[2]);
    const inv = (d) => d === 0 ? Infinity : Math.abs(1 / d);
    const tDeltaX = inv(dir[0]), tDeltaY = inv(dir[1]), tDeltaZ = inv(dir[2]);
    const distBound = (s, o, st) => st > 0 ? (Math.floor(o) + 1 - o) : (o - Math.floor(o));
    let tMaxX = dir[0] === 0 ? Infinity : distBound(x, origin[0], stepX) * tDeltaX;
    let tMaxY = dir[1] === 0 ? Infinity : distBound(y, origin[1], stepY) * tDeltaY;
    let tMaxZ = dir[2] === 0 ? Infinity : distBound(z, origin[2], stepZ) * tDeltaZ;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    for (let i = 0; i < 512; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== AIR && BLOCKS[id].solid) {
        return { hit: true, id, x, y, z, nx, ny, nz, t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return { hit: false };
  }

  // find a reasonable spawn surface height at x,z
  surfaceHeight(wx, wz) {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(wx, y, wz);
      if (id !== AIR && BLOCKS[id].solid) return y + 1;
    }
    return this.gen.heightAt(wx, wz) + 1;
  }
}
