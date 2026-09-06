import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Path, Circle, Defs, ClipPath, G } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';
import { Plus, Minus } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';

interface Props {
  glasses:  number;
  target:   number;
  onChange: (glasses: number) => void;
}

const W = 96;
const H = 172;
// Rendered size relative to the 96x172 drawing space, sized to sit
// comfortably inside the water column beside the nutrition card.
const SCALE = 0.72;

// An outlined figure that fills as water rises, per the reference. The head
// is a separate circle so it shares the same clip and fills last.
const HEAD = { cx: 48, cy: 16, r: 12.5 };

// Torso, arms down the sides, two legs — one closed shape. Kept simple on
// purpose: at this size extra detail turns to mush.
const FIGURE = `
  M48 34
  C56 34 62 38 64 44
  L67 56
  C68 60 69 64 69 68
  L70 96
  C70 100 68 102 65 102
  C62 102 60 100 60 96
  L59 70
  L58 70
  L58 106
  C58 112 57 118 57 124
  L55 162
  C55 167 52 170 49 170
  C46 170 44 167 44 162
  L46 126
  L48 112
  L50 126
  L52 162
  C52 167 50 170 47 170
  C44 170 41 167 41 162
  L39 124
  C39 118 38 112 38 106
  L38 70
  L37 70
  L36 96
  C36 100 34 102 31 102
  C28 102 26 100 26 96
  L27 68
  C27 64 28 60 29 56
  L32 44
  C34 38 40 34 48 34
  Z
`;

/**
 * Water level inside a body outline.
 *
 * The surface is two overlapping sine waves rather than a straight line, so
 * it reads as liquid. It stays level as the phone tilts because the
 * accelerometer reports absolute orientation from gravity — a gyroscope
 * measures angular velocity, which would need integrating and would drift.
 */
export function WaterBody({ glasses, target, onChange }: Props) {
  const [tilt, setTilt]   = useState(0);
  const [phase, setPhase] = useState(0);
  const lastTilt = useRef(0);

  // Wave motion runs independently of the sensor so the water is alive even
  // on a device lying flat on a table.
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 0.12) % (Math.PI * 2)), 70);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | undefined;
    try {
      Accelerometer.setUpdateInterval(120);
      sub = Accelerometer.addListener(({ x }) => {
        const clamped = Math.max(-0.6, Math.min(0.6, x));
        const next    = clamped * 16;
        const eased   = lastTilt.current + (next - lastTilt.current) * 0.25;
        lastTilt.current = eased;
        setTilt(eased);
      });
    } catch {
      /* no accelerometer — the surface simply stays level */
    }
    return () => sub?.remove();
  }, []);

  const ratio    = target > 0 ? Math.min(glasses / target, 1) : 0;
  const surfaceY = H - ratio * (H - 6);

  // Two waves of different wavelength, amplitude and offset. Where they
  // overlap the crests reinforce and cancel, which is what stops the surface
  // looking mechanical.
  const wavePath = (amp: number, len: number, shift: number) => {
    const dy = Math.tan((tilt * Math.PI) / 180) * (W / 2);
    let d = '';
    for (let x = -20; x <= W + 20; x += 4) {
      const t    = (x / len) * Math.PI * 2 + phase + shift;
      const lean = ((x - W / 2) / (W / 2)) * -dy;
      const y    = surfaceY + lean + Math.sin(t) * amp;
      d += `${x === -20 ? 'M' : ' L'}${x} ${y}`;
    }
    d += ` L${W + 20} ${H + 30} L-20 ${H + 30} Z`;
    return d;
  };

  const dec = () => { if (glasses > 0)      { haptic.light(); onChange(glasses - 1); } };
  const inc = () => { if (glasses < target) { haptic.light(); onChange(glasses + 1); } };

  return (
    <View style={s.card}>
      <Txt style={s.label}>Water</Txt>

      <Svg width={W * SCALE} height={H * SCALE} viewBox={`0 0 ${W} ${H}`} style={s.figure}>
        <Defs>
          <ClipPath id="figureClip">
            <Path d={FIGURE} />
            <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
          </ClipPath>
        </Defs>

        {/* Empty outline */}
        <Path d={FIGURE} fill="none" stroke={Colors.water} strokeWidth={2.5} />
        <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill="none" stroke={Colors.water} strokeWidth={2.5} />

        {/* Water, clipped to the figure. Back wave first, then front. */}
        <G clipPath="url(#figureClip)">
          <Path d={wavePath(3.6, 34, 1.6)} fill={Colors.waterLight} opacity={0.8} />
          <Path d={wavePath(2.6, 25, 0)}   fill={Colors.water} />
        </G>
      </Svg>

      <Txt style={s.count}>
        <Txt style={s.countBig}>{glasses}</Txt>
        <Txt style={s.countTarget}>/{target}</Txt>
      </Txt>

      <View style={s.controls}>
        <TouchableOpacity onPress={dec} style={s.ctrlBtn} activeOpacity={0.7} hitSlop={6}>
          <Minus size={16} color={Colors.water} strokeWidth={2.6} />
        </TouchableOpacity>
        <TouchableOpacity onPress={inc} style={[s.ctrlBtn, s.ctrlBtnPrimary]} activeOpacity={0.7} hitSlop={6}>
          <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 26,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  label:       { fontSize: 13, fontWeight: '600', color: Colors.secondary },
  figure:      { marginTop: 8 },
  count:       { marginTop: 8 },
  countBig:    { fontSize: 26, fontWeight: '800', color: Colors.primary, letterSpacing: -0.5 },
  countTarget: { fontSize: 15, fontWeight: '600', color: Colors.secondary },
  controls:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  ctrlBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnPrimary: { backgroundColor: Colors.water },
});
