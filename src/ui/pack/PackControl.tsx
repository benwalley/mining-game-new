import { useEffect, useRef } from 'preact/hooks';
import { tuning } from '@/content/tuning';
import type { Mode } from '@/game/pack/modes';
import { fanView, modeView, packView, undoView } from '../stores/gameStore';
import type { PackActions } from './packActions';

const RING = 2 * Math.PI * 24;
const UNDO_RING = 2 * Math.PI * 9;
const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

const MODE_LABEL: Record<Mode, string> = { dig: 'Dig', build: 'Build' };

/** A small picture for each mode, drawn with plain shapes. */
function ModeGlyph({ mode }: { mode: Mode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" class="mode-glyph" aria-hidden="true">
      {mode === 'dig' ? (
        <>
          <path d="M5 19 L15 9" />
          <path d="M11 5 Q19 5 19 13 L15 9 Z" />
        </>
      ) : (
        <>
          <rect x="5" y="9" width="14" height="10" rx="1" />
          <rect x="9" y="3" width="6" height="6" rx="1" />
        </>
      )}
    </svg>
  );
}

/**
 * The pack button in the bottom-right corner, its fan, the mode rail and the
 * undo chip. The button shows the held block, with a ring that fills with pack
 * weight (it swells and turns red when overloaded) and a border that shows the
 * mode. No numbers: those live in the full pack. The gesture logic is all in
 * `PackGesture`; this only reports pointer events.
 */
export function PackControl({ actions }: { actions: PackActions }) {
  const button = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const measure = (): void => {
      const r = button.current?.getBoundingClientRect();
      if (r) actions.setButton({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer.current);
    };
  }, [actions]);

  const stopTimer = (): void => clearInterval(timer.current);
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      if (!actions.down(point(e))) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      clearInterval(timer.current);
      timer.current = setInterval(() => actions.tick(), 40);
    },
    onPointerMove: (e: PointerEvent) => {
      const latest = e.getCoalescedEvents?.().at(-1) ?? e;
      actions.move(point(latest));
    },
    onPointerUp: () => {
      stopTimer();
      actions.up();
    },
    onPointerCancel: () => {
      stopTimer();
      actions.cancel();
    },
    onContextMenu: (e: Event) => e.preventDefault(),
  };

  const { held, load } = packView.value;
  const fan = fanView.value;
  const { mode, preview, modes, pulse } = modeView.value;
  const shown = preview ?? mode;
  const over = Math.max(0, Math.min(1, (load - 1) / (tuning.pack.hardLimit - 1)));
  const gone = held !== null && held.count === 0;
  const undo = undoView.value;

  return (
    <>
      {mode === 'build' && <div class="mode-tag">Build</div>}
      {fan.open && (
        <div class="fan-scrim interactive" {...handlers}>
          <div class="fan">
            {fan.slots.map((s) => {
              const item = packView.value.items[s.index];
              const isHeld = item !== undefined && item.numId === held?.numId;
              return (
                <div
                  key={s.index}
                  class={`fan-slot${fan.hover === s.index ? ' hover' : ''}${isHeld ? ' held' : ''}`}
                  style={{
                    left: `${s.x}px`,
                    top: `${s.y}px`,
                    opacity: s.alpha,
                    width: `${tuning.placing.fanSlotPx}px`,
                    height: `${tuning.placing.fanSlotPx}px`,
                  }}
                  aria-label={item ? item.name : 'Open pack'}
                >
                  {item ? (
                    <span class="swatch" style={{ background: item.color }} />
                  ) : (
                    <span class="pack-glyph" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {preview !== null && (
        <div class="mode-rail" aria-hidden="true">
          {/* Starting from the current mode, so swiping up always moves up the rail. */}
          {modes
            .map((_, i) => modes[(modes.indexOf(mode) + i) % modes.length]!)
            .map((m) => (
              <div key={m} class={`mode-chip${m === preview ? ' picked' : ''}`}>
                <span class="mode-label">{MODE_LABEL[m]}</span>
                <ModeGlyph mode={m} />
              </div>
            ))}
        </div>
      )}
      {undo && (
        <button
          key={undo.id}
          class="undo-chip interactive"
          aria-label="Undo last block"
          onClick={() => actions.undo()}
        >
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
            <circle cx="11" cy="11" r="9" class="undo-track" />
            <circle
              cx="11"
              cy="11"
              r="9"
              class="undo-ring"
              stroke-dasharray={UNDO_RING}
              style={{ animationDuration: `${undo.ms}ms` }}
            />
          </svg>
          Undo
        </button>
      )}
      <div
        ref={button}
        class={`pack-button interactive mode-${shown}${over > 0 ? ' over' : ''}`}
        style={{
          width: `${tuning.placing.buttonPx}px`,
          height: `${tuning.placing.buttonPx}px`,
          transform: `scale(${1 + 0.14 * over})`,
        }}
        aria-label={`${MODE_LABEL[shown]} mode${held ? `, holding ${held.name}` : ''}`}
        {...handlers}
      >
        <svg viewBox="0 0 56 56" class="pack-ring" aria-hidden="true">
          <circle cx="28" cy="28" r="24" class="ring-track" />
          <circle
            cx="28"
            cy="28"
            r="24"
            class="ring-fill"
            stroke-dasharray={`${RING * Math.min(1, load)} ${RING}`}
          />
        </svg>
        {held ? (
          <span
            class="swatch"
            style={{ background: held.color, opacity: gone ? 0.3 : 1 }}
            aria-hidden="true"
          />
        ) : (
          <span class="pack-glyph" />
        )}
        {pulse > 0 && <span key={pulse} class="pulse-ring" />}
      </div>
    </>
  );
}
