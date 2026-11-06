import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { TaskForm } from '@/src/features/planning/TaskForm';
import { colors } from '@/src/theme/tokens';

export default function EditTaskScreen() {
  const params = useLocalSearchParams<{ taskId?: string | string[] }>();
  const taskId = Array.isArray(params.taskId) ? params.taskId[0] : params.taskId;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackdrop />
      <TaskForm taskId={taskId} />
    </SafeAreaView>
  );
}
