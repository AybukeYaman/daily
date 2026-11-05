import { PAGE_BACKGROUNDS } from '@daily/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copy } from '../../design-system/copy';
import { fadeIn, fadeOut, haptic } from '../../design-system/motion';
import { PressableText } from '../../design-system/pressable-text';
import { paper, space, type, useTheme } from '../../design-system/theme';
import type { CanvasTool } from '../../features/handwriting/application/handwriting-session';
import { HandwritingCanvas } from '../../features/handwriting/presentation/handwriting-canvas';
import { useHandwritingPage } from '../../features/handwriting/presentation/use-handwriting-page';
import { useCalmSaveState } from '../../features/journaling/presentation/use-calm-save-state';

const TOOLS: CanvasTool[] = ['pen', 'pencil', 'highlighter', 'eraser'];
const WIDTHS = [1.5, 2.5, 4];

export default function HandwritingPageScreen() {
  const t = useTheme();
  const { entryId, page: pageParam } = useLocalSearchParams<{ entryId: string; page?: string }>();
  const [viewWidth, setViewWidth] = useState(0);
  const hw = useHandwritingPage(entryId!, pageParam ?? 'new', viewWidth);
  const saveLabel = useCalmSaveState(hw.saveState);

  const colors = paper.ink;
  const [tool, setTool] = useState<CanvasTool>('pen');
  const [width, setWidth] = useState(2.5);
  const [color, setColor] = useState<string>(colors[0]);
  const [fingerScroll, setFingerScroll] = useState(false);
  const [, setTick] = useState(0);

  const close = () => {
    void hw.flush();
    if (router.canGoBack()) router.back();
  };

  const confirmDelete = () =>
    Alert.alert(copy.handwriting.deletePageConfirm, undefined, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.delete,
        style: 'destructive',
        onPress: () => {
          haptic.warning();
          void hw.deletePage().then(() => router.canGoBack() && router.back());
        },
      },
    ]);

  const pick = <T,>(set: (v: T) => void, v: T) => {
    haptic.select();
    set(v);
  };

  const session = hw.page?.session;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.bar}>
        <PressableText label={`‹ ${copy.handwriting.done}`} onPress={close} tone="accent" />
        <Animated.Text key={saveLabel} entering={fadeIn} exiting={fadeOut} style={[type.small, { color: t.faint }]}>
          {copy.save[saveLabel]}
        </Animated.Text>
        <View style={styles.row}>
          <PressableText label="↶" onPress={hw.undo} disabled={!session?.doc.canUndo} style={styles.icon} />
          <PressableText label="↷" onPress={hw.redo} disabled={!session?.doc.canRedo} style={styles.icon} />
          <PressableText label="⌫" onPress={confirmDelete} tone="danger" disabled={!session} style={styles.icon} />
        </View>
      </View>

      <View
        style={[styles.canvas, { borderColor: t.hairline, backgroundColor: paper.background }]}
        onLayout={(e) => viewWidth === 0 && setViewWidth(e.nativeEvent.layout.width)}
      >
        {hw.page && session ? (
          <Animated.View entering={fadeIn} style={StyleSheet.absoluteFill}>
            <HandwritingCanvas
              session={session}
              tool={tool}
              color={color}
              width={width}
              stylusOnly={fingerScroll}
              revision={hw.revision}
              background={hw.page.background}
              pageWidth={hw.page.width}
              pageHeight={hw.page.height}
              onPageHeight={hw.growTo}
              onChange={() => {
                hw.changed();
                setTick((n) => n + 1); // refresh undo/redo availability
              }}
            />
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.tools, { borderTopColor: t.hairline }]}>
        <View style={styles.row}>
          {TOOLS.map((x) => (
            <PressableText key={x} label={copy.handwriting[x]} onPress={() => pick(setTool, x)} tone={tool === x ? 'accent' : 'muted'} />
          ))}
        </View>
        <View style={styles.row}>
          {WIDTHS.map((w) => (
            <PressableText key={w} label={w === 1.5 ? '·' : w === 2.5 ? '•' : '●'} onPress={() => pick(setWidth, w)} tone={width === w ? 'accent' : 'muted'} style={styles.icon} />
          ))}
          <View style={styles.divider} />
          {colors.map((c) => (
            <PressableText
              key={c}
              label="●"
              onPress={() => pick(setColor, c)}
              style={{ color: c, fontSize: color === c ? 24 : 17, opacity: tool === 'eraser' ? 0.3 : 1 }}
            />
          ))}
        </View>
        <View style={styles.row}>
          {PAGE_BACKGROUNDS.map((b) => (
            <PressableText
              key={b}
              label={copy.handwriting.background[b]}
              onPress={() => pick(hw.setBackground, b)}
              tone={hw.page?.background === b ? 'accent' : 'muted'}
            />
          ))}
          <View style={styles.divider} />
          <PressableText label={copy.handwriting.stylusOnly} onPress={() => pick(setFingerScroll, !fingerScroll)} tone={fingerScroll ? 'accent' : 'muted'} />
        </View>
        <Text style={[type.small, { color: t.faint, textAlign: 'center' }]}>{copy.handwriting.hint}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.l, paddingVertical: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.l, flexWrap: 'wrap', justifyContent: 'center' },
  icon: { fontSize: 22 },
  canvas: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tools: { paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m, borderTopWidth: StyleSheet.hairlineWidth },
  divider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(140,133,124,0.4)' },
});
