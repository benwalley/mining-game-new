import type { SimEvent } from '@/protocol/messages';
import type { DigDirection } from './dig/digTarget';

/** Gameplay events. Feedback (sound, haptics, particles) and UI subscribe; gameplay code emits. */
export interface GameEvents {
  digHit: { x: number; y: number; material: number; stage: number; dir: DigDirection };
  digBlocked: { x: number; y: number; material: number };
  tileBroken: { x: number; y: number; material: number };
  /** A dig that can't finish because the pack is at its hard limit. */
  packFull: { x: number; y: number; material: number };
  /** The player put a block into the world. */
  placed: { x: number; y: number; material: number };
  /** The player took the last placed block back. */
  unplaced: { x: number; y: number; material: number };
  /** A tap or release on a tile that can't take a block. */
  placeDenied: { x: number; y: number };
  /** Build mode began: the world stops. */
  timeFrozen: Record<string, never>;
  /** Build mode ended: the world moves again. */
  timeResumed: Record<string, never>;
  /** The ghost block moved onto a new tile. */
  ghostStep: Record<string, never>;
  jumped: Record<string, never>;
  landed: { speed: number };
  inspect: { x: number; y: number };
  splash: { x: number; y: number; fluid: number; speed: number };
  hurt: { cause: 'drowning' | 'fluid' | 'gas'; fluid: number };
  /** A drop of sweat leaves the mole (it's hot). */
  sweat: { x: number; y: number };
  /** The air crackles (extreme heat); strength 0.5–1. */
  crackle: { strength: number };
  // From the sim (see SimEventKind):
  quench: SimEvent;
  ignite: SimEvent;
  vent: SimEvent;
}
