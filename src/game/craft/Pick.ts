import type { MaterialRegistry } from '@/content/materials';
import type { PickTuning } from '@/content/tuning';
import type { Pack } from '../pack/Pack';

export type PickPart = 'head' | 'handle';

/** What a save keeps of the pick: its parts' materials and how dull it is (0 sharp, 1 dullest). */
export interface PickSnapshot {
  head: number;
  handle: number;
  wear: number;
}

export interface PickStats {
  /** Compared with a tile's hardness to decide what can be dug. */
  power: number;
  /** Dig time multiplier from the head and handle weight, against the starting pick. */
  heft: number;
  /** Dig time multiplier from dulling; 1 when sharp. */
  dullness: number;
  /** Wear added per tile dug. */
  wearPerTile: number;
}

export type PickOutcome = 'done' | 'short' | 'same' | 'unfit';

/**
 * The one pick the player always has. It never breaks: digging dulls it, which
 * slows digging up to a limit, and sharpening brings it back. Upgrading swaps a
 * part's material, and its stats come from that material, per design 08.
 */
export class Pick {
  head: number;
  handle: number;
  wear = 0;
  revision = 0;
  private readonly baseWeight: number;

  constructor(
    private readonly t: PickTuning,
    private readonly materials: MaterialRegistry,
    private readonly fits: { head: readonly number[]; handle: readonly number[] },
  ) {
    this.head = materials.require(t.startHead).numId;
    this.handle = materials.require(t.startHandle).numId;
    this.baseWeight = this.weightOf(this.head) + this.weightOf(this.handle);
  }

  get stats(): PickStats {
    return this.statsWith(this.head, this.handle, this.wear);
  }

  /** The stats if one part were made of something else, for the sheet's preview. */
  statsWith(head: number, handle: number, wear: number): PickStats {
    const h = this.materials.get(head);
    const t = this.t;
    const weight = this.weightOf(head) + this.weightOf(handle);
    return {
      power: Math.max(1, (h?.hardness ?? 1) + t.powerOffset),
      heft: (1 + weight / t.weightDivisor) / (1 + this.baseWeight / t.weightDivisor),
      dullness: 1 + Math.min(t.maxWear, wear) * t.dullSlowdown,
      wearPerTile: t.wearPerTile / Math.max(1, h?.toughness ?? 1),
    };
  }

  /** Whether a dull pick is worth showing. */
  get dull(): boolean {
    return this.wear >= this.t.dullShownAt;
  }

  /** How sharp it is, 1 down to 0. */
  get sharpness(): number {
    return 1 - Math.min(this.t.maxWear, this.wear) / this.t.maxWear;
  }

  /** A tile was dug. */
  wearOne(): void {
    const before = this.wear;
    this.wear = Math.min(this.t.maxWear, this.wear + this.stats.wearPerTile);
    if (this.wear !== before) this.revision++;
  }

  get sharpenCost(): { material: number; count: number } {
    return {
      material: this.materials.require(this.t.sharpenMaterial).numId,
      count: this.t.sharpenCount,
    };
  }

  sharpen(pack: Pack): PickOutcome {
    if (this.wear === 0) return 'same';
    const { material, count } = this.sharpenCost;
    if (!pack.take(material, count)) return 'short';
    this.wear = 0;
    this.revision++;
    return 'done';
  }

  partCost(part: PickPart): number {
    return part === 'head' ? this.t.headCount : this.t.handleCount;
  }

  /** Remakes a part from a new material. A new part comes sharp. */
  upgrade(part: PickPart, material: number, pack: Pack): PickOutcome {
    if (!this.fits[part].includes(material)) return 'unfit';
    if (this[part] === material) return 'same';
    if (!pack.take(material, this.partCost(part))) return 'short';
    this[part] = material;
    this.wear = 0;
    this.revision++;
    return 'done';
  }

  options(part: PickPart): readonly number[] {
    return this.fits[part];
  }

  snapshot(): PickSnapshot {
    return { head: this.head, handle: this.handle, wear: this.wear };
  }

  restore(s: PickSnapshot): void {
    if (this.materials.get(s.head)) this.head = s.head;
    if (this.materials.get(s.handle)) this.handle = s.handle;
    this.wear = Math.max(0, Math.min(this.t.maxWear, s.wear));
    this.revision++;
  }

  private weightOf(numId: number): number {
    return this.materials.get(numId)?.weight ?? 0;
  }
}
