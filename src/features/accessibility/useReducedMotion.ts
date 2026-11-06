import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';

export function useReducedMotion() {
  const { workspace } = useWorkspace();
  const [systemReduceMotion, setSystemReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setSystemReduceMotion(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return Boolean(workspace?.settings.reduceMotion || systemReduceMotion);
}
