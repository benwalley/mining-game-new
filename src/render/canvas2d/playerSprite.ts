import { palette, type ColorName } from '@/content/palette';
import type { DigDirection } from '@/game/dig/digTarget';
import type { Appearance, GearSlot } from '@/game/player/appearance';
import type { Ctx2D } from './surface';

export interface PlayerPose {
  /** Facing in the sprite's own frame, after `rotation` (see orientationFor). */
  facing: 1 | -1;
  /** Rotation in radians, a multiple of π/2, so pixels stay crisp. */
  rotation: number;
  /** Speed along whatever surface the mole is on. */
  speed: number;
  onSurface: boolean;
  /** World direction being dug. */
  digDir: DigDirection | null;
  /** 0–1 through the current pick swing. */
  swing: number;
  /** 0–1 landing squash strength. */
  squash: number;
  walkPhase: number;
  /** Seconds since start, for idle animation (blinks, nose wiggles). */
  time: number;
  appearance: Appearance;
}

/** Draws in source pixels, origin at the feet, facing right (+x). */
interface Painter {
  px(color: ColorName, x: number, y: number, w?: number, h?: number): void;
  disc(color: ColorName, cx: number, cy: number, r: number): void;
}

/** Where gear attaches on the body, in source pixels from the feet. */
export const ANCHORS = {
  bodyCenter: { x: 0, y: -7 },
  headTop: { x: 0, y: -14 },
  back: { x: -6, y: -7 },
  hand: { x: 4, y: -5 },
} as const;

type GearDrawer = (p: Painter, pose: PlayerPose) => void;

/**
 * Gear art by id. Armor (slot "body") and packs such as a jetpack (slot
 * "back") are added here; the body never changes to fit them.
 */
const GEAR: Record<string, GearDrawer> = {
  'miner-helmet': (p, pose) => {
    const { x, y } = ANCHORS.headTop;
    p.px('gold', x - 4, y - 2, 8, 1);
    p.px('gold', x - 5, y - 1, 10, 2);
    p.px('sandLight', x - 4, y - 2, 6, 1);
    p.px('rootDark', x - 5, y + 1, 10, 1);
    // Lamp on the front, with a flicker.
    p.px('bone', x + 4, y - 3, 2, 2);
    if (Math.floor(pose.time * 6) % 5 !== 0) p.px('ember', x + 6, y - 2);
  },
};

/** Draw order: back gear sits behind the body, head gear on top of it. */
const BEHIND_BODY: readonly GearSlot[] = ['back'];
const OVER_BODY: readonly GearSlot[] = ['body', 'head'];

const DIG_VECTOR: Record<DigDirection, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** The sprite rotates about this point (near the hitbox center) onto walls and ceilings. */
const PIVOT_Y = -6;

export type Cling = 'none' | 'wall' | 'ceiling';

/**
 * How to stand the sprite on its current surface: feet toward the wall or
 * ceiling, nose toward the direction of travel.
 */
export function orientationFor(
  cling: Cling,
  wallSide: 1 | -1,
  worldFacing: 1 | -1,
  climbDir: 1 | -1,
): { rotation: number; facing: 1 | -1 } {
  if (cling === 'ceiling') return { rotation: Math.PI, facing: worldFacing === 1 ? -1 : 1 };
  if (cling === 'wall') {
    // On a right wall the sprite's +x points up the wall; on a left wall, down.
    const up = climbDir < 0;
    return wallSide > 0
      ? { rotation: -Math.PI / 2, facing: up ? 1 : -1 }
      : { rotation: Math.PI / 2, facing: up ? -1 : 1 };
  }
  return { rotation: 0, facing: worldFacing };
}

/** Pick strike angle in the sprite's frame for a world dig direction. */
function strikeAngle(dir: DigDirection, rotation: number, facing: 1 | -1): number {
  const [wx, wy] = DIG_VECTOR[dir];
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const lx = wx * cos - wy * sin;
  const ly = wx * sin + wy * cos;
  return Math.atan2(ly, lx * facing);
}
/** Pick carried over the shoulder when not digging. */
const REST_ANGLE = -0.9;
const WIND_UP = 1.8;

/**
 * The player: a fuzzy mole ball one tile across. The sprite shows the input,
 * since no control is ever drawn: it faces the move, waddles, and raises the
 * pick toward whatever it's digging.
 */
