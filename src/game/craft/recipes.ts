import type { TemplateDef } from '@/content/crafting';
import type { Pack } from '../pack/Pack';
import { itemKey } from './itemKey';

/** A set of filled slots that makes something. */
export interface Match {
  template: TemplateDef;
  /** The material chosen for each of the template's parts, in part order. */
  materials: number[];
  /** How many of each material it uses. */
  cost: Map<number, number>;
  /** The pack key of what comes out, and how many. */
  result: number;
  count: number;
}

/**
 * What the filled slots make, if anything. Slots are unordered: whichever slot
 * holds the coal, it's the fuel. Empty slots are ignored, and every filled slot
 * must be used by exactly one part, so stray extras make nothing.
 */
export function matchSlots(
  slots: readonly (number | null)[],
  templates: readonly TemplateDef[],
  place = 'anywhere',
): Match | null {
  const filled = slots.filter((s): s is number => s !== null);
  if (filled.length === 0) return null;
  for (const template of templates) {
    if (template.place !== place || template.parts.length !== filled.length) continue;
    const materials = assign(template, filled);
    if (materials) return toMatch(template, materials);
  }
  return null;
}

/** The match for known materials, as when a remembered recipe fills the slots. */
export function toMatch(template: TemplateDef, materials: readonly number[]): Match {
  const cost = new Map<number, number>();
  template.parts.forEach((part, i) => {
    const m = materials[i]!;
    cost.set(m, (cost.get(m) ?? 0) + part.count);
  });
  const [a, b] = template.variantParts.map((i) => materials[i]!);
  return {
    template,
    materials: [...materials],
    cost,
    result: itemKey(template.makes, a, b),
    count: template.yield,
  };
}

/** Whether the pack holds everything the match uses. */
export function canAfford(match: Match, pack: Pack): boolean {
  for (const [m, n] of match.cost) if (pack.count(m) < n) return false;
  return true;
}

export type CraftOutcome = 'made' | 'short' | 'full';

/** Takes the materials and puts the result in the pack, or changes nothing. */
export function craft(match: Match, pack: Pack): CraftOutcome {
  if (!canAfford(match, pack)) return 'short';
  for (const [m, n] of match.cost) pack.take(m, n);
  if (pack.add(match.result, match.count)) return 'made';
  for (const [m, n] of match.cost) pack.add(m, n);
  return 'full';
}

/** Tries every way of giving the slot materials to the parts; at most 3! with three slots. */
function assign(template: TemplateDef, filled: readonly number[]): number[] | null {
  const parts = template.parts;
  const used = new Array<boolean>(filled.length).fill(false);
  const chosen: number[] = [];
  const step = (p: number): boolean => {
    if (p === parts.length) return true;
    for (let s = 0; s < filled.length; s++) {
      if (used[s] || !parts[p]!.accepts.includes(filled[s]!)) continue;
      used[s] = true;
      chosen.push(filled[s]!);
      if (step(p + 1)) return true;
      chosen.pop();
      used[s] = false;
    }
    return false;
  };
  return step(0) ? chosen : null;
}

/**
 * The templates the player has made, each with the materials used last time so
 * the sheet can fill them back in. Nothing is known at the start: recipes are
 * found by trying materials together.
 */
export class Recipes {
  private readonly known = new Map<string, number[]>();
  revision = 0;

  has(key: string): boolean {
    return this.known.has(key);
  }

  last(key: string): readonly number[] | undefined {
    return this.known.get(key);
  }

  /** Known template keys, in the order they were found. */
  get keys(): string[] {
    return [...this.known.keys()];
  }

  remember(match: Match): boolean {
    const isNew = !this.known.has(match.template.key);
    this.known.set(match.template.key, [...match.materials]);
    this.revision++;
    return isNew;
  }

  snapshot(): [key: string, materials: number[]][] {
    return [...this.known].map(([k, m]) => [k, [...m]]);
  }

  restore(s: readonly [string, number[]][]): void {
    this.known.clear();
    for (const [k, m] of s) this.known.set(k, [...m]);
    this.revision++;
  }
}
