## 8. Crafting

Crafting is the center of the game. Every item is a **template** (the shape of the thing) filled with **materials** (what it's made of), and the item's stats are calculated from those materials' properties. A handful of templates times the material list produces hundreds of distinct items, and players can make combinations the designer never listed.

### Rules that keep crafting fun

1. **Every crafted thing matters.** No filler items that exist only to be ingredients in other items.
2. **Trade-offs, not ladders.** A better material is better at something and worse at something else. There is no single best pick.
3. **Crafting happens in the world.** Smelting needs a real furnace with real heat; quenching needs a real pool. Crafting is never a detached menu fetch quest.
4. **Knowledge is treasure.** New templates and techniques are found, taught or figured out, not handed over in a recipe list.
5. **Stats are visible.** The crafting sheet always previews the result against what the player has now.

### Templates

The player starts knowing the four templates marked Start. The rest come from discovery (below).

| Template       | Parts                 | What it does                                                 | Source    |
| -------------- | --------------------- | ------------------------------------------------------------ | --------- |
| Pick           | Head, handle, binding | Digging                                                      | Start     |
| Torch          | Shaft, fuel           | Light that burns out                                         | Start     |
| Ladder         | Rails, rungs          | Climbing                                                     | Start     |
| Support beam   | Beam                  | Holds ceilings up                                            | Start     |
| Pack           | Body, straps          | Carry capacity                                               | Discovery |
| Lantern        | Housing, lens, fuel   | Lasting light; lens widens the beam                          | Discovery |
| Suit           | Shell, lining         | Resistance to heat, cold or gas, by material                 | Discovery |
| Rope and winch | Line, drum            | Fast vertical travel; first elevator                         | Discovery |
| Pump and pipe  | Body, seal            | Moves water and lava                                         | Discovery |
| Rail and cart  | Rail, wheels, bed     | Hauls heavy loads over distance                              | Discovery |
| Drill          | Bit, housing, fuel    | Fast digging, burns fuel                                     | Discovery |
| Charge         | Casing, filler        | Blasts rock (volatile filler only)                           | Discovery |
| Gift box       | Box, contents         | Wraps a gift; presentation raises its value to some cultures | Teaching  |

### Stat formulas (example: the pick)

Each template has a few formulas like these. They live in data, so balance can change without code changes.

```latex
\text{dig power} = \text{head hardness}
```

```latex
\text{swing time} = 0.4\,s \times \left(1 + \frac{\text{head weight} + \text{handle weight}}{20}\right)
```

```latex
\text{durability} = 40 \times \min(\text{head toughness},\ \text{binding toughness})
```

A tile can be dug only if dig power is at least the tile's hardness minus 1, so tool upgrades gate access to deeper layers. Material traits add effects: a glowing head lights the tile being dug, an insulating handle stops heat damage while digging near lava.

### Processing stations

Stations are placed blocks in the world, and they use the real simulation. A furnace burns fuel and heats the tiles around it.

| Station         | Does                                                     | Uses from the sim                             |
| --------------- | -------------------------------------------------------- | --------------------------------------------- |
| Workbench       | Shapes materials into parts and assembles templates      | Nothing; always works                         |
| Furnace         | Smelts ore into ingots, sand into glass, clay into brick | Fuel burn and its own temperature             |
| Quench pool     | Hardens hot metal                                        | A pool of water (or another fluid) next to it |
| Kiln            | Fires clay molds and bricks                              | Heat; can sit beside lava instead of fuel     |
| Colony stations | Unique techniques (glassblowing, brewing, rune-binding…) | Only usable with a colony's permission        |

### Process quality

How something is processed changes the result, without minigames:

- **Smelting temperature:** each ore has an ideal heat band. Too cold wastes fuel and time; in the band gives a full ingot; too hot loses some material. A hotter furnace (better fuel, insulated walls, next to lava) reaches higher bands.
- **Quenching:** quenching hot metal in water raises toughness. Other fluids (oil, slime) give different effects players can discover.
- **Heat sources:** building a forge next to a lava flow is a real strategy. So is the risk that comes with it.

### Alloys

Melting two metals together in a furnace makes an alloy. Its properties are the average of the two, weighted by amounts. Some pairs also produce a **bonus trait**, and which pairs do so is generated from the world seed. Bronze-like alloys might be great in one world and ordinary in the next, so alloy discovery stays fresh.

### How players discover templates and techniques

- **Teachings:** creatures teach templates and techniques as bonds grow (section 11). This is the main source.
- **Schematics:** ruins hold schematic fragments; collecting all pieces of one unlocks it.
- **Insight (Should):** using materials in the world sparks ideas. After carrying quartz and a light source together for a while, the journal notes "this stone bends light" and the lantern template appears. Insights tie discovery to play instead of menus.

### Wear and repair

Tools and suits wear with use. Repairing needs some of the original material at a workbench. Wear is a steady material sink that keeps mining valuable. Broken items return some of their materials.

### Crafting sheet

1. Pick a template from the known list.
2. Each part slot shows which materials fit (from the pack and nearby storage).
3. As materials are chosen, the result's stats preview live, with up and down arrows against the currently equipped item.
4. Confirm to craft. If a station is needed and not nearby, the sheet says which one.

Crafting from nearby storage chests (within about 8 tiles) is required. Making players shuffle items to their pack first is tedium.

> **Decided since (owner, 2026-11-02):** crafting happens anywhere through a **craft** mode
> on the pack button, which freezes time, but only simple things can be made anywhere. Better
> things need special places found in the world (creature cities, forges) or special
> equipment. There is no workbench yet. Recipes aren't listed up front: the sheet has open
> slots, and putting materials in that fit a template shows it (as a silhouette until it's
> been made once). Once made, a template is remembered. Parts aren't items; each slot takes
> one material. Crafting uses only the pack, never nearby chests. The pick never breaks:
> there is always one, it dulls with digging (slower digging, up to a limit), and in craft
> mode it can be sharpened for a little stone or have a part swapped for a new material.
> Details and numbers are in [`docs/status.md`](../status.md).
