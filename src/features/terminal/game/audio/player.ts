import { createSequencer, flatten, type Note, type Sequencer, type Track, type Wave } from './score.ts';

/**
 * Plays the scores on a Web Audio context: a looping tune, one-shot jingles over it, and short effects. Thin on
 * purpose: what to play is decided elsewhere (director.ts, the engine's cues), the notes come from score.ts.
 *
 * It never throws. No AudioContext (an old browser, a test), a context that will not start, a `resume()` that is
 * refused: the game goes on in silence.
 *
 * The context and the timer are handed in, so the tests run it on a fake context and turn the clock by hand.
 */

/** What the player needs of an AudioParam, an AudioNode and an AudioContext. The real ones fit. */
export type ParamLike = {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
};
export type NodeLike = { connect(target: unknown): unknown; disconnect?(): unknown };
export type SourceLike = NodeLike & { start(time?: number): void; stop(time?: number): void };
export type OscillatorLike = SourceLike & { type: string; frequency: ParamLike; setPeriodicWave?(wave: unknown): void };
export type GainLike = NodeLike & { gain: ParamLike };
export type BufferLike = { getChannelData(channel: number): Float32Array };
export type BufferSourceLike = SourceLike & { buffer: unknown; loop: boolean; playbackRate: ParamLike };
export type AudioLike = {
  readonly currentTime: number;
  readonly state: string;
  readonly sampleRate: number;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBuffer?(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource?(): BufferSourceLike;
  createPeriodicWave?(real: Float32Array, imag: Float32Array): unknown;
  resume(): Promise<unknown>;
  suspend(): Promise<unknown>;
  close(): Promise<unknown>;
};

export type Tone = { wave: Wave; at?: number; from: number; to?: number; duration: number; volume: number };
/** `hush`: the tune pauses for so many seconds (a cry: its length), and carries on from where it was after it. */
export type Effect = { tones: Tone[]; gap?: number; hush?: number };

export type Timer = { set(tick: () => void, ms: number): unknown; clear(id: unknown): void };

export type SoundOptions = {
  /** Makes the context, or returns null when the browser has none. May throw: that counts as none. */
  context: () => AudioLike | null;
  tracks: Record<string, Track>;
  effects: Record<string, Effect | undefined>;
  /** The master volume, 0 to 1. */
  volume?: number;
  muted?: boolean;
  timer?: Timer;
};

export type Sound = {
  /** Call on entering the game and from a key or pointer press: makes the context, or wakes a sleeping one. */
  unlock(): void;
  /** The tune to play from now on (a track name), or null for none. The same name again changes nothing. */
  music(id: string | null): void;
  /** A track played once over the music, which steps back for as long as it lasts. */
  jingle(id: string): void;
  effect(id: string): void;
  setMuted(muted: boolean): void;
  /** The master volume, 0 to 1. It is kept while the sound is off and applies again when it comes back. */
  setVolume(volume: number): void;
  /** The tab is hidden: everything freezes. `resume` carries on where it was. */
  pause(): void;
  resume(): void;
  /** Stops everything and gives the context back. After this the player stays silent. */
  close(): void;
  /** The tune that is wanted now (it may be silent: muted, or no context). */
  readonly track: string | null;
  readonly muted: boolean;
};

/** How far ahead notes are handed to the context, and how often the player looks, in seconds and ms. */
export const LOOKAHEAD = 0.4;
export const TICK_MS = 100;
/** How long a tune takes to fade when another one starts, and the pause before the new one. */
export const FADE = 0.12;
const LEAD_IN = 0.06;
const MASTER = 0.25;

/** The kick, the snare and the hi-hat: how bright the noise is and how long it rings at most. */
const DRUMS = { k: { rate: 0.1, ring: 0.12 }, s: { rate: 0.45, ring: 0.1 }, h: { rate: 1, ring: 0.035 } } as const;

const defaultTimer: Timer = {
  set: (tick, ms) => setInterval(tick, ms),
  clear: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

/** A note handed to the context: when it starts, and what it is, so a pause can hand it again later. */
type Scheduled = { node: SourceLike; end: number; item: Note; at: number };
type Playing = { id: string; sequencer: Sequencer; startAt: number; gain: GainLike; sources: Scheduled[] };

export function createSound(options: SoundOptions): Sound {
  const timer = options.timer ?? defaultTimer;
  let volume = options.volume ?? MASTER;
  let ctx: AudioLike | null = null;
  let master: GainLike | null = null;
  let musicBus: GainLike | null = null;
  let effectBus: GainLike | null = null;
  let noise: unknown = null;
  let thin: unknown = null;
  let muted = options.muted ?? false;
  let paused = false;
  let closed = false;
  let wanted: string | null = null;
  let playing: Playing | null = null;
  let ticking: unknown = null;
  /** The tune is paused until then (context time): a cry is sounding. */
  let heldUntil = 0;
  const lastPlayed = new Map<string, number>();

  /** Runs something that touches the context; a failure there must never reach the game. */
  const safely = (work: () => void) => {
    try {
      work();
    } catch {
      // Sound is a nicety: carry on without it.
    }
  };
  const quietly = (promise: Promise<unknown> | undefined) => {
    promise?.catch?.(() => {});
  };

  function build(): boolean {
    if (ctx) return true;
    if (closed) return false;
    let made: AudioLike | null | undefined;
    try {
      made = options.context();
      if (!made) return false;
      const out = made.createGain();
      out.gain.value = muted ? 0 : volume;
      out.connect(made.destination);
      const music = made.createGain();
      music.connect(out);
      const effects = made.createGain();
      effects.connect(out);
      ctx = made;
      master = out;
      musicBus = music;
      effectBus = effects;
      return true;
    } catch {
      // A half-built graph is useless, and each later try would leave another context open.
      ctx = null;
      if (made) safely(() => quietly(made!.close?.()));
      return false;
    }
  }

  /** White noise, made once: the same every time, so nothing here depends on chance. */
  function noiseBuffer(context: AudioLike): unknown {
    if (noise || !context.createBuffer) return noise;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 0x2f6e2b1;
    for (let i = 0; i < samples.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      samples[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
    noise = buffer;
    return noise;
  }

  /** A pulse wave that is high for a quarter of the time: the thinner of the Game Boy's two pulse sounds. */
  function thinWave(context: AudioLike): unknown {
    if (thin || !context.createPeriodicWave) return thin;
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) {
      real[n] = Math.sin(2 * Math.PI * n * 0.25) / (Math.PI * n);
      imag[n] = (1 - Math.cos(2 * Math.PI * n * 0.25)) / (Math.PI * n);
    }
    thin = context.createPeriodicWave(real, imag);
    return thin;
  }

  /** One sound on the context: a tone that may slide, or a burst of noise. Returns what was started. */
  function sound(wave: Wave, from: number, to: number | undefined, at: number, duration: number, level: number, bus: GainLike, hold: boolean): SourceLike | null {
    const context = ctx!;
    const gain = context.createGain();
    const end = at + duration;
    gain.gain.setValueAtTime(level, at);
    // A held note keeps its level and lets go at the end; a struck one dies away.
    if (hold) gain.gain.setValueAtTime(level, at + duration * 0.75);
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(bus);

    if (wave === 'noise') {
      const buffer = noiseBuffer(context);
      if (!buffer || !context.createBufferSource) return null;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.setValueAtTime(from, at);
      if (to !== undefined) source.playbackRate.linearRampToValueAtTime(to, end);
      source.connect(gain);
      source.start(at);
      source.stop(end + 0.02);
      return source;
    }

    const oscillator = context.createOscillator();
    const custom = wave === 'thin' ? thinWave(context) : null;
    if (custom && oscillator.setPeriodicWave) oscillator.setPeriodicWave(custom);
    else oscillator.type = wave === 'triangle' ? 'triangle' : 'square';
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), end);
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(end + 0.02);
    return oscillator;
  }

  /** A note of a score, `at` seconds on the context's clock. */
  function note(item: Note, at: number, bus: GainLike, from = at): Scheduled | null {
    const drum = item.drum ? DRUMS[item.drum] : null;
    const whole = drum ? Math.min(item.duration, drum.ring) : item.duration * 0.92;
    // `from`: a note carried on after a pause sounds only for what was left of it.
    const duration = whole - (from - at);
    if (duration <= 0) return null;
    const node = sound(item.wave, drum ? drum.rate : item.frequency, undefined, from, duration, item.volume, bus, !drum && item.wave !== 'pulse');
    return node ? { node, end: from + duration + 0.05, item, at } : null;
  }

  /**
   * Pauses the tune for `length` seconds from now, and carries it on from where it was: what sounds is cut off and
   * sounds again (what was left of it) after the pause, what was handed on for later comes that much later, and so
   * does the rest of the tune. A tune that starts during the pause waits for its end.
   */
  function hush(length: number) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const from = Math.max(now, heldUntil);
    const until = Math.max(heldUntil, now + length);
    const shift = until - from;
    if (shift <= 0) return;
    heldUntil = until;
    const track = playing;
    if (!track) return;
    const handed = track.sources;
    track.sources = [];
    track.startAt += shift;
    safely(() => {
      for (const source of handed) {
        if (source.end <= now) continue;
        source.node.stop(now);
        // Its place in the tune moves on by the pause; a note cut off in the middle sounds for what was left of it.
        const again = note(source.item, source.at + shift, track.gain, Math.max(source.at + shift, until));
        if (again) track.sources.push(again);
      }
    });
  }

  function silence(track: Playing, fade: number) {
    if (!ctx) return;
    const now = ctx.currentTime;
    safely(() => {
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(track.gain.gain.value, now);
      track.gain.gain.linearRampToValueAtTime(0, now + fade);
    });
    for (const { node } of track.sources) safely(() => node.stop(now + fade + 0.01));
    track.sources = [];
  }

  /** Hands the context the notes of the tune that start within the lookahead. */
  function pump() {
    if (!ctx || !playing || paused || muted) return;
    const now = ctx.currentTime;
    const track = playing;
    track.sources = track.sources.filter((source) => source.end > now);
    safely(() => {
      for (const item of track.sequencer.take(now - track.startAt + LOOKAHEAD)) {
        const started = note(item, track.startAt + item.time, track.gain);
        if (started) track.sources.push(started);
      }
    });
  }

  function stopTicking() {
    if (ticking === null) return;
    timer.clear(ticking);
    ticking = null;
  }

  /** Starts (or restarts) the tune that is wanted, fading out the one that plays. */
  function start() {
    if (playing) {
      silence(playing, FADE);
      playing = null;
    }
    const score = wanted === null ? undefined : options.tracks[wanted];
    if (!ctx || !musicBus || muted || paused || wanted === null || !score) {
      stopTicking();
      return;
    }
    const id = wanted;
    safely(() => {
      const gain = ctx!.createGain();
      gain.gain.value = 1;
      gain.connect(musicBus!);
      playing = { id, sequencer: createSequencer(score), startAt: Math.max(ctx!.currentTime + LEAD_IN, heldUntil), gain, sources: [] };
    });
    pump();
    if (ticking === null) ticking = timer.set(pump, TICK_MS);
  }

  return {
    unlock() {
      if (closed) return;
      const fresh = !ctx;
      if (!build()) return;
      if (ctx!.state !== 'running' && ctx!.state !== 'closed' && !paused) safely(() => quietly(ctx!.resume()));
      if (fresh) start();
    },

    music(id) {
      if (id === wanted) return;
      wanted = id;
      if (ctx) start();
    },

    jingle(id) {
      const score = options.tracks[id];
      if (!ctx || !effectBus || !musicBus || muted || paused || !score) return;
      const { notes, length } = flatten(score);
      const now = ctx.currentTime + 0.02;
      safely(() => {
        // The tune steps back while the jingle plays, and comes back after it.
        const duck = musicBus!.gain;
        duck.cancelScheduledValues(now);
        duck.setValueAtTime(0.0001, now);
        duck.setValueAtTime(0.0001, now + length);
        duck.linearRampToValueAtTime(1, now + length + 0.4);
        for (const item of notes) note(item, now + item.time, effectBus!);
      });
    },

    effect(id) {
      const effect = options.effects[id];
      if (!ctx || !effectBus || muted || paused || !effect) return;
      const now = ctx.currentTime;
      const last = lastPlayed.get(id);
      if (last !== undefined && now - last < (effect.gap ?? 0)) return;
      lastPlayed.set(id, now);
      safely(() => {
        for (const tone of effect.tones) sound(tone.wave, tone.from, tone.to, now + (tone.at ?? 0), tone.duration, tone.volume, effectBus!, false);
      });
      if (effect.hush) hush(effect.hush);
    },

    setMuted(next) {
      if (next === muted) return;
      muted = next;
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      safely(() => {
        master!.gain.cancelScheduledValues(now);
        master!.gain.setValueAtTime(muted ? 0 : volume, now);
        master!.gain.value = muted ? 0 : volume;
      });
      // Nothing is made while muted; the tune starts afresh when the sound comes back.
      start();
    },

    setVolume(next) {
      volume = Math.max(0, Math.min(1, next));
      if (!ctx || !master || muted) return;
      const now = ctx.currentTime;
      safely(() => {
        master!.gain.cancelScheduledValues(now);
        master!.gain.setValueAtTime(volume, now);
        master!.gain.value = volume;
      });
    },

    pause() {
      if (paused || closed) return;
      paused = true;
      stopTicking();
      if (ctx) safely(() => quietly(ctx!.suspend()));
    },

    resume() {
      if (!paused || closed) return;
      paused = false;
      if (!ctx) return;
      safely(() => quietly(ctx!.resume()));
      if (playing) {
        pump();
        if (ticking === null) ticking = timer.set(pump, TICK_MS);
      } else start();
    },

    close() {
      if (closed) return;
      closed = true;
      stopTicking();
      if (playing) silence(playing, 0);
      playing = null;
      if (ctx) safely(() => quietly(ctx!.close()));
      ctx = null;
      master = null;
      musicBus = null;
      effectBus = null;
    },

    get track() {
      return wanted;
    },
    get muted() {
      return muted;
    },
  };
}
