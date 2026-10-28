import { createRng, type Rng } from '@/core/random/rng';
import { TILE_PX } from '@/core/world/constants';
import type { MaterialVisual } from '@/content/materials';
import { palette, type ColorName } from '@/content/palette';
import type { Ctx2D } from './surface';

/**
 * Draws 16×16 placeholder tiles in code. Each pattern has its own texture, not
 * just its own color, so materials stay distinguishable for colorblind players.
 */

const N = TILE_PX;

function px(ctx: Ctx2D, color: ColorName, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = palette[color];
  ctx.fillRect(x, y, w, h);
}

function specks(ctx: Ctx2D, rng: Rng, color: ColorName, count: number, ox: number, oy: number) {
  for (let i = 0; i < count; i++) px(ctx, color, ox + rng.int(0, N), oy + rng.int(0, N));
}

function cracks(ctx: Ctx2D, rng: Rng, v: MaterialVisual, ox: number, oy: number): void {
  // Two irregular seams that split the tile into rough blocks.
  let y = rng.int(5, 10);
  for (let x = 0; x < N; x++) {
    px(ctx, v.dark, ox + x, oy + y);
    if (y > 0) px(ctx, v.light, ox + x, oy + y - 1);
    if (rng.chance(0.3)) y = Math.max(2, Math.min(N - 3, y + rng.int(-1, 2)));
  }
  const x0 = rng.int(3, 7);
  const x1 = rng.int(9, 14);
  for (let yy = 0; yy < y; yy++) px(ctx, v.dark, ox + x0, oy + yy);
  for (let yy = y + 1; yy < N; yy++) px(ctx, v.dark, ox + x1, oy + yy);
}

function nugget(ctx: Ctx2D, rng: Rng, v: MaterialVisual, ox: number, oy: number): void {
  const accent = v.accent ?? v.light;
  const w = rng.int(2, 4);
  const h = rng.int(2, 3);
  const x = rng.int(1, N - w - 1);
  const y = rng.int(1, N - h - 1);
  px(ctx, v.dark, ox + x - 1, oy + y + h, w + 1, 1);
  px(ctx, accent, ox + x, oy + y, w, h);
  px(ctx, v.accentLight ?? v.light, ox + x, oy + y);
}

export function drawMaterialTile(
  ctx: Ctx2D,
  key: string,
  v: MaterialVisual,
  ox: number,
  oy: number,
): void {
  const rng = createRng(`tile/${key}`);
  px(ctx, v.base, ox, oy, N, N);

  switch (v.pattern) {
    case 'soil':
      specks(ctx, rng, v.dark, 26, ox, oy);
      specks(ctx, rng, v.light, 12, ox, oy);
      for (let i = 0; i < 4; i++) px(ctx, v.dark, ox + rng.int(0, N - 2), oy + rng.int(0, N), 2, 1);
      break;
    case 'grain':
      specks(ctx, rng, v.light, 40, ox, oy);
      specks(ctx, rng, v.dark, 14, ox, oy);
      break;
    case 'smooth':
      for (let y = 2; y < N; y += 5) {
        for (let x = 0; x < N; x++) {
          if (rng.chance(0.8)) px(ctx, v.light, ox + x, oy + y);
          if (rng.chance(0.5)) px(ctx, v.dark, ox + x, oy + y + 2);
        }
      }
      break;
    case 'fiber':
      for (let x = 0; x < N; x += rng.int(2, 4)) {
        const start = rng.int(0, N / 2);
        const len = rng.int(5, N);
        px(ctx, v.dark, ox + x, oy + start, 1, Math.min(len, N - start));
        if (x + 1 < N) px(ctx, v.light, ox + x + 1, oy + rng.int(0, N - 3), 1, 3);
      }
      break;
    case 'block':
      cracks(ctx, rng, v, ox, oy);
      specks(ctx, rng, v.light, 6, ox, oy);
      specks(ctx, rng, v.dark, 6, ox, oy);
      break;
    case 'vein':
      cracks(ctx, rng, v, ox, oy);
      for (let i = 0; i < 4; i++) nugget(ctx, rng, v, ox, oy);
      break;
    case 'crystal':
      for (let i = 0; i < 4; i++) {
        const x = rng.int(0, N);
        const len = rng.int(4, 9);
        for (let d = 0; d < len; d++) {
          const cx = (x + d) % N;
          const cy = N - 1 - ((d * 2 + i * 3) % N);
          px(ctx, v.accent ?? v.light, ox + cx, oy + cy, 1, 2);
          px(ctx, v.dark, ox + ((cx + 1) % N), oy + cy);
        }
      }
      specks(ctx, rng, v.light, 5, ox, oy);
      break;
    case 'spots':
      specks(ctx, rng, v.dark, 20, ox, oy);
      for (let i = 0; i < 5; i++) {
        const x = rng.int(1, N - 3);
        const y = rng.int(1, N - 2);
        px(ctx, v.accent ?? v.light, ox + x, oy + y, 3, 2);
        px(ctx, v.light, ox + x + 1, oy + y + 2);
      }
      break;
    case 'bedrock':
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if ((x + y * 3) % 5 === 0) px(ctx, v.dark, ox + x, oy + y);
          else if (rng.chance(0.08)) px(ctx, v.light, ox + x, oy + y);
        }
      }
      break;
  }
}

/** Background wall shown behind dug-out and cave tiles underground. */
export function drawBackdropTile(ctx: Ctx2D, ox: number, oy: number): void {
  const rng = createRng('tile/backdrop');
  px(ctx, 'coal', ox, oy, N, N);
  specks(ctx, rng, 'ink', 18, ox, oy);
  specks(ctx, rng, 'deep', 10, ox, oy);
}

/** Crack overlay for a dig stage (1-based). Later stages add to earlier ones. */
export function drawCrackTile(ctx: Ctx2D, stage: number, ox: number, oy: number): void {
  const rng = createRng('tile/cracks');
  const c = N / 2;
  for (let s = 1; s <= stage; s++) {
    const rays = s === 1 ? 2 : 3;
    for (let r = 0; r < rays; r++) {
      let x = c + rng.int(-2, 3);
      let y = c + rng.int(-2, 3);
      const dx = rng.pick([-1, 0, 1]);
      const dy = dx === 0 ? rng.pick([-1, 1]) : rng.pick([-1, 0, 1]);
      const len = 2 + s * 2;
      for (let i = 0; i < len; i++) {
        if (x < 0 || y < 0 || x >= N || y >= N) break;
        px(ctx, 'ink', ox + x, oy + y);
        x += dx + (rng.chance(0.3) ? rng.int(-1, 2) : 0);
        y += dy + (rng.chance(0.3) ? rng.int(-1, 2) : 0);
      }
    }
  }
}
