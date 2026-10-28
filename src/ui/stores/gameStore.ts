import { signal } from '@preact/signals';

/** UI-facing game state. The game writes these at a low rate; Preact components read them. */

export type BootState = 'loading' | 'ready' | 'error';

export const bootState = signal<BootState>('loading');
export const bootError = signal<string | null>(null);

export interface DebugInfo {
  fps: number;
  tileX: number;
  tileY: number;
  depth: number;
  grounded: boolean;
  climbing: boolean;
  chunksLoaded: number;
  target: string | null;
  inspected: string | null;
  lastSave: string;
  haptics: string;
  sim: string;
  health: string;
}

export const debugVisible = signal(false);
export const debugGrid = signal(false);
/** Debug: turn darkness off to see the whole world. */
export const debugLighting = signal(true);
export const toolPower = signal(3);
export const debugInfo = signal<DebugInfo | null>(null);

/** Debug: what tapping the world pours: 'off' or a fluid key. */
export const debugPour = signal<string>('off');

export interface HudState {
  health: number;
  maxHealth: number;
  /** Fraction of breath left, 0–1, in tenths. */
  breath: number;
}

export const hud = signal<HudState>({ health: 100, maxHealth: 100, breath: 1 });
/** Increments each time the player is hurt, to retrigger the damage flash. */
export const hurtPulse = signal(0);
