import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { tuning } from '@/content/tuning';
import { fanView, packView } from '../stores/gameStore';

/** The last entry: everything in the pack. */
function AllGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" class="all-glyph" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** How long after opening entries still pop in, rather than just appearing as the fan scrolls. */
const POP_WINDOW_MS = 300;

/**
 * The block picker: a quarter-circle track curving around the pack button, with
 * the pack's blocks sliding along inside it. It sweeps open from the left, the
 * entries pop in one after another, and they fade toward the track's ends. The
 * held block glows; the name of the block under the finger, or else the held
 * one, sits in the hollow of the curve. Scrolling, flicking and picking all live
 * in `PackGesture`; this only draws.
 */
export function Fan({ handlers }: { handlers: JSX.HTMLAttributes<HTMLDivElement> }) {
  const openedAt = useRef(performance.now());
  const fresh = performance.now() - openedAt.current < POP_WINDOW_MS;
  const fan = fanView.value;
  const { items, held } = packView.value;
  const { fanRadiusPx: r, fanTrackPx: band, fanSlotPx: size } = tuning.placing;
  const { x: cx, y: cy } = fan.center;

  // From straight left of the button round to straight above it.
  const arc = (radius: number) =>
    `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx} ${cy - radius}`;
  const length = `${(r * Math.PI) / 2}px`;
  const hovered = fan.hover === null ? null : (items[fan.hover]?.name ?? 'Whole pack');
  const label = hovered ?? held?.name ?? null;
  const labelR = r - band / 2 - 36;

  return (
    <div
      class="fan-scrim interactive"
      style={{
        background:
          `radial-gradient(circle at ${cx}px ${cy}px, rgba(13, 11, 16, 0.62) 0, ` +
          `rgba(13, 11, 16, 0.3) ${r + band}px, rgba(13, 11, 16, 0.1) 100%)`,
      }}
      {...handlers}
    >
      <svg class="fan-track" width="100%" height="100%" aria-hidden="true">
        <path d={arc(r)} class="track-edge" style={{ strokeWidth: band + 2, '--len': length }} />
        <path d={arc(r)} class="track-band" style={{ strokeWidth: band, '--len': length }} />
        <path d={arc(r + band / 2 - 3)} class="track-shine" style={{ '--len': length }} />
      </svg>
      {fan.slots.map((s, order) => {
        const item = items[s.index];
        const isHeld = item !== undefined && item.numId === held?.numId;
        const cls = `bead${isHeld ? ' held' : ''}${fan.hover === s.index ? ' hover' : ''}${fresh ? ' pop' : ''}`;
        return (
          <div
            key={s.index}
            class={cls}
            style={{
              left: `${s.x}px`,
              top: `${s.y}px`,
              width: `${size}px`,
              height: `${size}px`,
              opacity: s.alpha,
              '--k': 0.7 + 0.3 * s.alpha,
              animationDelay: `${order * 24}ms`,
            }}
            aria-label={item ? item.name : 'Whole pack'}
          >
            {item ? (
              <img src={item.icon} class="tile-icon" alt="" draggable={false} />
            ) : (
              <AllGlyph />
            )}
          </div>
        );
      })}
      {label && (
        <div
          class="fan-label"
          style={{
            left: `${cx - labelR * Math.SQRT1_2}px`,
            top: `${cy - labelR * Math.SQRT1_2}px`,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
