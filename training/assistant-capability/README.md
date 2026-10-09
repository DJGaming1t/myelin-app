# Actual model capability comparison

The user's priority is stronger understanding and conversation inside MYELIN. The shipping beta uses bounded rules; its trained 0.8B LoRA failed task-release gates. Do not confuse fast replies, more canned rules, passing parser tests or cloud infrastructure with model quality.

This experiment compares actual post-trained Qwen3.5 0.8B and 2B text-only INT8 `.litertlm` bundles from `litert-community`, not the failed MYELIN adapter. No new training or checkpoint selection. Both exact revisions/file hashes are frozen in `candidates.json`. They are Apache-2.0 models; runtime/conversion and target-phone behavior still need independent verification. The published text bundles use non-thinking templates: no pretend delay or unsupported thinking toggle is added.

The 24 authored synthetic cases contain 29 turns: shorthand/Hinglish, missing details, corrections, followups, calendar/time/arithmetic, tutoring and non-command/no-tool guards. `manifest.json` freezes cases, instructions and candidates before inference. Cases are isolated fresh chats; subsequent turns include the actual earlier generated answer. Expectations/rubrics are never sent to the model. These are development probes, not independent human validation. Do not train on them; later tuning requires another unseen evaluation version.

The short JSON envelope is an isolated capability probe that supports replies and proposals. It is **not** the current production Mini contract, planner authority or a release artifact. This avoids forcing every explanation into the production Mini's `escalate` route. No model output changes a workspace or invokes tools. A passing probe does not certify compatibility with Mini actions, grounding, confirmations or the app's 1024-token native configuration. Those gates follow candidate selection.

The scorer rejects malformed/truncated/extra-field JSON and checks exact declared intent/slots and bounded answers. Simple reasoning answer patterns are checks, not semantic judges: e.g. mentioning a number does not prove the reasoning. Explanation accuracy, preserved title meaning, helpfulness, contradictory wording and false success claims require an explicit review of raw outputs. Reports never automatically approve release or certify semantic quality.

Workflow `evaluate-assistant-capability.yml` runs pinned `litert-lm==0.18.0` on ordinary Linux CPU runners, two threads, memory cache, 4096-token context, at most 384 output tokens, greedy sampling. It downloads and hashes only the text bundles, imports locally, and binds the local test server to loopback. No paid model endpoint, deployment, GPU purchase or Android update. Native package 0.7.0 source dependencies are recorded separately; this does not prove installed APK/native parity. First-call latency includes cold model setup and must not be reported as phone speed. Raw outputs, error/finish status, measured timings and package/model/input provenance are retained even on failure.

Official sources checked 2026-10-09:
- https://huggingface.co/litert-community/Qwen3.5-0.8B
- https://huggingface.co/litert-community/Qwen3.5-2B
- https://huggingface.co/litert-community/Qwen3.5-0.8B/blob/main/litertlm_manifest.json
- https://huggingface.co/litert-community/Qwen3.5-2B/blob/main/litertlm_manifest.json
- https://developers.google.com/edge/litert-lm/cli/configuration
- https://developers.google.com/edge/litert-lm/cli/openai_server
- https://developers.google.com/edge/litert-lm/cli/model_management
