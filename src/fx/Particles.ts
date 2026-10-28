import type { Rng } from '@/core/random/rng';
import type { SolidFn } from '@/game/physics/tileCollision';

/** Cosmetic particles (dig debris). Fixed-capacity pool, no allocation per particle. */
export class Particles {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: Float32Array;
  readonly color: string[];
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  count = 0;

  constructor(
    private readonly capacity: number,
    private readonly rng: Rng,
    private readonly gravity: number,
  ) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.color = new Array<string>(capacity).fill('#fff');
  }

  /** Bursts `count` particles from a point (tiles), biased along (dirX, dirY). */
  burst(
    x: number,
    y: number,
    count: number,
    colors: readonly string[],
    opts: { speed: number; life: number; dirX?: number; dirY?: number },
  ): void {
    const rng = this.rng;
    for (let n = 0; n < count; n++) {
      // When full, overwrite the oldest-looking slot rather than dropping feedback.
      const i = this.count < this.capacity ? this.count++ : rng.int(0, this.capacity);
      const angle = rng.range(0, Math.PI * 2);
      const speed = opts.speed * rng.range(0.4, 1);
      this.x[i] = x + rng.range(-0.3, 0.3);
      this.y[i] = y + rng.range(-0.3, 0.3);
      this.vx[i] = Math.cos(angle) * speed + (opts.dirX ?? 0) * opts.speed;
      this.vy[i] = Math.sin(angle) * speed - opts.speed * 0.6 + (opts.dirY ?? 0) * opts.speed;
      this.life[i] = this.maxLife[i] = opts.life * rng.range(0.6, 1.2);
      this.size[i] = rng.chance(0.3) ? 2 : 1;
      this.color[i] = rng.pick(colors);
    }
  }

  update(dt: number, solid: SolidFn): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      this.vy[i] += this.gravity * dt;
      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      if (solid(Math.floor(nx), Math.floor(ny))) {
        // Settle on whatever was hit.
        this.vx[i] *= -0.3;
        this.vy[i] = 0;
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }
      i++;
    }
  }

  alpha(i: number): number {
    return Math.min(1, (this.life[i] / this.maxLife[i]) * 2);
  }

  private remove(i: number): void {
    const last = --this.count;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last];
    this.color[i] = this.color[last];
  }
}
