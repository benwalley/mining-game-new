/**
 * Axis-separated movement of an axis-aligned box against the tile grid.
 * Units are tiles; y grows downward. Boxes are anchored at bottom-center (feet).
 * Per-step movement must stay under one tile, which holds at 60 Hz for our speeds.
 */

export interface Box {
  /** Center x. */
  x: number;
  /** Bottom (feet) y. */
  y: number;
  w: number;
  h: number;
}

export type SolidFn = (tx: number, ty: number) => boolean;

export const EPS = 1e-4;

export interface MoveResult {
  /** New coordinate on the moved axis. */
  value: number;
  hit: boolean;
}

const rowsOf = (b: Box): [number, number] => [Math.floor(b.y - b.h + EPS), Math.floor(b.y - EPS)];
const colsOf = (b: Box): [number, number] => [
  Math.floor(b.x - b.w / 2 + EPS),
  Math.floor(b.x + b.w / 2 - EPS),
];

function columnBlocked(col: number, rows: [number, number], solid: SolidFn): boolean {
  for (let r = rows[0]; r <= rows[1]; r++) if (solid(col, r)) return true;
  return false;
}

function rowBlocked(row: number, cols: [number, number], solid: SolidFn): boolean {
  for (let c = cols[0]; c <= cols[1]; c++) if (solid(c, row)) return true;
  return false;
}

export function moveX(box: Box, dx: number, solid: SolidFn): MoveResult {
  if (dx === 0) return { value: box.x, hit: false };
  const rows = rowsOf(box);
  const half = box.w / 2;
  if (dx > 0) {
    const right = box.x + half;
    const from = Math.floor(right - EPS) + 1;
    const to = Math.floor(right + dx - EPS);
    for (let c = from; c <= to; c++) {
      if (columnBlocked(c, rows, solid)) return { value: c - half, hit: true };
    }
  } else {
    const left = box.x - half;
    const from = Math.floor(left + EPS) - 1;
    const to = Math.floor(left + dx + EPS);
    for (let c = from; c >= to; c--) {
      if (columnBlocked(c, rows, solid)) return { value: c + 1 + half, hit: true };
    }
  }
  return { value: box.x + dx, hit: false };
}

export function moveY(box: Box, dy: number, solid: SolidFn): MoveResult {
  if (dy === 0) return { value: box.y, hit: false };
  const cols = colsOf(box);
  if (dy > 0) {
    const from = Math.floor(box.y - EPS) + 1;
    const to = Math.floor(box.y + dy - EPS);
    for (let r = from; r <= to; r++) {
      if (rowBlocked(r, cols, solid)) return { value: r, hit: true };
    }
  } else {
    const top = box.y - box.h;
    const from = Math.floor(top + EPS) - 1;
    const to = Math.floor(top + dy + EPS);
    for (let r = from; r >= to; r--) {
      if (rowBlocked(r, cols, solid)) return { value: r + 1 + box.h, hit: true };
    }
  }
  return { value: box.y + dy, hit: false };
}

export function overlapsSolid(box: Box, solid: SolidFn): boolean {
  const [r0, r1] = rowsOf(box);
  const cols = colsOf(box);
  for (let r = r0; r <= r1; r++) if (rowBlocked(r, cols, solid)) return true;
  return false;
}

/** True if the box is flush against a solid tile in the given direction. */
export function touching(box: Box, dir: 'left' | 'right' | 'up' | 'down', solid: SolidFn): boolean {
  const probe = 0.01;
  switch (dir) {
    case 'left':
      return moveX(box, -probe, solid).hit;
    case 'right':
      return moveX(box, probe, solid).hit;
    case 'up':
      return moveY(box, -probe, solid).hit;
    case 'down':
      return moveY(box, probe, solid).hit;
  }
}

/**
 * Whether the box can rise one tile and keep going in `dir`: the auto-climb for
 * 1-tile ledges. Assumes the caller already found the way ahead blocked.
 */
export function canStepUp(box: Box, dir: 1 | -1, solid: SolidFn): boolean {
  const raised = { ...box, y: box.y - 1 };
  if (overlapsSolid(raised, solid)) return false;
  return !moveX(raised, dir * 0.05, solid).hit;
}

/**
 * In a 1-wide vertical shaft: the box fits inside one column and some body row
 * has solid tiles on both sides. Shaft walls are climbable.
 */
export function inShaft(box: Box, solid: SolidFn): boolean {
  const col = Math.floor(box.x);
  const half = box.w / 2;
  if (box.x - half < col - EPS || box.x + half > col + 1 + EPS) return false;
  const [r0, r1] = rowsOf(box);
  for (let r = r0; r <= r1; r++) {
    if (solid(col - 1, r) && solid(col + 1, r)) return true;
  }
  return false;
}

export const bodyRows = rowsOf;
export const bodyCols = colsOf;
