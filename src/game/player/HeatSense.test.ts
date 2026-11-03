import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { createRng } from '@/core/random/rng';
import { tuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import { HeatSense } from './HeatSense';
import { Player } from './Player';

function feel(degrees: number, seconds: number, raise = 0) {
  const events = new EventBus<GameEvents>();
  const heard: string[] = [];
  events.on('sweat', () => heard.push('sweat'));
  events.on('crackle', () => heard.push('crackle'));
  const sense = new HeatSense(tuning.heat, events, createRng('heat-test'));
  const player = new Player(tuning.player, tuning.vitals);
  player.placeAt(5.5, 10);
  player.heatRaise = raise;
  for (let t = 0; t < seconds * 60; t++) sense.update(player, () => degrees, 1 / 60);
  return { sense, heard };
}

describe('HeatSense', () => {
  it('feels nothing at surface temperatures', () => {
    const { sense, heard } = feel(20, 3);
    expect(sense.level).toBe(0);
    expect(sense.band).toBe('fine');
    expect(heard).toEqual([]);
  });

  it('sweats when hot, without crackling', () => {
    const { sense, heard } = feel(100, 3);
    expect(sense.band).toBe('hot');
    expect(sense.level).toBeGreaterThan(0.3);
    expect(sense.level).toBeLessThan(1);
    expect(heard).toContain('sweat');
    expect(heard).not.toContain('crackle');
  });

  it('warns later in a heat suit, by as much as the suit raises the damage start', () => {
    const { sense, heard } = feel(100, 3, 60);
    expect(sense.band).toBe('fine');
    expect(heard).toEqual([]);
    expect(feel(160, 3, 60).sense.band).toBe('hot');
  });

  it('crackles in extreme heat', () => {
    const { sense, heard } = feel(300, 3);
    expect(sense.level).toBe(1);
    expect(heard.filter((h) => h === 'crackle').length).toBeGreaterThan(3);
  });

  it('eases into a change instead of jumping', () => {
    const events = new EventBus<GameEvents>();
    const sense = new HeatSense(tuning.heat, events, createRng('heat-test'));
    const player = new Player(tuning.player, tuning.vitals);
    player.placeAt(5.5, 10);
    sense.update(player, () => 20, 1 / 60);
    sense.update(player, () => 300, 1 / 60);
    expect(sense.felt).toBeLessThan(40);
  });
});
