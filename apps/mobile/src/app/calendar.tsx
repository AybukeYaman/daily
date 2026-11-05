import { localIsoDate } from '@daily/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { EntrySummary } from '../core/application/ports';
import { useContainer } from '../core/container-context';
import { copy, formatDay } from '../design-system/copy';
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
  // Bumped on focus so the month's dots refresh after writing.
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setVersion((v) => v + 1);
      void journal.onDate(selected).then((e) => active && setEntries(e));
      return () => {
        active = false;
      };
    }, [journal, selected]),
  );

  const goToday = () => {
    const today = localIsoDate();
    setSelected(today);
    setMonth(monthOf(today));
  };

  return (
    <Screen right={<PressableText label={copy.today} onPress={goToday} tone="accent" />}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <MonthView key={version} month={month} onMonthChange={setMonth} selected={selected} onSelect={setSelected} />
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
        ListEmptyComponent={<Text style={[type.ui, { color: t.muted }]}>{copy.dayEmpty}</Text>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.l, paddingBottom: space.s },
  dayBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.m },
});
