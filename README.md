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
  A health bar sits top right, a red vignette deepens as health drops, and health
  regenerates after a few seconds out of danger. Until rescue arrives in phase 3, nothing
  can take you below 1 HP.
- **Gas:** gases rise and pool under ceilings as a haze, and digging into a pocket hisses.
  Green spore gas (Fungal deep) makes the mole cough and hurts while breathed. Pale
  firedamp (Magma belt) is safe to breathe, but if it touches lava a flash fire runs
  through the whole cloud and burns anyone inside. Blocks are never broken. Water pushes
  gas out of its way, thin gas fades, and gas reaching open sky blows away.
- **Nothing falls:** sand, rock and ceilings stay put however much you dig under them.
- **Gear and falls:** a fall of more than 5 tiles hurts on landing. With rocket boots worn, a
  touch that lands while the mole is in the air fires them: a quick tap gives a short burst
  that brakes a fall hard, and holding keeps them firing (steer with the same drag, or with a
  second finger while the first one moves). A bar beside the mole shows the thrust left; it
  refills on the ground or on a wall. Wear gear from the full pack's gear row, or tap it in
  the fan.
- **Desktop:** arrows or WASD to move and dig, Up or Space to jump. Mouse drag works like
  touch. `` ` `` toggles the debug overlay, `G` the tile grid, `L` darkness, `H` the heat
  map (every tile colored by temperature; the overlay's "heat" button on phones), `[` and `]`
  change pick power, and `P` cycles what a tap pours (nothing, then each fluid: water, lava,
  spore gas, firedamp). The overlay's "tap" button does the same on phones; each tap pours a
  3×3 block.

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
                     fluids, heat, persistence (IndexedDB,
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

**Phase 1, slice 3 (dropped):** falling sand and cave-ins were built, then removed at the
owner's call: nothing in the world falls. Material ids 22 (rubble) and 23 (flowstone) are
retired, and save format v3 drops the per-tile `origin` field they used.

**Phase 1, slice 4 (done):** gas. Gases share the fluid layer (`fluids.json`, `kind: "gas"`):
they rise, spread under ceilings, swap places with liquids, fade when thin, and vanish in
the sky. Reactions can now turn one fluid into another, which is how firedamp touching lava
or flame becomes a short-lived flame that lights the cave. World gen adds sealed spore gas
pockets in the Fungal deep and firedamp pockets in the Magma belt.

**Test spots near spawn** (`?world=test`; spawn is x 96 on the surface, everything is a few
tiles down):

- **Spore gas pocket**, x 87–90: dig down at x 88.
- **Firedamp room with lava behind its east wall**, x 98–103: dig down at spawn to the floor
  (y 30) and tunnel right, so the gas can't escape up your shaft. Then dig the east wall
  from the floor to set it off.
- **Water pocket over lava**, x 124–126: dig down at x 125, then dig the floor under the
  water.

**Phase 1, slice 5 (done; needs the phone run):** simulation zones (`src/sim/zones.ts`).
Chunks within 1 chunk of the mole's chunk run every tick, those out to 3 chunks (about 100
tiles) run every other tick with double steps, and anything further is frozen until you
come back, with no catch-up. The worker keeps the near zone loaded itself, so a flood you
walk away from keeps spreading, and it drops clean chunks once they're frozen and off
screen. Saving now keeps health and breath, flushes when Chrome freezes a background tab,
and shows in the debug overlay whether the browser promised to keep storage, plus the last
save error.

**The 60 fps gate:** tap **bench** in the debug overlay (use the test world: it carves a
40×12 room around you and floods it with water and some lava). After 20 s it shows PASS or
MISS, fps, frame-interval percentiles, slow frames, main-thread work, sim tick cost and the
device. Screenshot that.

**Phase 1, slice 6 (done):** heat (`src/sim/heat/`). Every tile has a temperature in
degrees, and a heat limit of N means melting or burning at N×100°. Ambient temperature
rises with depth (`worldgen.json` `heat.ambient`): about 15–35° down to 1,200 tiles, 70° at
the bottom of the Fungal deep, 160° at the bottom of the Magma belt and 220° at the bottom
of The Deep. Lava (1,000°) and flame (500°) hold their tiles hot. Heat spreads between
tiles at a rate set by both tiles' conductivity (`materials.json`; obsidian insulates,
metals conduct) and slowly leaks back toward ambient, so the air right next to lava sits
around 350–400° and is back near ambient about 6 tiles away. Lava pockets are already hot
when generated. Heat only warns for now: an orange haze from 55°, sweat drops from 80°, a
crackle from 150°, and faint wavy streaks rising through hot air (80° and up) that show
where the heat comes from. Long-press shows a tile's temperature; the overlay shows the
temperature where you stand and what the mole feels. The test world squeezes the same ramp
into its 300 rows (warm below about 190, hot below about 230), and its lava pocket at x
105–106 warms the rock around it. Heat damage, suits, melting and igniting come in phase 2
with fire, torches and furnaces.

**Phase 2, slice 1 (done):** the pack and the modes (`src/game/pack/`, `src/ui/pack/`).
Every dug tile goes into the pack, which is limited by weight only (`tuning.json` `pack`:
capacity 200, raised to 1000 in slice 2). Past capacity you slow down and jump lower, down to 45% at 1.5×, where digging
is blocked. There's no hotbar. The pack button in the bottom-right corner shows the held block
and the mode, with a ring that fills with weight. It is a round window onto an endless strip of
modes (`src/game/pack/modes.ts`: dig shows the pick, build shows the held block): tap it to slide
to the next, or swipe up or down to drag the strip behind it, one for one with your finger. Swipe left for the block
picker fan, swipe left again or hold for the full pack: reorder, hold, discard. In **build
mode** the world is frozen and the whole screen takes touches: tap a tile to place the held
block, or hold anywhere to start a ghost on the tile you're facing, drag it a tile for every tile
of finger travel, and release to place it. The first thing you dig is held automatically. Blocks go
on on-screen tiles the player could reach through open tiles without breaking anything (tinted
blue), and may push fluid out. An undo chip lasts one second and covers only the last block.
Entering build mode stops time with a ring that spreads from the mole and greys the world
behind it (the mole stays in colour, particles hang), and leaving pulls the colour back in. The
block picker is a quarter-circle track of tile icons that scrolls, flicks and settles on an
entry. The fan and the full pack freeze the world too. On desktop, B toggles build mode, U undoes and
Esc returns to dig. Gestures live in the pure `PackGesture` state machine, and
`PackController` ties it to the world. The pack is saved with the player; `placeTile` and
`unplaceTile` are sim messages.

**Phase 2, slice 2 (done):** crafting, the pick, torches and chests (`src/game/craft/`,
`src/data/crafting.json`, `src/sim/torch/`). A third mode, **craft**, sits after build on the
button's strip (hammer icon, gold border) and freezes time. Its sheet has three open slots: tap
pack materials into them, and if they fit a template it shows as a glowing silhouette with its
stats until it has been made once; after that it's listed by name, and a tap refills the slots.
Nothing is known at the start. Crafting uses only the pack. Slice 2 makes torches (a rootwood
shaft plus a fuel; four per craft, burning `fuel × 60` s) and chests (six of a sturdy
material). The pick is always there and never breaks: a stone head on a rootwood handle (power
3, as before). Each tile dug dulls it (tougher heads dull slower), slowing digging up to 60%;
sharpening costs 2 stone, and swapping the head or handle costs 3 or 2 of the new material and
comes sharp. Stats follow design 08 (`tuning.json` `pick`). Torches and chests are held from the
fan like blocks; in dig mode a tap on a reachable tile places them (torches hang on any solid
neighbour, never in liquid; chests need a floor), and build mode places them too. Tap a chest
within 3 tiles to open it beside the pack: tap a stack to move it, hold to pick an amount,
"store all" keeps the held item. A chest holds 5× the pack and can be dug only when empty.
Torches keep their burn steps in the tile's damage byte and go out in water. Chests' contents,
the pick and known recipes are saved with the player (`SAVE_VERSION` 5); `placeTile` carries a
`variant` (the torch's fuel, `PROTOCOL_VERSION` 10). Pack keys for crafted items are in
`src/game/craft/itemKey.ts`.

**Phase 2, slice 4 (done; slice 3, ladders, was dropped):** fire, melting and heat damage
(`src/sim/fire/`). Each second, a tile with fuel (rootwood, coal, glowcap, spore-silk, ember
crystal) that is past its heat limit, or touches a torch, flame or lava, catches fire with a 4%
chance (`tuning.json` `fire`), so fire creeps slowly through a seam. A burning tile is a solid
tile with flame in its fluid layer: that makes it a 500° heat source and a light through the
existing heat and light systems, and it saves with the chunk. It cracks as it burns (the damage
byte) and goes after `fuel × 15` s, leaving a last puff of flame; water beside it puts it out,
and digging it smothers it. Metals (copper, tin, iron, gold, starsilver) past their heat limit
melt into molten metal fluids (ids 6–10), which glow, flow like thick lava and set back into a
block of that metal as soon as their tile is cooler than the melting point; a film thinner than
half a tile cools to nothing. Rock does nothing at its limit. Hot air hurts from 100°, 0.15 hp a
second per degree over (`vitals`), after the haze and sweat warnings; health still stops at its
floor. A burning tile draws as a flickering ember glow with flame tongues that reach into the
open tile above. Tap a torch within 3 tiles in dig mode to take it back: one with at least half
its burn left returns as a fresh torch of its fuel (the fuel is kept in the tile's unused light
byte), a burnt-down one is spent. Torches fade over their last 60 s (`torch.dimSeconds`).
`takeTorch`/`torchTaken` and a `damage` field on tile changes are `PROTOCOL_VERSION` 11; the
save format didn't change.

**Phase 2, slice 5 (done):** gear (`src/game/gear/`). Two new
templates in `crafting.json`: **rocket boots** (casing: 3 of a metal, core: 2 coal or ember
crystal) and the **heat suit** (shell: 4 of clay, stone, slate, mudstone, basalt, obsidian,
elderstone, copper or iron; lining: 2 of spore-silk, rootwood, glowcap or clay). Both keep both
materials on the item: `itemKey` now has a second variant above bit 20, so old torch keys are
unchanged, and templates say which parts they keep with `keeps`. Gear is a new material kind
(numIds 26 and 27, `gearSlot` air or body) that's worn, never placed or held. `Gear` holds one
item per slot and saves with the player (`SAVE_VERSION` 6, `PROTOCOL_VERSION` 12); worn gear
weighs nothing. Boots (`tuning.json` `boots`): thrust = 80 + core fuel × 4 − casing weight × 3
against gravity 50, seconds of thrust = casing toughness × 0.3 (copper and coal: 98, 1.5 s).
`Boots` is the state machine: `PointerGestureInput.onPress` hands it every finger that lands,
and a press in the air is claimed, so it isn't also a tap or a long press. The first touch
cancels 60% of the fall speed, a tap fires for 0.15 s, a hold fires until the meter's empty,
rise is capped at 10 tiles/s, and the meter refills in 0.6 s on the ground, a wall or in a
shaft. Time stopping cuts the boots. Suit (`suit`): the shell raises where heat starts to hurt
by (heat limit − 5) × 20° (stone: safe to 160°, obsidian 200°), and the lining cuts heat and
hot-fluid damage by up to 80%, less the more it conducts (spore-silk 80%, rootwood 64%, clay
48%); the heat warnings move up with it. Falls (`player.fallSafeSpeed`, `vitals.fallSafeTiles`,
`fallDamagePerTile`) are measured from the last moment the mole was held up or moving slower
than 8 tiles/s, so a burst or a wall grab shortens one; past 5 tiles each tile costs 7 hp, with
a heavy thump and a dust burst. The boots draw over the claws with flame jets while firing and
throw exhaust; the suit is an apron in its shell's colour with a stripe of the lining; both
have pack icons. Sounds: ignition, a looping roar, a sputter when empty, a click when the meter
is full, a clank when gear goes on.

Not built yet (later phases): creatures, world traits, the world list,
the service worker/PWA, and cavern camera zoom.
