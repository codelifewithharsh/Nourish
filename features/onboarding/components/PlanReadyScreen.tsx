import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing as REasing,
} from 'react-native-reanimated';
import Reanimated from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import { Crown, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { useProPricing } from '@/features/pro';
import { NutritionTargets, Goal, CuisinePreference, DietType, Restriction } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanReadyScreenProps {
  targets: NutritionTargets;
  goal: Goal;
  cuisines: CuisinePreference[];
  dietType: DietType;
  restrictions: Restriction[];
  weightKg: number;
  userName?: string;
  onGetStarted: () => void;
  saving?: boolean;
  saveError?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPersonalisedLine(goal: Goal, cuisines: CuisinePreference[], dietType: DietType): string {
  const cuisine = cuisines.length > 0
    ? cuisines[0].replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Indian';
  const diet = dietType === 'pure_veg' ? 'vegetarian'
    : dietType === 'vegan' ? 'vegan'
    : dietType === 'eggetarian' ? 'eggetarian'
    : 'non-vegetarian';
  const goalLabel = goal === 'muscle_gain' ? 'build muscle'
    : goal === 'fat_loss' ? 'lose fat'
    : 'stay healthy';
  return `Built for a ${cuisine} ${diet} aiming to ${goalLabel}`;
}

function getMealsCardBody(
  cuisines: CuisinePreference[],
  dietType: DietType,
  restrictions: Restriction[],
): string {
  const cuisineLabels: Record<CuisinePreference, string> = {
    north_indian: 'North Indian', south_indian: 'South Indian',
    continental: 'Continental', indian_fusion: 'Indian Fusion', indo_chinese: 'Indo-Chinese',
  };
  const cuisineStr = cuisines.length >= 2
    ? `${cuisineLabels[cuisines[0]]} & ${cuisineLabels[cuisines[1]]}`
    : cuisines.length === 1 ? cuisineLabels[cuisines[0]] : 'Indian';

  const dietStr = dietType === 'pure_veg' ? 'pure veg'
    : dietType === 'vegan' ? 'vegan'
    : dietType === 'eggetarian' ? 'eggetarian'
    : 'non-veg';

  const restrictionLabels: Partial<Record<Restriction, string>> = {
    onion_garlic: 'no onion-garlic', dairy: 'dairy-free',
    gluten: 'gluten-free', peanuts: 'no peanuts',
  };
  const firstRestriction = restrictions.length > 0 ? restrictionLabels[restrictions[0]] : null;
  const suffix = firstRestriction ? `, ${firstRestriction}` : '';

  return `3 meals daily — ${cuisineStr}, ${dietStr}${suffix}`;
}

// ─── Phase 1 — Loading ────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done';

const STEP_TEXTS = [
  'Analyzing your profile',
  'Calculating your macros',
  'Building your meal plan',
  'Adding finishing touches',
];

const STEP_ACTIVATE_MS = [0, 800, 1600, 2400];

function PulsingEmoji() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 600, easing: REasing.inOut(REasing.ease) }),
        withTiming(1.0, { duration: 600, easing: REasing.inOut(REasing.ease) }),
      ),
      -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View style={[{ marginBottom: 32 }, animStyle]}>
      <Text style={ls.emoji}>🌱</Text>
    </Reanimated.View>
  );
}

function PulsingDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 600, easing: REasing.inOut(REasing.ease) }),
        withTiming(1.0, { duration: 600, easing: REasing.inOut(REasing.ease) }),
      ),
      -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Reanimated.View style={[ls.iconActiveDot, animStyle]} />;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return (
    <View style={ls.iconDone}><Text style={ls.iconCheck}>✓</Text></View>
  );
  if (status === 'active') return <PulsingDot />;
  return <View style={ls.iconPending} />;
}

