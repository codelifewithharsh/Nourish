import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, Share, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Check, ChevronRight, Sparkles, ShoppingCart, X, Share2, CheckCircle2, Camera, Pencil, Undo2 } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { useAI } from '@/features/pro';
import { partitionIngredients, toMealKey, type Ingredient } from '@/features/recipe/useRecipe';

import { SwapMealModal, SwapResult } from '@/components/SwapMealModal';
import { usePhotoLogger } from '@/features/nutrition/PhotoLogProvider';
import { useScrollState } from '@/features/nutrition/ScrollContext';
import {
  QuickAddCard,
  type NutritionResult,
  type RecentMeal,
} from '@/features/nutrition/components/QuickAddCard';
import { EditLogModal, type EditableLog } from '@/features/nutrition/components/EditLogModal';
import { AIError } from '@/lib/aiClient';
import { localDateStr } from '@/lib/date';
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
  /** Optional: plans generated before fibre was tracked simply omit it. */
  fibre?: number;
}

interface Day {
  day: number;
  meals: Meal[];
  total_calories: number;
  total_protein: number;
}

/** A raw row from daily_logs. */
interface LogRow {
  id:        string;
  meal_type: string;
  meal_name: string;
  calories:  number;
  protein:   number;
  carbs:     number;
  fat:       number;
  fibre:     number;
}

/**
 * A meal the user actually ate, as opposed to one the plan proposed.
 * Carries the row ids it was built from so it can be edited or undone.
 */
