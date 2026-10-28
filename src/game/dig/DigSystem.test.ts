import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { createChunk, tileIndex } from '@/core/world/chunk';
import { loadMaterials } from '@/content/materials';
import { tuning } from '@/content/tuning';
import type { ToSim } from '@/protocol/messages';
import { SimClient } from '@/protocol/SimClient';
import type { GameEvents } from '../events';
import { NO_FLUID } from '../physics/fluidContact';
import { Player } from '../player/Player';
import { ChunkMirror } from '../world/ChunkMirror';
import { DigSystem } from './DigSystem';
import { MAX_DAMAGE } from './crack';

const materials = loadMaterials();

/** One chunk: air above row 10, dirt from row 10 down. */
function setup() {
  const mirror = new ChunkMirror({ width: 32, height: 32, surfaceY: 10 }, materials);
  const chunk = createChunk(0, 0);
  const dirt = materials.require('dirt').numId;
  for (let y = 10; y < 32; y++) for (let x = 0; x < 32; x++) chunk.material[tileIndex(x, y)] = dirt;
  mirror.addChunk(chunk);

  const sent: ToSim[] = [];
  const sim = new SimClient({ post: (m) => sent.push(m), onMessage: () => {} });
  const dig = new DigSystem(
    tuning.dig,
    tuning.input,
    materials,
    mirror,
    sim,
    new EventBus<GameEvents>(),
  );
  const player = new Player(tuning.player, tuning.vitals);
  player.placeAt(5.5, 10);
  const contact = {
    grounded: true,
    ceiling: false,
    wallLeft: false,
    wallRight: false,
    canClimb: false,
    fluid: NO_FLUID,
  };
  const run = (seconds: number, intent: { x: number; y: number }) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) dig.update(player, intent, contact, 1 / 60);
  };
  return { mirror, dig, run, sent, dirt };
}

describe('DigSystem', () => {
  it('leaves a half-dug tile half-dug and resumes from there', () => {
    const { mirror, dig, run, sent, dirt } = setup();
    const digTime = dig.state.digTime || 1 / tuning.dig.defaultToolPower;

    run(digTime * 0.5, { x: 0, y: 1 });
    run(0.1, { x: 0, y: 0 }); // Walk away: progress is flushed, not lost.
    const damage = mirror.damageAt(5, 10);
    expect(damage).toBeGreaterThan(MAX_DAMAGE * 0.4);
    expect(sent.some((m) => m.type === 'damageTiles')).toBe(true);

    // Coming back only needs the remaining half.
    run(digTime * 0.55, { x: 0, y: 1 });
    expect(mirror.materialAt(5, 10)).not.toBe(dirt);
    expect(mirror.damageAt(5, 10)).toBe(0);
  });
});
