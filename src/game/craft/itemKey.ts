/**
 * What the pack stores things under. A plain material is its numId. A crafted
 * item that remembers its materials (a torch remembers its fuel, boots their
 * casing and core) adds those materials' numIds above the low bits, so items
 * of different materials stack apart. Keys are persisted in saves: never
 * change this encoding.
 */
const VARIANT_SHIFT = 10;
const VARIANT2_SHIFT = 20;
const MATERIAL_MASK = (1 << VARIANT_SHIFT) - 1;

export const itemKey = (material: number, variant = 0, variant2 = 0): number =>
  material | (variant << VARIANT_SHIFT) | (variant2 << VARIANT2_SHIFT);

export const keyMaterial = (key: number): number => key & MATERIAL_MASK;

/** The remembered material, or 0 for none. */
export const keyVariant = (key: number): number => (key >> VARIANT_SHIFT) & MATERIAL_MASK;

/** The second remembered material, or 0 for none. */
export const keyVariant2 = (key: number): number => (key >> VARIANT2_SHIFT) & MATERIAL_MASK;
