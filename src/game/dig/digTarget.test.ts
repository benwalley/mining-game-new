import { describe, expect, it } from 'vitest';
import type { SolidFn } from '../physics/tileCollision';
import { chooseDigTarget, type DigContext } from './digTarget';

function grid(rows: string[]): SolidFn {
  return (x, y) => rows[y]?.[x] === '#';
}

const base = (solid: SolidFn, x: number, y: number): DigContext => ({
  box: { x, y, w: 0.75, h: 1.8 },
  intentX: 0,
  intentY: 0,
  grounded: true,
  climbing: false,
  solid,
  flushTolerance: 0.05,
});

describe('chooseDigTarget', () => {
  // Player stands at y = 3 (feet on row 3) with body in rows 1–2.
  const wall = grid(['....#', '....#', '....#', '#####']);

  it('digs the feet tile first when pushing into a wall', () => {
    const ctx = { ...base(wall, 3.625, 3), intentX: 1 };
    expect(chooseDigTarget(ctx)).toEqual({ x: 4, y: 2, dir: 'right' });
  });

  it('digs the head tile once the feet tile is open', () => {
    const half = grid(['....#', '....#', '.....', '#####']);
    const ctx = { ...base(half, 3.625, 3), intentX: 1 };
    expect(chooseDigTarget(ctx)).toEqual({ x: 4, y: 1, dir: 'right' });
  });

  it('climbs a 1-tile ledge instead of digging it', () => {
    const ledge = grid(['.....', '.....', '....#', '#####']);
    expect(chooseDigTarget({ ...base(ledge, 3.625, 3), intentX: 1 })).toBeNull();
  });

  it('ignores walls the body is not pressed against', () => {
    expect(chooseDigTarget({ ...base(wall, 2.5, 3), intentX: 1 })).toBeNull();
  });

  it('digs down along the dominant axis of a diagonal', () => {
    const ctx = { ...base(wall, 1.5, 3), intentX: 0.3, intentY: 0.9 };
    expect(chooseDigTarget(ctx)).toEqual({ x: 1, y: 3, dir: 'down' });
  });

  it('digs up only into a ceiling the head touches', () => {
    const ceiling = grid(['#####', '.....', '.....', '#####']);
    expect(chooseDigTarget({ ...base(ceiling, 1.5, 2.8), intentY: -1 })).toEqual({
      x: 1,
      y: 0,
      dir: 'up',
    });
    expect(chooseDigTarget({ ...base(ceiling, 1.5, 3), intentY: -1 })).toBeNull();
  });

  it('does not dig sideways in mid-air', () => {
    const ctx = { ...base(wall, 3.625, 2.5), intentX: 1, grounded: false };
    expect(chooseDigTarget(ctx)).toBeNull();
  });
});
