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

## Phase 2, Hands (not started; wait for the owner's go-ahead)

Planned slices, in order:

1. **Pack and hotbar:** dug material goes into the pack, there are weight and capacity
   limits, a 5-slot hotbar, and the pack sheet. Chests and a first camp may fold in here or
   into slice 2.
2. **Workbench and crafting:** templates, parts and the crafting sheet. Crafting draws from
   chests within about 8 tiles.
3. **Torches and ladders:** the first placeable things.
4. **Fire and melting:** tiles burn or melt at their heat limit (N×100°), and heat starts to
   do damage. Suits may come here too.
5. **Furnace, kiln and quenching:** processing stations and process quality.

Design sections to read: [02](design/02-core-loop.md) (pack weight sets the trip),
[03](design/03-controls.md) (tap to place, hotbar),
[04](design/04-look-sound-ui.md) (UI: pack icon, hotbar, pack sheet),
[07](design/07-materials.md) (weight), [08](design/08-crafting.md),
[09](design/09-building.md).

### Questions to ask before slice 1

Ask these; don't assume the answers.

- **What goes into the pack?** Every dug tile (dirt and stone too), or only useful materials?
  If everything goes in, does dirt fill the pack quickly?
- **How capacity works.** By weight only (the doc says weight defines the trip), or by slots
  plus weight? What happens when the pack is full: you slow down (the doc says it bulges and
  slows), dug tiles drop as items, or they're simply lost?
- **Items in the world.** Do dropped items lie on the ground to be picked up, or does
  everything go straight into the pack?
- **The hotbar in slice 1.** What can it hold: placeable blocks (dig dirt, place it back),
  tools, or nothing usable yet? Placing tiles means tap-to-place arrives now.
- **The pack sheet.** Should it pause the game (the doc says yes), and can you drop or
  discard items from it?
- **Chests and camp.** Do they belong in slice 1 or slice 2?
