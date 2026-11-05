import { CredentialsSchema } from '@daily/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useContainer, useObservable } from '../core/container-context';
import { copy } from '../design-system/copy';
import { PressableText } from '../design-system/pressable-text';
import { space, type, useTheme } from '../design-system/theme';

export default function Settings() {
  const t = useTheme();
  const { session, sync } = useContainer();
  const signedIn = useObservable(session.signedIn);
  const status = useObservable(sync.status);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (mode: 'signIn' | 'signUp') => {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Geçersiz bilgi');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await (mode === 'signIn' ? session.signIn(parsed.data) : session.signUp(parsed.data));
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [type.ui, styles.input, { color: t.text, borderBottomColor: t.hairline }];

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.topBar}>
        <PressableText label={`‹ ${copy.back}`} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={[styles.group, styles.links]}>
          <PressableText label={copy.archiveTitle} onPress={() => router.push('/archive')} />
          <PressableText label={copy.trashTitle} onPress={() => router.push('/trash')} />
          {/* Phase 4a only: measurement lab for the handwriting engine. Removed before release. */}
          <PressableText label="Kalem laboratuvarı (deneysel)" onPress={() => router.push('/lab/handwriting')} />
        </View>

        <Text style={[type.overline, { color: t.muted, marginTop: space.xl }]}>{copy.account.section}</Text>
        {signedIn ? (
          <View style={styles.group}>
            <Text style={[type.ui, { color: t.text }]}>{copy.account.signedIn}</Text>
            <PressableText label={copy.account.signOut} onPress={() => void session.signOut()} tone="danger" />
          </View>
        ) : (
          <View style={styles.group}>
            <Text style={[type.small, { color: t.muted }]}>{copy.account.explain}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={copy.account.email}
              placeholderTextColor={t.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={copy.account.password}
              placeholderTextColor={t.faint}
              secureTextEntry
              autoComplete="password"
              style={input}
            />
            {error ? <Text style={[type.small, { color: t.danger }]}>{error}</Text> : null}
            <View style={styles.actions}>
              <PressableText label={copy.account.signIn} onPress={() => void submit('signIn')} tone="accent" disabled={busy} />
              <PressableText label={copy.account.signUp} onPress={() => void submit('signUp')} disabled={busy} />
            </View>
          </View>
        )}

        <Text style={[type.overline, { color: t.muted, marginTop: space.xl }]}>{copy.syncSection}</Text>
        <View style={styles.group}>
          <Text style={[type.ui, { color: t.text }]}>{copy.sync[status.phase]}</Text>
          {status.pending > 0 ? <Text style={[type.small, { color: t.muted }]}>{copy.pending(status.pending)}</Text> : null}
          {status.lastSyncedAt ? (
            <Text style={[type.small, { color: t.muted }]}>{copy.lastSynced(status.lastSyncedAt)}</Text>
          ) : null}
          {status.lastError ? <Text style={[type.small, { color: t.danger }]}>{status.lastError}</Text> : null}
          {signedIn ? (
            <View style={styles.actions}>
              <PressableText label={copy.syncNow} onPress={() => void sync.syncNow()} tone="accent" />
              {status.failed > 0 ? <PressableText label={copy.retryFailed} onPress={() => void sync.retryFailed()} /> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingHorizontal: space.l, paddingVertical: space.s },
  page: { paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: { gap: space.m, marginTop: space.m },
  input: { paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: space.l, marginTop: space.s },
  links: { marginTop: 0 },
});
