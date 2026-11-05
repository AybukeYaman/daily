import { contentFromText, type EntryData, toPlainText } from '@daily/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useContainer } from '../../../core/container-context';
import { AutosaveController, type SaveState } from '../application/autosave';

export interface EditorInitial {
  title: string;
  body: string;
  isConflictCopy: boolean;
}

/**
 * Editor state lives in refs, not React state: typing never re-renders the screen.
 * Every change is persisted locally within 250 ms, and immediately on blur,
 * on leaving the screen and when the app goes to the background.
 */
export function useEntryEditor(routeId: string) {
  const { journal } = useContainer();
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const idRef = useRef<string | null>(routeId === 'new' ? null : routeId);
  const draft = useRef<EntryData>(journal.emptyDraft());

  const autosave = useRef<AutosaveController | null>(null);
  autosave.current ??= new AutosaveController(async (data) => {
    idRef.current = await journal.save(idRef.current, data);
  }, setSaveState);

  useEffect(() => {
    let active = true;
    if (idRef.current === null) {
      setInitial({ title: '', body: '', isConflictCopy: false });
    } else {
      void journal.get(idRef.current).then((entry) => {
        if (!active) return;
        if (entry) {
          const { id: _id, wordCount: _w, serverRevision: _r, deletedAt: _d, createdAt: _c, updatedAt: _u, ...data } = entry;
          draft.current = data;
        }
        setInitial({
          title: draft.current.title,
          body: toPlainText(draft.current.content),
          isConflictCopy: draft.current.conflictOf !== null,
        });
      });
    }
    const controller = autosave.current!;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void controller.flush();
    });
    return () => {
      active = false;
      sub.remove();
      void controller.flush();
    };
  }, [journal]);

  return {
    initial,
    saveState,
    setTitle(title: string) {
      draft.current = { ...draft.current, title };
      autosave.current!.schedule(draft.current);
    },
    setBody(body: string) {
      draft.current = { ...draft.current, content: contentFromText(body) };
      autosave.current!.schedule(draft.current);
    },
    flush: () => autosave.current!.flush(),
    /** Flushes, then soft-deletes. Returns false when there was nothing persisted to delete. */
    async remove(): Promise<boolean> {
      await autosave.current!.flush();
      if (!idRef.current) return false;
      await journal.remove(idRef.current);
      return true;
    },
  };
}
