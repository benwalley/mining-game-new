import { clamp, damp } from '@/core/math/util';
import type { CameraTuning, PlayerTuning } from '@/content/tuning';
import type { WorldDims } from '@/core/world/constants';

export interface CameraFocus {
  /** Focus point in tiles (usually the player's center). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  diggingDown: boolean;
}

/** Smooth follow with look-ahead in the movement direction; settles to center when still. */
export class Camera {
  /** Center of the view, in tiles. */
  x = 0;
  y = 0;
  private lookX = 0;
  private lookY = 0;

  constructor(
    private readonly tuning: CameraTuning,
    private readonly player: PlayerTuning,
    private readonly dims: WorldDims,
  ) {}

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.lookX = 0;
    this.lookY = 0;
  }

  /** `viewW`/`viewH` are the view size in tiles, used to keep the view inside the world. */
  update(focus: CameraFocus, dt: number, viewW: number, viewH: number): void {
    const t = this.tuning;
    const targetLookX = clamp(focus.vx / this.player.maxRunSpeed, -1, 1) * t.lookAheadX;
    let targetLookY = 0;
    if (focus.diggingDown || focus.vy > 2) {
      targetLookY = t.lookAheadDown * (focus.diggingDown ? 1 : clamp(focus.vy / 12, 0, 1));
    } else if (focus.vy < -2) {
      targetLookY = -t.lookAheadUp;
    }
    const lookK = damp(t.lookAheadRate, dt);
    this.lookX += (targetLookX - this.lookX) * lookK;
    this.lookY += (targetLookY - this.lookY) * lookK;

    const k = damp(t.followRate, dt);
    this.x += (focus.x + this.lookX - this.x) * k;
    this.y += (focus.y + this.lookY - this.y) * k;
    this.clampToWorld(viewW, viewH);
  }

  private clampToWorld(viewW: number, viewH: number): void {
    const { width, height } = this.dims;
    this.x = viewW >= width ? width / 2 : clamp(this.x, viewW / 2, width - viewW / 2);
    // Allow a little sky above the surface, but never past the world's floor.
    this.y = Math.min(this.y, height - viewH / 2);
  }
}
