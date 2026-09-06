import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, Sparkles, Camera } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export interface NextMeal {
  type:     string;
  name:     string;
  calories: number;
  protein:  number;
  carbs?:   number;
  fat?:     number;
}

interface Props {
  meal:     NextMeal;
  logging:  boolean;
  onLog:    () => void;
  onSwap:   () => void;
  onScan:   () => void;
  onView?:  () => void;
}

// Mirrors the Plan tab so a meal looks the same wherever it appears.
const MEAL_COLOR: Record<string, string> = {
  breakfast: Colors.accent,
  lunch:     '#E6A817',
  dinner:    '#7B5EA7',
  snack:     '#E05A6B',
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

const MEAL_TIME_HINT: Record<string, string> = {
  breakfast: '7 – 10 AM', lunch: '12 – 2 PM', dinner: '7 – 9 PM', snack: '4 – 6 PM',
};

function MacroPill({
  value, unit, color, prominent,
}: { value: string; unit: string; color: string; prominent?: boolean }) {
  return (
    <View style={[mp.wrap, { backgroundColor: color + (prominent ? '20' : '12') }]}>
      <Txt style={[mp.value, { color }]}>{value}</Txt>
      <Txt style={[mp.unit, { color: color + 'C0' }]}>{unit}</Txt>
    </View>
  );
}

const mp = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'baseline', gap: 3, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  value: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  unit:  { fontSize: 10, fontWeight: '600', lineHeight: 14 },
});

/**
 * The next planned meal on the dashboard.
 *
 * Deliberately built to the Plan tab's meal card — same stripe, label, macro
 * pills and button shapes — so the same meal doesn't look like two different
 * things in two places. What it adds is a third action, for when the user ate
 * something other than what was planned.
 */
export function NextMealCard({ meal, logging, onLog, onSwap, onScan, onView }: Props) {
  const color = MEAL_COLOR[meal.type] ?? Colors.accent;
  const emoji = MEAL_EMOJI[meal.type] ?? '🍽️';

  return (
    <View style={mc.card}>
      <View style={[mc.stripe, { backgroundColor: color }]} />

      <View style={mc.body}>
        {/* Meal type + time hint, with the up-next marker on the right */}
        <View style={mc.topRow}>
          <View style={mc.topLeft}>
            <Txt style={mc.emoji}>{emoji}</Txt>
            <View>
              <Txt style={[mc.label, { color }]}>{MEAL_LABEL[meal.type] ?? 'Next'}</Txt>
              <Txt style={mc.time}>{MEAL_TIME_HINT[meal.type] ?? ''}</Txt>
            </View>
          </View>
          <View style={[mc.nextBadge, { backgroundColor: color + '14' }]}>
            <View style={[mc.nextDot, { backgroundColor: color }]} />
            <Txt style={[mc.nextTxt, { color }]}>Up next</Txt>
          </View>
        </View>

        {/* Name */}
        <TouchableOpacity onPress={onView} activeOpacity={0.7} style={mc.nameWrap} disabled={!onView}>
          <Txt style={mc.name}>{meal.name}</Txt>
          {onView && <Txt style={[mc.viewRecipe, { color }]}>View recipe →</Txt>}
        </TouchableOpacity>

        {/* Macros */}
        <View style={mc.macroRow}>
          <MacroPill value={`${meal.calories}`} unit="kcal" color={color} prominent />
          <MacroPill value={`${meal.protein}g`} unit="protein" color="#5B8DB8" />
          {meal.carbs != null && <MacroPill value={`${meal.carbs}g`} unit="carbs" color="#E6A817" />}
          {meal.fat   != null && <MacroPill value={`${meal.fat}g`}   unit="fat"   color="#9B59B6" />}
        </View>

        {/* Actions */}
        <View style={mc.btns}>
          <TouchableOpacity
            style={[mc.btnLog, { backgroundColor: color }]}
            activeOpacity={0.88}
            onPress={() => { haptic.success(); onLog(); }}
            disabled={logging}
          >
            {logging
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <>
                  <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  <Txt style={mc.btnLogTxt}>Log it</Txt>
                </>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[mc.btnGhost, { borderColor: color }]}
            activeOpacity={0.85}
            onPress={() => { haptic.light(); onSwap(); }}
          >
            <Sparkles size={14} color={color} strokeWidth={2.5} />
            <Txt style={[mc.btnGhostTxt, { color }]}>Swap</Txt>
          </TouchableOpacity>

          {/* For when they ate something other than the plan. */}
          <TouchableOpacity
            style={[mc.btnGhost, { borderColor: color }]}
            activeOpacity={0.85}
            onPress={() => { haptic.medium(); onScan(); }}
          >
            <Camera size={14} color={color} strokeWidth={2.5} />
            <Txt style={[mc.btnGhostTxt, { color }]}>Scan</Txt>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, zIndex: 1 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9,
  },
  nextDot: { width: 6, height: 6, borderRadius: 3 },
  nextTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },

  body:    { padding: 16, paddingLeft: 20, gap: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji:   { fontSize: 22, lineHeight: 28 },
  label:   { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 17 },
  time:    { fontSize: 11, color: Colors.secondary, lineHeight: 14 },

  nameWrap:   { gap: 3 },
  name:       { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24, letterSpacing: -0.2 },
  viewRecipe: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, lineHeight: 14 },

  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  btns:        { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnLog:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12 },
  btnLogTxt:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },
  btnGhost:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 44, borderRadius: 12, borderWidth: 1.5, backgroundColor: Colors.surface },
  btnGhostTxt: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
