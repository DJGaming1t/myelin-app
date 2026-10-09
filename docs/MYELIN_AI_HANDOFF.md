# MYELIN AI Handoff

## Current priority: real model capability, before hosting — 2026-10-09 IST

The user clarified that a strong assistant inside the app matters more than Cloudflare. This supersedes the hosted-service next-step ordering in older sections below. Zero spending remains required. Existing rules, cloud adapters and failed trained Mini gates remain intact; no model activation or new OTA occurred in this chunk.

- Compared actual post-trained `litert-community/Qwen3.5-0.8B` and `Qwen3.5-2B` text INT8 `.litertlm` bundles, exact revisions/sizes/hashes frozen before inference. This is not the failed MYELIN LoRA. Published bundles require runtime 0.15+ and use a simplified non-thinking template; an artificial delay or a thinking toggle does not strengthen them.
- Authored/froze a separate 24-case, 29-turn development probe covering misspellings/Hinglish, corrections, followups, dates, arithmetic, explanations and no-tool guards. Its short reply/proposal JSON envelope is isolated from the production Mini protocol. No model output mutated the app; expectations were not supplied to models; later turns use actual generated history. No training or checkpoint selection.
- Actual inference source `addbe5616ea12ba1790c91fe24205f44046bce3c`, run `37920623351`, Enhanced job `113787395761`, Lite job `113787396001`: both completed SUCCESS with zero transport failures. Success means complete inference/evidence, not acceptable quality. Lite valid 0/29, objective 0/29; Enhanced valid 5/29, objective 1/29. Linux CPU median responses 8.04/18.99 seconds, not phone timing. Raw answers show repetitions, invented dates, bad arithmetic/negative multiplication and inappropriate intents, beyond JSON format problems. All 58 outputs reproduce the saved reports; Codex qualitative review is not independent human validation.
- Evidence/review/provenance: `training/assistant-capability/results/linux-greedy-20261009/`; artifacts Lite `11611937848`, Enhanced `11612621146`, digests in `verification.json`. Four scorer test groups/Python compilation passed. Frozen inputs are unchanged. Earlier alias 404 and hash-only filename/native format failures generated no answers and are recorded separately; no false zero-quality results. Runner uses the verified absolute snapshot path with `.litertlm` retained and the CLI's actual `max_completion_tokens` bound. `stop` alone does not guarantee untruncated output.
- Audited the integrity-checked `react-native-litert-lm` 0.7.0 package: Android Maven SDK 0.15.0. That meets the published minimum on source inspection, but is not installed-APK resolution or phone proof. Current app native context is 1024 and its action-only bridge resets conversation; the CLI test uses 4096 and explicit messages. A larger artifact alone cannot add tutoring or conversational memory.
- Exact next chunk: freeze new unseen short diagnostic prompts, then isolate plain/structured prompts, supported non-greedy sampling, and runtime 0.15/0.18 using the same exact files. Qwen's non-thinking text recommendations differ from current greedy settings; CLI 0.18 exposes temperature/top-p/top-k/seed but ignores presence penalty. Do not claim unsupported settings apply or that sampling is a proven fix. Prompt sensitivity, conversion and runtime regression remain possible. Do not tune/train on observed v1 requests to claim held-out quality.
- Only after useful model answers are established: implement a bounded conversation/reply bridge, reuse validated confirmed proposals, check actual app context/settings, then phone memory/speed and beta activation. Both current candidates remain blocked. No paid inference/hosting or new cloud setup is required for this diagnostic. Latest shipped Android beta remains weekly-schedule update `01a11ffe-5531-77e9-846a-72ffc82828ec`, runtime `0.2.13`.

## Stronger hosted model: auth and atomic quota adapters — 2026-10-09 IST

The user reports the AI is weak and instant; current beta rules are not running a trained Qwen model. This chunk advances the existing zero-spending hosted-Qwen path instead of adding canned replies or a fake thinking delay. It does not activate model inference in the app.

- Added Firebase REST `accounts:lookup` verification of each complete token at a fixed HTTPS origin, no redirects, bounded fetch/body and no identity caching. Local claim decoding cannot authorize access without Google's successful validation. Expected project/issuer/UID/timestamps and unsupported tenant checks apply; current account UID must match, original `auth_time` must be at least `validSince`, and disabled/deleted/invalid credentials reject. Missing revocation metadata and Google/configuration errors block generation. Current and token verified email must agree; anonymous identity is rejected by the service. No Admin private key or APK credential added.
- Added D1 migration plus atomic transactional conditional inserts enforcing user/shared minute/day limits and active leases. Production uses database UTC time at transaction execution. User defaults 2/minute and 8/day; shared defaults 4/minute and 24/day, two active shared requests. These are conservative application limits, not a neurons/day capacity claim. Attempts persist only hashed UID/request ID, random lease ID and times; seven-day deduplication, 90-second crash leases and fenced release. Admitted errors/cancellation remain counted. Shared cooldown is monotonic; missing/broken D1 or ambiguous responses block generation. No in-memory fallback or runtime cap override.
- Default Worker constructs real adapters from required AI/D1/Firebase server bindings. AI alone and activation-looking flags cannot bypass guards. No deployment config, Cloudflare identity, actual database, live model call, app cloud connection or new OTA in this backend-only chunk.
- Verified source `0ac5f0642a01910fbf9a0ed7de126d1189a5b18e`: backend run `37917520391`, job `113777217595`, SUCCESS. Full app TypeScript, exact protocol parity, all 25 Worker/auth/quota tests, four simulated Worker→cloud-client→strict Mini/grounding preview variants, existing cloud transport/deployment/smoke regressions, workflow syntax and all nine legacy Firebase backend tests including real Firestore-emulator concurrency/access denial passed. Production quota SQL was exercised against actual SQLite with 12 independent concurrent connections for shared limits/deduplication/last daily slots. Google token validation/revocation responses and AI are simulated; SQLite concurrency is not actual D1/workerd proof. Evidence: `docs/cloud/auth-d1-verification-20261009.json`; existing server lock artifact `11610581747` is not a Worker deployment receipt.
- Exact next chunk: bundle and test the actual Worker/D1 runtime and Free CPU constraints. Then obtain a Free deployment identity, verify live Firebase revocation and provider JSON/errors/cost/quality, deploy with receipt, add validated conversation context/replies and connect to app consent/routing. Zero spending remains required. Existing installed Android beta stays on the verified weekly-schedule OTA; physical device QA and Qwen phone release gates remain pending.

## Screenshot fix: weekly school hours — 2026-10-09 IST

User's Android screenshot confirms the conversational beta arrived, but `I have school on everyday except sat and sun , from 5:30am to 2pm` still falls through to model unavailability. Existing `Commitment` recurrence and Day map already support fixed-time blocks; the assistant lacked a connection.

