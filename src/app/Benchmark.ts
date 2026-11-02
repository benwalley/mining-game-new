import type { FromSim } from '@/protocol/messages';

type SimStats = Extract<FromSim, { type: 'simStats' }>;

/** A frame slower than this misses 60 fps. */
const FRAME_BUDGET_MS = 1000 / 60;

/**
 * Records frame timing and sim cost while a flood runs, then summarizes it
 * for the phase 1 gate: 60 fps on a mid-range phone with a flood spreading.
 */
export class Benchmark {
  private readonly intervals: number[] = [];
  private readonly work: number[] = [];
  private readonly simTick: number[] = [];
  private simTickMax = 0;
  private awakeMax = 0;
  private readonly started: number;

  constructor(
    readonly durationMs: number,
    private readonly device: string,
    now = performance.now(),
  ) {
    this.started = now;
  }

  frame(intervalMs: number, workMs: number): void {
    this.intervals.push(intervalMs);
    this.work.push(workMs);
  }

  simStats(s: SimStats): void {
    this.simTick.push(s.tickMs);
    this.simTickMax = Math.max(this.simTickMax, s.tickMsMax);
    this.awakeMax = Math.max(this.awakeMax, s.awakeTiles);
  }

  /** Seconds left, or 0 when done. */
  remaining(now = performance.now()): number {
    return Math.max(0, (this.durationMs - (now - this.started)) / 1000);
  }

  report(): string[] {
    // The first frames after pouring include loading; skip half a second.
    const skip = Math.min(30, Math.floor(this.intervals.length / 10));
    const intervals = this.intervals.slice(skip);
    const work = this.work.slice(skip);
    const seconds = intervals.reduce((a, b) => a + b, 0) / 1000;
    const slow = intervals.filter((ms) => ms > FRAME_BUDGET_MS * 1.2).length;
    const verdict =
      percentile(intervals, 0.95) <= FRAME_BUDGET_MS * 1.2
        ? 'PASS: holds 60 fps'
        : 'MISS: drops below 60 fps';
    return [
      verdict,
      `${(intervals.length / seconds).toFixed(1)} fps avg over ${seconds.toFixed(0)} s`,
      `frame interval p50 ${fmt(percentile(intervals, 0.5))} · p95 ${fmt(percentile(intervals, 0.95))} · worst ${fmt(Math.max(...intervals))}`,
      `slow frames (>20 ms): ${slow} of ${intervals.length} (${((100 * slow) / intervals.length).toFixed(1)}%)`,
      `main-thread work p50 ${fmt(percentile(work, 0.5))} · p95 ${fmt(percentile(work, 0.95))}`,
      `sim tick avg ${fmt(avg(this.simTick))} · worst ${fmt(this.simTickMax)} · up to ${this.awakeMax} fluid tiles awake`,
      this.device,
    ];
  }
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

function avg(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

const fmt = (ms: number): string => `${ms.toFixed(1)} ms`;
