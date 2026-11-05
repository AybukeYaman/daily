import { localIsoDate } from '@daily/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EntrySummary } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy, formatDay } from '../design-system/copy';
import { fadeIn, freshWindow, listLayout } from '../design-system/motion';
import { PressableText } from '../design-system/pressable-text';
import { Screen } from '../design-system/screen';
import { space, type, useTheme } from '../design-system/theme';
import { monthOf } from '../features/calendar/application/month';
import { MonthView } from '../features/calendar/presentation/month-view';
import { EntryRow } from '../features/journaling/presentation/entry-row';

export default function CalendarScreen() {
  const t = useTheme();
  const { journal } = useContainer();
  const [selected, setSelected] = useState(localIsoDate());
  const [month, setMonth] = useState(() => monthOf(selected));
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  // Bumped when the screen regains focus (e.g. after writing) so dots and the day list refresh.
  const [version, setVersion] = useState(0);
  const fresh = useRef(freshWindow()).current;

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  useEffect(() => {
    let active = true;
    void journal.onDate(selected).then((e) => {
      if (!active) return;
      fresh.markLoaded();
      setEntries(e);
    });
    return () => {
      active = false;
    };
  }, [journal, selected, version, fresh]);

  const goToday = () => {
    const today = localIsoDate();
    setSelected(today);
    setMonth(monthOf(today));
  };

  return (
    <Screen right={<PressableText label={copy.today} onPress={goToday} tone="accent" />}>
      <Animated.FlatList
        data={entries}
        itemLayoutAnimation={listLayout}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <EntryRow item={item} index={index} animateIn={fresh.isFresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <MonthView refreshToken={version} month={month} onMonthChange={setMonth} selected={selected} onSelect={setSelected} />
            <View style={styles.dayBar}>
              <Text style={[type.overline, { color: t.muted }]}>{formatDay(selected)}</Text>
              <PressableText
                label={copy.writeOnThisDay}
                onPress={() => router.push({ pathname: '/entry/[id]', params: { id: 'new', date: selected } })}
                tone="accent"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Animated.Text key={selected} entering={fadeIn} style={[type.ui, { color: t.muted }]}>
            {copy.dayEmpty}
          </Animated.Text>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.l, paddingBottom: space.s },
  dayBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.m },
});
