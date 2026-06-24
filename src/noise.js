// noise.js — deterministic value/Perlin-style noise with seeding + fbm.
// Self-contained, no dependencies. Used by world generation.

// Mulberry32 PRNG for deterministic seeding.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D gradient Perlin noise with a permutation table built from a seed.
export class Noise {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    const rand = mulberry32(this.seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 2D Perlin in roughly [-1, 1]
  perlin2(x, y) {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = Noise.fade(x);
    const v = Noise.fade(y);
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = lerpN(this.grad2(aa, x, y), this.grad2(ba, x - 1, y), u);
    const x2 = lerpN(this.grad2(ab, x, y - 1), this.grad2(bb, x - 1, y - 1), u);
    return lerpN(x1, x2, v);
  }

  // 3D Perlin in roughly [-1, 1]
  perlin3(x, y, z) {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Noise.fade(x), v = Noise.fade(y), w = Noise.fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerpN(
      lerpN(
        lerpN(this.grad3(p[AA], x, y, z), this.grad3(p[BA], x - 1, y, z), u),
        lerpN(this.grad3(p[AB], x, y - 1, z), this.grad3(p[BB], x - 1, y - 1, z), u), v),
      lerpN(
        lerpN(this.grad3(p[AA + 1], x, y, z - 1), this.grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerpN(this.grad3(p[AB + 1], x, y - 1, z - 1), this.grad3(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }

  // Fractal Brownian motion (octaves) in 2D, normalized to ~[-1,1]
  fbm2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

function lerpN(a, b, t) { return a + (b - a) * t; }

// Deterministic hash → [0,1) for scattered features (trees, ores) given world coords.
export function hash01(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash01_3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^
          Math.imul(z | 0, 2246822519) ^ Math.imul(seed | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
