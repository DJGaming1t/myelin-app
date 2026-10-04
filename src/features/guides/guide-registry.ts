/** Shared, local product knowledge. Only advertise actions that exist in the app. */
export type GuideRoute =
  | '/(app)/today' | '/(app)/focus' | '/(app)/review' | '/(app)/progress'
  | '/(app)/today/day-map' | '/(app)/mistakes' | '/(app)/settings'
  | '/(app)/settings/reminders';
export type TutorialId = 'today';
export type TutorialAnchor = 'today.next' | 'today.adjust' | 'today.day-map';
export type GuideAction =
  | { type: 'navigate'; route: GuideRoute }
  | { type: 'startTutorial'; tutorialId: TutorialId };
export type FeatureGuide = {
  id: string;
  name: string;
  description: string;
  route: GuideRoute;
  searchTerms: readonly string[];
  anchors: readonly TutorialAnchor[];
  supportedActions: readonly GuideAction[];
};

export const FEATURE_GUIDES = [
  {
    id: 'today', name: 'Today', route: '/(app)/today',
    description: 'Choose one useful next action using your available time, deadlines, exams and recall history. Adjust the plan when your day changes.',
    searchTerms: ['what should I do now', 'recommendation', 'why this', 'start studying', 'plan'],
    anchors: ['today.next', 'today.adjust', 'today.day-map'],
    supportedActions: [{ type: 'navigate', route: '/(app)/today' }, { type: 'startTutorial', tutorialId: 'today' }],
  },
  {
    id: 'focus', name: 'Focus', route: '/(app)/focus',
    description: 'Start from an open task or topic. Choose a timer or a five-minute launch, park distracting thoughts, then save your effort and take a break.',
    searchTerms: ['how do I start focus', 'timer', 'five minutes', 'tiny step', 'distraction', 'break', 'effort'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/focus' }],
  },
  {
    id: 'review', name: 'Review', route: '/(app)/review',
    description: 'Attempt a saved question before revealing its reference answer. Grade your recall to help schedule the next review.',
    searchTerms: ['recall', 'retrieve', 'again', 'practising', 'good', 'question', 'answer', 'hint', 'memory'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/review' }],
  },
  {
    id: 'confidence', name: 'Recall confidence', route: '/(app)/review',
    description: 'Unsure means mostly guessing; Partly sure means some gaps; Sure means confident recall. Choose before checking. Confidence and correctness are recorded separately.',
    searchTerms: ['what does unsure mean', 'confidence', 'partly sure', 'sure', 'guessing', 'correctness'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/review' }],
  },
  {
    id: 'tasks', name: 'Tasks and postponement', route: '/(app)/today',
    description: 'Open Tasks on Today to find your work. Not now moves the recommended item out of today; Undo restores its previous plan. Open a task to choose another date or time.',
    searchTerms: ['how do I move this to tomorrow', 'not now', 'postpone', 'reschedule', 'undo', 'overdue', 'tasks'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/today' }],
  },
  {
    id: 'day-map', name: 'Day Map', route: '/(app)/today/day-map',
    description: 'See fixed commitments and study blocks, find an open slot, or reschedule work. Sleep protection and available study capacity constrain suggested slots.',
    searchTerms: ['where can my study fit', 'find study time', 'schedule', 'fixed time', 'recurring', 'skip one day', 'move'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/today/day-map' }],
  },
  {
    id: 'mistakes', name: 'Mistakes', route: '/(app)/mistakes',
    description: 'Keep corrections and retest them. Failed recall attempts with a saved reference answer can create a correction to revisit.',
    searchTerms: ['where are my mistakes', 'correction', 'wrong answer', 'retest', 'notebook'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/mistakes' }],
  },
  {
    id: 'progress', name: 'Progress and Neural Map', route: '/(app)/progress',
    description: 'Find useful next steps from recall evidence and confidence mismatches. The Neural Map visualizes earned unhinted Good recalls; it does not measure your brain.',
    searchTerms: ['progress', 'insights', 'neural map', 'evidence', 'milestone', 'confident mistake', 'retention'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/progress' }],
  },
  {
    id: 'reminders', name: 'Reminder Studio', route: '/(app)/settings/reminders',
    description: 'Opt into local reminders and choose their voice, detail, timing and quiet hours. Sleep protection also applies.',
    searchTerms: ['notifications', 'reminders', 'quiet hours', 'sound', 'notification style'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/settings/reminders' }],
  },
  {
    id: 'settings', name: 'Settings', route: '/(app)/settings',
    description: 'Change study defaults, sleep times, reduced motion, account and privacy options. Replay the tutorial without resetting your study data.',
    searchTerms: ['tutorial', 'help', 'sleep', 'login', 'delete account', 'reduced motion', 'defaults', 'sync'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/settings' }],
  },
] as const satisfies readonly FeatureGuide[];

export const CORE_GUIDE_STEPS = [
  { eyebrow: 'PLAN → START', title: 'Choose one useful next move.',
    lead: 'Today recommends what fits your time. Start that task, or adjust the plan when your day changes.',
    flow: ['Choose', 'Adjust', 'Start'], note: 'Not now moves work out of today. Undo brings its previous plan back.' },
  { eyebrow: 'FOCUS → RETRIEVE', title: 'Work, then try to remember.',
    lead: 'Use Focus for a timed block, or promise just five minutes. In Review, attempt a question before checking its answer.',
    flow: ['Focus', 'Break', 'Recall'], note: 'Park distractions during Focus. Your saved questions supply the recall material.' },
  { eyebrow: 'FEEDBACK → ADAPT', title: 'Let evidence shape what comes next.',
    lead: 'Grade your recall honestly. MYELIN adapts the next review and uses your study history to guide Today.',
    flow: ['Check', 'Grade', 'Adapt'], note: 'Progress highlights useful next steps. Confidence is recorded separately from correctness.' },
] as const;

export type TodayGuideState = 'ready' | 'empty' | 'rest' | 'focus' | 'review';
export type GuideStep = { anchor: TutorialAnchor; title: string; explanation: string };
const nextActionCopy: Record<TodayGuideState, Pick<GuideStep, 'title' | 'explanation'>> = {
  ready: { title: 'Start with this one action', explanation: 'Use this card to start work, review, or complete a task. “Why this?” explains the recommendation. “Not now” moves it out of today, with Undo available.' },
  empty: { title: 'Give Today something to work with', explanation: 'Use Add something to create a task or topic. Today can then recommend a useful next action. This tour will not add sample data.' },
  rest: { title: 'Leave room for rest', explanation: 'There is no study capacity left right now, or your sleep window is protected. Use this control to adjust your time or plan a slot after rest.' },
  focus: { title: 'Return to your focus session', explanation: 'Resume the existing timer or break here. Leaving Today does not create a second session or lose your place.' },
  review: { title: 'Continue your recall queue', explanation: 'Resume the questions you were reviewing. Your saved place comes first, before a new recommendation.' },
};
export function todayGuideSteps(state: TodayGuideState): readonly GuideStep[] {
  return [
    { anchor: 'today.next', ...nextActionCopy[state] },
    { anchor: 'today.adjust', title: 'Tell MYELIN what fits today', explanation: 'Adjust opens your study-time and energy controls. A smaller plan or a short focus block is available when time is tight.' },
    { anchor: 'today.day-map', title: 'Find a place in your day', explanation: 'Day Map shows your commitments and scheduled work. Open it to find a free slot or move work to another time. This tour leaves your plan unchanged.' },
  ];
}

export function tutorialDestination(id: TutorialId) {
  return { pathname: '/(app)/today' as const, params: { guide: id } };
}
