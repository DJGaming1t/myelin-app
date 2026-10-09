# MYELIN hybrid AI implementation

Accepted direction: optional Lite Qwen3.5 0.8B, Enhanced Qwen3.5 2B, and cloud fallback. MYELIN calculates plans and previews changes for explicit confirmation. Provider limits still apply; local routing reduces requests but does not remove cloud quotas.

## Master checklist

- [x] Replace the assistant form with a conversational task thread and single message/reply composer; add bounded app-help replies and precise model availability. Confirmed actions and scoped followups remain enforced. Final source `789c89e75e9cb836dd97f4aa40269d19e55ef673` passed full beta run `37908290974` and hybrid run `37908291086`, including both timezone suites; Android preview published 2026-10-09 14:31:42 IST. Receipt/evidence: `docs/beta/conversation-update-20261009.json`, `docs/beta/conversation-verification-20261009.json`. Phone QA and general model chat remain pending.
- [ ] Extend the validated hosted-model protocol to conversational answers and safe action proposals after live provider/auth/quota checks. Screen-local history and deterministic help are not a working general chat model.

- [x] Improve polite commands and shared task detail parsing; add 31 app-flow development checks in each of two timezones covering preview/confirmation, stale state, duplicate apply and retained-reply expiry. Full beta run `37869225289` and hybrid run `37869225004` passed for source `05c0c01b1b6215ac6306d4674fd5f3dcda5fdcdd`; compatible Android preview published 2026-10-09 06:53:53 IST. Receipts and verification: `docs/beta/task-details-update-20261009.json`, `docs/beta/task-details-verification-20261009.json`. Phone QA remains pending.
- [x] Record the user's zero-spending requirement; pause Firebase/Gemini activation and research a free hosting/inference alternative. Current decision: `docs/MYELIN_FREE_CLOUD_PLAN.md`.
- [x] Implement the isolated Web API Worker/Qwen provider foundation with bounded HTTP behavior and simulated integration through the existing confirmed preview. Default entry remains inactive pending auth/quotas; no live model evidence.
- [ ] Implement and verify Workers Free + hosted Qwen + D1 Free, preserving authentication, shared quotas, cancellation and the existing protocol. Account access and live model quality remain unverified.
- [x] Catalog both Qwen variants and keep unavailable mobile releases blocked.
- [x] Persist the preferred offline variant separately from model installation; retain older FunctionGemma preferences.
- [x] Connect Mini decision routing to the assistant screen, including rules without downloads, clarification and escalation messages.
- [x] Implement a common provider fallback contract with explicit cloud consent and cancellation protection.
- [x] Understand clear everyday schoolwork requests through bounded local rules: practical notebooks, homework, projects, worksheets, subject shorthand, common typos and day deadlines. Keep durations unknown when not supplied.
- [x] Retain incomplete requests and accept short typed clarification replies, with owner/workspace/day/expiry guards and explicit confirmation.
- [ ] Configure an authenticated server-side cloud provider; enforce per-user quotas, timeouts and backoff. No provider key belongs in the APK.
- [x] Prepare the Firebase server and cancellable client transport with server-owned protocol, atomic quotas, deduplication and explicit owner/consent checks. Deployment and live provider verification remain separate.
- [x] Prepare scoped manual deployment, dedicated runtime identity, release probes and synthetic provider smoke. Account setup and actual deployment remain pending.
- [ ] Add cloud consent and routing mode controls once the connection can perform the advertised operation.
- [x] Finish 0.8B training run 37752290697; final adapter exported successfully.
- [x] Recover evaluation of that same adapter; all 53 cases measured. Both release gates failed; separate Hinglish acceptance passed. Weights remain blocked.
- [x] Add shared request-grounding checks for missing exam dates and unresolved targets before model actions reach preview. Test generalized development requests without training on evaluated cases.
- [ ] Train and compare a separate 2B candidate using the same development splits and protocol. Future held-out versions are needed once current evaluation results are used for tuning.
- [ ] Convert each approved adapter/base combination into a supported phone artifact, verify file hashes and test Android speed, RAM, context capacity and structured output.
- [ ] Publish signed download descriptors; enable download/select/remove for released models through the existing one-session manager.
- [ ] Run integrated device tests and publish a compatible preview update (tracked separately below).

