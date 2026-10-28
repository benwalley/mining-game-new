import { render } from 'preact';
import { Game } from '@/app/Game';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { SimClient } from '@/protocol/SimClient';
import { App } from '@/ui/App';
import { bootError, bootState, debugVisible } from '@/ui/stores/gameStore';

/** Phase 0 has a single test world; the world list arrives with multiple saves. */
const WORLD_ID = 'test-world';

async function boot(): Promise<void> {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  debugVisible.value = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

  let game: Game | null = null;
  render(
    <App
      debug={{
        setToolPower: (p) => game?.setToolPower(p),
        resetWorld: () => game?.resetWorld(),
      }}
    />,
    uiRoot,
  );

  // Ask the browser not to evict saves under storage pressure. Best effort.
  void navigator.storage?.persist?.().catch(() => false);

  const sim = SimClient.spawnWorker();
  sim.on('error', ({ message }) => console.error('[sim]', message));
  game = await Game.start({ canvas, sim, materials: loadMaterials(), tuning, worldId: WORLD_ID });
  bootState.value = 'ready';
  if (import.meta.env.DEV) Object.assign(window, { deepkind: game });
}

boot().catch((err: unknown) => {
  console.error(err);
  bootError.value = String(err);
  bootState.value = 'error';
});
