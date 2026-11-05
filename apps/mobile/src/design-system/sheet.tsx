import { type ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { duration, spring } from './motion';
import { space, useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Dragging down past this fraction of the sheet height (or flicking) closes it. */
const CLOSE_FRACTION = 0.3;
const CLOSE_VELOCITY = 900;

/**
 * Bottom sheet: the single overlay pattern in Daily (menus, date picker).
 * Slides up on a spring, follows the finger when dragged down, and stays
 * mounted until its exit animation finishes (a bare Modal would vanish).
 */
export function Sheet({ visible, onClose, children }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);

  /** 0 = open, 1 = fully off-screen. */
  const progress = useSharedValue(1);
  const sheetHeight = useSharedValue(screenHeight);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = reduced ? withTiming(0, { duration: duration.quick }) : withSpring(0, spring.sheet);
    } else if (mounted) {
      progress.value = withTiming(1, { duration: duration.quick }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible, mounted, progress, reduced]);

  const drag = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-20, 20],
    onUpdate: (e) => {
      'worklet';
      progress.value = Math.max(0, e.translationY / sheetHeight.value);
    },
    onDeactivate: (e) => {
      'worklet';
      if (progress.value > CLOSE_FRACTION || e.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        progress.value = withSpring(0, spring.sheet);
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 1], [1, 0]) }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: progress.value * sheetHeight.value }] }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <GestureDetector gesture={drag}>
          <Animated.View
            onLayout={(e) => {
              sheetHeight.value = e.nativeEvent.layout.height;
            }}
            style={[styles.sheet, { backgroundColor: t.background, paddingBottom: insets.bottom + space.l }, sheetStyle]}
          >
            <View style={[styles.grabber, { backgroundColor: t.hairline }]} />
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.25)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingHorizontal: space.l,
    paddingTop: space.s,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    gap: space.l,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.xs },
});
