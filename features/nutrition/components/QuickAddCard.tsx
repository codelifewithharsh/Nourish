import { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, Animated, Easing,
} from 'react-native';
import { Sparkles, ArrowUp, Camera, X, Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui/Typography';
import { haptic } from '@/lib/haptics';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface NutritionResult {
  name:     string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
  serving:  string;
}

export interface RecentMeal {
  name:     string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: Colors.accent, lunch: '#E6A817', dinner: '#7B5EA7', snack: '#E05A6B',
};

const PROMPTS: Record<MealType, string[]> = {
  breakfast: ['Oats with banana', 'Poha + tea', 'Idli sambar', '2 paranthas with curd'],
  lunch:     ['Dal rice with sabzi', '2 rotis + paneer', 'Rajma chawal', 'Veg biryani'],
  dinner:    ['Khichdi with curd', 'Roti + dal + sabzi', 'Veg pulao', 'Paneer tikka'],
  snack:     ['Masala chai + biscuits', '1 banana', 'Roasted chana', 'Greek yogurt'],
};

interface Props {
  mealType:      MealType;
  recentMeals:   RecentMeal[];
  query:         string;
  onChangeQuery: (q: string) => void;
  onSubmit:      () => void;
  looking:       boolean;
  result:        NutritionResult | null;
  selectedType:  MealType;
  onSelectType:  (t: MealType) => void;
  onConfirm:     () => void;
  onDiscard:     () => void;
  confirming:    boolean;
  onScan:        () => void;
  scanBusy:      boolean;
  onPickRecent:  (text: string, cached: RecentMeal | null) => void;
}

/**
 * "I ate something that isn't in the plan."
 *
 * This used to be a whole tab. It's a card now, because it belongs beside the
 * plan it's correcting rather than in a separate place the user has to
 * remember exists. The camera comes first — typing a meal is markedly slower
 * than photographing it — with the text field kept for the times a photo
 * isn't possible: eating out, or a plate that's already been cleared.
 */
export function QuickAddCard({
  mealType, recentMeals, query, onChangeQuery, onSubmit, looking,
  result, selectedType, onSelectType, onConfirm, onDiscard, confirming,
  onScan, scanBusy, onPickRecent,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  if (result) {
    return (
      <ResultCard
        result={result}
        selectedType={selectedType}
        onSelectType={onSelectType}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
        confirming={confirming}
      />
    );
  }

  // Recent meals carry cached macros, so tapping one skips the AI call
  // entirely. The contextual prompts are only text — they still need a lookup.
  const recentSlice = recentMeals.slice(0, 3);
  const recentNames = new Set(recentSlice.map((r) => r.name));
  const suggestions = PROMPTS[mealType].filter((p) => !recentNames.has(p)).slice(0, 2);

  const chips = [
    ...recentSlice.map((r) => ({ text: r.name, cached: r as RecentMeal | null })),
    ...suggestions.map((c) => ({ text: c, cached: null })),
  ].slice(0, 5);

  const canSubmit = query.trim().length > 0 && !looking;

  return (
    <View style={[qa.card, focused && qa.cardFocused]}>
      <View style={qa.headRow}>
        <View style={qa.sparkWrap}>
          <Sparkles size={13} color={Colors.accent} strokeWidth={2.5} />
        </View>
        <Txt style={qa.headTxt}>Ate something else?</Txt>
      </View>

      {/* Camera first — it's the fast path. */}
      <TouchableOpacity style={qa.scanBtn} onPress={onScan} activeOpacity={0.88} disabled={scanBusy}>
        {scanBusy
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <>
              <Camera size={18} color="#FFFFFF" strokeWidth={2.3} />
              <Txt style={qa.scanTxt}>Scan your plate</Txt>
            </>}
      </TouchableOpacity>

      <View style={qa.divider}>
        <View style={qa.dividerLine} />
        <Txt style={qa.dividerTxt}>or describe it</Txt>
        <View style={qa.dividerLine} />
      </View>

      <View style={qa.inputRow}>
        <TextInput
          ref={inputRef}
          style={qa.input}
          placeholder="e.g. 2 rotis with dal"
          placeholderTextColor={Colors.secondary}
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[qa.sendBtn, !canSubmit && qa.sendBtnDisabled]}
          onPress={onSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          {looking
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />}
        </TouchableOpacity>
      </View>

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={qa.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {chips.map(({ text, cached }, i) => (
            <TouchableOpacity
              key={`${text}-${i}`}
              style={[qa.chip, cached && qa.chipRecent]}
              onPress={() => onPickRecent(text, cached)}
              activeOpacity={0.75}
            >
              {cached && <View style={qa.chipDot} />}
              <Txt style={[qa.chipTxt, cached && qa.chipTxtRecent]} numberOfLines={1}>{text}</Txt>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Confirmation step after a text lookup, before anything is written. */
function ResultCard({
  result, selectedType, onSelectType, onConfirm, onDiscard, confirming,
}: {
  result:       NutritionResult;
  selectedType: MealType;
  onSelectType: (t: MealType) => void;
  onConfirm:    () => void;
  onDiscard:    () => void;
  confirming:   boolean;
}) {
  const slide   = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide,   { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[rc.card, { opacity, transform: [{ translateY: slide }] }]}>
      <View style={rc.headRow}>
        <View style={rc.foundBadge}>
          <Sparkles size={11} color={Colors.accent} strokeWidth={2.5} />
          <Txt style={rc.foundTxt}>Found it</Txt>
        </View>
        <TouchableOpacity onPress={onDiscard} hitSlop={10} style={rc.closeBtn}>
          <X size={17} color={Colors.secondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <Txt style={rc.name}>{result.name}</Txt>
      <Txt style={rc.serving}>{result.serving}</Txt>

      <View style={rc.macroRow}>
        <Macro value={`${result.calories}`} label="kcal"    color={Colors.accent} big />
        <View style={rc.div} />
        <Macro value={`${result.protein}g`} label="protein" color="#5B8DB8" />
        <View style={rc.div} />
        <Macro value={`${result.carbs}g`}   label="carbs"   color="#E6A817" />
        <View style={rc.div} />
        <Macro value={`${result.fat}g`}     label="fat"     color="#9B59B6" />
      </View>

      <Txt style={rc.typeLabel}>Log as</Txt>
      <View style={rc.typeRow}>
        {MEAL_TYPES.map((t) => {
          const active = selectedType === t;
          return (
            <TouchableOpacity
              key={t}
              style={[rc.typePill, active && { backgroundColor: MEAL_COLOR[t] + '15', borderColor: MEAL_COLOR[t] }]}
              onPress={() => { haptic.light(); onSelectType(t); }}
              activeOpacity={0.75}
            >
              <Txt style={rc.typeEmoji}>{MEAL_EMOJI[t]}</Txt>
              <Txt style={[rc.typeTxt, active && { color: MEAL_COLOR[t], fontWeight: '700' }]}>
                {MEAL_LABEL[t]}
              </Txt>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[rc.confirmBtn, confirming && rc.confirmBtnLoading]}
        onPress={onConfirm}
        activeOpacity={0.88}
        disabled={confirming}
      >
        {confirming
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <>
              <Check size={17} color="#FFFFFF" strokeWidth={3} />
              <Txt style={rc.confirmTxt} numberOfLines={1}>Add to today</Txt>
            </>}
      </TouchableOpacity>
    </Animated.View>
  );
}

function Macro({ value, label, color, big }: { value: string; label: string; color: string; big?: boolean }) {
  return (
    <View style={rc.macro}>
      <Txt style={[rc.macroVal, { color }, big && rc.macroValBig]}>{value}</Txt>
      <Txt style={rc.macroLabel}>{label}</Txt>
    </View>
  );
}

const qa = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cardFocused: { borderColor: Colors.accent },

  headRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sparkWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  headTxt:   { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 19 },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: BorderRadius.md, backgroundColor: Colors.accent,
  },
  scanTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  dividerTxt:  { fontSize: 11, color: Colors.secondary, fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, fontSize: 15, fontWeight: '500', color: Colors.primary,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sendBtn:         { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.border },

  chipRow:       { gap: 8, paddingVertical: 2 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.background, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  chipRecent:    { backgroundColor: Colors.accentLight },
  chipDot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
  chipTxt:       { fontSize: 12.5, fontWeight: '600', color: Colors.secondary, maxWidth: 190 },
  chipTxtRecent: { color: Colors.accent },
});

const rc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: Colors.accent + '40',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 14, elevation: 5,
  },
  headRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foundBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  foundTxt:   { fontSize: 10.5, fontWeight: '800', color: Colors.accent, letterSpacing: 0.4, textTransform: 'uppercase' },
  closeBtn:   { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  name:    { fontSize: 19, fontWeight: '800', color: Colors.primary, lineHeight: 25, letterSpacing: -0.3 },
  serving: { fontSize: 12.5, color: Colors.secondary, lineHeight: 17, marginTop: -6 },

  macroRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 14, paddingVertical: 13, marginTop: 2 },
  macro:       { flex: 1, alignItems: 'center', gap: 2 },
  macroVal:    { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  macroValBig: { fontSize: 19, lineHeight: 25 },
  macroLabel:  { fontSize: 10.5, color: Colors.secondary, fontWeight: '500', lineHeight: 14 },
  div:         { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: Colors.border },

  typeLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },
  typeRow:   { flexDirection: 'row', gap: 6 },
  typePill:  { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typeEmoji: { fontSize: 16, lineHeight: 20 },
  typeTxt:   { fontSize: 10.5, fontWeight: '600', color: Colors.secondary, lineHeight: 14 },

  confirmBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, backgroundColor: Colors.accent, borderRadius: 15, marginTop: 4 },
  confirmBtnLoading: { opacity: 0.7 },
  // numberOfLines={1} on the label plus flexShrink:0 here: without it the
  // text wraps inside the fixed-height button and gets clipped mid-word.
  confirmTxt:        { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20, flexShrink: 0 },
});
