// inventory.js — player inventory model (stacks of items). DOM-free.

import { ITEMS } from './items.js';

export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 27;
export const INV_SIZE = HOTBAR_SIZE + MAIN_SIZE; // 36

export class Inventory {
  constructor(size = INV_SIZE) {
    this.size = size;
    this.slots = new Array(size).fill(null); // each: {id, count} or null
  }

  get(i) { return this.slots[i]; }
  set(i, stack) { this.slots[i] = stack; }

  maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

  // Add items; returns the number that did NOT fit.
  add(id, count) {
    if (!id || count <= 0) return 0;
    const max = this.maxStack(id);
    // 1) top up existing stacks
    for (let i = 0; i < this.size && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) {
        const can = Math.min(max - s.count, count);
        s.count += can; count -= can;
      }
    }
    // 2) fill empty slots
    for (let i = 0; i < this.size && count > 0; i++) {
      if (!this.slots[i]) {
        const can = Math.min(max, count);
        this.slots[i] = { id, count: can }; count -= can;
      }
    }
    return count;
  }

  // Add a whole stack object, preserving its dmg (tool durability). Damaged tools
  // are placed into an empty slot as-is (they don't stack); everything else uses
  // the normal merge-and-fill add(). Returns the count that did NOT fit.
  addStack(stack) {
    if (!stack || !stack.id) return 0;
    if (stack.dmg) {
      const i = this.firstEmpty();
      if (i >= 0) { this.slots[i] = { id: stack.id, count: stack.count, dmg: stack.dmg }; return 0; }
      return stack.count;
    }
    return this.add(stack.id, stack.count);
  }

  // Remove up to `count` of id; returns number actually removed.
  remove(id, count) {
    let removed = 0;
    for (let i = 0; i < this.size && removed < count; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, count - removed);
        s.count -= take; removed += take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return removed;
  }

  // Decrement one item from a specific slot (e.g. after placing a block).
  decrement(i, n = 1) {
    const s = this.slots[i];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
  }

  has(id, count = 1) {
    let total = 0;
    for (const s of this.slots) if (s && s.id === id) { total += s.count; if (total >= count) return true; }
    return false;
  }
  countOf(id) { let t = 0; for (const s of this.slots) if (s && s.id === id) t += s.count; return t; }

  firstEmpty() { return this.slots.findIndex(s => !s); }

  serialize() { return this.slots.map(s => s ? [s.id, s.count, s.dmg || 0] : null); }
  load(data) {
    this.slots = new Array(this.size).fill(null);
    if (!data) return;
    for (let i = 0; i < Math.min(this.size, data.length); i++) {
      const s = data[i];
      this.slots[i] = s ? { id: s[0], count: s[1], dmg: s[2] || 0 } : null;
    }
  }
}
