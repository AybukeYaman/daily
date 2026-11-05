/** Minimal external store for useSyncExternalStore. Replaces a state library for the few global values we have. */
export interface Observable<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function observable<T>(initial: T): Observable<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
