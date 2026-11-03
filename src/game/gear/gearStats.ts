import type { MaterialDef, MaterialRegistry } from '@/content/materials';
import type { BootsTuning, SuitTuning } from '@/content/tuning';
import { keyMaterial, keyVariant, keyVariant2 } from '../craft/itemKey';

export interface BootsStats {
  /** Upward acceleration while firing, tiles/s². Gravity pulls against it. */
  thrust: number;
  /** Seconds of full thrust on a full meter. */
  seconds: number;
}

export interface SuitStats {
  /** Degrees added to where heat starts to hurt. */
  raise: number;
  /** Fraction of heat and hot-fluid damage taken away, 0–1. */
  cut: number;
}

/** The casing's weight drags against the core's burn; its toughness sets how long it fires. */
export function bootsStats(casing: MaterialDef, core: MaterialDef, t: BootsTuning): BootsStats {
  return {
    thrust: t.base + core.fuel * t.perFuel - casing.weight * t.perWeight,
    seconds: casing.toughness * t.secondsPerToughness,
  };
}

/** A shell that takes more heat raises the safe temperature; a lining that conducts less cuts more. */
export function suitStats(shell: MaterialDef, lining: MaterialDef, t: SuitTuning): SuitStats {
  const cut = t.maxCut * (1 - (lining.conductivity - 1) / t.cutSpan);
  return {
    raise: Math.max(0, shell.heatLimit - t.raiseFromLimit) * t.raisePerLimit,
    cut: Math.max(0, Math.min(t.maxCut, cut)),
  };
}

/** The two materials a gear item was made from, or null if the key isn't gear. */
export function gearParts(
  key: number,
  materials: MaterialRegistry,
): { item: MaterialDef; a: MaterialDef; b: MaterialDef } | null {
  const item = materials.get(keyMaterial(key));
  const a = materials.get(keyVariant(key));
  const b = materials.get(keyVariant2(key));
  if (!item || item.kind !== 'gear' || !a || !b) return null;
  return { item, a, b };
}
