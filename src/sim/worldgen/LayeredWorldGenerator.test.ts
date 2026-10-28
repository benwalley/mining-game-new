import { describe, expect, it } from 'vitest';
import worldgenConfig from '@/data/worldgen.json';
import { loadMaterials } from '@/content/materials';
import { LayeredWorldGenerator, type LayeredWorldConfig } from './LayeredWorldGenerator';

const materials = loadMaterials();
const config = worldgenConfig as LayeredWorldConfig;
const make = (seed = 'seed-a') => new LayeredWorldGenerator(config, seed, materials);
const gen = make();

describe('LayeredWorldGenerator', () => {
  it('builds the full-size world from the config', () => {
    expect(gen.dims).toEqual({
      width: config.width,
      height: config.surfaceY + config.depth,
      surfaceY: config.surfaceY,
    });
  });

  it('is deterministic and independent of generation order', () => {
    const other = make();
    other.generateChunk(5, 40);
    expect(gen.generateChunk(3, 9).material).toEqual(other.generateChunk(3, 9).material);
  });

  it('differs between seeds', () => {
    expect(make('one').generateChunk(4, 10).material).not.toEqual(
      make('two').generateChunk(4, 10).material,
    );
  });

  it('stacks the six layers in order, deepest last', () => {
    const x = 100;
    const at = (depth: number) => gen.layerIndexAt(x, config.surfaceY + depth);
    // Sample well inside each layer, away from its wavy, dithered edges.
    const mids = config.layers.map((l, i) => {
      const next = config.layers[i + 1]?.fromDepth ?? config.depth;
      return Math.round((l.fromDepth + next) / 2);
    });
    expect(mids.map(at)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('spawns on solid ground under open sky, with no caves nearby', () => {
    const { x, y } = gen.spawn;
    const air = materials.air.numId;
    expect(gen.materialAt(x, y)).not.toBe(air);
    expect(gen.materialAt(x, y - 1)).toBe(air);
    for (let dy = 0; dy < config.spawn.safeDepth - 6; dy++) {
      for (let dx = -4; dx <= 4; dx++) expect(gen.materialAt(x + dx, y + dy)).not.toBe(air);
    }
  });

  it('walls the world with bedrock', () => {
    const bedrock = materials.bedrock.numId;
    expect(gen.materialAt(0, 500)).toBe(bedrock);
    expect(gen.materialAt(config.width - 1, 500)).toBe(bedrock);
    expect(gen.materialAt(50, gen.dims.height - 1)).toBe(bedrock);
  });

  it('has caves, and each layer contains its own base rock', () => {
    const counts = new Map<number, number>();
    for (let cy = 2; cy < 90; cy += 3) {
      const chunk = gen.generateChunk(5, cy);
      for (const m of chunk.material) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    expect(counts.get(materials.air.numId) ?? 0).toBeGreaterThan(500);
    for (const layer of config.layers) {
      expect(counts.get(materials.require(layer.base).numId) ?? 0).toBeGreaterThan(0);
    }
  });
});
