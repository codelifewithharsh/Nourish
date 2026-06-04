import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { posthog } from '@/lib/analytics';
import { Txt } from '@/components/ui';
import { Colors } from '@/constants/colors';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    posthog.capture('js_error', {
      kind:       'react_boundary',
      message:    error.message,
      stack:      error.stack?.slice(0, 1000) ?? '',
      component:  info.componentStack?.slice(0, 500) ?? '',
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={s.root}>
          <Txt style={s.emoji}>🌿</Txt>
          <Txt style={s.title}>Something went wrong</Txt>
          <Txt style={s.body}>We've logged the issue. Tap below to try again.</Txt>
          <TouchableOpacity style={s.btn} onPress={this.reset} activeOpacity={0.85}>
            <Txt style={s.btnTxt}>Try again</Txt>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji:  { fontSize: 48, lineHeight: 56 },
  title:  { fontSize: 20, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  body:   { fontSize: 14, color: Colors.secondary, textAlign: 'center', lineHeight: 20 },
  btn:    { marginTop: 8, height: 48, paddingHorizontal: 28, backgroundColor: Colors.accent, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
