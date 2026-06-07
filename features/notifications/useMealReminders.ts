// Shared meal-reminder state for the home bell sheet and profile screen.
//
// Both surfaces let the user toggle meal reminders on/off and pick times
// for breakfast / lunch / dinner. The old setup held each in its own local
// state, so a change in one didn't reflect in the other (and the bell on
// home wouldn't even show the active dot if the user had enabled from
// profile).
//
// This hook centralises three things:
//   1. Reading the times from the user's profile row at mount.
//   2. Reading the live enabled-state from the OS scheduled-notifications
//      count, so it reflects reality not just what we last toggled.
//   3. Persisting changes to the DB and broadcasting to other mounted
//      consumers via DeviceEventEmitter — every consumer hears every change.

import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_MEAL_TIMES,
  MealTimes,
  scheduleMealReminders as scheduleMealRemindersFn,
  cancelMealReminders,
  requestNotificationPermission,
} from '@/lib/notifications';
import { MEAL_TIMES_CHANGED_EVENT, MEAL_NOTIFS_TOGGLED_EVENT } from '@/lib/events';

export interface UseMealReminders {
  mealTimes:      MealTimes;
  enabled:        boolean;
  /** Replace the time (hour, minute=0) for one meal. Persists + reschedules. */
  setMealTime:    (meal: keyof MealTimes, hour: number) => Promise<void>;
  /** Turn the whole reminder set on or off. Persists + (re)schedules. */
  setEnabled:     (val: boolean) => Promise<void>;
}

interface ProfileRow { meal_notification_times?: MealTimes | null }

export function useMealReminders(): UseMealReminders {
  const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);
  const [enabled,   setEnabledState] = useState<boolean>(false);

  // Read the persisted times from the user's profile row, and the live
  // OS-level enabled state from the scheduled-notifications count.
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('meal_notification_times')
        .eq('id', user.id)
        .maybeSingle();
      const row = data as ProfileRow | null;
      if (row?.meal_notification_times) setMealTimes(row.meal_notification_times);
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') { setEnabledState(false); return; }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const hasMealNotifs = scheduled.some((n) => (n.content.data as { tag?: string } | null)?.tag === 'meal-reminder');
    setEnabledState(hasMealNotifs);
  }, []);

  useEffect(() => {
    refresh();
    const sub1 = DeviceEventEmitter.addListener(MEAL_TIMES_CHANGED_EVENT,    refresh);
    const sub2 = DeviceEventEmitter.addListener(MEAL_NOTIFS_TOGGLED_EVENT,   refresh);
    return () => { sub1.remove(); sub2.remove(); };
  }, [refresh]);

  const persistTimes = useCallback(async (next: MealTimes) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        // The Supabase types lag this column on some envs — cast to bypass.
        .update({ meal_notification_times: next } as never)
        .eq('id', user.id);
    }
  }, []);

  const setMealTime = useCallback(async (meal: keyof MealTimes, hour: number) => {
    const next = { ...mealTimes, [meal]: { hour, minute: 0 } };
    setMealTimes(next);
    await persistTimes(next);
    if (enabled) await scheduleMealRemindersFn(next);
    DeviceEventEmitter.emit(MEAL_TIMES_CHANGED_EVENT);
  }, [mealTimes, enabled, persistTimes]);

  const setEnabled = useCallback(async (val: boolean) => {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      await scheduleMealRemindersFn(mealTimes);
      setEnabledState(true);
    } else {
      await cancelMealReminders();
      setEnabledState(false);
    }
    DeviceEventEmitter.emit(MEAL_NOTIFS_TOGGLED_EVENT);
  }, [mealTimes]);

  return { mealTimes, enabled, setMealTime, setEnabled };
}
