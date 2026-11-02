# Deepkind — Game Design Document

Oct 28, 2026 · Ben Walley. The original is a single file. It's split here into one file per
section, so you can read only what a task needs. The section text is unchanged. Notes added
during the build are marked **Added during the build** or **Decided since**.

How to read it:

- **Must / Should / Could** marks priority. Anything unmarked is a Must.
- **Numbers are starting targets**, not final values. Every tunable number should live in data
  files, not code.
- **Assumptions** made on the owner's behalf are listed in section 19. Check them before
  building the affected system.
- **Terms:** a _tile_ is one grid cell; a _chunk_ is a 32×32 block of tiles; a _species_ is a
  kind of creature; a _colony_ is one settlement; a _bond_ is the relationship between the
  player and one individual creature.

Where the code and the owner's later decisions differ from this doc, they win. The decisions
are in [`docs/status.md`](../status.md) and the top-level README.

| File                                                   | Covers                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [01-vision.md](01-vision.md)                           | Design pillars, what the game is not                                               |
| [02-core-loop.md](02-core-loop.md)                     | Session lengths, trips, stopping points, pack weight sets the trip                 |
| [03-controls.md](03-controls.md)                       | Gestures (incl. tap to place, hotbar taps), feel requirements                      |
| [04-look-sound-ui.md](04-look-sound-ui.md)             | Visual style, camera, UI (HUD, hotbar, pack sheet), creature speech, audio         |
| [05-world-generation.md](05-world-generation.md)       | Depth layers, generation pipeline, world traits, species per world                 |
| [06-world-simulation.md](06-world-simulation.md)       | Per-tile state, sim rules (fluids, heat, fire, gas), simulation zones, determinism |
| [07-materials.md](07-materials.md)                     | Material properties, the starting material table, renewal                          |
| [08-crafting.md](08-crafting.md)                       | Templates, stat formulas, stations, process quality, alloys, wear, crafting sheet  |
| [09-building.md](09-building.md)                       | Placeable things, camp, building for colonies                                      |
| [10-creatures.md](10-creatures.md)                     | Species archetypes, individuals, colony sim, communication                         |
| [11-relationships.md](11-relationships.md)             | Bonds, gifts, teachings, gossip                                                    |
| [12-danger-death-rescue.md](12-danger-death-rescue.md) | Hazards, death, rescuers, life debts                                               |
| [13-goals.md](13-goals.md)                             | Journal, ambitions, milestones                                                     |
| [14-economy.md](14-economy.md)                         | Faucets and sinks, colony pricing, balance rules, pacing targets                   |
| [15-storyteller.md](15-storyteller.md)                 | What the storyteller watches, can do, and must not do                              |
| [16-architecture.md](16-architecture.md)               | Stack, threads, timing, data layout, saving, coming back after time away           |
| [17-target-stories.md](17-target-stories.md)           | The five stories the game must make possible                                       |
| [18-roadmap.md](18-roadmap.md)                         | The seven phases (transcribed; the original is an image)                           |
| [19-open-questions.md](19-open-questions.md)           | Undecided questions and assumptions, and the ones decided since                    |
