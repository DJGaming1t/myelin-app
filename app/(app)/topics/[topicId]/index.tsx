import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { buildReviewQueue } from '@/src/features/review/review-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { deleteQuestionFromWorkspace, deleteTopicFromWorkspace, findTopic } from '@/src/features/topics/topic-operations';
import { colors, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function TopicDetailScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const topicId = param(params.topicId);
  const { workspace, updateWorkspace, saveError } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const { session: activeReview } = useReview();
  const topic = workspace ? findTopic(workspace, topicId) : null;

  if (!workspace || !topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Topic not found" onBack={() => router.replace('/(app)/topics')} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>
            This topic may have been deleted or belongs to another workspace.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  function deleteTopic() {
    Alert.alert(
      'Delete this topic?',
      'Its study history and linked mistakes will also be removed from this local workspace. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            updateWorkspace((draft) => {
              deleteTopicFromWorkspace(draft, topicId);
            });
            router.replace('/(app)/topics');
          },
        },
      ],
    );
  }

  function deleteQuestion(questionId: string) {
    Alert.alert(
      'Delete recall question?',
      'Linked historical references will be cleaned up so the workspace stays valid.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            updateWorkspace((draft) => {
              deleteQuestionFromWorkspace(draft, topicId, questionId);
            }),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow={topic.subject.toUpperCase()}
        title={topic.name}
        subtitle="Keep the material useful for future you: concise notes, specific recall prompts, and realistic study estimates."
        onBack={() => router.back()}
        actionLabel="Edit"
        onAction={() =>
          router.push({
            pathname: '/(app)/topics/[topicId]/edit',
            params: { topicId },
          })
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaGrid}>
          <Meta label="STATUS" value={topic.status === 'new' ? 'New' : topic.status === 'learning' ? 'Learning' : 'Review'} />
          <Meta label="PRIORITY" value={topic.priority === 3 ? 'High' : topic.priority === 2 ? 'Normal' : 'Low'} accent={topic.priority === 3} />
          <Meta label="ESTIMATE" value={`${topic.estimate} min`} />
          <Meta label="QUESTIONS" value={String(topic.cards.length)} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (activeReview) {
              router.push('/(app)/review');
              return;
            }

            if (activeFocus) {
              router.push('/(app)/focus');
              return;
            }

            const target = workspace.settings.energy === 'low'
              ? Math.max(5, Math.min(25, workspace.settings.focusMinutes, topic.estimate))
              : Math.max(5, Math.min(workspace.settings.focusMinutes, topic.estimate));

            router.push({
              pathname: '/(app)/focus',
              params: {
                topicId,
                minutes: String(target),
                breakMinutes: String(workspace.settings.breakMinutes),
              },
            });
          }}
          style={({ pressed }) => [styles.focusButton, pressed && styles.pressed]}>
          <View>
            <Text style={styles.focusButtonLabel}>
              {activeReview ? 'REVIEW ACTIVE' : activeFocus ? 'SESSION ACTIVE' : 'FOCUS THIS TOPIC'}
            </Text>
            <Text style={styles.focusButtonText}>
              {activeReview
                ? 'Resume the active recall queue'
                : activeFocus
                  ? `Resume ${activeFocus.topicName}`
                  : 'Choose a tiny first step, then start'}
            </Text>
          </View>
          <Text style={styles.focusButtonArrow}>→</Text>
        </Pressable>

        {topic.cards.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (activeFocus) {
                router.push('/(app)/focus');
                return;
              }

              if (activeReview) {
                router.push('/(app)/review');
                return;
              }

              router.push({
                pathname: '/(app)/review',
                params: { topicId },
              });
            }}
            style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}>
            <View>
              <Text style={styles.reviewButtonLabel}>ACTIVE RECALL</Text>
              <Text style={styles.reviewButtonText}>
                {buildReviewQueue(workspace, { topicId }).length > 0
                  ? `${buildReviewQueue(workspace, { topicId }).length} questions ready now`
                  : `Practise ${topic.cards.length} saved ${topic.cards.length === 1 ? 'question' : 'questions'}`}
              </Text>
            </View>
            <Text style={styles.reviewButtonArrow}>→</Text>
          </Pressable>
        ) : null}

        <SectionHeader title="Notes" action="Edit topic" onAction={() =>
          router.push({
            pathname: '/(app)/topics/[topicId]/edit',
            params: { topicId },
          })
        } />

        <View style={styles.notesCard}>
          <Text style={topic.notes ? styles.notes : styles.notesEmpty}>
            {topic.notes || 'No notes yet. Add key definitions, weak areas or chapter boundaries when they become useful.'}
          </Text>
        </View>

        <SectionHeader
          title="Recall questions"
          action="+ Add"
          onAction={() =>
            router.push({
              pathname: '/(app)/topics/[topicId]/question/new',
              params: { topicId },
            })
          }
        />

        {topic.cards.length ? (
          <View style={styles.questions}>
            {topic.cards.map((question, index) => (
              <Pressable
                key={question.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/(app)/topics/[topicId]/question/[questionId]',
                    params: { topicId, questionId: question.id },
                  })
                }
                style={({ pressed }) => [styles.questionCard, pressed && styles.pressed]}>
                <View style={styles.questionIndex}>
                  <Text style={styles.questionIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={styles.questionCopy}>
                  <Text style={styles.questionPrompt} numberOfLines={3}>
                    {question.prompt}
                  </Text>
                  <Text style={styles.questionMeta}>
                    {question.hint ? 'Hint ready' : 'No hint'} · {question.answer ? 'Reference answer ready' : 'No reference answer'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete recall question"
                  hitSlop={10}
                  onPress={(event) => {
                    event.stopPropagation();
                    deleteQuestion(question.id);
                  }}
                  style={({ pressed }) => [styles.deleteMini, pressed && styles.pressed]}>
                  <Text style={styles.deleteMiniText}>×</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyQuestions}>
            <Text style={styles.emptyTitle}>No recall questions yet.</Text>
            <Text style={styles.emptyText}>
              Add prompts that force you to retrieve an idea instead of rereading it.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(app)/topics/[topicId]/question/new',
                  params: { topicId },
                })
              }
              style={({ pressed }) => [styles.addQuestion, pressed && styles.pressed]}>
              <Text style={styles.addQuestionText}>Add first question</Text>
            </Pressable>
          </View>
        )}

        {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger zone</Text>
          <Text style={styles.dangerText}>
            Deleting a topic also removes linked local study history and mistakes so no broken references remain.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={deleteTopic}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
            <Text style={styles.deleteButtonText}>Delete topic</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metaCard}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, accent && styles.metaValueAccent]}>{value}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 56 },
  notFound: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  notFoundText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaCard: {
    width: '48.5%',
    minHeight: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 12,
    justifyContent: 'space-between',
  },
  metaLabel: { color: colors.subtle, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.2 },
  metaValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 9 },
  metaValueAccent: { color: colors.accent },
  focusButton: {
    marginTop: 10,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.26)',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusButtonLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  focusButtonText: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  focusButtonArrow: { color: colors.accent, fontSize: 19 },
  reviewButton: {
    marginTop: 8,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.2)',
    backgroundColor: 'rgba(180,216,174,0.05)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewButtonLabel: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  reviewButtonText: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  reviewButtonArrow: { color: colors.success, fontSize: 19 },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sectionAction: { color: colors.accent, fontSize: 11.5, fontWeight: '700' },
  notesCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  notes: { color: colors.muted, fontSize: 12.5, lineHeight: 20 },
  notesEmpty: { color: colors.subtle, fontSize: 12, lineHeight: 19 },
  questions: { gap: 8 },
  questionCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 12,
  },
  questionIndex: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  questionIndexText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  questionCopy: { flex: 1 },
  questionPrompt: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  questionMeta: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 5 },
  deleteMini: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  deleteMiniText: { color: colors.subtle, fontSize: 22, fontWeight: '300' },
  emptyQuestions: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  addQuestion: {
    marginTop: spacing.md,
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addQuestionText: { color: '#25140e', fontSize: 11.5, fontWeight: '800' },
  saveError: { color: colors.danger, fontSize: 10.5, marginTop: spacing.md },
  dangerZone: {
    marginTop: 36,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  dangerTitle: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  dangerText: { color: colors.subtle, fontSize: 10.5, lineHeight: 16, marginTop: 5, maxWidth: 500 },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.28)',
    backgroundColor: 'rgba(255,161,145,0.055)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
