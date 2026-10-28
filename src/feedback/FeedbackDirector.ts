import type { EventBus } from '@/core/events/EventBus';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { FxTuning } from '@/content/tuning';
import type { Particles } from '@/fx/Particles';
import type { GameEvents } from '@/game/events';
import type { AudioService } from './AudioService';
import type { Haptics } from './haptics';

const DIR_VECTORS = {
  left: [1, 0],
  right: [-1, 0],
  up: [0, 1],
  down: [0, -1],
} as const;

/** Turns gameplay events into sound, haptics and particles. Gameplay never calls these directly. */
export class FeedbackDirector {
  constructor(
    events: EventBus<GameEvents>,
    private readonly materials: MaterialRegistry,
    private readonly audio: AudioService,
    private readonly haptics: Haptics,
    private readonly particles: Particles,
    private readonly fx: FxTuning,
  ) {
    events.on('digHit', (e) => {
      const m = this.materials.get(e.material);
      if (!m) return;
      this.audio.digHit(m);
      // Chips fly back toward the player.
      const [dx, dy] = DIR_VECTORS[e.dir];
      this.debris(e.x, e.y, e.material, this.fx.hitParticles, 3, dx * 0.5, dy * 0.5);
    });
    events.on('tileBroken', (e) => {
      const m = this.materials.get(e.material);
      if (!m) return;
      this.audio.tileBreak(m);
      this.haptics.tick();
      this.debris(e.x, e.y, e.material, this.fx.breakParticles, 5);
    });
    events.on('digBlocked', (e) => {
      this.audio.blocked();
      this.particles.burst(e.x + 0.5, e.y + 0.5, 2, [palette.bone, palette.ember], {
        speed: 5,
        life: 0.25,
      });
    });
    events.on('landed', (e) => this.audio.land(e.speed));
  }

  private debris(
    x: number,
    y: number,
    material: number,
    count: number,
    speed: number,
    dirX = 0,
    dirY = 0,
  ): void {
    const colors = [
      this.materials.colorOf(material, 'base'),
      this.materials.colorOf(material, 'dark'),
      this.materials.colorOf(material, 'light'),
      this.materials.colorOf(material, 'accent'),
    ];
    this.particles.burst(x + 0.5, y + 0.5, count, colors, {
      speed,
      life: this.fx.particleLife,
      dirX,
      dirY,
    });
  }
}
