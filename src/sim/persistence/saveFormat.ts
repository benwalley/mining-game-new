import { CHUNK_FIELDS, type ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';

/**
 * Versioned save records. Records are plain data (typed arrays allowed) so they
 * can be stored in IndexedDB today and serialized for cloud sync later.
 *
 * When a record's shape changes: bump SAVE_VERSION and add a migration from the
 * previous version. Never edit an existing migration.
 */
export const SAVE_VERSION = 1;

export interface WorldMeta {
  saveVersion: number;
  worldId: string;
  seed: string;
  generatorId: string;
  dims: WorldDims;
  createdAt: number;
  lastSavedAt: number;
  playTimeMs: number;
}

export interface ChunkRecord {
  saveVersion: number;
  worldId: string;
  cx: number;
  cy: number;
  material: Uint16Array;
  damage: Uint8Array;
  fluidType: Uint8Array;
  fluidAmount: Uint8Array;
  temperature: Int16Array;
  light: Uint8Array;
  flags: Uint8Array;
}

export interface EntityRecord<T = unknown> {
  saveVersion: number;
  worldId: string;
  id: string;
  data: T;
}

type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a record from version n to n + 1. */
const chunkMigrations: Record<number, Migration> = {};
const metaMigrations: Record<number, Migration> = {};
const entityMigrations: Record<number, Migration> = {};

function migrate<T>(record: { saveVersion: number }, migrations: Record<number, Migration>): T {
  let current = record as unknown as Record<string, unknown> & { saveVersion: number };
  if (current.saveVersion > SAVE_VERSION) {
    throw new Error(
      `Save version ${current.saveVersion} is newer than this build (${SAVE_VERSION})`,
    );
  }
  while (current.saveVersion < SAVE_VERSION) {
    const step = migrations[current.saveVersion];
    if (!step) throw new Error(`No migration from save version ${current.saveVersion}`);
    current = { ...step(current), saveVersion: current.saveVersion + 1 } as typeof current;
  }
  return current as unknown as T;
}

export function encodeChunk(worldId: string, chunk: ChunkData): ChunkRecord {
  const record = { saveVersion: SAVE_VERSION, worldId, cx: chunk.cx, cy: chunk.cy } as ChunkRecord;
  for (const field of CHUNK_FIELDS) {
    (record as unknown as Record<string, unknown>)[field] = chunk[field].slice();
  }
  return record;
}

export function decodeChunk(record: ChunkRecord): ChunkData {
  const r = migrate<ChunkRecord>(record, chunkMigrations);
  return {
    cx: r.cx,
    cy: r.cy,
    material: r.material,
    damage: r.damage,
    fluidType: r.fluidType,
    fluidAmount: r.fluidAmount,
    temperature: r.temperature,
    light: r.light,
    flags: r.flags,
  };
}

export const decodeMeta = (record: WorldMeta): WorldMeta => migrate(record, metaMigrations);

export const decodeEntity = <T>(record: EntityRecord<T>): EntityRecord<T> =>
  migrate(record, entityMigrations);
