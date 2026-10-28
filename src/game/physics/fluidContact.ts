import { FLUID_MAX } from '@/content/fluids';
import type { Box } from './tileCollision';

/** A tile's fluid packed as `type << 4 | amount`; 0 for none. */
export type FluidFn = (tx: number, ty: number) => number;

export interface FluidContact {
  /** The fluid covering most of the body, 0 for none. */
  fluid: number;
  /** Fraction of the body's height under that fluid, 0–1. */
  submersion: number;
  /** Fluid at eye height, 0 when the head is in air. */
  headFluid: number;
}

export const NO_FLUID: FluidContact = { fluid: 0, submersion: 0, headFluid: 0 };

/** Eye height as a fraction of the body, from the feet. */
const EYE = 0.7;
const depthByType = new Float64Array(16);

/** Top edge of the fluid in a tile: the full tile under more of the same fluid, else its amount. */
function surfaceOf(fluidAt: FluidFn, x: number, y: number, packed: number): number {
  return fluidAt(x, y - 1) >> 4 === packed >> 4 ? y : y + 1 - (packed & 15) / FLUID_MAX;
}

/** How deep the body sits in fluid, sampled down its center column. */
export function senseFluid(box: Box, fluidAt: FluidFn): FluidContact {
  const col = Math.floor(box.x);
  const top = box.y - box.h;
  depthByType.fill(0);
  for (let row = Math.floor(top); row <= Math.floor(box.y - 1e-6); row++) {
    const f = fluidAt(col, row);
    if (f === 0) continue;
    const overlap = Math.min(row + 1, box.y) - Math.max(surfaceOf(fluidAt, col, row, f), top);
    if (overlap > 0) depthByType[f >> 4] += overlap;
  }
  let fluid = 0;
  for (let t = 1; t < depthByType.length; t++) {
    if (depthByType[t]! > depthByType[fluid]!) fluid = t;
  }

  const eyeY = box.y - box.h * EYE;
  const atEye = fluidAt(col, Math.floor(eyeY));
  const headFluid =
    atEye !== 0 && eyeY >= surfaceOf(fluidAt, col, Math.floor(eyeY), atEye) ? atEye >> 4 : 0;
  return { fluid, submersion: fluid ? Math.min(1, depthByType[fluid]! / box.h) : 0, headFluid };
}
