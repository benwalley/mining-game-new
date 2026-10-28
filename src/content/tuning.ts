import tuningData from '@/data/tuning.json';

/** All tunable gameplay numbers. Edit src/data/tuning.json, not code. */
export type Tuning = typeof tuningData;
export type InputTuning = Tuning['input'];
export type PlayerTuning = Tuning['player'];
export type DigTuning = Tuning['dig'];
export type CameraTuning = Tuning['camera'];
export type FxTuning = Tuning['fx'];
export type LightTuning = Tuning['light'];
export type SwimTuning = Tuning['swim'];
export type VitalsTuning = Tuning['vitals'];
export type SupportTuning = Tuning['support'];

export const tuning: Tuning = tuningData;
