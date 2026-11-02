import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { ToSim } from '@/protocol/messages';
import { SimClient } from '@/protocol/SimClient';
import { fanView, modeView, packView, undoView } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import { Player } from '../player/Player';
import { ChunkMirror } from '../world/ChunkMirror';
import { MODES, type Mode } from './modes';
import { Pack } from './Pack';
import { PackController } from './PackController';
import { isReachable } from './placement';

const materials = loadMaterials();
const BUTTON = { x: 300, y: 500 };
const TILE_PX = 28;
/** The middle of a tile, in screen pixels, for the test's simple 28 px-per-tile camera. */
const at = (tile: number) => tile * TILE_PX + TILE_PX / 2;

/** One chunk: air above row 10, dirt from row 10 down. The player stands in tile (5, 9). */
function setup(dirtCount = 5) {
  const mirror = new ChunkMirror({ width: 32, height: 32, surfaceY: 10 }, materials);
  const chunk = createChunk(0, 0);
  const dirt = materials.require('dirt').numId;
  for (let y = 10; y < 32; y++) for (let x = 0; x < 32; x++) chunk.material[tileIndex(x, y)] = dirt;
  mirror.addChunk(chunk);

  const sent: ToSim[] = [];
  const sim = new SimClient({ post: (m) => sent.push(m), onMessage: () => {} });
  const events = new EventBus<GameEvents>();
  const seen: string[] = [];
  for (const kind of ['placed', 'placeDenied', 'unplaced', 'ghostStep'] as const) {
    events.on(kind, () => seen.push(kind));
  }
  const player = new Player(tuning.player, tuning.vitals);
  player.placeAt(5.5, 10);
  const pack = new Pack(tuning.pack, (id) => materials.get(id)?.weight ?? 0);
  pack.add(dirt, dirtCount);
  pack.select(dirt);
  const pauses: boolean[] = [];
  const modes: Mode[] = [];
  const clock = { now: 0 };
  const ctl = new PackController({
    tuning: tuning.placing,
    materials,
    mirror,
    sim,
    events,
    player,
    pack,
    view: () => ({ x0: 0, y0: 0, x1: 32, y1: 32 }),
    tileAt: (x, y) => ({ x: Math.floor(x / TILE_PX), y: Math.floor(y / TILE_PX) }),
    onPausedChange: (p) => pauses.push(p),
    onModeChange: (m) => modes.push(m),
    now: () => clock.now,
  });
  ctl.setButton(BUTTON);
  const build = () => ctl.setMode('build');
  const placeTiles = () => sent.filter((m) => m.type === 'placeTile');
  return { ctl, mirror, chunk, pack, sent, seen, pauses, modes, clock, dirt, build, placeTiles };
}

const air = materials.air.numId;

describe('PackController modes', () => {
  it('cycles modes when the button is tapped, and build mode freezes the world', () => {
    const { ctl, pauses, modes } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.up();
    expect(modeView.value.mode).toBe('build');
    expect(ctl.isPaused).toBe(true);
    expect(pauses).toEqual([true]);
    g.down(BUTTON, 0);
    g.up();
    expect(modeView.value.mode).toBe('dig');
    expect(ctl.isPaused).toBe(false);
    expect(modes).toEqual(['build', 'dig']);
  });

  it('scrubs to a mode and previews it on the way', () => {
    const { ctl } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 40 });
    expect(modeView.value.preview).toBe(MODES[1]);
    g.up();
    expect(modeView.value.preview).toBeNull();
    expect(modeView.value.mode).toBe('build');
  });

  it('pauses while the fan is open in dig mode, and the full pack opens from its last entry', () => {
    const { ctl, pauses } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x - 20, y: BUTTON.y });
    g.move({ x: 100, y: 300 });
    g.up();
    expect(fanView.value.open).toBe(true);
    expect(packView.value.items).toHaveLength(1);
    expect(pauses).toEqual([true]);

    const last = fanView.value.slots[1]!; // Entries: the dirt stack, then "open pack".
    g.down({ x: last.x, y: last.y }, 0);
    g.up();
    expect(fanView.value.open).toBe(false);
    expect(pauses).toEqual([true]); // Fan to full pack with no gap.
    ctl.closeSheet();
    expect(pauses).toEqual([true, false]);
  });

  it('keeps the order the player gave it and lets them discard', () => {
    const { ctl, pack, dirt } = setup();
    const stone = materials.require('stone').numId;
    pack.add(stone, 2);
    ctl.moveItem(1, 0);
    expect(packView.value.items.map((i) => i.numId)).toEqual([stone, dirt]);
    ctl.discard(dirt, 99);
    expect(pack.count(dirt)).toBe(0);
    expect(packView.value.items.map((i) => i.numId)).toEqual([stone]);
  });
});

