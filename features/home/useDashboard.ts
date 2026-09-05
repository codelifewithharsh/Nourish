import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import { localDateStr, todayStr } from '@/lib/date';
import { WATER_LOGGED_EVENT, PROFILE_UPDATED_EVENT } from '@/lib/events';

/**
 * Nutrient targets not stored on the profile.
 *
 * Only daily_calories and daily_protein are persisted, so everything else is
 * derived here. Fibre/sodium/sugar use general adult guidance rather than
 * anything personalised — they exist to give the dashboard something honest
 * to say, not to be clinical advice.
 */
const FIBRE_TARGET_G      = 30;   // WHO/ICMR general adult guidance
const SODIUM_LIMIT_MG     = 2000; // WHO upper limit; Indian diets often exceed this
const SUGAR_LIMIT_G       = 50;   // WHO: below 10% of a 2000 kcal diet
const SAT_FAT_LIMIT_PCT   = 0.10; // 10% of daily calories

export interface DashboardTotals {
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
  fibre:    number;
  sugar:    number;
  sodium:   number;
  sat_fat:  number;
}

export interface DashboardTargets extends DashboardTotals {}

export interface LoggedItem {
  id:         string;
  meal_type:  string;
  meal_name:  string;
  calories:   number;
  protein:    number;
  photo_path: string | null;
  photo_url:  string | null;
}

export interface Insight {
  /** Which nutrient this is about, so the UI can highlight the right bar. */
  key:      keyof DashboardTotals;
  severity: 'warn' | 'good';
  /** The consequence, not the number. */
  message:  string;
}

export interface DashboardData {
  userName:  string;
  avatarUrl: string | null;
  eaten:     DashboardTotals;
  targets:   DashboardTargets;
  logged:    LoggedItem[];
  nextMeal:  { type: string; name: string; calories: number; protein: number } | null;
  glasses:   number;
  streak:    number;
  weekLoggedDays: boolean[];
  insights:  Insight[];
}

const EMPTY: DashboardTotals = {
  calories: 0, protein: 0, carbs: 0, fat: 0,
  fibre: 0, sugar: 0, sodium: 0, sat_fat: 0,
};

function planDayIndex() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Turn multi-day patterns into one thing worth saying.
 *
 * Rules, deliberately conservative:
 *  - Only fire on a sustained pattern (3+ days), never on a single bad day.
 *    A person who ate badly once needs no commentary.
 *  - Return at most one insight — the worst offender. A wall of warnings
 *    reads as nagging and gets ignored.
 *  - Always name the mechanism ("this is where muscle is lost"), never just
 *    restate the number the user can already see.
 *  - A good streak is worth saying too, so this isn't only ever bad news.
 */
export function deriveInsights(
  history: { date: string; protein: number; fibre: number; sodium: number; calories: number }[],
  targets: DashboardTargets,
  todayDate: string,
): Insight[] {
  // Group by day, excluding today — today is still in progress, so judging it
  // before dinner would be both wrong and discouraging.
  const byDay = new Map<string, { protein: number; fibre: number; sodium: number; calories: number }>();
  for (const row of history) {
    if (row.date === todayDate) continue;
    const acc = byDay.get(row.date) ?? { protein: 0, fibre: 0, sodium: 0, calories: 0 };
    acc.protein  += row.protein  ?? 0;
    acc.fibre    += row.fibre    ?? 0;
    acc.sodium   += row.sodium   ?? 0;
    acc.calories += row.calories ?? 0;
    byDay.set(row.date, acc);
  }

  // Only consider days the user actually logged; a day with no logs tells us
  // nothing about what they ate.
  const days = [...byDay.entries()]
    .filter(([, v]) => v.calories > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 7)
    .map(([, v]) => v);

  if (days.length < 3) return [];

  const recent = days.slice(0, Math.min(4, days.length));

  const proteinShort = recent.filter((d) => d.protein < targets.protein * 0.8).length;
  const fibreShort   = recent.filter((d) => d.fibre   < FIBRE_TARGET_G * 0.6).length;
  const sodiumOver   = recent.filter((d) => d.sodium  > SODIUM_LIMIT_MG).length;
  const proteinGood  = recent.filter((d) => d.protein >= targets.protein * 0.9).length;

  const candidates: Insight[] = [];

  if (proteinShort >= 3) {
    candidates.push({
      key: 'protein',
      severity: 'warn',
      message: `Protein has been under target ${proteinShort} of the last ${recent.length} days. Sustained low protein is where muscle gets lost, not fat.`,
    });
  }
  if (sodiumOver >= 3) {
    candidates.push({
      key: 'sodium',
      severity: 'warn',
      message: `Salt has run high ${sodiumOver} days running. It's the quiet driver of blood pressure, and restaurant food is usually the source.`,
    });
  }
  if (fibreShort >= 3) {
    candidates.push({
      key: 'fibre',
      severity: 'warn',
      message: `Fibre has been low most of this week. It's what keeps digestion and cholesterol in check — dal, sabzi and whole grains close the gap fastest.`,
    });
  }

  if (candidates.length > 0) return [candidates[0]];

  if (proteinGood >= 3) {
    return [{
      key: 'protein',
      severity: 'good',
      message: `Protein has been on target ${proteinGood} of the last ${recent.length} days. That consistency is what actually builds strength.`,
    }];
  }

  return [];
}

