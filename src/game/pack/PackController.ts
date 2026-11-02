import type { EventBus } from '@/core/events/EventBus';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { PlacingTuning } from '@/content/tuning';
import type { SimClient } from '@/protocol/SimClient';
import type { GhostBlock } from '@/render/Renderer';
import { fanView, modeView, packView, sheetOpen, undoView } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import type { Player } from '../player/Player';
import { fluidAmount, fluidType, type ChunkMirror } from '../world/ChunkMirror';
import type { Point } from './fanLayout';
import { DEFAULT_MODE, freezesWorld, MODES, type Mode } from './modes';
import type { Pack } from './Pack';
import { PackGesture } from './PackGesture';
import {
  bodyTile,
  facingTile,
  placeBlocker,
  reachMask,
  type ReachMask,
  type TileView,
} from './placement';

export interface PackControllerDeps {
  tuning: PlacingTuning;
  materials: MaterialRegistry;
  mirror: ChunkMirror;
  sim: SimClient;
  events: EventBus<GameEvents>;
  player: Player;
  pack: Pack;
  /** The tiles on screen. */
  view(): TileView;
  /** The tile under a point on screen, in CSS pixels. */
  tileAt(cssX: number, cssY: number): Point;
  /** How wide a tile is on screen, in CSS pixels. */
  tilePx(): number;
  /** A material's tile as an image URL, for the UI. */
  iconOf(numId: number): string;
  /** The fan, the full pack or build mode started or stopped freezing the world. */
  onPausedChange(paused: boolean): void;
  onModeChange(mode: Mode): void;
  now?(): number;
}

/** How long the red flash on a refused tile lasts. */
const FLASH_MS = 250;
/** How far from a point a release still counts as dropping onto it, in CSS pixels. */
const CANCEL_RADIUS_PX = 44;
/** The undo chip's center, to the left of the button, measured from the button's center. */
const UNDO_CHIP_DX_PX = 81;

interface Placed {
  x: number;
  y: number;
  material: number;
  fluidType: number;
  fluidAmount: number;
  at: number;
}

/**
 * Ties the pack to the world: the modes, the fan's gestures, placing blocks, the
 * ghost, undo, and the signals the UI draws from. In build mode the world is
 * frozen and every touch on it is for placing; the fan and the full pack freeze
 * it too, in either mode.
 */
export class PackController {
  readonly gesture: PackGesture;
  private mode: Mode = DEFAULT_MODE;
  private preview: Mode | null = null;
  /** While scrubbing, how far the strip of modes has slid, in modes. */
  private progress = 0;
  private button: Point = { x: 0, y: 0 };
  private sheet = false;
  private paused = false;
  private pulse = 0;
  private shownRevision = -1;
  private ghostTile: Point | null = null;
  /** Where the held finger came down, and the tile the ghost started on. */
  private holdFrom: Point = { x: 0, y: 0 };
  private ghostFrom: Point = { x: 0, y: 0 };
  private ghostValid = false;
  private flash: { x: number; y: number; until: number } | null = null;
  private last: Placed | null = null;
  private undoId = 0;
  private reach: ReachMask | null = null;
  private reachStale = true;

