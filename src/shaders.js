// shaders.js — GLSL ES 3.00 sources for the terrain/block shader.

// Vertex layout (8 floats): position(3), uv(2), color(3 = baked face light * AO * tint)
export const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec3 a_color;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_chunkOffset;

out vec2 v_uv;
out vec3 v_color;
out float v_dist;

void main() {
  vec3 worldPos = a_pos + u_chunkOffset;
  vec4 viewPos = u_view * vec4(worldPos, 1.0);
  v_dist = length(viewPos.xyz);
  v_uv = a_uv;
  v_color = a_color;
  gl_Position = u_proj * viewPos;
}
`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_color;
in float v_dist;

uniform sampler2D u_atlas;
uniform float u_dayLight;     // 0..1 global sun multiplier
uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;
uniform float u_alphaTest;    // 1.0 = discard transparent texels (cutout), 0.0 = blend

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_atlas, v_uv);
  if (u_alphaTest > 0.5 && tex.a < 0.5) discard;
  float ambient = 0.18;
  float light = ambient + (1.0 - ambient) * u_dayLight;
  vec3 rgb = tex.rgb * v_color * light;
  float fog = clamp((v_dist - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
  rgb = mix(rgb, u_fogColor, fog);
  fragColor = vec4(rgb, tex.a);
}
`;

// Simple flat-color shader for UI/selection wireframe.
export const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_offset;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos + u_offset, 1.0);
}
`;

export const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() { fragColor = u_color; }
`;

// Sky gradient (fullscreen) shader.
export const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.999999, 1.0);
}
`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 v_ndc;
uniform vec3 u_top;
uniform vec3 u_bottom;
out vec4 fragColor;
void main() {
  float t = clamp(v_ndc.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(u_bottom, u_top, t);
  fragColor = vec4(c, 1.0);
}
`;
