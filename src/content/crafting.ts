import craftingData from '@/data/crafting.json';
import type { MaterialRegistry } from './materials';

export interface PartDef {
  key: string;
  name: string;
  count: number;
  /** Material numIds that fit this part. */
  accepts: readonly number[];
}

export interface TemplateDef {
  key: string;
  name: string;
  /** The material numId the template makes. */
  makes: number;
  yield: number;
  /** Where it can be made. Only "anywhere" exists so far. */
  place: string;
  /** Indexes of the parts whose materials the item keeps (at most two), in order. */
  variantParts: readonly number[];
  parts: readonly PartDef[];
}

export interface CraftingData {
  slots: number;
  templates: readonly TemplateDef[];
  pick: { head: readonly number[]; handle: readonly number[] };
}

/** Parses the bundled crafting data, resolving material keys to numIds. */
export function loadCrafting(materials: MaterialRegistry): CraftingData {
  const ids = (keys: readonly string[]) => keys.map((k) => materials.require(k).numId);
  const templates = craftingData.templates.map((raw): TemplateDef => {
    const parts = raw.parts.map((p) => ({ ...p, accepts: ids(p.accepts) }));
    const keeps: readonly string[] = ('keeps' in raw ? raw.keeps : undefined) ?? [];
    if (keeps.length > 2) throw new Error(`Template "${raw.key}": keeps at most two parts`);
    const variantParts = keeps.map((key) => {
      const i = parts.findIndex((p) => p.key === key);
      if (i < 0) throw new Error(`Template "${raw.key}": no part "${key}"`);
      return i;
    });
    return {
      key: raw.key,
      name: raw.name,
      makes: materials.require(raw.makes).numId,
      yield: raw.yield,
      place: raw.place,
      variantParts,
      parts,
    };
  });
  return {
    slots: craftingData.slots,
    templates,
    pick: { head: ids(craftingData.pick.head), handle: ids(craftingData.pick.handle) },
  };
}