interface LoggedMeal extends Meal {
  /** Always known for a logged meal — the column is NOT NULL with default 0. */
  fibre:  number;
  logIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  meal, status, onLog, onSwap, onScan, onView, onEdit, onDelog, busy,
}: {
  meal: Meal;
  status: 'logged' | 'next' | 'upcoming' | 'past' | 'future';
  onLog: () => void;
  onSwap: () => void;
  onScan: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelog: () => void;
  busy: boolean;
}) {
  const color = MEAL_COLOR[meal.type];
  const emoji = MEAL_EMOJI[meal.type];
  const isLogged = status === 'logged';
  const isNext   = status === 'next';
  const isFuture = status === 'future';

  // Collapsed/logged variant. Correcting a logged meal used to mean leaving
  // for another tab, so the two actions that matter — fix it, undo it — sit
  // on the card itself.
  if (isLogged) {
    return (
      <View style={[mc.card, mc.cardLogged]}>
        <TouchableOpacity style={mc.loggedRow} onPress={onView} activeOpacity={0.85}>
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
        </TouchableOpacity>
        <View style={mc.loggedActions}>
          <TouchableOpacity onPress={onEdit} hitSlop={8} style={mc.loggedBtn} disabled={busy}>
            <Pencil size={14} color={Colors.secondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelog} hitSlop={8} style={mc.loggedBtn} disabled={busy}>
            {busy
              ? <ActivityIndicator size="small" color={Colors.secondary} />
              : <Undo2 size={14} color={Colors.secondary} strokeWidth={2} />}
          </TouchableOpacity>
        </View>
      </View>
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
        {meal.fibre != null && (
          <MacroPill value={`${meal.fibre}g`} unit="fibre" color="#4E9A5F" />
        )}
      </View>

      {/* Actions. "Log it" is the plan-was-right path; Scan is for when they
          ate something else and want it read from a photo; Suggest asks the
          AI for a different dish. */}
      {!isFuture && (
        <View style={mc.btns}>
          <TouchableOpacity
            style={[mc.btnLog, { backgroundColor: color }]}
            activeOpacity={0.88}
            onPress={onLog}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <>
                  <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  <Txt style={mc.btnLogTxt}>Log it</Txt>
                </>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[mc.btnSwap, { borderColor: color }]}
            activeOpacity={0.85}
            onPress={onScan}
          >
            <Camera size={14} color={color} strokeWidth={2.5} />
            <Txt style={[mc.btnSwapTxt, { color }]}>Scan</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mc.btnSwap, { borderColor: color }]}
            activeOpacity={0.85}
            onPress={onSwap}
          >
            <Sparkles size={14} color={color} strokeWidth={2.5} />
            <Txt style={[mc.btnSwapTxt, { color }]}>Suggest</Txt>
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
  cardLogged:  { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
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
  loggedRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  loggedActions:{ flexDirection: 'row', gap: 2, marginLeft: 4 },
  loggedBtn:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  checkCircle:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loggedInfo:   { flex: 1, gap: 2 },
  loggedTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loggedEmoji:  { fontSize: 13, lineHeight: 17 },
  loggedType:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  loggedDot:    { fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  loggedTime:   { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '600' },
  loggedName:   { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
});

// ─── Grocery List Sheet ───────────────────────────────────────────────────────

function GroceryListSheet({
  visible, plan, onClose,
}: {
  visible: boolean;
  plan:    Day[] | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading,   setLoading]   = useState(false);
  const [toBuy,     setToBuy]     = useState<Ingredient[]>([]);
  const [inKitchen, setInKitchen] = useState<Ingredient[]>([]);
  const slideY  = useRef(new Animated.Value(600)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Merge + deduplicate ingredients across all meals by normalized name
  function mergeIngredients(lists: Ingredient[][]): Ingredient[] {
    const seen = new Map<string, Ingredient>();
    for (const list of lists) {
      for (const ing of list) {
        const key = ing.name.toLowerCase().trim();
        if (!seen.has(key)) seen.set(key, ing);
      }
    }
    return Array.from(seen.values());
  }

  useEffect(() => {
    if (!visible || !plan) return;

    setLoading(true);
    setToBuy([]);
    setInKitchen([]);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slideY,  { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    (async () => {
      // Collect all unique meal names across the full 7-day plan
      const mealNames = new Set<string>();
      for (const day of plan) {
        for (const meal of day.meals) mealNames.add(meal.name);
      }

      // Fetch cached recipes + kitchen ingredients in parallel
      const mealKeys = Array.from(mealNames).map(toMealKey);
      const [recipesRes, profileRes] = await Promise.all([
        supabase.from('recipes').select('ingredients').in('meal_key', mealKeys),
        supabase.from('profiles').select('kitchen_ingredients').single(),
      ]);

      const kitchenIngredients = profileRes.data?.kitchen_ingredients ?? null;

      // Flatten all ingredients from all cached recipes
      const allIngredients: Ingredient[] = [];
      for (const row of recipesRes.data ?? []) {
        const ings = row.ingredients as unknown as Ingredient[];
        if (Array.isArray(ings)) allIngredients.push(...ings);
      }

      const merged = mergeIngredients([allIngredients]);
      const { fromKitchen, needToBuy } = partitionIngredients(merged, kitchenIngredients);
      setToBuy(needToBuy);
      setInKitchen(fromKitchen);
      setLoading(false);
    })();
  }, [visible, plan]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      slideY.setValue(600);
      opacity.setValue(0);
      onClose();
    });
  };

  const handleShare = async () => {
    if (toBuy.length === 0) return;
    const lines = toBuy.map((i) => {
      const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
      return qty ? `• ${i.name} — ${qty}` : `• ${i.name}`;
    });
    const text = `🛒 Grocery List\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message: text });
      analytics.groceryListExported({ item_count: toBuy.length });
    } catch {
      // user dismissed share sheet
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[gl.backdrop, { opacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>
      <Animated.View style={[gl.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>
        {/* Handle */}
        <View style={gl.handle} />

        {/* Header */}
        <View style={gl.header}>
          <View style={gl.headerLeft}>
            <View style={gl.iconWrap}>
              <ShoppingCart size={18} color={Colors.accent} strokeWidth={2.2} />
            </View>
            <View>
              <Txt style={gl.title}>Grocery List</Txt>
              <Txt style={gl.subtitle}>Based on your 7-day plan</Txt>
            </View>
          </View>
          <TouchableOpacity style={gl.closeBtn} onPress={handleClose} activeOpacity={0.7}>
            <X size={18} color={Colors.secondary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={gl.loadingWrap}>
            <ActivityIndicator color={Colors.accent} />
            <Txt style={gl.loadingTxt}>Building your list…</Txt>
          </View>
        ) : toBuy.length === 0 && inKitchen.length === 0 ? (
          <View style={gl.emptyWrap}>
            <Txt style={gl.emptyEmoji}>📦</Txt>
            <Txt style={gl.emptyTitle}>No recipes cached yet</Txt>
            <Txt style={gl.emptyBody}>Open each meal's recipe to generate it, then come back here.</Txt>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={gl.listContent}>
            {toBuy.length > 0 && (
              <View style={gl.section}>
                <Txt style={gl.sectionLabel}>To buy · {toBuy.length} items</Txt>
                {toBuy.map((ing, i) => (
                  <View key={i} style={gl.row}>
                    <View style={gl.bullet} />
                    <Txt style={gl.ingName}>{ing.name}</Txt>
                    {(ing.quantity || ing.unit) ? (
                      <Txt style={gl.ingQty}>{[ing.quantity, ing.unit].filter(Boolean).join(' ')}</Txt>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {inKitchen.length > 0 && (
              <View style={gl.section}>
                <Txt style={gl.sectionLabelGreen}>Already in kitchen · {inKitchen.length} items</Txt>
                {inKitchen.map((ing, i) => (
                  <View key={i} style={[gl.row, gl.rowGreen]}>
                    <CheckCircle2 size={13} color="#4CAF50" strokeWidth={2.5} />
                    <Txt style={[gl.ingName, gl.ingNameGreen]}>{ing.name}</Txt>
                    {(ing.quantity || ing.unit) ? (
                      <Txt style={gl.ingQty}>{[ing.quantity, ing.unit].filter(Boolean).join(' ')}</Txt>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* Share button */}
        {!loading && toBuy.length > 0 && (
          <TouchableOpacity style={gl.shareBtn} onPress={handleShare} activeOpacity={0.88}>
            <Share2 size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Txt style={gl.shareBtnTxt}>Share list</Txt>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Modal>
  );
}

const gl = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 10,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 17, fontWeight: '800', color: Colors.primary, lineHeight: 22 },
  subtitle: { fontSize: 12, color: Colors.secondary, lineHeight: 16 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  loadingWrap: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  loadingTxt:  { fontSize: 14, color: Colors.secondary },

  emptyWrap:  { alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 40 },
  emptyEmoji: { fontSize: 40, lineHeight: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyBody:  { fontSize: 13, color: Colors.secondary, textAlign: 'center', lineHeight: 18 },

  listContent: { paddingHorizontal: 20, paddingBottom: 16, gap: 20 },

  section:          { gap: 8 },
  sectionLabel:     { fontSize: 11, fontWeight: '800', color: Colors.secondary, textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 14 },
  sectionLabelGreen:{ fontSize: 11, fontWeight: '800', color: '#4CAF50', textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 14 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rowGreen: { opacity: 0.7 },
  bullet:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  ingName:      { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 20 },
  ingNameGreen: { color: Colors.secondary },
  ingQty:       { fontSize: 12, color: Colors.secondary, fontWeight: '500' },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, marginHorizontal: 20, marginTop: 8,
    backgroundColor: Colors.accent, borderRadius: 14,
  },
  shareBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
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
  const [loggedMealsByType, setLoggedMealsByType] = useState<Record<string, LoggedMeal>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<Meal | null>(null);
  const [addingSnack, setAddingSnack] = useState(false);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [busyType, setBusyType] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<LoggedMeal | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const invoke = useAI();
  const photoLogger = usePhotoLogger();
  const { onScroll, resetAtTop } = useScrollState();

  // ── Quick-add ("ate something else") state ──
  const [query, setQuery] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<NutritionResult | null>(null);
  const [quickType, setQuickType] = useState<MealType>(nextMealTypeByTime());
  const [confirming, setConfirming] = useState(false);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);

  // Fetch the plan + today's logs together
  const fetchData = useCallback(async (uid: string) => {
    const today = todayStr();
    const week  = new Date();
    week.setDate(week.getDate() - 7);

    const [planRes, logsRes, recentRes] = await Promise.all([
      supabase.from('meal_plans').select('plan').eq('user_id', uid).maybeSingle(),
      supabase
        .from('daily_logs')
        .select('id, meal_type, meal_name, calories, protein, carbs, fat, fibre, logged_at')
        .eq('user_id', uid).eq('date', today)
        .order('logged_at', { ascending: false }),
      supabase
        .from('daily_logs')
        .select('meal_name, calories, protein, carbs, fat')
        .eq('user_id', uid).neq('date', today)
        .gte('date', localDateStr(week))
        .order('logged_at', { ascending: false }).limit(20),
    ]);

    const raw = planRes.data?.plan as any;
    setPlan(raw?.days ?? null);
    applyLogs(logsRes.data ?? []);

    // De-dupe by name, newest first. This doubles as a local macro cache:
    // picking one of these chips skips the AI call entirely.
    const seen = new Set<string>();
    const unique: RecentMeal[] = [];
    for (const r of recentRes.data ?? []) {
      if (seen.has(r.meal_name)) continue;
      seen.add(r.meal_name);
      unique.push({
        name: r.meal_name, calories: r.calories,
        protein: r.protein, carbs: r.carbs, fat: r.fat,
      });
      if (unique.length >= 5) break;
    }
    setRecentMeals(unique);

    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch just today's logs (used on focus for cross-tab sync)
  const fetchLogsOnly = useCallback(async (uid: string) => {
    const today = todayStr();
    const { data } = await supabase
      .from('daily_logs')
      .select('id, meal_type, meal_name, calories, protein, carbs, fat, fibre, logged_at')
      .eq('user_id', uid).eq('date', today)
      .order('logged_at', { ascending: false });
    applyLogs(data ?? []);
  }, []);

  // Reduce raw log rows into the derived state we render from.
  //
  // A photo log writes one row per identified item, so a single meal can be
  // several rows. They're summed into one card and every row id is kept, so
  // de-logging removes the whole meal rather than orphaning the rest of the
  // plate.
  const applyLogs = (logs: LogRow[]) => {
    const byType: Record<string, LoggedMeal> = {};
    for (const l of logs) {
      const t = l.meal_type;
      const existing = byType[t];
      if (!existing) {
        byType[t] = {
          type:     t as MealType,
          name:     l.meal_name,
          calories: l.calories,
          protein:  l.protein,
          carbs:    l.carbs,
          fat:      l.fat,
          fibre:    l.fibre ?? 0,
          logIds:   [l.id],
        };
        continue;
      }
      existing.calories += l.calories;
      existing.protein  += l.protein;
      existing.carbs    += l.carbs;
      existing.fat      += l.fat;
      existing.fibre     = (existing.fibre ?? 0) + (l.fibre ?? 0);
      existing.logIds.push(l.id);
      // Rows arrive newest-first, so the first name seen is the freshest.
      // Beyond that, say how many things made up the plate.
      existing.name = `${existing.name.split(' + ')[0]} + ${existing.logIds.length - 1} more`;
    }
    setLoggedMealsByType(byType);
    setLoggedTypes(new Set(Object.keys(byType)));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        fetchData(user.id);
      }
    });
  }, []);

  // A scan can be started from a meal card or from the tab bar while this
  // screen is showing, and either way the rows land without a navigation —
  // so the provider tells us when to refetch.
  // Resolves the user at fire time rather than closing over `userId`, which
  // is null on the first render — a scan finishing before auth resolves would
  // otherwise leave the just-logged meal invisible until the next focus.
  useEffect(() => {
    return photoLogger.onLogged(() => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) fetchLogsOnly(user.id);
      });
    });
  }, [photoLogger, fetchLogsOnly]);

  // Cross-tab sync: refetch logs when meals tab gains focus.
  // Also recompute today's index in case the date rolled over midnight.
  useFocusEffect(
    useCallback(() => {
      analytics.screenViewed({ screen: 'meals' });
      resetAtTop();
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

  // The inserted row's id comes back with it, so the card can be edited or
  // undone straight away without waiting on a refetch.
  const handleLog = useCallback(async (meal: Meal) => {
    if (!userId) return;
    setBusyType(meal.type);
    haptic.success();
    try {
      const { data, error } = await supabase.from('daily_logs').insert({
        user_id:   userId,
        date:      todayStr(),
        meal_type: meal.type,
        meal_name: meal.name,
        calories:  meal.calories,
        protein:   meal.protein,
        carbs:     meal.carbs,
        fat:       meal.fat,
        fibre:     meal.fibre ?? 0,
        source:    'plan',
      }).select('id').single();

      if (error || !data) { Alert.alert('Could not log', 'Please try again.'); return; }

      setLoggedTypes((prev) => new Set([...prev, meal.type]));
      setLoggedMealsByType((prev) => ({
        ...prev,
        [meal.type]: { ...meal, fibre: meal.fibre ?? 0, logIds: [data.id] },
      }));
    } finally {
      setBusyType(null);
    }
  }, [userId]);

  // Undo a logged meal. A photo meal is several rows, so all of them go.
  const handleDelog = useCallback(async (meal: LoggedMeal) => {
    if (!userId) return;
    setBusyType(meal.type);
    haptic.warning();
    try {
      const { error } = await supabase
        .from('daily_logs')
        .delete()
        .in('id', meal.logIds)
        .eq('user_id', userId);
      if (error) { Alert.alert('Could not undo', 'Please try again.'); return; }
      analytics.logEntryDeleted();
      await fetchLogsOnly(userId);
    } finally {
      setBusyType(null);
    }
  }, [userId, fetchLogsOnly]);

  /**
   * Save an edited meal.
   *
   * A photo meal spans several rows whose macros were split per item. Rather
   * than trying to redistribute the user's corrected totals back across those
   * items, the old rows are replaced by the single row they just described —
   * which is what they actually told us they ate.
   */
  const handleEditSave = useCallback(async (next: EditableLog) => {
    if (!userId || !editing) return;
    setEditSaving(true);
    haptic.light();
    try {
      const del = await supabase
        .from('daily_logs')
        .delete()
        .in('id', editing.logIds)
        .eq('user_id', userId);
      if (del.error) { Alert.alert('Could not save', 'Please try again.'); return; }

      const { error } = await supabase.from('daily_logs').insert({
        user_id:   userId,
        date:      todayStr(),
        meal_type: next.type,
        meal_name: next.name,
        calories:  next.calories,
        protein:   next.protein,
        carbs:     next.carbs,
        fat:       next.fat,
        fibre:     next.fibre,
        source:    'text',
      });
      if (error) { Alert.alert('Could not save', 'Please try again.'); return; }

      analytics.logEntryEdited();
      setEditing(null);
      await fetchLogsOnly(userId);
    } finally {
      setEditSaving(false);
    }
  }, [userId, editing, fetchLogsOnly]);

  // ── Quick add: "I ate something that isn't in the plan" ──

  const handleLookup = useCallback(async () => {
    const text = query.trim();
    if (!text || !userId) return;
    setLooking(true);
    setLookupResult(null);
    try {
      const data = await invoke<NutritionResult>('lookup-nutrition', { query: text });
      haptic.light();
      analytics.nutritionLookedUp({ query: text });
      setLookupResult(data);
    } catch (err) {
      haptic.warning();
      // ProProvider already toasts rate limits, so only real failures alert.
      if (!(err instanceof AIError && err.code === 'rate_limited')) {
        Alert.alert(
          'Could not find that',
          'Try describing the food differently — like "1 bowl of dal" or "2 rotis"',
        );
      }
    } finally {
      setLooking(false);
    }
  }, [query, userId, invoke]);

  const handleQuickConfirm = useCallback(async () => {
    if (!lookupResult || !userId) return;
    setConfirming(true);
    haptic.success();
    try {
      const { error } = await supabase.from('daily_logs').insert({
        user_id:   userId,
        date:      todayStr(),
        meal_type: quickType,
        meal_name: lookupResult.name,
        calories:  lookupResult.calories,
        protein:   lookupResult.protein,
        carbs:     lookupResult.carbs,
        fat:       lookupResult.fat,
        source:    'text',
      });
      if (error) { Alert.alert('Could not log', 'Please try again.'); return; }
      analytics.logEntryAdded({
        meal_type: quickType,
        calories:  lookupResult.calories,
        protein:   lookupResult.protein,
      });
      setLookupResult(null);
      setQuery('');
      await fetchLogsOnly(userId);
    } finally {
      setConfirming(false);
    }
  }, [lookupResult, userId, quickType, fetchLogsOnly]);

  // A recent meal carries its macros, so picking one skips the AI call and
  // goes straight to the confirmation card.
  const handlePickRecent = useCallback((text: string, cached: RecentMeal | null) => {
    setQuery(text);
    if (cached) {
      haptic.light();
      setLookupResult({ ...cached, serving: '1 serving' });
    }
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (!userId || regenerating) return;
    setRegenerating(true);
    haptic.light();
    try {
      await invoke('generate-meal-plan');
      analytics.planRegenerated();
      await fetchData(userId);
    } catch {
      // ProProvider surfaces 429 toast; stale plan stays visible on other errors
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
  const summaryFibre    = orderedMeals.reduce((s, m) => s + (m.fibre ?? 0), 0);
  const hasFibre        = orderedMeals.some((m) => m.fibre != null);

  const dayTitle = isToday ? 'Today' : FULL_DAYS[selectedDay];
  const hasSnack = !!mealsByType.snack;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* ── Header ── */}
        <View style={s.headerRow}>
          <View style={s.header}>
            <Txt style={s.title}>Meal Plan</Txt>
            <Txt style={s.subtitle}>{dayTitle} · {orderedMeals.length} {orderedMeals.length === 1 ? 'meal' : 'meals'} planned</Txt>
          </View>
          {plan && (
            <TouchableOpacity
              style={s.groceryBtn}
              onPress={() => { haptic.light(); analytics.groceryListOpened(); setGroceryOpen(true); }}
              activeOpacity={0.8}
            >
              <ShoppingCart size={18} color={Colors.accent} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
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
              {hasFibre && <>
                <View style={s.summaryDiv} />
                <SummaryMacro value={`${summaryFibre}g`} label="Fibre" color="#4E9A5F" />
              </>}
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
            {orderedMeals.map((meal) => {
              const logged = loggedMealsByType[meal.type];
              return (
                <MealCard
                  key={meal.type}
                  meal={meal}
                  status={getStatus(meal)}
                  busy={busyType === meal.type}
                  onLog={() => handleLog(meal)}
                  onScan={() => photoLogger.start({ mealType: meal.type, source: 'ask' })}
                  onSwap={() => { analytics.swapModalOpened({ meal_type: meal.type, source: 'meals' }); setSwapTarget(meal); }}
                  onEdit={() => { if (logged) setEditing(logged); }}
                  onDelog={() => { if (logged) handleDelog(logged); }}
                  onView={() => { analytics.recipeViewed({ meal_type: meal.type, meal_name: meal.name }); router.push({ pathname: '/recipe/[id]', params: { id: encodeURIComponent(meal.name), type: meal.type, calories: String(meal.calories), protein: String(meal.protein), carbs: String(meal.carbs), fat: String(meal.fat) } }); }}
                />
              );
            })}

            {/* Promote "Add snack" if today and no snack planned */}
            {isToday && !hasSnack && (
              <AddSnackCard onAdd={handleAddSnack} />
            )}
          </View>
        )}

        {/* Off-plan logging. Only on today — you can't have eaten Thursday's
            lunch on Tuesday, and offering to log it would be nonsense. */}
        {isToday && !loading && (
          <QuickAddCard
            mealType={nextMealTypeByTime()}
            recentMeals={recentMeals}
            query={query}
            onChangeQuery={setQuery}
            onSubmit={handleLookup}
            looking={looking}
            result={lookupResult}
            selectedType={quickType}
            onSelectType={setQuickType}
            onConfirm={handleQuickConfirm}
            onDiscard={() => { setLookupResult(null); setQuery(''); }}
            confirming={confirming}
            onScan={() => photoLogger.start({ mealType: quickType })}
            onPickImage={() => photoLogger.start({ mealType: quickType, source: 'library' })}
            scanBusy={photoLogger.busy}
            onPickRecent={handlePickRecent}
          />
        )}
      </ScrollView>

      <EditLogModal
        entry={editing}
        visible={editing !== null}
        saving={editSaving}
        onSave={handleEditSave}
        onClose={() => setEditing(null)}
      />

      <GroceryListSheet
        visible={groceryOpen}
        plan={plan}
        onClose={() => setGroceryOpen(false)}
      />

      <SwapMealModal
        visible={!!swapTarget}
        mealType={swapTarget?.type ?? ''}
        currentMealName={addingSnack ? 'nothing yet' : (swapTarget?.name ?? '')}
        isAdd={addingSnack}
        onCancel={() => { setSwapTarget(null); setAddingSnack(false); }}
        onConfirm={async (result: SwapResult, updatePlan: boolean) => {
          if (swapTarget && userId) {
            // Always log it for today
            const { data: inserted } = await supabase.from('daily_logs').insert({
              user_id:   userId,
              date:      todayStr(),
              meal_type: swapTarget.type,
              meal_name: result.name,
              calories:  result.calories,
              protein:   result.protein,
              carbs:     result.carbs,
              fat:       result.fat,
              source:    'plan',
            }).select('id').single();

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
              fibre:    0,
              logIds:   inserted ? [inserted.id] : [],
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

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  header:   { gap: 2 },
  groceryBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
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
