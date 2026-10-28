import { hud, hurtPulse } from '../stores/gameStore';

const BUBBLES = 5;

/**
 * Health and breath. Both hide while full, so the screen stays clear until
 * something is wrong. A red vignette deepens as health drops and flashes on
 * each hit.
 */
export function Hud() {
  const { health, maxHealth, breath } = hud.value;
  const missing = 1 - health / maxHealth;
  return (
    <>
      <div class="vignette" style={{ opacity: Math.min(0.85, missing * 1.1) }} />
      {hurtPulse.value > 0 && <div key={hurtPulse.value} class="vignette flash" />}
      <div class="vitals">
        {breath < 1 && (
          <div class="breath" aria-label={`breath ${Math.round(breath * 100)}%`}>
            {Array.from({ length: BUBBLES }, (_, i) => {
              // Each bubble is a fifth of the breath; the last one shrinks as it empties.
              const fill = Math.max(0, Math.min(1, breath * BUBBLES - i));
              return (
                <span
                  key={i}
                  class="bubble"
                  style={{ transform: `scale(${0.35 + 0.65 * fill})`, opacity: fill > 0 ? 1 : 0.2 }}
                />
              );
            })}
          </div>
        )}
        {health < maxHealth && (
          <div class="health" aria-label={`health ${health} of ${maxHealth}`}>
            <div class="health-fill" style={{ width: `${(health / maxHealth) * 100}%` }} />
          </div>
        )}
      </div>
    </>
  );
}
