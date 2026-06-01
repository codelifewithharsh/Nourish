import { useState, useEffect, useCallback } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X, ChefHat, Sparkles, Calendar, RefreshCw, Heart,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    n: '01',
    icon: ChefHat,
    title: 'You tell us about you',
    body: "Your goal, body, diet style, cuisines you love, what you'd never eat — and what's in your kitchen.",
  },
  {
    n: '02',
    icon: Sparkles,
    title: 'AI builds your plan',
    body: 'A 7-day rotation of meals tuned to your calories and protein — using ingredients you already have, in cuisines you actually enjoy.',
  },
  {
    n: '03',
    icon: Calendar,
    title: 'You log what you eat',
    body: "Stick to the plan, or log something else with a quick AI lookup. Every meal counts toward today's targets — and your streak.",
  },
  {
    n: '04',
    icon: RefreshCw,
    title: 'The plan adapts',
    body: 'Update your weight, swap a meal, add ingredients — and your next plan reflects it. Your taste, your pace.',
  },
];

export function HowItWorksModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
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
        runOnJS(setModalMounted)(false);
        runOnJS(onClose)();
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

  return (
    <Modal visible={modalMounted || visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <FullWindowOverlay>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdropColor, backdropStyle]} />
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <Reanimated.View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
            <View style={s.handle} />

            {/* Header */}
            <View style={s.header}>
              <View style={s.headerInfo}>
                <View style={s.eyebrowRow}>
                  <Heart size={11} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} />
                  <Txt style={s.eyebrow}>HOW SATVA WORKS</Txt>
                </View>
                <Txt style={s.title}>The plan behind your plan</Txt>
                <Txt style={s.subtitle}>
                  No calorie counting. No food shame. Just a thoughtful loop that adapts to you.
                </Txt>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={dismiss} activeOpacity={0.7} hitSlop={10}>
                <X size={18} color={Colors.secondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={s.scroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                const isLast = i === STEPS.length - 1;
                return (
                  <View key={step.n} style={s.stepWrap}>
                    <View style={s.stepLeft}>
                      <View style={s.stepIconWrap}>
                        <Icon size={16} color={Colors.accent} strokeWidth={2.2} />
                      </View>
                      {!isLast && <View style={s.connector} />}
                    </View>
                    <View style={s.stepBody}>
                      <Txt style={s.stepNum}>{step.n}</Txt>
                      <Txt style={s.stepTitle}>{step.title}</Txt>
                      <Txt style={s.stepText}>{step.body}</Txt>
                    </View>
                  </View>
                );
              })}

              {/* Closing note */}
              <View style={s.outro}>
                <Txt style={s.outroTitle}>Built around how Indians actually eat</Txt>
                <Txt style={s.outroBody}>
                  Roti, rice, dal, sabzi — not chicken breast and quinoa salads. Satva plans meals you'd
                  cook anyway, with portions that match your goal.
                </Txt>
              </View>
            </ScrollView>
          </Reanimated.View>
        </View>
      </FullWindowOverlay>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdropColor: { backgroundColor: 'rgba(0,0,0,0.45)' },
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  sheet:         { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12, maxHeight: '90%' },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 14 },

  // Header
  header:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  headerInfo:    { flex: 1, gap: 6 },
  eyebrowRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  eyebrow:       { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.8, lineHeight: 12 },
  title:         { fontSize: 22, fontWeight: '800', color: Colors.primary, lineHeight: 28, letterSpacing: -0.4 },
  subtitle:      { fontSize: 13, color: Colors.secondary, lineHeight: 18, fontWeight: '500', marginTop: 2 },
  closeBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  scroll:        { gap: 0, paddingBottom: 8 },

  // Steps
  stepWrap:      { flexDirection: 'row', gap: 14 },
  stepLeft:      { width: 32, alignItems: 'center' },
  stepIconWrap:  { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  connector:     { width: 1.5, flex: 1, backgroundColor: Colors.accentLight, marginTop: 4, marginBottom: 4, minHeight: 18 },
  stepBody:      { flex: 1, paddingBottom: 22, gap: 4 },
  stepNum:       { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 1, lineHeight: 13 },
  stepTitle:     { fontSize: 15, fontWeight: '800', color: Colors.primary, lineHeight: 20, letterSpacing: -0.2 },
  stepText:      { fontSize: 13, color: Colors.secondary, lineHeight: 19, fontWeight: '500', marginTop: 2 },

  // Outro
  outro:         { backgroundColor: Colors.accentLight, borderRadius: 14, padding: 14, gap: 4, marginTop: 4 },
  outroTitle:    { fontSize: 13, fontWeight: '800', color: Colors.accent, lineHeight: 18, letterSpacing: -0.1 },
  outroBody:     { fontSize: 12, color: Colors.primary, lineHeight: 17, fontWeight: '500' },
});
