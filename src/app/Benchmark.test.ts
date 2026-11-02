import { describe, expect, it } from 'vitest';
import { Benchmark } from './Benchmark';

describe('Benchmark', () => {
  it('passes steady 60 fps frames and reports the numbers', () => {
    const b = new Benchmark(20_000, 'test device', 0);
    for (let i = 0; i < 1200; i++) b.frame(16.7, 4);
    b.simStats({
      type: 'simStats',
      tickMs: 0.3,
      tickMsMax: 1.2,
      awakeTiles: 900,
      solidsActive: 0,
      heatChunks: 0,
      chunks: 40,
    });
    const lines = b.report();
    expect(lines[0]).toMatch(/^PASS/);
    expect(lines.join('\n')).toContain('900 fluid tiles');
  });

  it('flags a run with frequent long frames', () => {
    const b = new Benchmark(20_000, 'test device', 0);
    for (let i = 0; i < 1200; i++) b.frame(i % 5 === 0 ? 40 : 16.7, 12);
    expect(b.report()[0]).toMatch(/^MISS/);
  });

  it('counts down', () => {
    const b = new Benchmark(20_000, 'x', 0);
    expect(b.remaining(5_000)).toBe(15);
    expect(b.remaining(25_000)).toBe(0);
  });
});
