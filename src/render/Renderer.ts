import type { Particles } from '@/fx/Particles';
import type { LightView } from '@/game/light/LightField';
import type { PlayerPose } from './canvas2d/playerSprite';

/** A block the player is aiming: drawn see-through, outlined red where it can't go. */
export interface GhostBlock {
  x: number;
  y: number;
  material: number;
  valid: boolean;
}

/** Tiles to tint faintly, one byte per tile in the view, row-major. */
export interface TileTint {
  view: { x0: number; y0: number; x1: number; y1: number };
  mask: Uint8Array;
}

/**
 * Time stopping. The world (not the player) drains toward a cold grey behind a
 * ring that spreads out from the player, and comes back when the ring closes in.
 */
export interface FreezeFx {
  /** Strength of the grey, 0–1. */
  desaturate: number;
  /** Strength of the cold tint over it, 0–1. */
  tint: number;
  /** Center of the ring, in world tiles. */
  x: number;
  y: number;
  /** Progress of the ring, 0–1, or null when there is none (the grey then covers everything). */
  ring: number | null;
  /** 1: spreading out (time stops). -1: closing in (time resumes). */
  ringDir: 1 | -1;
}

export interface RenderFrame {
  /** View center in tiles. */
  cameraX: number;
  cameraY: number;
  player: PlayerPose & { x: number; y: number };
  particles: Particles;
  ghost: GhostBlock | null;
  /** Where a block could go, in build mode. */
  tint: TileTint | null;
  freeze: FreezeFx | null;
  /** The rocket boots' meter, shown by the mole while it isn't full; null without boots. */
  boots: { meter: number; firing: boolean } | null;
  /** Null draws everything fully lit (debug). */
  light: LightView | null;
  /** Seconds, for animated effects (heat shimmer). */
  time: number;
  debug: { grid: boolean; heat: boolean };
}

/** Rendering backend. Canvas 2D today; a WebGL renderer can implement the same contract. */
export interface Renderer {
  /** Match the backing store to the element's size and device pixel ratio. */
  resize(): void;
  render(frame: RenderFrame): void;
  /** Size of the view in tiles at the current scale. */
  readonly viewTiles: { w: number; h: number };
  /** Converts element-relative CSS pixels to world tile coordinates. */
  screenToTile(
    cssX: number,
    cssY: number,
    cameraX: number,
    cameraY: number,
  ): { x: number; y: number };
  /** A material's tile as an image URL, for the UI to show (the fan, the pack). */
  tileIcon(numId: number): string;
  /** Drop all cached world graphics (for example after a world reset). */
  clearCache(): void;
}
