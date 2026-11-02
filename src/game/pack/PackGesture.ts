import type { PlacingTuning } from '@/content/tuning';
import { angleFrom, fanSlots, maxScroll, slotAt, type FanSlot, type Point } from './fanLayout';

export type GesturePhase =
  | 'idle'
  | 'pressButton'
  | 'swiping'
  | 'pressSlot'
  | 'pressEmpty'
  | 'scrolling'
  | 'ghost'
  /** A finger that has already done its job; ignore it until it lifts. */
  | 'spent';

export interface PackGestureHooks {
  openFan(): void;
  closeFan(): void;
  openSheet(): void;
  /** The player chose entry `index`: a stack, or the last entry, which opens the full pack. */
  pick(index: number): void;
  /** Begins a ghost for the stack at `index`, or for the held block when null. False if nothing can be placed. */
  ghostStart(index: number | null): boolean;
  /** Finger travel since the ghost began, in CSS pixels. */
  ghostMove(dxPx: number, dyPx: number): void;
  ghostEnd(commit: boolean): void;
  /** Anything the view draws changed. */
  changed(): void;
}

/** Below this distance from the button, the angle is too jumpy to scroll by. */
const MIN_SCROLL_RADIUS_PX = 40;

/**
 * The pack button and its fan, as a state machine over one finger. Pure: it
 * knows nothing about the DOM or the game, only points, times and hooks.
 *
 * - Tap the button: open or close the fan.
 * - Swipe out from the button: the fan opens and follows the finger; letting go
 *   over an entry picks it, letting go elsewhere leaves the fan open.
 * - Swipe out with the fan already open: the full pack.
 * - Hold the button, or an entry, without moving: a ghost block to place.
 * - In the open fan: tap an entry to pick it, drag along the arc to scroll.
 */
export class PackGesture {
  fanOpen = false;
  /** In slots; entry `i` sits `i - scroll` slots along the arc. */
  scroll = 0;
  hover: number | null = null;
  phase: GesturePhase = 'idle';

  private button: Point = { x: 0, y: 0 };
  private entries = 1;
  private origin: Point = { x: 0, y: 0 };
  private cur: Point = { x: 0, y: 0 };
  private ghostOrigin: Point = { x: 0, y: 0 };
  private downAt = 0;
  private slot: number | null = null;
  private fanWasOpen = false;
  private lastAngle = 0;

  constructor(
    private readonly t: PlacingTuning,
    private readonly hooks: PackGestureHooks,
  ) {}

  /** The button's center and how many entries the fan has (stacks plus the "open pack" one). */
  setLayout(button: Point, entries: number): void {
    this.button = button;
    this.entries = entries;
    this.scroll = Math.min(this.scroll, maxScroll(entries, this.t));
  }

  get slots(): FanSlot[] {
    return this.fanOpen ? fanSlots(this.button, this.entries, this.scroll, this.t) : [];
  }

  get ghosting(): boolean {
    return this.phase === 'ghost';
  }

  /** The fan was closed from outside (the full pack opened, say). */
  reset(): void {
    this.fanOpen = false;
    this.phase = 'idle';
    this.hover = null;
    this.hooks.changed();
  }

  /** Returns false if the touch isn't ours: the fan is closed and it missed the button. */
  down(p: Point, now: number): boolean {
    if (this.phase !== 'idle') return true;
    this.origin = this.cur = p;
    this.downAt = now;
    if (this.onButton(p)) {
      this.phase = 'pressButton';
      this.fanWasOpen = this.fanOpen;
    } else if (this.fanOpen) {
      this.slot = slotAt(p, this.slots, this.t);
      this.phase = this.slot === null ? 'pressEmpty' : 'pressSlot';
    } else {
      return false;
    }
    return true;
  }

  move(p: Point): void {
    this.cur = p;
    const far = dist(p, this.origin) > this.t.swipeMovePx;
    switch (this.phase) {
      case 'pressButton':
        if (!far) return;
        if (this.fanWasOpen) {
          this.fanOpen = false;
          this.phase = 'spent';
          this.hooks.openSheet();
        } else {
          this.fanOpen = true;
          this.phase = 'swiping';
          this.hover = slotAt(p, this.slots, this.t);
          this.hooks.openFan();
        }
        break;
      case 'swiping':
        this.hover = slotAt(p, this.slots, this.t);
        break;
      case 'pressSlot':
      case 'pressEmpty':
        if (!far) return;
        this.phase = 'scrolling';
        this.lastAngle = angleFrom(this.button, p);
        return this.hooks.changed();
      case 'scrolling':
        this.scrollTo(p);
        break;
      case 'ghost':
        this.hooks.ghostMove(p.x - this.ghostOrigin.x, p.y - this.ghostOrigin.y);
        return;
      default:
        return;
    }
    this.hooks.changed();
  }

  /** Call every frame or on a timer while a finger is down, to catch holds. */
  tick(now: number): void {
    const pressing = this.phase === 'pressButton' || this.phase === 'pressSlot';
    if (!pressing || now - this.downAt < this.t.holdMs) return;
    const index = this.phase === 'pressSlot' ? this.slot : null;
    if (index === this.entries - 1) {
      // Holding the "open pack" entry is just opening it.
      this.phase = 'spent';
      this.fanOpen = false;
      this.hooks.openSheet();
    } else if (this.hooks.ghostStart(index)) {
      this.phase = 'ghost';
      this.ghostOrigin = this.cur;
    } else {
      this.phase = 'spent';
    }
    this.hooks.changed();
  }

  up(p: Point): void {
    this.cur = p;
    const phase = this.phase;
    this.phase = 'idle';
    switch (phase) {
      case 'pressButton':
        this.fanOpen = !this.fanWasOpen;
        if (this.fanOpen) this.hooks.openFan();
        else this.hooks.closeFan();
        break;
      case 'swiping':
        if (this.hover !== null) this.choose(this.hover);
        break;
      case 'pressSlot':
        if (this.slot !== null) this.choose(this.slot);
        break;
      case 'pressEmpty':
        this.fanOpen = false;
        this.hooks.closeFan();
        break;
      case 'ghost':
        // Letting go back on the button cancels.
        this.fanOpen = false;
        this.hooks.ghostEnd(!this.onButton(p));
        break;
      default:
        break;
    }
    this.hover = null;
    this.hooks.changed();
  }

  /** The browser took the touch away. Nothing is picked or placed. */
  cancel(): void {
    if (this.phase === 'ghost') {
      this.fanOpen = false;
      this.hooks.ghostEnd(false);
    }
    this.phase = 'idle';
    this.hover = null;
    this.hooks.changed();
  }

  private choose(index: number): void {
    this.fanOpen = false;
    this.hooks.pick(index);
  }

  private scrollTo(p: Point): void {
    if (dist(p, this.button) < MIN_SCROLL_RADIUS_PX) return;
    const angle = angleFrom(this.button, p);
    // Entries follow the finger along the arc.
    this.scroll -= (angle - this.lastAngle) / this.t.fanSlotSpacingDeg;
    this.scroll = Math.max(0, Math.min(maxScroll(this.entries, this.t), this.scroll));
    this.lastAngle = angle;
  }

  private onButton(p: Point): boolean {
    return dist(p, this.button) <= this.t.buttonPx / 2 + 6;
  }
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
