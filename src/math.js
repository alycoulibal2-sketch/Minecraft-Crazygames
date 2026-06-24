// math.js — minimal column-major 4x4 matrix + vec3 helpers (WebGL convention).
// No dependencies. All matrices are Float32Array(16), column-major.

export function mat4() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function identity(out) {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

// out = a * b  (out may alias neither a nor b is required, but we use a scratch)
const _mulTmp = new Float32Array(16);
export function multiply(out, a, b) {
  const t = _mulTmp;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      t[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  out.set(t);
  return out;
}

export function perspective(out, fovyRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovyRad / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  if (far != null && far !== Infinity) {
    const nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -2 * near;
  }
  return out;
}

// Build a view matrix from camera position and yaw/pitch (radians).
// yaw: rotation around Y (0 = looking toward -Z). pitch: up/down.
export function viewFromYawPitch(out, pos, yaw, pitch) {
  // Forward vector (direction camera looks)
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  // forward
  const fx = -sinY * cosP;
  const fy = sinP;
  const fz = -cosY * cosP;
  // The view matrix is lookAt(pos, pos+forward, up)
  return lookAt(out, pos[0], pos[1], pos[2], pos[0] + fx, pos[1] + fy, pos[2] + fz, 0, 1, 0);
}

export function lookAt(out, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  // x = up cross z
  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  // y = z cross x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

// Direction vector from yaw/pitch (where the camera is looking)
export function dirFromYawPitch(yaw, pitch) {
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  return [-sinY * cosP, sinP, -cosY * cosP];
}

// Model matrix: translate(tx,ty,tz) * rotateY(yaw). Column-major.
export function modelMatrix(out, tx, ty, tz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

export function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function fract(x) { return x - Math.floor(x); }
