import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { ToSim } from '@/protocol/messages';
import { SimClient } from '@/protocol/SimClient';
import { fanView, packView } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import { Player } from '../player/Player';
import { ChunkMirror } from '../world/ChunkMirror';
import { Pack } from './Pack';
import { PackController } from './PackController';

const materials = loadMaterials();
const BUTTON = { x: 300, y: 500 };

/** One chunk: air above row 10, dirt from row 10 down. The player stands at (5.5, 10) facing right. */
function setup(dirtCount = 5) {
  const mirror = new ChunkMirror({ width: 32, height: 32, surfaceY: 10 }, materials);
  const chunk = createChunk(0, 0);
  const dirt = materials.require('dirt').numId;
  for (let y = 10; y < 32; y++) for (let x = 0; x < 32; x++) chunk.material[tileIndex(x, y)] = dirt;
  mirror.addChunk(chunk);

  const sent: ToSim[] = [];
  const sim = new SimClient({ post: (m) => sent.push(m), onMessage: () => {} });
  const events = new EventBus<GameEvents>();
  const placed: unknown[] = [];
  events.on('placed', (e) => placed.push(e));
  const player = new Player(tuning.player, tuning.vitals);
  player.placeAt(5.5, 10);
  const pack = new Pack(tuning.pack, (id) => materials.get(id)?.weight ?? 0);
  pack.add(dirt, dirtCount);
  pack.select(dirt);
  const pauses: boolean[] = [];
  const ctl = new PackController({
    tuning: tuning.placing,
    materials,
    mirror,
    sim,
    events,
    player,
    pack,
    view: () => ({ x0: 0, y0: 0, x1: 32, y1: 32 }),
    onPausedChange: (p) => pauses.push(p),
  });
  ctl.setButton(BUTTON);
  return { ctl, mirror, pack, sent, placed, pauses, dirt };
}

const air = materials.air.numId;

describe('PackController', () => {
  it('aims a ghost from the facing tile and places it where the finger leaves it', () => {
    const { ctl, mirror, pack, sent, placed, dirt } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.tick(300);
    expect(ctl.ghost).toEqual({ x: 6, y: 9, material: dirt, valid: true });
    // 56 px right is two tiles; 28 px up is one.
    g.move({ x: BUTTON.x + 56, y: BUTTON.y - 28 });
    expect(ctl.ghost).toMatchObject({ x: 8, y: 8, valid: true });
    g.up({ x: BUTTON.x + 56, y: BUTTON.y - 28 });

    expect(ctl.ghost).toBeNull();
    expect(mirror.materialAt(8, 8)).toBe(dirt);
    expect(pack.count(dirt)).toBe(4);
    expect(sent).toContainEqual({ type: 'placeTile', x: 8, y: 8, material: dirt });
    expect(placed).toHaveLength(1);
  });

  it('turns the ghost red over solid ground and places nothing there', () => {
    const { ctl, mirror, pack, sent, dirt } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.tick(300);
    g.move({ x: BUTTON.x, y: BUTTON.y + 28 }); // One tile down: row 10 is dirt.
    expect(ctl.ghost).toMatchObject({ x: 6, y: 10, valid: false });
    g.up({ x: BUTTON.x, y: BUTTON.y + 28 });
    expect(sent.some((m) => m.type === 'placeTile')).toBe(false);
    expect(pack.count(dirt)).toBe(5);
    expect(mirror.materialAt(6, 10)).toBe(dirt);
  });

  it('cancels when the finger comes back to the button', () => {
    const { ctl, pack, dirt } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.tick(300);
    g.move({ x: BUTTON.x - 80, y: BUTTON.y });
    g.move(BUTTON);
    g.up(BUTTON);
    expect(pack.count(dirt)).toBe(5);
  });

  it('places more with taps after a placement, until the player moves', () => {
    const { ctl, mirror, pack, dirt } = setup();
    expect(ctl.tap(3, 9)).toBe(false);

    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.tick(300);
    g.up({ x: BUTTON.x - 70, y: BUTTON.y });
    // The first block went in front of the player, so taps behind it are the open ones.
    expect(ctl.tap(3, 9)).toBe(true);
    expect(mirror.materialAt(3, 9)).toBe(dirt);
    expect(ctl.tap(3, 10)).toBe(false); // Solid.
    expect(ctl.tap(9, 9)).toBe(false); // The block just placed is in the way.
    expect(pack.count(dirt)).toBe(3);

    ctl.noteMovement(true);
    expect(ctl.tap(2, 9)).toBe(false);
  });

  it("won't place on the player, off screen, or with an empty stack", () => {
    const { ctl, pack, dirt } = setup(1);
    pack.take(dirt);
    expect(pack.held).toBe(dirt);
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.tick(300);
    expect(g.ghosting).toBe(false);
  });

  it('pauses while the fan is open, and a held entry still places', () => {
    const { ctl, mirror, pauses, dirt } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.up(BUTTON);
    expect(pauses).toEqual([true]);
    expect(fanView.value.open).toBe(true);
    expect(packView.value.items).toHaveLength(1);

    // The only stack sits at the start of the arc, straight above the button.
    const slot = fanView.value.slots[0]!;
    g.down({ x: slot.x, y: slot.y }, 1000);
    g.tick(1300);
    expect(pauses).toEqual([true]); // Still paused while aiming.
    g.move({ x: slot.x - 56, y: slot.y });
    g.up({ x: slot.x - 56, y: slot.y });
    expect(pauses).toEqual([true, false]);
    expect(mirror.materialAt(4, 9)).toBe(dirt);
    expect(mirror.materialAt(6, 9)).toBe(air);
  });

  it('opens the full pack from the last entry and pauses until it closes', () => {
    const { ctl, pauses } = setup();
    const g = ctl.gesture;
    g.down(BUTTON, 0);
    g.up(BUTTON);
    const last = fanView.value.slots[1]!; // Entries: the dirt stack, then "open pack".
    g.down({ x: last.x, y: last.y }, 0);
    g.up({ x: last.x, y: last.y });
    expect(fanView.value.open).toBe(false);
    expect(pauses).toEqual([true]); // Fan to sheet with no gap.
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
