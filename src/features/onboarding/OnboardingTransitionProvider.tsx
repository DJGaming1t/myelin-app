import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

type TransitionTask = () => Promise<void> | void;

type OnboardingTransitionContextValue = {
  runTransition: (commit: TransitionTask) => Promise<void>;
  runEntryTransition: (
    task: TransitionTask,
    commit: TransitionTask,
  ) => Promise<void>;
  entryPending: boolean;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function OnboardingTransitionProvider({ children }: PropsWithChildren) {
  const [entryPending, setEntryPending] = useState(false);
  const running = useRef(false);

  const runTransition = useCallback(async (commit: TransitionTask) => {
    if (running.current) return;

    running.current = true;
    try {
      // Screen motion is owned by Expo Router's native stack. Keeping this
      // provider logic-only avoids double animations and route/overlay races.
      await commit();
    } finally {
      running.current = false;
    }
  }, []);

  const runEntryTransition = useCallback(
    async (task: TransitionTask, commit: TransitionTask) => {
      if (running.current) return;

      running.current = true;
      setEntryPending(true);

      try {
        // Native auth (including the Google account picker) finishes first.
        await task();

        // Give React one frame to observe the authenticated state while the
        // auth layout is still protected by entryPending, then navigate once.
        await nextFrame();
        await commit();
      } finally {
        setEntryPending(false);
        running.current = false;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ runTransition, runEntryTransition, entryPending }),
    [entryPending, runEntryTransition, runTransition],
  );

  return (
    <OnboardingTransitionContext.Provider value={value}>
      {children}
    </OnboardingTransitionContext.Provider>
  );
}

export function useOnboardingTransition() {
  const value = useContext(OnboardingTransitionContext);
  if (!value) {
    throw new Error(
      'useOnboardingTransition must be used inside OnboardingTransitionProvider.',
    );
  }
  return value;
}
