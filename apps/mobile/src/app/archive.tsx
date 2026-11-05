import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import type { EntrySummary, TimelineCursor } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
import { fadeIn, freshWindow, listLayout } from '../design-system/motion';
import { Screen } from '../design-system/screen';
import { type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';

const PAGE = 30;

export default function ArchiveScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [items, setItems] = useState<EntrySummary[] | null>(null);
  const next = useRef<TimelineCursor | null>(null);
  const fresh = useRef(freshWindow()).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void journal.archived(PAGE).then((p) => {
        if (!active) return;
        next.current = p.next;
        fresh.markLoaded();
        setItems(p.items);
      });
      return () => {
        active = false;
      };
    }, [journal, fresh]),
  );

  const loadMore = async () => {
    const cursor = next.current;
    if (!cursor) return;
    next.current = null;
    const p = await journal.archived(PAGE, cursor);
    next.current = p.next;
    setItems((prev) => (prev ?? []).concat(p.items));
  };

  return (
    <Screen title={copy.archiveTitle}>
      <Animated.FlatList
        data={items ?? []}
        itemLayoutAnimation={listLayout}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <EntryRow item={item} index={index} animateIn={fresh.isFresh()} />}
        onEndReached={() => void loadMore()}
        ListEmptyComponent={
          items ? (
            <Animated.Text entering={fadeIn} style={[type.ui, { color: t.muted }]}>
              {copy.archiveEmpty}
            </Animated.Text>
          ) : undefined
        }
      />
    </Screen>
  );
}
