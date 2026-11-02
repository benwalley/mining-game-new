import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { PackGesture } from './PackGesture';

const BUTTON = { x: 300, y: 500 };
// With the default tuning the first fan entries sit about here, along the arc up and left of the button.
const SLOT = [
  { x: 234, y: 386 },
  { x: 199, y: 415 },
  { x: 176, y: 455 },
  { x: 168, y: 500 },
];

function setup(entries = 4, modes = 3) {
  const calls: string[] = [];
  const g = new PackGesture(tuningData.placing, {
    nextMode: () => calls.push('nextMode'),
    scrub: (i) => calls.push(`scrub ${i}`),
    scrubEnd: (i) => calls.push(`scrubEnd ${i}`),
    openFan: () => calls.push('openFan'),
    closeFan: () => calls.push('closeFan'),
    openSheet: () => calls.push('openSheet'),
    pick: (i) => calls.push(`pick ${i}`),
    changed: () => {},
  });
  g.setLayout(BUTTON, entries);
  g.setModes(0, modes);
  const tap = (p: { x: number; y: number }) => {
    g.down(p, 0);
    g.up();
  };
  /** A swipe left far enough to open the fan, ending at `to`. */
  const swipeOut = (to: { x: number; y: number }) => {
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x - 20, y: BUTTON.y });
    g.move(to);
  };
  return { g, calls, tap, swipeOut };
}

describe('PackGesture', () => {
  it('goes to the next mode on a tap, and a tap with the fan open closes the fan', () => {
    const { g, calls, tap, swipeOut } = setup();
    tap(BUTTON);
    expect(calls).toEqual(['nextMode']);
    expect(g.fanOpen).toBe(false);

    swipeOut({ x: 100, y: 300 });
    g.up();
    tap(BUTTON);
    expect(calls).toEqual(['nextMode', 'openFan', 'closeFan']);
    expect(g.fanOpen).toBe(false);
  });

  it('ignores touches that miss the button while the fan is closed', () => {
    const { g } = setup();
    expect(g.down({ x: 50, y: 50 }, 0)).toBe(false);
    expect(g.phase).toBe('idle');
  });

  it('scrubs forward going up and back going down, wrapping around', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 40 }); // One step up.
    g.move({ x: BUTTON.x + 3, y: BUTTON.y - 80 }); // Two steps.
    g.up();
    expect(calls).toEqual(['scrub 0', 'scrub 1', 'scrub 2', 'scrubEnd 2']);

    const down = setup();
    down.g.down(BUTTON, 0);
    down.g.move({ x: BUTTON.x, y: BUTTON.y + 40 }); // One step back wraps to the last mode.
    down.g.up();
    expect(down.calls).toEqual(['scrub 0', 'scrub 2', 'scrubEnd 2']);
  });

  it('wraps a long scrub past the end', () => {
    const { g, calls } = setup(4, 2);
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 150 }); // Four steps on two modes is back where it began.
    g.up();
    expect(calls.at(-1)).toBe('scrubEnd 0');
  });

  it('cancels a scrub without picking anything', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 40 });
    g.cancel();
    expect(calls.at(-1)).toBe('scrubEnd null');
  });

  it('opens the fan on a swipe left and picks the entry the finger lets go over', () => {
    const { g, calls, swipeOut } = setup();
    swipeOut(SLOT[1]!);
    expect(g.fanOpen).toBe(true);
    expect(g.hover).toBe(1);
    g.up();
    expect(calls).toEqual(['openFan', 'pick 1']);
    expect(g.fanOpen).toBe(false);
  });

  it('leaves the fan open when the finger lets go away from every entry', () => {
    const { g, calls, swipeOut } = setup();
    swipeOut({ x: 270, y: 470 });
    g.up();
    expect(calls).toEqual(['openFan']);
    expect(g.fanOpen).toBe(true);
  });

  it('does nothing on a swipe to the right', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x + 30, y: BUTTON.y });
    g.up();
    expect(calls).toEqual([]);
    expect(g.fanOpen).toBe(false);
  });

  it('opens the full pack when swiping left with the fan already open', () => {
    const { g, calls, tap, swipeOut } = setup();
    swipeOut({ x: 100, y: 300 });
    g.up();
    swipeOut(SLOT[1]!);
    g.up();
    expect(calls).toEqual(['openFan', 'openSheet']);
    expect(g.fanOpen).toBe(false);
    void tap;
  });

  it('closes the fan and scrubs when swiping up with the fan open', () => {
    const { g, calls, swipeOut } = setup();
    swipeOut({ x: 100, y: 300 });
    g.up();
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 40 });
    g.up();
    expect(calls).toEqual(['openFan', 'closeFan', 'scrub 0', 'scrub 1', 'scrubEnd 1']);
    expect(g.fanOpen).toBe(false);
  });

  it('opens the full pack on a hold, and a quick press is only a tap', () => {
    const { g, calls } = setup();
    g.down(BUTTON, 0);
    g.tick(300);
    expect(g.phase).toBe('pressButton');
    g.tick(400);
    g.up();
    expect(calls).toEqual(['openSheet']);

    const quick = setup();
    quick.g.down(BUTTON, 0);
    quick.g.tick(200);
    quick.g.up();
    expect(quick.calls).toEqual(['nextMode']);
  });

  it('picks a tapped entry, and the last entry is for the pack to handle', () => {
    const { g, calls, tap, swipeOut } = setup();
    swipeOut({ x: 100, y: 300 });
    g.up();
    tap(SLOT[3]!); // The last of four entries.
    expect(calls).toEqual(['openFan', 'pick 3']);
    expect(g.fanOpen).toBe(false);
  });

  it('closes the fan on a tap outside it', () => {
    const { g, calls, tap, swipeOut } = setup();
    swipeOut({ x: 100, y: 300 });
    g.up();
    tap({ x: 40, y: 40 });
    expect(calls).toEqual(['openFan', 'closeFan']);
    expect(g.fanOpen).toBe(false);
  });

  it('scrolls when dragged along the arc, and stays within the entries', () => {
    const { g, swipeOut } = setup(10);
    swipeOut({ x: 100, y: 300 });
    g.up();
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 440 });
    g.move(SLOT[0]!);
    g.up();
    expect(g.fanOpen).toBe(true);
    expect(g.scroll).toBeGreaterThan(1.4);
    expect(g.scroll).toBeLessThan(1.8);

    g.down({ x: 234, y: 386 }, 0);
    g.move({ x: 222, y: 392 });
    g.move({ x: 100, y: 455 });
    g.up();
    expect(g.scroll).toBe(0);
  });
});
