## 16. Technical architecture

The game is a static web app that runs fully offline: simulation in a Web Worker, rendering and input on the main thread, and all saves in IndexedDB. The stack below is a recommendation; the developer should adjust it to what they know best.

### Recommended stack

| Area                | Recommendation                          | Why                                                                                                 |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Language and build  | TypeScript, Vite                        | Typed data for a complex simulation; fast builds                                                    |
| Rendering           | Canvas 2D or WebGL2 with a tile atlas   | Simple pixel art needs little; cache each chunk to an offscreen canvas and redraw only dirty chunks |
| Simulation          | A dedicated Web Worker                  | Keeps input and rendering smooth while the world updates                                            |
| Storage             | IndexedDB                               | Large structured local data; works offline                                                          |
| Offline and install | Service worker + web app manifest (PWA) | Plays without a network; can be installed to the home screen                                        |
| Randomness          | One seeded PRNG library used everywhere | Reproducible worlds and bugs                                                                        |

### Threads

- **Main thread:** touch input, camera, rendering, UI sheets, audio.
- **Simulation worker:** world generation, tile simulation, creatures, colonies, storyteller, saving.
- Communication is by messages with transferable typed arrays. SharedArrayBuffer is an option for chunk data, but it requires cross-origin isolation headers on the host, so confirm hosting supports them first.

### Timing and performance

- Target 60 fps rendering on a mid-range phone.
- Simulation runs on a fixed timestep (about 20 ticks per second for the active zone), independent of frame rate. Rendering interpolates movement between ticks.
- Pause the simulation when the page is hidden, and save at that moment.
- Profile on real devices early: one mid-range Android phone and one iPhone, in the browser and installed as a home-screen app.

### Data layout

- **Chunk:** 32×32 tiles; each field (material, damage, fluid, temperature, light, flags) is its own typed array. Chunks track a dirty rectangle and a sleeping flag.
- **Entities:** player, creatures and critters in flat arrays keyed by id, with components for position, needs, memory and inventory.
- **Content data:** materials, templates, formulas, species archetypes, world traits and teachings all live in versioned JSON files.

### Saving

IndexedDB object stores:

| Store    | Key                  | Contents                                                       |
| -------- | -------------------- | -------------------------------------------------------------- |
| meta     | world id             | Seed, traits, version, play time, last-saved time              |
| chunks   | world id + chunk x,y | Tile arrays for every chunk that has been generated or changed |
| entities | world id + entity id | Creatures, critters, player state                              |
| colonies | world id + colony id | Stockpiles, needs, relations                                   |
| journal  | world id             | Discoveries, bonds, debts, ambitions, milestones               |

- Save dirty chunks and changed entities every few seconds, and on the page's hide and close events.
- Unchanged chunks never need saving; they can be regenerated from the seed.
- Version every save and write migrations, since content data will keep changing.
- Request persistent storage so the browser is less likely to clear saves. Browsers may still clear site data under some conditions (Safari in particular has limits for sites that aren't used regularly), so verify current behavior, and offer save export and import to a file (Should) as a backup.
- Support several worlds side by side; the world list is the only menu screen.

### Coming back after time away

On load, compute the real time elapsed and run abstract colony ticks for it, capped at the equivalent of about one in-game day. Generate the "while you were gone" summary from the changes. Never resolve tile-level hazards during catch-up.