## Completed first chunk

The model screen saves Lite/Enhanced preferences and labels both Qwen phone releases as pending. The preference does not install or load model weights. The licensed experimental FunctionGemma path remains separate and usable.

The assistant tries simple rules before loading Qwen. More involved requests use the preferred offline adapter when its verified artifact is available. Missing or invalid model responses produce an explicit unavailable/escalation message, and cannot bypass the preview confirmation layer. Clarification questions reach the user directly. The shared router accepts an optional cloud adapter, but the app provides none and cloud consent defaults off.

Tests cover preference restoration, failed preference saves, absent phone artifacts, both Qwen decision envelopes, rules without model loading, malformed outputs and invented IDs, cloud consent, clarification, cancellation, and preview-only changes. Full app verification is performed by `verify-hybrid-ai.yml`.

GitHub verification passed on commit `b025d2033e8f33fb810556ad79c9bd575ed41559`: run `37755701533`, job `113239571939`. This includes full app TypeScript and the existing native-model lifecycle regression. Android screen interaction and model performance still require device testing.

## Release limitations

No Qwen download URL or phone artifact has been configured. A LoRA training adapter is not a `.litertlm` mobile bundle. Current FunctionGemma runtime settings use a 1024-token context and cap outputs at 1024; approved Qwen bundles must be tested with their own context/output settings before download is enabled. The bridge requests 1200 tokens, matching the Mini contract, but that request alone does not change native limits.

No cloud endpoint is deployed by this chunk, and no app build/update is published. Download-size and RAM figures discussed earlier were estimates, not measurements.

## Beta delivery chunk

The user requested connection to the app for beta testing. Settings now exposes a direct MYELIN assistant beta link and accurately describes Lite/Enhanced as pending phone releases. `docs/MYELIN_BETA_TESTING.md` records the Android smoke test and limitations.

- [x] Confirm preview APK `877c5749-c608-4d23-bca9-aca66fb2df06` runs on preview channel/runtime `0.2.13`.
- [x] Add strict OTA compatibility comparison against APK source commit `137eee631edbe582da8c0e64ec89229a86a5aa9a`. Native inputs must be identical; only package scripts may differ from package metadata.
- [x] Add bounded beta workflow (own-file push or manual invocation only), full regression verification, and preview-only publication from the verified commit.
- [x] Confirm EAS publication receipt: group `13189175-e2b7-4fee-a910-8828facfe65e`, Android update `01a11adc-d079-745b-a8bd-ea71b6da9816`, runtime `0.2.13`, branch/channel `preview`, published 2026-10-08 09:34 UTC.
- [ ] Exercise Android smoke test on a phone; automated regression is not device QA.

Delivery evidence: GitHub run `37757132256` passed full app regressions, TypeScript, native compatibility and publication. Source commit `fafbfeb6f223d44ea4a7538a3c3c4c62aa2d544b`; receipt artifact `11540204341`. The first attempt `37756745657` passed verification but published nothing: creating its receipt inside the checkout tripped the existing clean-tree check. The retry writes its receipt under the runner's temporary directory without disabling that check. No production update or new APK was created.

Next implementation chunk after beta delivery: authenticated cloud transport with quota/unavailability handling, then consent/mode controls. Continue checking the same active training run independently; do not relaunch it because app code changed.

## Everyday schoolwork chunk

User example: `I have to complite bio practical nb by tomorrow`. The assistant now previews `Complete Biology practical notebook`, subject Biology, homework type, tomorrow's local calendar date, no invented chapter, and duration unset. This works without model weights and still requires explicit confirmation. The experimental FunctionGemma selection also takes clear rule decisions before invoking its legacy model path.

Supported bounded normalization includes `complite`, `nb`, `hw`, `tmr`, common subject abbreviations, numeric minute/hour estimates, half an hour, today/tonight/tomorrow/day after tomorrow, in 1–30 days (one–seven also as words), and valid ISO dates. Weekdays, time-of-day deadlines, conflicting/invalid dates, ambiguous subjects and compound tasks ask for clarification. Original text is retained in task notes. Topic-linked legacy tasks remain separate.

