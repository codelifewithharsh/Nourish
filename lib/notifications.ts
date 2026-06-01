import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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
    { ...times.breakfast, title: 'Good morning! 🌅', body: "Don't forget to log your breakfast and start the day strong." },
    { ...times.lunch,     title: 'Lunch time 🍛',    body: "Log your lunch to stay on track with your daily targets." },
    { ...times.dinner,    title: 'Evening check-in 🌙', body: "How's your day going? Log dinner and hit your goals." },
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

  for (let h = wakeHour; h < sleepHour; h += intervalHours) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💧 Time to hydrate!',
        body: "A glass of water keeps you energised and on track.",
        sound: false,
        data: { tag: WATER_TAG },
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
