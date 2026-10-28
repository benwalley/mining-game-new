import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import testWorldConfig from '@/data/test-world.json';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { CHUNK_SIZE } from '@/core/world/constants';
import { PROTOCOL_VERSION, type FromSim, type ToSim } from '@/protocol/messages';
import { IdbSaveStore } from './persistence/IdbSaveStore';
import { MemorySaveStore } from './persistence/MemorySaveStore';
import type { SaveStore } from './persistence/SaveStore';
import { SimHost } from './SimHost';
import { TestWorldGenerator, type TestWorldConfig } from './worldgen/TestWorldGenerator';

const materials = loadMaterials();
const WORLD = 'w1';

function createHost(store: SaveStore) {
  const out: FromSim[] = [];
  const host = new SimHost({
    port: { post: (m) => out.push(m), onMessage: () => {} },
    store,
    materials,
    tuning,
    createGenerator: (seed) =>
      new TestWorldGenerator(testWorldConfig as TestWorldConfig, seed, materials),
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
    await send({ type: 'init', protocol: PROTOCOL_VERSION, worldId: `${WORLD}-a` });
    expect(last('ready')?.player).toBeNull();

    await send({ type: 'requestChunks', chunks: [spawnChunk] });
    const chunk = last('chunk')?.chunk;
    expect([chunk?.cx, chunk?.cy]).toEqual([...spawnChunk]);
  });

  it('applies digs, rejects bedrock, and restores everything on resume', async () => {
    const store = await makeStore();
    const worldId = `${WORLD}-b`;
    const first = createHost(store);
    await first.send({ type: 'init', protocol: PROTOCOL_VERSION, worldId });
    await first.send({ type: 'requestChunks', chunks: [spawnChunk, [0, spawnChunk[1]]] });

    await first.send({ type: 'digTile', x: spawn.x, y: spawn.y, toolPower: 3 });
    expect(first.last('tilesChanged')?.changes[0]?.material).toBe(materials.air.numId);

    await first.send({ type: 'digTile', x: 0, y: spawn.y, toolPower: 10 });
    expect(first.last('tilesChanged')?.changes[0]?.material).toBe(materials.bedrock.numId);

    await first.send({ type: 'playerState', player: { x: 12.5, y: 30, facing: -1 } });
    await first.send({ type: 'flush' });
    expect(first.last('saved')?.chunks).toBe(1);

    const second = createHost(store);
    await second.send({ type: 'init', protocol: PROTOCOL_VERSION, worldId });
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
    await host.send({ type: 'init', protocol: PROTOCOL_VERSION, worldId });
    await host.send({ type: 'playerState', player: { x: 1, y: 2, facing: 1 } });
    await host.send({ type: 'flush' });
    await host.send({ type: 'resetWorld' });
    expect(host.last('worldReset')).toBeDefined();
    expect(await store.loadMeta(worldId)).toBeUndefined();
  });
});
