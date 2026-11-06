import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { TaskForm } from '@/src/features/planning/TaskForm';
import { colors } from '@/src/theme/tokens';

export default function NewTaskScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackdrop />
      <TaskForm />
    </SafeAreaView>
  );
}
