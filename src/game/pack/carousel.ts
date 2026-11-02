/**
 * Where each mode sits on an endless vertical strip, measured in modes from the
 * center of the pack button's window. 0 is in the window, +1 is one mode below
 * it, -1 one above. Dragging up slides the strip up, so `progress` is positive
 * going forward. Modes past the halfway point wrap to the other side, which
 * makes the strip loop; with two modes the other one waits below.
 */
export function stripPositions(current: number, count: number, progress: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const x = i - current - progress;
    return x - count * Math.ceil(x / count - 0.5);
  });
}
