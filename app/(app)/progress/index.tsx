import { NeuralMap } from '@/src/features/adaptive/NeuralMap';
import { LearningInsights, OutcomeEvidence } from '@/src/features/adaptive/LearningInsights';
import { AdaptationInsightList } from '@/src/features/adaptive/AdaptationInsights';
import { useScreenClock } from '@/src/features/planning/useScreenClock';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  ConfidenceBucket,
  TopicTrend,
  buildProgressSnapshot,
  formatMinutesCompact,
} from '@/src/features/progress/progress-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export default function ProgressScreen() {
  const { workspace } = useWorkspace();
  const now = useScreenClock();
  const [showEvidence, setShowEvidence] = useState(false);

  const snapshot = useMemo(
    () => (workspace ? buildProgressSnapshot(workspace, now) : null),
    [workspace, now],
  );

  if (!workspace || !snapshot) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Building progress view…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.page}>
        <ScreenHeader
          variant="compact"
          title="Progress"
          actionLabel="Settings"
          onAction={() => router.push('/(app)/settings')}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <NeuralMap workspace={workspace} />
          <LearningInsights workspace={workspace} now={now} />
          <AdaptationInsightList
            workspace={workspace}
            now={now}
            onOpenTopic={(topicId) =>
              router.push({
                pathname: '/(app)/topics/[topicId]',
                params: { topicId },
              })
            }
          />
          <Reveal delay={35} distance={7}>
            <View style={styles.summaryGrid}>
              <Metric label="LAST 7 DAYS" value={formatMinutesCompact(snapshot.study.last7Minutes)} />
              <Metric label="ACTIVE DAYS" value={`${snapshot.study.activeDaysLast7}/7`} />
              <Metric label="REVIEWS · 30D" value={String(snapshot.reviews.last30)} />
              <Metric label="DUE CORRECTIONS" value={String(snapshot.mistakes.due)} />
            </View>
          </Reveal>

          <SectionTitle
            title="Study time"
            subtitle="Recorded study + review minutes."
          />
          <StudyBars
            points={snapshot.study.last7Days}
            previous7Minutes={snapshot.study.previous7Minutes}
            current7Minutes={snapshot.study.last7Minutes}
          />

          {snapshot.mistakes.due > 0 ? (
            <View style={styles.progressActionList}>
              <ActionRow
                icon="review"
                title={`${snapshot.mistakes.due} ${snapshot.mistakes.due === 1 ? 'correction' : 'corrections'} due`}
                detail="Retest before the correction fades."
                meta="Review"
                accent
                onPress={() => router.push('/(app)/mistakes/retest')}
              />
            </View>
          ) : null}

          <SectionTitle
            title="Recall"
            subtitle="How recent graded retrieval attempts went."
          />
          {snapshot.reviews.last30 > 0 ? (
            <View style={styles.panel}>
              <OutcomeRow
                label="Again"
                value={snapshot.reviews.again}
                total={snapshot.reviews.last30}
                tone="danger"
              />
              <OutcomeRow
                label="Practising"
                value={snapshot.reviews.practising}
                total={snapshot.reviews.last30}
              />
              <OutcomeRow
                label="Good"
                value={snapshot.reviews.good}
                total={snapshot.reviews.last30}
                tone="success"
              />
            </View>
          ) : (
            <Insufficient text="No graded recall results in the last 30 days yet." />
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showEvidence }}
            onPress={() => setShowEvidence((current) => !current)}
            style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}>
            <Text style={styles.inlineActionText}>
              {showEvidence ? 'Hide deeper evidence' : 'See deeper evidence'}
            </Text>
            <Text style={styles.inlineActionArrow}>{showEvidence ? '−' : '+'}</Text>
          </Pressable>

          <AnimatedDisclosure visible={showEvidence}>
              <OutcomeEvidence workspace={workspace} now={now} />
              <SectionTitle
                title="Confidence calibration"
                subtitle="Confidence before checking compared with actual recall grades."
              />
              <View style={styles.panel}>
                {snapshot.confidence.buckets.map((bucket) => (
                  <ConfidenceRow key={bucket.confidence} bucket={bucket} />
                ))}
                <View style={styles.insightDivider} />
                <Text style={styles.insightText}>{snapshot.confidence.message}</Text>
                <Text style={styles.sampleText}>
                  {snapshot.confidence.sampleSize} graded recall{' '}
                  {snapshot.confidence.sampleSize === 1 ? 'attempt' : 'attempts'}
                  {!snapshot.confidence.enoughData ? ' · at least 5 recommended' : ''}
                </Text>
              </View>

              <SectionTitle
                title="Time calibration"
                subtitle="Planned focus compared with actual finished blocks."
              />
              <View style={styles.panel}>
                {snapshot.timing.direction === 'insufficient' ? (
                  <>
                    <Text style={styles.insightText}>{snapshot.timing.message}</Text>
                    <Text style={styles.sampleText}>
                      {snapshot.timing.sampleSize}/3 completed focus blocks available
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.timingGrid}>
                      <MetricInline
                        label="PLANNED"
                        value={formatMinutesCompact(snapshot.timing.plannedMinutes)}
                      />
                      <MetricInline
                        label="ACTUAL"
                        value={formatMinutesCompact(snapshot.timing.actualMinutes)}
                      />
                      <MetricInline
                        label="MEDIAN"
                        value={`${Math.round((snapshot.timing.medianRatio ?? 1) * 100)}%`}
                      />
                    </View>
                    <Text style={styles.insightText}>{snapshot.timing.message}</Text>
                  </>
                )}
              </View>

              <SectionTitle
                title="Topic activity"
                subtitle="Recent activity compared with the previous week."
              />
              {snapshot.topics.length ? (
                <View style={styles.topicList}>
                  {snapshot.topics.slice(0, 5).map((trend) => (
                    <TopicTrendCard
                      key={trend.topicId}
                      trend={trend}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/topics/[topicId]',
                          params: { topicId: trend.topicId },
                        })
                      }
                    />
                  ))}
                </View>
              ) : (
                <Insufficient text="No topic activity has been recorded across the last 14 days yet." />
              )}

              <View style={styles.methodNote}>
                <Text style={styles.methodTitle}>Evidence, not a score</Text>
                <Text style={styles.methodText}>
                  Minutes are not mastery. Confidence is not correctness. MYELIN reports the study evidence it actually recorded.
                </Text>
              </View>
          </AnimatedDisclosure>
        </ScrollView>

        <AppNav />
      </View>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricInline}>
      <Text style={styles.metricInlineLabel}>{label}</Text>
      <Text style={styles.metricInlineValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function StudyBars({
  points,
  previous7Minutes,
  current7Minutes,
}: {
  points: { day: string; label: string; minutes: number }[];
  previous7Minutes: number;
  current7Minutes: number;
}) {
  const max = Math.max(1, ...points.map((point) => point.minutes));
  const delta = current7Minutes - previous7Minutes;
  const deltaText =
    previous7Minutes === 0
      ? current7Minutes > 0
        ? 'New recorded activity this week'
        : 'No recorded study in either week'
      : delta === 0
        ? 'Same total as the previous 7 days'
        : `${delta > 0 ? '+' : '−'}${formatMinutesCompact(Math.abs(delta))} vs previous 7 days`;

  return (
    <View style={styles.chartPanel}>
      <View style={styles.chart}>
        {points.map((point) => {
          const height = point.minutes === 0 ? 4 : Math.max(8, Math.round((point.minutes / max) * 116));
          return (
            <View key={point.day} style={styles.barColumn}>
              <Text style={styles.barValue}>{point.minutes ? formatMinutesCompact(point.minutes) : '—'}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height }]} />
              </View>
              <Text style={styles.barLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.chartFoot}>{deltaText}</Text>
    </View>
  );
}

function OutcomeRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone?: 'danger' | 'success';
}) {
  const width = total ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.outcome}>
      <View style={styles.outcomeTop}>
        <Text
          style={[
            styles.outcomeLabel,
            tone === 'danger' && styles.dangerText,
            tone === 'success' && styles.successText,
          ]}>
          {label}
        </Text>
        <Text style={styles.outcomeValue}>
          {value} · {width}%
        </Text>
      </View>
      <View style={styles.outcomeTrack}>
        <View
          style={[
            styles.outcomeFill,
            tone === 'danger' && styles.outcomeDanger,
            tone === 'success' && styles.outcomeSuccess,
            { width: `${width}%` as `${number}%` },
          ]}
        />
      </View>
    </View>
  );
}

