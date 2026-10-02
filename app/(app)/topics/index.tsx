import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { TopicStatus } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { examStatus, nearestUpcomingExam } from '@/src/features/exams/exam-engine';
import { TopicCard } from '@/src/features/topics/TopicCard';
import { filterTopics, topicSubjects } from '@/src/features/topics/topic-operations';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';

type StatusFilter = TopicStatus | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'review', label: 'Review' },
];

export default function TopicsScreen() {
  const { status, workspace, saveError } = useWorkspace();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const now = Date.now();

  const subjects = useMemo(() => topicSubjects(workspace?.topics ?? []), [workspace?.topics]);
  const nextExam = useMemo(
    () => (workspace ? nearestUpcomingExam(workspace, now) : null),
    [now, workspace],
  );

  const topics = useMemo(
    () =>
      filterTopics(workspace?.topics ?? [], {
        query,
        status: statusFilter,
        subject: subjectFilter,
      }),
    [query, statusFilter, subjectFilter, workspace?.topics],
  );

  const activeFilter = Boolean(query.trim()) || statusFilter !== 'all' || subjectFilter !== 'all';
  const totalTopics = workspace?.topics.length ?? 0;
  const reviewCount = (workspace?.topics ?? []).filter((topic) => topic.status === 'review').length;

  if (status === 'loading' || status === 'idle') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Opening Library…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.screen}>
        <ScreenHeader
          variant="compact"
          title="Library"
          actionLabel="Exams"
          onAction={() => router.push('/(app)/exams')}
        />

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {totalTopics} {totalTopics === 1 ? 'topic' : 'topics'} · {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
            {reviewCount ? ` · ${reviewCount} in review` : ''}
          </Text>
        </View>

        <View style={styles.contextList}>
          {nextExam ? (
            <ActionRow
              icon="calendar"
              title={nextExam.name}
              detail={examStatus(nextExam.date, now).label}
              meta="Exam"
              onPress={() =>
                router.push({
                  pathname: '/(app)/exams/[examId]',
                  params: { examId: nextExam.id },
                })
              }
            />
          ) : (
            <ActionRow
              icon="calendar"
              title="Exams"
              detail="Add dates so Today can raise the right topics."
              meta="Open"
              onPress={() => router.push('/(app)/exams')}
            />
          )}
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            accessibilityLabel="Search Library"
            value={query}
            onChangeText={setQuery}
            placeholder="Search topics or subjects"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.accent}
            style={styles.search}
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showFilters }}
          onPress={() => setShowFilters((current) => !current)}
          style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}>
          <Text style={styles.filterToggleTitle}>Filters</Text>
          <Text style={[styles.filterToggleMeta, activeFilter && styles.filterToggleMetaActive]}>
            {activeFilter ? 'On' : showFilters ? 'Hide' : 'Show'}
          </Text>
        </Pressable>

        <AnimatedDisclosure visible={showFilters} style={styles.filtersPanel}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}>
              {STATUS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.value}
                  label={filter.label}
                  active={statusFilter === filter.value}
                  onPress={() => setStatusFilter(filter.value)}
                />
              ))}
            </ScrollView>

            {subjects.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}>
                <FilterChip
                  label="All subjects"
                  active={subjectFilter === 'all'}
                  onPress={() => setSubjectFilter('all')}
                />
                {subjects.map((subject) => (
                  <FilterChip
                    key={subject}
                    label={subject}
                    active={subjectFilter === subject}
                    onPress={() => setSubjectFilter(subject)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {activeFilter ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setStatusFilter('all');
                  setSubjectFilter('all');
                }}
                style={({ pressed }) => [styles.clearFilters, pressed && styles.pressed]}>
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </Pressable>
            ) : null}
        </AnimatedDisclosure>

        {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

        <FlatList
          style={styles.listView}
          data={topics}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, topics.length === 0 && styles.listEmpty]}
          renderItem={({ item, index }) => (
            <MotionItem delay={Math.min(index * 30, 120)}>
            <TopicCard
              topic={item}
              onPress={() =>
                router.push({
                  pathname: '/(app)/topics/[topicId]',
                  params: { topicId: item.id },
                })
              }
            />
            </MotionItem>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {activeFilter ? 'Nothing matches those filters.' : 'Start with one real topic.'}
              </Text>
              <Text style={styles.emptyText}>
                {activeFilter
                  ? 'Clear a search or filter to see the rest of your Library.'
                  : 'Use Add below to capture a chapter, concept or skill. Details can grow later.'}
              </Text>
              {activeFilter ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery('');
                    setStatusFilter('all');
                    setSubjectFilter('all');
                  }}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
                  <Text style={styles.emptyActionText}>Clear filters</Text>
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

function FilterChip({
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
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  loadingText: { color: colors.muted, ...type.meta },
  summary: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  summaryText: { color: colors.muted, ...type.meta },
  contextList: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
  },
  searchWrap: {
    width: 'auto',
    maxWidth: layout.contentMax,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  search: {
    flex: 1,
    minHeight: 48,
    color: colors.text,
    ...type.body,
  },
  clearButton: {
    minHeight: 44,
    paddingLeft: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { color: colors.muted, ...type.meta, fontWeight: '600' },
  filterToggle: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    minHeight: 52,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterToggleTitle: { color: colors.textDim, ...type.bodyStrong },
  filterToggleMeta: { color: colors.subtle, ...type.meta, fontWeight: '600' },
  filterToggleMetaActive: { color: colors.accent },
  filtersPanel: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingBottom: space.xs,
  },
  filterScroll: {
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  filterChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  filterChipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  filterText: { color: colors.muted, ...type.meta, fontWeight: '600' },
  filterTextActive: { color: colors.accent },
  clearFilters: {
    minHeight: 44,
    alignSelf: 'flex-start',
    marginHorizontal: space.lg,
    paddingRight: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFiltersText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  saveError: {
    color: colors.danger,
    ...type.meta,
    marginHorizontal: space.lg,
    marginBottom: space.xs,
  },
  listView: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  emptyTitle: { color: colors.text, ...type.section, textAlign: 'center' },
  emptyText: {
    color: colors.muted,
    ...type.body,
    textAlign: 'center',
    marginTop: space.xs,
    maxWidth: 360,
  },
  emptyAction: {
    minHeight: 48,
    marginTop: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: { color: colors.text, ...type.bodyStrong },
  pressed: { opacity: 0.7, transform: [{ scale: motion.pressScale }] },
});
