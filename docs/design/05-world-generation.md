## 5. World structure and generation

Each new game generates a finite world from a seed: about 384 tiles wide and 3,000 tiles deep, stored as 32×32 chunks. Solid bedrock walls bound the sides. A thin surface strip at the top holds the player's starting camp.

### Depth layers

Layer boundaries are wavy, not flat, and each layer blends into the next over 20–40 tiles. Depths below are starting targets.

| Layer           | Depth (tiles) | Feel                             | Typical materials                | Main hazards              |
| --------------- | ------------- | -------------------------------- | -------------------------------- | ------------------------- |
| Topsoil         | 0–150         | Safe, roots, small critters      | Dirt, clay, sand, rootwood, coal | Sand falls, shallow water |
| Stone           | 150–600       | First caves, first colonies      | Stone, copper, tin, coal, quartz | Cave-ins, aquifers        |
| Crystal caverns | 600–1,200     | Huge open caverns, glowing light | Quartz, crystals, silver, iron   | Big drops, unstable spans |
| Fungal deep     | 1,200–1,900   | Damp, alive, spreading growth    | Glowcaps, spore-silk, iron, bone | Spore gas, flooding       |
| Magma belt      | 1,900–2,600   | Hot, red light, obsidian         | Obsidian, ember crystal, gold    | Heat, lava, flammable gas |
| The Deep        | 2,600–3,000   | Ancient, quiet, strange          | Starsilver, ruin relics          | Extreme heat, the unknown |

### Generation pipeline

Generation is deterministic from the seed. Generate chunks lazily as the player approaches, but run the world-level steps (1–3 and 7–9) once at world creation.

1. **Roll world traits** (see below).
2. **Lay out layers** with noisy boundaries.
3. **Place major features:** big caverns, aquifers, lava lakes, ruins, and the sealed sites tied to world traits.
4. **Fill base rock** per layer.
5. **Carve caves** with worm tunnels and noise pockets.
6. **Seed ore veins and pockets** using each layer's material rules.
7. **Place colony sites** inside caverns. Each colony sits near a deposit it doesn't value but the player will (see section 11).
8. **Place wandering healers** near the most dangerous zones (see section 12).
9. **Validation pass.** Reroll features until the guarantees hold: a colony reachable in the Stone layer, a healer near each danger zone, every material needed for core crafting present, and the starting area safe.

### World traits

Each world rolls 2 or 3 traits. Traits are the main source of perceptual uniqueness: they must change how the player plays, not just how the world looks. Examples:

- **Flooded middle:** a large part of the Stone layer is underwater. Pumps and air become early priorities.
- **Restless crust:** ceilings are weaker everywhere. Supports matter from the first hour.
- **Fungal bloom:** the fungal layer is spreading upward over time, and colonies are worried about it.
- **Hot world:** every layer runs hotter. Heat gear matters early.
- **Crystal-rich:** light is plentiful and glass is cheap, but metal is scarce.
- **Sealed city:** a vast ruin lies deep down with a door that needs a technique taught by several species.
- **Wandering folk:** one species is nomadic and travels between colonies, carrying news fast.
- **Unique mineral:** one material exists only in this world, with a property combination generated from the seed.

Traits can be combined, but the generator should block contradictory pairs (for example, Flooded middle with Hot world unless intentionally tuned).

### Species per world

Each world picks 4–6 species from a larger pool of archetypes and randomizes their culture details (see section 10). Two worlds should rarely share the same set of neighbors.
