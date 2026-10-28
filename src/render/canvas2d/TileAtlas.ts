import { TILE_PX } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import { drawBackdropTile, drawCrackTile, drawMaterialTile } from './proceduralTiles';
import { createSurface, type Ctx2D, type Surface } from './surface';

/**
 * One image holding every tile sprite. Row 0: materials by numId. Row 1:
 * backdrop, then crack stages. Row 2: rubble made from each material, by the
 * origin material's numId. Generated in code today; `fromImage` lets a
 * hand-drawn PNG with the same layout replace it later.
 */
export class TileAtlas {
  static readonly BACKDROP_COL = 0;
  static readonly CRACK_COL = 1;

  private constructor(readonly image: Surface | HTMLImageElement | ImageBitmap) {}

  static generate(materials: MaterialRegistry, crackStages: number): TileAtlas {
    const cols = Math.max(materials.maxNumId + 1, TileAtlas.CRACK_COL + crackStages);
    const { canvas, ctx } = createSurface(cols * TILE_PX, 3 * TILE_PX);
    for (const m of materials.all) {
      if (!m.visual) continue;
      drawMaterialTile(ctx, m.key, m.visual, m.numId * TILE_PX, 0);
      const rubble = { ...m.visual, pattern: 'rubble' as const };
      drawMaterialTile(ctx, `rubble/${m.key}`, rubble, m.numId * TILE_PX, 2 * TILE_PX);
    }
    drawBackdropTile(ctx, TileAtlas.BACKDROP_COL * TILE_PX, TILE_PX);
    for (let s = 1; s <= crackStages; s++) {
      drawCrackTile(ctx, s, (TileAtlas.CRACK_COL + s - 1) * TILE_PX, TILE_PX);
    }
    return new TileAtlas(canvas);
  }

  static fromImage(image: HTMLImageElement | ImageBitmap): TileAtlas {
    return new TileAtlas(image);
  }

  drawMaterial(ctx: Ctx2D, numId: number, dx: number, dy: number, size = TILE_PX): void {
    ctx.drawImage(this.image, numId * TILE_PX, 0, TILE_PX, TILE_PX, dx, dy, size, size);
  }

  /** Rubble that remembers `origin`; plain rubble (`fallback`) when it doesn't. */
  drawRubble(ctx: Ctx2D, origin: number, fallback: number, dx: number, dy: number): void {
    if (origin === 0) {
      this.drawMaterial(ctx, fallback, dx, dy);
      return;
    }
    ctx.drawImage(
      this.image,
      origin * TILE_PX,
      2 * TILE_PX,
      TILE_PX,
      TILE_PX,
      dx,
      dy,
      TILE_PX,
      TILE_PX,
    );
  }

  drawBackdrop(ctx: Ctx2D, dx: number, dy: number, size = TILE_PX): void {
    const sx = TileAtlas.BACKDROP_COL * TILE_PX;
    ctx.drawImage(this.image, sx, TILE_PX, TILE_PX, TILE_PX, dx, dy, size, size);
  }

  drawCrack(ctx: Ctx2D, stage: number, dx: number, dy: number, size = TILE_PX): void {
    if (stage <= 0) return;
    const sx = (TileAtlas.CRACK_COL + stage - 1) * TILE_PX;
    ctx.drawImage(this.image, sx, TILE_PX, TILE_PX, TILE_PX, dx, dy, size, size);
  }
}
