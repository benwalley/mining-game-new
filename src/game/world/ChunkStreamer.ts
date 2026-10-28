import { CHUNK_SIZE, chunkCountX, chunkCountY, chunkKey } from '@/core/world/constants';
import type { ChunkCoord } from '@/protocol/messages';
import type { SimClient } from '@/protocol/SimClient';
import type { ChunkMirror } from './ChunkMirror';

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Requests chunks entering the view (plus a margin) and releases ones far outside it. */
export class ChunkStreamer {
  private readonly requested = new Set<number>();

  constructor(
    private readonly mirror: ChunkMirror,
    private readonly sim: SimClient,
    private readonly loadMargin: number,
    private readonly unloadMargin: number,
  ) {}

  /** Call when a chunk arrives so it's no longer counted as pending. */
  received(cx: number, cy: number): void {
    this.requested.delete(chunkKey(cx, cy));
  }

  update(view: TileRect): void {
    const load = this.chunkRange(view, this.loadMargin);
    const want: ChunkCoord[] = [];
    for (let cy = load.y0; cy <= load.y1; cy++) {
      for (let cx = load.x0; cx <= load.x1; cx++) {
        const key = chunkKey(cx, cy);
        if (this.mirror.store.has(cx, cy) || this.requested.has(key)) continue;
        this.requested.add(key);
        want.push([cx, cy]);
      }
    }
    // Nearest first so the area around the player arrives before the edges.
    if (want.length > 0) {
      const ccx = (view.x + view.w / 2) / CHUNK_SIZE;
      const ccy = (view.y + view.h / 2) / CHUNK_SIZE;
      want.sort((a, b) => dist2(a, ccx, ccy) - dist2(b, ccx, ccy));
      this.sim.send({ type: 'requestChunks', chunks: want });
    }

    const keep = this.chunkRange(view, this.unloadMargin);
    const release: ChunkCoord[] = [];
    for (const chunk of this.mirror.store.values()) {
      const { cx, cy } = chunk;
      if (cx < keep.x0 || cx > keep.x1 || cy < keep.y0 || cy > keep.y1) release.push([cx, cy]);
    }
    if (release.length > 0) {
      for (const [cx, cy] of release) this.mirror.removeChunk(cx, cy);
      this.sim.send({ type: 'releaseChunks', chunks: release });
    }
  }

  reset(): void {
    this.requested.clear();
  }

  private chunkRange(view: TileRect, margin: number) {
    const dims = this.mirror.dims;
    return {
      x0: Math.max(0, Math.floor(view.x / CHUNK_SIZE) - margin),
      y0: Math.max(0, Math.floor(view.y / CHUNK_SIZE) - margin),
      x1: Math.min(chunkCountX(dims) - 1, Math.floor((view.x + view.w) / CHUNK_SIZE) + margin),
      y1: Math.min(chunkCountY(dims) - 1, Math.floor((view.y + view.h) / CHUNK_SIZE) + margin),
    };
  }
}

const dist2 = ([cx, cy]: ChunkCoord, x: number, y: number): number =>
  (cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2;
