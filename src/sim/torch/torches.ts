import type { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_AREA, CHUNK_SHIFT, CHUNK_SIZE, chunkKey } from '@/core/world/constants';
import type { TorchTuning } from '@/content/tuning';

/**
 * How many burn steps a torch with this fuel gets. A torch tile keeps its steps
 * left in its damage byte (unused on tiles that can't be dug), so torches save
 * and load with their chunk and need no records of their own.
 */
export function burnSteps(fuel: number, t: TorchTuning): number {
  return Math.max(1, Math.min(255, Math.round((fuel * t.secondsPerFuel) / t.secondsPerStep)));
}

/**
 * Burns every torch the sim holds down by one step (when `step` is set), and
 * puts out any standing in liquid. Returns the torches that went out, for the
 * caller to clear; the chunks whose torches changed, for saving; and torches
 * that burned a step while down to their last `dimSteps`, whose light fades.
 * Scanning every tile once a second is cheap next to a fluid tick.
 */
export function burnTorches(
  chunks: ChunkStore,
  torch: number,
  isLiquid: (fluidType: number, amount: number) => boolean,
  step: boolean,
  dimSteps = 0,
): {
  out: { x: number; y: number }[];
  touched: number[];
  dim: { x: number; y: number; steps: number }[];
} {
  const out: { x: number; y: number }[] = [];
  const touched: number[] = [];
  const dim: { x: number; y: number; steps: number }[] = [];
  for (const chunk of chunks.values()) {
    const { material, damage, fluidType, fluidAmount } = chunk;
    let any = false;
    for (let i = 0; i < CHUNK_AREA; i++) {
      if (material[i] !== torch) continue;
      const drowned = isLiquid(fluidType[i]!, fluidAmount[i]!);
      if (step || drowned) any = true;
      if (!drowned && step) damage[i] = Math.max(0, damage[i]! - 1);
      const x = (chunk.cx << CHUNK_SHIFT) + (i % CHUNK_SIZE);
      const y = (chunk.cy << CHUNK_SHIFT) + Math.floor(i / CHUNK_SIZE);
      if (drowned || damage[i] === 0) out.push({ x, y });
      else if (step && damage[i]! <= dimSteps) dim.push({ x, y, steps: damage[i]! });
    }
    if (any) touched.push(chunkKey(chunk.cx, chunk.cy));
  }
  return { out, touched, dim };
}
