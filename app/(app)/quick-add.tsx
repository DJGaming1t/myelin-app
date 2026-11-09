import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { chalkTheme, colors, layout, space, type } from '@/src/theme/tokens';

export default function QuickAddScreen() {
  return (
    <SafeAreaView style={styles.graphiteSafe}>
      <AmbientBackdrop dark />
      <View style={styles.page}>
        <ScreenHeader
          dark
          variant="compact"
          title="Add to MYELIN"
          subtitle="Capture the thing first. MYELIN can help organise the rest."
          onBack={() => router.back()}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.section}>What are you adding?</Text>
          <View style={styles.list}>
            <ActionRow
              icon="library"
              title="Topic"
              detail="Something you are learning or revising"
              accent
              onPress={() => router.push('/(app)/new-topic')}
            />
            <ActionRow
              icon="today"
              title="Task"
              detail="Homework, practice, revision or an assignment"
              onPress={() => router.push('/(app)/today/task/new')}
            />
            <ActionRow
              icon="calendar"
              title="Exam"
              detail="A deadline that should change what MYELIN prioritises"
              onPress={() => router.push('/(app)/exams/new')}
            />
            <ActionRow
              icon="today"
              title="Fixed time"
              detail="School, tuition, commute or another commitment"
              onPress={() => router.push('/(app)/new-fixed-time')}
            />
          </View>

          <Text style={styles.note}>
            You only need the basics now. Detailed scheduling and study settings stay available after creation.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  graphiteSafe: { flex: 1, backgroundColor: chalkTheme.hero },
  page: { flex: 1 },
  scroll: { flex: 1, backgroundColor: chalkTheme.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
  },
  section: {
    color: colors.text,
    ...type.section,
    marginTop: space.md,
    marginBottom: space.md,
  },
  list: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: space.md,
  },
  note: {
    color: colors.subtle,
    ...type.meta,
    marginTop: space.lg,
    maxWidth: layout.readingMax,
  },
});
