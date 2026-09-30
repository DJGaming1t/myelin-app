import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  examStatus,
  examTopics,
  formatExamDateLong,
  nearestUpcomingExam,
  sortExams,
} from '@/src/features/exams/exam-engine';
import { colors, radius, spacing } from '@/src/theme/tokens';

type Filter = 'upcoming' | 'past';

export default function ExamsScreen() {
  const { workspace, saveError } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const now = Date.now();

  const nextExam = useMemo(
    () => (workspace ? nearestUpcomingExam(workspace, now) : null),
    [workspace, now],
  );

  const exams = useMemo(() => {
    if (!workspace) return [];
    return sortExams(workspace.exams, now).filter((exam) => {
      const status = examStatus(exam.date, now);
      return filter === 'past' ? status.kind === 'past' : status.kind !== 'past';
    });
  }, [filter, now, workspace]);

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening exams…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <ScreenHeader
          eyebrow="EXAM PRESSURE"
          title="Exams"
          subtitle="Tell MYELIN exactly what is included. Today will increase planning pressure only for those subjects or topics as the date approaches."
          actionLabel="+ Add"
          onAction={() => router.push('/(app)/exams/new')}
        />

        {nextExam ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/(app)/exams/[examId]',
                params: { examId: nextExam.id },
              })
            }
            style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroEyebrow}>NEXT EXAM</Text>
                <Text style={styles.heroName}>{nextExam.name}</Text>
              </View>
              <Text style={styles.heroCountdown}>{examStatus(nextExam.date, now).label}</Text>
            </View>
            <Text style={styles.heroDate}>{formatExamDateLong(nextExam.date)}</Text>
            <Text style={styles.heroScope}>
              {nextExam.scope === 'subjects'
                ? `${nextExam.subjects.length} ${nextExam.subjects.length === 1 ? 'subject' : 'subjects'}`
                : `${nextExam.topicIds.length} ${nextExam.topicIds.length === 1 ? 'topic' : 'topics'}`}
              {' · '}
              {examTopics(nextExam, workspace.topics).length} MYELIN topics affected
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.filters}>
          <FilterButton
            label="Upcoming"
            active={filter === 'upcoming'}
            onPress={() => setFilter('upcoming')}
          />
          <FilterButton
            label="Past"
            active={filter === 'past'}
            onPress={() => setFilter('past')}
          />
        </View>

        {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

        <FlatList
          style={styles.listView}
          data={exams}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, exams.length === 0 && styles.listEmpty]}
          renderItem={({ item }) => {
            const status = examStatus(item.date, now);
            const affected = examTopics(item, workspace.topics);

            return (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/(app)/exams/[examId]',
                    params: { examId: item.id },
                  })
                }
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardDate}>{formatExamDateLong(item.date)}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      status.kind === 'today' && styles.statusBadgeToday,
                      status.kind === 'past' && styles.statusBadgePast,
                    ]}>
                    <Text
                      style={[
                        styles.statusText,
                        status.kind === 'today' && styles.statusTextToday,
                      ]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.scopeRow}>
                  <Text style={styles.scopeLabel}>
                    {item.scope === 'subjects' ? 'SUBJECT SCOPE' : 'TOPIC SCOPE'}
                  </Text>
                  <Text style={styles.scopeValue}>
                    {affected.length} {affected.length === 1 ? 'topic' : 'topics'} affected
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filter === 'upcoming' ? 'No upcoming exams.' : 'No past exams.'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'upcoming'
                  ? 'Add an exam so Today can use the date and syllabus scope when prioritising study.'
                  : 'Past exams remain here as a simple record until you delete them.'}
              </Text>
              {filter === 'upcoming' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(app)/exams/new')}
                  style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                  <Text style={styles.emptyButtonText}>Add exam</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />

        <AppNav />
      </View>
    </SafeAreaView>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        active && styles.filterActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  hero: { marginHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,128,91,0.28)', backgroundColor: colors.accentSoft, padding: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  heroName: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 4 },
  heroCountdown: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  heroDate: { color: colors.muted, fontSize: 10.5, marginTop: 10 },
  heroScope: { color: colors.subtle, fontSize: 9.5, marginTop: 5 },
  filters: { flexDirection: 'row', gap: 7, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  filter: { minHeight: 35, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  filterText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  filterTextActive: { color: colors.accent },
  saveError: { color: colors.danger, fontSize: 10, marginHorizontal: spacing.lg, marginBottom: 5 },
  listView: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 38 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, marginBottom: 9 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardCopy: { flex: 1 },
  cardName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cardDate: { color: colors.muted, fontSize: 10, marginTop: 4 },
  statusBadge: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 9, paddingVertical: 5 },
  statusBadgeToday: { borderColor: 'rgba(255,128,91,0.38)', backgroundColor: colors.accentSoft },
  statusBadgePast: { opacity: 0.65 },
  statusText: { color: colors.muted, fontSize: 8.5, fontWeight: '800' },
  statusTextToday: { color: colors.accent },
  scopeRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  scopeLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  scopeValue: { color: colors.muted, fontSize: 9.5 },
  empty: { alignItems: 'center', padding: spacing.xl, paddingBottom: 70 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 6, textAlign: 'center', maxWidth: 340 },
  emptyButton: { minHeight: 42, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { color: '#25140e', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
