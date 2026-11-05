import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EntrySummary } from '../../../core/application/ports';
import { formatDay } from '../../../design-system/copy';
import { fadeOut, rowEntering } from '../../../design-system/motion';
import { PressScale } from '../../../design-system/press-scale';
import { space, type, useTheme } from '../../../design-system/theme';

interface Props {
  item: EntrySummary;
  /** Position in the list; only the first rows of a fresh list animate in. */
  index?: number;
  /** False for rows appended by pagination: they appear without animation. */
  animateIn?: boolean;
  /** Overrides navigation (e.g. trash rows restore instead of opening). */
  onPress?: () => void;
  trailing?: string;
}

/** One list row, shared by timeline, archive, calendar day, search and trash. */
export const EntryRow = memo(function EntryRow({ item, index = 0, animateIn = true, onPress, trailing }: Props) {
  const t = useTheme();
  return (
    <Animated.View entering={animateIn ? rowEntering(index) : undefined} exiting={fadeOut}>
      <PressScale
        onPress={onPress ?? (() => router.push(`/entry/${item.id}`))}
        scaleTo={0.985}
        style={[styles.row, { borderBottomColor: t.hairline }]}
        accessibilityRole="button"
      >
        <Text style={[type.small, { color: t.muted }]}>
          {formatDay(item.entryDate)}
          {item.favorite ? '  ★' : ''}
          {item.isConflictCopy ? '  ·  kopya' : ''}
          {trailing ? `  ·  ${trailing}` : ''}
        </Text>
        {item.title ? (
          <Text style={[type.body, { color: t.text, fontWeight: '600' }]} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
        {item.preview ? (
          <Text style={[type.body, { color: item.title ? t.muted : t.text }]} numberOfLines={2}>
            {item.preview}
          </Text>
        ) : null}
      </PressScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
