import fluidsData from '@/data/fluids.json';
import type { MaterialRegistry } from './materials';
import { isColorName, type ColorName } from './palette';

/** Fluid amounts run 0 (none) to FLUID_MAX (a full tile). */
export const FLUID_MAX = 8;

export interface FluidVisual {
  color: ColorName;
  surface: ColorName;
  opacity: number;
}

export interface FluidReaction {
  /** Fluid id this reaction's fluid must touch (4-neighbor). */
  touching: number;
  /** Material the reacting tile turns into. */
  becomes: number;
  /** Amount removed from the touching tile. */
  consumes: number;
  event: SimEventKind;
}

/**
 * World events the sim reports for feedback: lava quenched; a ceiling tile
 * starts to fail (and keeps shedding dust); it collapses; loose sand starts
 * to slip; a falling tile lands.
 */
export type SimEventKind = 'quench' | 'creak' | 'collapse' | 'loose' | 'land';

export interface FluidDef {
  /** Stable id persisted in saves (the tile's fluidType). Never change or reuse. */
  id: number;
  key: string;
  name: string;
  /** Moves on one tick in N. */
  flowEvery: number;
  /** Light emitted at full depth, 0–15. */
  light: number;
  damagePerSecond: number;
  swimSpeedScale: number;
  moveScale: number;
  visual: FluidVisual;
  reactions: FluidReaction[];
}

/** Lookup of fluids by id and key. */
export class FluidRegistry {
  private readonly byId: FluidDef[] = [];
  private readonly byKey = new Map<string, FluidDef>();

  constructor(defs: readonly FluidDef[]) {
    for (const def of defs) {
      if (def.id <= 0 || def.id > 15) throw new Error(`Fluid "${def.key}": id must be 1–15`);
      if (this.byId[def.id]) throw new Error(`Duplicate fluid id ${def.id}`);
      this.byId[def.id] = def;
      this.byKey.set(def.key, def);
    }
  }

  get all(): readonly FluidDef[] {
    return this.byId.filter(Boolean);
  }

  get(id: number): FluidDef | undefined {
    return this.byId[id];
  }

  require(key: string): FluidDef {
    const def = this.byKey.get(key);
    if (!def) throw new Error(`Unknown fluid "${key}"`);
    return def;
  }

  /** Ids are small and dense, so this bounds lookup tables. */
  get maxId(): number {
    return this.byId.length - 1;
  }
}

/** Parses and validates the bundled fluid data. Reactions name materials, so it needs them. */
export function loadFluids(materials: MaterialRegistry): FluidRegistry {
  const color = (key: string, name: string): ColorName => {
    if (!isColorName(name)) throw new Error(`Fluid "${key}": unknown color "${name}"`);
    return name;
  };
  const defs: FluidDef[] = fluidsData.fluids.map((raw) => ({
    id: raw.id,
    key: raw.key,
    name: raw.name,
    flowEvery: Math.max(1, raw.flowEvery),
    light: raw.light,
    damagePerSecond: raw.damagePerSecond,
    swimSpeedScale: raw.swimSpeedScale,
    moveScale: raw.moveScale,
    visual: {
      color: color(raw.key, raw.visual.color),
      surface: color(raw.key, raw.visual.surface),
      opacity: raw.visual.opacity,
    },
    reactions: [],
  }));
  const registry = new FluidRegistry(defs);
  for (const r of fluidsData.reactions) {
    const becomes = materials.require(r.becomes);
    if (!becomes.solid) throw new Error(`Reaction "${r.fluid}": "${r.becomes}" must be solid`);
    registry.require(r.fluid).reactions.push({
      touching: registry.require(r.touching).id,
      becomes: becomes.numId,
      consumes: r.consumes,
      event: r.event as SimEventKind,
    });
  }
  return registry;
}
