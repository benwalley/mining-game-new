export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Creates an off-screen drawing surface, preferring OffscreenCanvas. */
export function createSurface(width: number, height: number): { canvas: Surface; ctx: Ctx2D } {
  const canvas: Surface =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('2D canvas not supported');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
