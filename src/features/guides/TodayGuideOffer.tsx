import { GuideOffer } from './GuideOffer';

export function TodayGuideOffer({
  visible,
  saveFailed,
  onShow,
  onLater,
  onRetry,
}: {
  visible: boolean;
  saveFailed?: boolean;
  onShow: () => void;
  onLater: () => void;
  onRetry?: () => void;
}) {
  return (
    <GuideOffer
      tutorialId="today"
      screenName="Today"
      description="See how Today picks your next move, how Adjust changes your budget, and how Day Map fits work into your schedule."
      visible={visible}
      saveFailed={saveFailed}
      onShow={onShow}
      onLater={onLater}
      onRetry={onRetry}
    />
  );
}
