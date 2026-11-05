import { editorHtmlOf, type VersionDetail, type VersionSummary } from '@daily/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { EnrichedText } from 'react-native-enriched-html';
import { useContainer, useObservable } from '../../core/container-context';
import { copy, formatDay } from '../../design-system/copy';
import { PressableText } from '../../design-system/pressable-text';
import { Screen } from '../../design-system/screen';
import { Sheet } from '../../design-system/sheet';
import { space, type, useTheme } from '../../design-system/theme';

export default function HistoryScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { history, session, sync } = useContainer();
  const signedIn = useObservable(session.signedIn);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<VersionDetail | null>(null);

  useEffect(() => {
    if (!signedIn || !id) return;
    let active = true;
    // Make sure the latest local edits are on the server before reading history.
    void sync
      .syncNow()
      .then(() => history.list(id))
      .then(
        (v) => active && setVersions(v),
        (e: unknown) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [history, sync, id, signedIn]);

  const openVersion = async (revision: number) => {
    try {
      setOpen(await history.get(id!, revision));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async () => {
    if (!open || !id) return;
    await history.restore(id, open);
    setOpen(null);
    router.back();
  };

  return (
    <Screen title={copy.historyTitle}>
      {!signedIn ? (
        <Text style={[type.ui, { color: t.muted }]}>{copy.historyNeedsAccount}</Text>
      ) : (
        <FlatList
          data={versions ?? []}
          keyExtractor={(v) => String(v.revision)}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openVersion(item.revision)}
              style={({ pressed }) => [styles.row, { borderBottomColor: t.hairline, opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={[type.small, { color: t.muted }]}>
                {copy.revision(item.revision)} · {new Date(item.replacedAt).toLocaleString('tr-TR')}
                {item.deleted ? ' · silinmiş' : ''}
              </Text>
              <Text style={[type.body, { color: t.text }]} numberOfLines={2}>
                {item.title || item.preview || copy.untitled}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            error ? (
              <Text style={[type.small, { color: t.danger }]}>{error}</Text>
            ) : versions ? (
              <Text style={[type.ui, { color: t.muted }]}>{copy.historyEmpty}</Text>
            ) : undefined
          }
        />
      )}

      <Sheet visible={open !== null} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <Text style={[type.small, { color: t.muted }]}>
              {copy.revision(open.revision)} · {formatDay(open.entryDate)}
            </Text>
            <ScrollView style={styles.preview}>
              {open.title ? <Text style={[type.title, { color: t.text }]}>{open.title}</Text> : null}
              <EnrichedText style={{ ...type.body, color: t.text }}>{editorHtmlOf(open.content)}</EnrichedText>
            </ScrollView>
            <Text style={[type.small, { color: t.muted }]}>{copy.historyRestoreHint}</Text>
            <PressableText label={copy.historyRestore} onPress={() => void restore()} tone="accent" />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  preview: { maxHeight: 360 },
});
