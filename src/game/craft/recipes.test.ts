import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { loadCrafting } from '@/content/crafting';
import { loadMaterials } from '@/content/materials';
import { Pack } from '../pack/Pack';
import { itemKey, keyMaterial, keyVariant, keyVariant2 } from './itemKey';
import { craft, matchSlots, Recipes } from './recipes';

const materials = loadMaterials();
const { templates } = loadCrafting(materials);
const id = (key: string) => materials.require(key).numId;
const newPack = () => new Pack(tuningData.pack, (k) => materials.get(keyMaterial(k))?.weight ?? 0);

describe('itemKey', () => {
  it('keeps old torch keys and round-trips two materials', () => {
    expect(itemKey(24, 7)).toBe(24 | (7 << 10));
    const k = itemKey(id('rocket-boots'), id('starsilver'), id('ember-crystal'));
    expect([keyMaterial(k), keyVariant(k), keyVariant2(k)]).toEqual([
      id('rocket-boots'),
      id('starsilver'),
      id('ember-crystal'),
    ]);
    expect(keyVariant2(itemKey(24, 7))).toBe(0);
  });
});

describe('matchSlots', () => {
  it('makes rocket boots from metal and coal, and a heat suit from rock and a lining', () => {
    const boots = matchSlots([id('coal'), id('copper'), null], templates)!;
    expect(boots.template.key).toBe('rocket-boots');
    expect([keyVariant(boots.result), keyVariant2(boots.result)]).toEqual([
      id('copper'),
      id('coal'),
    ]);
    expect(boots.cost.get(id('copper'))).toBe(3);
    const suit = matchSlots([id('rootwood'), id('stone'), null], templates)!;
    expect(suit.template.key).toBe('heat-suit');
    expect([keyVariant(suit.result), keyVariant2(suit.result)]).toEqual([
      id('stone'),
      id('rootwood'),
    ]);
    // Torches still win wherever rootwood could be a shaft.
    expect(matchSlots([id('rootwood'), id('coal'), null], templates)?.template.key).toBe('torch');
  });

  it('finds a torch whichever slot holds the fuel, and keeps the fuel on the item', () => {
    for (const slots of [
      [id('rootwood'), id('coal'), null],
      [null, id('coal'), id('rootwood')],
    ]) {
      const m = matchSlots(slots, templates);
      expect(m?.template.key).toBe('torch');
      expect(keyMaterial(m!.result)).toBe(id('torch'));
      expect(keyVariant(m!.result)).toBe(id('coal'));
      expect(m!.count).toBe(4);
    }
  });

  it('makes a rootwood torch from two rootwood slots, counting both parts in the cost', () => {
    const m = matchSlots([id('rootwood'), id('rootwood'), null], templates);
    expect(m?.template.key).toBe('torch');
    expect(m!.cost.get(id('rootwood'))).toBe(2);
  });

  it('makes a chest from one slot of a sturdy material', () => {
    const m = matchSlots([null, id('stone'), null], templates);
    expect(m?.template.key).toBe('chest');
    expect(m!.cost.get(id('stone'))).toBe(6);
  });

  it('makes nothing from empty slots, stray extras or materials that fit no part', () => {
    expect(matchSlots([null, null, null], templates)).toBeNull();
    expect(matchSlots([id('rootwood'), id('coal'), id('stone')], templates)).toBeNull();
    expect(matchSlots([id('dirt'), null, null], templates)).toBeNull();
    expect(matchSlots([id('coal'), id('coal'), null], templates)).toBeNull();
  });

  it('only offers templates that can be made in this place', () => {
    expect(matchSlots([id('stone')], templates, 'forge')).toBeNull();
  });
});

describe('craft', () => {
  it('takes the cost and adds the result', () => {
    const pack = newPack();
    pack.add(id('rootwood'), 3);
    pack.add(id('coal'), 1);
    const m = matchSlots([id('rootwood'), id('coal')], templates)!;
    expect(craft(m, pack)).toBe('made');
    expect(pack.count(id('rootwood'))).toBe(2);
    expect(pack.count(id('coal'))).toBe(0);
    expect(pack.count(m.result)).toBe(4);
  });

  it('changes nothing when the pack is short', () => {
    const pack = newPack();
    pack.add(id('stone'), 5);
    const m = matchSlots([id('stone')], templates)!;
    expect(craft(m, pack)).toBe('short');
    expect(pack.count(id('stone'))).toBe(5);
  });

  it('gives the materials back when the result would not fit', () => {
    const pack = new Pack(
      { ...tuningData.pack, capacity: 10, hardLimit: 1 },
      (k) => materials.get(keyMaterial(k))?.weight ?? 0,
    );
    pack.add(id('dirt'), 3);
    // A made-up template: one dirt (3) in, one iron (8) out, which can't fit in 10.
    const heavy = {
      ...templates[0]!,
      key: 'test',
      makes: id('iron'),
      yield: 1,
      variantParts: [],
      parts: [{ key: 'a', name: 'A', count: 1, accepts: [id('dirt')] }],
    };
    const m = matchSlots([id('dirt')], [heavy])!;
    expect(craft(m, pack)).toBe('full');
    expect(pack.count(id('dirt'))).toBe(3);
    expect(pack.count(id('iron'))).toBe(0);
  });
});

describe('Recipes', () => {
  it('remembers a template and the materials last used, and says when it was new', () => {
    const r = new Recipes();
    const m = matchSlots([id('rootwood'), id('glowcap')], templates)!;
    expect(r.remember(m)).toBe(true);
    expect(r.remember(m)).toBe(false);
    expect(r.has('torch')).toBe(true);
    expect(r.last('torch')).toEqual([id('rootwood'), id('glowcap')]);
    const copy = new Recipes();
    copy.restore(r.snapshot());
    expect(copy.keys).toEqual(['torch']);
  });
});
