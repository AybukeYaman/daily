import { centerlineCommands, LINE, MAX_COORD, MOVE, QUAD, type Stroke, variableWidthOutline } from '@daily/shared';
import { Skia, type SkPaint, type SkPath, type SkPicture } from '@shopify/react-native-skia';
import { makeStrokePaint } from './stroke-paint';

const CULL = Skia.XYWHRect(-MAX_COORD, -MAX_COORD, MAX_COORD * 2, MAX_COORD * 2);
/** Appends nest one picture inside the next; flatten before the nesting gets deep. */
const MAX_NESTING = 64;

export function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(CULL);
  return rec.finishRecordingAsPicture();
}

function strokePath(stroke: Stroke): SkPath {
  const b = Skia.PathBuilder.Make();
  if (stroke.hasPressure && stroke.samples.length > 6) {
    const pts = variableWidthOutline(stroke);
    b.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i]!, pts[i + 1]!);
    b.close();
    return b.detach();
  }
  const c = centerlineCommands(stroke.samples);
  for (let i = 0; i < c.length; ) {
    switch (c[i]) {
      case MOVE:
        b.moveTo(c[i + 1]!, c[i + 2]!);
        i += 3;
        break;
      case QUAD:
        b.quadTo(c[i + 1]!, c[i + 2]!, c[i + 3]!, c[i + 4]!);
        i += 5;
        break;
      case LINE:
        b.lineTo(c[i + 1]!, c[i + 2]!);
        i += 3;
        break;
      default:
        throw new Error(`Unknown path command ${c[i]}`);
    }
  }
  return b.detach();
}

/**
 * Committed strokes as one SkPicture: the canvas draws a single picture per
 * frame instead of thousands of paths. A new stroke is appended in O(1)
 * (old picture + one path); erase/undo re-record once.
 */
export class PictureCache {
  private picture: SkPicture = emptyPicture();
  private nesting = 0;
  private readonly paints = new Map<string, SkPaint>();

  get current(): SkPicture {
    return this.picture;
  }

  append(stroke: Stroke, all: readonly Stroke[]): SkPicture {
    if (this.nesting >= MAX_NESTING) return this.rebuild(all);
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(CULL);
    canvas.drawPicture(this.picture);
    canvas.drawPath(strokePath(stroke), this.paintFor(stroke));
    this.picture = rec.finishRecordingAsPicture();
    this.nesting++;
    return this.picture;
  }

  rebuild(all: readonly Stroke[]): SkPicture {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(CULL);
    for (const s of all) canvas.drawPath(strokePath(s), this.paintFor(s));
    this.picture = rec.finishRecordingAsPicture();
    this.nesting = 0;
    return this.picture;
  }

  private paintFor(s: Stroke): SkPaint {
    const fill = s.hasPressure && s.samples.length > 6;
    const key = `${s.tool}|${s.color}|${s.width}|${fill}`;
    let paint = this.paints.get(key);
    if (!paint) this.paints.set(key, (paint = makeStrokePaint(s.tool, s.color, s.width, fill)));
    return paint;
  }
}
