# MYELIN cloud assistant setup

## Current status

Server and client transport code is prepared; it is not deployed or enabled in the app. The existing preview still runs local rules and the existing experimental offline path. A configured Firebase account alone does not grant a Gemini API key or permission to deploy Cloud Functions.

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

Required: a Firebase deployment identity for project `myelin-a0ba7`, billing/API enablement required by Cloud Functions/Secret Manager, and a Gemini API key/model available to that provider account. Never put the provider key in an Expo environment variable, app settings or source control.

From a signed-in trusted development machine, after verification:

```sh
npm --prefix functions ci
npx firebase functions:secrets:set MYELIN_GEMINI_API_KEY --project myelin-a0ba7
npx firebase deploy --only functions:assistant --project myelin-a0ba7
```

Set `MYELIN_GEMINI_MODEL` in `functions/.env.myelin-a0ba7` before deploying (only the non-secret model identifier belongs there). The checked-in package lock records the verified server dependency resolution. Do not check in secret files or deployment credentials. Deploy only this codebase; do not replace existing Firestore rules or sync data to activate AI.

Smoke-test the deployment with a real verified user's ID token: missing/revoked token fails, unsupported body fails, an explicit valid topic request produces a bounded protocol decision, consecutive requests hit shared/user caps with Retry-After, cancellation leaves no actionable result, provider failures remain sanitized. Confirm the selected model's pricing/quotas from the actual account; emulator tests cannot establish live inference quality or billing.

Only after that, configure the public tested endpoint in the app and wire `createCloudAssistantAdapter` with the current Firebase user's `getIdToken`, owner identity and explicit consent. Enable consent/mode controls only when the release endpoint is usable. Pass the screen AbortSignal, and keep existing preview confirmation. Test on Android and publish a compatible preview update when those visible controls are integrated.

## References

- https://firebase.google.com/docs/functions/http-events
- https://firebase.google.com/docs/functions/config-env
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://ai.google.dev/api/generate-content

