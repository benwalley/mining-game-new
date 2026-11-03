import type { GearSlotKind, MaterialRegistry } from '@/content/materials';
import type { BootsTuning, SuitTuning } from '@/content/tuning';
import type { GearSnapshot } from '@/protocol/messages';
import type { Pack } from '../pack/Pack';
import { bootsStats, gearParts, suitStats, type BootsStats, type SuitStats } from './gearStats';

/**
 * What the mole is wearing, one item per slot. Wearing takes the item out of
 * the pack and puts whatever was in that slot back; worn gear weighs nothing.
 */
export class Gear {
  private readonly worn: Record<GearSlotKind, number | null> = { air: null, body: null };
  revision = 0;

  constructor(
    private readonly materials: MaterialRegistry,
    private readonly tuning: { boots: BootsTuning; suit: SuitTuning; heatDamageFrom: number },
  ) {}

  get(slot: GearSlotKind): number | null {
    return this.worn[slot];
  }

  slotOf(key: number): GearSlotKind | null {
    return gearParts(key, this.materials)?.item.gearSlot ?? null;
  }

  /** Wears one from the pack. False if it isn't gear, isn't there, or the old one won't fit back. */
  wear(key: number, pack: Pack): boolean {
    const slot = this.slotOf(key);
    if (slot === null || pack.count(key) < 1) return false;
    const old = this.worn[slot];
    pack.take(key, 1);
    if (old !== null && !pack.add(old, 1)) {
      pack.add(key, 1);
      return false;
    }
    this.worn[slot] = key;
    this.revision++;
    return true;
  }

  /** Puts the slot's gear back in the pack. False if the pack can't take it. */
  takeOff(slot: GearSlotKind, pack: Pack): boolean {
    const key = this.worn[slot];
    if (key === null || !pack.add(key, 1)) return false;
    this.worn[slot] = null;
    this.revision++;
    return true;
  }

  /** The worn boots, or null. Later air tools (a parachute) would sit in the same slot. */
  get boots(): BootsStats | null {
    const p = this.worn.air === null ? null : gearParts(this.worn.air, this.materials);
    return p?.item.key === 'rocket-boots' ? bootsStats(p.a, p.b, this.tuning.boots) : null;
  }

  get suit(): SuitStats | null {
    const p = this.worn.body === null ? null : gearParts(this.worn.body, this.materials);
    return p?.item.key === 'heat-suit' ? suitStats(p.a, p.b, this.tuning.suit) : null;
  }

  /** One line of what a gear item does, for the pack and the craft sheet. */
  describe(key: number): string | null {
    const p = gearParts(key, this.materials);
    if (!p) return null;
    if (p.item.key === 'rocket-boots') {
      const b = bootsStats(p.a, p.b, this.tuning.boots);
      return `Thrust ${Math.round(b.thrust)} · ${b.seconds.toFixed(1)} s`;
    }
    const s = suitStats(p.a, p.b, this.tuning.suit);
    return `Safe to ${this.tuning.heatDamageFrom + s.raise}° · ${Math.round(s.cut * 100)}% less burn`;
  }

  snapshot(): GearSnapshot {
    return { ...this.worn };
  }

  restore(s: GearSnapshot): void {
    this.worn.air = s.air !== null && this.slotOf(s.air) === 'air' ? s.air : null;
    this.worn.body = s.body !== null && this.slotOf(s.body) === 'body' ? s.body : null;
    this.revision++;
  }
}