function ConfidenceRow({ bucket }: { bucket: ConfidenceBucket }) {
  const label =
    bucket.confidence === 'sure'
      ? 'Sure'
      : bucket.confidence === 'partial'
        ? 'Partly sure'
        : 'Unsure';

  return (
    <View style={styles.confidenceRow}>
      <View style={styles.confidenceCopy}>
        <Text style={styles.confidenceLabel}>{label}</Text>
        <Text style={styles.confidenceMeta}>
          {bucket.attempts
            ? `${bucket.attempts} attempts · ${bucket.good} Good · ${bucket.again} Again`
            : 'No attempts yet'}
        </Text>
      </View>
      <Text style={styles.confidenceGrade}>
        {bucket.averageGrade === null ? '—' : bucket.averageGrade.toFixed(2)}
      </Text>
    </View>
  );
}

function TopicTrendCard({
  trend,
  onPress,
}: {
  trend: TopicTrend;
  onPress: () => void;
}) {
  const directionText =
    trend.direction === 'more-active'
      ? 'More activity'
      : trend.direction === 'less-active'
        ? 'Less activity'
        : trend.direction === 'new-data'
          ? 'New activity'
          : 'Similar activity';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}>
      <View style={styles.topicTop}>
        <View style={styles.topicCopy}>
          <Text style={styles.topicSubject}>{trend.subject.toUpperCase()}</Text>
          <Text style={styles.topicName}>{trend.topicName}</Text>
        </View>
        <Text style={styles.topicDirection}>{directionText}</Text>
      </View>

      <View style={styles.topicStats}>
        <Text style={styles.topicStat}>
          7d: <Text style={styles.topicStatStrong}>{formatMinutesCompact(trend.recentMinutes)}</Text>
        </Text>
        <Text style={styles.topicStat}>
          prior: <Text style={styles.topicStatStrong}>{formatMinutesCompact(trend.previousMinutes)}</Text>
        </Text>
        <Text style={styles.topicStat}>
          reviews: <Text style={styles.topicStatStrong}>{trend.recentReviews}</Text>
        </Text>
      </View>

      {trend.recentReviews > 0 ? (
        <Text style={styles.topicGrade}>
          Recent average review grade: {trend.recentAverageGrade?.toFixed(2) ?? '—'} / 3
        </Text>
      ) : null}
    </Pressable>
  );
}

