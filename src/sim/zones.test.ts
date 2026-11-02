import { describe, expect, it } from 'vitest';
import { Zone, Zones } from './zones';

const zones = () => new Zones({ activeRadiusChunks: 1, nearRadiusChunks: 3, nearEvery: 2 });

describe('Zones', () => {
  it('rings the player with active, near and far chunks', () => {
    const z = zones();
    z.centerOn(5 * 32 + 3, 10 * 32 + 30);
    expect(z.zoneOf(5, 10)).toBe(Zone.Active);
    expect(z.zoneOf(6, 9)).toBe(Zone.Active);
    expect(z.zoneOf(8, 10)).toBe(Zone.Near);
    expect(z.zoneOf(5, 14)).toBe(Zone.Far);
  });

  it('runs near chunks on every other tick with double steps, and far ones never', () => {
    const z = zones();
    z.centerOn(0, 0);
    const runs = { active: 0, near: 0, far: 0 };
    for (let t = 0; t < 10; t++) {
      z.advance();
      if (z.runsNow(0, 0)) runs.active++;
      if (z.runsNow(3, 0)) runs.near++;
      if (z.runsNow(9, 9)) runs.far++;
    }
    expect(runs).toEqual({ active: 10, near: 5, far: 0 });
    expect(z.dtScale(3, 0)).toBe(2);
  });
});
