import { useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Share, Modal, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, X, Share2 } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { analytics } from '@/lib/analytics';

const APP_LINK = 'https://apps.apple.com/app/nourish'; // replace when live

function getMilestoneLabel(streak: number): string {
  if (streak >= 30) return '30-day champion 🏆';
  if (streak >= 14) return '2-week streak 💪';
  if (streak >= 7)  return '7-day streak ⚡';
  return '3-day streak 🌱';
}

function getMilestoneMessage(streak: number, name: string): string {
  const first = name.split(' ')[0];
  if (streak >= 30) return `${first} is unstoppable — 30 days of consistent eating with Nourish 🏆`;
  if (streak >= 14) return `2 weeks straight! ${first} has been eating right every single day with Nourish 💪`;
  if (streak >= 7)  return `7 days, no excuses. ${first} just hit a 7-day streak on Nourish ⚡`;
  return `Day ${streak} and going strong! ${first} is building a healthy eating habit with Nourish 🌱`;
}

export function StreakShareModal({
  visible,
  streak,
  userName,
  onClose,
}: {
  visible:  boolean;
  streak:   number;
  userName: string;
  onClose:  () => void;
}) {
  const insets  = useSafeAreaInsets();
  const slideY  = useRef(new Animated.Value(500)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slideY,  { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      slideY.setValue(500);
      opacity.setValue(0);
      onClose();
    });
  };

  const handleShare = async () => {
    const message = getMilestoneMessage(streak, userName);
    const text = `${message}\n\nJoin me → ${APP_LINK}`;
    try {
      await Share.share({ message: text });
      analytics.streakShared({ streak });
    } catch {
      // dismissed
    }
  };

  if (!visible) return null;

  const label = getMilestoneLabel(streak);

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[sh.backdrop, { opacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>
      <Animated.View style={[sh.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideY }] }]}>
        <View style={sh.handle} />

        <TouchableOpacity style={sh.closeBtn} onPress={handleClose} activeOpacity={0.7}>
          <X size={16} color={Colors.secondary} strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Hero */}
        <View style={sh.hero}>
          <View style={sh.flameCircle}>
            <Flame size={32} color="#FF6B35" strokeWidth={2} fill="#FF6B35" fillOpacity={0.2} />
          </View>
          <Txt style={sh.streakNumber}>{streak}</Txt>
          <Txt style={sh.streakUnit}>day streak</Txt>
          <Txt style={sh.label}>{label}</Txt>
        </View>

        {/* Preview card */}
        <View style={sh.previewCard}>
          <Txt style={sh.previewText}>{getMilestoneMessage(streak, userName)}</Txt>
          <Txt style={sh.previewLink}>Join me → nourish.app</Txt>
        </View>

        {/* Share CTA */}
        <TouchableOpacity style={sh.shareBtn} onPress={handleShare} activeOpacity={0.88}>
          <Share2 size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Txt style={sh.shareBtnTxt}>Share your streak</Txt>
        </TouchableOpacity>

        <Txt style={sh.hint}>Inspire a friend to eat better too</Txt>
      </Animated.View>
    </Modal>
  );
}

const sh = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    gap: 14,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: 16, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  hero: { alignItems: 'center', paddingTop: 8, gap: 4 },
  flameCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  streakNumber: { fontSize: 56, fontWeight: '800', color: Colors.primary, lineHeight: 62, letterSpacing: -2 },
  streakUnit:   { fontSize: 16, fontWeight: '600', color: Colors.secondary, lineHeight: 22 },
  label:        { fontSize: 14, fontWeight: '700', color: Colors.accent, marginTop: 4 },

  previewCard: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  previewText: { fontSize: 14, color: Colors.primary, lineHeight: 20, fontWeight: '500' },
  previewLink: { fontSize: 12, color: Colors.accent, fontWeight: '600' },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52,
    backgroundColor: Colors.accent, borderRadius: 14,
  },
  shareBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  hint: { fontSize: 12, color: Colors.secondary, textAlign: 'center', marginBottom: 4 },
});
