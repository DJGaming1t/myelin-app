
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { CommitmentForm } from '@/src/features/planning/CommitmentForm';
import { colors } from '@/src/theme/tokens';

export default function EditCommitmentScreen() {
  const params = useLocalSearchParams<{ commitmentId?: string | string[] }>();
  const commitmentId = Array.isArray(params.commitmentId)
    ? params.commitmentId[0]
    : params.commitmentId;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackdrop />
      <CommitmentForm commitmentId={commitmentId} />
    </SafeAreaView>
  );
}
