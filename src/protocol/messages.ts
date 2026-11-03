import type { ChunkData } from '@/core/world/chunk';
import type { WorldDims } from '@/core/world/constants';
import type { SimEventKind } from '@/content/fluids';
import type { PickSnapshot } from '@/game/craft/Pick';
import type { ChestsSnapshot } from '@/game/pack/Chests';

/**
 * Messages between the main thread (input, rendering, player) and the
 * simulation worker (world state, generation, saving). Keep every message
 * plain, structured-cloneable data so the same protocol could later be carried
 * over a network.
 */
export const PROTOCOL_VERSION = 10;

/** Which generator builds a world: the real layered world or the flat test world. */
export type WorldKind = 'layered' | 'test';

/** What a save keeps of the pack: stacks in display order, and the held block. */
export interface PackSnapshot {
  items: [numId: number, count: number][];
  held: number | null;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  facing: 1 | -1;
  /** Missing in saves from before slice 5; restore treats them as full. */
  health?: number;
  breath?: number;
  /** Missing in saves from before the pack; restore starts empty. */
  pack?: PackSnapshot;
  /** Missing in saves from before crafting (v5 adds them): a fresh pick, nothing known, no chests. */
  pick?: PickSnapshot;
  recipes?: [template: string, materials: number[]][];
  chests?: ChestsSnapshot;
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

/** A rectangle of one chunk's temperatures (whole degrees), like `FluidPatch`. */
export interface HeatPatch {
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  temperature: Int16Array;
}

/** Something that happened in the world that the main thread may want to show or play. */
export interface SimEvent {
  kind: SimEventKind;
  x: number;
  y: number;
}

export type ToSim =
  | { type: 'init'; protocol: number; worldId: string; kind: WorldKind }
  | { type: 'requestChunks'; chunks: ChunkCoord[] }
  | { type: 'releaseChunks'; chunks: ChunkCoord[] }
  | { type: 'digTile'; x: number; y: number; toolPower: number }
  /** Partial dig progress, so half-dug tiles stay half-dug. */
  | { type: 'damageTiles'; changes: DamageChange[] }
  /**
   * Put a block, torch or chest into an empty tile. Works while paused. `variant` is
   * the material an item remembers (a torch's fuel). Answered with `tilesChanged`, or
   * `placeRejected`.
   */
  | { type: 'placeTile'; x: number; y: number; material: number; variant?: number }
  /** Undo a `placeTile`: take the block out again and put back the fluid it pushed aside. */
  | {
      type: 'unplaceTile';
      x: number;
      y: number;
      material: number;
      fluidType: number;
      fluidAmount: number;
    }
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
  /** A `placeTile` the sim refused (solid or unloaded tile); the block goes back in the pack. */
  | { type: 'placeRejected'; x: number; y: number; material: number; variant: number }
  /** Fluid that moved this tick, for chunks the main thread holds. */
  | { type: 'fluidsChanged'; patches: FluidPatch[] }
  /** Temperatures that changed, a few times a second, for chunks the main thread holds. */
  | { type: 'heatChanged'; patches: HeatPatch[] }
  | { type: 'simEvents'; events: SimEvent[] }
  /** About once a second: how much work the simulation is doing. */
  | {
      type: 'simStats';
      /** Average and worst time per tick since the last report. */
      tickMs: number;
      tickMsMax: number;
      awakeTiles: number;
      /** Chunks whose heat is still changing. */
      heatChunks: number;
      /** Chunks the sim holds in memory. */
      chunks: number;
    }
  | { type: 'saved'; at: number; chunks: number }
  | { type: 'worldReset' }
  | { type: 'error'; message: string };

/** A bidirectional message channel. Implemented by Worker, worker scope, or an in-memory pair for tests. */
export interface MessagePort<In, Out> {
  post(message: Out, transfer?: Transferable[]): void;
  onMessage(handler: (message: In) => void): void;
}
