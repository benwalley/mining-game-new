# Deepkind

A side-view mining sandbox for mobile browsers. The design is in the Deepkind Game Design
Document. Phase 0 ("Feel") is done; **phase 1 ("Living rock")** is being built in slices.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` serves on your LAN too (it prints a `Network:` URL). Open that on a phone on
the same Wi-Fi to playtest. The debug overlay is on in dev builds; add `?debug` to show it in
a production build. The game opens the real generated world; add `?world=test` to play the
flat test world instead (each keeps its own save).

| Script           | Does                                       |
| ---------------- | ------------------------------------------ |
| `npm run dev`    | Dev server with hot reload                 |
| `npm run build`  | Typecheck, then production build in `dist` |
| `npm test`       | Unit tests (Vitest)                        |
| `npm run lint`   | ESLint                                     |
| `npm run format` | Prettier                                   |

## Controls

- **Touch:** drag anywhere and hold. The direction from where your finger landed sets the
  move direction, and the distance sets the speed (12 px dead zone, full speed at 60 px).
  Push into a solid tile to dig it. Drag up to jump, or to climb inside a 1-wide shaft. 1-tile
  ledges are climbed automatically, and a jump that reaches the top row of a 2-tile ledge pulls
  you onto it. Lift to stop. Long-press a tile to inspect it in the debug overlay.
- **Walls and ceilings:** drag diagonally up into a wall (up-right against a wall on your
  right) to walk up it. Straight up or down walks along it, and straight into it digs. Under a
  ceiling, an up-diagonal walks along it and straight up digs. Corners work going up: at a
  wall's top inner corner, turn up-and-away to step onto the ceiling, and walking off a
  ceiling's edge carries you around it onto the wall above. Lift your finger and the mole
  starts losing grip (it trembles and slides); it only falls after about a second, so you can
  re-grab. Half-dug tiles keep their cracks, so you can come back and finish them.
- **Water and lava:** in fluid the mole swims. Let go and it sinks slowly, drag to swim
  that way, and holding up at the surface hops you out onto the bank. Breath bubbles appear
  while your head is under; when they run out you start drowning. Lava burns on contact.
  Health shows top right when hurt, with a red vignette, and regenerates after a few seconds
  out of danger. Until rescue arrives in phase 3, nothing can take you below 1 HP.
- **Falling sand:** dig under sand and it slips for a moment, then the whole column falls.
  Anything landing on the mole hurts and pops it out on top. Ceilings don't collapse for
  now (see Status).
- **Desktop:** arrows or WASD to move and dig, Up or Space to jump. Mouse drag works like
  touch. `` ` `` toggles the debug overlay, `G` the tile grid, `L` darkness, `[` and `]`
  change pick power, and `P` cycles what a tap pours (nothing, water, lava). The overlay's
  "tap" button does the same on phones; each tap pours a 3×3 block.

## Architecture

```
src/
  main.tsx           Boot: spawns the sim worker, starts the Game, mounts the Preact UI
  app/               Game (composition root) and the fixed-timestep GameLoop
  core/              Pure, thread-agnostic building blocks
    random/          Seeded PRNG + coordinate hashing (the only randomness allowed)
    world/           Chunk data (struct-of-typed-arrays), ChunkStore, DirtyRect
  content/           Typed loaders for the JSON in data/
  data/              ALL tunable numbers and content: materials, palette, tuning, test world
  protocol/          Typed main <-> sim messages and the SimClient
  sim/               Runs in a Web Worker: SimHost (authoritative world), world generation,
                     fluids, falling solids and cave-ins, persistence (IndexedDB,
                     versioned save format with migrations)
  game/              Main-thread gameplay: player movement, digging, camera, chunk mirror
                     and streaming
  input/             Pointer (swipe) and keyboard input
  render/            Renderer interface + Canvas 2D implementation (chunk cache, atlas)
  fx/                Cosmetic particles
  feedback/          Synthesized audio, haptics, and the event -> feedback mapping
  ui/                Preact overlay: boot screen, debug panel, signals-based stores
```

How the pieces fit:

- **Threads.** The sim worker owns the world: it generates chunks, loads and saves them, and
  validates player actions. The main thread keeps a mirror of nearby chunks for collision and
  rendering. Player movement and digging run on the main thread, so input is never queued
  behind simulation work. A dig is applied to the mirror at once and confirmed by the worker,
  whose answer is authoritative. `SimHost` doesn't touch worker globals, so it runs in tests,
  and could later sit behind another transport.
