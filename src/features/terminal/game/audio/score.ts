/**
 * Music as data. A track is a tempo and a few voices; a voice is a line of notes written as text. Nothing here
 * touches the browser: the functions turn the text into notes with a time in seconds, and the sequencer hands
 * them out bit by bit (and round and round, for a track that loops), so all of it can be tested with numbers.
 *
 * The notation of a voice, tokens separated by spaces:
 *   C4  F#3  Bb5   a note: name, optional # or b, octave (A4 is 440 Hz)
 *   -              a rest
 *   k  s  h        on a noise voice: kick, snare, hi-hat
 *   :n             after any of these: how many steps it lasts (C4:4). Without it, one step.
 *   |              a bar line, for the eye only
 * A step is a sixteenth note: four steps to the beat.
 */

/** The four voices of a Game Boy: two pulse waves (a full and a thin one), a triangle-like wave and noise. */
export type Wave = 'pulse' | 'thin' | 'triangle' | 'noise';
export type Drum = 'k' | 's' | 'h';

/** `pluck`: every note is struck and dies away from its start, never held (a piano). The pulse voices already are. */
export type Voice = { wave: Wave; volume: number; notes: string; pluck?: true };

export type Track = {
  /** Beats (quarter notes) per minute. */
  bpm: number;
  /** Whether it starts again when it ends. A jingle does not. */
  loop: boolean;
  /** Where a loop starts again, in steps from the start (an intro before it is played once). Default 0. */
  loopFrom?: number;
  voices: Voice[];
};

/** One sound to make: when (seconds from the start of the track), how long, on which voice, how high. */
export type Note = { voice: number; wave: Wave; volume: number; time: number; duration: number; frequency: number; drum?: Drum; pluck?: true };

export const STEPS_PER_BEAT = 4;

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The frequency of a note name in Hz: A4 is 440. Throws on anything that is not a note. */
export function frequencyOf(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note: '${name}'`);
  const midi = (Number(match[3]) + 1) * 12 + SEMITONES[match[1]!]! + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

type Parsed = { step: number; steps: number; frequency: number; drum?: Drum };

/** The notes of a voice with their place in steps, and how many steps the line is long. Rests leave gaps. */
export function parseVoice(notes: string): { notes: Parsed[]; steps: number } {
  const parsed: Parsed[] = [];
  let step = 0;
  for (const token of notes.split(/\s+/)) {
    if (token === '' || token === '|') continue;
    const [what = '', length, extra] = token.split(':');
    const steps = length === undefined ? 1 : Number(length);
    if (extra !== undefined || !Number.isInteger(steps) || steps < 1) throw new Error(`Bad length in '${token}'`);
    if (what === 'k' || what === 's' || what === 'h') parsed.push({ step, steps, frequency: 0, drum: what });
    else if (what !== '-') parsed.push({ step, steps, frequency: frequencyOf(what) });
    step += steps;
  }
  return { notes: parsed, steps: step };
}

export const stepSeconds = (track: Track) => 60 / track.bpm / STEPS_PER_BEAT;

/** How many steps a track is long: its longest voice. (A test keeps the voices of every track equally long.) */
export const trackSteps = (track: Track) => Math.max(0, ...track.voices.map((voice) => parseVoice(voice.notes).steps));

/** Every note of a track in the order of time, the length of the track and where its loop starts, in seconds. */
export function flatten(track: Track): { notes: Note[]; length: number; loopAt: number } {
  const step = stepSeconds(track);
  const notes = track.voices
    .flatMap((voice, index) =>
      parseVoice(voice.notes).notes.map(
        (note): Note => ({
          voice: index,
          wave: voice.wave,
          volume: voice.volume,
          time: note.step * step,
          duration: note.steps * step,
          frequency: note.frequency,
          ...(note.drum ? { drum: note.drum } : {}),
          ...(voice.pluck ? { pluck: true as const } : {}),
        }),
      ),
    )
    .sort((a, b) => a.time - b.time || a.voice - b.voice);
  const length = trackSteps(track) * step;
  const loopAt = Math.min(Math.max(0, (track.loopFrom ?? 0) * step), length);
  return { notes, length, loopAt };
}

export type Sequencer = {
  /** The notes that start before `until` (seconds since the track started) and were not handed out yet. */
  take(until: number): Note[];
  /** True once a track that does not loop has handed out its last note. */
  readonly done: boolean;
};

/** Hands out the notes of a track as time passes; a looping track never runs out. */
export function createSequencer(track: Track): Sequencer {
  const { notes, length, loopAt } = flatten(track);
  const loopStart = notes.findIndex((note) => note.time >= loopAt);
  // A loop with nothing in it (or no length) would never move on: such a track just plays once.
  const loops = track.loop && loopStart >= 0 && length - loopAt > 0;
  let index = 0;
  let offset = 0;
  let done = notes.length === 0;

  return {
    take(until) {
      const due: Note[] = [];
      while (!done) {
        if (index >= notes.length) {
          if (!loops) {
            done = true;
            break;
          }
          // Asked for everything: one round is all there is to give.
          if (!Number.isFinite(until)) break;
          index = loopStart;
          offset += length - loopAt;
        }
        const note = notes[index]!;
        if (note.time + offset >= until) break;
        due.push(offset === 0 ? note : { ...note, time: note.time + offset });
        index++;
      }
      return due;
    },
    get done() {
      return done;
    },
  };
}
