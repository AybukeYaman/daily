import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Observable } from './application/observable';
import { type AppContainer, createContainer } from './container';

const ContainerContext = createContext<AppContainer | null>(null);

export function ContainerProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    createContainer().then(setContainer, (e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  // A broken local database must never look like an empty journal: surface it loudly.
  if (error) throw error;
  if (!container) return fallback;
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): AppContainer {
  const c = useContext(ContainerContext);
  if (!c) throw new Error('useContainer must be used inside ContainerProvider');
  return c;
}

export function useObservable<T>(o: Observable<T>): T {
  return useSyncExternalStore(o.subscribe, o.get, o.get);
}
