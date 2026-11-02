import { CHUNK_SHIFT } from '@/core/world/constants';

/** How often a chunk runs this tick, by its distance from the player. */
export interface ZoneMap {
  /** Whether tiles in this chunk simulate on the current tick. */
  runsNow(cx: number, cy: number): boolean;
  /** Seconds of sim time a tick stands for in this chunk (slower zones take bigger steps). */
  dtScale(cx: number, cy: number): number;
}

export const Zone = { Active: 0, Near: 1, Far: 2 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export interface ZoneTuning {
  /** Chunks around the player's chunk that run every tick. */
  activeRadiusChunks: number;
  /** Chunks out to here run on one tick in `nearEvery`; beyond, nothing runs. */
  nearRadiusChunks: number;
  nearEvery: number;
}

/**
 * Simulation zones around the player (design doc section 6). Active chunks run
 * at full rate, near ones at a fraction, and far ones are frozen until the
 * player comes back; nothing is caught up later. Distances are in chunks,
 * measured as the larger of the x and y gaps, so zones are squares.
 */
export class Zones implements ZoneMap {
  private cx = 0;
  private cy = 0;
  private tick = 0;

  constructor(private readonly tuning: ZoneTuning) {}

  /** Re-centers the zones on a tile position (the player). */
  centerOn(x: number, y: number): void {
    this.cx = Math.floor(x) >> CHUNK_SHIFT;
    this.cy = Math.floor(y) >> CHUNK_SHIFT;
  }

  get center(): { cx: number; cy: number } {
    return { cx: this.cx, cy: this.cy };
  }

  /** Call once per sim tick, before the systems run. */
  advance(): void {
    this.tick++;
  }

  zoneOf(cx: number, cy: number): Zone {
    const d = Math.max(Math.abs(cx - this.cx), Math.abs(cy - this.cy));
    if (d <= this.tuning.activeRadiusChunks) return Zone.Active;
    if (d <= this.tuning.nearRadiusChunks) return Zone.Near;
    return Zone.Far;
  }

  runsNow(cx: number, cy: number): boolean {
    const zone = this.zoneOf(cx, cy);
    if (zone === Zone.Active) return true;
    return zone === Zone.Near && this.tick % this.tuning.nearEvery === 0;
  }

  dtScale(cx: number, cy: number): number {
    return this.zoneOf(cx, cy) === Zone.Near ? this.tuning.nearEvery : 1;
  }
}

/** Every chunk always runs: for tests and tools without a player. */
export const ALL_ACTIVE: ZoneMap = { runsNow: () => true, dtScale: () => 1 };
