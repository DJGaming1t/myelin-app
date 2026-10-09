import type { AssistantCreateTaskAction } from './ai-action-engine';
import type { AssistantClarificationAnswers } from './assistant-clarification';

type SchoolworkResult =
  | { route: 'actions'; action: AssistantCreateTaskAction }
  | { route: 'clarify'; reason: 'missing-date' | 'missing-target' | 'missing-required-detail' | 'ambiguous-reference'; question: string; missingFields: string[] };

// Deliberately bounded corrections, not fuzzy matching of arbitrary names/IDs.
export function normalizeSchoolworkLanguage(value: string) {
  const replacements: Record<string, string> = {
    complite: 'complete', compleat: 'complete', compleete: 'complete',
    tommorow: 'tomorrow', tommorrow: 'tomorrow', tmr: 'tomorrow', tmrw: 'tomorrow',
    nb: 'notebook', nbk: 'notebook', hw: 'homework', asignments: 'assignments',
    asignment: 'assignment', assigment: 'assignment', practicle: 'practical',
  };
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'")
    .replace(/\b[a-z]+\b/g, word => replacements[word] ?? word)
    .replace(/\s+/g, ' ').trim();
}

// Only polite prefixes directly followed by a supported action verb are commands.
// "Could you explain..." and hypothetical statements retain their original intent.
export function normalizeAssistantCommand(value: string) {
  return normalizeSchoolworkLanguage(value).replace(
    /^(?:(?:can|could|would|will) you(?: please)?|please)\s+(?=(?:add|create|record|schedule|complete|finish|submit|hand in|set|mark|update|raise|lower|increase|decrease)\b)/,
    '',
  );
}

const SUBJECTS = [
  { name: 'Biology', words: /\b(?:bio|biology)\b/g },
  { name: 'Physics', words: /\b(?:phy|phys|physics)\b/g },
  { name: 'Chemistry', words: /\b(?:chem|chemistry)\b/g },
  { name: 'Mathematics', words: /\b(?:math|maths|mathematics)\b/g },
  { name: 'English', words: /\b(?:eng|english)\b/g },
  { name: 'Social Science', words: /\b(?:sst|social science|social studies)\b/g },
  { name: 'Science', words: /\bscience\b/g },
  { name: 'Hindi', words: /\bhindi\b/g },
  { name: 'Sanskrit', words: /\bsanskrit\b/g },
  { name: 'Computer Science', words: /\b(?:computer science|computers|computer|cs|it)\b/g },
] as const;

