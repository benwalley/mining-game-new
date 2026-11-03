import { describe, expect, it } from 'vitest';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_SIZE, chunkKeyX, chunkKeyY } from '@/core/world/constants';
import { FluidSim } from '../fluid/FluidSim';
import { ambientRows, fillAmbient } from '../heat/ambient';
import { HeatSim } from '../heat/HeatSim';
import { fireRules, stepFire } from './fire';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const id = (key: string) => materials.require(key).numId;
const AIR = materials.air.numId;
const STONE = id('stone');
const COAL = id('coal');
const TIN = id('tin');
const FLAME = fluids.require('flame').id;
const WATER = fluids.require('water').id;
const LAVA = fluids.require('lava').id;
const MOLTEN_TIN = fluids.require('molten-tin').id;
const rules = fireRules(materials, fluids, tuning.fire);
const AMBIENT = ambientRows([[0, 20]], 0, CHUNK_SIZE * 2);

const solid = new Uint8Array(materials.maxNumId + 1);
for (const m of materials.all) solid[m.numId] = m.solid ? 1 : 0;

const TILES: Record<string, [material: number, fluid?: number]> = {
  '#': [STONE],
  '.': [AIR],
  c: [COAL],
  t: [TIN],
  T: [id('torch')],
  r: [id('rootwood')],
  w: [AIR, WATER],
  l: [AIR, LAVA],
  // A coal tile already burning.
  f: [COAL, FLAME],
};

/**
 * A 2×2-chunk world at 20° drawn from rows (see TILES), placed at (2, 2), with
 * stone everywhere else. `run` steps it like the sim host: twenty fluid and heat
 * ticks, then a second of fire.
 */
function world(rows: string[]) {
  const store = new ChunkStore(
    { width: CHUNK_SIZE * 2, height: CHUNK_SIZE * 2, surfaceY: 0 },
    materials.bedrock.numId,
  );
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      const chunk = createChunk(cx, cy);
      chunk.material.fill(STONE);
      fillAmbient(chunk.temperature, AMBIENT, cy * CHUNK_SIZE, CHUNK_SIZE);
      store.set(chunk);
    }
  }
  const at = (x: number, y: number) => ({
    chunk: store.get(x >> 5, y >> 5)!,
    i: tileIndex(x & 31, y & 31),
  });
  rows.forEach((row, ry) =>
    [...row].forEach((ch, rx) => {
      const { chunk, i } = at(rx + 2, ry + 2);
      const [m, fluid] = TILES[ch]!;
      chunk.material[i] = m;
      if (fluid) {
        chunk.fluidType[i] = fluid;
        chunk.fluidAmount[i] = 8;
      }
    }),
  );
  const fluidSim = new FluidSim(store, solid, fluids);
  const heat = new HeatSim(materials, fluids, AMBIENT, tuning.heat);
  for (const chunk of store.values()) {
    heat.addChunk(chunk, false);
    fluidSim.wakeChunk(chunk.cx, chunk.cy);
  }
  let second = 0;
  const events: string[] = [];
  const run = (seconds: number) => {
    for (let s = 0; s < seconds; s++) {
      for (let n = 0; n < tuning.sim.ticksPerSecond; n++) {
        fluidSim.tick();
        const drained = fluidSim.drain();
        for (const [key] of drained.changed) heat.chunkChanged(chunkKeyX(key), chunkKeyY(key));
        events.push(...drained.events.map((e) => e.kind));
        heat.tick();
      }
      const out = stepFire(store, rules, ++second);
      for (const { x, y } of out.fluids) {
        fluidSim.touch(x, y);
        heat.tileChanged(x, y);
      }
      events.push(...out.events.map((e) => e.kind));
    }
  };
  /** Material and fluid at a drawing coordinate. */
  const tile = (rx: number, ry: number) => {
    const { chunk, i } = at(rx + 2, ry + 2);
    return {
      material: chunk.material[i]!,
      fluid: chunk.fluidAmount[i]! > 0 ? chunk.fluidType[i]! : 0,
      amount: chunk.fluidAmount[i]!,
      damage: chunk.damage[i]!,
      temperature: chunk.temperature[i]!,
    };
  };
  const burning = (rx: number, ry: number) => {
    const t = tile(rx, ry);
    return solid[t.material] === 1 && t.fluid === FLAME;
  };
  return { run, tile, burning, events, at };
}

