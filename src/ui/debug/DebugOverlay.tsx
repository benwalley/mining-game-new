import { debugGrid, debugInfo, debugLighting, debugPour, toolPower } from '../stores/gameStore';

export interface DebugActions {
  setToolPower(power: number): void;
  cyclePour(): void;
  resetWorld(): void;
}

const panel = {
  position: 'absolute',
  top: 'calc(env(safe-area-inset-top) + 8px)',
  left: '8px',
  maxWidth: 'calc(100vw - 16px)',
  background: 'var(--panel)',
  border: '1px solid #4a4550',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  lineHeight: 1.5,
} as const;

const button = {
  font: 'inherit',
  color: 'var(--bone)',
  background: '#2f2a33',
  border: '1px solid #6e6a72',
  borderRadius: '4px',
  minWidth: '32px',
  minHeight: '32px',
  padding: '0 8px',
} as const;

/** Developer overlay: toggled with ` on desktop, or opened with ?debug on phones. */
export function DebugOverlay({ actions }: { actions: DebugActions }) {
  const info = debugInfo.value;
  return (
    <div class="interactive" style={panel}>
      {info && (
        <>
          <div>
            {info.fps} fps · tile {info.tileX},{info.tileY} · depth {info.depth}
          </div>
          <div>
            {info.grounded ? 'grounded' : 'air'}
            {info.climbing ? ' · climbing' : ''} · chunks {info.chunksLoaded} · haptics{' '}
            {info.haptics}
          </div>
          <div>dig: {info.target ?? '—'}</div>
          <div>inspect: {info.inspected ?? 'long-press a tile'}</div>
          <div>{info.health}</div>
          <div>sim: {info.sim}</div>
          <div>saved: {info.lastSave}</div>
        </>
      )}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
        <span>pick power</span>
        <button style={button} onClick={() => actions.setToolPower(toolPower.value - 1)}>
          −
        </button>
        <span>{toolPower.value}</span>
        <button style={button} onClick={() => actions.setToolPower(toolPower.value + 1)}>
          +
        </button>
        <button style={button} onClick={() => (debugGrid.value = !debugGrid.value)}>
          grid
        </button>
        <button style={button} onClick={() => (debugLighting.value = !debugLighting.value)}>
          {debugLighting.value ? 'dark' : 'lit'}
        </button>
        <button style={button} onClick={() => actions.cyclePour()}>
          tap: {debugPour.value}
        </button>
        <button
          style={button}
          onClick={() => {
            if (confirm('Delete this world and start over?')) actions.resetWorld();
          }}
        >
          reset
        </button>
      </div>
    </div>
  );
}
