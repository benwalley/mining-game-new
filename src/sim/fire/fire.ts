import { tileIndex, type ChunkData } from '@/core/world/chunk';
import type { ChunkStore } from '@/core/world/ChunkStore';
import { CHUNK_AREA, CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE, chunkKey } from '@/core/world/constants';
import { hash2 } from '@/core/random/rng';
import { FLUID_MAX, type FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import type { FireTuning } from '@/content/tuning';
import type { SimEvent, TileChange } from '@/protocol/messages';

/** Damage at which a burning tile is used up (dig damage stops at 254). */
const BURNT = 255;

const INERT = 0;
const FUEL = 1;
const METAL = 2;

export interface FireRules {
  air: number;
  torch: number;
  /** Fluid id of flame: on a solid tile it means the tile is burning. */
  flame: number;
  /** Per material: INERT, FUEL (solid, burns) or METAL (melts). */
  kind: Uint8Array;
  /** Per material: degrees at which it burns or melts. */
  limit: Float32Array;
  /** Per material: damage a burning tile takes each second. */
  burnRate: Uint8Array;
  /** Per material: the fluid it melts into, 0 for none. */
  molten: Uint8Array;
  /** 1 for liquid fluid ids. */
  liquid: Uint8Array;
  /** Per fluid: the degrees it holds its tile at (flame, lava), 0 for none. */
  fluidHeat: Float32Array;
  catchChance: number;
}

export function fireRules(
  materials: MaterialRegistry,
  fluids: FluidRegistry,
  tuning: FireTuning,
): FireRules {
  const n = materials.maxNumId + 1;
  const kind = new Uint8Array(n);
  const limit = new Float32Array(n);
  const burnRate = new Uint8Array(n);
  const molten = new Uint8Array(n);
  for (const m of materials.all) {
    limit[m.numId] = m.heatLimit * 100;
    const melt = fluids.moltenOf(m.numId);
    if (!m.solid || m.indestructible || m.kind !== 'block') continue;
    if (melt) {
      kind[m.numId] = METAL;
      molten[m.numId] = melt.id;
    } else if (m.fuel > 0) {
      kind[m.numId] = FUEL;
      burnRate[m.numId] = Math.max(1, Math.round(254 / (m.fuel * tuning.secondsPerFuel)));
    }
  }
  const liquid = new Uint8Array(fluids.maxId + 1);
  const fluidHeat = new Float32Array(fluids.maxId + 1);
  for (const f of fluids.all) {
    liquid[f.id] = f.kind === 'liquid' && f.temperature === null ? 1 : 0;
    fluidHeat[f.id] = f.temperature ?? 0;
  }
  return {
    air: materials.air.numId,
    torch: materials.require('torch').numId,
    flame: fluids.require('flame').id,
    kind,
    limit,
    burnRate,
    molten,
    liquid,
    fluidHeat,
    catchChance: tuning.catchChancePerSecond,
  };
}

export interface FireOutputs {
  /** Tiles whose material changed (burnt away, melted). */
  materials: TileChange[];
  /** Burning tiles' new damage, so their cracks show. */
  damage: TileChange[];
  /** Tiles whose fluid layer changed, for the fluid sim to publish and wake. */
  fluids: { x: number; y: number }[];
  events: SimEvent[];
  /** Chunks that changed, for saving. */
  touched: number[];
}

const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/**
 * One second of fire and melting over every loaded chunk (design doc section
 * 6: materials ignite or melt at their thresholds).
 *
 * - A tile with fuel catches fire, by chance each second, when it's past its
 *   heat limit or touches a torch or something hotter than its limit (flame,
 *   lava, anything burning). Lava barely conducts, so touch matters as much as
 *   heat. The low chance is what makes fire creep slowly through a seam.
 * - A burning tile is a solid tile with flame in its fluid layer. That makes it
 *   a 500° heat source and a light through the existing systems, and it saves
 *   with the chunk. It takes damage each second (its cracks show) and burns
 *   away into a last puff of flame; a liquid beside it (not lava) puts it out.
 * - A metal past its heat limit melts into its molten fluid, which the fluid
 *   sim sets back into a block where it cools.
 *
 * Changes are gathered first and applied after the scan, so fire can't race
 * through a seam in scan order. `second` varies the dice from one call to the next.
 */
export function stepFire(chunks: ChunkStore, rules: FireRules, second: number): FireOutputs {
  const out: FireOutputs = { materials: [], damage: [], fluids: [], events: [], touched: [] };
  const catching: { chunk: ChunkData; i: number; x: number; y: number }[] = [];
  const touched = new Set<number>();
  const { kind, limit, flame } = rules;

  const fluidNear = (x: number, y: number, test: (type: number, m: number) => boolean) => {
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!chunks.inBounds(nx, ny)) continue;
      const c = chunks.get(nx >> CHUNK_SHIFT, ny >> CHUNK_SHIFT);
      if (!c) continue;
      const j = tileIndex(nx & CHUNK_MASK, ny & CHUNK_MASK);
      if (test(c.fluidAmount[j]! > 0 ? c.fluidType[j]! : 0, c.material[j]!)) return true;
    }
    return false;
  };
  const wet = (type: number) => rules.liquid[type] === 1;
  let catchesAt = 0;
  const flaming = (type: number, m: number) =>
    m === rules.torch || (type !== 0 && rules.fluidHeat[type]! >= catchesAt);

  for (const chunk of chunks.values()) {
    const { material, damage, fluidType, fluidAmount, temperature } = chunk;
    const bx = chunk.cx << CHUNK_SHIFT;
    const by = chunk.cy << CHUNK_SHIFT;
    const key = chunkKey(chunk.cx, chunk.cy);
    for (let i = 0; i < CHUNK_AREA; i++) {
      const m = material[i]!;
      const k = kind[m]!;
      if (k === INERT) continue;
      const x = bx + (i & (CHUNK_SIZE - 1));
      const y = by + (i >> CHUNK_SHIFT);

      if (k === METAL) {
        if (temperature[i]! < limit[m]!) continue;
        material[i] = rules.air;
        damage[i] = 0;
        fluidType[i] = rules.molten[m]!;
        fluidAmount[i] = FLUID_MAX;
        out.materials.push({ x, y, material: rules.air });
        out.fluids.push({ x, y });
        out.events.push({ kind: 'melt', x, y });
        touched.add(key);
        continue;
      }

      const burning = fluidAmount[i]! > 0 && fluidType[i] === flame;
      if (burning) {
        touched.add(key);
        if (fluidNear(x, y, wet)) {
          fluidType[i] = 0;
          fluidAmount[i] = 0;
          out.fluids.push({ x, y });
          out.events.push({ kind: 'douse', x, y });
          continue;
        }
        const d = damage[i]! + rules.burnRate[m]!;
        if (d < BURNT) {
          damage[i] = d;
          out.damage.push({ x, y, material: m, damage: d });
          continue;
        }
        // Used up: the tile goes, leaving flame in the air that fades by itself.
        material[i] = rules.air;
        damage[i] = 0;
        out.materials.push({ x, y, material: rules.air });
        out.fluids.push({ x, y });
        out.events.push({ kind: 'burnOut', x, y });
        continue;
      }

      catchesAt = limit[m]!;
      const hot = temperature[i]! >= catchesAt;
      if (!hot && !fluidNear(x, y, flaming)) continue;
      if (hash2(second, x, y) >= rules.catchChance || fluidNear(x, y, wet)) continue;
      catching.push({ chunk, i, x, y });
    }
  }

  for (const { chunk, i, x, y } of catching) {
    chunk.fluidType[i] = flame;
    chunk.fluidAmount[i] = FLUID_MAX;
    out.fluids.push({ x, y });
    out.events.push({ kind: 'catchFire', x, y });
    touched.add(chunkKey(chunk.cx, chunk.cy));
  }
  out.touched = [...touched];
  return out;
}
