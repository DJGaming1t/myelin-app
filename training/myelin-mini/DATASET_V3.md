# MYELIN Mini candidate data v3

Adds 71 authored synthetic training requests and 18 validation cases to the earlier curriculum. The compiled source has 197 training / 29 validation cases. Removing three historical benchmark overlaps leaves 194 distinct training sources; category replay produces 255 rows: 125 actions, 64 clarification, 66 escalation. Replay does not add independent examples.

The new examples cover topic creation and updates, exams, planning, tasks, multi-action references, missing details, ambiguous targets, stronger-model routing, month boundaries and leap day. Labels are checked against the app protocol and context IDs. Synthetic labels and narrow coverage remain limitations; no model-quality improvement has yet been measured.

## Frozen evaluation

`eval-v2.jsonl` has 32 cases: 16 actions, 8 clarification and 8 escalation. Its SHA-256 is `e8aa81783d5f392a3c4464d75401742d4ff28a78b569cffe1b97c695bca707e3`. The accompanying manifest records provenance and versioning policy. Requests have no normalized exact overlap with training or validation. Exact-match isolation does not guarantee semantic independence. Gold self-scoring verifies scorer compatibility, not model performance.

Do not edit the frozen set after evaluating a model, add its cases to training, or choose checkpoints using it. A changed benchmark needs a new version. Historical eval-v1 remains a regression suite because earlier training overlapped three requests.

## Reproduce

```sh
npm run build:myelin-mini-dataset
npx tsx scripts/verify-myelin-mini-curriculum.ts
python scripts/build-myelin-mini-balanced.py
python scripts/verify-myelin-mini-training.py
python scripts/train-myelin-mini-qwen.py --train training/myelin-mini/compiled/balanced-v3-train.jsonl --validation training/myelin-mini/compiled/balanced-v3-validation.jsonl --max-length 768 --preflight-only
```

Local tokenizer preflight passed with maximum lengths 580 training / 555 validation, below 768, preserving full answers. GitHub preflight additionally checks actual TRL preprocessing and completion masks. Train the next candidate from the clean base, not a previously evaluated adapter. No model was trained or released by this data change.
