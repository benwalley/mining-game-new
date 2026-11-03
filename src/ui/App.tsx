import {
  bootError,
  bootState,
  chestView,
  craftView,
  debugVisible,
  modeView,
  sheetOpen,
} from './stores/gameStore';
import { DebugOverlay, type DebugActions } from './debug/DebugOverlay';
import { Hud } from './hud/Hud';
import { Toast } from './hud/Toast';
import { ChestSheet } from './pack/ChestSheet';
import { CraftSheet } from './pack/CraftSheet';
import type { PackActions } from './pack/packActions';
import { PackControl } from './pack/PackControl';
import { PackSheet } from './pack/PackSheet';

export function App({ debug, pack }: { debug: DebugActions; pack: PackActions }) {
  return (
    <>
      {bootState.value === 'ready' && <Hud />}
      {bootState.value === 'ready' && <Toast />}
      {bootState.value === 'ready' && modeView.value.mode === 'craft' && craftView.value && (
        <CraftSheet actions={pack} />
      )}
      {bootState.value === 'ready' && <PackControl actions={pack} />}
      {bootState.value === 'ready' && chestView.value && <ChestSheet actions={pack} />}
      {bootState.value === 'ready' && sheetOpen.value && <PackSheet actions={pack} />}
      {bootState.value !== 'ready' && <BootScreen />}
      {debugVisible.value && <DebugOverlay actions={debug} />}
    </>
  );
}

function BootScreen() {
  const failed = bootState.value === 'error';
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--ink)',
        color: 'var(--fog)',
        fontSize: '14px',
        padding: '16px',
        textAlign: 'center',
      }}
    >
      {failed ? `Couldn't start: ${bootError.value}` : 'Digging in…'}
    </div>
  );
}
