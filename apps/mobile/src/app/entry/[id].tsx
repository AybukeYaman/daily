import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copy } from '../../design-system/copy';
import { PressableText } from '../../design-system/pressable-text';
import { space, type, useTheme } from '../../design-system/theme';
import { useEntryEditor } from '../../features/journaling/presentation/use-entry-editor';

export default function EntryScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const editor = useEntryEditor(id ?? 'new');
  const { initial } = editor;

  const goBack = () => {
    void editor.flush();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const confirmDelete = () =>
    Alert.alert(copy.deleteConfirmTitle, copy.deleteConfirmBody, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.delete,
        style: 'destructive',
        onPress: () => void editor.remove().then(goBack),
      },
    ]);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.topBar}>
        <PressableText label={`‹ ${copy.back}`} onPress={goBack} />
        <Text style={[type.small, { color: editor.saveState === 'error' ? t.danger : t.faint }]}>
          {copy.save[editor.saveState]}
        </Text>
        <PressableText label={copy.delete} onPress={confirmDelete} tone="danger" disabled={!initial} />
      </View>

      {initial ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {initial.isConflictCopy ? (
              <Text style={[type.small, styles.banner, { color: t.muted, backgroundColor: t.surface }]}>
                {copy.conflictCopy}
              </Text>
            ) : null}
            {/* Uncontrolled inputs: the native view owns the text, so typing costs no React render. */}
            <TextInput
              defaultValue={initial.title}
              onChangeText={editor.setTitle}
              onBlur={() => void editor.flush()}
              placeholder={copy.titlePlaceholder}
              placeholderTextColor={t.faint}
              style={[type.title, { color: t.text }]}
              returnKeyType="next"
              submitBehavior="submit"
              maxLength={300}
            />
            <TextInput
              defaultValue={initial.body}
              onChangeText={editor.setBody}
              onBlur={() => void editor.flush()}
              placeholder={copy.bodyPlaceholder}
              placeholderTextColor={t.faint}
              style={[type.body, styles.body, { color: t.text }]}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              autoFocus={!initial.title && !initial.body}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
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
  page: { paddingHorizontal: space.l, paddingBottom: 160, maxWidth: 720, width: '100%', alignSelf: 'center', gap: space.s },
  body: { minHeight: 320 },
  banner: { padding: space.m, borderRadius: 10, marginBottom: space.s },
});
