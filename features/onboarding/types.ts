export type Goal = 'muscle_gain' | 'fat_loss' | 'stay_healthy';
export type CuisinePreference = 'north_indian' | 'south_indian' | 'continental' | 'indian_fusion' | 'indo_chinese';
export type DietType = 'pure_veg' | 'vegan' | 'eggetarian' | 'non_veg';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'very_active';
// Sex at birth, used only for the BMR/IBW equations (Mifflin-St Jeor and
// Devine are sex-specific). 'unspecified' keeps the legacy averaged
// behaviour for users who prefer not to say.
export type Sex = 'male' | 'female' | 'unspecified';
export type Restriction = 'onion_garlic' | 'dairy' | 'gluten' | 'peanuts' | 'spicy' | 'mushroom' | 'soy' | 'sugar';
export type WeightUnit = 'kg' | 'lbs';
export type HeightUnit = 'cm' | 'ft';

export interface OnboardingData {
  goal: Goal | null;
  age: number;
  weightKg: number;
  heightCm: number;
  cuisines: CuisinePreference[];
  dietType: DietType;
  restrictions: Restriction[];
  activityLevel: ActivityLevel | null;
  sex: Sex;
}

export interface NutritionTargets {
  dailyCalories: number;
  dailyProtein: number;
}
