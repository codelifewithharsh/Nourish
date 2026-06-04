import { useEffect, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { Txt } from './Typography';
import { TOAST_EVENT, ToastPayload, ToastType } from '@/lib/toast';

const ACCENT: Record<ToastType, string> = {
  success: Colors.accent,
  error:   '#E05C2A',
  info:    Colors.primary,
};

export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const timer      = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TOAST_EVENT, (payload: ToastPayload) => {
      clearTimeout(timer.current);
      setToast(payload);
      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
          .start(() => setToast(null));
      }, 2800);
    });
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, []);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        { top: insets.top + 8, borderLeftColor: ACCENT[toast.type] },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={[s.dot, { backgroundColor: ACCENT[toast.type] }]} />
      <Txt style={s.txt}>{toast.message}</Txt>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9999,
  },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  txt: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.primary, lineHeight: 18 },
});
