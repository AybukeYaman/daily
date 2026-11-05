import { z } from 'zod';

/**
 * Versioned, block-based entry content. New block kinds (handwriting, media)
 * are added as new union members, so previously stored data stays valid.
 */
export const TextBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('text'),
  text: z.string().max(200_000),
});

/**
 * Formatted text. `html` is the editor's canonical HTML (restricted tag set);
 * `text` is its plain-text projection, supplied by the native editor for free,
 * so neither device nor server ever needs to parse HTML for search or previews.
 */
export const RichBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('rich'),
  html: z.string().max(600_000),
  text: z.string().max(200_000),
});

export const PAGE_BACKGROUNDS = ['blank', 'lined', 'grid'] as const;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];

/**
 * A handwriting page. `strokes` is the compact binary stroke format (see
 * handwriting/codec) as base64url. `width` is the page width in document
 * pixels when it was created, so it renders at the same proportions on any
 * screen. `text` stays empty until recognition exists; it keeps the
 * "every block has plain text" rule simple for search and previews.
 */
const HandwritingBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('handwriting'),
  strokes: z.string().max(3_000_000),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(100_000),
  background: z.enum(PAGE_BACKGROUNDS),
  text: z.literal(''),
});

export const BlockSchema = z.discriminatedUnion('type', [TextBlockSchema, RichBlockSchema, HandwritingBlockSchema]);

export const EntryContentSchema = z.object({
  v: z.literal(1),
  blocks: z.array(BlockSchema).max(2_000),
});

export type EntryContent = z.infer<typeof EntryContentSchema>;
type Block = z.infer<typeof BlockSchema>;
export type HandwritingBlock = z.infer<typeof HandwritingBlockSchema>;

const MAIN_BLOCK_ID = 'main';

export function contentFromText(text: string): EntryContent {
  return { v: 1, blocks: [{ id: MAIN_BLOCK_ID, type: 'text', text }] };
}

/** Plain text of all blocks, joined by blank lines. Used for search, previews and word count. */
export function toPlainText(content: EntryContent): string {
  let out = '';
  for (const block of content.blocks) {
    if (block.text.length === 0) continue;
    out = out.length === 0 ? block.text : `${out}\n\n${block.text}`;
  }
  return out;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Plain text → editor HTML: one paragraph per line, fully escaped. */
export function textToHtml(text: string): string {
  const paragraphs = text.split('\n').map((line) => {
    const escaped = line.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]!);
    return escaped.length > 0 ? `<p>${escaped}</p>` : '<br>';
  });
  return `<html>${paragraphs.join('')}</html>`;
}

const isTextual = (b: Block) => b.type === 'text' || b.type === 'rich';

/** HTML the editor should open with: the typed part of the entry, for any stored version. */
export function editorHtmlOf(content: EntryContent): string {
  const typed = content.blocks.filter(isTextual);
  if (typed.length === 1 && typed[0]!.type === 'rich') return typed[0]!.html;
  return textToHtml(toPlainText({ v: 1, blocks: typed }));
}

export function handwritingBlocksOf(content: EntryContent): HandwritingBlock[] {
  return content.blocks.filter((b): b is HandwritingBlock => b.type === 'handwriting');
}

/**
 * Replaces the typed part of an entry, keeping every other block (handwriting,
 * later media) exactly as stored. The typed block always comes first.
 */
export function withTypedContent(content: EntryContent, html: string, text: string): EntryContent {
  const others = content.blocks.filter((b) => !isTextual(b));
  return { v: 1, blocks: [{ id: MAIN_BLOCK_ID, type: 'rich', html, text }, ...others] };
}

/** Inserts or replaces one block by id, preserving order. */
export function withBlock(content: EntryContent, block: Block): EntryContent {
  const i = content.blocks.findIndex((b) => b.id === block.id);
  const blocks = content.blocks.slice();
  if (i >= 0) blocks[i] = block;
  else blocks.push(block);
  return { v: 1, blocks };
}

export function withoutBlock(content: EntryContent, id: string): EntryContent {
  return { v: 1, blocks: content.blocks.filter((b) => b.id !== id) };
}

/** True when the entry has nothing worth keeping (no words, no ink). */
export function isEmptyContent(title: string, content: EntryContent): boolean {
  if (title.trim() !== '') return false;
  return content.blocks.every((b) => (b.type === 'handwriting' ? b.strokes.length === 0 : b.text.trim() === ''));
}

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

/** Single pass word count (Unicode letters/digits). */
export function countWords(text: string): number {
  let count = 0;
  let inWord = false;
  for (const ch of text) {
    const isWordChar = WORD_CHAR.test(ch);
    if (isWordChar && !inWord) count++;
    inWord = isWordChar;
  }
  return count;
}

/** First non-empty line, trimmed to `max` characters, for list previews. */
export function previewOf(text: string, max = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed.replace(/\s+/g, ' ');
  return `${trimmed.slice(0, max).replace(/\s+/g, ' ').trimEnd()}…`;
}
