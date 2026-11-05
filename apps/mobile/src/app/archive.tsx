import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Text } from 'react-native';
import type { EntrySummary, TimelineCursor } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
import { Screen } from '../design-system/screen';
import { type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';

const PAGE = 30;

export default function ArchiveScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [items, setItems] = useState<EntrySummary[] | null>(null);
  const next = useRef<TimelineCursor | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void journal.archived(PAGE).then((p) => {
        if (!active) return;
        next.current = p.next;
        setItems(p.items);
      });
      return () => {
        active = false;
      };
    }, [journal]),
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
      <FlatList
        data={items ?? []}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} />}
        onEndReached={() => void loadMore()}
        ListEmptyComponent={items ? <Text style={[type.ui, { color: t.muted }]}>{copy.archiveEmpty}</Text> : undefined}
      />
    </Screen>
  );
}
