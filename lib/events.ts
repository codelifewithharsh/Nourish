export const WATER_LOGGED_EVENT      = 'water_logged_from_notification';
export const PROFILE_UPDATED_EVENT  = 'profile_updated';
export const SCROLL_TO_SECTION_EVENT = 'scroll_to_section';
// Fires whenever the user changes meal-reminder times or the on/off state.
// Both the home bell sheet and the profile screen listen so they stay in sync.
export const MEAL_TIMES_CHANGED_EVENT = 'meal_times_changed';
export const MEAL_NOTIFS_TOGGLED_EVENT = 'meal_notifs_toggled';

// Fires when the home drawer wants an action carried out on the Plan tab —
// the drawer closes and navigates, then emits, because the target screen may
// not be mounted yet when the row is tapped.
export const OPEN_GROCERY_LIST_EVENT = 'open_grocery_list';
