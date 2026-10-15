import { useAchievement } from '@/src/features/achievement/AchievementProvider';
import { router, useLocalSearchParams } from 'expo-router';
import { RefObject, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { Confidence } from '@/src/data/schema';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { ReviewChoiceButton } from '@/src/features/review/ReviewChoiceButton';
import { ReferenceFeedback } from '@/src/features/review/ReferenceFeedback';
import {
  ReviewChoice,
  buildReviewQueue,
  reviewCounts,
  scheduleReview,
} from '@/src/features/review/review-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { useReviewGuide } from '@/src/features/guides/useReviewGuide';
import { ScreenGuide } from '@/src/features/guides/ScreenGuide';
import { ReviewGuideState } from '@/src/features/guides/guide-registry';
import { useGuideOffer } from '@/src/features/guides/useGuideOffer';
import { GuideOffer } from '@/src/features/guides/GuideOffer';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { findQuestion, findTopic } from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

const CONFIDENCE: { value: Confidence; label: string; helper: string }[] = [
  { value: 'unsure', label: 'Unsure', helper: 'Mostly guessing' },
  { value: 'partial', label: 'Partly sure', helper: 'Some gaps' },
  { value: 'sure', label: 'Sure', helper: 'Confident recall' },
];

export default function ReviewScreen() {
  const celebrate = useAchievement();
  const params = useLocalSearchParams<{
    topicId?: string | string[];
    autoStart?: string | string[];
    limit?: string | string[];
    source?: string | string[];
    guide?: string | string[];
  }>();
  const requestedTopicId = param(params.topicId);
  const autoStartRequested = param(params.autoStart) === '1';
  const tutorialRequested = param(params.guide) === 'review';
  const fromFocus = param(params.source) === 'focus';
  const requestedLimit = Math.max(
    1,
    Math.min(3, Number(param(params.limit)) || 3),
  );
  const { workspace, ownerKey } = useWorkspace();
  const { session: activeFocus, ready: focusReady } = useFocus();
  const { ready: onboardingReady, shouldShow: onboardingPending } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();
  const {
    ready,
    session,
    blockedByFocus,
    startReview,
    setAnswerDraft,
    setConfidence,
    useHint,
    revealReference,
    gradeCurrent,
    discardReview,
  } = useReview();

  const [localAnswer, setLocalAnswer] = useState(session?.answerDraft ?? '');
  const [completedNotice, setCompletedNotice] = useState(false);
  const [grading, setGrading] = useState(false);
  const [autoStartConsumed, setAutoStartConsumed] = useState(false);

  useEffect(() => {
    setLocalAnswer(session?.answerDraft ?? '');
  }, [session?.id, session?.currentIndex, session?.stage]);

  useEffect(() => {
    if (!session || session.stage !== 'attempt' || localAnswer === session.answerDraft) return;
    const timer = setTimeout(() => {
      void setAnswerDraft(localAnswer);
    }, 350);
    return () => clearTimeout(timer);
  }, [localAnswer, session?.answerDraft, session?.currentIndex, session?.id, session?.stage, setAnswerDraft]);

  const currentItem = session?.queue[session.currentIndex] ?? null;
  const currentTopic =
    workspace && currentItem ? findTopic(workspace, currentItem.topicId) : null;
  const currentCard =
    currentTopic && currentItem ? findQuestion(currentTopic, currentItem.cardId) : null;

  const counts = useMemo(
    () => (workspace ? reviewCounts(workspace, Date.now()) : { due: 0, total: 0 }),
    [workspace],
  );
  const requestedTopic = workspace && requestedTopicId ? findTopic(workspace, requestedTopicId) : null;
  const dueForTopic = useMemo(() => workspace && !session && requestedTopic
    ? buildReviewQueue(workspace, { topicId: requestedTopic.id }).length : 0,
    [workspace, session, requestedTopic]);
  const guideState: ReviewGuideState = activeFocus || blockedByFocus ? 'blocked'
    : session ? session.stage === 'attempt' ? 'attempt' : 'reference'
    : requestedTopic ? !requestedTopic.cards.length ? 'empty-topic' : dueForTopic > 0 ? 'topic-ready' : 'practice'
    : counts.due > 0 ? 'ready' : counts.total > 0 ? 'waiting' : 'empty';
  const guideReady = ready && focusReady && !!workspace && !grading &&
    (!session || !!currentCard) && (!autoStartRequested || autoStartConsumed || !!session);
  const guide = useReviewGuide(guideReady, ownerKey, guideState);
  const guideOffer = useGuideOffer('review', ownerKey,
    guideReady && guideState === 'attempt' && onboardingReady && !onboardingPending && !transitionPending,
    guide.open && guideState === 'attempt');
  const guideOverlay = guide.open ? <ScreenGuide key={guideState} title="Review" steps={guide.steps}
    anchors={guide.anchors} revealAnchor={guide.revealAnchor} onClose={guide.close} /> : null;

  useEffect(() => {
    // A tutorial replay must not inherit an automatic post-Focus start.
    if (tutorialRequested) {
      setAutoStartConsumed(true);
      if (autoStartRequested) router.setParams({ autoStart: undefined });
      return;
    }
    if (
      !autoStartRequested ||
      autoStartConsumed ||
      !ready ||
      !workspace ||
      session ||
      activeFocus ||
      blockedByFocus ||
      !requestedTopicId
    ) {
      return;
    }

    const requestedTopic = findTopic(workspace, requestedTopicId);
    if (!requestedTopic) {
      setAutoStartConsumed(true);
      return;
    }

    const readyQueue = buildReviewQueue(workspace, {
      topicId: requestedTopic.id,
      limit: requestedLimit,
    });
    setAutoStartConsumed(true);
    if (!readyQueue.length) return;

    setCompletedNotice(false);
    void startReview({
      topicId: requestedTopic.id,
      limit: requestedLimit,
    });
  }, [
    activeFocus,
    autoStartConsumed,
    autoStartRequested,
    blockedByFocus,
    ready,
    requestedLimit,
    requestedTopicId,
    session,
    startReview,
    workspace,
    tutorialRequested,
  ]);

  if (!ready || !workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Restoring review session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session && activeFocus) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <ScrollView ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} contentContainerStyle={styles.dashboard}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brand}>MYELIN</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Teach me this screen" onPress={guide.start} style={styles.blockedHelp}><Text style={styles.helpText}>?</Text></Pressable>
            </View>
            <Text style={styles.eyebrow}>REVIEW PAUSED</Text>
            <Text style={styles.dashboardTitle}>Finish the focus block first.</Text>
            <Text style={styles.dashboardText}>
              Your exact review card, answer draft, hint state and reference stage are still saved.
            </Text>
            <Pressable
              ref={guide.anchors['review.primary']} collapsable={false} testID="guide-review-primary"
              accessibilityRole="button"
              onPress={() => router.push('/(app)/focus')}
              style={({ pressed }) => [styles.blockedCard, pressed && styles.pressed]}>
              <View>
                <Text style={styles.blockedLabel}>FOCUS SESSION ACTIVE</Text>
                <Text style={styles.blockedTitle}>{activeFocus.topicName}</Text>
                <Text style={styles.blockedText}>Return to the timer. Review will still be here afterwards.</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          </ScrollView>
          <AppNav />
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.page}>
          <ScreenHeader
            onHelp={guide.start}
            variant="compact"
            title="Review"
            subtitle={
              requestedTopic
                ? requestedTopic.name
                : 'Recall what is due. Corrections stay close.'
            }
          />

          <ScrollView ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} contentContainerStyle={styles.dashboard} showsVerticalScrollIndicator={false}>
            <AnimatedDisclosure visible={completedNotice} style={styles.completeNotice}>
              <Text style={styles.completeMark}>✓</Text>
              <View style={styles.completeCopy}>
                <Text style={styles.completeTitle}>Review queue complete.</Text>
                <Text style={styles.completeText}>Those cards are already rescheduled.</Text>
              </View>
            </AnimatedDisclosure>

            {activeFocus || blockedByFocus ? (
              <Pressable
                ref={guide.anchors['review.primary']} collapsable={false} testID="guide-review-primary"
                accessibilityRole="button"
                onPress={() => router.push('/(app)/focus')}
                style={({ pressed }) => [styles.blockedCard, pressed && styles.pressed]}>
                <View>
                  <Text style={styles.blockedLabel}>FOCUS SESSION ACTIVE</Text>
                  <Text style={styles.blockedTitle}>{activeFocus?.topicName ?? 'Resume focus first'}</Text>
                  <Text style={styles.blockedText}>Finish or discard Focus before starting recall.</Text>
                </View>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            ) : requestedTopic ? (
              <>
                <Text style={styles.eyebrow}>
                  {fromFocus ? 'POST-FOCUS RETRIEVAL' : 'TOPIC RECALL'}
                </Text>
                <Text style={styles.dashboardTitle}>
                  {requestedTopic.cards.length === 0
                    ? 'Add a recall question first.'
                    : dueForTopic > 0
                      ? `${dueForTopic} due now.`
                      : 'Nothing due. Practice is optional.'}
                </Text>
                <Text style={styles.dashboardText}>
                  Try to retrieve the answer before the reference appears.
                </Text>

                {requestedTopic.cards.length ? (
                  <>
                    {dueForTopic > 0 ? (
                      <Pressable
                        ref={guide.anchors['review.primary']} collapsable={false} testID="guide-review-primary"
                        accessibilityRole="button"
                        onPress={async () => {
                          setCompletedNotice(false);
                          await startReview({ topicId: requestedTopic.id });
                        }}
                        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                        <View>
                          <Text style={styles.primaryText}>Start due recall</Text>
                          <Text style={styles.primarySubtext}>{dueForTopic} ready now</Text>
                        </View>
                        <Text style={styles.primaryArrow}>→</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      ref={dueForTopic === 0 ? guide.anchors['review.primary'] : undefined} collapsable={false} testID={dueForTopic === 0 ? 'guide-review-primary' : undefined}
                      accessibilityRole="button"
                      onPress={async () => {
                        setCompletedNotice(false);
                        await startReview({
                          topicId: requestedTopic.id,
                          includeNotDue: true,
                          limit: 100,
                        });
                      }}
                      style={({ pressed }) => [styles.secondaryLarge, pressed && styles.pressed]}>
                      <Text style={styles.secondaryLargeText}>Practise all questions</Text>
                    </Pressable>
                  </>
                ) : (
                  <EmptyReview
                    anchorRef={guide.anchors['review.primary']}
                    title="No recall questions yet."
                    text="Add one prompt to this topic before starting Review."
                    action="Add question"
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/topics/[topicId]/question/new',
                        params: { topicId: requestedTopic.id },
                      })
                    }
                  />
                )}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/(app)/review')}
                  style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                  <Text style={styles.textButtonText}>Back to mixed review</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.eyebrow}>DUE NOW</Text>
                <Text style={styles.dashboardTitle}>
                  {counts.due > 0
                    ? `${counts.due} ${counts.due === 1 ? 'question is' : 'questions are'} ready.`
                    : counts.total > 0
                      ? 'Nothing is due right now.'
                      : 'No recall material yet.'}
                </Text>
                <Text style={styles.dashboardText}>
                  {counts.due > 0
                    ? 'MYELIN mixes due material where useful so recall depends less on context.'
                    : counts.total > 0
                      ? 'Review will surface cards again when their next time arrives.'
                      : 'Create recall questions inside Library first.'}
                </Text>

                {counts.due > 0 ? (
                  <Pressable
                    ref={guide.anchors['review.primary']} collapsable={false} testID="guide-review-primary"
                    accessibilityRole="button"
                    onPress={async () => {
                      setCompletedNotice(false);
                      await startReview();
                    }}
                    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                    <View>
                      <Text style={styles.primaryText}>Start mixed review</Text>
                      <Text style={styles.primarySubtext}>{counts.due} due across your Library</Text>
                    </View>
                    <Text style={styles.primaryArrow}>→</Text>
                  </Pressable>
                ) : counts.total === 0 ? (
                  <EmptyReview
                    anchorRef={guide.anchors['review.primary']}
                    title="Start in Library."
                    text="Add a recall question to any Topic. Review never invents fake material."
                    action="Open Library"
                    onPress={() => router.push('/(app)/topics')}
                  />
                ) : null}

                <Pressable
                  ref={guide.anchors['review.secondary']} collapsable={false} testID="guide-review-secondary"
                  accessibilityRole="button"
                  accessibilityLabel="Open mistake notebook"
                  onPress={() => router.push('/(app)/mistakes')}
                  style={({ pressed }) => [styles.utilityRow, pressed && styles.pressed]}>
                  <View>
                    <Text style={styles.utilityLabel}>CORRECTIONS</Text>
                    <Text style={styles.utilityTitle}>Mistake notebook</Text>
                  </View>
                  <Text style={styles.utilityArrow}>Open →</Text>
                </Pressable>
              </>
            )}
          </ScrollView>

          <AppNav />
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  if (!currentItem || !currentTopic || !currentCard) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Updating review queue…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = Math.min(session.currentIndex + 1, session.queue.length);
  const referenceReady = localAnswer.trim().length > 0;

  async function showReference() {
    if (!referenceReady) return;
    await setAnswerDraft(localAnswer);
    await revealReference();
  }

  async function answerMentally() {
    const marker = '— Answered mentally —';
    setLocalAnswer(marker);
    await setAnswerDraft(marker);
    await revealReference();
  }

  async function grade(choice: ReviewChoice) {
    if (grading) return;
    setGrading(true);
    try {
      const result = await gradeCurrent(choice);
      if (result?.completed) {
        celebrate({
          title: 'Recall complete!',
          detail: 'Another round remembered. Your next reviews are scheduled.',
        });
        if (fromFocus) {
          router.replace('/(app)/today');
          return;
        }
        setCompletedNotice(true);
      }
    } finally {
      setGrading(false);
    }
  }

  function confirmDiscard() {
    Alert.alert(
      'Leave this review queue?',
      'Cards already graded stay saved. The unfinished queue and current draft will be removed.',
      [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'End review',
          style: 'destructive',
          onPress: async () => {
            await discardReview();
            router.replace('/(app)/review');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.reviewPage}>
        <View style={styles.reviewTop}>
          <Pressable accessibilityRole="button" onPress={confirmDiscard} hitSlop={10} style={styles.endAction}>
            <Text style={styles.endReview}>End</Text>
          </Pressable>
          <View style={styles.progressCopy}>
            <Text style={styles.progressLabel}>REVIEW</Text>
            <Text style={styles.progressValue}>{progress} / {session.queue.length}</Text>
          </View>
          <View style={styles.reviewTopActions}>
            <Text style={styles.subjectTop} numberOfLines={1} accessibilityLabel={currentTopic.subject}>{currentTopic.subject}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Teach me this screen" onPress={guide.start} style={styles.helpButton}><Text style={styles.helpText}>?</Text></Pressable>
          </View>
        </View>
        <View style={styles.reviewProgress}>
          <AnimatedProgress
            value={progress / Math.max(1, session.queue.length)}
            accessibilityLabel={`Review progress: ${progress} of ${session.queue.length}`}
          />
        </View>

        <ScrollView
          ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.reviewContent}
          showsVerticalScrollIndicator={false}>
          <Reveal key={`${currentCard.id}:${session.stage}`} distance={8}>
          <View>
          <Text style={styles.stageCue}>
            {session.stage === 'attempt' ? 'RECALL BEFORE YOU CHECK' : 'COMPARE, THEN GRADE'}
          </Text>
          <Text style={styles.topicKicker}>{currentTopic.name.toUpperCase()}</Text>
          {session.hintUsed ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>A hinted Good answer keeps Practising spacing until you recall it unaided.</Text> : null}
          {currentCard.confusionGroup ? <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>Contrast practice · {currentCard.confusionGroup}. What distinguishes this concept?</Text> : null}
          <Text style={styles.prompt}>{currentCard.prompt}</Text>

          {session.stage === 'attempt' ? (
            <>
              {currentCard.hint ? (
                session.hintUsed ? (
                  <View style={styles.hintCard}>
                    <Text style={styles.hintLabel}>HINT</Text>
                    <Text style={styles.hintText}>{currentCard.hint}</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={useHint}
                    style={({ pressed }) => [styles.hintButton, pressed && styles.pressed]}>
                    <Text style={styles.hintButtonText}>Need a hint?</Text>
                  </Pressable>
                )
              ) : null}

              <Text style={styles.answerLabel}>YOUR ANSWER</Text>
              <View ref={guide.anchors['review.primary']} collapsable={false} testID="guide-review-primary"><TextInput
                accessibilityLabel="Your recall answer"
                value={localAnswer}
                onChangeText={setLocalAnswer}
                placeholder="Answer from memory before checking the reference…"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.accent}
                multiline
                textAlignVertical="top"
                maxLength={16000}
                style={styles.answerInput}
              /></View>

              <Text style={styles.confidenceLabel}>How sure were you before checking?</Text>
              <View ref={guide.anchors['review.secondary']} collapsable={false} testID="guide-review-secondary" style={styles.confidenceRow}>
                {CONFIDENCE.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: session.confidence === option.value }}
                    onPress={() => setConfidence(option.value)}
                    style={({ pressed }) => [
                      styles.confidenceCard,
                      session.confidence === option.value && styles.confidenceActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.confidenceTitle,
                        session.confidence === option.value && styles.confidenceTitleActive,
                      ]}>
                      {option.label}
                    </Text>
                    <Text style={styles.confidenceHelp}>{option.helper}</Text>
                  </Pressable>
                ))}
              </View>

              <View ref={guide.anchors['review.support']} collapsable={false} testID="guide-review-support"><Pressable
                accessibilityRole="button"
                accessibilityLabel="Show reference answer"
                accessibilityState={{ disabled: !referenceReady }}
                disabled={!referenceReady}
                onPress={showReference}
                style={({ pressed }) => [
                  styles.primary,
                  !referenceReady && styles.disabled,
                  pressed && referenceReady && styles.pressed,
                ]}>
                <Text style={styles.primaryText}>Show reference answer</Text>
                <Text style={styles.primaryArrow}>→</Text>
              </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={answerMentally}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={styles.textButtonText}>I answered this in my head</Text>
              </Pressable>

              <GuideOffer tutorialId="review" screenName="Review"
                description="See how to attempt an answer, record confidence and reveal when ready. Replay anytime from ?."
                visible={guideOffer.visible} saveFailed={guideOffer.saveFailed}
                onShow={() => { guideOffer.choose('shown'); guide.start(); }}
                onLater={() => guideOffer.choose('later')} onRetry={guideOffer.retry} />
            </>
          ) : (
            <>
              <CompareCard label="YOUR ANSWER" text={session.answerDraft || '—'} />
              <ReferenceFeedback
                key={JSON.stringify([ownerKey, session.id, session.attemptId, currentCard.id, currentCard.answer])}
                answer={currentCard.answer}
                anchorRef={guide.anchors['review.primary']}
                guideOpen={guide.open}
              />

              <View style={styles.recallMeta}>
                <Text style={styles.recallMetaText}>
                  Confidence: {session.confidence === 'sure' ? 'Sure' : session.confidence === 'partial' ? 'Partly sure' : 'Unsure'}
                </Text>
                <Text style={styles.recallMetaText}>
                  {session.hintUsed ? 'Hint used' : 'No hint used'}
                </Text>
              </View>

              <Text style={styles.gradeHeading}>How well did you actually retrieve it?</Text>
              <Text style={styles.gradeHelp}>
                Grade your first attempt, before seeing the reference or practising a retry. “Again” also saves the reference and your first answer to Mistakes when a reference exists.
              </Text>

              <View ref={guide.anchors['review.secondary']} collapsable={false} testID="guide-review-secondary" style={styles.gradeStack}>
                {(['again', 'practising', 'good'] as const).map((choice) => (
                  <ReviewChoiceButton
                    key={choice}
                    choice={choice}
                    schedule={scheduleReview(currentCard, choice, Date.now(), { hintUsed: session.hintUsed })}
                    onPress={() => void grade(choice)}
                  />
                ))}
              </View>

              {grading ? <Text style={styles.saving}>Saving review…</Text> : null}
            </>
          )}
          </View>
          </Reveal>
        </ScrollView>
      </View>
      {guideOverlay}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function EmptyReview({
  anchorRef,
  title,
  text,
  action,
  onPress,
}: {
  anchorRef?: RefObject<View | null>;
  title: string;
  text: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      <Pressable
        ref={anchorRef} collapsable={false} testID={anchorRef ? 'guide-review-primary' : undefined}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
        <Text style={styles.emptyActionText}>{action}</Text>
      </Pressable>
    </View>
  );
}

