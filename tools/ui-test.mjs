// ui-test.mjs — exercise the UI inventory/crafting interaction logic with a
// minimal DOM stub (no browser). Validates the click-to-move + crafting code
// that the engine smoke test cannot reach. Run: node tools/ui-test.mjs

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S = (f) => 'file://' + path.join(ROOT, 'src', f).replace(/\\/g, '/');

let failures = 0;
function assert(c, m) { if (!c) { console.error('  ✗ ' + m); failures++; } else { console.log('  ✓ ' + m); } }

// ---- minimal DOM stub ----
const ctx2d = { imageSmoothingEnabled: false, clearRect() {}, putImageData() {}, drawImage() {}, getImageData() { return { data: [] }; } };
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
  getContext() { return ctx2d; }
}
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.document = { createElement: (t) => new El(t), addEventListener() {}, exitPointerLock() {}, pointerLockElement: null, body: new El('body') };

const { buildAtlas } = await import(S('textures.js'));
const { UI } = await import(S('ui.js'));
const { Inventory } = await import(S('inventory.js'));
const { ITEM_ID } = await import(S('items.js'));

const DIRT = ITEM_ID['dirt'], STONE = ITEM_ID['stone'], LOG = ITEM_ID['oak_log'],
  PLANK = ITEM_ID['oak_planks'], STICK = ITEM_ID['stick'], PICK = ITEM_ID['wooden_pickaxe'];

const atlas = buildAtlas();
const player = { mode: 'survival', selected: 0, inventory: new Inventory(), hotbar: [] };
const ui = new UI(new El('ui'), atlas.canvas, atlas.uv, player);
const slot = (store, index, type = 'normal') => ({ _store: store, _index: index, _type: type, isConnected: false });

console.log('== build ==');
assert(ui && ui.cursorEl, 'UI constructed with stub DOM');

console.log('\n== left-click pick up / drop ==');
let inv = new Inventory();
inv.set(0, { id: DIRT, count: 5 });
ui.cursor = null;
ui._onSlotClick(slot(inv, 0), false);
assert(ui.cursor && ui.cursor.id === DIRT && ui.cursor.count === 5 && inv.get(0) === null, 'pick up whole stack to cursor');
ui._onSlotClick(slot(inv, 1), false);
assert(inv.get(1) && inv.get(1).count === 5 && ui.cursor === null, 'drop stack into empty slot');

console.log('\n== merge same item (respect max stack) ==');
inv = new Inventory();
inv.set(0, { id: DIRT, count: 60 });
inv.set(1, { id: DIRT, count: 30 });
ui.cursor = null;
ui._onSlotClick(slot(inv, 0), false);          // cursor 60
ui._onSlotClick(slot(inv, 1), false);          // merge into 30 -> 64, cursor 26
assert(inv.get(1).count === 64 && ui.cursor && ui.cursor.count === 26, 'merge fills to 64, leftover 26 stays on cursor');

console.log('\n== swap different items ==');
inv = new Inventory();
inv.set(0, { id: STONE, count: 10 });
ui.cursor = { id: DIRT, count: 5 };
ui._onSlotClick(slot(inv, 0), false);
assert(inv.get(0).id === DIRT && inv.get(0).count === 5 && ui.cursor.id === STONE && ui.cursor.count === 10, 'swap slot and cursor stacks');

console.log('\n== right-click take half / place one ==');
inv = new Inventory();
inv.set(0, { id: DIRT, count: 9 });
ui.cursor = null;
ui._onSlotClick(slot(inv, 0), true);           // take ceil(9/2)=5
assert(ui.cursor.count === 5 && inv.get(0).count === 4, 'right-click takes half (5), leaves 4');
ui._onSlotClick(slot(inv, 1), true);           // place one into empty
assert(inv.get(1).count === 1 && ui.cursor.count === 4, 'right-click places one, cursor 4');

console.log('\n== crafting: 2x2 shapeless (1 oak_log -> 4 planks) ==');
ui.cursor = null; ui.craftDim = 2;
ui.craftGrid = [{ id: LOG, count: 1 }, null, null, null, null, null, null, null, null];
ui._takeCraftOutput();
assert(ui.cursor && ui.cursor.id === PLANK && ui.cursor.count === 4, 'crafting yields 4 oak_planks to cursor');
assert(ui.craftGrid[0] === null, 'crafting consumed the oak_log');

