import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { MistakeForm } from '@/src/features/mistakes/MistakeForm';
import {
  applyMistakeInput,
  deleteMistakeFromWorkspace,
  findMistake,
  reopenMistake,
} from '@/src/features/mistakes/mistake-engine';
import { colors, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export default function MistakeDetailScreen() {
  const params = useLocalSearchParams<{ mistakeId?: string | string[] }>();
  const mistakeId = param(params.mistakeId);
  const { workspace, updateWorkspace } = useWorkspace();

  const mistake = workspace ? findMistake(workspace, mistakeId) : null;
  const topic = workspace?.topics.find((item) => item.id === mistake?.topicId) ?? null;

  if (!workspace || !mistake || !topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Mistake not found" onBack={() => router.replace('/(app)/mistakes')} />
        <Text style={styles.missing}>This mistake is no longer available in this workspace.</Text>
      </SafeAreaView>
    );
  }

  function remove() {
    Alert.alert(
      'Delete this mistake?',
      'Linked study history will stay, but its mistake link will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            updateWorkspace((draft) => {
              deleteMistakeFromWorkspace(draft, mistakeId);
            });
            router.replace('/(app)/mistakes');
          },
        },
      ],
    );
  }

  if (!mistake.resolvedAt) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader
          eyebrow={topic.subject.toUpperCase()}
          title="Edit mistake"
          subtitle={`${mistake.wins}/2 spaced retest wins · ${topic.name}`}
          onBack={() => router.back()}
        />
        <View style={styles.body}>
          <MistakeForm
            topics={workspace.topics}
            initial={{
              topicId: mistake.topicId,
              cardId: mistake.cardId,
              prompt: mistake.prompt,
              detail: mistake.detail,
              correction: mistake.correction,
              reason: mistake.reason,
            }}
            submitLabel="Save changes"
            onCancel={() => router.back()}
            onSubmit={(input) => {
              updateWorkspace((draft) => {
                const target = findMistake(draft, mistakeId);
                if (target) applyMistakeInput(target, input);
              });
              router.back();
            }}
          />

          <Pressable
            accessibilityRole="button"
            onPress={remove}
            style={({ pressed }) => [styles.deleteFloating, pressed && styles.pressed]}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="RESOLVED"
        title={mistake.prompt}
        subtitle={topic.name}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.resolvedContent}>
        <Info label="CAUSE" text={mistake.reason} />
        <Info label="WHAT HAPPENED" text={mistake.detail || 'No detail was recorded.'} />
        <Info label="CORRECTION" text={mistake.correction || 'No correction was recorded.'} accent />

        <View style={styles.resolutionCard}>
          <Text style={styles.resolutionTitle}>Resolved after two spaced wins.</Text>
          <Text style={styles.resolutionText}>
            If this mistake returns, reopen it instead of pretending the old resolution still holds.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            updateWorkspace((draft) => {
              const target = findMistake(draft, mistakeId);
              if (target) reopenMistake(target);
            });
            router.replace({
              pathname: '/(app)/mistakes/[mistakeId]',
              params: { mistakeId },
            });
          }}
          style={({ pressed }) => [styles.reopen, pressed && styles.pressed]}>
          <Text style={styles.reopenText}>Reopen mistake</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={remove}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete mistake</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <View style={[styles.info, accent && styles.infoAccent]}>
      <Text style={[styles.infoLabel, accent && styles.infoLabelAccent]}>{label}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  missing: { color: colors.muted, padding: spacing.lg, lineHeight: 18 },
  deleteFloating: { position: 'absolute', right: spacing.lg, bottom: 8, minHeight: 38, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  resolvedContent: { padding: spacing.lg, paddingBottom: 52 },
  info: { marginBottom: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  infoAccent: { borderColor: 'rgba(180,216,174,0.2)', backgroundColor: 'rgba(180,216,174,0.045)' },
  infoLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  infoLabelAccent: { color: colors.success },
  infoText: { color: colors.text, fontSize: 12, lineHeight: 19, marginTop: 6 },
  resolutionCard: { marginTop: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.success, paddingLeft: 11 },
  resolutionTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  resolutionText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  reopen: { minHeight: 48, marginTop: spacing.xl, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  reopenText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  deleteButton: { minHeight: 44, marginTop: 9, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
});
