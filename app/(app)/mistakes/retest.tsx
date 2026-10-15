import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { OwnerMistakeRetest } from '@/src/features/mistakes/MistakeRetest';
import { colors, spacing } from '@/src/theme/tokens';

export default function MistakeRetestScreen() {
  const { ownerKey, workspace, status } = useWorkspace();
  if (!ownerKey || !workspace || status !== 'ready') return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
        <Text style={{ color: colors.muted }}>Opening retest…</Text>
      </View>
    </SafeAreaView>
  );
  return <OwnerMistakeRetest key={ownerKey} ownerKey={ownerKey} />;
}
