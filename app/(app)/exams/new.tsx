import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { ExamForm } from '@/src/features/exams/ExamForm';
import { createExam } from '@/src/features/exams/exam-engine';
import { chalkTheme, colors, spacing } from '@/src/theme/tokens';

export default function NewExamScreen() {
  const { workspace, updateWorkspace } = useWorkspace();

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
        <Text style={styles.loading}>Opening exam editor…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.graphiteSafe}>
      <AmbientBackdrop dark />
      <ScreenHeader
        dark
        variant="compact"
        eyebrow="NEW EXAM"
        title="What are you preparing for?"
        subtitle="Choose the date and the exact syllabus scope. MYELIN will use both when planning."
        onBack={() => router.back()}
      />
      <View style={styles.body}>
        <ExamForm
          topics={workspace.topics}
          submitLabel="Create exam"
          onCancel={() => router.back()}
          onSubmit={(input) => {
            const exam = createExam(input);
            updateWorkspace((draft) => {
              draft.exams.push(exam);
            });
            router.replace({
              pathname: '/(app)/exams/[examId]',
              params: { examId: exam.id },
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  graphiteSafe: { flex: 1, backgroundColor: chalkTheme.hero },
  body: { flex: 1, backgroundColor: chalkTheme.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  loading: { color: colors.muted, padding: spacing.lg },
});
