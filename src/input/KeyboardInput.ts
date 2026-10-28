import type { MoveIntent } from '@/game/player/PlayerController';

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW', 'Space']);
const DOWN = new Set(['ArrowDown', 'KeyS']);

/** Desktop dev controls: arrows/WASD to move and dig, Space or Up to jump. */
export class KeyboardInput {
  private readonly held = new Set<string>();

  constructor(
    private readonly target: Window,
    private readonly onGesture: () => void,
    private readonly onKey: (code: string) => void,
  ) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  get active(): boolean {
    return this.held.size > 0;
  }

  intent(): MoveIntent {
    const x = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    const y = (this.any(DOWN) ? 1 : 0) - (this.any(UP) ? 1 : 0);
    const len = Math.hypot(x, y);
    return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private any(keys: Set<string>): boolean {
    for (const k of keys) if (this.held.has(k)) return true;
    return false;
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    this.onGesture();
    if (!e.repeat) this.onKey(e.code);
    if (LEFT.has(e.code) || RIGHT.has(e.code) || UP.has(e.code) || DOWN.has(e.code)) {
      e.preventDefault();
      this.held.add(e.code);
    }
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => this.held.clear();
}
