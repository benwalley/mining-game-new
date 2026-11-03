/** The pick, drawn with its head and handle in their materials' colors. */
export function PickGlyph({
  head,
  handle,
  size = 26,
}: {
  head: string;
  handle: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} class="pick-glyph" aria-hidden="true">
      <path d="M5 19 L15 9" style={{ stroke: handle, fill: 'none' }} />
      <path d="M11 5 Q19 5 19 13 L15 9 Z" style={{ stroke: head, fill: head }} />
    </svg>
  );
}

/** Craft mode's face on the button: a hammer over a spark. */
export function CraftGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" class="mode-glyph" aria-hidden="true">
      <path d="M6 18 L13 11" />
      <path d="M11 6 L17 12 L19 10 L13 4 Z" />
      <path d="M5 8 L5 5 M3.5 6.5 L6.5 6.5" class="spark" />
    </svg>
  );
}
