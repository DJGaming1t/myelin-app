import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function AuthenticatedCheckpointScreen() {
  const { user, localMode, signOutUser, exitLocalMode } = useAuth();

  async function leave() {
    if (localMode) await exitLocalMode();
    else await signOutUser();
    router.replace('/');
  }

  const title = localMode
    ? 'Local workspace ready.'
    : `Welcome${user?.displayName ? `, ${user.displayName}` : ''}.`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brand}>MYELIN</Text>
        </View>

        <View style={styles.center}>
          <Text style={styles.eyebrow}>AUTHENTICATION CHECKPOINT</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            {localMode
              ? 'You entered without an account. Future study data for this mode will remain a separate on-device workspace.'
              : 'Your account session is working. The Today screen will replace this checkpoint in Feature 2.'}
          </Text>

          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>MODE</Text>
              <Text style={styles.statusValue}>{localMode ? 'On-device only' : 'Firebase account'}</Text>
            </View>
            {!localMode ? (
              <>
                <View style={styles.divider} />
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>EMAIL</Text>
                  <Text style={styles.statusValue} numberOfLines={1}>{user?.email}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>VERIFIED</Text>
                  <Text style={[styles.statusValue, styles.verified]}>Yes</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        <AuthButton
          label={localMode ? 'Return to sign in' : 'Sign out'}
          variant="secondary"
          onPress={leave}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  center: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 39,
    lineHeight: 44,
    fontWeight: '650',
    letterSpacing: -1.5,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.md,
    maxWidth: 520,
  },
  statusCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  statusLabel: { color: colors.subtle, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.3 },
  statusValue: { color: colors.text, fontSize: 12, fontWeight: '650', flexShrink: 1 },
  verified: { color: colors.success },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
});
