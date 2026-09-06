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
  // ── Screen views (fire on useFocusEffect / mount) ──────────────────────────
  screenViewed:             (props: { screen: 'home' | 'meals' | 'log' | 'profile' | 'recipe' }) =>
                              posthog.capture('screen_viewed', props),

  // ── Auth ───────────────────────────────────────────────────────────────────
  login:                    ()                                                           => posthog.capture('login'),
  logout:                   ()                                                           => posthog.capture('logout'),

  // ── Onboarding ─────────────────────────────────────────────────────────────
  onboardingCompleted:      (props: { goal: string; activity_level: string; diet: string }) =>
                              posthog.capture('onboarding_completed', props),
  onboardingRedone:         ()                                                           => posthog.capture('onboarding_redone'),

  // ── Home tab ───────────────────────────────────────────────────────────────
  profileDrawerOpened:      ()                                                           => posthog.capture('profile_drawer_opened'),
  notifSettingsOpened:      ()                                                           => posthog.capture('notif_settings_opened'),
  howItWorksOpened:         ()                                                           => posthog.capture('how_it_works_opened'),
  swapModalOpened:          (props: { meal_type: string; source: 'home' | 'meals' })    => posthog.capture('swap_modal_opened', props),

  // ── Meals ──────────────────────────────────────────────────────────────────
  mealLogged:               (props: { meal_type: string; calories: number; protein: number }) =>
                              posthog.capture('meal_logged', props),
  mealSwapped:              (props: { meal_type: string })                               => posthog.capture('meal_swapped', props),
  snackAdded:               (props: { calories: number; protein: number })               => posthog.capture('snack_added', props),
  planDayChanged:           (props: { day: string; is_future: boolean })                 => posthog.capture('plan_day_changed', props),
  planRegenerated:          ()                                                           => posthog.capture('plan_regenerated'),

  // ── Recipe screen ──────────────────────────────────────────────────────────
  recipeViewed:             (props: { meal_type: string; meal_name: string })            => posthog.capture('recipe_viewed', props),
  recipeLogged:             (props: { meal_name: string })                               => posthog.capture('recipe_logged', props),
  recipeShared:             (props: { meal_name: string })                               => posthog.capture('recipe_shared', props),
  recipeExternalLinkTapped: (props: { platform: 'instagram' | 'youtube'; meal_name: string }) =>
                              posthog.capture('recipe_external_link_tapped', props),

  // ── Log tab ────────────────────────────────────────────────────────────────
  logEntryAdded:            (props: { meal_type: string; calories: number; protein: number }) =>
                              posthog.capture('log_entry_added', props),
  logEntryDeleted:          ()                                                           => posthog.capture('log_entry_deleted'),
  logEntryEdited:           ()                                                           => posthog.capture('log_entry_edited'),
  nutritionLookedUp:        (props: { query: string })                                  => posthog.capture('nutrition_lookup', props),
  photoLogged:              (props: { items: number; calories: number; confidence: number }) => posthog.capture('photo_logged', props),

  // ── Water ──────────────────────────────────────────────────────────────────
  waterLogged:              (props: { glasses: number })                                 => posthog.capture('water_logged', props),

  // ── Profile ────────────────────────────────────────────────────────────────
  profileFieldUpdated:      (props: { field: string })                                  => posthog.capture('profile_field_updated', props),
  kitchenUpdated:           ()                                                           => posthog.capture('kitchen_updated'),
  unitsChanged:             (props: { units: 'metric' | 'imperial' })                   => posthog.capture('units_changed', props),
  notificationsToggled:     (props: { type: 'meals' | 'water'; enabled: boolean })      => posthog.capture('notifications_toggled', props),
  notificationTimeChanged:  (props: { meal: string; hour: number })                     => posthog.capture('notification_time_changed', props),
  waterIntervalChanged:     (props: { interval_hours: number })                         => posthog.capture('water_interval_changed', props),

  // ── Engagement ─────────────────────────────────────────────────────────────
  founderLinkTapped:        (props: { platform: 'instagram' | 'linkedin' | 'website' }) => posthog.capture('founder_link_tapped', props),
  feedbackTapped:           ()                                                           => posthog.capture('feedback_tapped'),
  feedbackSubmitted:        (props: { type: 'bug' | 'feature' | 'other' })              => posthog.capture('feedback_submitted', props),
  streakShared:             (props: { streak: number })                                  => posthog.capture('streak_shared', props),
  appShared:                ()                                                           => posthog.capture('app_shared'),
  appRated:                 ()                                                           => posthog.capture('app_rated'),

  // ── Grocery list ───────────────────────────────────────────────────────────
  groceryListOpened:        ()                                                           => posthog.capture('grocery_list_opened'),
  groceryListExported:      (props: { item_count: number })                              => posthog.capture('grocery_list_exported', props),

  // ── Errors ─────────────────────────────────────────────────────────────────
  jsError: (props: { kind: string; message: string; stack?: string }) =>
                              posthog.capture('js_error', props),
};
