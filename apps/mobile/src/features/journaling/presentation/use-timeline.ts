import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { EntrySummary, TimelineCursor } from '../../../core/application/ports';
import { useContainer } from '../../../core/container-context';

const PAGE = 30;

/** Paged timeline from SQLite. Reloads the first page whenever the screen regains focus. */
export function useTimeline() {
  const { journal } = useContainer();
  const [items, setItems] = useState<EntrySummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const next = useRef<TimelineCursor | null>(null);
  const loadingMore = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void journal.timeline(PAGE).then((page) => {
        if (!active) return;
        next.current = page.next;
        setItems(page.items);
        setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, [journal]),
  );

  const loadMore = useCallback(async () => {
    if (!next.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await journal.timeline(PAGE, next.current);
      next.current = page.next;
      setItems((prev) => prev.concat(page.items));
    } finally {
      loadingMore.current = false;
    }
  }, [journal]);

  return { items, loaded, loadMore };
}
