import { fbm2D, valueNoise2D } from '@/core/math/noise';
import { createRng, hash2, seedFromString } from '@/core/random/rng';
import { createChunk, tileIndex, type ChunkData } from '@/core/world/chunk';
import { CHUNK_SIZE, type WorldDims } from '@/core/world/constants';
import { FLUID_MAX, type FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import type { WorldGenerator } from './WorldGenerator';

/** Bump when the generation code changes in a way that alters output. */
const CODE_VERSION = 3;

/** How far the support pass looks along a ceiling row for something to rest on. */
const SUPPORT_SCAN = 48;
/** How far it looks up for a ceiling and down for a floor when placing a column. */
const COLUMN_SCAN = 96;
const PAD_X = SUPPORT_SCAN + 1;
const PAD_Y = COLUMN_SCAN + 1;

/** How a ceiling run ends on one side. */
const enum End {
  /** Open space: the ceiling steps up. */
  Air,
  /** A tile resting on something: support. */
  Pillar,
  /** Still going when the scan stopped. */
  Limit,
}

interface Run {
  a: number;
  b: number;
  left: End;
  right: End;
}

/** Raw terrain over a chunk and the margin around it, before the support pass. */
interface Region {
  x0: number;
  y0: number;
  w: number;
  h: number;
  material: Uint16Array;
  /** Fluid id for tiles inside a pool's filled part. */
  fluid: Uint8Array;
  /** 1 inside a pool (filled or not); columns never go there. */
  pool: Uint8Array;
  /** First ground row per column. */
  top: Int32Array;
}

export interface LayeredWorldConfig {
  width: number;
  /** Tiles of ground below the surface line. */
  depth: number;
  /** Surface line; hills rise above it, sky fills the rest. */
  surfaceY: number;
  wallThickness: number;
  surface: { hillHeight: number; hillScale: number };
  boundary: { waveAmplitude: number; waveScale: number; blendTiles: number };
  spawn: { safeRadius: number; safeDepth: number };
  layers: {
    key: string;
    name: string;
    fromDepth: number;
    base: string;
    caves: {
      tunnelWidth: number;
      tunnelScale: number;
      pocketScale: number;
      pocketThreshold: number;
    };
  }[];
  deposits: {
    material: string;
    layers: string[];
    scale: number;
    threshold: number;
    minDepth?: number;
    maxDepth?: number;
  }[];
  caverns: { layer: string; count: number; rx: number[]; ry: number[] }[];
  /**
   * Natural ceilings must obey the support rule. Over-long ones are rebuilt in
   * the first `reinforce` material strong enough; where even the last can't
   * span it, columns of `column` are added. Off while ceilings can't collapse.
   */
  support: { enabled: boolean; reinforce: string[]; column: string };
  /** Rock around a pool's fluid that caves never cut, so pools start sealed and still. */
  poolShell: number;
  /**
   * Elliptical pools of fluid. `fill` is the filled fraction of the height:
   * 1 is a sealed aquifer, less is a lake whose air above can join caves.
   */
  pools: {
    layer: string;
    fluid: string;
    count: number;
    rx: number[];
    ry: number[];
    fill: number;
  }[];
}

interface Layer {
  fromDepth: number;
  base: number;
  caves: LayeredWorldConfig['layers'][number]['caves'];
  deposits: Deposit[];
  seed: number;
}

interface Deposit {
  material: number;
  scale: number;
  threshold: number;
  minDepth: number;
  maxDepth: number;
  seed: number;
}

interface Cavern {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface Pool extends Cavern {
  fluid: number;
  /** Rows at or below this are filled. */
  level: number;
}

/** How a tile relates to the pools near it. */
const enum PoolHit {
  None,
  /** Inside a pool: air, and fluid at or below its level. */
  Inside,
  /** The solid shell around a pool's filled part. */
  Shell,
}

/**
 * The real world: six depth layers with wavy, dithered boundaries; ores and
 * deposits per layer; winding tunnels, pockets and big caverns. Every tile is
 * a pure function of (seed, x, y), so chunks can generate in any order.
 * World-level features (caverns) are rolled once from the seed.
 */
export class LayeredWorldGenerator implements WorldGenerator {
  readonly id: string;
  readonly dims: WorldDims;
  readonly spawn: { x: number; y: number };

  private readonly seedNum: number;
  private readonly bedrock: number;
  private readonly air: number;
  private readonly layers: Layer[];
  private readonly caverns: Cavern[];
  private readonly pools: Pool[];
  private readonly solidById: Uint8Array;
  private readonly spanById: Float64Array;
  private readonly reinforce: { material: number; span: number }[];
  private readonly column: number;
  private readonly columnSpacing: number;
  private cached: ChunkData | null = null;
  /** The pool matched by the last `poolAt` call that returned Inside. */
  private hitPool: Pool | null = null;

  constructor(
    private readonly config: LayeredWorldConfig,
    seed: string,
    materials: MaterialRegistry,
    fluids: FluidRegistry,
  ) {
    this.id = `layered@${CODE_VERSION}:${seedFromString(JSON.stringify(config)).toString(36)}`;
    this.dims = {
      width: config.width,
      height: config.surfaceY + config.depth,
      surfaceY: config.surfaceY,
    };
    this.seedNum = seedFromString(seed);
    this.bedrock = materials.bedrock.numId;
    this.air = materials.air.numId;

    const id = (key: string): number => materials.require(key).numId;
    this.solidById = new Uint8Array(materials.maxNumId + 1);
    this.spanById = new Float64Array(materials.maxNumId + 1);
    for (const m of materials.all) {
      this.solidById[m.numId] = m.solid ? 1 : 0;
      this.spanById[m.numId] = m.indestructible ? Infinity : m.supportSpan;
    }
    this.reinforce = config.support.reinforce
      .map((key) => materials.require(key))
      .map((m) => ({ material: m.numId, span: m.supportSpan }))
      .sort((p, q) => p.span - q.span);
    const strongest = this.reinforce.at(-1)?.span ?? 0;
    this.column = id(config.support.column);
    // Columns this far apart leave no ceiling tile beyond the strongest span.
    this.columnSpacing = 2 * strongest + 1;
    this.layers = config.layers.map((l, i) => ({
      fromDepth: l.fromDepth,
      base: id(l.base),
      caves: l.caves,
      seed: this.seedNum + (i + 1) * 104729,
      deposits: config.deposits
        .filter((d) => d.layers.includes(l.key))
        .map((d, j) => ({
          material: id(d.material),
          scale: d.scale,
          threshold: d.threshold,
          minDepth: d.minDepth ?? -Infinity,
          maxDepth: d.maxDepth ?? Infinity,
          seed: this.seedNum + seedFromString(`${d.material}/${j}/${l.key}`),
        })),
    }));
    this.caverns = this.rollCaverns(seed);

    const spawnX = Math.floor(config.width / 2);
    this.spawn = { x: spawnX, y: this.surfaceTop(spawnX) };
    this.pools = this.rollPools(seed, fluids);
  }

  generateChunk(cx: number, cy: number): ChunkData {
    const chunk = createChunk(cx, cy);
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    // The support pass reads beyond the chunk, so it needs raw terrain with a margin.
    const support = this.config.support.enabled;
    const px = support ? PAD_X : 0;
    const py = support ? PAD_Y : 0;
    const g = this.region(x0 - px, y0 - py, CHUNK_SIZE + 2 * px, CHUNK_SIZE + 2 * py);
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const u = lx + px;
        const v = ly + py;
        const j = v * g.w + u;
        const i = tileIndex(lx, ly);
        chunk.material[i] = support ? this.supported(g, u, v) : g.material[j]!;
        if (g.fluid[j]) {
          chunk.fluidType[i] = g.fluid[j]!;
          chunk.fluidAmount[i] = FLUID_MAX;
        }
      }
    }
    return chunk;
  }

  /** Material at a world tile. Slow path for tests and tools (generates its chunk). */
  materialAt(x: number, y: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    if (this.cached?.cx !== cx || this.cached.cy !== cy) this.cached = this.generateChunk(cx, cy);
    return this.cached.material[tileIndex(x - cx * CHUNK_SIZE, y - cy * CHUNK_SIZE)]!;
  }

  private region(x0: number, y0: number, w: number, h: number): Region {
    // Caverns and pools are few; keep only those that can reach the region.
    const caverns = this.caverns.filter(
      (c) =>
        c.x + c.rx * 1.3 >= x0 &&
        c.x - c.rx * 1.3 < x0 + w &&
        c.y + c.ry * 1.3 >= y0 &&
        c.y - c.ry * 1.3 < y0 + h,
    );
    const s = this.config.poolShell + 1;
    const pools = this.pools.filter(
      (p) =>
        p.x + p.rx + s >= x0 &&
        p.x - p.rx - s < x0 + w &&
        p.y + p.ry + s >= y0 &&
        p.y - p.ry - s < y0 + h,
    );
    const g: Region = {
      x0,
      y0,
      w,
      h,
      material: new Uint16Array(w * h),
      fluid: new Uint8Array(w * h),
      pool: new Uint8Array(w * h),
      top: new Int32Array(w),
    };
    const bounds = new Float64Array(this.layers.length);
    for (let u = 0; u < w; u++) {
      const x = x0 + u;
      const top = this.surfaceTop(x);
      g.top[u] = top;
      this.layerBounds(x, bounds);
      for (let v = 0; v < h; v++) {
        const y = y0 + v;
        const j = v * w + u;
        g.material[j] = this.tileAt(x, y, top, bounds, caverns, pools);
        if (pools.length > 0 && this.poolAt(x, y, pools) === PoolHit.Inside) {
          g.pool[j] = 1;
          if (y >= this.hitPool!.level) g.fluid[j] = this.hitPool!.fluid;
        }
      }
    }
    return g;
  }

  /**
   * The support pass for one tile: a ceiling tile that can't span its gap is
   * rebuilt in stronger rock, and a cave tile under a ceiling no rock can span
   * may become part of a natural column. Pure in the region, so neighboring
   * chunks agree.
   */
  private supported(g: Region, u: number, v: number): number {
    const m = g.material[v * g.w + u]!;
    if (this.solidById[m]) {
      if (this.solidAt(g, u, v + 1) || this.spanById[m] === Infinity) return m;
      const d = this.distance(this.runAt(g, u, v), u);
      if (d <= this.spanById[m]!) return m;
      const fix = this.reinforce.find((r) => r.span >= d) ?? this.reinforce.at(-1);
      return fix && fix.span > this.spanById[m]! ? fix.material : m;
    }
    if (g.pool[v * g.w + u] || g.y0 + v < g.top[u]!) return m;
    return this.isColumn(g, u, v) ? this.column : m;
  }

  private isColumn(g: Region, u: number, v: number): boolean {
    let c = -1;
    for (let t = v - 1; t >= Math.max(0, v - COLUMN_SCAN); t--) {
      if (g.pool[t * g.w + u]) return false;
      if (this.solidAt(g, u, t)) {
        c = t;
        break;
      }
    }
    if (c < 0) return false;
    const run = this.runAt(g, u, c);
    const site =
      (g.x0 + u) % this.columnSpacing === 0 ||
      (run.left === End.Air && u === run.a) ||
      (run.right === End.Air && u === run.b);
    if (!site) return false;
    const strongest = this.reinforce.at(-1)?.span ?? 0;
    let needed = false;
    for (let t = run.a; t <= run.b && !needed; t++) needed = this.distance(run, t) > strongest;
    if (!needed) return false;
    // The column must stand on a floor within reach, outside any pool.
    for (let t = v + 1; t <= Math.min(g.h - 1, c + COLUMN_SCAN); t++) {
      if (g.pool[t * g.w + u]) return false;
      if (this.solidAt(g, u, t)) return true;
    }
    return false;
  }

  /** The exposed ceiling run through (u, row): tiles with open space under them. */
  private runAt(g: Region, u: number, row: number): Run {
    const run: Run = { a: u, b: u, left: End.Limit, right: End.Limit };
    for (let i = 1; i <= SUPPORT_SCAN; i++) {
      const t = u - i;
      if (!this.solidAt(g, t, row)) {
        run.left = End.Air;
        break;
      }
      if (this.solidAt(g, t, row + 1)) {
        run.left = End.Pillar;
        break;
      }
      run.a = t;
    }
    for (let i = 1; i <= SUPPORT_SCAN; i++) {
      const t = u + i;
      if (!this.solidAt(g, t, row)) {
        run.right = End.Air;
        break;
      }
      if (this.solidAt(g, t, row + 1)) {
        run.right = End.Pillar;
        break;
      }
      run.b = t;
    }
    return run;
  }

  private distance(run: Run, u: number): number {
    const left = run.left === End.Pillar ? u - run.a + 1 : Infinity;
    const right = run.right === End.Pillar ? run.b - u + 1 : Infinity;
    return Math.min(left, right);
  }

  /** Solid in the raw terrain; the region's edges count as solid. */
  private solidAt(g: Region, u: number, v: number): boolean {
    if (u < 0 || v < 0 || u >= g.w || v >= g.h) return true;
    return this.solidById[g.material[v * g.w + u]!] === 1;
  }

  /** Index into `config.layers` for a world tile (ignores caves). */
  layerIndexAt(x: number, y: number): number {
    const bounds = new Float64Array(this.layers.length);
    this.layerBounds(x, bounds);
    return this.layerIndex(x, y, y - this.config.surfaceY, bounds);
  }

  /** First ground row in a column (hills rise above the surface line). */
  surfaceTop(x: number): number {
    const { hillHeight, hillScale } = this.config.surface;
    return (
      this.config.surfaceY -
      Math.round(valueNoise2D(this.seedNum ^ 0x5f3, x, 0, hillScale) * hillHeight)
    );
  }

  private tileAt(
    x: number,
    y: number,
    top: number,
    bounds: Float64Array,
    caverns: Cavern[],
    pools: Pool[],
  ): number {
    const { width, wallThickness: wall } = this.config;
    const { height } = this.dims;
    if (x < wall || x >= width - wall || y >= height - wall) return this.bedrock;
    if (y < top) return this.air;

    const depth = y - this.config.surfaceY;
    const layer = this.layers[this.layerIndex(x, y, depth, bounds)]!;

    const pool = pools.length > 0 ? this.poolAt(x, y, pools) : PoolHit.None;
    if (pool === PoolHit.Inside) return this.air;
    if (pool === PoolHit.None && this.isCave(x, y, depth, layer, caverns)) return this.air;

    for (const d of layer.deposits) {
      if (depth < d.minDepth || depth > d.maxDepth) continue;
      if (valueNoise2D(d.seed, x, y, d.scale) > d.threshold) return d.material;
    }
    return layer.base;
  }

  /** Boundary depth of each layer at column x; wavy so layers never look flat. */
  private layerBounds(x: number, out: Float64Array): void {
    const { waveAmplitude, waveScale } = this.config.boundary;
    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i]!;
      out[i] =
        i === 0
          ? -Infinity
          : l.fromDepth + (valueNoise2D(l.seed, x, 0, waveScale) * 2 - 1) * waveAmplitude;
    }
  }

  private layerIndex(x: number, y: number, depth: number, bounds: Float64Array): number {
    // Dither near each boundary so layers blend over `blendTiles` instead of a hard line.
    const jitter = (hash2(this.seedNum ^ 0xb1e, x, y) - 0.5) * this.config.boundary.blendTiles;
    const d = depth + jitter;
    let index = 0;
    for (let i = 1; i < bounds.length; i++) if (d >= bounds[i]!) index = i;
    return index;
  }

  private isCave(x: number, y: number, depth: number, layer: Layer, caverns: Cavern[]): boolean {
    // Keep a crust and a safe starting area.
    if (depth < 4) return false;
    const { safeRadius, safeDepth } = this.config.spawn;
    if (Math.abs(x - this.spawn.x) < safeRadius && depth < safeDepth) return false;

    for (const c of caverns) {
      const dx = (x - c.x) / c.rx;
      const dy = (y - c.y) / c.ry;
      const edge = (valueNoise2D(this.seedNum ^ 0xca7e, x, y, 6) - 0.5) * 0.5;
      if (dx * dx + dy * dy + edge < 1) return true;
    }

    const { tunnelWidth, tunnelScale, pocketScale, pocketThreshold } = layer.caves;
    // Winding tunnels follow the noise's mid contour, broken up by a coarse mask.
    if (valueNoise2D(layer.seed ^ 0x3a5, x, y, tunnelScale * 2.5) > 0.42) {
      const n = fbm2D(layer.seed ^ 0x7e1, x, y * 1.4, tunnelScale, 2);
      if (Math.abs(n - 0.5) < tunnelWidth) return true;
    }
    return valueNoise2D(layer.seed ^ 0x90c, x, y, pocketScale) > pocketThreshold;
  }

  /**
   * Inside wins over shell, so neighboring pools never wall each other off.
   * The shell only wraps the filled rows: a lake's air can open into caves.
   */
  private poolAt(x: number, y: number, pools: Pool[]): PoolHit {
    const shell = this.config.poolShell;
    let hit = PoolHit.None;
    for (const p of pools) {
      const dx = x + 0.5 - p.x;
      const dy = y + 0.5 - p.y;
      if ((dx / p.rx) ** 2 + (dy / p.ry) ** 2 <= 1) {
        this.hitPool = p;
        return PoolHit.Inside;
      }
      if (y >= p.level - 1 && (dx / (p.rx + shell)) ** 2 + (dy / (p.ry + shell)) ** 2 <= 1) {
        hit = PoolHit.Shell;
      }
    }
    return hit;
  }

  private rollPools(seed: string, fluids: FluidRegistry): Pool[] {
    const rng = createRng(`${seed}/pools`);
    const { width, wallThickness, surfaceY, poolShell, spawn } = this.config;
    const out: Pool[] = [];
    for (const spec of this.config.pools) {
      const li = this.config.layers.findIndex((l) => l.key === spec.layer);
      if (li < 0) throw new Error(`Pool layer "${spec.layer}" not found`);
      const fluid = fluids.require(spec.fluid).id;
      const from = this.config.layers[li]!.fromDepth;
      const to = this.config.layers[li + 1]?.fromDepth ?? this.config.depth;
      for (let i = 0; i < spec.count; i++) {
        // A few tries to avoid overlapping another pool or the spawn area.
        for (let attempt = 0; attempt < 8; attempt++) {
          const rx = rng.range(spec.rx[0], spec.rx[1]);
          const ry = rng.range(spec.ry[0], spec.ry[1]);
          const margin = this.config.boundary.waveAmplitude + ry + poolShell;
          const lo = Math.max(from + margin, 8 + ry + poolShell);
          const x = rng.range(
            wallThickness + rx + poolShell + 1,
            width - wallThickness - rx - poolShell - 1,
          );
          const y = surfaceY + rng.range(lo, Math.max(lo + 1, to - margin));
          const nearSpawn =
            Math.abs(x - this.spawn.x) < spawn.safeRadius + rx + poolShell &&
            y - ry - poolShell < surfaceY + spawn.safeDepth;
          const overlaps = out.some(
            (p) =>
              Math.abs(p.x - x) < p.rx + rx + poolShell * 2 &&
              Math.abs(p.y - y) < p.ry + ry + poolShell * 2,
          );
          if (nearSpawn || overlaps) continue;
          const level = Math.floor(y + ry - 2 * ry * spec.fill);
          out.push({ x, y, rx, ry, fluid, level });
          break;
        }
      }
    }
    return out;
  }

  private rollCaverns(seed: string): Cavern[] {
    const rng = createRng(`${seed}/caverns`);
    const { width, wallThickness, surfaceY } = this.config;
    const out: Cavern[] = [];
    for (const spec of this.config.caverns) {
      const li = this.config.layers.findIndex((l) => l.key === spec.layer);
      if (li < 0) throw new Error(`Cavern layer "${spec.layer}" not found`);
      const from = this.config.layers[li]!.fromDepth;
      const to = this.config.layers[li + 1]?.fromDepth ?? this.config.depth;
      for (let i = 0; i < spec.count; i++) {
        const rx = rng.range(spec.rx[0], spec.rx[1]);
        const ry = rng.range(spec.ry[0], spec.ry[1]);
        const margin = this.config.boundary.waveAmplitude + ry;
        out.push({
          x: rng.range(wallThickness + rx + 2, width - wallThickness - rx - 2),
          y: surfaceY + rng.range(from + margin, Math.max(from + margin + 1, to - margin)),
          rx,
          ry,
        });
      }
    }
    return out;
  }
}
