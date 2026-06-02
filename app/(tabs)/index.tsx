import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, Switch } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, GlassWater, Droplets } from 'lucide-react-native';
import { useFocusEffect, router } from 'expo-router';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui';
import { useHomeData, Meal } from '@/features/home/useHomeData';
import { SwapMealModal, SwapResult } from '@/components/SwapMealModal';
import { HomeDrawer } from '@/components/HomeDrawer';
import { HowItWorksModal } from '@/components/HowItWorksModal';
import { scheduleMealReminders, cancelMealReminders, scheduleWaterReminders, cancelWaterReminders, requestNotificationPermission, DEFAULT_MEAL_TIMES, MealTimes } from '@/lib/notifications';
import * as Notifications from 'expo-notifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStreakTitle(n: number) {
  if (n >= 30) return '🏆 Health champion';
  if (n >= 15) return '💪 Unstoppable';
  if (n >= 8)  return '⚡ Consistent performer';
  return '🌱 Building momentum';
}

function getTimeEmoji() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return '☀️';
  if (h >= 12 && h < 17) return '🌤️';
  if (h >= 17 && h < 21) return '🌙';
  return '😴';
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}


function getNudge(
  meals: Meal[],
  loggedTypes: Set<string>,
  eatenCalories: number,
  targetCalories: number,
  eatenProtein: number,
  targetProtein: number,
): { emoji: string; message: string } {
  const h = new Date().getHours();
  const breakfastLogged = loggedTypes.has('breakfast');
  const lunchLogged     = loggedTypes.has('lunch');
  const dinnerLogged    = loggedTypes.has('dinner');
  const proteinLeft     = targetProtein - eatenProtein;
  const calLeft         = targetCalories - eatenCalories;

  if (h < 10 && !breakfastLogged) {
    const breakfast = meals.find((m) => m.type === 'breakfast');
    return { emoji: '🍳', message: `Start strong — ${breakfast?.name ?? 'breakfast'} gives you ${breakfast?.protein ?? 0}g protein to kickstart your day` };
  }
  if (h >= 10 && h < 14 && !lunchLogged) {
    return { emoji: '💪', message: `You need ${proteinLeft}g more protein today. Don't skip lunch!` };
  }
  if (h >= 14 && h < 18 && !dinnerLogged) {
    return { emoji: '🍽️', message: `${calLeft > 0 ? `${calLeft} kcal remaining` : 'On track'} — plan your dinner to hit your target` };
  }
  if (breakfastLogged && lunchLogged && dinnerLogged) {
    return { emoji: '✅', message: `All meals logged — great discipline today!` };
  }
  return { emoji: '🍽️', message: `Log your meals to track your progress toward ${targetCalories} kcal` };
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatGoalLabel(goal: string) {
  const map: Record<string, string> = {
    muscle_gain:   '💪 Muscle Gain',
    fat_loss:      '🔥 Fat Loss',
    stay_healthy:  '🌿 Stay Healthy',
  };
  return map[goal] ?? goal;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ pct, height = 8, color = Colors.accent }: { pct: number; height?: number; color?: string }) {
  return (
    <View style={[pb.track, { height }]}>
      <View style={[pb.fill, { width: `${Math.min(pct, 1) * 100}%`, backgroundColor: color, height }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { backgroundColor: Colors.accentLight, borderRadius: 999, overflow: 'hidden' },
  fill:  { borderRadius: 999 },
});

function MacroMini({ emoji, label, eaten, target, unit }: {
  emoji: string; label: string; eaten: number; target: number; unit: string;
}) {
  const pct = target > 0 ? eaten / target : 0;
  const barColor = pct < 0.5 ? '#E6A817' : Colors.accent;
  return (
    <View style={mm.card}>
      <Txt style={mm.emoji}>{emoji}</Txt>
      <Txt style={mm.label}>{label}</Txt>
      <Txt style={mm.value}>{eaten}{unit}</Txt>
      <ProgressBar pct={pct} height={4} color={barColor} />
      <Txt style={mm.of}>of {target}{unit}</Txt>
    </View>
  );
}

const mm = StyleSheet.create({
  card:  { flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 12, alignItems: 'center', gap: 3 },
  emoji: { fontSize: 20, lineHeight: 26 },
  label: { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  value: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24 },
  of:    { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { data, loading, logMeal, updateWater, refresh } = useHomeData();
  const [swapMeal, setSwapMeal] = useState<Meal | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [notifsEnabled, setNotifsEnabled] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') { setNotifsEnabled(false); return; }
      Notifications.getAllScheduledNotificationsAsync().then((n) => setNotifsEnabled(n.length > 0));
    });
  }, []);

  // Cross-tab sync: refetch home data when this tab regains focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading || !data) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const {
    userName, avatarUrl, targetCalories, targetProtein, targetCarbs, targetFat,
    meals, loggedMealTypes, eatenCalories, eatenProtein, eatenCarbs, eatenFat,
    glasses, streak, weekLoggedDays,
  } = data;

  const nextMeal   = meals.find((m) => !loggedMealTypes.has(m.type));
  const loggedCount = loggedMealTypes.size;
  const calRem     = targetCalories - eatenCalories;
  const nudge      = getNudge(meals, loggedMealTypes, eatenCalories, targetCalories, eatenProtein, targetProtein);
  const initials   = getInitials(userName);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.topBar}>
          <View style={s.topLeft}>
            <TouchableOpacity style={s.avatar} activeOpacity={0.8} onPress={() => setProfileSheetOpen(true)}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
                : <Txt style={s.avatarTxt}>{initials}</Txt>
              }
            </TouchableOpacity>
            <View>
              <Txt style={s.greeting}>{getGreeting()}, {userName.split(' ')[0]} {getTimeEmoji()}</Txt>
              <View style={s.streakRow}>
                <Txt style={s.streakIcon}>⚡</Txt>
                <Txt style={s.streakTxt}>{streak} day{streak !== 1 ? 's' : ''} · {getStreakTitle(streak)}</Txt>
              </View>
            </View>
          </View>
          <TouchableOpacity style={s.bellBtn} activeOpacity={0.75} onPress={() => setNotifSheetOpen(true)}>
            <Bell size={20} color={Colors.accent} strokeWidth={1.8} />
            {notifsEnabled && <View style={s.bellDot} />}
          </TouchableOpacity>
        </View>

        {/* ── Section 1: Calorie Progress + Macros + Water ── */}
        <View style={s.card20}>

          <View style={s.row}>
            <Txt style={s.fuelLabel}>🔥 Calories</Txt>
            <Txt style={s.fuelVal}>{eatenCalories.toLocaleString()} / {targetCalories.toLocaleString()} kcal</Txt>
          </View>

          <ProgressBar pct={eatenCalories / targetCalories} height={10} />
          <Txt style={s.calRem}>{calRem > 0 ? `${calRem.toLocaleString()} kcal remaining` : 'Target reached! 🎉'}</Txt>

          <View style={s.macroRow}>
            <MacroMini emoji="🥗" label="Carbs"   eaten={eatenCarbs}   target={targetCarbs}   unit="g" />
            <MacroMini emoji="💪" label="Protein" eaten={eatenProtein} target={targetProtein} unit="g" />
            <MacroMini emoji="🫒" label="Fat"     eaten={eatenFat}     target={targetFat}     unit="g" />
          </View>

          <View style={s.divider} />

          <View style={s.waterSection}>
            {/* Top row: label + count */}
            <View style={s.waterTopRow}>
              <View style={s.waterLabelRow}>
                <Droplets size={14} color="#5B8DB8" strokeWidth={2} />
                <Txt style={s.waterLabel}>Water</Txt>
              </View>
              <Txt style={s.waterCount}>
                {glasses}<Txt style={s.waterCountOf}> / 10 glasses</Txt>
              </Txt>
            </View>

            {/* Glass dots */}
            <View style={s.dropRow}>
              {Array.from({ length: 10 }).map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => updateWater(i + 1 === glasses ? glasses - 1 : i + 1)}
                  activeOpacity={0.65}
                  hitSlop={6}
                  style={[s.glassDot, i < glasses && s.glassDotFilled]}
                >
                  <GlassWater
                    size={16}
                    color={i < glasses ? '#5B8DB8' : '#C8D0D8'}
                    fill={i < glasses ? '#D6E8F5' : 'transparent'}
                    strokeWidth={i < glasses ? 2.2 : 1.5}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Water fill bar */}
            <View style={s.waterBarBg}>
              <View style={[s.waterBarFill, { width: `${(glasses / 10) * 100}%` as any }]} />
            </View>

            {/* Motivational hint */}
            <Txt style={s.waterHint}>
              {glasses === 0 && 'Tap a glass to log water — your body will thank you'}
              {glasses > 0 && glasses < 4 && `${10 - glasses} more to go — keep drinking!`}
              {glasses >= 4 && glasses < 7 && `Halfway there! ${10 - glasses} glasses left`}
              {glasses >= 7 && glasses < 10 && `Almost there — just ${10 - glasses} more! 💪`}
              {glasses >= 10 && 'Perfectly hydrated today — amazing! 🎉'}
            </Txt>
          </View>

        </View>

        {/* ── Section 2: Smart Nudge ── */}
        <View style={s.nudgeCard}>
          <Txt style={s.nudgeEmoji}>{nudge.emoji}</Txt>
          <Txt style={s.nudgeTxt}>{nudge.message}</Txt>
        </View>

        {/* ── Section 3: Next Meal ── */}
        {meals.length === 0 ? (
          <View style={s.card16}>
            <Txt style={s.mealName}>Generating your meal plan...</Txt>
            <Txt style={s.mealMacros}>Your personalized plan will appear here shortly</Txt>
          </View>
        ) : nextMeal ? (
          <View>
            <TouchableOpacity
              style={s.card16}
              activeOpacity={0.92}
              onPress={() => router.push({
                pathname: '/recipe/[id]',
                params: {
                  id: encodeURIComponent(nextMeal.name),
                  type: nextMeal.type,
                  calories: String(nextMeal.calories),
                  protein:  String(nextMeal.protein),
                  carbs:    String(nextMeal.carbs),
                  fat:      String(nextMeal.fat),
                },
              })}
            >
              <View style={s.row}>
                <View style={s.mealPill}>
                  <Txt style={s.mealPillTxt}>{nextMeal.type.charAt(0).toUpperCase() + nextMeal.type.slice(1)}</Txt>
                </View>
                <View style={{ flex: 1 }} />
                <Txt style={s.mealRecipeHint}>View recipe →</Txt>
              </View>

              <Txt style={s.mealName}>{nextMeal.name}</Txt>
              <Txt style={s.mealMacros}>{nextMeal.calories} kcal · {nextMeal.protein}g protein · {nextMeal.fat}g fat</Txt>

              <View style={s.mealBtns}>
                <TouchableOpacity style={s.btnLog} activeOpacity={0.85} onPress={(e) => { e.stopPropagation?.(); logMeal(nextMeal); }}>
                  <Txt style={s.btnLogTxt}>Log this meal</Txt>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSwap} activeOpacity={0.85} onPress={(e) => { e.stopPropagation?.(); setSwapMeal(nextMeal); }}>
                  <Txt style={s.btnSwapTxt}>Swap</Txt>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            <View style={s.mealProgress}>
              <View style={s.mealDots}>
                {meals.map((m, i) => {
                  const logged = loggedMealTypes.has(m.type);
                  const isNext = !logged && meals.findIndex((x) => !loggedMealTypes.has(x.type)) === i;
                  const dotStyle = logged ? s.dotGreen : isNext ? s.dotOutline : s.dotGray;
                  return <View key={m.type} style={[s.dot10, dotStyle]} />;
                })}
              </View>
              <Txt style={s.mealProgTxt}>{loggedCount} of {meals.length} meals done</Txt>
            </View>
          </View>
        ) : (
          <View style={s.allDoneCard}>
            <Txt style={s.allDoneTxt}>✅ All meals logged today — great work!</Txt>
          </View>
        )}

        {/* ── Section 4: Streak Card ── */}
        <StreakCard streak={streak} weekLoggedDays={weekLoggedDays} />

        {/* ── Section 5: Daily Insight ── */}
        <View style={s.card16}>
          <Txt style={s.insightLabel}>✨ Daily insight</Txt>
          <Txt style={s.insightBody}>
            {eatenProtein >= targetProtein
              ? `You've hit your protein target today — great work! Consistency builds real results.`
              : `You need ${targetProtein - eatenProtein}g more protein today. Add a high-protein meal to stay on track.`}
          </Txt>
        </View>

      </ScrollView>

      <SwapMealModal
        visible={!!swapMeal}
        mealType={swapMeal?.type ?? ''}
        currentMealName={swapMeal?.name ?? ''}
        onCancel={() => setSwapMeal(null)}
        onConfirm={(result: SwapResult, _updatePlan: boolean) => {
          // Home screen doesn't own the plan; for "update plan" requests the
          // user can also do this from the Meals tab where it persists.
          if (swapMeal) logMeal({ ...swapMeal, ...result });
          setSwapMeal(null);
        }}
      />

      <HomeDrawer
        visible={profileSheetOpen}
        name={userName}
        email={data.email}
        avatarUrl={avatarUrl}
        goalLabel={data.goal ? formatGoalLabel(data.goal) : undefined}
        streak={streak}
        eatenCalories={eatenCalories}
        targetCalories={targetCalories}
        eatenProtein={eatenProtein}
        targetProtein={targetProtein}
        onClose={() => setProfileSheetOpen(false)}
        onShowHowItWorks={() => setHowItWorksOpen(true)}
        onShowNotifications={() => setNotifSheetOpen(true)}
      />

      <HowItWorksModal
        visible={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
      />

      <NotifSheet
        visible={notifSheetOpen}
        enabled={notifsEnabled}
        onToggle={async (val) => {
          if (val) {
            const granted = await requestNotificationPermission();
            if (granted) { await scheduleMealReminders(); setNotifsEnabled(true); }
          } else {
            await cancelMealReminders();
            setNotifsEnabled(false);
          }
        }}
        onClose={() => setNotifSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.background },
  scroll:           { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 130, gap: 16 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  topLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:    { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 48, height: 48, borderRadius: 14 },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: Colors.surface, letterSpacing: 0.5, lineHeight: 22 },
  greeting:  { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24 },
  streakRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  streakIcon: { fontSize: 11, lineHeight: 16 },
  streakTxt: { fontSize: 12, color: Colors.secondary, lineHeight: 16, marginTop: 0 },
  bellBtn:   { width: 40, height: 40, borderRadius: BorderRadius.full, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  bellDot:   { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#E05C2A' },

  card20: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  card16: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },

  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: Colors.accentLight },

  fuelLabel: { fontSize: 14, color: Colors.secondary, lineHeight: 20 },
  fuelVal:   { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 20 },
  calRem:    { fontSize: 12, color: Colors.secondary, lineHeight: 16, textAlign: 'right', marginTop: -4 },
  macroRow:  { flexDirection: 'row', gap: 10 },

  waterSection:   { gap: 8 },
  waterTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waterLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  waterLabel:     { fontSize: 13, fontWeight: '600', color: Colors.secondary, lineHeight: 18 },
  waterCount:     { fontSize: 15, fontWeight: '800', color: '#5B8DB8', lineHeight: 20 },
  waterCountOf:   { fontSize: 12, fontWeight: '500', color: Colors.secondary },
  dropRow:        { flexDirection: 'row', gap: 5, alignItems: 'center' },
  glassDot:       { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  glassDotFilled: { backgroundColor: '#EAF4FB' },
  waterBarBg:     { height: 4, backgroundColor: Colors.border, borderRadius: 999, overflow: 'hidden' },
  waterBarFill:   { height: 4, backgroundColor: '#5B8DB8', borderRadius: 999 },
  waterHint:      { fontSize: 11, color: Colors.secondary, lineHeight: 15 },

  nudgeCard:  { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderLeftWidth: 4, borderLeftColor: Colors.accent, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  nudgeEmoji: { fontSize: 24, lineHeight: 30 },
  nudgeTxt:   { flex: 1, fontSize: 14, color: Colors.primary, lineHeight: 20 },

  mealPill:    { backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  mealPillTxt: { fontSize: 12, fontWeight: '600', color: Colors.accent, lineHeight: 16 },
  mealRecipeHint: { fontSize: 11, fontWeight: '700', color: Colors.accent, letterSpacing: 0.2, lineHeight: 14 },
  mealName:    { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24, marginTop: 2 },
  mealMacros:  { fontSize: 13, color: Colors.secondary, lineHeight: 18 },
  mealBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnLog:      { flex: 2, height: 46, backgroundColor: Colors.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnLogTxt:   { fontSize: 14, fontWeight: '700', color: Colors.surface, lineHeight: 20 },
  btnSwap:     { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnSwapTxt:  { fontSize: 14, fontWeight: '600', color: Colors.accent, lineHeight: 20 },
  mealProgress:{ alignItems: 'center', gap: 6, marginTop: 10 },
  mealDots:    { flexDirection: 'row', gap: 6 },
  dot10:       { width: 10, height: 10, borderRadius: 5 },
  dotGreen:    { backgroundColor: Colors.accent },
  dotOutline:  { borderWidth: 1.5, borderColor: Colors.accent, backgroundColor: 'transparent' },
  dotGray:     { backgroundColor: '#E0E0E0' },
  mealProgTxt: { fontSize: 12, color: Colors.secondary, lineHeight: 16 },
  allDoneCard: { backgroundColor: Colors.accentLight, borderRadius: 16, padding: 16, alignItems: 'center' },
  allDoneTxt:  { fontSize: 14, fontWeight: '600', color: Colors.accent, lineHeight: 20 },


  insightLabel: { fontSize: 13, color: Colors.secondary, lineHeight: 18 },
  insightBody:  { fontSize: 14, color: Colors.primary, lineHeight: 21 },
});

// ─── Streak Card ──────────────────────────────────────────────────────────────

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getStreakLevel(n: number): { label: string; color: string; bg: string } {
  if (n >= 30) return { label: 'CHAMPION',   color: '#E6A817', bg: '#FFF8E8' };
  if (n >= 14) return { label: 'ON FIRE',     color: '#E05C2A', bg: '#FFF0EA' };
  if (n >= 7)  return { label: 'CONSISTENT',  color: Colors.accent, bg: Colors.accentLight };
  if (n >= 3)  return { label: 'WARMING UP',  color: '#5B8DB8', bg: '#EAF2FA' };
  return               { label: 'JUST STARTED', color: Colors.secondary, bg: Colors.background };
}

function StreakCard({ streak, weekLoggedDays }: { streak: number; weekLoggedDays: boolean[] }) {
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const level = getStreakLevel(streak);
  const daysLogged = weekLoggedDays.filter(Boolean).length;

  return (
    <View style={sc.card}>
      {/* Top row: flame + count + badge */}
      <View style={sc.topRow}>
        <View style={sc.flameWrap}>
          <Txt style={sc.flameEmoji}>🔥</Txt>
        </View>
        <View style={sc.countWrap}>
          <Txt style={sc.countNum}>{streak}</Txt>
          <Txt style={sc.countLabel}>day streak</Txt>
        </View>
        <View style={[sc.badge, { backgroundColor: level.bg }]}>
          <Txt style={[sc.badgeTxt, { color: level.color }]}>{level.label}</Txt>
        </View>
      </View>

      {/* Divider */}
      <View style={sc.divider} />

      {/* Week dots with connecting line */}
      <View style={sc.weekWrap}>
        <View style={sc.connectorLine} />
        {DAYS.map((d, i) => {
          const logged   = weekLoggedDays[i];
          const isToday  = i === todayIdx;
          const isFuture = i > todayIdx;
          return (
            <View key={i} style={sc.dayCol}>
              <View style={[
                sc.dot,
                logged    && sc.dotLogged,
                isToday && !logged && sc.dotToday,
                isFuture  && sc.dotFuture,
              ]}>
                {logged
                  ? <Txt style={sc.dotCheck}>✓</Txt>
                  : isToday
                    ? <View style={sc.dotPulse} />
                    : null
                }
              </View>
              <Txt style={[sc.dayLbl, isToday && { color: Colors.accent, fontWeight: '700' }]}>{d}</Txt>
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <Txt style={sc.footer}>
        {daysLogged === 7
          ? '🏆 Perfect week! Every day logged.'
          : daysLogged === 0
            ? 'Log your first meal to start the streak'
            : `${daysLogged} of 7 days logged this week`}
      </Txt>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flameWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#FFF0EA',
    alignItems: 'center', justifyContent: 'center',
  },
  flameEmoji: { fontSize: 26, lineHeight: 30 },
  countWrap:  { flex: 1, gap: 1 },
  countNum:   { fontSize: 32, fontWeight: '900', color: Colors.primary, lineHeight: 36, letterSpacing: -1 },
  countLabel: { fontSize: 12, color: Colors.secondary, fontWeight: '500', lineHeight: 16 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  weekWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
    paddingHorizontal: 2,
  },
  connectorLine: {
    position: 'absolute',
    top: 16,
    left: 18,
    right: 18,
    height: 2,
    backgroundColor: Colors.border,
    zIndex: 0,
  },
  dayCol:  { alignItems: 'center', gap: 6, zIndex: 1 },
  dot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EFEFEF',
    alignItems: 'center', justifyContent: 'center',
  },
  dotLogged: { backgroundColor: Colors.accent },
  dotToday:  { backgroundColor: 'transparent', borderWidth: 2.5, borderColor: Colors.accent },
  dotFuture: { backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  dotCheck:  { fontSize: 14, color: '#FFFFFF', fontWeight: '800', lineHeight: 17 },
  dotPulse:  { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  dayLbl:    { fontSize: 10, color: Colors.secondary, fontWeight: '600', lineHeight: 13 },

  footer: { fontSize: 12, color: Colors.secondary, textAlign: 'center', lineHeight: 16 },
});

// ─── Notification Sheet ───────────────────────────────────────────────────────

const WATER_INTERVALS = [
  { label: 'Every 1h',  value: 1 },
  { label: 'Every 2h',  value: 2 },
  { label: 'Every 3h',  value: 3 },
  { label: 'Off',       value: 0 },
];

const BREAKFAST_OPTS = [{ label: '7 AM', hour: 7 }, { label: '8 AM', hour: 8 }, { label: '9 AM', hour: 9 }];
const LUNCH_OPTS     = [{ label: '12 PM', hour: 12 }, { label: '1 PM', hour: 13 }, { label: '2 PM', hour: 14 }];
const DINNER_OPTS    = [{ label: '6 PM', hour: 18 }, { label: '7 PM', hour: 19 }, { label: '8 PM', hour: 20 }, { label: '9 PM', hour: 21 }];

function NotifSheet({ visible, enabled, onToggle, onClose }: {
  visible: boolean;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [waterInterval, setWaterInterval] = useState(0);
  const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);
  const [modalMounted, setModalMounted] = useState(false);

  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const dismiss = useCallback(() => {
    'worklet';
    translateY.value = withTiming(600, { duration: 200 });
    backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        setModalMounted(false);
        onClose();
      }
    });
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      setModalMounted(true);
      translateY.value = 600;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 22, stiffness: 280, mass: 0.8 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [visible]);

  const handleWaterInterval = async (val: number) => {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    setWaterInterval(val);
    if (val === 0) await cancelWaterReminders();
    else await scheduleWaterReminders(val);
  };

  const handleMealTime = async (meal: keyof MealTimes, hour: number) => {
    const updated = { ...mealTimes, [meal]: { hour, minute: 0 } };
    setMealTimes(updated);
    if (enabled) await scheduleMealReminders(updated);
  };

  const fmtHour = (h: number) => h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  return (
    <Modal visible={modalMounted || visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <FullWindowOverlay>
        <Reanimated.View style={[StyleSheet.absoluteFill, ns.backdropColor, backdropStyle]} />
        <View style={ns.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <Reanimated.View style={[ns.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
          <ScrollView
            contentContainerStyle={{ gap: 18, paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={ns.handle} />

            {/* ── Meal reminders ── */}
            <View style={ns.section}>
              <View style={ns.sectionHeader}>
                <View style={ns.iconWrap}>
                  <Bell size={16} color={Colors.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={ns.title}>Meal Reminders</Txt>
                  <Txt style={ns.subtitle}>Tap a time to change when we nudge you</Txt>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={onToggle}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[ns.reminderList, !enabled && ns.dimmed]}>
                {([
                  { key: 'breakfast' as const, emoji: '🌅', label: 'Breakfast', opts: BREAKFAST_OPTS },
                  { key: 'lunch'     as const, emoji: '☀️', label: 'Lunch',     opts: LUNCH_OPTS     },
                  { key: 'dinner'    as const, emoji: '🌙', label: 'Dinner',    opts: DINNER_OPTS    },
                ]).map((r) => (
                  <View key={r.key} style={ns.reminderBlock}>
                    <View style={ns.reminderRow}>
                      <Txt style={ns.reminderEmoji}>{r.emoji}</Txt>
                      <Txt style={ns.reminderMeal}>{r.label}</Txt>
                      <View style={{ flex: 1 }} />
                      <Txt style={ns.reminderTimeBadge}>{fmtHour(mealTimes[r.key].hour)}</Txt>
                      {enabled && <View style={ns.activeDot} />}
                    </View>
                    <View style={ns.timeChipRow}>
                      {r.opts.map((o) => {
                        const active = mealTimes[r.key].hour === o.hour;
                        return (
                          <TouchableOpacity
                            key={o.hour}
                            style={[ns.timeChip, active && ns.timeChipActive]}
                            onPress={() => handleMealTime(r.key, o.hour)}
                            activeOpacity={0.75}
                          >
                            <Txt style={[ns.timeChipTxt, active && ns.timeChipTxtActive]}>{o.label}</Txt>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={ns.divider} />

            {/* ── Water reminders ── */}
            <View style={ns.section}>
              <View style={ns.sectionHeader}>
                <View style={[ns.iconWrap, { backgroundColor: '#EAF4FB' }]}>
                  <Droplets size={16} color="#5B8DB8" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={ns.title}>Water Reminders</Txt>
                  <Txt style={ns.subtitle}>Gentle nudges to stay hydrated</Txt>
                </View>
              </View>
              <View style={ns.chipRow}>
                {WATER_INTERVALS.map((w) => (
                  <TouchableOpacity
                    key={w.value}
                    style={[ns.chip, waterInterval === w.value && ns.chipActive]}
                    onPress={() => handleWaterInterval(w.value)}
                    activeOpacity={0.75}
                  >
                    <Txt style={[ns.chipTxt, waterInterval === w.value && ns.chipTxtActive]}>
                      {w.label}
                    </Txt>
                  </TouchableOpacity>
                ))}
              </View>
              {waterInterval > 0 && (
                <Txt style={ns.waterHint}>
                  Reminding you every {waterInterval}h from 8 AM to 10 PM
                </Txt>
              )}
              <TouchableOpacity
                style={ns.testBtn}
                activeOpacity={0.75}
                onPress={async () => {
                  const { registerWaterNotificationCategory } = await import('@/lib/notifications');
                  await registerWaterNotificationCategory();
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: '💧 Time to hydrate!',
                      body: "Stay on track — have you had a glass of water recently?",
                      sound: false,
                      data: { tag: 'water-reminder' },
                      categoryIdentifier: 'water-reminder-category',
                    },
                    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
                  });
                }}
              >
                <Txt style={ns.testBtnTxt}>Send test notification (5s)</Txt>
              </TouchableOpacity>
            </View>

          </ScrollView>
          </Reanimated.View>
        </View>
      </FullWindowOverlay>
    </Modal>
  );
}

const ns = StyleSheet.create({
  backdropColor: { backgroundColor: 'rgba(0,0,0,0.45)' },
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  sheet:         { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12, maxHeight: '90%' },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 6 },
  divider:       { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  section:       { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap:      { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 15, fontWeight: '800', color: Colors.primary, lineHeight: 20 },
  subtitle:      { fontSize: 11, color: Colors.secondary, lineHeight: 15, marginTop: 1 },

  reminderList:  { gap: 8 },
  reminderBlock: { gap: 6 },
  dimmed:        { opacity: 0.4 },
  reminderRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.background },
  reminderEmoji: { fontSize: 18, lineHeight: 22 },
  reminderMeal:  { fontSize: 13, fontWeight: '600', color: Colors.primary, lineHeight: 18 },
  reminderTimeBadge:{ fontSize: 12, fontWeight: '700', color: Colors.accent, lineHeight: 16 },
  activeDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent, marginLeft: 6 },

  timeChipRow:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  timeChip:         { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  timeChipActive:   { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  timeChipTxt:      { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 16 },
  timeChipTxtActive:{ color: Colors.accent, fontWeight: '800' },

  chipRow:       { flexDirection: 'row', gap: 8 },
  chip:          { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  chipActive:    { backgroundColor: '#EAF4FB', borderColor: '#5B8DB8' },
  chipTxt:       { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 16 },
  chipTxtActive: { color: '#5B8DB8', fontWeight: '800' },
  waterHint:     { fontSize: 11, color: Colors.secondary, lineHeight: 15 },
  testBtn:       { marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#EAF4FB', borderRadius: 8, alignItems: 'center' },
  testBtnTxt:    { fontSize: 12, fontWeight: '600', color: '#5B8DB8' },
});
