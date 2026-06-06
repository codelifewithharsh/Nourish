import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { GoalScreen } from '@/features/onboarding/components/GoalScreen';
import { AboutScreen } from '@/features/onboarding/components/AboutScreen';
import { FoodIdentityScreen } from '@/features/onboarding/components/FoodIdentityScreen';
import { ActivityScreen } from '@/features/onboarding/components/ActivityScreen';
import { PlanReadyScreen } from '@/features/onboarding/components/PlanReadyScreen';
import { calculateNutrition } from '@/features/onboarding/utils/tdee';
import { supabase } from '@/lib/supabase';
import { scheduleMealReminders } from '@/lib/notifications';
import { analytics } from '@/lib/analytics';
import {
  OnboardingData,
  NutritionTargets,
  Goal,
  CuisinePreference,
  DietType,
  ActivityLevel,
  Restriction,
  WeightUnit,
  HeightUnit,
} from '@/features/onboarding/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SPRING_CONFIG = { damping: 22, stiffness: 200, mass: 0.8 };

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [targets, setTargets] = useState<NutritionTargets>({ dailyCalories: 2000, dailyProtein: 120 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    goal: null,
    age: 23,
    weightKg: 70,
    heightCm: 170,
    cuisines: [],
    dietType: 'pure_veg',
    restrictions: [],
    activityLevel: null,
  });

  const translateX = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const slideToStep = useCallback((nextStep: number) => {
    const direction = nextStep > step ? 1 : -1;
    translateX.value = direction * SCREEN_WIDTH;
    translateX.value = withSpring(0, SPRING_CONFIG);
    setStep(nextStep);
  }, [step, translateX]);

  const goNext = useCallback((nextStep: number = step + 1) => {
    slideToStep(nextStep);
  }, [step, slideToStep]);

  const goBack = useCallback(() => {
    if (step === 1) { router.back(); return; }
    slideToStep(step - 1);
  }, [step, slideToStep]);

  const handleGoalSelect = useCallback((goal: Goal) => {
    setData((d) => ({ ...d, goal }));
  }, []);

  const handleActivitySelect = useCallback((activityLevel: ActivityLevel) => {
    setData((d) => ({ ...d, activityLevel }));
    setTimeout(() => {
      const updated = { ...data, activityLevel };
      if (updated.goal && updated.activityLevel) {
        setTargets(calculateNutrition(
          updated.weightKg, updated.heightCm, updated.age,
          updated.activityLevel, updated.goal,
        ));
      }
      goNext();
    }, 400);
  }, [data, goNext]);

  const handleGetStarted = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Guest mode — skip save, go straight to the app
      setSaving(false);
      router.replace('/(tabs)');
      return;
    }

    const weightKg = weightUnit === 'lbs'
      ? Math.round(data.weightKg * 0.453592 * 10) / 10
      : data.weightKg;
    const heightCm = heightUnit === 'ft'
      ? Math.round(data.heightCm * 2.54 * 10) / 10
      : data.heightCm;

    const payload = {
      id: user.id,
      email: user.email ?? '',
      name: user.user_metadata?.full_name ?? '',
      goal: data.goal ?? 'stay_healthy',
      age: data.age,
      weight_kg: weightKg,
      height_cm: heightCm,
      activity_level: data.activityLevel ?? 'lightly_active',
      diet_type: data.dietType,
      cuisines: data.cuisines,
      restrictions: data.restrictions,
      daily_calories: targets.dailyCalories,
      daily_protein: targets.dailyProtein,
      preferred_units: weightUnit === 'lbs' ? 'imperial' : 'metric',
      onboarding_completed: true,
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, attempt * 1500));
      try {
        const { error } = await supabase.from('profiles').upsert(payload);
        if (error) throw new Error(error.message);
        lastError = null;
        supabase.functions.invoke('generate-meal-plan').catch(() => {});
        scheduleMealReminders().catch(() => {});
        break;
      } catch (e) {
        lastError = e as Error;
      }
    }

    setSaving(false);
    if (lastError) {
      setSaveError("Couldn't save your plan — check your connection and try again.");
      return;
    }
    analytics.onboardingCompleted({
      goal: data.goal ?? '',
      activity_level: data.activityLevel ?? '',
      diet: data.dietType ?? '',
    });
    router.replace('/(tabs)');
  }, [data, saving, targets, weightUnit, heightUnit]);

  const toggleCuisine = useCallback((c: CuisinePreference) => {
    setData((d) => ({
      ...d,
      cuisines: d.cuisines.includes(c)
        ? d.cuisines.filter((x) => x !== c)
        : [...d.cuisines, c],
    }));
  }, []);

  const toggleRestriction = useCallback((r: Restriction) => {
    setData((d) => ({
      ...d,
      restrictions: d.restrictions.includes(r)
        ? d.restrictions.filter((x) => x !== r)
        : [...d.restrictions, r],
    }));
  }, []);

  const showSkip = step < 5;

  return (
    <OnboardingLayout step={step} showSkip={showSkip} onBack={goBack} onSkip={() => goNext()}>
      <Animated.View style={[styles.slideContainer, animatedStyle]}>
        {step === 1 && (
          <GoalScreen
            selected={data.goal}
            onSelect={handleGoalSelect}
            onContinue={() => goNext()}
          />
        )}

        {step === 2 && (
          <AboutScreen
            age={data.age}
            weightKg={data.weightKg}
            heightCm={data.heightCm}
            weightUnit={weightUnit}
            heightUnit={heightUnit}
            onChangeAge={(age) => setData((d) => ({ ...d, age }))}
            onChangeWeight={(weightKg) => setData((d) => ({ ...d, weightKg }))}
            onChangeHeight={(heightCm) => setData((d) => ({ ...d, heightCm }))}
            onChangeWeightUnit={setWeightUnit}
            onChangeHeightUnit={setHeightUnit}
            onContinue={() => goNext()}
          />
        )}

        {step === 3 && (
          <FoodIdentityScreen
            cuisines={data.cuisines}
            dietType={data.dietType}
            restrictions={data.restrictions}
            onCuisineToggle={toggleCuisine}
            onDietTypeSelect={(dietType) => setData((d) => ({ ...d, dietType }))}
            onRestrictionToggle={toggleRestriction}
            onContinue={() => goNext()}
          />
        )}

        {step === 4 && (
          <ActivityScreen
            selected={data.activityLevel}
            onSelect={handleActivitySelect}
          />
        )}

        {step === 5 && (
          <PlanReadyScreen
            targets={targets}
            goal={data.goal ?? 'stay_healthy'}
            cuisines={data.cuisines}
            dietType={data.dietType}
            restrictions={data.restrictions}
            weightKg={data.weightKg}
            saving={saving}
            saveError={saveError}
            onGetStarted={handleGetStarted}
          />
        )}
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  slideContainer: {
    flex: 1,
  },
});
