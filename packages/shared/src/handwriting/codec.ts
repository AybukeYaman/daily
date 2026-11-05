import { ALT, AZI, P, type Stroke, STRIDE, T, type Tool, TOOLS, X, Y } from './model';

/**
 * Compact binary stroke format (v1), stored as base64url text inside entry content.
 *
 *   "DH" · version · varint(strokes) · stroke*
 *   stroke = uuid(16) · tool(1) · rgba(4) · varint(width×10) · flags(1)
 *            · zigzag(startedAt − previous startedAt) · varint(samples) · sample*
 *   sample = zigzag(Δx) · zigzag(Δy) · varint(Δt) · [pressure(1)] · [altitude(1) azimuth(1)]
 *
 * Coordinates are quantized to 0.1 px and delta-coded, so typical samples take
 * 3–4 bytes instead of ~60 as JSON. Integers use arithmetic (not bitwise) varints,
 * so epoch-millisecond values beyond 2³¹ are safe.
 */
const MAGIC_0 = 0x44; // D
const MAGIC_1 = 0x48; // H
const VERSION = 1;
const Q = 10; // 0.1 px

class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialSize = 1024) {
    this.buf = new Uint8Array(initialSize);
  }

  /** Guarantees room for `n` more bytes (one check per sample instead of per byte). */
  reserve(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b: number): void {
    this.reserve(1);
    this.buf[this.len++] = b;
  }

  /** Caller must have reserved 5 bytes. Fast 32-bit path for sample deltas. */
  uvarint32(v: number): void {
    const buf = this.buf;
    while (v >= 0x80) {
      buf[this.len++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    buf[this.len++] = v;
  }

  varint(v: number): void {
    if (v < 0 || !Number.isSafeInteger(v)) throw new RangeError(`varint out of range: ${v}`);
    this.reserve(8);
    if (v < 0x80000000) {
      this.uvarint32(v);
      return;
    }
    while (v >= 128) {
      this.buf[this.len++] = (v % 128) + 128;
      v = Math.floor(v / 128);
    }
    this.buf[this.len++] = v;
  }

  zigzag(v: number): void {
    this.varint(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  /** Caller must have reserved 5 bytes; |v| < 2³⁰. */
  zigzag32(v: number): void {
    this.uvarint32(((v << 1) ^ (v >> 31)) >>> 0);
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

class ByteReader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  byte(): number {
    if (this.pos >= this.buf.length) throw new RangeError('Unexpected end of handwriting data');
    return this.buf[this.pos++]!;
  }

  varint(): number {
    let result = 0;
    let scale = 1;
    for (;;) {
      const b = this.byte();
      result += (b % 128) * scale;
      if (b < 128) return result;
      scale *= 128;
      if (scale > 2 ** 56) throw new RangeError('Malformed varint');
    }
  }

  zigzag(): number {
    const v = this.varint();
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  }

  /** Up to 5 bytes, unsigned 32-bit. */
  uvarint32(): number {
    const buf = this.buf;
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= buf.length) throw new RangeError('Unexpected end of handwriting data');
      const b = buf[this.pos++]!;
      result |= (b & 0x7f) << shift;
      if (b < 0x80) return result >>> 0;
      shift += 7;
      if (shift > 28) throw new RangeError('Malformed varint');
    }
  }

  zigzag32(): number {
    const v = this.uvarint32();
    return (v >>> 1) ^ -(v & 1);
  }

  done(): boolean {
    return this.pos === this.buf.length;
  }
}

const HEX = '0123456789abcdef';

function writeUuid(w: ByteWriter, id: string): void {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new TypeError(`Stroke id must be a UUID: ${id}`);
  for (let i = 0; i < 32; i += 2) w.byte(parseInt(hex.slice(i, i + 2), 16));
}

function readUuid(r: ByteReader): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    const b = r.byte();
    s += HEX[b >> 4]! + HEX[b & 15]!;
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-';
  }
  return s;
}

function writeColor(w: ByteWriter, color: string): void {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!m) throw new TypeError(`Color must be #RRGGBB or #RRGGBBAA: ${color}`);
  const hex = m[1]! + (m[2] ?? 'ff');
  for (let i = 0; i < 8; i += 2) w.byte(parseInt(hex.slice(i, i + 2), 16));
}

function readColor(r: ByteReader): string {
  let s = '#';
  for (let i = 0; i < 4; i++) {
    const b = r.byte();
    s += HEX[b >> 4]! + HEX[b & 15]!;
  }
  return s.endsWith('ff') ? s.slice(0, 7) : s;
}

const unit = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Coordinates are limited to ±100 000 px so quantized deltas stay inside 32-bit fast paths. */
export const MAX_COORD = 100_000;

