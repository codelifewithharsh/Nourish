import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
  KeyboardAvoidingView, Platform, Switch, Animated, Easing, LayoutAnimation, Image, Linking,
  DeviceEventEmitter, Share,
} from 'react-native';
import * as StoreReview from 'expo-store-review';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  Flame, Sparkles, ChevronDown, ChevronRight, Check, RotateCw, Minus, Plus,
  Salad, Utensils, Activity, Settings, MessageSquareHeart, Heart, X, ChefHat,
  Briefcase, Globe,
} from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { PROFILE_UPDATED_EVENT, SCROLL_TO_SECTION_EVENT } from '@/lib/events';
import { showToast } from '@/lib/toast';
import { calculateNutrition } from '@/features/onboarding/utils/tdee';
import { Colors } from '@/constants/colors';
import { Txt, BreathingLogo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { useAI, EarlyBirdBadge } from '@/features/pro';
import { useAppConfigText } from '@/lib/appConfig';
import { FeedbackSheet } from '@/features/feedback/FeedbackSheet';

import { scheduleMealReminders, cancelMealReminders, requestNotificationPermission, DEFAULT_MEAL_TIMES, MealTimes } from '@/lib/notifications';
import { MEAL_TIMES_CHANGED_EVENT, MEAL_NOTIFS_TOGGLED_EVENT } from '@/lib/events';
import * as Notifications from 'expo-notifications';
import { analytics } from '@/lib/analytics';


// ─── Types ─────────────────────────────────────────────────────────────────

type Goal = 'muscle_gain' | 'fat_loss' | 'stay_healthy';
type ActivityLevel = 'sedentary' | 'lightly_active' | 'very_active';
type DietType = 'pure_veg' | 'vegan' | 'eggetarian' | 'non_veg';
type CuisinePreference = 'north_indian' | 'south_indian' | 'continental' | 'indian_fusion' | 'indo_chinese';
type Restriction = 'onion_garlic' | 'dairy' | 'gluten' | 'peanuts' | 'spicy' | 'mushroom' | 'soy' | 'sugar';

interface Profile {
  name: string | null;
  email: string;
  goal: Goal | null;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  diet_type: DietType | null;
  cuisines: CuisinePreference[] | null;
  restrictions: Restriction[] | null;
  daily_calories: number | null;
  daily_protein: number | null;
  preferred_units: string | null;
  kitchen_ingredients: string | null;
  meal_notification_times?: MealTimes | null;
}

// ─── Label maps ────────────────────────────────────────────────────────────

const GOAL_LABEL: Record<Goal, string> = {
  muscle_gain:  '💪  Muscle Gain',
  fat_loss:     '🔥  Fat Loss',
  stay_healthy: '🌿  Stay Healthy',
};

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary:      'Mostly Sitting',
  lightly_active: 'A Bit Active',
  very_active:    'Very Active',
};

const DIET_LABEL: Record<DietType, string> = {
  pure_veg:    'Pure Veg',
  vegan:       'Vegan',
  eggetarian:  'Eggetarian',
  non_veg:     'Non-Veg',
};

const CUISINE_LABEL: Record<CuisinePreference, string> = {
  north_indian:  'North Indian',
  south_indian:  'South Indian',
  continental:   'Continental',
  indian_fusion: 'Indian Fusion',
  indo_chinese:  'Indo-Chinese',
};

const RESTRICTION_LABEL: Record<Restriction, string> = {
  onion_garlic: 'No Onion/Garlic',
  dairy:        'No Dairy',
  gluten:       'Gluten Free',
  peanuts:      'No Peanuts',
  spicy:        'No Spicy',
  mushroom:     'No Mushroom',
  soy:          'No Soy',
  sugar:        'No Sugar',
};

const ALL_CUISINES: CuisinePreference[] = ['north_indian', 'south_indian', 'continental', 'indian_fusion', 'indo_chinese'];
const ALL_RESTRICTIONS: Restriction[] = ['onion_garlic', 'dairy', 'gluten', 'peanuts', 'spicy', 'mushroom', 'soy', 'sugar'];
const ALL_GOALS: Goal[] = ['muscle_gain', 'fat_loss', 'stay_healthy'];
const ALL_ACTIVITY: ActivityLevel[] = ['sedentary', 'lightly_active', 'very_active'];
const ALL_DIETS: DietType[] = ['pure_veg', 'vegan', 'eggetarian', 'non_veg'];

// ─── Section header ────────────────────────────────────────────────────────

function SectionTitle({
  icon, title, subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.iconWrap}>{icon}</View>
      <View style={st.txtWrap}>
        <Txt style={st.title}>{title}</Txt>
        {subtitle && <Txt style={st.sub}>{subtitle}</Txt>}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginBottom: 10 },
  iconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  txtWrap:  { flex: 1 },
  title:    { fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 18, letterSpacing: -0.2 },
  sub:      { fontSize: 11, color: Colors.secondary, lineHeight: 14, marginTop: 1 },
});

// ─── Inline expanding row (numeric stepper) ────────────────────────────────