function Insufficient({ text }: { text: string }) {
  return (
    <View style={styles.insufficient}>
      <Text style={styles.insufficientText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 44 },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 0,
    rowGap: 0,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.74)',
    overflow: 'hidden',
  },
  metric: {
    width: '50%',
    minHeight: 72,
    paddingHorizontal: 13,
    paddingVertical: 11,
    justifyContent: 'space-between',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  metricLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.05 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sectionHeading: { marginTop: spacing.xl, marginBottom: 9 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sectionSubtitle: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4, maxWidth: 540 },
  chartPanel: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panelGlass, padding: 14 },
  chart: { minHeight: 154, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, alignItems: 'center' },
  barValue: { color: colors.subtle, fontSize: 7.5, marginBottom: 5 },
  barTrack: { height: 116, width: '70%', maxWidth: 28, justifyContent: 'flex-end', borderRadius: 8, backgroundColor: colors.bg, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 8, backgroundColor: colors.accent },
  barLabel: { color: colors.muted, fontSize: 8.5, fontWeight: '700', marginTop: 6 },
  chartFoot: { color: colors.muted, fontSize: 9.5, marginTop: 10, textAlign: 'center' },
  panel: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  outcome: { marginBottom: 12 },
  outcomeTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  outcomeLabel: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  outcomeValue: { color: colors.muted, fontSize: 9.5 },
  dangerText: { color: colors.danger },
  successText: { color: colors.success },
  outcomeTrack: { height: 6, borderRadius: 6, backgroundColor: colors.bg, overflow: 'hidden', marginTop: 6 },
  outcomeFill: { height: 6, borderRadius: 6, backgroundColor: colors.accent },
  outcomeDanger: { backgroundColor: colors.danger },
  outcomeSuccess: { backgroundColor: colors.success },
  panelFoot: { color: colors.subtle, fontSize: 9.5, marginTop: 1 },
  confidenceRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  confidenceCopy: { flex: 1 },
  confidenceLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  confidenceMeta: { color: colors.subtle, fontSize: 8.8, marginTop: 3 },
  confidenceGrade: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  insightDivider: { height: 1, backgroundColor: colors.line, marginTop: 10, marginBottom: 11 },
  insightText: { color: colors.text, fontSize: 10.5, lineHeight: 16 },
  sampleText: { color: colors.subtle, fontSize: 8.8, lineHeight: 14, marginTop: 5 },
  timingGrid: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  metricInline: { flex: 1, minHeight: 55, borderRadius: radius.md, backgroundColor: colors.bg, padding: 9, justifyContent: 'space-between' },
  metricInlineLabel: { color: colors.subtle, fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  metricInlineValue: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  mistakeGrid: { flexDirection: 'row', gap: 7 },
  progressActionList: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  inlineAction: { minHeight: layout.minTouch, marginTop: 8, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.22)', backgroundColor: 'rgba(255,161,145,0.045)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineActionText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  inlineActionArrow: { color: colors.danger, fontSize: 17 },
  topicList: { gap: 8 },
  topicCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panelGlass, padding: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  topicTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  topicCopy: { flex: 1 },
  topicSubject: { color: colors.accent, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  topicName: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  topicDirection: { color: colors.muted, fontSize: 8.8, fontWeight: '700' },
  topicStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  topicStat: { color: colors.subtle, fontSize: 9.2 },
  topicStatStrong: { color: colors.text, fontWeight: '700' },
  topicGrade: { color: colors.muted, fontSize: 9, marginTop: 7 },
  insufficient: { borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, padding: spacing.md },
  insufficientText: { color: colors.muted, fontSize: 10.5, lineHeight: 16 },
  methodNote: { marginTop: 34, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  methodTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  methodText: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
