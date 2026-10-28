import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import testWorldConfig from '@/data/test-world.json';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { ChunkData } from '@/core/world/chunk';
import { CHUNK_SIZE } from '@/core/world/constants';
import { PROTOCOL_VERSION, type FromSim, type ToSim } from '@/protocol/messages';
import { IdbSaveStore } from './persistence/IdbSaveStore';
import { MemorySaveStore } from './persistence/MemorySaveStore';
import type { SaveStore } from './persistence/SaveStore';
import { SimHost } from './SimHost';
import { TestWorldGenerator, type TestWorldConfig } from './worldgen/TestWorldGenerator';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const WORLD = 'w1';

function createHost(store: SaveStore) {
  const out: FromSim[] = [];
  const host = new SimHost({
    port: { post: (m) => out.push(m), onMessage: () => {} },
    store,
    materials,
    fluids,
    tuning,
    createGenerator: (seed) =>
      new TestWorldGenerator(testWorldConfig as TestWorldConfig, seed, materials, fluids),
    newSeed: () => 'fixed-seed',
    now: () => 1000,
  });
  const send = (msg: ToSim) => host.handle(msg);
  const last = <K extends FromSim['type']>(type: K) =>
    out.filter((m): m is Extract<FromSim, { type: K }> => m.type === type).at(-1);
  return { host, out, send, last };
}

const spawn = testWorldConfig.spawn;
const spawnChunk = [Math.floor(spawn.x / CHUNK_SIZE), Math.floor(spawn.y / CHUNK_SIZE)] as const;

