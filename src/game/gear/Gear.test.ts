import { describe, expect, it } from 'vitest';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { itemKey, keyMaterial } from '../craft/itemKey';
import { Pack } from '../pack/Pack';
import { Gear } from './Gear';

const materials = loadMaterials();
const id = (key: string) => materials.require(key).numId;
const boots = (casing: string) => itemKey(id('rocket-boots'), id(casing), id('coal'));
const suit = (shell: string, lining: string) => itemKey(id('heat-suit'), id(shell), id(lining));

function setup(capacity: number = tuning.pack.capacity) {
  const weightOf = (k: number) => materials.get(keyMaterial(k))?.weight ?? 0;
  const holdable = (k: number) => materials.get(keyMaterial(k))?.kind !== 'gear';
  const pack = new Pack({ ...tuning.pack, capacity, hardLimit: 1 }, weightOf, holdable);
  const gear = new Gear(materials, { ...tuning, heatDamageFrom: tuning.vitals.heatDamageFrom });
  return { pack, gear };
}

describe('Gear', () => {
  it('wears from the pack into the right slot, and worn gear weighs nothing', () => {
    const { pack, gear } = setup();
    pack.add(boots('copper'));
    pack.add(suit('stone', 'spore-silk'));
    expect(gear.wear(boots('copper'), pack)).toBe(true);
    expect(gear.wear(suit('stone', 'spore-silk'), pack)).toBe(true);
    expect(gear.get('air')).toBe(boots('copper'));
    expect(gear.get('body')).toBe(suit('stone', 'spore-silk'));
    expect(pack.weight).toBe(0);
    expect(gear.boots?.seconds).toBeCloseTo(1.5);
    expect(gear.suit).toEqual({ raise: 60, cut: 0.8 });
    expect(gear.describe(suit('stone', 'spore-silk'))).toBe('Safe to 160° · 80% less burn');
  });

  it('swaps: the old piece goes back in the pack', () => {
    const { pack, gear } = setup();
    pack.add(boots('copper'));
    pack.add(boots('iron'));
    gear.wear(boots('copper'), pack);
    gear.wear(boots('iron'), pack);
    expect(gear.get('air')).toBe(boots('iron'));
    expect(pack.count(boots('copper'))).toBe(1);
    expect(pack.count(boots('iron'))).toBe(0);
  });

  it("won't take off into a full pack, and loses nothing trying", () => {
    const { pack, gear } = setup(5);
    pack.add(boots('copper'));
    gear.wear(boots('copper'), pack);
    pack.add(id('dirt'));
    expect(gear.takeOff('air', pack)).toBe(false);
    expect(gear.get('air')).toBe(boots('copper'));
  });

  it("isn't held as the block to place, even when it's the first thing in the pack", () => {
    const { pack } = setup();
    pack.add(boots('copper'));
    expect(pack.held).toBeNull();
    pack.select(boots('copper'));
    expect(pack.held).toBeNull();
    pack.add(id('dirt'));
    expect(pack.held).toBe(id('dirt'));
  });

  it('restores from a save, dropping anything in the wrong slot', () => {
    const { gear } = setup();
    gear.restore({ air: boots('copper'), body: boots('iron') });
    expect(gear.get('air')).toBe(boots('copper'));
    expect(gear.get('body')).toBeNull();
  });
});
