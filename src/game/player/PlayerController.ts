import { approach } from '@/core/math/util';
import type { EventBus } from '@/core/events/EventBus';
import type { InputTuning, PlayerTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import { canStepUp, inShaft, moveX, moveY, touching, type SolidFn } from '../physics/tileCollision';
import type { Player } from './Player';

export interface MoveIntent {
  /** Each axis in [-1, 1], already shaped by dead zone and speed curve. y < 0 is up. */
  x: number;
  y: number;
}

export interface Contact {
  grounded: boolean;
  ceiling: boolean;
  canClimb: boolean;
}

/** Platformer movement: run, jump (with coyote time and buffering), shaft climbing, ledge step-up. */
export class PlayerController {
  private readonly jumpVelocity: number;

  constructor(
    private readonly tuning: PlayerTuning,
    private readonly input: InputTuning,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.jumpVelocity = Math.sqrt(2 * tuning.gravity * tuning.jumpHeight);
  }

  sense(player: Player, solid: SolidFn): Contact {
    const box = player.box;
    return {
      grounded: touching(box, 'down', solid),
      ceiling: touching(box, 'up', solid),
      canClimb: inShaft(box, solid),
    };
  }

  /** Whether the intent counts as "up": steep enough to jump or climb. */
  isUp(intent: MoveIntent): boolean {
    return intent.y < 0 && -intent.y >= Math.abs(intent.x) * this.input.jumpMinUpRatio;
  }

  step(
    player: Player,
    intent: MoveIntent,
    contact: Contact,
    solid: SolidFn,
    dt: number,
    digging: boolean,
  ): void {
    const t = this.tuning;
    player.prevX = player.x;
    player.prevY = player.y;

    const upHeld = this.isUp(intent);
    const verticalIntent = Math.abs(intent.y) > Math.abs(intent.x) * 0.5;

    player.grounded = contact.grounded;
    player.coyoteTimer = contact.grounded ? t.coyoteTime : player.coyoteTimer - dt;
    player.jumpBufferTimer =
      upHeld && !player.upHeldPrev ? t.jumpBufferTime : player.jumpBufferTimer - dt;
    player.upHeldPrev = upHeld;
    if (Math.abs(intent.x) > 0.1) player.facing = intent.x > 0 ? 1 : -1;

    // Climbing starts by pushing up inside a shaft and lasts until the player
    // leaves the shaft or stands on its floor. While climbing, the walls hold
    // them and vertical input moves them. Falling into a shaft never grabs.
    if (!contact.canClimb || (contact.grounded && !upHeld)) player.climbing = false;
    else if (upHeld && !contact.ceiling) player.climbing = true;
    if (player.climbing) {
      player.vy = verticalIntent && !digging ? intent.y * t.climbSpeed : 0;
      player.jumping = false;
    } else {
      player.vy = Math.min(player.vy + t.gravity * dt, t.maxFallSpeed);
    }

    const canJump = player.jumpBufferTimer > 0 && player.coyoteTimer > 0;
    if (!player.climbing && !digging && canJump && !contact.ceiling) {
      player.vy = -this.jumpVelocity;
      player.jumpBufferTimer = 0;
      player.coyoteTimer = 0;
      player.jumping = true;
      this.events.emit('jumped', {});
    }
    if (player.jumping && (player.vy >= 0 || !upHeld)) {
      if (player.vy < 0) player.vy *= t.jumpCutMultiplier;
      player.jumping = false;
    }

    // Horizontal: center over a column while digging vertically, otherwise run.
    if (player.centerColumn !== null) {
      player.vx = 0;
      const dx = approach(player.x, player.centerColumn + 0.5, t.centerSpeed * dt) - player.x;
      player.x = moveX(player.box, dx, solid).value;
    } else {
      const target = intent.x * t.maxRunSpeed;
      const accel = contact.grounded
        ? intent.x !== 0
          ? t.groundAccel
          : t.groundDecel
        : t.airAccel;
      player.vx = approach(player.vx, target, accel * dt);
      this.moveHorizontal(player, solid, dt);
    }

    const resY = moveY(player.box, player.vy * dt, solid);
    player.y = resY.value;
    if (resY.hit) {
      if (player.vy > 0) {
        if (player.vy >= t.landSquashMinSpeed) {
          player.squashTimer = t.landSquashTime;
          this.events.emit('landed', { speed: player.vy });
        }
        player.grounded = true;
      }
      player.vy = 0;
      player.jumping = false;
    }

    this.animate(player, dt);
  }

  private moveHorizontal(player: Player, solid: SolidFn, dt: number): void {
    const dx = player.vx * dt;
    const startX = player.x;
    const res = moveX(player.box, dx, solid);
    if (!res.hit) {
      player.x = res.value;
      return;
    }
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    if (canStepUp({ ...player.box, x: res.value }, dir, solid)) {
      // Auto-climb a 1-tile ledge. In the air this is a mantle: a jump that
      // gets the feet past a ledge's top row pulls the player onto it. prevY
      // moves too so interpolation doesn't smear the snap; the visual offset
      // eases it instead.
      player.x = res.value;
      player.y -= 1;
      player.prevY -= 1;
      player.stepOffsetY += 1;
      player.x = moveX(player.box, dx - (res.value - startX), solid).value;
      return;
    }
    player.x = res.value;
    player.vx = 0;
  }

  private animate(player: Player, dt: number): void {
    const t = this.tuning;
    player.squashTimer = Math.max(0, player.squashTimer - dt);
    player.stepOffsetY = approach(player.stepOffsetY, 0, dt / t.stepUpSmoothTime);
    if (player.grounded && Math.abs(player.vx) > 0.5) {
      player.walkPhase += (Math.abs(player.vx) * dt) / 0.9;
    } else {
      player.walkPhase = 0;
    }
  }
}
