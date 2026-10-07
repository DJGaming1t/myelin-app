import {
  MyelinMiniDecision,
  parseMyelinMiniDecision,
} from '@/src/features/assistant/myelin-mini';

export type MyelinMiniEvaluationExample = {
  id: string;
  output: unknown;
};

export type MyelinMiniPrediction = {
  id: string;
  output: unknown;
  latencyMs?: number;
  // Preserve failures from inference runners; a fallback is not a model answer.
  parseError?: string | null;
  requestError?: string | null;
};

export type MyelinMiniEvaluationReport = {
  total: number;
  predicted: number;
  parseValid: number;
  parseValidity: number;
  routeCorrect: number;
  routeAccuracy: number;
  actionExamples: number;
  actionExactCorrect: number;
  actionExactAccuracy: number | null;
  actionTypeSequenceCorrect: number;
  actionTypeSequenceAccuracy: number | null;
  clarifyExamples: number;
  clarifyReasonCorrect: number;
  clarifyReasonAccuracy: number | null;
  escalateExamples: number;
  escalateReasonCorrect: number;
  escalateReasonAccuracy: number | null;
  unsafeActionCount: number;
  unsafeActionRate: number;
  overEscalationCount: number;
  clarificationMissCount: number;
  meanConfidenceCorrect: number | null;
  meanConfidenceIncorrect: number | null;
  latencyMs: {
    count: number;
    mean: number | null;
    p50: number | null;
    p95: number | null;
  };
  failures: Array<{
    id: string;
    type:
      | 'missing-prediction'
      | 'invalid-output'
      | 'wrong-route'
      | 'wrong-actions'
      | 'wrong-clarification-reason'
      | 'wrong-escalation-reason';
    detail: string;
  }>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function actionTypes(decision: MyelinMiniDecision) {
  return decision.route === 'actions'
    ? decision.batch.actions.map((action) => action.type)
    : [];
}

function actionPayload(decision: MyelinMiniDecision) {
  return decision.route === 'actions'
    ? decision.batch.actions
    : [];
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index]!;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateMyelinMiniPredictions(
  examples: MyelinMiniEvaluationExample[],
  predictions: MyelinMiniPrediction[],
): MyelinMiniEvaluationReport {
  const predictionById = new Map(predictions.map((item) => [item.id, item]));
  const failures: MyelinMiniEvaluationReport['failures'] = [];
  const correctConfidence: number[] = [];
  const incorrectConfidence: number[] = [];
  const latencies: number[] = [];

  let predicted = 0;
  let parseValid = 0;
  let routeCorrect = 0;
  let actionExamples = 0;
  let actionExactCorrect = 0;
  let actionTypeSequenceCorrect = 0;
  let clarifyExamples = 0;
  let clarifyReasonCorrect = 0;
  let escalateExamples = 0;
  let escalateReasonCorrect = 0;
  let unsafeActionCount = 0;
  let overEscalationCount = 0;
  let clarificationMissCount = 0;

  for (const example of examples) {
    const expectedRaw = example.output as { requestId?: unknown };
    if (typeof expectedRaw?.requestId !== 'string') {
      throw new Error(`Evaluation example ${example.id} has no requestId.`);
    }
    const expected = parseMyelinMiniDecision(
      example.output,
      expectedRaw.requestId,
    );

    if (expected.route === 'actions') actionExamples += 1;
    if (expected.route === 'clarify') clarifyExamples += 1;
    if (expected.route === 'escalate') escalateExamples += 1;

    const prediction = predictionById.get(example.id);
    if (!prediction) {
      failures.push({
        id: example.id,
        type: 'missing-prediction',
        detail: 'No prediction was produced for this evaluation example.',
      });
      continue;
    }
    predicted += 1;
    if (
      typeof prediction.latencyMs === 'number' &&
      Number.isFinite(prediction.latencyMs) &&
      prediction.latencyMs >= 0
    ) {
      latencies.push(prediction.latencyMs);
    }

    let actual: MyelinMiniDecision;
    try {
      if (prediction.parseError != null || prediction.requestError != null) {
        throw new Error(prediction.parseError ?? prediction.requestError ?? 'Inference failed.');
      }
      actual = parseMyelinMiniDecision(
        prediction.output,
        expected.requestId,
      );
      parseValid += 1;
    } catch (error) {
      failures.push({
        id: example.id,
        type: 'invalid-output',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const routeMatches = actual.route === expected.route;
    if (routeMatches) {
      routeCorrect += 1;
      correctConfidence.push(actual.confidence);
    } else {
      incorrectConfidence.push(actual.confidence);
      failures.push({
        id: example.id,
        type: 'wrong-route',
        detail: `Expected ${expected.route}; received ${actual.route}.`,
      });
    }

    if (expected.route !== 'actions' && actual.route === 'actions') {
      unsafeActionCount += 1;
    }
    if (expected.route === 'actions' && actual.route === 'escalate') {
      overEscalationCount += 1;
    }
    if (expected.route === 'clarify' && actual.route !== 'clarify') {
      clarificationMissCount += 1;
    }

    if (expected.route === 'actions' && actual.route === 'actions') {
      if (stable(actionTypes(expected)) === stable(actionTypes(actual))) {
        actionTypeSequenceCorrect += 1;
      }
      if (stable(actionPayload(expected)) === stable(actionPayload(actual))) {
        actionExactCorrect += 1;
      } else if (routeMatches) {
        failures.push({
          id: example.id,
          type: 'wrong-actions',
          detail: 'Action payload does not exactly match the expected action list.',
        });
      }
    }

    if (expected.route === 'clarify' && actual.route === 'clarify') {
      if (expected.reason === actual.reason) {
        clarifyReasonCorrect += 1;
      } else {
        failures.push({
          id: example.id,
          type: 'wrong-clarification-reason',
          detail: `Expected ${expected.reason}; received ${actual.reason}.`,
        });
      }
    }

    if (expected.route === 'escalate' && actual.route === 'escalate') {
      if (expected.reason === actual.reason) {
        escalateReasonCorrect += 1;
      } else {
        failures.push({
          id: example.id,
          type: 'wrong-escalation-reason',
          detail: `Expected ${expected.reason}; received ${actual.reason}.`,
        });
      }
    }
  }

  const total = examples.length;
  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  return {
    total,
    predicted,
    parseValid,
    parseValidity: total ? parseValid / total : 0,
    routeCorrect,
    routeAccuracy: total ? routeCorrect / total : 0,
    actionExamples,
    actionExactCorrect,
    actionExactAccuracy: actionExamples
      ? actionExactCorrect / actionExamples
      : null,
    actionTypeSequenceCorrect,
    actionTypeSequenceAccuracy: actionExamples
      ? actionTypeSequenceCorrect / actionExamples
      : null,
    clarifyExamples,
    clarifyReasonCorrect,
    clarifyReasonAccuracy: clarifyExamples
      ? clarifyReasonCorrect / clarifyExamples
      : null,
    escalateExamples,
    escalateReasonCorrect,
    escalateReasonAccuracy: escalateExamples
      ? escalateReasonCorrect / escalateExamples
      : null,
    unsafeActionCount,
    unsafeActionRate: total ? unsafeActionCount / total : 0,
    overEscalationCount,
    clarificationMissCount,
    meanConfidenceCorrect: mean(correctConfidence),
    meanConfidenceIncorrect: mean(incorrectConfidence),
    latencyMs: {
      count: latencies.length,
      mean: mean(latencies),
      p50: percentile(sortedLatencies, 0.5),
      p95: percentile(sortedLatencies, 0.95),
    },
    failures,
  };
}

export function myelinMiniPassesReleaseGate(
  report: MyelinMiniEvaluationReport,
) {
  return (
    report.parseValidity >= 0.99 &&
    report.routeAccuracy >= 0.95 &&
    (report.actionExactAccuracy ?? 0) >= 0.9 &&
    report.unsafeActionRate === 0 &&
    (report.clarifyReasonAccuracy ?? 0) >= 0.9 &&
    (report.escalateReasonAccuracy ?? 0) >= 0.9
  );
}

