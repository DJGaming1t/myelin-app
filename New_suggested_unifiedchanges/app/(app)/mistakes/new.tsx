import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { MistakeForm } from '@/src/features/mistakes/MistakeForm';
import { createMistake } from '@/src/features/mistakes/mistake-engine';
import { findTopic } from '@/src/features/topics/topic-operations';
import { colors, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function NewMistakeScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[]; cardId?: string | string[] }>();
  const requestedTopicId = param(params.topicId);
  const requestedCardId = param(params.cardId);
  const { workspace, updateWorkspace } = useWorkspace();

  if (!workspace || workspace.topics.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Add mistake" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Create a topic first.</Text>
          <Text style={styles.emptyText}>
            Every mistake belongs to a topic so MYELIN can keep corrections and later progress analysis connected.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const requestedTopic = findTopic(workspace, requestedTopicId);
  const requestedCard = requestedTopic?.cards.find((card) => card.id === requestedCardId) ?? null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="CAPTURE THE ERROR"
        title="Add mistake"
        subtitle="Record enough to recognize the error later, then write the correction you want to be able to reproduce."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <MistakeForm
          topics={workspace.topics}
          initial={{
            topicId: requestedTopic?.id ?? workspace.topics[0]?.id,
            cardId: requestedCard?.id ?? null,
            prompt: requestedCard?.prompt ?? '',
            correction: requestedCard?.answer ?? '',
            reason: requestedCard ? 'recall' : 'concept',
          }}
          submitLabel="Save mistake"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            const mistake = createMistake(input);
            updateWorkspace((draft) => {
              draft.mistakes.push(mistake);
            });
            router.replace({
              pathname: '/(app)/mistakes/[mistakeId]',
              params: { mistakeId: mistake.id },
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  empty: { padding: spacing.xl, flex: 1, justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 11.5, lineHeight: 18, marginTop: 7 },
});
