## 3. Controls and game feel

The player swipes anywhere on screen to move, and moving into solid ground digs. **No joystick or touch marker is ever drawn.** The character itself shows the input: it faces the direction, leans, and raises its pick.

### Gestures

| Gesture                               | Result                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Touch and drag, then hold             | Move in the drag direction. Direction is the vector from where the finger first landed to where it is now. |
| Drag distance                         | Sets speed. Dead zone about 12 px; full speed at about 60 px.                                              |
| Push into a solid tile                | Dig it. Holding keeps digging; the character continues into the hole.                                      |
| Drag up                               | Jump when standing; climb on ladders, ropes and dug shaft walls.                                           |
| Lift finger                           | Stop. Quick, with a few frames of easing so it doesn't feel robotic.                                       |
| Tap a nearby tile, object or creature | Context action: talk, use, open, pick up. On an empty tile in reach, place the selected hotbar item.       |
| Long-press anything                   | Inspect: name, and every property the player has discovered about it.                                      |
| Tap a hotbar slot                     | Select that item.                                                                                          |

Movement is 8-directional. Digging is 4-directional (left, right, up, down) to keep tunnels clean on a grid. A tap is under 200 ms with under 10 px of movement; anything else is a drag.

### Feel requirements

- **Zero perceived latency.** Input is applied on the next frame, never queued behind simulation work.
- **Forgiveness.** Coyote time on ledges (about 100 ms) and input buffering for jumps (about 120 ms).
- **Digging feels physical.** A tile shows 3 crack stages before breaking, throws small particles in its material color, and plays a material-specific sound. Harder tiles take longer and sound duller.
- **Haptics (Should).** A short vibration tick on each tile break and a stronger pulse on discoveries, where the browser supports vibration.
- **Auto-assist.** When moving diagonally into a wall, dig the tile the player most likely meant (the one in the dominant direction). Small ledges of 1 tile are climbed automatically.
- **Speed from tools.** Dig time = tile hardness ÷ tool power, with a floor of about 0.15 s so even soft dirt has rhythm.

The swipe model above is an assumption to confirm (see Open questions): hold-to-move versus one flick per tile.
