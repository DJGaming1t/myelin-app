import { GuideOffer, GuideOfferProps } from './GuideOffer';

export function TodayGuideOffer(props: GuideOfferProps) {
  return <GuideOffer {...props} tutorialId="today" screenName="Today"
    description="See your next action, Adjust and Day Map. You can replay it anytime from ?." />;
}
