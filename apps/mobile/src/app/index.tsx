import { localIsoDate } from '@daily/shared';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EntrySummary } from '../core/application/ports';
import { useContainer, useObservable } from '../core/container-context';
import { copy, formatDay } from '../design-system/copy';
import { fadeIn, listLayout } from '../design-system/motion';
import { PressScale } from '../design-system/press-scale';
import { PressableText } from '../design-system/pressable-text';
import { space, type, useTheme } from '../design-system/theme';
import { EntryRow } from '../features/journaling/presentation/entry-row';
import { useTimeline } from '../features/journaling/presentation/use-timeline';

export default function Home() {
  const t = useTheme();
  const { sync } = useContainer();
  const status = useObservable(sync.status);
  const { items, loaded, loadMore, isFresh } = useTimeline();
  const renderItem = useCallback(
    ({ item, index }: { item: EntrySummary; index: number }) => <EntryRow item={item} index={index} animateIn={isFresh()} />,
    [isFresh],
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Text style={[type.overline, { color: t.muted }]}>{formatDay(localIsoDate())}</Text>
        <View style={styles.nav}>
          <PressableText label={copy.search} onPress={() => router.push('/search')} />
          <PressableText label={copy.calendar} onPress={() => router.push('/calendar')} />
          <PressableText label={copy.settings} onPress={() => router.push('/settings')} />
        </View>
      </View>
      <PressScale onPress={() => router.push('/entry/new')} accessibilityRole="button" hitSlop={8} scaleTo={0.98}>
        <Text style={[type.title, { color: t.faint }]}>{copy.writePrompt}</Text>
      </PressScale>
      {status.phase !== 'synced' && status.phase !== 'syncing' ? (
        <Animated.Text key={status.phase} entering={fadeIn} style={[type.small, { color: t.muted, marginTop: space.s }]}>
          {copy.sync[status.phase]}
        </Animated.Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]} edges={['top']}>
      <Animated.FlatList
        data={items}
        itemLayoutAnimation={listLayout}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loaded ? (
            <Animated.Text entering={fadeIn} style={[type.ui, styles.empty, { color: t.muted }]}>
              {copy.emptyJournal}
            </Animated.Text>
          ) : undefined
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: space.l, paddingBottom: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { paddingTop: space.m, paddingBottom: space.l },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xl },
  nav: { flexDirection: 'row', gap: space.l },
  empty: { marginTop: space.l },
});
