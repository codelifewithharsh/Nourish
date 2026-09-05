// Shared form primitives for the profile screen.
//
// Extracted from app/(tabs)/profile.tsx, which had grown to ~1,350 lines by
// mixing six unrelated editors with the widgets they were built from. These
// four are generic and have no knowledge of what they're editing.

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, ChevronDown, Check, Minus, Plus, Sparkles, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';

// ─── Section header ────────────────────────────────────────────────────────

export function SectionTitle({
  icon, title, subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={st.wrap}>
      <View style={st.iconWrap}>{icon}</View>
      <View style={st.txtWrap}>
        <Txt style={st.title}>{title}</Txt>
        {subtitle && <Txt style={st.sub}>{subtitle}</Txt>}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginBottom: 10 },
  iconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  txtWrap:  { flex: 1 },
  title:    { fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 18, letterSpacing: -0.2 },
  sub:      { fontSize: 11, color: Colors.secondary, lineHeight: 14, marginTop: 1 },
});

// ─── Inline expanding row (numeric stepper) ────────────────────────────────

export function NumericRow({
  label, value, unit, step, min, max, isOpen, onToggle, onSave, deltaPreview,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (n: number) => void;
  deltaPreview?: (n: number) => string | null;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value, isOpen]);

  const preview = deltaPreview?.(draft);

  return (
    <View style={[nr.wrap, isOpen && nr.wrapOpen]}>
      <TouchableOpacity
        style={nr.headerRow}
        onPress={() => { haptic.light(); onToggle(); }}
        activeOpacity={0.6}
      >
        <Txt style={nr.label}>{label}</Txt>
        <View style={nr.rightSide}>
          <Txt style={nr.value}>{value} {unit}</Txt>
          <ChevronDown
            size={16}
            color={Colors.secondary}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={nr.body}>
          <View style={nr.stepperRow}>
            <TouchableOpacity
              style={[nr.stepBtn, draft <= min && nr.stepBtnDisabled]}
              onPress={() => { if (draft > min) { haptic.light(); setDraft(draft - step); } }}
              activeOpacity={0.7}
              disabled={draft <= min}
            >
              <Minus size={18} color={draft <= min ? Colors.border : Colors.accent} strokeWidth={2.5} />
            </TouchableOpacity>

            <View style={nr.draftWrap}>
              <Txt style={nr.draftVal}>{draft}</Txt>
              <Txt style={nr.draftUnit}>{unit}</Txt>
            </View>

            <TouchableOpacity
              style={[nr.stepBtn, draft >= max && nr.stepBtnDisabled]}
              onPress={() => { if (draft < max) { haptic.light(); setDraft(draft + step); } }}
              activeOpacity={0.7}
              disabled={draft >= max}
            >
              <Plus size={18} color={draft >= max ? Colors.border : Colors.accent} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {preview && (
            <View style={nr.previewRow}>
              <Sparkles size={11} color={Colors.accent} strokeWidth={2.5} />
              <Txt style={nr.previewTxt}>{preview}</Txt>
            </View>
          )}

          {draft !== value && (
            <TouchableOpacity style={nr.saveBtn} onPress={() => onSave(draft)} activeOpacity={0.85}>
              <Check size={15} color="#FFFFFF" strokeWidth={3} />
              <Txt style={nr.saveTxt}>Save change</Txt>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const nr = StyleSheet.create({
  wrap:       { backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  wrapOpen:   { backgroundColor: Colors.surface, paddingBottom: 16, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:      { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  rightSide:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value:      { fontSize: 14, fontWeight: '700', color: Colors.secondary, lineHeight: 19 },

  body:       { gap: 12, marginTop: 14 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  stepBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { backgroundColor: Colors.background },
  draftWrap:  { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 90, justifyContent: 'center' },
  draftVal:   { fontSize: 32, fontWeight: '800', color: Colors.primary, letterSpacing: -1, lineHeight: 38 },
  draftUnit:  { fontSize: 14, fontWeight: '600', color: Colors.secondary },

  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accentLight, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  previewTxt: { fontSize: 12, fontWeight: '600', color: Colors.accent, lineHeight: 16 },

  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, backgroundColor: Colors.accent, borderRadius: 11 },
  saveTxt:    { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19 },
});

// ─── Inline expanding row (option picker) ──────────────────────────────────

export function PickRow<T extends string>({
  label, value, valueLabel, options, optionLabels, isOpen, onToggle, onSelect,
}: {
  label: string;
  value: T | null;
  valueLabel: string;
  options: T[];
  optionLabels: Record<T, string>;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={[nr.wrap, isOpen && nr.wrapOpen]}>
      <TouchableOpacity
        style={nr.headerRow}
        onPress={() => { haptic.light(); onToggle(); }}
        activeOpacity={0.6}
      >
        <Txt style={nr.label}>{label}</Txt>
        <View style={nr.rightSide}>
          <Txt style={nr.value} numberOfLines={1}>{valueLabel}</Txt>
          <ChevronDown
            size={16}
            color={Colors.secondary}
            strokeWidth={2.2}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={pkr.body}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[pkr.opt, active && pkr.optActive]}
                onPress={() => { haptic.light(); onSelect(opt); }}
                activeOpacity={0.75}
              >
                <Txt style={[pkr.optTxt, active && pkr.optTxtActive]}>{optionLabels[opt]}</Txt>
                {active && <Check size={16} color={Colors.accent} strokeWidth={3} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const pkr = StyleSheet.create({
  body:         { gap: 6, marginTop: 12 },
  opt:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, backgroundColor: Colors.background },
  optActive:    { backgroundColor: Colors.accentLight },
  optTxt:       { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  optTxtActive: { color: Colors.accent, fontWeight: '700' },
});

// ─── Chip grid for multi-select preferences ────────────────────────────────

export function ChipGrid<T extends string>({
  options, labels, selected, onToggle, color,
}: {
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (v: T) => void;
  color?: string;
}) {
  const accent = color ?? Colors.accent;
  return (
    <View style={cg.grid}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[cg.chip, active && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => { haptic.light(); onToggle(opt); }}
            activeOpacity={0.75}
          >
            <Txt style={[cg.chipTxt, active && cg.chipTxtActive]}>{labels[opt]}</Txt>
            {active && <X size={11} color="#FFFFFF" strokeWidth={3} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const cg = StyleSheet.create({
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipTxt:      { fontSize: 13, fontWeight: '600', color: Colors.primary, lineHeight: 17 },
  chipTxtActive:{ color: '#FFFFFF' },
});
