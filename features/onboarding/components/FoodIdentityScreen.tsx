import React, { useRef, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { CuisinePreference, DietType, Restriction } from '../types';

const CUISINES: { value: CuisinePreference; emoji: string; label: string }[] = [
  { value: 'north_indian',  emoji: '🍲', label: 'North Indian' },
  { value: 'south_indian',  emoji: '🥘', label: 'South Indian' },
  { value: 'continental',   emoji: '🌍', label: 'Continental' },
  { value: 'indian_fusion', emoji: '🫕', label: 'Indian Fusion' },
  { value: 'indo_chinese',  emoji: '🍜', label: 'Indo-Chinese' },
];

const DIET_TYPES: { value: DietType; emoji: string; label: string }[] = [
  { value: 'pure_veg',    emoji: '🌱', label: 'Pure Veg' },
  { value: 'vegan',       emoji: '🥦', label: 'Vegan' },
  { value: 'eggetarian',  emoji: '🥚', label: 'Eggetarian' },
  { value: 'non_veg',     emoji: '🍗', label: 'Non Veg' },
];

const RESTRICTIONS: { value: Restriction; emoji: string; label: string }[] = [
  { value: 'onion_garlic', emoji: '🧅', label: 'Onion & Garlic' },
  { value: 'dairy',        emoji: '🥛', label: 'Dairy' },
  { value: 'gluten',       emoji: '🌾', label: 'Gluten' },
  { value: 'peanuts',      emoji: '🥜', label: 'Peanuts' },
  { value: 'spicy',        emoji: '🌶️', label: 'Spicy' },
  { value: 'mushroom',     emoji: '🍄', label: 'Mushroom' },
  { value: 'soy',          emoji: '🫘', label: 'Soy' },
  { value: 'sugar',        emoji: '💊', label: 'Sugar' },
];

const FOOD_FACTS = [
  '🥗 Your food identity shapes every suggestion',
  '🌱 Plant-based diets are scientifically powerful',
  '💪 Indian cuisine is naturally macro-balanced',
  '⚡ Personalized meals = better results, faster',
];

function RotatingFactChip() {
  const [displayIndex, setDisplayIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setDisplayIndex((prev) => (prev + 1) % FOOD_FACTS.length);
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [opacity]);

  return (
    <Animated.View style={[styles.factChip, { opacity }]}>
      <Txt style={styles.factText}>{FOOD_FACTS[displayIndex]}</Txt>
    </Animated.View>
  );
}

interface FoodIdentityScreenProps {
  cuisines: CuisinePreference[];
  dietType: DietType;
  restrictions: Restriction[];
  onCuisineToggle: (c: CuisinePreference) => void;
  onDietTypeSelect: (d: DietType) => void;
  onRestrictionToggle: (r: Restriction) => void;
  onContinue: () => void;
}

function Chip({
  emoji, label, selected, onPress, diet = false,
}: { emoji?: string; label: string; selected: boolean; onPress: () => void; diet?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, selected && styles.chipSelected, diet && styles.chipDiet]}
    >
      {emoji ? <Txt style={[styles.chipEmoji, diet && styles.chipEmojiDiet]}>{emoji}</Txt> : null}
      <Txt style={[styles.chipText, selected && styles.chipTextSelected, diet && styles.chipTextDiet]}>{label}</Txt>
    </TouchableOpacity>
  );
}

export function FoodIdentityScreen({
  cuisines, dietType, restrictions,
  onCuisineToggle, onDietTypeSelect, onRestrictionToggle,
  onContinue,
}: FoodIdentityScreenProps) {
  const canContinue = cuisines.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Txt style={styles.title}>Your food identity 🥗</Txt>
      <Txt style={styles.subtitle}>We'll suggest meals you'll actually enjoy</Txt>

      {/* Section 1 — Cuisine */}
      <View style={styles.section}>
        <Txt style={styles.sectionLabel}>CUISINE PREFERENCE</Txt>
        <View style={styles.chipRow}>
          {CUISINES.map((c) => (
            <Chip
              key={c.value}
              emoji={c.emoji}
              label={c.label}
              selected={cuisines.includes(c.value)}
              onPress={() => onCuisineToggle(c.value)}
            />
          ))}
        </View>
      </View>

      {/* Section 2 — Diet Type */}
      <View style={styles.section}>
        <Txt style={styles.sectionLabel}>DIET TYPE</Txt>
        <View style={styles.chipRowSingle}>
          {DIET_TYPES.map((d) => (
            <Chip
              key={d.value}
              emoji={d.emoji}
              label={d.label}
              selected={dietType === d.value}
              onPress={() => onDietTypeSelect(d.value)}
              diet
            />
          ))}
        </View>
      </View>

      {/* Section 3 — Restrictions */}
      <View style={styles.section}>
        <View style={styles.sectionLabelRow}>
          <Txt style={styles.sectionLabel}>ANYTHING TO AVOID?</Txt>
          <Txt style={styles.optionalLabel}> optional</Txt>
        </View>
        <View style={styles.chipRow}>
          {RESTRICTIONS.map((r) => (
            <Chip
              key={r.value}
              emoji={r.emoji}
              label={r.label}
              selected={restrictions.includes(r.value)}
              onPress={() => onRestrictionToggle(r.value)}
            />
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.factRow}>
          <RotatingFactChip />
        </View>
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={onContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
        >
          <Txt style={styles.continueBtnText}>Continue</Txt>
        </TouchableOpacity>
        <Txt style={styles.footerNote}>🔒 Your preferences shape every meal suggestion</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
    lineHeight: 32,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 20,
    lineHeight: 20,
    includeFontPadding: false,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.secondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  optionalLabel: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chipRowSingle: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 5,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accentLight,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipDiet: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 1,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
  },
  chipEmoji: {
    fontSize: 13,
    lineHeight: 17,
  },
  chipEmojiDiet: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent,
    includeFontPadding: false,
  },
  chipTextDiet: {
    fontSize: 11,
  },
  chipTextSelected: {
    color: Colors.surface,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 8,
    gap: 10,
  },
  factRow: {
    alignItems: 'center',
  },
  factChip: {
    backgroundColor: Colors.accentLight,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  factText: {
    fontSize: 12,
    color: Colors.accent,
    textAlign: 'center',
  },
  continueBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.surface,
  },
  footerNote: {
    fontSize: 12,
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
