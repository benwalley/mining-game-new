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

## Phase 2, Hands (slices 1 and 2 done; slice 3 dropped; slice 4 built, waiting for the owner's check)

Planned slices, in order:

1. **Pack and corner fan (done):** dug material goes into the pack, there's a weight limit, a corner
   fan replaces the hotbar, and blocks can be placed. Decisions are below.
2. **Crafting, chests and torches (done):** a craft mode, the pick (upgrade and sharpen), chests and
   torches. No workbench and no camp yet. Decisions are below.
3. **Ladders (dropped):** see "Decided before slice 4" below.
4. **Fire and melting (built, not yet checked):** tiles burn or melt at their heat limit (N×100°), and heat starts to
   do damage. Torches can be dug back up and dim near the end.
5. **Gear:** rocket boots, a parachute and the heat suit, with a place to wear them.
6. **Furnace, kiln and quenching:** processing stations and process quality.

### Decided before slice 4 (owner, 2026-11-02)

- **No ladders and no ropes.** The mole already climbs one-wide shafts and clings to any wall
  or ceiling, so they would add little. Vertical movement should come from cooler gear instead:
  **rocket boots and parachutes**, in a later slice (not yet placed in the plan). The ladder
  and rope templates are gone from the design.
- **Burning:** things that burn (fuel above 0: rootwood, coal, glowcap, spore-silk, ember
  crystal) catch fire past their heat limit and spread **very slowly**.
- **Melting:** metals past their heat limit become **molten metal**, a glowing liquid that
  flows and sets back into a block of that metal when it cools.
- **Rock** does nothing at its heat limit in this slice, so lava doesn't eat its walls.
- **Heat damage** starts at 100° and gets worse the hotter it is; touching flame or lava
  hurts a lot. Health still stops at its floor (no dying yet). The warnings come first.
- **Suits wait** for slice 5, the gear slice, with rocket boots and a parachute. The furnace
  slice moves to 6.
- **Torches** can be dug back up (into the pack, keeping the burn time left) and dim over
  the last part of their burn. No flicker.
