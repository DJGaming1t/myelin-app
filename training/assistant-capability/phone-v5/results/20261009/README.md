# Completed 2B phone-backend profile probe

Run [37946626546](https://github.com/DJGaming1t/myelin-app/actions/runs/37946626546), job113874446070, source4c9d86bdc3721ec81a4c6c7d8d3e1291dfd5b2fa: SUCCESS, all44responses retained. Exact Q4_K_M file from the v4 conversion,1,274,396,736bytes, SHA9fc94ee9249df1a818677d2147d58912f2d797a494f592255c7568a15d226e04. Backend6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632 is the pinned source used by llama.rn0.12.9. Linux CPU testing does not verify Android JNI, phone RAM or phone speed.

| Profile / set | Pattern | Content | Usable final | Strict | Caps | Median CPU seconds |
| --- | --- | --- | --- | --- | --- | --- |
| Direct / fresh | 7/8 | 4/8 | 8/8 | 4/8 | 0 | 8.43 |
| Direct / observed v4 | 10/14 | 7/14 | 14/14 | 6/14 | 0 | 8.60 |
| Bounded reasoning / fresh | 7/8 | 4/8 | 4/8 | 1/8 | 4 | 48.23 |
| Bounded reasoning / observed v4 | 12/14 | 9/14 | 7/14 | 3/14 | 6 | 40.75 |

Content marks correct core facts, including facts appearing inside unfinished drafts; contradictory arithmetic/feasibility and invented constraints fail. Usable final requires a completed user-facing response with no unfinished internal drafting. Strict additionally checks content,100word bound, specific instructions and no implied app mutation. All44individual notes and definitions are in review.json. This is one manual review of authored development cases, not an independent benchmark.

Direct replies miscalculate overlaps, schedule outside free windows, contradict deadlines and say an overfull plan fits. The native reasoning budget separates a reasoning field, but10of22reasoning responses exhaust the total token cap and frequently continue drafting inside the final content. One additional uncapped final contains word-count/self-revision text. The final correction turn forgets Chemistry55 despite actual history. No post-processing, extraction of a better draft, output retry or answer selection was applied. Retain these failures when changing future prompts/budgets; v5 is now observed regression data.

All44HF/GGUF template and token traces match exactly; no runtime errors or empty final fields. These facts do not certify useful answers. The report records requested sampler controls; the chat endpoint does not echo their decoded effective values. Raw reasoning stays in the evidence, never as shipping UI copy. Model quality did not justify activation, and neither profile is release-approved.

Evidence artifact [11625757345](https://github.com/DJGaming1t/myelin-app/actions/runs/37946626546/artifacts/11625757345), expires2027-01-07; digest6805031b7b438bd87f5da491e54eb6988edc40bca37f3427c03753276c070d96 is publisher metadata, not a locally verified archive. AllJSONrecords here were recovered from complete structured log lines without modification. Replay with python scripts/verify-assistant-phone-results.py.
