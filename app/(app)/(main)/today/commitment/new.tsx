
import { SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { CommitmentForm } from '@/src/features/planning/CommitmentForm';
import { chalkTheme } from '@/src/theme/tokens';

export default function NewCommitmentScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: chalkTheme.hero }}>
      <AmbientBackdrop dark />
      <CommitmentForm />
    </SafeAreaView>
  );
}
