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
import { itemKey } from '../craft/itemKey';
import { Chests } from './Chests';
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
  const weightOf = (key: number) => materials.get(key & 1023)?.weight ?? 0;
  const pack = new Pack(tuning.pack, weightOf);
  const chests = new Chests({ ...tuning.pack, hardLimit: 1 }, weightOf);
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
    chests,
    chestRange: tuning.chest.openRangeTiles,
    liquidAt: () => false,
    view: () => ({ x0: 0, y0: 0, x1: 32, y1: 32 }),
    tileAt: (x, y) => ({ x: Math.floor(x / TILE_PX), y: Math.floor(y / TILE_PX) }),
    tilePx: () => TILE_PX,
    iconOf: (numId) => `icon:${numId}`,
    onPausedChange: (p) => pauses.push(p),
    onModeChange: (m) => modes.push(m),
    now: () => clock.now,
  });
  ctl.setButton(BUTTON);
  const build = () => ctl.setMode('build');
  const placeTiles = () => sent.filter((m) => m.type === 'placeTile');
  return {
    ctl,
    mirror,
    chunk,
    pack,
    player,
    sent,
    seen,
    pauses,
    modes,
    clock,
    dirt,
    build,
    placeTiles,
    chests,
  };
}

const air = materials.air.numId;

describe('PackController modes', () => {
  it('cycles modes when the button is tapped, and build and craft freeze the world', () => {
    const { ctl, pauses, modes } = setup();
    const g = ctl.gesture;
    const tap = () => {
      g.down(BUTTON, 0);
      g.up();
    };
    tap();
    expect(modeView.value.mode).toBe('build');
    expect(ctl.isPaused).toBe(true);
    expect(pauses).toEqual([true]);
    tap();
    expect(modeView.value.mode).toBe('craft');
    expect(pauses).toEqual([true]);
    tap();
    expect(modeView.value.mode).toBe('dig');
    expect(ctl.isPaused).toBe(false);
    expect(modes).toEqual(['build', 'craft', 'dig']);
  });

  it('scrubs to a mode and previews it on the way', () => {
    const { ctl } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 40 });
    expect(modeView.value.preview).toBe(MODES[1]);
    expect(modeView.value.scrubbing).toBe(true);
    expect(modeView.value.progress).toBeCloseTo(0.8);
    g.up();
    expect(modeView.value.preview).toBeNull();
    expect(modeView.value.scrubbing).toBe(false);
    expect(modeView.value.progress).toBe(0);
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
    expect(placeTiles()).toEqual([{ type: 'placeTile', x: 3, y: 9, material: dirt, variant: 0 }]);
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

  it('puts the ghost on the tile the player faces, wherever the hold is, and moves it with the finger', () => {
    const { ctl, mirror, pack, build, dirt, seen } = setup();
    build();
    // Held far from the player and the button: the ghost still starts in front of the mole.
    ctl.holdStart(at(20), at(3));
    expect(ctl.ghost).toEqual({ x: 6, y: 9, material: dirt, valid: true });
    // A tile of finger travel moves it a tile: two right and one up.
    ctl.holdMove(at(20) + 2 * TILE_PX, at(3) - TILE_PX);
    expect(ctl.ghost).toMatchObject({ x: 8, y: 8, valid: true });
    expect(seen).toEqual(['ghostStep']);
    ctl.holdEnd(at(20) + 2 * TILE_PX, at(3) - TILE_PX, true);
    expect(ctl.ghost).toBeNull();
    expect(mirror.materialAt(8, 8)).toBe(dirt);
    expect(pack.count(dirt)).toBe(4);
  });

  it('starts the ghost on the other side when the player faces left', () => {
    const { ctl, player, build } = setup();
    player.facing = -1;
    build();
    ctl.holdStart(at(20), at(3));
    expect(ctl.ghost).toMatchObject({ x: 4, y: 9 });
  });

  it('places in front of the player when a hold is released without dragging', () => {
    const { ctl, mirror, build, dirt } = setup();
    build();
    ctl.holdStart(at(25), at(2));
    ctl.holdEnd(at(25), at(2), true);
    expect(mirror.materialAt(6, 9)).toBe(dirt);
  });

  it('turns the ghost red over solid ground and places nothing there', () => {
    const { ctl, pack, build, dirt, placeTiles } = setup();
    build();
    ctl.holdStart(at(20), at(3));
    ctl.holdMove(at(20), at(3) + TILE_PX); // One tile down is row 10: dirt.
    expect(ctl.ghost).toMatchObject({ x: 6, y: 10, valid: false });
    ctl.holdEnd(at(20), at(3) + TILE_PX, true);
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
    ctl.refund(3, 9, dirt, 0);
    expect(pack.count(dirt)).toBe(5);
    expect(undoView.value).toBeNull();
  });
});

