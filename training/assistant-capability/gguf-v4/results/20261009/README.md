# Official Qwen2B to GGUF: conversion complete, planning quality insufficient

Source `44d85491e84e5ee51b1e3a4e631c62573bf10aaf`, ordinary CPU run [37933683037](https://github.com/DJGaming1t/myelin-app/actions/runs/37933683037). All42answers completed without runtime errors or output caps. Twelve new authored development cases/fourteen actual turns were frozen before generation; no training, adapter, output repair, repeated quality attempt or independent benchmark claim.

| Condition | Pattern passes | Content review | Strict review | Median CPU latency |
| --- | --- | --- | --- | --- |
| Original official BF16 |9/14|8/14|7/14|165.33s|
| Converted Q8_0 |12/14|9/14|8/14|18.64s|
| Converted Q4_K_M |10/14|7/14|6/14|14.41s|

Patterns produce false positives: Q8describes finishing8hours late as a safe buffer; Q4reports20minutes short but recommends only a10-minute cut. Both fail the break arithmetic. Original also fails basic time/break arithmetic and contradicts the Saturday school exception. Allremember the three-turn subject/time correction. Allgive the correct negative-product sign, but ignore its one-sentence instruction. Digit-only checks miss omissions and contradictions. The duration clarifications can be useful without restating the ISO date; those pattern failures are noted, not silently changed. Every answer has a saved review note.

Both actual model files were created from `Qwen/Qwen3.5-2B@15852e8c16360a2fea060d615a32b45270f8a8fc`, source safetensors SHA`aa33250c4fc64891ddfaba3a314fd9542ea371843c387178b425fbcc5ed680b1`. Unmodified llama.cpp`609290be6b15db02f9d73443435403cbff6e7802` converted text-only BF16 with `--no-mtp`; `llama-quantize` generated both candidates from that BF16 intermediate, without requantizing one low-bit model into another. Each has320tensors, architecture`qwen35`,24layers,2048embedding size and the official chat template. Source/binary hashes, commands and snapshot identities are saved.

| Already converted file | Bytes | SHA-256 |
| --- | --- | --- |
| MYELIN-Qwen3.5-2B-Q8_0.gguf |2012012608|254334f05da24bce796c11e8d97c8bb8e0261b5f321f85449d5abb8829fb03b3|
| MYELIN-Qwen3.5-2B-Q4_K_M.gguf |1274396736|9fc94ee9249df1a818677d2147d58912f2d797a494f592255c7568a15d226e04|

[Converted files artifact11618830746](https://github.com/DJGaming1t/myelin-app/actions/runs/37933683037/artifacts/11618830746), expiresJanuary7,2027. This is a saved research candidate, not an approved app download URL. The generated file hashes were verified by the runner; archive digests are GitHub publisher metadata, not independently checked local ZIPs.

Both GGUF paths match official HF token IDs exactly on all28prompts. Actual returned decoder settings confirm greedy temperature0, no grammar, no penalties, one answer and192output-token cap. CPU, precision and numerical implementation differ from BF16; quality differences cannot be attributed solely to quantization. Linux latency is not phone performance or working RAM.

`verify-assistant-gguf-results.py` reproduces all42saved scores/reports, frozen input identities, actual condition-specific follow-up history, decoder controls, output bounds, converted identities and review counts. Neither candidate is approved for planner decisions or general tutoring. A subsequent isolated phone-v5probe tests a shorter prompt, sampled decoding and bounded real reasoning at the backend pinned by llama.rn0.12.9; v4is observed regression only there.

Separately, the deterministic recorded-plan review passed full app checks and shipped to Android preview runtime0.2.13. It checks actual schedules, missing estimates, deadlines, sleep and workload with breaks; it does not activate these weights or pretend generated arithmetic is trusted.
