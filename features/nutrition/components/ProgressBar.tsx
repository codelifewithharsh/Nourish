import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui';

interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
}

export function ProgressBar({ label, current, target, unit }: ProgressBarProps) {
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Txt variant="labelBold">{label}</Txt>
        <Txt variant="bodySm" color={Colors.secondary}>
          {current}
          <Txt variant="bodySm" color={Colors.secondary}>
            /{target}{unit}
          </Txt>
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  track: {
    height: 8,
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.full,
  },
});
