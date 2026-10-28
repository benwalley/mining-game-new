/**
 * What the player is wearing, by slot. Values are gear art ids drawn by the
 * renderer. Later, crafted items (armor, packs, a jetpack) fill these slots.
 */
export type GearSlot = 'head' | 'body' | 'back';

export type Appearance = Partial<Record<GearSlot, string>>;

export const DEFAULT_APPEARANCE: Readonly<Appearance> = { head: 'miner-helmet' };
