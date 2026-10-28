import type { ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';

/**
 * Produces chunks deterministically from a seed. Must not depend on the order
 * chunks are requested in. Phase 1 replaces the test generator with the real
 * layered pipeline behind this same interface.
 */
export interface WorldGenerator {
  /** Identifies generator + config; saved worlds from another id are discarded. */
  readonly id: string;
  readonly dims: WorldDims;
  readonly spawn: { x: number; y: number };
  generateChunk(cx: number, cy: number): ChunkData;
}