function CompareCard({
  anchorRef,
  label,
  text,
  accent,
}: {
  anchorRef?: RefObject<View | null>;
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.compareCard, accent && styles.compareCardAccent]}>
      <View ref={anchorRef} collapsable={false} testID={anchorRef ? 'guide-review-primary' : undefined}>
        <Text style={[styles.compareLabel, accent && styles.compareLabelAccent]}>{label}</Text>
      </View>
      <Text style={styles.compareText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  dashboard: { padding: spacing.lg, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  loading: { color: colors.muted, fontSize: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 42 },
  brandDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 2.8 },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  dashboardTitle: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1.2, marginTop: 8 },
  dashboardText: { color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 9, maxWidth: 560 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  metric: { flex: 1, minHeight: 76, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 12, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  primary: { minHeight: 56, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { color: '#25140e', fontSize: 13, fontWeight: '800' },
  primarySubtext: { color: 'rgba(37,20,14,0.68)', fontSize: 9.5, marginTop: 2 },
  primaryArrow: { color: '#25140e', fontSize: 20 },
  secondaryLarge: { minHeight: 48, marginTop: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  secondaryLargeText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  utilityRow: {
    minHeight: 62,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  utilityLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.15 },
  utilityTitle: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 3 },
  utilityArrow: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  completeNotice: { marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(180,216,174,0.2)', backgroundColor: 'rgba(180,216,174,0.055)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  completeMark: { color: colors.success, fontSize: 18 },
  completeCopy: { flex: 1 },
  completeTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  completeText: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  blockedCard: { marginTop: spacing.xl, minHeight: 88, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,128,91,0.25)', backgroundColor: colors.accentSoft, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  blockedLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  blockedTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  blockedText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4, maxWidth: 300 },
  arrow: { color: colors.accent, fontSize: 19 },
  clearCard: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(180,216,174,0.18)', backgroundColor: 'rgba(180,216,174,0.045)', padding: spacing.lg },
  clearMark: { color: colors.success, fontSize: 20 },
  clearTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 8 },
  clearText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 5 },
  emptyCard: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 5 },
  emptyAction: { alignSelf: 'flex-start', minHeight: layout.minTouch, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 14, justifyContent: 'center' },
  emptyActionText: { color: '#25140e', fontSize: 11, fontWeight: '800' },
  textButton: { minHeight: layout.minTouch, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.muted, fontSize: 10.5, fontWeight: '600' },
  reviewPage: { flex: 1 },
  reviewTop: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line },
  endReview: { color: colors.danger, fontSize: 10.5, fontWeight: '600' },
  endAction: { width: 96, minHeight: layout.minTouch, justifyContent: 'center' },
  reviewTopActions: { width: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  helpButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  blockedHelp: { marginLeft: 'auto', minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.accent, fontSize: 18, fontWeight: '600' },
  progressCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
  progressLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2 },
  progressValue: { color: colors.text, fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  subjectTop: { color: colors.muted, fontSize: 9.5, maxWidth: 44 },
  reviewProgress: { paddingHorizontal: spacing.lg },
  reviewContent: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 28,
    paddingBottom: 56,
  },
  stageCue: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.35,
    marginBottom: 18,
  },
  topicKicker: { color: colors.accent, fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 1.4 },
  prompt: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginTop: 10,
    maxWidth: 650,
  },
  hintButton: { alignSelf: 'flex-start', minHeight: layout.minTouch, marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 13, justifyContent: 'center' },
  hintButtonText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  hintCard: { marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,128,91,0.2)', backgroundColor: colors.accentSoft, padding: 12 },
  hintLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  hintText: { color: colors.text, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  answerLabel: { color: colors.subtle, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.3, marginTop: spacing.xl, marginBottom: 8 },
  answerInput: {
    minHeight: 156,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.42)',
    paddingHorizontal: 2,
    paddingVertical: 15,
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  confidenceLabel: { color: colors.muted, fontSize: 10.5, fontWeight: '600', marginTop: spacing.lg, marginBottom: 8 },
  confidenceRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.66)',
    padding: 4,
    gap: 4,
  },
  confidenceCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  confidenceActive: { backgroundColor: colors.accentSoft },
  confidenceTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  confidenceTitleActive: { color: colors.accent },
  confidenceHelp: { color: colors.subtle, fontSize: 8.5, marginTop: 3 },
  disabled: { opacity: 0.38 },
  compareCard: {
    marginTop: spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.lineStrong,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compareCardAccent: {
    borderLeftColor: colors.accent,
    backgroundColor: colors.accentFaint,
  },
  compareLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  compareLabelAccent: { color: colors.accent },
  compareText: { color: colors.text, fontSize: 12.5, lineHeight: 20, marginTop: 7 },
  recallMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  recallMetaText: { color: colors.subtle, fontSize: 9 },
  gradeHeading: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '700', marginTop: spacing.xl },
  gradeHelp: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  gradeStack: { gap: 8, marginTop: spacing.md },
  saving: { color: colors.muted, fontSize: 9.5, textAlign: 'center', marginTop: 9 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