export function useDashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId]   = useState<string | null>(null);

  const fetchAll = useCallback(async (uid: string, avatarUrl: string | null) => {
    const today = todayStr();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 30);

    const [profileRes, planRes, todayRes, waterRes, historyRes] = await Promise.all([
      supabase.from('profiles')
        .select('name, daily_calories, daily_protein')
        .eq('id', uid).single(),
      supabase.from('meal_plans').select('plan').eq('user_id', uid).maybeSingle(),
      supabase.from('daily_logs')
        .select('id, meal_type, meal_name, calories, protein, carbs, fat, fibre, sugar, sodium, sat_fat, photo_path')
        .eq('user_id', uid).eq('date', today)
        .order('logged_at', { ascending: false }),
      supabase.from('water_logs').select('glasses').eq('user_id', uid).eq('date', today).maybeSingle(),
      supabase.from('daily_logs')
        .select('date, calories, protein, fibre, sodium')
        .eq('user_id', uid).gte('date', localDateStr(weekAgo)),
    ]);

    const profile        = profileRes.data;
    const targetCalories = profile?.daily_calories ?? 2000;
    const targetProtein  = profile?.daily_protein  ?? 60;
    const proteinCals    = targetProtein * 4;
    const remaining      = targetCalories - proteinCals;

    const targets: DashboardTargets = {
      calories: targetCalories,
      protein:  targetProtein,
      carbs:    Math.round((remaining * 0.6) / 4),
      fat:      Math.round((remaining * 0.4) / 9),
      fibre:    FIBRE_TARGET_G,
      sugar:    SUGAR_LIMIT_G,
      sodium:   SODIUM_LIMIT_MG,
      sat_fat:  Math.round((targetCalories * SAT_FAT_LIMIT_PCT) / 9),
    };

    const rows = todayRes.data ?? [];
    const eaten: DashboardTotals = rows.reduce((a, r) => ({
      calories: a.calories + (r.calories ?? 0),
      protein:  a.protein  + (r.protein  ?? 0),
      carbs:    a.carbs    + (r.carbs    ?? 0),
      fat:      a.fat      + (r.fat      ?? 0),
      fibre:    a.fibre    + (r.fibre    ?? 0),
      sugar:    a.sugar    + (r.sugar    ?? 0),
      sodium:   a.sodium   + (r.sodium   ?? 0),
      sat_fat:  a.sat_fat  + (r.sat_fat  ?? 0),
    }), { ...EMPTY });

    // Signed URLs for meal photos, so the timeline shows real food. The bucket
    // is private; a failure here just means no thumbnail, never a broken screen.
    const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
    let urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('meal-photos')
        .createSignedUrls([...new Set(paths)], 3600);
      for (const su of signed ?? []) {
        if (su.path && su.signedUrl) urlByPath.set(su.path, su.signedUrl);
      }
    }

    const logged: LoggedItem[] = rows.map((r) => ({
      id:         r.id,
      meal_type:  r.meal_type,
      meal_name:  r.meal_name,
      calories:   r.calories ?? 0,
      protein:    r.protein  ?? 0,
      photo_path: r.photo_path ?? null,
      photo_url:  r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
    }));

    const loggedTypes = new Set(rows.map((r) => r.meal_type));
    const plan        = planRes.data?.plan as { days?: { meals?: any[] }[] } | undefined;
    const dayMeals    = plan?.days?.[planDayIndex()]?.meals ?? [];
    const upcoming    = dayMeals.find((m: any) => !loggedTypes.has(m.type)) ?? null;

    // Streak + week strip, same local-date logic the old home screen used.
    const loggedDates = new Set((historyRes.data ?? []).map((r) => r.date));
    let streak = 0;
    const cursor = new Date();
    if (!loggedDates.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (loggedDates.has(localDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const weekLoggedDays: boolean[] = Array(7).fill(false);
    const now = new Date();
    const jsDay = now.getDay();
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + mondayOffset + i);
      weekLoggedDays[i] = loggedDates.has(localDateStr(d));
    }

    setData({
      userName:  profile?.name ?? 'there',
      avatarUrl,
      eaten,
      targets,
      logged,
      nextMeal:  upcoming
        ? { type: upcoming.type, name: upcoming.name, calories: upcoming.calories, protein: upcoming.protein }
        : null,
      glasses:   waterRes.data?.glasses ?? 0,
      streak,
      weekLoggedDays,
      insights:  deriveInsights((historyRes.data ?? []) as any, targets, today),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const avatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
      fetchAll(user.id, avatar);
    });
  }, [fetchAll]);

  const refresh = useCallback(() => {
    if (userId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        const avatar = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;
        fetchAll(userId, avatar);
      });
    }
  }, [userId, fetchAll]);

  useEffect(() => {
    const water   = DeviceEventEmitter.addListener(WATER_LOGGED_EVENT, refresh);
    const profile = DeviceEventEmitter.addListener(PROFILE_UPDATED_EVENT, refresh);
    return () => { water.remove(); profile.remove(); };
  }, [refresh]);

  return { data, loading, refresh, userId };
}