describe('PackController build mode', () => {
  it('does nothing when the world is tapped in dig mode', () => {
    const { ctl, placeTiles } = setup();
    ctl.tapWorld(at(3), at(9));
    expect(placeTiles()).toHaveLength(0);
  });

  it('places the held block where the world is tapped', () => {
    const { ctl, mirror, pack, build, dirt, placeTiles, seen } = setup();
    build();
    ctl.tapWorld(at(3), at(9));
    expect(mirror.materialAt(3, 9)).toBe(dirt);
    expect(pack.count(dirt)).toBe(4);
    expect(placeTiles()).toEqual([{ type: 'placeTile', x: 3, y: 9, material: dirt }]);
    expect(seen).toEqual(['placed']);
  });

  it('can place on the right of the player, anywhere on screen', () => {
    const { ctl, mirror, build, dirt } = setup();
    build();
    ctl.tapWorld(at(30), at(9));
    expect(mirror.materialAt(30, 9)).toBe(dirt);
  });

  it('flashes red and places nothing on a tile it cannot use', () => {
    const { ctl, mirror, pack, build, dirt, placeTiles, seen, clock } = setup();
    build();
    ctl.tapWorld(at(3), at(10)); // Solid.
    expect(ctl.ghost).toMatchObject({ x: 3, y: 10, valid: false });
    clock.now = 400;
    expect(ctl.ghost).toBeNull();
    ctl.tapWorld(at(5), at(9)); // The player's own tile.

    // A pocket shut in by dirt on all four sides, which the player can't reach.
    for (const [x, y] of [
      [19, 5],
      [21, 5],
      [20, 4],
      [20, 6],
    ] as const) {
      mirror.setMaterial(x, y, dirt);
    }
    ctl.update(); // The next frame notices the change.
    ctl.tapWorld(at(20), at(5));
    expect(seen).toEqual(['placeDenied', 'placeDenied', 'placeDenied']);
    expect(placeTiles()).toHaveLength(0);
    expect(pack.count(dirt)).toBe(5);
  });

  it('tints the tiles a block could go on, only in build mode', () => {
    const { ctl, build } = setup();
    expect(ctl.tint).toBeNull();
    build();
    const reach = ctl.tint!;
    expect(isReachable(reach, 3, 9)).toBe(true);
    expect(isReachable(reach, 3, 10)).toBe(false);
  });

  it('pulses the button instead of placing when the stack is empty', () => {
    const { ctl, pack, build, dirt, placeTiles } = setup(1);
    build();
    pack.take(dirt);
    const before = modeView.value.pulse;
    ctl.tapWorld(at(3), at(9));
    ctl.holdStart(at(3), at(9));
    expect(modeView.value.pulse).toBe(before + 2);
    expect(placeTiles()).toHaveLength(0);
  });

  it('shows a ghost two tiles above the finger, follows it, and places on release', () => {
    const { ctl, mirror, pack, build, dirt, seen } = setup();
    build();
    ctl.holdStart(at(8), at(9));
    expect(ctl.ghost).toEqual({ x: 8, y: 7, material: dirt, valid: true });
    ctl.holdMove(at(9), at(9));
    expect(ctl.ghost).toMatchObject({ x: 9, y: 7 });
    expect(seen).toEqual(['ghostStep']);
    ctl.holdEnd(at(9), at(9), true);
    expect(ctl.ghost).toBeNull();
    expect(mirror.materialAt(9, 7)).toBe(dirt);
    expect(pack.count(dirt)).toBe(4);
  });

  it('flips the ghost below the finger near the top of the screen', () => {
    const { ctl, build } = setup();
    build();
    ctl.holdStart(at(8), at(1));
    expect(ctl.ghost).toMatchObject({ x: 8, y: 3 });
  });

  it('turns the ghost red over solid ground and places nothing there', () => {
    const { ctl, pack, build, dirt, placeTiles } = setup();
    build();
    ctl.holdStart(at(8), at(12)); // The ghost lands in row 10: dirt.
    expect(ctl.ghost).toMatchObject({ x: 8, y: 10, valid: false });
    ctl.holdEnd(at(8), at(12), true);
    expect(placeTiles()).toHaveLength(0);
    expect(pack.count(dirt)).toBe(5);
  });

  it('cancels when released on the button or the undo chip, or when the touch is lost', () => {
    const { ctl, pack, build, dirt } = setup();
    build();
    ctl.holdStart(at(8), at(9));
    ctl.holdEnd(BUTTON.x, BUTTON.y, true);
    ctl.holdStart(at(8), at(9));
    ctl.holdEnd(BUTTON.x - 81, BUTTON.y, true);
    ctl.holdStart(at(8), at(9));
    ctl.holdEnd(at(8), at(9), false);
    expect(pack.count(dirt)).toBe(5);
    expect(ctl.ghost).toBeNull();
  });
});

