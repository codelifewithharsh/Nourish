import { useEffect, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui/Typography';
import { haptic } from '@/lib/haptics';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: Colors.accent, lunch: '#E6A817', dinner: '#7B5EA7', snack: '#E05A6B',
};

export interface EditableLog {
  type:     MealType;
  name:     string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

interface Props {
  entry:   EditableLog | null;
  visible: boolean;
  saving:  boolean;
  onSave:  (next: EditableLog) => void;
  onClose: () => void;
}

/**
 * Correcting a meal that's already logged.
 *
 * The macros are editable directly rather than being re-derived from the
 * name: if someone logged a plate and knows it was 600 kcal, re-asking the AI
 * would just overwrite what they know with another estimate.
 */
export function EditLogModal({ entry, visible, saving, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MealType>('lunch');
  const [cal,  setCal]  = useState('0');
  const [pro,  setPro]  = useState('0');
  const [carb, setCarb] = useState('0');
  const [fat,  setFat]  = useState('0');

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setType(entry.type);
    setCal(String(entry.calories));
    setPro(String(entry.protein));
    setCarb(String(entry.carbs));
    setFat(String(entry.fat));
  }, [entry]);

  if (!entry) return null;

  // A half-typed field reads as zero rather than NaN, so an in-progress edit
  // can never write a broken number.
  const num = (v: string) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const canSave = name.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.wrap}
      >
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.headRow}>
            <Txt style={s.title}>Edit meal</Txt>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <X size={18} color={Colors.secondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Txt style={s.fieldLabel}>What you ate</Txt>
          <TextInput
            style={s.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. 2 rotis with dal"
            placeholderTextColor={Colors.secondary}
            returnKeyType="done"
            autoCorrect={false}
          />

          <Txt style={s.fieldLabel}>Macros</Txt>
          <View style={s.macroRow}>
            <Field label="kcal"    value={cal}  onChange={setCal}  color={Colors.accent} />
            <Field label="protein" value={pro}  onChange={setPro}  color="#5B8DB8" />
            <Field label="carbs"   value={carb} onChange={setCarb} color="#E6A817" />
            <Field label="fat"     value={fat}  onChange={setFat}  color="#9B59B6" />
          </View>

          <Txt style={s.fieldLabel}>Meal type</Txt>
          <View style={s.typeRow}>
            {MEAL_TYPES.map((t) => {
              const active = type === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.typePill, active && { backgroundColor: MEAL_COLOR[t] + '15', borderColor: MEAL_COLOR[t] }]}
                  onPress={() => { haptic.light(); setType(t); }}
                  activeOpacity={0.75}
                >
                  <Txt style={s.typeEmoji}>{MEAL_EMOJI[t]}</Txt>
                  <Txt style={[s.typeTxt, active && { color: MEAL_COLOR[t], fontWeight: '700' }]}>
                    {MEAL_LABEL[t]}
                  </Txt>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
            onPress={() => onSave({
              type,
              name:     name.trim(),
              calories: num(cal),
              protein:  num(pro),
              carbs:    num(carb),
              fat:      num(fat),
            })}
            activeOpacity={0.88}
            disabled={!canSave}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <>
                  <Check size={17} color="#FFFFFF" strokeWidth={3} />
                  <Txt style={s.saveTxt}>Save changes</Txt>
                </>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label, value, onChange, color,
}: { label: string; value: string; onChange: (v: string) => void; color: string }) {
  return (
    <View style={s.field}>
      <TextInput
        style={[s.fieldInput, { color }]}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={5}
      />
      <Txt style={s.fieldUnit}>{label}</Txt>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap:     { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, gap: 10,
  },
  handle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:   { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24 },
  closeBtn:{ width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 },
  nameInput: {
    fontSize: 15, fontWeight: '600', color: Colors.primary,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 12,
  },

  macroRow:   { flexDirection: 'row', gap: 8 },
  field:      { flex: 1, alignItems: 'center', backgroundColor: Colors.background, borderRadius: BorderRadius.md, paddingVertical: 10 },
  fieldInput: { fontSize: 18, fontWeight: '800', textAlign: 'center', paddingVertical: 2, minWidth: 48 },
  fieldUnit:  { fontSize: 10, color: Colors.secondary, fontWeight: '600' },

  typeRow:   { flexDirection: 'row', gap: 6 },
  typePill:  { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typeEmoji: { fontSize: 16, lineHeight: 20 },
  typeTxt:   { fontSize: 10.5, fontWeight: '600', color: Colors.secondary, lineHeight: 14 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, backgroundColor: Colors.accent, borderRadius: 16, marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },
});
