import { CHUNK_SIZE, TILE_PX, chunkCountX, chunkCountY } from '@/core/world/constants';
import { FLUID_MAX, type FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { CameraTuning, HeatTuning, LightTuning } from '@/content/tuning';
import type { LightView } from '@/game/light/LightField';
import { fluidAmount, fluidType, type ChunkMirror } from '@/game/world/ChunkMirror';
import type { FreezeFx, GhostBlock, RenderFrame, Renderer, TileTint } from '../Renderer';
import { ChunkCache } from './ChunkCache';
import { createSurface, type Ctx2D, type Surface } from './surface';
import { drawPlayer } from './playerSprite';
import { TileAtlas } from './TileAtlas';

const CHUNK_PX = CHUNK_SIZE * TILE_PX;
/** Source-pixel box the player sprite is drawn into when fluid must tint it. */
const SPRITE_PX = 64;
const SPRITE_FEET = 48;
/** How strongly fluid shows over a submerged player, relative to its normal opacity. */
const OVER_PLAYER_ALPHA = 0.55;
/** Heat shimmer: strength buckets (one stroke each), and how fast streaks rise (tiles/s). */
const SHIMMER_BUCKETS = 4;
const SHIMMER_RISE = 0.7;
/** Debug heat map: degrees per color step, and the hottest step. */
const HEATMAP_STEP = 20;
const HEATMAP_TOP = 600;

interface FluidStyle {
  color: string;
  surface: string;
  opacity: number;
  gas: boolean;
}

/** Canvas 2D renderer with crisp whole-number pixel scaling. */
export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cache: ChunkCache;
  private readonly atlas: TileAtlas;
  private readonly icons = new Map<number, string>();
  /** Screen pixels per source pixel. Always a whole number. */
  private scale = 1;
  private dpr = 1;
  /** One pixel per tile of darkness, drawn smoothed so light falls off softly. */
  private darkness: { canvas: Surface; ctx: Ctx2D; image: ImageData } | null = null;
  /** Darkness alpha (0–255) for each light level. */
  private readonly darknessByLevel = new Uint8ClampedArray(16);
  /** Indexed by fluid id. */
  private readonly fluidStyles: (FluidStyle | undefined)[] = [];
  private readonly fluidPaths: { body: Path2D; surface: Path2D; any: boolean }[] = [];
  /** Gas haze by packed fluid (type << 4 | amount), since its strength sets its alpha. */
  private gasPaths = new Map<number, Path2D>();
  private sprite: { canvas: Surface; ctx: Ctx2D; scale: number } | null = null;
  private readonly shimmerPaths: Path2D[] = [];
  private readonly heatmapStyles: string[] = [];
  /** 1 for solid material ids; 1 for liquid fluid ids. */
  private readonly solidById: Uint8Array;
  private readonly liquidById = new Uint8Array(16);
  private readonly flame: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mirror: ChunkMirror,
    materials: MaterialRegistry,
    fluids: FluidRegistry,
    private readonly tuning: CameraTuning,
    crackStages: number,
    light: LightTuning,
    private readonly heat: HeatTuning,
  ) {
    this.solidById = new Uint8Array(materials.maxNumId + 1);
    for (const m of materials.all) this.solidById[m.numId] = m.solid ? 1 : 0;
    for (const f of fluids.all) this.liquidById[f.id] = f.kind === 'liquid' ? 1 : 0;
    this.flame = fluids.require('flame').id;
    for (let t = 0; t <= HEATMAP_TOP; t += HEATMAP_STEP) {
      // Blue when cold, through yellow, to red at the top.
      this.heatmapStyles.push(`hsl(${Math.round(240 * (1 - t / HEATMAP_TOP))} 90% 50%)`);
    }
    for (const f of fluids.all) {
      this.fluidStyles[f.id] = {
        color: palette[f.visual.color],
        surface: palette[f.visual.surface],
        opacity: f.visual.opacity,
        gas: f.kind === 'gas',
      };
    }
    for (let level = 0; level < 16; level++) {
      const brightness = Math.min(1, level / light.fullBrightLevel);
      this.darknessByLevel[level] = Math.round((1 - brightness) * 255);
    }
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

    const tx0 = Math.floor(-ox / tile);
    const ty0 = Math.floor(-oy / tile);
    const tx1 = Math.floor((canvas.width - ox) / tile);
    const ty1 = Math.floor((canvas.height - oy) / tile);
    this.drawFluids(ctx, tx0, ty0, tx1, ty1, ox, oy, 1);
    this.drawBurning(tx0, ty0, tx1, ty1, ox, oy, frame.time);
    this.drawShimmer(tx0, ty0, tx1, ty1, ox, oy, frame.time);
    this.drawParticles(frame, ox, oy, tile);
    // Darkness goes over the world but under the player, who carries the lamp.
    if (frame.light) this.drawDarkness(frame.light, ox, oy, tile);
    if (frame.debug.heat) this.drawHeatmap(tx0, ty0, tx1, ty1, ox, oy);
    // Frozen time greys the world but not the player, who is the one thing still moving.
    if (frame.freeze) this.drawFreeze(frame.freeze, ox, oy, tile);

    // Player, with feet snapped to the source-pixel grid.
    const p = frame.player;
    const px = Math.round(ox + p.x * tile);
    const py = Math.round((oy + p.y * tile) / scale) * scale;
    if (this.fluidNear(p.x, p.y)) {
      this.drawPlayerInFluid(p, px, py, ox, oy);
    } else {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(scale, scale);
      drawPlayer(ctx, p);
      ctx.restore();
    }
    if (frame.boots) this.drawBootsMeter(frame.boots, px, py, scale, frame.time);

    if (frame.tint) this.drawTint(frame.tint, ox, oy, tile);
    if (frame.ghost) this.drawGhost(frame.ghost, ox, oy, tile);
    if (frame.debug.grid) this.drawGrid(ox, oy, tile);
  }

  /**
   * The boots' thrust left, as an upright bar beside the mole while it isn't
   * full. It glows while firing and blinks red when it's empty.
   */
  private drawBootsMeter(
    boots: { meter: number; firing: boolean },
    px: number,
    py: number,
    scale: number,
    time: number,
  ): void {
    if (boots.meter >= 1 && !boots.firing) return;
    const ctx = this.ctx;
    const h = 12;
    const fill = Math.round(boots.meter * (h - 2));
    const x = px - 11 * scale;
    const y = py - 14 * scale;
    const empty = boots.meter <= 0 && Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = empty ? palette.blood : palette.ink;
    ctx.fillRect(x, y, 4 * scale, h * scale);
    ctx.fillStyle = boots.firing ? palette.gold : palette.ember;
    ctx.fillRect(x + scale, y + (h - 1 - fill) * scale, 2 * scale, fill * scale);
  }

  /** Drawn once per material at twice the tile size, crisp, and kept. */
  tileIcon(numId: number): string {
    let url = this.icons.get(numId);
    if (url === undefined) {
      const c = document.createElement('canvas');
      c.width = c.height = TILE_PX * 2;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      this.atlas.drawMaterial(ctx, numId, 0, 0, TILE_PX * 2);
      url = c.toDataURL();
      this.icons.set(numId, url);
    }
    return url;
  }

  /**
   * The grey spreads out from the player behind the ring as time stops, and
   * shrinks back into them when it resumes, so colour returns from the edges.
   */
  private drawFreeze(f: FreezeFx, ox: number, oy: number, tile: number): void {
    const { ctx, canvas } = this;
    const sx = ox + f.x * tile;
    const sy = oy + f.y * tile;
    // Far enough to reach the furthest corner, wherever the player is on screen.
    const reach = Math.max(
      Math.hypot(sx, sy),
      Math.hypot(canvas.width - sx, sy),
      Math.hypot(sx, canvas.height - sy),
      Math.hypot(canvas.width - sx, canvas.height - sy),
    );
    const t = f.ring;
    const eased = t === null ? 1 : 1 - (1 - t) ** 2;
    const r = t === null ? null : Math.max(1, (f.ringDir === 1 ? eased : 1 - eased) * reach);

    ctx.save();
    if (r !== null) {
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = f.desaturate;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = f.tint;
    ctx.fillStyle = palette.deepBlue;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (r === null || t === null) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = palette.sky;
    // A bright edge with a softer, wider echo trailing it.
    ctx.globalAlpha = 0.9 * (1 - t * t);
    ctx.lineWidth = tile * (0.18 + 0.35 * (1 - t));
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35 * (1 - t);
    ctx.lineWidth = tile * (0.6 + 1.4 * (1 - t));
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, r - f.ringDir * tile), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** A faint blue wash on every tile a block could go on. */
  private drawTint(t: TileTint, ox: number, oy: number, tile: number): void {
    const { ctx } = this;
    const w = t.view.x1 - t.view.x0;
    ctx.fillStyle = palette.sky;
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < t.mask.length; i++) {
      if (!t.mask[i]) continue;
      const x = t.view.x0 + (i % w);
      const y = t.view.y0 + Math.floor(i / w);
      ctx.fillRect(Math.round(ox + x * tile), Math.round(oy + y * tile), tile, tile);
    }
    ctx.globalAlpha = 1;
  }

  private drawGhost(g: GhostBlock, ox: number, oy: number, tile: number): void {
    const { ctx, scale } = this;
    const sx = Math.round(ox + g.x * tile);
    const sy = Math.round(oy + g.y * tile);
    ctx.globalAlpha = g.valid ? 0.6 : 0.35;
    this.atlas.drawMaterial(ctx, g.material, sx, sy, tile);
    ctx.globalAlpha = 1;
    ctx.lineWidth = scale;
    ctx.strokeStyle = g.valid ? palette.bone : palette.lava;
    ctx.strokeRect(sx + scale / 2, sy + scale / 2, tile - scale, tile - scale);
    if (!g.valid) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = palette.lava;
      ctx.fillRect(sx, sy, tile, tile);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Fluid in a tile range. A liquid is a body filled to its amount (or the
   * whole tile under more of itself) with a lighter surface line on top; a gas
   * is a haze over the whole tile, thicker where it's stronger.
   */
  private drawFluids(
    ctx: Ctx2D,
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    ox: number,
    oy: number,
    alphaScale: number,
  ): void {
    const tile = TILE_PX * this.scale;
    const unit = tile / FLUID_MAX;
    const paths = this.fluidPaths;
    for (let id = 0; id < this.fluidStyles.length; id++) {
      paths[id] = { body: new Path2D(), surface: new Path2D(), any: false };
    }
    this.gasPaths.clear();
    const fluidAt = this.mirror.fluidAt;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const f = fluidAt(x, y);
        if (f === 0) continue;
        // Fluid in a solid tile is flame on a burning tile, drawn by drawBurning.
        if (this.solidById[this.mirror.materialAt(x, y)]) continue;
        const type = fluidType(f);
        const path = paths[type];
        if (!path) continue;
        const sx = ox + x * tile;
        if (this.fluidStyles[type]?.gas) {
          let haze = this.gasPaths.get(f);
          if (!haze) this.gasPaths.set(f, (haze = new Path2D()));
          haze.rect(sx, oy + y * tile, tile, tile);
          continue;
        }
        path.any = true;
        const bottom = oy + (y + 1) * tile;
        if (fluidType(fluidAt(x, y - 1)) === type) {
          path.body.rect(sx, bottom - tile, tile, tile);
        } else {
          const h = Math.max(this.scale, Math.round(fluidAmount(f) * unit));
          path.body.rect(sx, bottom - h, tile, h);
          path.surface.rect(sx, bottom - h, tile, this.scale);
        }
      }
    }
    for (let id = 0; id < paths.length; id++) {
      const path = paths[id]!;
      const style = this.fluidStyles[id];
      if (!path.any || !style) continue;
      ctx.globalAlpha = style.opacity * alphaScale;
      ctx.fillStyle = style.color;
      ctx.fill(path.body);
      ctx.fillStyle = style.surface;
      ctx.fill(path.surface);
    }
    for (const [f, haze] of this.gasPaths) {
      const style = this.fluidStyles[fluidType(f)]!;
      ctx.globalAlpha = style.opacity * alphaScale * (0.25 + (0.75 * fluidAmount(f)) / FLUID_MAX);
      ctx.fillStyle = style.color;
      ctx.fill(haze);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Burning tiles: the face glows and flickers, and tongues of flame lick up
   * from it, reaching on into the tile above when that's open.
   */
  private drawBurning(
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    ox: number,
    oy: number,
    time: number,
  ): void {
    const { ctx, scale, mirror } = this;
    const tile = TILE_PX * scale;
    const snap = (v: number): number => Math.round(v / scale) * scale;
    const w = 2 * scale;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const f = mirror.fluidAt(x, y);
        if (f === 0 || fluidType(f) !== this.flame) continue;
        const m = mirror.materialAt(x, y);
        if (m < 0 || !this.solidById[m]) continue;
        const sx = ox + x * tile;
        const sy = oy + y * tile;
        const flicker = 0.5 + 0.5 * Math.sin(time * 9 + x * 1.7 + y * 2.3);
        ctx.globalAlpha = 0.3 + 0.15 * flicker;
        ctx.fillStyle = palette.ember;
        ctx.fillRect(sx, sy, tile, tile);
        const open = !mirror.isSolid(x, y - 1);
        const base = sy + tile;
        ctx.globalAlpha = 0.95;
        for (let n = 0; n < 3; n++) {
          const phase = time * (7 + n * 1.9) + x * 3.1 + y * 5.3 + n * 2.1;
          const lick = 0.5 + 0.5 * Math.sin(phase);
          const h =
            tile * (0.4 + 0.4 * lick) +
            (open ? tile * 0.6 * (0.5 + 0.5 * Math.sin(phase * 1.3)) : 0);
          const cx = snap(sx + tile * (0.2 + 0.3 * n) + scale * Math.sin(phase * 0.7));
          ctx.fillStyle = palette.lava;
          ctx.fillRect(cx - w, snap(base - h * 0.55), 2 * w, snap(h * 0.55));
          ctx.fillStyle = palette.ember;
          ctx.fillRect(cx - w / 2, snap(base - h), w, snap(h * 0.9));
          ctx.fillStyle = palette.gold;
          ctx.fillRect(cx - w / 2, snap(base - h * 0.45), w, snap(h * 0.35));
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Faint wavy streaks rising through hot air, so heat shows where it comes
   * from. More streaks, and brighter ones, the hotter the tile. Not drawn in
   * solid tiles or liquids.
   */
  private drawShimmer(
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    ox: number,
    oy: number,
    time: number,
  ): void {
    const { ctx, scale } = this;
    const { shimmerFrom, shimmerFull } = this.heat;
    const tile = TILE_PX * scale;
    const temperatureAt = this.mirror.temperatureAt;
    const store = this.mirror.store;
    const fluidAt = this.mirror.fluidAt;
    const paths = this.shimmerPaths;
    for (let b = 0; b < SHIMMER_BUCKETS; b++) paths[b] = new Path2D();
    let any = false;
    const wiggle = 1.5 * scale;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const t = temperatureAt(x, y);
        if (!(t > shimmerFrom)) continue;
        const m = store.materialAt(x, y);
        if (m < 0 || this.solidById[m] || this.liquidById[fluidType(fluidAt(x, y))]) continue;
        const strength = Math.min(1, (t - shimmerFrom) / (shimmerFull - shimmerFrom));
        const h = tileHash(x, y);
        if (h > 0.2 + 0.6 * strength) continue;
        any = true;
        // One streak per tile, rising and wrapping, at a column and phase fixed per tile.
        const rise = (time * SHIMMER_RISE + h * 7.3) % 1;
        const sx = ox + (x + 0.2 + 0.6 * ((h * 13.7) % 1)) * tile;
        const sy = oy + (y + 1 - rise) * tile;
        const path = paths[Math.min(SHIMMER_BUCKETS - 1, Math.floor(strength * SHIMMER_BUCKETS))]!;
        const len = tile * 0.45;
        for (let k = 0; k <= 3; k++) {
          const px = sx + Math.sin(time * 5 + h * 40 + k * 1.6) * wiggle;
          const py = sy - (len * k) / 3;
          if (k === 0) path.moveTo(px, py);
          else path.lineTo(px, py);
        }
      }
    }
    if (!any) return;
    ctx.lineWidth = scale;
    ctx.strokeStyle = palette.bone;
    for (let b = 0; b < SHIMMER_BUCKETS; b++) {
      ctx.globalAlpha = 0.07 + 0.06 * b;
      ctx.stroke(paths[b]!);
    }
    ctx.globalAlpha = 1;
  }

  /** Debug: every tile tinted by temperature. */
  private drawHeatmap(
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    ox: number,
    oy: number,
  ): void {
    const { ctx } = this;
    const tile = TILE_PX * this.scale;
    const temperatureAt = this.mirror.temperatureAt;
    const paths = this.heatmapStyles.map(() => new Path2D());
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const t = temperatureAt(x, y);
        if (Number.isNaN(t)) continue;
        const step = Math.max(0, Math.min(paths.length - 1, Math.round(t / HEATMAP_STEP)));
        paths[step]!.rect(ox + x * tile, oy + y * tile, tile, tile);
      }
    }
    ctx.globalAlpha = 0.4;
    paths.forEach((path, i) => {
      ctx.fillStyle = this.heatmapStyles[i]!;
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
  }

  private fluidNear(x: number, y: number): boolean {
    const fluidAt = this.mirror.fluidAt;
    for (let ty = Math.floor(y) - 2; ty <= Math.floor(y); ty++) {
      for (let tx = Math.floor(x) - 1; tx <= Math.floor(x) + 1; tx++) {
        if (fluidAt(tx, ty) !== 0) return true;
      }
    }
    return false;
  }

  /**
   * Draws the player into a small surface, tints the parts under fluid
   * (source-atop keeps the tint inside the sprite), then copies it over.
   */
  private drawPlayerInFluid(
    p: RenderFrame['player'],
    px: number,
    py: number,
    ox: number,
    oy: number,
  ): void {
    const { scale } = this;
    const size = SPRITE_PX * scale;
    if (!this.sprite || this.sprite.scale !== scale) {
      this.sprite = { ...createSurface(size, size), scale };
    }
    const { canvas, ctx } = this.sprite;
    const left = px - (size >> 1);
    const top = py - SPRITE_FEET * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size >> 1, SPRITE_FEET * scale);
    ctx.scale(scale, scale);
    drawPlayer(ctx, p);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-atop';
    this.drawFluids(
      ctx,
      Math.floor(p.x) - 2,
      Math.floor(p.y) - 3,
      Math.floor(p.x) + 2,
      Math.floor(p.y) + 1,
      ox - left,
      oy - top,
      OVER_PLAYER_ALPHA,
    );
    ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(canvas, left, top);
  }

  /** Screen position of world tile (0, 0), rounded to whole pixels so tiles never shimmer. */
  private origin(cameraX: number, cameraY: number): { ox: number; oy: number } {
    const tile = TILE_PX * this.scale;
    return {
      ox: Math.round(this.canvas.width / 2 - cameraX * tile),
      oy: Math.round(this.canvas.height / 2 - cameraY * tile),
    };
  }

  private drawDarkness(light: LightView, ox: number, oy: number, tile: number): void {
    const { x0, y0, w, h } = light.region;
    if (w === 0 || h === 0) return;
    let d = this.darkness;
    if (!d || d.image.width !== w || d.image.height !== h) {
      const surface = createSurface(w, h);
      d = { ...surface, image: surface.ctx.createImageData(w, h) };
      this.darkness = d;
    }
    const data = d.image.data;
    const levels = light.levels;
    for (let i = 0; i < w * h; i++) {
      // Ink-colored pixels; only alpha varies.
      const o = i * 4;
      data[o] = 13;
      data[o + 1] = 11;
      data[o + 2] = 16;
      data[o + 3] = this.darknessByLevel[levels[i]!]!;
    }
    d.ctx.putImageData(d.image, 0, 0);
    // Each darkness pixel's center lands on its tile's center.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(d.canvas, ox + x0 * tile, oy + y0 * tile, w * tile, h * tile);
    this.ctx.imageSmoothingEnabled = false;
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
    ctx.fillStyle = palette.lava;
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

/** A stable pseudo-random value in [0, 1) for a tile. */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
