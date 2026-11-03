import type { PackTuning } from '@/content/tuning';
import { Pack } from './Pack';

/** What a save keeps of the chests: where each one is and what it holds, in order. */
export type ChestsSnapshot = [x: number, y: number, items: [key: number, count: number][]][];

/**
 * What every placed chest holds, by tile. Each chest is a `Pack` with its own
 * weight limit and no overload. Chests live with the pack on the main thread
 * (the sim only knows the tile), so moving things in and out is instant.
 */
export class Chests {
  revision = 0;
  private readonly byTile = new Map<string, Pack>();

  constructor(
    private readonly tuning: PackTuning,
    private readonly weightOf: (key: number) => number,
  ) {}

  get(x: number, y: number): Pack | undefined {
    return this.byTile.get(tileKey(x, y));
  }

  /** A chest with things in it can't be dug. */
  isLocked(x: number, y: number): boolean {
    return (this.get(x, y)?.kinds ?? 0) > 0;
  }

  create(x: number, y: number): Pack {
    const existing = this.get(x, y);
    if (existing) return existing;
    const chest = new Pack(this.tuning, this.weightOf);
    this.byTile.set(tileKey(x, y), chest);
    this.revision++;
    return chest;
  }

  remove(x: number, y: number): void {
    if (this.byTile.delete(tileKey(x, y))) this.revision++;
  }

  /** Changes inside any chest count too, so the save notices them. */
  get version(): number {
    let v = this.revision;
    for (const chest of this.byTile.values()) v += chest.revision;
    return v;
  }

  snapshot(): ChestsSnapshot {
    return [...this.byTile].map(([k, chest]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return [x, y, chest.snapshot().items];
    });
  }

  restore(s: ChestsSnapshot): void {
    this.byTile.clear();
    for (const [x, y, items] of s) this.create(x, y).restore({ items, held: null });
    this.revision++;
  }
}

/**
 * Moves up to `n` of something from one pack to another, as many as there are
 * and as fit. Returns how many moved.
 */
export function transfer(from: Pack, to: Pack, key: number, n: number): number {
  const moved = Math.min(n, from.count(key), to.room(key));
  if (moved <= 0) return 0;
  from.take(key, moved);
  to.add(key, moved);
  return moved;
}

/** Moves everything except `keep` (the held item). Returns how many stacks moved whole. */
export function storeAll(from: Pack, to: Pack, keep: number | null): number {
  let whole = 0;
  for (const { numId, count } of [...from.items]) {
    if (numId === keep) continue;
    if (transfer(from, to, numId, count) === count) whole++;
  }
  return whole;
}

const tileKey = (x: number, y: number): string => `${x},${y}`;
