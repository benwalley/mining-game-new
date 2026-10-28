export const CHUNK_SIZE = 32;
export const CHUNK_SHIFT = 5;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

/** Source-art size of one tile in pixels. */
export const TILE_PX = 16;

/** Returned by tile lookups when the containing chunk isn't loaded. */
export const UNLOADED = -1;

export interface WorldDims {
  /** World width in tiles. */
  width: number;
  /** World height in tiles. */
  height: number;
  /** Row of the topmost ground tile at the surface; rows above are open sky. */
  surfaceY: number;
}

export const chunkCountX = (dims: WorldDims): number => Math.ceil(dims.width / CHUNK_SIZE);
export const chunkCountY = (dims: WorldDims): number => Math.ceil(dims.height / CHUNK_SIZE);

/** Packs chunk coords into one number for Map keys. Chunk coords are never negative. */
export const chunkKey = (cx: number, cy: number): number => cy * 65536 + cx;
export const chunkKeyX = (key: number): number => key % 65536;
export const chunkKeyY = (key: number): number => Math.floor(key / 65536);
