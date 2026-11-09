import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { TutorialId } from './guide-registry';

export type GuideOfferChoice = 'shown' | 'later';

function storageKey(ownerKey: string, tutorialId: TutorialId) {
  return `myelin:guide-offer:v1:${ownerKey}:${tutorialId}`;
}

export function useGuideOffer(
  tutorialId: TutorialId,
  ownerKey: string | null,
  eligible: boolean,
  guideOpen: boolean,
) {
  const [decision, setDecision] = useState<GuideOfferChoice | null | 'loading'>('loading');
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<GuideOfferChoice | null>(null);

  useEffect(() => {
    if (!ownerKey) {
      setDecision('loading');
      setSaveFailed(false);
      setPendingChoice(null);
      return;
    }
    let cancelled = false;
    setDecision('loading');
    setSaveFailed(false);
    AsyncStorage.getItem(storageKey(ownerKey, tutorialId))
      .then((raw) => {
        if (cancelled) return;
        setDecision(raw === 'shown' || raw === 'later' ? raw : null);
      })
      .catch(() => {
        if (!cancelled) setDecision(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerKey, tutorialId]);

  const choose = useCallback(
    (choice: GuideOfferChoice) => {
      if (!ownerKey) return;
      setPendingChoice(choice);
      setDecision(choice);
      setSaveFailed(false);
      AsyncStorage.setItem(storageKey(ownerKey, tutorialId), choice).catch(() => {
        setSaveFailed(true);
      });
    },
    [ownerKey, tutorialId],
  );

  const retry = useCallback(() => {
    if (!pendingChoice) return;
    choose(pendingChoice);
  }, [choose, pendingChoice]);

  useEffect(() => {
    if (guideOpen && decision === null && ownerKey) {
      choose('shown');
    }
  }, [choose, decision, guideOpen, ownerKey]);

  const visible = Boolean(ownerKey && eligible && !guideOpen && decision === null);

  return {
    visible,
    saveFailed,
    choose,
    retry,
  };
}
