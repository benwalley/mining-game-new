import { toastView } from '../stores/gameStore';

/** A short message near the top of the screen that fades by itself. */
export function Toast() {
  const t = toastView.value;
  if (!t) return null;
  return (
    <div key={t.id} class="toast" role="status">
      {t.text}
    </div>
  );
}
