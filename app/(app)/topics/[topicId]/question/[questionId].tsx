import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { QuestionForm } from '@/src/features/topics/QuestionForm';
import {
  applyQuestionInput,
  deleteQuestionFromWorkspace,
  findQuestion,
  findTopic,
} from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function EditQuestionScreen() {
  const params = useLocalSearchParams<{
    topicId?: string | string[];
    questionId?: string | string[];
  }>();
  const topicId = param(params.topicId);
  const questionId = param(params.questionId);
  const { workspace, updateWorkspace } = useWorkspace();
  const topic = workspace ? findTopic(workspace, topicId) : null;
  const question = topic ? findQuestion(topic, questionId) : null;

  if (!topic || !question) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Question not found" onBack={() => router.replace('/(app)/topics')} />
        <Text style={styles.message}>This recall question is no longer available.</Text>
      </SafeAreaView>
    );
  }

  function remove() {
    Alert.alert('Delete recall question?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkspace((draft) => {
            deleteQuestionFromWorkspace(draft, topicId, questionId);
          });
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="EDIT RECALL QUESTION"
        title={topic.name}
        subtitle="Edit the reference answer, hint, and any concepts you confuse."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <QuestionForm
          initial={{
            prompt: question.prompt,
            answer: question.answer,
            hint: question.hint,
            confusionGroup: question.confusionGroup,
          }}
          submitLabel="Save question"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            updateWorkspace((draft) => {
              const targetTopic = findTopic(draft, topicId);
              const target = targetTopic ? findQuestion(targetTopic, questionId) : null;
              if (target) applyQuestionInput(target, input);
            });
            router.back();
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={remove}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete question</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  message: { color: colors.muted, padding: spacing.lg, lineHeight: 20 },
  deleteButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 8,
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.22)',
    backgroundColor: colors.bg,
  },
  deleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
