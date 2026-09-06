export const Colors = {
  background: '#F7F5F2',
  surface: '#FFFFFF',
  primary: '#1A1A1A',
  secondary: '#6B6B6B',
  accent: '#2D6A4F',
  accentLight: '#E8F5EF',
  error: '#E63946',
  border: '#E8E6E3',

  // ── Status ────────────────────────────────────────────────────────────
  // Used when a value needs judging rather than just displaying: a limit
  // exceeded, a target missed, a streak held.
  warning:      '#E6A817',
  warningLight: '#FFF4E0',
  warningText:  '#8A6100',
  success:      '#2D6A4F',

  // ── Water ─────────────────────────────────────────────────────────────
  water:      '#3E9BD6',
  waterLight: '#7FC5F5',
  waterDeep:  '#2E7CC4',
  waterEmpty: '#DCE6ED',

  // ── Surfaces ──────────────────────────────────────────────────────────
  intakeCard: '#DFF5C8',   // tinted card behind the daily-intake gauge
  trackEmpty: '#F0EFEC',   // unfilled portion of any progress bar
} as const;

/**
 * One hue per nutrient, held constant everywhere that nutrient appears so a
 * bar is identifiable without reading its label.
 */
export const NutrientColors = {
  carbs:   '#F4A6B8',
  fat:     '#F6CE7E',
  protein: '#A8C8EC',
  fibre:   '#A8D5BA',
  sodium:  '#C9A8E0',
} as const;

export type ColorKey = keyof typeof Colors;
