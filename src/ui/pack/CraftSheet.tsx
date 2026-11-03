import { useState } from 'preact/hooks';
import type { PickPart } from '@/game/craft/Pick';
import { craftView, type PickPartView } from '../stores/gameStore';
import type { PackActions } from './packActions';
import { PickGlyph } from './PickGlyph';

/**
 * Craft mode: the world is frozen behind it. The pick's card (sharpen, swap a
 * part), then the open slots: tap materials from the pack into them, and if they
 * fit something it shows up, as a silhouette until it's been made once. Recipes
 * found so far refill the slots with a tap. The sheet sits below the pack
 * button, so a tap on the button still moves on to dig mode.
 */
export function CraftSheet({ actions }: { actions: PackActions }) {
  const view = craftView.value;
  const [changing, setChanging] = useState<PickPart | null>(null);
  if (!view) return null;
  const { pick, slots, result, tried, known, materials } = view;

  return (
    <div class="sheet craft-sheet interactive" role="dialog" aria-label="Craft">
      <header class="sheet-head">
        <div class="sheet-title">Craft</div>
        <button class="sheet-done" onClick={() => actions.setMode('dig')}>
          Done
        </button>
      </header>
      <div class="craft-scroll">
        <section class="craft-card">
          <div class="pick-row">
            <div class={`pick-art${pick.dull ? ' dull' : ''}`}>
              <PickGlyph
                head={pick.head.material.color}
                handle={pick.handle.material.color}
                size={44}
              />
            </div>
            <div class="pick-stats">
              <div>
                Power <b>{pick.power}</b> · Speed <b>{pick.speed}%</b>
              </div>
              <div class="sharp-bar" aria-label={`sharpness ${Math.round(pick.sharpness * 100)}%`}>
                <div
                  class={`sharp-fill${pick.dull ? ' dull' : ''}`}
                  style={{ width: `${pick.sharpness * 100}%` }}
                />
              </div>
              <small>{pick.dull ? 'Dull: digging is slower' : 'Sharp'}</small>
            </div>
            <button
              class="sharpen"
              disabled={pick.sharpness >= 1 || pick.sharpen.item.count < pick.sharpen.count}
              onClick={() => actions.sharpen()}
            >
              Sharpen
              <small>
                {pick.sharpen.count} {pick.sharpen.item.name.toLowerCase()}
              </small>
            </button>
          </div>
          <PartRow
            label="Head"
            part={pick.head}
            open={changing === 'head'}
            onToggle={() => setChanging(changing === 'head' ? null : 'head')}
            onPick={(m) => {
              actions.upgrade('head', m);
              setChanging(null);
            }}
          />
          <PartRow
            label="Handle"
            part={pick.handle}
            open={changing === 'handle'}
            onToggle={() => setChanging(changing === 'handle' ? null : 'handle')}
            onPick={(m) => {
              actions.upgrade('handle', m);
              setChanging(null);
            }}
          />
        </section>

        <section class="craft-card">
          <div class="bench">
            {slots.map((s, i) => (
              <button
                key={i}
                class={`slot${s ? ' filled' : ''}`}
                aria-label={s ? `Take ${s.name} out` : 'Empty slot'}
                onClick={() => s && actions.craftClearSlot(i)}
              >
                {s && <img src={s.icon} class="tile-icon" alt="" draggable={false} />}
              </button>
            ))}
            <span class="bench-arrow" aria-hidden="true">
              →
            </span>
            <div class={`slot result${result ? (result.known ? ' known' : ' new') : ''}`}>
              {result && (
                <img
                  src={result.item.icon}
                  class={`tile-icon${result.known ? '' : ' silhouette'}`}
                  alt=""
                  draggable={false}
                />
              )}
            </div>
          </div>
          <div class="bench-text">
            {result ? (
              <>
                <div class="bench-name">
                  {result.known ? result.item.name : 'Something new…'} ×{result.count}
                </div>
                {result.stats.map((line) => (
                  <small key={line}>{line}</small>
                ))}
                <small>
                  Uses{' '}
                  {result.cost
                    .map((c) => `${c.need} ${c.item.name.toLowerCase()} (have ${c.item.count})`)
                    .join(', ')}
                </small>
              </>
            ) : (
              <small>
                {tried ? 'Nothing comes of that.' : 'Tap materials below to try them together.'}
              </small>
            )}
          </div>
          <button
            class="make"
            disabled={!result || !result.affordable}
            onClick={() => actions.craftMake()}
          >
            {result && !result.affordable ? 'Not enough' : 'Make'}
          </button>
          {known.length > 0 && (
            <div class="known">
              {known.map((k) => (
                <button
                  key={k.key}
                  class={`known-chip${k.affordable ? '' : ' short'}`}
                  onClick={() => actions.craftFill(k.key)}
                >
                  <img src={k.icon} class="tile-icon" alt="" draggable={false} />
                  {k.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {materials.length === 0 ? (
          <p class="sheet-empty">Nothing to craft with. Dig something.</p>
        ) : (
          <div class="mat-grid">
            {materials.map((m) => (
              <button
                key={m.numId}
                class="mat"
                aria-label={`Put ${m.name} in a slot`}
                onClick={() => actions.craftPut(m.numId)}
              >
                <img src={m.icon} class="tile-icon" alt="" draggable={false} />
                <small>{m.count}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PartRow(props: {
  label: string;
  part: PickPartView;
  open: boolean;
  onToggle(): void;
  onPick(material: number): void;
}) {
  const { label, part, open } = props;
  return (
    <div class="part">
      <div class="part-row">
        <span class="part-label">{label}</span>
        <img src={part.material.icon} class="tile-icon" alt="" draggable={false} />
        <span class="part-name">{part.material.name}</span>
        <button disabled={part.options.length === 0} onClick={props.onToggle}>
          {open ? 'Close' : 'Change'}
        </button>
      </div>
      {open && (
        <ul class="part-options">
          {part.options.map((o) => (
            <li key={o.item.numId}>
              <img src={o.item.icon} class="tile-icon" alt="" draggable={false} />
              <span class="part-name">
                {o.item.name}
                <small>
                  <Delta n={o.power} label="power" /> · <Delta n={o.speed} label="% speed" />
                </small>
              </span>
              <button disabled={!o.affordable} onClick={() => props.onPick(o.item.numId)}>
                {part.cost} {o.affordable ? '' : `(have ${o.item.count})`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Delta({ n, label }: { n: number; label: string }) {
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
  const arrow = n > 0 ? '▲' : n < 0 ? '▼' : '=';
  return (
    <span class={`delta ${cls}`}>
      {arrow} {n > 0 ? `+${n}` : n}
      {label.startsWith('%') ? '' : ' '}
      {label}
    </span>
  );
}
