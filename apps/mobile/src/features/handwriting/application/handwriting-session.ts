import {
  decodeStrokes,
  encodeStrokes,
  fromBase64Url,
  HandwritingDocument,
  simplifySamples,
  STRIDE,
  type Stroke,
  toBase64Url,
  type Tool,
} from '@daily/shared';
import type { Clock, IdGenerator } from '../../../core/application/ports';

export type CanvasTool = Tool | 'eraser';

export interface StrokeStyle {
  tool: Tool;
  color: string;
  width: number;
  hasPressure: boolean;
  hasTilt: boolean;
}

/** Simplification tolerance in px: below what the eye can see on a retina screen. */
const SIMPLIFY_EPSILON = 0.3;

interface SessionStats {
  rawSamples: number;
  keptSamples: number;
}

/**
 * JS-side owner of a handwriting page. The UI thread draws the live stroke;
 * once lifted, the raw samples land here to be simplified and committed.
 * Pure TypeScript: no React, no Skia, fully unit-testable.
 */
export class HandwritingSession {
  readonly doc: HandwritingDocument;
  readonly stats: SessionStats = { rawSamples: 0, keptSamples: 0 };

  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    initial: readonly Stroke[] = [],
  ) {
    this.doc = new HandwritingDocument(initial);
  }

  /** Simplifies and commits raw samples. Returns null for an empty gesture. */
  commit(raw: readonly number[], style: StrokeStyle, startedAt: number = this.clock.now().getTime()): Stroke | null {
    if (raw.length < STRIDE || raw.length % STRIDE !== 0) return null;
    const samples = simplifySamples(raw as number[], SIMPLIFY_EPSILON, style.hasPressure ? style.width : 0);
    this.stats.rawSamples += raw.length / STRIDE;
    this.stats.keptSamples += samples.length / STRIDE;
    const stroke: Stroke = { id: this.ids.uuid(), ...style, startedAt, samples };
    this.doc.add(stroke);
    return stroke;
  }

  erase(x: number, y: number, radius: number): number {
    return this.doc.eraseAt(x, y, radius);
  }

  undo(): boolean {
    return this.doc.undo();
  }

  redo(): boolean {
    return this.doc.redo();
  }

  /** Compact text form for storage (see codec). */
  serialize(): string {
    return toBase64Url(encodeStrokes(this.doc.all));
  }

  static deserialize(text: string): Stroke[] {
    return text.length === 0 ? [] : decodeStrokes(fromBase64Url(text));
  }
}
