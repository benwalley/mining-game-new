/** Light levels run 0 (dark) to MAX_LIGHT (open sky). */
export const MAX_LIGHT = 15;

export interface LightRegion {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface LightSources {
  /** Blocks light (solid, or not loaded). Opaque tiles are lit but don't pass light on. */
  isOpaque(x: number, y: number): boolean;
  /** Light the tile emits itself (glowing materials), 0 for none. */
  emission(x: number, y: number): number;
  /** Open to the sky: full light. */
  isSky(x: number, y: number): boolean;
  /** Point lights such as the helmet lamp, in tile coordinates. */
  lamps: readonly { x: number; y: number; level: number }[];
}

/**
 * Spreads light tile by tile from sky, glowing tiles and lamps, losing one
 * level per step. Solid tiles are lit by their neighbors but block light.
 * Pure and allocation-light so either thread can run it; `out` holds one level
 * per tile of the region, row-major.
 */
export function computeLight(region: LightRegion, src: LightSources, out: Uint8Array): void {
  const { x0, y0, w, h } = region;
  const n = w * h;
  if (out.length < n) throw new Error('Light buffer too small for region');
  out.fill(0, 0, n);

  const opaque = new Uint8Array(n);
  const buckets: number[][] = Array.from({ length: MAX_LIGHT + 1 }, () => []);
  const seed = (i: number, level: number): void => {
    if (level <= out[i]!) return;
    out[i] = level;
    buckets[level]!.push(i);
  };

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const x = x0 + tx;
      const y = y0 + ty;
      const i = ty * w + tx;
      const isOpaque = src.isOpaque(x, y);
      opaque[i] = isOpaque ? 1 : 0;
      if (!isOpaque && src.isSky(x, y)) seed(i, MAX_LIGHT);
      const e = src.emission(x, y);
      if (e > 0) seed(i, Math.min(MAX_LIGHT, e));
    }
  }
  for (const lamp of src.lamps) {
    const tx = lamp.x - x0;
    const ty = lamp.y - y0;
    if (tx >= 0 && ty >= 0 && tx < w && ty < h) seed(ty * w + tx, Math.min(MAX_LIGHT, lamp.level));
  }

  // Bucket queue from brightest down: each tile settles at its final level once.
  for (let level = MAX_LIGHT; level > 1; level--) {
    const bucket = buckets[level]!;
    const next = level - 1;
    for (let b = 0; b < bucket.length; b++) {
      const i = bucket[b]!;
      if (out[i] !== level) continue;
      const tx = i % w;
      const spread = (j: number): void => {
        if (next <= out[j]!) return;
        out[j] = next;
        if (!opaque[j]) buckets[next]!.push(j);
      };
      if (tx > 0) spread(i - 1);
      if (tx < w - 1) spread(i + 1);
      if (i >= w) spread(i - w);
      if (i < n - w) spread(i + w);
    }
    bucket.length = 0;
  }
}
