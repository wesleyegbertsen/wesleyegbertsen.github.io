import { useCallback, useState } from 'react';

type Options<T> = {
  /** Turns the raw stored string into a value, or `undefined` when it is not valid. */
  parse: (raw: string) => T | undefined;
  serialize?: (value: T) => string;
};

function read<T>(key: string, fallback: T, parse: Options<T>['parse']): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(raw) ?? fallback;
  } catch {
    // Storage can throw (private mode, blocked site data): behave as if empty.
    return fallback;
  }
}

/** State persisted to localStorage; invalid or missing values fall back to `fallback`. */
export function useLocalStorage<T>(key: string, fallback: T, { parse, serialize = String }: Options<T>) {
  const [value, setValue] = useState<T>(() => read(key, fallback, parse));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, serialize(next));
      } catch {
        // Persisting is best effort.
      }
    },
    [key, serialize],
  );

  return [value, update] as const;
}
