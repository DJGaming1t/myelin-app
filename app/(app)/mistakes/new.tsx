import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { NewMistakeEditor } from '@/src/features/mistakes/MistakeNotebook';
import { colors } from '@/src/theme/tokens';
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value ?? ''; }
export default function MistakeScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[]; cardId?: string | string[] }>();
  const { ownerKey, workspace, status } = useWorkspace();
  if (!ownerKey || !workspace || status !== 'ready') return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.muted }}>Opening notebook…</Text></View></SafeAreaView>;
  return <NewMistakeEditor key={JSON.stringify([ownerKey, param(params.topicId), param(params.cardId)])} ownerKey={ownerKey} topicId={param(params.topicId)} cardId={param(params.cardId)} />;
}
