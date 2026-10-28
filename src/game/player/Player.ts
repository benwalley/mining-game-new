import type { PlayerSnapshot } from '@/protocol/messages';
import type { PlayerTuning } from '@/content/tuning';
import type { Box } from '../physics/tileCollision';
import type { DigDirection } from '../dig/digTarget';
import { DEFAULT_APPEARANCE, type Appearance } from './appearance';

/** All mutable player state. Logic lives in PlayerController and DigSystem. */
export class Player {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  readonly w: number;
  readonly h: number;
  facing: 1 | -1 = 1;
  appearance: Appearance = { ...DEFAULT_APPEARANCE };

  grounded = false;
  climbing = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  /** True from takeoff until the jump is cut or peaks. */
  jumping = false;
  upHeldPrev = false;

  /** Set by DigSystem: the direction being dug this step, or null. */
  digDir: DigDirection | null = null;
  /** Set by DigSystem for vertical digs: column to center the body over. */
  centerColumn: number | null = null;
  /** Seconds since the last pick swing started, for animation. */
  swingTime = 0;

  /** Visual-only: offsets that smooth out instant snaps such as stepping up a ledge. */
  stepOffsetY = 0;
  squashTimer = 0;
  walkPhase = 0;

  constructor(tuning: PlayerTuning) {
    this.w = tuning.width;
    this.h = tuning.height;
  }

  get box(): Box {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  placeAt(x: number, y: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }

  snapshot(): PlayerSnapshot {
    return { x: this.x, y: this.y, facing: this.facing };
  }

  restore(s: PlayerSnapshot): void {
    this.placeAt(s.x, s.y);
    this.facing = s.facing;
  }
}