- Added bounded local parsing for one weekly school/tuition/coaching interval. The exact screenshot request previews School, Monday–Friday, 330–840 local minutes (5:30 AM–2 PM), with explicit confirmation. Daily/weekdays/weekends, explicit weekly day lists/ranges, exclusions, AM/PM and explicit two-digit 24-hour clocks are supported. Ambiguous days/clocks ask; overnight, one-off/alternating/compound/negated schedules ask for a clear supported request or Day map instead of guessing.
- Missing weekly days and a same-day time interval can be answered in the same composer while retaining the original request and previous answers. Existing owner/revision/day/ten-minute guards apply. Preview labels show exact days/times; overlaps with fixed entries or already-scheduled tasks in the next seven calendar days are visible. Existing task times are not silently moved.
- Added local-only `create_commitment` execution to the existing Action Layer, with strict keys/types/ranges, workspace validation, receipts, stale-preview and confirmation safeguards. Duplicate weekly intervals reject, including a fresh request. Model tool catalog, JSON schema, cloud protocol and training sets are unchanged. The exported model parser and frozen evaluator reject this internal action; only the private fast-rule path can parse it. Legacy model grounding also rejects it. This does not grant a model permission to invent availability.
- `verify-assistant-schedules.ts` passes in India and US timezones: eight exact schedules, 14 missing/invalid/compound clarification scenarios, natural typed replies, recurrence across weekdays/weekends/DST, actual `freeStudyWindows` blocking, overlap visibility, confirmation, duplicates, stale scope and model isolation. Final source `9928c859ac2fb8224aad6b137fc18f09b84963a7` passed full beta run `37911040195` and hybrid run `37911040180`, including full app TypeScript, all app regressions, canonical protocol parity and exact installed-APK compatibility. Model weights/accuracy were not measured by these regressions.
- Android preview published 2026-10-09 14:58:44 IST (09:28:44 UTC), runtime `0.2.13`: group `0fb76097-c38b-471a-8f0a-63bc2d64ce6d`, update `01a11ffe-5531-77e9-846a-72ffc82828ec`. Actual EAS receipt verified: `docs/beta/weekly-schedule-update-20261009.json`, artifact `11606986743`. Scenario reports `11607270573`; evidence `docs/beta/weekly-schedule-verification-20261009.json`. Existing preview APK receives this update without reinstall or data clearing. New schedule path's phone QA remains pending.
- Next after verified delivery: return to revocation-aware auth/atomic D1 quotas for the free stronger hosted model. Qwen phone weights, live cloud inference and general chat remain unavailable. No paid activation.

## Conversational task assistant and honest availability — 2026-10-09 IST

User reports weak capability, wants conversational interaction and sees the generic offline-unavailable message. Root cause: Qwen phone artifacts are unreleased and cloud remains unconnected; previous changes strengthened bounded rules, not model inference. This chunk improves the actual assistant screen while preserving that distinction.

- Replaced the request/answer form with a screen-local chat thread, one bottom message composer, clarification replies in the same box, reviewable proposals, explicit confirmation and an applied receipt in the thread. New chat cancels generation and clears history; account changes clear history; workspace changes invalidate pending questions and proposals. History is bounded to 80 text messages and is not executable model context or unrestricted conversational memory.
- Added complete-message app-help replies for greetings, thanks, capabilities and Today/Focus/Review/Progress guidance. These are deterministic app guidance, not generated tutoring. Compound messages containing commands do not get swallowed as greetings/help. Requests beyond supported actions still require a model; cloud stays off.
- Added precise unreleased/missing-file/runtime/invalid-response explanations instead of the generic offline failure. Lite/Enhanced switching is accurately described as a preference, not activation. Conversational clarification phrases and `1 hour 30 minutes` duration answers are supported without losing the original request or previous answers.
- New conversation regressions cover actual routing/clarification/confirmed apply, no-model operation, sanitized availability, bounded help, new-chat/account isolation, stale-result rejection, bounded history and duplicate apply. Both timezone runs and existing hybrid/clarification/grounding/31-scenario checks passed locally; available TypeScript and TSX parsing passed. Verified final source `789c89e75e9cb836dd97f4aa40269d19e55ef673`: beta run `37908290974` and hybrid run `37908291086` both SUCCESS, including full app TypeScript, all app regressions and exact APK compatibility. An initial attempt blocked on old form source assertions; the existing integration check now tests chat wiring with all behavior/lifecycle checks retained.
- Android preview published 2026-10-09 14:31:42 IST (09:01:42 UTC), runtime `0.2.13`, group `9a841170-04a8-4b45-94f6-fd538cdc8af6`, update `01a11fe5-9669-7a19-ac68-8709253bb214`. Actual EAS receipt checked: `docs/beta/conversation-update-20261009.json`, artifact `11605083288`. Scenario reports artifact `11605607042`; evidence `docs/beta/conversation-verification-20261009.json`. Existing preview APK receives the update without reinstall/data clearing. Phone keyboard/large-text/navigation tests remain pending.
- Next: supported revocation-aware auth and atomic D1 quotas for the free hosted-Qwen service, then real Worker/provider testing and connection. A stronger model and a validated conversational reply/action protocol are still required for general chat or subject explanations. No training/evaluation claims or paid activation in this chunk.

## Clearer task interpretation and app-flow testing — 2026-10-09 IST

User requested stronger AI and better app testing. This bounded chunk improves the shipped local interpreter and verifies the same routing/clarification/preview/apply functions used by the screen. It does not train another model or claim stronger measured cloud quality.

- Recognizes polite supported commands such as `Could you please add a task to finish bio practical nb by tomorrow?`, with clean task titles. Polite exam creation without a day and vague topic changes now clarify before loading any model/cloud. Leading negated supported operations require a rewritten instruction before generation.
- Topic-linked practice and standalone schoolwork share exact task-detail parsing. Multiple/ranged/negative/fractional-minute estimates and conflicting/invalid/unsupported dates ask instead of taking the first value or rounding. A conventional adjacent `1 hour 30 minutes` is one 90-minute duration. `not important` means low priority; high/low contradictions ask. Questions/hypotheticals/completed statements and negated dates cannot become shortcut actions. Explicit typed date/minute answers can resolve an earlier ambiguity.
- Added `scripts/verify-assistant-app-scenarios.ts`: 31 development checks in India and US timezones. Valid cases verify exact fields, no mutation during preview, required confirmation, stale revision rejection, idempotent apply and conflicting reuse of request IDs. Typed followups retain the original request/previous answers and expire on owner/revision/day/time changes. Reports explicitly mark no live-model or physical-device testing. These are synthetic development regressions, not frozen model evaluation or independent accuracy estimates.
- Verified source `05c0c01b1b6215ac6306d4674fd5f3dcda5fdcdd`: beta run `37869225289` and hybrid run `37869225004` both completed SUCCESS. Full app TypeScript, existing app regressions, 31 checks in each timezone and strict APK compatibility passed. Both timezone reports are uploaded as artifact `11589028753`.
- Published compatible Android preview at 2026-10-09 06:53:53 IST (01:23:53 UTC), runtime `0.2.13`: group `950c9fca-525b-4dd0-8532-076259d2cf11`, update `01a11e42-70f1-75cf-95a7-2dc0478e1385`. Actual EAS receipt checked; saved as `docs/beta/task-details-update-20261009.json`, artifact `11588929572`. Verification evidence: `docs/beta/task-details-verification-20261009.json`. Existing preview APK receives the OTA; no reinstall or data clearing. Physical-device QA remains pending.
- Next after verified beta delivery: real revocation-aware authentication and atomic D1 quotas for the free hosted-Qwen path, then actual Worker/provider checks. Physical Android keyboard/navigation/text-size/OTA checks remain pending. Zero-spending requirement and failed Qwen phone gates remain in force.

