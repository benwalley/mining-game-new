import { EPS, bodyRows, canStepUp, type Box, type SolidFn } from '../physics/tileCollision';

export type DigDirection = 'left' | 'right' | 'up' | 'down';

export interface DigTarget {
  x: number;
  y: number;
  dir: DigDirection;
}

export interface DigContext {
  box: Box;
  /** Movement intent, each axis in [-1, 1]; y < 0 is up. */
  intentX: number;
  intentY: number;
  grounded: boolean;
  climbing: boolean;
  solid: SolidFn;
  /** How close (in tiles) the body must be to a face to dig it. */
  flushTolerance: number;
}

/**
 * Picks the tile the player means to dig. Digging is 4-directional: diagonal
 * input digs along its dominant axis (the doc's auto-assist). Only faces the
 * body is pressed against can be dug, so walking never digs by accident.
 */
export function chooseDigTarget(ctx: DigContext): DigTarget | null {
  const { box, intentX, intentY, solid, flushTolerance: tol } = ctx;
  const ax = Math.abs(intentX);
  const ay = Math.abs(intentY);
  if (ax === 0 && ay === 0) return null;
  const supported = ctx.grounded || ctx.climbing;

  if (ax >= ay) {
    if (!supported) return null;
    const dir: 1 | -1 = intentX > 0 ? 1 : -1;
    const edge = box.x + (dir * box.w) / 2;
    const boundary = Math.round(edge);
    if (Math.abs(edge - boundary) > tol) return null;
    const col = dir > 0 ? boundary : boundary - 1;
    // A 1-tile ledge is climbed automatically instead of dug.
    if (ctx.grounded && canStepUp(box, dir, solid)) return null;
    const [headRow, feetRow] = bodyRows(box);
    // Feet first, so a 2-tall tunnel never leaves a step behind.
    for (let r = feetRow; r >= headRow; r--) {
      if (solid(col, r)) return { x: col, y: r, dir: dir > 0 ? 'right' : 'left' };
    }
    return null;
  }

  const col = Math.floor(box.x);
  if (intentY < 0) {
    if (!supported) return null;
    // The tile right above the head's row. A body shorter than a tile always
    // has a gap above its head while standing, so that much gap still counts.
    const top = box.y - box.h;
    const headRow = Math.floor(top + EPS);
    if (top - headRow > Math.max(0, 1 - box.h) + tol) return null;
    const row = headRow - 1;
    return solid(col, row) ? { x: col, y: row, dir: 'up' } : null;
  }

  if (!ctx.grounded) return null;
  const row = Math.floor(box.y + EPS);
  return solid(col, row) ? { x: col, y: row, dir: 'down' } : null;
}
