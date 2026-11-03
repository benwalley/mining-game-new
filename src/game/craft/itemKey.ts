/**
 * What the pack stores things under. A plain material is its numId. A crafted
 * item that remembers one of its materials (a torch remembers its fuel) adds
 * that material's numId above the low bits, so torches burning different fuels
 * stack apart. Keys are persisted in saves: never change this encoding.
 */
const VARIANT_SHIFT = 10;
const MATERIAL_MASK = (1 << VARIANT_SHIFT) - 1;

export const itemKey = (material: number, variant = 0): number =>
  material | (variant << VARIANT_SHIFT);

export const keyMaterial = (key: number): number => key & MATERIAL_MASK;

/** The remembered material, or 0 for none. */
export const keyVariant = (key: number): number => key >> VARIANT_SHIFT;
