import { type HandwritingBlock, handwritingBlocksOf, type PageBackground } from '@daily/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { expoIds, systemClock } from '../../../core/infrastructure/platform-adapters';
import { useContainer } from '../../../core/container-context';
import { AutosaveController, type SaveState } from '../../journaling/application/autosave';
import { HandwritingSession } from '../application/handwriting-session';

interface PageState {
  session: HandwritingSession;
  pageId: string;
  width: number;
  height: number;
  background: PageBackground;
  /** Set when stored data could not be decoded; the page is shown read-only-empty and never overwritten. */
  corrupt: boolean;
}

/** Strokes are saved shortly after each change and immediately on leave/background. */
const SAVE_DELAY_MS = 400;

/**
 * Loads one handwriting page of an entry (or starts a new one) and keeps it saved.
 * Only this page's block is written (transactional update), so the text editor
 * and other pages are never overwritten.
 */
export function useHandwritingPage(entryId: string, pageParam: string, viewWidth: number) {
  const { journal } = useContainer();
  const [page, setPage] = useState<PageState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [revision, setRevision] = useState(0);
  const pageRef = useRef<PageState | null>(null);
  pageRef.current = page;

  const autosave = useRef<AutosaveController<PageState> | null>(null);
  autosave.current ??= new AutosaveController<PageState>(
    async (p) => {
      if (p.corrupt) return;
      const block: HandwritingBlock = {
        id: p.pageId,
        type: 'handwriting',
        strokes: p.session.serialize(),
        width: p.width,
        height: p.height,
        background: p.background,
        text: '',
      };
      if (p.session.doc.all.length === 0) await journal.removePage(entryId, p.pageId); // empty pages are not kept
      else await journal.savePage(entryId, block);
    },
    setSaveState,
    SAVE_DELAY_MS,
  );

  // Load once the view width is known (a new page takes the current width).
  useEffect(() => {
    if (page || viewWidth <= 0) return;
    let active = true;
    void journal.get(entryId).then((entry) => {
      if (!active) return;
      const stored = entry ? handwritingBlocksOf(entry.content).find((b) => b.id === pageParam) : undefined;
      if (stored) {
        let strokes: ReturnType<typeof HandwritingSession.deserialize> = [];
        let corrupt = false;
        try {
          strokes = HandwritingSession.deserialize(stored.strokes);
        } catch {
          corrupt = true;
        }
        setPage({
          session: new HandwritingSession(expoIds, systemClock, strokes),
          pageId: stored.id,
          width: stored.width,
          height: stored.height,
          background: stored.background,
          corrupt,
        });
      } else {
        setPage({
          session: new HandwritingSession(expoIds, systemClock),
          pageId: expoIds.uuid(),
          width: Math.round(viewWidth),
          height: 0,
          background: 'lined',
          corrupt: false,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [journal, entryId, pageParam, viewWidth, page]);

  useEffect(() => {
    const controller = autosave.current!;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void controller.flush();
    });
    return () => {
      sub.remove();
      void controller.flush();
    };
  }, []);

  const schedule = () => {
    const p = pageRef.current;
    if (p) autosave.current!.schedule(p);
  };

  return {
    page,
    saveState,
    revision,
    changed: schedule,
    growTo(height: number) {
      const p = pageRef.current;
      if (p && height > p.height) p.height = Math.round(height);
    },
    setBackground(background: PageBackground) {
      const p = pageRef.current;
      if (!p) return;
      const next = { ...p, background };
      pageRef.current = next;
      setPage(next);
      autosave.current!.schedule(next);
    },
    undo() {
      if (pageRef.current?.session.undo()) {
        setRevision((r) => r + 1);
        schedule();
      }
    },
    redo() {
      if (pageRef.current?.session.redo()) {
        setRevision((r) => r + 1);
        schedule();
      }
    },
    async deletePage() {
      const p = pageRef.current;
      if (!p) return;
      await autosave.current!.flush();
      await journal.removePage(entryId, p.pageId);
    },
    flush: () => autosave.current!.flush(),
  };
}
