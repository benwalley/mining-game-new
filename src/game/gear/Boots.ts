import type { EventBus } from '@/core/events/EventBus';
import type { BootsTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { Player } from '../player/Player';
import type { BootsStats } from './gearStats';

/**
 * Rocket boots. A touch that lands while the mole is in the air lights them:
 * a quick tap fires a short burst, and holding keeps them firing until the
 * meter runs dry. The first touch also brakes a fall, so one tap can save a
 * drop. The meter refills whenever the mole stands, clings or climbs.
 */
export class Boots {
  /** 0–1 of a full meter. */
  meter = 1;
  firing = false;
  private held = false;
  private burstLeft = 0;

  constructor(
    private readonly tuning: BootsTuning,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /** A finger went down. Returns true if it lit the boots, so it isn't also a tap. */
  press(player: Player, stats: BootsStats | null, airborne: boolean): boolean {
    if (!stats || !airborne || this.meter <= 0) return false;
    this.held = true;
    this.burstLeft = this.tuning.burstSeconds;
    if (player.vy > 0) player.vy *= 1 - this.tuning.kick;
    // A boost isn't a jump: letting go of the jump drag mustn't cut it short.
    player.jumping = false;
    if (!this.firing) this.events.emit('bootsFired', { x: player.x, y: player.y });
    this.firing = true;
    return true;
  }

  release(): void {
    this.held = false;
  }

  /** Cuts the boots at once, as when time stops. */
  stop(): void {
    this.held = false;
    this.burstLeft = 0;
    if (!this.firing) return;
    this.firing = false;
    this.events.emit('bootsStopped', { empty: false });
  }

  /**
   * Sets the player's thrust for this step. `airborne` is free flight (not
   * standing, clinging, climbing or swimming); `supported` refills the meter.
   */
  update(
    player: Player,
    stats: BootsStats | null,
    airborne: boolean,
    supported: boolean,
    dt: number,
  ): void {
    const t = this.tuning;
    this.burstLeft = Math.max(0, this.burstLeft - dt);
    const wants = this.held || this.burstLeft > 0;
    if (this.firing && (!stats || !airborne || !wants || this.meter <= 0)) {
      this.firing = false;
      this.held = false;
      this.burstLeft = 0;
      this.events.emit('bootsStopped', { empty: this.meter <= 0 });
    }
    if (this.firing && stats) {
      this.meter = Math.max(0, this.meter - dt / stats.seconds);
      player.thrust = stats.thrust;
      this.events.emit('thrust', { x: player.x, y: player.y, vx: player.vx });
    } else {
      player.thrust = 0;
    }
    if (supported && !this.firing && this.meter < 1) {
      this.meter = Math.min(1, this.meter + dt / t.refillSeconds);
      if (this.meter === 1) this.events.emit('bootsReady', {});
    }
  }
}
