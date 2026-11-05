import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';
import type { TrashItem } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
import { Screen } from '../design-system/screen';
import { space, type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';

export default function TrashScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [items, setItems] = useState<TrashItem[] | null>(null);

  const load = useCallback(() => {
    void journal.trash().then(setItems);
  }, [journal]);
  useFocusEffect(load);

  const restore = async (id: string) => {
    await journal.restore(id);
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
  };

  return (
    <Screen title={copy.trashTitle}>
      <Text style={[type.small, { color: t.muted, marginBottom: space.s }]}>{copy.trashHint}</Text>
      <FlatList
        data={items ?? []}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} trailing={copy.restore} onPress={() => void restore(item.id)} />}
        ListEmptyComponent={items ? <Text style={[type.ui, { color: t.muted }]}>{copy.trashEmpty}</Text> : undefined}
      />
    </Screen>
  );
}
