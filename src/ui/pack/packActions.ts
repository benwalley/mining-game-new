import type { Point } from '@/game/pack/fanLayout';

/** What the pack UI asks of the game. Points are viewport CSS pixels. */
export interface PackActions {
  /** Where the pack button's center is, for laying out the fan. */
  setButton(center: Point): void;
  /** False if the touch isn't for the button or fan. */
  down(p: Point): boolean;
  move(p: Point): void;
  up(): void;
  cancel(): void;
  /** Call while a finger is down, to catch holds. */
  tick(): void;
  /** Takes back the last block placed. */
  undo(): void;
  closeSheet(): void;
  select(numId: number): void;
  moveItem(from: number, to: number): void;
  discard(numId: number, count: number): void;
}
