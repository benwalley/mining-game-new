import type { InputTuning } from '@/content/tuning';
import type { MoveIntent } from '@/game/player/PlayerController';

export interface GestureHandlers {
  /** Quick touch with little movement. Position in CSS pixels relative to the element. */
  onTap(x: number, y: number): void;
  onLongPress(x: number, y: number): void;
  /** First user gesture: the moment browsers allow audio to start. */
  onGesture(): void;
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

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Current movement intent. Zero inside the dead zone; full speed at `fullSpeedPx`. */
  intent(): MoveIntent {
    if (this.pointerId === null || this.longPressFired) return { x: 0, y: 0 };
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
    if (this.pointerId !== null) return; // One finger drives; extra touches are ignored.
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone (or synthetic); we still track it via element events.
    }
    const { x, y } = this.local(e);
    this.originX = this.curX = x;
    this.originY = this.curY = y;
    this.downAt = e.timeStamp;
    this.movedFar = false;
    this.longPressFired = false;
    clearTimeout(this.longPressTimer);
    this.longPressTimer = setTimeout(() => {
      if (this.pointerId === null || this.movedFar) return;
      this.longPressFired = true;
      this.handlers.onLongPress(this.originX, this.originY);
    }, this.tuning.longPressMs);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    // Coalesced events give the latest finger position at full resolution.
    const latest = e.getCoalescedEvents?.().at(-1) ?? e;
    const { x, y } = this.local(latest);
    this.curX = x;
    this.curY = y;
    if (Math.hypot(x - this.originX, y - this.originY) > this.tuning.tapMaxMovePx) {
      this.movedFar = true;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const isTap =
      !this.movedFar && !this.longPressFired && e.timeStamp - this.downAt < this.tuning.tapMaxMs;
    if (isTap) this.handlers.onTap(this.originX, this.originY);
    this.release();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.release();
  };

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
