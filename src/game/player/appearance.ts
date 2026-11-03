/**
 * What the player is wearing, by slot. Values are gear art ids drawn by the
 * renderer: the helmet, and crafted gear (rocket boots on the feet, the heat
 * suit on the body).
 */
export type GearSlot = 'head' | 'body' | 'back' | 'feet';

export type Appearance = Partial<Record<GearSlot, string>>;

export const DEFAULT_APPEARANCE: Readonly<Appearance> = { head: 'miner-helmet' };
