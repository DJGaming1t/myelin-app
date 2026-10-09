# Stronger already-converted planning candidate

This new frozen probe evaluates LM Studio's existing Qwen3.5-4B Q4_K_M file,2,707,513,696bytes, SHA25082a7dd3776cc3c741c6347d3bd04523f05796607b3fbc32fa3a25dfa1418c, revisionf9f88ac3e234be915e23811a6d28ea287bdb927e. The runner checks the pinned repository/LFS identity and actual downloaded file before loading. It is a research candidate, not a new MYELIN trained model or an enabled phone download.

The quantizer identifies the base as Qwen/Qwen3.5-4B and converter release b8185. Exact original weight revision lineage has not been independently proved. The official tokenizer is separately pinned at851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a and verified against Git/LFS metadata and every actual prompt. Architecture32layers/2560embedding must match. Runtime uses llama.rn0.12.9's backend commit6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632 on two Linux CPU threads.

Eight fresh cases/ten turns cover breaks, deadline versus school, interval intersection, feasible split planning, typo/missing details, elementary calculation mistakes, quoted instructions and latest corrections. Phone-v5's six now-observed cases/eight turns are separately reported regression. Both direct and bounded thinking profiles run once:36answers total, actual previous final replies in each case's history, no retries or repairs. Frozen rubrics are never sent to the model.

Sampling follows the model card's non-thinking reasoning and general thinking recommendations: temperature1,top_p0.95,top_k20,presence1.5,repeat1. Both profiles use those same requested values. Thinking budget1024 and total1536 leave more space than v5; direct cap256, context4096. The native chat parser owns reasoning separation; raw fields and requested payloads are all preserved. Longer budgets are an experiment, not evidence of better quality. Keyword patterns require semantic review of complete final answers and contradictory suggestions.

No model is approved or activated automatically. Passing CPU generation is only a prerequisite: useful fresh answers, a supported native APK, action/context/cancellation checks and actual Android RAM/speed tests still follow. This2.71GBoption has a substantial download cost and unknown phone memory needs; it will not replace Lite/Enhanced without a separate decision supported by measurements. Ordinary GitHub CPU runners only, no paid inference or deployment.

Primary sources checked2026-10-09:

- https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF
- https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF/blob/main/Qwen3.5-4B-Q4_K_M.gguf
- https://huggingface.co/Qwen/Qwen3.5-4B

Initial setup run37952612818/job113894988528/source7cd3d4cc38cf85b8c9ff07e9b6d7999b95107fb5 verified the actual file hash,32layers/426tensors/2560embedding and loaded the native server. It then failed before any completion request because Jinja2 was missing from the tokenizer environment. There are zero generated answers and no quality conclusion. All provenance/server props and failure metadata are retained in setup-failure-20261009. Recovery installs pinned Jinja2 and preflights the official templates before the build. Frozen questions, prompt, file, sampling and budgets are unchanged; this is a setup recovery, not a quality retry.

Freeze and identity checks: python scripts/test-assistant-stronger-phone.py. Template preflight: python scripts/run-assistant-stronger-phone.py --preflight after installing the declared helpers. Inference workflow: test-stronger-phone-planning.yml. Never report CI latency as phone latency or this small authored probe as all-planning competence.