export function schoolworkSubjectReply(value: string): string | null {
  const text = normalizeSchoolworkLanguage(value).replace(/^(?:it is|it's|the subject is)\s+/, '').replace(/\s+please$/, '').replace(/[.!]$/, '').trim();
  const subject = SUBJECTS.find(s => new RegExp(`^(?:${s.words.source.replace(/\\b/g, '').replace('|it', '')})$`).test(text));
  return subject?.name ?? null;
}

function question(reason: Extract<SchoolworkResult, { route: 'clarify' }>['reason'], text: string, field: string): Extract<SchoolworkResult, { route: 'clarify' }> {
  return { route: 'clarify', reason, question: text, missingFields: [field] };
}

export function validSchoolworkDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function plusDays(date: string, days: number) {
  if (!validSchoolworkDate(date)) return null;
  const stamp = new Date(`${date}T12:00:00Z`);
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

const WORD_DAYS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const DEADLINE = /\b(?:20\d{2}-\d{2}-\d{2}|day after tomorrow|tomorrow|today|tonight|in (?:\d+|one|two|three|four|five|six|seven) days?)\b/g;
const DURATION = /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/g;

export function parseAssistantTaskDetails(raw: string, currentDate: string, answers: AssistantClarificationAnswers = {}):
  | { route: 'details'; dueDate?: string; estimatedMinutes: number; priority: 1 | 2 | 3 }
  | Extract<SchoolworkResult, { route: 'clarify' }> {
  const text = normalizeSchoolworkLanguage(raw).replace(/\baaj\b/g, 'today').replace(/\bkal\b/g, 'tomorrow');
  if (answers.dueDate != null && !validSchoolworkDate(answers.dueDate)) return question('missing-date', 'Give one valid deadline date (YYYY-MM-DD).', 'dueDate');
  if (!answers.dueDate && (/\b(?:at\s+\d|\d\s*(?:am|pm)|\d{1,2}:\d{2}|morning|afternoon|evening|midnight|noon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|next month)\b/.test(text) ||
      /\b(?:on|by|before|due)\s+\d{1,2}[\/-]\d{1,2}\b/.test(text))) {
    return question('missing-date', 'What exact date (YYYY-MM-DD) should I use? This preview supports a day deadline, not a time of day.', 'dueDate');
  }
  const dates = answers.dueDate ? [answers.dueDate] : [...text.matchAll(DEADLINE)].map(match => match[0]);
  const resolved: string[] = [];
  for (const value of dates) {
    let date: string | null;
    if (/^20\d{2}-/.test(value)) date = validSchoolworkDate(value) ? value : null;
    else if (value.startsWith('in ')) {
      const amount = value.split(' ')[1]!;
      const days = WORD_DAYS[amount] ?? Number(amount);
      date = days >= 1 && days <= 30 ? plusDays(currentDate, days) : null;
    } else date = plusDays(currentDate, value === 'day after tomorrow' ? 2 : value === 'tomorrow' ? 1 : 0);
    if (!date) return question('missing-date', 'What valid date (YYYY-MM-DD) should I use for the deadline?', 'dueDate');
    resolved.push(date);
  }
  if (new Set(resolved).size > 1 || (!dates.length && /\b(?:by|before|due|deadline)\b/.test(text))) {
    return question('missing-date', 'What single date (YYYY-MM-DD) should I use for the deadline?', 'dueDate');
  }
  const durations = [...text.matchAll(DURATION)];
  const wordDurations = [...text.matchAll(/\b(?:half (?:an? )?hour|(?:an|one) hour)\b/g)];
  // A conventional adjacent "1 hour 30 minutes" is one exact duration.
  // Reversed units, repeated estimates and arbitrary additions remain ambiguous.
  const composite = durations.length === 2 && wordDurations.length === 0 &&
    /^(?:h|hr|hour)/.test(durations[0]![2]!) && /^(?:m|min|minute)/.test(durations[1]![2]!) &&
    Number.isInteger(Number(durations[0]![1])) && Number(durations[0]![1]) >= 0 &&
    Number.isInteger(Number(durations[1]![1])) && Number(durations[1]![1]) >= 0 && Number(durations[1]![1]) < 60 &&
    !text.slice(durations[0]!.index! + durations[0]![0].length, durations[1]!.index!).trim();
  let estimatedMinutes = 0;
  if (answers.estimatedMinutes != null) {
    if (!Number.isInteger(answers.estimatedMinutes) || answers.estimatedMinutes < 5 || answers.estimatedMinutes > 720) return question('missing-required-detail', 'Give one estimate between 5 and 720 minutes.', 'estimatedMinutes');
    estimatedMinutes = answers.estimatedMinutes;
  } else if (composite && !/(?:^|\s)[-−]\s*\d/.test(text)) {
    estimatedMinutes = Number(durations[0]![1]) * 60 + Number(durations[1]![1]);
    if (estimatedMinutes < 5 || estimatedMinutes > 720) return question('missing-required-detail', 'Give one estimate between 5 and 720 minutes.', 'estimatedMinutes');
  } else if (durations.length + wordDurations.length > 1 || /\b\d+(?:\.\d+)?\s*(?:[-–]|to)\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b|(?:^|\s)[-−]\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/.test(text)) {
    return question('missing-required-detail', 'How many minutes should I use? Give one estimate between 5 and 720 minutes.', 'estimatedMinutes');
  } else if (durations.length) {
    const duration = durations[0]!;
    estimatedMinutes = Number(duration[1]) * (/^(?:h|hr|hour)/.test(duration[2]!) ? 60 : 1);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 720) return question('missing-required-detail', 'Give one estimate between 5 and 720 minutes.', 'estimatedMinutes');
  } else if (wordDurations.length) estimatedMinutes = wordDurations[0]![0].startsWith('half') ? 30 : 60;
  else if (/\b(?:minutes?|hours?|mins?|hrs?)\b/.test(text)) return question('missing-required-detail', 'How many minutes should I use? Add a numeric estimate to your request.', 'estimatedMinutes');
  const low = /\b(?:low priority|not important)\b/.test(text);
  const high = /\b(?:high priority|urgent|very important|important)\b/.test(text.replace(/\bnot important\b/g, ''));
  if (low && high) return question('ambiguous-reference', 'Choose one priority: low, normal or high. Rewrite the request with that choice.', 'priority');
  return { route: 'details', ...(resolved[0] ? { dueDate: resolved[0] } : {}), estimatedMinutes, priority: high ? 3 : low ? 1 : 2 };
}

export function tryParseSchoolworkRequest(raw: string, currentDate: string, answers: AssistantClarificationAnswers = {}): SchoolworkResult | null {
  const text = normalizeAssistantCommand(raw);
  const deliverable = /\b(?:notebooks?|homework|assignments?|projects?|worksheets?|practical (?:files?|records?|journals?)|lab (?:files?|records?|reports?))\b/;
  if (!deliverable.test(text)) return null;
  if (answers.dueDate && !validSchoolworkDate(answers.dueDate)) return question('missing-date', 'Give one valid deadline date (YYYY-MM-DD).', 'dueDate');
  const intent = /\b(?:complete|finish|submit|hand in|add|create|schedule|need to|have to|must|gotta|due)\b/.test(text);
  if (!intent) return null;
  // Statements about completed work, negation, questions and hypotheticals are
  // not permission to add a task. Leave these to the full decision path.
  if (/\b(?:not|don't|doesn't|didn't|cannot|can't|already|completed|finished|submitted|yesterday|if|maybe|might|could|would|delete|remove|cancel)\b/.test(text.replace(/\bnot important\b/g, '')) ||
      /^(?:how|why|what|when|should|can|did|is|do|does)\b/.test(text)) return null;
  const commas = [...text.matchAll(/,/g)];
  const durationComma = /,\s*(?:for\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/.test(text);
  if (/\b(?:and|then|also)\b/.test(text) || /[;\n]/.test(raw) || (commas.length > 0 && (commas.length !== 1 || !durationComma))) {
    return question('ambiguous-reference', 'Please enter one schoolwork task at a time so I do not miss part of your request.', 'task');
  }

  // Match long compound subjects first; "it" is a pronoun, not an IT subject.
  const subjectText = text.replace(/\bcomputer science\b/g, 'computers').replace(/\bsocial science\b/g, 'sst');
  const subjectAnswer = answers.subject ? schoolworkSubjectReply(answers.subject) : null;
  if (answers.subject && !subjectAnswer) return question('missing-target', 'Which subject is this for?', 'subject');
  const subjects = subjectAnswer ? SUBJECTS.filter(s => s.name === subjectAnswer) : SUBJECTS.filter(s => new RegExp(s.words.source.replace('|it', '')).test(subjectText));
  if (subjects.length !== 1) {
    return question(subjects.length ? 'ambiguous-reference' : 'missing-target',
      subjects.length ? 'Which single subject is this task for?' : 'Which subject is this for?', 'subject');
  }
  const subject = subjects[0]!;
  const details = parseAssistantTaskDetails(text, currentDate, answers);
  if (details.route === 'clarify') return details;
  const { estimatedMinutes, dueDate, priority } = details;

  const verb = /\b(?:submit|hand in)\b/.test(text) ? 'Submit' : 'Complete';
  let body = text
    .replace(/^(?:please\s+)?(?:i\s+)?(?:(?:have|need|want)\s+to\s+|have\s+|must\s+|gotta\s+)?/, '')
    .replace(/^(?:add|create|schedule)\s+(?:a\s+)?task\s+(?:to|for)\s+/, '')
    .replace(/^(?:complete|finish|submit|hand in|add|create|schedule)\s+(?:a\s+task\s+(?:to|for)\s+)?/, '')
    .replace(DEADLINE, '')
    .replace(/\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/g, '')
    .replace(/(?:^|\s)[-−]\s*\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/g, '')
    .replace(DURATION, '')
    .replace(/\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/g, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/g, '')
    .replace(/\b(?:half (?:an? )?hour|(?:an|one) hour|high priority|low priority|not important|urgent|very important|important)\b/g, '')
    .replace(/\b(?:by|before|due|for|please|my|a|an)\b/g, '')
    .replace(/[,.;!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  body = body.replace(new RegExp(subject.words.source.replace('|it', ''), 'g'), subject.name);
  if (subjectAnswer && !new RegExp(subject.words.source.replace('|it', '')).test(subjectText)) body = `${subject.name} ${body}`;
  const title = `${verb} ${body}`;
  if (title.length > 500) return question('missing-required-detail', 'Please shorten the task description to under 500 characters.', 'title');
  return {
    route: 'actions',
    action: {
      type: 'create_task', title, subject: subject.name,
      taskType: /\b(?:assignments?|projects?)\b/.test(text) ? 'assignment' : 'homework',
      ...(dueDate ? { dueDate } : {}), estimatedMinutes, priority,
      notes: `Original request: ${raw.trim()}${Object.keys(answers).length ? `\nClarification answers: ${JSON.stringify(answers)}` : ''}${estimatedMinutes ? '' : '\nDuration not specified. Set an estimate before allocating study time.'}`,
    },
  };
}
