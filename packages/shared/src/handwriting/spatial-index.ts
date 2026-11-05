import type { Bounds } from './model';

/**
 * Uniform grid over stroke bounding boxes. The eraser asks "which strokes are
 * near this point?" and gets a handful of candidates instead of scanning every
 * stroke in the document: O(strokes in nearby cells) per eraser move.
 */
export class SpatialIndex {
  private readonly cells = new Map<number, Set<string>>();
  private readonly boundsById = new Map<string, Bounds>();

  constructor(private readonly cellSize = 64) {}

  get size(): number {
    return this.boundsById.size;
  }

  insert(id: string, b: Bounds): void {
    this.remove(id);
    this.boundsById.set(id, b);
    this.forCells(b, (key) => {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, (cell = new Set()));
      cell.add(id);
    });
  }

  remove(id: string): void {
    const b = this.boundsById.get(id);
    if (!b) return;
    this.boundsById.delete(id);
    this.forCells(b, (key) => {
      const cell = this.cells.get(key);
      if (!cell) return;
      cell.delete(id);
      if (cell.size === 0) this.cells.delete(key);
    });
  }

  /** Candidate ids whose bounds intersect the circle's bounding square. */
  query(x: number, y: number, r: number): string[] {
    const out = new Set<string>();
    const q: Bounds = { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
    this.forCells(q, (key) => {
      const cell = this.cells.get(key);
      if (!cell) return;
      for (const id of cell) {
        const b = this.boundsById.get(id)!;
        if (b.maxX >= q.minX && b.minX <= q.maxX && b.maxY >= q.minY && b.minY <= q.maxY) out.add(id);
      }
    });
    return [...out];
  }

  clear(): void {
    this.cells.clear();
    this.boundsById.clear();
  }

  private forCells(b: Bounds, visit: (key: number) => void): void {
    const x0 = Math.floor(b.minX / this.cellSize);
    const x1 = Math.floor(b.maxX / this.cellSize);
    const y0 = Math.floor(b.minY / this.cellSize);
    const y1 = Math.floor(b.maxY / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) visit(cellKey(cx, cy));
    }
  }
}

/** Packs signed cell coordinates (±1M cells) into one number key: no string allocation. */
function cellKey(cx: number, cy: number): number {
  return (cx + 1_048_576) * 2_097_152 + (cy + 1_048_576);
}
