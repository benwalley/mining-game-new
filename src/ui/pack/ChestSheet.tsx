import { useRef, useState } from 'preact/hooks';
import { tuning } from '@/content/tuning';
import { chestView, packView, type PackItemView } from '../stores/gameStore';
import type { PackActions } from './packActions';

type Side = 'pack' | 'chest';

/**
 * A chest open beside the pack, with the world paused. Tap a stack to move all
 * of it across; hold one to choose how many. "Store all" moves everything but
 * the held item.
 */
export function ChestSheet({ actions }: { actions: PackActions }) {
  const chest = chestView.value;
  const pack = packView.value;
  const [choosing, setChoosing] = useState<{ side: Side; key: number; n: number } | null>(null);
  if (!chest) return null;

  const move = (side: Side, key: number, n: number) =>
    actions.stow(key, n, side === 'pack' ? 'chest' : 'pack');
  const items = { pack: pack.items, chest: chest.items };
  const chosen = choosing && items[choosing.side].find((i) => i.numId === choosing.key);

  return (
    <div class="sheet chest-sheet interactive" role="dialog" aria-label="Chest">
      <header class="sheet-head">
        <div class="sheet-title">Chest</div>
        <button class="sheet-done" onClick={() => actions.closeChest()}>
          Done
        </button>
      </header>
      <div class="chest-cols">
        <Column
          title="Pack"
          weight={pack.weight}
          capacity={pack.capacity}
          items={pack.items}
          held={pack.held?.numId ?? null}
          onTap={(i) => move('pack', i.numId, i.count)}
          onHold={(i) => setChoosing({ side: 'pack', key: i.numId, n: Math.ceil(i.count / 2) })}
        />
        <Column
          title="Chest"
          weight={chest.weight}
          capacity={chest.capacity}
          items={chest.items}
          held={null}
          onTap={(i) => move('chest', i.numId, i.count)}
          onHold={(i) => setChoosing({ side: 'chest', key: i.numId, n: Math.ceil(i.count / 2) })}
        />
      </div>
      {choosing && chosen ? (
        <div class="amount">
          <img src={chosen.icon} class="tile-icon" alt="" draggable={false} />
          <span class="amount-name">{chosen.name}</span>
          {[-10, -1].map((d) => (
            <button
              key={d}
              onClick={() => setChoosing({ ...choosing, n: Math.max(1, choosing.n + d) })}
            >
              {d}
            </button>
          ))}
          <b class="amount-n">{Math.min(choosing.n, chosen.count)}</b>
          {[1, 10].map((d) => (
            <button
              key={d}
              onClick={() =>
                setChoosing({ ...choosing, n: Math.min(chosen.count, choosing.n + d) })
              }
            >
              +{d}
            </button>
          ))}
          <button
            class="amount-go"
            onClick={() => {
              move(choosing.side, choosing.key, Math.min(choosing.n, chosen.count));
              setChoosing(null);
            }}
          >
            {choosing.side === 'pack' ? 'Store' : 'Take'}
          </button>
        </div>
      ) : (
        <button class="store-all" onClick={() => actions.stowAll()}>
          {pack.held && pack.held.count > 0
            ? `Store all but ${pack.held.name.toLowerCase()}`
            : 'Store all'}
        </button>
      )}
    </div>
  );
}

function Column(props: {
  title: string;
  weight: number;
  capacity: number;
  items: PackItemView[];
  held: number | null;
  onTap(item: PackItemView): void;
  onHold(item: PackItemView): void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  return (
    <div class="chest-col">
      <div class="chest-col-head">
        {props.title}
        <small>
          {Math.round(props.weight)} / {props.capacity}
        </small>
      </div>
      {props.items.length === 0 ? (
        <p class="sheet-empty">Empty</p>
      ) : (
        <ul class="sheet-list">
          {props.items.map((item) => (
            <li key={item.numId}>
              <button
                class={`stack${item.numId === props.held ? ' held' : ''}`}
                onPointerDown={() => {
                  held.current = false;
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => {
                    held.current = true;
                    props.onHold(item);
                  }, tuning.chest.holdMs);
                }}
                onPointerUp={() => clearTimeout(timer.current)}
                onPointerLeave={() => clearTimeout(timer.current)}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (!held.current) props.onTap(item);
                }}
              >
                <img src={item.icon} class="tile-icon" alt="" draggable={false} />
                <span class="stack-name">{item.name}</span>
                <b>{item.count}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