- **The slice 2 numbers are fine** (recipes, pick dulling, sharpening, torch burn times).

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
  is frozen; tap a tile to place, hold anywhere to start a ghost on the facing tile and drag it; undo lasts one second
  and covers only the last block). The pack button is a window onto an endless strip of modes
  (the pick for dig, the held block for build): a tap slides to the next, and an up or down
  swipe drags the strip behind it; swipe left for the block picker fan. A block can go on any
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
- **No haptics are assumed** (the owner's phone has none): every cue also has a sound or a
  visual. Swiping down from the control button has little room at the bottom of the screen,
  which is fine with two modes since up wraps.
- **Build mode doesn't pan,** so building further means leaving it and walking.
- **Left-handed mirroring** (a Could) isn't built.

### Decided for slice 2 (owner, 2026-11-02)

- **Crafting happens anywhere, but only simple things.** Better things need special places
  found in the world later (creature cities, forges); rocket boots or x-ray vision need
  special equipment. What you can make should make sense for where you are.
- **Craft mode** is a third mode on the control button (dig → build → craft). It opens the
  crafting sheet and freezes time, like build mode.
- **No workbench in this slice.** Craft mode works anywhere for the simple set.
- **Recipes are stumbled on.** You can make anything your place and abilities allow, even
  without knowing it. The sheet has open slots: put materials in, and if they fit a template
  that can be made here, its silhouette and stats appear and you can craft it. Once made, a
  template is remembered and listed by name, and the sheet fills its slots next time. You
  don't start knowing everything. Parts aren't items: you pick a material per slot and craft
  in one step.
- **Slice 2 crafts the pick, the chest and the torch.**
- **The pick:** you always have one; picks don't break. You start with a stone head and wood
  handle, which digs like today (power 3). Digging slowly dulls it, so dig time goes up to a
  limit. In craft mode, **sharpen** costs a little stone and restores it, and **upgrade**
  swaps a part's material (a harder head digs harder rock) using that material, through the
  pick's stat formulas in design 08.
- **Torches** are shaft plus fuel. They light the area through the existing light system and
  burn out after a time set by the fuel.
- **Placing items:** torches and chests are held from the same fan as blocks. In **dig mode**
  a tap on a reachable tile places the held torch or chest. With a block held, a tap in dig
  mode still does nothing; blocks are placed in build mode as before.
- **Chests** have their own weight limit, a few times the pack's (start at 5×). Tap a chest
  in reach in dig mode to open a paused sheet with the pack on one side and the chest on the
  other: tap a stack to move it across, hold to choose an amount, and "store all" moves
  everything but the held item. A chest can be dug only when empty (otherwise it thuds and
  shows a lock); then it goes back into the pack.
- **Crafting uses only the pack,** never chests. Chests just hold things. This overrides the
  design doc's "crafting reads from chests within about 8 tiles".
- **The pack gets bigger:** capacity goes from 200 to 1000 weight.
- **No camp yet.** A new world starts with nothing placed.
- **Slice 1 feedback:** the `placing` numbers are fine, and up and down buttons for
  reordering the full pack are fine.

### What slice 2 built, and choices made for the owner to check

The README's Status section has the detail. Choices made without asking, to overrule freely:

- **Recipes** (`src/data/crafting.json`): a torch is a rootwood shaft plus one fuel (coal,
  rootwood, glowcap, spore-silk or ember crystal) and makes 4; a chest is 6 of rootwood, stone,
  clay, slate, mudstone, copper or iron. Torches of different fuels stack apart ("Torch (coal)").
- **The pick** (`tuning.json` `pick`): power is head hardness − 1, so the stone head digs like
  the old power 3. Speed comes from head plus handle weight, against the starting pick. Wear
  per tile is 0.01 ÷ head toughness (stone: fully dull after 500 tiles), and full dullness
  makes digging 60% slower. Sharpen costs 2 stone; a new head costs 3, a new handle 2, and the
  old part isn't returned. Heads take stone and harder rock, metals and crystals; handles take
  rootwood and metals. Binding (design 08) is left out for now. The dig button's pick turns
  grey with an orange sharpness bar once it's a quarter dull, and a message says to sharpen.
- **Torches** (`tuning.json` `torch`): burn `fuel × 60` s (rootwood 5 min, coal 9 min), light
  level 12, go out in liquid with a fizzle and smoke. Placed in dig or build mode; they hang on
  any solid neighbour and the player can stand in them. They can't be picked up again.
- **Chests** (`tuning.json` `chest`): hold 5000 weight, open within 3 tiles, need a floor.
  Their contents live with the pack on the main thread and save with the player, not in the
  sim, so moving things is instant. The design rule that crafting reads nearby chests is off,
  per the owner.
- **Discovery**: an unknown match shows as a glowing grey silhouette, "Something new…", with
  its stats and cost; making it shows "New recipe: …" and a chime.

Not checked: none of it on a phone. In the browser pane, crafting a chest from clay, placing
it from the fan with a tap, opening it, "store all", and the locked-dig message all worked.
The torch sprite and its light were not seen in the browser (no coal turned up); tests cover
placing and burning out. No flicker animation on torches yet.

### What slice 4 built, and choices made for the owner to check

The README's Status section has the detail. Choices made without asking, to overrule freely:

- **How fire starts and spreads:** a tile with fuel catches when it's past its heat limit **or
  touches** a torch, flame or lava, with a 4% chance each second. Touch counts because lava
  barely conducts: a lava tile only warms its neighbour to about 225°, so wood (300°) beside
  lava would otherwise never light. A coal seam burns along at roughly a tile every 25 s. A
  torch hung on coal will set it alight; a torch isn't a heat source itself (the mole can stand
  in a torch tile, and a hot torch would burn it).
- **Burn times:** `fuel × 15` s (coal about 2 minutes, rootwood about 1.5). Water next to a
  burning tile puts it out; digging a burning tile smothers it and gives you the material.
- **Molten metal** sets the moment its tile is below the melting point, so it drips a tile or
  two out of the heat and hardens there. Less than half a tile of it cools to nothing. It hurts
  like lava (40 hp/s) and glows.
- **Heat damage:** 0.15 hp per second for each degree over 100°: about 9/s at the bottom of
  the Magma belt (160°) and 18/s in The Deep (220°). Those depths are now hostile until suits.
- **Taking a torch back:** a tap in dig mode within 3 tiles. With at least half its burn left
  it comes back as a fresh torch of its fuel; otherwise it's spent and gone. The pack can't
  hold a part-burnt torch, so this rounds instead of keeping the exact time left.
- **Dimming:** a torch's light fades over its last 60 s, whatever its fuel.

Not checked: none of it on a phone, and **not seen in the browser either**: the burning-tile
art (flickering glow and flame tongues), the molten-metal colours and the new sounds were only
type-checked. Tests cover catching, spreading slowly, burning out, dousing, melting and
setting, thin films, rock staying put, heat damage, and taking torches back.

### Questions to ask before slice 5 (gear)

- Rocket boots: what powers them (fuel from the pack, a recharge, unlimited?), how they're
  worn and switched on with one thumb, and how strong they are.
- The parachute: does it open by itself on a long fall, or with a gesture? Does it wear out?
- The heat suit: shell and lining from design 08, and how much it cuts heat damage.
- Where gear is worn: a gear row in the full pack, or a fourth mode?
- The slice 4 choices above: fire spread speed, heat damage numbers, torch take-back rule.
