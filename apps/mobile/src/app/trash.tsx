import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';
import type { TrashItem } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
import { fadeIn, freshWindow, haptic, listLayout } from '../design-system/motion';
import { Screen } from '../design-system/screen';
import { space, type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';

export default function TrashScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const fresh = useRef(freshWindow()).current;

  const load = useCallback(() => {
    void journal.trash().then((list) => {
      fresh.markLoaded();
      setItems(list);
    });
  }, [journal, fresh]);
  useFocusEffect(load);

  const restore = async (id: string) => {
    haptic.success();
    await journal.restore(id);
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
  };

  return (
    <Screen title={copy.trashTitle}>
      <Text style={[type.small, { color: t.muted, marginBottom: space.s }]}>{copy.trashHint}</Text>
      <Animated.FlatList
        data={items ?? []}
        itemLayoutAnimation={listLayout}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <EntryRow item={item} index={index} animateIn={fresh.isFresh()} trailing={copy.restore} onPress={() => void restore(item.id)} />
        )}
        ListEmptyComponent={
          items ? (
            <Animated.Text entering={fadeIn} style={[type.ui, { color: t.muted }]}>
              {copy.trashEmpty}
            </Animated.Text>
          ) : undefined
        }
      />
    </Screen>
  );
}