describe.each([
  ['memory', async () => new MemorySaveStore()],
  ['indexeddb', () => IdbSaveStore.open()],
])('SimHost with %s store', (_name, makeStore) => {
  it('creates a world and serves chunks', async () => {
    const { send, last } = createHost(await makeStore());
    await send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId: `${WORLD}-a` });
    expect(last('ready')?.player).toBeNull();

    await send({ type: 'requestChunks', chunks: [spawnChunk] });
    const chunk = last('chunk')?.chunk;
    expect([chunk?.cx, chunk?.cy]).toEqual([...spawnChunk]);
  });

  it('applies digs, rejects bedrock, and restores everything on resume', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-b`;
    const first = createHost(store);
    await first.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await first.send({ type: 'requestChunks', chunks: [spawnChunk, [0, spawnChunk[1]]] });

    await first.send({ type: 'digTile', x: spawn.x, y: spawn.y, toolPower: 3 });
    expect(first.last('tilesChanged')?.changes[0]?.material).toBe(materials.air.numId);

    await first.send({ type: 'digTile', x: 0, y: spawn.y, toolPower: 10 });
    expect(first.last('tilesChanged')?.changes[0]?.material).toBe(materials.bedrock.numId);

    await first.send({ type: 'playerState', player: { x: 12.5, y: 30, facing: -1 } });
    await first.send({ type: 'flush' });
    expect(first.last('saved')?.chunks).toBe(1);

    const second = createHost(store);
    await second.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    expect(second.last('ready')?.player).toEqual({ x: 12.5, y: 30, facing: -1 });
    await second.send({ type: 'requestChunks', chunks: [spawnChunk] });
    const chunk = second.last('chunk')!.chunk;
    const idx = (spawn.y % CHUNK_SIZE) * CHUNK_SIZE + (spawn.x % CHUNK_SIZE);
    expect(chunk.material[idx]).toBe(materials.air.numId);
  });

  it('wipes the save on reset', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-c`;
    const host = createHost(store);
    await host.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await host.send({ type: 'playerState', player: { x: 1, y: 2, facing: 1 } });
    await host.send({ type: 'flush' });
    await host.send({ type: 'resetWorld' });
    expect(host.last('worldReset')).toBeDefined();
    expect(await store.loadMeta(worldId)).toBeUndefined();
  });

  it('keeps partial dig damage across a resume and clears it when the tile breaks', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-d`;
    const idx = (spawn.y % CHUNK_SIZE) * CHUNK_SIZE + (spawn.x % CHUNK_SIZE);
    const first = createHost(store);
    await first.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await first.send({ type: 'requestChunks', chunks: [spawnChunk, [0, spawnChunk[1]]] });
    await first.send({
      type: 'damageTiles',
      changes: [
        { x: spawn.x, y: spawn.y, damage: 120 },
        { x: 0, y: spawn.y, damage: 200 }, // Bedrock: ignored.
      ],
    });
    await first.send({ type: 'flush' });

    const second = createHost(store);
    await second.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await second.send({ type: 'requestChunks', chunks: [spawnChunk, [0, spawnChunk[1]]] });
    const chunks = second.out.flatMap((m) => (m.type === 'chunk' ? [m.chunk] : []));
    const home = chunks.find((c) => c.cx === spawnChunk[0])!;
    const wall = chunks.find((c) => c.cx === 0)!;
    expect(home.damage[idx]).toBe(120);
    expect(wall.damage[(spawn.y % CHUNK_SIZE) * CHUNK_SIZE]).toBe(0);

    await second.send({ type: 'digTile', x: spawn.x, y: spawn.y, toolPower: 3 });
    await second.send({ type: 'requestChunks', chunks: [spawnChunk] });
    expect(second.last('chunk')!.chunk.damage[idx]).toBe(0);
  });

  it('runs fluids, streams them to the main thread and saves them', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-e`;
    const water = fluids.require('water').id;
    const first = createHost(store);
    await first.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await first.send({ type: 'requestChunks', chunks: [spawnChunk] });
    const waterIn = (chunk: ChunkData) => {
      let total = 0;
      chunk.fluidType.forEach((t, i) => {
        if (t === water) total += chunk.fluidAmount[i]!;
      });
      return total;
    };
    const before = waterIn(first.last('chunk')!.chunk);
    await first.send({ type: 'pourFluid', x: spawn.x, y: spawn.y - 4, fluid: water, amount: 8 });
    for (let t = 0; t < 30; t++) first.host.tick();
    const patches = first.out.flatMap((m) => (m.type === 'fluidsChanged' ? m.patches : []));
    expect(patches.length).toBeGreaterThan(0);
    await first.send({ type: 'flush' });

    const second = createHost(store);
    await second.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    await second.send({ type: 'requestChunks', chunks: [spawnChunk] });
    const chunk = second.last('chunk')!.chunk;
    // The poured water fell to the ground and was saved there.
    expect(waterIn(chunk)).toBe(before + 8);
    expect(chunk.fluidAmount[(spawn.y - 4) * CHUNK_SIZE + (spawn.x % CHUNK_SIZE)]).toBe(0);
  });

  it('leaves an undermined ceiling standing but lets sand fall', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-f`;
    const host = createHost(store);
    await host.send({ type: 'init', protocol: PROTOCOL_VERSION, kind: 'test', worldId });
    // The test world's wide flat room in dirt (x 100–113, y 34–36), and its sand band below.
    await host.send({ type: 'requestChunks', chunks: [[3, 1]] });
    await host.send({ type: 'digTile', x: 101, y: 33, toolPower: 3 });
    // Dirt at the top of the band under the sand (sand runs to y 61).
    await host.send({ type: 'digTile', x: 104, y: 62, toolPower: 3 });
    const seconds = tuning.support.failSeconds + 2;
    for (let t = 0; t < seconds * tuning.sim.ticksPerSecond; t++) host.host.tick();
    const events = host.out.flatMap((m) => (m.type === 'simEvents' ? m.events : []));
    expect(events.map((e) => e.kind)).not.toContain('collapse');
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['loose', 'land']));
    await host.send({ type: 'flush' });
    expect(host.last('saved')?.chunks).toBeGreaterThan(0);
  });
});
