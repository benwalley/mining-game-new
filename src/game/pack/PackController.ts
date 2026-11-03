import type { EventBus } from '@/core/events/EventBus';
import type { GearSlotKind, MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { PlacingTuning } from '@/content/tuning';
import type { SimClient } from '@/protocol/SimClient';
import type { GhostBlock } from '@/render/Renderer';
import {
  chestView,
  fanView,
  gearView,
  modeView,
  packView,
  sheetOpen,
  undoView,
  type PackItemView,
} from '@/ui/stores/gameStore';
import { itemKey, keyMaterial, keyVariant, keyVariant2 } from '../craft/itemKey';
import type { Gear } from '../gear/Gear';
import type { GameEvents } from '../events';
import type { Player } from '../player/Player';
import { fluidAmount, fluidType, type ChunkMirror } from '../world/ChunkMirror';
import type { Point } from './fanLayout';
import { DEFAULT_MODE, freezesWorld, MODES, type Mode } from './modes';
import { storeAll, transfer, type Chests } from './Chests';
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
  chests: Chests;
  gear: Gear;
  /** How far from the body a chest can be opened, in tiles. */
  chestRange: number;
  /** Holding water, lava or another liquid (not gas). */
  liquidAt(x: number, y: number): boolean;
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
  onModeChange(mode: Mode, from: Mode): void;
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
  /** The pack key, which may carry a variant (a torch's fuel). */
  key: number;
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
  private currentMode: Mode = DEFAULT_MODE;
  private preview: Mode | null = null;
  /** While scrubbing, how far the strip of modes has slid, in modes. */
  private progress = 0;
  private button: Point = { x: 0, y: 0 };
  private sheet = false;
  private paused = false;
  private pulse = 0;
  private shownRevision = -1;
  private gearRevision = -1;
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
  private chest: { x: number; y: number } | null = null;
  private chestRevision = -1;

  constructor(private readonly d: PackControllerDeps) {
    this.gesture = new PackGesture(d.tuning, {
      nextMode: () => this.setMode(MODES[(MODES.indexOf(this.currentMode) + 1) % MODES.length]!),
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
    return this.currentMode === 'build';
  }

  get mode(): Mode {
    return this.currentMode;
  }

  /** The block being aimed, or a red flash where a tap was refused. */
  get ghost(): GhostBlock | null {
    const held = this.d.pack.held;
    if (this.ghostTile && held !== null) {
      return { ...this.ghostTile, material: keyMaterial(held), valid: this.ghostValid };
    }
    const flash = this.flash;
    if (flash && held !== null && this.now() < flash.until) {
      return { x: flash.x, y: flash.y, material: keyMaterial(held), valid: false };
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
    if (this.d.gear.revision !== this.gearRevision) this.publishGear();
    if (this.chest && this.d.chests.version !== this.chestRevision) this.publishChest();
  }

  setMode(mode: Mode): void {
    if (mode === this.currentMode) return;
    const from = this.currentMode;
    this.currentMode = mode;
    this.ghostTile = null;
    this.flash = null;
    this.clearUndo();
    this.reachStale = true;
    this.d.onModeChange(mode, from);
    this.publish();
  }

  /**
   * A tap on the world. In build mode it places whatever is held, or flashes where
   * it can't. In dig mode it opens a chest in reach, takes back a torch in reach,
   * or places a held torch or chest; with a block held it does nothing, since
   * blocks go down in build mode.
   */
  tapWorld(cssX: number, cssY: number): void {
    if (this.isPaused && !this.building) return;
    const t = this.d.tileAt(cssX, cssY);
    if (this.building) return this.tryPlace(t.x, t.y);
    if (this.d.chests.get(t.x, t.y) && this.isChestTile(t.x, t.y)) {
      if (this.chestInRange(t.x, t.y)) return this.openChest(t.x, t.y);
      this.flash = { x: t.x, y: t.y, until: this.now() + FLASH_MS };
      this.d.events.emit('placeDenied', t);
      return;
    }
    if (this.kindOf(this.d.mirror.materialAt(t.x, t.y)) === 'torch') {
      if (this.chestInRange(t.x, t.y)) return this.d.sim.send({ type: 'takeTorch', ...t });
      this.flash = { x: t.x, y: t.y, until: this.now() + FLASH_MS };
      this.d.events.emit('placeDenied', t);
      return;
    }
    const held = this.d.pack.held;
    if (held !== null && this.kindOf(held) !== 'block') this.tryPlace(t.x, t.y);
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
    const material = keyMaterial(u.key);
    sim.send({
      type: 'unplaceTile',
      x: u.x,
      y: u.y,
      material,
      fluidType: u.fluidType,
      fluidAmount: u.fluidAmount,
    });
    mirror.setMaterial(u.x, u.y, materials.air.numId);
    pack.add(u.key);
    if (this.kindOf(u.key) === 'chest') this.d.chests.remove(u.x, u.y);
    events.emit('unplaced', { x: u.x, y: u.y, material });
    this.reachStale = true;
  }

  /** The sim refused a placement: it goes back in the pack, and can't be undone. */
  refund(x: number, y: number, material: number, variant: number): void {
    const key = itemKey(material, variant);
    this.d.pack.add(key);
    if (this.kindOf(key) === 'chest') this.d.chests.remove(x, y);
    if (this.last && this.last.x === x && this.last.y === y) this.clearUndo();
    this.reachStale = true;
  }

  /** The sim took a torch off the wall: it goes back in the pack unless it was spent. */
  torchTaken(x: number, y: number, variant: number, spent: boolean): void {
    if (!spent) this.d.pack.add(itemKey(this.d.materials.require('torch').numId, variant));
    this.d.events.emit('torchTaken', { x, y, variant, spent });
    this.reachStale = true;
    this.publish();
  }

  get chestOpen(): boolean {
    return this.chest !== null;
  }

  openChest(x: number, y: number): void {
    if (!this.d.chests.get(x, y)) return;
    this.chest = { x, y };
    this.gesture.reset();
    this.d.events.emit('chestOpened', { x, y });
    this.publish();
  }

  closeChest(): void {
    if (!this.chest) return;
    this.chest = null;
    this.d.events.emit('chestClosed', {});
    this.publish();
  }

  /** Moves up to `n` of a stack between the pack and the open chest. */
  stow(key: number, n: number, into: 'chest' | 'pack'): void {
    const chest = this.chest && this.d.chests.get(this.chest.x, this.chest.y);
    if (!chest) return;
    const [from, to] = into === 'chest' ? [this.d.pack, chest] : [chest, this.d.pack];
    const moved = transfer(from, to, key, n);
    if (moved > 0) this.d.events.emit('stowed', { key, count: moved, into });
    else this.d.events.emit('craftDenied', {});
    this.publish();
  }

  /** Everything but the held item goes into the open chest. */
  stowAll(): void {
    const chest = this.chest && this.d.chests.get(this.chest.x, this.chest.y);
    if (!chest) return;
    const before = this.d.pack.weight;
    storeAll(this.d.pack, chest, this.d.pack.held);
    if (this.d.pack.weight < before) {
      this.d.events.emit('stowed', { key: -1, count: 0, into: 'chest' });
    } else this.d.events.emit('craftDenied', {});
    this.publish();
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

  /** Puts on gear from the pack, swapping out what that slot had. */
  wear(key: number): void {
    const slot = this.d.gear.slotOf(key);
    if (slot && this.d.gear.wear(key, this.d.pack)) this.d.events.emit('gearWorn', { key, slot });
    else this.d.events.emit('craftDenied', {});
    this.publish();
    this.publishGear();
  }

  takeOff(slot: GearSlotKind): void {
    const key = this.d.gear.get(slot);
    if (key !== null && this.d.gear.takeOff(slot, this.d.pack)) {
      this.d.events.emit('gearRemoved', { key, slot });
    } else this.d.events.emit('craftDenied', {});
    this.publish();
    this.publishGear();
  }

  discard(numId: number, count: number): void {
    this.d.pack.take(numId, Math.min(count, this.d.pack.count(numId)));
    this.publish();
  }

  private kindOf(key: number) {
    return this.d.materials.get(keyMaterial(key))?.kind ?? 'block';
  }

  private isChestTile(x: number, y: number): boolean {
    return this.kindOf(this.d.mirror.materialAt(x, y)) === 'chest';
  }

  /** Within reach to open a chest or take a torch. */
  private chestInRange(x: number, y: number): boolean {
    const b = bodyTile(this.d.player.box);
    const r = this.d.chestRange;
    return Math.abs(x - b.x) <= r && Math.abs(y - b.y) <= r;
  }

  /** A fan entry: blocks become the held one, and gear is put on. */
  private pick(index: number): void {
    const item = this.d.pack.items[index];
    if (!item) this.setSheet(true);
    else if (this.kindOf(item.numId) === 'gear') this.wear(item.numId);
    else this.d.pack.select(item.numId);
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
    const { mirror, player, pack, materials } = this.d;
    const kind = pack.held === null ? 'block' : this.kindOf(pack.held);
    return (
      placeBlocker(
        x,
        y,
        {
          isLoaded: (tx, ty) => mirror.isLoaded(tx, ty),
          solid: mirror.isSolid,
          isEmpty: (tx, ty) => mirror.materialAt(tx, ty) === materials.air.numId,
          liquid: (tx, ty) => this.d.liquidAt(tx, ty),
          box: player.box,
          view: this.d.view(),
          reach: this.reachNow(),
        },
        kind,
      ) === null
    );
  }

  private denyEmpty(): void {
    this.pulse++;
    this.publish();
  }

  /** Places the held block, torch or chest, or says why not. */
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
    const material = keyMaterial(held);
    pack.take(held);
    mirror.setMaterial(x, y, material);
    if (this.kindOf(held) === 'chest') this.d.chests.create(x, y);
    sim.send({ type: 'placeTile', x, y, material, variant: keyVariant(held) });
    events.emit('placed', { x, y, material });
    // Only the last thing placed can be undone.
    this.last = {
      x,
      y,
      key: held,
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
      mode: this.currentMode,
      preview: this.preview,
      modes: MODES,
      pulse: this.pulse,
      progress: this.progress,
      scrubbing: this.preview !== null,
    };
  }

  private publish(): void {
    const { pack } = this.d;
    this.shownRevision = pack.revision;
    this.gesture.setLayout(this.button, pack.kinds + 1);
    this.gesture.setModes(MODES.indexOf(this.currentMode), MODES.length);

    packView.value = {
      items: pack.items.map(({ numId, count }) => this.itemView(numId, count)),
      held: pack.held === null ? null : this.itemView(pack.held, pack.count(pack.held)),
      weight: pack.weight,
      capacity: pack.capacity,
      load: pack.load,
    };

    const g = this.gesture;
    this.publishFan();
    sheetOpen.value = this.sheet;
    this.publishMode();

    this.publishChest();
    const paused = freezesWorld(this.currentMode) || g.fanOpen || this.sheet || this.chest !== null;
    if (paused !== this.paused) {
      this.paused = paused;
      this.d.onPausedChange(paused);
    }
  }

  private publishGear(): void {
    const { gear } = this.d;
    this.gearRevision = gear.revision;
    const view = (slot: GearSlotKind) => {
      const key = gear.get(slot);
      return key === null ? null : this.itemView(key, 1);
    };
    gearView.value = { air: view('air'), body: view('body') };
  }

  /** How the UI shows one stack, of a material or a crafted item. */
  itemView(key: number, count: number): PackItemView {
    const { materials } = this.d;
    const m = materials.get(keyMaterial(key));
    const base = m?.visual?.base;
    const of = [keyVariant(key), keyVariant2(key)]
      .map((v) => (v ? materials.get(v)?.name.toLowerCase() : undefined))
      .filter(Boolean);
    return {
      numId: key,
      name: `${m?.name ?? '?'}${of.length ? ` (${of.join(', ')})` : ''}`,
      color: base ? palette[base] : palette.stone,
      icon: this.d.iconOf(keyMaterial(key)),
      count,
      unitWeight: m?.weight ?? 0,
      wearable: m?.kind === 'gear',
      stats: this.d.gear.describe(key),
    };
  }

  private publishChest(): void {
    const at = this.chest;
    const chest = at && this.d.chests.get(at.x, at.y);
    this.chestRevision = this.d.chests.version;
    if (!at || !chest) {
      if (chestView.value) chestView.value = null;
      return;
    }
    chestView.value = {
      x: at.x,
      y: at.y,
      items: chest.items.map(({ numId, count }) => this.itemView(numId, count)),
      weight: chest.weight,
      capacity: chest.capacity,
    };
  }
}
