import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

export default function PlanSetupScreen() {
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const hasWork = workspace.tasks.length > 0 || workspace.topics.length > 0;
  return <SafeAreaView style={styles.safe}>
    <AmbientBackdrop />
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader variant="compact" eyebrow="YOUR STUDY PLAN" title="Set up one step at a time" subtitle="Start with what matters. Add the rest whenever you are ready." onBack={() => router.back()} />
      <View style={styles.intro}>
        <Text style={styles.kicker}>START HERE</Text>
        <Text style={styles.heading}>{hasWork ? 'Keep building your plan.' : 'What would you like to get done?'}</Text>
        <Text style={styles.copy}>A real task and its deadline help Today suggest your next step. Nothing here resets your existing work.</Text>
      </View>
      <Text style={styles.section}>1 · Add the work</Text>
      <ActionRow icon="today" title="Add a task" detail="A small, concrete thing you can start" meta={workspace.tasks.length ? `${workspace.tasks.length} saved` : undefined} accent onPress={() => router.push('/(app)/today/task/new')} />
      <ActionRow icon="calendar" title="Plan a project in parts" detail="Choose a day and duration for each part" onPress={() => router.push('/(app)/today/project/new')} />
      <ActionRow icon="library" title="Add a topic" detail="Something to learn or revise" meta={workspace.topics.length ? `${workspace.topics.length} saved` : undefined} onPress={() => router.push('/(app)/topics/new')} />
      <Text style={styles.section}>2 · Add your time and deadlines</Text>
      <ActionRow icon="calendar" title="Add an exam" detail="Give important deadlines a place in your plan" meta={workspace.exams.length ? `${workspace.exams.length} saved` : undefined} onPress={() => router.push('/(app)/exams/new')} />
      <ActionRow icon="today" title="Add fixed time" detail="School, commute or other commitments" meta={workspace.commitments.length ? `${workspace.commitments.length} saved` : undefined} onPress={() => router.push('/(app)/today/commitment/new')} />
      <ActionRow icon="settings" title="Review daily capacity" detail={`Currently ${workspace.settings.dailyMinutes} minutes per day`} onPress={() => router.push('/(app)/settings')} />
      <Text style={styles.footer}>Every step is optional. Return to Today when you are ready to begin.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  intro: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentFaint, padding: 18, marginTop: 8 },
  kicker: { color: colors.accentBright, ...type.label, letterSpacing: 1 },
  heading: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '700', marginTop: 8 },
  copy: { color: colors.textDim, ...type.meta, marginTop: 8 },
  section: { color: colors.text, ...type.section, marginTop: 26, marginBottom: 4 },
  footer: { color: colors.subtle, ...type.meta, marginTop: 24 },
});
