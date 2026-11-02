import { EventBus } from '@/core/events/EventBus';
import { lerp } from '@/core/math/util';
import { createRng } from '@/core/random/rng';
import { CHUNK_SHIFT } from '@/core/world/constants';
import type { FluidRegistry } from '@/content/fluids';
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
import { HeatSense } from '@/game/player/HeatSense';
import { Vitals } from '@/game/player/Vitals';
import { LightField } from '@/game/light/LightField';
import { Pack } from '@/game/pack/Pack';
import { PackController } from '@/game/pack/PackController';
import { ChunkMirror, fluidAmount, fluidType } from '@/game/world/ChunkMirror';
import { ChunkStreamer } from '@/game/world/ChunkStreamer';
import { KeyboardInput } from '@/input/KeyboardInput';
import { PointerGestureInput } from '@/input/PointerGestureInput';
import { PROTOCOL_VERSION, type WorldInfo, type WorldKind } from '@/protocol/messages';
import type { SimClient } from '@/protocol/SimClient';
import { CanvasRenderer } from '@/render/canvas2d/CanvasRenderer';
import { orientationFor } from '@/render/canvas2d/playerSprite';
import type { Renderer } from '@/render/Renderer';
import {
  debugGrid,
  debugHeat,
  debugInfo,
  debugLighting,
  benchReport,
  benchStatus,
  debugPour,
  debugVisible,
  hud,
  hurtPulse,
  toolPower,
} from '@/ui/stores/gameStore';
import type { PackActions } from '@/ui/pack/packActions';
import { Benchmark } from './Benchmark';
import { GameLoop } from './GameLoop';

const STEP = 1 / 60;
const STREAM_EVERY_FRAMES = 10;
const DEBUG_EVERY_MS = 200;
/** Sim events further than this many tiles outside the view are not shown or heard. */
const EVENT_MARGIN_TILES = 4;

export interface GameDeps {
  canvas: HTMLCanvasElement;
  sim: SimClient;
  materials: MaterialRegistry;
  fluids: FluidRegistry;
  tuning: Tuning;
  worldId: string;
  worldKind: WorldKind;
}

