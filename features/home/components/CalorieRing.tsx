import Svg, { Circle } from 'react-native-svg';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';

interface Props {
  eaten:  number;
  target: number;
  size?:  number;
}

/**
 * The single anchor of the dashboard: how much is left today.
 *
 * Shows "left" rather than "eaten" because that's the number that changes a
 * decision at the moment someone is deciding what to eat next.
 */
export function CalorieRing({ eaten, target, size = 180 }: Props) {
  const stroke  = 14;
  const radius  = (size - stroke) / 2;
  const circum  = 2 * Math.PI * radius;
  const pct     = target > 0 ? Math.min(eaten / target, 1) : 0;
  const over    = eaten > target;
  const left    = Math.max(0, target - eaten);

  // Amber once past target: worth noticing, not an emergency.
  const ringColor = over ? '#E6A817' : Colors.accent;

  return (
    <View style={[s.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={s.svg}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={Colors.accentLight} strokeWidth={stroke} fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={ringColor} strokeWidth={stroke} fill="none"
          strokeDasharray={circum}
          strokeDashoffset={circum * (1 - pct)}
          strokeLinecap="round"
          // Start the arc at 12 o'clock rather than 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={s.center}>
        <Txt style={s.big}>{over ? eaten - target : left}</Txt>
        <Txt style={s.label}>{over ? 'kcal over' : 'kcal left'}</Txt>
        <Txt style={s.sub}>{eaten.toLocaleString()} of {target.toLocaleString()}</Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:   { alignItems: 'center', justifyContent: 'center' },
  svg:    { position: 'absolute' },
  center: { alignItems: 'center' },
  big:    { fontSize: 42, fontWeight: '700', color: Colors.primary, lineHeight: 48 },
  label:  { fontSize: 13, color: Colors.secondary, marginTop: -2 },
  sub:    { fontSize: 12, color: Colors.secondary, marginTop: 6 },
});
