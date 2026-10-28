import { describe, expect, it } from 'vitest';
import { MAX_DAMAGE, crackStage, damageFromProgress } from './crack';

describe('crackStage', () => {
  it('shows nothing only when undamaged', () => {
    expect(crackStage(0, 3)).toBe(0);
    expect(crackStage(1, 3)).toBe(1);
  });

  it('spreads three stages across the dig', () => {
    expect(crackStage(damageFromProgress(0.3), 3)).toBe(1);
    expect(crackStage(damageFromProgress(0.5), 3)).toBe(2);
    expect(crackStage(damageFromProgress(0.9), 3)).toBe(3);
    expect(crackStage(MAX_DAMAGE - 1, 3)).toBe(3);
  });

  it('never stores a broken value', () => {
    expect(damageFromProgress(1.5)).toBe(MAX_DAMAGE - 1);
  });
});
