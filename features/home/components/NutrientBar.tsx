import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';

interface Props {
  label:     string;
  eaten:     number;
  target:    number;
  unit:      string;
  /** Limits (sodium, sugar, sat fat) turn amber when exceeded rather than
   *  when unmet — the opposite of goals like protein and fibre. */
  isLimit?:  boolean;
  highlight?: boolean;
}

const AMBER = '#E6A817';

export function NutrientBar({ label, eaten, target, unit, isLimit = false, highlight = false }: Props) {
  const pct   = target > 0 ? eaten / target : 0;
  const over  = pct > 1;

  // A goal is fine when it's being met; a limit is fine while it's under.
  const bad   = isLimit ? over : pct < 0.5;
  const color = bad ? AMBER : Colors.accent;

  return (
    <View style={[s.row, highlight && s.rowHighlight]}>
      <View style={s.head}>
        <Txt style={s.label}>{label}</Txt>
        <Txt style={s.value}>
          <Txt style={s.valueBold}>{Math.round(eaten)}</Txt>
          <Txt style={s.valueLight}>
            {isLimit ? ' / ' : ' / '}{Math.round(target)}{unit}
          </Txt>
        </Txt>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.min(pct, 1) * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:          { marginBottom: 14 },
  rowHighlight: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF9EC',
  },
  head:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.primary },
  value:      { fontSize: 13 },
  valueBold:  { fontWeight: '700', color: Colors.primary },
  valueLight: { color: Colors.secondary },
  track:      { height: 6, borderRadius: 999, backgroundColor: Colors.accentLight, overflow: 'hidden' },
  fill:       { height: 6, borderRadius: 999 },
});
