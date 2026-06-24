// glutil.js — small WebGL2 helper layer (no dependencies).

export function getGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is not supported in this browser.');
  return gl;
}

function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + log + '\n' + withLineNumbers(source));
  }
  return sh;
}

function withLineNumbers(src) {
  return src.split('\n').map((l, i) => (i + 1).toString().padStart(3, ' ') + ': ' + l).join('\n');
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error('Program link error: ' + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  // Cache uniform + attribute locations
  const uniforms = {};
  const nU = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nU; i++) {
    const info = gl.getActiveUniform(prog, i);
    uniforms[info.name] = gl.getUniformLocation(prog, info.name);
  }
  const attribs = {};
  const nA = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < nA; i++) {
    const info = gl.getActiveAttrib(prog, i);
    attribs[info.name] = gl.getAttribLocation(prog, info.name);
  }
  return { program: prog, uniforms, attribs };
}

// Create a texture from a canvas/ImageData with NEAREST filtering (pixel-art).
export function createTextureFromCanvas(gl, canvas, { mipmap = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  if (mipmap) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  }
  return tex;
}

// A simple interleaved mesh: float32 vertices + uint32 indices.
export class Mesh {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ebo = gl.createBuffer();
    this.indexCount = 0;
    this.uploaded = false;
  }

  // attribs: [{loc, size, offset}], stride in floats. Data: Float32Array, Uint32Array.
  upload(vertices, indices, layout, strideFloats) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = strideFloats * 4;
    for (const a of layout) {
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, stride, a.offset * 4);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.indexCount = indices.length;
    this.uploaded = true;
  }

  draw() {
    if (!this.uploaded || this.indexCount === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ebo);
    this.uploaded = false;
    this.indexCount = 0;
  }
}
