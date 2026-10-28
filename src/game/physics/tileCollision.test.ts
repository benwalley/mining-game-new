import { describe, expect, it } from 'vitest';
import { canStepUp, inShaft, moveX, moveY, touching, type SolidFn } from './tileCollision';

/** Builds a solid-test from ASCII rows: '#' is solid. Row 0 is y = 0. */
function grid(rows: string[]): SolidFn {
  return (x, y) => rows[y]?.[x] === '#' || y < 0 || y >= rows.length;
}

const box = (x: number, y: number) => ({ x, y, w: 0.75, h: 1.8 });

describe('tile collision', () => {
  const world = grid([
    '..........', // 0
    '..........', // 1
    '..........', // 2
    '.....#....', // 3
    '##########', // 4
  ]);

  it('lands on the floor', () => {
    const res = moveY(box(2.5, 3.9), 0.3, world);
    expect(res).toEqual({ value: 4, hit: true });
    expect(touching(box(2.5, 4), 'down', world)).toBe(true);
  });

  it('stops flush against a wall', () => {
    const res = moveX(box(4.5, 4), 0.3, world);
    expect(res.hit).toBe(true);
    expect(res.value + 0.375).toBeCloseTo(5);
  });

  it('allows stepping up a 1-tile ledge', () => {
    expect(canStepUp(box(4.625, 4), 1, world)).toBe(true);
  });

  it('refuses to step up a 2-tile wall', () => {
    const tall = grid(['..........', '..........', '.....#....', '.....#....', '##########']);
    expect(canStepUp(box(4.625, 4), 1, tall)).toBe(false);
  });

  it('detects a 1-wide shaft', () => {
    const shaft = grid(['##.##', '##.##', '##.##', '#####']);
    expect(inShaft(box(2.5, 3), shaft)).toBe(true);
    expect(inShaft(box(2.5, 3), grid(['.....', '.....', '.....', '#####']))).toBe(false);
  });
});
