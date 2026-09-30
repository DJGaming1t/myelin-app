import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { TopicForm } from '@/src/features/topics/TopicForm';
import { applyTopicInput, findTopic, topicSubjects } from '@/src/features/topics/topic-operations';
import { colors, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function EditTopicScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const topicId = param(params.topicId);
  const { workspace, updateWorkspace } = useWorkspace();
  const topic = workspace ? findTopic(workspace, topicId) : null;

  if (!topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Topic not found" onBack={() => router.replace('/(app)/topics')} />
        <Text style={styles.message}>This topic is no longer available in this workspace.</Text>
      </SafeAreaView>
    );
  }

  const subjects = topicSubjects(workspace?.topics ?? []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="EDIT TOPIC"
        title={topic.name}
        subtitle="Changes save to this workspace immediately after you confirm them."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <TopicForm
          initial={{
            name: topic.name,
            subject: topic.subject,
            status: topic.status,
            priority: topic.priority,
            estimate: topic.estimate,
            notes: topic.notes,
          }}
          subjects={subjects}
          submitLabel="Save changes"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            updateWorkspace((draft) => {
              const target = findTopic(draft, topicId);
              if (target) applyTopicInput(target, input);
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
