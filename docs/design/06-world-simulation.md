## 6. World simulation

The simulation is where the CPU budget goes. It runs on a small set of consistent rules that all read the same material properties (section 7). There should be almost no special cases: if water puts out fire in one place, it does everywhere.

### Per-tile state

Each tile stores: material id, damage (crack stage), fluid type and amount (0–8), temperature, light level, and a few flags (natural vs placed, supported, wet). Store each field as a typed array per chunk.

### Rules

| System             | Rule                                                                                                                                                         | Player-facing result                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Fluids             | Water and lava flow down first, then spread sideways, leveling out. Amounts are 0–8 per tile.                                                                | Breaching an aquifer floods tunnels. Pumps and walls redirect it.                         |
| Fluid mixing       | Water touching lava turns the lava to obsidian and the water to steam.                                                                                       | Players make obsidian on purpose, or seal lava with water.                                |
| Heat               | Temperature diffuses between tiles at a rate set by conductivity. Ambient temperature rises with depth; lava, fire and furnaces are sources.                 | Depth gets hot. Furnaces really heat rooms. Materials melt or ignite at their thresholds. |
| Gas                | Gases are lighter than air: they rise, pool under ceilings, and drift through openings. Some are toxic, some flammable.                                      | Digging into a gas pocket is a hazard. Flammable gas plus a flame explodes.               |
| Falling materials  | Sand and gravel fall when unsupported; loose rubble too.                                                                                                     | Digging under sand is risky; sand can be used to fill holes.                              |
| Structural support | Each solid tile passes support to neighbors. A ceiling span longer than the material's support span starts to fail: dust, creaks, then collapse into rubble. | Big rooms need supports. Cave-ins are telegraphed, never instant.                         |
| Light              | Light spreads tile by tile from sources and fades with distance; solid tiles block it.                                                                       | Darkness hides hazards. Some creatures avoid light; fungi grow in the dark.               |
| Ecology            | Fungus spreads on damp dark tiles. Critters wander, eat, breed and are eaten by predators.                                                                   | The world is alive and renews common resources. Colonies depend on it for food.           |

### Simulation zones

The world is too big to simulate fully everywhere. Use three zones around the player:

- **Active** (about 2 screens around the player): every rule runs at full rate.
- **Near** (the rest of the loaded chunks): fluids, heat and gas run at reduced rate; chunks that haven't changed sleep until something touches them.
- **Far** (everything else): no tile simulation. Colonies and ecology tick as abstract numbers (section 10).

Use a dirty-rectangle per chunk so only changing areas are updated. A settled lake should cost nothing.

### Determinism (Should)

Given the same seed and the same player actions, the world should evolve the same way. Use a seeded random number generator everywhere, never Math.random(). This makes bugs reproducible and balance testable.
