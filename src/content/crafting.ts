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
  /** Index of the part whose material the item keeps, if any. */
  variantPart: number | null;
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
    const variantFrom = 'variantFrom' in raw ? raw.variantFrom : null;
    const variantPart = variantFrom ? parts.findIndex((p) => p.key === variantFrom) : -1;
    if (variantFrom && variantPart < 0) {
      throw new Error(`Template "${raw.key}": no part "${variantFrom}"`);
    }
    return {
      key: raw.key,
      name: raw.name,
      makes: materials.require(raw.makes).numId,
      yield: raw.yield,
      place: raw.place,
      variantPart: variantPart < 0 ? null : variantPart,
      parts,
    };
  });
  return {
    slots: craftingData.slots,
    templates,
    pick: { head: ids(craftingData.pick.head), handle: ids(craftingData.pick.handle) },
  };
}
