import { z } from 'zod';

/**
 * Versioned, block-based entry content.
 * v1 only has text blocks; handwriting and media blocks are added in later
 * phases as new members of the discriminated union, so old data stays valid.
 */
export const TextBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('text'),
  text: z.string().max(200_000),
});

export const BlockSchema = z.discriminatedUnion('type', [TextBlockSchema]);

export const EntryContentSchema = z.object({
  v: z.literal(1),
  blocks: z.array(BlockSchema).max(2_000),
});

export type EntryContent = z.infer<typeof EntryContentSchema>;

const MAIN_BLOCK_ID = 'main';

export function contentFromText(text: string): EntryContent {
  return { v: 1, blocks: [{ id: MAIN_BLOCK_ID, type: 'text', text }] };
}

/** Plain text of all text blocks, joined by blank lines. Used for search, previews and word count. */
export function toPlainText(content: EntryContent): string {
  let out = '';
  for (const block of content.blocks) {
    if (block.type !== 'text' || block.text.length === 0) continue;
    out = out.length === 0 ? block.text : `${out}\n\n${block.text}`;
  }
  return out;
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
