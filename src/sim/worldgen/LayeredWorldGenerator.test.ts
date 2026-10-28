import { describe, expect, it } from 'vitest';
import worldgenConfig from '@/data/worldgen.json';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_SIZE } from '@/core/world/constants';
import { FluidSim } from '../fluid/FluidSim';
import { isUnsupported, type SupportView } from '../solid/support';
import { LayeredWorldGenerator, type LayeredWorldConfig } from './LayeredWorldGenerator';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const config = worldgenConfig as LayeredWorldConfig;
const make = (seed = 'seed-a') => new LayeredWorldGenerator(config, seed, materials, fluids);
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

describe('LayeredWorldGenerator pools', () => {
  const band = (fluid: string, layer: number) => ({
    fluid,
    from: config.layers[layer]!.fromDepth,
    to: config.layers[layer + 1]!.fromDepth,
  });
  // One generated band per fluid: aquifers and lakes, lava lakes, and the gas pockets.
  const bands = [band('water', 1), band('lava', 4), band('spore-gas', 3), band('firedamp', 4)];

  it.each(bands)('places $fluid that starts perfectly still', ({ fluid, from, to }) => {
    const store = new ChunkStore(gen.dims, materials.bedrock.numId);
    const cy0 = Math.floor((config.surfaceY + from) / CHUNK_SIZE);
    const cy1 = Math.floor((config.surfaceY + to) / CHUNK_SIZE);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = 0; cx < config.width / CHUNK_SIZE; cx++) store.set(gen.generateChunk(cx, cy));
    }
    let amount = 0;
    const id = fluids.require(fluid).id;
    for (const chunk of store.values()) {
      chunk.fluidType.forEach((t, i) => {
        if (t === id) amount += chunk.fluidAmount[i]!;
      });
    }
    expect(amount).toBeGreaterThan(500);

    const solid = new Uint8Array(materials.maxNumId + 1);
    for (const m of materials.all) solid[m.numId] = m.solid ? 1 : 0;
    const sim = new FluidSim(store, solid, fluids);
    for (const chunk of store.values()) sim.wakeChunk(chunk.cx, chunk.cy);
    // Long enough for thick fluids to get a turn to move.
    // (The band may hold other fluids too, so wait for the slowest.)
    const slowest = Math.max(...fluids.all.map((f) => f.flowEvery).filter(Number.isFinite));
    for (let t = 0; t <= slowest; t++) sim.tick();
    expect(sim.drain().changed.size).toBe(0);
    expect(sim.sleeping).toBe(true);
  });
});

describe('LayeredWorldGenerator support pass (off for now)', () => {
  const gen = new LayeredWorldGenerator(
    { ...config, support: { ...config.support, enabled: true } },
    'seed-a',
    materials,
    fluids,
  );

  it.each(config.layers.map((l, i) => ({ layer: l.key, i })))(
    'leaves $layer caves standing under the support rule',
    ({ i }) => {
      const from = config.layers[i]!.fromDepth;
      const cy0 = Math.floor((config.surfaceY + from) / CHUNK_SIZE) + 1;
      const store = new ChunkStore(gen.dims, materials.bedrock.numId);
      for (let cy = cy0; cy < cy0 + 6; cy++) {
        for (let cx = 0; cx < config.width / CHUNK_SIZE; cx++) store.set(gen.generateChunk(cx, cy));
      }
      const view: SupportView = {
        solid: (x, y) => {
          const m = store.materialAt(x, y);
          return m < 0 || materials.get(m)!.solid;
        },
        span: (x, y) => {
          const m = materials.get(store.materialAt(x, y))!;
          return m.indestructible ? Infinity : m.supportSpan;
        },
      };
      let ceilings = 0;
      const failing: string[] = [];
      for (let y = cy0 * CHUNK_SIZE; y < (cy0 + 6) * CHUNK_SIZE - 1; y++) {
        for (let x = 0; x < config.width; x++) {
          if (!view.solid(x, y) || view.solid(x, y + 1)) continue;
          // Loose tiles (sand) fall instead; they aren't ceilings.
          if (materials.falls(materials.get(store.materialAt(x, y))!)) continue;
          ceilings++;
          if (isUnsupported(view, x, y)) failing.push(`${x},${y}`);
        }
      }
      expect(ceilings).toBeGreaterThan(100);
      // A few can remain where no column fits (a pool or a deep pit below).
      expect(failing.length / ceilings).toBeLessThan(0.01);
    },
  );
});
