import tuningData from '@/data/tuning.json';

/** All tunable gameplay numbers. Edit src/data/tuning.json, not code. */
export type Tuning = typeof tuningData;
export type InputTuning = Tuning['input'];
export type PlayerTuning = Tuning['player'];
export type DigTuning = Tuning['dig'];
export type CameraTuning = Tuning['camera'];
export type FxTuning = Tuning['fx'];

export const tuning: Tuning = tuningData;
