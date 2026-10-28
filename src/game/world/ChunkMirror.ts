import { ChunkStore } from '@/core/world/ChunkStore';
import type { ChunkData } from '@/core/world/chunk';
import { UNLOADED, type WorldDims } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import type { TileChange } from '@/protocol/messages';

export interface MirrorListener {
  chunkLoaded(chunk: ChunkData): void;
  chunkUnloaded(cx: number, cy: number): void;
  tileChanged(x: number, y: number): void;
}

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

  setMaterial(x: number, y: number, material: number): void {
    if (this.store.materialAt(x, y) === material) return;
    if (!this.store.setMaterial(x, y, material)) return;
    for (const l of this.listeners) l.tileChanged(x, y);
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
    for (const c of changes) this.setMaterial(c.x, c.y, c.material);
  }

  clear(): void {
    for (const chunk of [...this.store.values()]) this.removeChunk(chunk.cx, chunk.cy);
  }
}
