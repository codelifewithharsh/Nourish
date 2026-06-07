// Bottom sheet that explains the Early Bird Pro membership.
//
// Pure information — opened from the Pro badge on the profile screen. The
// goal is to make users feel they're getting something genuinely valuable
// for free (because they are), and to soft-anchor the price for when paid
// plans roll out later.

import { useEffect, useMemo, useRef } from 'react';
import {
  Modal, View, StyleSheet, TouchableOpacity, Animated, Easing, Pressable, ScrollView, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Check, Crown, Calendar, Heart } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';

interface Props {
  visible:      boolean;
  onClose:      () => void;
  proSince?:    string | null;
  /** Crossed-out comparison price, e.g. "₹299/yr". */
  normalPrice?: string;
  /** What the user actually pays, e.g. "Free". */
  userPrice?:   string;
}

const PERKS = [
  { title: 'Unlimited 7-day meal plans',  body: 'Regenerate whenever your taste or goals change.' },
  { title: 'Unlimited recipe deep-dives', body: 'Full ingredients, steps, and chef tips for every meal.' },
  { title: 'Unlimited meal swaps',        body: 'Don\'t love a meal? Swap for something that fits.' },
  { title: 'AI food logging',             body: 'Type what you ate — macros calculated instantly.' },
  { title: 'Smart kitchen suggestions',   body: 'Plans built around what you already have at home.' },
  { title: 'Priority access to features', body: 'You\'ll get every new tool before anyone else.' },
];

function formatProSince(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

export function EarlyBirdSheet({
  visible, onClose, proSince,
  normalPrice = '₹299/yr',
  userPrice   = 'Free',
}: Props) {
  const insets  = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const sheetY  = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY,  { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
    } else {
      opacity.setValue(0);
      sheetY.setValue(60);
    }
  }, [visible, opacity, sheetY]);

  const close = () => { haptic.light(); onClose(); };

  // Smooth animated dismiss — slide sheet down, fade backdrop, then close.
  const animateDismiss = () => {
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start(() => close());
  };

  // Drag-to-dismiss. Attached to a slim "drag zone" at the top of the sheet
  // (handle + hero area). Body remains a scrollable ScrollView so the perks
  // list still works. Threshold: 100px drop or >0.5 px/ms velocity dismisses;
  // anything less springs back.
  const dragResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          animateDismiss();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 9 }).start();
        }
      },
    }),
    [],
  );

  const since = formatProSince(proSince);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateDismiss} statusBarTranslucent>
      <Animated.View style={[s.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateDismiss} />
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: sheetY }] }]}
        >
          {/* Drag zone — handle + hero respond to swipe-down. The ScrollView
              below this still scrolls normally. */}
          <View {...dragResponder.panHandlers}>
            <View style={s.handle} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
            {/* Hero crown — also part of the drag zone */}
            <View style={s.heroWrap} {...dragResponder.panHandlers}>
              <View style={s.crownGlow} />
              <View style={s.crownCircle}>
                <Crown size={28} color={Colors.accent} strokeWidth={2.2} fill={Colors.accent} fillOpacity={0.25} />
              </View>
              <View style={s.earlyBirdChip}>
                <Sparkles size={10} color={Colors.accent} strokeWidth={2.6} fill={Colors.accent} fillOpacity={0.35} />
                <Txt style={s.earlyBirdChipTxt}>EARLY BIRD</Txt>
              </View>
            </View>

            <Txt style={s.title}>You're a Pro member</Txt>
            <Txt style={s.subtitle}>
              Thanks for joining Nourish early. As a thank you, you get full Pro access — completely free.
            </Txt>

            {/* Value chip */}
            <View style={s.valueRow}>
              <View style={s.valueChip}>
                <Txt style={s.valueLabel}>Normally</Txt>
                <Txt style={s.valueStrike}>{normalPrice}</Txt>
              </View>
              <View style={[s.valueChip, s.valueChipFree]}>
                <Txt style={[s.valueLabel, s.valueLabelFree]}>Your price</Txt>
                <Txt style={s.valueFree}>{userPrice}</Txt>
              </View>
            </View>

            {/* Perks list */}
            <View style={s.perks}>
              {PERKS.map((p) => (
                <View key={p.title} style={s.perkRow}>
                  <View style={s.perkTick}>
                    <Check size={12} color={Colors.accent} strokeWidth={3} />
                  </View>
                  <View style={s.perkText}>
                    <Txt style={s.perkTitle}>{p.title}</Txt>
                    <Txt style={s.perkBody}>{p.body}</Txt>
                  </View>
                </View>
              ))}
            </View>

            {/* Member-since card */}
            {since && (
              <View style={s.sinceCard}>
                <Calendar size={14} color={Colors.secondary} strokeWidth={2.2} />
                <Txt style={s.sinceTxt}>Pro member since {since}</Txt>
              </View>
            )}

            {/* Heart-felt close */}
            <View style={s.thanksCard}>
              <Heart size={14} color={Colors.accent} strokeWidth={2.4} fill={Colors.accent} fillOpacity={0.3} />
              <Txt style={s.thanksTxt}>
                Early members shape what Nourish becomes. We're grateful you're here.
              </Txt>
            </View>
          </ScrollView>

          {/* Header close — overlaid */}
          <TouchableOpacity style={s.closeBtn} onPress={animateDismiss} hitSlop={10} activeOpacity={0.7}>
            <X size={16} color={Colors.secondary} strokeWidth={2.4} />
          </TouchableOpacity>

          <TouchableOpacity style={s.cta} onPress={animateDismiss} activeOpacity={0.85}>
            <Txt style={s.ctaTxt}>Got it</Txt>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    maxHeight: '92%',
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingHorizontal: 22, paddingTop: 4, gap: 14 },

  // Hero
  heroWrap: { alignItems: 'center', marginTop: 28, marginBottom: 4 },
  crownGlow: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.accentLight,
    top: -16,
    opacity: 0.7,
  },
  crownCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.accentLight,
  },
  earlyBirdChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    marginTop: 10,
  },
  earlyBirdChipTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    lineHeight: 13,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 27,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.secondary,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '500',
    paddingHorizontal: 6,
  },

  // Value row
  valueRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  valueChip: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.background,
  },
  valueChipFree: {
    backgroundColor: Colors.accentLight,
  },
  valueLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 13,
    textAlign: 'center',
    alignSelf: 'center',
  },
  valueLabelFree: {
    color: Colors.accent,
  },
  valueStrike: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.secondary,
    textDecorationLine: 'line-through',
    lineHeight: 21,
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'center',
  },
  valueFree: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.accent,
    letterSpacing: -0.3,
    lineHeight: 23,
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'center',
  },

  // Perks
  perks: { gap: 2, marginTop: 6 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  perkTick: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  perkText: { flex: 1, gap: 2 },
  perkTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, lineHeight: 18 },
  perkBody:  { fontSize: 12, color: Colors.secondary, lineHeight: 16, fontWeight: '500' },

  // Member since
  sinceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignSelf: 'center',
    marginTop: 6,
  },
  sinceTxt: { fontSize: 12, color: Colors.secondary, fontWeight: '600', lineHeight: 16 },

  thanksCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.accentLight,
    marginTop: 6,
  },
  thanksTxt: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 17, fontWeight: '500' },

  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    marginTop: 14,
    marginHorizontal: 22,
  },
  ctaTxt: { fontSize: 15, fontWeight: '700', color: Colors.surface, lineHeight: 19, letterSpacing: -0.1 },
});
