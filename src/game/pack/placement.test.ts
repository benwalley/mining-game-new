import { describe, expect, it } from 'vitest';
import type { SolidFn } from '../physics/tileCollision';
import {
  bodyTile,
  isReachable,
  placeBlocker,
  reachMask,
  type PlaceContext,
  type TileView,
} from './placement';

const grid =
  (rows: string[]): SolidFn =>
  (x, y) =>
    rows[y]?.[x] === '#';

const view: TileView = { x0: 0, y0: 0, x1: 7, y1: 4 };

describe('reachMask', () => {
  it('finds a way around an obstacle through open tiles', () => {
    const solid = grid(['.......', '..#....', '.......', '#######']);
    const reach = reachMask({ x: 0, y: 1 }, solid, view);
    expect(isReachable(reach, 4, 1)).toBe(true);
    expect(isReachable(reach, 2, 1)).toBe(false); // The block itself.
  });

  it('does not squeeze diagonally between two blocks', () => {
    // (0,0) is shut in on its two open sides, and only touches the open tile (1,1) at a corner.
    const solid = grid(['.#.....', '#......', '.......', '#######']);
    expect(isReachable(reachMask({ x: 3, y: 2 }, solid, view), 0, 0)).toBe(false);
  });

  it('cannot reach a pocket walled off from the player', () => {
    const solid = grid(['...#...', '...#...', '...#...', '#######']);
    const reach = reachMask({ x: 0, y: 1 }, solid, view);
    expect(isReachable(reach, 5, 1)).toBe(false);
    expect(isReachable(reach, 2, 1)).toBe(true);
  });

  it('stays inside the view', () => {
    // The only way round the wall runs off the top of the view.
    const solid = grid(['.......', '...#...', '...#...', '#######']);
    expect(isReachable(reachMask({ x: 0, y: 2 }, solid, view), 5, 2)).toBe(true);
    const clipped = { ...view, y0: 1 };
    expect(isReachable(reachMask({ x: 0, y: 2 }, solid, clipped), 5, 2)).toBe(false);
  });

  it('reaches nothing when the player is outside the view', () => {
    const reach = reachMask({ x: 20, y: 1 }, grid(['.......']), view);
    expect(isReachable(reach, 3, 1)).toBe(false);
  });
});

describe('placeBlocker', () => {
  const rows = ['.......', '..#....', '.......', '#######'];
  // Standing on row 2, body filling row 1 at x = 0.5.
  const box = { x: 0.5, y: 2, w: 0.8, h: 0.8 };
  const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => {
    const solid = over.solid ?? grid(rows);
    return {
      isLoaded: () => true,
      solid,
      box,
      view,
      reach: reachMask(bodyTile(box), solid, view),
      ...over,
    };
  };

  it('allows an empty, reachable tile', () => {
    expect(placeBlocker(1, 0, ctx())).toBeNull();
  });

  it('refuses each way a tile can be unusable', () => {
    expect(placeBlocker(2, 1, ctx())).toBe('solid');
    expect(placeBlocker(9, 1, ctx())).toBe('offscreen');
    expect(placeBlocker(3, 0, ctx({ isLoaded: () => false }))).toBe('unloaded');
    expect(placeBlocker(0, 1, ctx())).toBe('occupied');
  });

  it('allows a tile it could only reach by going around a block', () => {
    // The block at (2,1) is between them, but row 0 and row 2 are open.
    expect(placeBlocker(4, 1, ctx())).toBeNull();
  });

  it('refuses a tile in a pocket it could only reach by breaking blocks', () => {
    const solid = grid(['...#...', '...#...', '...#...', '#######']);
    expect(placeBlocker(5, 1, ctx({ solid, reach: reachMask(bodyTile(box), solid, view) }))).toBe(
      'unreachable',
    );
  });
});

describe('bodyTile', () => {
  it('is the tile at the middle of the body', () => {
    expect(bodyTile({ x: 3.5, y: 2, w: 0.8, h: 0.8 })).toEqual({ x: 3, y: 1 });
  });
});
