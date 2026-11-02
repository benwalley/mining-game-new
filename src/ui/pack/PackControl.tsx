import { useEffect, useRef } from 'preact/hooks';
import { tuning } from '@/content/tuning';
import { fanView, packView } from '../stores/gameStore';
import type { PackActions } from './packActions';

const RING = 2 * Math.PI * 24;
const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

/**
 * The pack button in the bottom-right corner and the fan that opens from it.
 * The button shows the held block, and a ring around it fills with pack weight;
 * it swells and turns red when overloaded. No numbers: those live in the full pack.
 * All the gesture logic is in `PackGesture`; this only reports pointer events.
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
    onPointerUp: (e: PointerEvent) => {
      stopTimer();
      actions.up(point(e));
    },
    onPointerCancel: () => {
      stopTimer();
      actions.cancel();
    },
    onContextMenu: (e: Event) => e.preventDefault(),
  };

  const { held, load } = packView.value;
  const fan = fanView.value;
  const over = Math.max(0, Math.min(1, (load - 1) / (tuning.pack.hardLimit - 1)));
  const gone = held !== null && held.count === 0;

  return (
    <>
      {fan.open && (
        <div class="fan-scrim interactive" {...handlers}>
          <div class={`fan${fan.ghosting ? ' dim' : ''}`}>
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
      <div
        ref={button}
        class={`pack-button interactive${over > 0 ? ' over' : ''}`}
        style={{
          width: `${tuning.placing.buttonPx}px`,
          height: `${tuning.placing.buttonPx}px`,
          transform: `scale(${1 + 0.14 * over})`,
        }}
        aria-label={held ? `Holding ${held.name}` : 'Pack'}
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
      </div>
    </>
  );
}
