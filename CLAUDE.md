# Deepkind

A side-view mining sandbox for mobile browsers. TypeScript, Vite, Preact with signals for the
UI, and Canvas 2D (behind a `Renderer` interface) for the world. Vitest for tests. Front end
only; a future backend would only do cloud save and sync.

- **Where things stand:** [`docs/status.md`](docs/status.md). Read it first.
- **Design doc:** [`docs/design/`](docs/design/README.md), one file per section. Read the
  index, then only the sections the task needs, never the whole doc.
- **Architecture, controls and per-slice detail:** `README.md`. Read the part you need.

## Owner rules

- **Ask, don't assume.** Ask about open design and tech decisions before building on them.
  Design doc section 19 lists the open ones, and `docs/status.md` lists the questions for the
  next slice.
- **Slices with an owner check.** Build one slice, show it, and stop for the owner's review.
  Don't start the next slice or phase until the owner says so.
- **Commit and push only when the owner says "Commit and push."** Commit straight to `main`.
  End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. A push
  to `main` (over SSH, `benwalley/mining-game-new`) deploys GitHub Pages at
  https://benwalley.github.io/mining-game-new/. `gh` isn't installed, so to check a deploy,
  curl the live `index.html` and grep its bundle for a string from the new build.
- **Nothing falls.** Sand, rock and ceilings never collapse. Don't bring falling blocks back
  unless the owner asks.

## Code conventions

- **No `Math.random()`** (lint bans it). Use `createRng` or `hash2` from
  `src/core/random/rng.ts`. World gen hashes coordinates, so it doesn't depend on the order
  chunks are generated in.
- **Numbers and content live in `src/data/*.json`,** not in code, with typed loaders in
  `src/content/`.
- **Material `numId`s are persisted.** Never change or reuse one. 22 and 23 are retired.
- **Save format:** bump `SAVE_VERSION` in `src/sim/persistence/saveFormat.ts` and add a
  migration for chunks, meta and entities.
- **Protocol:** bump `PROTOCOL_VERSION` in `src/protocol/messages.ts` when messages change.
- **Generator ids:** bump `CODE_VERSION` in `LayeredWorldGenerator` or `TestWorldGenerator`
  when generation changes. That wipes dev worlds, which is intended.
- **Threads:** the sim worker (`SimHost`) owns the world. The main thread keeps a
  `ChunkMirror`, runs the player and renders. Gameplay emits typed events, and
  `FeedbackDirector` turns them into sound, haptics and particles.
- **Style:** match the surrounding code. Doc comments say why, in plain sentences. Keep
  comments sparse.
- **Before calling a slice done:** `npm run typecheck`, `npm test`, `npm run lint` and
  `npm run format:check`. Run `npm run build` before a push. Keep the output short, for
  example `npx vitest run --reporter=dot` and `npm run lint 2>&1 | tail -20`.

## Keeping token use down

Every turn resends the whole conversation, so anything pulled into context keeps costing
tokens.

- **One session per slice.** At the end of a slice, after its commit, update
  `docs/status.md` (done, next, questions to ask), then tell the owner to start the next
  slice in a new session.
- **Read narrowly.** Search first (grep), then read only the line ranges you need. Don't
  re-read files you just edited. Read only the design sections the slice touches.
- **Check in the browser rarely.** Tests, typecheck and the owner's own playtest are the
  default check.
  - Open the browser only when the slice's point is visual or about feel, or when a bug
    can't be reproduced in a test.
  - Prefer `read_page`, `get_page_text`, `read_console_messages` and `javascript_tool`
    (for example, reading game state or the debug overlay) over screenshots.
  - When a screenshot is needed, take it at `scale: 0.5` and take about two per slice at
    most.
  - Don't screenshot to confirm something a test already covers.
- **Use cheaper models for simple work.** For a broad search, a mechanical edit across many
  files, data-file entry, or running and summarizing long command output, hand it to a
  subagent with `model: "sonnet"`, or `"haiku"` for pure searches. Keep the main model for
  design decisions and tricky sim, physics or rendering code. At the start of a slice, say
  whether it's routine enough for the owner to run the whole session on Sonnet in the model
  picker.
- **Prototype in the scratchpad,** and report the numbers, not the full output.
