import { useCallback, useEffect, useMemo, useState } from 'react';
import { createGuideOfferController, emptyGuideOfferState, GuideOfferChoice } from './guide-offer-state';
import { guideOfferStorage } from './guide-offer-storage';

export function useTodayGuideOffer(ownerKey: string | null, eligible: boolean, tutorialOpen: boolean) {
  const [state, setState] = useState(emptyGuideOfferState);
  const controller = useMemo(() => createGuideOfferController(guideOfferStorage, 'today', setState), []);
  const currentOwner = !!ownerKey && state.ownerKey === ownerKey;

  useEffect(() => {
    void controller.activate(ownerKey);
    return () => controller.deactivate();
  }, [controller, ownerKey]);
  useEffect(() => {
    // Explicit header/Help replay also counts as seeing this screen's guide.
    if (currentOwner && tutorialOpen && !state.choice) void controller.choose(ownerKey, 'shown');
  }, [controller, currentOwner, ownerKey, state.choice, tutorialOpen]);

  const choose = useCallback((choice: GuideOfferChoice) => {
    void controller.choose(ownerKey, choice);
  }, [controller, ownerKey]);
  const retry = useCallback(() => {
    if (state.choice) void controller.choose(ownerKey, state.choice);
  }, [controller, ownerKey, state.choice]);

  return {
    visible: currentOwner && state.ready && !state.choice && eligible && !tutorialOpen,
    saveFailed: currentOwner && state.saveFailed,
    choose,
    retry,
  };
}
