import type { ColorKey } from '../types';

/**
 * Category tints and chart colours, defined once per theme.
 *
 * Charts are drawn by Recharts with real fill values, so they cannot read
 * Tailwind classes. Rather than scraping computed styles, both themes live
 * here and components pick a set from the resolved theme.
 *
 * Every foreground here is checked against its own background at 4.5:1.
 * See scripts note in README.
 */

export interface Tint {
  /** Chip / icon tile background. */
  bg: string;
  /** Icon and label colour on that background. */
  fg: string;
  /** Solid fill for charts, where the tint sits on the card surface. */
  solid: string;
}

export const TINTS_LIGHT: Record<ColorKey, Tint> = {
  evergreen: { bg: '#DCE8E3', fg: '#0E3A2F', solid: '#0F6E56' },
  mint: { bg: '#D5EFE4', fg: '#0A5943', solid: '#2F8A6B' },
  amber: { bg: '#FAEEDA', fg: '#7A4E06', solid: '#C97F12' },
  coral: { bg: '#FAECE7', fg: '#993C1D', solid: '#D4653F' },
  clay: { bg: '#F1E7E1', fg: '#6B4433', solid: '#9A6247' },
  sand: { bg: '#F1EDDD', fg: '#5F5426', solid: '#8A7A38' },
  slate: { bg: '#E3E9EA', fg: '#334549', solid: '#4F6A70' },
  plum: { bg: '#ECE3E8', fg: '#653552', solid: '#8C4B72' },
};

export const TINTS_DARK: Record<ColorKey, Tint> = {
  evergreen: { bg: '#17322B', fg: '#9FE1CB', solid: '#3E9E7F' },
  mint: { bg: '#153429', fg: '#8EDCBC', solid: '#5DCAA5' },
  amber: { bg: '#332810', fg: '#F0C176', solid: '#EF9F27' },
  coral: { bg: '#33221B', fg: '#F0B49B', solid: '#F0997B' },
  clay: { bg: '#2E2622', fg: '#D9B7A3', solid: '#B98467' },
  sand: { bg: '#2B291D', fg: '#D6CC9B', solid: '#B5A253' },
  slate: { bg: '#1F2A2C', fg: '#ABC2C7', solid: '#7A979E' },
  plum: { bg: '#2C2028', fg: '#D6A8C2', solid: '#A96A8C' },
};

export function tints(dark: boolean): Record<ColorKey, Tint> {
  return dark ? TINTS_DARK : TINTS_LIGHT;
}

/** Chart chrome. Flat fills only: no gradients, no glow, no drop shadows. */
export interface ChartTheme {
  /** Ordinary forecast day. */
  bar: string;
  /** Outline that carries the 3:1 non-text contrast the pale fill cannot. */
  barStroke: string;
  /** Today. */
  barToday: string;
  barTodayStroke: string;
  /** A day that dips below the tight threshold. */
  barTight: string;
  barTightStroke: string;
  grid: string;
  axis: string;
  reference: string;
  line: string;
  surface: string;
}

export const CHART_LIGHT: ChartTheme = {
  bar: '#9FE1CB',
  barStroke: '#2F8A6B',
  barToday: '#5DCAA5',
  barTodayStroke: '#0F6E56',
  barTight: '#F0997B',
  barTightStroke: '#993C1D',
  grid: '#E4E8E6',
  axis: '#565D5A',
  reference: '#C2C8C5',
  line: '#0F6E56',
  surface: '#FFFFFF',
};

export const CHART_DARK: ChartTheme = {
  bar: '#3E7F69',
  barStroke: '#9FE1CB',
  barToday: '#5DCAA5',
  barTodayStroke: '#9FE1CB',
  barTight: '#B4644A',
  barTightStroke: '#F0B49B',
  grid: '#2A332E',
  axis: '#9AA29E',
  reference: '#3E4442',
  line: '#5DCAA5',
  surface: '#161D19',
};

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? CHART_DARK : CHART_LIGHT;
}

export const COLOR_KEYS: ColorKey[] = [
  'evergreen',
  'mint',
  'amber',
  'coral',
  'clay',
  'sand',
  'slate',
  'plum',
];

export const COLOR_KEY_LABELS: Record<ColorKey, string> = {
  evergreen: 'Evergreen',
  mint: 'Mint',
  amber: 'Amber',
  coral: 'Coral',
  clay: 'Clay',
  sand: 'Sand',
  slate: 'Slate',
  plum: 'Plum',
};
