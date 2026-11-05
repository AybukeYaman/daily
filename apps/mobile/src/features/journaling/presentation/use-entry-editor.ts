import { editorHtmlOf, type EntryData, type HandwritingBlock, handwritingBlocksOf, textToHtml, toPlainText } from '@daily/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { EnrichedTextInputInstance } from 'react-native-enriched-html';
import { observable } from '../../../core/application/observable';
import { useContainer } from '../../../core/container-context';
import { AutosaveController, type SaveState } from '../application/autosave';

export interface EditorInitial {
  title: string;
  html: string;
  isConflictCopy: boolean;
}

type Meta = Pick<EntryData, 'entryDate' | 'favorite' | 'archived' | 'conflictOf'>;

interface Snapshot {
  title: string;
  text: string;
  meta: Meta;
}

/** Native views can disappear mid-call (screen unmount); never let a save wait on them forever. */
const HTML_TIMEOUT_MS = 800;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]).catch(() => null);
}

/**
 * Editor state lives in refs, not React state: typing never re-renders the screen.
 * The native editor reports plain text on every change (cheap); its HTML is
 * fetched only when autosave actually writes (at most ~4×/s). If the native
 * view is gone, the plain text is saved instead — formatting of the last few
 * hundred ms may be lost, the words never are.
 */
export function useEntryEditor(routeId: string, initialDate?: string) {
  const { journal } = useContainer();
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [meta, setMetaState] = useState<Meta>(() => {
    const { entryDate, favorite, archived, conflictOf } = journal.emptyDraft(initialDate);
    return { entryDate, favorite, archived, conflictOf };
  });

  const [pages, setPages] = useState<HandwritingBlock[]>([]);
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const idRef = useRef<string | null>(routeId === 'new' ? null : routeId);
  const snapshot = useRef<Snapshot>({ title: '', text: '', meta });
  /** Focus is observed by the format bar only, so focusing does not re-render the editor. */
  const focused = useRef(observable(false)).current;

  const autosave = useRef<AutosaveController<Snapshot> | null>(null);
  autosave.current ??= new AutosaveController<Snapshot>(async (s) => {
    const html = (await withTimeout(editorRef.current?.getHTML() ?? Promise.resolve(null), HTML_TIMEOUT_MS)) ?? textToHtml(s.text);
    // Only the typed part is written; handwriting pages saved on their own screen are preserved.
    idRef.current = await journal.saveTyped(idRef.current, { ...s.meta, title: s.title, html, text: s.text });
  }, setSaveState);

  useEffect(() => {
    let active = true;
    const id = idRef.current;
    if (id === null) {
      setInitial({ title: '', html: '', isConflictCopy: false });
    } else {
      void journal.get(id).then((entry) => {
        if (!active) return;
        if (!entry) {
          setInitial({ title: '', html: '', isConflictCopy: false });
          return;
        }
        const m: Meta = { entryDate: entry.entryDate, favorite: entry.favorite, archived: entry.archived, conflictOf: entry.conflictOf };
        snapshot.current = { title: entry.title, text: toPlainText(entry.content), meta: m };
        setMetaState(m);
        setPages(handwritingBlocksOf(entry.content));
        setInitial({ title: entry.title, html: editorHtmlOf(entry.content), isConflictCopy: entry.conflictOf !== null });
      });
    }
    const controller = autosave.current!;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void controller.flush();
    });
    return () => {
      active = false;
      sub.remove();
      // Save, then drop the entry if it ended up with nothing in it (e.g. opened a page, drew nothing).
      void controller.flush().then(async () => {
        if (idRef.current) await journal.discardIfEmpty(idRef.current);
      });
    };
  }, [journal]);

  // Pages are edited on their own screen; re-read them when coming back.
  useFocusEffect(
    useCallback(() => {
      const id = idRef.current;
      if (!id) return;
      let active = true;
      void journal.get(id).then((entry) => active && entry && setPages(handwritingBlocksOf(entry.content)));
      return () => {
        active = false;
      };
    }, [journal]),
  );

  const schedule = (patch: Partial<Snapshot>) => {
    snapshot.current = { ...snapshot.current, ...patch };
    autosave.current!.schedule(snapshot.current);
  };

  /** Metadata changes are deliberate taps: save them right away. */
  const setMeta = (patch: Partial<Meta>) => {
    const next = { ...snapshot.current.meta, ...patch };
    setMetaState(next);
    schedule({ meta: next });
    void autosave.current!.flush();
  };

  return {
    initial,
    saveState,
    meta,
    editorRef,
    focused,
    entryId: () => idRef.current,
    setTitle: (title: string) => schedule({ title }),
    setText: (text: string) => schedule({ text }),
    setFavorite: (favorite: boolean) => setMeta({ favorite }),
    setArchived: (archived: boolean) => setMeta({ archived }),
    setEntryDate: (entryDate: string) => setMeta({ entryDate }),
    flush: () => autosave.current!.flush(),
    pages,
    /** Makes sure the entry exists (saving what was typed) and returns its id, for opening a page. */
    async ensureEntry(): Promise<string> {
      await autosave.current!.flush();
      idRef.current ??= await journal.createEmpty(snapshot.current.meta.entryDate);
      return idRef.current;
    },
    /** Flushes, then soft-deletes. Returns false when there was nothing persisted to delete. */
    async remove(): Promise<boolean> {
      await autosave.current!.flush();
      if (!idRef.current) return false;
      await journal.remove(idRef.current);
      return true;
    },
  };
}
