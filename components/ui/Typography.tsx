import React from 'react';
import { Text, TextProps } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography as TypographyStyles } from '@/constants/typography';

type Variant =
  | 'headingXl'
  | 'headingLg'
  | 'headingMd'
  | 'bodyLg'
  | 'bodySm'
  | 'labelBold';

interface TypographyProps extends TextProps {
  variant?: Variant;
  color?: string;
  children: React.ReactNode;
}

export function Txt({
  variant = 'bodyLg',
  color,
  style,
  children,
  ...rest
}: TypographyProps) {
  return (
    <Text
      style={[
        TypographyStyles[variant],
        { color: color ?? Colors.primary },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
