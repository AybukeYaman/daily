import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnrichedTextInput } from 'react-native-enriched-html';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copy, formatDay } from '../../design-system/copy';
import { PressableText } from '../../design-system/pressable-text';
import { Sheet } from '../../design-system/sheet';
import { space, type, useTheme } from '../../design-system/theme';
import { monthOf } from '../../features/calendar/application/month';
import { MonthView } from '../../features/calendar/presentation/month-view';
import { createFormatState, FormatBar, toActive } from '../../features/journaling/presentation/format-bar';
import { useEntryEditor } from '../../features/journaling/presentation/use-entry-editor';

/** Markdown-style shortcuts: format without leaving the keyboard. */
const SHORTCUTS = [
  { trigger: '- ', style: 'unordered_list' as const },
  { trigger: '1. ', style: 'ordered_list' as const },
  { trigger: '> ', style: 'blockquote' as const },
  { trigger: '## ', style: 'h2' as const },
];

export default function EntryScreen() {
  const t = useTheme();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const editor = useEntryEditor(id ?? 'new', date);
  const { initial, meta } = editor;
  const formatState = useRef(createFormatState()).current;
  const [sheet, setSheet] = useState<'none' | 'menu' | 'date'>('none');
  const [pickerMonth, setPickerMonth] = useState(() => monthOf(meta.entryDate));

  const goBack = () => {
    void editor.flush();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const confirmDelete = () => {
    setSheet('none');
    Alert.alert(copy.deleteConfirmTitle, copy.deleteConfirmBody, [
      { text: copy.cancel, style: 'cancel' },
      { text: copy.delete, style: 'destructive', onPress: () => void editor.remove().then(goBack) },
    ]);
  };

  const openHistory = async () => {
    setSheet('none');
    await editor.flush();
    const entryId = editor.entryId();
    if (entryId) router.push(`/history/${entryId}`);
  };

  const htmlStyle = {
    h2: { fontSize: 22, bold: true },
    blockquote: { borderColor: t.hairline, borderWidth: 3, gapWidth: 12, color: t.muted },
    a: { color: t.accent, textDecorationLine: 'underline' as const },
    ul: { bulletColor: t.muted, bulletSize: 5, marginLeft: 4, gapWidth: 10 },
    ol: { markerColor: t.muted, gapWidth: 8, marginLeft: 4 },
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.topBar}>
        <PressableText label={`‹ ${copy.back}`} onPress={goBack} />
        <Text style={[type.small, { color: editor.saveState === 'error' ? t.danger : t.faint }]}>
          {copy.save[editor.saveState]}
        </Text>
        <View style={styles.topActions}>
          <PressableText
            label={meta.favorite ? '★' : '☆'}
            onPress={() => editor.setFavorite(!meta.favorite)}
            tone={meta.favorite ? 'accent' : 'muted'}
            style={styles.icon}
          />
          <PressableText label="•••" onPress={() => setSheet('menu')} disabled={!initial} />
        </View>
      </View>

      {initial ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <PressableText label={formatDay(meta.entryDate)} onPress={() => setSheet('date')} style={type.small} />
            {initial.isConflictCopy ? (
              <Text style={[type.small, styles.banner, { color: t.muted, backgroundColor: t.surface }]}>{copy.conflictCopy}</Text>
            ) : null}
            {/* Uncontrolled inputs: native views own the text, so typing costs no React render. */}
            <TextInput
              defaultValue={initial.title}
              onChangeText={editor.setTitle}
              onBlur={() => void editor.flush()}
              placeholder={copy.titlePlaceholder}
              placeholderTextColor={t.faint}
              style={[type.title, { color: t.text }]}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => editor.editorRef.current?.focus()}
              maxLength={300}
            />
            <EnrichedTextInput
              ref={editor.editorRef}
              defaultValue={initial.html}
              onChangeText={(e) => editor.setText(e.nativeEvent.value)}
              onChangeState={(e) => formatState.set(toActive(e.nativeEvent))}
              onFocus={() => editor.focused.set(true)}
              onBlur={() => {
                editor.focused.set(false);
                void editor.flush();
              }}
              placeholder={copy.bodyPlaceholder}
              placeholderTextColor={t.faint}
              cursorColor={t.accent}
              selectionColor={t.accent}
              htmlStyle={htmlStyle}
              textShortcuts={SHORTCUTS}
              scrollEnabled={false}
              autoFocus={!initial.title && !initial.html}
              style={{ ...type.body, color: t.text, minHeight: 320 }}
            />
          </ScrollView>
          <FormatBar editorRef={editor.editorRef} state={formatState} focused={editor.focused} />
        </KeyboardAvoidingView>
      ) : null}

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet('none')}>
        <PressableText
          label={copy.changeDate}
          onPress={() => {
            setPickerMonth(monthOf(meta.entryDate));
            setSheet('date');
          }}
        />
        <PressableText
          label={meta.archived ? copy.unarchive : copy.archive}
          onPress={() => {
            editor.setArchived(!meta.archived);
            setSheet('none');
          }}
        />
        <PressableText label={copy.history} onPress={() => void openHistory()} />
        <PressableText label={copy.delete} onPress={confirmDelete} tone="danger" />
      </Sheet>

      <Sheet visible={sheet === 'date'} onClose={() => setSheet('none')}>
        <MonthView
          month={pickerMonth}
          onMonthChange={setPickerMonth}
          selected={meta.entryDate}
          onSelect={(iso) => {
            editor.setEntryDate(iso);
            setSheet('none');
          }}
        />
      </Sheet>
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  icon: { fontSize: 20 },
  page: { paddingHorizontal: space.l, paddingBottom: 160, maxWidth: 720, width: '100%', alignSelf: 'center', gap: space.s },
  banner: { padding: space.m, borderRadius: 10, marginBottom: space.s },
});
