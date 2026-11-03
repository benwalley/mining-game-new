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
  /** The pack key: a material's numId, or a crafted item's key (see `itemKey`). */
  numId: number;
  name: string;
  color: string;
  /** The material's tile, as an image URL. */
  icon: string;
  count: number;
  unitWeight: number;
  /** Gear is worn from the pack instead of held. */
  wearable: boolean;
  /** What gear does, in one line. */
  stats: string | null;
}

/** Worn gear, by slot. */
export interface GearView {
  air: PackItemView | null;
  body: PackItemView | null;
}

export const gearView = signal<GearView>({ air: null, body: null });

export interface PackView {
  items: PackItemView[];
  /** The block that tapping places. Its stack may be empty (the button greys it out). */
  held: PackItemView | null;
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

/** The chest open beside the pack, or null. */
export interface ChestView {
  x: number;
  y: number;
  items: PackItemView[];
  weight: number;
  capacity: number;
}

export const chestView = signal<ChestView | null>(null);

export interface CraftResultView {
  name: string;
  item: PackItemView;
  count: number;
  /** Made before; an unknown result shows as a silhouette until it's made. */
  known: boolean;
  affordable: boolean;
  stats: string[];
  cost: { item: PackItemView; need: number }[];
}

export interface PickPartView {
  material: PackItemView;
  /** How many of a new material swapping this part takes. */
  cost: number;
  /** Materials in the pack that fit, with what they'd change: power steps and speed in percent. */
  options: { item: PackItemView; affordable: boolean; power: number; speed: number }[];
}

export interface CraftView {
  slots: (PackItemView | null)[];
  result: CraftResultView | null;
  /** Something is in the slots (so "nothing comes of that" can show). */
  tried: boolean;
  known: { key: string; name: string; icon: string; affordable: boolean }[];
  /** Plain materials in the pack, to tap into slots. */
  materials: PackItemView[];
  pick: {
    head: PickPartView;
    handle: PickPartView;
    power: number;
    /** Swing speed against the starting pick, in percent. */
    speed: number;
    /** 1 sharp down to 0 dullest. */
    sharpness: number;
    dull: boolean;
    sharpen: { item: PackItemView; count: number };
  };
}

export const craftView = signal<CraftView | null>(null);

/** Short-lived message over the play area ("New recipe: Torch"). `id` changes each time. */
export const toastView = signal<{ id: number; text: string } | null>(null);

/** The pick as the dig mode button shows it: its parts' colors and how sharp it is. */
export const pickView = signal<{ head: string; handle: string; sharpness: number; dull: boolean }>({
  head: '#6e6a72',
  handle: '#7a5532',
  sharpness: 1,
  dull: false,
});
