/** Tile damage is stored per tile as 0–255; a tile breaks when damage would reach 255. */
export const MAX_DAMAGE = 255;

/**
 * Visible crack stage (0 = none, up to `stages`) for a stored damage value.
 * Any damage shows at least the first stage, so a tile that was hit even
 * briefly visibly stays damaged.
 */
export function crackStage(damage: number, stages: number): number {
  if (damage <= 0) return 0;
  return Math.min(stages, Math.floor((damage / MAX_DAMAGE) * stages) + 1);
}

/** Damage to store for a dig progress of 0–1, kept below the break threshold. */
export const damageFromProgress = (progress: number): number =>
  Math.min(MAX_DAMAGE - 1, Math.max(0, Math.round(progress * MAX_DAMAGE)));
