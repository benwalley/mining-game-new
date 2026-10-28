import { ChunkStore } from '@/core/world/ChunkStore';
import { tileIndex, type ChunkData } from '@/core/world/chunk';
import {
  CHUNK_MASK,
  CHUNK_SHIFT,
  CHUNK_SIZE,
  UNLOADED,
  type WorldDims,
} from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import type { FluidPatch, TileChange } from '@/protocol/messages';

export interface MirrorListener {
  chunkLoaded(chunk: ChunkData): void;
  chunkUnloaded(cx: number, cy: number): void;
  tileChanged(x: number, y: number): void;
  /** Fluid moved somewhere in this chunk. */
  fluidsChanged?(cx: number, cy: number): void;
}

/** Packs a tile's fluid as `type << 4 | amount`, so 0 means none. */
export const fluidType = (packed: number): number => packed >> 4;
export const fluidAmount = (packed: number): number => packed & 15;

/**
 * Main-thread copy of the chunks near the player, used for collision and
 * rendering. The sim worker is authoritative; local edits (digging) are applied
 * here immediately for zero latency and confirmed by the worker.
 */
export class ChunkMirror {
  readonly store: ChunkStore;
  private readonly listeners: MirrorListener[] = [];
  private readonly solidById: Uint8Array;

  constructor(
    readonly dims: WorldDims,
    readonly materials: MaterialRegistry,
  ) {
    this.store = new ChunkStore(dims, materials.bedrock.numId);
    this.solidById = new Uint8Array(materials.maxNumId + 1);
    for (const m of materials.all) this.solidById[m.numId] = m.solid ? 1 : 0;
  }

  addListener(listener: MirrorListener): void {
    this.listeners.push(listener);
  }

  materialAt(x: number, y: number): number {
    return this.store.materialAt(x, y);
  }

  /** Unloaded tiles count as solid so the player can never fall out of loaded space. */
  readonly isSolid = (x: number, y: number): boolean => {
    const m = this.store.materialAt(x, y);
    return m === UNLOADED || this.solidById[m] === 1;
  };

  /** The tile's fluid, packed (see `fluidType` / `fluidAmount`); 0 for none or unloaded. */
  readonly fluidAt = (x: number, y: number): number => {
    if (!this.store.inBounds(x, y)) return 0;
    const chunk = this.store.get(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
    if (!chunk) return 0;
    const i = tileIndex(x & CHUNK_MASK, y & CHUNK_MASK);
    return (chunk.fluidType[i]! << 4) | chunk.fluidAmount[i]!;
  };

  isLoaded(x: number, y: number): boolean {
    return this.store.materialAt(x, y) !== UNLOADED;
  }

  addChunk(chunk: ChunkData): void {
    this.store.set(chunk);
    for (const l of this.listeners) l.chunkLoaded(chunk);
  }

  removeChunk(cx: number, cy: number): void {
    if (!this.store.delete(cx, cy)) return;
    for (const l of this.listeners) l.chunkUnloaded(cx, cy);
  }

  setMaterial(x: number, y: number, material: number, origin = 0): void {
    if (this.store.materialAt(x, y) === material && this.store.originAt(x, y) === origin) return;
    if (!this.store.setMaterial(x, y, material, origin)) return;
    for (const l of this.listeners) l.tileChanged(x, y);
  }

  originAt(x: number, y: number): number {
    return this.store.originAt(x, y);
  }

  damageAt(x: number, y: number): number {
    return this.store.damageAt(x, y);
  }

  /**
   * Records tile damage. Listeners only hear about it when `redraw` is set
   * (the visible crack stage changed), so digging doesn't redraw every frame.
   */
  setDamage(x: number, y: number, damage: number, redraw: boolean): void {
    if (!this.store.setDamage(x, y, damage) || !redraw) return;
    for (const l of this.listeners) l.tileChanged(x, y);
  }

  applyChanges(changes: readonly TileChange[]): void {
    for (const c of changes) {
      this.setMaterial(c.x, c.y, c.material, c.origin ?? 0);
      if (c.damage !== undefined && this.store.damageAt(c.x, c.y) !== c.damage) {
        this.setDamage(c.x, c.y, c.damage, true);
      }
    }
  }

  applyFluids(patches: readonly FluidPatch[]): void {
    for (const p of patches) {
      const chunk = this.store.get(p.cx, p.cy);
      if (!chunk) continue;
      for (let row = 0; row < p.h; row++) {
        const to = (p.y0 + row) * CHUNK_SIZE + p.x0;
        chunk.fluidType.set(p.type.subarray(row * p.w, (row + 1) * p.w), to);
        chunk.fluidAmount.set(p.amount.subarray(row * p.w, (row + 1) * p.w), to);
      }
      for (const l of this.listeners) l.fluidsChanged?.(p.cx, p.cy);
    }
  }

  clear(): void {
    for (const chunk of [...this.store.values()]) this.removeChunk(chunk.cx, chunk.cy);
  }
}