This is a local language-rule improvement, not new Qwen weights or unrestricted natural-language comprehension. Training data, frozen evaluations and the active v4 run are unchanged. Follow-up answers still require editing the original request; conversational slot-filling remains a future chunk. The preview now displays task subject, type, due date and duration/unknown state.

Local routing, protocol, hybrid, model lifecycle and available TypeScript checks passed. Full app TypeScript and all existing regression scripts passed in GitHub run `37759348032`, verification job `113251683447`. Publisher `113252058418` succeeded. Separate hybrid verification run `37759348203` also passed.

Published source `5c644549305790be1c005eec26a027559fa76e00`, Android preview runtime `0.2.13`, group `73bc7b39-a37b-49d1-a556-fc30143dc79a`, update `01a11aee-348b-7bc9-a545-938c07316392`, at `2026-10-08T09:53:01.067Z`. Receipt artifact `11541334002`, committed copy `docs/beta/schoolwork-update-20261008.json`. No production or native build changes. Physical-device QA remains pending.

The next language chunk below adds short clarification replies. Broader free-form interpretation still needs the authenticated cloud connection and approved mobile model releases from the existing checklist.

## Short clarification replies

The assistant retains an incomplete request in screen memory and accepts one explicit answer at a time: a known subject, an existing topic name, a duration from 5–720 minutes, or a valid date. Answers are typed slots rather than appended commands. Earlier answers survive subsequent questions, and the final action still goes through validation, preview and confirmation.

Editing the original request, starting a new request, leaving the screen, changing account/workspace revision, crossing a calendar day or exceeding ten minutes clears or expires the context. Invalid or ambiguous replies do not create tasks. Compound operations and unsupported questions still require a rewritten request or a future model connection.

Full app TypeScript, all existing app verification scripts, clarification/hybrid regressions and native compatibility passed in run `37798325379` (verify `113383531738`, publish `113383992533`). Separate hybrid run `37798325582` also passed. Published Android preview runtime `0.2.13`, group `8a863ce8-93b1-4188-895f-00c87283e0ac`, update `01a11c12-0b62-79ae-a66b-a5f752cf8924`, source `a28dfa6bf734208cdce08f2845bc1889f062ba64`, at `2026-10-08T15:11:47.042Z`. Receipt artifact `11559483080`, copy `docs/beta/clarification-update-20261008.json`. Device QA is pending. No model weights, cloud connection, training inputs or frozen evaluation data changed.

Training status: run `37752290697` successfully exported artifact `11548375885` (`myelin-mini-balanced-v4-adapter`, SHA-256 `0704a6c3e0a1ed1bbe099c7165cfb7bf48fb68183b7c369591a5dbadac3802ac`). Evaluation job `113291083789` failed on missing generated `training/myelin-mini/failure-curriculum-v1.jsonl` before inference. All 53 cases remain unevaluated; no evaluation evidence artifact was produced. Next model chunk is evaluation-only recovery against the same final adapter and original pinned source, regenerating the required inputs and preserving frozen hashes and all gates. Do not retrain to repair this setup failure.

## Evaluation recovery chunk

Added a separate evaluation-only workflow using saved artifact `11548375885` and original source `0c0b68713e835932402b591edd336476cf7165b8`. It enforces the archive digest, regenerates required curriculum/compiled inputs, matches training hashes and frozen manifests, uses the saved Python environment and preserves all 53 cases and original gates. Five local isolation/provenance tests and workflow syntax checks passed. Run `37821590889`, job `113463700064`, completed: setup, original TypeScript/protocol/data checks and inference passed; enforcement correctly failed on measured quality. Evidence artifact `11570312936`, SHA-256 `5a2e44a11436d1c799f5a912f4879257b09ea5e741169c92f1f7e8df0078add1`. Raw predictions reproduce both reports locally and match the downloaded artifact. Committed evidence: `training/myelin-mini/baselines/qwen3.5-0.8b-lora-v4/`.

