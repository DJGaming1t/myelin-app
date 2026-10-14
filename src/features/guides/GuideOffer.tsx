import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/src/components/app/AppButton';
import { colors, radius, space, type } from '@/src/theme/tokens';
import type { TutorialId } from './guide-registry';

export type GuideOfferProps = {
  visible: boolean;
  saveFailed: boolean;
  onShow: () => void;
  onLater: () => void;
  onRetry: () => void;
};

export function GuideOffer({ tutorialId, screenName, description, visible, saveFailed, onShow, onLater, onRetry }: GuideOfferProps & { tutorialId: TutorialId; screenName: string; description: string }) {
  if (saveFailed) return <View testID={`${tutorialId}-guide-choice-error`} style={styles.card}>
    <Text accessibilityRole="alert" style={styles.copy}>Couldn’t remember your tutorial choice.</Text>
    <AppButton label="Retry" accessibilityLabel="Retry saving tutorial choice" variant="quiet" onPress={onRetry} />
  </View>;
  if (!visible) return null;
  return <View testID={`${tutorialId}-guide-offer`} style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>A quick tour of {screenName}?</Text>
    <Text style={styles.copy}>{description}</Text>
    <View style={styles.actions}>
      <AppButton label="Show me" accessibilityLabel={`Show me ${screenName}’s tutorial`} variant="secondary" onPress={onShow} style={styles.action} />
      <AppButton label="Later" accessibilityLabel={`Maybe later for ${screenName}’s tutorial`} variant="quiet" onPress={onLater} style={styles.action} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  title: { color: colors.text, ...type.body, fontWeight: '700' },
  copy: { color: colors.muted, ...type.meta, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});
