import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, X, Trash2, ArrowUp, Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { useAI } from '@/features/credits/CreditsContext';
import { COST } from '@/features/credits/costs';
import { AIError } from '@/lib/aiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  meal_type: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
}

interface RecentMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

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

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: Colors.accent,
  lunch:     '#E6A817',
  dinner:    '#7B5EA7',
  snack:     '#E05C5C',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getTimeOfDay(): { greeting: string; emoji: string; suggestedType: MealType } {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return { greeting: 'Good morning', emoji: '🌅', suggestedType: 'breakfast' };
  if (h >= 11 && h < 16) return { greeting: 'Good afternoon', emoji: '☀️', suggestedType: 'lunch' };
  if (h >= 16 && h < 21) return { greeting: 'Good evening', emoji: '🌙', suggestedType: 'dinner' };
  return { greeting: 'Late night', emoji: '🌌', suggestedType: 'snack' };
}

function getContextualPrompt(mealType: MealType): string {
  const prompts: Record<MealType, string[]> = {
    breakfast: ['Oats with banana', 'Poha + tea', 'Idli sambar', '2 paranthas with curd'],
    lunch:     ['Dal rice with sabzi', '2 rotis + paneer', 'Rajma chawal', 'Veg biryani'],
    dinner:    ['Khichdi with curd', 'Roti + dal + sabzi', 'Veg pulao', 'Paneer tikka'],
    snack:     ['Masala chai + biscuits', '1 banana', 'Roasted chana', 'Greek yogurt'],
  };
  return prompts[mealType][Math.floor(Math.random() * prompts[mealType].length)];
}

// ─── Today's Macros Bar ───────────────────────────────────────────────────────

