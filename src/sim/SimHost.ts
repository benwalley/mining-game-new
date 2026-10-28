import { ChunkStore } from '@/core/world/ChunkStore';
import { chunkTransferables, cloneChunk, type ChunkData } from '@/core/world/chunk';
import {
  CHUNK_SHIFT,
  CHUNK_SIZE,
  UNLOADED,
  chunkKey,
  chunkKeyX,
  chunkKeyY,
} from '@/core/world/constants';
import type { FluidRegistry } from '@/content/fluids';
import type { MaterialRegistry } from '@/content/materials';
import type { Tuning } from '@/content/tuning';
import {
  PROTOCOL_VERSION,
  type ChunkCoord,
  type DamageChange,
  type FluidPatch,
  type FromSim,
  type MessagePort,
  type PlayerSnapshot,
  type ToSim,
  type WorldKind,
  type WorldInfo,
} from '@/protocol/messages';
import { FluidSim } from './fluid/FluidSim';
import type { SaveStore } from './persistence/SaveStore';
import { SAVE_VERSION, type WorldMeta } from './persistence/saveFormat';
import type { WorldGenerator } from './worldgen/WorldGenerator';

const PLAYER_ENTITY_ID = 'player';
const STATS_EVERY_MS = 1000;

export interface SimHostDeps {
  port: MessagePort<ToSim, FromSim>;
  store: SaveStore;
  materials: MaterialRegistry;
  fluids: FluidRegistry;
  tuning: Tuning;
  createGenerator(seed: string, kind: WorldKind): WorldGenerator;
  /** Entropy for new world seeds. */
  newSeed(): string;
  now?(): number;
}

/**
 * Owns the authoritative world: generates and loads chunks, applies player
 * commands, runs the simulation tick, and saves. Runs inside a Web Worker but
 * has no dependency on worker globals, so it is testable in Node.
 */
export class SimHost {
  private readonly now: () => number;
  private world?: {
    info: WorldInfo;
    meta: WorldMeta;
    generator: WorldGenerator;
    chunks: ChunkStore;
    fluids: FluidSim;
  };
  private player: PlayerSnapshot | null = null;
  private playerDirty = false;
  private readonly dirtyChunks = new Set<number>();
  /** Chunks the main thread currently holds. Others may be evicted from memory. */
  private readonly wanted = new Set<number>();
  private readonly loading = new Map<number, Promise<void>>();
  private readonly solidById: Uint8Array;
  private paused = false;
  private saving: Promise<void> | null = null;
  private saveQueued = false;
  private tickTimer?: ReturnType<typeof setInterval>;
  private saveTimer?: ReturnType<typeof setInterval>;
  private lastTickAt = 0;
  private statsSince = 0;
  private statsTicks = 0;
  private statsTickMs = 0;

  constructor(private readonly deps: SimHostDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.solidById = new Uint8Array(deps.materials.maxNumId + 1);
    for (const m of deps.materials.all) this.solidById[m.numId] = m.solid ? 1 : 0;
    deps.port.onMessage((msg) => {
      this.handle(msg).catch((err: unknown) => this.post({ type: 'error', message: String(err) }));
    });
  }

  async handle(msg: ToSim): Promise<void> {
    switch (msg.type) {
      case 'init':
        if (msg.protocol !== PROTOCOL_VERSION) {
          throw new Error(`Protocol mismatch: main ${msg.protocol}, sim ${PROTOCOL_VERSION}`);
        }
        await this.init(msg.worldId, msg.kind);
        return;
      case 'requestChunks':
        await this.requestChunks(msg.chunks);
        return;
      case 'releaseChunks':
        this.releaseChunks(msg.chunks);
        return;
      case 'digTile':
        this.digTile(msg.x, msg.y, msg.toolPower);
        return;
      case 'damageTiles':
        this.damageTiles(msg.changes);
        return;
      case 'playerState':
        this.player = msg.player;
        this.playerDirty = true;
        return;
      case 'setPaused':
        this.paused = msg.paused;
        return;
      case 'flush':
        await this.save();
        return;
      case 'resetWorld':
        await this.resetWorld();
        return;
      case 'pourFluid':
        this.requireWorld().fluids.setFluid(msg.x, msg.y, msg.fluid, msg.amount);
        return;
    }
  }

  /** Starts the fixed-rate tick and autosave timers. */
  start(): void {
    const { ticksPerSecond } = this.deps.tuning.sim;
    this.lastTickAt = this.now();
    this.tickTimer = setInterval(() => this.tick(), 1000 / ticksPerSecond);
    this.saveTimer = setInterval(() => {
      if (!this.paused) void this.save();
    }, this.deps.tuning.save.autosaveIntervalMs);
  }

