import { CHUNK_AREA, CHUNK_SIZE } from './constants';

/** Bit flags stored per tile in `ChunkData.flags`. */
export const TileFlag = {
  /** Placed by the player rather than generated. */
  Placed: 1 << 0,
  Supported: 1 << 1,
  Wet: 1 << 2,
} as const;

/**
 * One 32×32 block of tiles. Each per-tile field is its own typed array (struct of
 * arrays) so the simulation can scan a single field quickly and chunks can move
 * between threads as transferable buffers.
 */
export interface ChunkData {
  cx: number;
  cy: number;
  material: Uint16Array;
  /** Dig/structural damage, 0–255. */
  damage: Uint8Array;
  fluidType: Uint8Array;
  /** 0–8. */
  fluidAmount: Uint8Array;
  temperature: Int16Array;
  light: Uint8Array;
  flags: Uint8Array;
}

export const CHUNK_FIELDS = [
  'material',
  'damage',
  'fluidType',
  'fluidAmount',
  'temperature',
  'light',
  'flags',
] as const;

export type ChunkField = (typeof CHUNK_FIELDS)[number];

export const tileIndex = (lx: number, ly: number): number => ly * CHUNK_SIZE + lx;

export function createChunk(cx: number, cy: number): ChunkData {
  return {
    cx,
    cy,
    material: new Uint16Array(CHUNK_AREA),
    damage: new Uint8Array(CHUNK_AREA),
    fluidType: new Uint8Array(CHUNK_AREA),
    fluidAmount: new Uint8Array(CHUNK_AREA),
    temperature: new Int16Array(CHUNK_AREA),
    light: new Uint8Array(CHUNK_AREA),
    flags: new Uint8Array(CHUNK_AREA),
  };
}

export function cloneChunk(chunk: ChunkData): ChunkData {
  return {
    cx: chunk.cx,
    cy: chunk.cy,
    material: chunk.material.slice(),
    damage: chunk.damage.slice(),
    fluidType: chunk.fluidType.slice(),
    fluidAmount: chunk.fluidAmount.slice(),
    temperature: chunk.temperature.slice(),
    light: chunk.light.slice(),
    flags: chunk.flags.slice(),
  };
}

/** The buffers to list as transferables when posting a chunk to another thread. */
export function chunkTransferables(chunk: ChunkData): ArrayBuffer[] {
  return CHUNK_FIELDS.map((f) => chunk[f].buffer as ArrayBuffer);
}
