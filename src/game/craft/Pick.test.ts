import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { loadCrafting } from '@/content/crafting';
import { loadMaterials } from '@/content/materials';
import { Pack } from '../pack/Pack';
import { Pick } from './Pick';

const materials = loadMaterials();
const crafting = loadCrafting(materials);
const id = (key: string) => materials.require(key).numId;
const t = tuningData.pick;
const newPick = () => new Pick(t, materials, crafting.pick);
const newPack = () => new Pack(tuningData.pack, (k) => materials.get(k)?.weight ?? 0);

describe('Pick', () => {
  it('starts as a stone head on a rootwood handle that digs like the old fixed pick', () => {
    const s = newPick().stats;
    expect(s.power).toBe(tuningData.dig.defaultToolPower);
    expect(s.heft).toBe(1);
    expect(s.dullness).toBe(1);
  });

  it('dulls with each tile, slowing digging up to a limit', () => {
    const pick = newPick();
    for (let i = 0; i < 10_000; i++) pick.wearOne();
    expect(pick.wear).toBe(t.maxWear);
    expect(pick.stats.dullness).toBeCloseTo(1 + t.maxWear * t.dullSlowdown);
    expect(pick.sharpness).toBe(0);
  });

  it('dulls slower with a tougher head', () => {
    const pick = newPick();
    const stone = pick.stats.wearPerTile;
    expect(pick.statsWith(id('iron'), pick.handle, 0).wearPerTile).toBeLessThan(stone);
  });

  it('sharpens for a little stone, and not when already sharp', () => {
    const pick = newPick();
    const pack = newPack();
    pack.add(id('stone'), t.sharpenCount);
    expect(pick.sharpen(pack)).toBe('same');
    pick.wearOne();
    expect(pick.sharpen(newPack())).toBe('short');
    expect(pick.sharpen(pack)).toBe('done');
    expect(pick.wear).toBe(0);
    expect(pack.count(id('stone'))).toBe(0);
  });

  it('upgrades a part from fitting material, which digs harder rock and comes sharp', () => {
    const pick = newPick();
    const pack = newPack();
    pack.add(id('iron'), t.headCount);
    pick.wearOne();
    expect(pick.upgrade('head', id('dirt'), pack)).toBe('unfit');
    expect(pick.upgrade('head', id('stone'), pack)).toBe('same');
    expect(pick.upgrade('head', id('iron'), pack)).toBe('done');
    expect(pick.head).toBe(id('iron'));
    expect(pick.wear).toBe(0);
    expect(pick.stats.power).toBe(materials.require('iron').hardness + t.powerOffset);
    expect(pick.stats.heft).toBeGreaterThan(1);
    expect(pack.count(id('iron'))).toBe(0);
  });

  it('round-trips through a snapshot', () => {
    const pick = newPick();
    pick.wearOne();
    const copy = newPick();
    copy.restore(pick.snapshot());
    expect(copy.snapshot()).toEqual(pick.snapshot());
  });
});
