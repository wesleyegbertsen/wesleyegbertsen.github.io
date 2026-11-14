import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage.ts';

const parseIndex = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : undefined;
};

const setup = () => renderHook(() => useLocalStorage('idx', 0, { parse: parseIndex }));

describe('useLocalStorage', () => {
  it('uses the fallback when nothing is stored', () => {
    expect(setup().result.current[0]).toBe(0);
  });

  it('reads a valid stored value', () => {
    localStorage.setItem('idx', '2');
    expect(setup().result.current[0]).toBe(2);
  });

  it.each(['7', 'abc', '-1', '1.5'])('falls back for invalid value %s', (raw) => {
    localStorage.setItem('idx', raw);
    expect(setup().result.current[0]).toBe(0);
  });

  it('writes on change', () => {
    const { result } = setup();
    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);
    expect(localStorage.getItem('idx')).toBe('3');
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = setup();
    expect(result.current[0]).toBe(0);
    act(() => result.current[1](1));
    expect(result.current[0]).toBe(1);
  });
});
