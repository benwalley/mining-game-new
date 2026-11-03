import type { SimEvent } from '@/protocol/messages';
import type { DigDirection } from './dig/digTarget';

/** Gameplay events. Feedback (sound, haptics, particles) and UI subscribe; gameplay code emits. */
export interface GameEvents {
  digHit: { x: number; y: number; material: number; stage: number; dir: DigDirection };
  digBlocked: { x: number; y: number; material: number };
  tileBroken: { x: number; y: number; material: number };
  /** A chest with things in it: empty it before digging it up. */
  digLocked: { x: number; y: number; material: number };
  /** A dig that can't finish because the pack is at its hard limit. */
  packFull: { x: number; y: number; material: number };
  /** The player put a block into the world. */
  placed: { x: number; y: number; material: number };
  /** The player took the last placed block back. */
  unplaced: { x: number; y: number; material: number };
  /** Something was made in craft mode; `first` when it's a new find. */
  crafted: { result: number; count: number; first: boolean };
  /** A craft, sharpen or upgrade that couldn't happen (short of materials, or no room). */
  craftDenied: Record<string, never>;
  sharpened: Record<string, never>;
  upgraded: { part: 'head' | 'handle'; material: number };
  chestOpened: { x: number; y: number };
  chestClosed: Record<string, never>;
  /** Things moved between the pack and a chest. */
  stowed: { key: number; count: number; into: 'chest' | 'pack' };
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
  hurt: { cause: 'drowning' | 'fluid' | 'gas' | 'heat' | 'fall'; fluid: number };
  /** A fall long enough to hurt ended; `damage` is what it took. */
  hardLanding: { x: number; y: number; damage: number };
  /** The rocket boots lit, or went out (`empty` when the meter ran dry). */
  bootsFired: { x: number; y: number };
  bootsStopped: { empty: boolean };
  /** Gear went on or came off, from the pack. */
  gearWorn: { key: number; slot: 'air' | 'body' };
  gearRemoved: { key: number; slot: 'air' | 'body' };
  /** The boots' meter filled back up on the ground. */
  bootsReady: Record<string, never>;
  /** Each step the boots fire: exhaust at the mole's feet. */
  thrust: { x: number; y: number; vx: number };
  /** A torch came off the wall: back into the pack, or `spent` if it had burned down. */
  torchTaken: { x: number; y: number; variant: number; spent: boolean };
  /** A drop of sweat leaves the mole (it's hot). */
  sweat: { x: number; y: number };
  /** The air crackles (extreme heat); strength 0.5–1. */
  crackle: { strength: number };
  // From the sim (see SimEventKind):
  quench: SimEvent;
  ignite: SimEvent;
  vent: SimEvent;
  torchOut: SimEvent;
  catchFire: SimEvent;
  burnOut: SimEvent;
  douse: SimEvent;
  melt: SimEvent;
  set: SimEvent;
}