function NumericRow({
  label, value, unit, step, min, max, isOpen, onToggle, onSave, deltaPreview,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (n: number) => void;
  deltaPreview?: (n: number) => string | null;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value, isOpen]);

  const preview = deltaPreview?.(draft);

  return (
    <View style={[nr.wrap, isOpen && nr.wrapOpen]}>
      <TouchableOpacity
        style={nr.headerRow}
        onPress={() => { haptic.light(); onToggle(); }}
        activeOpacity={0.6}
      >
        <Txt style={nr.label}>{label}</Txt>
        <View style={nr.rightSide}>
          <Txt style={nr.value}>{value} {unit}</Txt>
          <ChevronDown
            size={16}
            color={Colors.secondary}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={nr.body}>
          <View style={nr.stepperRow}>
            <TouchableOpacity
              style={[nr.stepBtn, draft <= min && nr.stepBtnDisabled]}
              onPress={() => { if (draft > min) { haptic.light(); setDraft(draft - step); } }}
              activeOpacity={0.7}
              disabled={draft <= min}
            >
              <Minus size={18} color={draft <= min ? Colors.border : Colors.accent} strokeWidth={2.5} />
            </TouchableOpacity>

            <View style={nr.draftWrap}>
              <Txt style={nr.draftVal}>{draft}</Txt>
              <Txt style={nr.draftUnit}>{unit}</Txt>
            </View>

            <TouchableOpacity
              style={[nr.stepBtn, draft >= max && nr.stepBtnDisabled]}
              onPress={() => { if (draft < max) { haptic.light(); setDraft(draft + step); } }}
              activeOpacity={0.7}
              disabled={draft >= max}
            >
              <Plus size={18} color={draft >= max ? Colors.border : Colors.accent} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {preview && (
            <View style={nr.previewRow}>
              <Sparkles size={11} color={Colors.accent} strokeWidth={2.5} />
              <Txt style={nr.previewTxt}>{preview}</Txt>
            </View>
          )}

          {draft !== value && (
            <TouchableOpacity style={nr.saveBtn} onPress={() => onSave(draft)} activeOpacity={0.85}>
              <Check size={15} color="#FFFFFF" strokeWidth={3} />
              <Txt style={nr.saveTxt}>Save change</Txt>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const nr = StyleSheet.create({
  wrap:       { backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  wrapOpen:   { backgroundColor: Colors.surface, paddingBottom: 16, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:      { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  rightSide:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value:      { fontSize: 14, fontWeight: '700', color: Colors.secondary, lineHeight: 19 },

  body:       { gap: 12, marginTop: 14 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  stepBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { backgroundColor: Colors.background },
  draftWrap:  { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 90, justifyContent: 'center' },
  draftVal:   { fontSize: 32, fontWeight: '800', color: Colors.primary, letterSpacing: -1, lineHeight: 38 },
  draftUnit:  { fontSize: 14, fontWeight: '600', color: Colors.secondary },

  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accentLight, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  previewTxt: { fontSize: 12, fontWeight: '600', color: Colors.accent, lineHeight: 16 },

  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, backgroundColor: Colors.accent, borderRadius: 11 },
  saveTxt:    { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19 },
});

// ─── Inline expanding row (option picker) ──────────────────────────────────

function PickRow<T extends string>({
  label, value, valueLabel, options, optionLabels, isOpen, onToggle, onSelect,
}: {
  label: string;
  value: T | null;
  valueLabel: string;
  options: T[];
  optionLabels: Record<T, string>;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={[nr.wrap, isOpen && nr.wrapOpen]}>
      <TouchableOpacity
        style={nr.headerRow}
        onPress={() => { haptic.light(); onToggle(); }}
        activeOpacity={0.6}
      >
        <Txt style={nr.label}>{label}</Txt>
        <View style={nr.rightSide}>
          <Txt style={nr.value} numberOfLines={1}>{valueLabel}</Txt>
          <ChevronDown
            size={16}
            color={Colors.secondary}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={pkr.body}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[pkr.opt, active && pkr.optActive]}
                onPress={() => { haptic.light(); onSelect(opt); }}
                activeOpacity={0.75}
              >
                <Txt style={[pkr.optTxt, active && pkr.optTxtActive]}>{optionLabels[opt]}</Txt>
                {active && <Check size={16} color={Colors.accent} strokeWidth={3} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const pkr = StyleSheet.create({
  body:         { gap: 6, marginTop: 12 },
  opt:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, backgroundColor: Colors.background },
  optActive:    { backgroundColor: Colors.accentLight },
  optTxt:       { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  optTxtActive: { color: Colors.accent, fontWeight: '700' },
});

// ─── Chip grid for multi-select preferences ────────────────────────────────

function ChipGrid<T extends string>({
  options, labels, selected, onToggle, color,
}: {
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (v: T) => void;
  color?: string;
}) {
  const accent = color ?? Colors.accent;
  return (
    <View style={cg.grid}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[cg.chip, active && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => { haptic.light(); onToggle(opt); }}
            activeOpacity={0.75}
          >
            <Txt style={[cg.chipTxt, active && cg.chipTxtActive]}>{labels[opt]}</Txt>
            {active && <X size={11} color="#FFFFFF" strokeWidth={3} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const cg = StyleSheet.create({
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipTxt:      { fontSize: 13, fontWeight: '600', color: Colors.primary, lineHeight: 17 },
  chipTxtActive:{ color: '#FFFFFF' },
});

function fmt({ hour, minute }: { hour: number; minute: number }) {
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`;
  return `${h12}${mm} ${ampm}`;
}

// ─── Screen ────────────────────────────────────────────────────────────────

type OpenRow =
  | null
  | 'age'
  | 'weight'
  | 'height'
  | 'goal'
  | 'activity'
  | 'diet';

export default function YouScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<OpenRow>(null);
  const scrollRef = useRef<ScrollView>(null);
  const prefsSectionY = useRef(0);
  const [kitchenText, setKitchenText] = useState('');
  const kitchenFocused = useRef(false);
  const [kitchenSaving, setKitchenSaving] = useState(false);
  const [kitchenJustSaved, setKitchenJustSaved] = useState(false);
  const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);
  const [mealTimesOpen, setMealTimesOpen] = useState(false);
  const [mealPlanDate, setMealPlanDate] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [streak, setStreak] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const invoke = useAI();
  const inviteCopy = useAppConfigText(
    'invite_copy',
    "I've been eating better with Nourish — an AI nutritionist that plans Indian meals around your goals 🌿\n\nJoin me → https://play.google.com/store/apps/details?id=com.nourish.app",
  );

  const sparklePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, { toValue: 1.18, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sparklePulse, { toValue: 1,    duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Compute streak from last 365 days of daily_logs (local dates)
  const computeStreak = useCallback(async (uid: string) => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 365);
    const localStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const { data } = await supabase
      .from('daily_logs').select('date')
      .eq('user_id', uid).gte('date', localStr(sixtyDaysAgo));

    const logged = new Set((data ?? []).map((r) => r.date));
    const today = localStr(new Date());
    let count = 0;
    const cursor = new Date();
    if (!logged.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (logged.has(localStr(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    setStreak(count);
  }, []);

  const fetchProfile = useCallback(async (uid: string) => {
    const [profileRes, planRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('meal_plans').select('generated_at').eq('user_id', uid).maybeSingle(),
    ]);
    if (profileRes.data) {
      const p = profileRes.data as Profile;
      setProfile(p);
      setKitchenText(p.kitchen_ingredients ?? '');
      if (p.meal_notification_times) setMealTimes(p.meal_notification_times);
    }
    setMealPlanDate(planRes.data?.generated_at ?? null);
    computeStreak(uid);
    setLoading(false);
    setRefreshing(false);
  }, [computeStreak]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        setAvatarUrl(user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null);
        fetchProfile(user.id);
      }
    });
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') { setNotificationsEnabled(false); return; }
      Notifications.getAllScheduledNotificationsAsync().then((n) => {
        setNotificationsEnabled(n.length > 0);
      });
    });
  }, []);

  // Stay in sync with changes made from the home bell sheet: re-read the
  // persisted meal times + live permission/scheduled state on each broadcast.
  useEffect(() => {
    const refreshFromOutside = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('meal_notification_times')
          .eq('id', user.id)
          .maybeSingle();
        const row = data as { meal_notification_times?: MealTimes | null } | null;
        if (row?.meal_notification_times) setMealTimes(row.meal_notification_times);
      }
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') { setNotificationsEnabled(false); return; }
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      setNotificationsEnabled(
        scheduled.some((n) => (n.content.data as { tag?: string } | null)?.tag === 'meal-reminder'),
      );
    };
    const sub1 = DeviceEventEmitter.addListener(MEAL_TIMES_CHANGED_EVENT,  refreshFromOutside);
    const sub2 = DeviceEventEmitter.addListener(MEAL_NOTIFS_TOGGLED_EVENT, refreshFromOutside);
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      analytics.screenViewed({ screen: 'profile' });
    }, [])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SCROLL_TO_SECTION_EVENT, (section: string) => {
      if (section === 'preferences') {
        scrollRef.current?.scrollTo({ y: prefsSectionY.current, animated: true });
      }
    });
    return () => sub.remove();
  }, []);

  const onRefresh = useCallback(() => {
    if (!userId) return;
    setRefreshing(true);
    fetchProfile(userId);
  }, [userId, fetchProfile]);

  const saveField = useCallback(async (updates: Partial<Profile>) => {
    if (!userId || !profile) return;
    const prev = profile;
    const merged = { ...profile, ...updates };

    const TDEE_KEYS: (keyof Profile)[] = ['weight_kg', 'height_cm', 'age', 'activity_level', 'goal'];
    const touchesTDEE = TDEE_KEYS.some((k) => k in updates);

    const finalUpdates: Partial<Profile> = { ...updates };
    if (
      touchesTDEE &&
      merged.weight_kg && merged.height_cm && merged.age &&
      merged.activity_level && merged.goal
    ) {
      const { dailyCalories, dailyProtein } = calculateNutrition(
        merged.weight_kg, merged.height_cm, merged.age,
        merged.activity_level as ActivityLevel, merged.goal as Goal,
      );
      finalUpdates.daily_calories = dailyCalories;
      finalUpdates.daily_protein  = dailyProtein;
      setProfile({ ...merged, daily_calories: dailyCalories, daily_protein: dailyProtein });
    } else {
      setProfile(merged);
    }

    const { error } = await supabase.from('profiles').update(finalUpdates as any).eq('id', userId);
    if (error) {
      setProfile(prev);
      showToast('Could not save — check your connection', 'error');
      return;
    }
    DeviceEventEmitter.emit(PROFILE_UPDATED_EVENT);
    Object.keys(updates).forEach((field) => analytics.profileFieldUpdated({ field }));
  }, [userId, profile]);

  const toggleRow = useCallback((row: OpenRow) => {
    if (!kitchenFocused.current) {
      LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    }
    setOpenRow((prev) => (prev === row ? null : row));
  }, [kitchenFocused]);

  const toggleCuisine = useCallback(async (c: CuisinePreference) => {
    if (!profile) return;
    const current = profile.cuisines ?? [];
    const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
    await saveField({ cuisines: next });
  }, [profile, saveField]);

  const toggleRestriction = useCallback(async (r: Restriction) => {
    if (!profile) return;
    const current = profile.restrictions ?? [];
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r];
    await saveField({ restrictions: next });
  }, [profile, saveField]);

  const handleKitchenSave = useCallback(async () => {
    if (kitchenSaving) return;
    setKitchenSaving(true);
    haptic.success();
    await saveField({ kitchen_ingredients: kitchenText.trim() || null });
    analytics.kitchenUpdated();
    setKitchenSaving(false);
    setKitchenJustSaved(true);
    setTimeout(() => setKitchenJustSaved(false), 2200);
  }, [kitchenText, kitchenSaving, saveField]);

  const handleRegenerate = useCallback(async () => {
    if (!userId || regenerating) return;
    setRegenerating(true);
    haptic.light();
    try {
      await invoke('generate-meal-plan');
      await fetchProfile(userId);
    } catch (err) {
      // ProProvider surfaces 429 rate-limit toast; other errors fail silently
    } finally {
      setRegenerating(false);
    }
  }, [userId, regenerating, fetchProfile, invoke]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }, []);

  const handleRedoOnboarding = useCallback(() => {
    Alert.alert(
      'Recalculate your plan?',
      'Takes you through setup again and builds a fresh 7-day plan based on your updated goals.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Recalculate', onPress: () => { analytics.onboardingRedone(); router.push('/(auth)/onboarding'); } },
      ]
    );
  }, []);

  // Helpers for unit conversions
  const isImperial = profile?.preferred_units === 'imperial';

  const displayWeight = () => {
    if (!profile?.weight_kg) return 0;
    return isImperial ? Math.round(profile.weight_kg * 2.20462) : Math.round(profile.weight_kg);
  };
  const displayHeight = () => {
    if (!profile?.height_cm) return 0;
    return isImperial ? Math.round(profile.height_cm / 2.54) : Math.round(profile.height_cm);
  };

  // Live preview of calorie change when adjusting weight
  const weightCaloriePreview = (newDisplay: number): string | null => {
    if (!profile?.daily_calories || !profile.weight_kg) return null;
    const newKg = isImperial ? newDisplay / 2.20462 : newDisplay;
    const oldKg = profile.weight_kg;
    if (Math.abs(newKg - oldKg) < 0.5) return null;
    // Rough TDEE delta: ~12 kcal per kg per day diff
    const delta = Math.round((newKg - oldKg) * 12);
    const newCalories = profile.daily_calories + delta;
    return `Daily target → ${newCalories.toLocaleString()} kcal`;
  };

  const planDateStr = mealPlanDate
    ? new Date(mealPlanDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : 'Not generated';

  const initials = (profile?.name ?? 'U')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const firstName = (profile?.name ?? 'there').split(' ')[0];

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.loadingCenter}>
          <BreathingLogo size={96} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          {/* ── Hero greeting ── */}
          <View style={s.heroBlock}>
            <View style={s.heroRow}>
              <View style={s.avatar}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
                  : <Txt style={s.avatarTxt}>{initials}</Txt>
                }
              </View>
              <View style={s.heroInfo}>
                <Txt style={s.heroGreet}>Hey {firstName} 👋</Txt>
                <Txt style={s.heroEmail} numberOfLines={1}>{profile?.email}</Txt>
              </View>
            </View>
            <EarlyBirdBadge />
          </View>

          {/* ── Streak hero ── */}
          <View style={s.streakHero}>
            <View style={s.streakLeft}>
              <View style={s.flameWrap}>
                <Flame size={22} color="#E6A817" fill="#E6A817" strokeWidth={2} />
              </View>
              <View>
                <View style={s.streakRow}>
                  <Txt style={s.streakNum}>{streak}</Txt>
                  <Txt style={s.streakUnit}>day{streak !== 1 ? 's' : ''}</Txt>
                </View>
                <Txt style={s.streakHint}>
                  {streak === 0
                    ? 'Log something today to start'
                    : streak < 3
                      ? 'You\'re building real momentum'
                      : streak < 7
                        ? 'Consistency is paying off'
                        : 'You\'re unstoppable 🌟'}
                </Txt>
              </View>
            </View>
            {profile?.goal && (
              <View style={s.goalBadge}>
                <Txt style={s.goalBadgeTxt}>{GOAL_LABEL[profile.goal as Goal]}</Txt>
              </View>
            )}
          </View>

          {/* ── Daily targets strip ── */}
          <View style={s.targetsCard}>
            <View style={s.targetsItem}>
              <Txt style={s.targetsVal}>{profile?.daily_calories?.toLocaleString() ?? '—'}</Txt>
              <Txt style={s.targetsLbl}>kcal · day</Txt>
            </View>
            <View style={s.targetsDiv} />
            <View style={s.targetsItem}>
              <Txt style={[s.targetsVal, { color: '#5B8DB8' }]}>{profile?.daily_protein ?? '—'}g</Txt>
              <Txt style={s.targetsLbl}>protein · day</Txt>
            </View>
            <View style={s.targetsDiv} />
            <View style={s.targetsItem}>
              <Txt style={[s.targetsVal, { color: '#E6A817' }]}>{profile?.activity_level ? ACTIVITY_LABEL[profile.activity_level as ActivityLevel].split(' ')[0] : '—'}</Txt>
              <Txt style={s.targetsLbl}>activity</Txt>
            </View>
          </View>

          {/* ── Kitchen Hero (the AI input — promoted to top) ── */}
          <View style={s.section}>
            <SectionTitle
              icon={<ChefHat size={14} color={Colors.accent} strokeWidth={2.5} />}
              title="What's in your kitchen"
              subtitle="The AI uses these to plan your meals"
            />
            <View style={s.kitchenCard}>
              <View style={s.kitchenTopRow}>
                <Animated.View style={[s.sparkleWrap, { transform: [{ scale: sparklePulse }] }]}>
                  <Sparkles size={13} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} fillOpacity={0.2} />
                </Animated.View>
                <Txt style={s.kitchenAiLabel}>AI ingredient memory</Txt>
              </View>

              <TextInput
                style={s.kitchenInput}
                placeholder="paneer, dal, oats, quinoa, spinach, almonds..."
                placeholderTextColor={Colors.secondary}
                value={kitchenText}
                onChangeText={setKitchenText}
                onFocus={() => { kitchenFocused.current = true; }}
                onBlur={() => { kitchenFocused.current = false; }}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                blurOnSubmit={false}
              />

              <View style={s.kitchenBottomRow}>
                <Txt style={s.kitchenHint}>
                  {kitchenJustSaved
                    ? '✓ Saved · Will influence your next plan'
                    : kitchenText.trim().length === 0
                      ? 'List what staples you have at home'
                      : `${kitchenText.split(',').filter(Boolean).length} ingredient${kitchenText.split(',').filter(Boolean).length === 1 ? '' : 's'}`}
                </Txt>
                <TouchableOpacity
                  style={[s.kitchenSaveBtn, (kitchenSaving || kitchenText.trim() === (profile?.kitchen_ingredients ?? '').trim()) && s.kitchenSaveBtnDisabled]}
                  onPress={handleKitchenSave}
                  activeOpacity={0.85}
                  disabled={kitchenSaving || kitchenText.trim() === (profile?.kitchen_ingredients ?? '').trim()}
                >
                  {kitchenSaving
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Check size={15} color="#FFFFFF" strokeWidth={3} />
                  }
                  <Txt style={s.kitchenSaveTxt}>{kitchenJustSaved ? 'Saved' : 'Save'}</Txt>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── My body ── */}
          <View style={s.section}>
            <SectionTitle
              icon={<Activity size={14} color={Colors.accent} strokeWidth={2.5} />}
              title="My body"
              subtitle="Tap any stat to edit"
            />
            <View style={s.rowGroup}>
              <NumericRow
                label="Age"
                value={profile?.age ?? 23}
                unit="yrs"
                step={1}
                min={13}
                max={99}
                isOpen={openRow === 'age'}
                onToggle={() => toggleRow('age')}
                onSave={(v) => { saveField({ age: v }); setOpenRow(null); }}
              />
              <NumericRow
                label="Weight"
                value={displayWeight()}
                unit={isImperial ? 'lbs' : 'kg'}
                step={1}
                min={isImperial ? 60 : 30}
                max={isImperial ? 440 : 200}
                isOpen={openRow === 'weight'}
                onToggle={() => toggleRow('weight')}
                onSave={(v) => {
                  const kg = isImperial ? Math.round(v / 2.20462 * 10) / 10 : v;
                  saveField({ weight_kg: kg });
                  setOpenRow(null);
                }}
                deltaPreview={weightCaloriePreview}
              />
              <NumericRow
                label="Height"
                value={displayHeight()}
                unit={isImperial ? 'in' : 'cm'}
                step={1}
                min={isImperial ? 36 : 90}
                max={isImperial ? 90 : 230}
                isOpen={openRow === 'height'}
                onToggle={() => toggleRow('height')}
                onSave={(v) => {
                  const cm = isImperial ? Math.round(v * 2.54 * 10) / 10 : v;
                  saveField({ height_cm: cm });
                  setOpenRow(null);
                }}
              />
              <PickRow
                label="Goal"
                value={profile?.goal as Goal ?? null}
                valueLabel={profile?.goal ? GOAL_LABEL[profile.goal as Goal] : '—'}
                options={ALL_GOALS}
                optionLabels={GOAL_LABEL}
                isOpen={openRow === 'goal'}
                onToggle={() => toggleRow('goal')}
                onSelect={(v) => { saveField({ goal: v }); setOpenRow(null); }}
              />
              <PickRow
                label="Activity"
                value={profile?.activity_level as ActivityLevel ?? null}
                valueLabel={profile?.activity_level ? ACTIVITY_LABEL[profile.activity_level as ActivityLevel] : '—'}
                options={ALL_ACTIVITY}
                optionLabels={ACTIVITY_LABEL}
                isOpen={openRow === 'activity'}
                onToggle={() => toggleRow('activity')}
                onSelect={(v) => { saveField({ activity_level: v }); setOpenRow(null); }}
              />
            </View>
          </View>

          {/* ── Food I love ── */}
          <View
            style={s.section}
            onLayout={(e) => { prefsSectionY.current = e.nativeEvent.layout.y; }}
          >
            <SectionTitle
              icon={<Heart size={14} color={Colors.accent} strokeWidth={2.5} />}
              title="Food I love"
              subtitle="Diet style and the cuisines you enjoy"
            />
            <View style={s.rowGroup}>
              <PickRow
                label="Diet"
                value={profile?.diet_type as DietType ?? null}
                valueLabel={profile?.diet_type ? DIET_LABEL[profile.diet_type as DietType] : '—'}
                options={ALL_DIETS}
                optionLabels={DIET_LABEL}
                isOpen={openRow === 'diet'}
                onToggle={() => toggleRow('diet')}
                onSelect={(v) => { saveField({ diet_type: v }); setOpenRow(null); }}
              />
              <View style={s.chipBlock}>
                <Txt style={s.chipLabel}>Cuisines you enjoy</Txt>
                <ChipGrid
                  options={ALL_CUISINES}
                  labels={CUISINE_LABEL}
                  selected={(profile?.cuisines ?? []) as CuisinePreference[]}
                  onToggle={toggleCuisine}
                />
              </View>
            </View>
          </View>

          {/* ── Food I avoid ── */}
          <View style={s.section}>
            <SectionTitle
              icon={<Salad size={14} color="#E05A6B" strokeWidth={2.5} />}
              title="Food I avoid"
              subtitle="Restrictions we'll always respect"
            />
            <View style={s.chipBlockBare}>
              <ChipGrid
                options={ALL_RESTRICTIONS}
                labels={RESTRICTION_LABEL}
                selected={(profile?.restrictions ?? []) as Restriction[]}
                onToggle={toggleRestriction}
                color="#E05A6B"
              />
            </View>
          </View>

          {/* ── My plan ── */}
          <View style={s.section}>
            <SectionTitle
              icon={<Utensils size={14} color={Colors.accent} strokeWidth={2.5} />}
              title="My meal plan"
              subtitle={`Last generated · ${planDateStr}`}
            />
            <TouchableOpacity
              style={[s.regenCard, regenerating && s.regenCardLoading]}
              onPress={handleRegenerate}
              activeOpacity={0.85}
              disabled={regenerating}
            >
              {regenerating ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Txt style={s.regenCardTxt}>Generating your new plan…</Txt>
                </>
              ) : (
                <>
                  <RotateCw size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Txt style={s.regenCardTxt}>Regenerate my 7-day plan</Txt>
                  <View style={s.regenCostChip}>
                    <Sparkles size={9} color="#FFFFFF" strokeWidth={2.5} />
                    <Txt style={s.regenCostTxt}>PRO</Txt>
                  </View>
                </>
              )}
            </TouchableOpacity>
            <Txt style={s.regenHint}>
              We'll use your stats, preferences, and kitchen ingredients. Takes about 30 seconds.
            </Txt>
          </View>

          {/* ── Settings ── */}
          <View style={s.section}>
            <SectionTitle
              icon={<Settings size={14} color={Colors.secondary} strokeWidth={2.5} />}
              title="Settings"
            />
            <View style={s.rowGroup}>
              <View style={[s.settingRow, s.settingRowCol]}>
                <View style={s.settingRowTop}>
                  <View style={s.settingInfo}>
                    <Txt style={s.settingLabel}>Meal reminders</Txt>
                    <Txt style={s.settingHint}>
                      {`${fmt(mealTimes.breakfast)} · ${fmt(mealTimes.lunch)} · ${fmt(mealTimes.dinner)}`}
                    </Txt>
                  </View>
                  <View style={s.settingRowRight}>
                    <TouchableOpacity
                      onPress={() => { haptic.light(); setMealTimesOpen((v) => !v); }}
                      activeOpacity={0.6}
                      style={s.editTimesBtn}
                    >
                      <Txt style={s.editTimesTxt}>Edit times</Txt>
                    </TouchableOpacity>
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={async (val) => {
                        haptic.light();
                        if (val) {
                          const granted = await requestNotificationPermission();
                          if (!granted) {
                            Alert.alert('Permission needed', 'Enable notifications in Settings to get meal reminders.');
                            return;
                          }
                          await scheduleMealReminders(mealTimes);
                        } else {
                          await cancelMealReminders();
                        }
                        analytics.notificationsToggled({ type: 'meals', enabled: val });
                        setNotificationsEnabled(val);
                        DeviceEventEmitter.emit(MEAL_NOTIFS_TOGGLED_EVENT);
                      }}
                      trackColor={{ false: Colors.border, true: Colors.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
                {mealTimesOpen && (
                  <View style={s.timePickers}>
                    {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                      <View key={meal} style={s.timePickerRow}>
                        <Txt style={s.timePickerLabel}>
                          {meal === 'breakfast' ? '🌅 Breakfast' : meal === 'lunch' ? '🍛 Lunch' : '🌙 Dinner'}
                        </Txt>
                        <View style={s.timeSteppers}>
                          <TouchableOpacity
                            style={s.timeStep}
                            onPress={() => {
                              haptic.light();
                              const prev = mealTimes[meal];
                              const h = (prev.hour - 1 + 24) % 24;
                              const next = { ...mealTimes, [meal]: { ...prev, hour: h } };
                              setMealTimes(next);
                            }}
                          >
                            <Txt style={s.timeStepTxt}>−</Txt>
                          </TouchableOpacity>
                          <Txt style={s.timeValue}>{fmt(mealTimes[meal])}</Txt>
                          <TouchableOpacity
                            style={s.timeStep}
                            onPress={() => {
                              haptic.light();
                              const prev = mealTimes[meal];
                              const h = (prev.hour + 1) % 24;
                              const next = { ...mealTimes, [meal]: { ...prev, hour: h } };
                              setMealTimes(next);
                            }}
                          >
                            <Txt style={s.timeStepTxt}>+</Txt>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={s.saveTimesBtn}
                      activeOpacity={0.85}
                      onPress={async () => {
                        haptic.success();
                        await saveField({ meal_notification_times: mealTimes } as any);
                        if (notificationsEnabled) await scheduleMealReminders(mealTimes);
                        setMealTimesOpen(false);
                        showToast('Reminder times saved', 'success');
                        DeviceEventEmitter.emit(MEAL_TIMES_CHANGED_EVENT);
                      }}
                    >
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                      <Txt style={s.saveTimesTxt}>Save times</Txt>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={s.settingRow}>
                <View style={s.settingInfo}>
                  <Txt style={s.settingLabel}>Units</Txt>
                  <Txt style={s.settingHint}>{isImperial ? 'lbs · inches' : 'kg · cm'}</Txt>
                </View>
                <View style={s.unitToggle}>
                  <TouchableOpacity
                    style={[s.unitOpt, !isImperial && s.unitOptActive]}
                    onPress={() => { saveField({ preferred_units: 'metric' }); analytics.unitsChanged({ units: 'metric' }); }}
                    activeOpacity={0.7}
                  >
                    <Txt style={[s.unitOptTxt, !isImperial && s.unitOptTxtActive]}>Metric</Txt>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.unitOpt, isImperial && s.unitOptActive]}
                    onPress={() => { saveField({ preferred_units: 'imperial' }); analytics.unitsChanged({ units: 'imperial' }); }}
                    activeOpacity={0.7}
                  >
                    <Txt style={[s.unitOptTxt, isImperial && s.unitOptTxtActive]}>Imperial</Txt>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity style={s.redoRow} onPress={handleRedoOnboarding} activeOpacity={0.75}>
              <View style={s.redoIconWrap}>
                <RotateCw size={15} color={Colors.accent} strokeWidth={2.2} />
              </View>
              <View style={s.redoInfo}>
                <Txt style={s.redoTxt}>Recalculate my nutrition plan</Txt>
                <Txt style={s.redoHint}>Re-run setup to refresh your targets</Txt>
              </View>
              <ChevronRight size={16} color={Colors.secondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* ── Share + Rate ── */}
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.actionCard}
              activeOpacity={0.8}
              onPress={async () => {
                analytics.appShared();
                await Share.share({ message: inviteCopy.replace(/\\n/g, '\n') });
              }}
            >
              <Txt style={s.actionEmoji}>🔗</Txt>
              <Txt style={s.actionTitle}>Invite a friend</Txt>
              <Txt style={s.actionHint}>Share Nourish</Txt>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.actionCard}
              activeOpacity={0.8}
              onPress={async () => {
                analytics.appRated();
                if (await StoreReview.hasAction()) {
                  await StoreReview.requestReview();
                } else {
                  Linking.openURL('https://play.google.com/store/apps/details?id=com.nourish.app').catch(() => {});
                }
              }}
            >
              <Txt style={s.actionEmoji}>⭐</Txt>
              <Txt style={s.actionTitle}>Rate Nourish</Txt>
              <Txt style={s.actionHint}>Takes 10 seconds</Txt>
            </TouchableOpacity>
          </View>

          {/* ── Feedback ── */}
          <TouchableOpacity
            style={s.feedbackCard}
            activeOpacity={0.8}
            onPress={() => { analytics.feedbackTapped(); haptic.light(); setFeedbackOpen(true); }}
          >
            <View style={s.feedbackIcon}>
              <MessageSquareHeart size={16} color={Colors.accent} strokeWidth={2.2} />
            </View>
            <View style={s.feedbackInfo}>
              <Txt style={s.feedbackTitle}>Send us feedback</Txt>
              <Txt style={s.feedbackHint}>Tell us what to build next</Txt>
            </View>
          </TouchableOpacity>

          {/* ── De-emphasized sign out ── */}
          <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.6}>
            <Txt style={s.signOutTxt}>Sign out</Txt>
          </TouchableOpacity>

          {/* ── Meet the founder ── */}
          <FounderCard />

          <Txt style={s.version}>Nourish · v1.0</Txt>
        </ScrollView>
      </KeyboardAvoidingView>

      <FeedbackSheet
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        userId={userId}
      />
    </SafeAreaView>
  );
}

// ─── Founder card ──────────────────────────────────────────────────────────

const FOUNDER_LINKS = {
  instagram: 'https://www.instagram.com/codelifewithharsh',
  linkedin:  'https://www.linkedin.com/in/code-life-with-harsh/',
  website:   'https://codelifewithharsh.vercel.app/',
};

const INSTAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
</svg>`;

function FounderCard() {
  const open = (url: string) => {
    haptic.light();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={fc.card}>
      {/* Tiny ribbon label */}
      <View style={fc.ribbon}>
        <Heart size={9} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} />
        <Txt style={fc.ribbonTxt}>Meet the founder</Txt>
      </View>

      <View style={fc.body}>
        <Image
          source={require('@/assets/profile.png')}
          style={fc.photo}
        />
        <View style={fc.info}>
          <Txt style={fc.name}>Harsh</Txt>
          <Txt style={fc.loc}>📍 Bengaluru · 🌾 Punjabi boy</Txt>
        </View>
      </View>

      <Txt style={fc.note}>
        Hi, I'm Harsh. I built Nourish because eating well shouldn't mean giving up roti, rajma, or rasam.
        {'\n'}
        <Txt style={fc.noteSoft}>If something feels off, tell me — I read every message.</Txt>
      </Txt>

      <View style={fc.socialRow}>
        <TouchableOpacity style={fc.social} onPress={() => { analytics.founderLinkTapped({ platform: 'instagram' }); open(FOUNDER_LINKS.instagram); }} activeOpacity={0.75}>
          <SvgXml xml={INSTAGRAM_SVG} width={13} height={13} color={Colors.accent} />
          <Txt style={fc.socialTxt}>@codelifewithharsh</Txt>
        </TouchableOpacity>
        <TouchableOpacity style={fc.socialIcon} onPress={() => { analytics.founderLinkTapped({ platform: 'linkedin' }); open(FOUNDER_LINKS.linkedin); }} activeOpacity={0.75}>
          <Briefcase size={13} color={Colors.accent} strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity style={fc.socialIcon} onPress={() => { analytics.founderLinkTapped({ platform: 'website' }); open(FOUNDER_LINKS.website); }} activeOpacity={0.75}>
          <Globe size={13} color={Colors.accent} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <Txt style={fc.stamp}>Built with ❤️ for Indian kitchens</Txt>
    </View>
  );
}

const fc = StyleSheet.create({
  card:       { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1.5, borderColor: Colors.accentLight, marginTop: 4, position: 'relative', overflow: 'hidden' },

  ribbon:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: Colors.accentLight, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  ribbonTxt:  { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 12 },

  body:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo:      { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accentLight },
  info:       { flex: 1, gap: 2 },
  name:       { fontSize: 17, fontWeight: '800', color: Colors.primary, lineHeight: 22, letterSpacing: -0.3 },
  loc:        { fontSize: 11, color: Colors.secondary, lineHeight: 15, fontWeight: '600' },

  note:       { fontSize: 13, color: Colors.primary, lineHeight: 19, fontWeight: '500', fontStyle: 'italic' },
  noteSoft:   { color: Colors.secondary, fontStyle: 'italic', fontWeight: '500' },

  socialRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  social:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, backgroundColor: Colors.accentLight, flex: 1 },
  socialTxt:  { fontSize: 11, fontWeight: '700', color: Colors.accent, lineHeight: 14 },
  socialIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },

  stamp:      { fontSize: 10, fontWeight: '600', color: Colors.secondary, textAlign: 'center', letterSpacing: 0.3, marginTop: 2 },
});

// ─── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140, gap: 20 },

  // Hero greeting
  heroBlock:  { gap: 10, paddingVertical: 4 },
  heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:     { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:  { width: 48, height: 48, borderRadius: 14 },
  avatarTxt:  { fontSize: 17, fontWeight: '800', color: '#FFFFFF', lineHeight: 22 },
  heroInfo:   { flex: 1, gap: 2 },
  heroGreet:  { fontSize: 22, fontWeight: '800', color: Colors.primary, lineHeight: 28, letterSpacing: -0.5 },
  heroEmail:  { fontSize: 12, color: Colors.secondary, lineHeight: 16 },

  // Streak hero
  streakHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#FFF8E8', borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: '#FFE3A8' },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  flameWrap:  { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFEDC2', alignItems: 'center', justifyContent: 'center' },
  streakRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  streakNum:  { fontSize: 26, fontWeight: '800', color: Colors.primary, letterSpacing: -0.5, lineHeight: 30 },
  streakUnit: { fontSize: 13, fontWeight: '700', color: Colors.secondary, lineHeight: 17 },
  streakHint: { fontSize: 11, color: Colors.secondary, lineHeight: 14, marginTop: 1 },
  goalBadge:  { backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  goalBadgeTxt:{ fontSize: 11, fontWeight: '800', color: Colors.primary, letterSpacing: 0.2 },

  // Targets strip
  targetsCard:{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 14 },
  targetsItem:{ flex: 1, alignItems: 'center', gap: 2 },
  targetsVal: { fontSize: 18, fontWeight: '800', color: Colors.accent, letterSpacing: -0.3, lineHeight: 22 },
  targetsLbl: { fontSize: 10, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 13 },
  targetsDiv: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: Colors.border },

  // Section
  section: { gap: 0 },

  // Kitchen card
  kitchenCard:        { backgroundColor: Colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1.5, borderColor: Colors.border },
  kitchenCardFocused: { borderColor: Colors.accent, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  kitchenTopRow:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sparkleWrap:        { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  kitchenAiLabel:     { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5, textTransform: 'uppercase' },
  kitchenInput:       { fontSize: 14, fontWeight: '500', color: Colors.primary, lineHeight: 20, minHeight: 64, paddingTop: 0 },
  kitchenBottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kitchenHint:        { flex: 1, fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },
  kitchenSaveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, backgroundColor: Colors.accent, borderRadius: 10 },
  kitchenSaveBtnDisabled: { opacity: 0.4 },
  kitchenSaveTxt:     { fontSize: 12, fontWeight: '700', color: '#FFFFFF', lineHeight: 16 },

  // Stat row group
  rowGroup: { gap: 6 },

  // Chip blocks
  chipBlock:     { gap: 10, backgroundColor: Colors.surface, borderRadius: 14, padding: 14 },
  chipBlockBare: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14 },
  chipLabel:     { fontSize: 12, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.3 },

  // Setting rows
  settingRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  settingInfo:   { flex: 1, gap: 2 },
  settingLabel:  { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  settingHint:   { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  unitToggle:    { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 999, padding: 3, gap: 2 },
  unitOpt:       { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999 },
  unitOptActive: { backgroundColor: Colors.accent },
  unitOptTxt:    { fontSize: 11, fontWeight: '700', color: Colors.secondary, lineHeight: 14 },
  unitOptTxtActive:{ color: '#FFFFFF' },

  // Regenerate plan
  regenCard:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  regenCardLoading: { opacity: 0.85 },
  regenCardTxt:     { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19, textAlign: 'center' },
  regenHint:        { fontSize: 11, color: Colors.secondary, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  regenCostChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.22)', paddingVertical: 3, paddingHorizontal: 7, borderRadius: 999 },
  regenCostTxt:     { fontSize: 11, fontWeight: '800', color: '#FFFFFF', lineHeight: 14, letterSpacing: -0.1 },

  // Feedback CTA
  feedbackCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 14 },
  feedbackIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  feedbackInfo: { flex: 1, gap: 1 },
  feedbackTitle:{ fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 19 },
  feedbackHint: { fontSize: 11, color: Colors.secondary, lineHeight: 14 },

  // Sign out — de-emphasized
  signOut:    { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  signOutTxt: { fontSize: 13, fontWeight: '500', color: Colors.secondary, lineHeight: 17, textDecorationLine: 'underline' },

  version: { textAlign: 'center', fontSize: 11, color: Colors.secondary, marginTop: 4 },

  redoRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.surface, borderRadius: 14, marginTop: 10 },
  redoIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  redoInfo:     { flex: 1, gap: 2 },
  redoTxt:      { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  redoHint:     { fontSize: 11, color: Colors.secondary, lineHeight: 14 },

  // Meal reminder time picker
  settingRowCol:    { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 12 },
  settingRowTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingRowRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editTimesBtn:     { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.accentLight },
  editTimesTxt:     { fontSize: 11, fontWeight: '700', color: Colors.accent },
  timePickers:      { marginTop: 12, gap: 10 },
  timePickerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timePickerLabel:  { fontSize: 13, fontWeight: '600', color: Colors.primary, flex: 1 },
  timeSteppers:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeStep:         { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  timeStepTxt:      { fontSize: 18, fontWeight: '600', color: Colors.accent, lineHeight: 22 },
  timeValue:        { fontSize: 13, fontWeight: '700', color: Colors.primary, minWidth: 60, textAlign: 'center' },
  saveTimesBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, backgroundColor: Colors.accent, borderRadius: 10, marginTop: 4 },
  saveTimesTxt:     { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  actionRow:   { flexDirection: 'row', gap: 10 },
  actionCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  actionEmoji: { fontSize: 24, lineHeight: 30 },
  actionTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, lineHeight: 18, textAlign: 'center' },
  actionHint:  { fontSize: 11, color: Colors.secondary, lineHeight: 14, textAlign: 'center' },
});
