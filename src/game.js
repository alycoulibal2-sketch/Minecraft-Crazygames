// game.js — orchestrates engine: world, player, renderer, input, UI, main loop, day/night.

import { getGL } from './glutil.js';
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { DEFAULT_RENDER_DISTANCE, PLAYER_EYE } from './config.js';
import { WATER, ID, BLOCKS, AIR } from './blocks.js';
import { ITEMS } from './items.js';
import { smeltResult } from './recipes.js';
import { Audio } from './audio.js';
import { TouchControls } from './touch.js';
import { CHUNK_X, CHUNK_Z } from './config.js';
import { save, load, applySave } from './persistence.js';
import { EntityManager } from './entities.js';
import { Settings } from './settings.js';

const AUTOSAVE_INTERVAL = 25; // seconds

const SMELT_TIME = 5;   // seconds to smelt one item

const DAY_LENGTH = 600; // seconds for a full day-night cycle

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.gl = getGL(canvas);
    this.renderer = new Renderer(this.gl);
    const saved = load();
    const seed = saved ? (saved.seed >>> 0) : ((Math.random() * 1e9) >>> 0);
    this.world = new World(seed);
    this.player = new Player(this.world);
    this.entities = new EntityManager(this.world);
    this.camera = new Camera();
    this.input = new Input(canvas);
    this.ui = new UI(uiRoot, this.renderer.atlasCanvas, this.renderer.atlasUV, this.player);
    this.ui.game = this;
    this.settings = new Settings();

    this.renderDistance = this.settings.renderDistance;
    this.difficulty = this.settings.difficulty;
    this.timeOfDay = 0.3;       // 0..1
    this.timePaused = false;
    this._wasLocked = false;
    this.mode = 'creative';
    this.fps = 60;
    this._acc = 0; this._frames = 0; this._fpsTimer = 0;
    this._regenTimer = 0; this._starveTimer = 0; this._airTimer = 0; this._deathTimer = 0;
    this.furnaces = new Map();   // "x,y,z" -> furnace state
    this.spawnPoint = [0.5, 80, 0.5];
    this._autosaveTimer = 0;
    this.audio = new Audio();
    this.touch = new TouchControls(this.input, this);
    this._prevHealth = 20; this._prevHunger = 20; this._wasInWater = false;

    this.applySettings();
    this._spawn();
    if (saved) {
      const pos = applySave(this, saved);
      if (pos) this._ensureAround(pos[0], pos[2]);  // generate the loaded location
      this.player.flying = (this.mode !== 'survival');
    }

    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('beforeunload', () => save(this));

    this.last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // Synchronously generate + decorate the 3x3 chunks around a world position.
  _ensureAround(wx, wz) {
    const pcx = Math.floor(wx / CHUNK_X), pcz = Math.floor(wz / CHUNK_Z);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.ensureChunk(pcx + dx, pcz + dz);
        if (!c.generated) { this.world.gen.generateTerrain(c); this.world.applyEdits(c); c.dirty = true; }
      }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (c && !c.decorated && this.world.neighborsGenerated(c.cx, c.cz, true)) { this.world.gen.decorate(c, this.world); c.dirty = true; }
      }
  }

  _spawn() {
    this._ensureAround(0, 0);
    const sy = this.world.surfaceHeight(0, 0);
    this.player.pos = [0.5, sy + 1.0, 0.5];
    this.spawnPoint = [0.5, sy + 1.0, 0.5];
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

  // Set game mode explicitly (used by the Options menu — the path to Survival).
  applyGameMode(mode) {
    if (mode !== 'creative' && mode !== 'survival' && mode !== 'spectator') return;
    this.mode = mode;
    this.player.setMode(mode);
  }

  // Push current settings into the live systems (called on change + each frame).
  applySettings() {
    const s = this.settings;
    this.renderDistance = s.renderDistance;
    this.difficulty = s.difficulty;
    this.camera.perspective = s.perspective;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    if (this.audio) this.audio.setVolume(s.volume);
  }

  saveNow() { if (save(this)) this.ui.flashSaved?.(); }

  onBreak(id, x, y, z) {
    if (id === ID.furnace) this.furnaces.delete(x + ',' + y + ',' + z);
    this.audio.break(BLOCKS[id]?.name);
  }
  onPlace(id) { this.audio.place(BLOCKS[id]?.name); }

  _audioTick(dt) {
    const p = this.player;
    this.audio.ensure();
    if (p.health < this._prevHealth - 0.01) this.audio.hurt();
    if (p.hunger > this._prevHunger + 0.01) this.audio.eat();
    this._prevHealth = p.health; this._prevHunger = p.hunger;
    // footsteps
    if (p.onGround && !p.flying) {
      const v = Math.hypot(p.vel[0], p.vel[2]);
      if (v > 1.0) {
        const id = this.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] - 0.1), Math.floor(p.pos[2]));
        if (id !== AIR) this.audio.step(BLOCKS[id]?.name);
      }
    }
    // splash on entering water
    if (p.inWater && !this._wasInWater) this.audio.splash();
    this._wasInWater = p.inWater;
  }

  // ---- functional block UI ----
  openBlockUI(type, hit) {
    if (type === 'furnace') {
      const key = hit.x + ',' + hit.y + ',' + hit.z;
      let f = this.furnaces.get(key);
      if (!f) { f = { input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 }; this.furnaces.set(key, f); }
      this.ui.openContainer('furnace', { hit, furnace: f });
    } else {
      this.ui.openContainer('crafting', { hit });
    }
  }

  _respawn() {
    const p = this.player;
    p.health = p.maxHealth; p.hunger = p.maxHunger; p.saturation = 5; p.exhaustion = 0;
    p.air = p.maxAir; p.dead = false; p._peakY = null;
    p.vel = [0, 0, 0];
    const sx = Math.floor(this.spawnPoint[0]), sz = Math.floor(this.spawnPoint[2]);
    const sy = this.world.surfaceHeight(sx, sz);
    p.pos = [sx + 0.5, sy + 0.5, sz + 0.5];
  }

  _survivalTick(dt) {
    const p = this.player;
    if (p.mode !== 'survival') return;
    if (p.dead) {
      // close gameplay containers but allow the pause/options menu (Respawn lives there + on the death screen)
      if (this.ui.invOpen && !this.ui.isPauseScreen()) this.ui.closeScreen();
      return;
    }

    // passive exhaustion + sprint cost
    p.exhaustion += dt * 0.015;
    const v = Math.hypot(p.vel[0], p.vel[2]);
    if (!p.flying && v > 5.5) p.exhaustion += dt * 0.03;

    // exhaustion -> saturation -> hunger
    while (p.exhaustion >= 4) {
      p.exhaustion -= 4;
      if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1);
      else p.hunger = Math.max(0, p.hunger - 1);
    }

    // regen / starvation
    if (p.hunger >= 18 && p.health < p.maxHealth && p.saturation > 0) {
      this._regenTimer += dt;
      if (this._regenTimer >= 3.5) { p.heal(1); p.exhaustion += 0.6; this._regenTimer = 0; }
    } else if (p.hunger <= 0) {
      this._starveTimer += dt;
      if (this._starveTimer >= 4) { p.takeDamage(1); this._starveTimer = 0; }
    } else { this._regenTimer = 0; this._starveTimer = 0; }

    // drowning
    const ex = Math.floor(p.pos[0]), ey = Math.floor(p.pos[1] + PLAYER_EYE), ez = Math.floor(p.pos[2]);
    if (this.world.getBlock(ex, ey, ez) === WATER) {
      p.air -= dt * 20;
      if (p.air <= 0) { this._airTimer += dt; if (this._airTimer >= 1) { p.takeDamage(2); this._airTimer = 0; } }
    } else { p.air = p.maxAir; this._airTimer = 0; }

    // lava / fire contact damage (feet in lava)
    if (this.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + 0.1), Math.floor(p.pos[2])) === ID.lava) {
      p.takeDamage(dt * 4);
    }
  }

  _tickFurnaces(dt) {
    for (const f of this.furnaces.values()) {
      const inItem = f.input;
      const smeltId = inItem ? smeltResult(inItem.id) : null;
      const canSmelt = !!smeltId && (!f.output || (f.output.id === smeltId && f.output.count < 64));

      if (f.burn > 0) f.burn = Math.max(0, f.burn - dt);

      // light the furnace if idle, smeltable input present, and fuel available
      if (f.burn <= 0 && canSmelt && f.fuel && f.fuel.count > 0) {
        const fuelItem = ITEMS[f.fuel.id];
        if (fuelItem && fuelItem.fuel > 0) {
          f.burnMax = fuelItem.fuel * SMELT_TIME;
          f.burn = f.burnMax;
          f.fuel.count -= 1;
          if (f.fuel.count <= 0) f.fuel = null;
        }
      }

      if (f.burn > 0 && canSmelt) {
        f.progress += dt;
        if (f.progress >= SMELT_TIME) {
          f.progress = 0;
          inItem.count -= 1;
          if (inItem.count <= 0) f.input = null;
          if (f.output) f.output.count += 1; else f.output = { id: smeltId, count: 1 };
        }
      } else {
        f.progress = 0;
      }
    }
  }

  _globalKeys() {
    const input = this.input;
    // Escape / menu (also opened on pointer-lock loss in _loop, since some
    // browsers swallow the Escape keydown that exits pointer lock).
    if (input.wasTapped('Escape')) {
      if (this.ui.screen === 'options') this.ui.openPause();
      else if (this.ui.screen) this.ui.closeScreen();
      else this.ui.openPause();
    }
    if (input.wasTapped('KeyE')) { if (this.ui.isPauseScreen()) this.ui.closeScreen(); else this.ui.toggleInventory(); }
    if (input.wasTapped('F3')) this.ui.toggleDebug();
    if (input.wasTapped('KeyG')) this.ui.openOptions();          // quick access to Options (Game Mode)
    if (input.wasTapped('F5')) { this.settings.set('perspective', (this.settings.perspective + 1) % 3); this.applySettings(); }
    if (input.wasTapped('KeyT')) this.timePaused = !this.timePaused;
    if (input.wasTapped('BracketRight')) { this.settings.set('renderDistance', this.settings.renderDistance + 1); this.applySettings(); }
    if (input.wasTapped('BracketLeft')) { this.settings.set('renderDistance', this.settings.renderDistance - 1); this.applySettings(); }
    if (input.wasTapped('KeyK')) this.saveNow();   // manual save
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
      brightness: this.settings.brightness,
    };
  }

  // Smoothly ease the camera FOV toward the target (with optional sprint zoom).
  _updateFov(dt) {
    const base = this.settings.fov * Math.PI / 180;
    let target = base;
    if (this.settings.sprintFov) {
      const p = this.player;
      const speed = Math.hypot(p.vel[0], p.vel[2]);
      if (!p.flying && speed > 5.5) target = base * 1.12;
      else if (p.flying && speed > 12) target = base * 1.10;
    }
    this.camera.fov += (target - this.camera.fov) * Math.min(1, dt * 10);
  }

  _loop(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;   // clamp to avoid tunneling on lag spikes

    this._globalKeys();

    // open the pause menu when pointer lock is lost (some browsers swallow the
    // Escape keydown that exits pointer lock, so we detect the lock transition).
    if (this._wasLocked && !this.input.locked && !this.ui.invOpen) this.ui.openPause();
    this._wasLocked = this.input.locked;

    // live camera / control settings
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.camera.perspective = this.settings.perspective;
    this._updateFov(dt);

    const menuPaused = this.settings.pauseTimeInMenu && this.ui.isPauseScreen();

    if (!this.timePaused && !menuPaused) this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;

    const env = this._env();
    this.touch.update();
    this.player.mode = this.mode;
    if (!this.ui.invOpen && !this.player.dead) {
      this.player.update(dt, this.input, this);
    }
    this._survivalTick(dt);
    this._tickFurnaces(dt);
    if (!menuPaused) this.entities.update(dt, this.player, this, env);
    this._audioTick(dt);
    this.ui.setHint(!this.input.locked && !this.ui.invOpen);

    this.world.update(this.player.pos[0], this.player.pos[2], this.renderDistance);
    this.renderer.reconcile(this.world);
    this.renderer.render(this.world, this.camera, this.player, env, this.entities);

    // autosave
    this._autosaveTimer += dt;
    if (this._autosaveTimer >= AUTOSAVE_INTERVAL) { this._autosaveTimer = 0; if (save(this)) this.ui.flashSaved?.(); }

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
