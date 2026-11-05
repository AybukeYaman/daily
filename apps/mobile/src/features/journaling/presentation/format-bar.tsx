import { memo, type RefObject, useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EnrichedTextInputInstance, OnChangeStateEvent } from 'react-native-enriched-html';
import { observable, type Observable } from '../../../core/application/observable';
import { barEntering, barExiting, haptic } from '../../../design-system/motion';
import { PressScale } from '../../../design-system/press-scale';
import { space, useTheme } from '../../../design-system/theme';

type Active = Record<'bold' | 'italic' | 'underline' | 'h2' | 'ul' | 'ol' | 'quote', boolean>;

const NONE: Active = { bold: false, italic: false, underline: false, h2: false, ul: false, ol: false, quote: false };

/** Format state is pushed here from the editor's events; only the bar re-renders. */
export function createFormatState(): Observable<Active> {
  return observable(NONE);
}

export function toActive(e: OnChangeStateEvent): Active {
  return {
    bold: e.bold.isActive,
    italic: e.italic.isActive,
    underline: e.underline.isActive,
    h2: e.h2.isActive,
    ul: e.unorderedList.isActive,
    ol: e.orderedList.isActive,
    quote: e.blockQuote.isActive,
  };
}

const BUTTONS: { key: keyof Active; label: string; style?: object; a11y: string; run: (e: EnrichedTextInputInstance) => void }[] = [
  { key: 'bold', label: 'B', style: { fontWeight: '700' }, a11y: 'Kalın', run: (e) => e.toggleBold() },
  { key: 'italic', label: 'I', style: { fontStyle: 'italic' }, a11y: 'İtalik', run: (e) => e.toggleItalic() },
  { key: 'underline', label: 'U', style: { textDecorationLine: 'underline' }, a11y: 'Altı çizili', run: (e) => e.toggleUnderline() },
  { key: 'h2', label: 'H', style: { fontWeight: '700' }, a11y: 'Başlık', run: (e) => e.toggleH2() },
  { key: 'ul', label: '•', a11y: 'Madde listesi', run: (e) => e.toggleUnorderedList() },
  { key: 'ol', label: '1.', a11y: 'Numaralı liste', run: (e) => e.toggleOrderedList() },
  { key: 'quote', label: '“', a11y: 'Alıntı', run: (e) => e.toggleBlockQuote() },
];

interface Props {
  editorRef: RefObject<EnrichedTextInputInstance | null>;
  state: Observable<Active>;
  focused: Observable<boolean>;
}

/** Seven quiet controls, visible only while writing. */
export const FormatBar = memo(function FormatBar({ editorRef, state, focused }: Props) {
  const t = useTheme();
  const active = useSyncExternalStore(state.subscribe, state.get, state.get);
  const isFocused = useSyncExternalStore(focused.subscribe, focused.get, focused.get);
  // Small delay on hide so tapping a button (which may blur briefly on Android) does not flicker.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(false), 150);
    return () => clearTimeout(timer);
  }, [isFocused]);

  if (!visible) return null;
  return (
    <Animated.View
      entering={barEntering}
      exiting={barExiting}
      style={[styles.bar, { borderTopColor: t.hairline, backgroundColor: t.background }]}
    >
      {BUTTONS.map((b) => (
        <PressScale
          key={b.key}
          scaleTo={0.85}
          onPress={() => {
            if (!editorRef.current) return;
            haptic.select();
            b.run(editorRef.current);
          }}
          accessibilityRole="button"
          accessibilityLabel={b.a11y}
          accessibilityState={{ selected: active[b.key] }}
          hitSlop={6}
          style={styles.button}
        >
          <Text style={[styles.label, b.style, { color: active[b.key] ? t.accent : t.muted }]}>{b.label}</Text>
        </PressScale>
      ))}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: { minWidth: 36, alignItems: 'center', paddingVertical: space.xs },
  label: { fontSize: 18, fontFamily: 'Georgia' },
});
