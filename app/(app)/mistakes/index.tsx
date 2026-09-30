import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  buildMistakeRetestQueue,
  mistakeCounts,
} from '@/src/features/mistakes/mistake-engine';
import { colors, radius, spacing } from '@/src/theme/tokens';

type Filter = 'due' | 'open' | 'resolved';

export default function MistakesScreen() {
  const { workspace, saveError } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('due');
  const [query, setQuery] = useState('');

  const now = Date.now();
  const counts = workspace
    ? mistakeCounts(workspace, now)
    : { due: 0, open: 0, resolved: 0, total: 0 };

  const dueIds = useMemo(
    () => new Set(workspace ? buildMistakeRetestQueue(workspace, now).map((item) => item.id) : []),
    [workspace, now],
  );

  const items = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLocaleLowerCase();

    return workspace.mistakes
      .filter((mistake) => {
        if (filter === 'due') return dueIds.has(mistake.id);
        if (filter === 'open') return mistake.resolvedAt === 0;
        return mistake.resolvedAt > 0;
      })
      .filter((mistake) => {
        if (!q) return true;
        const topic = workspace.topics.find((item) => item.id === mistake.topicId);
        return [
          mistake.prompt,
          mistake.detail,
          mistake.correction,
          mistake.reason,
          topic?.name ?? '',
          topic?.subject ?? '',
        ]
          .join('\n')
          .toLocaleLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (filter === 'resolved') return b.resolvedAt - a.resolvedAt;
        if (a.wins !== b.wins) return a.wins - b.wins;
        return a.dueAt - b.dueAt;
      });
  }, [dueIds, filter, query, workspace]);

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening mistake notebook…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <ScreenHeader
          eyebrow="CORRECTION LOOP"
          title="Mistakes"
          subtitle="Keep the error, the reason and the corrected idea together—then prove the correction twice on different days."
          actionLabel="+ Add"
          onAction={() => router.push('/(app)/mistakes/new')}
        />

        <View style={styles.summary}>
          <Metric label="DUE" value={String(counts.due)} accent />
          <Metric label="OPEN" value={String(counts.open)} />
          <Metric label="RESOLVED" value={String(counts.resolved)} />
        </View>

        {counts.due > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/mistakes/retest')}
            style={({ pressed }) => [styles.retestButton, pressed && styles.pressed]}>
            <View>
              <Text style={styles.retestLabel}>RETEST DUE MISTAKES</Text>
              <Text style={styles.retestText}>
                {counts.due} {counts.due === 1 ? 'mistake is' : 'mistakes are'} ready
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        ) : null}

        <View style={styles.searchWrap}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            accessibilityLabel="Search mistakes"
            value={query}
            onChangeText={setQuery}
            placeholder="Search mistake, correction, topic or cause"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.accent}
            style={styles.search}
          />
          {query ? (
            <Pressable accessibilityRole="button" onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.clear}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}>
          <FilterChip label={`Due ${counts.due}`} active={filter === 'due'} onPress={() => setFilter('due')} />
          <FilterChip label={`Open ${counts.open}`} active={filter === 'open'} onPress={() => setFilter('open')} />
          <FilterChip label={`Resolved ${counts.resolved}`} active={filter === 'resolved'} onPress={() => setFilter('resolved')} />
        </ScrollView>

        {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

        <FlatList
          style={styles.listView}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          renderItem={({ item }) => {
            const topic = workspace.topics.find((candidate) => candidate.id === item.topicId);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/(app)/mistakes/[mistakeId]',
                    params: { mistakeId: item.id },
                  })
                }
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                <View style={styles.cardTop}>
                  <View style={styles.kickerRow}>
                    <Text style={styles.subject}>{topic?.subject ?? 'Topic'}</Text>
                    <View style={styles.dot} />
                    <Text style={styles.reason}>{item.reason.toUpperCase()}</Text>
                  </View>
                  <Text style={item.resolvedAt ? styles.resolvedBadge : styles.winBadge}>
                    {item.resolvedAt ? 'RESOLVED' : `${item.wins}/2 WINS`}
                  </Text>
                </View>

                <Text style={styles.prompt} numberOfLines={3}>{item.prompt}</Text>
                <Text style={styles.correction} numberOfLines={2}>
                  {item.correction || 'No correction written yet.'}
                </Text>

                <View style={styles.cardBottom}>
                  <Text style={styles.topicName}>{topic?.name ?? 'Unknown topic'}</Text>
                  <Text style={styles.openArrow}>→</Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filter === 'due'
                  ? 'Nothing needs a retest right now.'
                  : filter === 'open'
                    ? 'No open mistakes.'
                    : 'No resolved mistakes yet.'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'due'
                  ? 'When a correction becomes due, it will appear here automatically.'
                  : 'Mistakes graded “Again” in Active Recall can appear here automatically, or you can add one manually.'}
              </Text>
              {counts.total === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(app)/mistakes/new')}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
                  <Text style={styles.emptyActionText}>Add first mistake</Text>
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
  summary: { flexDirection: 'row', gap: 7, paddingHorizontal: spacing.lg },
  metric: { flex: 1, minHeight: 62, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 10, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  metricValueAccent: { color: colors.accent },
  retestButton: { marginHorizontal: spacing.lg, marginTop: 9, minHeight: 64, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,128,91,0.3)', backgroundColor: colors.accentSoft, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  retestLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  retestText: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  arrow: { color: colors.accent, fontSize: 20 },
  searchWrap: { marginHorizontal: spacing.lg, marginTop: 10, minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  searchGlyph: { color: colors.subtle, fontSize: 17, marginRight: 7 },
  search: { flex: 1, minHeight: 44, color: colors.text, fontSize: 12.5 },
  clear: { color: colors.muted, fontSize: 20, paddingLeft: 8 },
  filters: { gap: 7, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  filter: { minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, justifyContent: 'center', paddingHorizontal: 12 },
  filterActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  filterTextActive: { color: colors.accent },
  saveError: { color: colors.danger, fontSize: 10, marginHorizontal: spacing.lg, marginBottom: 5 },
  listView: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 38 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, marginBottom: 9 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  subject: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  dot: { width: 3, height: 3, borderRadius: 3, backgroundColor: colors.subtle },
  reason: { color: colors.accent, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  winBadge: { color: colors.muted, fontSize: 8.5, fontWeight: '800' },
  resolvedBadge: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  prompt: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 10 },
  correction: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 6 },
  cardBottom: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topicName: { color: colors.subtle, fontSize: 9.5 },
  openArrow: { color: colors.subtle, fontSize: 16 },
  empty: { alignItems: 'center', padding: spacing.xl, paddingBottom: 70 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 6, maxWidth: 330 },
  emptyAction: { minHeight: 41, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { color: '#25140e', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
