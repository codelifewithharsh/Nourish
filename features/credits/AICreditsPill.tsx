// Header-attached credits pill with tap-to-expand inline panel.
//
// Three visual states based on balance:
//   - healthy (>= 10): calm accent pill
//   - low      (1–9):  amber pill with subtle pulse
//   - empty    (0):    muted pill, label "Out"
//
// Tapping the pill expands an inline panel (LayoutAnimation) showing balance,
// next-refill copy, and a "What uses credits?" button which opens the
// WhatUsesCreditsSheet bottom sheet.

import { useState, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Sparkles, ChevronDown, HelpCircle } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useCredits } from './CreditsContext';
import { WhatUsesCreditsSheet } from './WhatUsesCreditsSheet';
import { DAILY_REFILL } from './costs';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Tone = 'healthy' | 'low' | 'empty';

function toneFor(balance: number | null): Tone {
  if (balance == null || balance >= 10) return 'healthy';
  if (balance <= 0) return 'empty';
  return 'low';
}

const TONE_STYLES: Record<Tone, { bg: string; border: string; fg: string; accent: string }> = {
  healthy: { bg: Colors.accentLight, border: 'transparent',     fg: Colors.primary, accent: Colors.accent },
  low:     { bg: '#FFF3DA',          border: '#FFD58A',         fg: '#8A5A00',      accent: '#C97A00'    },
  empty:   { bg: Colors.background,  border: Colors.border,     fg: Colors.secondary, accent: Colors.secondary },
};

export function AICreditsPill() {
  const { balance } = useCredits();
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const tone = toneFor(balance);
  const styleSet = TONE_STYLES[tone];

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    haptic.light();
    setExpanded((v) => !v);
  }, []);

  // Don't render until we know the balance — avoids a flash of "0".
  if (balance == null) return null;

  return (
    <>
      <View style={s.wrap}>
        <TouchableOpacity
          style={[s.pill, { backgroundColor: styleSet.bg, borderColor: styleSet.border, borderWidth: styleSet.border === 'transparent' ? 0 : 1.5 }]}
          onPress={toggle}
          activeOpacity={0.8}
          hitSlop={8}
        >
          <Sparkles size={11} color={styleSet.accent} strokeWidth={2.5} fill={tone === 'empty' ? undefined : styleSet.accent} fillOpacity={0.25} />
          <Txt style={[s.pillNum, { color: styleSet.accent }]}>{balance}</Txt>
          <Txt style={[s.pillLbl, { color: styleSet.fg }]}>
            {tone === 'empty' ? 'Out · refills tomorrow' : 'credits'}
          </Txt>
          <ChevronDown
            size={13}
            color={styleSet.fg}
            strokeWidth={2.5}
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={s.panel}>
            <View style={s.panelRow}>
              <View style={{ flex: 1 }}>
                <Txt style={s.panelTitle}>
                  {tone === 'empty' ? 'No credits left today' : `${balance} credits available`}
                </Txt>
                <Txt style={s.panelHint}>
                  {tone === 'empty'
                    ? `You'll get ${DAILY_REFILL} fresh credits tomorrow morning.`
                    : tone === 'low'
                      ? `Running low — ${DAILY_REFILL} fresh credits land tomorrow.`
                      : `Credits refill daily. ${DAILY_REFILL} new every morning, free.`
                  }
                </Txt>
              </View>
            </View>

            <TouchableOpacity
              style={s.helpBtn}
              onPress={() => { haptic.light(); setSheetOpen(true); }}
              activeOpacity={0.75}
            >
              <HelpCircle size={13} color={Colors.accent} strokeWidth={2.3} />
              <Txt style={s.helpBtnTxt}>What uses credits?</Txt>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <WhatUsesCreditsSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pillNum: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2, lineHeight: 17 },
  pillLbl: { fontSize: 11, fontWeight: '600', lineHeight: 14, marginRight: 2 },

  panel: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.accentLight,
  },
  panelRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  panelTitle:  { fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 18, letterSpacing: -0.2 },
  panelHint:   { fontSize: 12, color: Colors.secondary, lineHeight: 17, fontWeight: '500', marginTop: 3 },

  helpBtn:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: Colors.accentLight },
  helpBtnTxt:  { fontSize: 12, fontWeight: '700', color: Colors.accent, lineHeight: 16 },
});