describe('PackController undo', () => {
  it('takes the last block back within the window, with its fluid', () => {
    const { ctl, mirror, chunk, pack, sent, build, dirt, seen } = setup();
    chunk.fluidType[tileIndex(3, 9)] = 1;
    chunk.fluidAmount[tileIndex(3, 9)] = 5;
    build();
    ctl.tapWorld(at(3), at(9));
    expect(undoView.value).not.toBeNull();

    ctl.undo();
    expect(mirror.materialAt(3, 9)).toBe(air);
    expect(pack.count(dirt)).toBe(5);
    expect(undoView.value).toBeNull();
    expect(sent.at(-1)).toMatchObject({
      type: 'unplaceTile',
      x: 3,
      y: 9,
      material: dirt,
      fluidAmount: 5,
    });
    expect(seen.at(-1)).toBe('unplaced');
  });

  it('only undoes the last block, never a series', () => {
    const { ctl, mirror, pack, build, dirt } = setup();
    build();
    ctl.tapWorld(at(3), at(9));
    ctl.tapWorld(at(4), at(9));
    ctl.undo();
    expect(mirror.materialAt(4, 9)).toBe(air);
    expect(mirror.materialAt(3, 9)).toBe(dirt);
    ctl.undo();
    expect(mirror.materialAt(3, 9)).toBe(dirt);
    expect(pack.count(dirt)).toBe(4);
  });

  it('runs out after the undo window', () => {
    const { ctl, mirror, build, dirt, clock } = setup();
    build();
    ctl.tapWorld(at(3), at(9));
    clock.now = tuning.placing.undoMs - 1;
    ctl.update();
    expect(undoView.value).not.toBeNull();
    clock.now = tuning.placing.undoMs + 1;
    ctl.update();
    expect(undoView.value).toBeNull();
    ctl.undo();
    expect(mirror.materialAt(3, 9)).toBe(dirt);
  });

  it('ends when build mode does', () => {
    const { ctl, mirror, build, dirt } = setup();
    build();
    ctl.tapWorld(at(3), at(9));
    ctl.setMode('dig');
    expect(undoView.value).toBeNull();
    ctl.undo();
    expect(mirror.materialAt(3, 9)).toBe(dirt);
  });

  it('is cancelled when the sim refuses the block, which goes back in the pack', () => {
    const { ctl, pack, build, dirt } = setup();
    build();
    ctl.tapWorld(at(3), at(9));
    ctl.refund(3, 9, dirt);
    expect(pack.count(dirt)).toBe(5);
    expect(undoView.value).toBeNull();
  });
});
