import { hitsStroke } from './geometry';
import { type Stroke, strokeBounds } from './model';
import { SpatialIndex } from './spatial-index';

type Command = { kind: 'add'; stroke: Stroke } | { kind: 'erase'; strokes: { stroke: Stroke; at: number }[] };

/**
 * A handwriting page: ordered strokes + spatial index + undo/redo.
 * Undo stores references to stroke objects (never copies of sample data),
 * so history costs O(commands), not O(points).
 */
export class HandwritingDocument {
  private readonly strokes: Stroke[] = [];
  private readonly index = new SpatialIndex();
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  /** Bumped on every visible change; renderers re-record only when it moves. */
  version = 0;

  constructor(initial: readonly Stroke[] = [], private readonly maxHistory = 200) {
    for (const s of initial) this.insertAt(s, this.strokes.length);
  }

  get all(): readonly Stroke[] {
    return this.strokes;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  add(stroke: Stroke): void {
    this.insertAt(stroke, this.strokes.length);
    this.record({ kind: 'add', stroke });
  }

  /** Erases whole strokes touched by a circle. Returns how many were removed. */
  eraseAt(x: number, y: number, radius: number): number {
    const hit: { stroke: Stroke; at: number }[] = [];
    for (const id of this.index.query(x, y, radius)) {
      const at = this.strokes.findIndex((s) => s.id === id);
      const stroke = this.strokes[at];
      if (stroke && hitsStroke(stroke, x, y, radius)) hit.push({ stroke, at });
    }
    if (hit.length === 0) return 0;
    hit.sort((a, b) => b.at - a.at); // remove back-to-front so indices stay valid
    for (const h of hit) this.removeAt(h.at);
    this.record({ kind: 'erase', strokes: hit.reverse() });
    return hit.length;
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'add') this.removeAt(this.strokes.lastIndexOf(cmd.stroke));
    else for (const h of cmd.strokes) this.insertAt(h.stroke, h.at);
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'add') this.insertAt(cmd.stroke, this.strokes.length);
    else for (let i = cmd.strokes.length - 1; i >= 0; i--) this.removeAt(cmd.strokes[i]!.at);
    this.undoStack.push(cmd);
    return true;
  }

  private record(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private insertAt(stroke: Stroke, at: number): void {
    this.strokes.splice(at, 0, stroke);
    this.index.insert(stroke.id, strokeBounds(stroke));
    this.version++;
  }

  private removeAt(at: number): void {
    const [removed] = this.strokes.splice(at, 1);
    if (removed) this.index.remove(removed.id);
    this.version++;
  }
}
