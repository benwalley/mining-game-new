import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { PackGesture } from './PackGesture';

const BUTTON = { x: 300, y: 500 };
// With the default tuning the first slots sit about here, along the arc up and left of the button.
const SLOT = [
  { x: 300, y: 372 },
  { x: 252, y: 381 },
  { x: 211, y: 408 },
  { x: 183, y: 448 },
];

function setup(entries = 4, ghostOk = true) {
  const calls: string[] = [];
  const g = new PackGesture(tuningData.placing, {
    openFan: () => calls.push('openFan'),
    closeFan: () => calls.push('closeFan'),
    openSheet: () => calls.push('openSheet'),
    pick: (i) => calls.push(`pick ${i}`),
    ghostStart: (i) => {
      calls.push(`ghostStart ${i}`);
      return ghostOk;
    },
    ghostMove: (dx, dy) => calls.push(`ghostMove ${dx},${dy}`),
    ghostEnd: (commit) => calls.push(`ghostEnd ${commit}`),
    changed: () => {},
  });
  g.setLayout(BUTTON, entries);
  const tap = (p: { x: number; y: number }) => {
    g.down(p, 0);
    g.up(p);
  };
  return { g, calls, tap };
}

describe('PackGesture', () => {
  it('opens the fan on a tap and closes it on another', () => {
    const { g, calls, tap } = setup();
    tap(BUTTON);
    expect(g.fanOpen).toBe(true);
    tap(BUTTON);
    expect(g.fanOpen).toBe(false);
    expect(calls).toEqual(['openFan', 'closeFan']);
  });

  it('ignores touches that miss the button while the fan is closed', () => {
    const { g } = setup();
    expect(g.down({ x: 50, y: 50 }, 0)).toBe(false);
    expect(g.phase).toBe('idle');
  });

  it('picks the entry the finger lets go over after a swipe out', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.move(SLOT[0]!);
    g.move(SLOT[1]!);
    expect(g.fanOpen).toBe(true);
    expect(g.hover).toBe(1);
    g.up(SLOT[1]!);
    expect(calls).toEqual(['openFan', 'pick 1']);
    expect(g.fanOpen).toBe(false);
  });

  it('leaves the fan open when the finger lets go away from every entry', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.move({ x: 280, y: 440 });
    g.up({ x: 280, y: 440 });
    expect(calls).toEqual(['openFan']);
    expect(g.fanOpen).toBe(true);
  });

  it('opens the full pack when swiping out with the fan already open', () => {
    const { g, calls, tap } = setup();
    tap(BUTTON);
    g.down(BUTTON, 0);
    g.move(SLOT[1]!);
    g.up(SLOT[1]!);
    expect(calls).toEqual(['openFan', 'openSheet']);
    expect(g.fanOpen).toBe(false);
  });

  it('starts a ghost on a hold, follows the finger, and places on release', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.tick(100);
    expect(g.phase).toBe('pressButton');
    g.tick(300);
    expect(g.ghosting).toBe(true);
    g.move({ x: BUTTON.x - 56, y: BUTTON.y + 28 });
    g.up({ x: BUTTON.x - 56, y: BUTTON.y + 28 });
    expect(calls).toEqual(['ghostStart null', 'ghostMove -56,28', 'ghostEnd true']);
  });

  it('cancels the ghost when the finger lets go back on the button', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.tick(300);
    g.move({ x: BUTTON.x - 80, y: BUTTON.y });
    g.move(BUTTON);
    g.up(BUTTON);
    expect(calls.at(-1)).toBe('ghostEnd false');
  });

  it('holding an entry in the open fan starts its ghost', () => {
    const { g, calls, tap } = setup();
    tap(BUTTON);
    g.down(SLOT[2]!, 1000);
    g.tick(1300);
    g.up({ x: 100, y: 300 });
    expect(calls).toEqual(['openFan', 'ghostStart 2', 'ghostEnd true']);
    expect(g.fanOpen).toBe(false);
  });

  it('does nothing on a hold when there is nothing to place', () => {
    const { g, calls } = setup(4, false);
    g.down(BUTTON, 0);
    g.tick(300);
    g.up(BUTTON);
    expect(calls).toEqual(['ghostStart null']);
    expect(g.fanOpen).toBe(false);
  });

  it('opens the full pack when its entry is picked or held', () => {
    const { g, calls, tap } = setup();
    tap(BUTTON);
    tap(SLOT[3]!); // The last of four entries.
    expect(calls).toEqual(['openFan', 'pick 3']);

    const held = setup();
    held.tap(BUTTON);
    held.g.down(SLOT[3]!, 0);
    held.g.tick(300);
    expect(held.calls).toEqual(['openFan', 'openSheet']);
    expect(g.fanOpen).toBe(false);
  });

  it('closes the fan on a tap outside it', () => {
    const { g, calls, tap } = setup();
    tap(BUTTON);
    tap({ x: 40, y: 40 });
    expect(calls).toEqual(['openFan', 'closeFan']);
    expect(g.fanOpen).toBe(false);
  });

  it('scrolls when dragged along the arc, and stays within the entries', () => {
    const { g, tap } = setup(10);
    tap(BUTTON);
    g.down({ x: 211, y: 408 }, 0);
    g.move({ x: 222, y: 402 });
    g.move({ x: 300, y: 372 });
    g.up({ x: 300, y: 372 });
    expect(g.fanOpen).toBe(true);
    expect(g.scroll).toBeGreaterThan(1.5);
    expect(g.scroll).toBeLessThan(2);

    g.down({ x: 300, y: 372 }, 0);
    g.move({ x: 285, y: 373 });
    g.move({ x: 100, y: 450 });
    g.up({ x: 100, y: 450 });
    expect(g.scroll).toBe(0);
  });
});
