import type { ChunkData } from '@/core/world/chunk';
import type { ChunkCoord } from '@/protocol/messages';
import type { WorldMeta } from './saveFormat';

export interface SaveBatch {
  meta?: WorldMeta;
  chunks?: ChunkData[];
  entities?: { id: string; data: unknown }[];
}

/**
 * Storage for worlds. IndexedDB is the only implementation that ships today; a
 * cloud-sync layer can later wrap or replicate it without touching game code.
 */
export interface SaveStore {
  listWorlds(): Promise<WorldMeta[]>;
  loadMeta(worldId: string): Promise<WorldMeta | undefined>;
  /** Returns only the chunks that have been saved; the rest regenerate from the seed. */
  loadChunks(worldId: string, coords: readonly ChunkCoord[]): Promise<ChunkData[]>;
  loadEntity<T>(worldId: string, id: string): Promise<T | undefined>;
  /** Writes everything in one transaction, so a save is all-or-nothing. */
  commit(worldId: string, batch: SaveBatch): Promise<void>;
  deleteWorld(worldId: string): Promise<void>;
}
