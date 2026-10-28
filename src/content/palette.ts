import paletteData from '@/data/palette.json';

export type ColorName = keyof typeof paletteData.colors;

export const palette: Readonly<Record<ColorName, string>> = paletteData.colors;

export function isColorName(name: string): name is ColorName {
  return Object.hasOwn(palette, name);
}
