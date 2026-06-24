// chunk.js — chunk storage + greedy-free face-culling mesher with ambient occlusion.

import { CHUNK_X, CHUNK_Z, WORLD_HEIGHT, CHUNK_AREA, localIndex } from './config.js';
import { BLOCKS, AIR } from './blocks.js';

// Floats per vertex: position(3) + uv(2) + color(3)
export const FLOATS_PER_VERT = 8;

// Face table. axis: 0=x,1=y,2=z ; dir: +1/-1. bright: directional shading.
// verts: 4 corners, each {p:[x,y,z] in {0,1}, st:[s,t] tile coords (t: 0=top)}.
const FACES = [
  { // TOP +Y
    axis: 1, dir: 1, bright: 1.0,
    verts: [{ p: [0, 1, 0], st: [0, 0] }, { p: [1, 1, 0], st: [1, 0] }, { p: [1, 1, 1], st: [1, 1] }, { p: [0, 1, 1], st: [0, 1] }],
  },
  { // BOTTOM -Y
    axis: 1, dir: -1, bright: 0.5,
    verts: [{ p: [0, 0, 1], st: [0, 0] }, { p: [1, 0, 1], st: [1, 0] }, { p: [1, 0, 0], st: [1, 1] }, { p: [0, 0, 0], st: [0, 1] }],
  },
  { // NORTH -Z
    axis: 2, dir: -1, bright: 0.8,
    verts: [{ p: [0, 1, 0], st: [0, 0] }, { p: [1, 1, 0], st: [1, 0] }, { p: [1, 0, 0], st: [1, 1] }, { p: [0, 0, 0], st: [0, 1] }],
  },
  { // SOUTH +Z
    axis: 2, dir: 1, bright: 0.8,
    verts: [{ p: [1, 1, 1], st: [0, 0] }, { p: [0, 1, 1], st: [1, 0] }, { p: [0, 0, 1], st: [1, 1] }, { p: [1, 0, 1], st: [0, 1] }],
  },
  { // EAST +X
    axis: 0, dir: 1, bright: 0.6,
    verts: [{ p: [1, 1, 1], st: [0, 0] }, { p: [1, 1, 0], st: [1, 0] }, { p: [1, 0, 0], st: [1, 1] }, { p: [1, 0, 1], st: [0, 1] }],
  },
  { // WEST -X
    axis: 0, dir: -1, bright: 0.6,
    verts: [{ p: [0, 1, 0], st: [0, 0] }, { p: [0, 1, 1], st: [1, 0] }, { p: [0, 0, 1], st: [1, 1] }, { p: [0, 0, 0], st: [0, 1] }],
  },
];

// face index -> which tiles[] slot in blocks: [ +X, -X, +Y, -Y, +Z, -Z ]
function tileSlotFor(face) {
  if (face.axis === 0) return face.dir > 0 ? 0 : 1;
  if (face.axis === 1) return face.dir > 0 ? 2 : 3;
  return face.dir > 0 ? 4 : 5;
}

const AO_LEVELS = [0.45, 0.62, 0.80, 1.0];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.originX = cx * CHUNK_X;
    this.originZ = cz * CHUNK_Z;
    this.blocks = new Uint16Array(CHUNK_X * CHUNK_Z * WORLD_HEIGHT);
    this.generated = false;
    this.dirty = true;          // needs (re)mesh
    this.empty = true;          // all air
    this.meshData = null;       // { solid:{vertices,indices}, trans:{...} }
  }

  getLocal(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    return this.blocks[localIndex(x, y, z)];
  }
  setLocal(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[localIndex(x, y, z)] = id;
    if (id !== AIR) this.empty = false;
    this.dirty = true;
  }
}

// Build CPU mesh data for a chunk. getBlock(wx,wy,wz) -> id (handles boundaries).
export function meshChunk(chunk, getBlock) {
  const solid = { positions: [], indices: [], vcount: 0 };
  const trans = { positions: [], indices: [], vcount: 0 };
  const ox = chunk.originX, oz = chunk.originZ;
  const data = chunk.blocks;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      for (let x = 0; x < CHUNK_X; x++) {
        const id = data[y * CHUNK_AREA + z * CHUNK_X + x];
        if (id === AIR) continue;
        const b = BLOCKS[id];
        const wx = ox + x, wy = y, wz = oz + z;
        if (b.isCross) { emitCross(solid, wx, wy, wz, b); continue; }
        if (!b.isCube) continue;
        const target = (b.render === 'transparent') ? trans : solid;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const ndx = face.axis === 0 ? face.dir : 0;
          const ndy = face.axis === 1 ? face.dir : 0;
          const ndz = face.axis === 2 ? face.dir : 0;
          const nbId = getBlock(wx + ndx, wy + ndy, wz + ndz);
          if (!shouldDrawFace(id, nbId)) continue;
          emitFace(target, face, wx, wy, wz, b, getBlock);
        }
      }
    }
  }
  return {
    solid: finalize(solid),
    trans: finalize(trans),
  };
}

