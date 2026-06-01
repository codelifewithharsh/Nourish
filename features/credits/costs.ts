// Single source of truth for credit costs shown in the UI.
// Must stay in sync with supabase/functions/_shared/ai-guard.ts ACTIONS map.
// (Client-side display only — the server is authoritative for actual charges.)

export interface AIActionCost {
  key:    'meal_plan' | 'recipe' | 'swap' | 'nutrition';
  label:  string;
  cost:   number;
  hint:   string;
}

export const AI_COSTS: AIActionCost[] = [
  { key: 'meal_plan', label: 'Generate 7-day plan', cost: 10, hint: 'A full week of meals' },
  { key: 'recipe',    label: 'Open a recipe',       cost: 5,  hint: 'Ingredients + step-by-step method' },
  { key: 'swap',      label: 'Swap a meal',         cost: 3,  hint: 'New idea, same macros' },
  { key: 'nutrition', label: 'AI food lookup',      cost: 1,  hint: 'Macros for anything you ate' },
];

export const COST = {
  meal_plan: 10,
  recipe:    5,
  swap:      3,
  nutrition: 1,
} as const;

// Daily refill amount — must match supabase ensure_daily_refill default.
export const DAILY_REFILL = 5;
