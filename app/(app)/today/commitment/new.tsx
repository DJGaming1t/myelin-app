
import { SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { CommitmentForm } from '@/src/features/planning/CommitmentForm';
import { colors } from '@/src/theme/tokens';

export default function NewCommitmentScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackdrop />
      <CommitmentForm />
    </SafeAreaView>
  );
}
