import { tileIndex, type ChunkData } from '@/core/world/chunk';
import type { ChunkStore } from '@/core/world/ChunkStore';
import { DirtyRect } from '@/core/world/DirtyRect';
import {
  CHUNK_MASK,
  CHUNK_SHIFT,
  CHUNK_SIZE,
  chunkKey,
  chunkKeyX,
  chunkKeyY,
} from '@/core/world/constants';
import { FLUID_MAX, type FluidDef, type FluidRegistry } from '@/content/fluids';
import type { SimEvent } from '@/protocol/messages';

export interface MaterialChange {
  x: number;
  y: number;
  material: number;
}

export interface FluidOutputs {
  /** Tiles whose fluid changed, as a dirty rect per chunk key. */
  changed: Map<number, DirtyRect>;
  /** Tiles whose material changed (reactions). */
  materials: MaterialChange[];
  events: SimEvent[];
}

const idx = (x: number, y: number): number => tileIndex(x & CHUNK_MASK, y & CHUNK_MASK);

/**
 * Water and lava as a cellular automaton over the chunks' fluid layer. Each
 * tick a fluid tile first falls, then spreads sideways toward lower neighbors
 * until level. There is no pressure, so fluid never climbs. Thick fluids move
 * on one tick in `flowEvery`. Reactions (lava touching water) run every tick.
 *
 * Only awake tiles are visited: anything that moves wakes its neighbors for
 * the next tick, and a tile that can't move goes to sleep, so a settled lake
 * costs nothing. Chunks that aren't loaded act like walls.
 */
export class FluidSim {
  private next = new Map<number, DirtyRect>();
  private readonly stamps = new Map<number, Uint8Array>();
  /** Marks tiles that received fluid this tick so it can't move twice. */
  private stamp = 1;
  private tickCount = 0;
  private lastAwake = 0;
  private out: FluidOutputs = { changed: new Map(), materials: [], events: [] };

  constructor(
    private readonly chunks: ChunkStore,
    /** 1 for solid material ids. */
    private readonly solid: Uint8Array,
    private readonly fluids: FluidRegistry,
  ) {}

  /** Tiles scanned on the last tick (sum of awake rects). */
  get awakeTiles(): number {
    return this.lastAwake;
  }

  get sleeping(): boolean {
    return this.next.size === 0;
  }

  /** Wakes every tile in an inclusive world rectangle. */
  wake(x0: number, y0: number, x1: number, y1: number): void {
    const { width, height } = this.chunks.dims;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(width - 1, x1);
    y1 = Math.min(height - 1, y1);
    if (x1 < x0 || y1 < y0) return;
    for (let cy = y0 >> CHUNK_SHIFT; cy <= y1 >> CHUNK_SHIFT; cy++) {
      for (let cx = x0 >> CHUNK_SHIFT; cx <= x1 >> CHUNK_SHIFT; cx++) {
        const bx = cx << CHUNK_SHIFT;
        const by = cy << CHUNK_SHIFT;
        const rect = rectIn(this.next, chunkKey(cx, cy));
        rect.add(Math.max(x0, bx) - bx, Math.max(y0, by) - by);
        rect.add(Math.min(x1, bx + CHUNK_SIZE - 1) - bx, Math.min(y1, by + CHUNK_SIZE - 1) - by);
      }
    }
  }

  /** A chunk arrived: wake it and the edges of its neighbors, which saw it as a wall. */
  wakeChunk(cx: number, cy: number): void {
    const x = cx << CHUNK_SHIFT;
    const y = cy << CHUNK_SHIFT;
    this.wake(x - 1, y - 1, x + CHUNK_SIZE, y + CHUNK_SIZE);
  }

  forgetChunk(cx: number, cy: number): void {
    const key = chunkKey(cx, cy);
    this.next.delete(key);
    this.stamps.delete(key);
  }

  /** Sets a tile's fluid directly (debug pouring, tests). Fails on solid or unloaded tiles. */
  setFluid(x: number, y: number, type: number, amount: number): boolean {
    const chunk = this.cellAt(x, y);
    if (!chunk) return false;
    const i = idx(x, y);
    if (this.solid[chunk.material[i]!]) return false;
    const a = Math.max(0, Math.min(FLUID_MAX, Math.round(amount)));
    chunk.fluidAmount[i] = a;
    chunk.fluidType[i] = a > 0 ? type : 0;
    this.changedAt(x, y);
    this.wake(x - 1, y - 1, x + 1, y + 1);
    return true;
  }