  constructor(private readonly d: PackControllerDeps) {
    this.gesture = new PackGesture(d.tuning, {
      nextMode: () => this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]!),
      scrub: (i) => this.setPreview(MODES[i] ?? null),
      scrubMove: (p) => {
        this.progress = p;
        this.publishMode();
      },
      scrubEnd: (i) => {
        this.progress = 0;
        this.setPreview(null);
        if (i !== null) this.setMode(MODES[i]!);
      },
      openFan: () => {},
      closeFan: () => {},
      openSheet: () => this.setSheet(true),
      pick: (i) => this.pick(i),
      changed: () => this.publish(),
    });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get building(): boolean {
    return this.mode === 'build';
  }

  /** The block being aimed, or a red flash where a tap was refused. */
  get ghost(): GhostBlock | null {
    const held = this.d.pack.held;
    if (this.ghostTile && held !== null) {
      return { ...this.ghostTile, material: held, valid: this.ghostValid };
    }
    const flash = this.flash;
    if (flash && held !== null && this.now() < flash.until) {
      return { x: flash.x, y: flash.y, material: held, valid: false };
    }
    return null;
  }

  /** The tiles a block could go on, to tint. Only in build mode. */
  get tint(): ReachMask | null {
    return this.building ? this.reachNow() : null;
  }

  /** Where the pack button is on screen, in CSS pixels. */
  setButton(center: Point): void {
    this.button = center;
    this.publish();
  }

  /** Once a frame, even while paused: keeps the ghost, undo and the UI in step. */
  update(): void {
    // The world can change under a frozen player (a late reply from the sim), so look again each frame.
    this.reachStale = true;
    if (this.last && this.now() - this.last.at > this.d.tuning.undoMs) this.clearUndo();
    if (this.ghostTile) this.ghostValid = this.canPlace(this.ghostTile.x, this.ghostTile.y);
    if (this.gesture.animate(this.now())) this.publishFan();
    if (this.d.pack.revision !== this.shownRevision) this.publish();
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.ghostTile = null;
    this.flash = null;
    this.clearUndo();
    this.reachStale = true;
    this.d.onModeChange(mode);
    this.publish();
  }

  /** A tap on the world. In build mode it places the held block, or flashes where it can't. */
  tapWorld(cssX: number, cssY: number): void {
    if (!this.building) return;
    const t = this.d.tileAt(cssX, cssY);
    this.tryPlace(t.x, t.y);
  }

  /**
   * A held finger anywhere on the world: a ghost block appears on the tile the
   * player is facing. Dragging then moves it, a tile for every tile of finger
   * travel, so the finger never has to be near where the block is going.
   */
  holdStart(cssX: number, cssY: number): void {
    if (!this.building) return;
    const held = this.d.pack.held;
    if (held === null || this.d.pack.count(held) < 1) return this.denyEmpty();
    this.holdFrom = { x: cssX, y: cssY };
    this.ghostFrom = facingTile(this.d.player.box, this.d.player.facing);
    this.ghostTile = this.ghostFrom;
    this.ghostValid = this.canPlace(this.ghostFrom.x, this.ghostFrom.y);
  }

  holdMove(cssX: number, cssY: number): void {
    if (!this.ghostTile) return;
    const per = this.d.tilePx();
    const x = this.ghostFrom.x + Math.trunc((cssX - this.holdFrom.x) / per);
    const y = this.ghostFrom.y + Math.trunc((cssY - this.holdFrom.y) / per);
    if (x === this.ghostTile.x && y === this.ghostTile.y) return;
    this.d.events.emit('ghostStep', {});
    this.ghostTile = { x, y };
    this.ghostValid = this.canPlace(x, y);
  }

  /** Releasing places the ghost, unless the finger came back to the button or the undo chip. */
  holdEnd(cssX: number, cssY: number, commit: boolean): void {
    const tile = this.ghostTile;
    this.ghostTile = null;
    if (!tile || !commit || this.inCancelZone(cssX, cssY)) return;
    this.tryPlace(tile.x, tile.y);
  }

  /** Takes back the last block placed, if it was within the undo window. */
  undo(): void {
    const u = this.last;
    if (!u) return;
    const { pack, mirror, sim, events, materials } = this.d;
    this.clearUndo();
    sim.send({
      type: 'unplaceTile',
      x: u.x,
      y: u.y,
      material: u.material,
      fluidType: u.fluidType,
      fluidAmount: u.fluidAmount,
    });
    mirror.setMaterial(u.x, u.y, materials.air.numId);
    pack.add(u.material);
    events.emit('unplaced', { x: u.x, y: u.y, material: u.material });
    this.reachStale = true;
  }

  /** The sim refused a block: it goes back in the pack, and can't be undone. */
  refund(x: number, y: number, material: number): void {
    this.d.pack.add(material);
    if (this.last && this.last.x === x && this.last.y === y) this.clearUndo();
    this.reachStale = true;
  }

  closeSheet(): void {
    this.setSheet(false);
  }

  select(numId: number): void {
    this.d.pack.select(numId);
    this.publish();
  }

  moveItem(from: number, to: number): void {
    this.d.pack.move(from, to);
    this.publish();
  }

  discard(numId: number, count: number): void {
    this.d.pack.take(numId, Math.min(count, this.d.pack.count(numId)));
    this.publish();
  }

  private pick(index: number): void {
    const item = this.d.pack.items[index];
    if (item) this.d.pack.select(item.numId);
    else this.setSheet(true);
  }

  private setSheet(open: boolean): void {
    this.sheet = open;
    if (open) this.gesture.reset();
    this.publish();
  }

  private setPreview(mode: Mode | null): void {
    this.preview = mode;
    this.publishMode();
  }

  private inCancelZone(x: number, y: number): boolean {
    const near = (cx: number) => Math.hypot(x - cx, y - this.button.y) <= CANCEL_RADIUS_PX;
    return near(this.button.x) || near(this.button.x - UNDO_CHIP_DX_PX);
  }

  private now(): number {
    return this.d.now ? this.d.now() : performance.now();
  }

  private reachNow(): ReachMask {
    const view = this.d.view();
    const r = this.reach;
    const same =
      r &&
      r.view.x0 === view.x0 &&
      r.view.y0 === view.y0 &&
      r.view.x1 === view.x1 &&
      r.view.y1 === view.y1;
    if (!same || this.reachStale) {
      this.reach = reachMask(bodyTile(this.d.player.box), this.d.mirror.isSolid, view);
      this.reachStale = false;
    }
    return this.reach!;
  }

  private canPlace(x: number, y: number): boolean {
    const { mirror, player } = this.d;
    return (
      placeBlocker(x, y, {
        isLoaded: (tx, ty) => mirror.isLoaded(tx, ty),
        solid: mirror.isSolid,
        box: player.box,
        view: this.d.view(),
        reach: this.reachNow(),
      }) === null
    );
  }

  private denyEmpty(): void {
    this.pulse++;
    this.publish();
  }

  /** Places the held block, or says why not. */
  private tryPlace(x: number, y: number): void {
    const { pack, events } = this.d;
    const held = pack.held;
    if (held === null || pack.count(held) < 1) return this.denyEmpty();
    if (!this.canPlace(x, y)) {
      this.flash = { x, y, until: this.now() + FLASH_MS };
      events.emit('placeDenied', { x, y });
      return;
    }
    const { mirror, sim } = this.d;
    const packed = mirror.fluidAt(x, y);
    pack.take(held);
    mirror.setMaterial(x, y, held);
    sim.send({ type: 'placeTile', x, y, material: held });
    events.emit('placed', { x, y, material: held });
    // Only the last block can be undone.
    this.last = {
      x,
      y,
      material: held,
      fluidType: fluidType(packed),
      fluidAmount: fluidAmount(packed),
      at: this.now(),
    };
    undoView.value = { id: ++this.undoId, ms: this.d.tuning.undoMs };
    this.reachStale = true;
  }

  private clearUndo(): void {
    this.last = null;
    if (undoView.value) undoView.value = null;
  }

  private publishFan(): void {
    const g = this.gesture;
    fanView.value = { open: g.fanOpen, slots: g.slots, hover: g.hover, center: this.button };
  }

  /** Just the mode signal, so a drag across the button doesn't rebuild the whole pack view. */
  private publishMode(): void {
    modeView.value = {
      mode: this.mode,
      preview: this.preview,
      modes: MODES,
      pulse: this.pulse,
      progress: this.progress,
      scrubbing: this.preview !== null,
    };
  }

  private publish(): void {
    const { pack, materials } = this.d;
    this.shownRevision = pack.revision;
    this.gesture.setLayout(this.button, pack.kinds + 1);
    this.gesture.setModes(MODES.indexOf(this.mode), MODES.length);

    const colorOf = (numId: number): string => {
      const base = materials.get(numId)?.visual?.base;
      return base ? palette[base] : palette.stone;
    };
    const nameOf = (numId: number): string => materials.get(numId)?.name ?? '?';
    packView.value = {
      items: pack.items.map(({ numId, count }) => ({
        numId,
        name: nameOf(numId),
        color: colorOf(numId),
        icon: this.d.iconOf(numId),
        count,
        unitWeight: materials.get(numId)?.weight ?? 0,
      })),
      held:
        pack.held === null
          ? null
          : {
              numId: pack.held,
              name: nameOf(pack.held),
              color: colorOf(pack.held),
              icon: this.d.iconOf(pack.held),
              count: pack.count(pack.held),
            },
      weight: pack.weight,
      capacity: pack.capacity,
      load: pack.load,
    };

    const g = this.gesture;
    this.publishFan();
    sheetOpen.value = this.sheet;
    this.publishMode();

    const paused = freezesWorld(this.mode) || g.fanOpen || this.sheet;
    if (paused !== this.paused) {
      this.paused = paused;
      this.d.onPausedChange(paused);
    }
  }
}
