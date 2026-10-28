import type { ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';
import type { SimEventKind } from '@/content/fluids';

/**
 * Messages between the main thread (input, rendering, player) and the
 * simulation worker (world state, generation, saving). Keep every message
 * plain, structured-cloneable data so the same protocol could later be carried
 * over a network.
 */
export const PROTOCOL_VERSION = 5;

/** Which generator builds a world: the real layered world or the flat test world. */
export type WorldKind = 'layered' | 'test';

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
  /** Set when the change also sets damage (cracks while a ceiling fails). */
  damage?: number;
  /** What the tile remembers being (rubble). */
  origin?: number;
}

export interface DamageChange {
  x: number;
  y: number;
  /** 0–254; 255 would mean broken, which is sent as `digTile` instead. */
  damage: number;
}

/** A rectangle of one chunk's fluid layer, in local tile coords; arrays are row-major w×h. */
export interface FluidPatch {
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  type: Uint8Array;
  amount: Uint8Array;
}

/** Something that happened in the world that the main thread may want to show or play. */
export interface SimEvent {
  kind: SimEventKind;
  x: number;
  y: number;
  /** The material involved, when there is one (what collapsed or landed). */
  material?: number;
}

export type ToSim =
  | { type: 'init'; protocol: number; worldId: string; kind: WorldKind }
  | { type: 'requestChunks'; chunks: ChunkCoord[] }
  | { type: 'releaseChunks'; chunks: ChunkCoord[] }
  | { type: 'digTile'; x: number; y: number; toolPower: number }
  /** Partial dig progress, so half-dug tiles stay half-dug. */
  | { type: 'damageTiles'; changes: DamageChange[] }
  | { type: 'playerState'; player: PlayerSnapshot }
  | { type: 'setPaused'; paused: boolean }
  /** Save everything dirty right now (page is hiding or closing). */
  | { type: 'flush' }
  | { type: 'resetWorld' }
  /** Debug: fill a tile with fluid. */
  | { type: 'pourFluid'; x: number; y: number; fluid: number; amount: number };

export type FromSim =
  | { type: 'ready'; world: WorldInfo; player: PlayerSnapshot | null; playTimeMs: number }
  | { type: 'chunk'; chunk: ChunkData }
  /** Authoritative tile values; the main thread overwrites its mirror with these. */
  | { type: 'tilesChanged'; changes: TileChange[] }
  /** Fluid that moved this tick, for chunks the main thread holds. */
  | { type: 'fluidsChanged'; patches: FluidPatch[] }
  | { type: 'simEvents'; events: SimEvent[] }
  /** About once a second: how much work the simulation is doing. */
  | { type: 'simStats'; tickMs: number; awakeTiles: number; solidsActive: number }
  | { type: 'saved'; at: number; chunks: number }
  | { type: 'worldReset' }
  | { type: 'error'; message: string };

/** A bidirectional message channel. Implemented by Worker, worker scope, or an in-memory pair for tests. */
export interface MessagePort<In, Out> {
  post(message: Out, transfer?: Transferable[]): void;
  onMessage(handler: (message: In) => void): void;
}
