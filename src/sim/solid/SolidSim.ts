import { tileIndex, type ChunkData } from '@/core/world/chunk';
import type { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_MASK, CHUNK_SHIFT, UNLOADED, chunkKey } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import type { SupportTuning } from '@/content/tuning';
import type { SimEvent, TileChange } from '@/protocol/messages';
import { isUnsupported, type SupportView } from './support';

export interface SolidOutputs {
  tiles: TileChange[];
  events: SimEvent[];
  /** Tiles whose contents moved, as flat x, y pairs, so fluids around them wake. */
  touched: number[];
  /** Keys of chunks that changed, for saving. */
  chunks: Set<number>;
}

interface Failing {
  left: number;
  total: number;
  /** Seconds until the next puff of dust. */
  dust: number;
  material: number;
}

/** Cracks grow to just short of breaking while a ceiling fails. */
const MAX_CRACK = 230;

/**
 * Gravity for solids: loose tiles (sand, rubble) fall, and (when
 * `ceilingsCollapse` is on; it's off for now) ceilings that lose support fail. Nothing is scanned every tick: a change (a dig, a fall) queues
 * checks for the tiles it could affect, and only tiles found unstable are
 * tracked. Failure is telegraphed: a ceiling creaks, sheds dust and cracks for
 * `failSeconds` before it collapses into rubble that remembers what it was.
 * Knock-on failures after a collapse get a shorter warning, and loose sand
 * slips for a moment before it falls.
 */
export class SolidSim {
  private checks = new Map<number, boolean>();
  private readonly failing = new Map<number, Failing>();
  private readonly loose = new Map<number, number>();
  private falling = new Set<number>();
  private out: SolidOutputs = emptyOutputs();
  private readonly solidById: Uint8Array;
  private readonly fallsById: Uint8Array;
  private readonly spanById: Float64Array;
  private readonly maxSpan: number;
  private readonly width: number;
  private readonly rubble: number;
  private readonly air: number;
  private readonly view: SupportView;

  constructor(
    private readonly chunks: ChunkStore,
    materials: MaterialRegistry,
    private readonly tuning: SupportTuning,
  ) {
    const n = materials.maxNumId + 1;
    this.solidById = new Uint8Array(n);
    this.fallsById = new Uint8Array(n);
    this.spanById = new Float64Array(n);
    let maxSpan = 0;
    for (const m of materials.all) {
      this.solidById[m.numId] = m.solid ? 1 : 0;
      this.fallsById[m.numId] = materials.falls(m) ? 1 : 0;
      this.spanById[m.numId] = m.indestructible ? Infinity : m.supportSpan;
      if (!m.indestructible) maxSpan = Math.max(maxSpan, m.supportSpan);
    }
    this.maxSpan = maxSpan;
    this.width = chunks.dims.width;
    this.rubble = materials.rubble.numId;
    this.air = materials.air.numId;
    this.view = {
      solid: (x, y) => this.solidAt(x, y),
      span: (x, y) => this.spanById[this.chunks.materialAt(x, y)] ?? 0,
    };
  }

  /** Tiles currently slipping, failing or falling. */
  get active(): number {
    return this.failing.size + this.loose.size + this.falling.size;
  }

  /**
   * A tile stopped being solid: check what it held up. `quick` marks knock-on
   * effects of a collapse or fall, which get a short warning instead of a long one.
   */
  removed(x: number, y: number, quick = false): void {
    this.check(x, y - 1, quick);
    // Ceilings in this row and the row above may have reached support through this tile.
    for (const row of [y - 1, y]) {
      for (const dir of [-1, 1]) {
        for (let i = 1; i <= this.maxSpan; i++) {
          const tx = x + dir * i;
          if (!this.solidAt(tx, row)) break;
          this.check(tx, row, quick);
        }
      }
    }
  }

  forgetChunk(cx: number, cy: number): void {
    const inChunk = (key: number) => {
      const x = key % this.width;
      const y = Math.floor(key / this.width);
      return x >> CHUNK_SHIFT === cx && y >> CHUNK_SHIFT === cy;
    };
    for (const key of [...this.failing.keys()]) if (inChunk(key)) this.failing.delete(key);
    for (const key of [...this.loose.keys()]) if (inChunk(key)) this.loose.delete(key);
    for (const key of [...this.falling]) if (inChunk(key)) this.falling.delete(key);
  }

  /** Hands over everything that changed since the last call. */
  drain(): SolidOutputs {
    const out = this.out;
    this.out = emptyOutputs();
    return out;
  }

