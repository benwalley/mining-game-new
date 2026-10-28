/** Short physical feedback. `tick` for each tile break, `pulse` for discoveries. */
export interface Haptics {
  readonly kind: 'vibration' | 'ios-switch' | 'none';
  tick(): void;
  pulse(): void;
}

class VibrationHaptics implements Haptics {
  readonly kind = 'vibration';
  /**
   * Chrome rejects vibration (and logs an error per call) until the page has
   * been tapped; a key press doesn't count. Keyboard play on desktop never
   * taps, so stay quiet until a pointer goes down.
   */
  private tapped = false;

  constructor() {
    window.addEventListener('pointerdown', () => (this.tapped = true), { once: true });
  }

  tick(): void {
    if (this.tapped) navigator.vibrate(8);
  }

  pulse(): void {
    if (this.tapped) navigator.vibrate([18, 40, 28]);
  }
}

/**
 * iOS Safari has no Vibration API. Since Safari 18, toggling an
 * `<input type="checkbox" switch>` plays the system's light haptic tick, so we
 * click a hidden one. iOS only offers that single light tick: `pulse` is two
 * ticks in a row. Untested on devices so far; Safari may only honor it during
 * a user gesture.
 */
class IosSwitchHaptics implements Haptics {
  readonly kind = 'ios-switch';
  private readonly label: HTMLLabelElement;

  constructor() {
    this.label = document.createElement('label');
    this.label.setAttribute('aria-hidden', 'true');
    Object.assign(this.label.style, {
      position: 'fixed',
      left: '-100px',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    this.label.appendChild(input);
    document.body.appendChild(this.label);
  }

  tick(): void {
    this.label.click();
  }

  pulse(): void {
    this.label.click();
    setTimeout(() => this.label.click(), 60);
  }
}

const noHaptics: Haptics = { kind: 'none', tick() {}, pulse() {} };

function isIos(): boolean {
  // iPadOS reports itself as a Mac, so also check for touch.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

export function createHaptics(): Haptics {
  if (typeof navigator.vibrate === 'function') return new VibrationHaptics();
  if (isIos()) return new IosSwitchHaptics();
  return noHaptics;
}
