import type { InputTuning } from '@/content/tuning';
import type { MoveIntent } from '@/game/player/PlayerController';

export interface GestureHandlers {
  /** Quick touch with little movement. Position in CSS pixels relative to the element. */
  onTap(x: number, y: number): void;
  onLongPress(x: number, y: number): void;
  /** Build mode only: the finger has been held still long enough; it now drags something. */
  onHold(x: number, y: number): void;
  onHoldMove(x: number, y: number): void;
  /** The held finger lifted (`commit`) or the browser took the touch away. */
  onHoldEnd(x: number, y: number, commit: boolean): void;
  /** First user gesture: the moment browsers allow audio to start. */
  onGesture(): void;
  /**
   * Any finger went down, including a second one. Return true to claim it (the
   * rocket boots do, in the air): it then isn't a tap, but the first finger
   * still steers. `onRelease` follows when a claimed finger lifts.
   */
  onPress?(x: number, y: number): boolean;
  onRelease?(): void;
}

/**
 * Swipe-anywhere movement. No on-screen joystick is drawn: direction and speed
 * come from the vector between where the finger landed and where it is now.
 * Works the same for mouse (pointer events) so it's testable on desktop.
 */
export class PointerGestureInput {
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private curX = 0;
  private curY = 0;
  private downAt = 0;
  private movedFar = false;
  private longPressTimer: ReturnType<typeof setTimeout> | undefined;
  private longPressFired = false;
  /** Build mode: the hold time, and whether a hold is being dragged right now. */
  private buildHoldMs: number | null = null;
  /** Build mode: how far a thumb may wander and still count as a tap or a hold. */
  private buildSlopPx = 0;
  private holdActive = false;
  /** Fingers claimed by `onPress`; the primary one then never counts as a tap. */
  private readonly claimed = new Set<number>();

  constructor(
    private readonly element: HTMLElement,
    private readonly tuning: InputTuning,
    private readonly handlers: GestureHandlers,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onCancel);
    element.addEventListener('contextmenu', preventDefault);
  }

  /**
   * In build mode (a hold time) the world no longer moves the player: taps still
   * arrive as taps, and a hold becomes a drag. A thumb is allowed to wander
   * `slopPx` and still count. Pass null to go back to digging.
   */
  setBuildMode(holdMs: number | null, slopPx = 0): void {
    if (this.holdActive) this.handlers.onHoldEnd(this.curX, this.curY, false);
    this.holdActive = false;
    this.buildHoldMs = holdMs;
    this.buildSlopPx = slopPx;
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Current movement intent. Zero inside the dead zone; full speed at `fullSpeedPx`. */
  intent(): MoveIntent {
    if (this.pointerId === null || this.longPressFired || this.buildHoldMs !== null) {
      return { x: 0, y: 0 };
    }
    const dx = this.curX - this.originX;
    const dy = this.curY - this.originY;
    const len = Math.hypot(dx, dy);
    const { deadZonePx, fullSpeedPx } = this.tuning;
    if (len <= deadZonePx) return { x: 0, y: 0 };
    const mag = Math.min(1, (len - deadZonePx) / (fullSpeedPx - deadZonePx));
    return { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onCancel);
    this.element.removeEventListener('contextmenu', preventDefault);
    clearTimeout(this.longPressTimer);
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.handlers.onGesture();
    const at = this.local(e);
    if (this.buildHoldMs === null && this.handlers.onPress?.(at.x, at.y)) {
      this.claimed.add(e.pointerId);
    }
    if (this.pointerId !== null) return; // One finger drives; extra touches only fire the boots.
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone (or synthetic); we still track it via element events.
    }
    const { x, y } = at;
    this.originX = this.curX = x;
    this.originY = this.curY = y;
    this.downAt = e.timeStamp;
    this.movedFar = false;
    this.longPressFired = false;
    clearTimeout(this.longPressTimer);
    this.longPressTimer = setTimeout(() => {
      // Holding a finger down to keep the boots firing isn't a long press.
      if (this.pointerId === null || this.movedFar || this.claimed.has(this.pointerId)) return;
      this.longPressFired = true;
      if (this.buildHoldMs !== null) {
        this.holdActive = true;
        this.handlers.onHold(this.originX, this.originY);
      } else {
        this.handlers.onLongPress(this.originX, this.originY);
      }
    }, this.buildHoldMs ?? this.tuning.longPressMs);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    // Coalesced events give the latest finger position at full resolution.
    const latest = e.getCoalescedEvents?.().at(-1) ?? e;
    const { x, y } = this.local(latest);
    this.curX = x;
    this.curY = y;
    if (this.holdActive) this.handlers.onHoldMove(x, y);
    const slop = this.buildHoldMs !== null ? this.buildSlopPx : this.tuning.tapMaxMovePx;
    if (Math.hypot(x - this.originX, y - this.originY) > slop) {
      this.movedFar = true;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const claimed = this.unclaim(e.pointerId);
    if (e.pointerId !== this.pointerId) return;
    if (this.holdActive) {
      const { x, y } = this.local(e);
      this.holdActive = false;
      this.handlers.onHoldEnd(x, y, true);
    }
    const isTap =
      !claimed &&
      !this.movedFar &&
      !this.longPressFired &&
      e.timeStamp - this.downAt < this.tuning.tapMaxMs;
    if (isTap) this.handlers.onTap(this.originX, this.originY);
    this.release();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    this.unclaim(e.pointerId);
    if (e.pointerId !== this.pointerId) return;
    if (this.holdActive) {
      this.holdActive = false;
      this.handlers.onHoldEnd(this.curX, this.curY, false);
    }
    this.release();
  };

  private unclaim(pointerId: number): boolean {
    if (!this.claimed.delete(pointerId)) return false;
    this.handlers.onRelease?.();
    return true;
  }

  private release(): void {
    this.pointerId = null;
    clearTimeout(this.longPressTimer);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}

const preventDefault = (e: Event): void => e.preventDefault();
