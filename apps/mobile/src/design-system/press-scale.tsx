import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { duration, spring } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How much to shrink on press; rows use a gentler value than buttons. */
  scaleTo?: number;
}

/**
 * Touch feedback that feels physical: a slight shrink + dim on press, springing
 * back on release. Driven by shared values on the UI thread, so it responds in
 * the same frame as the touch, even if JS is busy.
 */
export function PressScale({ children, style, scaleTo = 0.97, disabled, onPressIn, onPressOut, ...rest }: Props) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.35,
    transform: [{ scale: reduced ? 1 : 1 - pressed.value * (1 - scaleTo) }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: duration.tap / 2 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, spring.press);
        onPressOut?.(e);
      }}
      style={[style, animated, disabled ? { opacity: 0.4 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