  tick(dt: number): void {
    const checks = this.checks;
    this.checks = new Map();
    for (const [key, quick] of checks) this.evaluate(key, quick);

    for (const [key, f] of this.failing) {
      const x = key % this.width;
      const y = Math.floor(key / this.width);
      if (this.chunks.materialAt(x, y) !== f.material) {
        this.failing.delete(key); // Dug out or replaced meanwhile.
        continue;
      }
      f.left -= dt;
      f.dust -= dt;
      if (f.dust <= 0) {
        f.dust = this.tuning.dustEverySeconds;
        this.out.events.push({ kind: 'creak', x, y, material: f.material });
      }
      if (f.left <= 0) {
        this.failing.delete(key);
        if (isUnsupported(this.view, x, y)) this.collapse(x, y, key);
        continue;
      }
      const damage = Math.round(MAX_CRACK * (1 - f.left / f.total));
      if (damage > this.chunks.damageAt(x, y)) {
        this.chunks.setDamage(x, y, damage);
        this.out.tiles.push({
          x,
          y,
          material: f.material,
          damage,
          origin: this.chunks.originAt(x, y),
        });
        this.out.chunks.add(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
      }
    }

    for (const [key, left] of this.loose) {
      if (left - dt > 0) {
        this.loose.set(key, left - dt);
        continue;
      }
      this.loose.delete(key);
      const x = key % this.width;
      const y = Math.floor(key / this.width);
      if (this.fallsById[this.materialOrAir(x, y)] && !this.solidAt(x, y + 1))
        this.falling.add(key);
    }

    // Bottom rows first (larger keys), so a falling column moves as one.
    const order = [...this.falling].sort((a, b) => b - a);
    this.falling = new Set();
    for (const key of order) this.fall(key);
  }

  private check(x: number, y: number, quick: boolean): void {
    if (!this.chunks.inBounds(x, y)) return;
    const key = y * this.width + x;
    this.checks.set(key, quick || (this.checks.get(key) ?? false));
  }

  private evaluate(key: number, quick: boolean): void {
    const x = key % this.width;
    const y = Math.floor(key / this.width);
    const m = this.materialOrAir(x, y);
    if (!this.solidById[m]) return;
    if (this.fallsById[m]) {
      if (this.solidAt(x, y + 1) || this.falling.has(key)) return;
      if (quick || m === this.rubble) {
        this.falling.add(key);
      } else if (!this.loose.has(key)) {
        this.loose.set(key, this.tuning.looseSeconds);
        this.out.events.push({ kind: 'loose', x, y, material: m });
      }
      return;
    }
    if (!this.tuning.ceilingsCollapse) return;
    if (this.failing.has(key) || !isUnsupported(this.view, x, y)) return;
    const total = quick ? this.tuning.chainFailSeconds : this.tuning.failSeconds;
    this.failing.set(key, { left: total, total, dust: 0, material: m });
  }

  private collapse(x: number, y: number, key: number): void {
    const m = this.materialOrAir(x, y);
    const origin = m === this.rubble ? this.chunks.originAt(x, y) : m;
    this.chunks.setMaterial(x, y, this.rubble, origin);
    this.out.tiles.push({ x, y, material: this.rubble, damage: 0, origin });
    this.out.events.push({ kind: 'collapse', x, y, material: origin });
    this.out.chunks.add(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
    this.falling.add(key);
  }

  private fall(key: number): void {
    const x = key % this.width;
    const y = Math.floor(key / this.width);
    const m = this.materialOrAir(x, y);
    if (!this.fallsById[m]) return; // Dug out meanwhile.
    const src = this.cell(x, y);
    const dst = this.cell(x, y + 1);
    if (!src || !dst || this.solidById[dst.chunk.material[dst.i]!]) {
      this.out.events.push({ kind: 'land', x, y, material: m });
      return;
    }

    const origin = src.chunk.origin[src.i]!;
    dst.chunk.material[dst.i] = m;
    dst.chunk.origin[dst.i] = origin;
    dst.chunk.damage[dst.i] = 0;
    // Whatever fluid was below swaps up into the space the tile left.
    src.chunk.fluidType[src.i] = dst.chunk.fluidType[dst.i]!;
    src.chunk.fluidAmount[src.i] = dst.chunk.fluidAmount[dst.i]!;
    dst.chunk.fluidType[dst.i] = 0;
    dst.chunk.fluidAmount[dst.i] = 0;
    src.chunk.material[src.i] = this.air;
    src.chunk.origin[src.i] = 0;
    src.chunk.damage[src.i] = 0;

    this.out.tiles.push(
      { x, y, material: this.air, damage: 0 },
      { x, y: y + 1, material: m, damage: 0, origin },
    );
    this.out.touched.push(x, y, x, y + 1);
    this.out.chunks.add(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
    this.out.chunks.add(chunkKey(x >> CHUNK_SHIFT, (y + 1) >> CHUNK_SHIFT));
    this.falling.add(key + this.width);
    this.removed(x, y, true);
  }

  private cell(x: number, y: number): { chunk: ChunkData; i: number } | undefined {
    if (!this.chunks.inBounds(x, y)) return undefined;
    const chunk = this.chunks.get(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
    return chunk ? { chunk, i: tileIndex(x & CHUNK_MASK, y & CHUNK_MASK) } : undefined;
  }

  /** Air for unloaded tiles, so they never count as something to move. */
  private materialOrAir(x: number, y: number): number {
    const m = this.chunks.materialAt(x, y);
    return m === UNLOADED ? this.air : m;
  }

  /** Unloaded tiles count as solid: nothing falls into or fails at the edge of the known world. */
  private solidAt(x: number, y: number): boolean {
    const m = this.chunks.materialAt(x, y);
    return m === UNLOADED || this.solidById[m] === 1;
  }
}

function emptyOutputs(): SolidOutputs {
  return { tiles: [], events: [], touched: [], chunks: new Set() };
}
