import { CHUNK_FIELDS, type ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';

/**
 * Versioned save records. Records are plain data (typed arrays allowed) so they
 * can be stored in IndexedDB today and serialized for cloud sync later.
 *
 * When a record's shape changes: bump SAVE_VERSION and add a migration from the
 * previous version. Never edit an existing migration.
 */
export const SAVE_VERSION = 5;

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
const chunkMigrations: Record<number, Migration> = {
  // v2 added `origin` (what rubble was made from).
  1: (r) => ({ ...r, origin: new Uint16Array((r.material as Uint16Array).length) }),
  // v3 dropped it again, with cave-ins.
  2: ({ origin: _origin, ...r }) => r,
  3: (r) => r,
  // v5 added torches, which keep their burn time in the damage byte; nothing to change.
  4: (r) => r,
};
const metaMigrations: Record<number, Migration> = {
  1: (r) => r,
  2: (r) => r,
  3: (r) => r,
  4: (r) => r,
};
const entityMigrations: Record<number, Migration> = {
  1: (r) => r,
  2: (r) => r,
  // v4 added the pack to the player; old saves start with an empty one.
  3: (r) => ({
    ...r,
    data: { ...(r.data as Record<string, unknown>), pack: { items: [], held: null } },
  }),
  // v5 added the pick, known recipes and chests to the player; old saves start with a
  // fresh pick, nothing known and no chests, which restore does when they're missing.
  4: (r) => r,
};

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
