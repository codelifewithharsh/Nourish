import React, { useRef, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { ActivityLevel } from '../types';

interface ActivityOption {
  value: ActivityLevel;
  emoji: string;
  label: string;
  subtitle: string;
}

const OPTIONS: ActivityOption[] = [
  { value: 'sedentary',      emoji: '🪑', label: 'Mostly Sitting',  subtitle: 'Desk job, little exercise' },
  { value: 'lightly_active', emoji: '🚶', label: 'Lightly Active',  subtitle: 'Some walking, occasional workouts' },
  { value: 'very_active',    emoji: '🏋️', label: 'Very Active',     subtitle: 'Regular gym, sports, or physical work' },
];

const FACTS = [
  '⚡ Activity level affects 30% of your calorie needs',
  '🏋️ Gym goers need 25% more protein daily',
  '🚶 Even light activity boosts metabolism',
  '🪑 Desk workers can still hit their goals',
];

function RotatingFactChip() {
  const [displayIndex, setDisplayIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setDisplayIndex((prev) => (prev + 1) % FACTS.length);
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [opacity]);

  return (
    <Animated.View style={[styles.factChip, { opacity }]}>
      <Txt style={styles.factText}>{FACTS[displayIndex]}</Txt>
    </Animated.View>
  );
}

function ActivityCard({ option, selected, onPress }: {
  option: ActivityOption;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, speed: 60, bounciness: 4 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 60, bounciness: 4 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
      <Animated.View style={[styles.card, selected && styles.cardSelected, { transform: [{ scale }] }]}>
        <Txt style={styles.emoji}>{option.emoji}</Txt>
        <View style={styles.cardText}>
          <Txt style={styles.cardTitle}>{option.label}</Txt>
          <Txt style={styles.cardSubtitle}>{option.subtitle}</Txt>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

interface ActivityScreenProps {
  selected: ActivityLevel | null;
  onSelect: (level: ActivityLevel) => void;
}

export function ActivityScreen({ selected, onSelect }: ActivityScreenProps) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Txt style={styles.title}>How active are you?</Txt>
        <Txt style={styles.subtitle}>This affects your daily calorie goal</Txt>

        <View style={styles.cards}>
          {OPTIONS.map((option) => (
            <ActivityCard
              key={option.value}
              option={option}
              selected={selected === option.value}
              onPress={() => onSelect(option.value)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.factRow}>
          <RotatingFactChip />
        </View>
        <Txt style={styles.socialProof}>🌱 Joined by 12,400 Indian vegetarians</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 8,
    lineHeight: 36,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.secondary,
    marginBottom: 32,
    lineHeight: 24,
    includeFontPadding: false,
  },
  cards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    minHeight: 88,
    borderWidth: 1.5,
    borderColor: Colors.accentLight,
    gap: 16,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: Colors.accentLight,
  },
  emoji: {
    fontSize: 40,
    lineHeight: 48,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.secondary,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: Colors.accentLight,
    alignItems: 'center',
  },
  factRow: {
    alignItems: 'center',
    width: '100%',
  },
  factChip: {
    backgroundColor: Colors.accentLight,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  factText: {
    fontSize: 13,
    color: Colors.accent,
    textAlign: 'center',
  },
  socialProof: {
    fontSize: 12,
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
