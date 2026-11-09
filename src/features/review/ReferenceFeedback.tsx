import { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme/tokens';

export function ReferenceFeedback({
  answer,
  anchorRef,
  guideOpen: _guideOpen,
}: {
  answer: string;
  anchorRef?: RefObject<View | null>;
  guideOpen?: boolean;
}) {
  const clean = answer.trim();
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      testID="guide-review-primary"
      style={styles.card}>
      <Text style={styles.label}>REFERENCE ANSWER</Text>
      <Text style={styles.text}>
        {clean || 'No reference answer was saved for this question.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panelRaised,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  text: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
  },
});
