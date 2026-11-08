import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { TaskForm } from '@/src/features/planning/TaskForm';
import { chalkTheme } from '@/src/theme/tokens';

export default function NewTaskScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: chalkTheme.hero }}>
      <AmbientBackdrop dark />
      <TaskForm />
    </SafeAreaView>
  );
}
