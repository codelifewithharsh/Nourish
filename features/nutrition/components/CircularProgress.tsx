import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';

interface CircularProgressProps {
  current: number;
  target: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({
  current,
  target,
  size = 140,
  strokeWidth = 10,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = target > 0 ? Math.min(current / target, 1) : 0;
  const strokeDashoffset = circumference * (1 - percent);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* SVG ring — sits behind text via absolute */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#E8F5EF"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={Colors.accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Center text */}
      <View style={{ alignItems: 'center' }}>
        <Txt variant="headingXl" color={Colors.accent}>{current}</Txt>
        <Txt variant="bodySm" color={Colors.secondary}>/ {target} kcal</Txt>
      </View>
    </View>
  );
}
