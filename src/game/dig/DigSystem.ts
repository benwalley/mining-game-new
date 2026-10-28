import type { EventBus } from '@/core/events/EventBus';
import type { MaterialDef, MaterialRegistry } from '@/content/materials';
import type { DigTuning } from '@/content/tuning';
import type { SimClient } from '@/protocol/SimClient';
import type { GameEvents } from '../events';
import type { Contact, MoveIntent } from '../player/PlayerController';
import type { Player } from '../player/Player';
import type { ChunkMirror } from '../world/ChunkMirror';
import { chooseDigTarget, type DigTarget } from './digTarget';

/** Read-only view of the current dig, for rendering cracks and the debug overlay. */
export interface DigState {
  target: DigTarget | null;
  material: MaterialDef | null;
  /** 0–1. */
  progress: number;
  /** 0 = no cracks, up to `crackStages`. */
  stage: number;
  blocked: boolean;
  digTime: number;
}

export function digTimeFor(material: MaterialDef, toolPower: number, t: DigTuning): number {
  return Math.max(t.minDigTime, (material.hardness * t.secondsPerHardness) / toolPower);
}

export function canDig(material: MaterialDef, toolPower: number, t: DigTuning): boolean {
  return (
    material.solid && !material.indestructible && toolPower >= material.hardness - t.gateOffset
  );
}

/**
 * Turns "pushing into a solid tile" into dig progress, crack stages and breaks.
 * Breaks are applied to the local mirror immediately and sent to the sim.
 */
export class DigSystem {
  toolPower: number;
  private target: DigTarget | null = null;
  private progress = 0;
  private swingTimer = 0;
  private blocked = false;

  constructor(
    private readonly tuning: DigTuning,
    private readonly materials: MaterialRegistry,
    private readonly mirror: ChunkMirror,
    private readonly sim: SimClient,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.toolPower = tuning.defaultToolPower;
  }

  get isDigging(): boolean {
    return this.target !== null;
  }

  get state(): DigState {
    const material = this.target
      ? (this.materials.get(this.mirror.materialAt(this.target.x, this.target.y)) ?? null)
      : null;
    return {
      target: this.target,
      material,
      progress: this.progress,
      stage: this.stage,
      blocked: this.blocked,
      digTime: material ? digTimeFor(material, this.toolPower, this.tuning) : 0,
    };
  }

  private get stage(): number {
    const stages = this.tuning.crackStages;
    return Math.min(stages, Math.floor(this.progress * (stages + 1)));
  }

  update(player: Player, intent: MoveIntent, contact: Contact, dt: number): void {
    const next = chooseDigTarget({
      box: player.box,
      intentX: intent.x,
      intentY: intent.y,
      grounded: contact.grounded,
      climbing: player.climbing,
      solid: this.mirror.isSolid,
      flushTolerance: this.tuning.flushTolerance,
    });
    // Never dig into chunks that haven't arrived yet.
    const target = next && this.mirror.isLoaded(next.x, next.y) ? next : null;

    if (!sameTile(target, this.target)) {
      this.target = target;
      this.progress = 0;
      this.swingTimer = 0;
      this.blocked = false;
    }

    player.digDir = target?.dir ?? null;
    player.centerColumn =
      target && (target.dir === 'up' || target.dir === 'down') ? target.x : null;
    if (!target) return;

    const material = this.materials.get(this.mirror.materialAt(target.x, target.y));
    if (!material) return;

    player.swingTime += dt;
    this.swingTimer -= dt;
    const swing = this.swingTimer <= 0;
    if (swing) {
      this.swingTimer += this.tuning.swingInterval;
      player.swingTime = 0;
    }

    if (!canDig(material, this.toolPower, this.tuning)) {
      this.blocked = true;
      if (swing) this.events.emit('digBlocked', { ...tilePos(target), material: material.numId });
      return;
    }

    this.progress += dt / digTimeFor(material, this.toolPower, this.tuning);
    if (this.progress >= 1) {
      this.breakTile(target, material);
      return;
    }
    if (swing) {
      this.events.emit('digHit', {
        ...tilePos(target),
        material: material.numId,
        stage: this.stage,
        dir: target.dir,
      });
    }
  }

  private breakTile(target: DigTarget, material: MaterialDef): void {
    this.mirror.setMaterial(target.x, target.y, this.materials.air.numId);
    this.sim.send({ type: 'digTile', x: target.x, y: target.y, toolPower: this.toolPower });
    this.events.emit('tileBroken', { ...tilePos(target), material: material.numId });
    this.target = null;
    this.progress = 0;
    // Let the next tile's first swing land right away so continuous digging has rhythm.
    this.swingTimer = 0;
  }
}

const tilePos = (t: DigTarget) => ({ x: t.x, y: t.y });

const sameTile = (a: DigTarget | null, b: DigTarget | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