describe('fire', () => {
  it('sets coal touching a torch alight, by chance, not at once', () => {
    const w = world(['#Tc#']);
    w.run(1);
    expect(w.burning(2, 0)).toBe(false);
    w.run(200);
    expect(w.burning(2, 0) || w.tile(2, 0).material === AIR).toBe(true);
    expect(w.events).toContain('catchFire');
  });

  it('sets wood touching lava alight, though lava hardly warms it', () => {
    const w = world(['#l#', '#r#', '###']);
    w.run(200);
    expect(w.events).toContain('catchFire');
  });

  it('leaves coal alone when nothing is hot or burning near it', () => {
    const w = world(['cccc']);
    w.run(120);
    expect(w.events).toEqual([]);
  });

  it('burns a tile away over its fuel time, cracking as it goes', () => {
    const w = world(['#f#']);
    const seconds = Math.ceil(254 / rules.burnRate[COAL]!);
    w.run(10);
    expect(w.tile(1, 0).damage).toBe(10 * rules.burnRate[COAL]!);
    w.run(seconds);
    expect(w.tile(1, 0).material).toBe(AIR);
    expect(w.events).toContain('burnOut');
    // The last flame fades by itself.
    w.run(2);
    expect(w.tile(1, 0).fluid).toBe(0);
  });

  it('heats coal next to it past its limit, so fire spreads by heat too', () => {
    const w = world(['#fc#']);
    w.run(20);
    expect(w.tile(2, 0).temperature).toBeGreaterThanOrEqual(materials.get(COAL)!.heatLimit * 100);
  });

  it('creeps slowly along a seam rather than racing through it', () => {
    const w = world(['f' + 'c'.repeat(11)]);
    w.run(60);
    const lit = [...Array(12).keys()].filter(
      (x) => w.burning(x, 0) || w.tile(x, 0).material === AIR,
    );
    expect(lit.length).toBeGreaterThan(1);
    expect(lit.length).toBeLessThan(8);
  });

  it('is put out by water beside it', () => {
    const w = world(['#fw#', '####']);
    w.run(1);
    expect(w.burning(1, 0)).toBe(false);
    expect(w.tile(1, 0).material).toBe(COAL);
    expect(w.events).toContain('douse');
  });
});

describe('melting', () => {
  it('melts metal past its limit into molten metal that sets where it cools', () => {
    // Tin in lava over a drop: it melts, runs down out of the heat and sets.
    const w = world(['#lll#', '#ltl#', '##.##', '##.##', '##.##', '#####']);
    w.run(20);
    expect(w.events).toContain('melt');
    expect(w.events).toContain('set');
    const column = [1, 2, 3, 4].map((y) => w.tile(2, y));
    expect(column.filter((t) => t.material === TIN)).toHaveLength(1);
    expect(column.some((t) => t.fluid === MOLTEN_TIN)).toBe(false);
  });

  it('cools a thin film of molten metal to nothing', () => {
    const w = world(['#...#', '#####']);
    const { chunk, i } = w.at(3, 2);
    chunk.fluidType[i] = MOLTEN_TIN;
    chunk.fluidAmount[i] = 2;
    w.run(1);
    expect(w.tile(1, 0)).toMatchObject({ material: AIR, fluid: 0 });
  });

  it('leaves rock alone even when it is past its heat limit', () => {
    const w = world(['lll', 'l#l', 'lll']);
    w.run(30);
    expect(w.tile(1, 1).material).toBe(STONE);
  });
});
