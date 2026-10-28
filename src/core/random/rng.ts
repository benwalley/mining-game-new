/**
 * Seeded randomness. This is the only source of randomness allowed in game code
 * (Math.random is banned by lint) so worlds and bugs are reproducible.
 */

/** cyrb128: hashes a string into four 32-bit seeds. */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Single 32-bit seed derived from a string. */
export function seedFromString(str: string): number {
  return hashString(str)[0];
}

export type RngState = [number, number, number, number];

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Independent stream derived from this one's seed and a label. */
  fork(label: string): Rng;
  getState(): RngState;
}

/** sfc32: small, fast, good-quality 128-bit-state PRNG. */
export function createRng(seed: string | number, state?: RngState): Rng {
  const seedStr = String(seed);
  let [a, b, c, d] = state ?? hashString(seedStr);

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  // Discard early outputs so similar seeds diverge.
  if (!state) for (let i = 0; i < 12; i++) next();

  return {
    next,
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick on empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    fork: (label) => createRng(`${seedStr}/${label}`),
    getState: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}

/**
 * Stateless hash of integer coordinates to [0, 1). World generation uses this
 * so a chunk's contents don't depend on the order chunks are generated in.
 */
export function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
