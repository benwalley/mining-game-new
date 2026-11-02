## 14. Economy and balance

Balance means keeping resources meaningful for the whole life of a world. Every way materials enter the game (a faucet) needs ways for them to leave (a sink). Too many faucets and everything becomes worthless; too many sinks and the game feels stingy.

### Faucets and sinks

| Faucets (materials in)                 | Sinks (materials out)                     |
| -------------------------------------- | ----------------------------------------- |
| Mining ore and rock                    | Crafting items                            |
| Organic regrowth (fungus, roots, silk) | Tool and suit wear, repairs               |
| Trades with colonies                   | Building structures and supports          |
| Ruins and relics                       | Fuel burned in furnaces, lanterns, drills |
| Gifts from friends                     | Gifts to creatures                        |
| Salvage from broken items              | Colony needs the player fulfills          |

### Colony pricing

Each colony prices a material as its cultural value times its scarcity in that colony's stockpile. Flooding one colony with iron drops what they'll give for it. This keeps trade interesting without hand-tuned shop prices, and makes moving goods between colonies a real strategy.

### Balance rules

- **Pareto rule:** for every material and template, there must be at least one use where it's the best choice. Check this with a script whenever data changes.
- **No dead ends:** every material must have at least one use in crafting or as a gift.
- **Gates by tool power:** each layer's hardest common rock needs a tool from materials found one layer above it.
- **Scarcity by depth:** rare metals are finite and deep; common materials renew.

### Pacing targets

Starting targets to check in playtests:

| Moment                          | Target time from new game |
| ------------------------------- | ------------------------- |
| First ore                       | Under 2 minutes           |
| First crafted pick upgrade      | 5–10 minutes              |
| First colony reached            | 10–25 minutes             |
| First teaching                  | 20–40 minutes             |
| First furnace and smelted metal | 15–30 minutes             |
| First new layer                 | 30–60 minutes             |

### Balance tooling

- All numbers (materials, formulas, prices, rates) live in JSON data files.
- A debug overlay shows tile properties, temperature, fluid amounts, support values and colony stats.
- A dev-only local log counts materials in and out per hour of play, so faucet and sink imbalances show up as numbers.
