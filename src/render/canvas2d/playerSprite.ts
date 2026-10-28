import { palette } from '@/content/palette';
import type { DigDirection } from '@/game/dig/digTarget';
import type { Ctx2D } from './surface';

export interface PlayerPose {
  facing: 1 | -1;
  vx: number;
  grounded: boolean;
  digDir: DigDirection | null;
  /** 0–1 through the current pick swing. */
  swing: number;
  /** 0–1 landing squash strength. */
  squash: number;
  walkPhase: number;
}

const STRIKE_ANGLE: Record<DigDirection, number> = {
  left: 0,
  right: 0,
  up: -Math.PI / 2,
  down: Math.PI / 2,
};
const REST_ANGLE = Math.PI / 3;
const WIND_UP = 1.8;

/**
 * Draws the miner in source pixels with the origin at their feet. The sprite
 * itself shows the input: it faces the move, leans into it, and raises the pick
 * toward whatever it's digging. No on-screen control is ever drawn.
 */
export function drawPlayer(ctx: Ctx2D, pose: PlayerPose): void {
  const lean = Math.abs(pose.vx) > 1 ? 1 : 0;
  const stride = pose.grounded ? Math.round(Math.sin(pose.walkPhase * Math.PI)) : 1;
  const bob = pose.grounded && Math.abs(pose.vx) > 0.5 && stride === 0 ? -1 : 0;
  const squashY = 1 - 0.18 * pose.squash;
  const squashX = 1 + 0.14 * pose.squash;

  ctx.save();
  ctx.scale(pose.facing * squashX, squashY);
  const fill = (color: keyof typeof palette, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = palette[color];
    ctx.fillRect(x, y, w, h);
  };

  // Legs and boots.
  fill('rootDark', -4 + stride, -10, 3, 8);
  fill('rootDark', 1 - stride, -10, 3, 8);
  fill('ink', -4 + stride, -2, 3, 2);
  fill('ink', 1 - stride, -2, 4, 2);

  ctx.translate(lean, bob);
  // Torso.
  fill('copper', -5, -20, 10, 10);
  fill('copperLight', -5, -20, 2, 9);
  fill('soilDark', -5, -11, 10, 1);
  // Head and helmet with lamp.
  fill('clayLight', -4, -26, 8, 6);
  fill('ink', 2, -24, 1, 2);
  fill('gold', -5, -29, 10, 3);
  fill('sandLight', -5, -27, 11, 1);
  fill('bone', 4, -29, 2, 2);

  // Arm and pick, pivoting at the shoulder.
  let angle = REST_ANGLE;
  if (pose.digDir) {
    const strike = STRIKE_ANGLE[pose.digDir];
    // Fast strike for the first 35% of the swing, then a slower wind-up.
    const s = pose.swing;
    const wound = s < 0.35 ? 1 - s / 0.35 : (s - 0.35) / 0.65;
    angle = strike - WIND_UP * wound;
  }
  ctx.translate(1, -17);
  ctx.rotate(angle);
  fill('copper', 0, -1, 4, 3);
  fill('root', 3, 0, 9, 1);
  fill('pebble', 10, -3, 2, 7);
  fill('fog', 10, -3, 1, 1);
  ctx.restore();
}
