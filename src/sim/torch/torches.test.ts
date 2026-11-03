import { describe, expect, it } from 'vitest';
import { ChunkStore } from '@/core/world/ChunkStore';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { chunkKey } from '@/core/world/constants';
import { tuning } from '@/content/tuning';
import { burnSteps, burnTorches } from './torches';

const TORCH = 24;
const liquid = (_type: number, amount: number) => amount > 0;

function world() {
  const chunks = new ChunkStore({ width: 64, height: 64, surfaceY: 0 }, 1);
  const chunk = createChunk(1, 0);
  chunks.set(chunk);
  return { chunks, chunk };
}

describe('torches', () => {
  it('gets more burn steps from better fuel, within a byte', () => {
    expect(burnSteps(9, tuning.torch)).toBeGreaterThan(burnSteps(2, tuning.torch));
    expect(burnSteps(1000, tuning.torch)).toBe(255);
    expect(burnSteps(0, tuning.torch)).toBe(1);
  });

  it('burns a step only when asked, and goes out at zero', () => {
    const { chunks, chunk } = world();
    const i = tileIndex(3, 4);
    chunk.material[i] = TORCH;
    chunk.damage[i] = 2;
    expect(burnTorches(chunks, TORCH, liquid, false)).toEqual({ out: [], touched: [] });
    expect(burnTorches(chunks, TORCH, liquid, true).out).toEqual([]);
    expect(chunk.damage[i]).toBe(1);
    const last = burnTorches(chunks, TORCH, liquid, true);
    expect(last.out).toEqual([{ x: 32 + 3, y: 4 }]);
    expect(last.touched).toEqual([chunkKey(1, 0)]);
  });

  it('puts out a torch standing in liquid', () => {
    const { chunks, chunk } = world();
    const i = tileIndex(0, 0);
    chunk.material[i] = TORCH;
    chunk.damage[i] = 100;
    chunk.fluidAmount[i] = 3;
    expect(burnTorches(chunks, TORCH, liquid, false).out).toEqual([{ x: 32, y: 0 }]);
  });
});
