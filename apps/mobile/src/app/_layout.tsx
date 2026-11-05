import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ContainerProvider, useContainer } from '../core/container-context';
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
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: t.background },
              animation: 'fade',
            }}
          />
        </ContainerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
