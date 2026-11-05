import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EntrySummary } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
import { fadeIn, freshWindow, haptic, listLayout } from '../design-system/motion';
import { PressableText } from '../design-system/pressable-text';
import { Screen } from '../design-system/screen';
import { space, type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';

/** Results update as you type; queries are debounced and stale answers are dropped. */
const DEBOUNCE_MS = 150;

export default function SearchScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [text, setText] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [results, setResults] = useState<EntrySummary[] | null>(null);
  const requestId = useRef(0);
  const fresh = useRef(freshWindow()).current;

  useEffect(() => {
    if (text.trim() === '' && !favoritesOnly) {
      setResults(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void journal.search({ text, favoritesOnly, includeArchived, limit: 50 }).then((r) => {
        if (id !== requestId.current) return;
        fresh.markLoaded();
        setResults(r);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [journal, text, favoritesOnly, includeArchived, fresh]);

  return (
    <Screen>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={copy.searchPlaceholder}
        placeholderTextColor={t.faint}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        style={[type.title, { color: t.text }]}
      />
      <View style={styles.filters}>
        <PressableText
          label={copy.favoritesOnly}
          tone={favoritesOnly ? 'accent' : 'muted'}
          onPress={() => {
            haptic.select();
            setFavoritesOnly((v) => !v);
          }}
        />
        <PressableText
          label={copy.includeArchived}
          tone={includeArchived ? 'accent' : 'muted'}
          onPress={() => {
            haptic.select();
            setIncludeArchived((v) => !v);
          }}
        />
      </View>
      <Animated.FlatList
        data={results ?? []}
        itemLayoutAnimation={listLayout}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <EntryRow item={item} index={index} animateIn={fresh.isFresh()} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          results ? (
            <Animated.Text entering={fadeIn} style={[type.ui, { color: t.muted }]}>
              {copy.searchEmpty}
            </Animated.Text>
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.l, marginVertical: space.m },
});