## Active next step — zero spending, 2026-10-09 IST

The user says they cannot spend money. This supersedes the Firebase/Gemini setup proposed later in this historical handoff. Pause that activation: Firebase Functions requires billing, and current Gemini API terms exclude clients likely to be accessed by under-18s. MYELIN's school audience makes that a provider mismatch; an adult API owner would not remove it.

Current candidate: Workers Free + native Workers AI hosted `@cf/qwen/qwen3-30b-a3b-fp8` + D1 Free atomic quotas. Official research and bounded implementation sequence: `docs/MYELIN_FREE_CLOUD_PLAN.md`. Free AI allowance is account-wide 10,000 neurons/day and stops at exhaustion; no unlimited capacity claim. No Cloudflare account access, endpoint, live inference evidence or app update exists. Hosting/model eligibility and real quality still need verification.

The isolated free-host endpoint/provider foundation and authentication/quota adapters are now implemented; see the newest chunk above. Next sensible chunk: real Worker/D1 runtime and CPU verification. Code can proceed without another Firebase billing question. Owner setup is still needed to deploy the eventual free service. Never switch to paid hosting/credits or activate the existing Gemini workflow under this budget. Keep app cloud disabled and failed Qwen phone gates visible.

### Hosted Qwen endpoint foundation — 2026-10-09 IST

- Added dependency-free Web API ESM modules under `workers/assistant/`: server-owned Qwen candidate/settings, canonical Mini protocol, current chat-completion envelope, bounded request/context/output and sanitized provider failure handling. No Gemini dependency, Node runtime import, provider key, paid fallback, deployment config or app activation.
- The default Worker intentionally has no authentication/quota implementation and returns 503 without inference even with an AI binding. Trusted `createHandler` dependencies support verification; bodies and environment flags cannot supply bypasses. Real Firebase revocation checks and atomic D1 implementation remain required before wiring the default entry.
- One maximum 25-second HTTP response deadline covers body reads, auth, reservations, generation and cleanup. Delayed reservations can settle in `waitUntil` and release without starting AI; future quota leases must expire after crashes. Binding cancellation only guarantees discarded results, not GPU interruption or refunded allowance. No automatic generation retry.
- Provider codes 3036/3040/5035 have sanitized daily-reset/capacity/unconfigured handling. The model page advertises JSON response format, but generic JSON-mode support does not list this candidate. Actual JSON support, envelope, binding error shapes, tokenizer usage and quality are unmeasured; unsupported behavior fails closed.
- Local checks passed: 11 Worker HTTP/provider tests, actual Worker→cloud client→Mini/grounding integration with four simulated output variants, protocol parity and available TypeScript. Valid output yields confirmation preview without workspace changes; invalid fields/batch/request IDs reject; missing exam day makes no cloud call. Full app/CI evidence is recorded separately after completion. Node Web API tests are not workerd CPU or D1 concurrency verification.
- Final source `8174722e8aac2182d2a4fa6d500f9fd7a3ca2962` verified SUCCESS in run `37868173508`, job `113619803483`: full app TypeScript, canonical protocol parity, 11 Worker tests, four simulated Worker/client/Mini preview variants, existing client/deployment/smoke checks, actionlint and all nine existing Firebase backend tests including real Firestore concurrency/access denial. This is not Cloudflare/D1/live-provider verification. Evidence: `docs/cloud/worker-foundation-verification-20261009.json`.
- Next: implement and verify real authentication and atomic D1 quotas, then bundle/test workerd and obtain a Free deployment identity. Cloud/app remain inactive; existing Android preview and failed Qwen phone gates are unchanged.

## Repo / branch
- Repo: `DJGaming1t/myelin-app`
- Active branch: `codex/exam-autopilot-capacity-v1`
- Product rule: MYELIN remains the deterministic planner/authority. The model only interprets language, asks for clarification, or escalates.

## Current MYELIN Mini architecture
- Production contract: `src/features/assistant/myelin-mini.ts`
- Evaluation: `src/features/assistant/myelin-mini-evaluation.ts`
- Existing action safety/confirmation path is reused; the model never mutates workspace state directly.
- Routes: `actions`, `clarify`, `escalate`
- Minimum action confidence: 0.72
- Held-out eval set: `training/myelin-mini/eval-v1.jsonl`
- Seed set: `training/myelin-mini/seed-v1.jsonl`
- Failure curriculum generator: `scripts/generate-myelin-mini-failure-data.ts`
- Dataset compiler: `scripts/build-myelin-mini-dataset.ts`
- Trainer: `scripts/train-myelin-mini-qwen.py`
- Benchmark runner: `scripts/benchmark-myelin-mini.ts`

## Dataset
Latest compiled SFT dataset:
- 103 total examples
- 92 train
- 11 validation
- Train routes: 62 actions / 15 clarify / 15 escalate
- Failure curriculum: 73 generated examples, including shorthand, Hinglish, clarify-vs-escalate contrasts, protocol completeness, relative dates, existing references, and over-escalation fixes.
- The 20-case held-out eval set is intentionally separate and must NOT be added to training.

## Zero-shot baseline
Candidate:
- Qwen3.5-0.8B, Q4_0, llama.cpp, reasoning disabled

Measured 7-case diagnostic:
- Parse validity: 14.3%
- Route accuracy: 0%
- Exact action accuracy: 0%
- Unsafe actions: 0
- p50 CPU latency: ~2.2 s
- Mean CPU latency: ~4.9 s
- p95 CPU latency: ~14.1 s

Baseline file:
- `training/myelin-mini/baselines/qwen3.5-0.8b-q4_0-zero-shot.json`

Important finding:
- Reasoning must be disabled for this narrow routing task. With reasoning enabled, Qwen exhausted the output budget before final JSON.
- Zero-shot failures were mostly protocol/routing habits that are appropriate targets for fine-tuning.

