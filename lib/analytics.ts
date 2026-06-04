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
  login:                    ()                                                           => posthog.capture('login'),
  logout:                   ()                                                           => posthog.capture('logout'),

  // Onboarding
  onboardingCompleted:      (props: { goal: string; activity_level: string; diet: string }) =>
                              posthog.capture('onboarding_completed', props),
  onboardingRedone:         ()                                                           => posthog.capture('onboarding_redone'),

  // Meals — home tab
  mealLogged:               (props: { meal_type: string; calories: number; protein: number }) =>
                              posthog.capture('meal_logged', props),
  mealSwapped:              (props: { meal_type: string; mood?: string | null })         =>
                              posthog.capture('meal_swapped', props),
  snackAdded:               (props: { calories: number; protein: number })               =>
                              posthog.capture('snack_added', props),
  recipeViewed:             (props: { meal_type: string; meal_name: string })            =>
                              posthog.capture('recipe_viewed', props),

  // Log tab
  logEntryAdded:            (props: { meal_type: string; calories: number; protein: number }) =>
                              posthog.capture('log_entry_added', props),
  logEntryDeleted:          ()                                                           => posthog.capture('log_entry_deleted'),
  logEntryEdited:           ()                                                           => posthog.capture('log_entry_edited'),
  nutritionLookedUp:        (props: { query: string })                                  => posthog.capture('nutrition_lookup', props),

  // Water
  waterLogged:              (props: { glasses: number })                                 => posthog.capture('water_logged', props),

  // Plan
  planRegenerated:          ()                                                           => posthog.capture('plan_regenerated'),

  // Profile
  profileFieldUpdated:      (props: { field: string })                                  => posthog.capture('profile_field_updated', props),
  kitchenUpdated:           ()                                                           => posthog.capture('kitchen_updated'),
  unitsChanged:             (props: { units: 'metric' | 'imperial' })                   => posthog.capture('units_changed', props),
  notificationsToggled:     (props: { type: 'meals' | 'water'; enabled: boolean })      => posthog.capture('notifications_toggled', props),
  notificationTimeChanged:  (props: { meal: string; hour: number })                     => posthog.capture('notification_time_changed', props),
  waterIntervalChanged:     (props: { interval_hours: number })                         => posthog.capture('water_interval_changed', props),

  // Engagement
  founderLinkTapped:        (props: { platform: 'instagram' | 'linkedin' | 'website' }) => posthog.capture('founder_link_tapped', props),
  feedbackTapped:           ()                                                           => posthog.capture('feedback_tapped'),

  // Credits / AI
  creditsUsed:              (props: { feature: string; cost: number; remaining: number }) =>
                              posthog.capture('credits_used', props),
  outOfCredits:             (props: { feature: string })                                 => posthog.capture('out_of_credits', props),
};
