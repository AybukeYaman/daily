# ADR 0004 — Handwriting engine

Status: accepted for prototyping (Phase 4a). Release gated on device measurements (docs/MEASURE.md) on Galaxy S26 (finger) and iPad Pro M4 + Apple Pencil.

## Rendering
- `@shopify/react-native-skia` 2.14 + `react-native-gesture-handler` 3 (`usePanGesture`) + Reanimated 4 / Worklets. Every touch sample is handled in a worklet on the UI thread; React does not render during a stroke.
- Skia 2.x paths are immutable (`PathBuilder.build()` copies). To keep per-event cost constant, the live stroke is split into a **tail** builder of at most 48 segments and a **prefix** picture; every 48 segments the tail is frozen into the prefix (nesting depth = stroke length / 48).
- A short **tip** segment from the last midpoint to the current sample makes ink reach the finger, hiding the half-segment lag inherent to midpoint smoothing.
- Committed strokes are one `SkPicture`. A new stroke is appended in O(1); the picture is re-recorded flat after 64 appends, or after erase/undo.
- On lift, the finished stroke moves into a UI-side **pending** picture until the JS commit lands, so the next stroke can start immediately with no flicker or gap.

## Data
- Strokes are flat sample arrays (stride 6: x, y, t, pressure, altitude, azimuth); finger strokes store no pressure/tilt.
- Commit: Ramer–Douglas–Peucker (ε = 0.3 px, pressure as a third dimension), iterative.
- Storage: binary codec — 0.1 px quantization, delta + zigzag varints, 16-byte UUIDs, base64url. ~10× smaller than JSON. Node benchmark for 600 k samples: encode ~170 ms, decode ~170 ms (base64 was the bottleneck at ~700 ms before switching to buffer-based conversion).
- Eraser: uniform-grid spatial index + exact segment distance; ~0.01–0.07 ms per eraser move over 5 000 strokes (Node).
- Undo/redo stores stroke references, never copies of samples; history capped at 200 commands.

## Integration (Phase 4b)
- An entry's content is `[typed block, ...handwriting pages]`. Each page is a `handwriting` block: base64url strokes, page width/height in document px, background (blank/lined/grid).
- Text editor and page screen write different blocks through a transactional read-modify-write (`EntryStore.update`), so neither can overwrite the other.
- Pages save ~400 ms after each change and immediately on leave/background; an empty page is removed; an entry left with no words and no ink is discarded.
- Viewport: one finger draws; two fingers pinch (1–4×) and pan; with "finger scroll" on, a finger scrolls and only the stylus draws. A stroke interrupted by a second finger is discarded.
- Pages render on paper colour with fixed ink colours in both themes. Page width is stored, so a phone page opens at the same proportions on a tablet.
- Sync: a device push is capped at 4 MB of payload (server accepts 16 MB), so large pages travel in separate requests.

## Known gaps (Phase 4c+)
- Live pressure rendering: the live stroke is constant-width; pressure strokes are filled outlines once committed. On iPad this must be validated (visual change at lift).
- If measured latency misses the budget, the fallback is a native drawing view (Android `SurfaceView` / iOS `PencilKit`) behind the same `HandwritingSession` data model.
