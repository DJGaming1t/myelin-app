import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { buildReviewQueue } from '@/src/features/review/review-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import {
  deleteQuestionFromWorkspace,
  deleteTopicFromWorkspace,
  findTopic,
} from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

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

  const dueNow = buildReviewQueue(workspace, { topicId }).length;
  const recommendReview = dueNow > 0 && topic.cards.length > 0;

  function openFocus() {
    if (activeReview) {
      router.push('/(app)/review');
      return;
    }
    if (activeFocus) {
      router.push('/(app)/focus');
      return;
    }

    const target =
      workspace.settings.energy === 'low'
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
  }

  function openReview() {
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
      <AmbientBackdrop />
      <ScreenHeader
        eyebrow={topic.subject.toUpperCase()}
        title={topic.name}
        subtitle="Everything MYELIN knows about this topic, with the most useful next move first."
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
        <View style={styles.stateStrip}>
          <StateMetric
            label="STATE"
            value={topic.status === 'new' ? 'New' : topic.status === 'learning' ? 'Learning' : 'Review'}
          />
          <View style={styles.stateDivider} />
          <StateMetric
            label="PRIORITY"
            value={topic.priority === 3 ? 'High' : topic.priority === 2 ? 'Normal' : 'Low'}
            accent={topic.priority === 3}
          />
          <View style={styles.stateDivider} />
          <StateMetric label="TIME" value={`${topic.estimate}m`} />
          <View style={styles.stateDivider} />
          <StateMetric label="RECALL" value={String(topic.cards.length)} />
        </View>

        <Text style={styles.sectionKicker}>NEXT MOVE</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recommendReview ? 'Review due recall questions' : 'Start focus on this topic'}
          onPress={recommendReview ? openReview : openFocus}
          style={({ pressed }) => [styles.nextMove, pressed && styles.pressed]}>
          <View style={styles.nextMoveCopy}>
            <Text style={styles.nextMoveLabel}>
              {activeFocus || activeReview
                ? 'SESSION IN PROGRESS'
                : recommendReview
                  ? 'ACTIVE RECALL'
                  : 'FOCUS'}
            </Text>
            <Text style={styles.nextMoveTitle}>
              {activeReview
                ? 'Resume your recall queue'
                : activeFocus
                  ? `Resume ${activeFocus.topicName}`
                  : recommendReview
                    ? `Review ${dueNow} ${dueNow === 1 ? 'question' : 'questions'} due now`
                    : 'Study this topic with one concrete first step'}
            </Text>
            <Text style={styles.nextMoveMeta}>
              {recommendReview
                ? 'Retrieval is due, so MYELIN is prioritising recall before more input.'
                : `${topic.estimate} min estimate · ${workspace.settings.energy === 'low' ? 'low-energy pacing' : 'normal pacing'}`}
            </Text>
          </View>
          <Text style={styles.nextMoveArrow}>→</Text>
        </Pressable>

        {topic.cards.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={recommendReview ? openFocus : openReview}
            style={({ pressed }) => [styles.secondaryMove, pressed && styles.pressed]}>
            <View>
              <Text style={styles.secondaryMoveLabel}>
                {recommendReview ? 'STUDY INSTEAD' : 'RECALL'}
              </Text>
              <Text style={styles.secondaryMoveTitle}>
                {recommendReview ? 'Start a focus block' : `Practise ${topic.cards.length} saved ${topic.cards.length === 1 ? 'question' : 'questions'}`}
              </Text>
            </View>
            <Text style={styles.secondaryMoveArrow}>›</Text>
          </Pressable>
        ) : null}

        <SectionHeader
          title="Notes"
          action="Edit"
          onAction={() =>
            router.push({
              pathname: '/(app)/topics/[topicId]/edit',
              params: { topicId },
            })
          }
        />

        <View style={styles.notesSection}>
          <View style={styles.notesRail} />
          <Text style={topic.notes ? styles.notes : styles.notesEmpty}>
            {topic.notes ||
              'No notes yet. Add only what will help future study: definitions, chapter boundaries, or a weak area to revisit.'}
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
            {topic.cards.map((question, index) => {
              const due = question.dueAt > 0 && question.dueAt <= Date.now();
              return (
                <Pressable
                  key={question.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/topics/[topicId]/question/[questionId]',
                      params: { topicId, questionId: question.id },
                    })
                  }
                  style={({ pressed }) => [styles.questionRow, pressed && styles.pressed]}>
                  <Text style={styles.questionIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.questionCopy}>
                    <Text style={styles.questionPrompt} numberOfLines={3}>
                      {question.prompt}
                    </Text>
                    <Text style={[styles.questionMeta, due && styles.questionDue]}>
                      {due ? 'Due now' : question.dueAt > 0 ? 'Scheduled' : 'New'}
                      {' · '}
                      {question.hint ? 'hint ready' : 'no hint'}
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
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyQuestions}>
            <Text style={styles.emptyTitle}>No recall questions yet.</Text>
            <Text style={styles.emptyText}>
              Add prompts that force retrieval instead of rereading.
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
          <Text style={styles.dangerTitle}>Delete topic</Text>
          <Text style={styles.dangerText}>
            This also removes linked local study history and mistakes so no broken references remain.
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

function StateMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.stateMetric}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={[styles.stateValue, accent && styles.stateValueAccent]}>{value}</Text>
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
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 56,
  },
  notFound: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  notFoundText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  stateStrip: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  stateMetric: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  stateDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 12,
  },
  stateLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stateValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  stateValueAccent: { color: colors.accent },
  sectionKicker: {
    color: colors.subtle,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: spacing.xl,
    marginBottom: 9,
  },
  nextMove: {
    minHeight: 116,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nextMoveCopy: { flex: 1 },
  nextMoveLabel: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  nextMoveTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  nextMoveMeta: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 6,
  },
  nextMoveArrow: { color: colors.accent, fontSize: 22 },
  secondaryMove: {
    minHeight: layout.minTouch,
    marginTop: 8,
    paddingHorizontal: 2,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  secondaryMoveLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  secondaryMoveTitle: {
    color: colors.textDim,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  secondaryMoveArrow: { color: colors.subtle, fontSize: 20 },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  sectionAction: { color: colors.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  notesSection: {
    minHeight: 64,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  notesRail: {
    width: 2,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  },
  notes: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 20 },
  notesEmpty: { flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 19 },
  questions: { borderTopWidth: 1, borderTopColor: colors.line },
  questionRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  questionIndex: {
    width: 30,
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  questionCopy: { flex: 1 },
  questionPrompt: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  questionMeta: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 5 },
  questionDue: { color: colors.success, fontWeight: '700' },
  deleteMini: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteMiniText: { color: colors.subtle, fontSize: 22, fontWeight: '300' },
  emptyQuestions: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.lg,
    alignItems: 'flex-start',
  },
  emptyTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 5 },
  addQuestion: {
    marginTop: spacing.md,
    minHeight: layout.minTouch,
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
  dangerTitle: { color: colors.danger, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  dangerText: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 5,
    maxWidth: 500,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.28)',
    backgroundColor: 'rgba(255,161,145,0.055)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  pressed: { opacity: 0.68 },
});
