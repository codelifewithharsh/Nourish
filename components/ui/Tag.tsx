import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { Txt } from './Typography';

interface TagProps {
  label: string;
  variant?: 'default' | 'accent';
}

export function Tag({ label, variant = 'default' }: TagProps) {
  const isAccent = variant === 'accent';
  return (
    <View
      style={[
        styles.tag,
        isAccent ? styles.tagAccent : styles.tagDefault,
      ]}
    >
      <Txt
        variant="labelBold"
        color={isAccent ? Colors.accent : Colors.secondary}
      >
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  tagDefault: {
    backgroundColor: Colors.background,
  },
  tagAccent: {
    backgroundColor: Colors.accentLight,
  },
});
