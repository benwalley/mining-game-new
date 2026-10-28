# Deepkind

A side-view mining sandbox for mobile browsers. The design is in the Deepkind Game Design
Document; this repo is at **phase 0 ("Feel")** of its roadmap, plus basic resume.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` serves on your LAN too (it prints a `Network:` URL). Open that on a phone on
the same Wi-Fi to playtest. The debug overlay is on in dev builds; add `?debug` to show it in
a production build.

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
- **Desktop:** arrows or WASD to move and dig, Up or Space to jump. Mouse drag works like
  touch. `` ` `` toggles the debug overlay, `G` the tile grid, `[` and `]` change pick power.

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
                     persistence (IndexedDB, versioned save format with migrations)
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

## Phase 0 status

Built: the player, a one-tile mole in a miner's helmet, drawn in layers with gear slots (head,
body, back) so armor and packs can be added in `playerSprite.ts` without redrawing the body.
Swipe movement (8-directional, with a dead zone and speed from drag distance), 4-way digging
with auto-assist, coyote time, jump buffering and a variable jump height, shaft climbing,
auto-climbing 1-tile ledges and mantling 2-tile ones, walking on walls and ceilings, persistent 3-stage cracks, debris particles, synthesized
per-material dig sounds, haptics (Android vibration; the iOS 18 switch trick, untested on a
device), camera follow with look-ahead, a flat test world (material bands, pockets, steps, a
gap, caves, a shaft), and instant resume.

Deliberately not built yet (later phases): darkness and light, falling sand, fluids, heat,
gas, cave-ins, the real world generator, inventory, crafting, creatures, the service
worker/PWA, and cavern camera zoom.
