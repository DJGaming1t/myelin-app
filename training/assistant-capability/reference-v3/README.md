# Original checkpoint versus phone conversion

Completed: [24 raw answers, template/tokenizer evidence and qualitative review](results/20261009/README.md). Both native paths and corrected original inference completed; no candidate is approved. The original metadata-serialization setup error generated no answers and is preserved separately.

Six new authored cases/eight turns are frozen before inference. Three conditions use one greedy answer per turn, a common concise study prompt, 128 output tokens and explicit actual prior replies. This is a small development probe, not an independent benchmark, trained model, app protocol gate or phone test.

1. Original post-trained `Qwen/Qwen3.5-2B` at revision `15852e8c16360a2fea060d615a32b45270f8a8fc`, official tokenizer/chat template with `enable_thinking=False`, Transformers 5.3.0 text-only `Qwen3_5ForCausalLM`, BF16 CPU/eager attention. Verify pinned snapshot file identities against HF metadata, missing-weight errors, and record complete hashes/load diagnostics. No LoRA or quantization added.
2. The same exact INT8 phone bundle already tested in v1/v2, LiteRT-LM SDK 0.18 CPU/two threads, bundled template and actual conversation API. A separate identical render-only conversation captures its incremental prompt without altering the generation conversation.
3. That phone bundle through a fresh raw native session, templating disabled, fed the official HF-rendered full prompt. Check exact HF/native token IDs for each official prompt. This avoids requiring the stock template to satisfy LiteRT's incremental-history prefix contract. No patched native code or hidden template fallback.

The publisher says its simplified template already opens non-thinking turns with an empty think block and keeps it in history for prefix compatibility. Inspect actual rendered text rather than assuming the block is absent. Native render-only output may omit already-prefilled system/history text, so do not compare that incremental fragment to an entire HF prompt as if missing text were lost.

Original BF16 versus converted INT8 also changes graph/precision/runtime; differences cannot individually prove quantization or a particular executor is responsible. The conversion publisher's exact original weight revision is not independently established. Later history differs when actual generated answers differ. First turns provide the cleanest identical-message comparison. All raw prompts, token IDs, outputs, native benchmarks, errors and provenance remain saved. Numeric/keyword matches require qualitative review; no repairs, retries or best-output selection. Both earlier candidate gates remain blocked.

Run on ordinary CPU Actions runners with hard bounds and always preserve partial evidence. No paid model service, larger paid runner, hosting deployment, model activation or OTA. Freeze a new evaluation before tuning after inspecting these outputs.

Primary sources inspected 2026-10-09: original model card/API and pinned template; `huggingface/transformers` v5.3.0 `modeling_qwen3_5.py` and auto mappings; `google-ai-edge/LiteRT-LM` v0.18.0 engine/session/conversation implementations; conversion publisher's model card. See `settings.json` and runtime provenance for resolved hashes.
