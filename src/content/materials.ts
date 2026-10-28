import materialsData from '@/data/materials.json';
import { isColorName, palette, type ColorName } from './palette';

export type TilePattern =
  'bedrock' | 'soil' | 'grain' | 'smooth' | 'fiber' | 'block' | 'vein' | 'crystal' | 'spots';

export interface MaterialVisual {
  base: ColorName;
  dark: ColorName;
  light: ColorName;
  accent?: ColorName;
  accentLight?: ColorName;
  pattern: TilePattern;
}

export interface MaterialDef {
  /** Stable id persisted in saves. Never change or reuse. */
  numId: number;
  key: string;
  name: string;
  solid: boolean;
  indestructible: boolean;
  hardness: number;
  toughness: number;
  weight: number;
  heatLimit: number;
  conductivity: number | null;
  supportSpan: number;
  fuel: number;
  trait: string | null;
  /** Light emitted by the tile itself, 0–15. */
  light: number;
  visual: MaterialVisual | null;
}

const PATTERNS: readonly TilePattern[] = [
  'bedrock',
  'soil',
  'grain',
  'smooth',
  'fiber',
  'block',
  'vein',
  'crystal',
  'spots',
];

/** Lookup of all materials by numeric id and by key. */
export class MaterialRegistry {
  private readonly byNumId: MaterialDef[] = [];
  private readonly byKey = new Map<string, MaterialDef>();
  readonly air: MaterialDef;
  readonly bedrock: MaterialDef;

  constructor(defs: readonly MaterialDef[]) {
    for (const def of defs) {
      if (this.byNumId[def.numId]) throw new Error(`Duplicate material numId ${def.numId}`);
      if (this.byKey.has(def.key)) throw new Error(`Duplicate material key "${def.key}"`);
      this.byNumId[def.numId] = def;
      this.byKey.set(def.key, def);
    }
    this.air = this.require('air');
    this.bedrock = this.require('bedrock');
    if (this.air.numId !== 0) throw new Error('Material "air" must have numId 0');
  }

  get all(): readonly MaterialDef[] {
    return this.byNumId.filter(Boolean);
  }

  get(numId: number): MaterialDef | undefined {
    return this.byNumId[numId];
  }

  require(key: string): MaterialDef {
    const def = this.byKey.get(key);
    if (!def) throw new Error(`Unknown material "${key}"`);
    return def;
  }

  /** Numeric ids are dense, so this is a safe upper bound for lookup tables. */
  get maxNumId(): number {
    return this.byNumId.length - 1;
  }

  colorOf(numId: number, tone: 'base' | 'dark' | 'light' | 'accent' = 'base'): string {
    const visual = this.byNumId[numId]?.visual;
    if (!visual) return palette.ink;
    return palette[tone === 'accent' ? (visual.accent ?? visual.base) : visual[tone]];
  }
}

type RawMaterial = (typeof materialsData.materials)[number];

function parseVisual(raw: RawMaterial): MaterialVisual | null {
  const v = raw.visual as Record<string, string> | null;
  if (!v) return null;
  const color = (field: string): ColorName | undefined => {
    const name = v[field];
    if (name === undefined) return undefined;
    if (!isColorName(name)) throw new Error(`Material "${raw.key}": unknown color "${name}"`);
    return name;
  };
  const pattern = v.pattern as TilePattern;
  if (!PATTERNS.includes(pattern)) {
    throw new Error(`Material "${raw.key}": unknown pattern "${v.pattern}"`);
  }
  const base = color('base');
  const dark = color('dark');
  const light = color('light');
  if (!base || !dark || !light) throw new Error(`Material "${raw.key}": base/dark/light required`);
  return { base, dark, light, accent: color('accent'), accentLight: color('accentLight'), pattern };
}

/** Parses and validates the bundled material data. */
export function loadMaterials(): MaterialRegistry {
  const defs = materialsData.materials.map((raw): MaterialDef => ({
    numId: raw.numId,
    key: raw.key,
    name: raw.name,
    solid: raw.solid,
    indestructible: 'indestructible' in raw ? Boolean(raw.indestructible) : false,
    hardness: raw.hardness,
    toughness: raw.toughness,
    weight: raw.weight,
    heatLimit: raw.heatLimit,
    conductivity: raw.conductivity,
    supportSpan: raw.supportSpan,
    fuel: raw.fuel,
    trait: raw.trait,
    light: 'light' in raw ? Number(raw.light) : 0,
    visual: parseVisual(raw),
  }));
  return new MaterialRegistry(defs);
}
