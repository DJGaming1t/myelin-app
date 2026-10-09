/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createEmptyWorkspace } from '../src/data/schema';
import { routeWithMyelinMini } from '../src/features/assistant/myelin-mini';
import { createCloudAssistantAdapter } from '../src/features/assistant/cloud-assistant-adapter';

const deployment = createRequire(import.meta.url)('./cloud-deployment-contract.cjs') as {
  ENDPOINT: string;
  assertProbeResponse(response: Response, release: string): void;
  probeDeployment(options: { release: string; fetch?: typeof fetch; signal?: AbortSignal }): Promise<{
    version: number; sourceCommit: string; endpoint: string; transportVerified: boolean; providerVerified: boolean; appCloudEnabled: boolean;
  }>;
};

// Only synthetic workspace data is sent. A successful smoke test prepares one
// preview; it cannot apply an action or establish unrestricted model quality.
export async function smokeAssistantCloud(input: { release: string; token?: string; fetch?: typeof fetch; signal?: AbortSignal }) {
  const receipt = await deployment.probeDeployment(input);
  if (!input.token) return receipt;
  const send = input.fetch ?? fetch;
  const cloud = createCloudAssistantAdapter({
    endpoint: deployment.ENDPOINT, ownerId: 'operator-smoke-session',
    getCurrentOwnerId: () => 'operator-smoke-session', hasConsent: () => true,
    getIdToken: async () => input.token!,
    fetch: async (url, options) => {
      const response = await send(url, { ...options, redirect: 'error' });
      deployment.assertProbeResponse(response, input.release);
      return response;
    },
  });
  const workspace = createEmptyWorkspace();
  const result = await routeWithMyelinMini({ workspace, userRequest: 'Add Weather Instruments as a Geography topic, new, normal priority, estimated at 25 minutes.',
    requestId: 'live-smoke-' + randomUUID(), model: cloud, signal: input.signal, allowFastRouter: false });
  if (result.route !== 'actions' || result.prepared.batch.actions.length !== 1 || !result.prepared.preview.requiresConfirmation)
    throw new Error('Live provider did not prepare the expected synthetic preview. Cloud remains disabled.');
  const action = result.prepared.batch.actions[0];
  if (action.type !== 'create_topic' || action.name !== 'Weather Instruments' || action.subject !== 'Geography' ||
      action.status !== 'new' || action.priority !== 2 || action.estimatedMinutes !== 25 || workspace.topics.length)
    throw new Error('Live provider did not prepare the expected synthetic preview. Cloud remains disabled.');
  return { ...receipt, providerVerified: true, previewOnly: true };
}

async function main() {
  const release = process.env.MYELIN_RELEASE_COMMIT;
  if (!release) throw new Error('Set MYELIN_RELEASE_COMMIT to the deployed source commit.');
  const receipt = await smokeAssistantCloud({ release, token: process.env.MYELIN_SMOKE_ID_TOKEN });
  const output = process.env.MYELIN_SMOKE_RECEIPT;
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n'); }
  console.log(JSON.stringify(receipt, null, 2));
}
if (process.argv[1]?.endsWith('smoke-assistant-cloud.ts')) {
  void main().catch(() => { console.error('MYELIN cloud smoke check failed. Check deployment configuration and the verified account; cloud remains disabled.'); process.exitCode = 1; });
}