## Real training completed
Full LoRA v1 training run:
- Workflow run ID: `37594519114`
- Job ID: `112703773900`
- Commit: `adfc8b01fde318ba4c7eb695bf99e212143eadd9`
- Workflow: `.github/workflows/train-myelin-mini-qwen-v1.yml`
- Base checkpoint used by the training workflow: `principled-intelligence/Qwen3.5-0.8B-text-only`
- Epochs: 2
- Batch size: 1
- Gradient accumulation: 4
- Max length: 1024
- Train rows: 92
- Validation rows: 11
- Device: CPU GitHub runner

Training result:
- SUCCESS
- Train loss: 0.515367366373539
- Final eval loss: 0.19927220046520233
- Final eval mean token accuracy: 0.961
- Final train mean token accuracy near end: ~0.980
- Train runtime: ~3552 seconds

Artifact:
- Artifact ID: `11472763126`
- Artifact name: `myelin-mini-qwen3.5-0.8b-lora-v1`
- Artifact size: ~291 MB
- Artifact digest: `sha256:2c06647673cd3f26eae801e0b21fb77e23c0147d54536add748bd0eb1f6f050d`

A prior one-step CPU smoke LoRA run also succeeded and produced a real adapter.

## Current status — 2026-10-07
The earlier v1-only handoff was stale. Verified GitHub Actions results:
- v2 fast: run `37621560138`, successful training and one-command acceptance.
- v2 Hinglish: run `37620118843`, successful training and one-command acceptance.
- v2 artifact: `11486205943`, name `myelin-mini-qwen3.5-0.8b-lora-v2`.
- The exact tested command was "kal trig ke 30 min questions add kar do".
- The v2 response had the correct topic, tomorrow date, 30-minute duration, practice type, and priority 2. Its title differed from the gold text, so strict action exact-match was 0 for this single example; semantic acceptance passed.
- That narrow success does not establish full release readiness.
- Historical v1 full evaluation (`37617238057`): gate FAIL, protocol validity 50%, route accuracy 30%, strict action accuracy 30%, two unsafe action decisions. Recovered report is saved under `baselines/qwen3.5-0.8b-lora-v1-historical.json`; runner/prompt differences prevent a controlled direct comparison.

## Benchmark integrity repair
- Inference parse errors now retain null output instead of fabricated escalation decisions.
- HTTP benchmark failures likewise retain null output and requestError.
- The common evaluator rejects parseError/requestError even in historical records containing a valid-looking fallback.
- Regression checks cover both error fields and successful null error metadata.
- Full evaluation reuses `.github/workflows/accept-myelin-mini-hinglish.yml`, now named "Evaluate MYELIN Mini v2 release gate".
- It downloads the completed v2 artifact and selects the final exported adapter explicitly, avoiding accidental selection of an intermediate checkpoint.
- It evaluates all untouched `eval-v1.jsonl` cases with reasoning disabled, records adapter/eval checksums and the training manifest, runs the separate Hinglish acceptance, uploads evidence even on failure, and fails the workflow unless both gates pass.
- No new training or app deployment is part of this chunk.

## Release gate
- Parse validity >= 99%
- Route accuracy >= 95%
- Exact action accuracy >= 90%
- Unsafe action rate = 0
- Clarify reason accuracy >= 90%
- Escalation reason accuracy >= 90%

## Completed full v2 evaluation
- Run: `37665305486`; job: `112942885764`; evaluated code: `a52edda83118a0b620b707999881769b896fe6f9`.
- Result artifact: `11503900163`, `myelin-mini-v2-release-evaluation`.
- Full release gate: FAIL (workflow correctly failed at enforcement, not during setup).
- 20/20 predictions; 12/20 protocol-valid (60%); 10/20 correct routes (50%).
- Strict action exact-match: 1/10 (10%); action-type sequence: 4/10 (40%).
- Clarification reasons: 0/5; escalation reasons: 0/5.
- Two protocol-valid actions on requests needing clarification. Additional malformed action attempts were rejected by the protocol parser and are not included in that count.
- CPU latency p50 23.3 s, p95 26.1 s. This is unquantized CPU adapter inference, not measured phone latency.
- Separate Hinglish semantic acceptance: PASS; title wording still differs from gold.
- Raw predictions, reports, checksums, and training manifest are committed under `training/myelin-mini/baselines/qwen3.5-0.8b-lora-v2/`.
- Downloaded predictions reproduce the exact GitHub report with the repaired scorer. Held-out source SHA-256: `6c96e3880028e87cb9d817294ab534b9a1719a46bd6c678ae58a5d2545ac5db5`.
- Full repo TypeScript check and MYELIN Mini regression script passed in GitHub. Local simulated network failure across all 20 cases received zero credit.
- No OTA/APK or model deployment was made.

### Diagnosis and next chunk
The raw results show strong create_task bias: topic creation, topic updates, exams, and planning requests often become practice tasks; some references are invented. All valid route outputs express about 0.98 confidence, including incorrect ones, so that confidence is not calibrated. Some strict exact-match misses are merely title differences, but action-type, clarification, and escalation failures independently block release.
The v2 dataset builder selects primarily practice requests plus missing-target examples. This is a plausible contributor to the observed bias; it is not a proven causal result.

## Training integrity repair — 2026-10-08
- Reproduced broad source dataset: 126 train / 11 validation. The v2 focused set contains 42 train rows: 38 create_task actions, 4 clarifications, no escalation examples or other action types.
- Real tokenizer audit: longest sequence 529 tokens. Main v2 (768) fits; fast v2 (first 16 rows, 512) truncates 7 targets. Default-template prefix alignment passed for these inputs; no evidence that template mismatch caused the old failure.
- New `scripts/build-myelin-mini-balanced.py` preserves 123 distinct clean training requests and replays minority groups into 225 training rows: 109 actions, 56 clarify, 60 escalate. All five action types are covered. Replayed rows are NOT new independent data.
- Three training request strings overlap evaluation: `clarify-target-1`, `clarify-ambiguous-1`, `escalate-general-knowledge-3`. They are excluded from the candidate using normalized request fingerprints. The old benchmark must be treated as a regression benchmark with known contamination, not pristine held-out evidence.
- Validation remains unweighted and has only 11 examples; its limited coverage is not a release certificate.
- Trainer preflight rejects missing routes, highly dominant action types, cut-off targets, empty completions, and prompt-prefix mismatch before loading model weights.
- Audited input_ids and completion masks are passed directly into TRL, with thinking disabled consistently. The completion mask excludes prompts and includes all answer tokens.
- Use `--preflight-only` for the tokenizer audit; legacy `--dry-run` remains a schema-only check.
- Fast and Hinglish v2 training workflows are now manual-only. The new `preflight-myelin-mini.yml` runs data checks and preprocessing integration tests without candidate training or model-weight downloads.
- Six local and GitHub regression tests passed. GitHub run `37706257119`, job `113081225791`, succeeded on commit `2d6ae4cdbc6e756fd9b5a39e525e62660d7a9c75`; artifact `11519906524` (`myelin-mini-training-preflight`). Actual TRL preprocessing preserved every input token and correctly masked prompts/padding while supervising complete answers. Summary: `training/myelin-mini/baselines/training-integrity-20261008.json`.
- Candidate tokenizer preflight: PASS, train max 529 tokens, validation max 506, limit 768; no target truncation or prefix mismatch.
- No candidate training or OTA/APK was run in this chunk. Current v2 remains blocked by the failed model-quality gate.

