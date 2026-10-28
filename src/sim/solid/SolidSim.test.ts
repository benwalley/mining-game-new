import { describe, expect, it } from 'vitest';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_SIZE } from '@/core/world/constants';
import { SolidSim } from './SolidSim';
import { isUnsupported, supportDistance, type SupportView } from './support';

const materials = loadMaterials();
const id = (key: string) => materials.require(key).numId;
const KEYS: Record<string, string> = {
  '#': 'stone',
  d: 'dirt',
  s: 'sand',
  B: 'bedrock',
  '.': 'air',
  w: 'air',
};
const t = tuning.support;
const DT = 1 / tuning.sim.ticksPerSecond;

/** One chunk drawn from rows ('w' is air holding full water); outside is bedrock. */
function world(rows: string[]) {
  const store = new ChunkStore(
    { width: CHUNK_SIZE, height: CHUNK_SIZE, surfaceY: 0 },
    materials.bedrock.numId,
  );
  const chunk = createChunk(0, 0);
  chunk.material.fill(materials.bedrock.numId);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const i = tileIndex(x, y);
      chunk.material[i] = id(KEYS[ch]!);
      if (ch === 'w') {
        chunk.fluidType[i] = 1;
        chunk.fluidAmount[i] = 8;
      }
    }),
  );
  store.set(chunk);
  const sim = new SolidSim(store, materials, t);
  const at = (x: number, y: number) => materials.get(store.materialAt(x, y))!.key;
  const dig = (x: number, y: number) => {
    store.setMaterial(x, y, materials.air.numId);
    sim.removed(x, y);
  };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.tick(DT);
  };
  return { store, sim, at, dig, run, chunk };
}

describe('support rule', () => {
  const view = (rows: string[]): SupportView => ({
    solid: (x, y) => (rows[y]?.[x] ?? '#') === '#',
    span: () => 2,
  });

  it('measures the distance to the nearest tile resting on something', () => {
    const v = view(['#######', '#.....#', '#######']);
    expect(supportDistance(v, 3, 0, 10)).toBe(3);
    expect(supportDistance(v, 1, 0, 10)).toBe(1);
    expect(supportDistance(v, 0, 0, 10)).toBe(0);
  });

  it('fails flat ceilings past the span but not stepped ones', () => {
    expect(isUnsupported(view(['#######', '#.....#', '#######']), 3, 0)).toBe(true);
    // Each step rests on the one below it, so this arch holds.
    const arch = view(['#######', '##...##', '#.....#', '#######']);
    for (let x = 2; x <= 4; x++) expect(isUnsupported(arch, x, 0)).toBe(false);
  });
});

describe('SolidSim', () => {
  it('lets sand slip for a moment, then fall to the floor', () => {
    const w = world(['#s#', '#d#', '#.#', '#.#', '###']);
    w.dig(1, 1);
    w.run(t.looseSeconds / 2);
    expect(w.at(1, 0)).toBe('sand');
    expect(w.sim.drain().events.map((e) => e.kind)).toContain('loose');
    w.run(t.looseSeconds + 0.5);
    expect(w.at(1, 3)).toBe('sand');
    expect(w.at(1, 0)).toBe('air');
  });

  it('drops a whole sand column, not one grain at a time', () => {
    const w = world(['#s#', '#s#', '#s#', '#d#', '#.#', '#.#', '#.#', '###']);
    w.dig(1, 3);
    w.run(t.looseSeconds + 0.6);
    expect([4, 5, 6].map((y) => w.at(1, y))).toEqual(['sand', 'sand', 'sand']);
  });

  it('collapses a flat ceiling wider than it can span, after a warning', () => {
    // Dirt spans 2: in a 7-wide room the middle tiles are 3 and 4 away from support.
    const w = world(['ddddddddd', 'dd.....dd', 'dd.....dd', 'ddddddddd']);
    // Untouched, nothing happens: the rule only looks where something changed.
    w.run(t.failSeconds + 1);
    expect(w.at(4, 0)).toBe('dirt');

    w.dig(2, 0); // Opens a gap in the ceiling, so the rest must be checked.
    w.run(t.failSeconds / 2);
    expect(w.at(4, 0)).toBe('dirt');
    expect(w.store.damageAt(4, 0)).toBeGreaterThan(0);
    const warned = w.sim.drain().events;
    expect(warned.some((e) => e.kind === 'creak' && e.x === 4)).toBe(true);

    w.run(t.failSeconds);
    const out = w.sim.drain();
    expect(out.events.some((e) => e.kind === 'collapse' && e.x === 4)).toBe(true);
    // The tile next to the wall is within span and holds.
    expect(w.at(6, 0)).toBe('dirt');
    // The rubble fell to the floor and remembers being dirt.
    w.run(1);
    expect(w.at(4, 2)).toBe('rubble');
    expect(w.store.originAt(4, 2)).toBe(id('dirt'));
  });

  it('leaves a ceiling within its span alone', () => {
    const w = world(['#######', '##...##', '#######']);
    w.dig(2, 0);
    w.run(t.failSeconds + 1);
    expect(w.at(3, 0)).toBe('stone');
    expect(w.sim.active).toBe(0);
  });

  it('cancels a failure when the tile is dug out first', () => {
    const w = world(['ddddddddd', 'dd.....dd', 'ddddddddd']);
    w.dig(2, 0);
    w.run(t.failSeconds / 2);
    w.dig(4, 0);
    w.run(t.failSeconds);
    expect(w.sim.drain().events.some((e) => e.kind === 'collapse' && e.x === 4)).toBe(false);
  });

  it('pushes water up out of the way of falling sand', () => {
    const w = world(['#s#', '#d#', '#w#', '###']);
    w.dig(1, 1);
    w.run(t.looseSeconds + 0.5);
    expect(w.at(1, 2)).toBe('sand');
    const above = tileIndex(1, 1);
    expect(w.chunk.fluidAmount[above]).toBe(8);
    expect(w.sim.drain().touched.length).toBeGreaterThan(0);
  });
});
