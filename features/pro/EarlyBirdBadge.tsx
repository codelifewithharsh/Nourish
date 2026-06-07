// Early Bird Pro badge — appears on the profile screen header.
//
// Visual: small pill with a crown + "Early Bird Pro" label and a faint
// shimmer accent so it feels like a real status, not a flat tag. Tapping
// it opens EarlyBirdSheet which explains what Pro gives them.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Crown, Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useProMember } from './ProContext';
import { EarlyBirdSheet } from './EarlyBirdSheet';

export function EarlyBirdBadge() {
  const { isPro, isEarlyBird, proSince, pricing } = useProMember();
  const [open, setOpen] = useState(false);
  const shimmer = useRef(new Animated.Value(0)).current;

  // Slow, subtle shimmer that loops forever. ~4s per cycle so it never
  // feels busy — just lightly alive.
  useEffect(() => {
    if (!isPro) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isPro, shimmer]);

  if (!isPro) return null;

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-40, 120] });

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => { haptic.light(); setOpen(true); }}
        style={s.wrap}
      >
        <View style={s.crownWrap}>
          <Crown size={11} color={Colors.accent} strokeWidth={2.6} fill={Colors.accent} fillOpacity={0.35} />
        </View>
        <Txt style={s.label}>
          {isEarlyBird ? 'Early Bird Pro' : 'Pro'}
        </Txt>
        <View style={s.dot} />
        <Sparkles size={10} color={Colors.accent} strokeWidth={2.4} fill={Colors.accent} fillOpacity={0.3} />

        {/* Soft shimmer overlay */}
        <Animated.View style={[s.shimmer, { transform: [{ translateX }] }]} pointerEvents="none" />
      </TouchableOpacity>

      <EarlyBirdSheet
        visible={open}
        onClose={() => setOpen(false)}
        proSince={proSince}
        normalPrice={pricing.normalPrice}
        userPrice={pricing.userPrice}
      />
    </>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: 'rgba(76,175,130,0.25)',
    overflow: 'hidden',
  },
  crownWrap: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  dot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: Colors.accent,
    opacity: 0.45,
  },
  shimmer: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ skewX: '-22deg' }],
    opacity: 0.55,
  },
});
