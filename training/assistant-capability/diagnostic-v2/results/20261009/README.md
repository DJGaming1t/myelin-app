# Native diagnostic results — 2026-10-09

Neither phone conversion is ready for MYELIN chat. Simpler prompts allow some correct answers, but arithmetic, explanations, brevity, repetition and structured replies still fail. Changing the tested generation profile did not establish an improvement.

Corrected inference source `5321c63703155b05f0d1bcb9c7de735d431165d9`, [run 37924411783](https://github.com/DJGaming1t/myelin-app/actions/runs/37924411783). Four jobs recorded all 120 declared turns: 90 generated answers and 30 native errors. Both 0.18 jobs completed SUCCESS (execution only); both 0.15 jobs completed FAILURE because every sampled-with-presence request failed. All raw records, original automatic reports, installed SDK/native binary hashes, provenance and qualitative review are retained here. No training, output selection, retry for quality, JSON repair or app mutation.

Four new authored cases/five turns, one seed, two unchanged pinned INT8 bundles, CPU/two threads, 4096 context, 192 output tokens; not an independent benchmark or phone timing. Each row below uses the same five plain-prompt turns. Strict review applies the frozen content rubrics, requested response constraints and prompt length bound; automatic patterns remain unchanged.

| Model | SDK | Profile | Automatic plain checks | Qualitative acceptance | Native errors |
| --- | --- | --- | --- | --- | --- |
| Lite 0.8B | 0.15 | Greedy | 3/5 | 1/5 | 0 |
| Enhanced 2B | 0.15 | Greedy | 4/5 | 2/5 | 0 |
| Lite 0.8B | 0.18 | Greedy | 3/5 | 2/5 | 0 |
| Enhanced 2B | 0.18 | Greedy | 4/5 | 1/5 | 0 |
| Lite 0.8B | 0.15 | Sampled + presence | Not generated | Not generated | 5/5 |
| Enhanced 2B | 0.15 | Sampled + presence | Not generated | Not generated | 5/5 |
| Lite 0.8B | 0.18 | Sampled + presence | 1/5 | 0/5 | 0 |
| Enhanced 2B | 0.18 | Sampled + presence | 1/5 | 0/5 | 0 |

The two JSON prompt styles together produced **0 valid envelopes out of 60 generated answers**; another 20 requests had native errors. A format-only fix cannot make the content accurate. Plain/JSON have different response contracts; the table does not estimate general accuracy or prove prompt length is the sole cause.

Concrete findings:

- SDK 0.15's CPU penalty processor fails with `INVALID_ARGUMENT: Logits dimensions must be [batch_size, 1, vocab_size]`, traced through `repetition_penalty_processor.cc:147`. The API exposes and forwards the setting; actual execution fails for these converted bundles. These 30 failures are runtime evidence, not zero-quality generated answers. SDK 0.18 generates with the same profile, but still makes errors. This is not Android/GPU proof.
- Plain prompts elicit `56` and sometimes a correct `55 / 5 * 8 = 88`. Enhanced 0.18 repeats the correct notebook calculation to the token cap, so its numeric check passes while qualitative review fails. Lite 0.18 claims photosynthesis requires oxygen: another automatic keyword false positive. Several transpiration definitions reverse water movement or include roots as the evaporation site. Topic recall often works, but extra prose violates a request for just the topic name.
- Sampled-with-presence combines temperature/top-k changes and native presence 2; their independent effects were not isolated. It worsens automatic plain checks in this single-seed probe and does not reliably prevent repeated digits, corrupted words or loops. No min-p filter was configured; this is not a claim that every recommended decoding configuration fails.
- Short JSON sometimes returns `28` for 8 times 7; long JSON can trigger irrelevant task proposals, copy the system prompt or ask for a deadline when an explanation was requested. Simpler prompts are worth using for chat, but they are not sufficient evidence to enable either model.

`qualitative-review.json` contains a note for every corrected turn. It is Codex review, not independent human validation. Original scores were not overwritten. `verify-assistant-diagnostic-results.py` replays every score from the exact native envelopes, verifies declared conditions/settings, output token bounds, metadata and complete review coverage, and reproduces all four reports.

The earlier setup run [37924027041](https://github.com/DJGaming1t/myelin-app/actions/runs/37924027041), source `bd18222852a27d895b7836c466176192687b548d`, used an invalid `:memory:` sentinel. Both 0.18 jobs failed before generation. Version 0.15 accepted it; all 60 records (30 answers, 30 native errors) are preserved separately in `setup-attempt/`. The corrected run used `:memory`; questions, prompts, sampling, bundles and output bounds were unchanged. No best-answer selection between attempts. Neither run has a quality-approved candidate.

Evidence was retrieved from completed job logs. Some metadata JSON blocks were interleaved with Python traceback lines; the original mixed extract is retained beside the metadata parsed after separating those non-JSON log lines. Generated `PREDICTION` records required no repair. Published artifact IDs/archive digests in `verification.json` identify original archives with package freeze; archive downloads were not independently verified locally. All seven existing scorer/adapter test groups pass. Linux latency is recorded per condition, separate from model load, and cannot establish phone performance or a version speedup across different runner hosts.

Next: compare the original Qwen3.5-2B checkpoint using its official tokenizer/chat template with the converted bundle, with exact revisions and a new frozen probe. Inspect rendered native prompts as part of that comparison. Establish whether conversion/template/runtime accounts for the degradation before selecting an offline candidate. Then implement bounded chat context and confirmed app proposals, followed by real Android memory/speed/quality tests. No paid endpoint, cloud activation, model download enablement, native APK change or OTA was made here. The latest beta remains weekly-schedule update `01a11ffe-5531-77e9-846a-72ffc82828ec`, runtime `0.2.13`.
