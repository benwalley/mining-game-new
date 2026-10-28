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
  /** Holding onto a wall or ceiling (see PlayerController). */
  cling: 'none' | 'wall' | 'ceiling' = 'none';
  /** Which side the wall is on while clinging to one. */
  clingSide: 1 | -1 = 1;
  /** Seconds since the player stopped holding toward the surface they cling to. */
  gripTimer = 0;
  /** Last direction moved along a wall: -1 up, 1 down. */
  climbDir: 1 | -1 = -1;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  /** True from takeoff until the jump is cut or peaks. */
  jumping = false;
  upHeldPrev = false;
  /** Fraction of the body under fluid as of the last step. */
  submersion = 0;

  health: number;
  /** Seconds of air left while the head is under fluid. */
  breath: number;
  /** Seconds since the player last took damage. */
  sinceHurt = Infinity;

  /** Set by DigSystem: the direction being dug this step, or null. */
  digDir: DigDirection | null = null;
  /** Set by DigSystem for vertical digs: column to center the body over. */
  centerColumn: number | null = null;
  /** Seconds since the last pick swing started, for animation. */
  swingTime = 0;

  /** Visual-only: offsets that smooth out instant snaps such as stepping up a ledge. */
  stepOffsetY = 0;
  stepOffsetX = 0;
  squashTimer = 0;
  walkPhase = 0;

  constructor(tuning: PlayerTuning, vitals: { maxHealth: number; breathSeconds: number }) {
    this.w = tuning.width;
    this.h = tuning.height;
    this.health = vitals.maxHealth;
    this.breath = vitals.breathSeconds;
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
