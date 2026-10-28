import { describe, expect, it } from 'vitest';
import { createRng, hash2 } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('world-1');
    const b = createRng('world-1');
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next));
  });

  it('diverges for different seeds and forks', () => {
    const base = createRng('world-1');
    expect(createRng('world-2').next()).not.toBe(createRng('world-1').next());
    expect(base.fork('caves').next()).not.toBe(base.fork('ore').next());
  });

  it('resumes from a saved state', () => {
    const a = createRng(7);
    a.next();
    const resumed = createRng(7, a.getState());
    expect(resumed.next()).toBe(a.next());
  });

  it('keeps int() within bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
    }
  });
});

describe('hash2', () => {
  it('is stateless and in [0, 1)', () => {
    expect(hash2(1, 10, 20)).toBe(hash2(1, 10, 20));
    for (let i = 0; i < 100; i++) {
      const v = hash2(42, i, -i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