| Set | Valid outputs | Correct route | Exact actions | Unsafe actions | Gate |
| --- | --- | --- | --- | --- | --- |
| Frozen eval-v2 (32) | 30/32 (93.75%) | 29/32 (90.625%) | 9/16 (56.25%) | 1 | FAIL |
| Historical eval-v1 (20) | 20/20 (100%) | 16/20 (80%) | 4/10 (40%) | 2 | FAIL |
| Separate Hinglish (1) | 1/1 | 1/1 | 0/1 (title differs) | 0 | Semantic PASS |

Historical v2 → v4: valid outputs 60% → 100%, route accuracy 50% → 80%, exact actions 10% → 40%, unsafe actions unchanged at 2. There is no v2 result on frozen eval-v2. Dates, references, chained actions and allowed fields still fail independently of title wording. High confidence does not distinguish wrong decisions. Frozen CPU latency p50 22.4 s / p95 30.0 s; historical p50 17.3 s / p95 26.0 s. These are unquantized CPU adapter measurements, not Android performance or independent human evaluation.

Next chunk: shared missing-date/unresolved-target grounding checks before model previews. Later tuning must use generalized development data and a new frozen evaluation version; do not copy these observed evaluation requests into training or select checkpoints using them. No app update or new training was performed in this chunk. The existing rules beta remains the shipped assistant.

## Shared request-grounding chunk — 2026-10-09 IST

Added `assistant-request-grounding.ts` to Mini routing and the experimental FunctionGemma bridge. Clear exam creation requests without a supported day and vague topic edits ask for clarification before model generation. Explicit answers use the existing retained-request flow. Valid model batches are checked before preview: exam dates must equal one explicit supported date or answer, and existing record references must resolve and be named in the request or explicitly selected through a trusted topic answer. Duplicate names and ambiguous prefixes ask rather than letting the model choose. Broken clientRefs reject the whole batch; correctly ordered new-record chains remain supported.

Grounding clarifications never trigger cloud fallback. Cloud output goes through the same checks. Existing deterministic task rules remain on their established validation path. Supported exam-day evidence is a valid ISO date, today/tonight/tomorrow/day after tomorrow or a numeric interval up to 30 days. Other date expressions, conflicting days and multiple new exams ask for clarification; this is a bounded safeguard, not unrestricted semantic verification.

Full app verification and preview publication succeeded: run `37836775724`, verify `113515914441`, publish `113516510837`; separate hybrid run `37836775723`, job `113515695535`, also passed. Includes full TypeScript, every existing app verify script/Firebase rules, grounding/clarification regressions and strict native compatibility. Source `7680caa3726b1a865d59ac295768ea74f3d965b8` includes the final literal-ID comparison (punctuation and case cannot turn one ID into another). Initial safeguard run `37836412787` also passed; the final update supersedes that first version.

Published preview group `6452e5b5-2dc5-491e-bba5-f5003738b8a9`, Android update `01a11d22-679d-70f2-a989-b6e3b0d4e876`, runtime `0.2.13`, at `2026-10-08T20:09:16.445Z` (2026-10-09 01:39 IST). Receipt artifact `11575982497`, copy `docs/beta/grounding-update-20261009.json`. No new APK or production publication. Device QA remains pending. No evaluated requests were added to training; original data, scores and release thresholds remain unchanged. Qwen/cloud releases remain unavailable.

Next implementation chunk after verification/publication: authenticated cloud transport with server-side quotas and cancellation, then enable consent/mode controls only when a connection is available. Keep failed Qwen release gates visible; future model tuning needs a new frozen evaluation version.

## Authenticated cloud transport — 2026-10-09 IST

Added an isolated Firebase Functions codebase using existing Firebase Auth/Firestore. Server owns instructions and token budget; verified/revocation-checked sign-in, atomic user/global minute/day budgets, one-request lease, deduplication and shared provider cooldown precede inference. Client adapter requires explicit consent and the same current owner, authenticates with Firebase ID tokens and aborts/discards timed-out or cancelled responses. Cloud errors reach the existing hybrid unavailable message safely. Detailed setup/limits: `docs/MYELIN_CLOUD_SETUP.md`.

