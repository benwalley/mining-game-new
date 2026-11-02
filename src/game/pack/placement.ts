import type { Box, SolidFn } from '../physics/tileCollision';

/** A rectangle of tiles, half-open: `x1` and `y1` are one past the last tile. */
export interface TileView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Which tiles in a view the player could get to through open tiles. Row-major, one byte per tile. */
export interface ReachMask {
  view: TileView;
  mask: Uint8Array;
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Every tile the player could get to without breaking anything. Steps are up,
 * down, left and right, so squeezing diagonally between two blocks doesn't
 * count, and the search stays inside the view.
 */
export function reachMask(
  from: { x: number; y: number },
  solid: SolidFn,
  view: TileView,
): ReachMask {
  const w = view.x1 - view.x0;
  const h = view.y1 - view.y0;
  const mask = new Uint8Array(Math.max(0, w * h));
  const result = { view, mask };
  if (!inside(view, from.x, from.y)) return result;
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const visit = (x: number, y: number): void => {
    const i = (y - view.y0) * w + (x - view.x0);
    mask[i] = 1;
    queue[tail++] = i;
  };
  visit(from.x, from.y);
  while (head < tail) {
    const i = queue[head++]!;
    const x = view.x0 + (i % w);
    const y = view.y0 + Math.floor(i / w);
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(view, nx, ny) || mask[(ny - view.y0) * w + (nx - view.x0)] || solid(nx, ny)) {
        continue;
      }
      visit(nx, ny);
    }
  }
  return result;
}

export function isReachable(reach: ReachMask, x: number, y: number): boolean {
  const { view, mask } = reach;
  return inside(view, x, y) && mask[(y - view.y0) * (view.x1 - view.x0) + (x - view.x0)] === 1;
}

export type PlaceBlocker = 'unloaded' | 'solid' | 'offscreen' | 'occupied' | 'unreachable';

export interface PlaceContext {
  isLoaded(x: number, y: number): boolean;
  solid: SolidFn;
  box: Box;
  view: TileView;
  reach: ReachMask;
}

/** Why a block can't go at this tile, or null if it can. */
export function placeBlocker(x: number, y: number, ctx: PlaceContext): PlaceBlocker | null {
  if (!inside(ctx.view, x, y)) return 'offscreen';
  if (!ctx.isLoaded(x, y)) return 'unloaded';
  if (ctx.solid(x, y)) return 'solid';
  const b = ctx.box;
  const overlaps = x + 1 > b.x - b.w / 2 && x < b.x + b.w / 2 && y + 1 > b.y - b.h && y < b.y;
  if (overlaps) return 'occupied';
  if (!isReachable(ctx.reach, x, y)) return 'unreachable';
  return null;
}

/** The tile the player is standing in, at body height. */
export function bodyTile(box: Box): { x: number; y: number } {
  return { x: Math.floor(box.x), y: Math.floor(box.y - box.h / 2) };
}

const inside = (v: TileView, x: number, y: number): boolean =>
  x >= v.x0 && x < v.x1 && y >= v.y0 && y < v.y1;
