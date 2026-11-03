import type { PickPart } from '@/game/craft/Pick';
import type { Point } from '@/game/pack/fanLayout';
import type { Mode } from '@/game/pack/modes';

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
  setMode(mode: Mode): void;
  closeChest(): void;
  /** Moves up to `n` of a stack between the pack and the open chest. */
  stow(key: number, n: number, into: 'chest' | 'pack'): void;
  /** Everything but the held item goes in the chest. */
  stowAll(): void;
  /** Craft mode: put a pack material in the first empty slot, or empty a slot. */
  craftPut(key: number): void;
  craftClearSlot(index: number): void;
  /** Fill the slots the way a known recipe was made last. */
  craftFill(template: string): void;
  craftMake(): void;
  sharpen(): void;
  upgrade(part: PickPart, material: number): void;
}
