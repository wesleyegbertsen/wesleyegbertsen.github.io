import { StrictMode, useRef } from 'react';
import { act, render } from '@testing-library/react';
import { useMatrixRain } from './useMatrixRain.ts';

type FakeContext = {
  fillStyle: string;
  font: string;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  textColors: string[];
};

let context: FakeContext;

function Harness({ colorIndex = 0 }: { colorIndex?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useMatrixRain(ref, colorIndex);
  return <canvas ref={ref} />;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

const columns = () => Math.floor(window.innerWidth / 20) + 1;

beforeEach(() => {
  vi.useFakeTimers();
  const textColors: string[] = [];
  const fake = {
    fillStyle: '',
    font: '',
    fillRect: vi.fn(),
    fillText: vi.fn(() => {
      textColors.push(fake.fillStyle);
    }),
    textColors,
  };
  context = fake;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  mockReducedMotion(false);
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('useMatrixRain', () => {
  it('fills the canvas black, then draws frames in the chosen colour', () => {
    render(<Harness colorIndex={2} />);
    expect(context.fillRect).toHaveBeenCalledTimes(1);

    act(() => void vi.advanceTimersByTime(200));

    expect(context.fillText.mock.calls.length).toBeGreaterThan(0);
    expect(new Set(context.textColors)).toEqual(new Set(['#00f']));
  });

  it('draws at most once per 50ms', () => {
    render(<Harness />);
    act(() => void vi.advanceTimersByTime(1000));
    const frames = context.fillText.mock.calls.length / columns();
    expect(frames).toBeGreaterThanOrEqual(15);
    expect(frames).toBeLessThanOrEqual(21);
  });

  it('draws nothing while the tab is hidden and resumes when visible', () => {
    render(<Harness />);
    act(() => void vi.advanceTimersByTime(100));
    act(() => setHidden(true));
    const before = context.fillText.mock.calls.length;

    act(() => void vi.advanceTimersByTime(500));
    expect(context.fillText.mock.calls.length).toBe(before);

    act(() => setHidden(false));
    act(() => void vi.advanceTimersByTime(200));
    expect(context.fillText.mock.calls.length).toBeGreaterThan(before);
  });

  it('draws no rain when the visitor prefers reduced motion', () => {
    mockReducedMotion(true);
    render(<Harness />);
    act(() => void vi.advanceTimersByTime(500));
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledTimes(1);
  });

  it('stops drawing after unmount', () => {
    const { unmount } = render(<Harness />);
    act(() => void vi.advanceTimersByTime(100));
    unmount();
    const before = context.fillText.mock.calls.length;
    act(() => void vi.advanceTimersByTime(500));
    expect(context.fillText.mock.calls.length).toBe(before);
  });

  it('runs a single loop under StrictMode', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    act(() => void vi.advanceTimersByTime(1000));
    const frames = context.fillText.mock.calls.length / columns();
    expect(frames).toBeLessThanOrEqual(21);
  });

  it('refills the canvas on resize', () => {
    render(<Harness />);
    const before = context.fillRect.mock.calls.length;
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(context.fillRect.mock.calls.length).toBe(before + 1);
  });
});