Final source `c298f44ec777cc7c437de1d0aa756db8b9616102` passed full app TypeScript, protocol parity, transport, hybrid/grounding/clarification and model lifecycle checks: hybrid run `37862323690`, job `113600718535`. Backend run `37862323680`, job `113600718584`, passed all 8 tests including real Firestore concurrent reservations, old/new lease protection and default-deny client read. Actual server entry loaded without deployment credentials; server install uses `npm ci` against the saved lock. Initial source `95413835c83b82579d628eb79a9dfddbb07dfb8a` also passed runs `37861950234` and `37861950201`; the final source adds locked dependencies and explicitly terminates expired HTTP replies. Evidence: `docs/cloud/transport-verification-20261009.json`.

No endpoint/key/model is configured for the app; no provider call, deployment, new model release or beta publication occurred in this chunk. Existing grounded preview remains shipped. Next: obtain the server deployment/provider setup, smoke-test a live model, then wire consent and mode controls and publish the compatible app update.

## Deployment and smoke preparation — 2026-10-09 IST

Added a manual assistant-only workflow using service-account Workload Identity Federation, reusable backend verification and source-specific public HTTP probes. Pushes validate the workflow only. Runtime now defaults to a dedicated assistant account rather than the broad default identity; it must be provisioned before deployment. Synthetic authenticated smoke goes through the real cloud adapter and strict preview checks, with no workspace apply. Transport-only receipts cannot mark the provider or app active. Release metadata headers contain only public protocol/source identifiers.

Source `8132dffbfac31724b89e9f378f2a45ea272c110a` verified: backend run `37863781488`, job `113605539297`, passed 9/9 backend tests, 4/4 deployment guards, synthetic smoke, exact protocol parity, full app types and actionlint. Real emulator tests now include signed-in read/write denial of server quotas. Hybrid run `37863781435`, job `113605539672`, passed existing assistant/model regressions. Workflow registration/push run `37863781627`, validation job `113605541198`, passed; actual deploy job `113605543465` and Google authentication were skipped. Evidence: `docs/cloud/deployment-tooling-verification-20261009.json`.

Usable account setup was unavailable: no deployment credentials or Gemini key in the workspace; the connector cannot read/manage repository secrets/variables. No live deployment/provider call, app activation, beta update, training or model release occurred. The subsequent zero-spending decision below supersedes the proposed Firebase/Gemini account setup.

## Zero-spending pivot — 2026-10-09 IST

The user cannot spend money. Firebase/Gemini activation is paused. Gemini API's current terms also exclude clients likely to be accessed by under-18s, independently of hosting or account ownership. Preferred replacement candidate: Workers Free + native Workers AI `@cf/qwen/qwen3-30b-a3b-fp8` + D1 Free quotas. Documented inference allowance is 10,000 account-wide neurons/day; exhausted Free allowance stops requests. Model quality, actual access, authentication implementation, Worker CPU fit and account eligibility are still unverified.

Research and boundaries are saved in `docs/MYELIN_FREE_CLOUD_PLAN.md`; older setup commands are clearly marked historical. The subsequent endpoint foundation is now implemented under `workers/assistant/` with an inactive default entry. Final source `8174722e8aac2182d2a4fa6d500f9fd7a3ca2962` passed GitHub run `37868173508` / job `113619803483`: full app TypeScript, canonical protocol parity, 11 HTTP/provider tests, four simulated Worker/client/Mini/grounding preview variants, existing client/deployment/smoke checks, actionlint and nine existing Firebase backend tests with the real Firestore emulator. Wrong fields/batch/request IDs reject and missing exam day makes no cloud call. Evidence: `docs/cloud/worker-foundation-verification-20261009.json`. These checks do not exercise Cloudflare/D1 or live Qwen. No account was created, no billing changed and no app update was published. Next chunk: supported revocation-aware Firebase authentication and atomic D1 quotas, then real Worker runtime verification and deployment. Keep app cloud disabled until live verification succeeds. The existing local assistant and 0.8B/2B offline release gates remain unchanged.
