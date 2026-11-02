import { describe, expect, it } from 'vitest';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { CHUNK_SIZE } from '@/core/world/constants';
import { ambientRows, fillAmbient } from './ambient';
import { HeatSim } from './HeatSim';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const LAVA = fluids.require('lava').id;
const STONE = materials.require('stone').numId;
const OBSIDIAN = materials.require('obsidian').numId;
const AIR = materials.air.numId;

/** Ambient rises 1° every 4 rows from 20°, so tests also cover the per-row offset. */
const AMBIENT = ambientRows(
  [
    [0, 20],
    [CHUNK_SIZE * 8, 20 + CHUNK_SIZE * 2],
  ],
  0,
  CHUNK_SIZE * 2,
);

/**
 * A 2×2-chunk world from rows: '#' stone, 'o' obsidian, '.' air, 'l' lava.
 * Everything outside the drawing is stone.
 */
function world(rows: string[], at = { x: 0, y: 0 }, generated = false) {
  const chunks = new Map<string, ReturnType<typeof createChunk>>();
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      const chunk = createChunk(cx, cy);
      chunk.material.fill(STONE);
      fillAmbient(chunk.temperature, AMBIENT, cy * CHUNK_SIZE, CHUNK_SIZE);
      chunks.set(`${cx},${cy}`, chunk);
    }
  }
  const tile = (x: number, y: number) => ({
    chunk: chunks.get(`${x >> 5},${y >> 5}`)!,
    i: tileIndex(x & 31, y & 31),
  });
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const { chunk, i } = tile(at.x + x, at.y + y);
      chunk.material[i] = ch === '#' ? STONE : ch === 'o' ? OBSIDIAN : AIR;
      if (ch === 'l') {
        chunk.fluidType[i] = LAVA;
        chunk.fluidAmount[i] = 8;
      }
    }),
  );
  const sim = new HeatSim(materials, fluids, AMBIENT, tuning.heat);
  for (const chunk of chunks.values()) sim.addChunk(chunk, generated);
  const temp = (x: number, y: number) => {
    const { chunk, i } = tile(at.x + x, at.y + y);
    return chunk.temperature[i]!;
  };
  const above = (x: number, y: number) => temp(x, y) - AMBIENT[at.y + y]!;
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++) sim.tick();
  };
  const set = (x: number, y: number, material: number) => {
    const { chunk, i } = tile(at.x + x, at.y + y);
    chunk.material[i] = material;
    chunk.fluidType[i] = 0;
    chunk.fluidAmount[i] = 0;
    sim.tileChanged(at.x + x, at.y + y);
  };
  return { sim, temp, above, run, set };
}

const ROOM = [
  '##############',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#....llll....#',
  '##############',
];

describe('HeatSim', () => {
  it('leaves undisturbed rock at ambient and goes to sleep', () => {
    const w = world(['###', '#.#', '###'], { x: 4, y: 20 });
    w.run(2);
    expect(w.sim.sleeping).toBe(true);
    expect(w.sim.drain().size).toBe(0);
    expect(w.temp(1, 1)).toBe(Math.round(AMBIENT[21]!));
  });

  it('heats the air around lava, most strongly next to it, then settles', () => {
    const w = world(ROOM, { x: 2, y: 2 });
    w.run(400);
    expect(w.temp(5, 7)).toBe(1000);
    const nextTo = w.above(6, 6);
    expect(nextTo).toBeGreaterThan(250);
    expect(nextTo).toBeLessThan(600);
    expect(w.above(6, 4)).toBeLessThan(nextTo);
    expect(w.above(6, 4)).toBeGreaterThan(40);
    // Far across the room it's barely warm.
    expect(w.above(1, 1)).toBeLessThan(25);
    expect(w.sim.drain().size).toBeGreaterThan(0);
    w.run(400);
    expect(w.sim.sleeping).toBe(true);
  });

  it('warms a freshly generated lava pocket at once', () => {
    const w = world(ROOM, { x: 2, y: 2 }, true);
    expect(w.above(6, 6)).toBeGreaterThan(250);
  });

  it('lets less heat through obsidian than through stone', () => {
    const pocket = (s: string) =>
      world(
        [`#${s}${s}${s}${s}###`, `#${s}ll${s}..#`, `#${s}${s}${s}${s}###`],
        { x: 2, y: 2 },
        true,
      );
    const stone = pocket('#');
    const obsidian = pocket('o');
    expect(obsidian.above(5, 1)).toBeLessThan(stone.above(5, 1) * 0.5);
  });

  it('cools back toward ambient once the source is gone', () => {
    const w = world(ROOM, { x: 2, y: 2 }, true);
    for (const x of [5, 6, 7, 8]) w.set(x, 7, OBSIDIAN);
    w.run(600);
    expect(w.above(6, 6)).toBeLessThan(3);
    expect(w.above(5, 7)).toBeLessThan(3);
  });

  it('carries heat across chunk borders and wakes the chunk next door', () => {
    // Lava on the last column of chunk (0, 0); air across the border in chunk (1, 0).
    const w = world(['#l...#', '######'], { x: CHUNK_SIZE - 2, y: 4 });
    w.run(300);
    expect(w.above(2, 0)).toBeGreaterThan(150);
    expect(w.above(3, 0)).toBeGreaterThan(40);
  });

  it('freezes in far zones', () => {
    const w = world(ROOM, { x: 2, y: 2 });
    const frozen = { runsNow: () => false, dtScale: () => 1 };
    for (let t = 0; t < 50; t++) w.sim.tick(frozen);
    expect(w.above(6, 6)).toBeLessThan(1);
    expect(w.sim.sleeping).toBe(false);
  });
});
