import { describe, expect, it } from 'vitest';
import testWorldConfig from '@/data/test-world.json';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { CHUNK_SIZE } from '@/core/world/constants';
import { TestWorldGenerator, type TestWorldConfig } from './TestWorldGenerator';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const config = testWorldConfig as TestWorldConfig;
const make = (seed = 'seed-a') => new TestWorldGenerator(config, seed, materials, fluids);

describe('TestWorldGenerator', () => {
  it('is deterministic and independent of generation order', () => {
    const a = make();
    const b = make();
    b.generateChunk(4, 4); // Generate something else first.
    expect(a.generateChunk(2, 3).material).toEqual(b.generateChunk(2, 3).material);
  });

  it('varies pockets with the seed but not the bands', () => {
    const a = make('one');
    const b = make('two');
    const y = config.surfaceY + 34; // Sand band: no pockets.

    expect(a.materialAt(50, y)).toBe(b.materialAt(50, y));
    const differs = Array.from({ length: 2000 }, (_, i) => i).some(
      (i) =>
        a.materialAt(10 + (i % 170), 80 + Math.floor(i / 170)) !==
        b.materialAt(10 + (i % 170), 80 + Math.floor(i / 170)),
    );
    expect(differs).toBe(true);
  });

  it('walls the world with bedrock', () => {
    const g = make();
    const bedrock = materials.bedrock.numId;
    expect(g.materialAt(0, 100)).toBe(bedrock);
    expect(g.materialAt(config.width - 1, 100)).toBe(bedrock);
    expect(g.materialAt(50, config.height - 1)).toBe(bedrock);
  });

  it('spawns on solid ground with headroom', () => {
    const g = make();
    const { x, y } = config.spawn;
    const air = materials.air.numId;
    expect(g.materialAt(x, y)).not.toBe(air);
    expect(g.materialAt(x, y - 1)).toBe(air);
    expect(g.materialAt(x, y - 2)).toBe(air);
  });

  it('changes id when the config changes', () => {
    const changed = new TestWorldGenerator(
      { ...config, surfaceY: 30 },
      'seed-a',
      materials,
      fluids,
    );
    expect(changed.id).not.toBe(make().id);
    expect(make().generateChunk(0, 0).material.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
  });
});
