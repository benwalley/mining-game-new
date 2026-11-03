import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { FluidContact } from '../physics/fluidContact';
import { Player } from './Player';
import { Vitals } from './Vitals';

const fluids = loadFluids(loadMaterials());
const WATER = fluids.require('water').id;
const LAVA = fluids.require('lava').id;
const SPORES = fluids.require('spore-gas').id;
const FIREDAMP = fluids.require('firedamp').id;
const t = tuning.vitals;

function setup() {
  const events = new EventBus<GameEvents>();
  const hurts: GameEvents['hurt'][] = [];
  events.on('hurt', (e) => hurts.push(e));
  const vitals = new Vitals(t, fluids, events);
  const player = new Player(tuning.player, t);
  const run = (seconds: number, contact: FluidContact) => {
    for (let i = 0; i < seconds * 60; i++) vitals.update(player, contact, 1 / 60);
  };
  const bake = (seconds: number, felt: number) => {
    for (let i = 0; i < seconds * 60; i++) vitals.update(player, air, 1 / 60, felt);
  };
  return { player, run, bake, hurts };
}

const underwater: FluidContact = { fluid: WATER, submersion: 1, headFluid: WATER };
const air: FluidContact = { fluid: 0, submersion: 0, headFluid: 0 };

describe('Vitals', () => {
  it('lets warm air pass and hurts from heatDamageFrom, faster the hotter it is', () => {
    const warm = setup();
    warm.bake(10, t.heatDamageFrom - 5);
    expect(warm.player.health).toBe(t.maxHealth);
    expect(warm.hurts).toHaveLength(0);

    const hot = setup();
    hot.bake(1, t.heatDamageFrom + 50);
    const scorched = setup();
    scorched.bake(1, t.heatDamageFrom + 150);
    expect(hot.player.health).toBeLessThan(t.maxHealth);
    expect(scorched.player.health).toBeLessThan(hot.player.health);
    expect(hot.hurts[0]?.cause).toBe('heat');
    scorched.bake(60, t.heatDamageFrom + 150);
    expect(scorched.player.health).toBe(t.minHealth);
  });

  it('drains breath underwater, then drowns, but never kills', () => {
    const { player, run, hurts } = setup();
    run(t.breathSeconds - 1, underwater);
    expect(player.health).toBe(t.maxHealth);
    expect(hurts).toHaveLength(0);
    run(60, underwater);
    expect(player.breath).toBe(0);
    expect(player.health).toBe(t.minHealth);
    expect(hurts[0]?.cause).toBe('drowning');
  });

  it('refills breath in air and regenerates after a pause', () => {
    const { player, run } = setup();
    run(t.breathSeconds + 2, underwater);
    const hurt = player.health;
    run(t.regenDelay / 2, air);
    expect(player.breath).toBeGreaterThan(0);
    expect(player.health).toBe(hurt);
    run(t.regenDelay + 30, air);
    expect(player.health).toBe(t.maxHealth);
    expect(player.breath).toBe(t.breathSeconds);
  });

  it('burns on contact with lava', () => {
    const { player, run, hurts } = setup();
    run(0.5, { fluid: LAVA, submersion: 0.2, headFluid: 0 });
    expect(player.health).toBeLessThan(t.maxHealth);
    expect(hurts[0]).toEqual({ cause: 'fluid', fluid: LAVA });
  });

  it('hurts while breathing spore gas, without using up breath', () => {
    const { player, run, hurts } = setup();
    run(1, { fluid: SPORES, submersion: 1, headFluid: SPORES });
    expect(player.breath).toBe(t.breathSeconds);
    expect(player.health).toBeLessThan(t.maxHealth);
    expect(hurts[0]?.cause).toBe('gas');
  });

  it('lets the mole breathe firedamp safely', () => {
    const { player, run } = setup();
    run(2, { fluid: FIREDAMP, submersion: 1, headFluid: FIREDAMP });
    expect(player.health).toBe(t.maxHealth);
  });
});
