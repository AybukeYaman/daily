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

export const BlockSchema = z.discriminatedUnion('type', [TextBlockSchema, RichBlockSchema]);

export const EntryContentSchema = z.object({
  v: z.literal(1),
  blocks: z.array(BlockSchema).max(2_000),
});

export type EntryContent = z.infer<typeof EntryContentSchema>;

const MAIN_BLOCK_ID = 'main';

export function contentFromText(text: string): EntryContent {
  return { v: 1, blocks: [{ id: MAIN_BLOCK_ID, type: 'text', text }] };
}

export function contentFromRich(html: string, text: string): EntryContent {
  return { v: 1, blocks: [{ id: MAIN_BLOCK_ID, type: 'rich', html, text }] };
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

/** HTML the editor should open with, for any stored content version. */
export function editorHtmlOf(content: EntryContent): string {
  const blocks = content.blocks;
  if (blocks.length === 1 && blocks[0]!.type === 'rich') return blocks[0]!.html;
  return textToHtml(toPlainText(content));
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
