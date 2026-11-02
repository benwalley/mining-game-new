import { useEffect, useRef } from 'preact/hooks';
import { tuning } from '@/content/tuning';
import { stripPositions } from '@/game/pack/carousel';
import type { Mode } from '@/game/pack/modes';
import { fanView, modeView, packView, undoView, type PackView } from '../stores/gameStore';
import { Fan } from './Fan';
import type { PackActions } from './packActions';

const RING = 2 * Math.PI * 24;
const UNDO_RING = 2 * Math.PI * 9;
const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

const MODE_LABEL: Record<Mode, string> = { dig: 'Dig', build: 'Build' };

/** What each mode shows in the button's window: the pick for digging, the held block for building. */
function ModeFace({ mode, held }: { mode: Mode; held: PackView['held'] }) {
  if (mode === 'dig') {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" class="mode-glyph" aria-hidden="true">
        <path d="M5 19 L15 9" />
        <path d="M11 5 Q19 5 19 13 L15 9 Z" />
      </svg>
    );
  }
  if (!held) return <span class="pack-glyph" />;
  return (
    <img
      src={held.icon}
      class="tile-icon face-icon"
      style={{ opacity: held.count === 0 ? 0.3 : 1 }}
      alt=""
      draggable={false}
    />
  );
}

/**
 * The pack button in the bottom-right corner, its fan and the undo chip. The
 * button is a round window onto an endless vertical strip of modes: a swipe up
 * or down slides the strip behind it, following the finger, and a tap slides to
 * the next one. A ring around the window fills with pack weight (it swells and
 * turns red when overloaded) and the border shows the mode. No numbers: those
 * live in the full pack. The gesture logic is all in `PackGesture`; this only
 * reports pointer events.
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
  const { mode, preview, modes, pulse, progress, scrubbing } = modeView.value;
  const shown = preview ?? mode;
  const over = Math.max(0, Math.min(1, (load - 1) / (tuning.pack.hardLimit - 1)));
  const undo = undoView.value;
  const step = tuning.placing.modeStepPx;
  const positions = stripPositions(modes.indexOf(mode), modes.length, progress);

  return (
    <>
      {mode === 'build' && <div class="mode-tag">Build</div>}
      {fan.open && <Fan handlers={handlers} />}
      {scrubbing && <div class="mode-bubble">{MODE_LABEL[shown]}</div>}
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
        <div class="pack-window" aria-hidden="true">
          {modes.map((m, i) =>
            Math.abs(positions[i]!) < 1.2 ? (
              <div
                key={m}
                class={`pack-face${scrubbing ? ' drag' : ''}`}
                style={{ transform: `translateY(${positions[i]! * step}px)` }}
              >
                <ModeFace mode={m} held={held} />
              </div>
            ) : null,
          )}
        </div>
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
        {pulse > 0 && <span key={pulse} class="pulse-ring" />}
      </div>
    </>
  );
}
