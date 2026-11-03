import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { Chests, storeAll, transfer } from './Chests';
import { Pack } from './Pack';

// Weights: 1 = dirt (3), 2 = stone (6).
const weights: Record<number, number> = { 1: 3, 2: 6 };
const weightOf = (id: number) => weights[id] ?? 1;
const chestTuning = { ...tuningData.pack, capacity: 30, hardLimit: 1 };

describe('Chests', () => {
  it('locks a chest with anything in it, and forgets a removed one', () => {
    const chests = new Chests(chestTuning, weightOf);
    const chest = chests.create(4, 5);
    expect(chests.isLocked(4, 5)).toBe(false);
    chest.add(1);
    expect(chests.isLocked(4, 5)).toBe(true);
    chests.remove(4, 5);
    expect(chests.get(4, 5)).toBeUndefined();
  });

  it('round-trips through a snapshot', () => {
    const chests = new Chests(chestTuning, weightOf);
    chests.create(1, 2).add(2, 3);
    chests.create(-3, 9);
    const copy = new Chests(chestTuning, weightOf);
    copy.restore(chests.snapshot());
    expect(copy.snapshot()).toEqual(chests.snapshot());
    expect(copy.get(1, 2)!.count(2)).toBe(3);
  });

  it('notices changes inside a chest', () => {
    const chests = new Chests(chestTuning, weightOf);
    const chest = chests.create(0, 0);
    const v = chests.version;
    chest.add(1);
    expect(chests.version).not.toBe(v);
  });
});

describe('transfer', () => {
  it('moves only what fits in a chest, which never overloads', () => {
    const pack = new Pack(tuningData.pack, weightOf);
    const chest = new Pack(chestTuning, weightOf);
    pack.add(2, 8);
    // 30 / 6 = 5 stone fit.
    expect(transfer(pack, chest, 2, 8)).toBe(5);
    expect(pack.count(2)).toBe(3);
    expect(chest.count(2)).toBe(5);
    expect(transfer(pack, chest, 2, 1)).toBe(0);
  });

  it('stores everything but the held item', () => {
    const pack = new Pack(tuningData.pack, weightOf);
    const chest = new Pack({ ...chestTuning, capacity: 1000 }, weightOf);
    pack.add(1, 2);
    pack.add(2, 2);
    pack.select(1);
    expect(storeAll(pack, chest, pack.held)).toBe(1);
    expect(pack.items).toEqual([{ numId: 1, count: 2 }]);
    expect(chest.count(2)).toBe(2);
  });
});