console.log('\n== crafting: 3x3 wooden pickaxe ==');
ui.cursor = null; ui.craftDim = 3;
ui.craftGrid = [
  { id: PLANK, count: 2 }, { id: PLANK, count: 2 }, { id: PLANK, count: 2 },
  null, { id: STICK, count: 2 }, null,
  null, { id: STICK, count: 2 }, null,
];
ui._takeCraftOutput();
assert(ui.cursor && ui.cursor.id === PICK && ui.cursor.count === 1, 'crafting yields wooden_pickaxe');
assert(ui.craftGrid[0].count === 1 && ui.craftGrid[4].count === 1, 'each ingredient decremented by 1');

console.log('\n== furnace store get/set + output-only take ==');
const f = { input: { id: ITEM_ID['raw_iron'], count: 2 }, fuel: { id: ITEM_ID['coal'], count: 1 }, output: { id: ITEM_ID['iron_ingot'], count: 3 }, burn: 0, burnMax: 0, progress: 0 };
ui.furnace = f;
const fstore = ui._furnaceStore();
assert(fstore.get(0).id === ITEM_ID['raw_iron'] && fstore.get(2).id === ITEM_ID['iron_ingot'], 'furnace store maps input/output');
ui.cursor = null;
ui._takeOutputOnly(fstore, 2);
assert(ui.cursor.id === ITEM_ID['iron_ingot'] && ui.cursor.count === 3 && f.output === null, 'take furnace output to cursor');

console.log('\n== close returns cursor + craft grid to inventory ==');
player.inventory = new Inventory();
ui.cursor = { id: DIRT, count: 7 };
ui.craftGrid = [{ id: STONE, count: 3 }, null, null, null, null, null, null, null, null];
ui.screen = 'crafting';
ui.closeScreen();
assert(player.inventory.countOf(DIRT) === 7, 'cursor item returned to inventory on close');
assert(player.inventory.countOf(STONE) === 3, 'craft-grid items returned to inventory on close');
assert(ui.cursor === null && ui.screen === null, 'screen closed cleanly');

console.log('\n== slots respond to mousedown (not click — avoids per-frame detach bug) ==');
{
  const inv2 = new Inventory(); inv2.set(0, { id: DIRT, count: 8 });
  ui.cursor = null;
  const s = ui._slot(inv2, 0, 'normal');
  const md = s._listeners.mousedown && s._listeners.mousedown[0];
  assert(typeof md === 'function', 'slot has a mousedown handler');
  assert(!(s._listeners.click && s._listeners.click.length), 'slot has NO click handler (the detach bug)');
  const ev = { button: 0, preventDefault() {}, stopPropagation() {} };
  md(ev);
  assert(ui.cursor && ui.cursor.id === DIRT && ui.cursor.count === 8 && inv2.get(0) === null, 'left mousedown picks up whole stack');
  const s2 = ui._slot(inv2, 1, 'normal');
  s2._listeners.mousedown[0](ev);   // left mousedown into empty slot -> drop
  assert(inv2.get(1) && inv2.get(1).count === 8 && ui.cursor === null, 'left mousedown drops the stack');
  // right mousedown takes half
  const s3 = ui._slot(inv2, 1, 'normal');
  s3._listeners.mousedown[0]({ button: 2, preventDefault() {}, stopPropagation() {} });
  assert(ui.cursor && ui.cursor.count === 4 && inv2.get(1).count === 4, 'right mousedown takes half');
}

console.log('\n== tool durability (dmg) preserved through place + close ==');
{
  // right-click place-one keeps dmg
  const inv3 = new Inventory();
  ui.cursor = { id: PICK, count: 1, dmg: 5 };
  ui._onSlotClick(slot(inv3, 0), true);   // right-click into empty slot
  assert(inv3.get(0) && inv3.get(0).id === PICK && inv3.get(0).dmg === 5, 'right-click place-one preserves tool dmg');

  // closing a screen returns a damaged tool with its dmg intact
  player.inventory = new Inventory();
  ui.cursor = { id: PICK, count: 1, dmg: 9 };
  ui.craftGrid = [{ id: PICK, count: 1, dmg: 3 }, null, null, null, null, null, null, null, null];
  ui.screen = 'crafting';
  ui.closeScreen();
  const slots = player.inventory.slots.filter(s => s && s.id === PICK);
  const dmgs = slots.map(s => s.dmg).sort((a, b) => a - b);
  assert(dmgs.includes(9) && dmgs.includes(3), `closeScreen preserves dmg on returned tools (got ${JSON.stringify(dmgs)})`);
}

console.log('\n' + (failures === 0 ? '✅ ALL UI TESTS PASSED' : `❌ ${failures} UI ASSERTION(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
