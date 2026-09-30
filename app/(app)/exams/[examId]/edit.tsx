import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { ExamForm } from '@/src/features/exams/ExamForm';
import {
  applyExamInput,
  findExam,
} from '@/src/features/exams/exam-engine';
import { colors, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function EditExamScreen() {
  const params = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = param(params.examId);
  const { workspace, updateWorkspace } = useWorkspace();

  const exam = workspace ? findExam(workspace, examId) : null;

  if (!workspace || !exam) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Exam not found" onBack={() => router.replace('/(app)/exams')} />
        <Text style={styles.missing}>This exam is no longer available.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="EDIT EXAM"
        title={exam.name}
        subtitle="Changing the date or scope updates Today’s exam pressure immediately."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <ExamForm
          topics={workspace.topics}
          initial={{
            name: exam.name,
            date: exam.date,
            scope: exam.scope,
            subjects: exam.subjects,
            topicIds: exam.topicIds,
          }}
          submitLabel="Save changes"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            updateWorkspace((draft) => {
              const target = findExam(draft, examId);
              if (target) applyExamInput(target, input);
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
  missing: { color: colors.muted, padding: spacing.lg },
});
