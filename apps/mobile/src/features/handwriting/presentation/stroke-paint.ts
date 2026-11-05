import { PaintStyle, Skia, type SkPaint, StrokeCap, StrokeJoin } from '@shopify/react-native-skia';
import type { Tool } from '@daily/shared';

/**
 * Tool appearance, shared by the UI-thread live stroke and the JS-thread
 * committed picture, so a stroke never visibly changes when it is committed.
 */
export function effectiveWidth(tool: Tool, width: number): number {
  'worklet';
  return tool === 'highlighter' ? width * 5 : tool === 'pencil' ? width * 0.8 : width;
}

export function effectiveOpacity(tool: Tool): number {
  'worklet';
  return tool === 'highlighter' ? 0.35 : tool === 'pencil' ? 0.8 : 1;
}

export function makeStrokePaint(tool: Tool, color: string, width: number, fill = false): SkPaint {
  'worklet';
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setAlphaf(p.getAlphaf() * effectiveOpacity(tool));
  if (fill) {
    p.setStyle(PaintStyle.Fill);
  } else {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(effectiveWidth(tool, width));
    p.setStrokeCap(tool === 'highlighter' ? StrokeCap.Square : StrokeCap.Round);
    p.setStrokeJoin(StrokeJoin.Round);
  }
  return p;
}