## Expanded curriculum and frozen evaluation — 2026-10-08
- Added `curriculum-v3.jsonl`: 71 new training requests and 18 new validation cases. Covers all action types, clarification and escalation reasons, multi-action references, and calendar boundaries.
- Added frozen `eval-v2.jsonl`: 32 authored synthetic cases (16 actions, 8 clarify, 8 escalate), with SHA-256 manifest. No model predictions were used to choose labels. This is a small synthetic benchmark, not independent human validation.
- Candidate now has 194 source records (192 distinct normalized requests) replayed into 255 rows (125 actions, 64 clarify, 66 escalate); validation has 29 unweighted cases. Three historical overlapping requests remain excluded.
- New verifier checks protocol labels, existing IDs, reference ordering, frozen hash, normalized request separation and gold-label scorer compatibility. Builder also checks the frozen hash and excludes both evaluation sets.
- Local TypeScript check, six training regressions and curriculum verification passed. Real tokenizer preflight passed: maximum 580 training tokens / 555 validation tokens, limit 768, no incomplete answers.
- Full GitHub verification PASS: run `37751372043`, job `113225146393`, tested commit `2ca437fa521016678157321f04706f580d9726dc`, artifact `11537872562`. Protocol/scorer regressions, full app TypeScript, six training tests and actual TRL token/mask preservation all passed. Initial data-only run `37707675824` also passed.
- No candidate training or app deployment in this chunk. Previous adapter remains blocked.

## Clean-base candidate v4 — 2026-10-08
- Workflow: `.github/workflows/train-myelin-mini-balanced-v4.yml`, triggered only when that workflow file changes or manually. It is a single bounded run, not an automatic retraining loop.
- Fresh base: `principled-intelligence/Qwen3.5-0.8B-text-only`, no previous adapter. Balanced-v3 data: 255 train / 29 validation. Two epochs, learning rate 0.0002, batch 1, accumulation 4, maximum 768 tokens, LoRA rank 16 / alpha 32, seed 42.
- CPU training timeout: 240 minutes. Actual training progress must be checked before claiming training has started or finished.
- Training rechecks isolation, protocol, TypeScript and actual TRL preprocessing. It saves package versions, source hashes, code commit, preflight and training manifest. Only the final exported adapter is evaluated; no checkpoint selection using the frozen benchmark.
- A dependent job automatically evaluates all 53 cases: 32 frozen eval-v2, 20 historical eval-v1 regression, 1 separate Hinglish acceptance. Each gate is scored independently; artifacts upload even on failed quality gates. Evaluation timeout: 60 minutes.
- Artifact names: `myelin-mini-balanced-v4-adapter` and `myelin-mini-balanced-v4-evaluation`. No app deployment is part of this workflow.
- Local workflow syntax/recipe checks and schema dry run passed; the full data/preprocessing tests already passed in the preceding chunk.
- Launched run `37752290697` on commit `0c0b68713e835932402b591edd336476cf7165b8`; training job `113228197390`. Setup, full data/protocol/TypeScript checks, actual TRL preprocessing and input-provenance recording passed. The training command is running; completed training metrics and evaluation are not available yet.
- Run URL: https://github.com/DJGaming1t/myelin-app/actions/runs/37752290697
- Continuation must inspect this same run first. Do not launch another candidate while it is still active.

## Error diagnostics while v4 trains — 2026-10-08
- v4 run `37752290697` remains in the training step; no measured v4 accuracy yet. Do not start another candidate.
- Added `scripts/diagnose_myelin_mini_predictions.py` and a historical regression check. It consumes gold JSONL, raw predictions and the existing scorer report without changing release-gate decisions. It separates valid unsafe actions from protocol-rejected action attempts and displays route/action-type confusions.
- Verified against v2 raw evidence: 20 cases, 6 structured action attempts on requests that should clarify or escalate; 4 rejected by protocol, 2 valid but wrong-route. The standard gate still reports the latter two as unsafe and failed overall.
- Run it on each v4 evaluation set after downloading results, e.g. `python scripts/diagnose_myelin_mini_predictions.py training/myelin-mini/eval-v2.jsonl <frozen-predictions.jsonl> <frozen-report.json> <diagnostics.json>`.
- Historical diagnostic output is saved under `training/myelin-mini/baselines/qwen3.5-0.8b-lora-v2/diagnostics.json`. This evidence does not establish v4 improvement.

## Conservative fast-router fix while v4 trains — 2026-10-08
- The deterministic shortcut previously treated `Create a Physics practice exam for tomorrow` as a practice task because it matched the word `practice` before examining exam intent. It could also reduce `Create the Elasticity topic and add a 20 minute practice task` to a clarification or one task.
- It now defers exam and chained-operation requests to the full decision path. A simple practice request still takes the shortcut. Targeted routing regressions and local TypeScript check passed.
- This code change happened after the training workflow commit; it does not alter the running v4 data, model weights, benchmark or evaluation code. It has not been published to an app build.

## Lite/Enhanced hybrid foundation — 2026-10-08
- User approved two offline alternatives plus cloud fallback. Persistent master checklist: `docs/MYELIN_HYBRID_AI_PLAN.md`.
- Added Qwen3.5 2B catalog entry and Lite/Enhanced preference. Preference survives restart independently of installation; downloads remain disabled without verified artifacts.
- Added shared validated routing with explicit cloud consent. Clarification does not trigger cloud guesses; cancellation never triggers fallback. The app has no cloud provider yet and invokes no remote AI.
- Connected Mini routing to the assistant screen: supported rules work without model weights; questions and unavailable-model messages are shown. Existing experimental FunctionGemma bridge remains separate.
- New local regressions and existing Mini checks passed. GitHub verification PASS: run `37755701533`, job `113239571939`, tested commit `b025d2033e8f33fb810556ad79c9bd575ed41559`. Full app TypeScript, hybrid regression, existing local model lifecycle/native-boundary regression, and Mini safety checks all passed. Screens have not been exercised on an Android device in this chunk.
- No 2B training, phone model release, cloud deployment, OTA or APK in this chunk. The active v4 training workflow remains on its original commit.

