import { useGuideOffer } from './useGuideOffer';

export function useTodayGuideOffer(
  ownerKey: string | null,
  eligible: boolean,
  guideOpen: boolean,
) {
  return useGuideOffer('today', ownerKey, eligible, guideOpen);
}
