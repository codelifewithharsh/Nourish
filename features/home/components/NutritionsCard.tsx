import { View, StyleSheet } from 'react-native';
import { PieChart } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
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

// Per-nutrient colours. Each nutrient keeps the same hue everywhere it
// appears so the bars are readable at a glance without labels.
export const NUTRIENT_COLORS = {
  carbs:   '#F4A6B8',
  fat:     '#F6CE7E',
  protein: '#A8C8EC',
  fibre:   '#A8D5BA',
  sodium:  '#C9A8E0',
} as const;

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
          <Txt style={s.target}> / {target} {unit}</Txt>
        </Txt>
      </View>
      <View style={s.barRow}>
        <Txt style={[s.pct, over && isLimit && s.pctOver]}>{pct}%</Txt>
        <View style={s.track}>
          <View
            style={[
              s.fill,
              { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: over && isLimit ? '#E6A817' : color },
            ]}
          />
        </View>
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
    backgroundColor: Colors.surface,
    borderRadius: 26,
    padding: 20,
  },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 17, fontWeight: '700', color: Colors.primary },

  row:          { marginBottom: 16 },
  rowHighlight: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#FFF9EC',
  },
  head:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label:  { fontSize: 13, color: Colors.secondary },
  values: { fontSize: 15 },
  eaten:  { fontWeight: '700', color: Colors.primary },
  target: { color: Colors.secondary },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  pct:    { fontSize: 15, fontWeight: '700', color: Colors.primary, width: 46 },
  pctOver:{ color: '#E6A817' },
  track:  { flex: 1, height: 11, borderRadius: 999, backgroundColor: '#F0F0EE', overflow: 'hidden' },
  fill:   { height: 11, borderRadius: 999 },
});
