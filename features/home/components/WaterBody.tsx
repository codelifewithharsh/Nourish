import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, ClipPath, G } from 'react-native-svg';
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

// Torso + arms + legs as one path, and the head as a separate circle, so
// both clip against the same water level. The inner leg gap is a real gap —
// an earlier version had it nearly closed and the figure read as a robe.
const BODY_PATH = `
  M60 44
  C68 44 75 47 79 52
  C82 56 84 62 85 69
  L88 96
  C89 103 92 118 94 128
  C95 134 92 138 87 138
  C83 138 80 135 79 130
  L75 106
  L74 140
  C74 148 73 156 72 164
  L68 224
  C68 232 64 236 59 236
  C54 236 51 232 51 225
  L54 168
  C54 164 55 160 56 156
  C57 160 58 164 58 168
  L61 225
  C61 232 58 236 53 236
  C48 236 44 232 44 224
  L40 164
  C39 156 38 148 38 140
  L37 106
  L33 130
  C32 135 29 138 25 138
  C20 138 17 134 18 128
  C20 118 23 103 24 96
  L27 69
  C28 62 30 56 33 52
  C37 47 44 44 52 44
  Z
`;

const HEAD = { cx: 56, cy: 24, r: 15 };

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
  // Full fill reaches just above the crown so 100% reads as complete.
  const surfaceY = H - ratio * (H - 4);

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
            <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
          </ClipPath>
        </Defs>

        {/* Empty body */}
        <Path d={BODY_PATH} fill="#E3E8EC" />
        <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill="#E3E8EC" />

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
