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

import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { TopicStatus } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { TopicCard } from '@/src/features/topics/TopicCard';
import { filterTopics, topicSubjects } from '@/src/features/topics/topic-operations';
import { colors, radius, spacing } from '@/src/theme/tokens';

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

  const subjects = useMemo(() => topicSubjects(workspace?.topics ?? []), [workspace?.topics]);

  const topics = useMemo(
    () =>
      filterTopics(workspace?.topics ?? [], {
        query,
        status: statusFilter,
        subject: subjectFilter,
      }),
    [query, statusFilter, subjectFilter, workspace?.topics],
  );

  const activeFilter = query.trim() || statusFilter !== 'all' || subjectFilter !== 'all';

  if (status === 'loading' || status === 'idle') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Opening your topics…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
      <ScreenHeader
        eyebrow="STUDY LIBRARY"
        title="Topics"
        subtitle="Keep study material structured enough to review, without turning setup into homework."
        actionLabel="+ Add"
        onAction={() => router.push('/(app)/topics/new')}
      />

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel="Search topics"
          value={query}
          onChangeText={setQuery}
          placeholder="Search topics, subjects, notes or questions"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          style={styles.search}
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityRole="button" onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clear}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View>
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
            contentContainerStyle={styles.subjectScroll}>
            <FilterChip
              label="All subjects"
              active={subjectFilter === 'all'}
              onPress={() => setSubjectFilter('all')}
              subtle
            />
            {subjects.map((subject) => (
              <FilterChip
                key={subject}
                label={subject}
                active={subjectFilter === subject}
                onPress={() => setSubjectFilter(subject)}
                subtle
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

      <FlatList
        style={styles.listView}
        data={topics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          topics.length === 0 && styles.listEmpty,
        ]}
        renderItem={({ item }) => (
          <TopicCard
            topic={item}
            onPress={() =>
              router.push({
                pathname: '/(app)/topics/[topicId]',
                params: { topicId: item.id },
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <Text style={styles.emptyMarkText}>+</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter ? 'Nothing matches that filter.' : 'Start with one real topic.'}
            </Text>
            <Text style={styles.emptyText}>
              {activeFilter
                ? 'Clear a search or filter to see the rest of your library.'
                : 'Add the chapter, concept or skill you actually plan to study. Questions and notes can grow later.'}
            </Text>
            {activeFilter ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setStatusFilter('all');
                  setSubjectFilter('all');
                }}
                style={({ pressed }) => [styles.emptyButtonSecondary, pressed && styles.pressed]}>
                <Text style={styles.emptyButtonSecondaryText}>Clear filters</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/topics/new')}
                style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                <Text style={styles.emptyButtonText}>Add first topic</Text>
              </Pressable>
            )}
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
  subtle,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  subtle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        subtle && styles.filterChipSubtle,
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
  listView: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.muted, fontSize: 12 },
  searchWrap: {
    marginHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  searchIcon: { color: colors.subtle, fontSize: 18, marginRight: 8 },
  search: { flex: 1, color: colors.text, fontSize: 13.5, minHeight: 46 },
  clear: { color: colors.muted, fontSize: 22, paddingLeft: 8 },
  filterScroll: { gap: 7, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 8 },
  subjectScroll: { gap: 7, paddingHorizontal: spacing.lg, paddingBottom: 10 },
  filterChip: {
    minHeight: 35,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  filterChipSubtle: { minHeight: 31, backgroundColor: colors.bg },
  filterChipActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  filterText: { color: colors.muted, fontSize: 10.5, fontWeight: '600' },
  filterTextActive: { color: colors.accent },
  list: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 40 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: 60 },
  emptyMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.22)',
    marginBottom: spacing.md,
  },
  emptyMarkText: { color: colors.accent, fontSize: 27, fontWeight: '400' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 340,
  },
  emptyButton: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  emptyButtonSecondary: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonSecondaryText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  saveError: { color: colors.danger, fontSize: 10.5, marginHorizontal: spacing.lg, marginBottom: 8 },
  pressed: { opacity: 0.7 },
});
