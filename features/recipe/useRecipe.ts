import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAI } from '@/features/credits/CreditsContext';
import { AIError } from '@/lib/aiClient';

export interface Ingredient {
  name:     string;
  quantity: string;
  unit:     string;
}

export interface Step {
  n:       number;
  title:   string;
  body:    string;
  minutes?: number;
}

export interface Recipe {
  meal_key:        string;
  name:            string;
  tagline:         string | null;
  hero_emoji:      string | null;
  prep_minutes:    number | null;
  difficulty:      string | null;
  serves:          number | null;
  ingredients:     Ingredient[];
  steps:           Step[];
  chef_tip:        string | null;
  creator_handle:  string | null;
  instagram_url:   string | null;
  youtube_url:     string | null;
}

export interface PartitionedIngredients {
  fromKitchen: Ingredient[];
  needToBuy:   Ingredient[];
}

// Mirror the edge function so client-side cache lookups normalize identically
export function toMealKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// Tokenize the user's kitchen_ingredients string into a normalized set.
// "paneer, dal, oats" → Set { "paneer", "dal", "oats" }
function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s.split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean)
  );
}

// Loose ingredient name match: "paneer cubes" in user's pantry → ingredient
// "paneer" still counts as "have it". One-sided containment in either direction.
function matchesKitchen(ingName: string, kitchen: Set<string>): boolean {
  const n = ingName.toLowerCase().trim();
  for (const k of kitchen) {
    if (k.length < 3) continue;
    if (n === k || n.includes(k) || k.includes(n)) return true;
  }
  return false;
}

export function partitionIngredients(
  ingredients: Ingredient[],
  kitchenIngredients: string | null,
): PartitionedIngredients {
  const kitchen = tokenize(kitchenIngredients);
  const fromKitchen: Ingredient[] = [];
  const needToBuy:   Ingredient[] = [];
  for (const ing of ingredients) {
    if (matchesKitchen(ing.name, kitchen)) fromKitchen.push(ing);
    else needToBuy.push(ing);
  }
  return { fromKitchen, needToBuy };
}

export function useRecipe(mealName: string | null | undefined) {
  const [recipe,  setRecipe]  = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [kitchenIngredients, setKitchenIngredients] = useState<string | null>(null);
  const invoke = useAI();

  const load = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);

    const mealKey = toMealKey(name);

    // Always fetch profile in parallel for the kitchen partition
    const profilePromise = supabase
      .from('profiles')
      .select('kitchen_ingredients')
      .single();

    // 1) DB cache (silently skip if table missing — edge fn will handle it)
    const cacheRes = await supabase
      .from('recipes')
      .select('*')
      .eq('meal_key', mealKey)
      .maybeSingle();

    const profileRes = await profilePromise;
    setKitchenIngredients(profileRes.data?.kitchen_ingredients ?? null);

    if (cacheRes.data) {
      setRecipe(cacheRes.data as unknown as Recipe);
      setLoading(false);
      return;
    }

    // 2) Generate via edge function
    try {
      const data = await invoke<{ recipe: Recipe }>('get-recipe', { meal_name: name });
      setRecipe(data.recipe);
    } catch (err) {
      if (err instanceof AIError && (err.code === 'no_credits' || err.code === 'rate_limited')) {
        // CreditsProvider already showed the modal/toast — don't set an error
        // string here. The recipe screen will detect !recipe && !error and
        // navigate back automatically.
      } else {
        setError(err instanceof AIError ? err.message : 'Could not load recipe');
      }
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    if (!mealName) return;
    load(mealName);
  }, [mealName, load]);

  const partitioned = recipe
    ? partitionIngredients(recipe.ingredients, kitchenIngredients)
    : null;

  return { recipe, loading, error, partitioned, kitchenIngredients };
}
