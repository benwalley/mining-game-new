import { render } from 'preact';
import { Game } from '@/app/Game';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { WorldKind } from '@/protocol/messages';
import { SimClient } from '@/protocol/SimClient';
import { App } from '@/ui/App';
import { bootError, bootState, debugVisible, storageInfo } from '@/ui/stores/gameStore';

/**
 * One real world for now (the world list comes in a later phase). Add
 * ?world=test to play the flat test world instead; each has its own save.
 */
const WORLD_KIND: WorldKind =
  new URLSearchParams(location.search).get('world') === 'test' ? 'test' : 'layered';
const WORLD_ID = WORLD_KIND === 'test' ? 'test-world' : 'world-1';

async function boot(): Promise<void> {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  debugVisible.value = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

  let game: Game | null = null;
  render(
    <App
      debug={{
        setToolPower: (p) => game?.setToolPower(p),
        cyclePour: () => game?.cyclePour(),
        runBenchmark: () => game?.runBenchmark(),
        resetWorld: () => game?.resetWorld(),
      }}
    />,
    uiRoot,
  );

  // Ask the browser not to evict saves under storage pressure. Best effort;
  // Safari may still clear data for sites that aren't used regularly.
  void (navigator.storage?.persist?.() ?? Promise.resolve(false))
    .catch(() => false)
    .then((persisted) => (storageInfo.value = { ...storageInfo.value, persisted }));

  const sim = SimClient.spawnWorker();
  sim.on('error', ({ message }) => {
    console.error('[sim]', message);
    storageInfo.value = { ...storageInfo.value, error: message };
  });
  const materials = loadMaterials();
  game = await Game.start({
    canvas,
    sim,
    materials,
    fluids: loadFluids(materials),
    tuning,
    worldId: WORLD_ID,
    worldKind: WORLD_KIND,
  });
  bootState.value = 'ready';
  if (import.meta.env.DEV) Object.assign(window, { deepkind: game });
}

boot().catch((err: unknown) => {
  console.error(err);
  bootError.value = String(err);
  bootState.value = 'error';
});
