import type { EventBus } from '@/core/events/EventBus';
import { lerp } from '@/core/math/util';
import type { Rng } from '@/core/random/rng';
import type { HeatTuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { Player } from './Player';

/** Temperature (degrees) at a world tile; NaN where unknown. */
export type TemperatureFn = (x: number, y: number) => number;

/**
 * What the mole feels of the heat around it. For now heat only warns (design
 * doc section 13): the screen tints from `warm`, the mole sweats from `hot`,
 * and the air crackles from `extreme`, faster the hotter it gets. Heat damage,
 * suits and melting come later.
 */
export class HeatSense {
  /** Smoothed temperature at the mole's body, degrees; NaN until first sensed. */
  felt = NaN;
  private untilSweat = 0;
  private untilCrackle = 0;

  constructor(
    private readonly tuning: HeatTuning,
    private readonly events: EventBus<GameEvents>,
    private readonly rng: Rng,
  ) {}

  /** 0 at `warm` or below, rising evenly to 1 at `extreme`. */
  get level(): number {
    const { warm, extreme } = this.tuning;
    return Math.max(0, Math.min(1, (this.felt - warm) / (extreme - warm)));
  }

  /** A word for the debug overlay. */
  get band(): string {
    const { warm, hot, extreme } = this.tuning;
    const f = this.felt;
    return f >= extreme ? 'extreme' : f >= hot ? 'hot' : f >= warm ? 'warm' : 'fine';
  }

  update(player: Player, temperatureAt: TemperatureFn, dt: number): void {
    const t = this.tuning;
    const here = temperatureAt(Math.floor(player.x), Math.floor(player.y - player.h / 2));
    if (Number.isNaN(here)) return;
    this.felt = Number.isNaN(this.felt)
      ? here
      : this.felt + (here - this.felt) * Math.min(1, dt / t.senseSeconds);

    const top = player.y - player.h;
    if (this.felt >= t.hot) {
      this.untilSweat -= dt;
      if (this.untilSweat <= 0) {
        this.untilSweat = (t.sweatEverySeconds * this.rng.range(0.6, 1.4)) / (0.5 + this.level);
        this.events.emit('sweat', { x: player.x, y: top + player.h * 0.3 });
      }
    } else {
      this.untilSweat = 0;
    }
    if (this.felt >= t.extreme) {
      this.untilCrackle -= dt;
      if (this.untilCrackle <= 0) {
        // Faster toward twice the extreme temperature.
        const beyond = Math.min(1, (this.felt - t.extreme) / t.extreme);
        const [slow, fast] = t.crackleEverySeconds as [number, number];
        this.untilCrackle = lerp(slow, fast, beyond) * this.rng.range(0.6, 1.4);
        this.events.emit('crackle', { strength: 0.5 + beyond / 2 });
      }
    } else {
      this.untilCrackle = 0;
    }
  }
}
