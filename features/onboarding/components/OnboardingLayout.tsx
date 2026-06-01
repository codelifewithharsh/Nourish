import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';

const TOTAL_STEPS = 5;

interface OnboardingLayoutProps {
  step: number;
  showSkip?: boolean;
  onBack: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
}

export function OnboardingLayout({
  step,
  showSkip = false,
  onBack,
  onSkip,
  children,
}: OnboardingLayoutProps) {
  const progress = step >= 4 ? 1 : step / (TOTAL_STEPS - 1);

  // Step 5 is a full-bleed screen — no nav, no progress bar, transparent wrapper
  if (step === 5) {
    return (
      <View style={styles.fullBleed}>
        {children}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top row: back + skip */}
      <View style={styles.topRow}>
        {step > 1 ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={24} color={Colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        {showSkip && onSkip ? (
          <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
            <Txt style={styles.skipText}>Skip</Txt>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullBleed: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 14,
    color: Colors.secondary,
  },
  skipPlaceholder: {
    width: 36,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.accentLight,
    marginHorizontal: 20,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
});
