import { Goal, ActivityLevel, NutritionTargets, Sex } from '../types';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary:      1.2,
  lightly_active: 1.375,
  very_active:    1.725,
};

// Devine formula: ideal body weight for a given height.
// Used as the protein base so overweight users aren't given unrealistic targets.
//
// Sex-specific. When sex is unspecified we average the two, which is what the
// app did for every user before sex was collected.
function idealBodyWeight(heightCm: number, sex: Sex): number {
  const heightInches = heightCm / 2.54;
  const over60       = Math.max(0, heightInches - 60);
  const ibwMale      = 50 + 2.3 * over60;
  const ibwFemale    = 45.5 + 2.3 * over60;

  if (sex === 'male')   return ibwMale;
  if (sex === 'female') return ibwFemale;
  return (ibwMale + ibwFemale) / 2;
}

// Mifflin-St Jeor basal metabolic rate.
//
// The male and female equations differ by a constant 166 kcal (+5 vs -161).
// Averaging them — which is what we did before collecting sex — left every
// man under-fed by ~83 kcal at BMR (~114 kcal at typical activity) and every
// woman over-fed by the same. Always pass a real sex when we have one.
function basalMetabolicRate(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base      = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmrMale   = base + 5;
  const bmrFemale = base - 161;

  if (sex === 'male')   return bmrMale;
  if (sex === 'female') return bmrFemale;
  return (bmrMale + bmrFemale) / 2;
}

export function calculateNutrition(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: Goal,
  sex: Sex = 'unspecified',
): NutritionTargets {
  const bmr  = basalMetabolicRate(weightKg, heightCm, age, sex);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);

  let dailyCalories: number;
  if (goal === 'fat_loss')    dailyCalories = tdee - 400;
  else if (goal === 'muscle_gain') dailyCalories = tdee + 250;
  else dailyCalories = tdee;

  // Protein base uses ideal body weight, not actual, to give every user
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
  const ibw = idealBodyWeight(heightCm, sex);
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
