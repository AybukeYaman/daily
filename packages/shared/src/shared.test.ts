import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  contentFromRich,
  contentFromText,
  editorHtmlOf,
  textToHtml,
  countWords,
  CredentialsSchema,
  PushRequestSchema,
  resolveConflict,
  shouldSnapshot,
  toPlainText,
  type EntryDto,
} from './index';

const server = (over: Partial<EntryDto> = {}): EntryDto => ({
  id: '0b8f3a4e-8d1c-4f6e-9a3b-2c1d0e9f8a7b',
  title: 't',
  content: contentFromText('hello'),
  entryDate: '2026-11-05',
  favorite: false,
  archived: false,
  conflictOf: null,
  revision: 2,
  syncSeq: 7,
  deletedAt: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  ...over,
});

describe('content', () => {
  it('counts unicode words', () => {
    expect(countWords('Bugün çok güzel bir gün — değil mi?')).toBe(7);
    expect(countWords('   ')).toBe(0);
    expect(countWords("it's well-known")).toBe(2);
  });

  it('rich blocks contribute their plain text', () => {
    expect(toPlainText(contentFromRich('<html><p><b>Hi</b></p></html>', 'Hi'))).toBe('Hi');
  });

  it('escapes text when converting to editor html', () => {
    expect(textToHtml('a <b> & "c"\n\nd')).toBe('<html><p>a &lt;b&gt; &amp; &quot;c&quot;</p><br><p>d</p></html>');
    expect(editorHtmlOf(contentFromText('x'))).toBe('<html><p>x</p></html>');
    expect(editorHtmlOf(contentFromRich('<html><p>y</p></html>', 'y'))).toBe('<html><p>y</p></html>');
  });

  it('extracts plain text from blocks', () => {
    expect(toPlainText(contentFromText('a'))).toBe('a');
    expect(toPlainText({ v: 1, blocks: [] })).toBe('');
  });
});

describe('resolveConflict', () => {
  it('adopts server when data is identical', () => {
    const s = server();
    expect(resolveConflict({ title: s.title, content: s.content, entryDate: s.entryDate, favorite: false, archived: false, conflictOf: null }, s))
      .toEqual({ kind: 'adopt-server' });
  });

  it('keeps a local copy when data differs', () => {
    const local = { title: 'mine', content: contentFromText('local'), entryDate: '2026-11-05', favorite: false, archived: false, conflictOf: null };
    expect(resolveConflict(local, server())).toEqual({ kind: 'adopt-server-keep-local-copy', copy: local });
  });

  it('keeps a local copy when server deleted an entry the device edited', () => {
    const s = server({ deletedAt: '2026-11-05T11:00:00.000Z' });
    const local = { title: s.title, content: s.content, entryDate: s.entryDate, favorite: false, archived: false, conflictOf: null };
    expect(resolveConflict(local, s).kind).toBe('adopt-server-keep-local-copy');
  });

  it('drops a conflicting local delete', () => {
    expect(resolveConflict(null, server())).toEqual({ kind: 'adopt-server' });
  });
});

describe('backoff', () => {
  it('grows exponentially and is capped', () => {
    expect(backoffMs(0, () => 0)).toBe(500);
    expect(backoffMs(3, () => 0.999999)).toBeLessThanOrEqual(8000);
    expect(backoffMs(50, () => 0.999999)).toBeLessThanOrEqual(300_000);
  });
});

describe('version snapshots', () => {
  const t0 = new Date('2026-11-05T10:00:00Z');
  it('snapshots first change, deletes, and after the window', () => {
    expect(shouldSnapshot(null, t0, false)).toBe(true);
    expect(shouldSnapshot(t0, new Date('2026-11-05T10:05:00Z'), false)).toBe(false);
    expect(shouldSnapshot(t0, new Date('2026-11-05T10:05:00Z'), true)).toBe(true);
    expect(shouldSnapshot(t0, new Date('2026-11-05T10:10:00Z'), false)).toBe(true);
  });
});

describe('contracts', () => {
  it('normalizes emails', () => {
    expect(CredentialsSchema.parse({ email: ' A@B.co ', password: '0123456789' }).email).toBe('a@b.co');
  });

  it('rejects oversized push batches', () => {
    const op = { kind: 'delete', opId: crypto.randomUUID(), entryId: crypto.randomUUID(), baseRevision: 1 };
    expect(PushRequestSchema.safeParse({ ops: Array.from({ length: 51 }, () => op) }).success).toBe(false);
  });
});
