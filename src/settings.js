// settings.js — persistent game options (FOV, sensitivity, brightness, volume,
// render distance, camera perspective, difficulty…). DOM-free + testable.
// Stored separately from the world save, in localStorage, since they're per-device.

const KEY = 'mc_settings_v1';

export const SETTINGS_DEFAULTS = {
  fov: 70,              // degrees, 30..110
  sensitivity: 1.0,     // look-speed multiplier, 0.2..3.0
  invertY: false,
  renderDistance: 6,    // chunks, 3..16
  brightness: 0.5,      // 0..1 (0.5 = neutral / current look)
  volume: 0.5,          // 0..1 master audio
  sprintFov: true,      // dynamic FOV boost while sprinting
  perspective: 0,       // 0 = first person, 1 = third (behind), 2 = third (front)
  pauseTimeInMenu: true,// freeze day/night while a menu is open
  difficulty: 'normal', // 'peaceful' | 'easy' | 'normal' | 'hard'
};

const RANGES = {
  fov: [30, 110], sensitivity: [0.2, 3.0], renderDistance: [3, 16],
  brightness: [0, 1], volume: [0, 1],
};

export class Settings {
  constructor(storage) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    Object.assign(this, SETTINGS_DEFAULTS);
    this.load();
  }

  clamp(key, v) {
    const r = RANGES[key];
    if (!r) return v;
    return v < r[0] ? r[0] : (v > r[1] ? r[1] : v);
  }

  set(key, value) {
    if (!(key in SETTINGS_DEFAULTS)) return;
    if (typeof SETTINGS_DEFAULTS[key] === 'number') value = this.clamp(key, value);
    this[key] = value;
    this.save();
  }

  reset() { Object.assign(this, SETTINGS_DEFAULTS); this.save(); }

  load() {
    try {
      if (!this.storage) return;
      const raw = this.storage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      for (const k of Object.keys(SETTINGS_DEFAULTS)) {
        if (k in d && typeof d[k] === typeof SETTINGS_DEFAULTS[k]) this[k] = d[k];
      }
    } catch (e) { /* corrupt settings -> keep defaults */ }
  }

  save() {
    try {
      if (!this.storage) return;
      const o = {};
      for (const k of Object.keys(SETTINGS_DEFAULTS)) o[k] = this[k];
      this.storage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* storage full / unavailable -> ignore */ }
  }
}
