import { vi } from 'vitest';

/** Minimal stand-in for `Audio` that records every instance created. */
export class FakeAudio {
  static instances: FakeAudio[] = [];

  src: string;
  volume = 1;
  currentTime = 0;
  paused = true;
  onended: (() => void) | null = null;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });

  constructor(src = '') {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  /** Simulate the clip finishing. */
  end() {
    this.paused = true;
    this.onended?.();
  }

  static reset() {
    FakeAudio.instances = [];
  }

  /** Instances created for the given source (a substring of the URL). */
  static of(fragment: string) {
    return FakeAudio.instances.filter((a) => a.src.includes(fragment));
  }
}

export function installFakeAudio() {
  FakeAudio.reset();
  vi.stubGlobal('Audio', FakeAudio);
}
