import { WorkspaceState } from '@/src/data/schema';
import {
  PreparedAssistantActionBatch,
  prepareAssistantActionBatch,
} from '@/src/features/assistant/assistant-action-session';
import { parseExamDateInput } from '@/src/features/exams/exam-engine';

import { LocalAiRuntimeSession } from './local-ai-runtime';

export const SYLLABUS_INTAKE_VERSION = 1 as const;
export const MAX_SYLLABUS_SOURCE_CHARS = 24_000 as const;
export const MAX_SYLLABUS_TOPICS = 90 as const;
export const SYLLABUS_SOURCE_CHUNK_CHARS = 1_100 as const;

export type SyllabusPriority = 1 | 2 | 3;
export type SyllabusTopicStatus = 'new' | 'learning' | 'review';

export type SyllabusTopicDraft = {
  name: string;
  estimatedMinutes: number | null;
  priority: SyllabusPriority | null;
  status: SyllabusTopicStatus | null;
};

export type SyllabusSubjectDraft = {
  name: string;
  topics: SyllabusTopicDraft[];
};

export type SyllabusReviewTopicDraft = SyllabusTopicDraft & {
  subject: string;
};

export type SyllabusExtractionDraft = {
  version: typeof SYLLABUS_INTAKE_VERSION;
  subjects: SyllabusSubjectDraft[];
  uncertainties: string[];
};

export type PreparedSyllabusImport = {
  examName: string;
  examDate: string;
  sourceChunkCount: number;
  subjects: SyllabusSubjectDraft[];
  topicCount: number;
  newTopicCount: number;
  existingTopicCount: number;
  duplicateInputCount: number;
  defaultEstimateCount: number;
  warnings: string[];
  prepared: PreparedAssistantActionBatch;
};

export class SyllabusIntakeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'empty_source'
      | 'source_too_large'
      | 'invalid_exam'
      | 'exam_exists'
      | 'generation_failed'
      | 'invalid_json'
      | 'invalid_draft'
      | 'too_many_topics'
      | 'cancelled',
  ) {
    super(message);
    this.name = 'SyllabusIntakeError';
  }
}

type IntakeRequest = {
  workspace: WorkspaceState;
  session: LocalAiRuntimeSession;
  sourceText: string;
  examName: string;
  examDate: string;
  requestId?: string;
  now?: number;
  signal?: AbortSignal;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function cleanString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string') {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  const result = value.trim();
  if (!result || result.length > max) {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  return result;
}

function strictKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const accepted = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !accepted.has(key));
  if (extras.length) {
    throw new SyllabusIntakeError(
      `${label} contains unsupported fields: ${extras.join(', ')}.`,
      'invalid_draft',
    );
  }
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string, max: number) {
  if (!Array.isArray(value) || value.length > max) {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  return value;
}

function nullableInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  if (value == null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  return value;
}

function nullableEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new SyllabusIntakeError(`Invalid ${label}.`, 'invalid_draft');
  }
  return value as T;
}

