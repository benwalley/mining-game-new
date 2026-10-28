import type { ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';

/**
 * Messages between the main thread (input, rendering, player) and the
 * simulation worker (world state, generation, saving). Keep every message
 * plain, structured-cloneable data so the same protocol could later be carried
 * over a network.
 */
export const PROTOCOL_VERSION = 1;

export interface PlayerSnapshot {
  x: number;
  y: number;
  facing: 1 | -1;
}

export interface WorldInfo {
  worldId: string;
  seed: string;
  dims: WorldDims;
  spawn: { x: number; y: number };
  generatorId: string;
}

export type ChunkCoord = readonly [cx: number, cy: number];

export interface TileChange {
  x: number;
  y: number;
  material: number;
}

export type ToSim =
  | { type: 'init'; protocol: number; worldId: string }
  | { type: 'requestChunks'; chunks: ChunkCoord[] }
  | { type: 'releaseChunks'; chunks: ChunkCoord[] }
  | { type: 'digTile'; x: number; y: number; toolPower: number }
  | { type: 'playerState'; player: PlayerSnapshot }
  | { type: 'setPaused'; paused: boolean }
  /** Save everything dirty right now (page is hiding or closing). */
  | { type: 'flush' }
  | { type: 'resetWorld' };

export type FromSim =
  | { type: 'ready'; world: WorldInfo; player: PlayerSnapshot | null; playTimeMs: number }
  | { type: 'chunk'; chunk: ChunkData }
  /** Authoritative tile values; the main thread overwrites its mirror with these. */
  | { type: 'tilesChanged'; changes: TileChange[] }
  | { type: 'saved'; at: number; chunks: number }
  | { type: 'worldReset' }
  | { type: 'error'; message: string };

/** A bidirectional message channel. Implemented by Worker, worker scope, or an in-memory pair for tests. */
export interface MessagePort<In, Out> {
  post(message: Out, transfer?: Transferable[]): void;
  onMessage(handler: (message: In) => void): void;
}
