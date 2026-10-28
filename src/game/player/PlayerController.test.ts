import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { tuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { SolidFn } from '../physics/tileCollision';
import { Player } from './Player';
import { PlayerController, type MoveIntent } from './PlayerController';

function grid(rows: string[]): SolidFn {
  return (x, y) => y >= rows.length || rows[y]?.[x] === '#';
}

function simulate(solid: SolidFn, x: number, y: number) {
  const events = new EventBus<GameEvents>();
  const jumps: unknown[] = [];
  events.on('jumped', (e) => jumps.push(e));
  const controller = new PlayerController(tuning.player, tuning.input, events);
  const player = new Player(tuning.player);
  player.placeAt(x, y);
  const run = (seconds: number, intent: MoveIntent) => {
    for (let i = 0; i < seconds * 60; i++) {
      const contact = controller.sense(player, solid);
      controller.step(player, intent, contact, solid, 1 / 60, false);
    }
  };
  return { player, run, jumps };
}

const flat = grid(['..........', '..........', '..........', '..........', '##########']);

describe('PlayerController', () => {
  it('runs, then stops within a few frames of release', () => {
    const { player, run } = simulate(flat, 2.5, 4);
    run(0.5, { x: 1, y: 0 });
    expect(player.vx).toBeCloseTo(tuning.player.maxRunSpeed);
    run(0.1, { x: 0, y: 0 });
    expect(player.vx).toBe(0);
  });

  it('jumps on an upward drag and lands back on the floor', () => {
    const { player, run, jumps } = simulate(flat, 2.5, 4);
    run(0.1, { x: 0, y: -1 });
    expect(jumps).toHaveLength(1);
    expect(player.y).toBeLessThan(4);
    run(1.5, { x: 0, y: 0 });
    expect(player.y).toBe(4);
    expect(player.grounded).toBe(true);
  });

  it('falls into a shaft instead of hanging on its walls', () => {
    const shaft = grid(['#.##', '#.##', '#.##', '#.##', '#.##', '####']);
    const { player, run } = simulate(shaft, 1.5, 2);
    run(1, { x: 0, y: 0 });
    expect(player.y).toBe(5);
  });

  it('climbs a shaft and holds on when the finger lifts', () => {
    const shaft = grid(['#.##', '#.##', '#.##', '#.##', '#.##', '#.##', '####']);
    const { player, run } = simulate(shaft, 1.5, 6);
    run(0.3, { x: 0, y: -1 });
    expect(player.climbing).toBe(true);
    const held = player.y;
    run(0.5, { x: 0, y: 0 });
    expect(player.y).toBe(held);
  });

  it('mantles onto a 2-tile ledge with a jump', () => {
    const wall = grid(['..........', '..........', '.....#####', '.....#####', '##########']);
    const { player, run } = simulate(wall, 3.5, 4);
    run(0.1, { x: 0.6, y: -0.8 });
    run(0.6, { x: 1, y: 0 });
    expect(player.y).toBe(2);
    expect(player.x).toBeGreaterThan(5);
  });

  it('auto-climbs a 1-tile ledge', () => {
    const ledge = grid(['..........', '..........', '..........', '.....#####', '##########']);
    const { player, run } = simulate(ledge, 2.5, 4);
    run(1, { x: 1, y: 0 });
    expect(player.y).toBe(3);
    expect(player.x).toBeGreaterThan(5);
  });
});