## Assistant beta delivery — 2026-10-08
- User explicitly requested connection to the app for beta testing. Added Settings → MYELIN assistant (beta) → Open MYELIN assistant and accurate model-choice/availability copy. Kept native dependencies and runtime unchanged.
- Confirmed existing Android preview APK `877c5749-c608-4d23-bca9-aca66fb2df06`, runtime `0.2.13`, source `137eee631edbe582da8c0e64ec89229a86a5aa9a` through Expo. Added strict comparison against its native inputs and runtime package metadata; package script-only changes are allowed.
- Workflow `.github/workflows/beta-assistant-preview.yml` triggers only its own file pushes on this feature branch or manual invocation. Full TypeScript, every existing verify script (including Firebase rules), hybrid/adaptive/transition regressions and Expo config passed.
- Initial run `37756745657` passed all verification but published nothing: an untracked receipt file inside the checkout violated the existing EAS clean-tree requirement. Fixed receipt output to the runner temporary directory; did not weaken the clean-tree requirement or mutate app runtime policy.
- Retry run `37757132256`: full verification job `113244334348` and publisher `113244845497` both SUCCESS. EAS CLI 24.12.0 exported and uploaded Android bundle, then returned publication receipt. Published source commit: `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`.
- Preview update group `13189175-e2b7-4fee-a910-8828facfe65e`; Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`; branch/channel `preview`, runtime `0.2.13`; published at `2026-10-08T09:34:01.337Z`. Receipt artifact `11540204341`; committed copy `docs/beta/assistant-update-20261008.json`.
- This is a rules-only assistant/preference beta, not released Qwen weights or cloud AI. Both Qwen phone downloads remain blocked; no cloud endpoint is connected. No production publication or new APK was created.
- Android smoke-test steps and exact limitations are in `docs/MYELIN_BETA_TESTING.md`. Physical-device interaction, keyboard/large-text checks and actual OTA receipt on a user's phone have NOT been exercised here.
- Last check of training run `37752290697`: clean-base training step still in progress; no v4 evaluation results yet. Left the run intact.

## Everyday schoolwork language — 2026-10-08
- User requested understanding `I have to complite bio practical nb by tomorrow` and similar natural study requests. Added bounded parser `src/features/assistant/schoolwork-language.ts` before the old topic-linked task path.
- The exact sentence produces a validated confirmation preview: `Complete Biology practical notebook`, subject Biology, homework, tomorrow's local calendar date, no chapter/topic link, estimate 0 (explicitly unknown, not measured or calculated).
- Handles common whitelisted typos and abbreviations, notebooks/homework/assignments/projects/worksheets/practical records/lab reports, numeric minutes/hours, half an hour, today/tonight/tomorrow/day after tomorrow, in 1–30 days (one–seven as words), valid ISO dates. Original text is retained in notes. No broad fuzzy correction of arbitrary names or IDs.
- Unknown/ambiguous subjects, compound schoolwork, unsupported weekdays/time deadlines, conflicting/invalid dates and invalid/multiple duration estimates clarify instead of guessing. Negated, completed, conditional and question forms do not become fast create actions. Legacy topic-linked homework stays compatible; explicit ISO date detection in that old path no longer loses hyphens during normalization.
- Assistant preview shows subject/type/date/duration including an explicit unknown-duration warning. Exact user example is an enabled example button. Clear rules run before the experimental FunctionGemma path as well. No new native dependencies.
- Tests cover shorthand, title/subject/type/date/duration, original notes, no invented chapter or priority, time/date conflicts, negation/completed work, year/leap-day rollover, zero model calls, no workspace mutation before apply, wrong confirmation rejection, and repeated-apply idempotence.
- Full app verification and publication SUCCESS: run `37759348032`, verification job `113251683447`, publisher `113252058418`; separate hybrid verification `37759348203` also passed. Source commit `5c644549305790be1c005eec26a027559fa76e00`.
- Published Android preview group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, update `01a11aee-348b-7bc9-a545-938c07316392`, branch/channel `preview`, runtime `0.2.13`, created at `2026-10-08T09:53:01.067Z`. Receipt artifact `11541334002`, copy `docs/beta/schoolwork-update-20261008.json`. No production publication or APK build.
- This improves shipped local language rules, not Qwen weights or unrestricted conversational understanding. Qwen downloads/cloud remain blocked. Training inputs and frozen evaluations were not modified. Android physical-device/large-text/keyboard QA remains pending in `docs/MYELIN_BETA_TESTING.md`.
- Next language chunk: retain an incomplete request so the user can answer a short clarification without rewriting it. Cloud transport and model evaluation/release remain on the existing master checklist.

## Short clarification replies — 2026-10-08
- Added typed, in-memory clarification answers for subject, existing topic, estimated minutes and due date. Original requests and prior answers survive successive questions; no text concatenation or invented references.
- Added an answer field and Continue to preview button. Editing the original, new request, account/workspace changes and screen unmount reset context; ten-minute, day-change and backwards-clock guards expire it before a reply is processed.
- Invalid/ambiguous replies ask again. All resolved actions retain the existing validated preview and explicit confirmation. No model loading or cloud calls are needed for these bounded rules.
- Full app verification and publication SUCCESS: run `37798325379`, verification job `113383531738`, publisher `113383992533`; separate hybrid run `37798325582`, job `113383531967`, also passed. Includes full app TypeScript, every existing verify script (including Firebase rules), clarification regressions, strict native compatibility and Android bundle export.
- Published source `a28dfa6bf734208cdce08f2845bc1889f062ba64`; Android preview group `8a863ce8-93b1-4188-895f-00c87283e0ac`, update `01a11c12-0b62-79ae-a66b-a5f752cf8924`, runtime `0.2.13`, created `2026-10-08T15:11:47.042Z`. Receipt artifact `11559483080`, copy `docs/beta/clarification-update-20261008.json`. No production publication or native dependencies changed. Physical-device QA remains pending.

## Completed v4 training; evaluation setup failure — 2026-10-08
- Same run `37752290697`, original source `0c0b68713e835932402b591edd336476cf7165b8`: training job `113228197390` completed SUCCESS.
- Final adapter artifact `11548375885`, `myelin-mini-balanced-v4-adapter`, 43,961,081 compressed bytes; digest `sha256:0704a6c3e0a1ed1bbe099c7165cfb7bf48fb68183b7c369591a5dbadac3802ac`, created `2026-10-08T11:37:07Z`.
- Rounded trainer log metrics: training runtime 9,813 seconds, train loss 0.1709; epoch-2 validation loss 0.1815, validation mean token accuracy 0.9535. These are teacher-forced training/validation metrics, not measured route or action accuracy and not release-gate results.
- Evaluation job `113291083789` failed at provenance checks: `verify-myelin-mini-curriculum.ts` could not open generated `training/myelin-mini/failure-curriculum-v1.jsonl` in its fresh checkout. Required generation ran in the separate training job but was not repeated in evaluation.
- Export/inference/scoring were skipped. No cases or accuracy were measured and the evidence directory was empty, so no evaluation artifact exists. This is a setup failure, not a measured quality-gate result. Qwen release remains blocked.

## Evaluation-only v4 recovery — 2026-10-08
- Added separate bounded `.github/workflows/evaluate-myelin-mini-v4-recovery.yml`; own-file push/manual trigger only, read-only repository permissions, no training invocation or app publication.
- Pins adapter artifact ID `11548375885`, original run `37752290697`, archive SHA-256 and source `0c0b68713e835932402b591edd336476cf7165b8`. Downloads the archive without forwarding GitHub credentials to storage and fails on any digest mismatch.
- Checks out the original source for curriculum generation, prompt export, inference and scoring. Rebuilds required inputs and compares train/validation hashes and both dataset/frozen manifests against saved training evidence before inference. New app language rules cannot inflate this model benchmark.
- Installs the recorded Python environment; records resolved base revision and verifies the training chat-template hash. Historical training did not record a resolved base revision, so recovery rejects a repository modification after training began and retains that provenance limitation in its evidence.
- Original frozen 32-case, historical 20-case and separate 1-case Hinglish gates are preserved. No checkpoint selection, new training, label edits or threshold changes. Supplementary diagnostics do not change scores; evidence uploads even on failure.
- Run `37821590889`, job `113463700064`, recovery code `2cccc7531724edd3e63f2a7cd4fb4592329c9ff3` completed. Archive verification, regenerated inputs, original full TypeScript/protocol/data checks, recorded dependency installation, all 53 predictions, scoring and diagnostics passed. The workflow correctly failed only at quality enforcement.
- Frozen eval-v2: 30/32 protocol-valid (93.75%), 29/32 correct routes (90.625%), 9/16 exact actions (56.25%), 13/16 action-type sequences (81.25%), clarification reasons 5/8, escalation reasons 7/8, one unsafe action. FAIL.
- Historical eval-v1: 20/20 valid, 16/20 correct routes (80%), 4/10 exact actions (40%), 8/10 action-type sequences, clarification reasons 2/5, escalation reasons 4/5, two unsafe actions. FAIL. Compared with v2 on the same historical set: validity 60%→100%, routing 50%→80%, exact actions 10%→40%; unsafe count remains two. No v2 frozen-v2 comparison exists.
- Separate Hinglish acceptance: semantic PASS; strict title wording differs. This single case does not override either failed release gate.
- CPU p50/p95: frozen 22.365/29.950 seconds; historical 17.319/25.977 seconds. Raw float32 CPU LoRA inference, not quantized phone performance. Confidence remains high on wrong outputs (frozen incorrect and correct both ~0.95), so threshold changes alone cannot establish safety.
- Main failures: hallucinated dates when an exam date was withheld; nonexistent `all` topic target; omitted supplied task dates and clientRef chains; omitted planner operation; unsupported `bufferPercent`, update `notes`, and malformed status patch. Some strict misses are title wording only, but semantic and routing failures independently block release.
- Evaluation artifact `11570312936`, `myelin-mini-balanced-v4-recovery-evaluation`, compressed size 36,580 bytes; digest `sha256:5a2e44a11436d1c799f5a912f4879257b09ea5e741169c92f1f7e8df0078add1`. Downloaded ZIP hash verified; recovered logs match artifact bytes. Raw predictions, reports, prompts, manifests, packages, checksums and diagnostics saved under `training/myelin-mini/baselines/qwen3.5-0.8b-lora-v4/`. Local current scorer reproduces both release reports exactly.
- Base revision recovered: `d692a5787e0534f0fd3484d7a516bd3c2d23dbed`, repository modification date `2026-03-12T13:09:53+00:00`, template hash matches saved preflight. Historical trainer did not record resolved base revision; that provenance limitation remains explicit. Python patch versions differ (training 3.12.14, recovery 3.12.15); package versions were restored. Transformer commit `fa40619176b63effb726ab0d0000925327cad7db`.
- No training, model release, OTA or APK in this chunk. Existing clarification/rules preview remains shipped. Frozen eval-v2 is now observed synthetic evaluation; later tuning needs a new frozen version rather than calling repeated evaluation pristine held-out validation.

## Shared request-grounding safeguards — 2026-10-09 IST
- New `src/features/assistant/assistant-request-grounding.ts` provides deterministic preflight questions and parsed model-batch checks. Mini offline/cloud and FunctionGemma share these checks before preview. Grounding rejections return clarification and cannot trigger a cloud guess.
- Clear new-exam requests without a supported day ask before loading a model. Vague topic edits ask for a target. Answers reuse the owner/revision/day/expiry-bound typed clarification flow; the screen and FunctionGemma prompt carry those explicit answers.
- Model exam dates must match a single valid ISO/relative-day/numeric-interval date or the explicit date answer. Unsupported or conflicting dates and multiple new exams ask for a narrower request. There is no default to today/tomorrow and no arbitrary nearest-exam context inference.
- Existing model topic/exam refs must resolve and be explicitly named (unique prefix for topics) or selected by a trusted topic answer / explicit `id ...`. Ambiguous duplicate names are rejected, including same-name/same-subject duplicates. Generic instruction words cannot match topic prefixes. Explicit all/upcoming-exam planning remains supported. Correct earlier clientRefs remain valid; missing/forward references reject the entire batch.
- Existing deterministic fast task commands keep their validation path. The guard is bounded: it does not prove every name/title/operation matches unrestricted natural language. This does not cure the raw Qwen model's failed benchmark or change the recorded reports.
- New `scripts/verify-assistant-grounding.ts` tests real Mini/hybrid and FunctionGemma integration, missing/mismatched dates, typed date/topic replies, unknown IDs, real but unrequested targets, duplicate/prefix ambiguity, generic-word collisions, ordered/forward clientRefs, cloud parity/no guessing, cancellation and confirmation. Generalized development requests only; frozen evaluations/training files were untouched.
- Final literal-ID matching preserves punctuation and case exactly; regression tests reject normalized-ID collisions. Full verification and publication SUCCESS: run `37836775724`, verify `113515914441`, publish `113516510837`; separate hybrid `37836775723`, job `113515695535`, passed. Original safeguard run `37836412787` also passed; final source supersedes its first version. Full app TypeScript, all existing verify scripts/Firebase rules, new grounding tests, retained clarification, adaptive/transition and strict OTA compatibility all passed.
- Published source `7680caa3726b1a865d59ac295768ea74f3d965b8`; Android preview group `6452e5b5-2dc5-491e-bba5-f5003738b8a9`, update `01a11d22-679d-70f2-a989-b6e3b0d4e876`, runtime `0.2.13`, at `2026-10-08T20:09:16.445Z` (2026-10-09 01:39 IST). Receipt artifact `11575982497`, copy `docs/beta/grounding-update-20261009.json`.
- No native dependencies, new APK, production publication, training, model releases or cloud deployment in this chunk. Physical-device QA remains pending in `docs/MYELIN_BETA_TESTING.md`. Existing Qwen raw-model evaluation remains failed; these runtime guards do not relabel it as a passed model release.

## Exact next step
1. Finish/live-verify the prepared Firebase cloud transport, using `docs/MYELIN_CLOUD_SETUP.md`. The source is ready; the genuine missing setup is Firebase deployment credentials/billing/API availability and the provider key/model. Do not put provider credentials into the APK, fake a working endpoint or silently deploy with untested cost assumptions.
2. Enable consent/mode controls only for an available connection; reuse shared safeguards and confirmation. Keep phone QA visibly pending until exercised. Preserve the same master checklist rather than starting a new plan.
3. Keep Qwen weights blocked. Later model tuning should address field completeness, references/chains and routing, with a new frozen evaluation version authored before that next candidate. Do not select checkpoints using observed benchmarks.
4. Evaluate phone latency before releasing Qwen weights. A rules-only assistant/preference beta may publish independently after compatible app checks pass; it must not claim working Qwen inference or cloud AI.

## Cloud transport chunk — 2026-10-09 IST

- Added `functions/` Firebase Admin/HTTP codebase (Node 22, asia-south1) and isolated server dependencies. Existing Firebase project/auth reused; Firestore sync/rules unchanged. Server-owned `protocol-v1.json` exactly matches Mini instructions/schema via generation/parity check.
- Auth verifies revocation and requires verified non-anonymous identity. Provider key is a server secret; model has no unverified default. App remains without a cloud endpoint/controls until deployment smoke tests pass.
- Atomic Firestore budgets 2/user/minute, 20/user/UTC day, 6/shared/minute and 120/shared/UTC day; 45-second user lease, ten-minute request-ID dedupe, charged attempts even on failure, shared provider-429 cooldown. Current default-deny rules protect server state.
- `createCloudAssistantAdapter` is an unwired transport factory: Firebase token callback, explicit consent/current-owner checks, HTTPS, bounded inputs, cancellation/deadline, Retry-After cooldown and no hidden retries. Hybrid displays sanitized cloud failure reasons. Complete decisions still go through shared grounding/preview/confirmation.
- Final source `c298f44ec777cc7c437de1d0aa756db8b9616102` verified SUCCESS: backend `37862323680` / job `113600718584` (8/8 backend tests including real Firestore concurrency, stale lease protection and denied unauthenticated read); hybrid `37862323690` / job `113600718535` (full app types, client transport, protocol parity, retained clarification/grounding, native model lifecycle and Mini regressions). Initial source also passed `37861950234` and `37861950201`. No real provider calls, Firebase deployment, training, mobile weights or preview publication.
- Saved server lock exactly matches verified dependency resolution: Admin `13.10.0`, Functions `6.6.0`; original artifact `11586538424`, archive SHA-256 `28fa7160f37d33fd4c4729d00fef60a87c4a038e046907e4f6dadb33d6b26922`, lock SHA-256 `a68c77a6d42a6cf8fa95743d6b1caf3643737b8228f8cb428fdaa890e876d47d`. Final CI uses `npm ci`. Also fixed timeout-during-cleanup to return a bounded HTTP error instead of leaving an open connection. Compact evidence: `docs/cloud/transport-verification-20261009.json`.
- Deployment commands, prerequisite account access and the exact next integration are documented in `docs/MYELIN_CLOUD_SETUP.md`. Existing preview remains source `7680caa3726b1a865d59ac295768ea74f3d965b8`; phone QA still pending.

## Deployment tooling chunk — 2026-10-09 IST

- Prepared `deploy-cloud-assistant.yml`: push does read-only syntax validation; only manual beta-branch dispatch may authenticate/deploy. Public model/ref/WIF validation precedes reusable backend tests. Deploy scope is `functions:assistant`, existing project/region; no app publication or Firestore rules deployment. GitHub dispatch registration/UI limitations and the Windows/local alternative are documented.
- Dedicated runtime account default `myelin-assistant-runtime@myelin-a0ba7.iam.gserviceaccount.com` now requires explicit provisioning/IAM before deployment. Source headers allow probes to match protocol and release, never credentials.
- Node deployment guards/probes and TypeScript synthetic smoke distinguish live HTTP reachability from valid provider inference. Missing/invalid auth and rejected wire fields are unbilled generation probes. Optional short-lived user token enables one exact synthetic preview; never applies. Wrong revisions/details, malformed outputs, timeout and cancellation fail closed. Receipts cannot enable the app automatically.
- Extended real Firestore test to assert signed-in client read/write denial for `_assistantQuota/global`, in addition to anonymous denial, atomic concurrency and stale-lease protection.
- Fixed a deployment-facing auth distinction: revoked/invalid user credentials return 401, while runtime IAM/configuration/auth-service errors return sanitized 503 without quota reservation or provider calls. Do not tell a valid user to reauthenticate because the server lacks permission.
- Source `8132dffbfac31724b89e9f378f2a45ea272c110a` SUCCESS: backend run `37863781488` / job `113605539297` (9 backend tests, 4 deployment guards, synthetic smoke, full app types, exact protocol parity, real Firestore signed-in quota denial/concurrency and actionlint); hybrid `37863781435` / job `113605539672` passed. Deployment-workflow push run `37863781627`, validation job `113605541198`, passed; preflight/verify/deploy jobs correctly skipped, deploy job `113605543465`. No Google auth or actual deploy. Evidence: `docs/cloud/deployment-tooling-verification-20261009.json`.
- No usable deployment identity/provider key is in this workspace. The GitHub connector excludes secret/variable management; do not repeat unsupported endpoint probes or use another surface to bypass that restriction. Remote credentials/billing are unverified. The optional billing-plan question received no answer; do not treat elapsed time, cancellation or another Next as agreement to billing. Google account/billing/provider setup is genuinely required from the project owner; no signup or billing change was performed.
- Next: complete that setup, run scoped deployment, save actual receipt, validate live inference, then wire consent/mode and an Android connection test using the current Firebase user's token (no manual token export for phone testers). Keep Qwen gates and phone QA pending. Do not write more unrelated features to hide the setup blocker.

## Continuity instruction
Read this file and current branch head before changing code. Inspect current workflows and artifacts before restarting any training. Work one sensible chunk at a time; verify, summarize, state the next step, then stop. Never claim visible app changes unless an OTA or APK was actually published.


Scoring note: action exact-match now normalizes consistently renamed local clientRefs by declaration position and type. All action fields, existing IDs and reference links still must match; unresolved, duplicate and out-of-order references are not normalized into valid links. Regression checks cover valid renaming and broken links for topic and exam chains. Historical reports retain their original scoring version.

Counting clarification: the manifest field uniqueTrainingSources counts 194 source IDs, not distinct text. Two legacy prompt pairs repeat, leaving 192 normalized distinct training requests. They are training-only and do not overlap frozen eval-v2.
