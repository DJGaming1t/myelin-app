import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { QuestionForm } from '@/src/features/topics/QuestionForm';
import { createQuestion, findTopic } from '@/src/features/topics/topic-operations';
import { colors, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function NewQuestionScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const topicId = param(params.topicId);
  const { workspace, updateWorkspace } = useWorkspace();
  const topic = workspace ? findTopic(workspace, topicId) : null;

  if (!topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Topic not found" onBack={() => router.replace('/(app)/topics')} />
        <Text style={styles.message}>Return to the topic library and choose another topic.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow={topic.subject.toUpperCase()}
        title="Add recall question"
        subtitle={topic.name}
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <QuestionForm
          submitLabel="Add question"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            const question = createQuestion(input);
            updateWorkspace((draft) => {
              const target = findTopic(draft, topicId);
              if (target) target.cards.push(question);
            });
            router.back();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  message: { color: colors.muted, padding: spacing.lg, lineHeight: 20 },
});
