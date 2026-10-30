import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { colors, layout, space, type } from '@/src/theme/tokens';

export default function QuickAddScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.page}>
        <ScreenHeader
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
              onPress={() => router.push('/(app)/topics/new')}
            />
            <ActionRow
              icon="today"
              title="Task"
              detail="Homework, practice, revision or an assignment"
              onPress={() => router.push('/(app)/today/task/new')}
            />
            <ActionRow
              icon="calendar"
              title="Project in parts"
              detail="Break a project into work for different days"
              onPress={() => router.push('/(app)/today/project/new')}
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
              onPress={() => router.push('/(app)/today/commitment/new')}
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
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
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
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  note: {
    color: colors.subtle,
    ...type.meta,
    marginTop: space.lg,
    maxWidth: layout.readingMax,
  },
});
