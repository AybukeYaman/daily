import { z } from 'zod';

/** Calendar date without time zone: YYYY-MM-DD. An entry belongs to the day the user chose. */
export const IsoDateSchema = z.iso.date();

/** Local calendar date of `d` in the device's time zone. */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
