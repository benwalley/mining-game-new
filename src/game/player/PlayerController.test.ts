import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { loadFluids } from '@/content/fluids';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { GameEvents } from '../events';
import type { FluidFn } from '../physics/fluidContact';
import type { SolidFn } from '../physics/tileCollision';
import { Player } from './Player';
import { PlayerController, type MoveIntent } from './PlayerController';

const fluids = loadFluids(loadMaterials());

function grid(rows: string[]): SolidFn {
  return (x, y) => y >= rows.length || rows[y]?.[x] === '#';
}

function simulate(solid: SolidFn, x: number, y: number) {
  const events = new EventBus<GameEvents>();
  const jumps: unknown[] = [];
  events.on('jumped', (e) => jumps.push(e));
  const controller = new PlayerController(tuning.player, tuning.input, events, {
    swim: tuning.swim,
    fluids,
  });
  const player = new Player(tuning.player, tuning.vitals);
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

  describe('clinging', () => {
    // A 5-tall wall on the right, open floor on the left.
    const tower = grid([
      '..........',
      '.....#####',
      '.....#####',
      '.....#####',
      '.....#####',
      '.....#####',
      '##########',
    ]);

    it('walks up a wall with an up-diagonal and mantles onto the top', () => {
      const { player, run } = simulate(tower, 4.5, 6);
      run(0.3, { x: 1, y: 0 }); // Reach the wall.
      run(0.4, { x: 0.7, y: -0.7 });
      expect(player.cling).toBe('wall');
      expect(player.y).toBeLessThan(5);
      run(1.2, { x: 0.7, y: -0.7 });
      expect(player.y).toBe(1);
      expect(player.x).toBeGreaterThan(5);
    });

    it('slips for a moment after the finger lifts, then falls', () => {
      const { player, run } = simulate(tower, 4.5, 6);
      run(0.3, { x: 1, y: 0 });
      run(0.4, { x: 0.7, y: -0.7 });
      const held = player.y;
      run(0.5, { x: 0, y: 0 });
      expect(player.cling).toBe('wall');
      expect(player.gripTimer).toBeGreaterThan(0);
      expect(player.y).toBeGreaterThan(held); // Sliding down a little.
      run(1, { x: 0, y: 0 });
      expect(player.cling).toBe('none');
      expect(player.y).toBe(6);
    });

    it('regains its grip if the finger comes back in time', () => {
      const { player, run } = simulate(tower, 4.5, 6);
      run(0.3, { x: 1, y: 0 });
      run(0.4, { x: 0.7, y: -0.7 });
      run(0.6, { x: 0, y: 0 });
      run(0.1, { x: 0.7, y: -0.7 });
      expect(player.cling).toBe('wall');
      expect(player.gripTimer).toBe(0);
    });

    it('goes around corners going up: wall, ceiling, over the edge, onto the top', () => {
      const overhang = grid([
        '..........',
        '..#######.',
        '.....#####',
        '.....#####',
        '.....#####',
        '##########',
      ]);
      const { player, run } = simulate(overhang, 4.5, 5);
      run(0.3, { x: 1, y: 0 });
      run(1.2, { x: 0.7, y: -0.7 });
      expect(player.cling).toBe('wall');
      expect(player.y - player.h).toBeCloseTo(2); // Head against the overhang.
      run(0.6, { x: -0.7, y: -0.7 });
      expect(player.cling).toBe('ceiling');
      // Keep holding up-left until the mole is standing again.
      for (let i = 0; i < 90 && !(player.grounded && player.cling === 'none'); i++) {
        run(1 / 60, { x: -0.7, y: -0.7 });
      }
      expect(player.y).toBe(1); // Standing on top of the overhang.
      expect(player.x).toBeGreaterThan(1.5);
    });

    it('does not climb when pushing straight into a wall from the ground', () => {
      const { player, run } = simulate(tower, 4.5, 6);
      run(0.6, { x: 1, y: 0 });
      expect(player.cling).toBe('none');
      expect(player.y).toBe(6);
    });

    it('walks along a ceiling and drops when released', () => {
      const room = grid(['##########', '..........', '..........', '##########']);
      const { player, run } = simulate(room, 2.5, 3);
      run(0.3, { x: 0.6, y: -0.8 }); // Jump into the ceiling and grab it.
      expect(player.cling).toBe('ceiling');
      const startX = player.x;
      run(0.4, { x: 0.8, y: -0.6 });
      expect(player.y - player.h).toBeCloseTo(1);
      expect(player.x).toBeGreaterThan(startX + 1);
      run(1.6, { x: 0, y: 0 });
      expect(player.y).toBe(3);
    });
  });

  it('auto-climbs a 1-tile ledge', () => {
    const ledge = grid(['..........', '..........', '..........', '.....#####', '##########']);
    const { player, run } = simulate(ledge, 2.5, 4);
    run(1, { x: 1, y: 0 });
    expect(player.y).toBe(3);
    expect(player.x).toBeGreaterThan(5);
  });
});

describe('PlayerController in water', () => {
  // A pool four tiles deep with a dry bank on the left at the water's top row.
  const pool = ['#.......', '#.......', '##......', '##......', '##......', '##......', '########'];
  const solid = grid(pool);
  const wet: FluidFn = (x, y) => (x >= 2 && y >= 2 && y <= 5 ? (1 << 4) | 8 : 0);

  function swim(x: number, y: number) {
    const events = new EventBus<GameEvents>();
    const splashes: unknown[] = [];
    events.on('splash', (e) => splashes.push(e));
    const controller = new PlayerController(tuning.player, tuning.input, events, {
      swim: tuning.swim,
      fluids,
    });
    const player = new Player(tuning.player, tuning.vitals);
    player.placeAt(x, y);
    const run = (seconds: number, intent: MoveIntent) => {
      for (let i = 0; i < seconds * 60; i++) {
        const contact = controller.sense(player, solid, wet);
        controller.step(player, intent, contact, solid, 1 / 60, false);
      }
    };
    return { player, run, splashes };
  }

  it('splashes in and sinks slowly when idle', () => {
    const { player, run, splashes } = swim(4.5, 1);
    run(0.6, { x: 0, y: 0 });
    expect(splashes).toHaveLength(1);
    expect(player.vy).toBeLessThanOrEqual(tuning.swim.maxSinkSpeed + 0.01);
    run(3, { x: 0, y: 0 });
    expect(player.y).toBe(6);
  });

  it('swims up and hops out onto the bank', () => {
    const { player, run } = swim(4.5, 6);
    // Hold up and toward the bank until standing on dry ground.
    for (let i = 0; i < 180 && !(player.grounded && player.submersion === 0); i++) {
      run(1 / 60, { x: -0.5, y: -1 });
    }
    expect(player.y).toBe(2);
    expect(player.x).toBeLessThan(2);
  });
});
