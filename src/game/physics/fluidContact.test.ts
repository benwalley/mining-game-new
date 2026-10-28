import { describe, expect, it } from 'vitest';
import { senseFluid, type FluidFn } from './fluidContact';

/** Rows of fluid amounts for fluid type 1 ('.' none, '1'–'8'). */
function water(rows: string[]): FluidFn {
  return (x, y) => {
    const ch = rows[y]?.[x];
    return ch && ch !== '.' ? (1 << 4) | Number(ch) : 0;
  };
}

const box = (y: number) => ({ x: 0.5, y, w: 0.8, h: 0.8 });

describe('senseFluid', () => {
  it('reports no fluid in air', () => {
    expect(senseFluid(box(2), water(['.', '.', '.'])).submersion).toBe(0);
  });

  it('measures a half-full tile as half depth', () => {
    const c = senseFluid(box(2), water(['.', '4']));
    expect(c.fluid).toBe(1);
    expect(c.submersion).toBeCloseTo(0.5 / 0.8);
    expect(c.headFluid).toBe(0);
  });

  it('counts full tiles under more fluid as completely full', () => {
    const c = senseFluid(box(2.5), water(['8', '8', '8']));
    expect(c.submersion).toBe(1);
    expect(c.headFluid).toBe(1);
  });
});