  stop(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.saveTimer);
  }

  private post(msg: FromSim, transfer?: Transferable[]): void {
    this.deps.port.post(msg, transfer);
  }

  private async init(worldId: string, kind: WorldKind): Promise<void> {
    const { store } = this.deps;
    let meta = await store.loadMeta(worldId);
    const probe = this.deps.createGenerator('probe', kind);

    if (meta && meta.generatorId !== probe.id) {
      // The test world's code or config changed; old chunks no longer match.
      await store.deleteWorld(worldId);
      meta = undefined;
    }
    if (!meta) {
      const created = this.now();
      meta = {
        saveVersion: SAVE_VERSION,
        worldId,
        seed: this.deps.newSeed(),
        generatorId: probe.id,
        dims: probe.dims,
        createdAt: created,
        lastSavedAt: created,
        playTimeMs: 0,
      };
      await store.commit(worldId, { meta });
    }

    const generator = this.deps.createGenerator(meta.seed, kind);
    const chunks = new ChunkStore(generator.dims, this.deps.materials.bedrock.numId);
    this.world = {
      meta,
      generator,
      chunks,
      fluids: new FluidSim(chunks, this.solidById, this.deps.fluids),
      info: {
        worldId,
        seed: meta.seed,
        dims: generator.dims,
        spawn: generator.spawn,
        generatorId: generator.id,
      },
    };
    this.player = (await store.loadEntity<PlayerSnapshot>(worldId, PLAYER_ENTITY_ID)) ?? null;
    this.post({
      type: 'ready',
      world: this.world.info,
      player: this.player,
      playTimeMs: meta.playTimeMs,
    });
  }

  private requireWorld(): NonNullable<SimHost['world']> {
    if (!this.world) throw new Error('Sim received a world command before init');
    return this.world;
  }

  private async requestChunks(coords: readonly ChunkCoord[]): Promise<void> {
    const world = this.requireWorld();
    const toLoad: ChunkCoord[] = [];
    const waits: Promise<void>[] = [];

    for (const [cx, cy] of coords) {
      const key = chunkKey(cx, cy);
      this.wanted.add(key);
      const inMemory = world.chunks.get(cx, cy);
      if (inMemory) this.sendChunk(inMemory);
      else if (this.loading.has(key))
        waits.push(this.loading.get(key)!.then(() => this.resend(key)));
      else toLoad.push([cx, cy]);
    }

    if (toLoad.length > 0) {
      const job = this.loadOrGenerate(toLoad);
      for (const [cx, cy] of toLoad) this.loading.set(chunkKey(cx, cy), job);
      waits.push(job);
    }
    await Promise.all(waits);
  }

  private async loadOrGenerate(coords: ChunkCoord[]): Promise<void> {
    const world = this.requireWorld();
    try {
      const saved = await this.deps.store.loadChunks(world.info.worldId, coords);
      const savedKeys = new Set(saved.map((c) => chunkKey(c.cx, c.cy)));
      const chunks = [
        ...saved,
        ...coords
          .filter(([cx, cy]) => !savedKeys.has(chunkKey(cx, cy)))
          .map(([cx, cy]) => world.generator.generateChunk(cx, cy)),
      ];
      for (const chunk of chunks) {
        world.chunks.set(chunk);
        world.fluids.wakeChunk(chunk.cx, chunk.cy);
        if (this.wanted.has(chunkKey(chunk.cx, chunk.cy))) this.sendChunk(chunk);
      }
    } finally {
      for (const [cx, cy] of coords) this.loading.delete(chunkKey(cx, cy));
    }
  }

  private resend(key: number): void {
    const chunk = this.world?.chunks.get(chunkKeyX(key), chunkKeyY(key));
    if (chunk) this.sendChunk(chunk);
  }

  private sendChunk(chunk: ChunkData): void {
    const copy = cloneChunk(chunk);
    this.post({ type: 'chunk', chunk: copy }, chunkTransferables(copy));
  }

  private releaseChunks(coords: readonly ChunkCoord[]): void {
    this.requireWorld();
    for (const [cx, cy] of coords) {
      const key = chunkKey(cx, cy);
      this.wanted.delete(key);
      // Dirty chunks stay in memory until the next save writes them.
      if (!this.dirtyChunks.has(key)) this.evict(cx, cy);
    }
  }

  private digTile(x: number, y: number, toolPower: number): void {
    const world = this.requireWorld();
    const current = world.chunks.materialAt(x, y);
    if (current === UNLOADED) return;
    const def = this.deps.materials.get(current);
    const canDig =
      def !== undefined &&
      def.solid &&
      !def.indestructible &&
      toolPower >= def.hardness - this.deps.tuning.dig.gateOffset;

    if (canDig) {
      world.chunks.setMaterial(x, y, this.deps.materials.air.numId);
      this.dirtyChunks.add(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
      // An opening can let neighboring fluid in.
      world.fluids.wake(x - 1, y - 1, x + 1, y + 1);
    }
    // Always answer with the authoritative value so a rejected dig is corrected.
    this.post({
      type: 'tilesChanged',
      changes: [{ x, y, material: world.chunks.materialAt(x, y) }],
    });
  }

  private damageTiles(changes: readonly DamageChange[]): void {
    const world = this.requireWorld();
    for (const { x, y, damage } of changes) {
      const def = this.deps.materials.get(world.chunks.materialAt(x, y));
      if (!def || !def.solid || def.indestructible) continue;
      const clamped = Math.max(0, Math.min(254, Math.round(damage)));
      if (world.chunks.setDamage(x, y, clamped)) {
        this.dirtyChunks.add(chunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT));
      }
    }
  }

  /** One simulation step. Public so tests can drive it without timers. */
  tick(): void {
    const t = this.now();
    const dt = (t - this.lastTickAt) / 1000;
    this.lastTickAt = t;
    const world = this.world;
    if (this.paused || !world) return;
    world.meta.playTimeMs += dt * 1000;

    const started = performance.now();
    world.fluids.tick();
    this.publish(world.fluids);
    this.statsTickMs += performance.now() - started;
    this.statsTicks++;
    if (t - this.statsSince >= STATS_EVERY_MS) {
      this.post({
        type: 'simStats',
        tickMs: this.statsTickMs / Math.max(1, this.statsTicks),
        awakeTiles: world.fluids.awakeTiles,
      });
      this.statsSince = t;
      this.statsTicks = 0;
      this.statsTickMs = 0;
    }
  }

  /** Marks what the fluids changed for saving and sends it to the main thread. */
  private publish(fluids: FluidSim): void {
    const out = fluids.drain();
    if (out.materials.length > 0) this.post({ type: 'tilesChanged', changes: out.materials });
    if (out.changed.size > 0) {
      const patches: FluidPatch[] = [];
      const transfer: ArrayBuffer[] = [];
      for (const [key, rect] of out.changed) {
        this.dirtyChunks.add(key);
        if (!this.wanted.has(key)) continue;
        const chunk = this.world?.chunks.get(chunkKeyX(key), chunkKeyY(key));
        if (!chunk) continue;
        const patch = fluidPatch(chunk, rect.minX, rect.minY, rect.maxX, rect.maxY);
        patches.push(patch);
        transfer.push(patch.type.buffer as ArrayBuffer, patch.amount.buffer as ArrayBuffer);
      }
      if (patches.length > 0) this.post({ type: 'fluidsChanged', patches }, transfer);
    }
    if (out.events.length > 0) this.post({ type: 'simEvents', events: out.events });
  }

  private evict(cx: number, cy: number): void {
    this.world?.chunks.delete(cx, cy);
    this.world?.fluids.forgetChunk(cx, cy);
  }

  /** Writes dirty chunks, the player and world meta. Serialized: never two saves at once. */
  async save(): Promise<void> {
    if (this.saving) {
      this.saveQueued = true;
      return this.saving;
    }
    this.saving = this.writeSave().finally(() => {
      this.saving = null;
    });
    await this.saving;
    if (this.saveQueued) {
      this.saveQueued = false;
      await this.save();
    }
  }

  private async writeSave(): Promise<void> {
    const world = this.world;
    if (!world) return;
    const keys = [...this.dirtyChunks];
    const chunks = keys
      .map((k) => world.chunks.get(chunkKeyX(k), chunkKeyY(k)))
      .filter((c): c is ChunkData => c !== undefined);
    const savePlayer = this.playerDirty && this.player !== null;
    if (chunks.length === 0 && !savePlayer) return;

    this.dirtyChunks.clear();
    this.playerDirty = false;
    world.meta.lastSavedAt = this.now();
    try {
      await this.deps.store.commit(world.info.worldId, {
        meta: { ...world.meta },
        chunks,
        entities: savePlayer ? [{ id: PLAYER_ENTITY_ID, data: this.player }] : [],
      });
    } catch (err) {
      for (const k of keys) this.dirtyChunks.add(k);
      if (savePlayer) this.playerDirty = true;
      throw err;
    }
    // Evict chunks that were only kept in memory because they were dirty.
    for (const k of keys) {
      if (!this.wanted.has(k) && !this.dirtyChunks.has(k)) this.evict(chunkKeyX(k), chunkKeyY(k));
    }
    this.post({ type: 'saved', at: world.meta.lastSavedAt, chunks: chunks.length });
  }

  private async resetWorld(): Promise<void> {
    const world = this.requireWorld();
    await this.saving;
    await this.deps.store.deleteWorld(world.info.worldId);
    this.dirtyChunks.clear();
    this.wanted.clear();
    this.player = null;
    this.playerDirty = false;
    this.world = undefined;
    this.post({ type: 'worldReset' });
  }
}

function fluidPatch(chunk: ChunkData, x0: number, y0: number, x1: number, y1: number): FluidPatch {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const type = new Uint8Array(w * h);
  const amount = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const from = (y0 + y) * CHUNK_SIZE + x0;
    type.set(chunk.fluidType.subarray(from, from + w), y * w);
    amount.set(chunk.fluidAmount.subarray(from, from + w), y * w);
  }
  return { cx: chunk.cx, cy: chunk.cy, x0, y0, w, h, type, amount };
}