  /** Something else moved fluid at this tile (a falling block): publish it and wake it. */
  touch(x: number, y: number): void {
    this.changedAt(x, y);
    this.wake(x - 1, y - 1, x + 1, y + 1);
  }

  /** Hands over everything that changed since the last call. */
  drain(): FluidOutputs {
    const out = this.out;
    this.out = { changed: new Map(), materials: [], events: [] };
    return out;
  }

  tick(): void {
    this.tickCount++;
    this.stamp = (this.stamp % 255) + 1;
    const current = this.next;
    this.next = new Map();
    // Alternate the sideways scan direction so flow has no left/right bias.
    const flip = (this.tickCount & 1) === 1;
    // Bottom chunks first, like rows within a chunk, so falling fluid isn't revisited.
    const keys = [...current.keys()].sort(
      (a, b) =>
        chunkKeyY(b) - chunkKeyY(a) ||
        (flip ? chunkKeyX(b) - chunkKeyX(a) : chunkKeyX(a) - chunkKeyX(b)),
    );
    let awake = 0;
    for (const key of keys) {
      const chunk = this.chunks.get(chunkKeyX(key), chunkKeyY(key));
      if (!chunk) continue;
      const r = current.get(key)!;
      awake += (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
      this.stepChunk(chunk, key, r, flip);
    }
    this.lastAwake = awake;
  }

  private stepChunk(chunk: ChunkData, key: number, r: DirtyRect, flip: boolean): void {
    const stamps = this.stampsFor(key);
    const bx = chunk.cx << CHUNK_SHIFT;
    const by = chunk.cy << CHUNK_SHIFT;
    const span = r.maxX - r.minX;
    for (let ly = r.maxY; ly >= r.minY; ly--) {
      for (let k = 0; k <= span; k++) {
        const lx = flip ? r.maxX - k : r.minX + k;
        const i = ly * CHUNK_SIZE + lx;
        if (chunk.fluidAmount[i] === 0) continue;
        if (stamps[i] === this.stamp) {
          this.wake(bx + lx, by + ly, bx + lx, by + ly);
          continue;
        }
        this.stepTile(chunk, i, bx + lx, by + ly, flip);
      }
    }
  }

  private stepTile(chunk: ChunkData, i: number, x: number, y: number, flip: boolean): void {
    const type = chunk.fluidType[i]!;
    const def = this.fluids.get(type);
    if (!def) {
      // Unknown fluid id (old save or bad data): drop it.
      chunk.fluidType[i] = 0;
      chunk.fluidAmount[i] = 0;
      this.changedAt(x, y);
      return;
    }
    if (def.reactions.length > 0 && this.react(chunk, i, x, y, def)) return;
    if (this.tickCount % def.flowEvery !== 0) {
      this.wake(x, y, x, y);
      return;
    }

    let a = chunk.fluidAmount[i]!;
    const below = this.open(x, y + 1, type);
    if (below) {
      const room = FLUID_MAX - below.fluidAmount[idx(x, y + 1)]!;
      if (room > 0) {
        const m = Math.min(a, room);
        this.move(chunk, i, x, y, below, x, y + 1, m, type);
        a -= m;
        if (a === 0) return;
      }
    }

    const d1 = flip ? 1 : -1;
    const d2 = -d1;
    const n1 = this.open(x + d1, y, type);
    const n2 = this.open(x + d2, y, type);
    const b1 = n1 ? n1.fluidAmount[idx(x + d1, y)]! : FLUID_MAX;
    const b2 = n2 ? n2.fluidAmount[idx(x + d2, y)]! : FLUID_MAX;
    const ok1 = n1 !== undefined && a - b1 >= 2;
    const ok2 = n2 !== undefined && a - b2 >= 2;

    if (ok1 && ok2) {
      // Share toward the average of the three; any remainder stays here.
      const target = Math.floor((a + b1 + b2) / 3);
      let g1 = Math.max(0, target - b1);
      const g2 = Math.max(0, target - b2);
      if (g1 === 0 && g2 === 0) g1 = 1;
      if (g1 > 0) this.move(chunk, i, x, y, n1, x + d1, y, g1, type);
      if (g2 > 0) this.move(chunk, i, x, y, n2, x + d2, y, g2, type);
    } else if (ok1) {
      this.move(chunk, i, x, y, n1, x + d1, y, (a - b1) >> 1, type);
    } else if (ok2) {
      this.move(chunk, i, x, y, n2, x + d2, y, (a - b2) >> 1, type);
    } else if (a === 1) {
      // A lone unit drips off a ledge instead of sitting at its edge forever.
      if (n1 && b1 === 0 && this.hasRoomBelow(x + d1, y, type)) {
        this.move(chunk, i, x, y, n1, x + d1, y, 1, type);
      } else if (n2 && b2 === 0 && this.hasRoomBelow(x + d2, y, type)) {
        this.move(chunk, i, x, y, n2, x + d2, y, 1, type);
      }
    }
  }

  /** Runs this fluid's first matching reaction with a 4-neighbor. */
  private react(chunk: ChunkData, i: number, x: number, y: number, def: FluidDef): boolean {
    for (const r of def.reactions) {
      for (let n = 0; n < 4; n++) {
        const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0);
        const ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0);
        const other = this.cellAt(nx, ny);
        if (!other) continue;
        const ni = idx(nx, ny);
        if (other.fluidType[ni] !== r.touching || other.fluidAmount[ni] === 0) continue;

        chunk.material[i] = r.becomes;
        chunk.damage[i] = 0;
        chunk.fluidType[i] = 0;
        chunk.fluidAmount[i] = 0;
        const left = other.fluidAmount[ni]! - r.consumes;
        other.fluidAmount[ni] = Math.max(0, left);
        if (left <= 0) other.fluidType[ni] = 0;

        this.changedAt(x, y);
        this.changedAt(nx, ny);
        this.out.materials.push({ x, y, material: r.becomes });
        this.out.events.push({ kind: r.event, x, y });
        this.wake(
          Math.min(x, nx) - 1,
          Math.min(y, ny) - 1,
          Math.max(x, nx) + 1,
          Math.max(y, ny) + 1,
        );
        return true;
      }
    }
    return false;
  }

  private move(
    src: ChunkData,
    si: number,
    sx: number,
    sy: number,
    dst: ChunkData,
    dx: number,
    dy: number,
    amount: number,
    type: number,
  ): void {
    if (amount <= 0) return;
    const di = idx(dx, dy);
    src.fluidAmount[si] = src.fluidAmount[si]! - amount;
    if (src.fluidAmount[si] === 0) src.fluidType[si] = 0;
    dst.fluidAmount[di] = dst.fluidAmount[di]! + amount;
    dst.fluidType[di] = type;
    this.stampsFor(chunkKey(dst.cx, dst.cy))[di] = this.stamp;
    this.changedAt(sx, sy);
    this.changedAt(dx, dy);
    this.wake(
      Math.min(sx, dx) - 1,
      Math.min(sy, dy) - 1,
      Math.max(sx, dx) + 1,
      Math.max(sy, dy) + 1,
    );
  }

  /** The chunk holding (x, y) if fluid of `type` can enter it: loaded, not solid, no other fluid. */
  private open(x: number, y: number, type: number): ChunkData | undefined {
    const chunk = this.cellAt(x, y);
    if (!chunk) return undefined;
    const i = idx(x, y);
    if (this.solid[chunk.material[i]!]) return undefined;
    const t = chunk.fluidType[i]!;
    return t === 0 || t === type ? chunk : undefined;
  }

  private hasRoomBelow(x: number, y: number, type: number): boolean {
    const below = this.open(x, y + 1, type);
    return below !== undefined && below.fluidAmount[idx(x, y + 1)]! < FLUID_MAX;
  }

  private cellAt(x: number, y: number): ChunkData | undefined {
    if (!this.chunks.inBounds(x, y)) return undefined;
    return this.chunks.get(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
  }

  private changedAt(x: number, y: number): void {
    rectIn(this.out.changed, chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT)).add(
      x & CHUNK_MASK,
      y & CHUNK_MASK,
    );
  }

  private stampsFor(key: number): Uint8Array {
    let s = this.stamps.get(key);
    if (!s) {
      s = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      this.stamps.set(key, s);
    }
    return s;
  }
}

function rectIn(map: Map<number, DirtyRect>, key: number): DirtyRect {
  let rect = map.get(key);
  if (!rect) {
    rect = new DirtyRect();
    map.set(key, rect);
  }
  return rect;
}
