import { EventBus } from '@/core/events/EventBus';
import { lerp } from '@/core/math/util';
import { createRng } from '@/core/random/rng';
import { CHUNK_SHIFT } from '@/core/world/constants';
import type { MaterialRegistry } from '@/content/materials';
import type { Tuning } from '@/content/tuning';
import { AudioService } from '@/feedback/AudioService';
import { FeedbackDirector } from '@/feedback/FeedbackDirector';
import { createHaptics, type Haptics } from '@/feedback/haptics';
import { Particles } from '@/fx/Particles';
import { Camera } from '@/game/camera/Camera';
import { DigSystem } from '@/game/dig/DigSystem';
import type { GameEvents } from '@/game/events';
import { Player } from '@/game/player/Player';
import { PlayerController, type MoveIntent } from '@/game/player/PlayerController';
import { ChunkMirror } from '@/game/world/ChunkMirror';
import { ChunkStreamer } from '@/game/world/ChunkStreamer';
import { KeyboardInput } from '@/input/KeyboardInput';
import { PointerGestureInput } from '@/input/PointerGestureInput';
import { PROTOCOL_VERSION, type WorldInfo } from '@/protocol/messages';
import type { SimClient } from '@/protocol/SimClient';
import { CanvasRenderer } from '@/render/canvas2d/CanvasRenderer';
import type { Renderer } from '@/render/Renderer';
import { debugGrid, debugInfo, debugVisible, toolPower } from '@/ui/stores/gameStore';
import { GameLoop } from './GameLoop';

const STEP = 1 / 60;
const STREAM_EVERY_FRAMES = 10;
const DEBUG_EVERY_MS = 200;

export interface GameDeps {
  canvas: HTMLCanvasElement;
  sim: SimClient;
  materials: MaterialRegistry;
  tuning: Tuning;
  worldId: string;
}

