# MYELIN cloud assistant setup

## Current status

Server and client transport code is prepared; it is not deployed or enabled in the app. The existing preview still runs local rules and the existing experimental offline path. A configured Firebase account alone does not grant a Gemini API key or permission to deploy Cloud Functions.

Latest verified source `8132dffbfac31724b89e9f378f2a45ea272c110a`: backend [run 37863781488](https://github.com/DJGaming1t/myelin-app/actions/runs/37863781488) passed 9/9 backend tests, 4/4 deployment guards, synthetic smoke, full app TypeScript and workflow actionlint. Includes real Firestore concurrency, old/new lease protection and anonymous/signed-in quota read/write denial. [Hybrid run 37863781435](https://github.com/DJGaming1t/myelin-app/actions/runs/37863781435) also passed. [Deployment workflow push run 37863781627](https://github.com/DJGaming1t/myelin-app/actions/runs/37863781627) passed syntax validation only; Google-auth and deploy jobs were skipped. These checks do not establish live provider quality, usable IAM/billing, actual deployment or Android interaction. Evidence: `docs/cloud/deployment-tooling-verification-20261009.json`. Earlier transport evidence remains in `docs/cloud/transport-verification-20261009.json`.

The endpoint is a narrow study-management decision service, using the same Mini protocol, clarification, grounding, preview and confirmation checks. It does not add unrestricted tutoring, photo parsing or automatic timetable generation. A stronger provider must still be evaluated on MYELIN requests before its capability is advertised.

## Server contract

Deploy `functions/index.cjs` as `myelinAssistant`, codebase `assistant`, Node 22, region `asia-south1`. It receives only POST JSON `{ version: 1, prompt: string }` and an `Authorization: Bearer <Firebase ID token>` header. `prompt` is produced by `buildMyelinMiniUserPrompt`, including the bounded workspace context and typed clarification answers. The server rejects client-provided system instructions, provider/model names, keys, output budgets or extra transport fields.

The Admin SDK verifies the token including revocation. Anonymous/unverified accounts are rejected. Provider key `MYELIN_GEMINI_API_KEY` is a Firebase Secret Manager parameter bound to this function only. `MYELIN_GEMINI_MODEL` is a server-side string parameter with no default model; choose a currently available model using the actual provider account and smoke-test it. No unlimited/free-token assumption is built in.

`functions/protocol-v1.json` is generated from the app's exact system prompt/schema. Run `npx tsx scripts/export-assistant-cloud-protocol.ts` after intentional contract changes; CI checks parity. JSON mode is requested; full returned-decision validation and grounding still run on the client. Incomplete/blocked/mismatched provider responses fail closed. No workspace mutation is performed by the endpoint.

## Quotas and cancellation

Firestore Admin transactions reserve per-user and global budgets atomically: 2/user/minute, 20/user/UTC day, 6/shared/minute and 120/shared/UTC day. They are conservative application caps, not guarantees of provider availability or token capacity. Set limits lower if the chosen account has lower limits. Fixed windows can allow requests on either side of a boundary; the shared cap is deliberately below the earlier discussed 15 RPM. High traffic receives Retry-After; there is no unbounded queue.

One active request/user has a 45-second crash-safe lease. Duplicate request IDs within ten minutes are rejected. Reservations remain charged on failures/timeouts/cancellation, because a provider may already have started processing. Releasing an old lease cannot clear a newer request. Shared provider 429 responses set a cross-instance cooldown; the client honors Retry-After without hidden generation retries. Recreating a client adapter can reset its local cooldown, but cannot bypass server enforcement.

Only Admin SDK accesses `_assistantQuota/*`; current Firestore rules' default deny blocks clients. Quota documents retain counters, lease data and up to 20 recent request IDs, with hashed user document names. No prompts, model output, credentials or workspace contents are intentionally logged/stored by the endpoint. Standard provider/platform processing still applies.

Server timeout is 25 seconds, function hard timeout 40 seconds, client deadline at most 30 seconds (including token retrieval). AbortSignals and response disconnects cancel generation and discard late replies. Cancellation cannot promise reversal of a provider charge. The client rechecks owner and consent before sending and after replies; an account switch cannot return an old owner's decision. Screen lifecycle cancellation remains required when this adapter is wired into UI.

## Deployment prerequisites and commands

Required: a Firebase deployment identity for project `myelin-a0ba7`, Blaze billing/API enablement required by Cloud Functions/Secret Manager, and a Gemini API key/model available to that provider account. Billing status is not known from this workspace; no billing plan was changed. Never put the provider key in an Expo environment variable, app settings or source control.

Create the dedicated runtime account `myelin-assistant-runtime@myelin-a0ba7.iam.gserviceaccount.com` first. Give it Firestore access (`roles/datastore.user`), Firebase Auth read access for revocation checks (`roles/firebaseauth.viewer`) and Secret Accessor on **only** `MYELIN_GEMINI_API_KEY`. Do not grant it Owner/Editor. `MYELIN_ASSISTANT_RUNTIME_ACCOUNT` defaults to that account and is included in prepared configuration. Runtime permissions must be exercised live; emulator Admin access cannot prove IAM.

From a signed-in trusted development machine, after verification:

```sh
npm ci
npm --prefix functions ci
npx firebase login
npx firebase functions:secrets:set MYELIN_GEMINI_API_KEY --project myelin-a0ba7
node scripts/cloud-deployment-contract.cjs --write-env YOUR_GEMINI_MODEL YOUR_EXACT_COMMIT_SHA
npx firebase deploy --only functions:assistant --project myelin-a0ba7
```

Replace `YOUR_GEMINI_MODEL` with the model available in the provider account and `YOUR_EXACT_COMMIT_SHA` with `git rev-parse HEAD` from the verified checkout. The helper writes only the public model, release commit and runtime account to ignored `functions/.env.myelin-a0ba7`. The provider key is entered through Firebase's own secret prompt. The checked-in package lock records the verified server dependency resolution. Do not check in secret files or deployment credentials. Deploy only this codebase; do not replace existing Firestore rules or sync data to activate AI.

## Prepared GitHub deployment

`.github/workflows/deploy-cloud-assistant.yml` is prepared for a manual deployment. A push validates syntax only; it never authenticates to Google or deploys. Manual execution is restricted to `codex/exam-autopilot-capacity-v1`, checks public inputs, runs the reusable backend verification, then deploys only `functions:assistant`. Missing setup stops with a specific error. There is no automatic fallback to a project-wide service-account key.

One-time operator setup:

1. Configure Google Workload Identity Federation **through a service account** in project number `14373433855`, using the official setup below. Map repository ID, ref and workflow_ref claims and restrict admission to repository ID `1397490624`, beta ref `refs/heads/codex/exam-autopilot-capacity-v1` and this workflow path. A recommended condition after mapping those claims is `assertion.repository_id == '1397490624' && assertion.ref == 'refs/heads/codex/exam-autopilot-capacity-v1' && assertion.workflow_ref == 'DJGaming1t/myelin-app/.github/workflows/deploy-cloud-assistant.yml@refs/heads/codex/exam-autopilot-capacity-v1'`. Give this principal `roles/iam.workloadIdentityUser` on the dedicated deploy account.
2. Grant the deploy account the roles needed by the existing Firebase project and second-generation function deployment. Start with Cloud Functions Developer, Firebase Viewer and Service Account User on the specific runtime/build identities; public invocation configuration also needs Cloud Run IAM policy permissions, and the metadata preflight needs Secret Manager metadata read access. Provision build/service-agent permissions following the official guide rather than granting Owner/Editor or service-agent roles to the deploy account. Secret metadata checks never read the key value. Existing runtime Secret Accessor binding should be set by the project owner before deployment.
3. Add **repository variables**, not secret contents: `MYELIN_GCP_WIF_PROVIDER` (full `projects/14373433855/locations/global/workloadIdentityPools/.../providers/...` resource) and `MYELIN_GCP_DEPLOY_SERVICE_ACCOUNT` (the deploy service-account email in `myelin-a0ba7`). Ensure the runtime account and an enabled version of the Gemini secret already exist.
4. Register the workflow before dispatch. GitHub's UI requires the workflow on the default branch to show Run workflow; this chunk does not merge the app branch. Once registered by its validation run, use GitHub CLI/API with the beta ref where supported, or use the trusted local commands above. Do not change the repository default branch merely to expose a button. If using `gh`: `gh workflow run deploy-cloud-assistant.yml --ref codex/exam-autopilot-capacity-v1 -f gemini_model=YOUR_GEMINI_MODEL`.

The deploy job requests short-lived Google credentials only after source verification. It does not export a long-lived service-account key. This federation/Cloud Functions deployment has not been exercised live here; real credential/billing/role/provider setup is still required. The runtime Admin SDK uses the deployed runtime service account, not the CI federation identity.

After deployment, the workflow checks method rejection, missing authentication and unsupported body fields, and verifies `X-Myelin-Protocol` plus the exact `X-Myelin-Release` response header. It saves a `myelin-cloud-deployment-receipt` with **transport verified, provider unverified, app disabled**. These public probes never request model generation. Failure does not automatically roll back a successful deploy; keep the app disabled and inspect the failed check.

## Live provider smoke

`scripts/smoke-assistant-cloud.ts` repeats those bounded public checks. When supplied a short-lived, verified-account Firebase ID token through `MYELIN_SMOKE_ID_TOKEN`, it sends one synthetic empty-workspace request through the real cloud adapter, strict protocol, grounding and preview engine. It requires the exact expected topic, subject, status, priority, duration, revision and confirmation requirement. It never applies the action. A successful synthetic probe is not a general model benchmark.

Set `MYELIN_RELEASE_COMMIT` to the deployed commit and optionally `MYELIN_SMOKE_RECEIPT` to a local output path, then run `npx tsx scripts/smoke-assistant-cloud.ts`. No token means only transport is tested. Never put a user ID token into workflow inputs, commits, chat, receipts or logs. A future Android connection test should reuse the current signed-in user's `getIdToken` directly so phone testers do not need to export credentials. Consent/mode integration remains the next app chunk after a usable deployment.

Smoke-test the deployment with a real verified user's ID token: missing/revoked token fails, unsupported body fails, an explicit valid topic request produces a bounded protocol decision, consecutive requests hit shared/user caps with Retry-After, cancellation leaves no actionable result, provider failures remain sanitized. Confirm the selected model's pricing/quotas from the actual account; emulator tests cannot establish live inference quality or billing.

Only after that, configure the public tested endpoint in the app and wire `createCloudAssistantAdapter` with the current Firebase user's `getIdToken`, owner identity and explicit consent. Enable consent/mode controls only when the release endpoint is usable. Pass the screen AbortSignal, and keep existing preview confirmation. Test on Android and publish a compatible preview update when those visible controls are integrated.

## References

- https://firebase.google.com/docs/functions/http-events
- https://firebase.google.com/docs/functions/config-env
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://ai.google.dev/api/generate-content
- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/cli
- https://github.com/google-github-actions/auth
- https://docs.cloud.google.com/functions/docs/concepts/iam
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

