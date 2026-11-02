import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { Pack } from './Pack';

// Weights: 1 = dirt (3), 2 = stone (6).
const weights: Record<number, number> = { 1: 3, 2: 6 };
const make = () => new Pack(tuningData.pack, (id) => weights[id] ?? 1);

describe('Pack', () => {
  it('adds stacks in the order they first arrive and sums weight', () => {
    const pack = make();
    pack.add(2, 2);
    pack.add(1, 3);
    pack.add(2, 1);
    expect(pack.items).toEqual([
      { numId: 2, count: 3 },
      { numId: 1, count: 3 },
    ]);
    expect(pack.weight).toBe(27);
  });

  it('refuses to add past the hard limit', () => {
    const pack = make();
    // Capacity 200 × 1.5 = 300 = 100 dirt.
    expect(pack.add(1, 100)).toBe(true);
    expect(pack.canAdd(1)).toBe(false);
    expect(pack.add(1)).toBe(false);
    expect(pack.count(1)).toBe(100);
  });

  it('removes stacks that run out and keeps the rest in order', () => {
    const pack = make();
    pack.add(1, 2);
    pack.add(2, 1);
    expect(pack.take(1, 3)).toBe(false);
    expect(pack.take(1, 2)).toBe(true);
    expect(pack.items).toEqual([{ numId: 2, count: 1 }]);
  });

  it('keeps the held block set when its stack runs out', () => {
    const pack = make();
    pack.add(1, 1);
    pack.select(1);
    pack.take(1);
    expect(pack.held).toBe(1);
    expect(pack.count(1)).toBe(0);
  });

  it("can't hold something it doesn't carry", () => {
    const pack = make();
    pack.select(2);
    expect(pack.held).toBeNull();
  });

  it('only reorders when told to', () => {
    const pack = make();
    pack.add(1);
    pack.add(2);
    pack.move(1, 0);
    expect(pack.items.map((i) => i.numId)).toEqual([2, 1]);
    pack.add(1);
    expect(pack.items.map((i) => i.numId)).toEqual([2, 1]);
  });

  it('slows from full to the hard limit in a straight line', () => {
    const pack = make();
    pack.add(1, 66);
    expect(pack.load).toBeLessThan(1);
    expect(pack.speedFactor).toBe(1);
    pack.add(1, 17); // 249 = 1.245 × capacity, halfway to 1.5.
    expect(pack.speedFactor).toBeCloseTo(1 - 0.55 * 0.49, 2);
    pack.add(1, 17); // 300.
    expect(pack.speedFactor).toBeCloseTo(0.45, 5);
    expect(pack.jumpFactor).toBeCloseTo(0.45, 5);
  });

  it('round-trips through a snapshot', () => {
    const pack = make();
    pack.add(2, 4);
    pack.add(1, 5);
    pack.select(1);
    const copy = make();
    copy.restore(pack.snapshot());
    expect(copy.snapshot()).toEqual(pack.snapshot());
    expect(copy.held).toBe(1);
  });
});
