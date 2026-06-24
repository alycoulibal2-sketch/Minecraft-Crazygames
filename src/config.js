// config.js — global world/engine constants.

export const CHUNK_X = 16;
export const CHUNK_Z = 16;
export const WORLD_HEIGHT = 128;
export const SEA_LEVEL = 46;

export const CHUNK_AREA = CHUNK_X * CHUNK_Z;
export const CHUNK_VOLUME = CHUNK_X * CHUNK_Z * WORLD_HEIGHT;

// Local index within a chunk column. x:0..15, z:0..15, y:0..WORLD_HEIGHT-1
export function localIndex(x, y, z) { return y * CHUNK_AREA + z * CHUNK_X + x; }

export const DEFAULT_RENDER_DISTANCE = 6; // in chunks (radius)

// Player tuning
export const GRAVITY = 28;          // m/s^2
export const TERMINAL_VELOCITY = 60;
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 7.0;
export const FLY_SPEED = 12.0;
export const FLY_SPRINT = 26.0;
export const JUMP_VELOCITY = 9.0;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const PLAYER_RADIUS = 0.3;
export const REACH = 5.0;            // block interaction distance
