import { Platform, useColorScheme } from 'react-native';

/** Warm, quiet palette. One accent, used sparingly. */
const light = {
  background: '#FBF8F3',
  surface: '#F4EFE7',
  text: '#2A2724',
  muted: '#8C857C',
  faint: '#BDB5AA',
  hairline: '#ECE6DC',
  accent: '#B07D52',
  danger: '#B4533F',
};

const dark: typeof light = {
  background: '#161412',
  surface: '#1F1C19',
  text: '#ECE7E0',
  muted: '#948B80',
  faint: '#5E574F',
  hairline: '#2A2622',
  accent: '#D2A27A',
  danger: '#E07A63',
};

export type Palette = typeof light;

/**
 * Handwriting pages look like paper in both themes, and ink colors are fixed,
 * so a page written in dark mode reads the same in light mode (and in exports).
 */
export const paper = {
  background: '#FBF8F3',
  ink: ['#2a2724', '#b07d52', '#3d6fb6', '#5b8a5a'],
} as const;

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

export const type = {
  /** Writing surface: serif, generous line height. */
  body: { fontFamily: serif, fontSize: 18, lineHeight: 29 },
  title: { fontFamily: serif, fontSize: 26, lineHeight: 34, fontWeight: '600' as const },
  ui: { fontSize: 15, lineHeight: 20 },
  small: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 40 };

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
