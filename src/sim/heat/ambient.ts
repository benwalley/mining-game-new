/** `[depth below the surface, degrees]`, in increasing depth. */
export type AmbientPoints = readonly (readonly number[])[];

/**
 * Ambient temperature for every world row, linear between the points and flat
 * beyond them. Rows above the surface (sky, hills) take the surface value.
 */
export function ambientRows(points: AmbientPoints, surfaceY: number, height: number): Float32Array {
  if (points.length === 0) throw new Error('Ambient heat needs at least one point');
  const rows = new Float32Array(height);
  let k = 0;
  for (let y = 0; y < height; y++) {
    const depth = Math.max(0, y - surfaceY);
    while (k < points.length - 1 && points[k + 1]![0]! <= depth) k++;
    const [d0, t0] = points[k] as [number, number];
    const next = points[k + 1] as [number, number] | undefined;
    rows[y] = next && depth > d0 ? t0 + ((next[1] - t0) * (depth - d0)) / (next[0] - d0) : t0;
  }
  return rows;
}

/** Fills a chunk's temperatures with the ambient value of each row. */
export function fillAmbient(
  temperature: Int16Array,
  rows: Float32Array,
  y0: number,
  size: number,
): void {
  for (let ly = 0; ly < size; ly++) {
    const t = Math.round(rows[Math.min(rows.length - 1, y0 + ly)]!);
    temperature.fill(t, ly * size, (ly + 1) * size);
  }
}
