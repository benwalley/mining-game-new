import { describe, expect, it } from 'vitest';
import { createChunk } from '@/core/world/chunk';
import { decodeChunk, encodeChunk, SAVE_VERSION, type ChunkRecord } from './saveFormat';

describe('saveFormat', () => {
  it('round-trips a chunk', () => {
    const chunk = createChunk(2, 3);
    chunk.material[5] = 7;
    chunk.origin[5] = 6;
    const back = decodeChunk(encodeChunk('w', chunk));
    expect(back.material[5]).toBe(7);
    expect(back.origin[5]).toBe(6);
  });

  it('upgrades a v1 chunk by adding an empty origin field', () => {
    const v1: Partial<ChunkRecord> = { ...encodeChunk('w', createChunk(0, 0)), saveVersion: 1 };
    delete v1.origin;
    const record = v1 as ChunkRecord;
    const chunk = decodeChunk(record);
    expect(SAVE_VERSION).toBe(2);
    expect(chunk.origin).toBeInstanceOf(Uint16Array);
    expect(chunk.origin.length).toBe(chunk.material.length);
  });
});
