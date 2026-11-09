import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { chalkTheme } from '@/src/theme/tokens';

/** Graphite header shared by Settings and its detail screens. */
export function SettingsHeader(props: ComponentProps<typeof ScreenHeader>) {
  return <View style={styles.stage}><ScreenHeader {...props} dark /></View>;
}

const styles = StyleSheet.create({
  stage: { backgroundColor: chalkTheme.hero, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden' },
});
