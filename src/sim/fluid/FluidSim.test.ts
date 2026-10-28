import { describe, expect, it } from 'vitest';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_SIZE } from '@/core/world/constants';
import { FluidSim } from './FluidSim';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const WATER = fluids.require('water').id;
const LAVA = fluids.require('lava').id;
const SPORES = fluids.require('spore-gas').id;
const FIREDAMP = fluids.require('firedamp').id;
const FLAME = fluids.require('flame').id;
const STONE = materials.require('stone').numId;
const OBSIDIAN = materials.require('obsidian').numId;

const solid = new Uint8Array(materials.maxNumId + 1);
for (const m of materials.all) solid[m.numId] = m.solid ? 1 : 0;

const FLUID_CHARS: Record<string, number> = { w: WATER, l: LAVA, g: SPORES, f: FIREDAMP };

/**
 * Builds a 2×2-chunk world from rows: '#' stone, '.' air, and full tiles of
 * 'w' water, 'l' lava, 'g' spore gas, 'f' firedamp. Everything outside the
 * drawing is stone. Rows above `surfaceY` are open sky.
 */
function world(rows: string[], at: { x: number; y: number } = { x: 0, y: 0 }, surfaceY = 0) {
  const store = new ChunkStore(
    { width: CHUNK_SIZE * 2, height: CHUNK_SIZE * 2, surfaceY },
    materials.bedrock.numId,
  );
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      const chunk = createChunk(cx, cy);
      chunk.material.fill(STONE);
      store.set(chunk);
    }
  }
  const set = (x: number, y: number, ch: string) => {
    const chunk = store.get(x >> 5, y >> 5)!;
    const i = tileIndex(x & 31, y & 31);
    chunk.material[i] = ch === '#' ? STONE : materials.air.numId;
    const fluid = FLUID_CHARS[ch];
    if (fluid) {
      chunk.fluidType[i] = fluid;
      chunk.fluidAmount[i] = 8;
    }
  };
  rows.forEach((row, y) => [...row].forEach((ch, x) => set(at.x + x, at.y + y, ch)));
  const sim = new FluidSim(store, solid, fluids);
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) sim.wakeChunk(cx, cy);

  const cell = (x: number, y: number) => {
    const chunk = store.get((at.x + x) >> 5, (at.y + y) >> 5)!;
    const i = tileIndex((at.x + x) & 31, (at.y + y) & 31);
    return {
      type: chunk.fluidType[i]!,
      amount: chunk.fluidAmount[i]!,
      material: chunk.material[i]!,
    };
  };
  const total = (type: number) => {
    let sum = 0;
    for (const chunk of store.values()) {
      for (let i = 0; i < chunk.fluidAmount.length; i++) {
        if (chunk.fluidType[i] === type) sum += chunk.fluidAmount[i]!;
      }
    }
    return sum;
  };
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++) sim.tick();
  };
  return { sim, store, cell, total, run };
}

