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
| Switch game mode (creative→survival→spectator) | `G` |
| Pause/resume day-night | `T` |
| Render distance | `[` and `]` |
| Debug overlay | `F3` |

## ✨ Features so far

- **Infinite procedural world** — heightmap + mountains, biomes (plains, forest, desert, taiga, snowy, mountains, beach, ocean), worm-style caves, ore distribution by depth, trees (oak/birch/spruce), cacti, flowers and grass.
- **Chunked voxel renderer** — face-culling mesher with **per-vertex ambient occlusion** and directional face shading, separate opaque / cutout / transparent passes, async chunk streaming.
- **100+ blocks** — stones, ores & mineral blocks, dirt/grass/sand, all 16 wool colours, logs/planks/leaves, glass, glowstone, water & lava, plants, functional blocks (crafting table, furnace, TNT, bookshelf) and more — each with a **procedurally drawn original texture**.
- **Build & mine** — voxel raycasting for precise block selection, place/break with collision-safe placement, creative flight, AABB physics & swimming.
- **Day/night cycle** with dynamic sky gradient, sunset tint, and distance fog.
- **Creative inventory** picker, hotbar, crosshair, and an `F3` debug HUD.

## 🗺 Roadmap

- [x] Creative mode (build/fly/infinite world)
- [ ] **Survival**: block hardness & mining times, tool tiers, block drops → inventory, crafting grid & recipes, smelting
- [ ] Health, hunger, fall damage, food
- [ ] Mobs (passive + hostile) with simple AI & pathing
- [ ] Smooth flood-fill lighting (sky + block light)
- [ ] Greedy meshing + frustum culling for higher render distance
- [ ] World save/load (IndexedDB) and seeds UI
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
| `renderer.js` | sky, chunk meshes, selection box |
| `camera.js` / `input.js` / `player.js` | view, controls, physics & interaction |
| `ui.js` | crosshair, hotbar, inventory, HUD |
| `game.js` / `main.js` | main loop, day/night, bootstrap |

`tools/smoke-test.mjs` runs the DOM-free engine headlessly (`npm test`) to validate world-gen, meshing, raycast, physics and texture coverage in CI without a browser.

## 📜 License

MIT — see `LICENSE`. Original code and procedurally generated assets only.
