import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui';
import { WeightUnit, HeightUnit, Sex } from '../types';

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

// ─── Cascade Picker ───────────────────────────────────────────────────────────

interface CascadePickerProps {
  items: number[];
  selected: number;
  onSelect: (val: number) => void;
  unit?: string;
  flex?: number;
}

function CascadePicker({ items, selected, onSelect, unit, flex = 1 }: CascadePickerProps) {
  const listRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  // Find closest item if exact match not found (handles rounding gaps in unit conversion)
  const selectedIndex = (() => {
    const exact = items.indexOf(selected);
    if (exact !== -1) return exact;
    let closest = 0;
    let minDiff = Math.abs(items[0] - selected);
    for (let i = 1; i < items.length; i++) {
      const diff = Math.abs(items[i] - selected);
      if (diff < minDiff) { minDiff = diff; closest = i; }
    }
    return closest;
  })();

  // The item in the green highlight band is the one at scrollY / ITEM_HEIGHT.
  // We listen to scroll-end events (momentum + manual drag end) and read the
  // scroll position directly. This is reliable; viewable-items logic was
  // off-by-one because viewable items don't 1:1 map to the highlight band.
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const item = items[clamped];
      if (item !== undefined) onSelect(item);
    },
    [items, onSelect],
  );

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  return (
    <View style={[styles.pickerWrapper, { flex }]}>
      <View style={styles.pickerHighlight} pointerEvents="none" />
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => String(item)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        initialScrollIndex={selectedIndex}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onMomentumScrollEnd}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const dist = Animated.subtract(
            scrollY,
            new Animated.Value(index * ITEM_HEIGHT),
          );
          const absDist = dist.interpolate({
            inputRange: [-ITEM_HEIGHT * 2, 0, ITEM_HEIGHT * 2],
            outputRange: [ITEM_HEIGHT * 2, 0, ITEM_HEIGHT * 2],
            extrapolate: 'clamp',
          });
          const fontSize = absDist.interpolate({
            inputRange: [0, ITEM_HEIGHT, ITEM_HEIGHT * 2],
            outputRange: [34, 22, 16],
            extrapolate: 'clamp',
          });
          const opacity = absDist.interpolate({
            inputRange: [0, ITEM_HEIGHT, ITEM_HEIGHT * 2],
            outputRange: [1, 0.5, 0.25],
            extrapolate: 'clamp',
          });
          const color = absDist.interpolate({
            inputRange: [0, ITEM_HEIGHT, ITEM_HEIGHT * 2],
            outputRange: [Colors.accent, '#9E9E9E', '#C8C8C8'],
            extrapolate: 'clamp',
          });

          return (
            <TouchableOpacity
              style={styles.pickerItem}
              onPress={() => {
                onSelect(item);
                const idx = items.indexOf(item);
                listRef.current?.scrollToIndex({ index: idx, animated: true });
              }}
              activeOpacity={0.7}
            >
              <Animated.Text style={{ fontSize, opacity, color, fontWeight: '700' }}>
                {item}
              </Animated.Text>
            </TouchableOpacity>
          );
        }}
      />
      {unit ? (
        <View style={styles.pickerUnitBadge} pointerEvents="none">
          <Txt style={styles.pickerUnitText}>{unit}</Txt>
        </View>
      ) : null}
    </View>
  );
}

// ─── Dual ft/in picker ────────────────────────────────────────────────────────

const FEET_ITEMS = Array.from({ length: 4 }, (_, i) => i + 4);
const INCHES_ITEMS = Array.from({ length: 12 }, (_, i) => i);

function DualHeightPicker({
  feet, inches, onChangeFeet, onChangeInches,
}: {
  feet: number; inches: number;
  onChangeFeet: (v: number) => void; onChangeInches: (v: number) => void;
}) {
  return (
    <View style={styles.dualRow}>
      <CascadePicker items={FEET_ITEMS} selected={feet} onSelect={onChangeFeet} flex={1} unit="ft" />
      <View style={styles.dualDivider} />
      <CascadePicker items={INCHES_ITEMS} selected={inches} onSelect={onChangeInches} flex={1} unit="in" />
    </View>
  );
}

