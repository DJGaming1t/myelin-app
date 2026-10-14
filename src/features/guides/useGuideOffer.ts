import { useCallback, useEffect, useMemo, useState } from 'react';
import { createGuideOfferController, emptyGuideOfferState, GuideOfferChoice } from './guide-offer-state';
import { guideOfferStorage } from './guide-offer-storage';
import type { TutorialId } from './guide-registry';

export function useGuideOffer(tutorialId: TutorialId, ownerKey: string | null, eligible: boolean, tutorialOpen: boolean) {
  const [state, setState] = useState(() => ({ ...emptyGuideOfferState(), tutorialId }));
  const controller = useMemo(() => createGuideOfferController(guideOfferStorage, tutorialId, next => setState({ ...next, tutorialId })), [tutorialId]);
  const currentOwner = !!ownerKey && state.ownerKey === ownerKey && state.tutorialId === tutorialId;

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
