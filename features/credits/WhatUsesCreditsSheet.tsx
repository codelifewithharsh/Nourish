// Bottom sheet listing what each AI action costs. Pure information —
// gives users a mental model before they spend, and reassures them that
// cached results are free.

import { useEffect, useRef } from 'react';
import {
  Modal, View, StyleSheet, TouchableOpacity, Animated, Easing, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Zap } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { AI_COSTS, DAILY_REFILL } from './costs';

export function WhatUsesCreditsSheet({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets   = useSafeAreaInsets();
  const opacity  = useRef(new Animated.Value(0)).current;
  const sheetY   = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY,  { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
    } else {
      opacity.setValue(0);
      sheetY.setValue(60);
    }
  }, [visible, opacity, sheetY]);

  const close = () => { haptic.light(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[s.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: sheetY }] }]}
        >
          <View style={s.handle} />

          <View style={s.headerRow}>
            <View style={s.titleWrap}>
              <Sparkles size={16} color={Colors.accent} strokeWidth={2.4} fill={Colors.accent} fillOpacity={0.2} />
              <Txt style={s.title}>What uses credits</Txt>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={close} hitSlop={10} activeOpacity={0.7}>
              <X size={16} color={Colors.secondary} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <Txt style={s.sub}>
            Credits power the AI features. You get {DAILY_REFILL} fresh credits every morning, free.
          </Txt>

          <View style={s.list}>
            {AI_COSTS.map((a) => (
              <View key={a.key} style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={s.rowLabel}>{a.label}</Txt>
                  <Txt style={s.rowHint}>{a.hint}</Txt>
                </View>
                <View style={s.costPill}>
                  <Txt style={s.costNum}>{a.cost}</Txt>
                  <Txt style={s.costLbl}>cr</Txt>
                </View>
              </View>
            ))}
          </View>

          <View style={s.freeCard}>
            <View style={s.freeIconWrap}>
              <Zap size={13} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} fillOpacity={0.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={s.freeTitle}>Cached results are free</Txt>
              <Txt style={s.freeBody}>
                Common plans and recipes are reused across users — you don't get charged for those.
              </Txt>
            </View>
          </View>

          <TouchableOpacity style={s.cta} onPress={close} activeOpacity={0.85}>
            <Txt style={s.ctaTxt}>Got it</Txt>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },

  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    gap: 14,
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:     { fontSize: 18, fontWeight: '800', color: Colors.primary, lineHeight: 22, letterSpacing: -0.3 },
  closeBtn:  { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  sub: { fontSize: 13, color: Colors.secondary, lineHeight: 18, fontWeight: '500' },

  list: { gap: 4, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.background,
    borderRadius: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 18 },
  rowHint:  { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },

  costPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    backgroundColor: Colors.accentLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  costNum:  { fontSize: 14, fontWeight: '800', color: Colors.accent, lineHeight: 18, letterSpacing: -0.2 },
  costLbl:  { fontSize: 10, fontWeight: '700', color: Colors.accent, lineHeight: 13, letterSpacing: 0.3 },

  freeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.accentLight,
    marginTop: 4,
  },
  freeIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  freeTitle:    { fontSize: 13, fontWeight: '800', color: Colors.primary, lineHeight: 17 },
  freeBody:     { fontSize: 12, color: Colors.secondary, lineHeight: 17, fontWeight: '500', marginTop: 2 },

  cta:    { alignItems: 'center', justifyContent: 'center', height: 50, backgroundColor: Colors.primary, borderRadius: 14, marginTop: 6 },
  ctaTxt: { fontSize: 15, fontWeight: '700', color: Colors.surface, lineHeight: 19 },
});
