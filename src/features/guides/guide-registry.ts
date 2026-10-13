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
  helpSteps: readonly string[];
  exampleQuery?: string;
  anchors: readonly TutorialAnchor[];
  supportedActions: readonly GuideAction[];
};

export const FEATURE_GUIDES = [
  {
    id: 'today', name: 'Today', route: '/(app)/today',
    description: 'Choose one useful next action using your available time, deadlines, exams and recall history. Adjust the plan when your day changes.',
    helpSteps: [
      "Open Today and look at the NEXT card. Resume an active Focus or Review session if one is already running.",
      "Use Why this? to understand the recommendation, or Adjust to change available time and energy.",
      "Start from the card when ready. Not now moves the recommendation out of today; Undo restores its previous plan.",
    ],
    searchTerms: ['what should I do now', 'recommendation', 'why this', 'start studying', 'plan'],
    anchors: ['today.next', 'today.adjust', 'today.day-map'],
    supportedActions: [{ type: 'navigate', route: '/(app)/today' }, { type: 'startTutorial', tutorialId: 'today' }],
  },
  {
    id: 'focus', name: 'Focus', route: '/(app)/focus',
    description: 'Start from an open task or topic. Choose a timer or a five-minute launch, park distracting thoughts, then save your effort and take a break.',
    helpSteps: [
      "On Today, tap Focus on an open task card, or open a topic in Library and start Focus there.",
      "Choose your block length and an optional first tiny step. Tap Start focus or Five-minute launch.",
      "If a session is already active, resume it. Opening Focus from Help does not start a timer.",
    ],
    exampleQuery: "How do I start focus?",
    searchTerms: ['how do I start focus', 'timer', 'five minutes', 'tiny step', 'distraction', 'break', 'effort'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/focus' }],
  },
  {
    id: 'review', name: 'Review', route: '/(app)/review',
    description: 'Attempt a saved question before revealing its reference answer. Grade your recall to help schedule the next review.',
    helpSteps: [
      "Open Review and choose a recall queue from your saved questions.",
      "Try answering before revealing the reference answer. Record how confident you feel.",
      "Compare your answer and choose Again, Practising or Good. Your result helps schedule the next review.",
    ],
    searchTerms: ['recall', 'retrieve', 'again', 'practising', 'good', 'question', 'answer', 'hint', 'memory'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/review' }],
  },
  {
    id: 'confidence', name: 'Recall confidence', route: '/(app)/review',
    description: 'Unsure means mostly guessing; Partly sure means some gaps; Sure means confident recall. Choose before checking. Confidence and correctness are recorded separately.',
    helpSteps: [
      "Choose confidence before checking the reference answer: Unsure = mostly guessing; Partly sure = some gaps; Sure = confident recall.",
      "After checking, grade how well you recalled the answer. Being confident is different from being correct.",
      "Progress can suggest practice for confident mistakes and answers you knew but doubted.",
    ],
    exampleQuery: "What does unsure mean?",
    searchTerms: ['what does unsure mean', 'confidence', 'partly sure', 'sure', 'guessing', 'correctness'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/review' }],
  },
  {
    id: 'tasks', name: 'Tasks and postponement', route: '/(app)/today',
    description: 'Use Schedule in Today’s Tasks to choose when to study. Not now defers the recommended item until tomorrow without changing its deadline.',
    helpSteps: [
      "On Today, open Tasks, find the task, and tap Schedule.",
      "Choose a suggested slot tomorrow, or enter tomorrow’s date and a time, then tap Schedule this task.",
      "For the recommended item, Not now defers it until tomorrow with Undo available. This does not reserve a time or change its deadline. The Tomorrow chip in the task form changes the deadline, not the study schedule.",
    ],
    exampleQuery: "How do I move this to tomorrow?",
    searchTerms: ['how do I move this to tomorrow', 'not now', 'postpone', 'reschedule', 'undo', 'overdue', 'tasks', 'tomorrow', 'move task', 'deadline', 'due date'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/today' }],
  },
  {
    id: 'day-map', name: 'Day Map', route: '/(app)/today/day-map',
    description: 'See fixed commitments and study blocks, find an open slot, or reschedule work. Sleep protection and available study capacity constrain suggested slots.',
    helpSteps: [
      "Open Day Map from Today to see commitments and scheduled study.",
      "Use the scheduling controls to find an open study slot or move work. Suggestions respect available capacity and sleep protection.",
    ],
    searchTerms: ['where can my study fit', 'find study time', 'schedule', 'fixed time', 'recurring', 'skip one day', 'move'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/today/day-map' }],
  },
  {
    id: 'mistakes', name: 'Mistakes', route: '/(app)/mistakes',
    description: 'Keep corrections and retest them. Failed recall attempts with a saved reference answer can create a correction to revisit.',
    helpSteps: [
      "Open Mistakes to see corrections that need another attempt.",
      "Use Retest for due corrections. Open Browse corrections to search or switch between due, open and resolved items.",
      "If the notebook is empty, add a correction or save one after a failed recall attempt with a reference answer.",
    ],
    exampleQuery: "Where are my mistakes?",
    searchTerms: ['where are my mistakes', 'correction', 'wrong answer', 'retest', 'notebook'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/mistakes' }],
  },
  {
    id: 'progress', name: 'Progress and Neural Map', route: '/(app)/progress',
    description: 'Find useful next steps from recall evidence and confidence mismatches. The Neural Map visualizes earned unhinted Good recalls; it does not measure your brain.',
    helpSteps: [
      "Open Progress for the next useful practice suggested by your recall evidence.",
      "Use an insight’s practice action to review its questions, including confidence mismatches.",
      "The Neural Map reflects recorded unhinted Good recalls. It is a visual metaphor, not a measurement of your brain.",
    ],
    searchTerms: ['progress', 'insights', 'neural map', 'evidence', 'milestone', 'confident mistake', 'retention'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/progress' }],
  },
  {
    id: 'reminders', name: 'Reminder Studio', route: '/(app)/settings/reminders',
    description: 'Opt into local reminders and choose their voice, detail, timing and quiet hours. Sleep protection also applies.',
    helpSteps: [
      "Open Reminder Studio from Settings and opt into the reminder types you want.",
      "Choose their voice, detail and timing. Set quiet hours and keep sleep times up to date in Settings.",
    ],
    searchTerms: ['notifications', 'reminders', 'quiet hours', 'sound', 'notification style'],
    anchors: [], supportedActions: [{ type: 'navigate', route: '/(app)/settings/reminders' }],
  },
  {
    id: 'settings', name: 'Settings', route: '/(app)/settings',
    description: 'Change study defaults, sleep times, reduced motion, account and privacy options. Replay the tutorial without resetting your study data.',
    helpSteps: [
      "Open a settings section to change its controls. Study defaults affect future planning.",
      "Open Help & tutorial to search these guides, view the core-loop tutorial again, or choose Show me Today.",
    ],
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