export function drawPlayer(ctx: Ctx2D, pose: PlayerPose): void {
  const moving = pose.onSurface && Math.abs(pose.speed) > 0.5;
  const step = moving ? Math.round(Math.sin(pose.walkPhase * Math.PI)) : 0;
  // Waddle bob while walking; a slow breath while idle.
  const bob = moving ? (step === 0 ? -1 : 0) : Math.floor(pose.time * 1.6) % 2 === 0 ? 0 : -1;
  const squashY = 1 - 0.25 * pose.squash;
  const squashX = 1 + 0.2 * pose.squash;

  ctx.save();
  if (pose.rotation !== 0) {
    ctx.translate(0, PIVOT_Y);
    ctx.rotate(pose.rotation);
    ctx.translate(0, -PIVOT_Y);
  }
  ctx.scale(pose.facing * squashX, squashY);
  const p = painter(ctx);

  for (const slot of BEHIND_BODY) drawGear(p, pose, slot);

  // Rear claw, behind the body.
  p.px('bone', -5 - step, -1, 3, 1);

  ctx.save();
  ctx.translate(0, bob);
  drawBody(p, pose, moving);
  for (const slot of OVER_BODY) drawGear(p, pose, slot);
  ctx.restore();

  // Front claw.
  p.px('bone', 2 + step, -1, 3, 1);
  p.px('bone', 4 + step, -2);

  drawPick(ctx, p, pose);
  ctx.restore();
}

function drawBody(p: Painter, pose: PlayerPose, moving: boolean): void {
  const { x: cx, y: cy } = ANCHORS.bodyCenter;
  // Fur: a dark rim with tufts that ruffle while moving.
  p.disc('rootDark', cx, cy, 7);
  const ruffle = moving ? Math.floor(pose.walkPhase * 2) % 2 : 0;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + ruffle * 0.3;
    p.px(
      'rootDark',
      Math.round(cx + Math.cos(a) * 7.3 - 0.5),
      Math.round(cy + Math.sin(a) * 7.3 - 0.5),
    );
  }
  p.disc('root', cx, cy + 0.5, 5.8);
  p.disc('soilLight', cx + 1.5, cy + 2.5, 3.2);
  p.px('soilLight', cx - 3, cy - 4, 2, 1);

  // Face, toward +x. Blinks every few seconds; the nose wiggles while idle.
  const blink = pose.time % 3.4 < 0.12;
  if (blink) {
    p.px('ink', 1, -10, 2, 1);
    p.px('ink', 4, -10, 2, 1);
  } else {
    p.px('ink', 1, -11, 2, 2);
    p.px('ink', 4, -11, 2, 2);
    p.px('bone', 1, -11);
    p.px('bone', 4, -11);
  }
  const wiggle = !moving && pose.time % 2.2 < 0.3 ? -1 : 0;
  p.px('rose', 5, -8 + wiggle, 3, 2);
  p.px('sandLight', 6, -8 + wiggle);
  p.px('rose', 0, -7);
}

function drawGear(p: Painter, pose: PlayerPose, slot: GearSlot): void {
  const id = pose.appearance[slot];
  if (id) GEAR[id]?.(p, pose);
}

function drawPick(ctx: Ctx2D, p: Painter, pose: PlayerPose): void {
  let angle = REST_ANGLE;
  if (pose.digDir) {
    const strike = strikeAngle(pose.digDir, pose.rotation, pose.facing);
    // Fast strike for the first 35% of the swing, then a slower wind-up.
    const s = pose.swing;
    const wound = s < 0.35 ? 1 - s / 0.35 : (s - 0.35) / 0.65;
    angle = strike - WIND_UP * wound;
  }
  ctx.save();
  ctx.translate(ANCHORS.hand.x, ANCHORS.hand.y);
  ctx.rotate(angle);
  p.px('root', 1, 0, 7, 1);
  p.px('pebble', 7, -3, 2, 7);
  p.px('fog', 7, -3);
  p.px('rootDark', -1, -1, 3, 3);
  ctx.restore();
}

function painter(ctx: Ctx2D): Painter {
  const px: Painter['px'] = (color, x, y, w = 1, h = 1) => {
    ctx.fillStyle = palette[color];
    ctx.fillRect(x, y, w, h);
  };
  return {
    px,
    disc: (color, cx, cy, r) => {
      ctx.fillStyle = palette[color];
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) ctx.fillRect(x, y, 1, 1);
        }
      }
    },
  };
}
