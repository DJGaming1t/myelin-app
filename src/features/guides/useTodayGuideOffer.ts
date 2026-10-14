import { useGuideOffer } from './useGuideOffer';

export function useTodayGuideOffer(ownerKey: string | null, eligible: boolean, tutorialOpen: boolean) {
  return useGuideOffer('today', ownerKey, eligible, tutorialOpen);
}
