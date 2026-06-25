# Minecraft Crazygames

A **from-scratch voxel sandbox game** for the browser — a Minecraft-style block world built on **WebGL2 with zero dependencies and zero copyrighted assets**. Every texture is generated procedurally in code, the world is infinite and procedurally generated, and the whole thing runs by opening a single HTML file. Designed to be **CrazyGames / HTML5-portal ready**.

> ### Honest scope
> Minecraft is millions of lines of code built by a studio over 15+ years, and its art and sound are copyrighted — so this is **not** a 1:1 copy of every feature, and it never ships Mojang's assets. What it *is*: a real, playable, growing voxel engine that reimplements Minecraft's core loop from first principles. **Creative mode is playable now**; **Survival is being layered on** (see roadmap). It is built to keep growing toward parity.
>
> Not affiliated with or endorsed by Mojang Studios or Microsoft. "Minecraft" is a trademark of Mojang Studios; this is an independent, original reimplementation used here as a learning/clone project.

---

## ▶ Play locally

No build step. Any static file server works. The repo ships a tiny one:

```bash
node tools/serve.js
# then open http://localhost:8080
```

Or with Python: `python -m http.server 8080`. Then click the canvas to lock the mouse and play.

Requires a browser with **WebGL2** (Chrome, Edge, Firefox, Safari 15+).

### 📱 Single-file build (mobile / no server)

`npm run build` bundles the entire game into one self-contained file, **`dist/minecraft.html`** — no server, no install, no external assets. Open it directly in any modern mobile or desktop browser (or email/AirDrop it to your phone) and it plays with on-screen touch controls. A prebuilt copy is committed at [`dist/minecraft.html`](dist/minecraft.html).

## 🎮 Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse (click to lock) |
| Jump / fly up | `Space` |
| Sneak / fly down | `Left Shift` |
| Sprint | `Left Ctrl` |
| Toggle flight | double-tap `Space` |
| Break block | Left mouse |
| Place block | Right mouse |
| Pick block | Middle mouse |
| Hotbar | `1`–`9`, mouse wheel |
| Open inventory | `E` |
| Pause / Game menu | `Esc` |
| Options (settings) | `G` |
| Cycle camera perspective | `F5` |
| Pause/resume day-night | `T` |
| Render distance | `[` and `]` |
| Debug overlay | `F3` |

> **Game mode & settings:** open **Esc → Options** (or press `G`). The Options menu has **Game Mode** (this is how you switch to **Survival**), **Difficulty**, FOV, mouse sensitivity, invert-Y, camera perspective, render distance, brightness, master volume, and more. Settings persist on your device. On touch devices, use the ⚙ button.

## ✨ Features so far

- **Infinite procedural world** — heightmap + mountains, biomes (plains, forest, desert, taiga, snowy, mountains, beach, ocean), worm-style caves, ore distribution by depth, trees (oak/birch/spruce), cacti, flowers and grass.
- **Chunked voxel renderer** — face-culling mesher with **per-vertex ambient occlusion** and directional face shading, separate opaque / cutout / transparent passes, async chunk streaming.
- **100+ blocks** — stones, ores & mineral blocks, dirt/grass/sand, all 16 wool colours, logs/planks/leaves, glass, glowstone, water & lava, plants, functional blocks (crafting table, furnace, TNT, bookshelf) and more — each with a **procedurally drawn original texture**.
- **Build & mine** — voxel raycasting for precise block selection, place/break with collision-safe placement, creative flight, AABB physics & swimming.
- **Day/night cycle** with dynamic sky gradient, sunset tint, and distance fog.
- **Creative inventory** picker, hotbar, crosshair, and an `F3` debug HUD.

## 👹 Mobs

Passive animals (pig, cow, sheep, chicken) spawn on grass in daylight and wander; hostile zombies spawn in the dark, chase the player, attack on contact, and burn in sunlight. Mobs are drawn as shaded box models, have health and knockback, drop items into your inventory when killed in survival (meat, leather, wool, feathers…), and are hit by left-clicking with reach + weapon damage that scales by tool.

## 🗺 Roadmap

- [x] Creative mode (build/fly/infinite world)
- [x] **Survival**: block hardness & mining times, tool tiers, block drops → inventory, crafting grid & recipes, furnace smelting
- [x] Health, hunger, saturation, regen, starvation, fall/drown/lava damage, death & respawn
- [x] Mobs (passive + hostile) with simple AI, drops, and melee combat
- [x] World save/load (localStorage) with autosave
- [ ] Smooth flood-fill lighting (sky + block light, torches)
- [ ] Greedy meshing + frustum culling for higher render distance
- [ ] Mob pathfinding & breeding; item-entity drops you walk over
- [ ] Mobile touch controls
- [ ] Sound (procedural / original)

## 🏗 Architecture

Pure ES modules under `src/`, no bundler:

| Module | Responsibility |
| --- | --- |
| `math.js` | mat4 / vec3 helpers |
| `noise.js` | seeded Perlin + fbm + hashing |
| `blocks.js` | block registry (render/collision/texture metadata) |
| `textures.js` | procedural pixel-art texture atlas |
| `config.js` | world & player constants |
| `chunk.js` | chunk storage + AO face-culling mesher |
| `worldgen.js` | terrain, biomes, caves, ores, trees, plants |
| `world.js` | chunk manager, generation pipeline, raycast |
| `glutil.js` / `shaders.js` | WebGL2 helpers & GLSL |
| `renderer.js` | sky, chunk meshes, entities, selection box |
| `items.js` / `inventory.js` / `recipes.js` | items & tools, stack inventory, crafting & smelting |
| `entities.js` | mobs: physics, AI, spawning, drops, combat |
| `persistence.js` | save/load to localStorage |
| `camera.js` / `input.js` / `player.js` | view, controls, physics, survival & interaction |
| `ui.js` | crosshair, hotbar, inventory/crafting/furnace screens, HUD |
| `game.js` / `main.js` | main loop, day/night, survival tick, bootstrap |

Headless test suite (`npm test`, also run in CI) — no browser required:
- `tools/smoke-test.mjs` — world-gen, meshing, raycast, physics, items, inventory, crafting, smelting, survival, persistence, mobs.
- `tools/ui-test.mjs` — inventory/crafting interaction logic against a DOM stub.
- `tools/boot-test.mjs` — constructs the **whole game** (renderer, world, UI, entities, audio, touch) against no-op WebGL/DOM stubs and runs ~180 real frames across creative, survival, every container screen, and save/reload, to catch integration errors.

## 📜 License

MIT — see `LICENSE`. Original code and procedurally generated assets only.
