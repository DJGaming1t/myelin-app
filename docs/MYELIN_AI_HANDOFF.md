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
- Candidate now has 194 distinct training sources replayed into 255 rows (125 actions, 64 clarify, 66 escalate); validation has 29 unweighted cases. Three historical overlapping requests remain excluded.
- New verifier checks protocol labels, existing IDs, reference ordering, frozen hash, normalized request separation and gold-label scorer compatibility. Builder also checks the frozen hash and excludes both evaluation sets.
- Local TypeScript check, six training regressions and curriculum verification passed. Real tokenizer preflight passed: maximum 580 training tokens / 555 validation tokens, limit 768, no incomplete answers.
- Full GitHub preprocessing verification is pending for this commit; record its result before training.
- No candidate training or app deployment in this chunk. Previous adapter remains blocked.

## Exact next step
1. Check the expanded-curriculum preflight run and record its evidence. Do not repeat curriculum creation.
2. Train one bounded candidate from the clean base using balanced-v3 train/validation and audited completion masks. Do not resume historically contaminated v1/v2 adapters.
3. Evaluate on frozen eval-v2 plus historical eval-v1 regression and separate Hinglish acceptance; retain raw predictions and report all gates, including failures. Do not select checkpoints using eval-v2.
4. Compare measured model quality before claiming improvement. Evaluate phone latency and publish an OTA only after model and integrated app checks pass.

## Continuity instruction
Read this file and current branch head before changing code. Inspect current workflows and artifacts before restarting any training. Work one sensible chunk at a time; verify, summarize, state the next step, then stop. Never claim visible app changes unless an OTA or APK was actually published.


Scoring note: action exact-match now normalizes consistently renamed local clientRefs by declaration position and type. All action fields, existing IDs and reference links still must match; unresolved, duplicate and out-of-order references are not normalized into valid links. Regression checks cover valid renaming and broken links for topic and exam chains. Historical reports retain their original scoring version.
