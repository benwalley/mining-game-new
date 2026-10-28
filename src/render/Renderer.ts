import type { Particles } from '@/fx/Particles';
import type { PlayerPose } from './canvas2d/playerSprite';

export interface RenderFrame {
  /** View center in tiles. */
  cameraX: number;
  cameraY: number;
  player: PlayerPose & { x: number; y: number };
  particles: Particles;
  debug: { grid: boolean };
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
  /** Drop all cached world graphics (for example after a world reset). */
  clearCache(): void;
}
