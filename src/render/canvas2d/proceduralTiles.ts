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
  // Torches and chests are objects drawn over the backdrop, not tiles that fill their square.
  if (v.pattern === 'torch') return drawTorch(ctx, v, ox, oy);
  if (v.pattern === 'chest') return drawChest(ctx, v, ox, oy);
  if (v.pattern === 'boots') return drawBoots(ctx, v, ox, oy);
  if (v.pattern === 'suit') return drawSuit(ctx, v, ox, oy);
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

/** A stick with a wrapped head and a flame, on a clear tile. */
function drawTorch(ctx: Ctx2D, v: MaterialVisual, ox: number, oy: number): void {
  const flame = v.accent ?? 'ember';
  const core = v.accentLight ?? 'gold';
  px(ctx, v.dark, ox + 6, oy + 7, 4, 9);
  px(ctx, v.base, ox + 7, oy + 8, 2, 8);
  px(ctx, v.light, ox + 7, oy + 8, 1, 7);
  // The wrapped head.
  px(ctx, v.dark, ox + 5, oy + 6, 6, 3);
  px(ctx, 'soil', ox + 6, oy + 7, 4, 1);
  // The flame: a teardrop of ember around a gold core.
  px(ctx, flame, ox + 6, oy + 3, 4, 3);
  px(ctx, flame, ox + 7, oy + 1, 2, 2);
  px(ctx, flame, ox + 5, oy + 4, 1, 2);
  px(ctx, flame, ox + 10, oy + 4, 1, 2);
  px(ctx, core, ox + 7, oy + 3, 2, 3);
  px(ctx, 'bone', ox + 7, oy + 4, 1, 1);
}

/** A banded wooden box with a lid seam and a latch, standing on the tile's floor. */
function drawChest(ctx: Ctx2D, v: MaterialVisual, ox: number, oy: number): void {
  const band = v.accent ?? v.dark;
  const latch = v.accentLight ?? v.light;
  px(ctx, v.dark, ox + 1, oy + 3, 14, 13);
  px(ctx, v.base, ox + 2, oy + 4, 12, 11);
  // Planks.
  for (let y = 7; y < 15; y += 3) px(ctx, v.dark, ox + 2, oy + y, 12, 1);
  px(ctx, v.light, ox + 2, oy + 4, 12, 1);
  // The lid's seam, then the metal corners and the latch.
  px(ctx, v.dark, ox + 1, oy + 7, 14, 1);
  px(ctx, band, ox + 2, oy + 4, 2, 11);
  px(ctx, band, ox + 12, oy + 4, 2, 11);
  px(ctx, v.dark, ox + 6, oy + 6, 4, 4);
  px(ctx, latch, ox + 7, oy + 7, 2, 2);
}

/** The rocket boots' icon: a boot with a nozzle under the heel and a lick of flame. */
function drawBoots(ctx: Ctx2D, v: MaterialVisual, ox: number, oy: number): void {
  px(ctx, v.dark, ox + 3, oy + 2, 7, 10);
  px(ctx, v.dark, ox + 3, oy + 8, 11, 5);
  px(ctx, v.base, ox + 4, oy + 3, 5, 9);
  px(ctx, v.base, ox + 4, oy + 9, 9, 3);
  px(ctx, v.light, ox + 4, oy + 3, 5, 1);
  px(ctx, v.light, ox + 4, oy + 9, 9, 1);
  px(ctx, v.accent ?? v.light, ox + 4, oy + 6, 5, 1);
  // Nozzle and flame.
  px(ctx, v.dark, ox + 4, oy + 13, 3, 1);
  px(ctx, v.accentLight ?? v.light, ox + 4, oy + 14, 3, 1);
  px(ctx, v.accent ?? v.light, ox + 5, oy + 15, 1, 1);
}

/** The heat suit's icon: a heavy coat with a glowing seam down the front. */
function drawSuit(ctx: Ctx2D, v: MaterialVisual, ox: number, oy: number): void {
  px(ctx, v.dark, ox + 2, oy + 2, 12, 13);
  px(ctx, v.base, ox + 3, oy + 3, 10, 11);
  px(ctx, v.dark, ox + 6, oy + 2, 4, 2);
  px(ctx, v.light, ox + 3, oy + 3, 3, 1);
  px(ctx, v.light, ox + 10, oy + 3, 3, 1);
  px(ctx, v.accent ?? v.light, ox + 7, oy + 5, 2, 9);
  px(ctx, v.accentLight ?? v.light, ox + 7, oy + 5, 1, 9);
  px(ctx, v.dark, ox + 3, oy + 10, 10, 1);
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
