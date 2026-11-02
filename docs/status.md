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
- **No hotbar.** The corner fan replaces it, and any block in the pack can be placed. The
  gestures are in [design 03](design/03-controls.md) and the HUD in
  [design 04](design/04-look-sound-ui.md), both under "Decided since".
- **Pausing:** the fan and the full pack both pause the game. Aiming a ghost block from the
  paused fan stays paused, so you can build in frozen time. That's intended, not a bug.
- **The full pack** is a full-screen, scrollable list of everything carried, with weights.
  You rearrange items there, and the fan follows that order. New items go at the end, and
  the game never reorders anything. You can discard a stack or part of one. Inspecting an
  item happens here, since long-press in the fan starts a ghost.
- **Chests and the first camp** move to slice 2.

Starting numbers are in `tuning.json` under `pack` and `placing` (not yet confirmed by the
owner): capacity 200 weight (about 66 dirt or 33 stone); no slowdown up to the limit, then speed
and jump height fall in a straight line to 45% at 1.5× capacity; at 1.5× digging is blocked
until you make room, with a "pack full" thud and buzz.

Save and protocol: the pack and its order are saved (bump `SAVE_VERSION`, old saves start
with an empty pack), and dig and place messages change (bump `PROTOCOL_VERSION`). Placing
while paused means the sim has to accept place messages while paused.

### What slice 1 left out, for the owner's check

- **Not tried on a real phone.** It was checked in the browser pane (one real tap, the rest
  through the gesture code) and by tests. Please playtest the swipe, hold and drag feel, and
  the numbers in `placing` (hold time, 28 px per tile, fan radius).
- **The full pack reorders with up and down buttons,** not by dragging. Inspect shows only the
  count and weight; properties come with discovery.
- **Placing from the fan closes it and resumes the game,** so building several blocks in
  frozen time means reopening the fan each time. Tap to place carries on once it resumes.
- **The fan scrolls by dragging along the arc,** with no flick momentum. No keyboard shortcut
  for the fan on desktop yet.
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
  chests and workbenches exist, do they sit in the same fan, or in a section of it?
- **Slice 1 feedback.** What the owner found when playtesting the fan on a phone: the numbers
  in `placing`, and whether the full pack needs drag to reorder.