describe('PackController items in dig mode', () => {
  const torch = materials.require('torch').numId;
  const chest = materials.require('chest').numId;
  const coal = materials.require('coal').numId;

  it('places a held torch with a tap, sending its fuel along', () => {
    const { ctl, pack, mirror, placeTiles } = setup();
    const key = itemKey(torch, coal);
    pack.add(key, 2);
    pack.select(key);
    // (4,9) is open, beside the player, with dirt below to hang on.
    ctl.tapWorld(at(4), at(9));
    expect(mirror.materialAt(4, 9)).toBe(torch);
    expect(placeTiles()).toEqual([
      { type: 'placeTile', x: 4, y: 9, material: torch, variant: coal },
    ]);
    expect(pack.count(key)).toBe(1);
    // Hanging in mid-air: refused.
    ctl.tapWorld(at(4), at(5));
    expect(mirror.materialAt(4, 5)).toBe(materials.air.numId);
  });

  it('does nothing with a held block: blocks go down in build mode', () => {
    const { ctl, mirror, placeTiles } = setup();
    ctl.tapWorld(at(4), at(9));
    expect(mirror.materialAt(4, 9)).toBe(materials.air.numId);
    expect(placeTiles()).toEqual([]);
  });

  it("won't put a block over a torch", () => {
    const { ctl, pack, mirror, build } = setup();
    pack.add(torch, 1);
    pack.select(torch);
    ctl.tapWorld(at(4), at(9));
    pack.select(materials.require('dirt').numId);
    build();
    ctl.tapWorld(at(4), at(9));
    expect(mirror.materialAt(4, 9)).toBe(torch);
  });

  it('places a chest that starts empty, and undo takes it back', () => {
    const { ctl, pack, chests } = setup();
    pack.add(chest, 1);
    pack.select(chest);
    ctl.tapWorld(at(4), at(9));
    expect(chests.get(4, 9)?.kinds).toBe(0);
    ctl.undo();
    expect(chests.get(4, 9)).toBeUndefined();
    expect(pack.count(chest)).toBe(1);
  });

  it('opens a chest in reach with a tap, pausing, and moves stacks both ways', () => {
    const { ctl, pack, chests, pauses, dirt } = setup();
    pack.add(chest, 1);
    pack.select(chest);
    ctl.tapWorld(at(4), at(9));
    ctl.tapWorld(at(4), at(9));
    expect(ctl.chestOpen).toBe(true);
    expect(pauses.at(-1)).toBe(true);
    ctl.stow(dirt, 3, 'chest');
    expect(pack.count(dirt)).toBe(2);
    expect(chests.isLocked(4, 9)).toBe(true);
    ctl.stow(dirt, 99, 'pack');
    expect(pack.count(dirt)).toBe(5);
    ctl.closeChest();
    expect(pauses.at(-1)).toBe(false);
  });

  it("won't open a chest out of reach", () => {
    const { ctl, chests, mirror } = setup();
    mirror.setMaterial(20, 9, chest);
    chests.create(20, 9);
    ctl.tapWorld(at(20), at(9));
    expect(ctl.chestOpen).toBe(false);
  });

  it('takes a torch in reach back with a tap; a spent one is gone', () => {
    const { ctl, pack, mirror, sent } = setup();
    mirror.setMaterial(4, 9, torch);
    mirror.setMaterial(20, 9, torch);
    ctl.tapWorld(at(20), at(9));
    expect(sent.some((m) => m.type === 'takeTorch')).toBe(false);
    ctl.tapWorld(at(4), at(9));
    expect(sent.at(-1)).toEqual({ type: 'takeTorch', x: 4, y: 9 });
    ctl.torchTaken(4, 9, coal, false);
    expect(pack.count(itemKey(torch, coal))).toBe(1);
    ctl.torchTaken(4, 9, coal, true);
    expect(pack.count(itemKey(torch, coal))).toBe(1);
  });

  it('freezes the world in craft mode', () => {
    const { ctl, pauses } = setup();
    ctl.setMode('craft');
    expect(pauses.at(-1)).toBe(true);
    expect(MODES).toContain('craft');
  });
});