function shouldDrawFace(curId, nbId) {
  if (nbId === AIR) return true;
  const nb = BLOCKS[nbId];
  if (nb.occludes) return false;
  const cur = BLOCKS[curId];
  if (cur.render === 'transparent' && nbId === curId) return false; // merge same liquid/glass
  return true;
}

function emitFace(buf, face, wx, wy, wz, block, getBlock) {
  const slot = tileSlotFor(face);
  const tileName = block.tiles[slot];
  const uvRect = UV_LOOKUP.get(tileName) || [0, 0, 1, 1];
  const [u0, v0, u1, v1] = uvRect;

  // axes in plane (not the normal axis)
  const a1 = (face.axis + 1) % 3;
  const a2 = (face.axis + 2) % 3;
  const nx = face.axis === 0 ? face.dir : 0;
  const ny = face.axis === 1 ? face.dir : 0;
  const nz = face.axis === 2 ? face.dir : 0;

  const ao = new Array(4);
  const positions = buf.positions;
  const base = buf.vcount;

  for (let i = 0; i < 4; i++) {
    const v = face.verts[i];
    const p = v.p;
    // AO sampling
    const s1 = (p[a1] * 2 - 1);
    const s2 = (p[a2] * 2 - 1);
    const d1 = axisVec(a1, s1), d2 = axisVec(a2, s2);
    const side1 = occ(getBlock, wx + nx + d1[0], wy + ny + d1[1], wz + nz + d1[2]);
    const side2 = occ(getBlock, wx + nx + d2[0], wy + ny + d2[1], wz + nz + d2[2]);
    const corner = occ(getBlock, wx + nx + d1[0] + d2[0], wy + ny + d1[1] + d2[1], wz + nz + d1[2] + d2[2]);
    const aoVal = (side1 && side2) ? 0 : (3 - (side1 + side2 + corner));
    ao[i] = aoVal;
    const bright = face.bright * AO_LEVELS[aoVal];
    const su = u0 + v.st[0] * (u1 - u0);
    const tv = v0 + v.st[1] * (v1 - v0);
    positions.push(wx + p[0], wy + p[1], wz + p[2], su, tv, bright, bright, bright);
  }

  // Flip quad diagonal to reduce AO anisotropy.
  const idx = buf.indices;
  if (ao[0] + ao[2] > ao[1] + ao[3]) {
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
  buf.vcount += 4;
}

function emitCross(buf, wx, wy, wz, block) {
  const tileName = block.tiles[0];
  const uvRect = UV_LOOKUP.get(tileName) || [0, 0, 1, 1];
  const [u0, v0, u1, v1] = uvRect;
  const bright = 0.95;
  const lo = 0.146, hi = 0.854; // inset
  const quads = [
    [[lo, 0, lo], [hi, 0, hi], [hi, 1, hi], [lo, 1, lo]],
    [[lo, 0, hi], [hi, 0, lo], [hi, 1, lo], [lo, 1, hi]],
  ];
  for (const q of quads) {
    const base = buf.vcount;
    const sts = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (let i = 0; i < 4; i++) {
      const p = q[i], st = sts[i];
      const su = u0 + st[0] * (u1 - u0);
      const tv = v0 + st[1] * (v1 - v0);
      buf.positions.push(wx + p[0], wy + p[1], wz + p[2], su, tv, bright, bright, bright);
    }
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    buf.vcount += 4;
  }
}

function axisVec(axis, s) { return [axis === 0 ? s : 0, axis === 1 ? s : 0, axis === 2 ? s : 0]; }
function occ(getBlock, x, y, z) { return BLOCKS[getBlock(x, y, z)].occludes ? 1 : 0; }

function finalize(buf) {
  return {
    vertices: new Float32Array(buf.positions),
    indices: new Uint32Array(buf.indices),
    count: buf.indices.length,
  };
}

// UV lookup injected by the atlas builder before meshing starts.
let UV_LOOKUP = new Map();
export function setUVLookup(map) { UV_LOOKUP = map; }
