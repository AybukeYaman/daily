import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ContainerProvider, useContainer } from '../core/container-context';
import { duration } from '../design-system/motion';
import { useTheme } from '../design-system/theme';

/** Syncs when the app returns to the foreground. Writing never waits on this. */
function ForegroundSync() {
  const { sync } = useContainer();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync.syncNow();
    });
    return () => sub.remove();
  }, [sync]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <ContainerProvider fallback={<View style={{ flex: 1, backgroundColor: t.background }} />}>
          <ForegroundSync />
          <ReducedMotionConfig mode={ReduceMotion.System} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: t.background },
              // Same native slide on both platforms; swipe back from anywhere on iOS.
              animation: 'ios_from_right',
              animationDuration: duration.page,
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
            }}
          >
            {/* Writing rises gently from below. Edge-swipe only, so selecting text never triggers "back". */}
            <Stack.Screen name="entry/[id]" options={{ animation: 'fade_from_bottom', fullScreenGestureEnabled: false }} />
            {/* Drawing surfaces: no swipe-back, a stroke must never become "back". */}
            <Stack.Screen name="handwriting/[entryId]" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="lab/handwriting" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>
        </ContainerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
