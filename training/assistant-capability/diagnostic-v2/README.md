# Isolate actual native-model failures

This small new diagnostic follows the completed v1 failure. Four unseen authored cases/five turns were frozen before inference. It is a development experiment, not a benchmark accuracy estimate or app release gate. Do not train on either version or select outputs after inspecting results.

Both unchanged text bundles run on native SDK 0.15.0 and 0.18.0, ordinary Linux CPU/two threads, memory cache, 4096 context and 192 maximum output tokens. Each model/runtime runs every condition once, one seed, fresh cases and explicit actual followup history: 30 turns per job, 120 total.

- Greedy: temperature 0, top-k 1, top-p 1, seed 42; no repetition penalty.
- Sampled with presence: temperature 1, top-k 20, top-p 1, seed 42; native `RepetitionPenaltyConfig` presence 2, multiplication 1 (neutral), frequency 0, infinite window. Sampling and presence change together; their separate contributions are not isolated. No min-p filter is configured.
- Plain short tutor prompt, short JSON prompt using the same five-key reply envelope, and unchanged long v1 system instructions. Plain/short JSON differ in response format instructions; short/long JSON test instruction complexity with the same required envelope. No grammar constraint repairs JSON or forces answers. Semantic correctness still needs review.

The official CLI completion wrapper ignores presence penalty, but both SDK versions expose it in `Conversation.send_message`; `_create_optional_args` forwards it to the actual C setter. This harness inspects the installed SDK/source, verifies the binary symbol and exact dataclass values, then passes the public setting directly. It does not patch source or pretend an ignored HTTP field applied. SDK 0.15 returns a dictionary and 0.18 a Message; exact plain text/content-parts are normalized without changing generated text. Outputs/JSON fences/loops/wrong arithmetic remain failures.

Per-turn raw envelopes, outputs, errors, token/benchmark data and settings are preserved immediately in artifacts and log records. The workflow has a 30-minute hard runner bound and uploads partial evidence even on failure. No phone execution, app action, paid endpoint, cloud activation, new training, model-download enablement or OTA is part of this diagnostic. Test execution success does not approve a model.

Primary sources checked 2026-10-09:
- https://huggingface.co/Qwen/Qwen3.5-0.8B
- https://huggingface.co/Qwen/Qwen3.5-2B
- https://pypi.org/project/litert-lm-api/0.15.0/
- https://github.com/google-ai-edge/LiteRT-LM/blob/v0.15.0/python/litert_lm/conversation.py
- https://github.com/google-ai-edge/LiteRT-LM/blob/v0.18.0/python/litert_lm/conversation.py
