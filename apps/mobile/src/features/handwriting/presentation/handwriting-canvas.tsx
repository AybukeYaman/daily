import { MAX_COORD, type PageBackground, type Tool } from '@daily/shared';
import {
  Canvas,
  Group,
  Path,
  Picture,
  Skia,
  type SkCanvas,
  type SkPath,
  type SkPathBuilder,
  type SkPicture,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, PointerType, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import { type SharedValue, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import type { CanvasTool, HandwritingSession, StrokeStyle } from '../application/handwriting-session';
import { emptyPicture, PictureCache } from './picture-cache';
import { effectiveOpacity, effectiveWidth, makeStrokePaint } from './stroke-paint';

/** Segments kept in the mutable tail before being frozen into a picture: bounds per-event cost. */
const TAIL_SEGMENTS = 48;
const CULL = Skia.XYWHRect(-MAX_COORD, -MAX_COORD, MAX_COORD * 2, MAX_COORD * 2);
const PROBE_CAPACITY = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Ruling pitch in document px (lined and grid backgrounds). */
const RULE = 32;
/** The page grows so there is always this much empty space below the lowest ink. */
const GROW_MARGIN = 600;

export interface LatencyProbe {
  /** ms from a touch sample reaching the UI thread to the next frame callback. */
  eventToFrame: SharedValue<number[]>;
  /** ms between consecutive frames while drawing. */
  frameIntervals: SharedValue<number[]>;
  pendingEventAt: SharedValue<number>;
}

export function useLatencyProbe(): LatencyProbe {
  return {
    eventToFrame: useSharedValue<number[]>([]),
    frameIntervals: useSharedValue<number[]>([]),
    pendingEventAt: useSharedValue(0),
  };
}

function now(): number {
  'worklet';
  return performance.now();
}

function pushCapped(sv: SharedValue<number[]>, v: number): void {
  'worklet';
  sv.modify((arr) => {
    'worklet';
    arr.push(v);
    if (arr.length > PROBE_CAPACITY) arr.shift();
    return arr;
  }, false);
}

function recordPicture(draw: (canvas: SkCanvas) => void): SkPicture {
  'worklet';
  const rec = Skia.PictureRecorder();
  draw(rec.beginRecording(CULL));
  return rec.finishRecordingAsPicture();
}

function clamp(v: number, min: number, max: number): number {
  'worklet';
  return v < min ? min : v > max ? max : v;
}

interface Props {
  session: HandwritingSession;
  tool: CanvasTool;
  color: string;
  width: number;
  /** Finger touches scroll instead of drawing (palm rejection) when a stylus is in use. */
  stylusOnly?: boolean;
  /** Bump after undo/redo/clear done by the parent, to re-record committed strokes. */
  revision: number;
  /** Page ruling, drawn in document space so it zooms with the ink. */
  background?: PageBackground;
  /** Stored page height; the page grows below the lowest ink as you write. */
  pageHeight?: number;
  /**
   * Page width in document px. The page always fills the view width at zoom 1,
   * so a page written on a phone opens at the same proportions on a tablet.
   * 0 = use the view width (measurement lab).
   */
  pageWidth?: number;
  onChange?: () => void;
  /** Reports the page height needed to contain all ink plus margin. */
  onPageHeight?: (height: number) => void;
  probe?: LatencyProbe;
}

/**
 * Drawing happens entirely on the UI thread:
 *   touch → worklet → PathBuilder tail (≤ 48 segments) + frozen prefix picture → Skia
 * React never re-renders while a stroke is drawn. On lift, raw samples go to JS,
 * which simplifies, commits and appends them to the committed picture; until
 * that lands, the finished stroke stays visible in a UI-side pending picture,
 * so nothing flickers even if the next stroke starts immediately.
 *
 * Viewport: one finger draws; two fingers pinch-zoom (1–4×) and pan. Ink is
 * stored in document space, so zoom never changes what is saved.
 */
export function HandwritingCanvas({
  session,
  tool,
  color,
  width,
  stylusOnly = false,
  revision,
  background = 'blank',
  pageHeight = 0,
  pageWidth = 0,
  onChange,
  onPageHeight,
  probe,
}: Props) {
  const cache = useRef(new PictureCache()).current;
  const blank = useMemo(() => emptyPicture(), []);
  const blankPath = useMemo(() => Skia.Path.Make(), []);

  // Rendered values
  const committed = useSharedValue<SkPicture>(blank);
  const pending = useSharedValue<SkPicture>(blank);
  const prefix = useSharedValue<SkPicture>(blank);
  const tail = useSharedValue<SkPath>(blankPath);
  const tip = useSharedValue<SkPath>(blankPath);
  const liveColor = useSharedValue(color);
  const liveWidth = useSharedValue(effectiveWidth('pen', width));
  const liveOpacity = useSharedValue(1);

  // Viewport (document → screen: translate, then scale)
  const viewW = useSharedValue(0);
  const viewH = useSharedValue(0);
  const docH = useSharedValue(pageHeight);
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const gestureZoom = useSharedValue(1);
  const gestureTx = useSharedValue(0);
  const gestureTy = useSharedValue(0);
  const navigating = useSharedValue(false);
  const pageW = useSharedValue(pageWidth);
  useEffect(() => {
    pageW.value = pageWidth;
  }, [pageWidth, pageW]);
  /** Document px → view px at zoom 1. */
  const base = useDerivedValue(() => (pageW.value > 0 && viewW.value > 0 ? viewW.value / pageW.value : 1));

  // Tool settings mirrored to the UI thread
  const toolSv = useSharedValue<CanvasTool>(tool);
  const colorSv = useSharedValue(color);
  const widthSv = useSharedValue(width);
  const stylusOnlySv = useSharedValue(stylusOnly);
  useEffect(() => {
    toolSv.value = tool;
    colorSv.value = color;
    widthSv.value = width;
    stylusOnlySv.value = stylusOnly;
  }, [tool, color, width, stylusOnly, toolSv, colorSv, widthSv, stylusOnlySv]);
  useEffect(() => {
    if (pageHeight > docH.value) docH.value = pageHeight;
  }, [pageHeight, docH]);

  // UI-thread stroke state
  const builder = useSharedValue<SkPathBuilder | null>(null);
  const samples = useSharedValue<number[]>([]);
  const segments = useSharedValue(0);
  const startTime = useSharedValue(0);
  const startEpoch = useSharedValue(0);
  const prevX = useSharedValue(0);
  const prevY = useSharedValue(0);
  const active = useSharedValue(false);
  const hasPressure = useSharedValue(false);
  // Style captured at touch-down: changing tools mid-stroke never alters the stroke in progress.
  const liveTool = useSharedValue<Tool>('pen');
  const liveBaseWidth = useSharedValue(width);
  const generation = useSharedValue(0);
  const pendingStrokes = useSharedValue<{ gen: number; picture: SkPicture }[]>([]);
  const lastEraseX = useSharedValue(0);
  const lastEraseY = useSharedValue(0);

  // Committed picture follows the document (undo/redo/erase/load from the parent).
  useEffect(() => {
    committed.value = cache.rebuild(session.doc.all);
  }, [revision, session, cache, committed]);

  // --- Derived render values ------------------------------------------------------
  const matrix = useDerivedValue(() => {
    const m = Skia.Matrix();
    const s = zoom.value * base.value;
    m.translate(tx.value, ty.value);
    m.scale(s, s);
    return m;
  });

  const ruling = useDerivedValue(() => {
    const w = viewW.value / base.value;
    const h = Math.max(docH.value, viewH.value / base.value);
    const b = Skia.PathBuilder.Make();
    if (background !== 'blank' && w > 0) {
      for (let y = RULE * 2; y < h; y += RULE) b.moveTo(0, y).lineTo(w, y);
      if (background === 'grid') for (let x = RULE; x < w; x += RULE) b.moveTo(x, 0).lineTo(x, h);
    }
    return b.detach();
  }, [background]);

  // --- Viewport helpers (UI thread) ----------------------------------------------
  const clampViewport = () => {
    'worklet';
    const s = zoom.value * base.value;
    const contentW = viewW.value * zoom.value;
    const contentH = Math.max(docH.value * s, viewH.value * zoom.value);
    tx.value = clamp(tx.value, Math.min(0, viewW.value - contentW), 0);
    ty.value = clamp(ty.value, Math.min(0, viewH.value - contentH), 0);
  };

  const toDocX = (x: number) => {
    'worklet';
    return (x - tx.value) / (zoom.value * base.value);
  };
  const toDocY = (y: number) => {
    'worklet';
    return (y - ty.value) / (zoom.value * base.value);
  };

  // --- JS-thread handlers ------------------------------------------------------
  const dropPending = (gen: number) => {
    'worklet';
    pendingStrokes.value = pendingStrokes.value.filter((p) => p.gen !== gen);
    const list = pendingStrokes.value;
    pending.value = recordPicture((c) => {
      for (const p of list) c.drawPicture(p.picture);
    });
  };

  const growPage = (maxY: number) => {
    'worklet';
    const needed = maxY + GROW_MARGIN;
    if (needed > docH.value) docH.value = needed;
  };

  const commitOnJS = (raw: number[], style: StrokeStyle, startedAt: number, gen: number) => {
    const stroke = session.commit(raw, style, startedAt);
    if (stroke) {
      committed.value = cache.append(stroke, session.doc.all);
      let maxY = 0;
      for (let i = 1; i < stroke.samples.length; i += 6) maxY = Math.max(maxY, stroke.samples[i]!);
      scheduleOnUI(growPage, maxY);
      onPageHeight?.(maxY + GROW_MARGIN);
    }
    scheduleOnUI(dropPending, gen); // queued after the picture update: no gap, no double draw
    onChange?.();
  };

  const eraseOnJS = (x: number, y: number, radius: number) => {
    if (session.erase(x, y, radius) > 0) {
      committed.value = cache.rebuild(session.doc.all);
      onChange?.();
    }
  };

  // --- UI-thread drawing -----------------------------------------------------------
  const markEvent = () => {
    'worklet';
    if (probe && probe.pendingEventAt.value === 0) probe.pendingEventAt.value = now();
  };

  const pushSample = (x: number, y: number, pointer: PointerType, pressure: number, altitude: number, azimuth: number) => {
    'worklet';
    const stylus = pointer === PointerType.STYLUS;
    const t = now() - startTime.value;
    samples.modify((arr) => {
      'worklet';
      arr.push(
        x,
        y,
        t,
        stylus ? pressure : 0.5,
        stylus ? altitude / (Math.PI / 2) : 1,
        stylus ? azimuth / (Math.PI * 2) : 0,
      );
      return arr;
    }, false);
  };

  /** Drops the stroke in progress without saving (a second finger arrived: it was a zoom, not ink). */
  const abortStroke = () => {
    'worklet';
    if (!active.value) return;
    active.value = false;
    builder.value = null;
    prefix.value = blank;
    tail.value = blankPath;
    tip.value = blankPath;
  };

  /** With "stylus only", a finger scrolls the page instead of drawing. */
  const isFingerScroll = (pointer: PointerType) => {
    'worklet';
    return stylusOnlySv.value && pointer !== PointerType.STYLUS;
  };

  const draw = usePanGesture({
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      'worklet';
      if (navigating.value) return;
      if (isFingerScroll(e.pointerType)) {
        gestureTx.value = tx.value;
        gestureTy.value = ty.value;
        return;
      }
      const x = toDocX(e.x);
      const y = toDocY(e.y);
      if (toolSv.value === 'eraser') {
        lastEraseX.value = x;
        lastEraseY.value = y;
        scheduleOnRN(eraseOnJS, x, y, (widthSv.value * 3) / (zoom.value * base.value));
        return;
      }
      const t: Tool = toolSv.value;
      active.value = true;
      hasPressure.value = e.pointerType === PointerType.STYLUS;
      startTime.value = now();
      startEpoch.value = Date.now();
      samples.value = [];
      pushSample(x, y, e.pointerType, e.stylusData?.pressure ?? 0.5, e.stylusData?.altitudeAngle ?? 0, e.stylusData?.azimuthAngle ?? 0);
      prevX.value = x;
      prevY.value = y;
      segments.value = 0;

      liveTool.value = t;
      liveBaseWidth.value = widthSv.value;
      liveColor.value = colorSv.value;
      liveWidth.value = effectiveWidth(t, widthSv.value);
      liveOpacity.value = effectiveOpacity(t);

      const b = Skia.PathBuilder.Make();
      b.moveTo(x, y);
      builder.value = b;
      prefix.value = recordPicture(() => {});
      tail.value = blankPath;
      // A dot appears under the finger on touch-down, before any movement.
      tip.value = Skia.PathBuilder.Make().moveTo(x, y).lineTo(x + 0.01, y).detach();
      markEvent();
    },
    onUpdate: (e) => {
      'worklet';
      if (navigating.value || e.numberOfPointers > 1) {
        abortStroke();
        return;
      }
      if (isFingerScroll(e.pointerType)) {
        tx.value = gestureTx.value + e.translationX;
        ty.value = gestureTy.value + e.translationY;
        clampViewport();
        return;
      }
      const x = toDocX(e.x);
      const y = toDocY(e.y);
      if (toolSv.value === 'eraser') {
        const r = (widthSv.value * 3) / (zoom.value * base.value);
        const dx = x - lastEraseX.value;
        const dy = y - lastEraseY.value;
        if (dx * dx + dy * dy >= (r / 2) * (r / 2)) {
          lastEraseX.value = x;
          lastEraseY.value = y;
          scheduleOnRN(eraseOnJS, x, y, r);
        }
        return;
      }
      const b = builder.value;
      if (!active.value || !b) return;
      pushSample(x, y, e.pointerType, e.stylusData?.pressure ?? 0.5, e.stylusData?.altitudeAngle ?? 0, e.stylusData?.azimuthAngle ?? 0);

      // Same smoothing as the committed stroke: quad through midpoints, previous sample as control.
      const mx = (prevX.value + x) / 2;
      const my = (prevY.value + y) / 2;
      b.quadTo(prevX.value, prevY.value, mx, my);
      prevX.value = x;
      prevY.value = y;
      segments.value += 1;

      if (segments.value >= TAIL_SEGMENTS) {
        // Freeze the tail into the prefix picture and restart the builder at the join point.
        const frozenTail = b.build();
        const prev = prefix.value;
        const paint = makeStrokePaint(liveTool.value, liveColor.value, liveBaseWidth.value);
        prefix.value = recordPicture((c) => {
          c.drawPicture(prev);
          c.drawPath(frozenTail, paint);
        });
        b.reset();
        b.moveTo(mx, my);
        segments.value = 0;
        tail.value = blankPath;
      } else {
        tail.value = b.build();
      }
      // Ink reaches the finger: straight tip from the last midpoint to the current sample.
      tip.value = Skia.PathBuilder.Make().moveTo(mx, my).lineTo(x, y).detach();
      markEvent();
    },
    onFinalize: (e) => {
      'worklet';
      const b = builder.value;
      if (!active.value || !b) return;
      if (e.canceled || navigating.value) {
        abortStroke();
        return;
      }
      active.value = false;
      b.lineTo(prevX.value, prevY.value);
      const finalTail = b.detach();
      builder.value = null;

      const t = liveTool.value;
      const paint = makeStrokePaint(t, liveColor.value, liveBaseWidth.value);
      const prev = prefix.value;
      const strokePicture = recordPicture((c) => {
        c.drawPicture(prev);
        c.drawPath(finalTail, paint);
      });
      generation.value += 1;
      const gen = generation.value;
      pendingStrokes.value = [...pendingStrokes.value, { gen, picture: strokePicture }];
      const before = pending.value;
      pending.value = recordPicture((c) => {
        c.drawPicture(before);
        c.drawPicture(strokePicture);
      });

      prefix.value = blank;
      tail.value = blankPath;
      tip.value = blankPath;

      const style: StrokeStyle = {
        tool: t,
        color: liveColor.value,
        width: liveBaseWidth.value,
        hasPressure: hasPressure.value,
        hasTilt: hasPressure.value,
      };
      scheduleOnRN(commitOnJS, samples.value, style, startEpoch.value, gen);
    },
  });

  // --- Two-finger zoom and pan ------------------------------------------------------
  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      navigating.value = true;
      abortStroke();
      gestureZoom.value = zoom.value;
      gestureTx.value = tx.value;
      gestureTy.value = ty.value;
    },
    onUpdate: (e) => {
      'worklet';
      const next = clamp(gestureZoom.value * e.scale, MIN_ZOOM * 0.9, MAX_ZOOM * 1.1);
      const k = next / gestureZoom.value;
      // Keep the point under the fingers fixed while scaling.
      tx.value = e.focalX - (e.focalX - gestureTx.value) * k;
      ty.value = e.focalY - (e.focalY - gestureTy.value) * k;
      zoom.value = next;
    },
    onFinalize: () => {
      'worklet';
      // Pinching slightly past the limits feels elastic; on release, snap back inside them.
      zoom.value = clamp(zoom.value, MIN_ZOOM, MAX_ZOOM);
      clampViewport();
      navigating.value = false;
    },
  });

  const twoFingerPan = usePanGesture({
    minPointers: 2,
    onBegin: () => {
      'worklet';
      navigating.value = true;
      abortStroke();
    },
    onUpdate: (e) => {
      'worklet';
      tx.value += e.changeX;
      ty.value += e.changeY;
      clampViewport();
    },
    onFinalize: () => {
      'worklet';
      clampViewport();
      navigating.value = false;
    },
  });

  const gestures = useSimultaneousGestures(draw, pinch, twoFingerPan);

  // Latency probe: only runs when a probe is attached (measurement lab).
  useFrameCallback((frame) => {
    'worklet';
    if (!probe) return;
    if (frame.timeSincePreviousFrame !== null && active.value) pushCapped(probe.frameIntervals, frame.timeSincePreviousFrame);
    const at = probe.pendingEventAt.value;
    if (at > 0) {
      pushCapped(probe.eventToFrame, now() - at);
      probe.pendingEventAt.value = 0;
    }
  }, probe !== undefined);

  return (
    <GestureDetector gesture={gestures}>
      <Canvas
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          viewW.value = e.nativeEvent.layout.width;
          viewH.value = e.nativeEvent.layout.height;
        }}
      >
        <Group matrix={matrix}>
          <Path path={ruling} color="rgba(140,133,124,0.22)" style="stroke" strokeWidth={1} />
          <Picture picture={committed} />
          <Picture picture={pending} />
          <Picture picture={prefix} />
          <Path path={tail} color={liveColor} strokeWidth={liveWidth} opacity={liveOpacity} style="stroke" strokeCap="round" strokeJoin="round" />
          <Path path={tip} color={liveColor} strokeWidth={liveWidth} opacity={liveOpacity} style="stroke" strokeCap="round" strokeJoin="round" />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}
