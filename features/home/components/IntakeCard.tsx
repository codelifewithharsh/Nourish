import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Zap } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui';

interface Props {
  eaten:  number;
  target: number;
}

const SIZE   = 118;
const STROKE = 13;

// The arc leaves a gap at the bottom rather than closing the circle — an
// open gauge reads as a measurement, a closed ring reads as a pie.
const GAP_DEGREES = 96;
const SWEEP       = 360 - GAP_DEGREES;

export function IntakeCard({ eaten, target }: Props) {
  const pct = target > 0 ? Math.min(eaten / target, 1) : 0;
  // Capped the same way the ring is: past target the ring already reads as
  // full, so a percent number past 100 disagreed with what was drawn beside
  // it — "100%, ring full" is one consistent fact instead of two clashing ones.
  const percent = Math.round(pct * 100);

  const radius = (SIZE - STROKE) / 2;
  const circum = 2 * Math.PI * radius;

  // Only SWEEP degrees of the circle are drawn; the rest is the gap.
  const arcLength = circum * (SWEEP / 360);
  const progress  = arcLength * pct;

  return (
    <View style={s.card}>
      <View style={s.left}>
        <View style={s.labelRow}>
          <View style={s.iconWrap}>
            <Zap size={16} color={Colors.accent} strokeWidth={2.4} fill={Colors.accent} />
          </View>
          <Txt style={s.label}>Daily calorie intake</Txt>
        </View>
        <Txt style={s.percent}>{percent}%</Txt>
      </View>

      <View style={s.gaugeWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/* Rotated so the gap sits centred at the bottom. */}
          <G rotation={-90 + GAP_DEGREES / 2} origin={`${SIZE / 2}, ${SIZE / 2}`}>
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={radius}
              stroke="#FFFFFF" strokeWidth={STROKE} fill="none"
              strokeDasharray={`${arcLength} ${circum}`}
              strokeLinecap="round"
            />
            {progress > 0.5 && (
              <Circle
                cx={SIZE / 2} cy={SIZE / 2} r={radius}
                stroke={Colors.accent} strokeWidth={STROKE} fill="none"
                strokeDasharray={`${progress} ${circum}`}
                strokeLinecap="round"
              />
            )}
          </G>
        </Svg>
        <View style={s.gaugeCenter}>
          <Txt style={s.eaten}>{eaten.toLocaleString()}</Txt>
          <View style={s.divider} />
          <Txt style={s.target}>{target.toLocaleString()}</Txt>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.intakeCard,
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 22,
  },
  left:     { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center', justifyContent: 'center',
  },
  label:    { fontSize: 14, fontWeight: '600', color: Colors.primary },
  percent:  { fontSize: 46, lineHeight: 56, fontWeight: '800', color: Colors.primary, marginTop: 6, letterSpacing: -1.5 },
  gaugeWrap:   { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  gaugeCenter: { position: 'absolute', alignItems: 'center' },
  eaten:    { fontSize: 21, fontWeight: '700', color: Colors.primary, lineHeight: 25 },
  divider:  { width: 46, height: 1, backgroundColor: 'rgba(26,26,26,0.18)', marginVertical: 3 },
  target:   { fontSize: 14, color: Colors.secondary, lineHeight: 18 },
});
