// renderer.js — WebGL2 renderer: sky, chunk meshes (opaque + transparent), block selection.

import { createProgram, createTextureFromCanvas, Mesh } from './glutil.js';
import {
  TERRAIN_VS, TERRAIN_FS, LINE_VS, LINE_FS, SKY_VS, SKY_FS, ENTITY_VS, ENTITY_FS,
} from './shaders.js';
import { buildAtlas } from './textures.js';
import { setUVLookup } from './chunk.js';
import { MOBS } from './entities.js';
import { mat4, modelMatrix } from './math.js';

const LAYOUT = [
  { loc: 0, size: 3, offset: 0 },
  { loc: 1, size: 2, offset: 3 },
  { loc: 2, size: 3, offset: 5 },
];

// Build a colored cuboid (pos3 + color3 per vertex) into pos/idx arrays.
// box: {x,y,z center (y from feet), w,h,d, color:[r,g,b 0..1]}
function buildBox(pos, idx, box) {
  const hw = box.w / 2, hh = box.h / 2, hd = box.d / 2;
  const x0 = box.x - hw, x1 = box.x + hw, y0 = box.y - hh, y1 = box.y + hh, z0 = box.z - hd, z1 = box.z + hd;
  const C = box.color;
  const faces = [
    { s: 1.00, v: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] }, // +Y top
    { s: 0.50, v: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]] }, // -Y bottom
    { s: 0.80, v: [[x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1]] }, // +Z
    { s: 0.80, v: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]] }, // -Z
    { s: 0.65, v: [[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]] }, // +X
    { s: 0.65, v: [[x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1]] }, // -X
  ];
  for (const f of faces) {
    const base = pos.length / 6;
    for (const vv of f.v) pos.push(vv[0], vv[1], vv[2], C[0] * f.s, C[1] * f.s, C[2] * f.s);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.terrain = createProgram(gl, TERRAIN_VS, TERRAIN_FS);
    this.line = createProgram(gl, LINE_VS, LINE_FS);
    this.sky = createProgram(gl, SKY_VS, SKY_FS);
    this.entity = createProgram(gl, ENTITY_VS, ENTITY_FS);
    this._modelMat = mat4();

    const atlas = buildAtlas();
    this.atlasTex = createTextureFromCanvas(gl, atlas.canvas);
    this.atlasCanvas = atlas.canvas;
    this.atlasUV = atlas.uv;
    setUVLookup(atlas.uv);

    this.gpuChunks = new Map();
    this._initSky();
    this._initSelection();
    this._initEntities();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.5, 0.7, 1.0, 1.0);
    // Cull disabled for v1 robustness (double-sided faces, water, cross plants).
    gl.disable(gl.CULL_FACE);
  }

  _initSky() {
    const gl = this.gl;
    this.skyVao = gl.createVertexArray();
    this.skyVbo = gl.createBuffer();
    gl.bindVertexArray(this.skyVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _initSelection() {
    const gl = this.gl;
    const e = 0.003, lo = -e, hi = 1 + e;
    const c = [[lo, lo, lo], [hi, lo, lo], [hi, lo, hi], [lo, lo, hi], [lo, hi, lo], [hi, hi, lo], [hi, hi, hi], [lo, hi, hi]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const verts = [];
    for (const [a, b] of edges) { verts.push(...c[a], ...c[b]); }
    this.selVao = gl.createVertexArray();
    this.selVbo = gl.createBuffer();
    gl.bindVertexArray(this.selVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.selVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.selCount = verts.length / 3;
  }

  _initEntities() {
    const gl = this.gl;
    this.entityMeshes = {};
    for (const [type, def] of Object.entries(MOBS)) {
      const pos = [], idx = [];
      for (const box of def.model) buildBox(pos, idx, box);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const ebo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.entityMeshes[type] = { vao, count: idx.length };
    }
  }

  _drawEntities(entityManager, proj, view, env) {
    if (!entityManager || entityManager.mobs.length === 0) return;
    const gl = this.gl, e = this.entity;
    gl.useProgram(e.program);
    gl.uniformMatrix4fv(e.uniforms.u_proj, false, proj);
    gl.uniformMatrix4fv(e.uniforms.u_view, false, view);
    gl.uniform1f(e.uniforms.u_dayLight, env.dayLight);
    gl.uniform3fv(e.uniforms.u_fogColor, env.fogColor);
    gl.uniform1f(e.uniforms.u_fogStart, env.fogStart);
    gl.uniform1f(e.uniforms.u_fogEnd, env.fogEnd);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    for (const m of entityManager.mobs) {
      const mesh = this.entityMeshes[m.type];
      if (!mesh) continue;
      modelMatrix(this._modelMat, m.pos[0], m.pos[1], m.pos[2], m.yaw);
      gl.uniformMatrix4fv(e.uniforms.u_model, false, this._modelMat);
      gl.uniform1f(e.uniforms.u_hurt, m._hurtFlash > 0 ? 0.6 : 0.0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }

  reconcile(world) {
    const gl = this.gl;
    for (const c of world.chunks.values()) {
      if (!c.needsUpload || !c.meshData) continue;
      const k = c.cx + ',' + c.cz;
      let g = this.gpuChunks.get(k);
      if (!g) { g = { solid: null, trans: null }; this.gpuChunks.set(k, g); }
      g.solid = this._upload(g.solid, c.meshData.solid);
      g.trans = this._upload(g.trans, c.meshData.trans);
      g.cx = c.cx; g.cz = c.cz;
      c.needsUpload = false;
      c.meshData = null; // free CPU copy
    }
    // free unloaded chunks' GPU buffers
    for (const [k, g] of this.gpuChunks) {
      if (!world.chunks.has(k)) {
        if (g.solid) g.solid.dispose();
        if (g.trans) g.trans.dispose();
        this.gpuChunks.delete(k);
      }
    }
  }

  _upload(mesh, data) {
    if (!data || data.count === 0) { if (mesh) mesh.dispose(); return null; }
    if (!mesh) mesh = new Mesh(this.gl);
    mesh.upload(data.vertices, data.indices, LAYOUT, 8);
    return mesh;
  }

  render(world, camera, player, env, entityManager) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky gradient
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sky.program);
    gl.uniform3fv(this.sky.uniforms.u_top, env.skyTop);
    gl.uniform3fv(this.sky.uniforms.u_bottom, env.skyBottom);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Terrain
    const proj = camera.updateProj();
    const view = camera.updateView(player);
    const t = this.terrain;
    gl.useProgram(t.program);
    gl.uniformMatrix4fv(t.uniforms.u_proj, false, proj);
    gl.uniformMatrix4fv(t.uniforms.u_view, false, view);
    gl.uniform3f(t.uniforms.u_chunkOffset, 0, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(t.uniforms.u_atlas, 0);
    gl.uniform1f(t.uniforms.u_dayLight, env.dayLight);
    gl.uniform3fv(t.uniforms.u_fogColor, env.fogColor);
    gl.uniform1f(t.uniforms.u_fogStart, env.fogStart);
    gl.uniform1f(t.uniforms.u_fogEnd, env.fogEnd);

    // opaque pass
    gl.uniform1f(t.uniforms.u_alphaTest, 1.0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const g of this.gpuChunks.values()) if (g.solid) g.solid.draw();

    // entities (opaque, between terrain and water) — this binds its own program
    this._drawEntities(entityManager, proj, view, env);

    // transparent pass — re-bind terrain program after the entity pass.
    // (terrain's other uniforms persist per-program from earlier this frame.)
    gl.useProgram(t.program);
    gl.uniform1f(t.uniforms.u_alphaTest, 0.0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const g of this.gpuChunks.values()) if (g.trans) g.trans.draw();
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // selection box
    if (player.target && player.target.hit) {
      const L = this.line;
      gl.useProgram(L.program);
      gl.uniformMatrix4fv(L.uniforms.u_proj, false, proj);
      gl.uniformMatrix4fv(L.uniforms.u_view, false, view);
      gl.uniform3f(L.uniforms.u_offset, player.target.x, player.target.y, player.target.z);
      gl.uniform4f(L.uniforms.u_color, 0, 0, 0, 0.5);
      gl.bindVertexArray(this.selVao);
      gl.drawArrays(gl.LINES, 0, this.selCount);
      gl.bindVertexArray(null);
    }
  }
}
