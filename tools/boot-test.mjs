// boot-test.mjs — construct the FULL game against no-op WebGL/DOM stubs and run
// real frames. This exercises every module's construction + per-frame integration
// (renderer, world streaming, ui, entities, audio, touch, persistence) to catch
// runtime errors that the logic-only tests cannot. It does NOT verify pixels.
// Run: node tools/boot-test.mjs

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = (f) => 'file://' + path.join(ROOT, 'src', f).replace(/\\/g, '/');

let failures = 0;
function assert(c, m) { if (!c) { console.error('  ✗ ' + m); failures++; } else { console.log('  ✓ ' + m); } }

// ---- no-op WebGL2 context: every property is a function returning itself ----
const glNoop = function () { return glNoop; };
const gl = new Proxy({}, { get() { return glNoop; } });

// ---- DOM stub ----
const ctx2d = { imageSmoothingEnabled: false, clearRect() {}, putImageData() {}, drawImage() {}, getImageData() { return { data: [] }; }, fillRect() {}, beginPath() {}, fill() {} };
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this._cls = new Set(); this._listeners = {}; this._html = ''; this.textContent = ''; this.attrs = {}; this.width = 0; this.height = 0; }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(' '); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  get classList() { const c = this._cls; return { add: x => c.add(x), remove: x => c.delete(x), toggle: (x, on) => { if (on === undefined) { c.has(x) ? c.delete(x) : c.add(x); } else { on ? c.add(x) : c.delete(x); } }, contains: x => c.has(x) }; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; }
  get innerHTML() { return this._html; }
  get isConnected() { return true; }
  addEventListener(t, fn) { (this._listeners[t] || (this._listeners[t] = [])).push(fn); }
  removeEventListener() {}
  getContext(kind) { return kind === '2d' ? ctx2d : gl; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  requestPointerLock() {}
}
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.document = {
  createElement: (t) => new El(t),
  getElementById: () => new El('div'),
  addEventListener() {}, removeEventListener() {},
  exitPointerLock() {}, pointerLockElement: null, body: new El('body'), readyState: 'complete',
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { AudioContext: undefined, webkitAudioContext: undefined, addEventListener() {}, removeEventListener() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true }); } catch { /* navigator already non-touch in node */ }
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 0;   // prevent the loop from auto-driving itself
globalThis.setTimeout = globalThis.setTimeout || (() => 0);

const { Game } = await import(S('game.js'));

console.log('== construct full game ==');
let game = null, err = null;
try { game = new Game(new El('canvas'), new El('div')); } catch (e) { err = e; }
assert(!err, 'Game constructs without throwing' + (err ? ': ' + err.stack : ''));
assert(game && game.world && game.player && game.renderer && game.ui && game.entities, 'all subsystems present');

console.log('\n== run 30 real frames (creative) ==');
err = null;
try { let t = 1000; for (let i = 0; i < 30; i++) { t += 16; game._loop(t); } } catch (e) { err = e; }
assert(!err, 'creative frames run without throwing' + (err ? ': ' + err.stack : ''));
assert(game.world.chunks.size > 0, `world streamed chunks (${game.world ? game.world.chunks.size : 0})`);

console.log('\n== switch to survival + run frames (spawns mobs at night) ==');
err = null;
try {
  game.cycleMode(); // creative -> survival
  game.timeOfDay = 0.0; // midnight -> hostile spawns
  let t = 2000; for (let i = 0; i < 120; i++) { t += 16; game._loop(t); }
} catch (e) { err = e; }
assert(!err, 'survival frames run without throwing' + (err ? ': ' + err.stack : ''));
assert(game.mode === 'survival', 'mode switched to survival');

console.log('\n== open every container screen ==');
err = null;
try {
  game.ui.openContainer('inventory'); game._loop(5000); game.ui.closeScreen();
  game.ui.openContainer('crafting', { hit: { x: 0, y: 0, z: 0 } }); game._loop(5016); game.ui.closeScreen();
  game.openBlockUI('furnace', { x: 1, y: 2, z: 3 }); game._loop(5032); game.ui.closeScreen();
  game.cycleMode(); game.cycleMode(); // survival -> spectator -> creative
  game.ui.openCreative(); game._loop(5048); game.ui.closeScreen();
} catch (e) { err = e; }
assert(!err, 'all container screens open/close + render without throwing' + (err ? ': ' + err.stack : ''));

console.log('\n== save + reload roundtrip via localStorage ==');
err = null;
try {
  const { save, load } = await import(S('persistence.js'));
  assert(save(game) === true, 'save() writes to localStorage');
  assert(load() !== null, 'load() reads it back');
  // construct a second game; it should load the save without throwing
  const g2 = new Game(new El('canvas'), new El('div'));
  g2._loop(9000);
  assert(g2.world.seed === game.world.seed, 'reloaded game uses the saved seed');
} catch (e) { err = e; assert(false, 'reload roundtrip: ' + e.stack); }

console.log('\n' + (failures === 0 ? '✅ BOOT TEST PASSED (full game constructs + runs headlessly)' : `❌ ${failures} BOOT ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
