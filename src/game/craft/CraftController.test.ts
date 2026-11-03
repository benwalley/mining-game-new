import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { loadCrafting } from '@/content/crafting';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import { craftView } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import { Pack } from '../pack/Pack';
import { CraftController } from './CraftController';
import { itemKey, keyMaterial } from './itemKey';
import { Pick } from './Pick';
import { Recipes } from './recipes';

const materials = loadMaterials();
const crafting = loadCrafting(materials);
const id = (key: string) => materials.require(key).numId;

function setup() {
  const pack = new Pack(tuning.pack, (k) => materials.get(keyMaterial(k))?.weight ?? 0);
  const pick = new Pick(tuning.pick, materials, crafting.pick);
  const recipes = new Recipes();
  const events = new EventBus<GameEvents>();
  const seen: string[] = [];
  events.on('crafted', (e) => seen.push(e.first ? 'found' : 'crafted'));
  events.on('craftDenied', () => seen.push('denied'));
  events.on('sharpened', () => seen.push('sharpened'));
  const ctl = new CraftController({
    crafting,
    materials,
    pack,
    pick,
    recipes,
    events,
    tuning,
    itemView: (key, count) => ({
      numId: key,
      name: materials.get(keyMaterial(key))?.name ?? '?',
      color: '',
      wearable: false,
      stats: null,
      icon: '',
      count,
      unitWeight: 0,
    }),
  });
  ctl.publish();
  return { ctl, pack, pick, recipes, seen };
}

describe('CraftController', () => {
  it('lets a new player stumble on a torch from what they dug', () => {
    const { ctl, pack, seen } = setup();
    pack.add(id('rootwood'), 2);
    pack.add(id('coal'), 1);
    ctl.put(id('coal'));
    expect(craftView.value!.result).toBeNull();
    expect(craftView.value!.tried).toBe(true);
    ctl.put(id('rootwood'));
    const result = craftView.value!.result!;
    expect(result.known).toBe(false);
    expect(result.affordable).toBe(true);
    ctl.make();
    expect(seen).toEqual(['found']);
    expect(pack.count(itemKey(id('torch'), id('coal')))).toBe(4);
    // The coal ran out, so its slot emptied; the rootwood stays for another go.
    expect(craftView.value!.slots.map((s) => s?.numId ?? null)).toEqual([
      null,
      id('rootwood'),
      null,
    ]);
    expect(craftView.value!.known.map((k) => k.key)).toEqual(['torch']);
  });

  it('refills the slots from a known recipe, and says when the pack is short', () => {
    const { ctl, pack, seen } = setup();
    pack.add(id('stone'), 12);
    ctl.put(id('stone'));
    ctl.make();
    ctl.fill('chest');
    expect(craftView.value!.result?.known).toBe(true);
    ctl.make();
    expect(pack.count(id('chest'))).toBe(2);
    ctl.fill('chest');
    expect(craftView.value!.result?.affordable).toBe(false);
    ctl.make();
    expect(seen).toEqual(['found', 'crafted', 'denied']);
  });

  it("won't put crafted items or missing materials in a slot", () => {
    const { ctl, pack } = setup();
    pack.add(itemKey(id('torch'), id('coal')), 1);
    ctl.put(itemKey(id('torch'), id('coal')));
    ctl.put(id('iron'));
    expect(craftView.value!.slots.every((s) => s === null)).toBe(true);
  });

  it('sharpens and offers head upgrades from what the pack holds', () => {
    const { ctl, pack, pick, seen } = setup();
    pack.add(id('stone'), 2);
    pack.add(id('iron'), 1);
    pick.wearOne();
    ctl.sharpen();
    expect(seen).toEqual(['sharpened']);
    const options = craftView.value!.pick.head.options;
    expect(options.map((o) => o.item.numId)).toEqual([id('iron')]);
    expect(options[0]!.power).toBeGreaterThan(0);
    expect(options[0]!.affordable).toBe(false);
  });
});
