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
  return { player, run, hurts };
}

const underwater: FluidContact = { fluid: WATER, submersion: 1, headFluid: WATER };
const air: FluidContact = { fluid: 0, submersion: 0, headFluid: 0 };

describe('Vitals', () => {
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
});
