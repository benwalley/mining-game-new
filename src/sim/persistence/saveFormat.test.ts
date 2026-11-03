import { describe, expect, it } from 'vitest';
import { createChunk } from '@/core/world/chunk';
import {
  decodeChunk,
  decodeEntity,
  encodeChunk,
  SAVE_VERSION,
  type ChunkRecord,
  type EntityRecord,
} from './saveFormat';

describe('saveFormat', () => {
  it('round-trips a chunk', () => {
    const chunk = createChunk(2, 3);
    chunk.material[5] = 7;
    chunk.temperature[5] = 412;
    const back = decodeChunk(encodeChunk('w', chunk));
    expect(back.material[5]).toBe(7);
    expect(back.temperature[5]).toBe(412);
  });

  it('upgrades v1 and v2 chunks, ending without the dropped origin field', () => {
    expect(SAVE_VERSION).toBe(6);
    const current = encodeChunk('w', createChunk(0, 0));
    const v2 = {
      ...current,
      saveVersion: 2,
      origin: new Uint16Array(current.material.length),
    } as ChunkRecord;
    const v1 = { ...current, saveVersion: 1 } as ChunkRecord;
    for (const record of [v1, v2]) {
      const chunk = decodeChunk(record);
      expect('origin' in chunk).toBe(false);
      expect(chunk.material.length).toBe(current.material.length);
    }
  });

  it('gives players from before the pack an empty one', () => {
    const old: EntityRecord = {
      saveVersion: 3,
      worldId: 'w',
      id: 'player',
      data: { x: 4, y: 9, facing: 1 },
    };
    const back = decodeEntity(old);
    expect(back.saveVersion).toBe(SAVE_VERSION);
    expect(back.data).toEqual({ x: 4, y: 9, facing: 1, pack: { items: [], held: null } });
  });
});
