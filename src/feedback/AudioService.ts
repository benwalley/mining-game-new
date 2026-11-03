import { createRng } from '@/core/random/rng';
import type { MaterialDef } from '@/content/materials';
import { soundProfile, type SoundProfile } from './materialSound';

/**
 * Synthesized sound effects (Web Audio). No audio files: every sound is built
 * from filtered noise and short tones. Real samples can replace these later
 * behind the same methods.
 */
export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly profiles = new Map<number, SoundProfile>();
  private readonly rng = createRng('audio');
  /** The rocket boots' roar while they fire. */
  private roar: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Must be called from a user gesture; browsers block audio until then. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(comp);

    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = this.rng.range(-1, 1);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  digHit(m: MaterialDef): void {
    const p = this.profile(m);
    this.noiseBurst(p.noiseHz * this.rng.range(0.92, 1.08), p.q, p.decay, 0.5);
    if (p.toneHz > 0)
      this.tone(p.toneHz * this.rng.range(0.95, 1.05), p.decay * 1.2, p.toneGain, 'sine');
    if (p.ring > 0) this.tone(p.noiseHz * 0.75, p.ring, 0.12, 'triangle');
  }

  tileBreak(m: MaterialDef): void {
    const p = this.profile(m);
    this.noiseBurst(p.noiseHz * 0.7, 0.6, 0.2, 0.7);
    this.sweep(150 - 60 * (m.hardness / 10), 50, 0.14, 0.5);
    if (p.ring > 0) this.tone(p.noiseHz * 0.9, p.ring * 1.5, 0.15, 'triangle');
  }

  /** A block set into the world: a soft thud, duller for harder material. */
  place(m: MaterialDef): void {
    const p = this.profile(m);
    this.noiseBurst(p.noiseHz * 0.5, 0.8, 0.12, 0.45);
    this.sweep(110, 60, 0.1, 0.4);
  }

  /** Time stops: a falling sweep over a deep thump, a rush of air and a cold shimmer. */
  freeze(): void {
    this.sweep(900, 110, 0.45, 0.3);
    this.tone(52, 0.55, 0.35, 'sine');
    this.noiseBurst(2400, 0.7, 0.3, 0.22);
    this.noiseBurst(6500, 1.4, 0.6, 0.07, 0.06);
  }

  /** Time resumes: the same thing rising, shorter. */
  thaw(): void {
    this.sweep(140, 780, 0.28, 0.24);
    this.noiseBurst(1800, 0.8, 0.2, 0.16);
  }

  /** The pack can't take more. */
  packFull(): void {
    this.tone(95, 0.18, 0.3, 'sawtooth');
    this.tone(70, 0.22, 0.3, 'square');
  }

  blocked(): void {
    this.tone(1900, 0.08, 0.18, 'triangle');
    this.tone(2600, 0.05, 0.1, 'square');
  }

  land(speed: number): void {
    this.sweep(110, 45, 0.1, Math.min(0.5, speed / 40));
  }

  /** Hitting a fluid's surface. Thick fluids sound duller. */
  splash(speed: number, thick: boolean): void {
    const gain = Math.min(0.6, 0.15 + speed / 40);
    this.noiseBurst(thick ? 380 : 900, 0.8, 0.28, gain);
    this.noiseBurst(thick ? 900 : 2600, 1.2, 0.12, gain * 0.6);
  }

  /** Lava quenched by water. */
  hiss(): void {
    this.noiseBurst(this.rng.range(4500, 6000), 0.7, 0.35, 0.3);
  }

  /** Firedamp catching: a rushing whoomph. */
  whoomph(): void {
    this.noiseBurst(600, 0.5, 0.5, 0.8);
    this.sweep(160, 45, 0.45, 0.5);
  }

  /** Gas escaping from a pocket you just opened. */
  vent(): void {
    this.noiseBurst(this.rng.range(3000, 4000), 0.9, 0.45, 0.35);
  }

  /** Breathing spores. */
  cough(): void {
    this.noiseBurst(this.rng.range(700, 900), 1.5, 0.12, 0.45);
    this.sweep(220, 140, 0.1, 0.25);
  }

  /** Air crackling in extreme heat: a few tiny dry pops. */
  crackle(strength: number): void {
    const pops = 1 + this.rng.int(0, 3);
    for (let n = 0; n < pops; n++) {
      this.noiseBurst(
        this.rng.range(2500, 5000),
        3,
        0.02,
        0.12 + 0.18 * strength,
        n * this.rng.range(0.03, 0.09),
      );
    }
  }

  /** Something made: two bright hammer clinks. A new find adds a rising three-note chime. */
  crafted(first: boolean): void {
    this.tone(1250, 0.18, 0.22, 'triangle');
    this.noiseBurst(3200, 2, 0.06, 0.25);
    this.tone(1660, 0.22, 0.18, 'triangle', 0.11);
    this.noiseBurst(3600, 2, 0.05, 0.2, 0.11);
    if (!first) return;
    [660, 880, 1320].forEach((hz, i) => this.tone(hz, 0.5, 0.16, 'sine', 0.26 + i * 0.09));
  }

  /** Whetstone on the pick: two rasping strokes. */
  sharpened(): void {
    this.noiseBurst(5200, 1.2, 0.22, 0.32);
    this.noiseBurst(6200, 1.2, 0.26, 0.28, 0.24);
    this.tone(2100, 0.3, 0.08, 'sine', 0.5);
  }

  /** A new part fitted: a heavy clank and a ring. */
  upgraded(): void {
    this.noiseBurst(900, 1, 0.1, 0.45);
    this.tone(520, 0.4, 0.2, 'triangle');
    this.tone(1040, 0.5, 0.1, 'sine', 0.05);
  }

  /** The lid creaks up. */
  chestOpen(): void {
    this.sweep(180, 320, 0.22, 0.18);
    this.noiseBurst(700, 3, 0.18, 0.18);
  }

  /** The lid drops shut. */
  chestClose(): void {
    this.sweep(140, 60, 0.12, 0.4);
    this.noiseBurst(500, 1, 0.08, 0.35);
  }

  /** Things set down in a chest or taken out. */
  stow(): void {
    this.noiseBurst(1100, 1.2, 0.08, 0.3);
    this.sweep(260, 160, 0.07, 0.2);
  }

  /** A torch catching as it's set on the wall. */
  torchLit(): void {
    this.noiseBurst(1500, 0.6, 0.3, 0.3);
    this.sweep(300, 700, 0.18, 0.12);
  }

  /** A torch burning out: a soft fizzle. */
  torchOut(): void {
    this.noiseBurst(this.rng.range(3500, 4500), 0.8, 0.4, 0.18);
  }

  /** Something catching fire: a soft rush and a few pops. */
  catchFire(): void {
    this.noiseBurst(500, 0.6, 0.6, 0.35);
    this.crackle(0.6);
  }

  /** A burnt tile giving way: a dry crumble. */
  burnOut(): void {
    this.noiseBurst(800, 1, 0.25, 0.3);
    this.crackle(0.8);
  }

  /** Metal slumping into a melt: a low glug and a sizzle. */
  melt(): void {
    this.sweep(180, 70, 0.35, 0.35);
    this.noiseBurst(5000, 0.8, 0.3, 0.2, 0.05);
  }

  /** Molten metal setting hard: a hiss and a ring. */
  setHard(): void {
    this.noiseBurst(5500, 0.7, 0.25, 0.2);
    this.tone(1400, 0.35, 0.08, 'sine', 0.08);
  }

  /** A torch lifted off the wall; a spent one fizzles out in the hand. */
  torchTaken(spent: boolean): void {
    this.sweep(500, 260, 0.12, 0.18);
    if (spent) this.torchOut();
  }

  /** The boots lighting: a sharp pop and a rising rush. */
  bootsIgnite(): void {
    this.noiseBurst(1800, 0.7, 0.12, 0.45);
    this.sweep(90, 220, 0.15, 0.35);
  }

  /** A low, rough roar that holds while the boots fire. */
  roarStart(): void {
    const r = this.ready();
    if (!r || !this.noise || this.roar) return;
    const src = r.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = r.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 2;
    const gain = r.ctx.createGain();
    const t = r.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    src.connect(filter).connect(gain).connect(r.out);
    src.start();
    this.roar = { src, gain };
  }

  roarStop(): void {
    const roar = this.roar;
    this.roar = null;
    if (!roar || !this.ctx) return;
    const t = this.ctx.currentTime;
    roar.gain.gain.cancelScheduledValues(t);
    roar.gain.gain.setValueAtTime(roar.gain.gain.value, t);
    roar.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    roar.src.stop(t + 0.15);
  }

  /** Out of thrust: a few dry coughs from the nozzles. */
  bootsSputter(): void {
    for (let n = 0; n < 3; n++) this.noiseBurst(600, 2, 0.05, 0.3, n * 0.07);
  }

  /** The meter is full again: a quick bright double click. */
  bootsReady(): void {
    this.tone(1400, 0.04, 0.12, 'square');
    this.tone(2100, 0.05, 0.1, 'square', 0.05);
  }

  /** Gear going on: a solid clank and a buckle. */
  gearOn(): void {
    this.noiseBurst(1200, 3, 0.1, 0.35);
    this.tone(520, 0.08, 0.18, 'triangle', 0.06);
  }

  /** A fall that hurt: a deep, heavy thump, heavier the harder it was. */
  heavyLanding(damage: number): void {
    const gain = Math.min(0.9, 0.4 + damage / 60);
    this.sweep(140, 35, 0.3, gain);
    this.noiseBurst(220, 0.8, 0.25, gain * 0.8);
  }

  hurt(): void {
    this.sweep(260, 110, 0.18, 0.35);
    this.noiseBurst(420, 1, 0.08, 0.3);
  }

  private profile(m: MaterialDef): SoundProfile {
    let p = this.profiles.get(m.numId);
    if (!p) {
      p = soundProfile(m);
      this.profiles.set(m.numId, p);
    }
    return p;
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.master };
  }

  private envelope(ctx: AudioContext, peak: number, decay: number, delay = 0): GainNode {
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return g;
  }

  private noiseBurst(hz: number, q: number, decay: number, gain: number, delay = 0): void {
    const r = this.ready();
    if (!r || !this.noise) return;
    const src = r.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = r.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = q;
    const env = this.envelope(r.ctx, gain, decay, delay);
    src.connect(filter).connect(env).connect(r.out);
    const offset = this.rng.range(0, 0.3);
    src.start(r.ctx.currentTime + delay, offset, decay + 0.02);
  }

  private tone(hz: number, decay: number, gain: number, type: OscillatorType, delay = 0): void {
    const r = this.ready();
    if (!r) return;
    const osc = r.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const env = this.envelope(r.ctx, gain, decay, delay);
    osc.connect(env).connect(r.out);
    const t = r.ctx.currentTime + delay;
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  private sweep(fromHz: number, toHz: number, decay: number, gain: number): void {
    const r = this.ready();
    if (!r) return;
    const osc = r.ctx.createOscillator();
    osc.type = 'sine';
    const t = r.ctx.currentTime;
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(toHz, t + decay);
    const env = this.envelope(r.ctx, gain, decay);
    osc.connect(env).connect(r.out);
    osc.start();
    osc.stop(t + decay + 0.02);
  }
}
