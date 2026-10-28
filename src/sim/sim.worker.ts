import testWorldConfig from '@/data/test-world.json';
import worldgenConfig from '@/data/worldgen.json';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { FromSim, MessagePort, ToSim } from '@/protocol/messages';
import { IdbSaveStore } from './persistence/IdbSaveStore';
import { MemorySaveStore } from './persistence/MemorySaveStore';
import type { SaveStore } from './persistence/SaveStore';
import { SimHost } from './SimHost';
import { LayeredWorldGenerator, type LayeredWorldConfig } from './worldgen/LayeredWorldGenerator';
import { TestWorldGenerator, type TestWorldConfig } from './worldgen/TestWorldGenerator';

const port: MessagePort<ToSim, FromSim> = {
  post: (message, transfer) => self.postMessage(message, { transfer: transfer ?? [] }),
  onMessage: (handler) => {
    self.addEventListener('message', (e: MessageEvent<ToSim>) => handler(e.data));
  },
};

function newSeed(): string {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  return Array.from(words, (w) => w.toString(36)).join('');
}

async function openStore(): Promise<SaveStore> {
  try {
    return await IdbSaveStore.open();
  } catch (err) {
    port.post({ type: 'error', message: `IndexedDB unavailable, progress won't be saved: ${err}` });
    return new MemorySaveStore();
  }
}

// Queue messages that arrive while storage is opening, then replay them in order.
const pending: ToSim[] = [];
const queue = (e: MessageEvent<ToSim>): void => void pending.push(e.data);
self.addEventListener('message', queue);

const materials = loadMaterials();
const fluids = loadFluids(materials);
const store = await openStore();
const host = new SimHost({
  port,
  store,
  materials,
  fluids,
  tuning,
  createGenerator: (seed, kind) =>
    kind === 'test'
      ? new TestWorldGenerator(testWorldConfig as TestWorldConfig, seed, materials, fluids)
      : new LayeredWorldGenerator(worldgenConfig as LayeredWorldConfig, seed, materials, fluids),
  newSeed,
});
self.removeEventListener('message', queue);
host.start();
for (const msg of pending.splice(0)) {
  host.handle(msg).catch((err: unknown) => port.post({ type: 'error', message: String(err) }));
}
