import { cloneChunk, type ChunkData } from '@/core/world/chunk';
import type { ChunkCoord } from '@/protocol/messages';
import type { SaveBatch, SaveStore } from './SaveStore';
import { decodeChunk, encodeChunk, type ChunkRecord, type WorldMeta } from './saveFormat';

/**
 * In-memory store. Used in tests, and as a fallback when IndexedDB is
 * unavailable (for example some private browsing modes), so the game still runs.
 */
export class MemorySaveStore implements SaveStore {
  private readonly meta = new Map<string, WorldMeta>();
  private readonly chunks = new Map<string, ChunkRecord>();
  private readonly entities = new Map<string, unknown>();

  async listWorlds(): Promise<WorldMeta[]> {
    return [...this.meta.values()];
  }

  async loadMeta(worldId: string): Promise<WorldMeta | undefined> {
    return this.meta.get(worldId);
  }

  async loadChunks(worldId: string, coords: readonly ChunkCoord[]): Promise<ChunkData[]> {
    return coords
      .map(([cx, cy]) => this.chunks.get(`${worldId}|${cx}|${cy}`))
      .filter((r): r is ChunkRecord => r !== undefined)
      .map((r) => cloneChunk(decodeChunk(r)));
  }

  async loadEntity<T>(worldId: string, id: string): Promise<T | undefined> {
    return structuredClone(this.entities.get(`${worldId}|${id}`)) as T | undefined;
  }

  async commit(worldId: string, batch: SaveBatch): Promise<void> {
    if (batch.meta) this.meta.set(worldId, structuredClone(batch.meta));
    for (const chunk of batch.chunks ?? []) {
      this.chunks.set(`${worldId}|${chunk.cx}|${chunk.cy}`, encodeChunk(worldId, chunk));
    }
    for (const entity of batch.entities ?? []) {
      this.entities.set(`${worldId}|${entity.id}`, structuredClone(entity.data));
    }
  }

  async deleteWorld(worldId: string): Promise<void> {
    this.meta.delete(worldId);
    for (const map of [this.chunks, this.entities]) {
      for (const key of map.keys()) if (key.startsWith(`${worldId}|`)) map.delete(key);
    }
  }
}
