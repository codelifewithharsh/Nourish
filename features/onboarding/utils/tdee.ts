import { Goal, ActivityLevel, NutritionTargets } from '../types';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  very_active: 1.725,
};

export function calculateNutrition(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: Goal,
): NutritionTargets {
  // Mifflin-St Jeor (male formula — we use a single formula for simplicity)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);

  let dailyCalories: number;
  if (goal === 'fat_loss') dailyCalories = tdee - 500;
  else if (goal === 'muscle_gain') dailyCalories = tdee + 300;
  else dailyCalories = tdee;

  // Protein: 2g per kg for muscle gain, 1.8g for others
  const dailyProtein = Math.round(
    goal === 'muscle_gain' ? weightKg * 2 : weightKg * 1.8,
  );

  return {
    dailyCalories: Math.max(dailyCalories, 1200),
    dailyProtein,
  };
}
