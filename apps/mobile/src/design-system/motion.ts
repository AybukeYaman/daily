import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

/**
 * Motion language of Daily: short, quiet, purposeful.
 * Every animation either shows where something came from / went to, or
 * acknowledges a touch. All run on the UI thread (Reanimated layout animations
 * and worklets), and all respect the system "reduce motion" setting.
 */
export const duration = { tap: 120, quick: 180, base: 240, page: 280 } as const;

/** Decelerate: things arrive quickly and settle gently. */
const easeOut = Easing.bezier(0.2, 0.8, 0.2, 1);

export const spring = {
  /** Press feedback: crisp, no wobble. */
  press: { damping: 30, stiffness: 600, mass: 0.6 },
  /** Small celebratory bounce (favorite star). */
  pop: { damping: 9, stiffness: 320, mass: 0.6 },
  /** Bottom sheet. */
  sheet: { damping: 32, stiffness: 320, mass: 0.9 },
} as const;

/**
 * Rows animate in only right after a list (re)loads. FlatList mounts rows
 * lazily while scrolling; without this window, rows would animate on scroll.
 */
const FRESH_WINDOW_MS = 450;
export function freshWindow() {
  let loadedAt = 0;
  return {
    markLoaded: () => {
      loadedAt = Date.now();
    },
    isFresh: () => Date.now() - loadedAt < FRESH_WINDOW_MS,
  };
}

/** Rows appear with a small capped stagger. */
const MAX_STAGGERED = 10;
export function rowEntering(index: number) {
  return FadeInDown.duration(duration.base)
    .delay(Math.min(index, MAX_STAGGERED) * 28)
    .easing(easeOut)
    .withInitialValues({ transform: [{ translateY: 8 }] })
    .reduceMotion(ReduceMotion.System);
}

export const fadeIn = FadeIn.duration(duration.quick).reduceMotion(ReduceMotion.System);
export const fadeOut = FadeOut.duration(duration.tap).reduceMotion(ReduceMotion.System);
export const barEntering = FadeInDown.duration(duration.quick).easing(easeOut).reduceMotion(ReduceMotion.System);
export const barExiting = FadeOutDown.duration(duration.tap).reduceMotion(ReduceMotion.System);
/** Remaining rows slide into place when one is removed (trash restore, delete). */
export const listLayout = LinearTransition.duration(duration.base).easing(easeOut).reduceMotion(ReduceMotion.System);

/** Haptics: light, rare, and only for meaningful moments. Never throw. */
const safe = (p: Promise<void>) => void p.catch(() => undefined);
const supported = Platform.OS === 'ios' || Platform.OS === 'android';
export const haptic = {
  /** Toggle-like choices: tool, filter, calendar day. */
  select: () => supported && safe(Haptics.selectionAsync()),
  /** A deliberate positive action: favorite, restore. */
  light: () => supported && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => supported && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => supported && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
