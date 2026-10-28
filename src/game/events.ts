import type { DigDirection } from './dig/digTarget';

/** Gameplay events. Feedback (sound, haptics, particles) and UI subscribe; gameplay code emits. */
export interface GameEvents {
  digHit: { x: number; y: number; material: number; stage: number; dir: DigDirection };
  digBlocked: { x: number; y: number; material: number };
  tileBroken: { x: number; y: number; material: number };
  jumped: Record<string, never>;
  landed: { speed: number };
  inspect: { x: number; y: number };
  splash: { x: number; y: number; fluid: number; speed: number };
  hurt: { cause: 'drowning' | 'fluid'; fluid: number };
  /** Lava met water and hardened; from the sim. */
  quench: { x: number; y: number };
}