function LoadingPhase({ onComplete }: { onComplete: () => void }) {
  const [statuses, setStatuses] = useState<StepStatus[]>(['active', 'pending', 'pending', 'pending']);
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t0 = setTimeout(() => {
      Animated.timing(labelOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 200);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < STEP_ACTIVATE_MS.length; i++) {
      const idx = i;
      timers.push(setTimeout(() => {
        setStatuses((prev) => {
          const next = [...prev] as StepStatus[];
          next[idx - 1] = 'done';
          next[idx] = 'active';
          return next;
        });
      }, STEP_ACTIVATE_MS[idx]));
    }

    const tDone = setTimeout(() => {
      setStatuses(['done', 'done', 'done', 'done']);
    }, 3000);

    Animated.timing(progressWidth, {
      toValue: 220, duration: 3000, easing: Easing.linear, useNativeDriver: false,
    }).start();

    const tComplete = setTimeout(onComplete, 3000);
    return () => {
      clearTimeout(t0); clearTimeout(tDone); clearTimeout(tComplete);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <View style={ls.container}>
      <PulsingEmoji />
      <Animated.Text style={[ls.aiLabel, { opacity: labelOpacity }]}>
        Nourish is analyzing...
      </Animated.Text>
      <View style={ls.steps}>
        {STEP_TEXTS.map((text, i) => (
          <View key={text} style={ls.stepRow}>
            <StepIcon status={statuses[i]} />
            <Text style={[
              ls.stepText,
              statuses[i] === 'active' && ls.stepTextActive,
              statuses[i] === 'done'   && ls.stepTextDone,
            ]}>
              {text}
            </Text>
          </View>
        ))}
      </View>
      <View style={ls.progressTrack}>
        <Animated.View style={[ls.progressFill, { width: progressWidth }]} />
      </View>
    </View>
  );
}

// ─── FadeBlock ────────────────────────────────────────────────────────────────

function FadeBlock({ delay, children, style }: {
  delay: number; children: React.ReactNode; style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Google / Apple SVGs ──────────────────────────────────────────────────────

// ─── Phase 2 — Results ────────────────────────────────────────────────────────

function ResultsPhase({ targets, goal, cuisines, dietType, restrictions, userName, onGetStarted, saving, saveError }: PlanReadyScreenProps) {
  const insets  = useSafeAreaInsets();
  const pricing = useProPricing();
  const celebScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
  }, []);

  const personalisedLine = getPersonalisedLine(goal, cuisines, dietType);
  const mealsBody = getMealsCardBody(cuisines, dietType, restrictions);

  return (
    <View style={rs.root}>
      <Animated.ScrollView
        style={rs.scroll}
        contentContainerStyle={[rs.container, { paddingTop: insets.top + 8, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Lottie + title + subtitle ── */}
        <View style={rs.header}>
          <Animated.View style={{ transform: [{ scale: celebScale }] }}>
            <LottieView
              source={require('@/assets/lottie/ai_loading.json')}
              style={rs.lottie}
              autoPlay
              loop
            />
          </Animated.View>
          <FadeBlock delay={0}>
            <Txt style={rs.title}>Your plan is ready{userName ? `, ${userName.split(' ')[0]}` : ''}!</Txt>
          </FadeBlock>
          <FadeBlock delay={150}>
            <Txt style={rs.subtitle} numberOfLines={2}>{personalisedLine}</Txt>
          </FadeBlock>
        </View>

        {/* ── 3 Value Cards ── */}
        <FadeBlock delay={300} style={rs.cards}>
          <View style={[rs.valueCard, rs.borderGreen]}>
            <View style={rs.cardTopRow}>
              <Txt style={rs.cardEmoji}>🍽️</Txt>
              <Txt style={rs.cardTitle}>Your meals, planned</Txt>
            </View>
            <Txt style={rs.cardBody}>{mealsBody}</Txt>
          </View>

          <View style={[rs.valueCard, rs.borderAmber]}>
            <View style={rs.cardTopRow}>
              <Txt style={rs.cardEmoji}>🎯</Txt>
              <Txt style={rs.cardTitle}>Your targets, calculated</Txt>
            </View>
            <Txt style={rs.cardBody}>
              {targets.dailyCalories.toLocaleString()} kcal · {targets.dailyProtein}g protein — built for your body and goal
            </Txt>
          </View>

          <View style={[rs.valueCard, rs.borderPurple]}>
            <View style={rs.cardTopRow}>
              <Txt style={rs.cardEmoji}>🧠</Txt>
              <Txt style={rs.cardTitle}>Your AI coach</Txt>
            </View>
            <Txt style={rs.cardBody}>
              Smart nudges, meal swaps, and insights that adapt to your progress
            </Txt>
          </View>
        </FadeBlock>

        {/* ── Early Bird Pro reward card ── */}
        <FadeBlock delay={650}>
          <View style={rs.proCard}>
            <View style={rs.proGlow} />
            <View style={rs.proHeader}>
              <View style={rs.proCrownWrap}>
                <Crown size={14} color={Colors.accent} strokeWidth={2.6} fill={Colors.accent} fillOpacity={0.4} />
              </View>
              <View style={rs.proEyebrowWrap}>
                <Sparkles size={9} color={Colors.accent} strokeWidth={2.6} fill={Colors.accent} fillOpacity={0.35} />
                <Txt style={rs.proEyebrow}>EARLY BIRD PRO</Txt>
              </View>
            </View>
            <Txt style={rs.proTitle}>You're in. Pro is on us.</Txt>
            <Txt style={rs.proBody}>
              Every AI feature — meal plans, recipes, swaps, food lookup — yours, free. No timer, no catch.
            </Txt>
            <View style={rs.proValueRow}>
              <Txt style={rs.proValueNormal}>Normally {pricing.normalPrice}</Txt>
              <View style={rs.proValueDot} />
              <Txt style={rs.proValueFree}>{pricing.userPrice} for you</Txt>
            </View>
          </View>
        </FadeBlock>

      </Animated.ScrollView>

      {/* ── Fixed footer CTA ── */}
      <FadeBlock delay={600} style={[rs.footer, { paddingBottom: insets.bottom + 16 }]}>
        {saveError && <Txt style={rs.errorTxt}>{saveError}</Txt>}
        <TouchableOpacity
          style={[rs.btnStart, saving && rs.btnStartLoading]}
          activeOpacity={0.85}
          onPress={onGetStarted}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Txt style={rs.btnStartText}>{saveError ? 'Try again' : "Let's Go 🌱"}</Txt>
          }
        </TouchableOpacity>
      </FadeBlock>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlanReadyScreen(props: PlanReadyScreenProps) {
  const [showResults, setShowResults] = useState(false);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;

  const handleLoadingComplete = () => {
    Animated.timing(loadingOpacity, {
      toValue: 0, duration: 500, useNativeDriver: true,
    }).start(() => {
      setShowResults(true);
      Animated.timing(resultsOpacity, {
        toValue: 1, duration: 500, useNativeDriver: true,
      }).start();
    });
  };

  return (
    <View style={gs.root}>
      {!showResults && (
        <Animated.View style={[StyleSheet.absoluteFill, gs.loadingLayer, { opacity: loadingOpacity }]}>
          <LoadingPhase onComplete={handleLoadingComplete} />
        </Animated.View>
      )}
      {showResults && (
        <Animated.View style={[StyleSheet.absoluteFill, gs.resultsLayer, { opacity: resultsOpacity }]}>
          <ResultsPhase {...props} />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#1A3A2A' },
  loadingLayer: { backgroundColor: '#1A3A2A' },
  resultsLayer: { backgroundColor: Colors.background },
});

const ls = StyleSheet.create({
  container:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emoji:         { fontSize: 80, lineHeight: 96, textAlign: 'center' },
  aiLabel:       { fontSize: 18, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', lineHeight: 26, marginBottom: 28 },
  steps:         { width: 240, gap: 14, marginBottom: 32 },
  stepRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconPending:   { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  iconActiveDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' },
  iconDone:      { width: 16, height: 16, borderRadius: 8, backgroundColor: '#4CAF82', alignItems: 'center', justifyContent: 'center' },
  iconCheck:     { fontSize: 9, lineHeight: 12, color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  stepText:      { fontSize: 14, color: 'rgba(255,255,255,0.3)', lineHeight: 20 },
  stepTextActive:{ color: '#FFFFFF', fontWeight: '600' },
  stepTextDone:  { color: 'rgba(255,255,255,0.5)' },
  progressTrack: { width: 220, height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 999 },
});

const rs = StyleSheet.create({
  root:      { flex: 1 },
  scroll:    { flex: 1 },
  container: { paddingHorizontal: 24 },

  // Header
  header:   { alignItems: 'center', marginBottom: 20 },
  lottie:   { width: 110, height: 110 },
  title:    { fontSize: 26, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginTop: 8, lineHeight: 34 },
  subtitle: { fontSize: 14, color: Colors.secondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // Value cards
  cards:       { gap: 10, marginBottom: 20 },
  valueCard:   { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderLeftWidth: 4, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  borderGreen: { borderLeftColor: Colors.accent },
  borderAmber: { borderLeftColor: '#E6A817' },
  borderPurple:{ borderLeftColor: '#7B5EA7' },
  cardTopRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardEmoji:   { fontSize: 20, lineHeight: 26 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: Colors.primary, lineHeight: 21 },
  cardBody:    { fontSize: 13, color: Colors.secondary, lineHeight: 19 },

  // Early Bird Pro reward card
  proCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(45,106,79,0.18)',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  proGlow: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: Colors.accentLight,
    top: -100, right: -80,
    opacity: 0.7,
  },
  proHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  proCrownWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  proEyebrowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.accent,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  proEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    lineHeight: 12,
  },
  proTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.primary,
    lineHeight: 22,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  proBody: {
    fontSize: 13,
    color: Colors.secondary,
    lineHeight: 19,
    fontWeight: '500',
    marginBottom: 10,
  },
  proValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proValueNormal: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.secondary,
    textDecorationLine: 'line-through',
    lineHeight: 14,
  },
  proValueDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: Colors.secondary,
    opacity: 0.5,
  },
  proValueFree: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.accent,
    letterSpacing: 0.2,
    lineHeight: 15,
  },

  // CTA
  footer:       { paddingHorizontal: 24, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  btnStart:        { alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, backgroundColor: Colors.accent },
  btnStartLoading: { opacity: 0.75 },
  btnStartText:    { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 },
  errorTxt:        { fontSize: 13, color: '#E05C2A', textAlign: 'center', lineHeight: 18, marginBottom: 6 },
});