describe('FluidSim', () => {
  it('falls straight down first', () => {
    const w = world(['#w#', '#.#', '#.#', '###']);
    w.run(1);
    expect(w.cell(1, 1)).toMatchObject({ type: WATER, amount: 8 });
    expect(w.cell(1, 0).amount).toBe(0);
    w.run(1);
    expect(w.cell(1, 2).amount).toBe(8);
  });

  it('spreads sideways until level, conserving the amount', () => {
    const w = world(['#......#', '#......#', '#..ww..#', '########']);
    const before = w.total(WATER);
    w.run(60);
    expect(w.total(WATER)).toBe(before);
    const floor = [1, 2, 3, 4, 5, 6].map((x) => w.cell(x, 2).amount);
    expect(Math.max(...floor) - Math.min(...floor)).toBeLessThanOrEqual(1);
    expect(floor.every((a) => a >= 2)).toBe(true);
  });

  it('goes to sleep once settled, so a still lake costs nothing', () => {
    const w = world(['#....#', '#wwww#', '######']);
    w.run(1);
    expect(w.sim.sleeping).toBe(true);
    expect(w.sim.drain().changed.size).toBe(0);
  });

  it('never climbs: no pressure through a U-bend', () => {
    const w = world(['#w#.#', '#w#.#', '#w#.#', '#w#.#', '#...#', '#####']);
    w.run(200);
    // The bend fills and the rest stays in the left arm; the right arm stays dry.
    expect(w.cell(1, 3).amount).toBe(8);
    expect(w.cell(3, 3).amount).toBe(0);
    expect(w.total(WATER)).toBe(32);
  });

  it('pours through a breach and wakes when the wall opens', () => {
    const w = world(['#ww#..#', '#ww#..#', '#######']);
    w.run(5);
    expect(w.sim.sleeping).toBe(true);
    w.store.setMaterial(3, 1, materials.air.numId);
    w.sim.wake(2, 0, 4, 2);
    w.run(40);
    expect(w.cell(5, 1).amount).toBeGreaterThan(0);
  });

  it('moves lava more slowly than water', () => {
    const water = world(['#w.....#', '########']);
    const lava = world(['#l.....#', '########']);
    water.run(4);
    lava.run(4);
    const reach = (w: typeof water, type: number) =>
      [1, 2, 3, 4, 5, 6].filter((x) => w.cell(x, 0).type === type).length;
    expect(reach(water, WATER)).toBeGreaterThan(reach(lava, LAVA));
  });

  it('turns lava touching water into obsidian and uses up some water', () => {
    const w = world(['#w#', '#l#', '###']);
    w.run(1);
    expect(w.cell(1, 1)).toMatchObject({ material: OBSIDIAN, amount: 0 });
    expect(w.cell(1, 0)).toMatchObject({ type: WATER, amount: 4 });
    const out = w.sim.drain();
    expect(out.materials).toEqual([{ x: 1, y: 1, material: OBSIDIAN }]);
    expect(out.events[0]).toMatchObject({ kind: 'quench', x: 1, y: 1 });
  });

  it('flows across chunk borders', () => {
    // Water at the bottom of chunk (0, 0) falls into chunk (0, 1).
    const w = world(['#w#', '#.#', '#.#', '###'], { x: 4, y: CHUNK_SIZE - 1 });
    w.run(3);
    expect(w.cell(1, 2).amount).toBe(8);
  });

  it('treats unloaded chunks as walls', () => {
    const w = world(['#w#', '#.#'], { x: 4, y: CHUNK_SIZE - 1 });
    w.store.delete(0, 1);
    w.sim.forgetChunk(0, 1);
    w.run(5);
    expect(w.cell(1, 0).amount).toBe(8);
  });

  it('reports which tiles changed', () => {
    const w = world(['#w#', '#.#', '###']);
    w.run(1);
    const rect = w.sim.drain().changed.get(0)!;
    expect([rect.minY, rect.maxY]).toEqual([0, 1]);
  });

  it('lets gas rise and spread under a ceiling', () => {
    const w = world(['#....#', '#....#', '#....#', '#.g..#', '######']);
    w.run(40);
    expect(w.cell(2, 3).amount).toBe(0);
    const roof = [1, 2, 3, 4].map((x) => w.cell(x, 0).amount);
    expect(roof.every((a) => a > 0)).toBe(true);
  });

  it('bubbles gas up through water and lets water push gas aside', () => {
    const w = world(['#w#', '#w#', '#g#', '###']);
    w.run(10);
    expect(w.cell(1, 0).type).toBe(SPORES);
    expect(w.cell(1, 2).type).toBe(WATER);
  });

  it('fades thin gas away', () => {
    const w = world(['#....#', '#....#', '######']);
    w.sim.setFluid(2, 0, SPORES, 2);
    w.run(400);
    expect(w.total(SPORES)).toBe(0);
    expect(w.sim.sleeping).toBe(true);
  });

  it('blows gas away in open sky', () => {
    const w = world(['#.#', '#.#', '#g#', '###'], { x: 0, y: 0 }, 2);
    w.run(20);
    expect(w.total(SPORES)).toBe(0);
  });

  it('ignites firedamp touching lava; the flash runs through the cloud and burns out', () => {
    const w = world(['#fffff#', '#.....#', '#....l#', '#######']);
    // The lava has to reach the cloud first: it sits below. Bring the gas down to it.
    w.store.get(0, 0)!.fluidType[tileIndex(5, 1)] = FIREDAMP;
    w.store.get(0, 0)!.fluidAmount[tileIndex(5, 1)] = 8;
    w.sim.wake(0, 0, 7, 3);
    w.run(1);
    expect(w.cell(5, 1).type).toBe(FLAME);
    const ignite = w.sim.drain().events.filter((e) => e.kind === 'ignite');
    expect(ignite).toHaveLength(1);
    w.run(8);
    expect(w.total(FIREDAMP)).toBe(0);
    w.run(20);
    expect(w.total(FLAME)).toBe(0);
    // Terrain is untouched.
    expect(w.cell(3, 0).material).toBe(materials.air.numId);
  });
});