- **Events.** Gameplay emits typed events (`digHit`, `tileBroken`, `landed`...).
  `FeedbackDirector` turns them into sound, haptics and particles. Gameplay code never calls
  audio or particles directly.
- **Rendering.** Each chunk is cached to a 512×512 source-resolution canvas, and only its
  dirty rectangle is redrawn. The frame is drawn at a whole-number pixel scale. Tiles are
  generated in code by `TileAtlas.generate`. `TileAtlas.fromImage` accepts a PNG with the
  same layout when real art arrives.
- **Saving.** Dirty chunks, the player and world meta are written to IndexedDB in one
  transaction every 3 s, and when the page is hidden or closed. Unchanged chunks are never
  saved, because they regenerate from the seed. If IndexedDB can't open, the game falls back
  to memory and reports an error. `SaveStore` is the seam for future cloud sync.

## Conventions

- **No `Math.random()`.** Lint enforces this. Use `createRng`/`hash2` from
  `src/core/random/rng.ts`. World generation must not depend on the order chunks are generated
  in, so it uses coordinate hashing.
- **Numbers live in `src/data/`, not in code.** That covers materials, tuning, palette and the
  test world layout.
- **Material `numId`s are persisted.** Never change or reuse one.
- **Save format changes:** bump `SAVE_VERSION` in `src/sim/persistence/saveFormat.ts` and add
  a migration. Changing `src/data/test-world.json` automatically discards saved test worlds,
  because the generator id includes a hash of the config.

## Status

**Phase 0 (done):** the player, a one-tile mole in a miner's helmet, drawn in layers with gear
slots (head, body, back) so armor and packs can be added in `playerSprite.ts` without redrawing
the body. Swipe movement (8-directional, with a dead zone and speed from drag distance), 4-way
digging with auto-assist, coyote time, jump buffering and a variable jump height, shaft
climbing, auto-climbing 1-tile ledges and mantling 2-tile ones, walking on walls and ceilings,
persistent 3-stage cracks, debris particles, synthesized per-material dig sounds, haptics
(Android vibration; the iOS 18 switch trick, untested on a device), camera follow with
look-ahead, a flat test world, and instant resume.

**Phase 1, slice 1 (done):** the real world, 384 × 3,000 tiles: six depth layers (topsoil,
stone, crystal caverns, fungal deep, magma belt, the Deep) with wavy, dithered boundaries,
per-layer deposits and ores, winding tunnels, pockets and big caverns, generated
deterministically from the seed (`src/data/worldgen.json`). Light spreads tile by tile from the
sky, glowing materials and the helmet lamp; underground is dark beyond the lamp.

**Phase 1, slice 2 (done):** water and lava (`src/data/fluids.json`). The fluid layer (0–8
per tile) is a cellular automaton in the worker at 20 ticks/s. Fluid falls, then levels out
sideways (no pressure). Lava moves on one tick in four, and lava touching water hardens into
obsidian with a hiss. Only awake tiles are simulated, so a settled lake costs nothing. The
worker sends changed rectangles to the main thread, which draws fluids each frame and lets
lava glow. World gen adds sealed aquifers, lakes and lava lakes (`pools` in `worldgen.json`),
each wrapped in a rock shell so it starts still. The test world has a surface pond, a sealed
aquifer, and an aquifer above a lava basin for a waterfall test. The player swims, has breath
and health, and gets hurt by lava and drowning (never below 1 HP).

**Phase 1, slice 3 (done, cave-ins switched off):** falling sand (`src/sim/solid/`). Nothing
is scanned every tick: a dig or a fall queues checks for the tiles it could affect. Ceiling
collapse is built but off (`support.ceilingsCollapse` in `tuning.json`), because one dig
through a cavern wall could bring the whole cavern down. When it's on: a ceiling tile holds
if it is within its material's span of a resting tile along its row (`support.ts`). Failing
ceilings creak, shed dust and crack for 2.5 s, then fall as rubble that remembers its origin
material (a per-tile `origin` field, save format v2). The matching world-gen support pass,
with flowstone ceilings and natural columns, is off too (`support.enabled` in
`worldgen.json`). The test world has a wide flat dirt room (x 100–113, y 34–36) for trying
it.

**Phase 1, still to come:** heat and gas; simulation zones (fluids and solids run in every
loaded chunk for now) and full saving.

Not built yet (later phases): inventory, crafting, creatures, world traits, the world list,
the service worker/PWA, and cavern camera zoom.
