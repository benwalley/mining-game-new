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

> **Decided since (owner, 2026-11-02):** there's no hotbar. You can carry any number of kinds
> of item, so a corner fan replaces it. The pack button in the bottom-right corner shows the
> held block.
>
> | Gesture                                         | Result                                                                               |
> | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
> | Tap the pack button                             | Open the fan. The game pauses.                                                       |
> | Swipe out from the button, let go over an item  | Hold that item. The fan closes and the game carries on.                              |
> | Swipe out, let go away from any item            | The fan stays open, still paused, to scroll through.                                 |
> | Hold the button still for 300 ms                | A ghost of the held block appears on the tile you're facing. The game keeps running. |
> | With the fan open, swipe out again              | Open the full pack, still paused. A pack item at the end of the fan does the same.   |
> | With the fan open, tap the button or outside it | Close the fan.                                                                       |
> | In the open fan: drag along it or flick         | Scroll.                                                                              |
> | In the open fan: tap an item                    | Hold it and close the fan.                                                           |
> | In the open fan: hold an item                   | Hold it and start its ghost. The game stays paused while you aim (intended).         |
>
> Swipe and hold on the button are told apart by movement: more than about 10 px in the
> first 300 ms is a swipe. While still sliding, pausing over an item does nothing; letting go
> picks it.
>
> - **The ghost block** follows how far the finger moves, not where it is: about one tile per
>   28 px, with a tick per tile. It can go to any empty tile on screen with nothing solid
>   between it and the player. It turns red where a block can't go. Let go to place it; let
>   go on the button or on a red tile to cancel.
> - **Tap to place:** after placing a block, tapping any empty tile in line of sight places
>   another of the same. Starting to move ends this; until the next placement, taps on empty
>   tiles do nothing.
> - **The fan's order** comes from the full pack, where the player arranges items. New items
>   go at the end and the game never reorders. When a stack runs out, its block stays on the
>   button greyed out.
> - **Long-press** in the fan starts a ghost, not inspect. Items are inspected in the full
>   pack.
> - **Could:** an option to mirror the button to the bottom-left for left-handed players.

### Feel requirements

- **Zero perceived latency.** Input is applied on the next frame, never queued behind simulation work.
- **Forgiveness.** Coyote time on ledges (about 100 ms) and input buffering for jumps (about 120 ms).
- **Digging feels physical.** A tile shows 3 crack stages before breaking, throws small particles in its material color, and plays a material-specific sound. Harder tiles take longer and sound duller.
- **Haptics (Should).** A short vibration tick on each tile break and a stronger pulse on discoveries, where the browser supports vibration.
- **Auto-assist.** When moving diagonally into a wall, dig the tile the player most likely meant (the one in the dominant direction). Small ledges of 1 tile are climbed automatically.
- **Speed from tools.** Dig time = tile hardness ÷ tool power, with a floor of about 0.15 s so even soft dirt has rhythm.

The swipe model above is an assumption to confirm (see Open questions): hold-to-move versus one flick per tile.