/** Composition root for one running world: builds every system and runs the loop. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly mirror: ChunkMirror;
  private readonly renderer: Renderer;
  private readonly light: LightField;
  private readonly streamer: ChunkStreamer;
  private readonly player: Player;
  private readonly controller: PlayerController;
  private readonly vitals: Vitals;
  private readonly heat: HeatSense;
  private readonly dig: DigSystem;
  private readonly pack: Pack;
  private readonly packCtl: PackController;
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
  private lastSyncedHealth = NaN;
  private lastSyncedPack = -1;
  private hidden = false;
  private lastSave = 'never';
  private inspected: string | null = null;
  private simStats = '—';
  private bench: Benchmark | null = null;

  /** Connects to the sim, waits for the world, and starts playing. */
  static async start(deps: GameDeps): Promise<Game> {
    const ready = deps.sim.once('ready');
    deps.sim.send({
      type: 'init',
      protocol: PROTOCOL_VERSION,
      worldId: deps.worldId,
      kind: deps.worldKind,
    });
    const { world, player } = await ready;
    const game = new Game(deps, world);
    if (player) {
      game.player.restore(player);
      if (player.pack) game.pack.restore(player.pack);
    } else game.player.placeAt(world.spawn.x + 0.5, world.spawn.y);
    game.camera.snapTo(game.player.x, game.player.y - game.player.h / 2);
    game.streamTick();
    game.loop.start();
    return game;
  }

  private constructor(
    private readonly deps: GameDeps,
    readonly world: WorldInfo,
  ) {
    const { canvas, sim, materials, fluids, tuning } = deps;
    this.mirror = new ChunkMirror(world.dims, materials);
    this.renderer = new CanvasRenderer(
      canvas,
      this.mirror,
      materials,
      fluids,
      tuning.camera,
      tuning.dig.crackStages,
      tuning.light,
      tuning.heat,
    );
    this.light = new LightField(this.mirror, materials, fluids);
    this.mirror.addListener(this.light);
    this.streamer = new ChunkStreamer(
      this.mirror,
      sim,
      tuning.streaming.loadMarginChunks,
      tuning.streaming.unloadMarginChunks,
    );
    this.player = new Player(tuning.player, tuning.vitals);
    this.controller = new PlayerController(tuning.player, tuning.input, this.events, {
      swim: tuning.swim,
      fluids,
    });
    this.vitals = new Vitals(tuning.vitals, fluids, this.events);
    this.heat = new HeatSense(tuning.heat, this.events, createRng(`heat/${world.seed}`));
    this.events.on('hurt', () => (hurtPulse.value += 1));
    this.pack = new Pack(tuning.pack, (id) => materials.get(id)?.weight ?? 0);
    this.dig = new DigSystem(
      tuning.dig,
      tuning.input,
      materials,
      this.mirror,
      sim,
      this.events,
      this.pack,
    );
    toolPower.value = this.dig.toolPower;
    this.camera = new Camera(tuning.camera, tuning.player, world.dims);
    this.packCtl = new PackController({
      tuning: tuning.placing,
      materials,
      mirror: this.mirror,
      sim,
      events: this.events,
      player: this.player,
      pack: this.pack,
      view: () => {
        const v = this.renderer.viewTiles;
        return {
          x0: Math.floor(this.camera.x - v.w / 2),
          y0: Math.floor(this.camera.y - v.h / 2),
          x1: Math.ceil(this.camera.x + v.w / 2),
          y1: Math.ceil(this.camera.y + v.h / 2),
        };
      },
      tileAt: (cssX, cssY) => {
        const t = this.renderer.screenToTile(cssX, cssY, this.camera.x, this.camera.y);
        return { x: Math.floor(t.x), y: Math.floor(t.y) };
      },
      tilePx: () => canvas.clientWidth / this.renderer.viewTiles.w,
      onPausedChange: () => this.syncSimPause(),
      onModeChange: (mode) => {
        // Leaving dig mode saves a half-dug tile; build mode turns touches on the world into placing.
        this.dig.flush();
        this.pointer.setBuildMode(
          mode === 'build' ? tuning.placing.holdMs : null,
          tuning.placing.holdSlopPx,
        );
      },
    });
    this.particles = new Particles(256, createRng(`fx/${world.seed}`), tuning.fx.particleGravity);
    this.haptics = createHaptics();
    new FeedbackDirector(
      this.events,
      materials,
      fluids,
      this.audio,
      this.haptics,
      this.particles,
      tuning.fx,
    );

    this.pointer = new PointerGestureInput(canvas, tuning.input, {
      onGesture: () => this.audio.unlock(),
      onTap: (x, y) => this.onTap(x, y),
      onLongPress: (x, y) => this.inspectAt(x, y),
      onHold: (x, y) => this.packCtl.holdStart(x, y),
      onHoldMove: (x, y) => this.packCtl.holdMove(x, y),
      onHoldEnd: (x, y, commit) => this.packCtl.holdEnd(x, y, commit),
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
      sim.on('placeRejected', ({ x, y, material }) => this.packCtl.refund(x, y, material)),
      sim.on('fluidsChanged', ({ patches }) => this.mirror.applyFluids(patches)),
      sim.on('heatChanged', ({ patches }) => this.mirror.applyHeat(patches)),
      sim.on('simEvents', ({ events }) => {
        for (const e of events) if (this.nearView(e.x, e.y)) this.events.emit(e.kind, e);
      }),
      sim.on('simStats', (s) => {
        this.simStats =
          `${s.tickMs.toFixed(2)} ms/tick (worst ${s.tickMsMax.toFixed(1)}) · ` +
          `${s.awakeTiles} fluid tiles awake · ` +
          `${s.heatChunks} heat chunks · ${s.chunks} chunks`;
        this.bench?.simStats(s);
      }),
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
      this.dig.flush();
      this.syncPlayer(true);
      this.hidden = true;
      this.syncSimPause();
      this.deps.sim.send({ type: 'flush' });
      this.audio.suspend();
    };
    const onShow = (): void => {
      this.hidden = false;
      this.syncSimPause();
      this.audio.resume();
      this.loop.start();
    };
    const onVisibility = (): void => (document.hidden ? onHide() : onShow());
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    // Chrome may freeze a background tab without hiding it first.
    document.addEventListener('freeze', onHide);
    this.disposers.push(
      () => document.removeEventListener('freeze', onHide),
      () => window.removeEventListener('resize', onResize),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('pagehide', onHide),
    );
  }

  /**
   * Debug: the phase 1 performance gate. Carves a room around the player,
   * floods it with water and a little lava, and reports frame timing after
   * the run. Changes the world, so it's for test saves.
   */
  runBenchmark(seconds = 20): void {
    if (this.bench) return;
    const { sim, fluids } = this.deps;
    const px = Math.floor(this.player.x);
    const floor = Math.floor(this.player.y - 0.01);
    const W = 20;
    const H = 12;
    for (let y = floor - H + 1; y <= floor; y++) {
      for (let x = px - W; x < px + W; x++) sim.send({ type: 'digTile', x, y, toolPower: 99 });
    }
    const top = floor - H + 1;
    const water = fluids.require('water').id;
    const lava = fluids.require('lava').id;
    for (let y = top; y < top + 3; y++) {
      for (let x = px - W; x < px + 6; x++) {
        sim.send({ type: 'pourFluid', x, y, fluid: water, amount: 8 });
      }
      for (let x = px + 13; x < px + 17; x++) {
        sim.send({ type: 'pourFluid', x, y, fluid: lava, amount: 8 });
      }
    }
    const dpr = window.devicePixelRatio || 1;
    const device = `${screen.width}×${screen.height} @${dpr}x · ${describeBrowser(navigator.userAgent)}`;
    const bench = new Benchmark(seconds * 1000, device);
    this.bench = bench;
    benchReport.value = null;
    this.loop.onFrame = (interval, work) => bench.frame(interval, work);
  }

  private updateBenchmark(): void {
    const bench = this.bench;
    if (!bench) return;
    const left = bench.remaining();
    if (left > 0) {
      benchStatus.value = `benchmark running… ${Math.ceil(left)} s`;
      return;
    }
    this.loop.onFrame = null;
    this.bench = null;
    benchStatus.value = null;
    benchReport.value = bench.report();
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
    if (this.packCtl.isPaused) return { x: 0, y: 0 };
    return this.pointer.active ? this.pointer.intent() : this.keyboard.intent();
  }

  /** The sim stands still while the page is hidden or the fan or full pack is open. */
  private syncSimPause(): void {
    this.deps.sim.send({ type: 'setPaused', paused: this.hidden || this.packCtl.isPaused });
  }

  /** The numbers the pack UI sends back: gestures on the button and fan, and the full pack. */
  get packActions(): PackActions {
    const g = this.packCtl.gesture;
    return {
      setButton: (center) => this.packCtl.setButton(center),
      down: (p) => g.down(p, performance.now()),
      move: (p) => g.move(p),
      up: () => g.up(),
      undo: () => this.packCtl.undo(),
      cancel: () => g.cancel(),
      tick: () => g.tick(performance.now()),
      closeSheet: () => this.packCtl.closeSheet(),
      select: (numId) => this.packCtl.select(numId),
      moveItem: (from, to) => this.packCtl.moveItem(from, to),
      discard: (numId, count) => this.packCtl.discard(numId, count),
    };
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
    this.packCtl.update();
    // The fan and the full pack freeze the world; only the ghost and the UI keep moving.
    if (this.packCtl.isPaused) {
      this.particles.update(dt, solid);
      this.syncPlayer(false);
      this.updateHud();
      return;
    }
    if (this.worldReadyAroundPlayer()) {
      const intent = this.intent();
      this.player.speedScale = this.pack.speedFactor;
      this.player.jumpScale = this.pack.jumpFactor;
      const contact = this.controller.sense(this.player, solid, this.mirror.fluidAt);
      this.dig.update(this.player, intent, contact, dt);
      this.controller.step(this.player, intent, contact, solid, dt, this.dig.isDigging);
      this.vitals.update(this.player, contact.fluid, dt);
      this.heat.update(this.player, this.mirror.temperatureAt, dt);
    }
    this.particles.update(dt, solid);
    this.syncPlayer(false);
    this.updateHud();
  }

  /** Writes HUD signals only when a shown value changes, so Preact re-renders rarely. */
  private updateHud(): void {
    const p = this.player;
    const t = this.deps.tuning.vitals;
    const health = Math.ceil(p.health);
    const breath = Math.ceil((p.breath / t.breathSeconds) * 10) / 10;
    const heat = Math.round(this.heat.level * 20) / 20;
    const cur = hud.value;
    if (cur.health === health && cur.breath === breath && cur.heat === heat) return;
    hud.value = { health, maxHealth: t.maxHealth, breath, heat };
  }

  private nearView(x: number, y: number): boolean {
    const view = this.renderer.viewTiles;
    const m = EVENT_MARGIN_TILES;
    return (
      Math.abs(x - this.camera.x) <= view.w / 2 + m && Math.abs(y - this.camera.y) <= view.h / 2 + m
    );
  }

  private onTap(cssX: number, cssY: number): void {
    // In build mode every tap on the world is for placing.
    if (this.packCtl.building) return this.packCtl.tapWorld(cssX, cssY);
    if (this.packCtl.isPaused) return;
    const t = this.renderer.screenToTile(cssX, cssY, this.camera.x, this.camera.y);
    // No other context actions yet (talk, use); debug can pour fluid.
    const pour = debugPour.value;
    if (pour === 'off') return;
    const fluid = this.deps.fluids.require(pour).id;
    // A 3×3 block, enough to start a real flood.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.deps.sim.send({
          type: 'pourFluid',
          x: Math.floor(t.x) + dx,
          y: Math.floor(t.y) + dy,
          fluid,
          amount: 8,
        });
      }
    }
  }

  private syncPlayer(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastPlayerSync < this.deps.tuning.save.playerSyncIntervalMs) return;
    this.lastPlayerSync = now;
    const p = this.player;
    const health = Math.ceil(p.health);
    const same =
      p.x === this.lastSyncedX &&
      p.y === this.lastSyncedY &&
      health === this.lastSyncedHealth &&
      this.pack.revision === this.lastSyncedPack;
    if (same && !force) return;
    this.lastSyncedX = p.x;
    this.lastSyncedY = p.y;
    this.lastSyncedHealth = health;
    this.lastSyncedPack = this.pack.revision;
    this.deps.sim.send({
      type: 'playerState',
      player: { ...p.snapshot(), pack: this.pack.snapshot() },
    });
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
    if (debugLighting.value) {
      this.light.update(
        {
          x: this.camera.x - view.w / 2,
          y: this.camera.y - view.h / 2,
          w: view.w,
          h: view.h,
        },
        { x: p.x, y: p.y - p.h / 2, level: this.deps.tuning.light.lampLevel },
      );
    }

    this.renderer.render({
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      player: {
        x: x + p.stepOffsetX,
        y: y + p.stepOffsetY,
        ...orientationFor(p.cling, p.clingSide, p.facing, p.climbDir),
        speed: p.cling === 'wall' ? p.vy : p.vx,
        onSurface: p.grounded || p.cling !== 'none',
        digDir: p.digDir,
        swing: Math.min(1, p.swingTime / this.deps.tuning.dig.swingInterval),
        squash: p.squashTimer / this.deps.tuning.player.landSquashTime,
        walkPhase: p.walkPhase,
        gripLoss: p.cling === 'none' ? 0 : p.gripTimer / this.deps.tuning.player.gripTime,
        time: performance.now() / 1000,
        appearance: p.appearance,
      },
      particles: this.particles,
      ghost: this.packCtl.ghost,
      tint: this.packCtl.tint,
      light: debugLighting.value ? this.light.view : null,
      time: performance.now() / 1000,
      debug: { grid: debugGrid.value, heat: debugHeat.value },
    });
    this.updateDebug();
  }

  private updateDebug(): void {
    this.updateBenchmark();
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
      sim: this.simStats,
      health: `${Math.ceil(p.health)} hp · breath ${p.breath.toFixed(1)}s · in fluid ${p.submersion.toFixed(2)}`,
      heat: `${this.mirror.temperatureAt(Math.floor(p.x), Math.floor(p.y - p.h / 2))}° here · feels ${Math.round(this.heat.felt)}° (${this.heat.band})`,
    };
  }

  private inspectAt(cssX: number, cssY: number): void {
    if (this.packCtl.isPaused) return;
    const t = this.renderer.screenToTile(cssX, cssY, this.camera.x, this.camera.y);
    const x = Math.floor(t.x);
    const y = Math.floor(t.y);
    const m = this.deps.materials.get(this.mirror.materialAt(x, y));
    const f = this.mirror.fluidAt(x, y);
    const fluid = f ? ` + ${this.deps.fluids.get(fluidType(f))?.name} ${fluidAmount(f)}/8` : '';
    const temp = this.mirror.temperatureAt(x, y);
    this.inspected = m
      ? `${m.name}${fluid} @${x},${y} ${temp}°: hard ${m.hardness} tough ${m.toughness} wt ${m.weight}` +
        ` heat ${m.heatLimit} (${m.heatLimit * 100}°) cond ${m.conductivity} fuel ${m.fuel}${m.trait ? ` [${m.trait}]` : ''}`
      : `unloaded @${x},${y}`;
    this.haptics.tick();
    this.events.emit('inspect', { x, y });
  }

  private onKey(code: string): void {
    if (code === 'Backquote') debugVisible.value = !debugVisible.value;
    if (code === 'KeyG') debugGrid.value = !debugGrid.value;
    if (code === 'KeyL') debugLighting.value = !debugLighting.value;
    if (code === 'KeyH') debugHeat.value = !debugHeat.value;
    if (code === 'BracketRight') this.setToolPower(this.dig.toolPower + 1);
    if (code === 'BracketLeft') this.setToolPower(this.dig.toolPower - 1);
    if (code === 'KeyP') this.cyclePour();
    if (code === 'KeyB') this.packCtl.setMode(this.packCtl.building ? 'dig' : 'build');
    if (code === 'Escape') this.packCtl.setMode('dig');
    if (code === 'KeyU') this.packCtl.undo();
  }

  /** Debug: what a tap pours: nothing, then each fluid in turn. */
  cyclePour(): void {
    const order = [
      'off',
      ...this.deps.fluids.all.filter((f) => f.key !== 'flame').map((f) => f.key),
    ];
    debugPour.value = order[(order.indexOf(debugPour.value) + 1) % order.length]!;
  }
}

/** "iPhone; CPU iPhone OS 18_1 like Mac OS X · Version/18.1 Mobile Safari", say. */
function describeBrowser(ua: string): string {
  const platform = /\(([^)]+)\)/.exec(ua)?.[1] ?? 'unknown platform';
  const browser =
    /(CriOS|FxiOS|EdgiOS|Edg|Chrome|Firefox|Version)\/[\d.]+( Mobile)?( Safari)?/.exec(ua)?.[0] ??
    'unknown browser';
  return `${platform} · ${browser}`;
}
