// touch.js — on-screen controls for touch devices: left joystick (move),
// right drag (look), and action buttons. Drives input.touch.* hooks.

export class TouchControls {
  constructor(input, game, parent) {
    this.input = input;
    this.game = game;
    this.enabled = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    this._breakHeld = false;
    this._jumpHeld = false;
    if (this.enabled) this._build(parent || document.body);
  }

  // Re-assert held states each frame (endFrame() clears break/jump).
  update() {
    if (!this.enabled) return;
    this.input.touch.break = this._breakHeld;
    this.input.touch.jump = this._jumpHeld;
  }

  _build(parent) {
    const root = el('div', 'tc-root');
    parent.appendChild(root);

    // look zone (right side, behind buttons)
    const look = el('div', 'tc-look');
    root.appendChild(look);
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    look.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        this.input.touch.lookDX += (t.clientX - lx) * 1.7;
        this.input.touch.lookDY += (t.clientY - ly) * 1.7;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    look.addEventListener('touchend', lookEnd); look.addEventListener('touchcancel', lookEnd);

    // joystick (bottom-left)
    const joy = el('div', 'tc-joy');
    const knob = el('div', 'tc-knob');
    joy.appendChild(knob); root.appendChild(joy);
    let active = null, cx = 0, cy = 0; const R = 56;
    const move = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy) || 1; const m = Math.min(d, R);
      const kx = dx / d * m, ky = dy / d * m;
      knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      this.input.touch.strafe = clamp(kx / R, -1, 1);
      this.input.touch.fwd = clamp(-ky / R, -1, 1);
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); const t = e.changedTouches[0]; active = t.identifier;
      const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(t);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === active) move(t);
    }, { passive: false });
    const joyEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === active) {
        active = null; this.input.touch.fwd = 0; this.input.touch.strafe = 0;
        knob.style.transform = 'translate(-50%, -50%)';
      }
    };
    joy.addEventListener('touchend', joyEnd); joy.addEventListener('touchcancel', joyEnd);

    // action buttons (bottom-right)
    const btns = el('div', 'tc-btns'); root.appendChild(btns);
    btns.appendChild(this._btn('⛏', () => { this._breakHeld = true; this.input.clicked[0] = true; }, () => { this._breakHeld = false; }));
    btns.appendChild(this._btn('▦', () => { this.input.clicked[2] = true; }, null));
    btns.appendChild(this._btn('⤒', () => { this._jumpHeld = true; }, () => { this._jumpHeld = false; }));

    // top-right utility buttons
    const util = el('div', 'tc-util'); root.appendChild(util);
    util.appendChild(this._btn('🎒', () => this.game.ui.toggleInventory(), null, true));
    util.appendChild(this._btn('✈', () => { const p = this.game.player; if (p.mode !== 'survival') { p.flying = !p.flying; p.vel[1] = 0; } }, null, true));
    util.appendChild(this._btn('👁', () => { this.game.settings.set('perspective', (this.game.settings.perspective + 1) % 3); this.game.applySettings(); }, null, true));
    util.appendChild(this._btn('⚙', () => this.game.ui.openOptions(), null, true));
  }

  _btn(label, onDown, onUp, small) {
    const b = el('div', 'tc-btn' + (small ? ' tc-small' : ''));
    b.textContent = label;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); onDown && onDown(); }, { passive: false });
    if (onUp) {
      const up = (e) => { e.preventDefault(); onUp(); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    }
    return b;
  }
}

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function el(tag, cls) { const e = document.createElement(tag === 'div' ? 'div' : tag); e.className = cls; return e; }
