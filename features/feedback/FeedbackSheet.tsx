import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, StyleSheet, TouchableOpacity, Animated, Easing, Pressable,
  TextInput, Platform, PanResponder, ScrollView, ActivityIndicator, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Bug, Lightbulb, MessageCircle, Send, CheckCircle2 } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';

type FeedbackType = 'bug' | 'feature' | 'other';

interface Props {
  visible:    boolean;
  onClose:    () => void;
  userId?:    string | null;
  userEmail?: string | null;
}

const TYPES: { key: FeedbackType; label: string; icon: typeof Bug; hint: string }[] = [
  { key: 'bug',     label: 'Something broke',  icon: Bug,           hint: 'Describe what happened and when.' },
  { key: 'feature', label: 'I wish Nourish…',  icon: Lightbulb,     hint: 'What would make your day easier?' },
  { key: 'other',   label: 'Just a thought',   icon: MessageCircle, hint: 'Anything at all — we read every word.' },
];

export function FeedbackSheet({ visible, onClose, userId, userEmail }: Props) {
  const insets  = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const sheetY  = useRef(new Animated.Value(60)).current;
  // Tracks how far up the sheet should shift when the keyboard is open.
  const kbOffset = useRef(new Animated.Value(0)).current;

  const [type,    setType]    = useState<FeedbackType>('feature');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  const activeHint = TYPES.find(t => t.key === type)?.hint ?? '';

  // Keyboard listeners — lift the sheet up exactly as much as the keyboard
  // takes, minus the safe-area bottom so we don't over-shoot.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const duration  = Platform.OS === 'ios' ? 250 : 180;

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const lift = e.endCoordinates.height - insets.bottom;
      Animated.timing(kbOffset, {
        toValue: lift,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(kbOffset, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [insets.bottom, kbOffset]);

  useEffect(() => {
    if (visible) {
      setDone(false);
      setMessage('');
      setType('feature');
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY,  { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();
    } else {
      Keyboard.dismiss();
      opacity.setValue(0);
      sheetY.setValue(60);
      kbOffset.setValue(0);
    }
  }, [visible]);

  const animateDismiss = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start(() => { haptic.light(); onClose(); });
  };

  const dragResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove:  (_, g) => { if (g.dy > 0) sheetY.setValue(g.dy); },
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

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) { haptic.warning(); return; }
    if (!userId) { haptic.warning(); return; }
    Keyboard.dismiss();
    haptic.medium();
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('feedback').insert({
        user_id: userId,
        type,
        message: trimmed,
        contact: userEmail ?? null,
      });
      analytics.feedbackSubmitted({ type });
      setDone(true);
      setTimeout(animateDismiss, 1800);
    } catch {
      haptic.warning();
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = message.trim().length >= 10 && !loading && !done;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateDismiss} statusBarTranslucent hardwareAccelerated>
      <Animated.View style={[s.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateDismiss} />

        {/* kbOffset lifts the whole sheet; sheetY handles enter/drag animation */}
        <Animated.View style={[
          s.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY: sheetY }, { translateY: Animated.multiply(kbOffset, -1) }] },
        ]}>
          {/* Drag handle */}
          <View {...dragResponder.panHandlers}>
            <View style={s.handle} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scroll}
          >
            {/* Header */}
            <View style={s.header} {...dragResponder.panHandlers}>
              <View style={s.iconCircle}>
                <MessageCircle size={20} color={Colors.accent} strokeWidth={2.2} />
              </View>
              <View style={s.headerText}>
                <Txt style={s.title}>Share your thoughts</Txt>
                <Txt style={s.subtitle}>We read every single message</Txt>
              </View>
              <TouchableOpacity onPress={animateDismiss} hitSlop={12} style={s.closeBtn}>
                <X size={18} color={Colors.secondary} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {done ? (
              <View style={s.successWrap}>
                <CheckCircle2 size={48} color={Colors.accent} strokeWidth={1.8} />
                <Txt style={s.successTitle}>Thank you 🙏</Txt>
                <Txt style={s.successBody}>Your feedback helps shape Nourish. We'll be in touch.</Txt>
              </View>
            ) : (
              <>
                {/* Type chips */}
                <View style={s.chips}>
                  {TYPES.map(({ key, label, icon: Icon }) => {
                    const active = type === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[s.chip, active && s.chipActive]}
                        onPress={() => { haptic.light(); setType(key); }}
                        activeOpacity={0.75}
                      >
                        <Icon size={13} color={active ? Colors.accent : Colors.secondary} strokeWidth={2.4} />
                        <Txt style={[s.chipTxt, active && s.chipTxtActive]}>{label}</Txt>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Message input */}
                <View style={s.inputWrap}>
                  <TextInput
                    style={s.input}
                    placeholder={activeHint}
                    placeholderTextColor={Colors.secondary}
                    multiline
                    maxLength={2000}
                    value={message}
                    onChangeText={setMessage}
                    textAlignVertical="top"
                    returnKeyType="default"
                  />
                  <Txt style={s.charCount}>{message.length}/2000</Txt>
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[s.submitBtn, !canSubmit && s.submitDisabled]}
                  onPress={submit}
                  activeOpacity={0.85}
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Send size={15} color="#fff" strokeWidth={2.2} />
                      <Txt style={s.submitTxt}>Send feedback</Txt>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    // Fixed height so the button is always visible without scrolling.
    // Tall enough for header + chips + input + button; short enough to fit most screens.
    maxHeight: '78%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title:    { fontSize: 16, fontWeight: '700', color: Colors.primary, lineHeight: 21 },
  subtitle: { fontSize: 12, color: Colors.secondary, lineHeight: 16, marginTop: 1 },
  closeBtn: { padding: 4 },

  // Type chips
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accent,
  },
  chipTxt:       { fontSize: 12, fontWeight: '600', color: Colors.secondary },
  chipTxtActive: { color: Colors.accent },

  // Message input — shorter so button stays in frame
  inputWrap: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 12,
    padding: 12,
  },
  input: {
    fontSize: 14,
    color: Colors.primary,
    lineHeight: 21,
    minHeight: 72,   // 3 lines — enough to write, not so tall it hides the button
    maxHeight: 120,
  },
  charCount: {
    fontSize: 10,
    color: Colors.secondary,
    textAlign: 'right',
    marginTop: 4,
  },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
  },
  submitDisabled: { opacity: 0.45 },
  submitTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Success
  successWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  successBody:  {
    fontSize: 14, color: Colors.secondary, textAlign: 'center',
    lineHeight: 21, paddingHorizontal: 12,
  },
});
