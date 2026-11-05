import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { expoIds, systemClock } from '../../core/infrastructure/platform-adapters';
import { PressableText } from '../../design-system/pressable-text';
import { space, type, useTheme } from '../../design-system/theme';
import { type CanvasTool, HandwritingSession } from '../../features/handwriting/application/handwriting-session';
import { distribution, frameHealth } from '../../features/handwriting/application/latency-stats';
import { syntheticPage, totalSamples } from '../../features/handwriting/application/synthetic-strokes';
import { HandwritingCanvas, useLatencyProbe } from '../../features/handwriting/presentation/handwriting-canvas';
import { PictureCache } from '../../features/handwriting/presentation/picture-cache';

const TOOLS: { tool: CanvasTool; label: string }[] = [
  { tool: 'pen', label: 'Kalem' },
  { tool: 'pencil', label: 'Kurşun' },
  { tool: 'highlighter', label: 'Fosforlu' },
  { tool: 'eraser', label: 'Silgi' },
];
const WIDTHS = [1.5, 2.5, 4];
const COLORS = ['#2a2724', '#b07d52', '#3d6fb6'];

interface Timing {
  label: string;
  ms: number;
  detail?: string;
}

function time<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const out = fn();
  return [out, performance.now() - t0];
}

const ms = (v: number) => `${v.toFixed(1)} ms`;

/** Hermes exposes heap stats; other engines return null. */
function heapMB(): string {
  const stats = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal?.getInstrumentedStats?.();
  const bytes = stats?.js_heapSize;
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '—';
}

/**
 * Phase 4a measurement lab. Draw normally, then read the numbers. All timings
 * are on-device; see docs/MEASURE.md for the camera method for true
 * touch-to-photon latency.
 */
export default function HandwritingLab() {
  const t = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const probe = useLatencyProbe();
  const [session, setSession] = useState(() => new HandwritingSession(expoIds, systemClock));
  const [revision, setRevision] = useState(0);
  const [tool, setTool] = useState<CanvasTool>('pen');
  const [width, setWidth] = useState(2.5);
  const [color, setColor] = useState(COLORS[0]!);
  const [stylusOnly, setStylusOnly] = useState(false);
  const [timings, setTimings] = useState<Timing[]>([]);
  const [, setTick] = useState(0);
  const counter = useRef(0);

  // Read probe numbers once a second; drawing itself never waits on React.
  useEffect(() => {
    const id = setInterval(() => setTick(++counter.current), 1000);
    return () => clearInterval(id);
  }, []);

  const latency = distribution(probe.eventToFrame.value);
  const frames = frameHealth(probe.frameIntervals.value);
  const strokes = session.doc.all.length;
  const { rawSamples, keptSamples } = session.stats;
  const saved = useMemo(() => session.serialize().length, [session, strokes]); // eslint-disable-line react-hooks/exhaustive-deps

  const bump = () => setRevision((r) => r + 1);
  const addTiming = (...items: Timing[]) => setTimings((prev) => [...items, ...prev].slice(0, 8));

  const stress = (count: number) => {
    const [page, gen] = time(() => syntheticPage(count, screenWidth, expoIds));
    const [next, index] = time(() => new HandwritingSession(expoIds, systemClock, page));
    const [, record] = time(() => new PictureCache().rebuild(page));
    setSession(next);
    bump();
    addTiming(
      { label: `${count} çizgi üret`, ms: gen, detail: `${totalSamples(page)} nokta` },
      { label: 'Belge + uzamsal indeks', ms: index },
      { label: 'Resmi baştan kaydet (Skia)', ms: record },
    );
  };

  const roundTrip = () => {
    const [text, encode] = time(() => session.serialize());
    const [decoded, decode] = time(() => HandwritingSession.deserialize(text));
    addTiming(
      { label: 'Kodla', ms: encode, detail: `${(text.length / 1024).toFixed(1)} KB` },
      { label: 'Çöz', ms: decode, detail: `${decoded.length} çizgi` },
    );
  };

  const resetProbe = () => {
    probe.eventToFrame.value = [];
    probe.frameIntervals.value = [];
    setTick(++counter.current);
  };

  const text = [type.small, { color: t.muted }];
  const value = [type.small, { color: t.text, fontVariant: ['tabular-nums' as const] }];

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <View style={styles.bar}>
        <PressableText label="‹ Geri" onPress={() => router.back()} />
        <PressableText label="Geri al" onPress={() => session.undo() && bump()} disabled={!session.doc.canUndo} />
        <PressableText label="Yinele" onPress={() => session.redo() && bump()} disabled={!session.doc.canRedo} />
        <PressableText
          label="Temizle"
          tone="danger"
          onPress={() => {
            setSession(new HandwritingSession(expoIds, systemClock));
            bump();
          }}
        />
      </View>

      <View style={styles.bar}>
        {TOOLS.map((x) => (
          <PressableText key={x.tool} label={x.label} onPress={() => setTool(x.tool)} tone={tool === x.tool ? 'accent' : 'muted'} />
        ))}
      </View>
      <View style={styles.bar}>
        {WIDTHS.map((w) => (
          <PressableText key={w} label={`${w}`} onPress={() => setWidth(w)} tone={width === w ? 'accent' : 'muted'} />
        ))}
        {COLORS.map((c) => (
          <PressableText key={c} label="●" onPress={() => setColor(c)} style={{ color: c, fontSize: color === c ? 22 : 16 }} />
        ))}
        <View style={styles.toggle}>
          <Text style={text}>Sadece kalem</Text>
          <Switch value={stylusOnly} onValueChange={setStylusOnly} />
        </View>
      </View>

      <View style={[styles.canvas, { borderColor: t.hairline, backgroundColor: t.surface }]}>
        <HandwritingCanvas
          session={session}
          tool={tool}
          color={color}
          width={width}
          stylusOnly={stylusOnly}
          revision={revision}
          onChange={() => setTick(++counter.current)}
          probe={probe}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={value}>
          Olay → kare  p50 {ms(latency.p50)} · p95 {ms(latency.p95)} · max {ms(latency.max)} (n={latency.count})
        </Text>
        <Text style={value}>
          Ekran {frames.refreshHz || '—'} Hz · bütçe {frames.budgetMs ? ms(frames.budgetMs) : '—'} · takılan kare{' '}
          {(frames.droppedRatio * 100).toFixed(1)}%
        </Text>
        <Text style={value}>
          {strokes} çizgi · {rawSamples} → {keptSamples} nokta (
          {rawSamples ? Math.round((1 - keptSamples / rawSamples) * 100) : 0}% azaltma) · {(saved / 1024).toFixed(1)} KB · JS
          heap {heapMB()}
        </Text>
        <View style={styles.actions}>
          <PressableText label="Stres 1.000" onPress={() => stress(1000)} tone="accent" />
          <PressableText label="Stres 5.000" onPress={() => stress(5000)} tone="accent" />
          <PressableText label="Kaydet/yükle" onPress={roundTrip} tone="accent" />
          <PressableText label="Ölçümü sıfırla" onPress={resetProbe} />
        </View>
        {timings.map((x, i) => (
          <Text key={i} style={text}>
            {x.label}: <Text style={value}>{ms(x.ms)}</Text>
            {x.detail ? ` · ${x.detail}` : ''}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.l, paddingHorizontal: space.l, paddingVertical: space.xs, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginLeft: 'auto' },
  canvas: { flex: 1, margin: space.m, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  panel: { maxHeight: 190 },
  panelContent: { paddingHorizontal: space.l, paddingBottom: space.l, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.l, marginVertical: space.s },
});
