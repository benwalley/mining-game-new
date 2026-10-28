import type { EventBus } from '@/core/events/EventBus';
import type { FluidRegistry } from '@/content/fluids';
import type { VitalsTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { FluidContact } from '../physics/fluidContact';
import type { Player } from './Player';

/**
 * Health and breath. Breath drains while the head is under fluid and refills
 * in air; at zero the player starts drowning. Harmful fluids (lava) hurt on
 * contact. Health regenerates after a while out of danger and never drops
 * below `minHealth`: hazards can't kill until rescue exists (phase 3).
 */
export class Vitals {
  private sinceHurtEvent = Infinity;

  constructor(
    private readonly tuning: VitalsTuning,
    private readonly fluids: FluidRegistry,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /** A one-off blow, such as falling rubble. */
  hit(player: Player, damage: number): void {
    player.health = Math.max(this.tuning.minHealth, player.health - damage);
    player.sinceHurt = 0;
    this.sinceHurtEvent = 0;
    this.events.emit('hurt', { cause: 'crushed', fluid: 0 });
  }

  update(player: Player, fluid: FluidContact, dt: number): void {
    const t = this.tuning;
    if (fluid.headFluid !== 0) {
      player.breath = Math.max(0, player.breath - dt);
    } else {
      player.breath = Math.min(t.breathSeconds, player.breath + dt * t.breathRefillRate);
    }

    const harmful = this.fluids.get(fluid.fluid)?.damagePerSecond ?? 0;
    const touching = fluid.submersion > 0.05 && harmful > 0;
    const drowning = player.breath === 0;
    const damage = (touching ? harmful : 0) + (drowning ? t.drownDamagePerSecond : 0);

    this.sinceHurtEvent += dt;
    if (damage > 0) {
      player.health = Math.max(t.minHealth, player.health - damage * dt);
      player.sinceHurt = 0;
      if (this.sinceHurtEvent >= t.hurtEventInterval) {
        this.sinceHurtEvent = 0;
        this.events.emit('hurt', {
          cause: touching ? 'fluid' : 'drowning',
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
