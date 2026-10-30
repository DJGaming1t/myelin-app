import { SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ProjectPartsForm } from '@/src/features/planning/ProjectPartsForm';
import { colors } from '@/src/theme/tokens';

export default function NewProjectScreen() {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><AmbientBackdrop /><ProjectPartsForm /></SafeAreaView>;
}
