# Where the build stands

Update this at the end of every slice: what's done, what's next, and the questions to ask
before starting it. The README's Status section has the detail on what each finished slice
built.

## Done

- **Phase 0, Feel:** movement, digging, the mole, feedback, resume.
- **Phase 1, Living rock:** world gen and light (slice 1), water and lava (2), gas (4),
  simulation zones and save hardening (5), heat with warnings only (6). Slice 3, falling sand
  and cave-ins, was built and then removed: nothing in the world falls.

## Outstanding from phase 1

- **The 60 fps phone run.** The owner still needs to run **bench** in the debug overlay on a
  phone (test world) and send the screenshot. Phase 1's gate isn't formally passed until then.

## Phase 2, Hands (slice 1 done; wait for the owner's go-ahead on slice 2)

Planned slices, in order:

1. **Pack and corner fan (done):** dug material goes into the pack, there's a weight limit, a corner
   fan replaces the hotbar, and blocks can be placed. Decisions are below.
2. **Workbench and crafting:** templates, parts and the crafting sheet. Crafting draws from
   chests within about 8 tiles. Chests and the first camp come in this slice too.
3. **Torches and ladders:** the first placeable things.
4. **Fire and melting:** tiles burn or melt at their heat limit (N×100°), and heat starts to
   do damage. Suits may come here too.
5. **Furnace, kiln and quenching:** processing stations and process quality.

Design sections to read: [02](design/02-core-loop.md) (pack weight sets the trip),
[03](design/03-controls.md) (placing, the corner fan),
[04](design/04-look-sound-ui.md) (UI: pack button, fan, full pack),
[07](design/07-materials.md) (weight), [08](design/08-crafting.md),
[09](design/09-building.md).

### Decided for slice 1 (owner, 2026-11-02)

- **The pack:** every dug tile goes straight into the pack, dirt and stone too. No items lie
  in the world. You can carry any number of kinds; only total weight limits you.
- **Capacity is weight only,** using each material's weight. Past the limit you can still
  dig; the pack bulges and you slow down.
- **No hotbar, and two modes.** The game has **dig** (the world runs) and **build** (the world
  is frozen; tap a tile to place, hold to aim a ghost above the finger; undo lasts one second
  and covers only the last block). The pack button cycles modes on a tap and scrubs through
  them on an up or down swipe; swipe left for the block picker fan. A block can go on any
  on-screen tile the player could reach through open tiles without breaking anything, and may
  push fluid out. The gestures are in [design 03](design/03-controls.md) and the HUD in
  [design 04](design/04-look-sound-ui.md), both under "Decided since". The mode list is
  `src/game/pack/modes.ts`, so a third mode is one entry.
- **Pausing:** build mode, the fan and the full pack all freeze the world. Freezing time to
  build (catching a fall with a platform) is intended, not a bug.
- **The full pack** is a full-screen, scrollable list of everything carried, with weights.
  You rearrange items there, and the fan follows that order. New items go at the end, and
  the game never reorders anything. You can discard a stack or part of one. Inspecting an
  item happens here.
- **Chests and the first camp** move to slice 2.

Starting numbers are in `tuning.json` under `pack` and `placing` (not yet confirmed by the
owner): capacity 200 weight (about 66 dirt or 33 stone); no slowdown up to the limit, then speed
and jump height fall in a straight line to 45% at 1.5× capacity; at 1.5× digging is blocked
until you make room, with a "pack full" thud and buzz.

Save and protocol: the pack and its order are saved (`SAVE_VERSION` 4, old saves start with
an empty pack). `placeTile` and `unplaceTile` (undo, which restores the fluid) are sim
messages (`PROTOCOL_VERSION` 9), and the sim accepts them while paused. The mode isn't saved.

### What slice 1 left out, for the owner's check

- **Not tried on a real phone.** It was checked in the browser pane (real taps and clicks, the
  rest through pointer events and the gesture code) and by tests. Please playtest the swipes,
  the hold and the ghost, and the numbers in `placing` (hold times, mode step, fan radius and
  arc, ghost offset, undo time).
- **The full pack reorders with up and down buttons,** not by dragging. Inspect shows only the
  count and weight; properties come with discovery.
- **The fan scrolls by dragging along the arc,** with no flick momentum. Scrubbing down has
  little room at the bottom of the screen, which is fine with two modes since up wraps.
- **Build mode doesn't pan,** so building further means leaving it and walking.
- **Left-handed mirroring** (a Could) isn't built.

### Questions to ask before slice 2

Ask these; don't assume the answers. Read [design 08](design/08-crafting.md) and
[09](design/09-building.md) first.

- **The workbench.** Is it a placed object you stand near, or a tab of the pack? How big is the
  starting recipe set, and how are recipes learned (known from the start, or found)?
- **Chests and the first camp.** What does a chest hold (its own weight limit, or none)? Does
  the camp (bed, chest, light) exist from the start of a new world, and where?
- **Crafting from chests within about 8 tiles.** Does it take from the pack first or the chests
  first, and does the sheet show both?
- **Placeable things beyond blocks.** The fan only holds materials for now. When items such as
  chests and workbenches exist, do they sit in the same fan, or in a section of it, and does
  placing them need build mode?
- **Slice 1 feedback.** What the owner found when playtesting the fan on a phone: the numbers
  in `placing`, and whether the full pack needs drag to reorder.
