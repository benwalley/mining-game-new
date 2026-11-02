import type { EventBus } from '@/core/events/EventBus';
import type { MaterialRegistry } from '@/content/materials';
import { palette } from '@/content/palette';
import type { PlacingTuning } from '@/content/tuning';
import type { SimClient } from '@/protocol/SimClient';
import type { GhostBlock } from '@/render/Renderer';
import { fanView, packView, sheetOpen } from '@/ui/stores/gameStore';
import type { GameEvents } from '../events';
import type { Player } from '../player/Player';
import type { ChunkMirror } from '../world/ChunkMirror';
import type { Point } from './fanLayout';
import type { Pack } from './Pack';
import { PackGesture } from './PackGesture';
import { facingTile, placeBlocker, type PlaceContext } from './placement';

export interface PackControllerDeps {
  tuning: PlacingTuning;
  materials: MaterialRegistry;
  mirror: ChunkMirror;
  sim: SimClient;
  events: EventBus<GameEvents>;
  player: Player;
  pack: Pack;
  /** The tiles on screen, as a half-open rectangle. */
  view(): PlaceContext['view'];
  /** The fan or the full pack opened or closed; gameplay stops while either is open. */
  onPausedChange(paused: boolean): void;
}

/**
 * Ties the pack to the world: the fan's gestures, the ghost block, placing, and
 * the signals the UI draws from. The game pauses while the fan or the full pack
 * is open, but placing still works then (the sim accepts it while paused).
 */
export class PackController {
  readonly gesture: PackGesture;
  ghost: GhostBlock | null = null;
  private ghostFrom: Point = { x: 0, y: 0 };
  private button: Point = { x: 0, y: 0 };
  private sheet = false;
  private paused = false;
  /** After placing a block, taps place more of it until the player moves. */
  private tapPlacing = false;
  private shownRevision = -1;

  constructor(private readonly d: PackControllerDeps) {
    this.gesture = new PackGesture(d.tuning, {
      openFan: () => {},
      closeFan: () => {},
      openSheet: () => this.setSheet(true),
      pick: (i) => this.pick(i),
      ghostStart: (i) => this.startGhost(i),
      ghostMove: (dx, dy) => this.moveGhost(dx, dy),
      ghostEnd: (commit) => this.endGhost(commit),
      changed: () => this.publish(),
    });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Where the pack button is on screen, in CSS pixels. */
  setButton(center: Point): void {
    this.button = center;
    this.gesture.setLayout(center, this.d.pack.kinds + 1);
    this.publish();
  }

  /** Once a frame, even while paused: keeps the ghost and the UI in step with the world. */
  update(): void {
    if (this.ghost)
      this.ghost = { ...this.ghost, valid: this.canPlace(this.ghost.x, this.ghost.y) };
    if (this.d.pack.revision !== this.shownRevision) this.publish();
  }

  /** A tap on the world. True if it placed a block. */
  tap(x: number, y: number): boolean {
    return this.tapPlacing && this.place(x, y);
  }

  /** Called every frame with whether the player is trying to move. */
  noteMovement(moving: boolean): void {
    if (moving) this.tapPlacing = false;
  }

  /** The sim refused a block: it goes back in the pack. */
  refund(material: number): void {
    this.d.pack.add(material);
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

  private startGhost(index: number | null): boolean {
    const { pack, player } = this.d;
    const numId = index === null ? pack.held : (pack.items[index]?.numId ?? null);
    if (numId === null || pack.count(numId) < 1) return false;
    pack.select(numId);
    this.ghostFrom = facingTile(player.box, player.facing);
    this.setGhost(this.ghostFrom.x, this.ghostFrom.y, numId);
    return true;
  }

  private moveGhost(dxPx: number, dyPx: number): void {
    const held = this.d.pack.held;
    if (!this.ghost || held === null) return;
    const per = this.d.tuning.ghostPxPerTile;
    const x = this.ghostFrom.x + Math.trunc(dxPx / per);
    const y = this.ghostFrom.y + Math.trunc(dyPx / per);
    if (x !== this.ghost.x || y !== this.ghost.y) {
      this.setGhost(x, y, held);
      this.d.events.emit('ghostStep', {});
    }
  }

  private endGhost(commit: boolean): void {
    const ghost = this.ghost;
    this.ghost = null;
    if (commit && ghost?.valid) this.place(ghost.x, ghost.y);
  }

  private setGhost(x: number, y: number, material: number): void {
    this.ghost = { x, y, material, valid: this.canPlace(x, y) };
  }

  private canPlace(x: number, y: number): boolean {
    const { mirror, player } = this.d;
    const blocker = placeBlocker(x, y, {
      isLoaded: (tx, ty) => mirror.isLoaded(tx, ty),
      solid: mirror.isSolid,
      box: player.box,
      view: this.d.view(),
    });
    return blocker === null;
  }

  /** Puts the held block at a tile, if it can go there. The sim confirms or refuses. */
  private place(x: number, y: number): boolean {
    const { pack, mirror, sim, events } = this.d;
    const material = pack.held;
    if (material === null || pack.count(material) < 1 || !this.canPlace(x, y)) return false;
    pack.take(material);
    mirror.setMaterial(x, y, material);
    sim.send({ type: 'placeTile', x, y, material });
    events.emit('placed', { x, y, material });
    this.tapPlacing = true;
    return true;
  }

  private publish(): void {
    const { pack, materials } = this.d;
    this.shownRevision = pack.revision;
    this.gesture.setLayout(this.button, pack.kinds + 1);

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
              count: pack.count(pack.held),
            },
      weight: pack.weight,
      capacity: pack.capacity,
      load: pack.load,
    };

    const g = this.gesture;
    fanView.value = { open: g.fanOpen, slots: g.slots, hover: g.hover, ghosting: g.ghosting };
    sheetOpen.value = this.sheet;

    const paused = g.fanOpen || this.sheet;
    if (paused !== this.paused) {
      this.paused = paused;
      this.d.onPausedChange(paused);
    }
  }
}
