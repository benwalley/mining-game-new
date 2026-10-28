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
 * Liquids and gases as a cellular automaton over the chunks' fluid layer. Each
 * tick a liquid tile first falls (a gas first rises), then spreads sideways
 * toward lower neighbors until level. There is no pressure, so liquid never
 * climbs. Thick fluids move on one tick in `flowEvery`; thin gas fades; gas in
 * open sky blows away. Reactions (lava touching water, firedamp touching lava
 * or flame) run every tick.
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
    const gas = def.kind === 'gas';
    if (gas && y < this.chunks.dims.surfaceY) {
      // Gas reaching open sky blows away.
      this.drop(chunk, i, x, y, chunk.fluidAmount[i]!);
      return;
    }
    if (def.decay && chunk.fluidAmount[i]! <= def.decay.maxAmount) {
      this.wake(x, y, x, y); // Keep visiting until it's gone.
      // Stagger tiles so a thin cloud fades unevenly rather than all at once.
      if ((this.tickCount + x * 7 + y * 13) % def.decay.everyTicks === 0) {
        this.drop(chunk, i, x, y, 1);
        if (chunk.fluidAmount[i] === 0) return;
      }
    }
    if (this.tickCount % def.flowEvery !== 0) {
      this.wake(x, y, x, y);
      return;
    }

    // Liquids fall, gases rise. Either pushes the other kind out of its way.
    const vy = y + (gas ? -1 : 1);
    if (this.swap(chunk, i, x, y, x, vy, def)) return;
    let a = chunk.fluidAmount[i]!;
    const next = this.open(x, vy, type);
    if (next) {
      const room = FLUID_MAX - next.fluidAmount[idx(x, vy)]!;
      if (room > 0) {
        const m = Math.min(a, room);
        this.move(chunk, i, x, y, next, x, vy, m, type);
        a -= m;
        if (a === 0) return;
      }
    }

    const d1 = flip ? 1 : -1;
    const d2 = -d1;
    // A liquid spreading sideways into gas pushes the gas out too.
    if (
      !gas &&
      a >= 2 &&
      (this.swap(chunk, i, x, y, x + d1, y, def) || this.swap(chunk, i, x, y, x + d2, y, def))
    ) {
      return;
    }
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
      // A lone unit drips off a ledge (or slips past a gas's ceiling edge) instead
      // of sitting at its edge forever.
      const dy = gas ? -1 : 1;
      if (n1 && b1 === 0 && this.hasRoom(x + d1, y + dy, type)) {
        this.move(chunk, i, x, y, n1, x + d1, y, 1, type);
      } else if (n2 && b2 === 0 && this.hasRoom(x + d2, y + dy, type)) {
        this.move(chunk, i, x, y, n2, x + d2, y, 1, type);
      }
    }
  }

  /** Removes `amount` from a tile and wakes its neighbors, which may flow into the space. */
  private drop(chunk: ChunkData, i: number, x: number, y: number, amount: number): void {
    const left = Math.max(0, chunk.fluidAmount[i]! - amount);
    chunk.fluidAmount[i] = left;
    if (left === 0) chunk.fluidType[i] = 0;
    this.changedAt(x, y);
    this.wake(x - 1, y - 1, x + 1, y + 1);
  }

  /**
   * Trades places with a fluid of the other kind at (tx, ty): a liquid sinking
   * into gas, or gas rising into a liquid, so bubbles rise and floods push gas out.
   */
  private swap(
    chunk: ChunkData,
    i: number,
    x: number,
    y: number,
    tx: number,
    ty: number,
    def: FluidDef,
  ): boolean {
    const other = this.cellAt(tx, ty);
    if (!other) return false;
    const j = idx(tx, ty);
    if (this.solid[other.material[j]!]) return false;
    const t = other.fluidType[j]!;
    if (t === 0 || t === def.id || this.fluids.get(t)?.kind === def.kind) return false;
    const amount = other.fluidAmount[j]!;
    other.fluidType[j] = def.id;
    other.fluidAmount[j] = chunk.fluidAmount[i]!;
    chunk.fluidType[i] = t;
    chunk.fluidAmount[i] = amount;
    this.stampsFor(chunkKey(other.cx, other.cy))[j] = this.stamp;
    this.stampsFor(chunkKey(chunk.cx, chunk.cy))[i] = this.stamp;
    this.changedAt(x, y);
    this.changedAt(tx, ty);
    this.wake(Math.min(x, tx) - 1, Math.min(y, ty) - 1, Math.max(x, tx) + 1, Math.max(y, ty) + 1);
    return true;
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

        if ('material' in r.result) {
          chunk.material[i] = r.result.material;
          chunk.damage[i] = 0;
          chunk.fluidType[i] = 0;
          chunk.fluidAmount[i] = 0;
          this.out.materials.push({ x, y, material: r.result.material });
        } else {
          chunk.fluidType[i] = r.result.fluid;
        }
        if (r.consumes > 0) {
          const left = other.fluidAmount[ni]! - r.consumes;
          other.fluidAmount[ni] = Math.max(0, left);
          if (left <= 0) other.fluidType[ni] = 0;
        }

        this.changedAt(x, y);
        this.changedAt(nx, ny);
        if (r.event) this.out.events.push({ kind: r.event, x, y });
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

  private hasRoom(x: number, y: number, type: number): boolean {
    const chunk = this.open(x, y, type);
    return chunk !== undefined && chunk.fluidAmount[idx(x, y)]! < FLUID_MAX;
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
