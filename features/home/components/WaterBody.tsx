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

const W = 84;
const H = 132;

// An outlined figure that fills as water rises, per the reference. The head
// is a separate circle so it shares the same clip and fills last.
const HEAD = { cx: 42, cy: 15, r: 11.5 };

// Torso, arms down the sides, two legs — one closed shape. Kept simple on
// purpose: at this size extra detail turns to mush.
// Figure built from the reference as five rounded shapes — torso, two arms,
// two legs — plus the head circle. Kept separate rather than merged into one
// path so every limb keeps its rounded caps; a single path forced sharp
// joins wherever a limb met the torso.
const TORSO = 'M36.5 32.0 H47.5 A9.5 9.5 0 0 1 57.0 41.5 V68.5 A9.5 9.5 0 0 1 47.5 78.0 H36.5 A9.5 9.5 0 0 1 27.0 68.5 V41.5 A9.5 9.5 0 0 1 36.5 32.0 Z';
const ARM_L = 'M21.2 39.0 H21.2 A4.8 4.8 0 0 1 26.0 43.8 V80.2 A4.8 4.8 0 0 1 21.2 85.0 H21.2 A4.8 4.8 0 0 1 16.5 80.2 V43.8 A4.8 4.8 0 0 1 21.2 39.0 Z';
const ARM_R = 'M62.8 39.0 H62.8 A4.8 4.8 0 0 1 67.5 43.8 V80.2 A4.8 4.8 0 0 1 62.8 85.0 H62.8 A4.8 4.8 0 0 1 58.0 80.2 V43.8 A4.8 4.8 0 0 1 62.8 39.0 Z';
const LEG_L = 'M35.0 74.0 H35.5 A5.5 5.5 0 0 1 41.0 79.5 V118.5 A5.5 5.5 0 0 1 35.5 124.0 H35.0 A5.5 5.5 0 0 1 29.5 118.5 V79.5 A5.5 5.5 0 0 1 35.0 74.0 Z';
const LEG_R = 'M48.5 74.0 H49.0 A5.5 5.5 0 0 1 54.5 79.5 V118.5 A5.5 5.5 0 0 1 49.0 124.0 H48.5 A5.5 5.5 0 0 1 43.0 118.5 V79.5 A5.5 5.5 0 0 1 48.5 74.0 Z';

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

      <Svg width={W} height={H} style={s.figure}>
        <Defs>
          <ClipPath id="figureClip">
            <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
            <Path d={TORSO} />
            <Path d={ARM_L} /><Path d={ARM_R} />
            <Path d={LEG_L} /><Path d={LEG_R} />
          </ClipPath>
        </Defs>

        {/* Empty figure */}
        <G fill={Colors.waterEmpty}>
          <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
          <Path d={TORSO} />
          <Path d={ARM_L} /><Path d={ARM_R} />
          <Path d={LEG_L} /><Path d={LEG_R} />
        </G>

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
