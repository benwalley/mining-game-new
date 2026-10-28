import type { MoveIntent } from './PlayerController';

/**
 * Classifies a drag into straight and diagonal sectors. With the default
 * ratio (tan 22.5°) the eight directions each get an equal 45° slice.
 */
export interface IntentShape {
  active: boolean;
  /** Between the axes: up-right, down-left, and so on. */
  diagonal: boolean;
  straightHorizontal: boolean;
  straightVertical: boolean;
}

export function shapeOf(intent: MoveIntent, diagonalMinRatio: number): IntentShape {
  const ax = Math.abs(intent.x);
  const ay = Math.abs(intent.y);
  const active = ax > 0 || ay > 0;
  const straightHorizontal = ax > 0 && ay < diagonalMinRatio * ax;
  const straightVertical = ay > 0 && ax < diagonalMinRatio * ay;
  return {
    active,
    diagonal: active && !straightHorizontal && !straightVertical,
    straightHorizontal,
    straightVertical,
  };
}
