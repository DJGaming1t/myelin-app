import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { TopicForm } from '@/src/features/topics/TopicForm';
import { createTopic, topicSubjects } from '@/src/features/topics/topic-operations';
import { colors } from '@/src/theme/tokens';

export default function NewTopicScreen() {
  const { workspace, updateWorkspace } = useWorkspace();
  const subjects = topicSubjects(workspace?.topics ?? []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="NEW TOPIC"
        title="What are you learning?"
        subtitle="Start small. You can add recall questions, notes and more detail after the topic exists."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <TopicForm
          subjects={subjects}
          submitLabel="Create topic"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            const topic = createTopic(input);
            updateWorkspace((draft) => {
              draft.topics.push(topic);
            });
            router.replace({
              pathname: '/(app)/topics/[topicId]',
              params: { topicId: topic.id },
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
});
