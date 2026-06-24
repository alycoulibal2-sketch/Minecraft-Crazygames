// game.js — orchestrates engine: world, player, renderer, input, UI, main loop, day/night.

import { getGL } from './glutil.js';
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { DEFAULT_RENDER_DISTANCE } from './config.js';

const DAY_LENGTH = 600; // seconds for a full day-night cycle

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.gl = getGL(canvas);
    this.renderer = new Renderer(this.gl);
    this.world = new World((Math.random() * 1e9) >>> 0);
    this.player = new Player(this.world);
    this.camera = new Camera();
    this.input = new Input(canvas);
    this.ui = new UI(uiRoot, this.renderer.atlasCanvas, this.renderer.atlasUV, this.player);

    this.renderDistance = DEFAULT_RENDER_DISTANCE;
    this.timeOfDay = 0.3;       // 0..1
    this.timePaused = false;
    this.mode = 'creative';
    this.fps = 60;
    this._acc = 0; this._frames = 0; this._fpsTimer = 0;

    this._spawn();
    this._resize();
    addEventListener('resize', () => this._resize());

    this.last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _spawn() {
    // Synchronously generate the spawn area so the player has ground.
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.ensureChunk(dx, dz);
        if (!c.generated) this.world.gen.generateTerrain(c);
      }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(dx, dz);
        if (c && !c.decorated) this.world.gen.decorate(c, this.world);
      }
    const sy = this.world.surfaceHeight(0, 0);
    this.player.pos = [0.5, sy + 1.0, 0.5];
    this.player.flying = true;
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    this.canvas.width = w; this.canvas.height = h;
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.camera.setAspect(w / h);
  }

  cycleMode() {
    this.mode = this.mode === 'creative' ? 'survival' : (this.mode === 'survival' ? 'spectator' : 'creative');
    this.player.setMode(this.mode);
  }

  onBreak(id, x, y, z) { /* survival drops hook */ }
  onPlace(id) { /* survival inventory hook */ }

  _globalKeys() {
    const input = this.input;
    if (input.wasTapped('KeyE')) { this.ui.toggleInventory(); }
    if (input.wasTapped('F3')) this.ui.toggleDebug();
    if (input.wasTapped('KeyG')) this.cycleMode();
    if (input.wasTapped('KeyT')) this.timePaused = !this.timePaused;
    if (input.wasTapped('BracketRight')) this.renderDistance = Math.min(16, this.renderDistance + 1);
    if (input.wasTapped('BracketLeft')) this.renderDistance = Math.max(3, this.renderDistance - 1);
    if (input.wasTapped('Escape') && this.ui.invOpen) this.ui.toggleInventory(false);
  }

  _env() {
    const sunHeight = Math.sin((this.timeOfDay - 0.25) * Math.PI * 2);
    const dayLight = clamp((sunHeight + 0.15) / 0.4, 0, 1);
    const tw = clamp(1 - Math.abs(sunHeight) / 0.22, 0, 1) * (sunHeight > -0.35 ? 1 : 0);
    const topDay = [0.35, 0.6, 0.96], topNight = [0.02, 0.03, 0.10];
    const botDay = [0.70, 0.82, 0.98], botNight = [0.05, 0.06, 0.13];
    const orange = [0.95, 0.55, 0.28];
    const skyTop = mix3(topNight, topDay, dayLight);
    let skyBottom = mix3(botNight, botDay, dayLight);
    skyBottom = mix3(skyBottom, orange, tw * 0.6);
    const fogColor = skyBottom;
    const far = this.renderDistance * 16;
    return {
      dayLight, skyTop, skyBottom, fogColor,
      fogStart: far * 0.55, fogEnd: far * 0.95,
    };
  }

  _loop(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;   // clamp to avoid tunneling on lag spikes

    this._globalKeys();

    if (!this.timePaused) this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;

    if (!this.ui.invOpen) {
      this.player.mode = this.mode;
      this.player.update(dt, this.input, this);
    }
    this.ui.setHint(!this.input.locked && !this.ui.invOpen);

    this.world.update(this.player.pos[0], this.player.pos[2], this.renderDistance);
    this.renderer.reconcile(this.world);
    this.renderer.render(this.world, this.camera, this.player, this._env());

    // fps
    this._frames++; this._fpsTimer += dt;
    if (this._fpsTimer >= 0.5) { this.fps = this._frames / this._fpsTimer; this._frames = 0; this._fpsTimer = 0; }
    this.ui.update(this, this.fps);

    this.input.endFrame();
    requestAnimationFrame(this._loop);
  }
}

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
