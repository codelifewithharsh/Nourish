import { useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView, Modal, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { X, Trash2, Minus, Plus, Pencil, Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui/Typography';
import { haptic } from '@/lib/haptics';
import type { PhotoItem, PhotoResult } from '../usePhotoLog';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

// Below this the model is guessing more than reading. Say so rather than
// presenting a confident-looking number the user will silently trust.
const LOW_CONFIDENCE = 0.6;

interface EditableMacros {
  item:     string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

/**
 * Inline editor for one identified item.
 *
 * The ± buttons scale a whole item proportionally, which is right when the
 * model read the dish correctly but misjudged how much of it there was. This
 * is for the other case: the numbers themselves are wrong, or the dish was
 * misnamed. Edits here replace the estimate outright.
 */
function ItemEditor({
  item, onSave, onCancel,
}: {
  item:     PhotoItem;
  onSave:   (next: EditableMacros) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.item);
  const [cal,  setCal]  = useState(String(item.calories));
  const [pro,  setPro]  = useState(String(item.protein));
  const [carb, setCarb] = useState(String(item.carbs));
  const [fat,  setFat]  = useState(String(item.fat));

  // Empty or malformed input reads as zero rather than NaN, so a half-typed
  // field can never write a broken number into the log.
  const num = (v: string) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const canSave = name.trim().length > 0;

  return (
    <View style={ed.wrap}>
      <TextInput
        style={ed.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="What is it?"
        placeholderTextColor={Colors.secondary}
        autoCorrect={false}
      />

      <View style={ed.grid}>
        <Field label="kcal"    value={cal}  onChange={setCal}  color={Colors.accent} />
        <Field label="protein" value={pro}  onChange={setPro}  color="#5B8DB8" />
        <Field label="carbs"   value={carb} onChange={setCarb} color="#E6A817" />
        <Field label="fat"     value={fat}  onChange={setFat}  color="#9B59B6" />
      </View>

      <View style={ed.actions}>
        <TouchableOpacity onPress={onCancel} style={ed.cancelBtn} activeOpacity={0.8}>
          <Txt style={ed.cancelTxt}>Cancel</Txt>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSave({
            item:     name.trim(),
            calories: num(cal),
            protein:  num(pro),
            carbs:    num(carb),
            fat:      num(fat),
          })}
          style={[ed.saveBtn, !canSave && ed.saveBtnDisabled]}
          activeOpacity={0.85}
          disabled={!canSave}
        >
          <Check size={15} color="#FFFFFF" strokeWidth={3} />
          <Txt style={ed.saveTxt}>Done</Txt>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({
  label, value, onChange, color,
}: { label: string; value: string; onChange: (v: string) => void; color: string }) {
  return (
    <View style={ed.field}>
      <TextInput
        style={[ed.fieldInput, { color }]}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={5}
      />
      <Txt style={ed.fieldLabel}>{label}</Txt>
    </View>
  );
}

const ed = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  nameInput: {
    fontSize: 15, fontWeight: '600', color: Colors.primary,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm, paddingHorizontal: 12, paddingVertical: 10,
  },
  grid:  { flexDirection: 'row', gap: 8 },
  field: { flex: 1, alignItems: 'center', backgroundColor: Colors.background, borderRadius: BorderRadius.sm, paddingVertical: 8 },
  fieldInput: {
    fontSize: 17, fontWeight: '800', textAlign: 'center',
    paddingVertical: 2, minWidth: 44,
  },
  fieldLabel: { fontSize: 10, color: Colors.secondary, fontWeight: '600' },
  actions:    { flexDirection: 'row', gap: 8 },
  cancelBtn:  { paddingHorizontal: 18, paddingVertical: 11, borderRadius: BorderRadius.sm, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:  { fontSize: 14, fontWeight: '600', color: Colors.secondary },
  saveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: BorderRadius.sm, backgroundColor: Colors.accent },
  saveBtnDisabled: { opacity: 0.5 },
  saveTxt:    { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

interface Props {
  visible:   boolean;
  result:    PhotoResult | null;
  saving:    boolean;
  mealType:  MealType;
  onChangeMealType: (t: MealType) => void;
  onConfirm: (items: PhotoItem[], mealName: string) => void;
  onRetake:  () => void;
  onClose:   () => void;
}

/**
 * Review step between "photo analysed" and "logged".
 *
 * The model's portion estimate is the weakest part of any photo-calorie
 * pipeline, so this screen is built for correction: every item can be scaled
 * or removed before anything is written. Corrections are also the most
 * valuable signal we collect — they're what a generic clone can't copy.
 */
export function PhotoResultSheet({
  visible, result, saving, mealType, onChangeMealType, onConfirm, onRetake, onClose,
}: Props) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  // Per-item portion multiplier, keyed by index. 1 = as estimated.
  const [scales, setScales] = useState<number[]>([]);
  // Index of the item whose macros are open for hand-editing, if any.
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    if (result) {
      setItems(result.items);
      setScales(result.items.map(() => 1));
      setEditing(null);
    }
  }, [result]);

  if (!result) return null;

  const scaled = items.map((it, i) => {
    const k = scales[i] ?? 1;
    return {
      ...it,
      calories: Math.round(it.calories * k),
      protein:  Math.round(it.protein  * k),
      carbs:    Math.round(it.carbs    * k),
      fat:      Math.round(it.fat      * k),
      fibre:    Math.round(it.fibre    * k),
      sugar:    Math.round(it.sugar    * k),
      sodium:   Math.round(it.sodium   * k),
      sat_fat:  Math.round(it.sat_fat  * k),
    };
  });

  const total = scaled.reduce(
    (a, i) => ({
      calories: a.calories + i.calories,
      protein:  a.protein  + i.protein,
      carbs:    a.carbs    + i.carbs,
      fat:      a.fat      + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const lowConfidence = (result.avg_confidence ?? 1) < LOW_CONFIDENCE;

  const adjust = (i: number, delta: number) => {
    haptic.light();
    setScales((prev) => {
      const next = [...prev];
      // 0.25 steps between a quarter portion and triple.
      next[i] = Math.max(0.25, Math.min(3, Number(((next[i] ?? 1) + delta).toFixed(2))));
      return next;
    });
  };

  const remove = (i: number) => {
    haptic.warning();
    setItems((prev) => prev.filter((_, n) => n !== i));
    setScales((prev) => prev.filter((_, n) => n !== i));
    // `editing` is a plain index into the (now shorter) array. Closing it
    // when the edited row itself is removed is not enough — removing any row
    // *before* it must shift it down too, or it silently points at the wrong
    // item (or none), which closed the open editor without saving.
    setEditing((e) => {
      if (e === null) return null;
      if (e === i) return null;
      return e > i ? e - 1 : e;
    });
  };

  /**
   * Commit a hand-edited item.
   *
   * The edited numbers are what the user says they ate, so they're stored as
   * the item's new baseline and its scale resets to 1× — otherwise a pending
   * multiplier would silently re-scale the very figures they just corrected.
   * Macros the user didn't touch (fibre, sugar, sodium, sat fat) are carried
   * across at the old multiplier so they stay consistent with the new portion.
   */
  const commitEdit = (i: number, next: { item: string; calories: number; protein: number; carbs: number; fat: number }) => {
    haptic.light();
    const k = scales[i] ?? 1;
    setItems((prev) => prev.map((it, n) => n === i ? {
      ...it,
      ...next,
      fibre:   Math.round(it.fibre   * k),
      sugar:   Math.round(it.sugar   * k),
      sodium:  Math.round(it.sodium  * k),
      sat_fat: Math.round(it.sat_fat * k),
    } : it));
    setScales((prev) => prev.map((s, n) => n === i ? 1 : s));
    setEditing(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Txt style={s.title}>{result.meal_name ?? 'Your meal'}</Txt>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <X size={20} color={Colors.secondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* The photo the user just took — this is the app's first real food image */}
            <Image
              source={{ uri: result.localUri }}
              style={s.photo}
              contentFit="cover"
              transition={200}
            />

            {lowConfidence && (
              <View style={s.warnBox}>
                <Txt style={s.warnTxt}>
                  Hard to read this one — please check the portions below.
                </Txt>
              </View>
            )}

            {result.notes && !lowConfidence && (
              <Txt style={s.notes}>{result.notes}</Txt>
            )}

            {/* Total */}
            <View style={s.totalCard}>
              <Txt style={s.totalCal}>{total.calories}</Txt>
              <Txt style={s.totalCalLabel}>kcal</Txt>
              <View style={s.totalMacros}>
                <Txt style={s.totalMacro}>{total.protein}g protein</Txt>
                <Txt style={s.totalDot}>·</Txt>
                <Txt style={s.totalMacro}>{total.carbs}g carbs</Txt>
                <Txt style={s.totalDot}>·</Txt>
                <Txt style={s.totalMacro}>{total.fat}g fat</Txt>
              </View>
            </View>

            {/* Items */}
            <Txt style={s.sectionLabel}>What we found · ± for portions, ✎ to correct</Txt>
            {scaled.map((it, i) => (
              editing === i ? (
                <ItemEditor
                  key={`edit-${i}`}
                  item={it}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => commitEdit(i, next)}
                />
              ) : (
                <View key={`${it.item}-${i}`} style={s.itemRow}>
                  <View style={s.itemMain}>
                    <Txt style={s.itemName} numberOfLines={1}>{it.item}</Txt>
                    <Txt style={s.itemMeta}>
                      {scales[i] !== 1 ? `${scales[i]}× ` : ''}{it.portion} · {it.calories} kcal
                    </Txt>
                  </View>
                  <View style={s.itemActions}>
                    <TouchableOpacity onPress={() => adjust(i, -0.25)} hitSlop={6} style={s.stepBtn}>
                      <Minus size={14} color={Colors.primary} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => adjust(i, 0.25)} hitSlop={6} style={s.stepBtn}>
                      <Plus size={14} color={Colors.primary} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { haptic.light(); setEditing(i); }} hitSlop={6} style={s.stepBtn}>
                      <Pencil size={13} color={Colors.primary} strokeWidth={2.2} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(i)} hitSlop={6} style={s.stepBtn}>
                      <Trash2 size={14} color={Colors.error} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ))}

            {items.length === 0 && (
              <Txt style={s.emptyTxt}>
                You've removed everything — retake the photo or close this.
              </Txt>
            )}

            {/* Meal type */}
            <Txt style={s.sectionLabel}>Log as</Txt>
            <View style={s.typeRow}>
              {MEAL_TYPES.map((t) => {
                const active = mealType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { haptic.light(); onChangeMealType(t); }}
                    style={[s.typePill, active && s.typePillActive]}
                    activeOpacity={0.8}
                  >
                    <Txt style={s.typeEmoji}>{MEAL_EMOJI[t]}</Txt>
                    <Txt style={[s.typeTxt, active && s.typeTxtActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Txt>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={s.footer}>
            <TouchableOpacity style={s.retakeBtn} onPress={onRetake} activeOpacity={0.85} disabled={saving}>
              <Txt style={s.retakeTxt}>Retake</Txt>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, (saving || items.length === 0) && s.confirmBtnDisabled]}
              onPress={() => onConfirm(scaled, result.meal_name ?? 'Meal')}
              activeOpacity={0.85}
              disabled={saving || items.length === 0}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Txt style={s.confirmTxt}>Add {total.calories} kcal</Txt>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  title:      { fontSize: 19, fontWeight: '700', color: Colors.primary, flex: 1 },
  closeBtn:   { padding: 4 },
  scroll:     { paddingHorizontal: 20, paddingBottom: 12 },
  photo:      { width: '100%', height: 190, borderRadius: BorderRadius.lg, backgroundColor: Colors.border },
  warnBox:    { marginTop: 12, padding: 12, borderRadius: BorderRadius.md, backgroundColor: '#FFF4E0' },
  warnTxt:    { fontSize: 13, color: '#8A6100', lineHeight: 18 },
  notes:      { marginTop: 12, fontSize: 13, color: Colors.secondary, lineHeight: 18 },
  totalCard:  { marginTop: 16, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: 18, alignItems: 'center' },
  totalCal:   { fontSize: 40, fontWeight: '700', color: Colors.primary, lineHeight: 46 },
  totalCalLabel: { fontSize: 13, color: Colors.secondary, marginTop: -2 },
  totalMacros:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  totalMacro: { fontSize: 13, color: Colors.secondary },
  totalDot:   { fontSize: 13, color: Colors.border },
  sectionLabel: { marginTop: 22, marginBottom: 10, fontSize: 12, fontWeight: '600', color: Colors.secondary },
  itemRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 14, marginBottom: 8 },
  itemMain:   { flex: 1, marginRight: 8 },
  itemName:   { fontSize: 15, fontWeight: '600', color: Colors.primary },
  itemMeta:   { fontSize: 12, color: Colors.secondary, marginTop: 2 },
  itemActions:{ flexDirection: 'row', gap: 6 },
  stepBtn:    { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  emptyTxt:   { fontSize: 13, color: Colors.secondary, textAlign: 'center', paddingVertical: 16 },
  typeRow:    { flexDirection: 'row', gap: 8 },
  typePill:   { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typePillActive: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  typeEmoji:  { fontSize: 16 },
  typeTxt:    { fontSize: 11, color: Colors.secondary, marginTop: 2 },
  typeTxtActive: { color: Colors.accent, fontWeight: '700' },
  footer:     { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: Colors.border },
  retakeBtn:  { paddingHorizontal: 22, paddingVertical: 15, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  retakeTxt:  { fontSize: 15, fontWeight: '600', color: Colors.primary },
  confirmBtn: { flex: 1, paddingVertical: 15, borderRadius: BorderRadius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
