import type { MaterialDef } from '@/content/materials';

/** Synth parameters for one material's dig and break sounds. */
export interface SoundProfile {
  /** Center of the noise band in Hz. Harder materials sound duller (lower). */
  noiseHz: number;
  q: number;
  /** Hit decay in seconds. */
  decay: number;
  /** Pitched "tock" under the noise; 0 disables it. */
  toneHz: number;
  toneGain: number;
  /** Metallic ring time for ores, in seconds; 0 for none. */
  ring: number;
}

const ORES = new Set(['copper', 'tin', 'iron', 'gold', 'starsilver']);

/**
 * Derives a sound from material properties so every material has its own voice
 * without hand-authoring each one; experienced players can tell ore by ear.
 */
export function soundProfile(m: MaterialDef): SoundProfile {
  const h = Math.max(0, Math.min(1, (m.hardness - 1) / 9));
  const heavy = Math.max(0, Math.min(1, (m.weight - 1) / 9));
  const soft = m.hardness <= 2;
  return {
    noiseHz: 2600 - 2000 * h - 400 * heavy,
    q: soft ? 0.7 : 1.4 + h * 2,
    decay: soft ? 0.09 : 0.06 + 0.05 * (1 - h),
    toneHz: soft ? 0 : 340 - 180 * h,
    toneGain: soft ? 0 : 0.25 + 0.3 * h,
    ring: ORES.has(m.key) ? 0.18 : m.trait === 'clear' ? 0.25 : 0,
  };
}
