import type { Box, SolidFn } from '../physics/tileCollision';

/** Whether nothing solid lies between two points, ignoring the tiles at either end. */
export function lineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  solid: SolidFn,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.25);
  const startX = Math.floor(fromX);
  const startY = Math.floor(fromY);
  const endX = Math.floor(toX);
  const endY = Math.floor(toY);
  for (let i = 1; i < steps; i++) {
    const tx = Math.floor(fromX + (dx * i) / steps);
    const ty = Math.floor(fromY + (dy * i) / steps);
    if ((tx === startX && ty === startY) || (tx === endX && ty === endY)) continue;
    if (solid(tx, ty)) return false;
  }
  return true;
}

export type PlaceBlocker = 'unloaded' | 'solid' | 'offscreen' | 'occupied' | 'hidden';

export interface PlaceContext {
  isLoaded(x: number, y: number): boolean;
  solid: SolidFn;
  box: Box;
  /** The tiles on screen, as a half-open rectangle. */
  view: { x0: number; y0: number; x1: number; y1: number };
}

/** Why a block can't go at this tile, or null if it can. */
export function placeBlocker(x: number, y: number, ctx: PlaceContext): PlaceBlocker | null {
  if (x < ctx.view.x0 || x >= ctx.view.x1 || y < ctx.view.y0 || y >= ctx.view.y1) {
    return 'offscreen';
  }
  if (!ctx.isLoaded(x, y)) return 'unloaded';
  if (ctx.solid(x, y)) return 'solid';
  const b = ctx.box;
  const overlaps = x + 1 > b.x - b.w / 2 && x < b.x + b.w / 2 && y + 1 > b.y - b.h && y < b.y;
  if (overlaps) return 'occupied';
  if (!lineOfSight(b.x, b.y - b.h / 2, x + 0.5, y + 0.5, ctx.solid)) return 'hidden';
  return null;
}

/** The tile the ghost starts on: the one the player is facing, at body height. */
export function facingTile(box: Box, facing: 1 | -1): { x: number; y: number } {
  return { x: Math.floor(box.x) + facing, y: Math.floor(box.y - box.h / 2) };
}
