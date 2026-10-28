import { MAX_LIGHT, computeLight, type LightRegion, type LightSources } from '@/core/light/light';
import type { ChunkData } from '@/core/world/chunk';
import type { MaterialRegistry } from '@/content/materials';
import type { ChunkMirror, MirrorListener } from '../world/ChunkMirror';
import type { TileRect } from '../world/ChunkStreamer';

/** Read-only light for the renderer: one level (0–15) per tile of `region`. */
export interface LightView {
  region: LightRegion;
  levels: Uint8Array;
}

/**
 * Light around the view, recomputed on the main thread when the view, the
 * lamp's tile or the world changes. Light reaches at most MAX_LIGHT tiles, so
 * computing a margin that wide around the view keeps edges correct.
 */
export class LightField implements MirrorListener {
  private region: LightRegion = { x0: 0, y0: 0, w: 0, h: 0 };
  private levels = new Uint8Array(0);
  private dirty = true;
  private key = '';
  private readonly emission: Uint8Array;
  private readonly lamps = [{ x: 0, y: 0, level: 0 }];
  private readonly sources: LightSources;

  constructor(mirror: ChunkMirror, materials: MaterialRegistry) {
    this.emission = new Uint8Array(materials.maxNumId + 1);
    for (const m of materials.all) this.emission[m.numId] = m.light;
    const surfaceY = mirror.dims.surfaceY;
    this.sources = {
      isOpaque: mirror.isSolid,
      emission: (x, y) => {
        const m = mirror.materialAt(x, y);
        return m < 0 ? 0 : this.emission[m]!;
      },
      isSky: (_x, y) => y < surfaceY,
      lamps: this.lamps,
    };
  }

  get view(): LightView {
    return { region: this.region, levels: this.levels };
  }

  update(view: TileRect, lamp: { x: number; y: number; level: number }): void {
    const m = MAX_LIGHT + 1;
    const x0 = Math.floor(view.x) - m;
    const y0 = Math.floor(view.y) - m;
    const w = Math.ceil(view.w) + 2 * m + 1;
    const h = Math.ceil(view.h) + 2 * m + 1;
    const lx = Math.floor(lamp.x);
    const ly = Math.floor(lamp.y);
    const key = `${x0},${y0},${w},${h}|${lx},${ly},${lamp.level}`;
    if (!this.dirty && key === this.key) return;

    this.key = key;
    this.dirty = false;
    this.region = { x0, y0, w, h };
    if (this.levels.length < w * h) this.levels = new Uint8Array(w * h);
    this.lamps[0] = { x: lx, y: ly, level: lamp.level };
    computeLight(this.region, this.sources, this.levels);
  }

  chunkLoaded(_chunk: ChunkData): void {
    this.dirty = true;
  }

  chunkUnloaded(): void {
    this.dirty = true;
  }

  tileChanged(): void {
    this.dirty = true;
  }
}