export function syllabusIntakeJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'subjects', 'uncertainties'],
    properties: {
      version: { const: SYLLABUS_INTAKE_VERSION },
      subjects: {
        type: 'array',
        maxItems: 24,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'topics'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            topics: {
              type: 'array',
              maxItems: 60,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'name',
                  'estimatedMinutes',
                  'priority',
                  'status',
                ],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 300 },
                  estimatedMinutes: {
                    anyOf: [
                      { type: 'null' },
                      { type: 'integer', minimum: 5, maximum: 240 },
                    ],
                  },
                  priority: {
                    anyOf: [
                      { type: 'null' },
                      { type: 'integer', minimum: 1, maximum: 3 },
                    ],
                  },
                  status: {
                    anyOf: [
                      { type: 'null' },
                      { enum: ['new', 'learning', 'review'] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      uncertainties: {
        type: 'array',
        maxItems: 30,
        items: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
  } as const;
}

export function parseSyllabusExtractionDraft(
  raw: unknown,
): SyllabusExtractionDraft {
  const root = objectValue(raw, 'syllabus extraction');
  strictKeys(root, ['version', 'subjects', 'uncertainties'], 'Syllabus extraction');
  if (root.version !== SYLLABUS_INTAKE_VERSION) {
    throw new SyllabusIntakeError(
      'Unsupported syllabus extraction version.',
      'invalid_draft',
    );
  }

  const subjects = arrayValue(root.subjects, 'syllabus subjects', 24).map(
    (subjectValue) => {
      const subject = objectValue(subjectValue, 'syllabus subject');
      strictKeys(subject, ['name', 'topics'], 'Syllabus subject');
      return {
        name: cleanString(subject.name, 'subject name', 120),
        topics: arrayValue(subject.topics, 'subject topics', 60).map(
          (topicValue) => {
            const topic = objectValue(topicValue, 'syllabus topic');
            strictKeys(
              topic,
              ['name', 'estimatedMinutes', 'priority', 'status'],
              'Syllabus topic',
            );
            return {
              name: cleanString(topic.name, 'topic name', 300),
              estimatedMinutes: nullableInteger(
                topic.estimatedMinutes,
                'topic estimated minutes',
                5,
                240,
              ),
              priority: nullableInteger(
                topic.priority,
                'topic priority',
                1,
                3,
              ) as SyllabusPriority | null,
              status: nullableEnum(
                topic.status,
                'topic status',
                ['new', 'learning', 'review'] as const,
              ),
            };
          },
        ),
      };
    },
  );

  const uncertainties = arrayValue(
    root.uncertainties,
    'syllabus uncertainties',
    30,
  ).map((item) => cleanString(item, 'uncertainty', 240));

  return {
    version: SYLLABUS_INTAKE_VERSION,
    subjects,
    uncertainties,
  };
}

function hardSplit(value: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('\n', maxChars);
    if (cut < Math.floor(maxChars * 0.55)) {
      cut = remaining.lastIndexOf(' ', maxChars);
    }
    if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function chunkSyllabusSource(
  sourceText: string,
  maxChars = SYLLABUS_SOURCE_CHUNK_CHARS,
) {
  const normalizedSource = sourceText.replace(/\r\n?/g, '\n').trim();
  if (!normalizedSource) return [];

  const paragraphs = normalizedSource
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      chunks.push(...hardSplit(paragraph, maxChars));
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      pushCurrent();
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks;
}

function buildExtractionPrompt(chunk: string, index: number, count: number) {
  return [
    'You extract syllabus structure for MYELIN.',
    'Return ONLY JSON matching the provided schema. No prose or markdown.',
    'Extract subjects and topic names only from the supplied syllabus text.',
    'Never invent a subject, topic, duration, priority, or study status.',
    'Use estimatedMinutes only when the source explicitly states a duration.',
    'Use priority only when the source explicitly marks relative importance: 1 low, 2 normal, 3 high.',
    'Use status only when explicit: new = not started, learning = in progress, review = already studied / needs revision.',
    'Otherwise use null for estimatedMinutes, priority, and status.',
    'If a subject heading is unclear, use "Unsorted" and explain the ambiguity in uncertainties.',
    'Ignore page numbers, marks, teacher instructions, and non-syllabus prose unless they define a topic.',
    `CHUNK ${index + 1} OF ${count}`,
    'SYLLABUS_TEXT:',
    chunk,
  ].join('\n');
}

function exactJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new SyllabusIntakeError(
      'The local model returned an empty syllabus extraction.',
      'invalid_json',
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new SyllabusIntakeError(
      'The local model did not return exact JSON for the syllabus.',
      'invalid_json',
    );
  }
}

type MutableTopic = SyllabusTopicDraft;
type MutableSubject = {
  name: string;
  topics: Map<string, MutableTopic>;
};

function mergeDrafts(drafts: SyllabusExtractionDraft[]) {
  const subjects = new Map<string, MutableSubject>();
  const uncertainties = new Set<string>();
  let duplicateInputCount = 0;

  for (const draft of drafts) {
    draft.uncertainties.forEach((item) => uncertainties.add(item));

    for (const subject of draft.subjects) {
      const subjectKey = normalized(subject.name);
      let targetSubject = subjects.get(subjectKey);
      if (!targetSubject) {
        targetSubject = { name: subject.name, topics: new Map() };
        subjects.set(subjectKey, targetSubject);
      }

      for (const topic of subject.topics) {
        const topicKey = normalized(topic.name);
        const existing = targetSubject.topics.get(topicKey);
        if (!existing) {
          targetSubject.topics.set(topicKey, { ...topic });
          continue;
        }

        duplicateInputCount += 1;

        for (const field of ['estimatedMinutes', 'priority', 'status'] as const) {
          if (existing[field] == null && topic[field] != null) {
            (existing as Record<string, unknown>)[field] = topic[field];
            continue;
          }
          if (
            existing[field] != null &&
            topic[field] != null &&
            existing[field] !== topic[field]
          ) {
            uncertainties.add(
              `Conflicting ${field} values for ${topic.name} in ${subject.name}; MYELIN kept the first explicit value.`,
            );
          }
        }
      }
    }
  }

  return {
    subjects: [...subjects.values()].map((subject) => ({
      name: subject.name,
      topics: [...subject.topics.values()],
    })),
    uncertainties: [...uncertainties],
    duplicateInputCount,
  };
}

function cleanExamName(value: string) {
  const result = value.trim();
  if (!result || result.length > 200) {
    throw new SyllabusIntakeError(
      'Enter a valid exam name before importing the syllabus.',
      'invalid_exam',
    );
  }
  return result;
}

function cleanExamDate(value: string) {
  const result = value.trim();
  const timestamp = parseExamDateInput(result);
  if (!timestamp) {
    throw new SyllabusIntakeError(
      'Enter a valid exam date in YYYY-MM-DD format.',
      'invalid_exam',
    );
  }
  return { value: result, timestamp };
}

function requestIdFor(workspace: WorkspaceState, now: number) {
  return `syllabus:${workspace.revision}:${now.toString(36)}`.slice(0, 120);
}

type BuildSyllabusImportRequest = {
  workspace: WorkspaceState;
  examName: string;
  examDate: string;
  subjects: SyllabusSubjectDraft[];
  sourceChunkCount: number;
  duplicateInputCount?: number;
  extraWarnings?: string[];
  requestId?: string;
  now?: number;
};

function normalizeReviewedSubjects(topics: SyllabusReviewTopicDraft[]) {
  if (!topics.length) {
    throw new SyllabusIntakeError(
      'Keep at least one topic in the syllabus before applying it.',
      'invalid_draft',
    );
  }
  if (topics.length > MAX_SYLLABUS_TOPICS) {
    throw new SyllabusIntakeError(
      `This import contains ${topics.length} topics. Keep at most ${MAX_SYLLABUS_TOPICS} in one import.`,
      'too_many_topics',
    );
  }

  const subjectMap = new Map<string, SyllabusSubjectDraft>();
  const seenTopics = new Set<string>();

  for (const raw of topics) {
    const subject = cleanString(raw.subject, 'subject name', 120);
    const name = cleanString(raw.name, 'topic name', 300);
    const estimatedMinutes = nullableInteger(
      raw.estimatedMinutes,
      'topic estimated minutes',
      5,
      240,
    );
    const priority = nullableInteger(
      raw.priority,
      'topic priority',
      1,
      3,
    ) as SyllabusPriority | null;
    const status = nullableEnum(
      raw.status,
      'topic status',
      ['new', 'learning', 'review'] as const,
    );

    const topicKey = `${normalized(subject)}::${normalized(name)}`;
    if (seenTopics.has(topicKey)) {
      throw new SyllabusIntakeError(
        `${name} appears more than once in ${subject}. Remove or rename the duplicate before applying.`,
        'invalid_draft',
      );
    }
    seenTopics.add(topicKey);

    const subjectKey = normalized(subject);
    let target = subjectMap.get(subjectKey);
    if (!target) {
      target = { name: subject, topics: [] };
      subjectMap.set(subjectKey, target);
    }
    target.topics.push({
      name,
      estimatedMinutes,
      priority,
      status,
    });
  }

  return [...subjectMap.values()];
}

function buildPreparedSyllabusImport(
  request: BuildSyllabusImportRequest,
): PreparedSyllabusImport {
  const examName = cleanExamName(request.examName);
  const examDate = cleanExamDate(request.examDate);

  if (
    request.workspace.exams.some(
      (exam) =>
        normalized(exam.name) === normalized(examName) &&
        exam.date === examDate.timestamp,
    )
  ) {
    throw new SyllabusIntakeError(
      `${examName} already exists on ${examDate.value}. Edit the existing exam instead of importing a duplicate.`,
      'exam_exists',
    );
  }

  const flattened = request.subjects.flatMap((subject) =>
    subject.topics.map((topic) => ({ subject: subject.name, topic })),
  );

  if (!flattened.length) {
    throw new SyllabusIntakeError(
      'Keep at least one topic in the syllabus before applying it.',
      'invalid_draft',
    );
  }
  if (flattened.length > MAX_SYLLABUS_TOPICS) {
    throw new SyllabusIntakeError(
      `This import contains ${flattened.length} unique topics. Import at most ${MAX_SYLLABUS_TOPICS} at once so the preview stays reviewable.`,
      'too_many_topics',
    );
  }

  const actions: Array<Record<string, unknown>> = [];
  const topicRefs: Array<Record<string, unknown>> = [];
  let newTopicCount = 0;
  let existingTopicCount = 0;
  let defaultEstimateCount = 0;

  for (const { subject, topic } of flattened) {
    const existing = request.workspace.topics.find(
      (candidate) =>
        normalized(candidate.name) === normalized(topic.name) &&
        normalized(candidate.subject) === normalized(subject),
    );

    if (existing) {
      existingTopicCount += 1;
      topicRefs.push({ topicId: existing.id });
      continue;
    }

    const clientRef = `syllabus-topic-${newTopicCount + 1}`;
    newTopicCount += 1;
    if (topic.estimatedMinutes == null) defaultEstimateCount += 1;

    actions.push({
      type: 'create_topic',
      clientRef,
      name: topic.name,
      subject,
      status: topic.status ?? 'new',
      priority: topic.priority ?? 2,
      estimatedMinutes: topic.estimatedMinutes ?? 45,
      notes: '',
    });
    topicRefs.push({ clientRef });
  }

  actions.push({
    type: 'create_exam',
    clientRef: 'syllabus-exam',
    name: examName,
    date: examDate.value,
    topicRefs,
  });

  const now = request.now ?? Date.now();
  const prepared = prepareAssistantActionBatch(
    request.workspace,
    {
      version: 1,
      requestId:
        request.requestId?.trim().slice(0, 120) ||
        requestIdFor(request.workspace, now),
      actions,
    },
    now,
  );

  const duplicateInputCount = request.duplicateInputCount ?? 0;
  const warnings = [...(request.extraWarnings ?? [])];
  if (duplicateInputCount) {
    warnings.push(
      `${duplicateInputCount} duplicate syllabus ${duplicateInputCount === 1 ? 'entry was' : 'entries were'} merged before preview.`,
    );
  }
  if (existingTopicCount) {
    warnings.push(
      `${existingTopicCount} existing MYELIN ${existingTopicCount === 1 ? 'topic will be' : 'topics will be'} reused without overwriting notes, status, priority or time estimates.`,
    );
  }
  if (defaultEstimateCount) {
    warnings.push(
      `${defaultEstimateCount} new ${defaultEstimateCount === 1 ? 'topic had' : 'topics had'} no explicit duration, so the preview uses MYELIN's 45-minute default.`,
    );
  }

  return {
    examName,
    examDate: examDate.value,
    sourceChunkCount: Math.max(0, Math.trunc(request.sourceChunkCount)),
    subjects: request.subjects,
    topicCount: flattened.length,
    newTopicCount,
    existingTopicCount,
    duplicateInputCount,
    defaultEstimateCount,
    warnings,
    prepared,
  };
}

export function prepareReviewedSyllabusImport(request: {
  workspace: WorkspaceState;
  examName: string;
  examDate: string;
  topics: SyllabusReviewTopicDraft[];
  sourceChunkCount?: number;
  requestId?: string;
  now?: number;
}) {
  const subjects = normalizeReviewedSubjects(request.topics);
  return buildPreparedSyllabusImport({
    workspace: request.workspace,
    examName: request.examName,
    examDate: request.examDate,
    subjects,
    sourceChunkCount: request.sourceChunkCount ?? 0,
    requestId: request.requestId,
    now: request.now,
  });
}

export async function prepareLocalSyllabusImport(
  request: IntakeRequest,
): Promise<PreparedSyllabusImport> {
  const sourceText = request.sourceText.trim();
  if (!sourceText) {
    throw new SyllabusIntakeError(
      'Paste syllabus text before asking MYELIN to extract it.',
      'empty_source',
    );
  }
  if (sourceText.length > MAX_SYLLABUS_SOURCE_CHARS) {
    throw new SyllabusIntakeError(
      `This syllabus is too large for one import. Keep it under ${MAX_SYLLABUS_SOURCE_CHARS.toLocaleString()} characters or split it into parts.`,
      'source_too_large',
    );
  }

  const examName = cleanExamName(request.examName);
  const examDate = cleanExamDate(request.examDate);
  if (
    request.workspace.exams.some(
      (exam) =>
        normalized(exam.name) === normalized(examName) &&
        exam.date === examDate.timestamp,
    )
  ) {
    throw new SyllabusIntakeError(
      `${examName} already exists on ${examDate.value}. Edit the existing exam instead of importing a duplicate.`,
      'exam_exists',
    );
  }

  const chunks = chunkSyllabusSource(sourceText);
  const drafts: SyllabusExtractionDraft[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    if (request.signal?.aborted) {
      throw new SyllabusIntakeError(
        'Syllabus extraction was cancelled.',
        'cancelled',
      );
    }

    const result = await request.session.generate({
      prompt: buildExtractionPrompt(chunks[index]!, index, chunks.length),
      maxOutputTokens: 420,
      jsonSchema: syllabusIntakeJsonSchema(),
      signal: request.signal,
    });

    if (result.finishReason === 'cancelled' || request.signal?.aborted) {
      throw new SyllabusIntakeError(
        'Syllabus extraction was cancelled.',
        'cancelled',
      );
    }
    if (result.finishReason !== 'stop') {
      throw new SyllabusIntakeError(
        'The local model did not finish extracting this syllabus section.',
        'generation_failed',
      );
    }

    drafts.push(parseSyllabusExtractionDraft(exactJson(result.text)));
  }

  const merged = mergeDrafts(drafts);

  return buildPreparedSyllabusImport({
    workspace: request.workspace,
    examName,
    examDate: examDate.value,
    subjects: merged.subjects,
    sourceChunkCount: chunks.length,
    duplicateInputCount: merged.duplicateInputCount,
    extraWarnings: merged.uncertainties,
    requestId: request.requestId,
    now: request.now,
  });
}
