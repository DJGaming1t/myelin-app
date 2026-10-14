/** Shared, local product knowledge. Only advertise actions that exist in the app. */
export type GuideRoute =
  | '/(app)/today' | '/(app)/focus' | '/(app)/review' | '/(app)/progress'
  | '/(app)/today/day-map' | '/(app)/mistakes' | '/(app)/settings'
  | '/(app)/settings/reminders' | '/(app)/topics';
export type TutorialId = 'today' | 'focus' | 'review' | 'progress' | 'library';
export type TodayAnchor = 'today.next' | 'today.adjust' | 'today.day-map';
export type FocusAnchor = 'focus.primary' | 'focus.secondary' | 'focus.support';
export type ReviewAnchor = 'review.primary' | 'review.secondary' | 'review.support';
export type ProgressAnchor = 'progress.map' | 'progress.practice' | 'progress.evidence';
export type LibraryAnchor = 'library.search' | 'library.filters' | 'library.results';
export type TutorialAnchor = TodayAnchor | FocusAnchor | ReviewAnchor | ProgressAnchor | LibraryAnchor;
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
    anchors: ['focus.primary', 'focus.secondary', 'focus.support'], supportedActions: [{ type: 'navigate', route: '/(app)/focus' }, { type: 'startTutorial', tutorialId: 'focus' }],
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
    anchors: ['review.primary', 'review.secondary', 'review.support'], supportedActions: [{ type: 'navigate', route: '/(app)/review' }, { type: 'startTutorial', tutorialId: 'review' }],
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
    anchors: ['progress.map', 'progress.practice', 'progress.evidence'], supportedActions: [{ type: 'navigate', route: '/(app)/progress' }, { type: 'startTutorial', tutorialId: 'progress' }],
  },
  {
    id: 'library', name: 'Library', route: '/(app)/topics',
    description: 'Find your saved topics, notes and questions. Narrow by subject or topic status, then open a topic to edit material, Focus or practise.',
    helpSteps: [
      'Open Library. Search matches topic names, subjects, notes and saved question text, answers and hints.',
      'Use Filters to narrow by topic status or subject. The result count and active filters stay visible; Clear all restores the whole Library.',
      'Open a topic for its saved material and study actions, or use Add your first topic when Library is empty. Opening a guide never creates material or starts practice.',
    ],
    searchTerms: ['library', 'topics', 'find topic', 'search notes', 'search questions', 'subject filter', 'topic status', 'add topic'],
    anchors: ['library.search', 'library.filters', 'library.results'],
    supportedActions: [{ type: 'navigate', route: '/(app)/topics' }, { type: 'startTutorial', tutorialId: 'library' }],
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
export type GuideStep<A extends TutorialAnchor = TutorialAnchor> = { anchor: A; title: string; explanation: string };
const nextActionCopy: Record<TodayGuideState, Pick<GuideStep, 'title' | 'explanation'>> = {
  ready: { title: 'Start with this one action', explanation: 'Use this card to start work, review, or complete a task. “Why this?” explains the recommendation. “Not now” moves it out of today, with Undo available.' },
  empty: { title: 'Give Today something to work with', explanation: 'Use Add something to create a task or topic. Today can then recommend a useful next action. This tour will not add sample data.' },
  rest: { title: 'Leave room for rest', explanation: 'There is no study capacity left right now, or your sleep window is protected. Use this control to adjust your time or plan a slot after rest.' },
  focus: { title: 'Return to your focus session', explanation: 'Resume the existing timer or break here. Leaving Today does not create a second session or lose your place.' },
  review: { title: 'Continue your recall queue', explanation: 'Resume the questions you were reviewing. Your saved place comes first, before a new recommendation.' },
};
export function todayGuideSteps(state: TodayGuideState): readonly GuideStep<TodayAnchor>[] {
  return [
    { anchor: 'today.next', ...nextActionCopy[state] },
    { anchor: 'today.adjust', title: 'Tell MYELIN what fits today', explanation: 'Adjust opens your study-time and energy controls. A smaller plan or a short focus block is available when time is tight.' },
    { anchor: 'today.day-map', title: 'Find a place in your day', explanation: 'Day Map shows your commitments and scheduled work. Open it to find a free slot or move work to another time. This tour leaves your plan unchanged.' },
  ];
}

export function tutorialDestination(id: TutorialId) {
  if (id === 'library') return { pathname: '/(app)/topics' as const, params: { guide: id } };
  if (id === 'review') return { pathname: '/(app)/review' as const, params: { guide: id, autoStart: '0' } };
  if (id === 'progress') return { pathname: '/(app)/progress' as const, params: { guide: id } };
  return { pathname: id === 'focus' ? '/(app)/focus' as const : '/(app)/today' as const, params: { guide: id } };
}

export type FocusGuideState = 'empty' | 'review' | 'setup' | 'active' | 'checkpoint' | 'finish' | 'break' | 'break-done';
const FOCUS_GUIDE_STEPS: Record<FocusGuideState, readonly GuideStep<FocusAnchor>[]> = {
  empty: [{ anchor: 'focus.primary', title: 'Choose what you want to work on', explanation: 'Go to Today and tap Focus on an open task, or start from a topic in Library. Help never picks work or starts a timer for you.' }],
  review: [{ anchor: 'focus.primary', title: 'Finish the recall loop first', explanation: 'A Review queue is already active. Resume it here before starting a separate Focus timer. This tour leaves your answers and place unchanged.' }],
  setup: [
    { anchor: 'focus.primary', title: 'Choose a block that fits', explanation: 'These controls change the length of your next block. Choosing a length does not start the timer; use the Start button when ready.' },
    { anchor: 'focus.secondary', title: 'Make the first step concrete', explanation: 'Optionally name one small action, such as opening your notes or solving the first question. It stays visible during your session.' },
    { anchor: 'focus.support', title: 'Five minutes is enough to begin', explanation: 'Start with a five-minute promise when the full block feels too much. At the checkpoint, continue the same session or finish and record your effort.' },
  ],
  active: [
    { anchor: 'focus.primary', title: 'You control the session', explanation: 'Pause or resume here. Finish early opens the effort check before saving. A running timer keeps running during this tour and when you leave this screen.' },
    { anchor: 'focus.support', title: 'Save the thought for later', explanation: 'Open distraction parking, write the thought and tap +. It is saved with this session for your break; you do not have to act on it now.' },
  ],
  checkpoint: [
    { anchor: 'focus.primary', title: 'Continue if it feels useful', explanation: 'Extend this same session toward the original target. Your first five minutes already count; this does not create a second timer.' },
    { anchor: 'focus.secondary', title: 'Stopping here still counts', explanation: 'Finish the five-minute launch here, then rate the effort and save it. Continuing is optional.' },
  ],
  finish: [
    { anchor: 'focus.primary', title: 'Rate the demand, not yourself', explanation: 'Choose how demanding the block felt, from 1 to 5. This records workload, not correctness or how good a student you are.' },
    { anchor: 'focus.secondary', title: 'Save the work you actually did', explanation: 'Complete focus records this block and opens the break. If saving fails, the screen offers a retry. The tutorial itself saves no study evidence.' },
  ],
  break: [{ anchor: 'focus.primary', title: 'Give the work a little space', explanation: 'Pause or resume the break, or end it when ready. Rest your eyes, stretch or get water. Any parked thoughts are shown above. A running break keeps running during this tour.' }],
  'break-done': [{ anchor: 'focus.primary', title: 'Return when you are ready', explanation: 'Finish break returns to Today. If due questions are offered, you can choose short recall instead; it is optional. Your focus block is already saved. A save failure keeps you here to retry.' }],
};

export function focusGuideSteps(state: FocusGuideState) { return FOCUS_GUIDE_STEPS[state]; }

export type ReviewGuideState = 'blocked' | 'empty' | 'empty-topic' | 'waiting' | 'ready' | 'topic-ready' | 'practice' | 'attempt' | 'reference';
const REVIEW_GUIDE_STEPS: Record<ReviewGuideState, readonly GuideStep<ReviewAnchor>[]> = {
  blocked: [{ anchor: 'review.primary', title: 'Finish Focus before recall', explanation: 'Return to the active timer or break here. Your saved Review question, answer draft and stage stay intact. This tour does not end either session.' }],
  empty: [{ anchor: 'review.primary', title: 'Give recall a real question', explanation: 'Open Library and add a prompt with a reference answer to a topic. Review uses your saved material; this tour does not create examples or start a queue.' }],
  'empty-topic': [{ anchor: 'review.primary', title: 'Add a prompt to this topic', explanation: 'Add a question with its reference answer before starting recall. The guide does not add a question or edit this topic for you.' }],
  waiting: [{ anchor: 'review.secondary', title: 'Nothing needs an early review', explanation: 'No saved questions are due right now. You can revisit corrections here, or practise from a topic in Library. Opening this guide never brings future reviews forward.' }],
  ready: [
    { anchor: 'review.primary', title: 'Start with what is due', explanation: 'Start mixed review draws from saved questions ready now. You choose when to begin; the tutorial never starts or advances a queue.' },
    { anchor: 'review.secondary', title: 'Keep corrections close', explanation: 'Mistake notebook keeps corrections for another attempt. An Again grade can create a correction when a saved reference answer exists.' },
  ],
  'topic-ready': [{ anchor: 'review.primary', title: 'Recall this topic when ready', explanation: 'Start due recall uses questions ready in this topic. Practise all questions is a separate optional choice. This tour leaves review dates unchanged.' }],
  practice: [{ anchor: 'review.primary', title: 'Early practice is your choice', explanation: 'Nothing in this topic is due. Practise all questions can open an optional queue; simply opening this tutorial never starts it or changes review dates.' }],
  attempt: [
    { anchor: 'review.primary', title: 'Try before checking', explanation: 'Write what you can recall before seeing the reference. A saved hint is optional when available, and its use is recorded. This tour keeps your current draft and hint state.' },
    { anchor: 'review.secondary', title: 'Confidence is separate from correctness', explanation: 'Unsure means mostly guessing; Partly sure means some gaps; Sure means confident recall. Choose before checking. The guide does not choose for you.' },
    { anchor: 'review.support', title: 'Reveal only after your attempt', explanation: 'Show reference answer becomes available after typing an attempt. If you answered mentally, use that separate action. The tutorial itself never reveals the answer.' },
  ],
  reference: [
    { anchor: 'review.primary', title: 'Compare what you retrieved', explanation: 'Compare your saved attempt with the reference already revealed. Notice missing ideas and errors; familiarity after reading is different from successful recall.' },
    { anchor: 'review.secondary', title: 'Grade recall honestly', explanation: 'Again means unreliable recall; Practising means partial recall; Good means successful recall. Hint use affects spacing. A grade saves evidence and advances the queue; this tour never chooses a grade.' },
  ],
};

export function reviewGuideSteps(state: ReviewGuideState) { return REVIEW_GUIDE_STEPS[state]; }

export type ProgressGuideState = {
  hasTopics: boolean;
  practice: 'none' | 'available' | 'focus' | 'review';
  expanded: boolean;
  enoughConfidence: boolean;
};

export function progressGuideSteps(state: ProgressGuideState): readonly GuideStep<ProgressAnchor>[] {
  const practiceCopy = {
    none: { title: 'Read the evidence you recorded', explanation: 'These totals count recorded study and review minutes, active days, graded reviews and due corrections. Minutes are not mastery. Practice suggestions appear when your saved material supports them.' },
    available: { title: 'Choose useful practice', explanation: 'This insight explains which saved questions may benefit from practice. Tap its action when ready; it can include questions that are not due yet. The tour never starts practice or changes review dates.' },
    focus: { title: 'Return to your active Focus first', explanation: 'This action resumes your existing timer or break before starting insight practice. Your Focus session keeps its place; a running timer keeps running during this tour.' },
    review: { title: 'Finish your existing recall first', explanation: 'This action resumes your saved Review queue before starting insight practice. Your answer, confidence, hint state and current question stay intact during this tour.' },
  }[state.practice];
  return [
    { anchor: 'progress.map', title: state.hasTopics ? 'A map of earned recalls' : 'Begin with your own material',
      explanation: state.hasTopics
        ? 'Select a node above, then open its topic here. Bright nodes mark Good recalls without hints, once per question per day. Earned progress stays when a review becomes due. The map is a metaphor, not a measurement of your brain.'
        : 'Add a topic and a recall question here to begin. The Neural Map grows from your saved, unhinted Good recalls; this guide does not add sample material or evidence.' },
    { anchor: 'progress.practice', ...practiceCopy },
    { anchor: 'progress.evidence', title: state.expanded ? 'Confidence and recall are different' : 'Look deeper when useful',
      explanation: state.expanded
        ? `This summary compares confidence before checking with self-reported recall grades. ${state.enoughConfidence ? 'Read the sample size before drawing conclusions; these results do not measure mastery.' : 'The sample is still small; at least five graded recall attempts are recommended.'} Below, time calibration compares planned and completed focus blocks. The guide leaves this section open.`
        : 'See deeper evidence opens confidence and time calibration, recorded outcomes and topic activity. Small samples stay provisional; minutes are not mastery. This tour leaves the section closed, so you choose when to explore it.' },
  ];
}


export type LibraryGuideState = { hasTopics: boolean; hasResults: boolean; filtered: boolean; expanded: boolean };
export function libraryGuideSteps(state: LibraryGuideState): readonly GuideStep<LibraryAnchor>[] {
  return [
    { anchor: 'library.search', title: 'Find your saved material', explanation: 'Search topic names, subjects, notes and saved question text, answers or hints. Searching only narrows this list; it does not change your material.' },
    { anchor: 'library.filters', title: state.expanded ? 'Narrow by subject or status' : 'Use filters when useful', explanation: state.expanded
      ? 'The open filters let you choose a subject and New, Learning or Review topic status. These labels are saved topic states, not mastery scores. The tour keeps your selections and the panel open.'
      : 'Open Filters to narrow by subject or saved topic status. Active selections appear beside the result count even with the panel closed. This tour leaves the panel as you found it.' },
    { anchor: 'library.results', title: !state.hasTopics ? 'Start with one real topic' : !state.hasResults ? 'Bring your topics back' : 'Open the topic you need',
      explanation: !state.hasTopics
        ? 'Add your first topic opens a blank form for your own chapter, concept or skill. The tour never adds examples or starts study.'
        : !state.hasResults
          ? 'No topics match this combination. Clear all removes only the search and filters, so your saved topics reappear. It does not delete material.'
          : state.filtered
            ? 'The count shows how many of your saved topics match. Clear all restores the full list. Open a topic below for notes, questions and explicit Focus or practice actions; the guide starts none of them.'
            : 'Open a topic below for notes, questions and explicit Focus or practice actions. Add lets you capture more material. The tour never opens a topic or starts a session for you.' },
  ];
}
