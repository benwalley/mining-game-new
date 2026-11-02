import { describe, expect, it } from 'vitest';
import type { SolidFn } from '../physics/tileCollision';
import { facingTile, lineOfSight, placeBlocker, type PlaceContext } from './placement';

const grid =
  (rows: string[]): SolidFn =>
  (x, y) =>
    rows[y]?.[x] === '#';

describe('lineOfSight', () => {
  const solid = grid(['.......', '..#....', '.......', '#######']);

  it('sees along open rows', () => {
    expect(lineOfSight(0.5, 0.5, 6.5, 0.5, solid)).toBe(true);
  });

  it('is blocked by a solid tile in between', () => {
    expect(lineOfSight(0.5, 1.5, 6.5, 1.5, solid)).toBe(false);
  });

  it('ignores solid tiles at either end', () => {
    expect(lineOfSight(2.5, 0.5, 2.5, 1.5, solid)).toBe(true);
    expect(lineOfSight(2.5, 1.5, 2.5, 0.5, solid)).toBe(true);
  });
});

describe('placeBlocker', () => {
  const rows = ['.......', '..#....', '.......', '#######'];
  const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => ({
    isLoaded: () => true,
    solid: grid(rows),
    // Standing on row 2, body filling row 1 at x = 0.5.
    box: { x: 0.5, y: 2, w: 0.8, h: 0.8 },
    view: { x0: 0, y0: 0, x1: 7, y1: 4 },
    ...over,
  });

  it('allows an empty, visible tile', () => {
    expect(placeBlocker(1, 0, ctx())).toBeNull();
  });

  it('refuses each way a tile can be unusable', () => {
    expect(placeBlocker(2, 1, ctx())).toBe('solid');
    expect(placeBlocker(9, 1, ctx())).toBe('offscreen');
    expect(placeBlocker(3, 0, ctx({ isLoaded: () => false }))).toBe('unloaded');
    expect(placeBlocker(0, 1, ctx())).toBe('occupied');
    expect(placeBlocker(4, 1, ctx())).toBe('hidden');
  });
});

describe('facingTile', () => {
  it('is the tile ahead of the body', () => {
    const box = { x: 3.5, y: 2, w: 0.8, h: 0.8 };
    expect(facingTile(box, 1)).toEqual({ x: 4, y: 1 });
    expect(facingTile(box, -1)).toEqual({ x: 2, y: 1 });
  });
});
