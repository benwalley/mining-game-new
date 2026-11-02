import { describe, expect, it } from 'vitest';
import { stripPositions } from './carousel';

describe('stripPositions', () => {
  it('puts the current mode in the window and the others around it', () => {
    expect(stripPositions(0, 2, 0)).toEqual([0, 1]);
    expect(stripPositions(1, 3, 0)).toEqual([-1, 0, 1]);
  });

  it('slides up with a forward drag: the next mode rises into the window from below', () => {
    const [cur, next] = stripPositions(0, 2, 0.3);
    expect(cur).toBeCloseTo(-0.3);
    expect(next).toBeCloseTo(0.7);
  });

  it('slides down with a backward drag: the other mode drops in from above, wrapping', () => {
    const [cur, other] = stripPositions(0, 2, -0.3);
    expect(cur).toBeCloseTo(0.3);
    expect(other).toBeCloseTo(-0.7);
  });

  it('is endless: the first mode follows the last', () => {
    const [first, , last] = stripPositions(2, 3, 0.5);
    expect(last).toBeCloseTo(-0.5);
    expect(first).toBeCloseTo(0.5);
  });

  it('keeps every mode in range, so a long scrub never leaves a gap', () => {
    for (let progress = -7; progress <= 7; progress += 0.25) {
      for (const p of stripPositions(1, 3, progress)) {
        expect(Math.abs(p)).toBeLessThanOrEqual(1.5);
      }
    }
  });
});
