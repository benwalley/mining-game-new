import { approach } from '@/core/math/util';
import type { EventBus } from '@/core/events/EventBus';
import type { FluidRegistry } from '@/content/fluids';
import type { InputTuning, PlayerTuning, SwimTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import { NO_FLUID, senseFluid, type FluidContact, type FluidFn } from '../physics/fluidContact';
import {
  EPS,
  canStepUp,
  inShaft,
  moveX,
  moveY,
  overlapsSolid,
  touching,
  type SolidFn,
} from '../physics/tileCollision';
import { shapeOf, type IntentShape } from './intentShape';
import type { Player } from './Player';

export interface MoveIntent {
  /** Each axis in [-1, 1], already shaped by dead zone and speed curve. y < 0 is up. */
  x: number;
  y: number;
}

export interface Contact {
  grounded: boolean;
  ceiling: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  canClimb: boolean;
  fluid: FluidContact;
}

export interface SwimOptions {
  swim: SwimTuning;
  fluids: FluidRegistry;
}

const noFluidAt: FluidFn = () => 0;

/** Minimum push toward or away from a surface that counts as intended. */
const PUSH = 0.15;

/**
 * Platformer movement: run, jump (with coyote time and buffering), shaft
 * climbing, ledge step-up, and clinging: a diagonal drag into a wall walks up
 * (or down) it, and a diagonal drag under a ceiling walks along it. Letting go
 * starts a short grip timer; the player only falls once it runs out. Clinging
 * follows corners going up: wall to ceiling, and around a ceiling's edge onto
 * the wall above it. In fluid the player swims: idle sinks slowly, a drag
 * swims that way, and holding up at the surface jumps out.
 */
export class PlayerController {
  private readonly jumpVelocity: number;
  private readonly gasIds: Uint8Array;

  constructor(
    private readonly tuning: PlayerTuning,
    private readonly input: InputTuning,
    private readonly events: EventBus<GameEvents>,
    private readonly fluids: SwimOptions,
  ) {
    this.jumpVelocity = Math.sqrt(2 * tuning.gravity * tuning.jumpHeight);
    this.gasIds = new Uint8Array(16);
    for (const f of fluids.fluids.all) this.gasIds[f.id] = f.kind === 'gas' ? 1 : 0;
  }

  sense(player: Player, solid: SolidFn, fluidAt: FluidFn = noFluidAt): Contact {
    const box = player.box;
    return {
      grounded: touching(box, 'down', solid),
      ceiling: touching(box, 'up', solid),
      wallLeft: touching(box, 'left', solid),
      wallRight: touching(box, 'right', solid),
      canClimb: inShaft(box, solid),
      fluid: fluidAt === noFluidAt ? NO_FLUID : senseFluid(box, fluidAt, this.gasIds),
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
    const shape = shapeOf(intent, this.input.diagonalMinRatio);
    this.updateCling(player, intent, shape, contact, dt);
    const slipping = player.gripTimer > 0;
    const { swim } = this.fluids;
    // Only liquids hold the mole up; gases are just air to move through.
    const body = this.fluids.fluids.get(contact.fluid.fluid);
    const inFluid = body?.kind === 'liquid' ? body : undefined;
    const swimming =
      inFluid !== undefined &&
      contact.fluid.submersion >= swim.minSubmersion &&
      !player.climbing &&
      player.cling === 'none';

    if (player.climbing) {
      player.vy = verticalIntent && !digging ? intent.y * t.climbSpeed : 0;
      player.jumping = false;
    } else if (player.cling === 'wall') {
      // Straight into the wall holds still (and digs); otherwise walk along it.
      // Losing grip slides the player slowly down.
      player.vy = slipping
        ? t.gripSlideSpeed * (player.gripTimer / t.gripTime)
        : digging || shape.straightHorizontal
          ? 0
          : intent.y * t.climbSpeed;
      if (Math.abs(player.vy) > 0.5) player.climbDir = player.vy < 0 ? -1 : 1;
      player.jumping = false;
    } else if (player.cling === 'ceiling') {
      // A small upward push keeps the body flush; collision stops it.
      player.vy = -1;
      player.jumping = false;
    } else if (swimming) {
      const speed = swim.swimSpeed * inFluid.swimSpeedScale;
      const stroking = Math.abs(intent.y) > 0.2;
      const target = stroking ? intent.y * speed : swim.maxSinkSpeed * inFluid.swimSpeedScale;
      // Diving in fast is braked hard; otherwise ease toward the stroke or a slow sink.
      const rate =
        player.vy > Math.max(target, 0) + 0.01
          ? swim.entryDrag
          : stroking
            ? swim.swimAccel
            : swim.sinkGravity;
      player.vy = approach(player.vy, target, rate * dt);
      player.jumping = false;
      // Head above the surface while stroking up: hop out onto the bank.
      if (upHeld && contact.fluid.headFluid === 0 && !contact.ceiling && !digging) {
        player.vy = -this.jumpVelocity * swim.exitJumpScale;
        player.jumping = true;
      }
    } else {
      player.vy = Math.min(player.vy + t.gravity * dt, t.maxFallSpeed);
    }

    const canJump = player.jumpBufferTimer > 0 && player.coyoteTimer > 0;
    const free = !player.climbing && player.cling === 'none' && !swimming;
    if (free && !digging && canJump && !contact.ceiling) {
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

    // Horizontal: hug a wall, walk a ceiling, center over a column while
    // digging vertically, or run.
    if (player.cling === 'wall') {
      // Keep pushing into the wall: it holds contact, and at the top of the
      // wall the push becomes a mantle onto the ledge.
      player.vx = player.clingSide * t.climbSpeed;
      this.moveHorizontal(player, solid, dt);
    } else if (player.cling === 'ceiling') {
      player.vx = slipping ? 0 : intent.x * t.climbSpeed;
      this.moveHorizontal(player, solid, dt);
      if (player.vx !== 0 && !touching(player.box, 'up', solid)) {
        this.wrapOverCeilingEdge(player, solid, player.vx > 0 ? 1 : -1);
      }
    } else if (player.centerColumn !== null) {
      player.vx = 0;
      const dx = approach(player.x, player.centerColumn + 0.5, t.centerSpeed * dt) - player.x;
      player.x = moveX(player.box, dx, solid).value;
    } else {
      // Wading or swimming slows the run.
      const wading = inFluid !== undefined && contact.fluid.submersion >= swim.wadeSubmersion;
      const target = intent.x * t.maxRunSpeed * (wading ? inFluid.moveScale : 1);
      const accel = swimming
        ? swim.swimAccel
        : contact.grounded
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

    this.splash(player, contact.fluid);
    this.animate(player, dt);
  }

  /** Hitting a fluid's surface fast makes a splash. */
  private splash(player: Player, fluid: FluidContact): void {
    const entered = player.submersion < 0.1 && fluid.submersion >= 0.1;
    if (entered && player.vy >= this.fluids.swim.splashMinSpeed) {
      this.events.emit('splash', {
        x: player.x,
        y: player.y - player.h * fluid.submersion,
        fluid: fluid.fluid,
        speed: player.vy,
      });
    }
    player.submersion = fluid.submersion;
  }

  private updateCling(
    player: Player,
    intent: MoveIntent,
    shape: IntentShape,
    contact: Contact,
    dt: number,
  ): void {
    if (player.cling === 'wall') {
      const side = player.clingSide;
      const onWall = side > 0 ? contact.wallRight : contact.wallLeft;
      // Inner corner: turning up and away from the wall under a ceiling moves onto it.
      if (onWall && contact.ceiling && intent.y < 0 && intent.x * side < -PUSH) {
        this.grab(player, 'ceiling', side);
        return;
      }
      if (!onWall || (contact.grounded && intent.y >= 0)) {
        this.letGo(player);
      } else {
        // Any push toward the wall or upward keeps the grip, so turning a
        // corner (whose drag points up and away) doesn't count as letting go.
        const holding = shape.active && (intent.x * side >= -PUSH || intent.y < -PUSH);
        this.grip(player, holding, dt);
      }
    } else if (player.cling === 'ceiling') {
      // Inner corner: pushing into a wall from the ceiling moves onto the wall.
      for (const side of [1, -1] as const) {
        const onWall = side > 0 ? contact.wallRight : contact.wallLeft;
        if (onWall && intent.x * side > PUSH) {
          this.grab(player, 'wall', side);
          return;
        }
      }
      if (!contact.ceiling) this.letGo(player);
      else this.grip(player, intent.y < 0, dt);
    }
    if (player.cling !== 'none' || player.climbing) return;

    // Grab a ceiling with an up-diagonal (for example jumping into one).
    if (contact.ceiling && !contact.grounded && intent.y < 0 && shape.diagonal) {
      this.grab(player, 'ceiling', player.clingSide);
      return;
    }
    // Grab a wall with an up-diagonal into it, or by pushing into it mid-air.
    for (const side of [1, -1] as const) {
      const onWall = side > 0 ? contact.wallRight : contact.wallLeft;
      if (!onWall || intent.x * side <= PUSH) continue;
      const upDiagonal = intent.y < 0 && shape.diagonal;
      if (upDiagonal || (!contact.grounded && shape.straightHorizontal)) {
        this.grab(player, 'wall', side);
        return;
      }
    }
  }

  private grab(player: Player, cling: 'wall' | 'ceiling', side: 1 | -1): void {
    player.cling = cling;
    player.clingSide = side;
    player.gripTimer = 0;
  }

  private letGo(player: Player): void {
    player.cling = 'none';
    player.gripTimer = 0;
  }

  /** Holding resets the grip; otherwise it wears out over `gripTime` and the player falls. */
  private grip(player: Player, holding: boolean, dt: number): void {
    if (holding) {
      player.gripTimer = 0;
      return;
    }
    player.gripTimer += dt;
    if (player.gripTimer >= this.tuning.gripTime) this.letGo(player);
  }

  /**
   * Outer corner: walking off the edge of a ceiling into an opening carries the
   * player around the edge and onto the wall above it, still going up.
   */
  private wrapOverCeilingEdge(player: Player, solid: SolidFn, dir: 1 | -1): void {
    const top = player.y - player.h;
    if (Math.abs(top - Math.round(top)) > 0.05) return;
    const ceilingRow = Math.round(top) - 1;
    // The last ceiling tile, just behind the body.
    const back = player.x - (dir * player.w) / 2;
    const col = dir > 0 ? Math.floor(back + EPS) - 1 : Math.floor(back - EPS) + 1;
    if (!solid(col, ceilingRow)) return;
    const face = dir > 0 ? col + 1 : col;
    const box = { x: face + (dir * player.w) / 2, y: ceilingRow + 1, w: player.w, h: player.h };
    if (overlapsSolid(box, solid)) return;

    const dx = box.x - player.x;
    const dy = box.y - player.y;
    player.x = box.x;
    player.y = box.y;
    player.prevX += dx;
    player.prevY += dy;
    // Ease the jump around the corner visually.
    player.stepOffsetX -= dx;
    player.stepOffsetY -= dy;
    player.vy = 0;
    player.climbDir = -1;
    this.grab(player, 'wall', dir > 0 ? -1 : 1);
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
    player.stepOffsetX = approach(player.stepOffsetX, 0, dt / t.stepUpSmoothTime);
    // Walking on a wall moves along y; everywhere else along x.
    const along = player.cling === 'wall' ? player.vy : player.vx;
    const onSurface = player.grounded || player.cling !== 'none';
    if (onSurface && Math.abs(along) > 0.5) {
      player.walkPhase += (Math.abs(along) * dt) / 0.9;
    } else {
      player.walkPhase = 0;
    }
  }
}
