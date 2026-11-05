import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EntrySummary } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy } from '../design-system/copy';
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

  useEffect(() => {
    if (text.trim() === '' && !favoritesOnly) {
      setResults(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void journal.search({ text, favoritesOnly, includeArchived, limit: 50 }).then((r) => {
        if (id === requestId.current) setResults(r);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [journal, text, favoritesOnly, includeArchived]);

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
        <PressableText label={copy.favoritesOnly} onPress={() => setFavoritesOnly((v) => !v)} tone={favoritesOnly ? 'accent' : 'muted'} />
        <PressableText label={copy.includeArchived} onPress={() => setIncludeArchived((v) => !v)} tone={includeArchived ? 'accent' : 'muted'} />
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={results ? <Text style={[type.ui, { color: t.muted }]}>{copy.searchEmpty}</Text> : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.l, marginVertical: space.m },
});
