import tuningData from '@/data/tuning.json';

/** All tunable gameplay numbers. Edit src/data/tuning.json, not code. */
export type Tuning = typeof tuningData;
export type InputTuning = Tuning['input'];
export type PlayerTuning = Tuning['player'];
export type DigTuning = Tuning['dig'];
export type PackTuning = Tuning['pack'];
export type PlacingTuning = Tuning['placing'];
export type FreezeTuning = Tuning['freeze'];
export type CameraTuning = Tuning['camera'];
export type FxTuning = Tuning['fx'];
export type LightTuning = Tuning['light'];
export type SwimTuning = Tuning['swim'];
export type VitalsTuning = Tuning['vitals'];
export type HeatTuning = Tuning['heat'];
export type PickTuning = Tuning['pick'];
export type TorchTuning = Tuning['torch'];
export type ChestTuning = Tuning['chest'];
export type FireTuning = Tuning['fire'];
export type BootsTuning = Tuning['boots'];
export type SuitTuning = Tuning['suit'];

export const tuning: Tuning = tuningData;