// ─── Unit Toggle ──────────────────────────────────────────────────────────────

function UnitToggle<T extends string>({
  value, options, onChange,
}: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.unitToggle}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.unitOption, value === opt.value && styles.unitOptionSelected]}
          activeOpacity={0.8}
        >
          <Txt style={[styles.unitOptionText, value === opt.value && styles.unitOptionTextSelected]}>
            {opt.label}
          </Txt>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Height row ───────────────────────────────────────────────────────────────

const SEX_OPTIONS: { label: string; value: Sex }[] = [
  { label: 'Male',          value: 'male' },
  { label: 'Female',        value: 'female' },
  { label: 'Rather not say', value: 'unspecified' },
];

const HEIGHTS_CM = Array.from({ length: 71 }, (_, i) => i + 150);

function cmToFtIn(cm: number) {
  const total = Math.round(cm / 2.54);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}
function ftInToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

function HeightRow({
  heightCm, heightUnit, onChangeHeight, onChangeHeightUnit,
}: {
  heightCm: number; heightUnit: HeightUnit;
  onChangeHeight: (cm: number) => void; onChangeHeightUnit: (u: HeightUnit) => void;
}) {
  const { feet: initFt, inches: initIn } = cmToFtIn(heightCm);
  const [feet, setFeet] = useState(Math.max(4, Math.min(7, initFt)));
  const [inches, setInches] = useState(initIn);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevUnit = useRef(heightUnit);

  useEffect(() => {
    if (prevUnit.current === heightUnit) return;
    prevUnit.current = heightUnit;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [heightUnit, fadeAnim]);

  return (
    <View style={styles.pickerRow}>
      <View style={styles.labelCol}>
        <Txt style={styles.pickerLabel}>📏 Height</Txt>
        <UnitToggle
          value={heightUnit}
          options={[
            { label: 'cm', value: 'cm' as HeightUnit },
            { label: 'ft', value: 'ft' as HeightUnit },
          ]}
          onChange={onChangeHeightUnit}
        />
      </View>
      <Animated.View style={[styles.pickerArea, { opacity: fadeAnim }]}>
        {heightUnit === 'cm' ? (
          <CascadePicker
            items={HEIGHTS_CM}
            selected={Math.max(150, Math.min(220, heightCm))}
            onSelect={onChangeHeight}
            unit="cm"
          />
        ) : (
          <DualHeightPicker
            feet={feet}
            inches={inches}
            onChangeFeet={(v) => { setFeet(v); onChangeHeight(ftInToCm(v, inches)); }}
            onChangeInches={(v) => { setInches(v); onChangeHeight(ftInToCm(feet, v)); }}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const AGES = Array.from({ length: 48 }, (_, i) => i + 18);
const WEIGHTS_KG = Array.from({ length: 121 }, (_, i) => i + 30);
const WEIGHTS_LBS = WEIGHTS_KG.map((kg) => Math.round(kg * 2.205));

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface AboutScreenProps {
  age: number;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  onChangeAge: (v: number) => void;
  onChangeSex: (v: Sex) => void;
  onChangeWeight: (v: number) => void;
  onChangeHeight: (v: number) => void;
  onChangeWeightUnit: (u: WeightUnit) => void;
  onChangeHeightUnit: (u: HeightUnit) => void;
  onContinue: () => void;
}

export function AboutScreen({
  age, sex, weightKg, heightCm,
  weightUnit, heightUnit,
  onChangeAge, onChangeSex, onChangeWeight, onChangeHeight,
  onChangeWeightUnit, onChangeHeightUnit,
  onContinue,
}: AboutScreenProps) {
  const weightItems = weightUnit === 'kg' ? WEIGHTS_KG : WEIGHTS_LBS;
  const displayWeight = weightUnit === 'kg' ? weightKg : Math.round(weightKg * 2.205);

  return (
    <View style={styles.container}>
      <Txt style={styles.title}>A bit about you</Txt>
      <Txt style={styles.subtitle}>We'll calculate your perfect daily nutrition</Txt>

      <View style={styles.cardWrap}>
      <View style={styles.card}>
        {/* Age */}
        <View style={styles.pickerRow}>
          <View style={styles.labelCol}>
            <Txt style={styles.pickerLabel}>🎂 Age</Txt>
          </View>
          <View style={styles.pickerArea}>
            <CascadePicker items={AGES} selected={age} onSelect={onChangeAge} unit="yrs" />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Sex — used only for the BMR/IBW equations, which are sex-specific.
            Without it we have to average the male and female formulas, which
            is wrong for everyone by ~114 kcal/day. */}
        <View style={styles.sexRow}>
          <View style={styles.labelCol}>
            <Txt style={styles.pickerLabel}>🧬 Sex</Txt>
          </View>
          <View style={styles.sexOptions}>
            {SEX_OPTIONS.map((opt) => {
              const selected = sex === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => onChangeSex(opt.value)}
                  style={[styles.sexChip, selected && styles.sexChipSelected]}
                  activeOpacity={0.8}
                >
                  <Txt style={[styles.sexChipText, selected && styles.sexChipTextSelected]}>
                    {opt.label}
                  </Txt>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <Txt style={styles.sexHint}>Used only to calculate your calorie needs accurately</Txt>

        <View style={styles.divider} />

        {/* Weight */}
        <View style={styles.pickerRow}>
          <View style={styles.labelCol}>
            <Txt style={styles.pickerLabel}>⚖️ Weight</Txt>
            <UnitToggle
              value={weightUnit}
              options={[
                { label: 'kg', value: 'kg' as WeightUnit },
                { label: 'lbs', value: 'lbs' as WeightUnit },
              ]}
              onChange={onChangeWeightUnit}
            />
          </View>
          <View style={styles.pickerArea}>
            <CascadePicker
              items={weightItems}
              selected={displayWeight}
              onSelect={(v) => onChangeWeight(weightUnit === 'kg' ? v : Math.round(v / 2.205))}
              unit={weightUnit}
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Height */}
        <HeightRow
          heightCm={heightCm}
          heightUnit={heightUnit}
          onChangeHeight={onChangeHeight}
          onChangeHeightUnit={onChangeHeightUnit}
        />
      </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
          <Txt style={styles.continueBtnText}>Continue</Txt>
        </TouchableOpacity>
        <Txt style={styles.privacyNote}>🔒 Your data stays private, always</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  sexOptions: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  sexChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexChipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentLight,
  },
  sexChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.secondary,
    textAlign: 'center',
  },
  sexChipTextSelected: {
    color: Colors.accent,
  },
  sexHint: {
    fontSize: 11,
    color: Colors.secondary,
    marginTop: -6,
    marginBottom: 2,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  cardWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
    lineHeight: 32,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 16,
    lineHeight: 20,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PICKER_HEIGHT,
  },
  labelCol: {
    width: 88,
    gap: 6,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  pickerArea: {
    flex: 1,
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  pickerWrapper: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  pickerHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.accentLight,
    borderRadius: 12,
    zIndex: 0,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerUnitBadge: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  pickerUnitText: {
    fontSize: 12,
    color: Colors.secondary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.accentLight,
    marginHorizontal: -16,
  },
  dualRow: {
    flex: 1,
    flexDirection: 'row',
    height: PICKER_HEIGHT,
  },
  dualDivider: {
    width: 1,
    backgroundColor: Colors.accentLight,
    marginVertical: 12,
  },
  unitToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  unitOption: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.accentLight,
  },
  unitOptionSelected: {
    backgroundColor: Colors.accent,
  },
  unitOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
  },
  unitOptionTextSelected: {
    color: Colors.surface,
  },
  continueBtn: {
    marginTop: 16,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.surface,
  },
  privacyNote: {
    fontSize: 12,
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
