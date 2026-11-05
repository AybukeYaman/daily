import { localIsoDate } from '@daily/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useContainer } from '../../../core/container-context';
import { duration, haptic } from '../../../design-system/motion';
import { PressableText } from '../../../design-system/pressable-text';
import { space, type, useTheme } from '../../../design-system/theme';
import { type MonthRef, monthGrid, monthRange, shiftMonth } from '../application/month';

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

interface Props {
  month: MonthRef;
  onMonthChange: (m: MonthRef) => void;
  selected: string | null;
  onSelect: (isoDate: string) => void;
  /** Change to re-read the activity dots (e.g. after the user wrote something). */
  refreshToken?: number;
}

/** Month grid with a dot under days that have entries. Used by the calendar and the date picker. */
export const MonthView = memo(function MonthView({ month, onMonthChange, selected, onSelect, refreshToken = 0 }: Props) {
  const t = useTheme();
  const { journal } = useContainer();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const weeks = useMemo(() => monthGrid(month), [month]);
  // Slide the new month in from the side of the arrow that was pressed.
  const index = month.year * 12 + month.month;
  const previous = useRef(index);
  const forward = index >= previous.current;
  const changedMonth = index !== previous.current; // no slide when the view first appears
  useEffect(() => {
    previous.current = index;
  }, [index]);
  const entering = changedMonth
    ? (forward ? SlideInRight : SlideInLeft).duration(duration.base).reduceMotion(ReduceMotion.System)
    : undefined;
  const exiting = FadeOut.duration(duration.tap).reduceMotion(ReduceMotion.System);
  const today = localIsoDate();

  useEffect(() => {
    let active = true;
    const { from, to } = monthRange(month);
    void journal.activity(from, to).then((c) => active && setCounts(c));
    return () => {
      active = false;
    };
  }, [journal, month, refreshToken]);

  const title = new Date(Date.UTC(month.year, month.month, 15)).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <View style={styles.clip}>
      <View style={styles.header}>
        <PressableText label="‹" onPress={() => onMonthChange(shiftMonth(month, -1))} style={styles.arrow} />
        <Text style={[type.ui, { color: t.text, fontWeight: '600' }]}>{title}</Text>
        <PressableText label="›" onPress={() => onMonthChange(shiftMonth(month, 1))} style={styles.arrow} />
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[type.small, styles.cell, { color: t.faint }]}>
            {d}
          </Text>
        ))}
      </View>
      <Animated.View key={index} entering={entering} exiting={exiting}>
        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((iso, j) => {
              if (!iso) return <View key={j} style={styles.cell} />;
              const isSelected = iso === selected;
              const has = (counts[iso] ?? 0) > 0;
              return (
                <Pressable
                  key={iso}
                  onPress={() => {
                    haptic.select();
                    onSelect(iso);
                  }}
                  style={[styles.cell, styles.day, isSelected && { backgroundColor: t.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${iso}${has ? `, ${counts[iso]} yazı` : ''}`}
                >
                  <Text style={[type.ui, { color: iso === today ? t.accent : t.text, fontWeight: iso === today ? '700' : '400' }]}>
                    {Number(iso.slice(8))}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: has ? t.accent : 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.m },
  arrow: { fontSize: 22, paddingHorizontal: space.s },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', textAlign: 'center' },
  day: { paddingVertical: space.s, borderRadius: 10 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});
