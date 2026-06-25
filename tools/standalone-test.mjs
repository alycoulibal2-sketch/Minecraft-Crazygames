// standalone-test.mjs — validate the BUILT dist/minecraft.html: extract its inline
// script and run it against no-op WebGL/DOM stubs, confirming the bundled game
// boots (window.__game) and survives real frames. Catches bundler breakage.
// Run: node tools/standalone-test.mjs   (run build-standalone.mjs first)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const assert = (c, m) => { if (!c) { console.error('  ✗ ' + m); failures++; } else { console.log('  ✓ ' + m); } };

// ---- no-op WebGL2 + DOM stubs (same shape as boot-test) ----
const glNoop = function () { return glNoop; };
const gl = new Proxy({}, { get() { return glNoop; } });
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
const byId = { game: new El('canvas'), ui: new El('div'), loading: new El('div') };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.document = {
  createElement: (t) => new El(t),
  getElementById: (id) => byId[id] || new El('div'),
  addEventListener() {}, removeEventListener() {},
  exitPointerLock() {}, pointerLockElement: null, body: new El('body'), readyState: 'complete',
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis;
globalThis.AudioContext = undefined; globalThis.webkitAudioContext = undefined;
try { Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0, userAgent: 'node' }, configurable: true }); } catch {}
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.devicePixelRatio = 2;
globalThis.requestAnimationFrame = () => 0;
globalThis.console = console;

// ---- extract the inline <script> from the built file ----
const file = path.join(ROOT, 'dist', 'minecraft.html');
assert(fs.existsSync(file), 'dist/minecraft.html exists');
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>\s*<\/body>/);
assert(!!m, 'inline bundle script found in HTML');
const js = m[1].replace(/<\\\/script>/g, '</script>'); // undo our escaping

let err = null;
try { new Function(js)(); } catch (e) { err = e; }
assert(!err, 'bundle evaluates + boots without throwing' + (err ? ': ' + err.stack : ''));

const game = globalThis.__game;
assert(game && game.world && game.player && game.renderer && game.ui && game.entities, 'window.__game has all subsystems');

err = null;
try { let t = 1000; for (let i = 0; i < 60; i++) { t += 16; game._loop(t); } } catch (e) { err = e; }
assert(!err, 'bundled game runs 60 frames without throwing' + (err ? ': ' + err.stack : ''));
assert(game.world.chunks.size > 0, `world streamed chunks (${game.world ? game.world.chunks.size : 0})`);

err = null;
try {
  game.cycleMode(); game.timeOfDay = 0.0;
  let t = 3000; for (let i = 0; i < 90; i++) { t += 16; game._loop(t); }
  game.ui.openContainer('inventory'); game._loop(6000); game.ui.closeScreen();
} catch (e) { err = e; }
assert(!err, 'survival + inventory screen run without throwing' + (err ? ': ' + err.stack : ''));

err = null;
try {
  game.ui.openPause(); game._loop(6100);
  game.ui.openOptions(); game._loop(6116);
  game.settings.set('perspective', 1); game.applySettings(); game._loop(6132); // 3rd-person
  game.applyGameMode('creative'); game.ui.closeScreen(); game._loop(6148);
  game.settings.set('perspective', 0); game.applySettings();
} catch (e) { err = e; }
assert(!err, 'bundled pause/options menus + 3rd-person run without throwing' + (err ? ': ' + err.stack : ''));

console.log('\n' + (failures === 0 ? '✅ STANDALONE TEST PASSED (single-file boots + runs headlessly)' : `❌ ${failures} STANDALONE ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
