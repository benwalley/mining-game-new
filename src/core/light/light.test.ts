import { describe, expect, it } from 'vitest';
import { MAX_LIGHT, computeLight, type LightSources } from './light';

/** '#' solid, '*' glowing solid (level 10), '.' air. Row 0 is sky if `sky` is set. */
function run(rows: string[], opts: { sky?: boolean; lamp?: [number, number, number] } = {}) {
  const h = rows.length;
  const w = rows[0]!.length;
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const src: LightSources = {
    isOpaque: (x, y) => at(x, y) !== '.',
    emission: (x, y) => (at(x, y) === '*' ? 10 : 0),
    isSky: (_x, y) => Boolean(opts.sky) && y === 0,
    lamps: opts.lamp ? [{ x: opts.lamp[0], y: opts.lamp[1], level: opts.lamp[2] }] : [],
  };
  const out = new Uint8Array(w * h);
  computeLight({ x0: 0, y0: 0, w, h }, src, out);
  return (x: number, y: number) => out[y * w + x]!;
}

describe('computeLight', () => {
  it('fades one level per tile from a lamp', () => {
    const light = run(['.......'], { lamp: [0, 0, 8] });
    expect([0, 1, 2, 6].map((x) => light(x, 0))).toEqual([8, 7, 6, 2]);
  });

  it('lights walls but does not pass through them', () => {
    const light = run(['..#..'], { lamp: [0, 0, 8] });
    expect(light(2, 0)).toBe(6); // The wall face is lit...
    expect(light(3, 0)).toBe(0); // ...but nothing behind it.
  });

  it('lets glowing solid tiles light their surroundings', () => {
    const light = run(['#*..']);
    expect(light(1, 0)).toBe(10);
    expect(light(3, 0)).toBe(8);
  });

  it('fills open sky and falls off down a shaft', () => {
    const light = run(['...', '#.#', '#.#', '#.#'], { sky: true });
    expect(light(1, 0)).toBe(MAX_LIGHT);
    expect(light(1, 3)).toBe(MAX_LIGHT - 3);
  });
});
