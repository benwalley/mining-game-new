import type { PlacingTuning } from '@/content/tuning';
import { angleFrom, fanSlots, maxScroll, slotAt, type FanSlot, type Point } from './fanLayout';

export type GesturePhase =
  | 'idle'
  | 'pressButton'
  /** Swiping left: the fan follows the finger. */
  | 'swiping'
  /** Swiping up or down: stepping through modes. */
  | 'scrubbing'
  | 'pressSlot'
  | 'pressEmpty'
  | 'scrolling'
  /** A finger that has already done its job; ignore it until it lifts. */
  | 'spent';

export interface PackGestureHooks {
  /** A tap on the button: switch to the next mode. */
  nextMode(): void;
  /** While scrubbing: the mode a release would pick. */
  scrub(index: number): void;
  /** The scrub ended on `index`, or was cancelled (null). */
  scrubEnd(index: number | null): void;
  openFan(): void;
  closeFan(): void;
  openSheet(): void;
  /** The player chose entry `index`: a stack, or the last entry, which opens the full pack. */
  pick(index: number): void;
  /** Anything the view draws changed. */
  changed(): void;
}

/** Below this distance from the button, the angle is too jumpy to scroll by. */
const MIN_SCROLL_RADIUS_PX = 40;

/**
 * The pack button and its fan, as a state machine over one finger. Pure: it
 * knows nothing about the DOM or the game, only points, times and hooks.
 *
 * - Tap the button: next mode. With the fan open, close the fan.
 * - Swipe up or down: scrub through modes, a step every `modeStepPx`; up is forward.
 * - Swipe left: the fan opens and follows the finger; letting go over an entry
 *   picks it, letting go elsewhere leaves the fan open. With the fan already
 *   open, swiping left opens the full pack.
 * - Hold the button without moving: the full pack.
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
  private modeIndex = 0;
  private modeCount = 1;
  private scrubIndex = 0;
  private origin: Point = { x: 0, y: 0 };
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

  /** Which mode is current, out of how many. */
  setModes(current: number, count: number): void {
    this.modeIndex = current;
    this.modeCount = count;
  }

  get slots(): FanSlot[] {
    return this.fanOpen ? fanSlots(this.button, this.entries, this.scroll, this.t) : [];
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
    this.origin = p;
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
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const far = Math.hypot(dx, dy) > this.t.swipeMovePx;
    switch (this.phase) {
      case 'pressButton':
        if (!far) return;
        if (Math.abs(dy) > Math.abs(dx)) this.startScrub(dy);
        else if (dx < 0 && this.fanWasOpen) {
          this.fanOpen = false;
          this.phase = 'spent';
          this.hooks.openSheet();
        } else if (dx < 0) {
          this.fanOpen = true;
          this.phase = 'swiping';
          this.hover = slotAt(p, this.slots, this.t);
          this.hooks.openFan();
        } else {
          this.phase = 'spent';
        }
        break;
      case 'scrubbing':
        this.scrubTo(dy);
        return;
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
      default:
        return;
    }
    this.hooks.changed();
  }

  /** Call every frame or on a timer while a finger is down, to catch holds. */
  tick(now: number): void {
    if (this.phase !== 'pressButton' || now - this.downAt < this.t.packHoldMs) return;
    this.phase = 'spent';
    this.fanOpen = false;
    this.hooks.openSheet();
    this.hooks.changed();
  }

  up(): void {
    const phase = this.phase;
    this.phase = 'idle';
    switch (phase) {
      case 'pressButton':
        if (this.fanWasOpen) {
          this.fanOpen = false;
          this.hooks.closeFan();
        } else {
          this.hooks.nextMode();
        }
        break;
      case 'scrubbing':
        this.hooks.scrubEnd(this.scrubIndex);
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
      default:
        break;
    }
    this.hover = null;
    this.hooks.changed();
  }

  /** The browser took the touch away. Nothing is picked. */
  cancel(): void {
    if (this.phase === 'scrubbing') this.hooks.scrubEnd(null);
    this.phase = 'idle';
    this.hover = null;
    this.hooks.changed();
  }

  private startScrub(dy: number): void {
    if (this.fanWasOpen) {
      this.fanOpen = false;
      this.hooks.closeFan();
    }
    this.phase = 'scrubbing';
    this.scrubIndex = this.modeIndex;
    this.hooks.scrub(this.modeIndex);
    // The move that crossed the threshold may already be a step or more.
    this.scrubTo(dy);
  }

  /** Up is forward; stepping past either end wraps around. */
  private scrubTo(dy: number): void {
    const steps = Math.round(-dy / this.t.modeStepPx);
    const n = this.modeCount;
    const index = (((this.modeIndex + steps) % n) + n) % n;
    if (index === this.scrubIndex) return;
    this.scrubIndex = index;
    this.hooks.scrub(index);
  }

  private choose(index: number): void {
    this.fanOpen = false;
    this.hooks.pick(index);
  }

  private scrollTo(p: Point): void {
    if (Math.hypot(p.x - this.button.x, p.y - this.button.y) < MIN_SCROLL_RADIUS_PX) return;
    const angle = angleFrom(this.button, p);
    // Entries follow the finger along the arc.
    this.scroll -= (angle - this.lastAngle) / this.t.fanSlotSpacingDeg;
    this.scroll = Math.max(0, Math.min(maxScroll(this.entries, this.t), this.scroll));
    this.lastAngle = angle;
  }

  private onButton(p: Point): boolean {
    return Math.hypot(p.x - this.button.x, p.y - this.button.y) <= this.t.buttonPx / 2 + 6;
  }
}
