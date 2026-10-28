import { tileIndex, type ChunkData } from './chunk';
import { CHUNK_MASK, CHUNK_SHIFT, UNLOADED, chunkKey, type WorldDims } from './constants';

/**
 * A sparse map of loaded chunks with tile-level access in world coordinates.
 * Used both by the simulation worker (authoritative copy) and the main thread
 * (a mirror for collision and rendering).
 */
export class ChunkStore {
  private readonly chunks = new Map<number, ChunkData>();

  constructor(
    readonly dims: WorldDims,
    /** Material reported for coordinates outside the world (the bounding bedrock). */
    private readonly outOfBoundsMaterial: number,
  ) {}

  get size(): number {
    return this.chunks.size;
  }

  get(cx: number, cy: number): ChunkData | undefined {
    return this.chunks.get(chunkKey(cx, cy));
  }

  has(cx: number, cy: number): boolean {
    return this.chunks.has(chunkKey(cx, cy));
  }

  set(chunk: ChunkData): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cy), chunk);
  }

  delete(cx: number, cy: number): boolean {
    return this.chunks.delete(chunkKey(cx, cy));
  }

  clear(): void {
    this.chunks.clear();
  }

  values(): IterableIterator<ChunkData> {
    return this.chunks.values();
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.dims.width && y < this.dims.height;
  }

  /** Material id at a world tile, `UNLOADED` if its chunk isn't loaded. */
  materialAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return this.outOfBoundsMaterial;
    const chunk = this.chunks.get(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
    if (!chunk) return UNLOADED;
    return chunk.material[tileIndex(x & CHUNK_MASK, y & CHUNK_MASK)] as number;
  }

  /**
   * Sets a tile's material and clears its damage, since damage belongs to the
   * material that took it. Returns false if the chunk isn't loaded or the tile
   * is out of bounds.
   */
  setMaterial(x: number, y: number, material: number): boolean {
    const chunk = this.chunkAt(x, y);
    if (!chunk) return false;
    const i = tileIndex(x & CHUNK_MASK, y & CHUNK_MASK);
    chunk.material[i] = material;
    chunk.damage[i] = 0;
    return true;
  }

  /** Damage (0–255) at a world tile, `UNLOADED` if its chunk isn't loaded. */
  damageAt(x: number, y: number): number {
    const chunk = this.chunkAt(x, y);
    if (!chunk) return UNLOADED;
    return chunk.damage[tileIndex(x & CHUNK_MASK, y & CHUNK_MASK)] as number;
  }

  setDamage(x: number, y: number, damage: number): boolean {
    const chunk = this.chunkAt(x, y);
    if (!chunk) return false;
    chunk.damage[tileIndex(x & CHUNK_MASK, y & CHUNK_MASK)] = damage;
    return true;
  }

  private chunkAt(x: number, y: number): ChunkData | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.chunks.get(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
  }
}
