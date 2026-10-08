# MYELIN hybrid AI implementation

Accepted direction: optional Lite Qwen3.5 0.8B, Enhanced Qwen3.5 2B, and cloud fallback. MYELIN calculates plans and previews changes for explicit confirmation. Provider limits still apply; local routing reduces requests but does not remove cloud quotas.

## Master checklist

- [x] Catalog both Qwen variants and keep unavailable mobile releases blocked.
- [x] Persist the preferred offline variant separately from model installation; retain older FunctionGemma preferences.
- [x] Connect Mini decision routing to the assistant screen, including rules without downloads, clarification and escalation messages.
- [x] Implement a common provider fallback contract with explicit cloud consent and cancellation protection.
- [ ] Configure an authenticated server-side cloud provider; enforce per-user quotas, timeouts and backoff. No provider key belongs in the APK.
- [ ] Add cloud consent and routing mode controls once the connection can perform the advertised operation.
- [ ] Finish and assess active 0.8B run 37752290697; keep it intact while it trains.
- [ ] Train and compare a separate 2B candidate using the same development splits and protocol. Future held-out versions are needed once current evaluation results are used for tuning.
- [ ] Convert each approved adapter/base combination into a supported phone artifact, verify file hashes and test Android speed, RAM, context capacity and structured output.
- [ ] Publish signed download descriptors; enable download/select/remove for released models through the existing one-session manager.
- [ ] Run integrated device tests and publish a compatible preview update.

## Completed first chunk

The model screen saves Lite/Enhanced preferences and labels both Qwen phone releases as pending. The preference does not install or load model weights. The licensed experimental FunctionGemma path remains separate and usable.

The assistant tries simple rules before loading Qwen. More involved requests use the preferred offline adapter when its verified artifact is available. Missing or invalid model responses produce an explicit unavailable/escalation message, and cannot bypass the preview confirmation layer. Clarification questions reach the user directly. The shared router accepts an optional cloud adapter, but the app provides none and cloud consent defaults off.

Tests cover preference restoration, failed preference saves, absent phone artifacts, both Qwen decision envelopes, rules without model loading, malformed outputs and invented IDs, cloud consent, clarification, cancellation, and preview-only changes. Full app verification is performed by `verify-hybrid-ai.yml`.

## Release limitations

No Qwen download URL or phone artifact has been configured. A LoRA training adapter is not a `.litertlm` mobile bundle. Current FunctionGemma runtime settings use a 1024-token context and cap outputs at 1024; approved Qwen bundles must be tested with their own context/output settings before download is enabled. The bridge requests 1200 tokens, matching the Mini contract, but that request alone does not change native limits.

No cloud endpoint is deployed by this chunk, and no app build/update is published. Download-size and RAM figures discussed earlier were estimates, not measurements.

Next implementation chunk: authenticated cloud transport with quota/unavailability handling, then consent/mode controls. Continue checking the same active training run independently; do not relaunch it because app code changed.
