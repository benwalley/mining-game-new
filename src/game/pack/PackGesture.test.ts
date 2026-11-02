import { describe, expect, it } from 'vitest';
import tuningData from '@/data/tuning.json';
import { PackGesture } from './PackGesture';

const BUTTON = { x: 300, y: 500 };
// With the default tuning the first fan entries sit about here, along the arc up and left of the button.
const SLOT = [
  { x: 288, y: 362 },
  { x: 242, y: 375 },
  { x: 202, y: 402 },
  { x: 175, y: 442 },
];

function setup(entries = 4, modes = 3) {
  const calls: string[] = [];
  const moves: number[] = [];
  const g = new PackGesture(tuningData.placing, {
    nextMode: () => calls.push('nextMode'),
    scrub: (i) => calls.push(`scrub ${i}`),
    scrubMove: (p) => moves.push(Math.round(p * 100) / 100),
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
  return { g, calls, moves, tap, swipeOut };
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

  it('reports how far the contents have slid, fractionally, so they can follow the finger', () => {
    const { g, moves } = setup();
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 25 });
    g.move({ x: BUTTON.x, y: BUTTON.y - 75 });
    g.move({ x: BUTTON.x, y: BUTTON.y + 25 });
    expect(moves).toEqual([0.5, 1.5, -0.5]);
  });

  it('wraps a long scrub past the end', () => {
    const { g, calls } = setup(4, 2);
    g.down(BUTTON, 0);
    g.move({ x: BUTTON.x, y: BUTTON.y - 200 }); // Four steps on two modes is back where it began.
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

  it('scrolls when dragged along the arc, settles on an entry, and stays within the entries', () => {
    const { g, swipeOut } = setup(10);
    swipeOut({ x: 100, y: 300 });
    g.up();
    // A slow drag: no flick, so it just settles on the nearest entry.
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 415 }, 0);
    g.move(SLOT[0]!, 1000);
    g.up();
    expect(g.fanOpen).toBe(true);
    expect(g.scroll).toBeGreaterThan(2.2);
    expect(g.scroll).toBeLessThan(2.5);
    for (let t = 0; t <= 1000; t += 16) g.animate(1000 + t);
    expect(g.scroll).toBe(2);

    g.down({ x: 288, y: 362 }, 3000);
    g.move({ x: 270, y: 368 }, 3000);
    g.move({ x: 100, y: 455 }, 4000);
    g.up();
    for (let t = 0; t <= 1000; t += 16) g.animate(5000 + t);
    expect(g.scroll).toBe(0);
  });

  it('coasts after a flick, slows down and lands exactly on an entry', () => {
    const { g, swipeOut } = setup(20);
    swipeOut({ x: 100, y: 300 });
    g.up();
    // Two slots' worth of arc in 50 ms is a fast flick toward later entries.
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 415 }, 10);
    g.move(SLOT[0]!, 60);
    g.up();
    const released = g.scroll;
    let t = 60;
    g.animate(t);
    for (let i = 0; i < 20; i++) g.animate((t += 16));
    expect(g.scroll).toBeGreaterThan(released + 1);
    for (let i = 0; i < 200; i++) g.animate((t += 16));
    expect(Number.isInteger(g.scroll)).toBe(true);
    expect(g.scroll).toBeGreaterThan(released + 2);
  });

  it('stops a coasting fan when a finger lands on it', () => {
    const { g, swipeOut } = setup(20);
    swipeOut({ x: 100, y: 300 });
    g.up();
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 415 }, 10);
    g.move(SLOT[0]!, 60);
    g.up();
    g.animate(60);
    g.animate(76);
    const caught = g.scroll;
    g.down({ x: 230, y: 380 }, 80);
    expect(g.animate(200)).toBe(false);
    expect(g.scroll).toBe(caught);
  });

  it("doesn't flick when the finger stopped before lifting", () => {
    const { g, swipeOut } = setup(20);
    swipeOut({ x: 100, y: 300 });
    g.up();
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 415 }, 10);
    g.move(SLOT[0]!, 60);
    g.up(400);
    const released = g.scroll;
    for (let t = 400; t < 2000; t += 16) g.animate(t);
    expect(g.scroll).toBe(Math.round(released));
  });

  it('stops dead at the end instead of flying past it', () => {
    const { g, swipeOut } = setup(6);
    swipeOut({ x: 100, y: 300 });
    g.up();
    g.down(SLOT[2]!, 0);
    g.move({ x: 190, y: 415 }, 10);
    g.move(SLOT[0]!, 30);
    g.up();
    for (let t = 30; t < 3000; t += 16) g.animate(t);
    expect(g.scroll).toBe(1); // Six entries, five on the arc.
  });
});
