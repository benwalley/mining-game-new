import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { FluidContact } from '../physics/fluidContact';
import type { SolidFn } from '../physics/tileCollision';
import { Player } from '../player/Player';
import { PlayerController, type MoveIntent } from '../player/PlayerController';
import { Vitals } from '../player/Vitals';
import { Boots } from './Boots';
import { bootsStats } from './gearStats';

const materials = loadMaterials();
const fluids = loadFluids(materials);
const FLOOR = 60;
const open: SolidFn = (_x, y) => y >= FLOOR;
const air: FluidContact = { fluid: 0, submersion: 0, headFluid: 0 };
const copperCoal = bootsStats(materials.require('copper'), materials.require('coal'), tuning.boots);

/** The mole over a floor at row 60, with or without boots, stepping as the game does. */
function world(withBoots = true) {
  const events = new EventBus<GameEvents>();
  const seen: string[] = [];
  for (const k of ['bootsFired', 'bootsStopped', 'bootsReady', 'hardLanding'] as const) {
    events.on(k, (e) => seen.push(k === 'bootsStopped' && 'empty' in e && e.empty ? 'empty' : k));
  }
  const controller = new PlayerController(tuning.player, tuning.input, events, {
    swim: tuning.swim,
    fluids,
    boots: tuning.boots,
  });
  const vitals = new Vitals(tuning.vitals, fluids, events);
  const boots = new Boots(tuning.boots, events);
  const stats = withBoots ? copperCoal : null;
  const player = new Player(tuning.player, tuning.vitals);
  const airborne = () => !player.grounded && player.cling === 'none' && !player.climbing;
  const step = (intent: MoveIntent = { x: 0, y: 0 }) => {
    const contact = controller.sense(player, open);
    boots.update(player, stats, airborne(), contact.grounded, 1 / 60);
    controller.step(player, intent, contact, open, 1 / 60, false);
    vitals.update(player, air, 1 / 60);
  };
  const run = (seconds: number, intent?: MoveIntent) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) step(intent);
  };
  const untilLanded = () => {
    for (let i = 0; i < 600 && !player.grounded; i++) step();
  };
  const press = () => boots.press(player, stats, airborne());
  /** Drops the mole from `tiles` above the floor and lets it fall until it's moving. */
  const dropFrom = (tiles: number) => {
    player.placeAt(5.5, FLOOR - tiles);
    step();
  };
  return { player, boots, seen, run, step, press, untilLanded, dropFrom };
}

describe('gear stats', () => {
  it('gives thrust from the core and seconds from the casing, with heavier casings weaker', () => {
    expect(copperCoal.thrust).toBeGreaterThan(tuning.player.gravity);
    expect(copperCoal.seconds).toBeCloseTo(1.5);
    const iron = bootsStats(materials.require('iron'), materials.require('coal'), tuning.boots);
    expect(iron.seconds).toBeGreaterThan(copperCoal.seconds);
    expect(iron.thrust).toBeLessThan(copperCoal.thrust);
  });
});

describe('Boots', () => {
  it("doesn't fire from the ground; a touch there is a normal swipe", () => {
    const w = world();
    w.dropFrom(0.01);
    w.untilLanded();
    expect(w.press()).toBe(false);
    expect(w.seen).not.toContain('bootsFired');
  });

  it('fires a short burst on a tap in the air that brakes a fall hard', () => {
    const w = world();
    w.dropFrom(40);
    w.run(1); // At full fall speed.
    expect(w.player.vy).toBeCloseTo(tuning.player.maxFallSpeed);
    expect(w.press()).toBe(true);
    w.boots.release();
    w.run(tuning.boots.burstSeconds + 0.02);
    expect(w.boots.firing).toBe(false);
    expect(w.player.vy).toBeLessThan(3);
    expect(w.seen).toEqual(['bootsFired', 'bootsStopped']);
  });

  it('climbs while held, up to the rise cap, until the meter runs dry', () => {
    const w = world();
    w.dropFrom(20);
    const startY = w.player.y;
    w.press();
    w.run(1);
    expect(w.player.y).toBeLessThan(startY - 3);
    expect(w.player.vy).toBeGreaterThanOrEqual(-tuning.boots.maxRiseSpeed);
    w.run(1);
    expect(w.boots.meter).toBe(0);
    expect(w.boots.firing).toBe(false);
    expect(w.seen).toContain('empty');
    // Empty boots don't light again until they've been on the ground.
    expect(w.press()).toBe(false);
  });

  it('refills on the ground and says so', () => {
    const w = world();
    w.dropFrom(3);
    w.press();
    w.run(0.5);
    w.boots.release();
    w.untilLanded();
    w.run(tuning.boots.refillSeconds + 0.1);
    expect(w.boots.meter).toBe(1);
    expect(w.seen.at(-1)).toBe('bootsReady');
  });

  it('steers harder in the air while firing', () => {
    const plain = world(false);
    plain.dropFrom(30);
    plain.run(0.1, { x: 1, y: 0 });
    const w = world();
    w.dropFrom(30);
    w.press();
    w.run(0.1, { x: 1, y: 0 });
    expect(w.player.vx).toBeGreaterThan(plain.player.vx);
  });
});

describe('falls', () => {
  it('hurt past the safe drop, more the further they go', () => {
    const short = world(false);
    short.dropFrom(tuning.vitals.fallSafeTiles);
    short.untilLanded();
    expect(short.player.health).toBe(tuning.vitals.maxHealth);
    expect(short.seen).not.toContain('hardLanding');

    const mid = world(false);
    mid.dropFrom(10);
    mid.untilLanded();
    const far = world(false);
    far.dropFrom(14);
    far.untilLanded();
    expect(mid.seen).toContain('hardLanding');
    expect(mid.player.health).toBeLessThan(tuning.vitals.maxHealth);
    expect(far.player.health).toBeLessThan(mid.player.health);
  });

  it("don't hurt from a jump on flat ground", () => {
    const w = world(false);
    w.dropFrom(0.01);
    w.untilLanded();
    w.run(0.1, { x: 0, y: -1 });
    w.untilLanded();
    expect(w.player.health).toBe(tuning.vitals.maxHealth);
  });

  it('count only from the last slow moment, so a burst near the bottom saves a long one', () => {
    const w = world();
    w.dropFrom(30);
    while (w.player.y < FLOOR - 3) w.step();
    w.press();
    w.boots.release();
    w.untilLanded();
    expect(w.player.health).toBe(tuning.vitals.maxHealth);
    expect(w.seen).not.toContain('hardLanding');
  });
});
