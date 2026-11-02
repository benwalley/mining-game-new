import { tileIndex, type ChunkData } from '@/core/world/chunk';
import { DirtyRect } from '@/core/world/DirtyRect';
import { CHUNK_AREA, CHUNK_SHIFT, CHUNK_SIZE, chunkKey } from '@/core/world/constants';
import { FLUID_MAX, type FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import type { HeatTuning } from '@/content/tuning';
import { ALL_ACTIVE, type ZoneMap } from '../zones';

const LAST = CHUNK_SIZE - 1;

interface ChunkHeat {
  chunk: ChunkData;
  cx: number;
  cy: number;
  /** Degrees above ambient, kept fractional so slow tails don't stall at rounding. */
  off: Float32Array;
  /** Conductivity of each tile, 1–10: its fluid's, or else its material's. */
  cond: Float32Array;
  /** Offset a heat source holds its tile at, or NaN where there's no source. */
  src: Float32Array;
  hasSource: boolean;
  /** Materials or fluids changed since `cond` and `src` were read. */
  stale: boolean;
}

/**
 * Temperature as diffusion between neighboring tiles (design doc section 6).
 * The sim works in degrees above each row's ambient temperature: undisturbed
 * rock sits at zero, so it never needs simulating, and every tile slowly
 * loses its extra heat back toward ambient, which bounds how far a source's
 * warmth reaches. Heat passes between two tiles at a rate set by both
 * conductivities (their harmonic mean, so one insulating tile blocks it).
 * Fluids with a temperature (lava, flame) hold their tile at it.
 *
 * Only awake chunks run. A chunk sleeps once nothing in it changes by more
 * than `sleepBelow` degrees a tick, and wakes when its tiles change or heat
 * crosses in from a neighbor. Chunks that aren't loaded pass no heat.
 */
export class HeatSim {
  private readonly states = new Map<number, ChunkHeat>();
  private readonly awake = new Set<number>();
  private changed = new Map<number, DirtyRect>();
  private readonly condById: Float32Array;
  private readonly fluidCond: Float32Array;
  private readonly fluidTemp: Float32Array;

  constructor(
    materials: MaterialRegistry,
    fluids: FluidRegistry,
    /** Ambient degrees for each world row. */
    private readonly ambient: Float32Array,
    private readonly tuning: HeatTuning,
  ) {
    this.condById = new Float32Array(materials.maxNumId + 1);
    for (const m of materials.all) this.condById[m.numId] = m.conductivity;
    this.fluidCond = new Float32Array(fluids.maxId + 1);
    this.fluidTemp = new Float32Array(fluids.maxId + 1).fill(NaN);
    for (const f of fluids.all) {
      this.fluidCond[f.id] = f.conductivity;
      if (f.temperature !== null) this.fluidTemp[f.id] = f.temperature;
    }
  }

  get awakeChunks(): number {
    return this.awake.size;
  }

  get sleeping(): boolean {
    return this.awake.size === 0;
  }

  /**
   * Starts tracking a chunk that just arrived. A freshly generated chunk with
   * a heat source in it is brought to its steady state at once, so a lava
   * pocket is already hot when the player first finds it.
   */
  addChunk(chunk: ChunkData, generated: boolean): void {
    const key = chunkKey(chunk.cx, chunk.cy);
    const off = new Float32Array(CHUNK_AREA);
    const y0 = chunk.cy << CHUNK_SHIFT;
    for (let i = 0; i < CHUNK_AREA; i++) {
      const o = chunk.temperature[i]! - this.ambientAt(y0 + (i >> CHUNK_SHIFT));
      // Within rounding of ambient is ambient, or rock would stir on every load.
      off[i] = Math.abs(o) <= 0.5 ? 0 : o;
    }
    const state: ChunkHeat = {
      chunk,
      cx: chunk.cx,
      cy: chunk.cy,
      off,
      cond: new Float32Array(CHUNK_AREA),
      src: new Float32Array(CHUNK_AREA),
      hasSource: false,
      stale: true,
    };
    this.states.set(key, state);
    this.refresh(state);
    if (generated && state.hasSource) {
      for (let n = 0; n < this.tuning.settleSweeps; n++) this.sweep(state, 1, true);
    }
    // Neighbors saw an unloaded edge until now.
    this.awake.add(key);
    for (const [dx, dy] of NEIGHBORS) {
      const nkey = chunkKey(chunk.cx + dx, chunk.cy + dy);
      if (chunk.cx + dx >= 0 && chunk.cy + dy >= 0 && this.states.has(nkey)) this.awake.add(nkey);
    }
  }

  forgetChunk(cx: number, cy: number): void {
    const key = chunkKey(cx, cy);
    this.states.delete(key);
    this.awake.delete(key);
    this.changed.delete(key);
  }

  /** A tile's material or fluid changed: re-read the chunk and wake it. */
  tileChanged(x: number, y: number): void {
    if (x < 0 || y < 0) return;
    this.chunkChanged(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
  }

  chunkChanged(cx: number, cy: number): void {
    const key = chunkKey(cx, cy);
    const state = this.states.get(key);
    if (!state) return;
    state.stale = true;
    this.awake.add(key);
  }

  /** Tiles whose whole-degree temperature changed since the last call, per chunk key. */
  drain(): Map<number, DirtyRect> {
    const out = this.changed;
    this.changed = new Map();
    return out;
  }

  /** One step for every awake chunk the zones run this tick. */
  tick(zones: ZoneMap = ALL_ACTIVE): void {
    for (const key of [...this.awake]) {
      const state = this.states.get(key);
      if (!state) {
        this.awake.delete(key);
        continue;
      }
      if (!zones.runsNow(state.cx, state.cy)) continue;
      if (state.stale) this.refresh(state);
      const edges = this.sweep(state, zones.dtScale(state.cx, state.cy), false);
      const quiet = this.tuning.sleepBelow;
      if (Math.max(edges[0], edges[1], edges[2], edges[3], edges[4]) < quiet) {
        this.awake.delete(key);
      }
      // Heat moving across an edge wakes the chunk on the other side.
      for (let e = 0; e < 4; e++) {
        if (edges[e]! < quiet) continue;
        const [dx, dy] = NEIGHBORS[e]!;
        const nkey = chunkKey(state.cx + dx, state.cy + dy);
        if (state.cx + dx >= 0 && state.cy + dy >= 0 && this.states.has(nkey)) {
          this.awake.add(nkey);
        }
      }
    }
  }

  private ambientAt(y: number): number {
    return this.ambient[Math.max(0, Math.min(this.ambient.length - 1, y))]!;
  }

  private refresh(state: ChunkHeat): void {
    const { chunk, cond, src } = state;
    const y0 = state.cy << CHUNK_SHIFT;
    let hasSource = false;
    for (let i = 0; i < CHUNK_AREA; i++) {
      const amount = chunk.fluidAmount[i]!;
      const fluid = amount > 0 ? chunk.fluidType[i]! : 0;
      cond[i] = fluid ? this.fluidCond[fluid]! : this.condById[chunk.material[i]!]!;
      const temp = fluid ? this.fluidTemp[fluid]! : NaN;
      if (temp === temp) {
        src[i] = ((temp - this.ambientAt(y0 + (i >> CHUNK_SHIFT))) * amount) / FLUID_MAX;
        hasSource = true;
      } else {
        src[i] = NaN;
      }
    }
    state.hasSource = hasSource;
    state.stale = false;
  }

  /**
   * Updates every tile of a chunk in place. `scale` is how many ticks this
   * step stands for; `settle` jumps each tile straight to the balance of its
   * neighbors instead (for warming a new chunk up). Returns the largest change
   * on the left, right, top and bottom edges, and anywhere.
   */
  private sweep(state: ChunkHeat, scale: number, settle: boolean): number[] {
    const { off, cond, src, chunk } = state;
    const { rate, loss } = this.tuning;
    const k = rate / 5; // rate × harmonic mean / 10, with the mean's factor of 2 folded in.
    const left = this.states.get(chunkKey(state.cx - 1, state.cy));
    const right = this.states.get(chunkKey(state.cx + 1, state.cy));
    const up = this.states.get(chunkKey(state.cx, state.cy - 1));
    const down = this.states.get(chunkKey(state.cx, state.cy + 1));
    const temperature = chunk.temperature;
    const y0 = state.cy << CHUNK_SHIFT;
    let rect: DirtyRect | undefined;
    let maxL = 0;
    let maxR = 0;
    let maxU = 0;
    let maxD = 0;
    let maxAll = 0;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const amb = this.ambientAt(y0 + ly);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = tileIndex(lx, ly);
        const o = off[i]!;
        let next: number;
        const s = src[i]!;
        if (s === s) {
          next = s;
        } else {
          const c = cond[i]!;
          let sum = 0;
          let sk = loss;
          let cn: number;
          let w: number;
          // Left, right, up, down; across chunk edges where the neighbor is loaded.
          if (lx > 0) {
            cn = cond[i - 1]!;
            w = (k * c * cn) / (c + cn);
            sum += w * off[i - 1]!;
            sk += w;
          } else if (left) {
            cn = left.cond[i + LAST]!;
            w = (k * c * cn) / (c + cn);
            sum += w * left.off[i + LAST]!;
            sk += w;
          }
          if (lx < LAST) {
            cn = cond[i + 1]!;
            w = (k * c * cn) / (c + cn);
            sum += w * off[i + 1]!;
            sk += w;
          } else if (right) {
            cn = right.cond[i - LAST]!;
            w = (k * c * cn) / (c + cn);
            sum += w * right.off[i - LAST]!;
            sk += w;
          }
          if (ly > 0) {
            cn = cond[i - CHUNK_SIZE]!;
            w = (k * c * cn) / (c + cn);
            sum += w * off[i - CHUNK_SIZE]!;
            sk += w;
          } else if (up) {
            const j = i + CHUNK_AREA - CHUNK_SIZE;
            cn = up.cond[j]!;
            w = (k * c * cn) / (c + cn);
            sum += w * up.off[j]!;
            sk += w;
          }
          if (ly < LAST) {
            cn = cond[i + CHUNK_SIZE]!;
            w = (k * c * cn) / (c + cn);
            sum += w * off[i + CHUNK_SIZE]!;
            sk += w;
          } else if (down) {
            const j = i - CHUNK_AREA + CHUNK_SIZE;
            cn = down.cond[j]!;
            w = (k * c * cn) / (c + cn);
            sum += w * down.off[j]!;
            sk += w;
          }
          // Never step past the balance point, or big steps would oscillate.
          next = settle || scale * sk >= 1 ? sum / sk : o + scale * (sum - sk * o);
        }
        const d = Math.abs(next - o);
        if (d === 0) continue;
        off[i] = next;
        if (d > maxAll) maxAll = d;
        if (lx === 0 && d > maxL) maxL = d;
        if (lx === LAST && d > maxR) maxR = d;
        if (ly === 0 && d > maxU) maxU = d;
        if (ly === LAST && d > maxD) maxD = d;
        const t = Math.round(amb + next);
        if (t !== temperature[i]) {
          temperature[i] = t;
          if (!rect) {
            const key = chunkKey(state.cx, state.cy);
            rect = this.changed.get(key);
            if (!rect) this.changed.set(key, (rect = new DirtyRect()));
          }
          rect.add(lx, ly);
        }
      }
    }
    return [maxL, maxR, maxU, maxD, maxAll];
  }
}

/** Left, right, up, down: the order `sweep` reports its edges in. */
const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;
