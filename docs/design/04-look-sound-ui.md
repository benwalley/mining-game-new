## 4. Look, sound and UI

The look is simple pixel art, and light is the main visual effect. The world should feel cozy and curious near the surface, full of awe in big caverns, and tense when it is deep and hot.

### Visual style

- **Tiles:** 16×16 px source art, drawn at a whole-number scale for crisp pixels. Each material has a distinct color _and_ texture pattern, so it reads for colorblind players too.
- **Palette:** a limited palette (about 32 colors) shared by everything, so the world looks cohesive with little art.
- **Light:** underground is dark by default. Torches, lanterns, lava and glowing materials light the area around them, spreading tile by tile. Darkness is a gameplay mechanic, not just mood.
- **Player:** small (1 tile wide, 2 tall) with a simple, readable silhouette. A lantern glow follows them.
- **Creatures:** each species has a distinct silhouette and color family. Individuals vary through palette swaps and one accessory (a hat, a scarf, a tool) so friends are recognizable.
- **Animation:** few frames, lots of personality. Squash on landing, a little bounce on walking, idle fidgets. Creatures emote with small icon bubbles.
- **Hazard readability:** heat shimmers, gas is a faint drifting haze, unstable ceilings drop dust and show cracks. A player should be able to read danger without any UI.

### Camera

- **Portrait orientation by default**, since the game is about going down. Landscape should work but isn't a priority.
- Smooth follow with slight look-ahead in the movement direction. When the player stops, the camera settles to center.
- Zoom out a little in large caverns so their scale lands; zoom back in tight tunnels.

### UI

The HUD shows almost nothing. State is communicated through the world and screen effects.

| Information           | How it's shown                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Health                | No bar. A red vignette that grows as health drops; gone when healthy.                                 |
| Heat, cold, bad air   | Screen tint (orange, blue, green-gray) and character animation (sweating, shivering, coughing).       |
| Pack fullness         | A small pack icon that fills; it bulges and the character slows when full.                            |
| Hotbar                | 5 slots along the bottom edge.                                                                        |
| Backpack and crafting | A sheet that slides up from the bottom when the pack icon is tapped. Gameplay pauses while it's open. |
| Journal               | A book icon; opens the codex, bestiary, people, map and ambitions.                                    |

No numbers appear in the HUD. Numbers are fine inside the crafting sheet and journal, where players compare items.

### Talking to creatures

Creatures speak in **picture icons** at first: an item they want, a heart for gratitude, a warning symbol, a location pin. As bonds grow, the player learns words of that species' language and short text phrases start to appear (Could). This makes communication itself a form of progress.

### Audio

- **Ambience by depth:** dripping water and soft wind near the top; deep rumbles and hiss further down. Each layer has its own bed.
- **Material sounds:** every material has its own dig and break sound. Experienced players should be able to tell ore from stone by ear.
- **Danger cues:** a creak before a cave-in, a hiss before gas, a crackle near extreme heat. These always come at least 2 seconds before the danger hits.
- **Creatures:** each species has its own voice of chirps, hums or clicks.
- **Music:** sparse. Quiet most of the time, with short swells at discoveries, first contact and rescues.
