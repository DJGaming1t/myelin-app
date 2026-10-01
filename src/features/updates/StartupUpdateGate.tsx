import * as Updates from 'expo-updates';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { colors, space, type } from '@/src/theme/tokens';

const STARTUP_UPDATE_GATE_MS = 4500;

export function StartupUpdateGate({ children }: PropsWithChildren) {
  const {
    isStartupProcedureRunning,
    isUpdatePending,
  } = Updates.useUpdates();

  const shouldGate = Updates.isEnabled && Updates.isEmbeddedLaunch;
  const [ready, setReady] = useState(!shouldGate);
  const released = useRef(!shouldGate);
  const reloadStarted = useRef(false);
  const manualCheckStarted = useRef(false);

  useEffect(() => {
    if (!shouldGate) return;

    const timeout = setTimeout(() => {
      released.current = true;
      setReady(true);
    }, STARTUP_UPDATE_GATE_MS);

    return () => clearTimeout(timeout);
  }, [shouldGate]);

  useEffect(() => {
    if (!shouldGate || released.current || reloadStarted.current) return;

    if (isUpdatePending) {
      reloadStarted.current = true;
      void Updates.reloadAsync().catch(() => {
        released.current = true;
        setReady(true);
      });
      return;
    }

    if (isStartupProcedureRunning || manualCheckStarted.current) return;

    manualCheckStarted.current = true;

    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (released.current) return;

        if (!check.isAvailable) {
          released.current = true;
          setReady(true);
          return;
        }

        await Updates.fetchUpdateAsync();
        if (released.current) return;

        reloadStarted.current = true;
        await Updates.reloadAsync();
      } catch {
        released.current = true;
        setReady(true);
      }
    })();
  }, [isStartupProcedureRunning, isUpdatePending, shouldGate]);

  if (ready) return children;

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.center}>
        <View style={styles.brandRow} accessible accessibilityLabel="MYELIN">
          <View style={styles.brandMark}>
            <View style={styles.brandCore} />
          </View>
          <Text style={styles.brand}>MYELIN</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Getting the latest version…</Text>
        <Text style={styles.message}>
          Applying the newest compatible MYELIN update for this build.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.lg,
  },
  brandMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: colors.accent,
  },
  brand: {
    color: colors.textDim,
    ...type.label,
    letterSpacing: 2.2,
  },
  title: {
    color: colors.text,
    ...type.hero,
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    ...type.meta,
    textAlign: 'center',
    marginTop: space.xs,
    maxWidth: 360,
  },
});
