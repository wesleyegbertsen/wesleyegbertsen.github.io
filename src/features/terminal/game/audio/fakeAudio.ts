import type { AudioLike, GainLike, ParamLike, Timer } from './player.ts';

/**
 * A stand-in for the browser's AudioContext, for the tests: it makes no sound and writes down everything that is
 * asked of it (which oscillators start when and how high, what every gain is set to, what is connected to what),
 * and its clock only moves when a test moves it.
 */

export type ParamEvent = { kind: 'set' | 'linear' | 'exponential' | 'cancel'; value: number; time: number };

export class FakeParam implements ParamLike {
  events: ParamEvent[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'linear', value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'exponential', value, time });
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: 'cancel', value: 0, time });
  }
  /** The first value it was told to take. */
  get first() {
    return this.events.find((event) => event.kind === 'set')?.value;
  }
  /** The last value it was told to take. */
  get last() {
    return this.events.filter((event) => event.kind !== 'cancel').at(-1)?.value ?? this.value;
  }
}

class FakeNode {
  to: unknown[] = [];
  connect(target: unknown) {
    this.to.push(target);
  }
}

export class FakeGain extends FakeNode implements GainLike {
  gain = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  /** Every time `stop` was called: the last one counts, as in a browser. */
  stops: number[] = [];
  start(time = 0) {
    if (this.startAt !== null) throw new Error('started twice');
    this.startAt = time;
  }
  stop(time = 0) {
    if (this.startAt === null) throw new Error('stopped before it was started');
    this.stops.push(time);
    this.stopAt = time;
  }
  /** The gain it plays through. */
  get out(): FakeGain {
    return this.to[0] as FakeGain;
  }
  /** The bus its gain is connected to. */
  get bus(): unknown {
    return this.out.to[0];
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine';
  frequency = new FakeParam(440);
  wave: unknown = null;
  setPeriodicWave(wave: unknown) {
    this.wave = wave;
    this.type = 'custom';
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam(1);
}

export type FakeOptions = {
  /** Start as a browser does before a gesture. */
  suspended?: boolean;
  /** Start as iOS leaves a context after a call or a lock: not running, and not 'suspended' either. */
  interrupted?: boolean;
  /** The n-th gain this context is asked for (1 is the first) throws, as a broken graph would. */
  failGainAt?: number;
  /** `resume()` is refused, as a browser may. */
  refuse?: boolean;
  /** Leave out what an old browser lacks. */
  without?: ('createBuffer' | 'createPeriodicWave')[];
};

export class FakeAudio {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' | 'interrupted';
  sampleRate = 8000;
  destination = { name: 'destination' };
  oscillators: FakeOscillator[] = [];
  noises: FakeBufferSource[] = [];
  gains: FakeGain[] = [];
  calls = { resume: 0, suspend: 0, close: 0 };
  createBuffer?: (channels: number, length: number, rate: number) => { getChannelData(channel: number): Float32Array };
  createPeriodicWave?: (real: Float32Array, imag: Float32Array) => unknown;

  constructor(private readonly options: FakeOptions = {}) {
    this.state = options.interrupted ? 'interrupted' : options.suspended ? 'suspended' : 'running';
    if (!options.without?.includes('createBuffer')) {
      this.createBuffer = (_channels, length) => {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      };
    }
    if (!options.without?.includes('createPeriodicWave')) {
      this.createPeriodicWave = (real, imag) => ({ real, imag });
    }
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    if (this.options.failGainAt === this.gains.length + 1) throw new Error('no more gains');
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.noises.push(source);
    return source;
  }
  resume() {
    this.calls.resume++;
    if (this.options.refuse) return Promise.reject(new Error('not allowed'));
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.calls.suspend++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.calls.close++;
    this.state = 'closed';
    return Promise.resolve();
  }

  /** The gain that is connected to the speakers. */
  get master(): FakeGain {
    return this.gains.find((gain) => gain.to.includes(this.destination))!;
  }
  /** The buses under the master, in the order the player makes them: music, effects. */
  get buses(): FakeGain[] {
    return this.gains.filter((gain) => gain.to.includes(this.master));
  }
  /** Everything that makes a sound, oscillators and noise alike. */
  get sources(): FakeSource[] {
    return [...this.oscillators, ...this.noises];
  }
  /** What is sounding (started, not stopped yet) at a time. */
  sounding(time = this.currentTime): FakeSource[] {
    return this.sources.filter((source) => source.startAt !== null && source.startAt <= time && (source.stopAt === null || source.stopAt > time));
  }
  as(): AudioLike {
    return this as unknown as AudioLike;
  }
}

/** A timer that only ticks when a test says so. */
export function fakeTimer() {
  let next = 1;
  const running = new Map<number, () => void>();
  const timer: Timer = {
    set: (tick) => {
      running.set(next, tick);
      return next++;
    },
    clear: (id) => void running.delete(id as number),
  };
  return {
    timer,
    /** How many timers are running. */
    get count() {
      return running.size;
    },
    tick: () => [...running.values()].forEach((run) => run()),
  };
}
