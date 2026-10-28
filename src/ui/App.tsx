import { bootError, bootState, debugVisible } from './stores/gameStore';
import { DebugOverlay, type DebugActions } from './debug/DebugOverlay';

export function App({ debug }: { debug: DebugActions }) {
  return (
    <>
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
