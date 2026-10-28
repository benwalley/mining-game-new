import { DirtyRect } from '@/core/world/DirtyRect';
import type { ChunkData } from '@/core/world/chunk';
import { CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE, TILE_PX, chunkKey } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import { crackStage } from '@/game/dig/crack';
import type { ChunkMirror, MirrorListener } from '@/game/world/ChunkMirror';
import { createSurface, type Ctx2D, type Surface } from './surface';
import type { TileAtlas } from './TileAtlas';

const CHUNK_PX = CHUNK_SIZE * TILE_PX;
const EDGE_ALPHA = 0.55;
const SHADOW_ALPHA = 0.35;

interface CacheEntry {
  cx: number;
  cy: number;
  canvas: Surface;
  ctx: Ctx2D;
  dirty: DirtyRect;
}

/**
 * Keeps each loaded chunk pre-rendered at source resolution. Only the dirty
 * rectangle of a chunk is redrawn, so a static world costs one drawImage per
 * visible chunk per frame.
 */
export class ChunkCache implements MirrorListener {
  private readonly entries = new Map<number, CacheEntry>();
  private readonly pool: { canvas: Surface; ctx: Ctx2D }[] = [];
  private readonly drawable: Uint8Array;

  constructor(
    private readonly mirror: ChunkMirror,
    private readonly atlas: TileAtlas,
    materials: MaterialRegistry,
    private readonly surfaceY: number,
    private readonly crackStages: number,
  ) {
    this.drawable = new Uint8Array(materials.maxNumId + 1);
    for (const m of materials.all) this.drawable[m.numId] = m.visual ? 1 : 0;
  }

  get(cx: number, cy: number): Surface | undefined {
    return this.entries.get(chunkKey(cx, cy))?.canvas;
  }

  chunkLoaded(chunk: ChunkData): void {
    const key = chunkKey(chunk.cx, chunk.cy);
    let entry = this.entries.get(key);
    if (!entry) {
      const surface = this.pool.pop() ?? createSurface(CHUNK_PX, CHUNK_PX);
      entry = { cx: chunk.cx, cy: chunk.cy, ...surface, dirty: new DirtyRect() };
      this.entries.set(key, entry);
    }
    entry.dirty.addAll();
    // Neighbors drew their shared edge assuming this chunk was solid; redraw that strip.
    const x0 = chunk.cx * CHUNK_SIZE;
    const y0 = chunk.cy * CHUNK_SIZE;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      this.markTile(x0 - 1, y0 + i);
      this.markTile(x0 + CHUNK_SIZE, y0 + i);
      this.markTile(x0 + i, y0 - 1);
      this.markTile(x0 + i, y0 + CHUNK_SIZE);
    }
  }

  chunkUnloaded(cx: number, cy: number): void {
    const key = chunkKey(cx, cy);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.pool.push({ canvas: entry.canvas, ctx: entry.ctx });
  }

  tileChanged(x: number, y: number): void {
    this.markTile(x, y);
    this.markTile(x - 1, y);
    this.markTile(x + 1, y);
    this.markTile(x, y - 1);
    this.markTile(x, y + 1);
  }

  clear(): void {
    for (const entry of [...this.entries.values()]) this.chunkUnloaded(entry.cx, entry.cy);
  }

  /** Redraws dirty regions. `budget` caps how many chunks are touched per frame. */
  flush(budget = 6): void {
    let used = 0;
    for (const entry of this.entries.values()) {
      if (entry.dirty.isEmpty) continue;
      this.redraw(entry);
      if (++used >= budget) return;
    }
  }

  private markTile(x: number, y: number): void {
    if (x < 0 || y < 0) return;
    const entry = this.entries.get(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
    entry?.dirty.add(x & CHUNK_MASK, y & CHUNK_MASK);
  }

  private redraw(entry: CacheEntry): void {
    const { ctx, dirty } = entry;
    const x0 = entry.cx * CHUNK_SIZE;
    const y0 = entry.cy * CHUNK_SIZE;
    for (let ly = dirty.minY; ly <= dirty.maxY; ly++) {
      for (let lx = dirty.minX; lx <= dirty.maxX; lx++) {
        this.drawTile(ctx, x0 + lx, y0 + ly, lx * TILE_PX, ly * TILE_PX);
      }
    }
    dirty.clear();
  }

  private drawTile(ctx: Ctx2D, x: number, y: number, px: number, py: number): void {
    const mirror = this.mirror;
    const m = mirror.materialAt(x, y);
    ctx.clearRect(px, py, TILE_PX, TILE_PX);
    if (m < 0) return;

    const solid = mirror.isSolid;
    if (this.drawable[m] === 1) {
      this.atlas.drawMaterial(ctx, m, px, py);
      // Outline faces exposed to open space so tunnels read clearly.
      ctx.globalAlpha = EDGE_ALPHA;
      ctx.fillStyle = '#0d0b10';
      if (!solid(x, y - 1)) ctx.fillRect(px, py, TILE_PX, 1);
      if (!solid(x, y + 1)) ctx.fillRect(px, py + TILE_PX - 1, TILE_PX, 1);
      if (!solid(x - 1, y)) ctx.fillRect(px, py, 1, TILE_PX);
      if (!solid(x + 1, y)) ctx.fillRect(px + TILE_PX - 1, py, 1, TILE_PX);
      ctx.globalAlpha = 1;
      // Partly dug tiles keep their cracks.
      this.atlas.drawCrack(ctx, crackStage(mirror.damageAt(x, y), this.crackStages), px, py);
      return;
    }

    if (y < this.surfaceY) return; // Open sky: leave transparent.
    this.atlas.drawBackdrop(ctx, px, py);
    // Soft shadow where open space meets rock.
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.fillStyle = '#0d0b10';
    if (solid(x, y - 1)) ctx.fillRect(px, py, TILE_PX, 3);
    if (solid(x - 1, y)) ctx.fillRect(px, py, 2, TILE_PX);
    if (solid(x + 1, y)) ctx.fillRect(px + TILE_PX - 2, py, 2, TILE_PX);
    ctx.globalAlpha = 1;
  }
}
