import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copy } from './copy';
import { PressableText } from './pressable-text';
import { space, type, useTheme } from './theme';

/** Secondary screen frame: back link, optional title, content. */
export function Screen({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.topBar}>
        <PressableText label={`‹ ${copy.back}`} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        {right}
      </View>
      <View style={styles.body}>
        {title ? <Text style={[type.title, { color: t.text, marginBottom: space.m }]}>{title}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  body: { flex: 1, paddingHorizontal: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' },
});
