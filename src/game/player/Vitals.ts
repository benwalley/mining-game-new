import type { EventBus } from '@/core/events/EventBus';
import type { FluidRegistry } from '@/content/fluids';
import type { VitalsTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { FluidContact } from '../physics/fluidContact';
import type { Player } from './Player';

/**
 * Health and breath. Breath drains while the head is under a liquid and
 * refills otherwise; at zero the player starts drowning. Harmful fluids hurt
 * on contact (lava, flame) or when breathed (spore gas), and hot air hurts
 * from `heatDamageFrom` degrees, more the hotter it is. The heat warnings
 * (haze, sweat) start below that, so the mole feels it before it hurts.
 * Health regenerates after a while out of danger and never drops below
 * `minHealth`: hazards can't kill until rescue exists (phase 3).
 */
export class Vitals {
  private sinceHurtEvent = Infinity;

  constructor(
    private readonly tuning: VitalsTuning,
    private readonly fluids: FluidRegistry,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /** `felt` is the temperature the mole feels, in degrees (NaN if unknown). */
  update(player: Player, fluid: FluidContact, dt: number, felt = NaN): void {
    const t = this.tuning;
    const head = this.fluids.get(fluid.headFluid);
    if (head?.kind === 'liquid') {
      player.breath = Math.max(0, player.breath - dt);
    } else {
      player.breath = Math.min(t.breathSeconds, player.breath + dt * t.breathRefillRate);
    }

    const body = this.fluids.get(fluid.fluid);
    const touching =
      body?.harm === 'contact' && body.damagePerSecond > 0 && fluid.submersion > 0.05;
    const breathing = head?.harm === 'breath' && head.damagePerSecond > 0;
    const drowning = player.breath === 0;
    const scorch = felt > t.heatDamageFrom ? (felt - t.heatDamageFrom) * t.heatDamagePerDegree : 0;
    const damage =
      (touching ? body.damagePerSecond : 0) +
      (breathing ? head.damagePerSecond : 0) +
      (drowning ? t.drownDamagePerSecond : 0) +
      scorch;

    this.sinceHurtEvent += dt;
    if (damage > 0) {
      player.health = Math.max(t.minHealth, player.health - damage * dt);
      player.sinceHurt = 0;
      if (this.sinceHurtEvent >= t.hurtEventInterval) {
        this.sinceHurtEvent = 0;
        this.events.emit('hurt', {
          cause: touching ? 'fluid' : breathing ? 'gas' : drowning ? 'drowning' : 'heat',
          fluid: touching ? fluid.fluid : fluid.headFluid,
        });
      }
      return;
    }

    player.sinceHurt += dt;
    if (player.sinceHurt >= t.regenDelay) {
      player.health = Math.min(t.maxHealth, player.health + t.regenPerSecond * dt);
    }
  }
}