function MacrosBar({ calories, target }: { calories: number; target: number }) {
  const pct = Math.min((calories / target) * 100, 100);
  return (
    <View style={mb.wrap}>
      <View style={mb.row}>
        <Txt style={mb.label}>Today's intake</Txt>
        <Txt style={mb.value}>
          <Txt style={mb.valueBold}>{calories.toLocaleString()}</Txt>
          <Txt style={mb.valueLight}> / {target.toLocaleString()} kcal</Txt>
        </Txt>
      </View>
      <View style={mb.track}>
        <View style={[mb.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  wrap:       { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.secondary, lineHeight: 18 },
  value:      { fontSize: 13, lineHeight: 18 },
  valueBold:  { fontWeight: '800', color: Colors.primary, fontSize: 14 },
  valueLight: { color: Colors.secondary },
  track:      { height: 6, backgroundColor: Colors.accentLight, borderRadius: 999, overflow: 'hidden' },
  fill:       { height: 6, backgroundColor: Colors.accent, borderRadius: 999 },
});

// ─── AI Hero Input ────────────────────────────────────────────────────────────

function AIHero({
  query, onChangeQuery, onSubmit, looking, focused, onFocus, onBlur, inputRef,
}: {
  query: string;
  onChangeQuery: (q: string) => void;
  onSubmit: () => void;
  looking: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const sparklePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, { toValue: 1.15, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sparklePulse, { toValue: 1,    duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const canSubmit = query.trim().length > 0 && !looking;

  return (
    <View style={[hero.wrap, focused && hero.wrapFocused]}>
      <View style={hero.topRow}>
        <Animated.View style={[hero.sparkleWrap, { transform: [{ scale: sparklePulse }] }]}>
          <Sparkles size={16} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} fillOpacity={0.2} />
        </Animated.View>
        <Txt style={hero.aiLabel}>AI Nutritionist</Txt>
        <View style={hero.costChip}><Txt style={hero.costChipTxt}>{COST.nutrition} cr</Txt></View>
      </View>

      <TextInput
        ref={inputRef}
        style={hero.input}
        placeholder="What did you eat?"
        placeholderTextColor={Colors.secondary}
        value={query}
        onChangeText={onChangeQuery}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        multiline
        scrollEnabled={false}
      />

      <View style={hero.bottomRow}>
        <Txt style={hero.hint}>
          {looking ? 'Analyzing nutrition…' : 'I\'ll calculate calories & macros'}
        </Txt>
        <TouchableOpacity
          style={[hero.submitBtn, !canSubmit && hero.submitBtnDisabled]}
          onPress={onSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          {looking
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <ArrowUp size={20} color="#FFFFFF" strokeWidth={3} />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hero = StyleSheet.create({
  wrap:        { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1.5, borderColor: Colors.border, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  wrapFocused: { borderColor: Colors.accent, shadowOpacity: 0.15, shadowRadius: 12 },
  topRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sparkleWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  aiLabel:     { fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 0.5, textTransform: 'uppercase' },
  input:       { fontSize: 22, fontWeight: '600', color: Colors.primary, lineHeight: 28, padding: 0, minHeight: 36, maxHeight: 80 },
  bottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  hint:        { flex: 1, fontSize: 12, color: Colors.secondary, lineHeight: 16 },
  submitBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: Colors.border },
  costChip:    { marginLeft: 'auto', backgroundColor: Colors.accentLight, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 },
  costChipTxt: { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.3, lineHeight: 13 },
});

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

function SuggestionChips({
  mealType, recentMeals, onSelect,
}: {
  mealType: MealType;
  recentMeals: RecentMeal[];
  onSelect: (text: string, cached: RecentMeal | null) => void;
}) {
  // Mix recent (priority, with cached macros) + contextual prompts (text-only).
  const recentSlice = recentMeals.slice(0, 3);
  const recentNames = new Set(recentSlice.map((r) => r.name));
  const contextual = [
    getContextualPrompt(mealType),
    getContextualPrompt(mealType),
  ].filter((c) => !recentNames.has(c));

  type Chip = { text: string; cached: RecentMeal | null };
  const chips: Chip[] = [
    ...recentSlice.map((r): Chip => ({ text: r.name, cached: r })),
    ...contextual.map((c): Chip => ({ text: c, cached: null })),
  ].slice(0, 5);

  const sectionLabel = recentMeals.length > 0 ? 'Recent + Quick add' : `Try a ${MEAL_LABEL[mealType].toLowerCase()} suggestion`;

  return (
    <View style={sc.wrap}>
      <Txt style={sc.label}>{sectionLabel}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.row}>
        {chips.map(({ text, cached }, i) => {
          const isRecent = cached !== null;
          return (
            <TouchableOpacity
              key={`${text}-${i}`}
              style={[sc.chip, isRecent && sc.chipRecent]}
              onPress={() => onSelect(text, cached)}
              activeOpacity={0.75}
            >
              {isRecent && <View style={sc.dot} />}
              <Txt style={[sc.chipTxt, isRecent && sc.chipTxtRecent]} numberOfLines={1}>
                {text}
              </Txt>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap:           { gap: 10 },
  label:          { fontSize: 12, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 4 },
  row:            { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.border },
  chipRecent:     { backgroundColor: Colors.accentLight, borderColor: 'transparent' },
  dot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  chipTxt:        { fontSize: 13, fontWeight: '600', color: Colors.primary, maxWidth: 200 },
  chipTxtRecent:  { color: Colors.accent },
});

// ─── Nutrition Result Card (Confirmation) ─────────────────────────────────────

function NutritionResultCard({
  result, selectedType, onSelectType, onConfirm, onDiscard, confirming,
}: {
  result: NutritionResult;
  selectedType: MealType;
  onSelectType: (t: MealType) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  confirming: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[nr.wrap, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={nr.headerRow}>
        <View style={nr.foundBadge}>
          <Sparkles size={12} color={Colors.accent} strokeWidth={2.5} />
          <Txt style={nr.foundTxt}>Found it</Txt>
        </View>
        <TouchableOpacity onPress={onDiscard} hitSlop={10} style={nr.closeBtn}>
          <X size={18} color={Colors.secondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <Txt style={nr.name}>{result.name}</Txt>
      <Txt style={nr.serving}>{result.serving}</Txt>

      <View style={nr.macroGrid}>
        <MacroCell value={result.calories} label="kcal" color={Colors.accent} prominent />
        <View style={nr.macroDiv} />
        <MacroCell value={`${result.protein}g`} label="protein" color="#5B8DB8" />
        <View style={nr.macroDiv} />
        <MacroCell value={`${result.carbs}g`} label="carbs" color="#E6A817" />
        <View style={nr.macroDiv} />
        <MacroCell value={`${result.fat}g`} label="fat" color="#9B59B6" />
      </View>

      <View style={nr.typeSection}>
        <Txt style={nr.typeLabel}>Log as</Txt>
        <View style={nr.typeRow}>
          {MEAL_TYPES.map((t) => {
            const isActive = selectedType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[nr.typePill, isActive && { backgroundColor: MEAL_COLOR[t] + '15', borderColor: MEAL_COLOR[t] }]}
                onPress={() => onSelectType(t)}
                activeOpacity={0.75}
              >
                <Txt style={nr.typeEmoji}>{MEAL_EMOJI[t]}</Txt>
                <Txt style={[nr.typePillTxt, isActive && { color: MEAL_COLOR[t], fontWeight: '700' }]}>
                  {MEAL_LABEL[t]}
                </Txt>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[nr.confirmBtn, confirming && nr.confirmBtnLoading]}
        onPress={onConfirm}
        activeOpacity={0.88}
        disabled={confirming}
      >
        {confirming
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : (
            <>
              <Check size={18} color="#FFFFFF" strokeWidth={3} />
              <Txt style={nr.confirmTxt}>Add to today</Txt>
            </>
          )
        }
      </TouchableOpacity>
    </Animated.View>
  );
}

function MacroCell({
  value, label, color, prominent,
}: { value: number | string; label: string; color: string; prominent?: boolean }) {
  return (
    <View style={mcell.wrap}>
      <Txt style={[mcell.value, { color: prominent ? color : Colors.primary }, prominent && mcell.valueProminent]}>
        {value}
      </Txt>
      <Txt style={mcell.label}>{label}</Txt>
    </View>
  );
}

const mcell = StyleSheet.create({
  wrap:            { flex: 1, alignItems: 'center', gap: 2 },
  value:           { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  valueProminent:  { fontSize: 20, lineHeight: 26 },
  label:           { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },
});

const nr = StyleSheet.create({
  wrap:           { backgroundColor: Colors.surface, borderRadius: 20, padding: 18, gap: 14, borderWidth: 1.5, borderColor: Colors.accent + '40', shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foundBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  foundTxt:       { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5, textTransform: 'uppercase' },
  closeBtn:       { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  name:           { fontSize: 20, fontWeight: '800', color: Colors.primary, lineHeight: 26, letterSpacing: -0.3 },
  serving:        { fontSize: 13, color: Colors.secondary, lineHeight: 18, marginTop: -8 },
  macroGrid:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 4 },
  macroDiv:       { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: Colors.border },
  typeSection:    { gap: 8 },
  typeLabel:      { fontSize: 12, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  typeRow:        { flexDirection: 'row', gap: 6 },
  typePill:       { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typeEmoji:      { fontSize: 18, lineHeight: 22 },
  typePillTxt:    { fontSize: 11, fontWeight: '600', color: Colors.secondary, lineHeight: 14 },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, backgroundColor: Colors.accent, borderRadius: 16 },
  confirmBtnLoading: { opacity: 0.7 },
  confirmTxt:     { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 },
});

// ─── Timeline Entry ───────────────────────────────────────────────────────────

function TimelineEntry({
  type, entries, onDelete,
}: {
  type: MealType;
  entries: LogEntry[];
  onDelete: (id: string) => void;
}) {
  const color = MEAL_COLOR[type];
  const totalCal = entries.reduce((s, e) => s + e.calories, 0);

  return (
    <View style={te.wrap}>
      <View style={te.timeline}>
        <View style={[te.dot, { backgroundColor: color }]} />
        <View style={[te.line, { backgroundColor: color + '30' }]} />
      </View>

      <View style={te.contentWrap}>
        <View style={te.headerRow}>
          <View style={te.headerLeft}>
            <Txt style={te.emoji}>{MEAL_EMOJI[type]}</Txt>
            <Txt style={[te.type, { color }]}>{MEAL_LABEL[type]}</Txt>
          </View>
          <Txt style={te.totalCal}>{totalCal} kcal</Txt>
        </View>

        {entries.map((entry) => (
          <View key={entry.id} style={te.entry}>
            <View style={te.entryInfo}>
              <Txt style={te.entryName} numberOfLines={2}>{entry.meal_name}</Txt>
              <Txt style={te.entryMacros}>
                {entry.calories} kcal · {entry.protein}P · {entry.carbs}C · {entry.fat}F
              </Txt>
            </View>
            <TouchableOpacity onPress={() => onDelete(entry.id)} hitSlop={10} style={te.delBtn}>
              <Trash2 size={15} color={Colors.secondary} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const te = StyleSheet.create({
  wrap:        { flexDirection: 'row', gap: 12 },
  timeline:    { alignItems: 'center', width: 16, paddingTop: 4 },
  dot:         { width: 12, height: 12, borderRadius: 6 },
  line:        { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  contentWrap: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10, marginBottom: 4 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji:       { fontSize: 14, lineHeight: 18 },
  type:        { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  totalCal:    { fontSize: 13, fontWeight: '700', color: Colors.primary },
  entry:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  entryInfo:   { flex: 1, gap: 2 },
  entryName:   { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  entryMacros: { fontSize: 11, color: Colors.secondary, lineHeight: 15 },
  delBtn:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyLog({ mealType }: { mealType: MealType }) {
  return (
    <View style={es.wrap}>
      <Txt style={es.emoji}>{MEAL_EMOJI[mealType]}</Txt>
      <Txt style={es.title}>Nothing logged yet</Txt>
      <Txt style={es.body}>
        Type what you ate above — even something like{'\n'}
        <Txt style={es.bodyBold}>"2 rotis with dal"</Txt> works.
      </Txt>
    </View>
  );
}

const es = StyleSheet.create({
  wrap:     { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emoji:    { fontSize: 36, lineHeight: 44, marginBottom: 4 },
  title:    { fontSize: 16, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  body:     { fontSize: 13, color: Colors.secondary, lineHeight: 20, textAlign: 'center' },
  bodyBold: { fontWeight: '700', color: Colors.primary },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [selectedType, setSelectedType] = useState<MealType>('lunch');
  const [confirming, setConfirming] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [targetCalories, setTargetCalories] = useState(2200);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const invoke = useAI();

  const { greeting, suggestedType } = getTimeOfDay();

  const fetchLogs = useCallback(async (uid: string) => {
    const today = todayStr();
    const [logsRes, profileRes, recentRes] = await Promise.all([
      supabase.from('daily_logs')
        .select('id, meal_type, meal_name, calories, protein, carbs, fat')
        .eq('user_id', uid).eq('date', today)
        .order('logged_at', { ascending: true }),
      supabase.from('profiles').select('daily_calories').eq('id', uid).single(),
      (() => {
        const week = new Date();
        week.setDate(week.getDate() - 7);
        return supabase.from('daily_logs')
          .select('meal_name, calories, protein, carbs, fat')
          .eq('user_id', uid).neq('date', today)
          .gte('date', week.toISOString().split('T')[0])
          .order('logged_at', { ascending: false }).limit(20);
      })(),
    ]);

    setLogs(logsRes.data ?? []);
    setTargetCalories(profileRes.data?.daily_calories ?? 2200);
    // De-dupe by name, keeping the most recent occurrence (which is first
    // because we ordered by logged_at desc). This becomes our local cache —
    // clicking a recent chip reuses these macros and avoids burning a credit.
    const seen = new Set<string>();
    const unique: RecentMeal[] = [];
    for (const r of recentRes.data ?? []) {
      if (seen.has(r.meal_name)) continue;
      seen.add(r.meal_name);
      unique.push({
        name:     r.meal_name,
        calories: r.calories,
        protein:  r.protein,
        carbs:    r.carbs,
        fat:      r.fat,
      });
      if (unique.length >= 5) break;
    }
    setRecentMeals(unique);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        fetchLogs(user.id);
        setSelectedType(suggestedType);
      }
    });
  }, []);

  const handleLookup = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text || !userId) return;
    setLooking(true);
    setResult(null);
    inputRef.current?.blur();
    try {
      const data = await invoke<NutritionResult>('lookup-nutrition', { query: text });
      haptic.light();
      setResult(data);
    } catch (err) {
      haptic.warning();
      if (err instanceof AIError && err.code === 'no_credits') {
        // Modal already shown by CreditsProvider; no extra alert.
      } else if (err instanceof AIError && err.code === 'rate_limited') {
        // Toast already shown by CreditsProvider.
      } else {
        Alert.alert('Could not find that', 'Try describing the food differently — like "1 bowl of dal" or "2 rotis"');
      }
    } finally {
      setLooking(false);
    }
  }, [userId, invoke]);

  const handleConfirm = useCallback(async () => {
    if (!result || !userId) return;
    setConfirming(true);
    haptic.success();
    try {
      await supabase.from('daily_logs').insert({
        user_id:   userId,
        date:      todayStr(),
        meal_type: selectedType,
        meal_name: result.name,
        calories:  result.calories,
        protein:   result.protein,
        carbs:     result.carbs,
        fat:       result.fat,
      });
      setResult(null);
      setQuery('');
      fetchLogs(userId);
    } finally {
      setConfirming(false);
    }
  }, [result, userId, selectedType, fetchLogs]);

  const handleDelete = useCallback(async (id: string) => {
    if (!userId) return;
    haptic.warning();
    await supabase.from('daily_logs').delete().eq('id', id);
    fetchLogs(userId);
  }, [userId, fetchLogs]);

  // Recent chip with cached macros → skip AI entirely, jump straight to the
  // confirmation card. Quick-add chip (no cache) → just populate the input;
  // user has to tap send to spend the credit.
  const handleChipSelect = useCallback((text: string, cached: RecentMeal | null) => {
    setQuery(text);
    if (cached) {
      haptic.light();
      setResult({
        name:     cached.name,
        calories: cached.calories,
        protein:  cached.protein,
        carbs:    cached.carbs,
        fat:      cached.fat,
        serving:  '1 serving',
      });
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
  }, []);

  // Group logs by type, preserving order
  const grouped = MEAL_TYPES.reduce((acc, type) => {
    const items = logs.filter((l) => l.meal_type === type);
    if (items.length > 0) acc.push({ type, entries: items });
    return acc;
  }, [] as { type: MealType; entries: LogEntry[] }[]);

  const totalCalories = logs.reduce((s, l) => s + l.calories, 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Greeting Header ── */}
          <View style={s.headerWrap}>
            <Txt style={s.greeting}>{greeting} 👋</Txt>
            <Txt style={s.title}>What did you eat?</Txt>
          </View>

          {/* ── AI Hero Input ── */}
          <AIHero
            query={query}
            onChangeQuery={setQuery}
            onSubmit={() => handleLookup(query)}
            looking={looking}
            focused={inputFocused}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            inputRef={inputRef}
          />

          {/* ── Result or Chips ── */}
          {result ? (
            <NutritionResultCard
              result={result}
              selectedType={selectedType}
              onSelectType={setSelectedType}
              onConfirm={handleConfirm}
              onDiscard={() => { setResult(null); setQuery(''); }}
              confirming={confirming}
            />
          ) : (
            <SuggestionChips
              mealType={suggestedType}
              recentMeals={recentMeals}
              onSelect={handleChipSelect}
            />
          )}

          {/* ── Today's Intake Bar ── */}
          <MacrosBar calories={totalCalories} target={targetCalories} />

          {/* ── Timeline ── */}
          {grouped.length > 0 ? (
            <View style={s.timelineWrap}>
              <Txt style={s.timelineHeader}>Today's timeline</Txt>
              {grouped.map(({ type, entries }) => (
                <TimelineEntry
                  key={type}
                  type={type}
                  entries={entries}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          ) : (
            <EmptyLog mealType={suggestedType} />
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Screen Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.background },
  scroll:         { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140, gap: 18 },

  headerWrap:     { gap: 2, paddingTop: 4 },
  greeting:       { fontSize: 14, color: Colors.secondary, fontWeight: '500', lineHeight: 20 },
  title:          { fontSize: 28, fontWeight: '800', color: Colors.primary, lineHeight: 34, letterSpacing: -0.5 },

  timelineWrap:   { gap: 0, marginTop: 4 },
  timelineHeader: { fontSize: 12, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, paddingHorizontal: 4 },
});
