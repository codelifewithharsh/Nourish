import { View, StyleSheet } from 'react-native';
import { PieChart } from 'lucide-react-native';
import { Colors, NutrientColors } from '@/constants/colors';
import { Txt } from '@/components/ui';

export interface NutrientRow {
  label:  string;
  eaten:  number;
  target: number;
  unit:   string;
  color:  string;
  /** Limits (sodium, sugar) warn when exceeded; goals warn when unmet. */
  isLimit?:   boolean;
  highlight?: boolean;
}

interface Props {
  rows: NutrientRow[];
}

export const NUTRIENT_COLORS = NutrientColors;

function Row({ label, eaten, target, unit, color, isLimit, highlight }: NutrientRow) {
  const ratio = target > 0 ? eaten / target : 0;
  const pct   = Math.round(ratio * 100);
  const over  = ratio > 1;

  // Fractional grams matter for macros; milligrams of sodium do not.
  const shown = unit === 'mg' ? Math.round(eaten) : Math.round(eaten * 10) / 10;

  return (
    <View style={[s.row, highlight && s.rowHighlight]}>
      <View style={s.head}>
        <Txt style={s.label}>{label}</Txt>
        <Txt style={s.values}>
          <Txt style={s.eaten}>{shown}</Txt>
          <Txt style={s.target}> / {target}{unit}</Txt>
        </Txt>
      </View>
      <View style={s.track}>
        <View
          style={[
            s.fill,
            {
              width: `${Math.min(ratio, 1) * 100}%`,
              backgroundColor: over && isLimit ? Colors.warning : color,
            },
          ]}
        />
      </View>
    </View>
  );
}

export function NutritionsCard({ rows }: Props) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <PieChart size={17} color={Colors.primary} strokeWidth={2} />
        </View>
        <Txt style={s.title}>Nutritions</Txt>
      </View>

      {rows.map((r) => <Row key={r.label} {...r} />)}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 26,
    padding: 18,
  },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 16, fontWeight: '700', color: Colors.primary },

  row:          { marginBottom: 11 },
  rowHighlight: {
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.warningLight,
  },
  head:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  label:  { fontSize: 12.5, color: Colors.secondary },
  values: { fontSize: 13 },
  eaten:  { fontWeight: '700', color: Colors.primary },
  target: { color: Colors.secondary },

  track:  { height: 8, borderRadius: 999, backgroundColor: Colors.trackEmpty, overflow: 'hidden' },
  fill:   { height: 8, borderRadius: 999 },
});
