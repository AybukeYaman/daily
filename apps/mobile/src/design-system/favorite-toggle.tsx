import { useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { duration, haptic, spring } from './motion';
import { useTheme } from './theme';

/** Star that pops when turned on: the one celebratory moment in the editor. */
export function FavoriteToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // no animation when the screen opens
      return;
    }
    if (value && !reduced) {
      scale.value = withSequence(withTiming(1.35, { duration: duration.tap }), withSpring(1, spring.pop));
    }
  }, [value, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="Favori"
      onPress={() => {
        if (!value) haptic.light();
        onChange(!value);
      }}
    >
      <Animated.View style={style}>
        <Text style={{ fontSize: 20, color: value ? t.accent : t.muted }}>{value ? '★' : '☆'}</Text>
      </Animated.View>
    </Pressable>
  );
}
