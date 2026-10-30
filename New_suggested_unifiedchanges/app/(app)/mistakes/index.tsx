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

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppIcon } from '@/src/components/app/AppIcon';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  buildMistakeRetestQueue,
  mistakeCounts,
} from '@/src/features/mistakes/mistake-engine';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';

type Filter = 'due' | 'open' | 'resolved';

export default function MistakesScreen() {
  const { workspace, saveError } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('due');
  const [query, setQuery] = useState('');
  const [showBrowse, setShowBrowse] = useState(false);

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
          <Text style={styles.loading}>Opening corrections…</Text>
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
          title="Corrections"
          actionLabel="Add"
          onAction={() => router.push('/(app)/mistakes/new')}
        />

        <View style={styles.summaryLine}>
          <Text style={styles.summaryText}>
            {counts.open} open · {counts.resolved} resolved
          </Text>
        </View>

        {counts.due > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retest ${counts.due} due ${counts.due === 1 ? 'correction' : 'corrections'}`}
            onPress={() => router.push('/(app)/mistakes/retest')}
            style={({ pressed }) => [styles.retest, pressed && styles.pressed]}>
            <View style={styles.retestCopy}>
              <Text style={styles.retestTitle}>
                {counts.due} {counts.due === 1 ? 'correction is' : 'corrections are'} due
              </Text>
              <Text style={styles.retestMeta}>Rebuild them from memory before checking.</Text>
            </View>
            <Text style={styles.retestAction}>Retest</Text>
            <AppIcon name="chevron" size={16} color={colors.accent} />
          </Pressable>
        ) : (
          <View style={styles.clearState}>
            <Text style={styles.clearStateTitle}>Nothing needs a retest right now.</Text>
            <Text style={styles.clearStateText}>
              Corrections return when their next spaced retest is due.
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showBrowse }}
          onPress={() => setShowBrowse((current) => !current)}
          style={({ pressed }) => [styles.browseToggle, pressed && styles.pressed]}>
          <Text style={styles.browseTitle}>Browse corrections</Text>
          <Text style={styles.browseMeta}>{showBrowse ? 'Hide' : 'Search · filter · history'}</Text>
        </Pressable>

        <AnimatedDisclosure visible={showBrowse} style={styles.browsePanel}>
            <View style={styles.searchWrap}>
              <TextInput
                accessibilityLabel="Search corrections"
                value={query}
                onChangeText={setQuery}
                placeholder="Search correction, topic or cause"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.accent}
                style={styles.search}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setQuery('')}
                  hitSlop={8}>
                  <Text style={styles.clear}>Clear</Text>
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
        </AnimatedDisclosure>

        {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

        <FlatList
          style={styles.listView}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          renderItem={({ item, index }) => {
            const topic = workspace.topics.find((candidate) => candidate.id === item.topicId);
            const status = item.resolvedAt ? 'Resolved' : item.wins ? `${item.wins}/2 wins` : 'Needs proof';

            return (
              <MotionItem delay={Math.min(index * 30, 120)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.prompt}. ${status}`}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/mistakes/[mistakeId]',
                    params: { mistakeId: item.id },
                  })
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.prompt} numberOfLines={2}>{item.prompt}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {topic?.name ?? 'Unknown topic'} · {item.reason}
                  </Text>
                  {item.correction ? (
                    <Text style={styles.correction} numberOfLines={1}>{item.correction}</Text>
                  ) : null}
                </View>
                <View style={styles.rowEnd}>
                  <Text style={[styles.status, item.resolvedAt > 0 && styles.statusResolved]}>{status}</Text>
                  <AppIcon name="chevron" size={15} color={colors.subtle} />
                </View>
              </Pressable>
              </MotionItem>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filter === 'due'
                  ? 'No due corrections.'
                  : filter === 'open'
                    ? 'No open corrections.'
                    : 'No resolved corrections yet.'}
              </Text>
              <Text style={styles.emptyText}>
                {counts.total === 0
                  ? 'Review misses can create corrections automatically, or you can add one manually.'
                  : 'Choose another filter to see the rest of your correction history.'}
              </Text>
              {counts.total === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(app)/mistakes/new')}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
                  <Text style={styles.emptyActionText}>Add first correction</Text>
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
  loading: { color: colors.muted, ...type.meta },
  summaryLine: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  summaryText: { color: colors.muted, ...type.meta },
  retest: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    minHeight: 72,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  retestCopy: { flex: 1 },
  retestTitle: { color: colors.text, ...type.bodyStrong },
  retestMeta: { color: colors.muted, ...type.meta, marginTop: 2 },
  retestAction: { color: colors.accent, ...type.meta, fontWeight: '700' },
  clearState: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  clearStateTitle: { color: colors.textDim, ...type.bodyStrong },
  clearStateText: { color: colors.muted, ...type.meta, marginTop: 2 },
  browseToggle: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    minHeight: 54,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  browseTitle: { color: colors.text, ...type.bodyStrong },
  browseMeta: { color: colors.subtle, ...type.meta, fontWeight: '600' },
  browsePanel: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
  },
  searchWrap: {
    marginHorizontal: space.lg,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  search: { flex: 1, minHeight: 48, color: colors.text, ...type.body },
  clear: { color: colors.muted, ...type.meta, fontWeight: '600', paddingLeft: space.sm },
  filters: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.xs },
  filter: {
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  filterActive: { borderColor: colors.accentLine, backgroundColor: colors.accentFaint },
  filterText: { color: colors.muted, ...type.meta, fontWeight: '600' },
  filterTextActive: { color: colors.accent },
  saveError: { color: colors.danger, ...type.meta, marginHorizontal: space.lg, marginBottom: space.xs },
  listView: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  prompt: { color: colors.text, ...type.bodyStrong },
  rowMeta: { color: colors.muted, ...type.meta, marginTop: 3, textTransform: 'capitalize' },
  correction: { color: colors.subtle, ...type.meta, marginTop: 3 },
  rowEnd: { alignItems: 'flex-end', gap: space.xs },
  status: { color: colors.accent, ...type.meta, fontWeight: '700' },
  statusResolved: { color: colors.success },
  empty: { alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  emptyTitle: { color: colors.text, ...type.section, textAlign: 'center' },
  emptyText: { color: colors.muted, ...type.body, textAlign: 'center', marginTop: space.xs, maxWidth: 350 },
  emptyAction: {
    minHeight: layout.minTouch,
    marginTop: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: { color: '#25140e', ...type.bodyStrong },
  pressed: { opacity: 0.68, transform: [{ scale: motion.pressScale }] },
});
