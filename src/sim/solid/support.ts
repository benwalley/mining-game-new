/**
 * The structural rule. A solid tile with solid under it rests on it and is
 * fine. A tile with open space under it (a ceiling) is supported only if,
 * walking sideways along its row through solid tiles, it reaches a resting
 * tile within its material's support span. Stepped and arched ceilings are
 * therefore self-supporting; long flat ceilings are not.
 */
export interface SupportView {
  /** Solid, or not loaded (unknown tiles count as solid, so nothing fails at a border). */
  solid(x: number, y: number): boolean;
  /** Support span of the tile's material; Infinity for indestructible tiles. */
  span(x: number, y: number): number;
}

/**
 * Tiles to the nearest resting tile along the row, looking at most `limit`
 * tiles each way; Infinity if there's none in reach or the row is broken by
 * open space first. 0 if the tile rests on something itself.
 */
export function supportDistance(view: SupportView, x: number, y: number, limit: number): number {
  if (view.solid(x, y + 1)) return 0;
  let best = Infinity;
  for (const dir of [-1, 1]) {
    for (let i = 1; i <= limit && i < best; i++) {
      const tx = x + dir * i;
      if (!view.solid(tx, y)) break;
      if (view.solid(tx, y + 1)) {
        best = i;
        break;
      }
    }
  }
  return best;
}

/** True when a solid tile hangs further from support than its material can span. */
export function isUnsupported(view: SupportView, x: number, y: number): boolean {
  if (!view.solid(x, y)) return false;
  const span = view.span(x, y);
  if (span === Infinity) return false;
  return supportDistance(view, x, y, span) > span;
}
