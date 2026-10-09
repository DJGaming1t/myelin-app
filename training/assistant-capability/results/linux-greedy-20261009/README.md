# Actual phone-bundle comparison — 2026-10-09

Both pinned text bundles loaded and generated all 29 turns with zero transport failures. Neither is suitable for MYELIN in this tested configuration. The larger model gives some better raw answers, but does not provide a dependable assistant. No downloads, chat integration or Android update were enabled.

| Exact candidate | Valid probe envelope | All objective checks | Linux CPU median response |
| --- | --- | --- | --- |
| Qwen3.5 0.8B INT8 | 0/29 | 0/29 | 8.04 s |
| Qwen3.5 2B INT8 | 5/29 | 1/29 | 18.99 s |

These are results for the converted bundles, simplified non-thinking template, CLI 0.18.0, 4096-token context, greedy decoding and this synthetic JSON task. They are **not** estimates of the original base checkpoints' general accuracy or Android speed. Model size alone did not solve the observed failures. The app currently uses a 1024-token context and SDK 0.15.0; its single action prompt/reset behavior differs from this multi-turn CLI test. A dependency source audit is not installed-APK or phone execution proof.

## What the answers show

Codex inspected every raw response; the unblinded qualitative review is in `manual-review.json`. No independent human score is claimed.

- Lite often echoes the question or enters repetitions. It invents dates, loses task details, incorrectly explains negative multiplication as addition of absolute values, and claims an unavailable notification is set. That malformed output was rejected; no action ran.
- Enhanced correctly answers the 95-minute budget, solves the algebra in prose and recalls osmosis. Most responses still violate the envelope. It invents today's deadline for Sunday, miscalculates a 45-minute interval as 60, gives both 35 and 60 for a correction, and offers an incoherent negative-multiplication analogy. Subject explanations sometimes begin correctly then loop or retain jargon after a simplification request.
- Format enforcement alone would not repair these semantic failures. Numeric-pattern checks can also miss contradictions; the original strict scorer was retained, with separate review rather than retrospective score changes.

## Verification and provenance

- Frozen input source: `192f4cf00aa39c4e58998cf09a3e1c153a38a880`; inference source: `addbe5616ea12ba1790c91fe24205f44046bce3c`.
- [Completed run 37920623351](https://github.com/DJGaming1t/myelin-app/actions/runs/37920623351), Enhanced job `113787395761`, Lite job `113787396001`: both SUCCESS. This means evaluation completed and evidence was preserved, **not** a model-quality pass. `releaseApproved` remains false.
- Exact revisions, byte lengths, SHA-256 values, runtime settings and frozen input hashes are in each candidate's `provenance.json`. The archived artifacts additionally contain package versions and native runtime logs; IDs/digests are in `verification.json`.
- All 58 raw outputs reproduce the committed reports with the unchanged scorer. Scorer tests and Python compilation passed. No JSON repair, answer retry, expected-answer input, adapter training or planner mutation was used.
- Two earlier setup attempts generated no answers. The alias-resolution 404 was bypassed with the verified absolute snapshot file; resolving its symlink to a hash-only filename then caused native format rejection. Keeping the `.litertlm` snapshot extension fixed loading. `max_completion_tokens` now supplies the actual server output bound; `max_tokens` was ignored by this CLI. Failures and their artifacts remain recorded separately and are not quality scores.
- The CLI completion wrapper reports `stop` even when its output bound is reached. A `stop` label alone does not establish complete output; malformed JSON still rejects, and raw usage is retained.

## Exact next model step

Freeze a small **new unseen** diagnostic set before inference and isolate the failure causes: short plain-chat versus structured prompts, supported sampled generation versus greedy decoding, and native runtime 0.15 versus 0.18 using the same exact bundles. Do not change or train on observed v1 requests to claim a new held-out success. Keep runtime variants and settings explicit, with no best-of-output selection.

The [Qwen 0.8B model card](https://huggingface.co/Qwen/Qwen3.5-0.8B) currently recommends temperature 1.0, top-p 1.0, top-k 20 and presence penalty 2.0 for non-thinking text. The inspected [CLI 0.18 sampler parser](https://github.com/google-ai-edge/LiteRT-LM/blob/v0.18.0/python/litert_lm_cli/commands/serve/openai_chat_completions.py) exposes temperature/top-p/top-k/seed, **not presence penalty**. Do not pass an ignored field and describe it as applied. Sampling is a hypothesis to test, not an established fix; conversion, prompt sensitivity and runtime regressions remain possible.

After a candidate produces useful answers, add a bounded conversation/reply bridge and validate its real app context, native settings, cancellation and confirmed action proposals. The current Mini action-only bridge cannot deliver tutoring simply by selecting a larger file. Measure Android memory/speed and compatibility before activating a download descriptor. Cloudflare work is secondary to model quality; zero spending remains required.
