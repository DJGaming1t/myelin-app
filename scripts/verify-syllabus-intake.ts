/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace } from '../src/data/schema';
import { parseExamDateInput } from '../src/features/exams/exam-engine';
import { createTopic } from '../src/features/topics/topic-operations';
import {
  SyllabusIntakeError,
  chunkSyllabusSource,
  prepareLocalSyllabusImport,
  syllabusIntakeJsonSchema,
} from '../src/features/assistant/local-ai/syllabus-intake';
import { LocalAiRuntimeSession } from '../src/features/assistant/local-ai/local-ai-runtime';

const now = 1_760_000_000_000;

function sessionFrom(
  responses: Array<unknown | string>,
  captured: Array<Parameters<LocalAiRuntimeSession['generate']>[0]>,
): LocalAiRuntimeSession {
  let index = 0;
  return {
    modelId: 'functiongemma-270m',
    async generate(request) {
      captured.push(request);
      const value = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return {
        text: typeof value === 'string' ? value : JSON.stringify(value),
        finishReason: 'stop',
      };
    },
    async close() {},
  };
}

async function main() {
  {
    const chunks = chunkSyllabusSource('A'.repeat(1_500));
    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 1_100));

    const schema = syllabusIntakeJsonSchema();
    assert.equal(schema.properties.version.const, 1);
    assert.equal(schema.properties.subjects.maxItems, 24);
  }

  {
    const workspace = createEmptyWorkspace(now);
    const existing = createTopic(
      {
        name: 'Real Numbers',
        subject: 'Mathematics',
        status: 'review',
        priority: 3,
        estimate: 90,
        notes: 'Keep this existing metadata.',
      },
      now,
    );
    workspace.topics.push(existing);

    const captured: Array<Parameters<LocalAiRuntimeSession['generate']>[0]> = [];
    const session = sessionFrom(
      [
        {
          version: 1,
          subjects: [
            {
              name: 'Mathematics',
              topics: [
                {
                  name: 'Real Numbers',
                  estimatedMinutes: 30,
                  priority: 1,
                  status: 'new',
                },
                {
                  name: 'Polynomials',
                  estimatedMinutes: 60,
                  priority: null,
                  status: null,
                },
              ],
            },
          ],
          uncertainties: ['One heading was abbreviated in the source.'],
        },
        {
          version: 1,
          subjects: [
            {
              name: 'Mathematics',
              topics: [
                {
                  name: 'Polynomials',
                  estimatedMinutes: 60,
                  priority: null,
                  status: null,
                },
              ],
            },
            {
              name: 'Physics',
              topics: [
                {
                  name: 'Light',
                  estimatedMinutes: null,
                  priority: 3,
                  status: 'learning',
                },
              ],
            },
          ],
          uncertainties: [],
        },
      ],
      captured,
    );

    const prepared = await prepareLocalSyllabusImport({
      workspace,
      session,
      sourceText: 'x'.repeat(1_500),
      examName: 'Half Yearly',
      examDate: '2027-01-15',
      requestId: 'syllabus-test-1',
      now,
    });

    assert.equal(captured.length, 2, 'Long source should use bounded local-model chunks.');
    assert.ok(captured.every((request) => request.jsonSchema));
    assert.ok(captured.every((request) => /Never invent/i.test(request.prompt)));
    assert.equal(prepared.topicCount, 3);
    assert.equal(prepared.newTopicCount, 2);
    assert.equal(prepared.existingTopicCount, 1);
    assert.equal(prepared.duplicateInputCount, 1);
    assert.equal(prepared.defaultEstimateCount, 1);
    assert.equal(prepared.prepared.preview.hasMutations, true);

    assert.equal(workspace.topics.length, 1, 'Preview must not mutate source workspace.');
    assert.equal(workspace.exams.length, 0);

    const previewWorkspace = prepared.prepared.preview.nextWorkspace;
    assert.equal(previewWorkspace.topics.length, 3);
    assert.equal(previewWorkspace.exams.length, 1);

    const preserved = previewWorkspace.topics.find((topic) => topic.id === existing.id)!;
    assert.equal(preserved.estimate, 90);
    assert.equal(preserved.priority, 3);
    assert.equal(preserved.status, 'review');
    assert.equal(preserved.notes, 'Keep this existing metadata.');

    const exam = previewWorkspace.exams[0]!;
    assert.equal(exam.name, 'Half Yearly');
    assert.equal(exam.topicIds.length, 3);
    assert.ok(prepared.warnings.some((warning) => /existing MYELIN topic/i.test(warning)));
    assert.ok(prepared.warnings.some((warning) => /45-minute default/i.test(warning)));
  }

  {
    const workspace = createEmptyWorkspace(now);
    workspace.exams.push({
      id: 'existing-exam',
      name: 'Boards',
      date: parseExamDateInput('2027-03-01')!,
      subjects: [],
      scope: 'topics',
      topicIds: [],
    });

    const captured: Array<Parameters<LocalAiRuntimeSession['generate']>[0]> = [];
    await assert.rejects(
      () =>
        prepareLocalSyllabusImport({
          workspace,
          session: sessionFrom([], captured),
          sourceText: 'Maths\nReal Numbers',
          examName: 'Boards',
          examDate: '2027-03-01',
          now,
        }),
      (error: unknown) =>
        error instanceof SyllabusIntakeError && error.code === 'exam_exists',
    );
    assert.equal(captured.length, 0, 'Duplicate exam must fail before model inference.');
  }

  {
    const workspace = createEmptyWorkspace(now);
    const captured: Array<Parameters<LocalAiRuntimeSession['generate']>[0]> = [];
    await assert.rejects(
      () =>
        prepareLocalSyllabusImport({
          workspace,
          session: sessionFrom(['not-json'], captured),
          sourceText: 'Science\nLight',
          examName: 'Unit Test',
          examDate: '2027-02-01',
          now,
        }),
      (error: unknown) =>
        error instanceof SyllabusIntakeError && error.code === 'invalid_json',
    );
  }

  {
    const workspace = createEmptyWorkspace(now);
    const captured: Array<Parameters<LocalAiRuntimeSession['generate']>[0]> = [];
    await assert.rejects(
      () =>
        prepareLocalSyllabusImport({
          workspace,
          session: sessionFrom(
            [
              {
                version: 1,
                subjects: [
                  {
                    name: 'Science',
                    topics: [
                      {
                        name: 'Light',
                        estimatedMinutes: 999,
                        priority: null,
                        status: null,
                      },
                    ],
                  },
                ],
                uncertainties: [],
              },
            ],
            captured,
          ),
          sourceText: 'Science\nLight - 999 minutes',
          examName: 'Unit Test',
          examDate: '2027-02-01',
          now,
        }),
      (error: unknown) =>
        error instanceof SyllabusIntakeError && error.code === 'invalid_draft',
    );
  }

  console.log('✓ long syllabus text is chunked before local inference');
  console.log('✓ extraction schema forbids invented fields and bounds topic metadata');
  console.log('✓ duplicate syllabus entries merge deterministically across chunks');
  console.log('✓ existing MYELIN topics are reused without overwriting their metadata');
  console.log('✓ syllabus import produces only a previewed create-topic/create-exam action batch');
  console.log('✓ duplicate exams and malformed model output fail before workspace mutation');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
