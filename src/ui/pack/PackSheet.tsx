import type { GearSlotKind } from '@/content/materials';
import { gearView, packView, type PackItemView } from '../stores/gameStore';
import type { PackActions } from './packActions';

/**
 * The full pack: what's worn, then everything carried, with numbers.
 * Rearranging here sets the order of the fan, and the game stays paused while
 * it's open.
 */
export function PackSheet({ actions }: { actions: PackActions }) {
  const { items, held, weight, capacity, load } = packView.value;
  return (
    <div class="sheet interactive" role="dialog" aria-label="Pack">
      <header class="sheet-head">
        <div>
          <div class="sheet-title">Pack</div>
          <div class={`sheet-weight${load > 1 ? ' over' : ''}`}>
            {Math.round(weight)} / {capacity}
            {load > 1 && ' · overloaded'}
          </div>
        </div>
        <button class="sheet-done" onClick={() => actions.closeSheet()}>
          Done
        </button>
      </header>
      <div class="sheet-bar">
        <div
          class={`sheet-bar-fill${load > 1 ? ' over' : ''}`}
          style={{ width: `${Math.min(100, load * 100)}%` }}
        />
      </div>
      <div class="gear-row" aria-label="Worn gear">
        <GearSlot
          slot="air"
          label="Air"
          hint="Tap in the air"
          item={gearView.value.air}
          actions={actions}
        />
        <GearSlot
          slot="body"
          label="Body"
          hint="Heat suit"
          item={gearView.value.body}
          actions={actions}
        />
      </div>
      {items.length === 0 ? (
        <p class="sheet-empty">Nothing yet. Dig something.</p>
      ) : (
        <ul class="sheet-list">
          {items.map((item, i) => (
            <li key={item.numId} class={`sheet-row${held?.numId === item.numId ? ' held' : ''}`}>
              <img src={item.icon} class="tile-icon" alt="" draggable={false} />
              <span class="sheet-name">
                {item.name}
                <small>
                  {item.stats ? `${item.stats} · ` : ''}
                  {item.count} × {item.unitWeight} = {item.count * item.unitWeight}
                </small>
              </span>
              <button
                aria-label={`Move ${item.name} up`}
                disabled={i === 0}
                onClick={() => actions.moveItem(i, i - 1)}
              >
                ↑
              </button>
              <button
                aria-label={`Move ${item.name} down`}
                disabled={i === items.length - 1}
                onClick={() => actions.moveItem(i, i + 1)}
              >
                ↓
              </button>
              {item.wearable ? (
                <button class="wear" onClick={() => actions.wear(item.numId)}>
                  Wear
                </button>
              ) : (
                <button onClick={() => actions.select(item.numId)}>
                  {held?.numId === item.numId ? 'Held' : 'Hold'}
                </button>
              )}
              <button
                aria-label={`Discard one ${item.name}`}
                onClick={() => actions.discard(item.numId, 1)}
              >
                −1
              </button>
              <button
                aria-label={`Discard all ${item.name}`}
                onClick={() => actions.discard(item.numId, item.count)}
              >
                All
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One worn slot: its gear and what it does, or what goes there. Tapping takes it off. */
function GearSlot({
  slot,
  label,
  hint,
  item,
  actions,
}: {
  slot: GearSlotKind;
  label: string;
  hint: string;
  item: PackItemView | null;
  actions: PackActions;
}) {
  return (
    <button
      class={`gear-slot${item ? ' worn' : ''}`}
      disabled={!item}
      aria-label={item ? `Take off ${item.name}` : `${label}: nothing worn`}
      onClick={() => actions.takeOff(slot)}
    >
      <span class="gear-icon">
        {item && <img src={item.icon} class="tile-icon" alt="" draggable={false} />}
      </span>
      <span class="gear-text">
        <span class="gear-label">{label}</span>
        <span class="gear-name">{item ? item.name : 'Nothing'}</span>
        <small>{item ? item.stats : hint}</small>
      </span>
    </button>
  );
}
