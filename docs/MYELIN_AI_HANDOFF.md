# MYELIN AI Handoff

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
- Local TypeScript and clarification/routing/protocol/hybrid/lifecycle regressions passed. Full app verification/publication pending; device QA pending. No native dependencies changed.

## Completed v4 training; evaluation setup failure — 2026-10-08
- Same run `37752290697`, original source `0c0b68713e835932402b591edd336476cf7165b8`: training job `113228197390` completed SUCCESS.
- Final adapter artifact `11548375885`, `myelin-mini-balanced-v4-adapter`, 43,961,081 compressed bytes; digest `sha256:0704a6c3e0a1ed1bbe099c7165cfb7bf48fb68183b7c369591a5dbadac3802ac`, created `2026-10-08T11:37:07Z`.
- Evaluation job `113291083789` failed at provenance checks: `verify-myelin-mini-curriculum.ts` could not open generated `training/myelin-mini/failure-curriculum-v1.jsonl` in its fresh checkout. Required generation ran in the separate training job but was not repeated in evaluation.
- Export/inference/scoring were skipped. No cases or accuracy were measured and the evidence directory was empty, so no evaluation artifact exists. This is a setup failure, not a measured quality-gate result. Qwen release remains blocked.

## Exact next step
1. Recover evaluation only against the existing final v4 adapter and pinned original source. Regenerate required curriculum/compiled inputs in a fresh job, preserve provenance and frozen hashes, then evaluate all 53 cases. Do not modify the training workflow trigger or start another training run for this repair.
2. Download final training/evaluation artifacts and record model metrics, raw predictions, latency and all three gates. A failed quality gate is evidence, not a setup failure to conceal.
3. Compare measured routing/action safety with previous results. Keep release blocked unless all gates pass. Frozen eval-v2 may be reported after this run, but must not be copied into training or used for checkpoint selection.
4. Evaluate phone latency before releasing Qwen weights. A rules-only assistant/preference beta may publish independently after compatible app checks pass; it must not claim working Qwen inference or cloud AI.

## Continuity instruction
Read this file and current branch head before changing code. Inspect current workflows and artifacts before restarting any training. Work one sensible chunk at a time; verify, summarize, state the next step, then stop. Never claim visible app changes unless an OTA or APK was actually published.


Scoring note: action exact-match now normalizes consistently renamed local clientRefs by declaration position and type. All action fields, existing IDs and reference links still must match; unresolved, duplicate and out-of-order references are not normalized into valid links. Regression checks cover valid renaming and broken links for topic and exam chains. Historical reports retain their original scoring version.

Counting clarification: the manifest field uniqueTrainingSources counts 194 source IDs, not distinct text. Two legacy prompt pairs repeat, leaving 192 normalized distinct training requests. They are training-only and do not overlap frozen eval-v2.
