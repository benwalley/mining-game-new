import { packView } from '../stores/gameStore';
import type { PackActions } from './packActions';

/**
 * The full pack: everything carried, with numbers. Rearranging here sets the
 * order of the fan, and the game stays paused while it's open.
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
              <button onClick={() => actions.select(item.numId)}>
                {held?.numId === item.numId ? 'Held' : 'Hold'}
              </button>
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
