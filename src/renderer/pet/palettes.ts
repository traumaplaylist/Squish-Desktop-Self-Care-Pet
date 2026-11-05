import type { Palette } from '../../core/types';

export interface PaletteColors {
  body: string;
  bodyLight: string;
  bodyDark: string;
  cheek: string;
}

export const PALETTES: Record<Palette, PaletteColors> = {
  mint: { body: '#9EE6CF', bodyLight: '#C9F4E6', bodyDark: '#6FCBAF', cheek: '#FF9FB2' },
  peach: { body: '#FFC9A8', bodyLight: '#FFE3D1', bodyDark: '#F2A07A', cheek: '#FF8FA3' },
  lavender: { body: '#CDB9F5', bodyLight: '#E6DBFB', bodyDark: '#A68EE3', cheek: '#FF9FC4' },
};
