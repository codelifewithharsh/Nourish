import PostHog from 'posthog-react-native';

export const posthog = new PostHog(
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
  { host: 'https://us.i.posthog.com' },
);

// ─── Identity ────────────────────────────────────────────────────────────────

export function identifyUser(userId: string, props?: { email?: string; goal?: string }) {
  posthog.identify(userId, props);
}

export function resetUser() {
  posthog.reset();
}

// ─── Events ──────────────────────────────────────────────────────────────────

export const analytics = {
  // Auth
  login:                ()                                             => posthog.capture('login'),
  logout:               ()                                             => posthog.capture('logout'),

  // Onboarding
  onboardingCompleted:  (props: { goal: string; activity_level: string; diet: string }) =>
                          posthog.capture('onboarding_completed', props),

  // Meals
  mealLogged:           (props: { meal_type: string; calories: number; protein: number }) =>
                          posthog.capture('meal_logged', props),
  mealSwapped:          (props: { meal_type: string; mood?: string | null })              =>
                          posthog.capture('meal_swapped', props),
  snackAdded:           (props: { calories: number; protein: number })                    =>
                          posthog.capture('snack_added', props),
  mealEdited:           ()                                             => posthog.capture('meal_edited'),

  // Water
  waterLogged:          (props: { glasses: number })                   => posthog.capture('water_logged', props),

  // Plan
  planRegenerated:      ()                                             => posthog.capture('plan_regenerated'),
  profileUpdated:       (props: { field: string })                     => posthog.capture('profile_updated', props),

  // Credits / AI
  creditsUsed:          (props: { feature: string; cost: number; remaining: number }) =>
                          posthog.capture('credits_used', props),
  outOfCredits:         (props: { feature: string })                   => posthog.capture('out_of_credits', props),
};
