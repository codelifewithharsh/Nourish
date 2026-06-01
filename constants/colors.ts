export const Colors = {
  background: '#F7F5F2',
  surface: '#FFFFFF',
  primary: '#1A1A1A',
  secondary: '#6B6B6B',
  accent: '#2D6A4F',
  accentLight: '#E8F5EF',
  error: '#E63946',
  border: '#E8E6E3',
} as const;

export type ColorKey = keyof typeof Colors;
