import { signal } from '@preact/signals';
import type { FanSlot } from '@/game/pack/fanLayout';
import { MODES, type Mode } from '@/game/pack/modes';

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
  heat: string;
}

export const debugVisible = signal(false);
export const debugGrid = signal(false);
/** Debug: turn darkness off to see the whole world. */
export const debugLighting = signal(true);
/** Debug: color every tile by its temperature. */
export const debugHeat = signal(false);
export const toolPower = signal(3);
export const debugInfo = signal<DebugInfo | null>(null);

/** Whether the browser promised to keep our storage, and the last save or sim error. */
export const storageInfo = signal<{ persisted: boolean | null; error: string | null }>({
  persisted: null,
  error: null,
});

/** Debug benchmark: a countdown while it runs, then the report's lines. */
export const benchStatus = signal<string | null>(null);
export const benchReport = signal<string[] | null>(null);

/** Debug: what tapping the world pours: 'off' or a fluid key. */
export const debugPour = signal<string>('off');

export interface HudState {
  health: number;
  maxHealth: number;
  /** Fraction of breath left, 0–1, in tenths. */
  breath: number;
  /** How hot the mole feels, 0–1, in twentieths. */
  heat: number;
}

export const hud = signal<HudState>({ health: 100, maxHealth: 100, breath: 1, heat: 0 });
/** Increments each time the player is hurt, to retrigger the damage flash. */
export const hurtPulse = signal(0);

export interface PackItemView {
  numId: number;
  name: string;
  color: string;
  /** The material's tile, as an image URL. */
  icon: string;
  count: number;
  unitWeight: number;
}

export interface PackView {
  items: PackItemView[];
  /** The block that tapping places. Its stack may be empty (the button greys it out). */
  held: { numId: number; name: string; color: string; icon: string; count: number } | null;
  weight: number;
  capacity: number;
  /** Weight over capacity; past 1 the pack is overloaded. */
  load: number;
}

export const packView = signal<PackView>({
  items: [],
  held: null,
  weight: 0,
  capacity: 1,
  load: 0,
});

export interface FanView {
  open: boolean;
  slots: FanSlot[];
  hover: number | null;
  /** The pack button's center, which the fan's track curves around. */
  center: { x: number; y: number };
}

export const fanView = signal<FanView>({
  open: false,
  slots: [],
  hover: null,
  center: { x: 0, y: 0 },
});

export interface ModeView {
  mode: Mode;
  /** While the button is being scrubbed: the mode a release would pick. */
  preview: Mode | null;
  modes: readonly Mode[];
  /** Counts up each time a tap finds nothing to place, to pulse the button. */
  pulse: number;
  /** While a finger drags across the button: how far the strip of modes behind it has slid. */
  progress: number;
  scrubbing: boolean;
}

export const modeView = signal<ModeView>({
  mode: 'dig',
  preview: null,
  modes: MODES,
  pulse: 0,
  progress: 0,
  scrubbing: false,
});

/** Set for the undo window after a block is placed; `id` changes each time, to restart the ring. */
export const undoView = signal<{ id: number; ms: number } | null>(null);
/** The full-screen pack. */
export const sheetOpen = signal(false);
