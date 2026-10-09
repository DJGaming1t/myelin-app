# Hosted Qwen decision endpoint foundation

`index.mjs` is a Web API module Worker with a deliberately inactive default export. It has no Node imports, Admin key, Gemini call, deployment configuration, billing upgrade or gateway-credit route. `createHandler` accepts trusted server dependencies for verification tests. HTTP bodies/environment activation flags cannot inject authentication or quotas. Binding AI alone returns 503 and consumes no inference.

Run `node --test workers/assistant/test/assistant.test.mjs`. This tests Node's Web APIs and simulated dependencies, not workerd CPU limits, actual Cloudflare bindings, Firebase revocation, D1 concurrency or model quality. Canonical instructions/schema are imported directly from `functions/protocol-v1.json`; the existing export parity check remains authoritative.

Prepared transport: POST `/assistant`, `{version:1,prompt:string}`, Firebase bearer token, no-store/release headers and the existing client response envelope. The fixed candidate is `@cf/qwen/qwen3-30b-a3b-fp8`; server requests nonstreaming JSON with 1,200 output tokens and temperature 0.1. Qwen's documented chat-completion envelope must contain exactly one completed assistant choice. Unsupported JSON mode, thinking-only/truncated output, refusal, malformed JSON or wrong request ID fail closed without another generation. The model page advertises `response_format`, but the generic JSON-mode supported list does not list this candidate; actual availability must be verified live rather than assumed. No undocumented thinking API parameter is used.

Provider decisions still need the app's full Mini field/reference/grounding validation and explicit preview confirmation. Server envelope validation is not a semantic accuracy guarantee. Inputs exceeding a conservative 30,000 combined system/schema/prompt UTF-8 bytes are rejected, not truncated, to leave headroom in the documented 32,768-token context. This is a conservative byte bound, not measured tokenizer usage or free-capacity certification.

All HTTP phases share a maximum 25-second response deadline, including streaming body reads, auth, quota reservation, AI and lease cleanup. A reservation is allowed to settle after the HTTP timeout so its lease can be released; production quotas must have crash-safe expiration. The binding may continue GPU work after cancellation: the adapter discards the result and never retries. Attempts must remain charged. Provider codes 3036 (daily Free exhaustion), 3040 (capacity) and 5035 (paid-plan requirement) are sanitized; exhaustion waits until the next UTC reset and never asks the server to upgrade. Actual binding error shapes remain a live-verification requirement.

Next: implement supported revocation-aware Firebase authentication and atomic D1 quotas, then bundle/exercise the real Worker runtime. Keep this default entry inactive until both are wired. Account Free-plan/eligibility verification and real provider smoke precede app integration. See `docs/MYELIN_FREE_CLOUD_PLAN.md` for budget and deployment boundaries.

Official API references checked 2026-10-09:
- https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/platform/errors/
