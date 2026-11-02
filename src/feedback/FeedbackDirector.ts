import type { EventBus } from '@/core/events/EventBus';
import type { FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { FxTuning } from '@/content/tuning';
import type { Particles } from '@/fx/Particles';
import type { GameEvents } from '@/game/events';
import type { AudioService } from './AudioService';
import type { Haptics } from './haptics';

/**
 * Minimum gap between repeats of a sound. Quenching and igniting can
 * happen dozens of times a tick; one per window is plenty.
 */
const SOUND_GAP_MS = {
  hiss: 90,
  whoomph: 250,
  vent: 400,
  packFull: 500,
};

const DIR_VECTORS = {
  left: [1, 0],
  right: [-1, 0],
  up: [0, 1],
  down: [0, -1],
} as const;

/** Turns gameplay events into sound, haptics and particles. Gameplay never calls these directly. */
export class FeedbackDirector {
  private readonly lastSoundAt = new Map<keyof typeof SOUND_GAP_MS, number>();

  constructor(
    events: EventBus<GameEvents>,
    private readonly materials: MaterialRegistry,
    private readonly fluids: FluidRegistry,
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
    events.on('placed', (e) => {
      const m = this.materials.get(e.material);
      if (!m) return;
      this.audio.place(m);
      this.haptics.tick();
      this.debris(e.x, e.y, e.material, 5, 2);
    });
    events.on('ghostStep', () => this.haptics.tick());
    events.on('timeFrozen', () => {
      this.audio.freeze();
      this.haptics.pulse();
    });
    events.on('timeResumed', () => this.audio.thaw());
    events.on('packFull', () =>
      this.throttled('packFull', () => {
        this.audio.packFull();
        this.haptics.pulse();
      }),
    );
    events.on('digBlocked', (e) => {
      this.audio.blocked();
      this.particles.burst(e.x + 0.5, e.y + 0.5, 2, [palette.bone, palette.ember], {
        speed: 5,
        life: 0.25,
      });
    });
    events.on('landed', (e) => this.audio.land(e.speed));
    events.on('splash', (e) => {
      const f = this.fluids.get(e.fluid);
      if (!f) return;
      this.audio.splash(e.speed, f.flowEvery > 1);
      const count = Math.min(14, Math.round(4 + e.speed));
      this.particles.burst(e.x, e.y, count, [palette[f.visual.color], palette[f.visual.surface]], {
        speed: 4 + e.speed * 0.3,
        life: 0.45,
        dirY: -1,
      });
    });
    events.on('hurt', (e) => {
      if (e.cause === 'gas') this.audio.cough();
      else this.audio.hurt();
      this.haptics.tick();
    });
    events.on('sweat', (e) => {
      this.particles.burst(e.x, e.y, 1, [palette.sky, palette.bone], {
        speed: 1.5,
        life: 0.5,
        dirY: -0.3,
      });
    });
    events.on('crackle', (e) => this.audio.crackle(e.strength));
    events.on('ignite', (e) => {
      this.throttled('whoomph', () => {
        this.audio.whoomph();
        this.haptics.pulse();
      });
      this.particles.burst(e.x + 0.5, e.y + 0.5, 6, [palette.ember, palette.gold], {
        speed: 4,
        life: 0.4,
        dirY: -1,
      });
    });
    events.on('vent', () => this.throttled('vent', () => this.audio.vent()));
    events.on('quench', () => this.throttled('hiss', () => this.audio.hiss()));
  }

  private throttled(sound: keyof typeof SOUND_GAP_MS, play: () => void): void {
    const now = performance.now();
    if (now - (this.lastSoundAt.get(sound) ?? -Infinity) < SOUND_GAP_MS[sound]) return;
    this.lastSoundAt.set(sound, now);
    play();
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
