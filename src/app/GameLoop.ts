/**
 * Fixed-timestep update with interpolated rendering. Input is sampled inside
 * each fixed step, so it lands on the very next frame.
 */
export class GameLoop {
  private rafId = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(
    private readonly stepSeconds: number,
    private readonly update: (dt: number) => void,
    /** `alpha` is how far (0–1) the render is between the last two steps. */
    private readonly render: (alpha: number, frameDt: number) => void,
    private readonly maxFrameSeconds = 0.25,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    // Clamp long frames (tab switches, hitches) so the sim doesn't spiral.
    const frameDt = Math.min(this.maxFrameSeconds, (now - this.last) / 1000);
    this.last = now;
    this.acc += frameDt;
    while (this.acc >= this.stepSeconds) {
      this.update(this.stepSeconds);
      this.acc -= this.stepSeconds;
    }
    this.render(this.acc / this.stepSeconds, frameDt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
