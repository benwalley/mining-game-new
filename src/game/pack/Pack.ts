import type { PackTuning } from '@/content/tuning';
import type { PackSnapshot } from '@/protocol/messages';

export const EMPTY_PACK: PackSnapshot = { items: [], held: null };

/**
 * Everything the player carries. Capacity is weight only; any number of kinds
 * fit. The order is the player's: new kinds go to the end and nothing is ever
 * reordered except by `move`. The held block stays set when its stack runs out,
 * so the button can show it greyed out.
 */
export class Pack {
  held: number | null = null;
  /** Bumped on every change, so callers can tell when to save or redraw. */
  revision = 0;
  private readonly counts = new Map<number, number>();
  private readonly order: number[] = [];

  constructor(
    private readonly tuning: PackTuning,
    private readonly weightOf: (numId: number) => number,
  ) {}

  get items(): readonly { numId: number; count: number }[] {
    return this.order.map((numId) => ({ numId, count: this.counts.get(numId)! }));
  }

  get capacity(): number {
    return this.tuning.capacity;
  }

  get kinds(): number {
    return this.order.length;
  }

  get weight(): number {
    let total = 0;
    for (const [numId, count] of this.counts) total += this.weightOf(numId) * count;
    return total;
  }

  /** Weight over capacity; 1 is full, and it can go up to `hardLimit`. */
  get load(): number {
    return this.weight / this.tuning.capacity;
  }

  count(numId: number): number {
    return this.counts.get(numId) ?? 0;
  }

  indexOf(numId: number): number {
    return this.order.indexOf(numId);
  }

  /** Whether one more of this still fits under the hard limit. */
  canAdd(numId: number, n = 1): boolean {
    return this.weight + this.weightOf(numId) * n <= this.tuning.capacity * this.tuning.hardLimit;
  }

  add(numId: number, n = 1): boolean {
    if (!this.canAdd(numId, n)) return false;
    const have = this.counts.get(numId);
    if (have === undefined) this.order.push(numId);
    this.counts.set(numId, (have ?? 0) + n);
    this.revision++;
    return true;
  }

  /** Removes up to `n`; false if there isn't that many. */
  take(numId: number, n = 1): boolean {
    const have = this.counts.get(numId) ?? 0;
    if (n <= 0 || have < n) return false;
    if (have === n) {
      this.counts.delete(numId);
      this.order.splice(this.order.indexOf(numId), 1);
    } else {
      this.counts.set(numId, have - n);
    }
    this.revision++;
    return true;
  }

  select(numId: number | null): void {
    if (numId !== null && !this.counts.has(numId)) return;
    if (this.held === numId) return;
    this.held = numId;
    this.revision++;
  }

  /** Moves the stack at `from` so it sits at `to`; the others keep their order. */
  move(from: number, to: number): void {
    if (from === to || from < 0 || from >= this.order.length) return;
    const clamped = Math.max(0, Math.min(this.order.length - 1, to));
    const [id] = this.order.splice(from, 1);
    this.order.splice(clamped, 0, id!);
    this.revision++;
  }

  /** 1 up to full, then falls in a straight line to `minSpeedFactor` at the hard limit. */
  get speedFactor(): number {
    return this.overload(this.tuning.minSpeedFactor);
  }

  get jumpFactor(): number {
    return this.overload(this.tuning.minJumpFactor);
  }

  snapshot(): PackSnapshot {
    return { items: this.order.map((id) => [id, this.counts.get(id)!]), held: this.held };
  }

  restore(s: PackSnapshot): void {
    this.counts.clear();
    this.order.length = 0;
    for (const [numId, count] of s.items) {
      if (count > 0 && !this.counts.has(numId)) {
        this.counts.set(numId, count);
        this.order.push(numId);
      }
    }
    this.held = s.held;
    this.revision++;
  }

  private overload(minFactor: number): number {
    const over = this.load - 1;
    if (over <= 0) return 1;
    const span = this.tuning.hardLimit - 1;
    return 1 - (1 - minFactor) * Math.min(1, over / span);
  }
}
