import { CHUNK_SIZE, TILE_PX, chunkCountX, chunkCountY } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { CameraTuning } from '@/content/tuning';
import type { ChunkMirror } from '@/game/world/ChunkMirror';
import type { RenderFrame, Renderer } from '../Renderer';
import { ChunkCache } from './ChunkCache';
import { drawPlayer } from './playerSprite';
import { TileAtlas } from './TileAtlas';

const CHUNK_PX = CHUNK_SIZE * TILE_PX;

/** Canvas 2D renderer with crisp whole-number pixel scaling. */
export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cache: ChunkCache;
  private readonly atlas: TileAtlas;
  /** Screen pixels per source pixel. Always a whole number. */
  private scale = 1;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mirror: ChunkMirror,
    materials: MaterialRegistry,
    private readonly tuning: CameraTuning,
    crackStages: number,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
    this.atlas = TileAtlas.generate(materials, crackStages);
    this.cache = new ChunkCache(mirror, this.atlas, materials, mirror.dims.surfaceY, crackStages);
    mirror.addListener(this.cache);
    this.resize();
  }

  get viewTiles(): { w: number; h: number } {
    const tile = TILE_PX * this.scale;
    return { w: this.canvas.width / tile, h: this.canvas.height / tile };
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const ideal = this.canvas.width / (TILE_PX * this.tuning.targetTilesAcross);
    this.scale = Math.max(this.tuning.minPixelScale, Math.round(ideal));
    this.ctx.imageSmoothingEnabled = false;
  }

  clearCache(): void {
    this.cache.clear();
  }

  screenToTile(cssX: number, cssY: number, cameraX: number, cameraY: number) {
    const tile = TILE_PX * this.scale;
    const { ox, oy } = this.origin(cameraX, cameraY);
    return { x: (cssX * this.dpr - ox) / tile, y: (cssY * this.dpr - oy) / tile };
  }

  render(frame: RenderFrame): void {
    const { ctx, canvas, scale } = this;
    const tile = TILE_PX * scale;
    const { ox, oy } = this.origin(frame.cameraX, frame.cameraY);
    this.cache.flush();

    // Background: dark below the surface (unloaded or beyond the world), sky above.
    ctx.fillStyle = palette.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const horizon = oy + this.mirror.dims.surfaceY * tile;
    if (horizon > 0) {
      ctx.fillStyle = palette.sky;
      ctx.fillRect(0, 0, canvas.width, Math.min(canvas.height, horizon));
    }

    // Visible chunks.
    const dims = this.mirror.dims;
    const chunkScreen = CHUNK_PX * scale;
    const cx0 = Math.max(0, Math.floor(-ox / chunkScreen));
    const cy0 = Math.max(0, Math.floor(-oy / chunkScreen));
    const cx1 = Math.min(chunkCountX(dims) - 1, Math.floor((canvas.width - ox) / chunkScreen));
    const cy1 = Math.min(chunkCountY(dims) - 1, Math.floor((canvas.height - oy) / chunkScreen));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const surface = this.cache.get(cx, cy);
        if (!surface) continue;
        ctx.drawImage(
          surface,
          ox + cx * chunkScreen,
          oy + cy * chunkScreen,
          chunkScreen,
          chunkScreen,
        );
      }
    }

    this.drawParticles(frame, ox, oy, tile);

    // Player, with feet snapped to the source-pixel grid.
    const p = frame.player;
    ctx.save();
    ctx.translate(Math.round(ox + p.x * tile), Math.round((oy + p.y * tile) / scale) * scale);
    ctx.scale(scale, scale);
    drawPlayer(ctx, p);
    ctx.restore();

    if (frame.debug.grid) this.drawGrid(ox, oy, tile);
  }

  /** Screen position of world tile (0, 0), rounded to whole pixels so tiles never shimmer. */
  private origin(cameraX: number, cameraY: number): { ox: number; oy: number } {
    const tile = TILE_PX * this.scale;
    return {
      ox: Math.round(this.canvas.width / 2 - cameraX * tile),
      oy: Math.round(this.canvas.height / 2 - cameraY * tile),
    };
  }

  private drawParticles(frame: RenderFrame, ox: number, oy: number, tile: number): void {
    const { ctx, scale } = this;
    const ps = frame.particles;
    for (let i = 0; i < ps.count; i++) {
      ctx.globalAlpha = ps.alpha(i);
      ctx.fillStyle = ps.color[i] as string;
      const size = ps.size[i] * scale;
      ctx.fillRect(Math.round(ox + ps.x[i] * tile), Math.round(oy + ps.y[i] * tile), size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawGrid(ox: number, oy: number, tile: number): void {
    const { ctx, canvas } = this;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = palette.bone;
    for (let x = ((ox % tile) + tile) % tile; x < canvas.width; x += tile) {
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    for (let y = ((oy % tile) + tile) % tile; y < canvas.height; y += tile) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = palette.ember;
    const chunk = CHUNK_SIZE * tile;
    for (let x = ((ox % chunk) + chunk) % chunk; x < canvas.width; x += chunk) {
      ctx.fillRect(x, 0, 2, canvas.height);
    }
    for (let y = ((oy % chunk) + chunk) % chunk; y < canvas.height; y += chunk) {
      ctx.fillRect(0, y, canvas.width, 2);
    }
    ctx.globalAlpha = 1;
  }
}