/** Composition root for one running world: builds every system and runs the loop. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly mirror: ChunkMirror;
  private readonly renderer: Renderer;
  private readonly streamer: ChunkStreamer;
  private readonly player: Player;
  private readonly controller: PlayerController;
  private readonly dig: DigSystem;
  private readonly camera: Camera;
  private readonly particles: Particles;
  private readonly audio = new AudioService();
  private readonly haptics: Haptics;
  private readonly pointer: PointerGestureInput;
  private readonly keyboard: KeyboardInput;
  private readonly loop: GameLoop;
  private readonly disposers: (() => void)[] = [];

  private frameCount = 0;
  private fpsFrames = 0;
  private fpsSince = performance.now();
  private fps = 0;
  private lastDebugAt = 0;
  private lastPlayerSync = 0;
  private lastSyncedX = NaN;
  private lastSyncedY = NaN;
  private lastSave = 'never';
  private inspected: string | null = null;

  /** Connects to the sim, waits for the world, and starts playing. */
  static async start(deps: GameDeps): Promise<Game> {
    const ready = deps.sim.once('ready');
    deps.sim.send({ type: 'init', protocol: PROTOCOL_VERSION, worldId: deps.worldId });
    const { world, player } = await ready;
    const game = new Game(deps, world);
    if (player) game.player.restore(player);
    else game.player.placeAt(world.spawn.x + 0.5, world.spawn.y);
    game.camera.snapTo(game.player.x, game.player.y - game.player.h / 2);
    game.streamTick();
    game.loop.start();
    return game;
  }

  private constructor(
    private readonly deps: GameDeps,
    readonly world: WorldInfo,
  ) {
    const { canvas, sim, materials, tuning } = deps;
    this.mirror = new ChunkMirror(world.dims, materials);
    this.renderer = new CanvasRenderer(
      canvas,
      this.mirror,
      materials,
      tuning.camera,
      tuning.dig.crackStages,
    );
    this.streamer = new ChunkStreamer(
      this.mirror,
      sim,
      tuning.streaming.loadMarginChunks,
      tuning.streaming.unloadMarginChunks,
    );
    this.player = new Player(tuning.player);
    this.controller = new PlayerController(tuning.player, tuning.input, this.events);
    this.dig = new DigSystem(tuning.dig, materials, this.mirror, sim, this.events);
    toolPower.value = this.dig.toolPower;
    this.camera = new Camera(tuning.camera, tuning.player, world.dims);
    this.particles = new Particles(256, createRng(`fx/${world.seed}`), tuning.fx.particleGravity);
    this.haptics = createHaptics();
    new FeedbackDirector(
      this.events,
      materials,
      this.audio,
      this.haptics,
      this.particles,
      tuning.fx,
    );

    this.pointer = new PointerGestureInput(canvas, tuning.input, {
      onGesture: () => this.audio.unlock(),
      onTap: () => {
        // Phase 0 has no context actions yet (talk, use, place).
      },
      onLongPress: (x, y) => this.inspectAt(x, y),
    });
    this.keyboard = new KeyboardInput(
      window,
      () => this.audio.unlock(),
      (code) => this.onKey(code),
    );
    this.loop = new GameLoop(
      STEP,
      (dt) => this.update(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );

    this.wireSim();
    this.wireLifecycle();
  }

  private wireSim(): void {
    const { sim } = this.deps;
    this.disposers.push(
      sim.on('chunk', ({ chunk }) => {
        this.streamer.received(chunk.cx, chunk.cy);
        this.mirror.addChunk(chunk);
      }),
      sim.on('tilesChanged', ({ changes }) => this.mirror.applyChanges(changes)),
      sim.on('saved', ({ at }) => {
        this.lastSave = new Date(at).toLocaleTimeString();
      }),
      sim.on('worldReset', () => location.reload()),
    );
  }

  private wireLifecycle(): void {
    const onResize = (): void => this.renderer.resize();
    const onHide = (): void => {
      this.loop.stop();
      this.syncPlayer(true);
      this.deps.sim.send({ type: 'setPaused', paused: true });
      this.deps.sim.send({ type: 'flush' });
      this.audio.suspend();
    };
    const onShow = (): void => {
      this.deps.sim.send({ type: 'setPaused', paused: false });
      this.audio.resume();
      this.loop.start();
    };
    const onVisibility = (): void => (document.hidden ? onHide() : onShow());
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    this.disposers.push(
      () => window.removeEventListener('resize', onResize),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('pagehide', onHide),
    );
  }

  /** Debug: change the pick's dig power (1–10). */
  setToolPower(power: number): void {
    this.dig.toolPower = Math.max(1, Math.min(10, Math.round(power)));
    toolPower.value = this.dig.toolPower;
  }

  /** Debug: delete this world's save and start fresh. */
  resetWorld(): void {
    this.loop.stop();
    this.deps.sim.send({ type: 'resetWorld' });
  }

  dispose(): void {
    this.loop.stop();
    this.pointer.dispose();
    this.keyboard.dispose();
    for (const d of this.disposers) d();
  }

  private intent(): MoveIntent {
    return this.pointer.active ? this.pointer.intent() : this.keyboard.intent();
  }

  /** The player waits, frozen, until the chunks around them have arrived. */
  private worldReadyAroundPlayer(): boolean {
    const p = this.player;
    const store = this.mirror.store;
    const cx0 = Math.max(0, Math.floor(p.x - 2)) >> CHUNK_SHIFT;
    const cx1 = Math.max(0, Math.floor(p.x + 2)) >> CHUNK_SHIFT;
    const cy0 = Math.max(0, Math.floor(p.y - 4)) >> CHUNK_SHIFT;
    const cy1 = Math.max(0, Math.floor(p.y + 2)) >> CHUNK_SHIFT;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (store.inBounds(cx << CHUNK_SHIFT, cy << CHUNK_SHIFT) && !store.has(cx, cy)) {
          return false;
        }
      }
    }
    return true;
  }

  private update(dt: number): void {
    const solid = this.mirror.isSolid;
    if (this.worldReadyAroundPlayer()) {
      const intent = this.intent();
      const contact = this.controller.sense(this.player, solid);
      this.dig.update(this.player, intent, contact, dt);
      this.controller.step(this.player, intent, contact, solid, dt, this.dig.isDigging);
    }
    this.particles.update(dt, solid);
    this.syncPlayer(false);
  }

  private syncPlayer(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastPlayerSync < this.deps.tuning.save.playerSyncIntervalMs) return;
    this.lastPlayerSync = now;
    const p = this.player;
    if (p.x === this.lastSyncedX && p.y === this.lastSyncedY) return;
    this.lastSyncedX = p.x;
    this.lastSyncedY = p.y;
    this.deps.sim.send({ type: 'playerState', player: p.snapshot() });
  }

  private streamTick(): void {
    const view = this.renderer.viewTiles;
    this.streamer.update({
      x: this.camera.x - view.w / 2,
      y: this.camera.y - view.h / 2,
      w: view.w,
      h: view.h,
    });
  }

  private render(alpha: number, frameDt: number): void {
    const p = this.player;
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    const view = this.renderer.viewTiles;
    this.camera.update(
      { x, y: y - p.h / 2, vx: p.vx, vy: p.vy, diggingDown: p.digDir === 'down' },
      frameDt,
      view.w,
      view.h,
    );
    if (++this.frameCount % STREAM_EVERY_FRAMES === 0) this.streamTick();

    const dig = this.dig.state;
    this.renderer.render({
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      player: {
        x,
        y: y + p.stepOffsetY,
        facing: p.facing,
        vx: p.vx,
        grounded: p.grounded,
        digDir: p.digDir,
        swing: Math.min(1, p.swingTime / this.deps.tuning.dig.swingInterval),
        squash: p.squashTimer / this.deps.tuning.player.landSquashTime,
        walkPhase: p.walkPhase,
        time: performance.now() / 1000,
        appearance: p.appearance,
      },
      dig,
      particles: this.particles,
      debug: { grid: debugGrid.value },
    });
    this.updateDebug();
  }

  private updateDebug(): void {
    const now = performance.now();
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince));
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
    if (!debugVisible.value || now - this.lastDebugAt < DEBUG_EVERY_MS) return;
    this.lastDebugAt = now;
    const p = this.player;
    const d = this.dig.state;
    debugInfo.value = {
      fps: this.fps,
      tileX: Math.floor(p.x),
      tileY: Math.floor(p.y - 0.01),
      depth: Math.floor(p.y) - this.world.dims.surfaceY,
      grounded: p.grounded,
      climbing: p.climbing,
      chunksLoaded: this.mirror.store.size,
      target:
        d.target && d.material
          ? `${d.material.name} (hard ${d.material.hardness}) ${d.blocked ? 'too hard' : `${Math.round(d.progress * 100)}% of ${d.digTime.toFixed(2)}s`}`
          : null,
      inspected: this.inspected,
      lastSave: this.lastSave,
      haptics: this.haptics.kind,
    };
  }

  private inspectAt(cssX: number, cssY: number): void {
    const t = this.renderer.screenToTile(cssX, cssY, this.camera.x, this.camera.y);
    const x = Math.floor(t.x);
    const y = Math.floor(t.y);
    const m = this.deps.materials.get(this.mirror.materialAt(x, y));
    this.inspected = m
      ? `${m.name} @${x},${y}: hard ${m.hardness} tough ${m.toughness} wt ${m.weight}` +
        ` heat ${m.heatLimit} span ${m.supportSpan} fuel ${m.fuel}${m.trait ? ` [${m.trait}]` : ''}`
      : `unloaded @${x},${y}`;
    this.haptics.tick();
    this.events.emit('inspect', { x, y });
  }

  private onKey(code: string): void {
    if (code === 'Backquote') debugVisible.value = !debugVisible.value;
    if (code === 'KeyG') debugGrid.value = !debugGrid.value;
    if (code === 'BracketRight') this.setToolPower(this.dig.toolPower + 1);
    if (code === 'BracketLeft') this.setToolPower(this.dig.toolPower - 1);
  }
}
