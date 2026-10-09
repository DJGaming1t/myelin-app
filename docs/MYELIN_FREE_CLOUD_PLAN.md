# MYELIN cloud AI with zero spending

## Decision — 2026-10-09 IST

The user cannot spend money currently. This supersedes the Firebase/Gemini deployment prerequisites in earlier handoffs. Do not upgrade Firebase, enable paid Workers, buy credits or start a billable provider. Existing Firebase Auth and app sync remain in place.

Preferred candidate: a Cloudflare Worker on **Workers Free**, using the native **Workers AI binding** and a **D1 Free** database for shared quotas. First model to evaluate: `@cf/qwen/qwen3-30b-a3b-fp8`. This is a hosted model, separate from the pending Qwen3.5 0.8B/2B phone alternatives. No model download is needed on the phone. Actual MYELIN quality and latency are unmeasured; size alone is not a release certificate.

The Worker/provider foundation and Firebase REST verification/atomic D1 quota adapters are implemented under `workers/assistant/`. The default entry constructs real adapters only from required server bindings; missing configuration fails closed. Production SQL has been tested against actual SQLite with independent concurrent connections; Google responses and AI remain simulated. Real Worker/D1 runtime/CPU checks, account setup, live authentication/revocation and provider verification are still pending. No deployed endpoint, database, account or app update was created. Cloud routing remains disabled.

## Why the previous route is paused

Auth/quota source `0ac5f0642a01910fbf9a0ed7de126d1189a5b18e` passed backend CI `37917520391` / job `113777217595`: full app TypeScript, all 25 Worker/auth/quota checks, canonical protocol parity, simulated cloud-client/Mini integration and existing backend regressions. Verification record: `docs/cloud/auth-d1-verification-20261009.json`. Actual workerd/D1 and live Firebase/provider checks remain the next gates; this does not publish an app or endpoint.

Firebase Cloud Functions requires Blaze billing. Application quotas do not make a billing-enabled host a zero-spending service.

There is also a provider mismatch that should have been caught earlier: Gemini API's published terms require adult API users and exclude clients directed at, or likely to be accessed by, under-18s. MYELIN is a school study app. A different host or an adult-owned Gemini key does not remove that client restriction. Do not activate the prepared Gemini backend for this audience.

## Free capacity and boundaries

| Component | Documented Free allowance | Consequence for MYELIN |
| --- | --- | --- |
| Worker HTTP hosting | 100,000 requests/day, 10 ms CPU/request | Hosting requests are not AI generations; test token verification and parsing against the CPU limit. |
| Workers AI | 10,000 neurons/day, resets at midnight UTC | Shared account-wide inference allowance; on Free, exhausted allowance stops requests. It is not unlimited or per user. |
| D1 | Free daily read/write and storage limits | Database exhaustion must block generation rather than bypass quota checks. |

The selected Qwen model is listed at 4,625 neurons per million input tokens and 30,475 per million output tokens. Request capacity depends on the full system/schema/context prompt and completion, not just the student's sentence. Measure actual token usage before setting a beta capacity target. Count failed and cancelled attempts conservatively. Do not reuse the old 120 generations/day cap as a verified free allocation.

Some other Workers AI models require payment; they are outside this plan. Use the native binding without an AI Gateway credit route, third-party paid fallback, or automatic upgrade. The account's actual Free plan and access still need owner verification. No Cloudflare credentials are available here.

## Next implementation chunks

1. Foundation implemented: isolated Worker endpoint and hosted-Qwen adapter using the existing protocol, server-owned instructions, bounded output, exact request IDs and sanitized failures. Eleven local HTTP/provider tests and four simulated output variants through the actual cloud-client/Mini preview passed. Current Cloudflare chat-completion envelope is used; no Gemini envelope or undocumented thinking switch. JSON-mode support still needs live verification; malformed/incomplete output is rejected without retries. Default entry has no permissive auth/quota fallback and consumes no inference.
2. Implemented: fixed-origin Firebase `accounts:lookup` verifies each complete ID token remotely, expected project/UID/timestamps are checked, and original `auth_time` is compared with current account `validSince`. No decoded-only acceptance or identity cache; missing metadata or unavailable Google blocks generation. Current/token verified email and nonanonymous identity are required. Atomic D1 transactional conditional insert enforces user/shared minute/day caps, active leases, seven-day hashed request deduplication and shared monotonic cooldown. Admitted failed/cancelled attempts remain counted; expired leases and fenced cleanup cover crashes. Defaults are user 2/minute, 8/day and shared 4/minute, 24/day, with at most two active shared requests. These are application limits, not certified Free allocation. Twenty-five Worker/auth/quota tests pass locally, including actual SQLite concurrency; four simulated Worker/client/Mini preview variants and available TypeScript pass. Live Firebase revocation and actual D1 remain unverified. No Admin private key, deployment, paid activation or APK change.
3. Verify local Worker compatibility/CPU constraints and Cloudflare account eligibility, service terms and model license. Qwen's upstream model card lists Apache-2.0; that does not replace the hosting agreement. Then obtain a Free account deployment identity, deploy and save a receipt. Account creation still needs the owner; ordinary code work can proceed before account setup.
4. Run one real synthetic preview and a bounded development acceptance set, including shorthand, missing information, reference grounding and compound requests. Do not advertise better accuracy before measurements. Preserve existing failed offline release gates and benchmark separation.
5. Connect the tested public endpoint to the existing consent/owner-aware client, retaining clarification and confirmation. Publish the compatible Android preview after app checks, then perform phone QA.

Local rules remain available when cloud is exhausted or unavailable. Cloud cancellation must discard late replies; interruption cannot promise to restore consumed provider allowance. No workspace write happens until the existing explicit confirmation path.

## Official sources checked 2026-10-09

- https://www.cloudflare.com/products/workers/ — Free hosting and no-credit-card signup.
- https://developers.cloudflare.com/workers/platform/limits/ — Free hosting/CPU limits.
- https://developers.cloudflare.com/workers-ai/platform/pricing/ — Free allowance, exhaustion, model rates and paid-only exceptions.
- https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/ — hosted identifier, inputs and output schema.
- https://developers.cloudflare.com/d1/platform/pricing/ — Free database exhaustion.
- https://developers.cloudflare.com/workers-ai/platform/data-usage/ — provider data processing; no model training without explicit consent.
- https://www.cloudflare.com/terms/ and https://www.cloudflare.com/service-specific-terms-developer-platform/ — hosting agreements to check before account activation.
- https://huggingface.co/Qwen/Qwen3-30B-A3B — upstream model/license.
- https://firebase.google.com/docs/functions/get-started — Blaze deployment requirement.
- https://ai.google.dev/gemini-api/terms — age/client restriction.
