import { Goal, ActivityLevel, NutritionTargets } from '../types';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary:      1.2,
  lightly_active: 1.375,
  very_active:    1.725,
};

// Devine formula: ideal body weight for a given height.
// Used as the protein base so overweight users aren't given unrealistic targets.
function idealBodyWeight(heightCm: number): number {
  const heightInches = heightCm / 2.54;
  // Devine (gender-neutral average of male/female formulas)
  const ibwMale   = 50 + 2.3 * Math.max(0, heightInches - 60);
  const ibwFemale = 45.5 + 2.3 * Math.max(0, heightInches - 60);
  return (ibwMale + ibwFemale) / 2;
}

export function calculateNutrition(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: Goal,
): NutritionTargets {
  // Mifflin-St Jeor (gender-neutral average of male/female formulas)
  const bmrMale   = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const bmr       = (bmrMale + bmrFemale) / 2;
  const tdee      = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);

  let dailyCalories: number;
  if (goal === 'fat_loss')    dailyCalories = tdee - 400;
  else if (goal === 'muscle_gain') dailyCalories = tdee + 250;
  else dailyCalories = tdee;

  // Protein base uses ideal body weight, not actual weight, to give every user
  // a target sized for the body they should have — not the one they have today.
  // - Overweight users (actual > IBW): use Adjusted Body Weight to soften the
  //   gap (IBW + 25% of excess). A 100kg person at IBW 60 gets a base of 70,
  //   not 60 — feels less punishing and is the clinical-nutrition standard.
  // - Normal weight (actual ≈ IBW): IBW and actual are basically the same.
  // - Underweight (actual < IBW): use IBW so they get the protein they need
  //   to build to a healthy weight, not their current low weight.
  //
  // Multipliers tuned for Indian dietary context (lower than US sports-nutrition
  // standards because most users are not athletes):
  //   stay_healthy  → 1.0 g/kg  (WHO minimum for sedentary adults)
  //   fat_loss      → 1.4 g/kg  (preserve muscle during a deficit)
  //   muscle_gain   → 1.8 g/kg  (hypertrophy range, achievable on Indian diet)
  // Adults 55+ get +0.2 g/kg to counter age-related muscle loss (sarcopenia).
  const ibw = idealBodyWeight(heightCm);
  let proteinBase: number;
  if (weightKg > ibw) {
    // Overweight: Adjusted Body Weight = IBW + 0.25 × (actual − IBW)
    proteinBase = ibw + 0.25 * (weightKg - ibw);
  } else {
    // Normal or underweight: IBW is the right target
    proteinBase = ibw;
  }

  let proteinMultiplier: number;
  if (goal === 'muscle_gain')  proteinMultiplier = 1.8;
  else if (goal === 'fat_loss') proteinMultiplier = 1.4;
  else proteinMultiplier = 1.0;

  // Older adults need slightly more protein to maintain muscle mass
  if (age >= 55) proteinMultiplier += 0.2;

  const dailyProtein = Math.round(proteinBase * proteinMultiplier);

  return {
    dailyCalories: Math.max(dailyCalories, 1200),
    dailyProtein:  Math.max(dailyProtein, 40), // hard floor: 40g is physiological minimum
  };
}
