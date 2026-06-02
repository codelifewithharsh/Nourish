import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { NutritionTargets, Goal, CuisinePreference, DietType, Restriction } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanReadyScreenProps {
  targets: NutritionTargets;
  goal: Goal;
  cuisines: CuisinePreference[];
  dietType: DietType;
  restrictions: Restriction[];
  weightKg: number;
  onGetStarted: () => void;
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
        PulseAI is analyzing...
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

function ResultsPhase({ targets, goal, cuisines, dietType, restrictions, onGetStarted }: PlanReadyScreenProps) {
  const insets = useSafeAreaInsets();
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
            <Txt style={rs.title}>Your plan is ready, Harsh!</Txt>
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

        {/* ── Day 1 preview card ── */}
        <FadeBlock delay={500}>
          <View style={rs.previewCard}>
            <Txt style={rs.previewTop}>Tomorrow starts with...</Txt>
            <Txt style={rs.previewMeal}>🍳 Masala Oats with Vegetables · 14g protein</Txt>
            <Txt style={rs.previewMore}>+ 2 more meals planned for your day</Txt>
          </View>
        </FadeBlock>

      </Animated.ScrollView>

      {/* ── Fixed footer CTA ── */}
      <FadeBlock delay={600} style={[rs.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={rs.btnStart}
          activeOpacity={0.85}
          onPress={onGetStarted}
        >
          <Txt style={rs.btnStartText}>Let's Go 🌱</Txt>
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

  // Day 1 preview card
  previewCard: { backgroundColor: Colors.accentLight, borderRadius: 14, padding: 14, marginTop: 16, gap: 4 },
  previewTop:  { fontSize: 12, color: Colors.secondary, lineHeight: 16 },
  previewMeal: { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 20 },
  previewMore: { fontSize: 12, color: Colors.accent, lineHeight: 16 },

  // CTA
  footer:       { paddingHorizontal: 24, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  btnStart:     { alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, backgroundColor: Colors.accent },
  btnStartText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 },
});
