import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  Animated, Easing, Switch, ScrollView,
} from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, ArrowUp, X, Check, Lightbulb } from 'lucide-react-native';
import { haptic } from '@/lib/haptics';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { useAI } from '@/features/credits/CreditsContext';
import { COST } from '@/features/credits/costs';
import { AIError } from '@/lib/aiClient';

// ─── Types ─────────────────────────────────────────────────────────────────

type Mood = 'light' | 'hearty' | 'quick' | 'balanced';

export interface SwapResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  visible: boolean;
  mealType: string;
  currentMealName: string;
  // Confirm receives the meal + whether to also persist into the plan
  onConfirm: (meal: SwapResult, updatePlan: boolean) => void;
  onCancel: () => void;
}

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: 'light',    emoji: '🥗', label: 'Lighter' },
  { key: 'hearty',   emoji: '💪', label: 'Hearty'  },
  { key: 'quick',    emoji: '⚡', label: 'Quick'   },
  { key: 'balanced', emoji: '⚖️', label: 'Balanced' },
];

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
  snack:     '🍎',
};

// ─── Component ─────────────────────────────────────────────────────────────

export function SwapMealModal({ visible, mealType, currentMealName, onConfirm, onCancel }: Props) {
  const insets = useSafeAreaInsets();

  // Freeze displayed values while the dismiss animation plays out.
  // Parent clears mealType/currentMealName as soon as visible→false,
  // but the slide-down takes ~300ms — without this the text flickers.
  const frozenMealType = useRef(mealType);
  const frozenMealName = useRef(currentMealName);
  if (visible) {
    frozenMealType.current = mealType;
    frozenMealName.current = currentMealName;
  }
  const displayMealType = frozenMealType.current;
  const displayMealName = frozenMealName.current;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(SwapResult & { reason?: string; serving?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatePlan, setUpdatePlan] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [modalMounted, setModalMounted] = useState(false);
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const inputRef = useRef<TextInput>(null);
  const invoke = useAI();

  const aiErrorMsg = (err: unknown, fallback: string) =>
    err instanceof AIError
      ? (err.code === 'no_credits'   ? "You're out of credits — comes back tomorrow."
      :  err.code === 'rate_limited' ? 'Daily limit reached. Try again tomorrow.'
      :  fallback)
      : fallback;

  // Reanimated sheet + backdrop
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const reset = () => {
    setQuery('');
    setResult(null);
    setError(null);
    setLoading(false);
    setUpdatePlan(false);
    setInputFocused(false);
    setModalMounted(false);
    setSelectedMood(null);
  };

  const dismiss = useCallback(() => {
    'worklet';
    translateY.value = withTiming(600, { duration: 200 });
    backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        runOnJS(reset)();
        runOnJS(onCancel)();
      }
    });
  }, [onCancel]);

  const handleClose = useCallback(() => {
    dismiss();
  }, [dismiss]);

  useEffect(() => {
    if (visible) {
      setModalMounted(true);
      translateY.value = 600;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 22, stiffness: 280, mass: 0.8 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [visible]);

  // Sparkle pulse
  const sparklePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      sparklePulse.stopAnimation();
      sparklePulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, { toValue: 1.15, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sparklePulse, { toValue: 1,    duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);

  // Mood-based swap from the plan (calls swap-meal edge function)
  const handleMoodSwap = async (mood: Mood) => {
    setLoading(true);
    setResult(null);
    setError(null);
    haptic.light();
    try {
      const data = await invoke<SwapResult & { reason?: string }>('swap-meal', {
        mealType:           displayMealType,
        currentMeal:        displayMealName,
        mood:               mood === 'balanced' ? null : mood,
        kitchenIngredients: null,
      });
      setResult(data);
    } catch (err) {
      setError(aiErrorMsg(err, "Couldn't fetch a swap. Try again."));
    } finally {
      setLoading(false);
    }
  };

  // Free-text lookup — uses lookup-nutrition (same as Log tab)
  const handleTextLookup = async () => {
    const text = query.trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    setError(null);
    inputRef.current?.blur();
    try {
      const data = await invoke<SwapResult & { serving?: string }>('lookup-nutrition', { query: text });
      haptic.light();
      setResult(data);
    } catch (err) {
      setError(aiErrorMsg(err, "Couldn't find that. Try describing it differently."));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    haptic.success();
    onConfirm(
      {
        name: result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
      },
      updatePlan
    );
    dismiss();
  };

  const mealLabel = displayMealType.charAt(0).toUpperCase() + displayMealType.slice(1);
  const mealEmoji = MEAL_EMOJI[displayMealType] ?? '🍽️';
  const canSubmit = query.trim().length > 0 && !loading;

  return (
    <Modal visible={modalMounted || visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <FullWindowOverlay>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdropColor, backdropStyle]} />
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayDismiss} activeOpacity={1} onPress={handleClose} />
          <Reanimated.View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Header ── */}
                <View style={s.header}>
                  <View style={s.headerLeft}>
                    <Txt style={s.headerEmoji}>{mealEmoji}</Txt>
                    <View style={s.headerInfo}>
                      <Txt style={s.headerTitle}>Swap {mealLabel}</Txt>
                      <Txt style={s.headerSub} numberOfLines={1}>Currently: {displayMealName}</Txt>
                    </View>
                  </View>
                  <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.7} hitSlop={10}>
                    <X size={18} color={Colors.secondary} strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                {!result && (
                  <>
                    {/* ── AI Hero Input ── */}
                    <View style={[s.aiCard, inputFocused && s.aiCardFocused]}>
                      <View style={s.aiTopRow}>
                        <Animated.View style={[s.sparkleWrap, { transform: [{ scale: sparklePulse }] }]}>
                          <Sparkles size={14} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} fillOpacity={0.2} />
                        </Animated.View>
                        <Txt style={s.aiLabel}>AI Nutritionist</Txt>
                        <View style={s.costChip}><Txt style={s.costChipTxt}>{COST.nutrition} cr</Txt></View>
                      </View>

                      <TextInput
                        ref={inputRef}
                        style={s.aiInput}
                        placeholder="I ate something else..."
                        placeholderTextColor={Colors.secondary}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={handleTextLookup}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        returnKeyType="search"
                        multiline
                        scrollEnabled={false}
                      />

                      <View style={s.aiBottomRow}>
                        <Txt style={s.aiHint}>
                          {loading && query ? 'Analyzing…' : "Tell me what you ate instead"}
                        </Txt>
                        <TouchableOpacity
                          style={[s.aiSubmit, !canSubmit && s.aiSubmitDisabled]}
                          onPress={handleTextLookup}
                          activeOpacity={0.85}
                          disabled={!canSubmit}
                        >
                          {loading && query
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* ── Divider ── */}
                    <View style={s.divider}>
                      <View style={s.dividerLine} />
                      <Txt style={s.dividerTxt}>or pick a vibe · {COST.swap} cr</Txt>
                      <View style={s.dividerLine} />
                    </View>

                    {/* ── Mood chips (stage only; AI fires on explicit confirm) ── */}
                    <View style={s.moodRow}>
                      {MOODS.map((m) => {
                        const active = selectedMood === m.key;
                        return (
                          <TouchableOpacity
                            key={m.key}
                            style={[s.moodChip, active && s.moodChipActive, loading && s.moodChipLoading]}
                            onPress={() => { haptic.light(); setSelectedMood(active ? null : m.key); }}
                            activeOpacity={0.75}
                            disabled={loading}
                          >
                            <Txt style={s.moodEmoji}>{m.emoji}</Txt>
                            <Txt style={[s.moodLabel, active && s.moodLabelActive]}>{m.label}</Txt>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {selectedMood && (
                      <TouchableOpacity
                        style={[s.swapCta, loading && s.swapCtaLoading]}
                        onPress={() => handleMoodSwap(selectedMood)}
                        activeOpacity={0.85}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Txt style={s.swapCtaTxt}>Finding the perfect swap…</Txt>
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} color="#FFFFFF" strokeWidth={2.5} />
                            <Txt style={s.swapCtaTxt}>Get {MOODS.find((m) => m.key === selectedMood)?.label.toLowerCase()} swap</Txt>
                            <View style={s.swapCostChip}>
                              <Txt style={s.swapCostTxt}>{COST.swap} cr</Txt>
                            </View>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {error && <Txt style={s.errorTxt}>{error}</Txt>}
                  </>
                )}

                {/* ── Result card ── */}
                {result && (
                  <View style={s.resultWrap}>
                    <View style={s.resultCard}>
                      <View style={s.resultBadge}>
                        <Sparkles size={11} color={Colors.accent} strokeWidth={2.5} />
                        <Txt style={s.resultBadgeTxt}>Found it</Txt>
                      </View>

                      <Txt style={s.resultName}>{result.name}</Txt>
                      {result.serving && <Txt style={s.resultServing}>{result.serving}</Txt>}

                      <View style={s.macroGrid}>
                        <MacroCell value={result.calories} label="kcal" color={Colors.accent} prominent />
                        <View style={s.macroDiv} />
                        <MacroCell value={`${result.protein}g`} label="protein" color="#5B8DB8" />
                        <View style={s.macroDiv} />
                        <MacroCell value={`${result.carbs}g`}   label="carbs"   color="#E6A817" />
                        <View style={s.macroDiv} />
                        <MacroCell value={`${result.fat}g`}     label="fat"     color="#9B59B6" />
                      </View>

                      {result.reason && (
                        <View style={s.reasonRow}>
                          <Lightbulb size={14} color={Colors.accent} strokeWidth={2.2} />
                          <Txt style={s.reasonTxt}>{result.reason}</Txt>
                        </View>
                      )}
                    </View>

                    {/* Update plan toggle */}
                    <TouchableOpacity
                      style={s.planToggleRow}
                      onPress={() => { setUpdatePlan(!updatePlan); haptic.light(); }}
                      activeOpacity={0.7}
                    >
                      <View style={s.planToggleLeft}>
                        <Txt style={s.planToggleTitle}>Update my plan</Txt>
                        <Txt style={s.planToggleSub}>
                          {updatePlan ? 'Will replace in your plan permanently' : 'Just for today'}
                        </Txt>
                      </View>
                      <Switch
                        value={updatePlan}
                        onValueChange={(v) => { setUpdatePlan(v); haptic.light(); }}
                        trackColor={{ false: Colors.border, true: Colors.accent }}
                        thumbColor="#FFFFFF"
                      />
                    </TouchableOpacity>

                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={s.retryBtn}
                        onPress={() => setResult(null)}
                        activeOpacity={0.8}
                      >
                        <Txt style={s.retryTxt}>Try another</Txt>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.confirmBtn}
                        onPress={handleConfirm}
                        activeOpacity={0.88}
                      >
                        <Check size={18} color="#FFFFFF" strokeWidth={3} />
                        <Txt style={s.confirmTxt}>{updatePlan ? 'Update & log' : 'Log it'}</Txt>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

            </ScrollView>
          </Reanimated.View>
        </View>
      </KeyboardAvoidingView>
      </FullWindowOverlay>
    </Modal>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MacroCell({
  value, label, color, prominent,
}: { value: number | string; label: string; color: string; prominent?: boolean }) {
  return (
    <View style={mc.wrap}>
      <Txt style={[mc.value, { color: prominent ? color : Colors.primary }, prominent && mc.valueProminent]}>
        {value}
      </Txt>
      <Txt style={mc.label}>{label}</Txt>
    </View>
  );
}

const mc = StyleSheet.create({
  wrap:           { flex: 1, alignItems: 'center', gap: 2 },
  value:          { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  valueProminent: { fontSize: 20, lineHeight: 26 },
  label:          { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },
});

// ─── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdropColor:  { backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayDismiss: { flex: 1 },
  sheet:          { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 16, maxHeight: '90%' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerEmoji: { fontSize: 28, lineHeight: 34 },
  headerInfo:  { flex: 1, gap: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.primary, lineHeight: 26, letterSpacing: -0.3 },
  headerSub:   { fontSize: 13, color: Colors.secondary, lineHeight: 18 },
  closeBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  // AI hero
  aiCard:        { backgroundColor: Colors.background, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1.5, borderColor: Colors.border, marginTop: 4 },
  aiCardFocused: { borderColor: Colors.accent, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
  aiTopRow:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sparkleWrap:   { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  aiLabel:       { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5, textTransform: 'uppercase' },
  costChip:      { marginLeft: 'auto', backgroundColor: Colors.accentLight, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 },
  costChipTxt:   { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.3, lineHeight: 13 },
  aiInput:       { fontSize: 18, fontWeight: '600', color: Colors.primary, lineHeight: 24, padding: 0, minHeight: 28, maxHeight: 72 },
  aiBottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiHint:        { flex: 1, fontSize: 11, color: Colors.secondary, lineHeight: 14 },
  aiSubmit:      { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  aiSubmitDisabled: { backgroundColor: Colors.border },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  dividerTxt:  { fontSize: 11, fontWeight: '600', color: Colors.secondary, letterSpacing: 0.3, textTransform: 'uppercase' },

  // Mood chips
  moodRow:        { flexDirection: 'row', gap: 8 },
  moodChip:       { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  moodChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  moodChipLoading:{ opacity: 0.4 },
  moodEmoji:      { fontSize: 22, lineHeight: 26 },
  moodLabel:      { fontSize: 11, fontWeight: '700', color: Colors.primary, lineHeight: 14 },
  moodLabelActive:{ color: Colors.accent },

  swapCta:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, backgroundColor: Colors.accent, borderRadius: 14, marginTop: 12 },
  swapCtaLoading: { opacity: 0.85 },
  swapCtaTxt:     { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19, letterSpacing: 0.1 },
  swapCostChip:   { backgroundColor: 'rgba(255,255,255,0.22)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  swapCostTxt:    { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3, lineHeight: 13 },

  errorTxt: { fontSize: 13, color: Colors.error, textAlign: 'center', fontWeight: '500' },

  // Result
  resultWrap:     { gap: 14, marginTop: 4 },
  resultCard:     { backgroundColor: Colors.background, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1.5, borderColor: Colors.accent + '30' },
  resultBadge:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  resultBadgeTxt: { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5, textTransform: 'uppercase' },
  resultName:     { fontSize: 20, fontWeight: '800', color: Colors.primary, lineHeight: 26, letterSpacing: -0.3 },
  resultServing:  { fontSize: 13, color: Colors.secondary, lineHeight: 18, marginTop: -4 },

  macroGrid: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, marginTop: 2 },
  macroDiv:  { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: Colors.border },

  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  reasonTxt: { flex: 1, fontSize: 13, color: Colors.secondary, lineHeight: 18 },

  // Plan toggle
  planToggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.background, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  planToggleLeft:  { flex: 1, gap: 2 },
  planToggleTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 19 },
  planToggleSub:   { fontSize: 12, color: Colors.secondary, lineHeight: 16 },

  // Actions
  actionRow:  { flexDirection: 'row', gap: 10 },
  retryBtn:   { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  retryTxt:   { fontSize: 14, fontWeight: '600', color: Colors.secondary, lineHeight: 20 },
  confirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, backgroundColor: Colors.accent, borderRadius: 14 },
  confirmTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },
});
