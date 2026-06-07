// OG avatar wrapper.
//
// Wraps any avatar with a thin brand-accent gradient ring when the user is
// an OG member. Non-members get the avatar untouched. The ring is the badge
// — no chip, no text overlay. It communicates status the same way Gemini
// Advanced or Instagram Stories rings do: a quiet visual signal that the
// person inside is part of something.
//
// Visual spec:
//   - 2px ring thickness (1.75 on smaller avatars feels too thin on Android)
//   - Gradient: accentLight → mid mint → accent — soft top, deep bottom
//   - Ring sits OUTSIDE the avatar so the avatar size stays the prop value;
//     the wrapper grows by `2 * (ring + gap)` and centers the avatar inside.
//   - A 1.5px breathing gap between the ring and the avatar prevents the
//     gradient from looking pasted-on.
//
// Usage:
//   <OGAvatar size={48} radius={14}>
//     <Image source={...} style={{ width: 48, height: 48, borderRadius: 14 }} />
//   </OGAvatar>
//
// `radius` is the corner radius of the inner avatar — the ring matches it
// plus the ring offset, so rounded squares stay rounded squares.

import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useProMember } from './ProContext';

interface Props {
  size:      number;
  radius:    number;
  children:  ReactNode;
  /** Force the ring on/off, overriding membership. Used for previews / sheets. */
  forceOG?:  boolean;
}

const RING_THICKNESS = 2;
const RING_GAP       = 1.5;
const TOTAL_PAD      = RING_THICKNESS + RING_GAP;

export function OGAvatar({ size, radius, children, forceOG }: Props) {
  // The hook is called unconditionally; the result is only consulted when
  // forceOG isn't provided. Keeps Rules-of-Hooks happy regardless of usage.
  const { isPro } = useProMember();
  const show = forceOG ?? isPro;

  if (!show) {
    // Plain pass-through — no extra wrapper, no layout shift cost.
    return <>{children}</>;
  }

  const wrapperSize  = size + TOTAL_PAD * 2;
  const wrapperRad   = radius + TOTAL_PAD;
  const innerHoleRad = radius + RING_GAP;

  return (
    <View
      style={{
        width:        wrapperSize,
        height:       wrapperSize,
        borderRadius: wrapperRad,
      }}
    >
      <LinearGradient
        colors={[Colors.accentLight, '#6FB89A', Colors.accent]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: wrapperRad },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          top:    RING_THICKNESS,
          left:   RING_THICKNESS,
          right:  RING_THICKNESS,
          bottom: RING_THICKNESS,
          borderRadius: innerHoleRad,
          backgroundColor: Colors.surface,
          alignItems:     'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
