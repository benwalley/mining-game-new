import fluidsData from '@/data/fluids.json';
import type { MaterialRegistry } from './materials';
import { isColorName, type ColorName } from './palette';

/** Fluid amounts run 0 (none) to FLUID_MAX (a full tile, or full strength for a gas). */
export const FLUID_MAX = 8;

export interface FluidVisual {
  color: ColorName;
  surface: ColorName;
  opacity: number;
}

export interface FluidReaction {
  /** Fluid id this reaction's fluid must touch (4-neighbor). */
  touching: number;
  /** What the reacting tile turns into: a solid material, or another fluid. */
  result: { material: number } | { fluid: number };
  /** Amount removed from the touching tile. */
  consumes: number;
  event: SimEventKind | null;
}

/**
 * World events the sim reports for feedback: lava quenched; firedamp ignited;
 * gas hissing out of a dug-open pocket; a ceiling tile starts to fail (and
 * keeps shedding dust); it collapses; loose sand starts to slip; a falling
 * tile lands.
 */
export type SimEventKind = 'quench' | 'ignite' | 'vent' | 'creak' | 'collapse' | 'loose' | 'land';

export type FluidKind = 'liquid' | 'gas';

export interface FluidDef {
  /** Stable id persisted in saves (the tile's fluidType). Never change or reuse. */
  id: number;
  key: string;
  name: string;
  /** Liquids fall and fill from the bottom; gases rise and fill the whole tile. */
  kind: FluidKind;
  /** Moves on one tick in N; Infinity never moves. */
  flowEvery: number;
  /** Light emitted at full amount, 0–15. */
  light: number;
  damagePerSecond: number;
  /** Hurts on any contact, or only while the head is inside (breathing it). */
  harm: 'contact' | 'breath';
  /** Tiles at or below `maxAmount` lose a unit every `everyTicks` ticks. */
  decay: { maxAmount: number; everyTicks: number } | null;
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

  isGas(id: number): boolean {
    return this.byId[id]?.kind === 'gas';
  }

  /** Ids are small and dense, so this bounds lookup tables. */
  get maxId(): number {
    return this.byId.length - 1;
  }
}

type RawFluid = (typeof fluidsData.fluids)[number];
type RawReaction = (typeof fluidsData.reactions)[number];

/** Parses and validates the bundled fluid data. Reactions name materials, so it needs them. */
export function loadFluids(materials: MaterialRegistry): FluidRegistry {
  const color = (key: string, name: string): ColorName => {
    if (!isColorName(name)) throw new Error(`Fluid "${key}": unknown color "${name}"`);
    return name;
  };
  const defs: FluidDef[] = fluidsData.fluids.map((raw: RawFluid) => {
    const r = raw as RawFluid & Partial<{ swimSpeedScale: number; moveScale: number }>;
    if (raw.kind !== 'liquid' && raw.kind !== 'gas') {
      throw new Error(`Fluid "${raw.key}": unknown kind "${raw.kind}"`);
    }
    if (raw.harm !== 'contact' && raw.harm !== 'breath') {
      throw new Error(`Fluid "${raw.key}": unknown harm "${raw.harm}"`);
    }
    return {
      id: raw.id,
      key: raw.key,
      name: raw.name,
      kind: raw.kind,
      flowEvery: raw.flowEvery > 0 ? raw.flowEvery : Infinity,
      light: raw.light,
      damagePerSecond: raw.damagePerSecond,
      harm: raw.harm,
      decay: ('decay' in raw ? raw.decay : null) ?? null,
      swimSpeedScale: r.swimSpeedScale ?? 1,
      moveScale: r.moveScale ?? 1,
      visual: {
        color: color(raw.key, raw.visual.color),
        surface: color(raw.key, raw.visual.surface),
        opacity: raw.visual.opacity,
      },
      reactions: [],
    };
  });
  const registry = new FluidRegistry(defs);
  for (const raw of fluidsData.reactions) {
    const r = raw as Pick<RawReaction, 'fluid' | 'touching' | 'consumes' | 'event'> &
      Partial<{ becomes: string; becomesFluid: string }>;
    let result: FluidReaction['result'];
    if (r.becomes !== undefined) {
      const becomes = materials.require(r.becomes);
      if (!becomes.solid) throw new Error(`Reaction "${r.fluid}": "${r.becomes}" must be solid`);
      result = { material: becomes.numId };
    } else if (r.becomesFluid !== undefined) {
      result = { fluid: registry.require(r.becomesFluid).id };
    } else {
      throw new Error(`Reaction "${r.fluid}": needs becomes or becomesFluid`);
    }
    registry.require(r.fluid).reactions.push({
      touching: registry.require(r.touching).id,
      result,
      consumes: r.consumes,
      event: r.event as SimEventKind | null,
    });
  }
  return registry;
}
