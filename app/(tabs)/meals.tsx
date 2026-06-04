import { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { useAI } from '@/features/credits/CreditsContext';
import { AIError } from '@/lib/aiClient';
import { SwapMealModal, SwapResult } from '@/components/SwapMealModal';
import { analytics } from '@/lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface Meal {
  type: MealType;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Day {
  day: number;
  meals: Meal[];
  total_calories: number;
  total_protein: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Map real day of week to plan index (Mon=0 ... Sun=6).
// JS getDay(): Sun=0 ... Sat=6. We convert so Mon=0.
function todayPlanIndex() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: Colors.accent,
  lunch:     '#E6A817',
  dinner:    '#7B5EA7',
  snack:     '#E05A6B',
};

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snack',
};

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
  snack:     '🍎',
};

const MEAL_TIME_HINT: Record<MealType, string> = {
  breakfast: '7 – 10 AM',
  lunch:     '12 – 2 PM',
  dinner:    '7 – 9 PM',
  snack:     '4 – 6 PM',
};

const ALL_MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// Which meal type would "next" be based on current time?
function nextMealTypeByTime(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

// ─── Shimmer placeholder ──────────────────────────────────────────────────────

function ShimmerCard() {
  return (
    <View style={sk.card}>
      <View style={sk.pill} />
      <View style={sk.title} />
      <View style={sk.sub} />
    </View>
  );
}

const sk = StyleSheet.create({
  card:  { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 10 },
  pill:  { width: 80, height: 18, borderRadius: 999, backgroundColor: Colors.border },
  title: { width: '70%', height: 22, borderRadius: 8, backgroundColor: Colors.border },
  sub:   { width: '50%', height: 16, borderRadius: 8, backgroundColor: Colors.border },
});

// ─── Meal Card ────────────────────────────────────────────────────────────────

function MealCard({
  meal, status, onLog, onSwap, onView,
}: {
  meal: Meal;
  status: 'logged' | 'next' | 'upcoming' | 'past' | 'future';
  onLog: () => void;
  onSwap: () => void;
  onView: () => void;
}) {
  const color = MEAL_COLOR[meal.type];
  const emoji = MEAL_EMOJI[meal.type];
  const isLogged = status === 'logged';
  const isNext   = status === 'next';
  const isFuture = status === 'future';

  // Collapsed/logged variant
  if (isLogged) {
    return (
      <TouchableOpacity style={[mc.card, mc.cardLogged]} onPress={onView} activeOpacity={0.85}>
        <View style={mc.loggedRow}>
          <View style={[mc.checkCircle, { backgroundColor: color }]}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
          </View>
          <View style={mc.loggedInfo}>
            <View style={mc.loggedTopRow}>
              <Txt style={mc.loggedEmoji}>{emoji}</Txt>
              <Txt style={[mc.loggedType, { color }]}>{MEAL_LABEL[meal.type]}</Txt>
              <Txt style={mc.loggedDot}>·</Txt>
              <Txt style={mc.loggedTime}>{meal.calories} kcal</Txt>
            </View>
            <Txt style={mc.loggedName} numberOfLines={1}>{meal.name}</Txt>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[mc.card, isNext && mc.cardNext, isFuture && mc.cardFuture]}>
      {/* Status stripe on left */}
      <View style={[mc.stripe, { backgroundColor: color }]} />

      {/* Top row: meal label + time hint + status badge */}
      <View style={mc.topRow}>
        <View style={mc.topLeft}>
          <Txt style={mc.emoji}>{emoji}</Txt>
          <View>
            <Txt style={[mc.label, { color }]}>{MEAL_LABEL[meal.type]}</Txt>
            <Txt style={mc.time}>{MEAL_TIME_HINT[meal.type]}</Txt>
          </View>
        </View>
        {isNext && (
          <View style={mc.nextBadge}>
            <View style={mc.nextDot} />
            <Txt style={mc.nextTxt}>Up next</Txt>
          </View>
        )}
      </View>

      {/* Meal name — tap to view recipe */}
      <TouchableOpacity onPress={onView} activeOpacity={0.7} style={mc.nameWrap}>
        <Txt style={mc.name}>{meal.name}</Txt>
        <Txt style={[mc.viewRecipe, { color }]}>View recipe →</Txt>
      </TouchableOpacity>

      {/* Macros */}
      <View style={mc.macroRow}>
        <MacroPill value={`${meal.calories}`} unit="kcal" color={color} prominent />
        <MacroPill value={`${meal.protein}g`} unit="protein" color="#5B8DB8" />
        <MacroPill value={`${meal.carbs}g`}   unit="carbs"   color="#E6A817" />
        <MacroPill value={`${meal.fat}g`}     unit="fat"     color="#9B59B6" />
      </View>

      {/* Actions */}
      {!isFuture && (
        <View style={mc.btns}>
          <TouchableOpacity
            style={[mc.btnLog, { backgroundColor: color }]}
            activeOpacity={0.88}
            onPress={onLog}
          >
            <Check size={16} color="#FFFFFF" strokeWidth={3} />
            <Txt style={mc.btnLogTxt}>Log it</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mc.btnSwap, { borderColor: color }]}
            activeOpacity={0.85}
            onPress={onSwap}
          >
            <Sparkles size={14} color={color} strokeWidth={2.5} />
            <Txt style={[mc.btnSwapTxt, { color }]}>Swap</Txt>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function MacroPill({
  value, unit, color, prominent,
}: { value: string; unit: string; color: string; prominent?: boolean }) {
  return (
    <View style={[mp.wrap, { backgroundColor: color + (prominent ? '20' : '12') }]}>
      <Txt style={[mp.value, { color }]}>{value}</Txt>
      <Txt style={[mp.unit, { color: color + 'C0' }]}>{unit}</Txt>
    </View>
  );
}

const mp = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'baseline', gap: 3, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  value: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  unit:  { fontSize: 10, fontWeight: '600', lineHeight: 14 },
});

const mc = StyleSheet.create({
  card:        { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardNext:    { shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  cardFuture:  { opacity: 0.75 },
  cardLogged:  { paddingVertical: 12, paddingHorizontal: 14 },
  stripe:      { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },

  topRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 6 },
  topLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji:       { fontSize: 22, lineHeight: 28 },
  label:       { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 17 },
  time:        { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  nextBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  nextDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  nextTxt:     { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.3, textTransform: 'uppercase' },

  nameWrap:    { marginLeft: 6, gap: 3 },
  name:        { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24, letterSpacing: -0.2 },
  viewRecipe:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, lineHeight: 14 },

  macroRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 6 },

  btns:        { flexDirection: 'row', gap: 8, marginTop: 4, marginLeft: 6 },
  btnLog:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12 },
  btnLogTxt:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },
  btnSwap:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 44, borderRadius: 12, borderWidth: 1.5, backgroundColor: Colors.surface },
  btnSwapTxt:  { fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // Logged compact variant
  loggedRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loggedInfo:   { flex: 1, gap: 2 },
  loggedTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loggedEmoji:  { fontSize: 13, lineHeight: 17 },
  loggedType:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  loggedDot:    { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  loggedTime:   { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '600' },
  loggedName:   { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
});

// ─── Add Snack CTA (when no snack in plan) ───────────────────────────────────

function AddSnackCard({ onAdd }: { onAdd: () => void }) {
  return (
    <TouchableOpacity style={as.wrap} onPress={onAdd} activeOpacity={0.85}>
      <View style={as.iconWrap}>
        <Sparkles size={16} color={MEAL_COLOR.snack} strokeWidth={2.5} />
      </View>
      <View style={as.info}>
        <Txt style={as.title}>Add a snack</Txt>
        <Txt style={as.sub}>AI will suggest something light · 4 – 6 PM</Txt>
      </View>
      <ChevronRight size={18} color={Colors.secondary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const as = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 18, padding: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: MEAL_COLOR.snack + '50' },
  iconWrap:{ width: 36, height: 36, borderRadius: 18, backgroundColor: MEAL_COLOR.snack + '15', alignItems: 'center', justifyContent: 'center' },
  info:    { flex: 1, gap: 2 },
  title:   { fontSize: 15, fontWeight: '700', color: Colors.primary, lineHeight: 20 },
  sub:     { fontSize: 12, color: Colors.secondary, lineHeight: 16 },
});

// ─── Summary Macro Cell ───────────────────────────────────────────────────────

function SummaryMacro({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={sm.wrap}>
      <Txt style={[sm.value, { color }]}>{value}</Txt>
      <Txt style={sm.label}>{label}</Txt>
    </View>
  );
}

const sm = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  label: { fontSize: 10, fontWeight: '600', color: Colors.secondary, letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 13 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MealsScreen() {
  const [todayIndex,  setTodayIndex]  = useState(todayPlanIndex());
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [plan, setPlan] = useState<Day[] | null>(null);
  const [loggedTypes, setLoggedTypes] = useState<Set<string>>(new Set());
  const [loggedMealsByType, setLoggedMealsByType] = useState<Record<string, Meal>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<Meal | null>(null);
  const [addingSnack, setAddingSnack] = useState(false);
  const invoke = useAI();

  // Fetch the plan + today's logs together
  const fetchData = useCallback(async (uid: string) => {
    const today = todayStr();
    const [planRes, logsRes] = await Promise.all([
      supabase.from('meal_plans').select('plan').eq('user_id', uid).maybeSingle(),
      supabase
        .from('daily_logs')
        .select('meal_type, meal_name, calories, protein, carbs, fat, logged_at')
        .eq('user_id', uid).eq('date', today)
        .order('logged_at', { ascending: false }),
    ]);
    const raw = planRes.data?.plan as any;
    setPlan(raw?.days ?? null);
    applyLogs(logsRes.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch just today's logs (used on focus for cross-tab sync)
  const fetchLogsOnly = useCallback(async (uid: string) => {
    const today = todayStr();
    const { data } = await supabase
      .from('daily_logs')
      .select('meal_type, meal_name, calories, protein, carbs, fat, logged_at')
      .eq('user_id', uid).eq('date', today)
      .order('logged_at', { ascending: false });
    applyLogs(data ?? []);
  }, []);

  // Reduce raw log rows into the two derived states we render from
  const applyLogs = (logs: { meal_type: string; meal_name: string; calories: number; protein: number; carbs: number; fat: number }[]) => {
    const latest: Record<string, Meal> = {};
    for (const l of logs) {
      if (latest[l.meal_type]) continue; // already have newer (sorted desc)
      latest[l.meal_type] = {
        type:     l.meal_type as MealType,
        name:     l.meal_name,
        calories: l.calories,
        protein:  l.protein,
        carbs:    l.carbs,
        fat:      l.fat,
      };
    }
    setLoggedMealsByType(latest);
    setLoggedTypes(new Set(Object.keys(latest)));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        fetchData(user.id);
      }
    });
  }, []);

  // Cross-tab sync: refetch logs when meals tab gains focus.
  // Also recompute today's index in case the date rolled over midnight.
  useFocusEffect(
    useCallback(() => {
      analytics.screenViewed({ screen: 'meals' });
      const newToday = todayPlanIndex();
      if (newToday !== todayIndex) {
        setTodayIndex(newToday);
        setSelectedDay(newToday);
      }
      if (userId) fetchLogsOnly(userId);
    }, [userId, fetchLogsOnly, todayIndex])
  );

  const onRefresh = useCallback(() => {
    if (!userId) return;
    setRefreshing(true);
    fetchData(userId);
  }, [userId, fetchData]);

  const handleLog = useCallback(async (meal: Meal) => {
    if (!userId) return;
    haptic.success();
    await supabase.from('daily_logs').insert({
      user_id:   userId,
      date:      todayStr(),
      meal_type: meal.type,
      meal_name: meal.name,
      calories:  meal.calories,
      protein:   meal.protein,
      carbs:     meal.carbs,
      fat:       meal.fat,
    });
    setLoggedTypes((prev) => new Set([...prev, meal.type]));
    setLoggedMealsByType((prev) => ({ ...prev, [meal.type]: meal }));
  }, [userId]);

  const handleRegenerate = useCallback(async () => {
    if (!userId || regenerating) return;
    setRegenerating(true);
    haptic.light();
    try {
      await invoke('generate-meal-plan');
      analytics.planRegenerated();
      await fetchData(userId);
    } catch (err) {
      // CreditsProvider surfaces 402/429; for openai_error fall through silently
      // — the stale plan stays visible, which is better than crashing.
      if (!(err instanceof AIError) || (err.code !== 'no_credits' && err.code !== 'rate_limited')) {
        console.warn('generate-meal-plan failed', err);
      }
    } finally {
      setRegenerating(false);
    }
  }, [userId, regenerating, fetchData, invoke]);

  // Update a single meal in the plan (used when user swaps + toggles "update plan")
  const persistMealInPlan = useCallback(async (mealType: MealType, newMeal: Meal) => {
    if (!userId || !plan) return;
    const updatedPlan = plan.map((day, i) => {
      if (i !== selectedDay) return day;
      const hasType = day.meals.some((m) => m.type === mealType);
      const updatedMeals = hasType
        ? day.meals.map((m) => m.type === mealType ? newMeal : m)
        : [...day.meals, newMeal];
      const totalCalories = updatedMeals.reduce((s, m) => s + m.calories, 0);
      const totalProtein  = updatedMeals.reduce((s, m) => s + m.protein, 0);
      return { ...day, meals: updatedMeals, total_calories: totalCalories, total_protein: totalProtein };
    });
    setPlan(updatedPlan);
    await supabase.from('meal_plans')
      .update({ plan: { days: updatedPlan } as any, generated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }, [userId, plan, selectedDay]);

  // Trigger swap modal for adding a snack from scratch
  const handleAddSnack = useCallback(() => {
    setAddingSnack(true);
    setSwapTarget({ type: 'snack', name: '(no snack planned)', calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, []);

  const selectedDayData = plan?.[selectedDay];
  const isToday = selectedDay === todayIndex;

  // Build all 4 meal slots in fixed order. For today, a logged meal of a given
  // type replaces the planned one — so users see what they actually ate.
  const mealsByType: Partial<Record<MealType, Meal>> = {};
  (selectedDayData?.meals ?? []).forEach((m) => {
    mealsByType[m.type as MealType] = m;
  });
  if (isToday) {
    for (const t of ALL_MEAL_ORDER) {
      const log = loggedMealsByType[t];
      if (log) mealsByType[t] = log;
    }
  }
  const orderedMeals = ALL_MEAL_ORDER
    .map((t) => mealsByType[t])
    .filter((m): m is Meal => !!m);

  // Compute status for each meal (only matters for today)
  function getStatus(meal: Meal): 'logged' | 'next' | 'upcoming' | 'past' | 'future' {
    if (!isToday) return 'future';
    if (loggedTypes.has(meal.type)) return 'logged';
    const nextType = nextMealTypeByTime();
    if (meal.type === nextType) return 'next';
    return 'upcoming';
  }

  // Summary totals (computed from current ordered meals)
  const summaryCalories = orderedMeals.reduce((s, m) => s + m.calories, 0);
  const summaryProtein  = orderedMeals.reduce((s, m) => s + m.protein,  0);
  const summaryCarbs    = orderedMeals.reduce((s, m) => s + m.carbs,    0);
  const summaryFat      = orderedMeals.reduce((s, m) => s + m.fat,      0);

  const dayTitle = isToday ? 'Today' : FULL_DAYS[selectedDay];
  const hasSnack = !!mealsByType.snack;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Txt style={s.title}>Meal Plan</Txt>
          <Txt style={s.subtitle}>{dayTitle} · {orderedMeals.length} {orderedMeals.length === 1 ? 'meal' : 'meals'} planned</Txt>
        </View>

        {/* ── Day Selector ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayRow}>
          {DAY_LABELS.map((label, i) => {
            const isSelected = i === selectedDay;
            const isPast = i < todayIndex;
            const isTodayPill = i === todayIndex;
            const dayData = plan?.[i];
            const allLogged = isPast && dayData?.meals && dayData.meals.length > 0;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  s.dayPill,
                  isSelected && s.dayPillActive,
                  !isSelected && isTodayPill && s.dayPillToday,
                ]}
                onPress={() => { setSelectedDay(i); haptic.light(); analytics.planDayChanged({ day: FULL_DAYS[i], is_future: i > todayIndex }); }}
                activeOpacity={0.75}
              >
                <Txt style={[
                  s.dayPillTxt,
                  isSelected && s.dayPillTxtActive,
                  !isSelected && isTodayPill && s.dayPillTxtToday,
                ]}>
                  {label}
                </Txt>
                {allLogged && !isSelected && <View style={s.dayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Day Summary ── */}
        {selectedDayData && orderedMeals.length > 0 && (
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <SummaryMacro value={`${summaryCalories}`} label="Calories" color={Colors.accent} />
              <View style={s.summaryDiv} />
              <SummaryMacro value={`${summaryProtein}g`} label="Protein" color="#5B8DB8" />
              <View style={s.summaryDiv} />
              <SummaryMacro value={`${summaryCarbs}g`}   label="Carbs"   color="#E6A817" />
              <View style={s.summaryDiv} />
              <SummaryMacro value={`${summaryFat}g`}     label="Fat"     color="#9B59B6" />
            </View>
          </View>
        )}

        {/* ── Meals ── */}
        {loading ? (
          <View style={s.cards}>
            <ShimmerCard />
            <ShimmerCard />
            <ShimmerCard />
          </View>
        ) : !plan ? (
          <View style={s.emptyState}>
            <Txt style={s.emptyEmoji}>🍽️</Txt>
            <Txt style={s.emptyTitle}>Your plan is being generated</Txt>
            <Txt style={s.emptyBody}>This takes under a minute. Pull down to refresh.</Txt>
            <TouchableOpacity style={s.generateBtn} onPress={handleRegenerate} activeOpacity={0.85}>
              <Sparkles size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Txt style={s.generateBtnTxt}>Generate now</Txt>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.cards}>
            {orderedMeals.map((meal) => (
              <MealCard
                key={meal.type}
                meal={meal}
                status={getStatus(meal)}
                onLog={() => handleLog(meal)}
                onSwap={() => { analytics.swapModalOpened({ meal_type: meal.type, source: 'meals' }); setSwapTarget(meal); }}
                onView={() => { analytics.recipeViewed({ meal_type: meal.type, meal_name: meal.name }); router.push({ pathname: '/recipe/[id]', params: { id: encodeURIComponent(meal.name), type: meal.type, calories: String(meal.calories), protein: String(meal.protein), carbs: String(meal.carbs), fat: String(meal.fat) } }); }}
              />
            ))}

            {/* Promote "Add snack" if today and no snack planned */}
            {isToday && !hasSnack && (
              <AddSnackCard onAdd={handleAddSnack} />
            )}
          </View>
        )}


      </ScrollView>

      <SwapMealModal
        visible={!!swapTarget}
        mealType={swapTarget?.type ?? ''}
        currentMealName={addingSnack ? 'nothing yet' : (swapTarget?.name ?? '')}
        isAdd={addingSnack}
        onCancel={() => { setSwapTarget(null); setAddingSnack(false); }}
        onConfirm={async (result: SwapResult, updatePlan: boolean) => {
          if (swapTarget && userId) {
            // Always log it for today
            await supabase.from('daily_logs').insert({
              user_id:   userId,
              date:      todayStr(),
              meal_type: swapTarget.type,
              meal_name: result.name,
              calories:  result.calories,
              protein:   result.protein,
              carbs:     result.carbs,
              fat:       result.fat,
            });
            if (addingSnack) {
              analytics.snackAdded({ calories: result.calories, protein: result.protein });
            } else {
              analytics.mealSwapped({ meal_type: swapTarget.type });
            }
            setLoggedTypes((prev) => new Set([...prev, swapTarget.type]));
            setLoggedMealsByType((prev) => ({ ...prev, [swapTarget.type]: {
              type:     swapTarget.type,
              name:     result.name,
              calories: result.calories,
              protein:  result.protein,
              carbs:    result.carbs,
              fat:      result.fat,
            }}));

            // Optionally update the plan permanently
            if (updatePlan) {
              await persistMealInPlan(swapTarget.type, {
                type:     swapTarget.type,
                name:     result.name,
                calories: result.calories,
                protein:  result.protein,
                carbs:    result.carbs,
                fat:      result.fat,
              });
            } else if (addingSnack) {
              // For "add snack" flow, add it to the plan even without toggle
              // so user sees it on the meals tab
              await persistMealInPlan('snack', {
                type:     'snack',
                name:     result.name,
                calories: result.calories,
                protein:  result.protein,
                carbs:    result.carbs,
                fat:      result.fat,
              });
            }
          }
          setSwapTarget(null);
          setAddingSnack(false);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140, gap: 16 },

  header:   { gap: 2, paddingVertical: 4 },
  title:    { fontSize: 28, fontWeight: '800', color: Colors.primary, lineHeight: 34, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.secondary, lineHeight: 18 },

  dayRow:           { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  dayPill:          { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface, gap: 4 },
  dayPillActive:    { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayPillToday:     { borderColor: Colors.accent + '60' },
  dayPillTxt:       { fontSize: 13, fontWeight: '700', color: Colors.secondary, lineHeight: 18 },
  dayPillTxtActive: { color: '#FFFFFF' },
  dayPillTxtToday:  { color: Colors.accent },
  dayDot:           { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },

  summaryCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  summaryRow:  { flexDirection: 'row', alignItems: 'center' },
  summaryDiv:  { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: Colors.border },

  cards: { gap: 12 },

  emptyState:     { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyEmoji:     { fontSize: 48, lineHeight: 56 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24, textAlign: 'center' },
  emptyBody:      { fontSize: 14, color: Colors.secondary, lineHeight: 20, textAlign: 'center' },
  generateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, height: 48, paddingHorizontal: 24, backgroundColor: Colors.accent, borderRadius: 14 },
  generateBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },

  regenBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  regenBtnDisabled: { opacity: 0.5 },
  regenTxt:         { fontSize: 14, fontWeight: '600', color: Colors.secondary, lineHeight: 20 },
});
