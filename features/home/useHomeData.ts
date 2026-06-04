import { useEffect, useState, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { WATER_LOGGED_EVENT, PROFILE_UPDATED_EVENT } from '@/lib/events';
import { analytics } from '@/lib/analytics';

export interface Meal {
  type: 'breakfast' | 'lunch' | 'dinner';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface HomeData {
  // Profile
  userName: string;
  email: string;
  avatarUrl: string | null;
  goal: string | null;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  // Today's meals from meal_plans
  meals: Meal[];
  // Today's logs
  loggedMealTypes: Set<string>;
  eatenCalories: number;
  eatenProtein: number;
  eatenCarbs: number;
  eatenFat: number;
  // Water
  glasses: number;
  // Streak & weekly activity
  streak: number;
  weekLoggedDays: boolean[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

// Local date string YYYY-MM-DD (not UTC) — so streaks and "today" match
// what the user sees on their calendar, not what UTC sees.
function localDateStr(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return localDateStr();
}

// Which day of the 7-day plan to show (rotates by day of year)
function planDayIndex() {
  const start = new Date('2024-01-01').getTime();
  const now = new Date().getTime();
  const daysSince = Math.floor((now - start) / 86400000);
  return daysSince % 7;
}

export function useHomeData() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const avatarUrlRef = useRef<string | null>(null);

  const fetchAll = useCallback(async (uid: string, avatarUrl: string | null = avatarUrlRef.current) => {
    const today = todayStr();

    // Fetch last 365 days of logs to calculate streak + this week
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const sixtyDaysAgoStr = yearAgo.toISOString().split('T')[0];

    const [profileRes, mealPlanRes, logsRes, waterRes, historyRes] = await Promise.all([
      supabase.from('profiles').select('name, email, goal, daily_calories, daily_protein').eq('id', uid).single(),
      supabase.from('meal_plans').select('plan').eq('user_id', uid).maybeSingle(),
      supabase.from('daily_logs').select('meal_type, meal_name, calories, protein, carbs, fat, logged_at').eq('user_id', uid).eq('date', today).order('logged_at', { ascending: false }),
      supabase.from('water_logs').select('glasses').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('daily_logs').select('date').eq('user_id', uid).gte('date', sixtyDaysAgoStr),
    ]);

    const profile = profileRes.data;
    const targetCalories = profile?.daily_calories ?? 2000;
    const targetProtein  = profile?.daily_protein  ?? 120;
    const proteinCals   = targetProtein * 4;
    const remainingCals = targetCalories - proteinCals;
    const targetCarbs   = Math.round((remainingCals * 0.6) / 4);
    const targetFat     = Math.round((remainingCals * 0.4) / 9);

    // Extract today's meals from plan
    const plan = mealPlanRes.data?.plan as any;
    const dayIndex = planDayIndex();
    const plannedMeals: Meal[] = plan?.days?.[dayIndex]?.meals ?? [];

    // Aggregate today's logs (already ordered newest-first)
    const logs = logsRes.data ?? [];
    const eatenCalories = logs.reduce((s, l) => s + l.calories, 0);
    const eatenProtein  = logs.reduce((s, l) => s + l.protein,  0);
    const eatenCarbs    = logs.reduce((s, l) => s + l.carbs,    0);
    const eatenFat      = logs.reduce((s, l) => s + l.fat,      0);
    const loggedMealTypes = new Set(logs.map((l) => l.meal_type));

    // Build display meals: when a meal_type has a log, show what the user
    // actually ate (most recent log) instead of the AI-planned meal.
    // For any logged meal_type not in the plan (e.g. snack), append it.
    const latestLogByType = new Map<string, typeof logs[number]>();
    for (const l of logs) {
      if (!latestLogByType.has(l.meal_type)) latestLogByType.set(l.meal_type, l);
    }
    const dayMeals: Meal[] = plannedMeals.map((m) => {
      const log = latestLogByType.get(m.type);
      if (!log) return m;
      return {
        type:     m.type,
        name:     log.meal_name ?? m.name,
        calories: log.calories,
        protein:  log.protein,
        carbs:    log.carbs,
        fat:      log.fat,
      };
    });
    const plannedTypes: Set<string> = new Set(plannedMeals.map((m) => m.type));
    for (const [type, log] of latestLogByType) {
      if (plannedTypes.has(type)) continue;
      dayMeals.push({
        type:     type as Meal['type'],
        name:     log.meal_name ?? type,
        calories: log.calories,
        protein:  log.protein,
        carbs:    log.carbs,
        fat:      log.fat,
      });
    }

    // Build set of unique dates that have at least one log
    const loggedDates = new Set((historyRes.data ?? []).map((r) => r.date));

    // Streak: count consecutive days going backwards using LOCAL dates.
    // Start from yesterday if today has no logs yet — opening the app in the
    // morning before logging should not break a multi-day streak.
    let streak = 0;
    const cursor = new Date();
    if (!loggedDates.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      const dateStr = localDateStr(cursor);
      if (loggedDates.has(dateStr)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    // This week: Mon=0 … Sun=6, true if that day has any log
    const weekLoggedDays: boolean[] = Array(7).fill(false);
    const now = new Date();
    const todayJsDay = now.getDay(); // 0=Sun
    const mondayOffset = (todayJsDay === 0 ? -6 : 1 - todayJsDay);
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + mondayOffset + i);
      weekLoggedDays[i] = loggedDates.has(localDateStr(d));
    }

    setData({
      userName:       profile?.name ?? 'there',
      email:          profile?.email ?? '',
      avatarUrl,
      goal:           profile?.goal ?? null,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      meals:          dayMeals,
      loggedMealTypes,
      eatenCalories:  Math.round(eatenCalories),
      eatenProtein:   Math.round(eatenProtein),
      eatenCarbs:     Math.round(eatenCarbs),
      eatenFat:       Math.round(eatenFat),
      glasses:        waterRes.data?.glasses ?? 0,
      streak,
      weekLoggedDays,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        avatarUrlRef.current =
          user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
        fetchAll(user.id);
      }
    });
  }, []);

  const logMeal = useCallback(async (meal: Meal) => {
    if (!userId) return;
    haptic.success();
    const today = todayStr();
    await supabase.from('daily_logs').insert({
      user_id:   userId,
      date:      today,
      meal_type: meal.type,
      meal_name: meal.name,
      calories:  meal.calories,
      protein:   meal.protein,
      carbs:     meal.carbs,
      fat:       meal.fat,
    });
    analytics.mealLogged({ meal_type: meal.type, calories: meal.calories, protein: meal.protein });
    fetchAll(userId);
  }, [userId, fetchAll]);

  const updateWater = useCallback(async (glasses: number) => {
    if (!userId) return;
    haptic.light();
    const today = todayStr();
    await supabase.from('water_logs').upsert(
      { user_id: userId, date: today, glasses },
      { onConflict: 'user_id,date' }
    );
    setData((prev) => prev ? { ...prev, glasses } : prev);
    analytics.waterLogged({ glasses });
  }, [userId]);

  const refresh = useCallback(() => {
    if (userId) fetchAll(userId);
  }, [userId, fetchAll]);

  useEffect(() => {
    const waterSub = DeviceEventEmitter.addListener(WATER_LOGGED_EVENT, ({ glasses }: { glasses: number }) => {
      setData((prev) => prev ? { ...prev, glasses } : prev);
    });
    const profileSub = DeviceEventEmitter.addListener(PROFILE_UPDATED_EVENT, () => {
      if (userId) fetchAll(userId);
    });
    return () => { waterSub.remove(); profileSub.remove(); };
  }, [userId, fetchAll]);

  return { data, loading, logMeal, updateWater, refresh };
}
