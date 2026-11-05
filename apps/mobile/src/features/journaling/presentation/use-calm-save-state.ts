import { useEffect, useState } from 'react';
import type { SaveState } from '../application/autosave';

/** Show "saving…" only if a save is still pending after this long; local writes usually finish in a few ms. */
const SHOW_SAVING_AFTER_MS = 600;

/**
 * Turns the raw autosave state into a calm label. While typing, autosave flips
 * between "saving" and "saved" several times a second; showing that would make
 * the header flicker. Errors are shown immediately.
 */
export function useCalmSaveState(state: SaveState): SaveState {
  const [shown, setShown] = useState<SaveState>(state);
  useEffect(() => {
    if (state !== 'saving') {
      setShown(state);
      return;
    }
    const timer = setTimeout(() => setShown('saving'), SHOW_SAVING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return shown;
}
