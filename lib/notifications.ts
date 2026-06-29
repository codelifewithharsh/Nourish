import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export const WATER_ACTION_ID = 'LOG_WATER_GLASS';
const WATER_CATEGORY_ID = 'water-reminder-category';

export async function registerWaterNotificationCategory() {
  await Notifications.setNotificationCategoryAsync(WATER_CATEGORY_ID, [
    {
      identifier: WATER_ACTION_ID,
      buttonTitle: "I'll drink a glass 💧",
      options: { opensAppToForeground: false },
    },
  ]);
}

// Show notifications when app is in foreground too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Keep badge count at zero so no dot appears on the launcher icon.
Notifications.setBadgeCountAsync(0).catch(() => {});

// ── Push token registration ──────────────────────────────────────────────────
//
// Call this once after the user is authenticated. It requests permission,
// fetches the Expo push token, and stores it in profiles.expo_push_token so
// edge functions can send server-triggered notifications.
//
// PREREQUISITES (do these in your Expo / Apple / Google accounts):
//   1. Run `eas init` and paste the projectId into app.json →
//      expo.extra.eas.projectId  (required by getExpoPushTokenAsync)
//   2. Upload your APNs key to expo.dev → Project → Credentials (iOS)
//   3. Upload your FCM service account key (Android)
//   4. Remove the `./plugins/withoutPushEntitlement` entry from app.json
//      (that plugin strips the aps-environment entitlement which is needed
//      for real push delivery on iOS — it was only there while you lacked
//      an Apple Developer Program membership)
//
// Until step 1 is done this function returns silently without crashing.

export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return; // no-op until eas init is run

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return; // don't prompt here — let the user opt in first

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await supabase.from('profiles').update({ expo_push_token: token } as any).eq('id', userId);
  } catch {
    // Silently swallow — push token storage is best-effort, never block the app
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export interface MealTimes {
  breakfast: { hour: number; minute: number };
  lunch:     { hour: number; minute: number };
  dinner:    { hour: number; minute: number };
}

export const DEFAULT_MEAL_TIMES: MealTimes = {
  breakfast: { hour: 8,  minute: 0  },
  lunch:     { hour: 13, minute: 0  },
  dinner:    { hour: 19, minute: 30 },
};

const MEAL_NOTIF_TAG = 'meal-reminder';

export async function scheduleMealReminders(times: MealTimes = DEFAULT_MEAL_TIMES) {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel existing meal reminders only
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.tag === MEAL_NOTIF_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const reminders = [
    { ...times.breakfast, title: 'Breakfast time 🌅', body: "What's on the plate this morning? Log it before the day gets away." },
    { ...times.lunch,     title: 'Midday check-in 🍛', body: "Lunch break — log your meal and keep the streak alive." },
    { ...times.dinner,    title: 'Dinner o\'clock 🌙', body: "Almost done for the day. Log dinner and see how close you are to your goal." },
  ];

  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, sound: false, data: { tag: MEAL_NOTIF_TAG } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.hour,
        minute: r.minute,
      } as Notifications.DailyTriggerInput,
    });
  }
}

export async function cancelMealReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.tag === MEAL_NOTIF_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// Water reminders — scheduled from wakeHour to sleepHour every intervalHours.
// Identified by a tag so we can cancel only water ones without touching meal ones.
const WATER_TAG = 'water-reminder';

export async function scheduleWaterReminders(intervalHours: number, wakeHour = 8, sleepHour = 22) {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel existing water reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.tag === WATER_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  if (intervalHours === 0) return;

  await registerWaterNotificationCategory();

  for (let h = wakeHour; h < sleepHour; h += intervalHours) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hydration check 💧',
        body: "Your body needs water to burn fat and build muscle. Have a glass now.",
        sound: false,
        data: { tag: WATER_TAG },
        categoryIdentifier: WATER_CATEGORY_ID,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(h),
        minute: 0,
      } as Notifications.DailyTriggerInput,
    });
  }
}

export async function cancelWaterReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.tag === WATER_TAG) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
