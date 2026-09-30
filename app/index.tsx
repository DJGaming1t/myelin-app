import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function IndexScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <View style={styles.markDot} />
          </View>
          <Text style={styles.brand}>MYELIN</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>NATIVE MIGRATION · FOUNDATION</Text>
          <Text style={styles.title}>
            Study with{'
'}
            <Text style={styles.titleAccent}>intention.</Text>
          </Text>
          <Text style={styles.body}>
            The Expo version is being rebuilt beside the working web app. Nothing
            from the live version is being replaced until feature parity is verified.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>MIGRATION PRINCIPLE</Text>
          <Text style={styles.cardTitle}>Preserve behaviour. Improve the platform.</Text>
          <Text style={styles.cardBody}>
            Authentication, planning, focus, recall, mistakes and progress will move
            across one system at a time.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expo migration status"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Foundation ready</Text>
          <Text style={styles.buttonArrow}>→</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
  brand: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
  },
  hero: { flex: 1, justifyContent: 'center', paddingBottom: spacing.xl },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -2,
    fontWeight: '600',
  },
  titleAccent: { color: colors.accent },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.lg,
    maxWidth: 500,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: {
    color: colors.accent,
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  cardBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonText: { color: '#24130E', fontSize: 14, fontWeight: '700' },
  buttonArrow: { color: '#24130E', fontSize: 20, fontWeight: '500' },
});
