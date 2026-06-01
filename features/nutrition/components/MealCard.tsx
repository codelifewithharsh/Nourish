import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Clock, CheckCircle2 } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { Card, Tag, Txt } from '@/components/ui';

interface MealCardProps {
  id: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  calories: number;
  protein: number;
  prepMinutes: number;
  logged: boolean;
}

const TYPE_LABEL: Record<MealCardProps['type'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function MealCard({ id, type, name, calories, protein, prepMinutes, logged }: MealCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/recipe/${id}`)}>
      <Card style={styles.card}>
        <View style={styles.topRow}>
          <Tag label={TYPE_LABEL[type]} variant={logged ? 'accent' : 'default'} />
          {logged && (
            <View style={styles.loggedBadge}>
              <CheckCircle2 size={14} color={Colors.accent} />
              <Txt variant="labelBold" color={Colors.accent}>Logged</Txt>
            </View>
          )}
        </View>

        <Txt variant="headingMd" style={styles.name}>{name}</Txt>

        <View style={styles.bottomRow}>
          <View style={styles.macroRow}>
            <MacroChip label="Calories" value={`${calories} kcal`} />
            <View style={styles.divider} />
            <MacroChip label="Protein" value={`${protein}g`} />
          </View>
          <View style={styles.prepTime}>
            <Clock size={13} color={Colors.secondary} />
            <Txt variant="bodySm" color={Colors.secondary}>{prepMinutes}m</Txt>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function MacroChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.macroChip}>
      <Txt variant="bodySm" color={Colors.secondary}>{label}</Txt>
      <Txt variant="labelBold">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loggedBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  macroChip: {
    gap: 2,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  prepTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
});
