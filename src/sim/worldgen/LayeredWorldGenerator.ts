import { fbm2D, valueNoise2D } from '@/core/math/noise';
import { createRng, hash2, seedFromString } from '@/core/random/rng';
import { createChunk, tileIndex, type ChunkData } from '@/core/world/chunk';
import { CHUNK_SIZE, type WorldDims } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import type { WorldGenerator } from './WorldGenerator';

/** Bump when the generation code changes in a way that alters output. */
const CODE_VERSION = 1;

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

  constructor(
    private readonly config: LayeredWorldConfig,
    seed: string,
    materials: MaterialRegistry,
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
  }

  generateChunk(cx: number, cy: number): ChunkData {
    const chunk = createChunk(cx, cy);
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    // Caverns are few; keep only those that can reach this chunk.
    const caverns = this.caverns.filter(
      (c) =>
        c.x + c.rx * 1.3 >= x0 &&
        c.x - c.rx * 1.3 < x0 + CHUNK_SIZE &&
        c.y + c.ry * 1.3 >= y0 &&
        c.y - c.ry * 1.3 < y0 + CHUNK_SIZE,
    );
    const bounds = new Float64Array(this.layers.length);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = x0 + lx;
      const top = this.surfaceTop(x);
      this.layerBounds(x, bounds);
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        chunk.material[tileIndex(lx, ly)] = this.tileAt(x, y0 + ly, top, bounds, caverns);
      }
    }
    return chunk;
  }

  /** Material at a world tile. Slow path for tests and tools. */
  materialAt(x: number, y: number): number {
    const bounds = new Float64Array(this.layers.length);
    this.layerBounds(x, bounds);
    return this.tileAt(x, y, this.surfaceTop(x), bounds, this.caverns);
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
  ): number {
    const { width, wallThickness: wall } = this.config;
    const { height } = this.dims;
    if (x < wall || x >= width - wall || y >= height - wall) return this.bedrock;
    if (y < top) return this.air;

    const depth = y - this.config.surfaceY;
    const layer = this.layers[this.layerIndex(x, y, depth, bounds)]!;

    if (this.isCave(x, y, depth, layer, caverns)) return this.air;

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
