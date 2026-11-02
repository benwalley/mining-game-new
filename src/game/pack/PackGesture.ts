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
  /** While scrubbing: how far the contents have slid, in modes. Up is positive, and it's fractional. */
  scrubMove(progress: number): void;
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

/** How much of a drag's end counts toward a flick's speed. */
const FLICK_WINDOW_MS = 100;

/** Below this distance from the button, the angle is too jumpy to scroll by. */
const MIN_SCROLL_RADIUS_PX = 40;

/**
 * The pack button and its fan, as a state machine over one finger. Pure: it
 * knows nothing about the DOM or the game, only points, times and hooks.
 *
 * - Tap the button: next mode. With the fan open, close the fan.
 * - Swipe up or down: the button is a window onto an endless strip of modes, and
 *   the strip follows the finger, `modeStepPx` per mode; up is forward.
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
  /** Recent (time, scroll) pairs while dragging the fan, to measure a flick. */
  private samples: { t: number; s: number }[] = [];
  /** After a release the fan coasts at `velocity` (slots a second), then settles on an entry. */
  private settling = false;
  private velocity = 0;
  private lastAnimAt: number | null = null;

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
    // A finger on a coasting fan catches it.
    this.settling = false;
    this.velocity = 0;
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

  move(p: Point, now = 0): void {
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
        this.samples = [{ t: now, s: this.scroll }];
        return this.hooks.changed();
      case 'scrolling':
        this.scrollTo(p);
        this.samples.push({ t: now, s: this.scroll });
        while (this.samples.length > 8) this.samples.shift();
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

  /** `now` lets a finger that stopped before lifting count as no flick. */
  up(now?: number): void {
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
      case 'scrolling':
        this.release(now);
        break;
      default:
        break;
    }
    this.hover = null;
    this.hooks.changed();
  }

  /**
   * Moves a coasting or settling fan on. Call once a frame; returns true if the
   * fan moved and needs drawing again.
   */
  animate(now: number): boolean {
    if (!this.settling) return false;
    const dt = this.lastAnimAt === null ? 0 : Math.min(0.05, (now - this.lastAnimAt) / 1000);
    this.lastAnimAt = now;
    if (dt === 0) return false;
    const max = maxScroll(this.entries, this.t);
    if (Math.abs(this.velocity) > this.t.fanFlickMin) {
      this.scroll += this.velocity * dt;
      this.velocity *= Math.exp(-this.t.fanFriction * dt);
      // The ends stop it dead rather than letting it fly past.
      if (this.scroll <= 0 || this.scroll >= max) {
        this.scroll = Math.max(0, Math.min(max, this.scroll));
        this.velocity = 0;
      }
      return true;
    }
    const target = Math.max(0, Math.min(max, Math.round(this.scroll)));
    this.scroll += (target - this.scroll) * (1 - Math.exp(-this.t.fanSnapRate * dt));
    if (Math.abs(target - this.scroll) < 0.002) {
      this.scroll = target;
      this.settling = false;
    }
    return true;
  }

  /** The finger left a dragged fan: a fast one coasts, a slow one just settles. */
  private release(now?: number): void {
    // Only the last tenth of a second of movement counts.
    const last = this.samples.at(-1);
    const recent = last ? this.samples.filter((p) => p.t >= last.t - FLICK_WINDOW_MS) : [];
    const first = recent[0];
    const span = first && last ? last.t - first.t : 0;
    const stopped = last !== undefined && now !== undefined && now - last.t > FLICK_WINDOW_MS;
    this.velocity = span > 0 && !stopped ? ((last!.s - first!.s) * 1000) / span : 0;
    if (Math.abs(this.velocity) < this.t.fanFlickMin) this.velocity = 0;
    this.settling = true;
    this.lastAnimAt = null;
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
    this.hooks.scrubMove(-dy / this.t.modeStepPx);
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
