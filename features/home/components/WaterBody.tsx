import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, ClipPath, G } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';
import { Minus, Plus } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';

interface Props {
  glasses: number;
  target:  number;
  onChange: (glasses: number) => void;
}

const W = 120;
const H = 250;

// A human silhouette in the 120x250 viewBox: head, shoulders, arms, legs.
const BODY_PATH = `
  M60 8
  C68 8 74 15 74 24
  C74 33 68 40 60 40
  C52 40 46 33 46 24
  C46 15 52 8 60 8
  Z
  M60 44
  C72 44 84 48 92 55
  C99 61 103 72 105 84
  L110 128
  C111 135 107 140 101 140
  C96 140 92 136 91 130
  L87 100
  L85 152
  C85 158 84 164 83 170
  L78 232
  C77 240 72 244 66 244
  C60 244 56 239 56 232
  L60 168
  L60 168
  L64 232
  C64 239 60 244 54 244
  C48 244 43 240 42 232
  L37 170
  C36 164 35 158 35 152
  L33 100
  L29 130
  C28 136 24 140 19 140
  C13 140 9 135 10 128
  L15 84
  C17 72 21 61 28 55
  C36 48 48 44 60 44
  Z
`;

/**
 * Water level rendered inside a body silhouette.
 *
 * The surface stays level while the phone tilts, the way liquid behaves in a
 * real glass. Reading the accelerometer rather than the gyroscope is
 * deliberate: gravity gives an absolute orientation, whereas a gyroscope
 * reports angular velocity and would need integrating (and would drift).
 */
export function WaterBody({ glasses, target, onChange }: Props) {
  const [tilt, setTilt] = useState(0);
  const lastTilt = useRef(0);

  useEffect(() => {
    // Sensors aren't available on web, and a failure here must never break
    // the card — it just means a flat water surface.
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | undefined;
    try {
      Accelerometer.setUpdateInterval(120);
      sub = Accelerometer.addListener(({ x }) => {
        // x is roughly -1 (left) to 1 (right) when upright. Clamp hard so a
        // shake can't send the surface vertical, and smooth so it doesn't
        // jitter on a desk.
        const raw    = Math.max(-0.6, Math.min(0.6, x));
        const target = raw * 18;                       // degrees
        const eased  = lastTilt.current + (target - lastTilt.current) * 0.25;
        lastTilt.current = eased;
        setTilt(eased);
      });
    } catch {
      /* no accelerometer — surface stays level */
    }
    return () => sub?.remove();
  }, []);

  const ratio = target > 0 ? Math.min(glasses / target, 1) : 0;
  // Never fill past the neck, so the head stays readable as a head.
  const surfaceY = H - ratio * (H - 42);

  // Tilt the surface around the body's centre.
  const rad  = (tilt * Math.PI) / 180;
  const dx   = W;
  const dy   = Math.tan(rad) * dx;

  const dec = () => { if (glasses > 0) { haptic.light(); onChange(glasses - 1); } };
  const inc = () => { if (glasses < target) { haptic.light(); onChange(glasses + 1); } };

  return (
    <View style={s.card}>
      <View style={s.left}>
        <Txt style={s.label}>Water</Txt>
        <Txt style={s.count}>
          <Txt style={s.countBig}>{glasses}</Txt>
          <Txt style={s.countTarget}> / {target}</Txt>
        </Txt>
        <Txt style={s.sub}>glasses today</Txt>

        <View style={s.controls}>
          <TouchableOpacity onPress={dec} style={s.ctrlBtn} activeOpacity={0.7} hitSlop={8}>
            <Minus size={18} color={Colors.primary} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={inc} style={[s.ctrlBtn, s.ctrlBtnPrimary]} activeOpacity={0.7} hitSlop={8}>
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor="#7FC5F5" />
            <Stop offset="1"   stopColor="#2E7CC4" />
          </LinearGradient>
          <ClipPath id="bodyClip">
            <Path d={BODY_PATH} />
          </ClipPath>
        </Defs>

        {/* Empty body */}
        <Path d={BODY_PATH} fill="#E3E8EC" />

        {/* Water, clipped to the body. The surface polygon is drawn wider
            than the body so tilting never exposes an edge. */}
        <G clipPath="url(#bodyClip)">
          <Path
            d={`M${-dx} ${surfaceY + dy} L${W + dx} ${surfaceY - dy} L${W + dx} ${H + 40} L${-dx} ${H + 40} Z`}
            fill="url(#waterFill)"
          />
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 26,
    padding: 20,
  },
  left:        { flex: 1 },
  label:       { fontSize: 13, color: Colors.secondary },
  count:       { marginTop: 4 },
  countBig:    { fontSize: 40, fontWeight: '800', color: Colors.primary, letterSpacing: -1 },
  countTarget: { fontSize: 20, fontWeight: '600', color: Colors.secondary },
  sub:         { fontSize: 13, color: Colors.secondary, marginTop: 2 },
  controls:    { flexDirection: 'row', gap: 10, marginTop: 18 },
  ctrlBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnPrimary: { backgroundColor: '#3E9BD6' },
});
