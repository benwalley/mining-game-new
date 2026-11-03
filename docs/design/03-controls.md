## 3. Controls and game feel

The player swipes anywhere on screen to move, and moving into solid ground digs. **No joystick or touch marker is ever drawn.** The character itself shows the input: it faces the direction, leans, and raises its pick.

### Gestures

| Gesture                               | Result                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Touch and drag, then hold             | Move in the drag direction. Direction is the vector from where the finger first landed to where it is now. |
| Drag distance                         | Sets speed. Dead zone about 12 px; full speed at about 60 px.                                              |
| Push into a solid tile                | Dig it. Holding keeps digging; the character continues into the hole.                                      |
| Drag up                               | Jump when standing; climb dug shaft walls.                                                                 |
| Lift finger                           | Stop. Quick, with a few frames of easing so it doesn't feel robotic.                                       |
| Tap a nearby tile, object or creature | Context action: talk, use, open, pick up. On an empty tile in reach, place the selected hotbar item.       |
| Long-press anything                   | Inspect: name, and every property the player has discovered about it.                                      |
| Tap a hotbar slot                     | Select that item.                                                                                          |

Movement is 8-directional. Digging is 4-directional (left, right, up, down) to keep tunnels clean on a grid. A tap is under 200 ms with under 10 px of movement; anything else is a drag.

> **Decided since (owner, 2026-11-02, reworked the same day):** there's no hotbar, and the
> game has **modes**. Today there are two: **dig** (the world runs; swipe to move and dig) and
> **build** (the world is frozen and the whole screen takes touches). The list of modes is
> data, so more can be added. The pack button in the bottom-right corner is a round **window**
> onto an endless vertical strip of modes, and shows the current one: the pick in dig mode, the
> held block in build mode.
>
> | Gesture on the pack button                      | Result                                                                                                                                                                                                   |
> | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Tap                                             | Slide to the next mode, wrapping around.                                                                                                                                                                 |
> | Swipe up or down                                | The strip of modes slides behind the button, following the finger one for one (about 50 px per mode), so several can go by. Release to settle on the nearest. Up goes forward, and the strip is endless. |
> | Swipe left                                      | Open the block picker fan. The game pauses while it's open.                                                                                                                                              |
> | Swipe left again with the fan open              | Open the full pack, still paused.                                                                                                                                                                        |
> | Hold still for 0.4 s                            | Open the full pack.                                                                                                                                                                                      |
> | With the fan open: tap the button or outside it | Close the fan.                                                                                                                                                                                           |
> | In the fan: tap an entry                        | Hold that block and close the fan. The last entry opens the full pack.                                                                                                                                   |
> | In the fan: drag along the track                | Scroll. A flick coasts, slows and settles exactly on an entry; a finger on it stops it.                                                                                                                  |
>
> A swipe is told apart from a hold by movement (more than about 10 px), and an up or down
> swipe from a left one by which way it mostly goes. A swipe to the right does nothing. While
> still sliding in the fan, pausing over an entry does nothing; letting go over one picks it.
> The fan is a quarter-circle track curving from straight left of the button round to straight
> above it, with the pack's blocks (shown as their tiles) sliding along inside it. The fan opens
> in either mode, and closing the full pack returns to the mode
> you were in.
>
> - **Dig mode:** the old swipe-to-move-and-dig controls. Tapping the world does nothing.
>   Leaving it stops movement and saves a half-dug tile.
> - **Build mode:** the sim, player, digging, health and heat all stop, and the camera stays
>   where it is (no panning). Time stopping should feel like a power move: a ring spreads out
>   from the player, the world behind it drains to a cold grey while the mole stays in colour,
>   particles hang in the air, and a falling "time stops" sound plays. Leaving build mode
>   reverses it: the ring closes back in and colour returns from the edges. No cue relies on
>   haptics. The held block is placed on tiles that are on screen, that the
>   player could reach through open tiles without breaking a block (up, down, left and right
>   steps only, so a diagonal gap doesn't count), and that aren't the player's own. Those
>   tiles are tinted faintly blue.
>   - **Tap** a tile to place the held block there. A tile that won't take it flashes red
>     with a soft buzz.
>   - **Hold** anywhere on the world (0.3 s, and a thumb may wander a little) to show a ghost
>     block on the tile the player is facing. Drag to move it, a tile for every tile of
>     finger travel, with a tick per tile, so the finger can start anywhere and never needs
>     to be near where the block is going. The ghost turns red where a block can't go.
>     Release to place it. Release on the pack button or the undo chip to cancel. On a red
>     tile nothing is placed.
>   - **Fluids:** a block can go into a tile holding water, lava or gas; the fluid is pushed
>     out.
>   - **Out of blocks:** the held block greys out; tapping the world pulses the button. It
>     isn't swapped for another, but the next different thing the player picks up takes its
>     place.
>   - **Undo:** after a placement an undo chip appears beside the button with a ring that
>     counts down 1 second. Tapping it removes the last block, puts it back in the pack and
>     restores the tile's exact fluid. Placing another block moves undo to that one. Only the last
>     block can be undone, never a series, and leaving build mode ends it.
> - **Freezing time to build** (catching a fall with a platform, walling off lava) is
>   intended, not a bug.
> - **The fan's order** comes from the full pack, where the player arranges items. New items
>   go at the end and the game never reorders. The first thing picked up is held straight
>   away, so building works without opening the fan. When a stack runs out, its block stays
>   on the button greyed out until something else is picked up.
> - The mode isn't saved; the game always loads in dig mode.
> - **On desktop:** B toggles build mode, U undoes, Esc returns to dig mode, and click and
>   click-and-hold work as tap and hold.
> - **Could:** an option to mirror the button to the bottom-left for left-handed players.
>
> **Decided since (owner, 2026-11-02):** with rocket boots worn, a touch that lands while the
> mole is in the air (in dig mode) fires them instead of being a tap: a quick tap gives a short
> burst, and holding keeps them at full power while the thrust lasts. The drag still steers,
> and a second finger works too. A thrust bar beside the mole shows what's left; it refills
> when the mole stands or holds on.

### Feel requirements

- **Zero perceived latency.** Input is applied on the next frame, never queued behind simulation work.
- **Forgiveness.** Coyote time on ledges (about 100 ms) and input buffering for jumps (about 120 ms).
- **Digging feels physical.** A tile shows 3 crack stages before breaking, throws small particles in its material color, and plays a material-specific sound. Harder tiles take longer and sound duller.
- **Haptics (Should).** A short vibration tick on each tile break and a stronger pulse on discoveries, where the browser supports vibration.
- **Auto-assist.** When moving diagonally into a wall, dig the tile the player most likely meant (the one in the dominant direction). Small ledges of 1 tile are climbed automatically.
- **Speed from tools.** Dig time = tile hardness ÷ tool power, with a floor of about 0.15 s so even soft dirt has rhythm.

The swipe model above is an assumption to confirm (see Open questions): hold-to-move versus one flick per tile.
