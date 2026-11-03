## 7. Materials

Every material is defined by the same small set of properties. The simulation and crafting both read these numbers, so a material behaves the same way in the world and in an item. Players discover each property by using the material, and the journal records what they've learned.

### Properties

- **Hardness (1–10):** how long it takes to dig, and how well it digs or cuts as a tool head.
- **Toughness (1–10):** resistance to breaking; drives tool durability.
- **Weight (1–10):** pack load, and how slow tools made from it swing.
- **Heat limit (1–10):** the temperature at which it melts, burns or cracks.
- **Conductivity (1–10):** how fast heat passes through it.
- **Support span (tiles):** the longest unsupported ceiling it can hold.
- **Fuel value (0–10):** how long it burns in a furnace or lantern. Zero means it doesn't burn.
- **Trait (optional, at most one):** a special behavior such as glows, buoyant, volatile, flexible, insulating, or attuned (magic).

### Starting material set

Values are starting points for tuning. The "Best at" column is the balance rule in practice: every material must be the best choice for something.

| Material      | Hard | Tough | Weight | Heat limit | Span | Fuel | Trait      | Best at                                 |
| ------------- | ---- | ----- | ------ | ---------- | ---- | ---- | ---------- | --------------------------------------- |
| Dirt          | 1    | 1     | 3      | 9          | 2    | 0    | —          | Filling holes, farming fungus           |
| Sand          | 1    | 1     | 4      | 6          | 0    | 0    | Falls      | Glass, filling, traps                   |
| Clay          | 2    | 2     | 4      | 8          | 3    | 0    | —          | Bricks, kilns, molds                    |
| Rootwood      | 2    | 4     | 2      | 3          | 4    | 5    | Flexible   | Handles, shafts, early fuel             |
| Stone         | 4    | 5     | 6      | 8          | 5    | 0    | —          | Walls, supports, cheap tools            |
| Coal          | 3    | 2     | 3      | 2          | 3    | 9    | —          | Fuel                                    |
| Copper        | 4    | 5     | 6      | 5          | 6    | 0    | Conductive | First metal tools, pipes, heat transfer |
| Tin           | 3    | 3     | 5      | 3          | 4    | 0    | —          | Alloying (bronze), solder               |
| Quartz        | 6    | 2     | 3      | 8          | 3    | 0    | Clear      | Lenses, lanterns, glass                 |
| Iron          | 6    | 7     | 8      | 7          | 8    | 0    | —          | Strong tools, supports, rails           |
| Glowcap       | 1    | 1     | 1      | 2          | 0    | 3    | Glows      | Light without fire, gifts               |
| Spore-silk    | 1    | 6     | 1      | 3          | 0    | 2    | Flexible   | Parachutes, light packs, suits          |
| Obsidian      | 8    | 3     | 7      | 10         | 6    | 0    | Insulating | Heat shields, sharp but brittle heads   |
| Ember crystal | 5    | 3     | 2      | 10         | 2    | 10   | Volatile   | Long-burning fuel, explosives           |
| Gold          | 2    | 3     | 9      | 4          | 3    | 0    | —          | Trade and gifts (many species love it)  |
| Starsilver    | 9    | 9     | 2      | 9          | 10   | 0    | Attuned    | Endgame tools, magic techniques         |

Per-world variation: each world nudges a few property values by ±1 from the seed, and the Unique mineral trait adds one new material. Veterans should still need to test materials in each new world.

### Material renewal

Ores are finite in a world. Organic materials (rootwood, glowcap, spore-silk, bone) regrow through the ecology simulation. This keeps common crafting sustainable while rare metals stay precious.
