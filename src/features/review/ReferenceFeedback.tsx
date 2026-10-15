import { RefObject, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, layout, radius, spacing } from '@/src/theme/tokens';

/** Read-only practice: the original Review attempt remains the grading evidence. */
export function ReferenceFeedback({ answer, anchorRef, guideOpen }: {
  answer: string;
  anchorRef: RefObject<View | null>;
  guideOpen: boolean;
}) {
  const [stage, setStage] = useState<'reference' | 'retry' | 'compare'>('reference');
  const [retry, setRetry] = useState('');
  const hasReference = answer.trim().length > 0;
  const covered = stage === 'retry' && !guideOpen;

  return (
    <View style={styles.panel}>
      <View ref={anchorRef} collapsable={false} testID="guide-review-primary">
        <Text style={styles.label}>{covered ? 'REFERENCE COVERED' : 'REFERENCE'}</Text>
        <Text style={styles.body}>
          {covered ? 'Recall the point you missed, in your own words.' : hasReference
            ? answer : 'No reference answer was saved for this prompt. Check your source material before judging accuracy.'}
        </Text>
      </View>
      {hasReference ? (
        <>
          {stage === 'reference' ? (
            <>
              <Text style={styles.helper}>Compare the key idea and any required details with your first answer. This is your saved reference; check your source if it seems incomplete.</Text>
              <Pressable accessibilityRole="button" onPress={() => setStage('retry')} style={styles.button}>
                <Text style={styles.buttonText}>Cover reference and retry</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.retryLabel}>YOUR RETRY · OPTIONAL PRACTICE</Text>
              {stage === 'retry' ? (
                <>
                  <TextInput accessibilityLabel="Your correction retry" value={retry} onChangeText={setRetry}
                    placeholder="Recall the missing point…" placeholderTextColor={colors.subtle}
                    selectionColor={colors.accent} multiline textAlignVertical="top" maxLength={16000} style={styles.input} />
                  <Pressable accessibilityRole="button" disabled={!retry.trim()}
                    accessibilityState={{ disabled: !retry.trim() }} onPress={() => setStage('compare')}
                    style={[styles.button, !retry.trim() && styles.disabled]}>
                    <Text style={styles.buttonText}>Compare retry with reference</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setStage('reference'); setRetry(''); }} style={styles.button}>
                    <Text style={styles.buttonText}>Cancel retry</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.body}>{retry}</Text>
                  <Text style={styles.helper}>Did your retry include the missing idea? Compare it yourself; MYELIN has not marked it correct.</Text>
                  <Pressable accessibilityRole="button" onPress={() => { setRetry(''); setStage('retry'); }} style={styles.button}>
                    <Text style={styles.buttonText}>Cover reference and retry again</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.helper}>Grade your first attempt below. This temporary retry is not saved and does not count as another review or a Mistakes win.</Text>
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, borderLeftWidth: 2, borderLeftColor: colors.accent,
    backgroundColor: colors.accentFaint, paddingHorizontal: 14, paddingVertical: 12 },
  label: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  body: { color: colors.text, fontSize: 12.5, lineHeight: 20, marginTop: 7 },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  retryLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', lineHeight: 15, marginTop: 14 },
  input: { color: colors.text, fontSize: 14, lineHeight: 22, minHeight: 112, marginTop: 8,
    borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, padding: 12 },
  button: { minHeight: layout.minTouch, justifyContent: 'center', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  buttonText: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  disabled: { opacity: 0.38 },
});
