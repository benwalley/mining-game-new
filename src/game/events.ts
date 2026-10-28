import type { SimEvent } from '@/protocol/messages';
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
  hurt: { cause: 'drowning' | 'fluid' | 'gas' | 'crushed'; fluid: number };
  // From the sim (see SimEventKind):
  quench: SimEvent;
  ignite: SimEvent;
  vent: SimEvent;
  creak: SimEvent;
  collapse: SimEvent;
  loose: SimEvent;
  land: SimEvent;
}
