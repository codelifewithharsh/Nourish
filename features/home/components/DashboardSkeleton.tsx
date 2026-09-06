import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Colors } from '@/constants/colors';

/**
 * Placeholder for the dashboard's first load.
 *
 * Deliberately mirrors the real layout — same card radii, the same 64/36
 * macro-water split, the meal card's left stripe — so the screen doesn't
 * visibly rearrange when data lands. A centred spinner told the user nothing
 * about what was coming and left the screen blank on a slow connection.
 *
 * No text, not even placeholder words: invented numbers that resolve to
 * different real ones read as a glitch.
 */
export function DashboardSkeleton() {
  // One shared pulse drives every block, so the whole screen breathes
  // together rather than shimmering out of step.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });

  const Block = ({ style }: { style?: object }) => (
    <Animated.View style={[sk.block, style, { opacity }]} />
  );

  return (
    <View style={sk.wrap}>
      {/* Header: avatar + greeting, bell on the right */}
      <View style={sk.topBar}>
        <View style={sk.topLeft}>
          <Block style={sk.avatar} />
          <View style={sk.gapSm}>
            <Block style={{ width: 74, height: 11, borderRadius: 6 }} />
            <Block style={{ width: 96, height: 17, borderRadius: 6 }} />
          </View>
        </View>
        <Block style={sk.bell} />
      </View>

      {/* Intake card — the tallest block, so it anchors the page height */}
      <Animated.View style={[sk.intakeCard, { opacity }]}>
        <View style={sk.gapMd}>
          <Block style={{ width: 150, height: 15, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.55)' }} />
          <Block style={{ width: 110, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)' }} />
        </View>
        <Block style={sk.gauge} />
      </Animated.View>

      {/* Macros and water share a row; water takes the right ~36% */}
      <View style={sk.macroRow}>
        <View style={sk.nutritionCard}>
          <View style={sk.cardHeader}>
            <Block style={sk.headerIcon} />
            <Block style={{ width: 90, height: 15, borderRadius: 6 }} />
          </View>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={sk.nutrientRow}>
              <View style={sk.nutrientLabels}>
                <Block style={{ width: 52, height: 12, borderRadius: 6 }} />
                <Block style={{ width: 66, height: 12, borderRadius: 6 }} />
              </View>
              <Block style={sk.bar} />
            </View>
          ))}
        </View>

        <View style={sk.waterCard}>
          <Block style={{ width: 44, height: 12, borderRadius: 6 }} />
          <Block style={sk.figure} />
          <Block style={{ width: 52, height: 22, borderRadius: 6 }} />
          <View style={sk.waterBtns}>
            <Block style={sk.ctrl} />
            <Block style={sk.ctrl} />
          </View>
        </View>
      </View>

      {/* Next meal card, with its left status stripe */}
      <View style={sk.mealCard}>
        <Block style={sk.stripe} />
        <View style={sk.mealBody}>
          <View style={sk.mealTop}>
            <Block style={{ width: 108, height: 15, borderRadius: 6 }} />
            <Block style={{ width: 68, height: 20, borderRadius: 999 }} />
          </View>
          <Block style={{ width: '72%', height: 20, borderRadius: 6 }} />
          <View style={sk.pillRow}>
            <Block style={sk.pill} />
            <Block style={sk.pill} />
          </View>
          <View style={sk.btnRow}>
            <Block style={sk.btnWide} />
            <Block style={sk.btn} />
            <Block style={sk.btn} />
          </View>
        </View>
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  wrap:  { padding: 20, gap: 14 },
  block: { backgroundColor: Colors.border },
  gapSm: { gap: 6 },
  gapMd: { gap: 12 },

  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:  { width: 44, height: 44, borderRadius: 13 },
  bell:    { width: 40, height: 40, borderRadius: 20 },

  intakeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.intakeCard, borderRadius: 26,
    paddingVertical: 16, paddingHorizontal: 22,
  },
  gauge: { width: 116, height: 116, borderRadius: 58, backgroundColor: 'rgba(255,255,255,0.55)' },

  macroRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  nutritionCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 26, padding: 18 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  headerIcon:    { width: 30, height: 30, borderRadius: 15 },
  nutrientRow:   { gap: 7, marginBottom: 13 },
  nutrientLabels:{ flexDirection: 'row', justifyContent: 'space-between' },
  bar:           { height: 6, borderRadius: 999 },

  waterCard: {
    width: '36%', backgroundColor: Colors.surface, borderRadius: 26,
    paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', gap: 10,
  },
  figure:    { width: 62, height: 118, borderRadius: 12 },
  waterBtns: { flexDirection: 'row', gap: 8 },
  ctrl:      { width: 34, height: 34, borderRadius: 17 },

  mealCard: { backgroundColor: Colors.surface, borderRadius: 18, overflow: 'hidden' },
  stripe:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  mealBody: { padding: 16, paddingLeft: 20, gap: 10 },
  mealTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pillRow:  { flexDirection: 'row', gap: 6 },
  pill:     { width: 78, height: 24, borderRadius: 999 },
  btnRow:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnWide:  { flex: 2, height: 44, borderRadius: 12 },
  btn:      { flex: 1, height: 44, borderRadius: 12 },
});
