import { valueNoise2D } from '@/core/math/noise';
import { seedFromString } from '@/core/random/rng';
import { createChunk, tileIndex, type ChunkData } from '@/core/world/chunk';
import { CHUNK_SIZE, type WorldDims } from '@/core/world/constants';
import { FLUID_MAX, type FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import type { WorldGenerator } from './WorldGenerator';

/** Bump when the generation code changes in a way that alters output. */
const CODE_VERSION = 2;

export interface TestWorldConfig {
  width: number;
  height: number;
  surfaceY: number;
  spawn: { x: number; y: number };
  wallThickness: number;
  bands: { material: string; toDepth: number }[];
  pockets: {
    material: string;
    within: string[];
    scale: number;
    threshold: number;
    minDepth?: number;
  }[];
  features: TestFeature[];
}

export type TestFeature =
  | { op: 'fill'; material: string; x: number; y: number; w: number; h: number; label?: string }
  | { op: 'carve'; x: number; y: number; w: number; h: number; label?: string }
  /** Carves a rectangle and fills it with fluid. */
  | { op: 'pool'; fluid: string; x: number; y: number; w: number; h: number; label?: string }
  | { op: 'ellipse'; x: number; y: number; rx: number; ry: number; label?: string }
  | {
      op: 'stairs';
      x: number;
      y: number;
      steps: number;
      dir: 1 | -1;
      stepW: number;
      clearH: number;
      label?: string;
    };

interface CompiledFeature {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Material to write, or undefined if the tile isn't covered. */
  sample(x: number, y: number): number | undefined;
}

/**
 * Phase 0 world: flat bands of material, noise pockets, and hand-placed
 * features for testing movement (steps, gaps, a shaft, caves).
 */
export class TestWorldGenerator implements WorldGenerator {
  readonly id: string;
  readonly dims: WorldDims;
  readonly spawn: { x: number; y: number };

  private readonly seedNum: number;
  private readonly bedrock: number;
  private readonly air: number;
  private readonly bands: { material: number; toDepth: number }[];
  private readonly pockets: {
    material: number;
    within: Set<number>;
    scale: number;
    threshold: number;
    minDepth: number;
    seed: number;
  }[];
  private readonly features: CompiledFeature[];
  private readonly pools: { fluid: number; x0: number; y0: number; x1: number; y1: number }[];

  constructor(
    private readonly config: TestWorldConfig,
    seed: string,
    materials: MaterialRegistry,
    fluids: FluidRegistry,
  ) {
    this.id = `test-flat@${CODE_VERSION}:${seedFromString(JSON.stringify(config)).toString(36)}`;
    this.dims = { width: config.width, height: config.height, surfaceY: config.surfaceY };
    this.spawn = config.spawn;
    this.seedNum = seedFromString(seed);
    this.bedrock = materials.bedrock.numId;
    this.air = materials.air.numId;
    const id = (key: string): number => materials.require(key).numId;
    this.bands = config.bands.map((b) => ({ material: id(b.material), toDepth: b.toDepth }));
    this.pockets = config.pockets.map((p, i) => ({
      material: id(p.material),
      within: new Set(p.within.map(id)),
      scale: p.scale,
      threshold: p.threshold,
      minDepth: p.minDepth ?? 0,
      seed: this.seedNum + (i + 1) * 7919,
    }));
    this.features = config.features.map((f) => this.compileFeature(f, id));
    this.pools = config.features.flatMap((f) =>
      f.op === 'pool'
        ? [
            {
              fluid: fluids.require(f.fluid).id,
              x0: f.x,
              y0: f.y,
              x1: f.x + f.w - 1,
              y1: f.y + f.h - 1,
            },
          ]
        : [],
    );
  }

  generateChunk(cx: number, cy: number): ChunkData {
    const chunk = createChunk(cx, cy);
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = tileIndex(lx, ly);
        chunk.material[i] = this.materialAt(x0 + lx, y0 + ly);
        const fluid = this.fluidAt(x0 + lx, y0 + ly);
        if (fluid > 0) {
          chunk.fluidType[i] = fluid;
          chunk.fluidAmount[i] = FLUID_MAX;
        }
      }
    }
    return chunk;
  }

  /** Material at a world tile. Public for tests and tools. */
  materialAt(x: number, y: number): number {
    const { width, height } = this.config;
    const wall = this.config.wallThickness;
    if (x < wall || x >= width - wall || y >= height - wall || x >= width || y >= height) {
      return this.bedrock;
    }

    let material = this.air;
    const depth = y - this.config.surfaceY;
    if (depth >= 0) {
      material = this.bandAt(depth);
      for (const p of this.pockets) {
        if (depth < p.minDepth || !p.within.has(material)) continue;
        if (valueNoise2D(p.seed, x, y, p.scale) > p.threshold) {
          material = p.material;
          break;
        }
      }
    }

    for (const f of this.features) {
      if (x < f.minX || x > f.maxX || y < f.minY || y > f.maxY) continue;
      const m = f.sample(x, y);
      if (m !== undefined) material = m;
    }
    return material;
  }

  /** Fluid id at a world tile, 0 for none. The last pool covering it wins. */
  fluidAt(x: number, y: number): number {
    let fluid = 0;
    for (const p of this.pools) {
      if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) fluid = p.fluid;
    }
    return fluid;
  }

  private bandAt(depth: number): number {
    for (const band of this.bands) if (depth < band.toDepth) return band.material;
    return this.bands[this.bands.length - 1]?.material ?? this.bedrock;
  }

  private compileFeature(f: TestFeature, id: (key: string) => number): CompiledFeature {
    const air = this.air;
    switch (f.op) {
      case 'fill':
      case 'carve':
      case 'pool': {
        const m = f.op === 'fill' ? id(f.material) : air;
        return {
          minX: f.x,
          minY: f.y,
          maxX: f.x + f.w - 1,
          maxY: f.y + f.h - 1,
          sample: () => m,
        };
      }
      case 'ellipse':
        return {
          minX: f.x - f.rx,
          minY: f.y - f.ry,
          maxX: f.x + f.rx,
          maxY: f.y + f.ry,
          sample: (x, y) => {
            const dx = (x - f.x) / f.rx;
            const dy = (y - f.y) / f.ry;
            return dx * dx + dy * dy <= 1 ? air : undefined;
          },
        };
      case 'stairs': {
        // Each step is `stepW` wide with its floor one tile lower than the last,
        // so walking against `dir` climbs a run of 1-tile ledges.
        const span = f.steps * f.stepW;
        const minX = f.dir > 0 ? f.x : f.x - span + 1;
        return {
          minX,
          minY: f.y - f.clearH,
          maxX: minX + span - 1,
          maxY: f.y + f.steps - 1,
          sample: (x, y) => {
            const step = Math.floor((f.dir > 0 ? x - f.x : f.x - x) / f.stepW);
            const floorY = f.y + step;
            return y >= floorY - f.clearH && y < floorY ? air : undefined;
          },
        };
      }
    }
  }
}