export function encodeStrokes(strokes: readonly Stroke[]): Uint8Array {
  let samples = 0;
  for (const s of strokes) samples += s.samples.length / STRIDE;
  const w = new ByteWriter(64 + strokes.length * 32 + samples * 5);
  w.byte(MAGIC_0);
  w.byte(MAGIC_1);
  w.byte(VERSION);
  w.varint(strokes.length);
  let prevStart = 0;
  for (const s of strokes) {
    writeUuid(w, s.id);
    const tool = TOOLS.indexOf(s.tool);
    if (tool < 0) throw new TypeError(`Unknown tool: ${s.tool}`);
    w.byte(tool);
    writeColor(w, s.color);
    w.varint(Math.round(s.width * Q));
    w.byte((s.hasPressure ? 1 : 0) | (s.hasTilt ? 2 : 0));
    w.zigzag(Math.round(s.startedAt) - prevStart);
    prevStart = Math.round(s.startedAt);

    const n = s.samples.length / STRIDE;
    w.varint(n);
    const smp = s.samples;
    let px = 0;
    let py = 0;
    let pt = 0;
    for (let o = 0; o < smp.length; o += STRIDE) {
      if (Math.abs(smp[o + X]!) > MAX_COORD || Math.abs(smp[o + Y]!) > MAX_COORD) {
        throw new RangeError('Stroke coordinate out of range');
      }
      const qx = Math.round(smp[o + X]! * Q);
      const qy = Math.round(smp[o + Y]! * Q);
      let qt = Math.round(smp[o + T]!);
      if (qt < pt) qt = pt; // time never goes backwards
      w.reserve(18);
      w.zigzag32(qx - px);
      w.zigzag32(qy - py);
      w.uvarint32(qt - pt);
      px = qx;
      py = qy;
      pt = qt;
      if (s.hasPressure) w.byte(unit(smp[o + P]!));
      if (s.hasTilt) {
        w.byte(unit(smp[o + ALT]!));
        w.byte(unit(smp[o + AZI]!));
      }
    }
  }
  return w.bytes();
}

export function decodeStrokes(bytes: Uint8Array): Stroke[] {
  const r = new ByteReader(bytes);
  if (r.byte() !== MAGIC_0 || r.byte() !== MAGIC_1) throw new TypeError('Not handwriting data');
  const version = r.byte();
  if (version !== VERSION) throw new TypeError(`Unsupported handwriting version ${version}`);
  const count = r.varint();
  const strokes: Stroke[] = [];
  let prevStart = 0;
  for (let k = 0; k < count; k++) {
    const id = readUuid(r);
    const tool: Tool | undefined = TOOLS[r.byte()];
    if (!tool) throw new TypeError('Unknown tool in handwriting data');
    const color = readColor(r);
    const width = r.varint() / Q;
    const flags = r.byte();
    const hasPressure = (flags & 1) !== 0;
    const hasTilt = (flags & 2) !== 0;
    const startedAt = prevStart + r.zigzag();
    prevStart = startedAt;

    const n = r.varint();
    const samples = new Array<number>(n * STRIDE);
    let qx = 0;
    let qy = 0;
    let qt = 0;
    for (let i = 0; i < n; i++) {
      qx += r.zigzag32();
      qy += r.zigzag32();
      qt += r.uvarint32();
      const o = i * STRIDE;
      samples[o + X] = qx / Q;
      samples[o + Y] = qy / Q;
      samples[o + T] = qt;
      samples[o + P] = hasPressure ? r.byte() / 255 : 0.5;
      if (hasTilt) {
        samples[o + ALT] = r.byte() / 255;
        samples[o + AZI] = r.byte() / 255;
      } else {
        samples[o + ALT] = 1;
        samples[o + AZI] = 0;
      }
    }
    strokes.push({ id, tool, color, width, hasPressure, hasTilt, startedAt, samples });
  }
  if (!r.done()) throw new TypeError('Trailing bytes in handwriting data');
  return strokes;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

const B64_CODES = Uint8Array.from(B64, (c) => c.charCodeAt(0));

/**
 * base64url without padding; dependency-free (no Buffer/atob on every platform).
 * Writes ASCII codes into a byte buffer and converts in chunks: no per-character
 * string concatenation, which dominated encode time on large documents.
 */
export function toBase64Url(bytes: Uint8Array): string {
  const n = bytes.length;
  const out = new Uint8Array(Math.ceil((n * 4) / 3));
  let o = 0;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out[o++] = B64_CODES[v >>> 18]!;
    out[o++] = B64_CODES[(v >>> 12) & 63]!;
    out[o++] = B64_CODES[(v >>> 6) & 63]!;
    out[o++] = B64_CODES[v & 63]!;
  }
  if (i < n) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < n ? bytes[i + 1]! : 0;
    out[o++] = B64_CODES[b0 >> 2]!;
    out[o++] = B64_CODES[((b0 & 3) << 4) | (b1 >> 4)]!;
    if (i + 1 < n) out[o++] = B64_CODES[(b1 & 15) << 2]!;
  }
  const parts: string[] = [];
  for (let k = 0; k < o; k += 8192) {
    parts.push(String.fromCharCode.apply(null, out.subarray(k, Math.min(o, k + 8192)) as unknown as number[]));
  }
  return parts.join('');
}

export function fromBase64Url(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const c0 = sextet(text, i);
    const c1 = sextet(text, i + 1);
    const c2 = i + 2 < text.length ? sextet(text, i + 2) : -1;
    const c3 = i + 3 < text.length ? sextet(text, i + 3) : -1;
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out.subarray(0, o);
}

function sextet(text: string, i: number): number {
  const code = text.charCodeAt(i);
  const v = code < 128 ? B64_INDEX[code]! : -1;
  if (v < 0) throw new TypeError('Invalid base64url in handwriting data');
  return v;
}
