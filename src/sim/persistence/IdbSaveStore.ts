import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChunkData } from '@/core/world/chunk';
import type { ChunkCoord } from '@/protocol/messages';
import type { SaveBatch, SaveStore } from './SaveStore';
import {
  SAVE_VERSION,
  decodeChunk,
  decodeEntity,
  decodeMeta,
  encodeChunk,
  type ChunkRecord,
  type EntityRecord,
  type WorldMeta,
} from './saveFormat';

const DB_NAME = 'deepkind';
/** IndexedDB schema version (object stores and indexes), separate from SAVE_VERSION. */
const DB_VERSION = 1;

interface DeepkindDB extends DBSchema {
  meta: { key: string; value: WorldMeta };
  chunks: { key: [string, number, number]; value: ChunkRecord };
  entities: { key: [string, string]; value: EntityRecord };
  // Later phases add: colonies, journal.
}

export class IdbSaveStore implements SaveStore {
  private constructor(private readonly db: IDBPDatabase<DeepkindDB>) {}

  static async open(): Promise<IdbSaveStore> {
    const db = await openDB<DeepkindDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('meta', { keyPath: 'worldId' });
          database.createObjectStore('chunks', { keyPath: ['worldId', 'cx', 'cy'] });
          database.createObjectStore('entities', { keyPath: ['worldId', 'id'] });
        }
      },
    });
    return new IdbSaveStore(db);
  }

  async listWorlds(): Promise<WorldMeta[]> {
    return (await this.db.getAll('meta')).map(decodeMeta);
  }

  async loadMeta(worldId: string): Promise<WorldMeta | undefined> {
    const record = await this.db.get('meta', worldId);
    return record && decodeMeta(record);
  }

  async loadChunks(worldId: string, coords: readonly ChunkCoord[]): Promise<ChunkData[]> {
    const tx = this.db.transaction('chunks', 'readonly');
    const records = await Promise.all(coords.map(([cx, cy]) => tx.store.get([worldId, cx, cy])));
    await tx.done;
    return records.filter((r): r is ChunkRecord => r !== undefined).map(decodeChunk);
  }

  async loadEntity<T>(worldId: string, id: string): Promise<T | undefined> {
    const record = await this.db.get('entities', [worldId, id]);
    return record && (decodeEntity(record).data as T);
  }

  async commit(worldId: string, batch: SaveBatch): Promise<void> {
    const tx = this.db.transaction(['meta', 'chunks', 'entities'], 'readwrite');
    const writes: Promise<unknown>[] = [];
    if (batch.meta) writes.push(tx.objectStore('meta').put(batch.meta));
    for (const chunk of batch.chunks ?? []) {
      writes.push(tx.objectStore('chunks').put(encodeChunk(worldId, chunk)));
    }
    for (const entity of batch.entities ?? []) {
      writes.push(
        tx.objectStore('entities').put({
          saveVersion: SAVE_VERSION,
          worldId,
          id: entity.id,
          data: entity.data,
        }),
      );
    }
    await Promise.all([...writes, tx.done]);
  }

  async deleteWorld(worldId: string): Promise<void> {
    const tx = this.db.transaction(['meta', 'chunks', 'entities'], 'readwrite');
    await Promise.all([
      tx.objectStore('meta').delete(worldId),
      tx
        .objectStore('chunks')
        .delete(IDBKeyRange.bound([worldId, -Infinity, -Infinity], [worldId, Infinity, Infinity])),
      tx.objectStore('entities').delete(IDBKeyRange.bound([worldId, ''], [worldId, '￿'])),
      tx.done,
    ]);
  }
}
