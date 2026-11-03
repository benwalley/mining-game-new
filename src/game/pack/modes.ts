/**
 * What the player is doing. The pack button cycles through these, in this order.
 * Add a mode here and it appears on the button's rail.
 */
export const MODES = ['dig', 'build', 'craft'] as const;
export type Mode = (typeof MODES)[number];
export const DEFAULT_MODE: Mode = 'dig';

/** Whether the world stands still in this mode. */
export const freezesWorld = (mode: Mode): boolean => mode !== 'dig';
