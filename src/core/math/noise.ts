import { hash2 } from '@/core/random/rng';

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 2D value noise in [0, 1). `scale` is the feature size in tiles. */
export function valueNoise2D(seed: number, x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const top = lerp(hash2(seed, x0, y0), hash2(seed, x0 + 1, y0), tx);
  const bottom = lerp(hash2(seed, x0, y0 + 1), hash2(seed, x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}

/** Fractal value noise, normalized to [0, 1). */
export function fbm2D(seed: number, x: number, y: number, scale: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let s = scale;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(seed + i * 1013, x, y, s) * amp;
    norm += amp;
    amp *= 0.5;
    s *= 0.5;
  }
  return sum / norm;
}
