import type { PlacingTuning } from '@/content/tuning';

export interface Point {
  x: number;
  y: number;
}

export interface FanSlot {
  /** Index into the fan's entries: the pack's stacks in order, then the "open pack" entry. */
  index: number;
  x: number;
  y: number;
  /** Fades out toward the ends of the arc. */
  alpha: number;
}

/** The fan covers a quarter circle, from straight up to straight left of the button. */
const ARC_DEG = 90;

/** How many slots fit on the arc at once. */
export function slotsOnArc(t: PlacingTuning): number {
  return Math.floor(ARC_DEG / t.fanSlotSpacingDeg) + 1;
}

export function maxScroll(count: number, t: PlacingTuning): number {
  return Math.max(0, count - slotsOnArc(t));
}

/**
 * Where each visible entry sits. The angle runs from straight up (0) toward
 * straight left (90), so the fan opens away from a button in the bottom-right
 * corner. `scroll` is in slots; entries beyond the arc are left out.
 */
export function fanSlots(
  center: Point,
  count: number,
  scroll: number,
  t: PlacingTuning,
): FanSlot[] {
  const fade = t.fanSlotSpacingDeg * 0.6;
  const out: FanSlot[] = [];
  for (let index = 0; index < count; index++) {
    const deg = (index - scroll) * t.fanSlotSpacingDeg;
    const overshoot = Math.max(-deg, deg - ARC_DEG);
    if (overshoot >= fade) continue;
    const rad = (deg * Math.PI) / 180;
    out.push({
      index,
      x: center.x - t.fanRadiusPx * Math.sin(rad),
      y: center.y - t.fanRadiusPx * Math.cos(rad),
      alpha: overshoot <= 0 ? 1 : 1 - overshoot / fade,
    });
  }
  return out;
}

/** The slot under a point, if any. Faded slots at the ends can't be hit. */
export function slotAt(p: Point, slots: readonly FanSlot[], t: PlacingTuning): number | null {
  let best: number | null = null;
  let bestDist = (t.fanSlotPx * 0.65) ** 2;
  for (const s of slots) {
    if (s.alpha < 0.5) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d <= bestDist) {
      best = s.index;
      bestDist = d;
    }
  }
  return best;
}

/** Degrees from straight up toward straight left, as seen from the button. */
export function angleFrom(center: Point, p: Point): number {
  return (Math.atan2(center.x - p.x, center.y - p.y) * 180) / Math.PI;
}
