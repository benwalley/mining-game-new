import type { EventBus } from '@/core/events/EventBus';
import type { CraftingData, TemplateDef } from '@/content/crafting';
import type { MaterialRegistry } from '@/content/materials';
import type { ChestTuning, PackTuning, TorchTuning } from '@/content/tuning';
import { craftView, type CraftResultView, type PackItemView } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import type { Pack } from '../pack/Pack';
import { keyVariant } from './itemKey';
import type { Pick, PickPart } from './Pick';
import { canAfford, craft, matchSlots, toMatch, type Match, type Recipes } from './recipes';

export interface CraftControllerDeps {
  crafting: CraftingData;
  materials: MaterialRegistry;
  pack: Pack;
  pick: Pick;
  recipes: Recipes;
  events: EventBus<GameEvents>;
  tuning: { pack: PackTuning; torch: TorchTuning; chest: ChestTuning };
  itemView(key: number, count: number): PackItemView;
}

/**
 * Craft mode's sheet: open slots that take materials from the pack, what they
 * make, the recipes found so far, and the pick's sharpening and upgrades. Holds
 * no rules of its own (those are in `recipes` and `Pick`); it keeps the slots
 * and turns everything into the `craftView` signal.
 */
export class CraftController {
  private slots: (number | null)[];
  private shown = '';

  constructor(private readonly d: CraftControllerDeps) {
    this.slots = new Array<number | null>(d.crafting.slots).fill(null);
  }

  /** Puts a material from the pack into the first empty slot. */
  put(key: number): void {
    if (keyVariant(key) !== 0 || this.d.pack.count(key) < 1) return;
    const i = this.slots.indexOf(null);
    if (i < 0) return;
    this.slots[i] = key;
    this.publish();
  }

  clearSlot(i: number): void {
    if (this.slots[i] === undefined) return;
    this.slots[i] = null;
    this.publish();
  }

  /** Fills the slots with what a known recipe used last time. */
  fill(template: string): void {
    const last = this.d.recipes.last(template);
    if (!last) return;
    this.slots.fill(null);
    last.forEach((m, i) => (this.slots[i] = m));
    this.publish();
  }

  make(): void {
    const match = this.match();
    if (!match) return;
    const outcome = craft(match, this.d.pack);
    if (outcome !== 'made') {
      this.d.events.emit('craftDenied', {});
      return this.publish();
    }
    const first = this.d.recipes.remember(match);
    this.d.events.emit('crafted', { result: match.result, count: match.count, first });
    // Slots whose material ran out empty themselves, so the next try starts clean.
    this.slots = this.slots.map((s) => (s !== null && this.d.pack.count(s) > 0 ? s : null));
    this.publish();
  }

  sharpen(): void {
    const outcome = this.d.pick.sharpen(this.d.pack);
    if (outcome === 'done') this.d.events.emit('sharpened', {});
    else this.d.events.emit('craftDenied', {});
    this.publish();
  }

  upgrade(part: PickPart, material: number): void {
    const outcome = this.d.pick.upgrade(part, material, this.d.pack);
    if (outcome === 'done') this.d.events.emit('upgraded', { part, material });
    else this.d.events.emit('craftDenied', {});
    this.publish();
  }

  /** Republishes when the pack, pick or recipes changed. Call every frame in craft mode. */
  update(): void {
    const { pack, pick, recipes } = this.d;
    const stamp = `${pack.revision}/${pick.revision}/${recipes.revision}`;
    if (stamp !== this.shown) this.publish();
  }

  private match(): Match | null {
    return matchSlots(this.slots, this.d.crafting.templates);
  }

  publish(): void {
    const { pack, pick, recipes, materials, crafting } = this.d;
    this.shown = `${pack.revision}/${pick.revision}/${recipes.revision}`;
    const view = (key: number) => this.d.itemView(key, pack.count(key));
    const match = this.match();
    const stats = pick.stats;
    const part = (p: PickPart) => {
      const current = pick[p];
      return {
        material: view(current),
        cost: pick.partCost(p),
        options: pick
          .options(p)
          .filter((m) => m !== current && pack.count(m) > 0)
          .map((m) => {
            const next = pick.statsWith(
              p === 'head' ? m : pick.head,
              p === 'handle' ? m : pick.handle,
              0,
            );
            return {
              item: view(m),
              affordable: pack.count(m) >= pick.partCost(p),
              power: next.power - stats.power,
              speed: Math.round((stats.heft / next.heft - 1) * 100),
            };
          }),
      };
    };
    const sharpen = pick.sharpenCost;
    craftView.value = {
      slots: this.slots.map((s) => (s === null ? null : view(s))),
      result: match ? this.result(match) : null,
      tried: this.slots.some((s) => s !== null),
      known: recipes.keys.flatMap((key) => {
        const t = crafting.templates.find((x) => x.key === key);
        const last = recipes.last(key);
        if (!t || !last) return [];
        const m = toMatch(t, last);
        return [{ key, name: t.name, icon: view(m.result).icon, affordable: canAfford(m, pack) }];
      }),
      materials: pack.items
        .filter(({ numId }) => keyVariant(numId) === 0 && materials.get(numId)?.kind === 'block')
        .map(({ numId, count }) => this.d.itemView(numId, count)),
      pick: {
        head: part('head'),
        handle: part('handle'),
        power: stats.power,
        speed: Math.round((1 / stats.heft) * 100),
        sharpness: pick.sharpness,
        dull: pick.dull,
        sharpen: { item: view(sharpen.material), count: sharpen.count },
      },
    };
  }

  private result(match: Match): CraftResultView {
    const { pack, recipes } = this.d;
    const item = this.d.itemView(match.result, pack.count(match.result));
    return {
      name: match.template.name,
      item,
      count: match.count,
      known: recipes.has(match.template.key),
      affordable: canAfford(match, pack),
      stats: this.describe(match.template, match),
      cost: [...match.cost].map(([m, need]) => ({ item: this.d.itemView(m, pack.count(m)), need })),
    };
  }

  /** One-line stats for what a template makes, from its materials. */
  private describe(template: TemplateDef, match: Match): string[] {
    const { materials, tuning } = this.d;
    if (template.makes === materials.require('torch').numId) {
      const fuel = materials.get(keyVariant(match.result))?.fuel ?? 0;
      const minutes = (fuel * tuning.torch.secondsPerFuel) / 60;
      return [`Burns about ${minutes < 1 ? '<1' : Math.round(minutes)} min`];
    }
    if (template.makes === materials.require('chest').numId) {
      return [`Holds ${tuning.pack.capacity * tuning.chest.capacityTimesPack} weight`];
    }
    return [];
  }
}
