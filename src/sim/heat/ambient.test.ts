import { describe, expect, it } from 'vitest';
import { ambientRows, fillAmbient } from './ambient';

describe('ambientRows', () => {
  const rows = ambientRows(
    [
      [0, 15],
      [100, 35],
      [200, 235],
    ],
    10,
    260,
  );

  it('is flat in the sky and past the last point, and linear between points', () => {
    expect(rows[0]).toBe(15);
    expect(rows[10]).toBe(15);
    expect(rows[60]).toBeCloseTo(25);
    expect(rows[110]).toBe(35);
    expect(rows[160]).toBeCloseTo(135);
    expect(rows[259]).toBe(235);
  });

  it('fills a chunk row by row, rounded', () => {
    const t = new Int16Array(4 * 4);
    fillAmbient(t, rows, 60, 4);
    expect([t[0], t[4], t[15]]).toEqual([25, 25, 26]);
  });
});
