// input.js — keyboard + mouse (pointer lock) + touch input.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();       // currently held (KeyboardEvent.code)
    this.tapped = new Set();     // pressed since last endFrame()
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = [false, false, false]; // left, middle, right held
    this.clicked = [false, false, false]; // clicked since last endFrame
    this.wheel = 0;
    this.locked = false;
    this.touch = { fwd: 0, strafe: 0, lookDX: 0, lookDY: 0, jump: false, place: false, break: false };
    this._attach();
  }

  _attach() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.tapped.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));

    c.addEventListener('mousedown', (e) => {
      if (!this.locked) { c.requestPointerLock(); return; }
      const b = e.button; if (b < 3) { this.buttons[b] = true; this.clicked[b] = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.buttons[e.button] = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    c.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = (document.pointerLockElement === c);
    });
  }

  isDown(code) { return this.keys.has(code); }
  wasTapped(code) { return this.tapped.has(code); }

  consumeLook() {
    const d = { dx: this.mouseDX + this.touch.lookDX, dy: this.mouseDY + this.touch.lookDY };
    this.mouseDX = 0; this.mouseDY = 0; this.touch.lookDX = 0; this.touch.lookDY = 0;
    return d;
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  endFrame() {
    this.tapped.clear();
    this.clicked[0] = this.clicked[1] = this.clicked[2] = false;
    this.touch.break = false; this.touch.place = false;
  }
}
