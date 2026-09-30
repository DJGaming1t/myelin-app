import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  deleteExamFromWorkspace,
  examStatus,
  examTopics,
  findExam,
  formatExamDateLong,
} from '@/src/features/exams/exam-engine';
import { colors, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function ExamDetailScreen() {
  const params = useLocalSearchParams<{ examId?: string | string[] }>();
  const examId = param(params.examId);
  const { workspace, updateWorkspace } = useWorkspace();

  const exam = workspace ? findExam(workspace, examId) : null;

  if (!workspace || !exam) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Exam not found" onBack={() => router.replace('/(app)/exams')} />
        <Text style={styles.missing}>This exam is no longer available in this workspace.</Text>
      </SafeAreaView>
    );
  }

  const status = examStatus(exam.date);
  const affected = examTopics(exam, workspace.topics);

  function remove() {
    Alert.alert(
      'Delete this exam?',
      'Study history and topics will stay. Only this exam and its planning pressure will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            updateWorkspace((draft) => {
              deleteExamFromWorkspace(draft, examId);
            });
            router.replace('/(app)/exams');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow={status.kind === 'past' ? 'PAST EXAM' : status.kind === 'today' ? 'EXAM TODAY' : 'UPCOMING EXAM'}
        title={exam.name}
        subtitle={formatExamDateLong(exam.date)}
        onBack={() => router.back()}
        actionLabel="Edit"
        onAction={() =>
          router.push({
            pathname: '/(app)/exams/[examId]/edit',
            params: { examId },
          })
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Metric label="WHEN" value={status.label} accent={status.kind !== 'past'} />
          <Metric label="SCOPE" value={exam.scope === 'subjects' ? 'Subjects' : 'Topics'} />
          <Metric label="AFFECTED" value={String(affected.length)} />
        </View>

        <Text style={styles.sectionTitle}>
          {exam.scope === 'subjects' ? 'Included subjects' : 'Included topics'}
        </Text>

        <View style={styles.scopeCard}>
          {exam.scope === 'subjects' ? (
            exam.subjects.map((subject) => (
              <View key={subject} style={styles.scopeItem}>
                <Text style={styles.scopeItemTitle}>{subject}</Text>
                <Text style={styles.scopeItemMeta}>
                  {workspace.topics.filter((topic) => topic.subject === subject).length} MYELIN topics
                </Text>
              </View>
            ))
          ) : (
            affected.map((topic) => (
              <View key={topic.id} style={styles.scopeItem}>
                <Text style={styles.scopeItemTitle}>{topic.name}</Text>
                <Text style={styles.scopeItemMeta}>{topic.subject}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.plannerNote}>
          <Text style={styles.plannerTitle}>How Today uses this</Text>
          <Text style={styles.plannerText}>
            Included topics receive increasing planning weight as the exam approaches. On the exam day itself, the pressure remains active for the whole calendar day.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={remove}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete exam</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.muted, padding: spacing.lg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 52 },
  summary: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 10, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  metricValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  metricValueAccent: { color: colors.accent },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.xl, marginBottom: 9 },
  scopeCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: spacing.md },
  scopeItem: { minHeight: 56, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  scopeItemTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  scopeItemMeta: { color: colors.subtle, fontSize: 9.5, marginTop: 3 },
  plannerNote: { marginTop: spacing.xl, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 11 },
  plannerTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  plannerText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  deleteButton: { alignSelf: 'flex-start', minHeight: 41, marginTop: 36, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  pressed: { opacity: 0.68 },
});
