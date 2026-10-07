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
- A v1 evaluation workflow also completed (`37617238057`); a successful workflow alone does not establish that its model release gate passed.

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

## Exact next step
1. Inspect the newest "Evaluate MYELIN Mini v2 release gate" run on this branch.
2. Read its `myelin-mini-v2-release-evaluation` artifact and job summary; do not infer readiness from the old training success.
3. Record the full results here.
4. If the gate fails, diagnose errors and improve training using new examples, keeping the held-out set out of training.
5. If it passes, evaluate deployment/runtime integration and device latency before enabling the trained model in the app.
6. Publish an OTA only after integrated app checks pass.

## Continuity instruction
Read this file and current branch head before changing code. Inspect current workflows and artifacts before restarting any training. Work one sensible chunk at a time; verify, summarize, state the next step, then stop. Never claim visible app changes unless an OTA or APK was actually published.

