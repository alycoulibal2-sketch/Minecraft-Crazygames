// audio.js — procedural sound via Web Audio (no asset files). Fully guarded:
// if Web Audio is unavailable or blocked, every method is a silent no-op.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._lastStep = 0;
  }

  // Create/resume the context — must be called from a user gesture.
  ensure() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.enabled = false; }
  }

  get _t() { return this.ctx.currentTime; }

  _env(node, gain, attack, decay, dest) {
    const g = this.ctx.createGain();
    const t = this._t;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g); g.connect(dest || this.master);
    return g;
  }

  _noise(dur) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.max(1, (sr * dur) | 0), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    return src;
  }

  _tone(type, freq, dur, gain, attack = 0.005) {
    if (!this._ok()) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    this._env(o, gain, attack, dur, this.master);
    o.start(); o.stop(this._t + dur + 0.02);
  }

  _ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  // --- material-flavoured block sounds ---
  _materialOf(name) {
    if (!name) return 'stone';
    if (name.includes('grass') || name.includes('leaves') || name.includes('wool') || name.includes('flower') || name.endsWith('_fern')) return 'soft';
    if (name.includes('log') || name.includes('plank') || name.includes('wood') || name.includes('craft') || name.includes('bookshelf')) return 'wood';
    if (name.includes('dirt') || name.includes('sand') || name.includes('gravel') || name.includes('clay') || name.includes('podzol') || name.includes('farmland')) return 'gravel';
    if (name.includes('glass')) return 'glass';
    if (name.includes('water') || name.includes('ice')) return 'liquid';
    return 'stone';
  }

  dig(name) {
    if (!this._ok()) return;
    const mat = this._materialOf(name);
    const n = this._noise(0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = mat === 'soft' ? 1200 : mat === 'wood' ? 2200 : mat === 'gravel' ? 1600 : 3000;
    n.connect(f);
    const gain = mat === 'glass' ? 0.5 : 0.4;
    this._env(f, gain, 0.005, mat === 'soft' ? 0.08 : 0.12, this.master);
    n.start(); n.stop(this._t + 0.16);
    if (mat === 'wood') this._tone('square', 180, 0.05, 0.12);
    if (mat === 'glass') this._tone('triangle', 900, 0.08, 0.18);
  }

  place(name) { this.dig(name); }

  break(name) {
    if (!this._ok()) return;
    this.dig(name);
    const mat = this._materialOf(name);
    if (mat === 'glass') { for (let i = 0; i < 4; i++) setTimeout(() => this._tone('triangle', 700 + Math.random() * 800, 0.06, 0.12), i * 25); }
  }

  step(name) {
    if (!this._ok()) return;
    const now = this._t;
    if (now - this._lastStep < 0.25) return;
    this._lastStep = now;
    const n = this._noise(0.07);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 800 + Math.random() * 400;
    n.connect(f);
    this._env(f, 0.12, 0.004, 0.06, this.master);
    n.start(); n.stop(this._t + 0.09);
  }

  hurt() { if (!this._ok()) return; this._tone('square', 160, 0.18, 0.3, 0.002); this._tone('sawtooth', 110, 0.2, 0.18); }
  mobHurt() { if (!this._ok()) return; this._tone('sawtooth', 240, 0.14, 0.22); }
  eat() { if (!this._ok()) return; for (let i = 0; i < 3; i++) setTimeout(() => this._tone('triangle', 200 + Math.random() * 120, 0.06, 0.16), i * 80); }
  splash() { if (!this._ok()) return; const n = this._noise(0.2); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; n.connect(f); this._env(f, 0.25, 0.005, 0.2, this.master); n.start(); n.stop(this._t + 0.25); }
  click() { this._tone('square', 440, 0.04, 0.12); }
}
