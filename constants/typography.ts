import { StyleSheet } from 'react-native';

export const FontSize = {
  sm: 13,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Typography = StyleSheet.create({
  headingXl: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    lineHeight: 38,
  },
  headingLg: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    lineHeight: 32,
  },
  headingMd: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    lineHeight: 28,
  },
  bodyLg: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    lineHeight: 24,
  },
  bodySm: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    lineHeight: 20,
  },
  labelBold: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 18,
  },
});
